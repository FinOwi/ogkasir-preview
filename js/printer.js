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

  printStruk: function (tx) {
    if (!tx) return;
    if (!this.hasBridge()) { UI.toast(T('Printer tidak didukung di perangkat ini')); return; }
    if (!this.connected) { UI.toast(T('Hubungkan printer dulu di Pengaturan → Printer 🖨️')); return; }
    try {
      var ok = OGKasirPrinter.printText(Kasir.receiptText(tx));
      if (ok) UI.toast(T('🖨️ Struk dikirim ke printer'));
      else {
        this.connected = false;
        UI.toast(T('❌ Gagal mencetak — cek printer lalu hubungkan ulang'));
        try { if (App.page === 'set') App.rerender(); } catch (e) {}
      }
    } catch (e) { UI.toast(T('❌ Gagal mencetak')); }
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
    UI.openModal(
      T('<h3 class="k-sheet-t">👁️ Pratinjau Struk Printer</h3>') +
      '<pre style="background:#141414;color:#f5f5f5;padding:12px;border-radius:10px;font-size:12px;line-height:1.5;white-space:pre-wrap;font-family:monospace">' +
      K.esc(txt) + '</pre>' +
      T('<p class="k-small k-muted">Teks 32 kolom — persis seperti yang dikirim ke printer thermal 58mm.</p>') +
      T('<div class="k-btn-row"><button class="k-btn k-pri" onclick="UI.closeModal()">Tutup</button></div>')
    );
  }
};

/* callback dari native (jangan dipanggil manual) */
window.ogkasirPrinterConn = function (ok, name) { Printer.onConn(ok, name); };
window.ogkasirBtPerm = function (ok) {
  if (Printer._permCb) { var cb = Printer._permCb; Printer._permCb = null; cb(!!ok); }
};
