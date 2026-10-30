/* OGKasir - Sync multi-platform (Supabase sync_documents).
   Prinsip: offline-first. Lokal selalu sumber kerja; sync oportunistik.
   - Dokumen per koleksi: menus, cats, employees, feedback, settings_public,
     txs, stock_log & orders di-shard per bulan (doc_key 'YYYY-MM').
   - PIN karyawan TIDAK pernah masuk dokumen sync (S3); foto menu & logo
     dinormalkan K.safeImg saat applyDoc (X1/X2).
   - Push memakai optimistic concurrency (version di server).
   - Transaksi append-only -> pull menggabungkan union by id (yg lebih baru menang).
   - Konflik master data TIDAK ditimpa diam-diam: dicatat, user yang memilih.
   Meta sync disimpan terpisah dari KDB (kasirku_sync_v1) — tidak ikut backup/sync. */
var Sync = {
  MKEY: 'kasirku_sync_v1',
  SETTINGS_KEYS: ['shop', 'addr', 'foot', 'logo', 'theme', 'accent', 'menuView',
    'lang', 'userName', 'userEmoji', 'notePresets', 'phone', 'shopType', 'bizMode', 'bizSub'],
  meta: null,      // {versions:{}, hashes:{}, conflicts:[], lastSyncTs:0, lastError:''}
  _timer: null,
  _running: false,
  _suspend: false, // true saat menerapkan hasil pull (cegah loop save->sync)

  init: function () {
    this.loadMeta();
    var orig = KDB.save.bind(KDB);
    var self = this;
    KDB.save = function () {
      orig();
      self.onSave();
    };
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

  /* ---------- koleksi lokal -> dokumen ---------- */
  monthKey: function (ts) {
    var d = new Date(ts);
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1);
  },

  collectDocs: function () {
    var D = KDB.data, docs = {}, i, t, k;
    docs['menus|'] = { type: 'menus', key: '', data: D.menus };
    docs['cats|'] = { type: 'cats', key: '', data: D.cats };
    /* S3: PIN karyawan TIDAK ikut sync — yang dikirim salinan tanpa PIN;
       PIN lokal dipasang lagi saat applyDoc. */
    docs['employees|'] = { type: 'employees', key: '', data: (D.employees || []).map(function (e) {
      var c = {}; for (var ek in e) c[ek] = e[ek]; c.pin = ''; return c;
    }) };
    docs['feedback|'] = { type: 'feedback', key: '', data: D.feedback || [] };
    var sp = {};
    for (i = 0; i < this.SETTINGS_KEYS.length; i++) {
      k = this.SETTINGS_KEYS[i];
      if (typeof D.settings[k] !== 'undefined') sp[k] = D.settings[k];
    }
    docs['settings_public|'] = { type: 'settings_public', key: '', data: sp };
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

  /* Sidik jari dokumen (Q3, audit 30 Okt 2026): dulu sidik jari lemah
     (panjang + id ujung + jumlah kasar) — ganti nama menu sama-panjang
     tidak pernah ter-push. Kini hash isi sungguhan: SHA-256 sinkron
     LicCrypto atas JSON dokumen. Format berubah ('h2$...') sehingga
     meta lama otomatis dianggap berubah & ter-push ulang sekali. */
  fingerprint: function (doc) {
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
    if (type === 'menus') {
      /* X1 intake: normalkan foto dari cloud sebelum tersimpan lokal */
      D.menus = (data || []).map(function (m) {
        var c = {}; for (var mk in m) c[mk] = m[mk]; c.photo = K.safeImg(m.photo); return c;
      });
    }
    else if (type === 'cats') D.cats = data;
    else if (type === 'employees') {
      /* S3: pasang lagi PIN lokal per id — PIN tidak pernah dari cloud */
      var pins = {};
      (D.employees || []).forEach(function (e) { pins[e.id] = e.pin || ''; });
      D.employees = (data || []).map(function (e) {
        var c = {}; for (var ek in e) c[ek] = e[ek];
        c.pin = Object.prototype.hasOwnProperty.call(pins, e.id) ? pins[e.id] : '';
        return c;
      });
    }
    else if (type === 'feedback') D.feedback = data;
    else if (type === 'settings_public') {
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
        var docs = self.collectDocs(), changed = false;
        self._suspend = true;
        (rows || []).forEach(function (row) {
          var k = row.doc_type + '|' + row.doc_key;
          var localVer = self.meta.versions[k] || 0;
          if (row.version === localVer) return;
          var local = docs[k];
          var dirtyLocal = local && self.isDirty(docs, k);
          // txs/stock_log/orders selalu aman digabung (append-only)
          var mergeable = (row.doc_type === 'txs' || row.doc_type === 'stock_log' || row.doc_type === 'orders');
          if (dirtyLocal && !mergeable) {
            self._addConflict(k, row);
            return;
          }
          if (!local && !mergeable && row.doc_type !== 'txs' && row.doc_type !== 'stock_log') {
            // dokumen master belum ada lokal (kasus langka) -> terima cloud
          }
          self.applyDoc(row.doc_type, row.doc_key, row.data);
          self.meta.versions[k] = row.version;
          changed = true;
        });
        // segarkan sidik jari dokumen yang baru diterapkan / sudah sinkron
        var after = self.collectDocs();
        (rows || []).forEach(function (row) {
          var k = row.doc_type + '|' + row.doc_key;
          if (self.meta.versions[k] === row.version && after[k]) {
            self.meta.hashes[k] = self.fingerprint(after[k]);
          }
        });
        if (changed) { KDB.save(); App.applyTheme(); App.renderHeader(); }
        self._suspend = false;
        self.saveMeta();
        return { changed: changed };
      })
      .catch(function (e) { self._suspend = false; throw e; });
  },

  _addConflict: function (k, row) {
    var found = false;
    for (var i = 0; i < this.meta.conflicts.length; i++) {
      if (this.meta.conflicts[i].k === k) { this.meta.conflicts[i].server = row; found = true; }
    }
    if (!found) this.meta.conflicts.push({ k: k, server: row });
    this.saveMeta();
  },

  /* ---------- push ---------- */
  push: function () {
    var self = this;
    var docs = this.collectDocs();
    var keys = Object.keys(docs).filter(function (k) { return self.isDirty(docs, k); });
    // jangan push dokumen yang sedang konflik
    keys = keys.filter(function (k) {
      return !self.meta.conflicts.some(function (c) { return c.k === k; });
    });
    var chain = Promise.resolve(0);
    keys.forEach(function (k) {
      chain = chain.then(function (pushed) {
        var doc = docs[k];
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
          return pushed + 1;
        }).catch(function (e) {
          if (e && /version_conflict/i.test(e.message || '')) {
            // ambil versi server terbaru untuk dicatat sebagai konflik
            return Account.authed('/rest/v1/sync_documents?select=doc_type,doc_key,data,version,updated_at' +
              '&doc_type=eq.' + encodeURIComponent(doc.type) + '&doc_key=eq.' + encodeURIComponent(doc.key))
              .then(function (rows) {
                if (rows && rows.length) self._addConflict(k, rows[0]);
                return pushed;
              }).catch(function () { return pushed; });
          }
          throw e;
        });
      });
    });
    return chain.then(function (n) { self.saveMeta(); return n; });
  },

  /* ---------- resolusi konflik (dipanggil dari Dashboard) ---------- */
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
