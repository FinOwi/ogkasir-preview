/* OGKasir - sistem lisensi: trial 7 hari + kode aktivasi per device (offline) */
var Lic = {
  TRIAL_DAYS: 7,

  init: function () {
    var s = KDB.data.settings;
    if (!s.lic) s.lic = {};
    var lic = s.lic, now = Date.now();
    if (!lic.trialStart) lic.trialStart = now; // install lama: trial mulai dari versi ini
    // verifikasi ulang kode tersimpan — mis. habis restore backup di device lain,
    // kode device lain tidak boleh ikut aktif
    if (lic.code) {
      var vr = LicCrypto.verifyCode(lic.code, this.deviceCode(), this.todayDays());
      if (vr.ok) lic.expDays = vr.expDays;
      else { delete lic.code; delete lic.expDays; }
    }
    if (!lic.lastSeen || now > lic.lastSeen) lic.lastSeen = now;
    KDB.save();
  },

  rawDeviceId: function () {
    try {
      if (window.KasirKuNative && KasirKuNative.deviceId) {
        var id = KasirKuNative.deviceId();
        if (id) return 'and:' + id;
      }
    } catch (e) {}
    var k = 'kasirku_devraw', v = null;
    try { v = localStorage.getItem(k); } catch (e2) {}
    if (!v) {
      v = 'web:' + K.uid() + K.uid();
      try { localStorage.setItem(k, v); } catch (e3) {}
    }
    return v;
  },

  deviceCode: function () {
    return LicCrypto.deviceCode(this.rawDeviceId());
  },

  todayDays: function () { return Math.floor(Date.now() / 864e5); },

  status: function () {
    var lic = KDB.data.settings.lic || {}, now = Date.now(), today = this.todayDays();
    var tampered = lic.lastSeen && (now < lic.lastSeen - 864e5); // jam dimundurkan
    if (lic.expDays && lic.expDays >= today) {
      return { state: 'active', expDays: lic.expDays, daysLeft: lic.expDays - today };
    }
    if (!tampered) {
      var end = (lic.trialStart || now) + this.TRIAL_DAYS * 864e5;
      if (now < end) {
        return { state: 'trial', daysLeft: Math.max(1, Math.ceil((end - now) / 864e5)) };
      }
    }
    return { state: 'expired' };
  },

  valid: function () { return this.status().state !== 'expired'; },

  activate: function (code) {
    var dev = this.deviceCode();
    var r = LicCrypto.verifyCode(code, dev, this.todayDays());
    if (!r.ok) {
      var msg = T('Kode tidak valid');
      if (r.reason === 'device') msg = T('Kode ini untuk device lain');
      else if (r.reason === 'expired') msg = T('Kode sudah kedaluwarsa');
      return { ok: false, msg: msg };
    }
    var lic = KDB.data.settings.lic;
    lic.code = String(code).toUpperCase().replace(/[^0-9A-Z]/g, '');
    lic.expDays = r.expDays;
    KDB.save();
    return { ok: true, expDays: r.expDays };
  },

  copyDevice: function () {
    var dc = LicCrypto.fmtDevice(this.deviceCode());
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(dc);
      UI.toast(T('Kode device disalin: ') + dc);
    } catch (e) { UI.toast(T('Kode device: ') + dc); }
  },

  doActivate: function () {
    var el = document.getElementById('kLicCode');
    var r = this.activate(el ? el.value : '');
    if (r.ok) {
      UI.closeModal();
      UI.toast(T('Aktif sampai ') + K.fmtDate(r.expDays * 864e5) + ' 🎉');
      if (App._booted) App.rerender(); else App.boot();
    } else {
      UI.toast(r.msg);
    }
  },

  /* ---------- layar kunci ---------- */
  showLock: function () {
    document.getElementById('kNav').style.display = 'none';
    document.getElementById('kCartBar').innerHTML = '';
    var dc = LicCrypto.fmtDevice(this.deviceCode());
    document.getElementById('kPage').innerHTML =
      T('<div class="k-pinwrap"><div style="font-size:52px">☕</div>') +
      '<h3 style="margin:10px 0 4px">OGKasir</h3>' +
      T('<div class="k-small k-muted" style="margin-bottom:14px;text-align:center">Masa trial 7 hari telah berakhir.<br>Data kamu aman — aktifkan untuk lanjut.</div>') +
      '<div class="k-card" style="width:100%;max-width:360px">' +
      T('<div class="k-fld"><label>Kode Device — kirim ke penjual via WA</label>') +
      '<div class="k-row"><b style="font-size:19px;letter-spacing:2px">' + dc + '</b>' +
      T('<button class="k-chip" onclick="Lic.copyDevice()">📋 Salin</button></div></div>') +
      T('<div class="k-fld"><label>Kode Aktivasi</label>') +
      '<input class="k-in" id="kLicCode" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" ' +
      'style="text-transform:uppercase;letter-spacing:1px" autocomplete="off"></div>' +
      T('<button class="k-btn k-pri" onclick="Lic.doActivate()">🔓 Aktifkan</button>') +
      '</div>' +
      T('<div class="k-small k-muted" style="margin-top:12px">Belum punya kode? Hubungi penjual aplikasi ini.</div>') +
      '</div>';
    window.scrollTo(0, 0);
  },

  /* ---------- kartu di Pengaturan ---------- */
  licCard: function () {
    var st = this.status(), dc = LicCrypto.fmtDevice(this.deviceCode());
    var badge = st.state === 'trial'
      ? T('<span class="k-tag k-grn">Trial — ') + st.daysLeft + T(' hari lagi</span>')
      : (st.state === 'active'
        ? T('<span class="k-tag k-grn">Aktif sampai ') + K.fmtDate(st.expDays * 864e5) + '</span>'
        : '<span class="k-tag k-red">Kedaluwarsa</span>');
    var h = T('<div class="k-card"><h3>🔑 Lisensi</h3>') +
      '<div class="k-row" style="margin-bottom:10px"><div><b>Status</b></div>' + badge + '</div>' +
      T('<div class="k-row"><div class="k-small k-muted">Kode Device</div>') +
      '<div><b style="letter-spacing:2px">' + dc + '</b> ' +
      T('<button class="k-chip" onclick="Lic.copyDevice()">📋</button></div></div>') +
      T('<button class="k-btn k-sec" style="margin-top:10px" onclick="Lic.codeModal()">Masukkan Kode Aktivasi</button></div>');
    return h;
  },

  codeModal: function () {
    UI.openModal(T('<h3 class="k-sheet-t">🔑 Aktivasi Lisensi</h3>') +
      T('<div class="k-fld"><label>Kode Aktivasi</label>') +
      '<input class="k-in" id="kLicCode" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" ' +
      'style="text-transform:uppercase;letter-spacing:1px" autocomplete="off"></div>' +
      T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeModal()">Batal</button>') +
      '<button class="k-btn k-pri" onclick="Lic.doActivate()">Aktifkan</button></div>');
  }
};
