/* OGKasir - sistem lisensi: trial 7 hari + lisensi akun (server).
   Kode aktivasi perangkat SUDAH DIHAPUS (keputusan zgg 22 Okt 2026) —
   yang tersisa hanya verifikasi ulang lisensi perangkat lama yang sudah
   terlanjur aktif, agar pemiliknya tidak terkunci sampai masa berakhir. */
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

  /* Status gabungan: lisensi AKUN (cache lokal dari server) vs lisensi PERANGKAT.
     Yang aktif dipakai; bila dua-duanya aktif, yang masa berakhirnya paling jauh. */
  status: function () {
    var ds = this._deviceStatus();
    var as = null;
    try { if (typeof Account !== 'undefined' && Account.licStatusSync) as = Account.licStatusSync(); } catch (e) {}
    if (!as) return ds;
    if (as.state === 'active') {
      if (ds.state !== 'active') return as;
      if (!as.expDays) return as;               // akun unlimited
      if (!ds.expDays) return ds;
      return as.expDays >= ds.expDays ? as : ds;
    }
    if (ds.state === 'active') return ds;
    if (as.state === 'trial') {
      if (ds.state === 'expired') return as;
      if (ds.state === 'trial' && as.daysLeft >= ds.daysLeft) return as;
    }
    return ds;
  },

  _deviceStatus: function () {
    var lic = KDB.data.settings.lic || {}, now = Date.now(), today = this.todayDays();
    var tampered = lic.lastSeen && (now < lic.lastSeen - 864e5); // jam dimundurkan
    if (lic.expDays && lic.expDays >= today) {
      return { state: 'active', via: 'device', expDays: lic.expDays, daysLeft: lic.expDays - today };
    }
    if (!tampered) {
      var end = (lic.trialStart || now) + this.TRIAL_DAYS * 864e5;
      if (now < end) {
        return { state: 'trial', via: 'device', daysLeft: Math.max(1, Math.ceil((end - now) / 864e5)) };
      }
    }
    return { state: 'expired', via: 'device' };
  },

  valid: function () { return this.status().state !== 'expired'; },

  /* ---------- layar kunci ---------- */
  showLock: function () {
    document.getElementById('kNav').style.display = 'none';
    document.getElementById('kCartBar').innerHTML = '';
    document.getElementById('kPage').innerHTML =
      T('<div class="k-pinwrap"><div style="font-size:52px">☕</div>') +
      '<h3 style="margin:10px 0 4px">OGKasir</h3>' +
      T('<div class="k-small k-muted" style="margin-bottom:14px;text-align:center">Masa trial 7 hari telah berakhir.<br>Data kamu aman — masuk dengan akun untuk lanjut.</div>') +
      '<div class="k-card" style="width:100%;max-width:360px">' +
      T('<div class="k-small" style="margin-bottom:8px"><b>Lisensi OGKasir sekarang mengikuti akun.</b><br>Masuk untuk memakai lisensi akunmu di perangkat ini — data tokomu ikut tersinkron.</div>') +
      T('<button class="k-btn k-pri" onclick="Account.signInModal(true)">👤 Masuk dengan Akun</button></div>') +
      T('<div class="k-small k-muted" style="margin-top:12px;text-align:center">Belum punya akun atau mau perpanjang lisensi?<br>Hubungi FinOwi — aktivasinya langsung dari daftar akun, tanpa kode.</div>') +
      T('<button class="k-btn k-sec" style="margin-top:8px;width:100%;max-width:360px" onclick="UI.openLink(\'https://wa.me/6288279406268?text=Halo%20FinOwi,%20saya%20mau%20aktivasi%20lisensi%20akun%20OGKasir.\')">💬 Chat FinOwi</button>') +
      '</div>';
    window.scrollTo(0, 0);
  },

  /* ---------- kartu di Pengaturan ---------- */
  licCard: function () {
    var st = this.status();
    var badge = st.state === 'trial'
      ? T('<span class="k-tag k-grn">Trial — ') + st.daysLeft + T(' hari lagi</span>')
      : (st.state === 'active'
        ? (st.expDays
          ? T('<span class="k-tag k-grn">Aktif sampai ') + K.fmtDate(st.expDays * 864e5) + '</span>'
          : '<span class="k-tag k-grn">Aktif — Unlimited</span>')
        : '<span class="k-tag k-red">Kedaluwarsa</span>');
    var viaTxt = '';
    if (st.via === 'account') {
      viaTxt = T('<div class="k-row"><div class="k-small k-muted">Sumber lisensi</div><div class="k-small"><b>Akun OGKasir</b></div></div>');
    } else if (st.state === 'active') {
      viaTxt = T('<div class="k-row"><div class="k-small k-muted">Sumber lisensi</div><div class="k-small"><b>Perangkat (lisensi lama)</b></div></div>') +
        T('<p class="k-small k-muted" style="margin-top:8px">Lisensi lama dari kode aktivasi — tetap berlaku sampai masa berakhirnya. Perpanjangan berikutnya lewat lisensi akun.</p>');
    }
    return T('<div class="k-card"><h3>🔑 Lisensi</h3>') +
      '<div class="k-row" style="margin-bottom:6px"><div><b>Status</b></div>' + badge + '</div>' + viaTxt +
      '</div>';
  }
};
