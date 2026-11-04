/* OGKasir - Scan kode produk via kamera (live viewfinder).
   Mesin: @zxing/library (BrowserMultiFormatReader) — baca EAN-13/8, UPC-A/E,
   Code-128/39, ITF, Codabar, QR, DataMatrix, Aztec langsung dari kamera HP.
   Bisa juga ketik manual (barcode rusak / HP tanpa kamera).
   Pakai layer MODAL supaya bisa dibuka dari atas sheet form tanpa menutupnya.
   Di APK: izin CAMERA ditangani native (MainActivity.onPermissionRequest). */
var Scan = {
  _stream: null, _reader: null, _cb: null, _done: false,

  FORMATS: function () {
    var BF = ZXing.BarcodeFormat;
    return [BF.QR_CODE, BF.DATA_MATRIX, BF.AZTEC,
      BF.EAN_13, BF.EAN_8, BF.UPC_A, BF.UPC_E,
      BF.CODE_128, BF.CODE_39, BF.ITF, BF.CODABAR];
  },

  open: function (cb) {
    if (!window.ZXing || !ZXing.BrowserMultiFormatReader) { UI.toast(T('Pustaka scan belum termuat')); return; }
    this._cb = cb; this._done = false;
    var cam = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    var hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, this.FORMATS());
    try { this._reader = new ZXing.BrowserMultiFormatReader(hints, 250); }
    catch (e) { UI.toast(T('Scan tidak bisa dimulai')); return; }
    UI.openModal(
      T('<h3 class="k-sheet-t">📷 Scan Kode Produk</h3>') +
      T('<p class="k-muted" style="font-size:13px;margin:0 0 10px">Arahkan kamera ke QR / barcode produk') +
      (cam ? '' : T(' (kamera tidak tersedia di perangkat ini)')) + '</p>' +
      (cam ? '<video id="scanVideo" playsinline muted style="width:100%;border-radius:12px;background:#000;min-height:220px"></video>' : '') +
      '<div style="display:flex;align-items:center;gap:10px;margin:16px 0 12px">' +
      '<div style="flex:1;height:1px;background:var(--line)"></div>' +
      '<span style="font-size:13px;font-weight:700;color:var(--muted);white-space:nowrap">' + T('Atau ketik manual') + '</span>' +
      '<div style="flex:1;height:1px;background:var(--line)"></div></div>' +
      '<div style="display:flex;gap:8px;align-items:stretch">' +
      '<input class="k-in" id="scanManual" placeholder="' + T('cth: 8991234567890') + '" style="flex:1 1 auto;width:1px;min-width:0" autocomplete="off">' +
      '<button class="k-btn k-pri" onclick="Scan.manualGo()" style="flex:0 0 auto;width:auto;padding:12px 20px;box-shadow:0 2px 8px rgba(0,0,0,.18)">OK</button></div>' +
      T('<div class="k-btn-row" style="margin-top:12px"><button class="k-btn k-ghost" onclick="Scan.close()">Batal</button></div>')
    );
    if (!cam) return;
    var self = this;
    try {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        .then(function (s) { self._start(s); }, function (e) { self._fail(e); });
    } catch (e) { this._fail(e); }
  },

  _start: function (stream) {
    var v = document.getElementById('scanVideo');
    if (!v) { this._stop(); return; }
    this._stream = stream;
    v.srcObject = stream;
    var self = this;
    v.onloadedmetadata = function () {
      try { v.play(); } catch (e) {}
      try {
        self._reader.decodeFromVideoElementContinuously(v, function (result, err) {
          if (self._done) return;
          if (result) {
            self._done = true;
            var code = String(result.getText()).trim();
            try { if (navigator.vibrate) navigator.vibrate(80); } catch (e) {}
            var cb = self._cb;
            self.close();
            if (code && cb) cb(code);
          }
          // err (NotFoundException tiap frame) diabaikan
        });
      } catch (e) { self._fail(e); }
    };
  },

  manualGo: function () {
    var el = document.getElementById('scanManual');
    var code = el ? String(el.value).trim() : '';
    if (!code) { UI.toast(T('Ketik dulu kodenya, bro')); return; }
    this._done = true;
    var cb = this._cb;
    this.close();
    if (cb) cb(code);
  },

  _fail: function (e) {
    this._stop();
    var n = (e && e.name) || '';
    if (n === 'NotAllowedError' || n === 'SecurityError') {
      UI.toast(T('Izin kamera ditolak — izinkan di Pengaturan HP, atau ketik manual'));
    } else if (n === 'NotFoundError' || n === 'OverconstrainedError') {
      UI.toast(T('Kamera tidak ditemukan — silakan ketik manual'));
    } else {
      UI.toast(T('Kamera tidak bisa dibuka — silakan ketik manual'));
    }
  },

  _stop: function () {
    this._done = true;
    if (this._reader) {
      try { this._reader.reset(); } catch (e) {}
      this._reader = null;
    }
    if (this._stream) {
      try { this._stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      this._stream = null;
    }
  },

  close: function () {
    this._stop();
    this._cb = null;
    UI.closeModal();
  }
};
