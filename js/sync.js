/* OGKasir - Sync multi-platform (Supabase sync_documents).
   Prinsip: offline-first. Lokal selalu sumber kerja; sync oportunistik.
   - Dokumen per koleksi: menus, cats, employees, feedback, settings_public,
     txs, stock_log & orders di-shard per bulan (doc_key 'YYYY-MM').
   - PIN karyawan TIDAK pernah masuk dokumen sync (S3); foto menu & logo
     dinormalkan K.safeImg saat applyDoc (X1/X2).
   - Push memakai optimistic concurrency (version di server).
   - Transaksi append-only -> pull menggabungkan union by id (yg lebih baru menang).
   - SYNC DUA ARAH OTOMATIS (permintaan zgg, 4 Nov 2026): data master
     (menus, cats, employees, feedback) kini digabung PER ITEM — union by
     id, per item menang updatedAt terbesar (fallback at/createdAt, seri
     -> cloud). Penghapusan menyebar lewat tombstone _del {id: ts} yang
     ikut di ekor payload dokumen (elemen sentinel tanpa id) dan disimpan
     lokal di meta.dels. settings_public whole-doc last-write-wins pakai
     updatedAt dokumen. TIDAK ada lagi konflik manual untuk dokumen-
     dokumen ini: konflik lama yang tertahan di meta.conflicts digabung
     otomatis pada init/pull pertama. resolveUseCloud/resolveUseLocal
     dipertahankan untuk kompatibilitas.
   - updatedAt item distempel terpusat di wrapper KDB.save (differ
     terhadap bayangan/shadow di memori): jalur edit mana pun (form menu,
     stok, kasir, order, karyawan) otomatis tercap tanpa menambal tiap
     titik. Record warisan tanpa updatedAt = stempel 0 (paling tua).
   Meta sync disimpan terpisah dari KDB (kasirku_sync_v1) — tidak ikut backup/sync. */
var Sync = {
  MKEY: 'kasirku_sync_v1',
  SETTINGS_KEYS: ['shop', 'addr', 'foot', 'logo', 'theme', 'accent', 'menuView',
    'lang', 'userName', 'userEmoji', 'notePresets', 'phone', 'shopType', 'bizMode', 'bizSub'],
  MASTER: { menus: 1, cats: 1, employees: 1, feedback: 1 },
  DEL_KEEP_MS: 90 * 864e5,
  meta: null,      // {versions:{}, hashes:{}, conflicts:[], lastSyncTs:0, lastError:'', dels:{}, catAdd:{}, settingsTs:0}
  _timer: null,
  _pullTimer: null,
  _running: false,
  _suspend: false, // true saat menerapkan hasil pull (cegah loop save->sync)
  _shadow: null,   // bayangan koleksi master utk differ updatedAt (memori saja)

  init: function () {
    this.loadMeta();
    var orig = KDB.save.bind(KDB);
    var self = this;
    KDB.save = function () {
      if (!self._suspend) self._stampChanges();
      orig();
      if (self._suspend) self._takeShadow();
      else self.onSave();
    };
    this._takeShadow();
    /* Konflik manual warisan versi lama: selesaikan otomatis lewat merge
       (snapshot server di meta.conflicts jadi bahan gabung, bukan pilihan). */
    try { this._resolveStoredConflicts(); } catch (e) {}
    this._startAutoPull();
    /* Pull saat aplikasi dibuka dengan sesi yang sudah ada (restore sesi
       bersifat silent — tidak selalu lewat onSignedIn). */
    if (typeof Account !== 'undefined' && Account.signedIn && Account.signedIn()) {
      setTimeout(function () { self.syncNow(false); }, 800);
    }
  },

  loadMeta: function () {
    try {
      var raw = localStorage.getItem(this.MKEY);
      if (raw) this.meta = JSON.parse(raw);
    } catch (e) {}
    if (!this.meta || typeof this.meta !== 'object') this.meta = {};
    if (!this.meta.versions) this.meta.versions = {};
    if (!this.meta.hashes) this.meta.hashes = {};
    if (!this.meta.conflicts) this.meta.conflicts = [];
    if (!this.meta.dels || typeof this.meta.dels !== 'object') this.meta.dels = {};
    var types = ['menus', 'cats', 'employees', 'feedback'];
    for (var i = 0; i < types.length; i++) {
      if (!this.meta.dels[types[i]] || typeof this.meta.dels[types[i]] !== 'object') this.meta.dels[types[i]] = {};
    }
    if (!this.meta.catAdd || typeof this.meta.catAdd !== 'object') this.meta.catAdd = {};
    if (typeof this.meta.settingsTs !== 'number') this.meta.settingsTs = this.meta.lastSyncTs || 0;
  },
  saveMeta: function () {
    try { localStorage.setItem(this.MKEY, JSON.stringify(this.meta)); } catch (e) {}
  },

  onSave: function () {
    if (this._suspend) return;
    if (typeof Account === 'undefined' || !Account.signedIn()) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    var self = this;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(function () { self.syncNow(false); }, 4000);
  },

  onSignedIn: function () { this.syncNow(false); },

  /* ---------- pemicu pull otomatis ----------
     Selain debounce push saat simpan: tarik perubahan perangkat lain
     saat aplikasi kembali terlihat (resume) dan berkala tiap 60 dtk
     selama aplikasi terbuka & terlihat. syncNow sendiri menjaga
     login/online/_running; hash mencegah push sia-sia sesudah pull. */
  _startAutoPull: function () {
    var self = this;
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) self.syncNow(false);
      });
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', function () { self.syncNow(false); });
    }
    if (this._pullTimer) clearInterval(this._pullTimer);
    this._pullTimer = setInterval(function () {
      if (typeof document === 'undefined' || !document.hidden) self.syncNow(false);
    }, 60000);
  },

  /* ---------- differ updatedAt & tombstone (terpusat) ----------
     Setiap KDB.save (di luar penerapan sync) dibandingkan dengan
     bayangan terakhir:
     - item berubah/baru -> updatedAt = sekarang (agar menang merge).
     - item hilang -> tombstone meta.dels[type][id] = sekarang, supaya
       penghapusan menyebar dan tidak bangkit dari perangkat lain.
     - kategori (string): hilang -> tombstone; muncul lagi sesudah
       tombstone dikenal -> tombstone dicabut (tambah ulang yang sah).
     - settings_public berubah -> meta.settingsTs = sekarang (LWW). */
  _stripJson: function (it) {
    var c = {};
    for (var k in it) if (k !== 'updatedAt') c[k] = it[k];
    return JSON.stringify(c);
  },
  _settingsSubset: function () {
    var D = KDB.data, sp = {}, i, k;
    if (!D || !D.settings) return sp;
    for (i = 0; i < this.SETTINGS_KEYS.length; i++) {
      k = this.SETTINGS_KEYS[i];
      if (typeof D.settings[k] !== 'undefined') sp[k] = D.settings[k];
    }
    return sp;
  },
  _takeShadow: function () {
    var D = KDB.data;
    if (!D) { this._shadow = null; return; }
    var sh = { menus: {}, employees: {}, feedback: {}, cats: {}, settings: '' };
    (D.menus || []).forEach(function (m) { if (m && m.id) sh.menus[m.id] = Sync._stripJson(m); });
    (D.employees || []).forEach(function (e) { if (e && e.id) sh.employees[e.id] = Sync._stripJson(e); });
    (D.feedback || []).forEach(function (f) { if (f && f.id) sh.feedback[f.id] = Sync._stripJson(f); });
    (D.cats || []).forEach(function (c) { sh.cats[c] = 1; });
    sh.settings = JSON.stringify(this._settingsSubset());
    this._shadow = sh;
  },
  _stampChanges: function () {
    var D = KDB.data;
    if (!D) return;
    if (!this._shadow) { this._takeShadow(); return; }
    var sh = this._shadow, now = Date.now(), metaChanged = false, self = this;
    var types = ['menus', 'employees', 'feedback'];
    for (var ti = 0; ti < types.length; ti++) {
      (function (type) {
        var items = D[type] || [], smap = sh[type], seen = {}, i, it, s;
        for (i = 0; i < items.length; i++) {
          it = items[i];
          if (!it || !it.id) continue;
          seen[it.id] = 1;
          s = self._stripJson(it);
          if (smap[it.id] !== s) { it.updatedAt = now; smap[it.id] = s; }
        }
        for (var id in smap) {
          if (!seen[id]) {
            if ((self.meta.dels[type][id] || 0) < now) { self.meta.dels[type][id] = now; metaChanged = true; }
            delete smap[id];
          }
        }
      })(types[ti]);
    }
    /* kategori: array string */
    var cur = {}, i2, n;
    for (i2 = 0; i2 < (D.cats || []).length; i2++) {
      n = D.cats[i2]; cur[n] = 1;
      if (!sh.cats[n]) {
        sh.cats[n] = 1;
        if (this.meta.dels.cats[n]) { // muncul lagi sesudah dihapus -> cabut tombstone
          delete this.meta.dels.cats[n];
          this.meta.catAdd[n] = now;
          metaChanged = true;
        }
      }
    }
    for (n in sh.cats) {
      if (!cur[n]) {
        if ((this.meta.dels.cats[n] || 0) < now) { this.meta.dels.cats[n] = now; metaChanged = true; }
        delete this.meta.catAdd[n];
        delete sh.cats[n];
      }
    }
    var sJson = JSON.stringify(this._settingsSubset());
    if (sJson !== sh.settings) { this.meta.settingsTs = now; sh.settings = sJson; metaChanged = true; }
    if (metaChanged) this.saveMeta();
  },

  /* ---------- koleksi lokal -> dokumen ---------- */
  monthKey: function (ts) {
    var d = new Date(ts);
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1);
  },

  /* Payload dokumen master = array item + (bila ada) satu elemen
     sentinel {_del:{id:ts}} di ekor. Bentuk lama (array murni) tetap
     terbaca: parseMasterData menormalkan keduanya. */
  parseMasterData: function (data) {
    var items = [], dels = {}, i, el;
    if (Array.isArray(data)) {
      for (i = 0; i < data.length; i++) {
        el = data[i];
        if (el && typeof el === 'object' && el._del && typeof el._del === 'object' && !el.id) dels = el._del;
        else items.push(el);
      }
    } else if (data && typeof data === 'object') {
      items = Array.isArray(data.items) ? data.items : [];
      dels = (data._del && typeof data._del === 'object') ? data._del : {};
    }
    return { items: items, dels: dels };
  },
  _pruneDels: function (dels) {
    var out = {}, cutoff = Date.now() - this.DEL_KEEP_MS, id;
    for (id in (dels || {})) if ((+dels[id] || 0) >= cutoff) out[id] = +dels[id];
    return out;
  },
  buildMasterData: function (type, items) {
    if (!this.meta) this.loadMeta(); // jalur langsung tanpa init (uji/darurat)
    var arr = (items || []).slice();
    var d = this._pruneDels(this.meta.dels[type]);
    if (Object.keys(d).length) arr.push({ _del: d });
    return arr;
  },

  collectDocs: function () {
    var D = KDB.data, docs = {}, i, t, k;
    docs['menus|'] = { type: 'menus', key: '', data: this.buildMasterData('menus', D.menus) };
    docs['cats|'] = { type: 'cats', key: '', data: this.buildMasterData('cats', D.cats) };
    /* S3: PIN karyawan TIDAK ikut sync — yang dikirim salinan tanpa PIN;
       PIN lokal dipasang lagi saat applyDoc. */
    var empItems = (D.employees || []).map(function (e) {
      var c = {}; for (var ek in e) c[ek] = e[ek]; c.pin = ''; return c;
    });
    docs['employees|'] = { type: 'employees', key: '', data: this.buildMasterData('employees', empItems) };
    docs['feedback|'] = { type: 'feedback', key: '', data: this.buildMasterData('feedback', D.feedback || []) };
    docs['settings_public|'] = { type: 'settings_public', key: '', data: this._settingsSubset() };
    var txShards = {}, logShards = {};
    for (i = 0; i < D.txs.length; i++) {
      t = D.txs[i];
      k = 'txs|' + this.monthKey(t.at);
      (txShards[k] = txShards[k] || []).push(t);
    }
    for (i = 0; i < (D.stockLog || []).length; i++) {
      t = D.stockLog[i];
      k = 'stock_log|' + this.monthKey(t.at);
      (logShards[k] = logShards[k] || []).push(t);
    }
    for (k in txShards) docs[k] = { type: 'txs', key: k.slice(4), data: txShards[k] };
    for (k in logShards) docs[k] = { type: 'stock_log', key: k.slice(10), data: logShards[k] };
    /* A-05 (audit 30 Okt 2026): Order Jasa ikut sync — pola shard bulan
       yang sama persis dengan txs (mergeById saat pull). Perangkat lama
       yang belum punya dokumen orders tidak mengirim apa-apa (no-op). */
    var ordShards = {};
    for (i = 0; i < (D.orders || []).length; i++) {
      t = D.orders[i];
      k = 'orders|' + this.monthKey(t.at);
      (ordShards[k] = ordShards[k] || []).push(t);
    }
    for (k in ordShards) docs[k] = { type: 'orders', key: k.slice(7), data: ordShards[k] };
    return docs;
  },

  /* Sidik jari dokumen (Q3, audit 30 Okt 2026): hash isi SHA-256.
     Untuk dokumen master & settings_public dipakai sidik jari KANONIS
     ('h3$'): kunci objek diurutkan rekursif dan item master diurutkan
     per isinya — urutan item & urutan kunci JSONB dari server tidak
     lagi membuat dokumen yang sama isinya terbaca "kotor" selamanya
     (cegah push ping-pong antar perangkat yang urutannya berbeda). */
  _canon: function (v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    var i, parts = [];
    if (Array.isArray(v)) {
      for (i = 0; i < v.length; i++) parts.push(this._canon(v[i]));
      return '[' + parts.join(',') + ']';
    }
    var keys = Object.keys(v).sort();
    for (i = 0; i < keys.length; i++) parts.push(JSON.stringify(keys[i]) + ':' + this._canon(v[keys[i]]));
    return '{' + parts.join(',') + '}';
  },
  _hashStr: function (s) {
    var u;
    try { u = unescape(encodeURIComponent(s)); }
    catch (e) {
      try { u = unescape(encodeURIComponent(s.replace(/[\uD800-\uDFFF]/g, '?'))); }
      catch (e2) { u = s; }
    }
    var h = LicCrypto.sha256(u);
    return h ? 'h3$' + h : 'h3$len' + s.length;
  },
  fingerprint: function (doc) {
    if (doc && this.MASTER[doc.type]) {
      var env = this.parseMasterData(doc.data);
      var parts = [];
      for (var i = 0; i < env.items.length; i++) parts.push(this._canon(env.items[i]));
      parts.sort();
      return this._hashStr('M[' + parts.join(',') + ']D' + this._canon(this._pruneDels(env.dels)));
    }
    if (doc && doc.type === 'settings_public') {
      return this._hashStr('S' + this._canon(doc.data || {}));
    }
    var json = JSON.stringify(doc.data);
    /* LicCrypto.sha256 hanya menerima Latin-1 (charCode > 255 -> ''),
       jadi JSON di-encode UTF-8 -> Latin-1 dulu (emoji menu dsb. aman). */
    var s;
    try { s = unescape(encodeURIComponent(json)); }
    catch (e) {
      try { s = unescape(encodeURIComponent(json.replace(/[\uD800-\uDFFF]/g, '?'))); }
      catch (e2) { s = json; }
    }
    var h = LicCrypto.sha256(s);
    return h ? 'h2$' + h : 'h2$len' + json.length; // fallback deterministik
  },

  isDirty: function (docs, k) {
    return this.meta.hashes[k] !== this.fingerprint(docs[k]);
  },
  pendingCount: function () {
    if (typeof Account === 'undefined' || !Account.signedIn()) return 0;
    var docs = this.collectDocs(), n = 0;
    for (var k in docs) if (this.isDirty(docs, k)) n++;
    return n;
  },

  /* ---------- gabung dokumen master (dua arah otomatis) ---------- */
  itemStamp: function (x) { return (x && (x.updatedAt || x.at || x.createdAt)) || 0; },

  /* Normalkan item yang datang dari cloud sebelum tinggal lokal:
     foto menu lewat safeImg (X1); PIN karyawan selalu dari lokal (S3). */
  _adopt: function (type, win, localOrig, pins) {
    if (win === localOrig) return win;
    var c = {}, k;
    for (k in win) c[k] = win[k];
    if (type === 'menus') c.photo = K.safeImg(win.photo);
    if (type === 'employees') {
      c.pin = (pins && Object.prototype.hasOwnProperty.call(pins, win.id)) ? pins[win.id] : '';
    }
    return c;
  },

  /* Gabung satu dokumen master cloud ke lokal. Mengembalikan true bila
     isi lokal / tombstone berubah. Urutan item lokal dipertahankan;
     item baru dari cloud menyusul di ekor (urutan = kosmetik per
     perangkat; kesetaraan isi dinilai sidik jari kanonis). */
  mergeMaster: function (type, cloudData) {
    if (!this.meta) this.loadMeta(); // jalur langsung tanpa init (uji/darurat)
    var D = KDB.data, self = this;
    var env = this.parseMasterData(cloudData);
    var dels = this.meta.dels[type] || (this.meta.dels[type] = {});
    var changed = false, id;
    for (id in env.dels) {
      var ts = +env.dels[id] || 0;
      if (ts > (dels[id] || 0)) { dels[id] = ts; changed = true; }
    }
    var cutoff = Date.now() - this.DEL_KEEP_MS;
    for (id in dels) if (!((+dels[id] || 0) >= cutoff)) { delete dels[id]; changed = true; }

    if (type === 'cats') {
      var catAdd = this.meta.catAdd || {};
      var alive = function (n) { var d = dels[n] || 0; return !d || (catAdd[n] || 0) > d; };
      var outC = [];
      (D.cats || []).forEach(function (n) { if (alive(n) && outC.indexOf(n) < 0) outC.push(n); });
      env.items.forEach(function (n) {
        if (typeof n === 'string' && alive(n) && outC.indexOf(n) < 0) outC.push(n);
      });
      if (JSON.stringify(outC) !== JSON.stringify(D.cats || [])) changed = true;
      D.cats = outC;
      return changed;
    }

    var local = (type === 'menus' ? D.menus : type === 'employees' ? D.employees : D.feedback) || [];
    var pins = null;
    if (type === 'employees') {
      pins = {};
      local.forEach(function (e) { pins[e.id] = e.pin || ''; });
    }
    var cloudById = {}, cloudOrder = [], i, ci;
    for (i = 0; i < env.items.length; i++) {
      ci = env.items[i];
      if (ci && ci.id && !cloudById[ci.id]) { cloudById[ci.id] = ci; cloudOrder.push(ci.id); }
    }
    var used = {}, out = [];
    local.forEach(function (li) {
      if (!li || !li.id) { out.push(li); return; }
      var c = cloudById[li.id];
      if (c) used[li.id] = 1;
      var win = li;
      if (c && self.itemStamp(c) >= self.itemStamp(li)) win = c;
      if (dels[li.id] && dels[li.id] >= self.itemStamp(win)) return; // terhapus (tombstone >= stempel pemenang)
      out.push(self._adopt(type, win, li, pins));
    });
    cloudOrder.forEach(function (cid) {
      if (used[cid]) return;
      var c = cloudById[cid];
      if (dels[cid] && dels[cid] >= self.itemStamp(c)) return;
      out.push(self._adopt(type, c, null, pins));
    });
    if (type === 'feedback') out.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    /* Deteksi berubah: bandingkan kanonis per item (PIN karyawan
       dinormalkan keluar agar pasang-lagi PIN tidak terbaca berubah). */
    var norm = function (arr) {
      return arr.map(function (it) {
        if (type === 'employees' && it) { var c = {}; for (var k in it) c[k] = it[k]; c.pin = ''; return self._canon(c); }
        return self._canon(it);
      }).sort().join(',');
    };
    if (norm(out) !== norm(local)) changed = true;
    if (type === 'menus') D.menus = out;
    else if (type === 'employees') D.employees = out;
    else D.feedback = out;
    return changed;
  },

  /* Sidik jari keadaan server untuk satu dokumen master sesudah pull:
     baseline = isi cloud (sesudah normalisasi intake) + tombstone
     cloud saja. Bila gabungan lokal menyimpan perubahan lokal, sidik
     jari lokal beda dari baseline -> push mengirim hasil gabungan. */
  _serverBaselineFp: function (type, cloudData) {
    var env = this.parseMasterData(cloudData), pins = null, self = this;
    var items = env.items.map(function (it) { return self._adopt(type, it, null, pins); });
    var data = items.slice();
    var d = this._pruneDels(env.dels);
    if (Object.keys(d).length) data.push({ _del: d });
    return this.fingerprint({ type: type, key: '', data: data });
  },

  /* Terapkan SATU baris server (dipakai pull & push-retry): gabung,
     catat versi, dan untuk master/settings catat baseline sidik jari
     server. Mengembalikan true bila data lokal berubah. */
  _applyServerRow: function (row) {
    var type = row.doc_type, key = row.doc_key, k = type + '|' + key;
    var changed = false, refreshLocalHash = false;
    this._suspend = true;
    try {
      if (this.MASTER[type]) {
        changed = this.mergeMaster(type, row.data);
        this.meta.versions[k] = row.version;
        this.meta.hashes[k] = this._serverBaselineFp(type, row.data);
      } else if (type === 'settings_public') {
        var serverTs = Date.parse(row.updated_at) || 0;
        var dirty = this.isDirty(this.collectDocs(), k);
        if (!dirty || (this.meta.settingsTs || 0) <= serverTs) {
          this.applyDoc(type, key, row.data);
          this.meta.settingsTs = serverTs;
          changed = true;
          var sp = {}, i, kk;
          for (i = 0; i < this.SETTINGS_KEYS.length; i++) {
            kk = this.SETTINGS_KEYS[i];
            if (row.data && typeof row.data[kk] !== 'undefined') sp[kk] = row.data[kk];
          }
          this.meta.hashes[k] = this.fingerprint({ type: type, key: '', data: sp });
        }
        this.meta.versions[k] = row.version;
      } else if (type === 'txs' || type === 'stock_log' || type === 'orders') {
        this.applyDoc(type, key, row.data);
        this.meta.versions[k] = row.version;
        changed = true;
        refreshLocalHash = true; // semantik lama: hasil gabung shard = baseline lokal
      }
      if (changed) KDB.save(); // wrapper: _suspend -> hanya simpan + segarkan bayangan
      if (refreshLocalHash) {
        var docs = this.collectDocs();
        if (docs[k]) this.meta.hashes[k] = this.fingerprint(docs[k]);
      }
    } finally {
      this._suspend = false;
    }
    this.saveMeta();
    return changed;
  },

  /* Konflik manual warisan (meta.conflicts dari versi lama): snapshot
     server yang tertahan diperlakukan sebagai bahan merge biasa, lalu
     konflik dibersihkan — tidak ada lagi pilihan manual untuk dokumen
     yang sudah auto-merge. */
  _resolveStoredConflicts: function () {
    if (!this.meta.conflicts || !this.meta.conflicts.length) return;
    var rest = [], changed = false, self = this;
    this.meta.conflicts.forEach(function (c) {
      var row = c && c.server;
      if (!row || !row.doc_type) { rest.push(c); return; }
      if (self.MASTER[row.doc_type] || row.doc_type === 'settings_public') {
        if (self._applyServerRow(row)) changed = true;
      } else rest.push(c);
    });
    this.meta.conflicts = rest;
    this.saveMeta();
    return changed;
  },

  /* ---------- terapkan dokumen cloud -> lokal ---------- */
  mergeById: function (local, incoming) {
    var map = {}, out = [], i, it, cur, stamp;
    for (i = 0; i < local.length; i++) map[local[i].id] = local[i];
    for (i = 0; i < incoming.length; i++) {
      it = incoming[i];
      cur = map[it.id];
      if (!cur) { map[it.id] = it; continue; }
      stamp = function (x) { return x.updatedAt || x.at || 0; };
      if (stamp(it) >= stamp(cur)) map[it.id] = it;
    }
    for (var id in map) out.push(map[id]);
    out.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    return out;
  },

  applyDoc: function (type, key, data) {
    var D = KDB.data;
    if (this.MASTER[type]) { this.mergeMaster(type, data); return; }
    if (type === 'settings_public') {
      for (var k in data) {
        if (this.SETTINGS_KEYS.indexOf(k) >= 0) D.settings[k] = data[k];
      }
      D.settings.logo = K.safeImg(D.settings.logo); // X2 intake
    } else if (type === 'txs') {
      var shard = D.txs.filter(function (t) { return Sync.monthKey(t.at) === key; });
      var others = D.txs.filter(function (t) { return Sync.monthKey(t.at) !== key; });
      D.txs = this.mergeById(shard, data).concat(others)
        .sort(function (a, b) { return b.at - a.at; });
    } else if (type === 'stock_log') {
      var sShard = (D.stockLog || []).filter(function (t) { return Sync.monthKey(t.at) === key; });
      var sOthers = (D.stockLog || []).filter(function (t) { return Sync.monthKey(t.at) !== key; });
      D.stockLog = this.mergeById(sShard, data).concat(sOthers)
        .sort(function (a, b) { return b.at - a.at; });
    } else if (type === 'orders') {
      var oShard = (D.orders || []).filter(function (o) { return Sync.monthKey(o.at) === key; });
      var oOthers = (D.orders || []).filter(function (o) { return Sync.monthKey(o.at) !== key; });
      D.orders = this.mergeById(oShard, data).concat(oOthers)
        .sort(function (a, b) { return b.at - a.at; });
      /* Nomor ORD tidak dobel antar perangkat: penomor lokal diturunkan
         ulang dari nomor terbesar hasil gabungan. */
      var mx = 0;
      for (var oi = 0; oi < D.orders.length; oi++) if ((D.orders[oi].no || 0) > mx) mx = D.orders[oi].no;
      if ((D.nextOrderNo || 1) < mx + 1) D.nextOrderNo = mx + 1;
    }
  },

  /* ---------- pull ---------- */
  pull: function () {
    var self = this;
    return Account.authed('/rest/v1/sync_documents?select=doc_type,doc_key,data,version,updated_at')
      .then(function (rows) {
        self._resolveStoredConflicts();
        var changed = false;
        (rows || []).forEach(function (row) {
          var k = row.doc_type + '|' + row.doc_key;
          if (row.version === (self.meta.versions[k] || 0)) return;
          if (!self.MASTER[row.doc_type] && row.doc_type !== 'settings_public' &&
              row.doc_type !== 'txs' && row.doc_type !== 'stock_log' && row.doc_type !== 'orders') return;
          if (self._applyServerRow(row)) changed = true;
        });
        if (changed) {
          self._suspend = true;
          KDB.save();
          self._suspend = false;
          App.applyTheme();
          App.renderHeader();
          if (App._booted) App.rerender();
        }
        self.saveMeta();
        return { changed: changed };
      });
  },

  _addConflict: function (k, row) {
    var found = false;
    for (var i = 0; i < this.meta.conflicts.length; i++) {
      if (this.meta.conflicts[i].k === k) { this.meta.conflicts[i].server = row; found = true; }
    }
    if (!found) this.meta.conflicts.push({ k: k, server: row });
    this.saveMeta();
  },

  _fetchRow: function (type, key) {
    return Account.authed('/rest/v1/sync_documents?select=doc_type,doc_key,data,version,updated_at' +
      '&doc_type=eq.' + encodeURIComponent(type) + '&doc_key=eq.' + encodeURIComponent(key))
      .then(function (rows) { return (rows && rows.length) ? rows[0] : null; });
  },

  /* ---------- push ----------
     Per dokumen: kirim; bila version_conflict -> tarik versi server,
     gabung, coba lagi (maks 3x). Sesudah 3x gagal catat lastError
     secara jujur dan lanjut dokumen lain (tidak menggagalkan sync). */
  push: function () {
    var self = this;
    var docs = this.collectDocs();
    var keys = Object.keys(docs).filter(function (k) { return self.isDirty(docs, k); });
    var chain = Promise.resolve(0);
    keys.forEach(function (k) {
      chain = chain.then(function (pushed) {
        return self._pushDoc(k, 0).then(function (n) { return pushed + n; });
      });
    });
    return chain.then(function (n) { self.saveMeta(); return n; });
  },

  _pushDoc: function (k, attempt) {
    var self = this;
    var docs = this.collectDocs();
    var doc = docs[k];
    if (!doc || !this.isDirty(docs, k)) return Promise.resolve(0);
    return Account.authed('/rest/v1/rpc/sync_push', {
      method: 'POST',
      body: {
        p_doc_type: doc.type, p_doc_key: doc.key, p_data: doc.data,
        p_base_version: self.meta.versions[k] || 0,
        p_device: Account.deviceLabel()
      }
    }).then(function (j) {
      self.meta.versions[k] = j.version;
      self.meta.hashes[k] = self.fingerprint(doc);
      self.saveMeta();
      return 1;
    }).catch(function (e) {
      if (e && /version_conflict/i.test(e.message || '')) {
        if (attempt >= 3) {
          self.meta.lastError = 'version_conflict:' + k;
          self.saveMeta();
          return 0;
        }
        return self._fetchRow(doc.type, doc.key).then(function (row) {
          if (row) self._applyServerRow(row);
          return self._pushDoc(k, attempt + 1);
        }).catch(function () { return 0; });
      }
      throw e;
    });
  },

  /* ---------- resolusi konflik (dipanggil dari Dashboard) ----------
     Dipertahankan untuk kompatibilitas; dokumen master & settings kini
     auto-merge sehingga jalur ini tidak lagi terpicu untuk mereka. */
  resolveUseCloud: function (k) {
    var c = null;
    this.meta.conflicts = this.meta.conflicts.filter(function (x) {
      if (x.k === k) { c = x; return false; }
      return true;
    });
    if (!c) return;
    this._suspend = true;
    this.applyDoc(c.server.doc_type, c.server.doc_key, c.server.data);
    this.meta.versions[k] = c.server.version;
    var docs = this.collectDocs();
    if (docs[k]) this.meta.hashes[k] = this.fingerprint(docs[k]);
    KDB.save();
    this._suspend = false;
    this.saveMeta();
    UI.toast(T('Data cloud dipakai untuk: ') + k.replace('|', ' '));
    if (App._booted) { App.applyTheme(); App.renderHeader(); App.rerender(); }
  },

  resolveUseLocal: function (k) {
    var self = this;
    var c = null;
    this.meta.conflicts = this.meta.conflicts.filter(function (x) {
      if (x.k === k) { c = x; return false; }
      return true;
    });
    if (!c) return;
    this.meta.versions[k] = c.server.version; // paksa basis = versi server
    var docs = this.collectDocs();
    var doc = docs[k];
    if (!doc) { this.saveMeta(); return; }
    Account.authed('/rest/v1/rpc/sync_push', {
      method: 'POST',
      body: {
        p_doc_type: doc.type, p_doc_key: doc.key, p_data: doc.data,
        p_base_version: c.server.version, p_device: Account.deviceLabel()
      }
    }).then(function (j) {
      self.meta.versions[k] = j.version;
      self.meta.hashes[k] = self.fingerprint(doc);
      self.saveMeta();
      UI.toast(T('Data perangkat ini dipakai untuk: ') + k.replace('|', ' '));
      if (App._booted) App.rerender();
    }).catch(function (e) {
      UI.toast(Account.errMsg(e));
      if (App._booted) App.rerender();
    });
  },

  /* ---------- orkestrasi ---------- */
  syncNow: function (manual) {
    var self = this;
    if (typeof Account === 'undefined' || !Account.signedIn()) {
      if (manual) UI.toast(T('Masuk akun dulu untuk sinkronisasi.'));
      return Promise.resolve(false);
    }
    if (this._running) return Promise.resolve(false);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (manual) UI.toast(T('Sedang offline — sync menunggu koneksi.'));
      return Promise.resolve(false);
    }
    this._running = true;
    if (manual) UI.toast(T('Menyinkronkan...'));
    return this.pull()
      .then(function () { return self.push(); })
      .then(function (pushed) {
        self.meta.lastSyncTs = Date.now();
        self.meta.lastError = '';
        self.saveMeta();
        if (manual) {
          UI.toast(self.meta.conflicts.length
            ? T('Sync selesai — ada ') + self.meta.conflicts.length + T(' konflik perlu pilihanmu di Dashboard.')
            : T('Sinkronisasi selesai ✅'));
        }
        self._running = false;
        if (App._booted && App.page === 'set') App.rerender();
        return true;
      })
      .catch(function (e) {
        self._running = false;
        self.meta.lastError = (e && e.message) || 'sync_error';
        self.saveMeta();
        if (manual) UI.toast(Account.errMsg(e));
        return false;
      });
  },

  /* ---------- ringkasan untuk Dashboard ---------- */
  summary: function () {
    return {
      lastSyncTs: this.meta.lastSyncTs || 0,
      pending: this.pendingCount(),
      conflicts: this.meta.conflicts || [],
      lastError: this.meta.lastError || ''
    };
  }
};
