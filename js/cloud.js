/* OGKasir - Cloud Backup.
   Backend utama: Supabase (anon key = public by design, aman di client;
   tabel TANPA policy -> hanya 2 RPC di bawah yang bisa diakses anon).
   JANGAN PERNAH menanam service_role key di app.
   Fallback: server custom via settings.cloudUrl (format REST /api/backup). */
var Cloud = {
  SUPA_URL: 'https://ypdfdaxgqgkaupsyiauy.supabase.co',
  SUPA_ANON: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZGZkYXhncWdrYXVwc3lpYXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MjQ2MzEsImV4cCI6MjEwNzQwMDYzMX0.w9d2wZhcdgevpSEsFcPYt1x122w09X2Ai1GFkAIlLRE',

  /* 'supabase' default; 'custom' bila settings.cloudUrl diisi */
  backend: function () { return (KDB.data.settings.cloudUrl || '').replace(/\/+$/, '') ? 'custom' : 'supabase'; },
  /* url lama (custom) — dinormalisasi */
  url: function () { return (KDB.data.settings.cloudUrl || '').replace(/\/+$/, ''); },
  supaUrl: function () { return (KDB.data.settings.supaUrl || this.SUPA_URL).replace(/\/+$/, ''); },
  supaAnon: function () { return KDB.data.settings.supaAnon || this.SUPA_ANON; },

  deviceId: function () {
    try { if (window.KasirKuNative && KasirKuNative.deviceId) return KasirKuNative.deviceId(); } catch (e) {}
    return 'web';
  },
  genKey: function () {
    var abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', k = '', i;
    try {
      var rnd = new Uint32Array(12);
      (window.crypto || window.msCrypto).getRandomValues(rnd);
      for (i = 0; i < 12; i++) k += abc[rnd[i] % abc.length];
    } catch (e) {
      for (i = 0; i < 12; i++) k += abc[Math.floor(Math.random() * abc.length)];
    }
    return k.slice(0, 4) + '-' + k.slice(4, 8) + '-' + k.slice(8, 12);
  },
  _hdrs: function () {
    return { 'apikey': this.supaAnon(), 'Authorization': 'Bearer ' + this.supaAnon(), 'Content-Type': 'application/json' };
  },

  /* auto backup bulanan: cek tiap app start.
     Syarat jalan: pernah backup manual (cloudKey = consent + punya kode),
     toggle aktif, terakhir backup > 30 hari, dan tidak sedang offline. */
  AUTO_DAYS: 30,
  autoBackup: function () {
    var s = KDB.data.settings;
    if (!s.cloudKey) return;
    if (s.cloudAuto === false) return;
    if (s.cloudTs && Date.now() - s.cloudTs < this.AUTO_DAYS * 864e5) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    this.backup(true);
  },
  toggleAuto: function (on) {
    KDB.data.settings.cloudAuto = !!on; KDB.save();
    UI.toast(T(on ? 'Backup otomatis aktif' : 'Backup otomatis mati'));
  },

  backup: function (silent) {
    var s = KDB.data.settings;
    if (!s.cloudKey) { s.cloudKey = this.genKey(); }
    var key = s.cloudKey, dev = this.deviceId(), json = JSON.stringify(KDB.data);
    if (!silent) UI.toast(T('Mengunggah backup...'));
    if (this.backend() === 'supabase') this._backupSupa(dev, key, json, silent);
    else this._backupCustom(dev, key, json, silent);
  },

  _backupSupa: function (dev, key, json, silent) {
    var self = this, s = KDB.data.settings;
    var pdata;
    try { pdata = JSON.parse(json); } catch (e) { UI.toast(T('Data tidak valid')); return; }
    fetch(this.supaUrl() + '/rest/v1/rpc/backup_put', {
      method: 'POST', headers: this._hdrs(),
      body: JSON.stringify({ p_device_id: dev, p_key: key, p_data: pdata })
    }).then(function (r) { return r.json().then(function (j) { return { st: r.status, j: j }; }); })
      .then(function (rr) {
        if (rr.st === 200 || rr.st === 201) {
          s.cloudTs = Date.parse(rr.j) || Date.now(); KDB.save(); App.rerender();
          UI.toast(T(silent ? 'Backup otomatis berhasil' : 'Backup cloud berhasil'));
        } else if (JSON.stringify(rr.j).indexOf('wrong_key') >= 0) {
          UI.toast(T('Kode pemulihan tidak cocok dengan server'));
        } else {
          UI.toast(T('Gagal: ') + (rr.j.message || rr.st));
        }
      })
      .catch(function () { UI.toast(T('Tidak bisa hubungi server')); });
  },

  _backupCustom: function (dev, key, json, silent) {
    var url = this.url(), s = KDB.data.settings;
    if (!url) { UI.toast(T('URL server cloud belum diisi — hubungi admin FinOwi.')); return; }
    fetch(url + '/api/backup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: dev, key: key, data: json })
    }).then(function (r) { return r.json().then(function (j) { return { st: r.status, j: j }; }); })
      .then(function (rr) {
        if (rr.st === 200 && rr.j.ok) {
          s.cloudTs = rr.j.ts; KDB.save(); App.rerender();
          UI.toast(T(silent ? 'Backup otomatis berhasil' : 'Backup cloud berhasil'));
        } else if (rr.j.error === 'wrong_key') {
          UI.toast(T('Kode pemulihan tidak cocok dengan server'));
        } else {
          UI.toast(T('Gagal: ') + (rr.j.error || rr.st));
        }
      })
      .catch(function () { UI.toast(T('Tidak bisa hubungi server')); });
  },

  /* sheet pulihkan: isi device id + kode, cek -> tampilkan info -> pulihkan */
  restoreSheet: function () {
    var dev = KDB.data.settings.cloudDevId || '';
    var h = T('<h3 class="k-sheet-t">⬇️ Pulihkan dari Cloud</h3>') +
      '<div class="k-fld"><label>Device ID</label>' +
      '<input class="k-in" id="cDev" value="' + K.esc(dev) + '"></div>';
    h += '<div class="k-fld"><label>' + T('Kode pemulihan') + '</label>' +
      T('<input class="k-in" id="cKey" placeholder="cth: AB12-CD34-EF56">') + '</div>' +
      '<div id="cInfo"></div>' +
      T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeSheet()">Batal</button>') +
      T('<button class="k-btn k-pri" onclick="Cloud.check()">Cek Backup</button></div>');
    UI.openSheet(h);
    var d = document.getElementById('cDev');
    if (d && !d.value) d.value = this.deviceId();
  },

  check: function () {
    var dev = (document.getElementById('cDev').value || '').trim();
    var key = (document.getElementById('cKey').value || '').trim();
    if (!dev || !key) { UI.toast(T('Isi device ID dan kode dulu')); return; }
    var info = document.getElementById('cInfo');
    info.innerHTML = T('<p class="k-small k-muted">Menghubungi server...</p>');
    if (this.backend() === 'supabase') this._checkSupa(dev, key, info);
    else this._checkCustom(dev, key, info);
  },

  _checkSupa: function (dev, key, info) {
    fetch(this.supaUrl() + '/rest/v1/rpc/backup_get', {
      method: 'POST', headers: this._hdrs(),
      body: JSON.stringify({ p_device_id: dev, p_key: key })
    }).then(function (r) { return r.json().then(function (j) { return { st: r.status, j: j }; }); })
      .then(function (rr) {
        if ((rr.st === 200 || rr.st === 201) && rr.j.length) {
          Cloud._showFound(info, dev, key, rr.j[0].ts, JSON.stringify(rr.j[0].data));
        } else if (rr.st === 200 || rr.st === 201) {
          info.innerHTML = T('<div class="k-alert">Tidak ada backup untuk device ini</div>');
        } else {
          info.innerHTML = T('<div class="k-alert">Gagal: ') + (rr.j.message || rr.st) + '</div>';
        }
      })
      .catch(function () { info.innerHTML = T('<div class="k-alert">Tidak bisa hubungi server</div>'); });
  },

  _checkCustom: function (dev, key, info) {
    var url = this.url();
    if (!url) { UI.toast(T('URL server cloud belum diisi — hubungi admin FinOwi.')); return; }
    fetch(url + '/api/backup?deviceId=' + encodeURIComponent(dev) + '&key=' + encodeURIComponent(key))
      .then(function (r) { return r.json().then(function (j) { return { st: r.status, j: j }; }); })
      .then(function (rr) {
        if (rr.st === 200 && rr.j.ok) {
          Cloud._showFound(info, dev, key, rr.j.ts, rr.j.data);
        } else if (rr.st === 404) {
          info.innerHTML = T('<div class="k-alert">Tidak ada backup untuk device ini</div>');
        } else if (rr.j.error === 'wrong_key') {
          info.innerHTML = T('<div class="k-alert">Kode pemulihan salah</div>');
        } else {
          info.innerHTML = T('<div class="k-alert">Gagal: ') + (rr.j.error || rr.st) + '</div>';
        }
      })
      .catch(function () { info.innerHTML = T('<div class="k-alert">Tidak bisa hubungi server</div>'); });
  },

  _showFound: function (info, dev, key, ts, data) {
    var dt = new Date(ts);
    info.innerHTML = '<div class="k-okbox">' + T('Backup ditemukan') + '<br><span class="k-small">' +
      dt.toLocaleString('id-ID') + ' • ' + Math.round(data.length / 1024) + ' KB</span></div>' +
      T('<button class="k-btn k-pri" id="cGo">⬇️ Pulihkan Sekarang</button>');
    document.getElementById('cGo').onclick = function () {
      UI.closeSheet();
      KDB.data.settings.cloudDevId = dev;
      KDB.data.settings.cloudKey = key;
      AppSet.doRestore(data);
    };
  },

  copyKey: function () {
    var k = KDB.data.settings.cloudKey || '';
    if (navigator.clipboard && k) navigator.clipboard.writeText(k);
    UI.toast(T('Kode disalin'));
  }
};
