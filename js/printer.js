/* OGKasir - printer thermal (Bluetooth SPP & WiFi TCP, ESC/POS, 58mm) */
var Printer = {
  connected: false, name: '', mac: '', type: '',
  _pendingMac: '', _pendingWifi: null, _permCb: null, _silent: false,

  hasBridge: function () { return !!(window.OGKasirPrinter); },

  /* validasi IPv4 sederhana — pure function, bisa dites tanpa bridge */
  validIp: function (ip) {
    if (typeof ip !== 'string') return false;
    var p = ip.trim().split('.');
    if (p.length !== 4) return false;
    for (var i = 0; i < 4; i++) {
      if (!/^\d{1,3}$/.test(p[i])) return false;
      var n = parseInt(p[i], 10);
      if (n < 0 || n > 255) return false;
    }
    return true;
  },

  init: function () {
    // auto-connect diam-diam ke printer yang tersimpan (tanpa toast bila gagal)
    try {
      var s = KDB.data.settings;
      if (!s || !this.hasBridge()) return;
      if (s.printerType === 'wifi' && s.printerWifiIp) {
        this._pendingWifi = { ip: s.printerWifiIp, port: s.printerWifiPort || 9100 };
        this._silent = true;
        OGKasirPrinter.connectWifiPrinter(s.printerWifiIp, s.printerWifiPort || 9100);
      } else if (s.printerMac && OGKasirPrinter.hasPermission()) {
        this._pendingMac = s.printerMac;
        this._silent = true;
        OGKasirPrinter.connectPrinter(s.printerMac);
      }
    } catch (e) {}
  },

  statusLine: function () {
    try {
      if (this.hasBridge()) {
        var st = JSON.parse(OGKasirPrinter.printerStatus() || '{}');
        this.connected = !!st.connected;
        if (this.connected) {
          this.name = st.name || '';
          this.mac = st.mac || '';
          this.type = st.type || '';
        }
      }
    } catch (e) {}
    if (!this.hasBridge()) return T('<span class="k-muted">Tidak tersedia di perangkat ini</span>');
    if (this.connected && this.name)
      return T('🟢 Terhubung: <b>') + K.esc(this.name) + '</b>';
    return T('⚪ Belum terhubung');
  },

  ensurePerm: function (cb) {
    try {
      if (!this.hasBridge()) { cb(false); return; }
      if (OGKasirPrinter.hasPermission()) { cb(true); return; }
      this._permCb = cb;
      OGKasirPrinter.requestPermission();
    } catch (e) { cb(false); }
  },

  pick: function () {
    var self = this;
    if (!this.hasBridge()) { UI.toast(T('Printer tidak didukung di perangkat ini')); return; }
    try {
      if (!OGKasirPrinter.btAvailable()) { UI.toast(T('HP ini tidak punya Bluetooth')); return; }
      if (!OGKasirPrinter.btEnabled()) {
        UI.confirm(T('Bluetooth HP sedang mati. Nyalakan dulu?'), T('Buka Pengaturan'),
          function () { try { OGKasirPrinter.openBtSettings(); } catch (e) {} });
        return;
      }
    } catch (e) { UI.toast(T('Bluetooth tidak tersedia')); return; }
    this.ensurePerm(function (ok) {
      if (!ok) { UI.toast('Izin Bluetooth ditolak'); return; }
      self.showPicker();
    });
  },

  showPicker: function () {
    var list = [];
    try { list = JSON.parse(OGKasirPrinter.listPrinters() || '[]'); } catch (e) {}
    var h = T('<h3 class="k-sheet-t">🖨️ Pilih Printer</h3>');
    if (!list.length) {
      h += T('<p class="k-muted" style="font-size:14px;line-height:1.7">Belum ada perangkat ter-pairing.<br>') +
        T('Pairing dulu printer thermal-mu di <b>Pengaturan Bluetooth HP</b>, lalu buka lagi menu ini.</p>') +
        T('<div class="k-btn-row"><button class="k-btn k-sec" onclick="try{OGKasirPrinter.openBtSettings()}catch(e){}">⚙️ Buka Bluetooth HP</button></div>');
    } else {
      for (var i = 0; i < list.length; i++) {
        h += '<button class="k-btn k-sec" style="margin-bottom:8px;text-align:left" onclick="Printer.connect(\'' +
          K.esc(list[i].mac) + T('\')">🖨️ <b>') + K.esc(list[i].name) + '</b>' +
          '<br><span class="k-small k-muted">' + K.esc(list[i].mac) + '</span></button>';
      }
    }
    h += T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeSheet()">Tutup</button></div>');
    UI.openSheet(h);
  },

  connect: function (mac) {
    this._pendingMac = mac;
    this._pendingWifi = null;
    this._silent = false;
    UI.toast('Menghubungkan printer...');
    try { OGKasirPrinter.connectPrinter(mac); }
    catch (e) { this.onConn(false, ''); }
  },

  /* ---------- printer WiFi ---------- */

  pickWifi: function () {
    if (!this.hasBridge()) { UI.toast(T('Printer tidak didukung di perangkat ini')); return; }
    var s = {};
    try { s = KDB.data.settings || {}; } catch (e) {}
    var ip = s.printerWifiIp || '';
    var port = s.printerWifiPort || 9100;
    var h = T('<h3 class="k-sheet-t">🛜 Printer WiFi</h3>') +
      T('<p class="k-muted" style="font-size:14px;line-height:1.7">Pastikan printer & HP terhubung ke <b>WiFi yang sama</b>. Cek IP di struk konfigurasi printer (biasanya 192.168.x.x).</p>') +
      T('<div class="k-fld"><label>IP Printer</label><input class="k-in" id="wIp" inputmode="decimal" placeholder="192.168.1.50" value="') + K.esc(ip) + '"></div>' +
      T('<div class="k-fld"><label>Port</label><input class="k-in" id="wPort" inputmode="numeric" placeholder="9100" value="') + K.esc(String(port)) + '"></div>' +
      T('<div class="k-btn-row"><button class="k-btn k-pri" onclick="Printer.connectWifi()">🔌 Hubungkan</button>') +
      T('<button class="k-btn k-ghost" onclick="UI.closeSheet()">Batal</button></div>');
    UI.openSheet(h);
  },

  connectWifi: function () {
    var ipEl = document.getElementById('wIp');
    var portEl = document.getElementById('wPort');
    var ip = ipEl ? ipEl.value.trim() : '';
    var port = portEl ? parseInt(portEl.value.trim(), 10) : 9100;
    if (!this.validIp(ip)) { UI.toast(T('IP tidak valid — contoh: 192.168.1.50')); return; }
    if (!(port > 0 && port < 65536)) { UI.toast(T('Port tidak valid')); return; }
    this._pendingWifi = { ip: ip, port: port };
    this._pendingMac = '';
    this._silent = false;
    UI.toast(T('Menghubungkan printer WiFi...'));
    try { OGKasirPrinter.connectWifiPrinter(ip, port); }
    catch (e) { this.onConn(false, ''); }
  },

  /* dipanggil native via window.ogkasirPrinterConn(ok, name) */
  onConn: function (ok, name) {
    this.connected = !!ok;
    if (ok) {
      this.name = name || '';
      var isWifi = !!this._pendingWifi;
      this.mac = isWifi ? '' : (this._pendingMac || '');
      this.type = isWifi ? 'wifi' : 'bt';
      try {
        if (isWifi) {
          KDB.data.settings.printerWifiIp = this._pendingWifi.ip;
          KDB.data.settings.printerWifiPort = this._pendingWifi.port;
          KDB.data.settings.printerType = 'wifi';
          KDB.data.settings.printerName = this.name;
          KDB.data.settings.printerMac = ''; // cegah auto-connect ganda ke BT
        } else {
          KDB.data.settings.printerMac = this.mac;
          KDB.data.settings.printerName = this.name;
          KDB.data.settings.printerType = 'bt';
          KDB.data.settings.printerWifiIp = '';
        }
        KDB.save();
      } catch (e) {}
      if (!this._silent) {
        UI.toast(T('✅ Terhubung: ') + this.name);
        UI.closeSheet();
      }
    } else {
      this.name = '';
      this.mac = '';
      this.type = '';
      if (!this._silent) UI.toast(T('❌ Gagal terhubung ke printer'));
    }
    this._silent = false;
    this._pendingMac = '';
    this._pendingWifi = null;
    try { if (App.page === 'set') App.rerender(); } catch (e) {}
  },

  disconnect: function () {
    try { OGKasirPrinter.disconnectPrinter(); } catch (e) {}
    this.connected = false;
    this.name = '';
    this.mac = '';
    this.type = '';
    try {
      KDB.data.settings.printerMac = '';
      KDB.data.settings.printerName = '';
      KDB.data.settings.printerWifiIp = '';
      KDB.data.settings.printerType = '';
      KDB.save();
    } catch (e) {}
    UI.toast('Printer diputus');
    try { App.rerender(); } catch (e) {}
  },

  /* ---------- logo toko di struk ---------- */
  logoEnabled: function () {
    var s = KDB.data.settings;
    return !!(s.logo && s.receiptLogo !== false);
  },

  /* Kurva penegas cetak: nilai abu digelapkan (gamma) supaya warna terang
     (mis. emas) tetap tegas saat jadi titik hitam-putih di kertas thermal. */
  shade: function (v) {
    return 255 * Math.pow(v / 255, 1.35);
  },

  /* Piksel 1-bit logo (dither Floyd-Steinberg) untuk raster ESC/POS + pratinjau.
     cb({w,h,px}) — px: 1 = titik hitam. Gagal/tidak ada logo -> cb(null). */
  logoPixels: function (cb) {
    var src = KDB.data.settings.logo;
    if (!src) { cb(null); return; }
    var img = new Image();
    img.onload = function () {
      try {
        var sc = Math.min(200 / img.width, 200 / img.height);
        var w = Math.max(1, Math.round(img.width * sc));
        var h = Math.max(1, Math.round(img.height * sc));
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        var cx = cv.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
        cx.drawImage(img, 0, 0, w, h);
        var d = cx.getImageData(0, 0, w, h).data;
        var g = new Float32Array(w * h), i;
        for (i = 0; i < w * h; i++) g[i] = Printer.shade((d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000);
        var px = new Uint8Array(w * h);
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
          var id = y * w + x, old = g[id], nv = old < 128 ? 0 : 255, err = old - nv;
          px[id] = nv === 0 ? 1 : 0;
          if (x + 1 < w) g[id + 1] += err * 7 / 16;
          if (y + 1 < h) {
            if (x > 0) g[id + w - 1] += err * 3 / 16;
            g[id + w] += err * 5 / 16;
            if (x + 1 < w) g[id + w + 1] += err / 16;
          }
        }
        cb({ w: w, h: h, px: px });
      } catch (e) { cb(null); }
    };
    img.onerror = function () { cb(null); };
    img.src = src;
  },

  /* Bungkus piksel 1-bit jadi perintah raster ESC/POS (GS v 0). */
  rasterCmd: function (w, h, px) {
    var xb = Math.ceil(w / 8);
    var out = [0x1D, 0x76, 0x30, 0x00, xb & 0xFF, (xb >> 8) & 0xFF, h & 0xFF, (h >> 8) & 0xFF];
    for (var y = 0; y < h; y++) for (var bxi = 0; bxi < xb; bxi++) {
      var b = 0;
      for (var bit = 0; bit < 8; bit++) {
        var x = bxi * 8 + bit;
        if (x < w && px[y * w + x]) b |= (0x80 >> bit);
      }
      out.push(b);
    }
    return out;
  },

  /* Logo sebagai base64 perintah raster untuk bridge native. cb('') bila tak ada/gagal. */
  logoB64: function (cb) {
    if (!this.logoEnabled()) { cb(''); return; }
    this.logoPixels(function (r) {
      if (!r) { cb(''); return; }
      try {
        var bytes = Printer.rasterCmd(r.w, r.h, r.px), bin = '';
        for (var i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.slice(i, i + 8192));
        cb(btoa(bin));
      } catch (e) { cb(''); }
    });
  },

  printStruk: function (tx) {
    if (!tx) return;
    if (!this.hasBridge()) { UI.toast(T('Printer tidak didukung di perangkat ini')); return; }
    if (!this.connected) { UI.toast(T('Hubungkan printer dulu di Pengaturan → Printer 🖨️')); return; }
    var self = this;
    var done = function (ok) {
      if (ok) UI.toast(T('🖨️ Struk dikirim ke printer'));
      else {
        self.connected = false;
        UI.toast(T('❌ Gagal mencetak — cek printer lalu hubungkan ulang'));
        try { if (App.page === 'set') App.rerender(); } catch (e) {}
      }
    };
    var text = Kasir.receiptText(tx);
    if (this.logoEnabled() && typeof OGKasirPrinter.printWithLogo === 'function') {
      this.logoB64(function (b64) {
        var ok = false;
        try { ok = b64 ? OGKasirPrinter.printWithLogo(b64, text) : OGKasirPrinter.printText(text); }
        catch (e) { UI.toast(T('❌ Gagal mencetak')); return; }
        done(ok);
      });
    } else {
      var ok2 = false;
      try { ok2 = OGKasirPrinter.printText(text); } catch (e) { UI.toast(T('❌ Gagal mencetak')); return; }
      done(ok2);
    }
  },

  testPrint: function () {
    if (!this.hasBridge()) { UI.toast(T('Printer tidak didukung di perangkat ini')); return; }
    if (!this.connected) { UI.toast(T('Hubungkan printer dulu, bro 🖨️')); return; }
    try {
      var ok = OGKasirPrinter.printTest();
      UI.toast(ok ? T('🖨️ Test print dikirim') : T('❌ Gagal — cek printer'));
      if (!ok) this.connected = false;
    } catch (e) { UI.toast(T('❌ Gagal test print')); }
  },

  /* pratinjau teks persis seperti yang dikirim ke printer — tanpa butuh printer fisik */
  preview: function () {
    var tx = null;
    try { tx = (typeof Kasir !== 'undefined' && Kasir.lastTx) || KDB.data.txs[0] || null; } catch (e) {}
    var txt = tx ? Kasir.receiptText(tx)
      : T('      CONTOH STRUK\n------------------------------\nBelum ada transaksi.\nBuat transaksi dulu ya bro.\n------------------------------');
    var logoHtml = '';
    if (this.logoEnabled()) {
      logoHtml = '<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px;text-align:center">' +
        '<canvas id="strukLogoPrev" style="max-width:200px;image-rendering:pixelated"></canvas>' +
        '<div class="k-small k-muted" style="margin-top:6px">' + T('Logo toko — dicetak hitam-putih seperti ini, di bagian atas struk.') + '</div></div>';
    }
    UI.openModal(
      T('<h3 class="k-sheet-t">👁️ Pratinjau Struk Printer</h3>') +
      logoHtml +
      '<pre style="background:#141414;color:#f5f5f5;padding:12px;border-radius:10px;font-size:12px;line-height:1.5;white-space:pre-wrap;font-family:monospace">' +
      K.esc(txt) + '</pre>' +
      T('<p class="k-small k-muted">Teks 32 kolom — persis seperti yang dikirim ke printer thermal 58mm.</p>') +
      T('<div class="k-btn-row"><button class="k-btn k-pri" onclick="UI.closeModal()">Tutup</button></div>')
    );
    if (logoHtml) {
      this.logoPixels(function (r) {
        var cv = document.getElementById('strukLogoPrev');
        if (!r || !cv) return;
        cv.width = r.w; cv.height = r.h;
        var cx = cv.getContext('2d');
        var im = cx.createImageData(r.w, r.h);
        for (var i = 0; i < r.w * r.h; i++) {
          var v = r.px[i] ? 0 : 255;
          im.data[i * 4] = v; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255;
        }
        cx.putImageData(im, 0, 0);
      });
    }
  }
};

/* callback dari native (jangan dipanggil manual) */
window.ogkasirPrinterConn = function (ok, name) { Printer.onConn(ok, name); };
window.ogkasirBtPerm = function (ok) {
  if (Printer._permCb) { var cb = Printer._permCb; Printer._permCb = null; cb(!!ok); }
};
