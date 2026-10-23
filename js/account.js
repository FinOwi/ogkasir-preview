/* OGKasir - Akun (Supabase Auth) + Lisensi Berbasis Akun.
   Token sesi disimpan di localStorage TERPISAH (kasirku_auth_v1) — tidak pernah
   masuk KDB, jadi tidak ikut ter-backup, ter-sync, atau ter-export.
   Backend: tabel account_* + RPC di supabase-account-sync.sql (RLS per pemilik). */
var Account = {
  SKEY: 'kasirku_auth_v1',
  LKEY: 'kasirku_acct_lic_v1',
  session: null,   // {access_token, refresh_token, expires_at, user:{id,email}}
  profile: null,   // baris account_profiles
  license: null,   // baris account_licenses (atau {status:'none'})
  devInfo: null,   // {device_count, max_devices} hasil register perangkat
  devError: '',    // mis. 'device_limit'
  _fromLock: false,

  url: function () { return Cloud.supaUrl(); },
  anon: function () { return Cloud.supaAnon(); },

  /* ---------- sesi lokal ---------- */
  init: function () {
    try {
      var raw = localStorage.getItem(this.SKEY);
      if (raw) this.session = JSON.parse(raw);
    } catch (e) { this.session = null; }
    this.loadLicCache();
    // sesi masih ada + online -> segarkan lisensi & perangkat di latar
    if (this.session && typeof navigator !== 'undefined' && navigator.onLine !== false) {
      this.afterSignIn(true).catch(function () {});
    }
  },
  saveSession: function () {
    try {
      if (this.session) localStorage.setItem(this.SKEY, JSON.stringify(this.session));
      else localStorage.removeItem(this.SKEY);
    } catch (e) {}
  },
  signedIn: function () { return !!(this.session && this.session.user); },
  email: function () { return this.session && this.session.user ? (this.session.user.email || '') : ''; },
  userId: function () { return this.session && this.session.user ? this.session.user.id : ''; },

  loadLicCache: function () {
    try {
      var raw = localStorage.getItem(this.LKEY);
      if (raw) this.license = JSON.parse(raw).license || null;
    } catch (e) {}
  },
  saveLicCache: function () {
    try {
      localStorage.setItem(this.LKEY, JSON.stringify({ license: this.license, fetched_at: Date.now() }));
    } catch (e) {}
  },

  /* ---------- HTTP ---------- */
  _req: function (path, opts) {
    opts = opts || {};
    var token = (opts.auth !== false && this.session && this.session.access_token)
      ? this.session.access_token : this.anon();
    var headers = {
      'apikey': this.anon(),
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    };
    if (opts.headers) for (var k in opts.headers) headers[k] = opts.headers[k];
    return fetch(this.url() + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.text().then(function (txt) {
        var j = null;
        try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
        if (!r.ok) {
          var msg = (j && (j.msg || j.message || j.error_description || j.error)) || ('HTTP ' + r.status);
          var err = new Error(msg);
          err.status = r.status;
          err.code = (j && (j.code || j.error)) || '';
          err.body = j;
          throw err;
        }
        return j;
      });
    });
  },

  _refresh: function () {
    var self = this;
    if (!this.session || !this.session.refresh_token) return Promise.reject(new Error('no_session'));
    return this._req('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', auth: false,
      body: { refresh_token: this.session.refresh_token }
    }).then(function (j) {
      self._setSession(j);
      return j;
    });
  },

  _setSession: function (j) {
    this.session = {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: Date.now() + (j.expires_in || 3600) * 1000,
      user: { id: j.user.id, email: j.user.email }
    };
    this.saveSession();
  },

  /* request yang butuh login; refresh token bila perlu / saat 401 */
  authed: function (path, opts) {
    var self = this;
    if (!this.session) return Promise.reject(new Error('not_signed_in'));
    var go = function () { return self._req(path, opts); };
    var pre = Promise.resolve();
    if (this.session.expires_at && Date.now() > this.session.expires_at - 60000) {
      pre = this._refresh().catch(function () {});
    }
    return pre.then(go).catch(function (e) {
      if (e && e.status === 401) return self._refresh().then(go);
      throw e;
    });
  },

  /* ---------- Auth ---------- */
  signUp: function (email, password, name) {
    var self = this;
    var sbody = { email: email, password: password };
    if (name) sbody.data = { display_name: name };
    return this._req('/auth/v1/signup', {
      method: 'POST', auth: false,
      body: sbody
    }).then(function (j) {
      if (j && j.access_token && j.user) {
        self._setSession(j);
        return self.afterSignIn(false).then(function () { return { ok: true }; });
      }
      return { ok: true, needsConfirm: true };
    });
  },

  signIn: function (email, password) {
    var self = this;
    return this._req('/auth/v1/token?grant_type=password', {
      method: 'POST', auth: false,
      body: { email: email, password: password }
    }).then(function (j) {
      self._setSession(j);
      return self.afterSignIn(false).then(function () { return { ok: true }; });
    });
  },

  afterSignIn: function (silent) {
    var self = this;
    return this.fetchProfile()
      .then(function () { return self._applyPendingName(); })
      .then(function () { return self.fetchLicense(); })
      .then(function () { return self.registerDevice(); })
      .then(function () {
        if (!silent && typeof Sync !== 'undefined' && Sync.onSignedIn) Sync.onSignedIn();
        return true;
      });
  },

  /* nama dari form daftar -> simpan ke profil setelah sesi terbentuk */
  _pendingName: null,
  _applyPendingName: function () {
    var self = this, nm = this._pendingName;
    this._pendingName = null;
    if (!nm || !this.profile || !this.userId()) return Promise.resolve(false);
    if ((this.profile.display_name || '') === nm) return Promise.resolve(false);
    this.profile.display_name = nm;
    return this.authed('/rest/v1/account_profiles?user_id=eq.' + this.userId(), {
      method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
      body: { display_name: nm }
    }).then(function () { return true; }).catch(function () { return false; });
  },

  signOut: function () {
    var self = this;
    var done = function () {
      self.session = null; self.profile = null; self.license = null; self.devInfo = null;
      self.saveSession();
      try { localStorage.removeItem(self.LKEY); } catch (e) {}
    };
    if (!this.session) { done(); return Promise.resolve(true); }
    return this._req('/auth/v1/logout', { method: 'POST' }).then(function () { done(); return true; })
      .catch(function () { done(); return true; });
  },

  resetPassword: function (email) {
    return this._req('/auth/v1/recover', { method: 'POST', auth: false, body: { email: email } })
      .then(function () { return { ok: true }; });
  },

  /* Verifikasi kode OTP 6 digit dari email (type: signup | email | recovery).
     Alternatif klik link — kode menghindari masalah redirect di HP. */
  verifyOtp: function (type, email, token) {
    var self = this;
    return this._req('/auth/v1/verify', {
      method: 'POST', auth: false,
      body: { type: type, email: email, token: String(token || '').trim() }
    }).then(function (j) {
      self._setSession(j);
      return self.afterSignIn(false).then(function () { return { ok: true }; });
    });
  },

  resendCode: function (ctx) {
    if (ctx.type === 'signup') {
      return this._req('/auth/v1/resend', { method: 'POST', auth: false, body: { type: 'signup', email: ctx.email } });
    }
    if (ctx.type === 'recovery') return this.resetPassword(ctx.email);
    return this._req('/auth/v1/otp', { method: 'POST', auth: false, body: { email: ctx.email, create_user: false } });
  },

  /* Minta kode masuk via email (tanpa password) */
  signInOtp: function (email) {
    return this._req('/auth/v1/otp', { method: 'POST', auth: false, body: { email: email, create_user: false } })
      .then(function () { return { ok: true }; });
  },

  /* Ganti email login (perlu konfirmasi dari email baru, kadang juga email lama) */
  updateEmail: function (newEmail) {
    return this.authed('/auth/v1/user', { method: 'PUT', body: { email: newEmail } })
      .then(function () { return { ok: true }; });
  },

  /* ---------- Data akun ---------- */
  fetchProfile: function () {
    var self = this;
    return this.authed('/rest/v1/account_profiles?select=*').then(function (rows) {
      if (rows && rows.length) {
        self.profile = rows[0];
        // email profil mengikuti email login (setelah ganti email terkonfirmasi)
        if (self.profile.email && self.email() && self.profile.email !== self.email()) {
          self.profile.email = self.email();
          self.authed('/rest/v1/account_profiles?user_id=eq.' + self.userId(), {
            method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
            body: { email: self.email() }
          }).catch(function () {});
        }
        return self.profile;
      }
      // profil belum ada (trigger server gagal) -> buat sendiri
      return self.authed('/rest/v1/account_profiles', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: { user_id: self.userId(), email: self.email() }
      }).then(function (rows2) {
        self.profile = (rows2 && rows2[0]) || { user_id: self.userId(), email: self.email() };
        return self.profile;
      });
    }).catch(function () { return null; });
  },

  fetchLicense: function () {
    var self = this;
    return this.authed('/rest/v1/account_licenses?select=status,plan_label,starts_at,expires_at,max_devices,source,updated_at')
      .then(function (rows) {
        self.license = (rows && rows.length) ? rows[0] : { status: 'none' };
        self.saveLicCache();
        return self.license;
      });
  },

  deviceHash: function () { return LicCrypto.sha256(Lic.rawDeviceId()); },
  platform: function () { return Lic.rawDeviceId().indexOf('and:') === 0 ? 'android' : 'web'; },
  deviceLabel: function () {
    var base = this.platform() === 'android' ? 'Android' : 'Web Preview';
    try {
      if (window.KasirKuNative && KasirKuNative.deviceLabel) return KasirKuNative.deviceLabel();
    } catch (e) {}
    return base;
  },

  registerDevice: function () {
    var self = this;
    return this.authed('/rest/v1/rpc/account_register_device', {
      method: 'POST',
      body: { p_device_hash: this.deviceHash(), p_label: this.deviceLabel(), p_platform: this.platform() }
    }).then(function (j) {
      self.devInfo = j; self.devError = '';
      return j;
    }).catch(function (e) {
      self.devError = (e && e.message) || '';
      return null;
    });
  },

  pushFeedback: function (entry) {
    if (!this.signedIn()) return Promise.resolve(false);
    return this.authed('/rest/v1/feedback_inbox', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: {
        user_id: this.userId(), category: entry.category, message: entry.message,
        contact: entry.contact || null, shop_name: (KDB.data.settings.shop || null)
      }
    }).then(function () { return true; }).catch(function () { return false; });
  },

  /* ---------- Status lisensi akun (sinkron, dari cache) untuk Lic.status ---------- */
  licStatusSync: function () {
    var l = this.license;
    if (!l) return null;
    var now = Date.now();
    if (l.status === 'active') {
      if (!l.expires_at) return { state: 'active', via: 'account', expDays: null, daysLeft: null };
      var expMs = Date.parse(l.expires_at);
      if (expMs > now) {
        return { state: 'active', via: 'account',
          expDays: Math.floor(expMs / 864e5),
          daysLeft: Math.ceil((expMs - now) / 864e5) };
      }
      return null; // kedaluwarsa di server -> biar status perangkat yang bicara
    }
    if (l.status === 'trial' && l.expires_at) {
      var tMs = Date.parse(l.expires_at);
      if (tMs > now) return { state: 'trial', via: 'account', daysLeft: Math.ceil((tMs - now) / 864e5) };
    }
    return null;
  },

  /* ---------- Pesan error ramah ---------- */
  errMsg: function (e) {
    var m = (e && e.message) || 'Gagal menghubungi server';
    if (/device_limit/i.test(m)) return T('Perangkat akun sudah penuh — cabut perangkat lama atau tambah slot lisensi.');
    if (/Invalid login credentials/i.test(m)) return T('Email atau password salah.');
    if (/Email not confirmed/i.test(m)) return T('Email belum diverifikasi — masukkan kode verifikasi dari email kamu.');
    if (/Signups not allowed|signup.*disabled/i.test(m)) return T('Pendaftaran mandiri belum dibuka. Hubungi admin FinOwi via WhatsApp untuk dibuatkan akun.');
    if (/User already registered/i.test(m)) return T('Email ini sudah terdaftar — langsung masuk saja.');
    if (/Password should be/i.test(m)) return T('Password terlalu lemah — minimal 6 karakter.');
    if (/token has expired|otp.*(expired|invalid)|invalid.*token/i.test(m)) return T('Kode salah atau sudah kedaluwarsa — minta kode baru lewat Kirim Ulang.');
    if (/email.*rate limit|over_email_send/i.test(m)) return T('Terlalu banyak email dikirim — tunggu beberapa menit lalu coba lagi.');
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return T('Tidak bisa hubungi server — cek koneksi internet.');
    return m;
  },

  /* ---------- UI: masuk / daftar (panel brand + kartu form) ---------- */
  _authDraft: {},
  _eyeSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  _eyeOffSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.5 9.5 0 0 1 12 4c6.5 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.61 6.61C4.4 8.05 2 12 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/></svg>',

  togglePw: function (btn) {
    var inp = btn.parentNode.querySelector('input');
    if (!inp) return;
    var show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    btn.innerHTML = show ? this._eyeSvg : this._eyeOffSvg;
  },

  signInModal: function (fromLock) {
    this._fromLock = !!fromLock;
    this._authDraft = {};
    UI.openModal(this._authHtml('in'));
  },

  _authHtml: function (view) {
    var d = this._authDraft || {};
    var isIn = view === 'in';
    var hero = isIn
      ? '<h3>' + T('Selamat Datang Kembali!') + '</h3><p>' + T('Hai! Senang bertemu lagi — masuk untuk mengelola tokomu di semua perangkat.') + '</p>'
      : '<h3>' + T('Buat Akun Baru') + '</h3><p>' + T('Isi data di bawah untuk mendaftar — satu akun untuk semua perangkat tokomu.') + '</p>';
    var nameFld = isIn ? '' :
      '<div class="k-au-fld"><label>' + T('Nama') + '</label>' +
      '<input class="k-au-in" id="accName" type="text" autocomplete="name" placeholder="' + T('cth. Budi Santoso') + '" value="' + K.esc(d.name || '') + '"></div>';
    var agree = isIn ? '' :
      '<label class="k-au-agree"><input type="checkbox" id="accTerms"' + (d.terms ? ' checked' : '') + '><span>' + T('Saya setuju dengan ') +
      '<button type="button" class="k-au-link" onclick="Account.termsModal(event)">Syarat &amp; Ketentuan</button> OGKasir.</span></label>';
    var forgot = isIn ? '<button type="button" class="k-au-link k-au-forgot" onclick="Account.doReset()">' + T('Lupa Password?') + '</button>' : '';
    var mainBtn = isIn
      ? '<button class="k-au-btn" onclick="Account.doSignIn()">' + T('Masuk') + '</button>'
      : '<button class="k-au-btn" onclick="Account.doSignUp()">' + T('Daftar Sekarang') + '</button>';
    var otpBtn = isIn
      ? '<div class="k-au-or">' + T('atau') + '</div>' +
        '<button class="k-au-btn soft" onclick="Account.doOtpLogin()">📩 ' + T('Masuk pakai kode email') + '</button>' : '';
    var sw = isIn
      ? T('Belum punya akun?') + ' <button type="button" class="k-au-link" onclick="Account.authTab(\'up\')">' + T('Daftar') + '</button>'
      : T('Sudah punya akun?') + ' <button type="button" class="k-au-link" onclick="Account.authTab(\'in\')">' + T('Masuk') + '</button>';
    return '<div class="k-auth">' +
      '<div class="k-auth-hero"><img src="img/logo.png" alt="OGKasir">' + hero + '</div>' +
      '<div class="k-auth-body"><div class="k-auth-card">' +
      '<div class="k-auth-tabs"><button type="button" class="' + (isIn ? 'on' : '') + '" onclick="Account.authTab(\'in\')">' + T('Masuk') + '</button>' +
      '<button type="button" class="' + (!isIn ? 'on' : '') + '" onclick="Account.authTab(\'up\')">' + T('Daftar') + '</button></div>' +
      nameFld +
      '<div class="k-au-fld"><label>Email</label>' +
      '<input class="k-au-in" id="accEmail" type="email" autocomplete="email" placeholder="email@contoh.com" value="' + K.esc(d.email || '') + '"></div>' +
      '<div class="k-au-fld"><label>Password</label><div class="k-au-pw">' +
      '<input class="k-au-in" id="accPass" type="password" autocomplete="' + (isIn ? 'current-password' : 'new-password') + '" placeholder="••••••••" value="' + K.esc(d.pass || '') + '">' +
      '<button type="button" class="k-au-eye" onclick="Account.togglePw(this)" aria-label="Lihat password">' + this._eyeOffSvg + '</button></div></div>' +
      forgot + agree +
      '<div id="accErr"></div>' +
      mainBtn + otpBtn +
      '<div class="k-au-switch">' + sw + '</div>' +
      (this._gateMode ? '' :
        '<div class="k-au-switch" style="margin-top:8px"><button type="button" class="k-au-link" style="color:var(--muted)" onclick="UI.closeModal()">' + T('Nanti Saja') + '</button></div>') +
      '</div></div></div>';
  },

  authTab: function (view) {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
    var t = document.getElementById('accTerms');
    this._authDraft = {
      name: g('accName'), email: g('accEmail'), pass: g('accPass'),
      terms: t ? t.checked : (this._authDraft || {}).terms
    };
    if (this._gateMode) {
      document.getElementById('kGate').innerHTML = this._authHtml(view);
      window.scrollTo(0, 0);
    } else {
      UI.openModal(this._authHtml(view));
    }
  },

  termsModal: function (ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (ev && ev.stopPropagation) ev.stopPropagation();
    UI.openModal('<div class="k-auth-plain">' +
      T('<h3 class="k-sheet-t">📜 Syarat & Ketentuan OGKasir</h3>') +
      T('<p class="k-small" style="line-height:1.75">• Akun OGKasir dipakai untuk lisensi &amp; sinkronisasi data tokomu, maksimal 3 perangkat per akun.<br>• Kamu bertanggung jawab menjaga kerahasiaan password akunmu.<br>• Data toko yang tersinkron tersimpan aman di server dan hanya bisa diakses akunmu.<br>• Lisensi mengikuti masa berlaku paket yang kamu beli; penggunaan di luar ketentuan dapat membuat lisensi ditangguhkan.<br>• Aplikasi tetap bisa dipakai offline — akun hanya perlu internet saat masuk &amp; sinkronisasi.</p>') +
      '<button class="k-au-btn" onclick="Account.authTab(\'up\')">' + T('Mengerti') + '</button></div>');
  },

  _err: function (msg) {
    var el = document.getElementById('accErr');
    if (el) el.innerHTML = '<div class="k-alert">' + K.esc(msg) + '</div>';
    else UI.toast(msg);
  },
  _creds: function () {
    var em = (document.getElementById('accEmail').value || '').trim();
    var pw = document.getElementById('accPass').value || '';
    if (!em || em.indexOf('@') < 0) { this._err(T('Isi email yang benar dulu.')); return null; }
    if (pw.length < 6) { this._err(T('Password minimal 6 karakter.')); return null; }
    return { email: em, password: pw };
  },

  doSignIn: function () {
    var c = this._creds(); if (!c) return;
    var self = this;
    UI.toast(T('Menghubungi server...'));
    this.signIn(c.email, c.password).then(function () {
      UI.closeModal();
      UI.toast(T('Selamat datang, ') + self.email() + ' 👋');
      self._afterAuthUI();
    }).catch(function (e) {
      if (/Email not confirmed/i.test((e && e.message) || '')) {
        // akun belum terverifikasi -> langsung antar ke panel kode
        self.codeModal({ type: 'signup', email: c.email });
        UI.toast(T('Akunmu belum terverifikasi — masukkan kode dari email.'));
        return;
      }
      self._err(self.errMsg(e));
    });
  },

  doSignUp: function () {
    var c = this._creds(); if (!c) return;
    var t = document.getElementById('accTerms');
    if (t && !t.checked) { this._err(T('Centang dulu persetujuan Syarat & Ketentuan.')); return; }
    var nmEl = document.getElementById('accName');
    var nm = nmEl ? (nmEl.value || '').trim() : '';
    this._pendingName = nm || null;
    var self = this;
    UI.toast(T('Mendaftarkan akun...'));
    this.signUp(c.email, c.password, nm || null).then(function (r) {
      if (r && r.needsConfirm) {
        self.codeModal({ type: 'signup', email: c.email });
      } else {
        UI.closeModal();
        UI.toast(T('Akun aktif — selamat datang! 🎉'));
        self._afterAuthUI();
      }
    }).catch(function (e) { self._err(self.errMsg(e)); });
  },

  doReset: function () {
    var em = (document.getElementById('accEmail').value || '').trim();
    if (!em || em.indexOf('@') < 0) { this._err(T('Isi email dulu, lalu ketuk Lupa Password.')); return; }
    var self = this;
    this.resetPassword(em).then(function () {
      self.codeModal({ type: 'recovery', email: em });
    }).catch(function (e) { self._err(self.errMsg(e)); });
  },

  doOtpLogin: function () {
    var em = (document.getElementById('accEmail').value || '').trim();
    if (!em || em.indexOf('@') < 0) { this._err(T('Isi email dulu, lalu ketuk tombol kode email.')); return; }
    var self = this;
    UI.toast(T('Mengirim kode ke email...'));
    this.signInOtp(em).then(function () {
      self.codeModal({ type: 'email', email: em });
    }).catch(function (e) { self._err(self.errMsg(e)); });
  },

  /* ---------- modal kode verifikasi ---------- */
  _vctx: null,
  codeModal: function (ctx) {
    this._vctx = ctx;
    var label = ctx.type === 'signup' ? T('mengonfirmasi pendaftaran')
      : ctx.type === 'recovery' ? T('mengatur ulang password') : T('masuk ke akunmu');
    var boxes = '';
    for (var i = 0; i < 6; i++) {
      boxes += '<input inputmode="numeric" autocomplete="' + (i === 0 ? 'one-time-code' : 'off') + '" maxlength="1" ' +
        'oninput="Account.otpInput(this)" onkeydown="Account.otpKey(event,this)"' + (i === 0 ? ' onpaste="Account.otpPaste(event)"' : '') + '>';
    }
    UI.openModal(
      '<div class="k-auth-plain">' +
      T('<h3 class="k-sheet-t" style="text-align:center">📩 Kode Verifikasi</h3>') +
      '<p class="k-small k-muted" style="text-align:center">' + T('Masukkan kode 6 digit yang kami kirim ke ') + '<b>' + K.esc(ctx.email) + '</b> ' +
      T('untuk ') + label + '.</p>' +
      '<div class="k-au-otp" id="accOtpBoxes">' + boxes + '</div>' +
      '<div id="accErr"></div>' +
      '<button class="k-au-btn" onclick="Account.doVerifyCode()">' + T('Verifikasi') + '</button>' +
      '<p class="k-au-switch">' + T('Tidak menerima kode? ') + '<button type="button" class="k-au-link" onclick="Account.doResendCode()">' + T('Kirim ulang kode') + '</button></p>' +
      '<p class="k-au-switch" style="margin-top:6px"><button type="button" class="k-au-link" style="color:var(--muted)" onclick="UI.closeModal()">' + T('Nanti Saja') + '</button></p>' +
      T('<p class="k-small k-muted" style="margin-top:10px">Salah ketik email? Kode tidak akan sampai ke email yang salah. Tutup ini, lalu daftar ulang dengan email yang benar — akun salah ketik tidak aktif tanpa verifikasi, aman diabaikan.</p>') +
      '</div>');
    setTimeout(function () {
      var b = document.querySelector('#accOtpBoxes input');
      if (b) b.focus();
    }, 80);
  },

  otpInput: function (el) {
    el.value = (el.value || '').replace(/\D/g, '').slice(-1);
    if (el.value && el.nextElementSibling) el.nextElementSibling.focus();
  },
  otpKey: function (e, el) {
    if (e.key === 'Backspace' && !el.value && el.previousElementSibling) {
      el.previousElementSibling.value = '';
      el.previousElementSibling.focus();
      e.preventDefault();
    }
  },
  otpPaste: function (e) {
    e.preventDefault();
    var cd = e.clipboardData || window.clipboardData;
    var txt = ((cd && cd.getData('text')) || '').replace(/\D/g, '').slice(0, 6);
    var boxes = document.querySelectorAll('#accOtpBoxes input');
    for (var i = 0; i < boxes.length; i++) boxes[i].value = txt[i] || '';
    var last = Math.min(Math.max(txt.length - 1, 0), 5);
    if (boxes[last]) boxes[last].focus();
  },
  otpValue: function () {
    var boxes = document.querySelectorAll('#accOtpBoxes input'), v = '';
    for (var i = 0; i < boxes.length; i++) v += boxes[i].value || '';
    return v.trim();
  },

  doVerifyCode: function () {
    var ctx = this._vctx;
    if (!ctx) { UI.closeModal(); return; }
    var tok = this.otpValue();
    if (!/^\d{6}$/.test(tok)) { this._err(T('Kode harus 6 digit angka.')); return; }
    var self = this;
    this.verifyOtp(ctx.type, ctx.email, tok).then(function () {
      var wasRecovery = ctx.type === 'recovery';
      self._vctx = null;
      UI.closeModal();
      if (wasRecovery) {
        UI.toast(T('Kode benar! Buat password barumu.'));
        self.newPasswordModal();
      } else {
        UI.toast(T('Berhasil masuk — selamat datang! 👋'));
        self._afterAuthUI();
      }
    }).catch(function (e) { self._err(self.errMsg(e)); });
  },

  doResendCode: function () {
    if (!this._vctx) return;
    var self = this;
    this.resendCode(this._vctx).then(function () {
      UI.toast(T('Kode baru dikirim — cek inbox/spam.'));
    }).catch(function (e) { self._err(self.errMsg(e)); });
  },

  newPasswordModal: function () {
    UI.openModal('<div class="k-auth-plain">' +
      T('<h3 class="k-sheet-t">🔑 Buat Password Baru</h3>') +
      '<div class="k-au-fld"><label>' + T('Password baru') + '</label><div class="k-au-pw">' +
      '<input class="k-au-in" id="accNewPass" type="password" autocomplete="new-password" placeholder="' + T('Minimal 6 karakter') + '">' +
      '<button type="button" class="k-au-eye" onclick="Account.togglePw(this)" aria-label="Lihat password">' + this._eyeOffSvg + '</button></div></div>' +
      '<div id="accErr"></div>' +
      '<button class="k-au-btn" onclick="Account.doSetNewPassword()">' + T('Simpan Password') + '</button>' +
      '<p class="k-au-switch"><button type="button" class="k-au-link" style="color:var(--muted)" onclick="UI.closeModal()">' + T('Nanti Saja') + '</button></p></div>');
  },

  doSetNewPassword: function () {
    var pw = document.getElementById('accNewPass').value || '';
    if (pw.length < 6) { this._err(T('Password minimal 6 karakter.')); return; }
    var self = this;
    this.authed('/auth/v1/user', { method: 'PUT', body: { password: pw } }).then(function () {
      UI.closeModal();
      UI.toast(T('Password baru tersimpan ✅'));
      self._afterAuthUI();
    }).catch(function (e) { self._err(self.errMsg(e)); });
  },

  /* ---------- ganti email ---------- */
  changeEmailModal: function () {
    UI.openModal('<div class="k-auth-plain">' +
      T('<h3 class="k-sheet-t">✉️ Ganti Email Login</h3>') +
      '<p class="k-small k-muted">' + T('Email sekarang: ') + '<b>' + K.esc(this.email()) + '</b>. ' +
      T('Konfirmasi akan dikirim ke email baru (kadang juga ke email lama). Setelah terkonfirmasi, masuk lagi dengan email baru — password tetap sama.') + '</p>' +
      '<div class="k-au-fld"><label>' + T('Email baru') + '</label>' +
      '<input class="k-au-in" id="accNewEmail" type="email" autocomplete="email" placeholder="email-baru@contoh.com"></div>' +
      '<div id="accErr"></div>' +
      '<button class="k-au-btn" onclick="Account.doChangeEmail()">' + T('Minta Konfirmasi') + '</button>' +
      '<p class="k-au-switch"><button type="button" class="k-au-link" style="color:var(--muted)" onclick="UI.closeModal()">' + T('Batal') + '</button></p></div>');
  },

  doChangeEmail: function () {
    var em = (document.getElementById('accNewEmail').value || '').trim();
    if (!em || em.indexOf('@') < 0) { this._err(T('Isi email baru yang benar dulu.')); return; }
    var self = this;
    this.updateEmail(em).then(function () {
      UI.closeModal();
      UI.toast(T('Cek email baru ') + em + T(' untuk konfirmasi ganti email.'));
    }).catch(function (e) { self._err(self.errMsg(e)); });
  },

  _afterAuthUI: function () {
    if (this._gateMode) { Gate.showShop(); return; }
    if (this._fromLock) {
      this._fromLock = false;
      if (Lic.valid()) { if (App._booted) App.rerender(); else App.boot(); }
      else UI.toast(T('Akun masuk, tapi lisensi akun belum aktif — hubungi FinOwi untuk aktivasi.'));
      return;
    }
    if (App._booted) App.rerender();
  },

  doSignOut: function () {
    var self = this;
    UI.confirm(T('Keluar dari akun di perangkat ini? Data toko di perangkat ini TIDAK ikut terhapus.'), T('Keluar'), function () {
      self.signOut().then(function () {
        UI.toast(T('Sudah keluar dari akun.'));
        if (App._booted) App.rerender();
      });
    });
  },

};

/* =====================================================================
   Gate — gerbang pengguna baru (keputusan zgg 22 Okt 2026):
   install baru WAJIB masuk/daftar dulu, lalu isi informasi toko.
   Pengguna lama (sudah ada transaksi / nama toko sudah diganti /
   sudah pernah masuk) tidak diganggu — ditandai grandfathered.
   ===================================================================== */
var Gate = {
  KEY: 'kasirku_gate_v1',

  needed: function () {
    /* Mode demo (preview web): pengunjung langsung mencoba tanpa wajib masuk.
       Flag disuntikkan khusus build preview oleh preview-push.sh — APK tidak terpengaruh. */
    if (typeof window !== 'undefined' && window.OGK_DEMO) return false;
    try { if (localStorage.getItem(this.KEY)) return false; } catch (e) {}
    if (typeof Account !== 'undefined' && Account.session) { this._mark('done'); return false; }
    var d = (typeof KDB !== 'undefined' && KDB.data) || {};
    var s = d.settings || {};
    var fresh = (!d.txs || d.txs.length === 0) &&
      (s.shop || 'Warkop Saya') === 'Warkop Saya' && !s.accountEmail;
    if (!fresh) { this._mark('grandfathered'); return false; }
    return true;
  },
  _mark: function (v) { try { localStorage.setItem(this.KEY, v); } catch (e) {} },

  show: function () {
    Account._gateMode = true;
    Account._authDraft = {};
    var el = document.getElementById('kGate');
    el.innerHTML = Account._authHtml('in');
    el.classList.remove('k-hidden');
    window.scrollTo(0, 0);
  },

  _err: function (msg) {
    var el = document.getElementById('gateErr');
    if (el) el.innerHTML = '<div class="k-alert">' + K.esc(msg) + '</div>';
    else UI.toast(msg);
  },

  showShop: function () {
    var s = KDB.data.settings || {};
    var p = Account.profile || {};
    var vShop = p.shop_name || ((s.shop && s.shop !== 'Warkop Saya') ? s.shop : '');
    var vName = p.display_name || s.userName || '';
    var vPhone = p.phone || s.phone || '';
    var vAddr = p.shop_address || s.addr || '';
    var vType = p.shop_type || s.shopType || '';
    var types = ['Warkop', 'Café / Kedai Kopi', 'Rumah Makan', 'Toko Kelontong', 'Jajanan / Street Food', 'Lainnya'];
    var opts = '<option value="">— ' + T('Pilih jenis usaha') + ' —</option>';
    for (var i = 0; i < types.length; i++) {
      opts += '<option value="' + K.esc(types[i]) + '"' + (types[i] === vType ? ' selected' : '') + '>' + K.esc(types[i]) + '</option>';
    }
    var el = document.getElementById('kGate');
    el.innerHTML =
      '<div class="k-gate-wrap"><div class="k-gate-card">' +
      '<div class="k-gate-logo"><img src="img/logo.png" alt="OGKasir"><span class="bdg">✓</span></div>' +
      '<h3 class="k-gate-t">' + T('Informasi Toko') + '</h3>' +
      '<p class="k-gate-sub">' + T('Satu langkah lagi — data ini tampil di struk pelanggan & akunmu.') + '</p>' +
      '<div class="k-au-fld"><label>' + T('Nama toko') + ' *</label>' +
      '<input class="k-au-in" id="gShop" type="text" placeholder="' + T('cth. Warkop Berkah') + '" value="' + K.esc(vShop) + '"></div>' +
      '<div class="k-au-fld"><label>' + T('Nama pemilik') + ' *</label>' +
      '<input class="k-au-in" id="gName" type="text" autocomplete="name" placeholder="' + T('cth. Budi Santoso') + '" value="' + K.esc(vName) + '"></div>' +
      '<div class="k-au-fld"><label>' + T('Nomor WhatsApp') + ' *</label>' +
      '<input class="k-au-in" id="gPhone" type="tel" autocomplete="tel" placeholder="08xxxxxxxxxx" value="' + K.esc(vPhone) + '"></div>' +
      '<div class="k-au-fld"><label>' + T('Alamat toko') + '</label>' +
      '<textarea class="k-au-in" id="gAddr" rows="2" placeholder="' + T('cth. Jl. Merdeka No. 10, Medan') + '">' + K.esc(vAddr) + '</textarea></div>' +
      '<div class="k-au-fld"><label>' + T('Jenis usaha') + '</label>' +
      '<select class="k-au-in" id="gType">' + opts + '</select></div>' +
      '<div id="gateErr"></div>' +
      '<button class="k-au-btn" onclick="Gate.saveShop()">' + T('Simpan & Mulai Jualan') + '</button>' +
      '</div></div>';
    el.classList.remove('k-hidden');
    window.scrollTo(0, 0);
  },

  saveShop: function () {
    var g = function (id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; };
    var shop = g('gShop'), name = g('gName'), phone = g('gPhone'), addr = g('gAddr'), type = g('gType');
    if (!shop) { this._err(T('Nama toko wajib diisi.')); return; }
    if (!name) { this._err(T('Nama pemilik wajib diisi.')); return; }
    var digits = phone.replace(/\D/g, '');
    if (digits.length < 9) { this._err(T('Nomor WhatsApp wajib diisi dengan benar (min. 9 digit).')); return; }

    var s = KDB.data.settings;
    s.shop = shop; s.userName = name; s.phone = phone; s.addr = addr; s.shopType = type;
    var ow = (typeof KDB.employeeById === 'function') ? KDB.employeeById('emp-owner') : null;
    if (ow) ow.name = name;
    KDB.save();
    try { App.renderHeader(); } catch (e) {}

    var self = this;
    var finish = function () {
      self._mark('done');
      Account._gateMode = false;
      var el = document.getElementById('kGate');
      el.classList.add('k-hidden');
      el.innerHTML = '';
      UI.toast(T('Selamat datang di OGKasir, ') + shop + ' 🎉');
      App._continueBoot();
    };
    if (Account.userId && Account.userId()) {
      Account.authed('/rest/v1/account_profiles?user_id=eq.' + Account.userId(), {
        method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
        body: { display_name: name, shop_name: shop, phone: phone, shop_address: addr, shop_type: type }
      }).then(function () {
        if (Account.profile) {
          Account.profile.display_name = name; Account.profile.shop_name = shop;
          Account.profile.phone = phone; Account.profile.shop_address = addr; Account.profile.shop_type = type;
        }
        finish();
      }).catch(function () { finish(); });
    } else finish();
  }
};
