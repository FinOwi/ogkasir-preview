/* OGKasir - init & router */
var App = {
  page: 'kasir',
  unlocked: false,
  pinBuf: '',
  _switchCashier: null,

  init: function () {
    Splash.show();
    KDB.load();
    try { Account.init(); } catch (e) {}
    try { Sync.init(); } catch (e) {}
    I18N.setLang(KDB.data.settings.lang);
    this.applyTheme();
    this.startClock();
    this.renderHeader();
    var fp = document.getElementById('kFilePick');
    fp.addEventListener('change', function () {
      if (!fp.files || !fp.files[0]) return;
      var rd = new FileReader();
      rd.onload = function () { AppSet.doRestore(rd.result); fp.value = ''; };
      rd.readAsText(fp.files[0]);
    });
    // Gerbang pengguna baru: wajib masuk/daftar + isi informasi toko dulu
    if (typeof Gate !== 'undefined' && Gate.needed()) {
      Splash.hide();
      Gate.show();
      return;
    }
    this._continueBoot();
  },

  _continueBoot: function () {
    Lic.init();
    if (!Lic.valid()) { Lic.showLock(); Splash.hide(); return; }
    Printer.init();
    this.boot();
    Splash.hide();
  },

  /* Peta halaman -> kunci hak karyawan (S4, audit 30 Okt 2026).
     Halaman Order mengikuti 'kasir' (order lahir dari alur kasir). */
  PAGE_PERM: { kasir: 'kasir', menu: 'menu', stok: 'stok', laporan: 'laporan', set: 'dashboard', order: 'kasir' },
  pagePerm: function (p) { return this.PAGE_PERM[p] || null; },
  firstAllowedPage: function () {
    var order = ['kasir', 'menu', 'stok', 'laporan', 'set'];
    for (var i = 0; i < order.length; i++) {
      var k = this.pagePerm(order[i]);
      if (!k || typeof Perm === 'undefined' || Perm.can(k)) return order[i];
    }
    return 'kasir';
  },

  boot: function () {
    this.unlocked = false;
    /* A-06: beri tahu user bila data korup baru saja dikarantina */
    if (KDB.corruptRecovered) {
      KDB.corruptRecovered = false;
      setTimeout(function () {
        UI.toast(T('⚠️ Data tersimpan rusak — salinan aslinya disimpan & aplikasi mulai dari data contoh. Hubungi FinOwi untuk pemulihan.'));
      }, 700);
    }
    this.renderNav();
    document.getElementById('kNav').style.display = 'flex';
    var st = Lic.status();
    if (st.state === 'trial') {
      UI.toast(T('Masa trial: ') + st.daysLeft + T(' hari lagi'));
    } else if (st.state === 'active' && st.daysLeft != null && st.daysLeft <= 3) {
      UI.toast(T('Lisensi habis dalam ') + st.daysLeft + T(' hari — perpanjang yuk'));
    }
    var pin = KDB.data.settings.pin;
    if (pin) this.pinGate();
    else { this.unlocked = true; this.rerender(); }
    this._booted = true;
    try { Cloud.autoBackup(); } catch (e) {}
  },

  applyTheme: function () {
    Theme.apply();
  },

  renderHeader: function () {
    var s = KDB.data.settings;
    var logo = K.safeImg(s.logo)
      ? '<img src="' + K.safeImg(s.logo) + '" alt="" style="width:32px;height:32px;border-radius:9px;object-fit:contain;vertical-align:-8px;background:rgba(255,255,255,.08)">'
      : '\u26a1';
    document.getElementById('kHeader').innerHTML =
      T('<div class="k-head-row"><div class="k-shop">') + logo + ' ' + K.esc(s.shop) +
      T('<small>Aplikasi Kasir UMKM</small></div>') +
      '<div class="k-date" id="kClock">' + this.clockHtml() + '</div></div>';
  },

  /* Jam live: hari, tanggal, jam — update tiap detik */
  clockHtml: function () {
    var d = new Date();
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return I18N.days()[d.getDay()] + ', ' + K.fmtDate(d.getTime()) +
      '<br><b>' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '</b>';
  },

  startClock: function () {
    var self = this;
    if (this._clockTimer) return;
    this._clockTimer = setInterval(function () {
      var el = document.getElementById('kClock');
      if (el) el.innerHTML = self.clockHtml();
    }, 1000);
  },

  renderNav: function () {
    var items = (typeof BizMode !== 'undefined' && BizMode.navItems)
      ? BizMode.navItems()
      : [
        ['menu', 'grid', T('Menu')],
        ['stok', 'package', T('Stok')],
        ['kasir', 'register', T('Kasir')],
        ['laporan', 'chart', T('Laporan')],
        ['set', 'dash', T('Dashboard')]
      ];
    var h = '';
    for (var i = 0; i < items.length; i++) {
      /* S4: tombol navigasi tanpa hak akses disembunyikan */
      var npk = this.pagePerm(items[i][0]);
      if (npk && typeof Perm !== 'undefined' && !Perm.can(npk)) continue;
      var main = items[i][0] === 'kasir';
      h += '<button class="k-nav-it' + (main ? ' k-nav-main' : '') + (this.page === items[i][0] ? ' k-on' : '') +
        '" onclick="App.go(\'' + items[i][0] + '\')"><span class="k-ni">' +
        KIcon.get(items[i][1], main ? 27 : 24) + '</span><span class="k-nl">' + items[i][2] + '</span></button>';
    }
    document.getElementById('kNav').innerHTML = h;
  },

  go: function (p) {
    /* S4: navigasi programatik pun ditegakkan (tile Dashboard dsb.) */
    var gpk = this.pagePerm(p);
    if (gpk && typeof Perm !== 'undefined' && !Perm.guard(gpk)) return;
    var changed = (p !== this.page);
    this.page = p;
    if (changed && p === 'set' && typeof Dashboard !== 'undefined') Dashboard.view = 'home';
    UI.closeSheet();
    this.renderNav();
    this.rerender();
    window.scrollTo(0, 0);
    if (changed) {
      /* Transisi masuk halaman (GPU only) — cuma saat pindah tab */
      var el = document.getElementById('kPage');
      el.classList.remove('k-page-in');
      void el.offsetWidth;
      el.classList.add('k-page-in');
    }
  },

  rerender: function () {
    if (!this.unlocked) return;
    /* S4: halaman aktif yang haknya dicabut (mis. kasir aktif berganti)
       dialihkan ke halaman pertama yang diizinkan. */
    var rpk = this.pagePerm(this.page);
    if (rpk && typeof Perm !== 'undefined' && !Perm.can(rpk)) {
      this.page = this.firstAllowedPage();
    }
    /* Nav SELALU digambar ulang di sini (bukan hanya saat halaman terusir):
       kasir aktif bisa berganti TANPA pindah halaman (ganti kasir dari
       Dashboard saat halaman semasa tetap diizinkan, mis. Kasir) — tanpa
       ini nav bawah basi menampilkan tombol milik kasir sebelumnya
       (Laporan/Dashboard pemilik) walau App.go tetap menahannya.
       Bukti: test-harness-perm-kasir-2026-11-02.js skenario B3. */
    this.renderNav();
    var el = document.getElementById('kPage');
    try {
      var html = '';
      if (this.page === 'kasir') {
        html = Kasir.mode === 'struk' ? Kasir.renderStruk() : Kasir.render();
      }
      else if (this.page === 'menu') html = Menu.render();
      else if (this.page === 'order') html = Order.render();
      else if (this.page === 'stok') html = Stok.render();
      else if (this.page === 'laporan') html = Lap.render();
      else if (this.page === 'set') html = AppSet.render();
      el.innerHTML = html;
    } catch (e) {
      el.innerHTML = T('<div class="k-card"><h3>⚠️ Ups, ada galat</h3>') +
        '<p class="k-small k-muted">' + K.esc(e.message) + '</p>' +
        T('<button class="k-btn k-sec" onclick="App.rerender()">Coba lagi</button></div>');
    }
    Kasir.renderCartBar();
  },

  /* ---------- Ganti Kasir (pintu darurat dari halaman Kasir) ----------
     Satu jalur verifikasi untuk sheet Kasir maupun Dashboard > Karyawan:
     - target karyawan ber-PIN: PIN karyawan itu (PinGuard scope emp:<id>)
     - target Pemilik: PIN APLIKASI (PinGuard scope app); tanpa PIN
       aplikasi, perpindahan diizinkan dengan peringatan — pemilik yang
       belum pernah mengatur PIN tidak boleh terkunci di peran kasir. */
  switchCashierSheet: function () {
    if (typeof Dashboard !== 'undefined' && Dashboard.ensureData) Dashboard.ensureData();
    var es = (KDB.data.employees || []).filter(function (e) { return e.active; });
    var activeId = KDB.data.settings.activeEmployeeId;
    var h = T('<h3 class="k-sheet-t">') + T('Ganti Kasir') + '</h3>' +
      '<p class="k-small k-muted" style="margin-top:0">' + T('Pilih karyawan yang akan bertugas.') + '</p>';
    if (!es.length) h += '<p class="k-small k-muted">' + T('Belum ada karyawan aktif') + '</p>';
    for (var i = 0; i < es.length; i++) {
      var e = es[i], current = e.id === activeId;
      var inner = '<span class="k-srow2-ico">' + K.esc(e.emoji || '👤') + '</span>' +
        '<span class="k-srow2-main"><span class="k-srow2-t">' + K.esc(e.name) + '</span>' +
        '<span class="k-srow2-sub">' + K.esc(e.role || '') + '</span></span>' +
        (current ? '<span class="k-tag k-grn">' + T('Sedang bertugas') + '</span>' : '<span class="k-srow2-chev">›</span>');
      h += current
        ? '<div class="k-srow2">' + inner + '</div>'
        : '<button class="k-srow2" onclick="App.requestSwitchCashier(\'' + K.escQ(e.id) + '\')">' + inner + '</button>';
    }
    UI.openSheet(h);
  },

  requestSwitchCashier: function (id) {
    var e = KDB.employeeById(id);
    if (!e || !e.active || e.id === KDB.data.settings.activeEmployeeId) return;
    var kind = e.isOwner ? 'app' : (e.pin ? 'employee' : 'none');
    if (kind === 'app' && !KDB.data.settings.pin) {
      this._switchCashier = null;
      UI.closeSheet();
      UI.closeModal();
      Dashboard._doSetActive(e);
      UI.toast(T('PIN aplikasi belum diatur — atur PIN aplikasi agar mode Pemilik terlindungi.'));
      return;
    }
    if (kind === 'none') {
      this._switchCashier = null;
      UI.closeSheet();
      UI.closeModal();
      Dashboard._doSetActive(e);
      return;
    }
    var scope = kind === 'app' ? 'app' : 'emp:' + e.id;
    if (PinGuard.lockedMs(scope) > 0) {
      UI.toast(T('Terlalu banyak percobaan — tunggu ') + Math.ceil(PinGuard.lockedMs(scope) / 1000) + T(' dtk'));
      return;
    }
    this._switchCashier = { id: e.id, kind: kind };
    UI.closeSheet();
    var prompt = kind === 'app'
      ? T('Masukkan PIN aplikasi untuk kembali ke mode Pemilik.')
      : T('Masukkan PIN ') + K.esc(e.name) + T(' untuk menjadikannya kasir aktif.');
    UI.openModal(T('<h3 class="k-sheet-t">') + T('Ganti Kasir Aktif') + '</h3>' +
      '<p class="k-small k-muted">' + prompt + '</p>' +
      '<div class="k-fld"><label>PIN</label><input class="k-in" id="empSwitchPin" type="password" inputmode="numeric" maxlength="6" placeholder="••••••"></div>' +
      T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeModal()">Batal</button>') +
      '<button class="k-btn k-pri" onclick="App.confirmSwitchCashier(\'' + K.escQ(e.id) + '\')">' + T('Jadikan Kasir Aktif') + '</button></div>');
  },

  confirmSwitchCashier: function (id) {
    var pending = this._switchCashier;
    var targetId = id || (pending && pending.id);
    var e = targetId ? KDB.employeeById(targetId) : null;
    if (!e || !e.active) return;
    var kind = (pending && pending.id === e.id) ? pending.kind : (e.isOwner ? 'app' : 'employee');
    var scope = kind === 'app' ? 'app' : 'emp:' + e.id;
    if (PinGuard.lockedMs(scope) > 0) {
      UI.toast(T('Terlalu banyak percobaan — tunggu ') + Math.ceil(PinGuard.lockedMs(scope) / 1000) + T(' dtk'));
      return;
    }
    var stored = kind === 'app' ? KDB.data.settings.pin : e.pin;
    if (!stored) {
      /* Tanpa PIN target tidak ada modal verifikasi; jalur request yang
         memutuskan (khusus Pemilik tanpa PIN aplikasi = izin + peringatan). */
      if (kind === 'app') this.requestSwitchCashier(e.id);
      return;
    }
    var el = document.getElementById('empSwitchPin');
    var vr = PinHash.verify(stored, el ? el.value : '');
    if (!vr.ok) {
      var locked = PinGuard.fail(scope);
      UI.toast(locked > 0 ? T('PIN salah — terkunci ') + Math.ceil(locked / 1000) + T(' dtk') : T('PIN salah'));
      return;
    }
    PinGuard.reset(scope);
    if (vr.needsRehash) {
      if (kind === 'app') KDB.data.settings.pin = PinHash.hash(el.value);
      else e.pin = PinHash.hash(el.value); // migrasi plaintext warisan
    }
    this._switchCashier = null;
    UI.closeModal();
    UI.closeSheet();
    Dashboard._doSetActive(e);
  },

  /* ---------- PIN gate ---------- */
  pinGate: function () {
    this.pinBuf = '';
    var self = this;
    document.getElementById('kPage').innerHTML =
      T('<div class="k-pinwrap"><div style="font-size:52px">☕</div>') +
      T('<h3 style="margin:10px 0 0">OGKasir Terkunci</h3>') +
      T('<div class="k-small k-muted">Masukkan PIN 6 digit</div>') +
      T('<div class="k-pin-dots" id="kPinDots"><span></span><span></span><span></span><span></span><span></span><span></span></div>') +
      '<div class="k-pinpad">' +
      '<button onclick="App.pinKey(\'1\')">1</button><button onclick="App.pinKey(\'2\')">2</button><button onclick="App.pinKey(\'3\')">3</button>' +
      '<button onclick="App.pinKey(\'4\')">4</button><button onclick="App.pinKey(\'5\')">5</button><button onclick="App.pinKey(\'6\')">6</button>' +
      '<button onclick="App.pinKey(\'7\')">7</button><button onclick="App.pinKey(\'8\')">8</button><button onclick="App.pinKey(\'9\')">9</button>' +
      T('<button onclick="App.pinKey(\'C\')">⌫</button><button onclick="App.pinKey(\'0\')">0</button><button onclick="App.pinKey(\'X\')">✕</button>') +
      '</div></div>';
    document.getElementById('kNav').style.display = 'none';
  },
  pinKey: function (k) {
    /* S3: kunci sementara sesudah 5x salah (PinGuard) — tombol diabaikan */
    if (PinGuard.lockedMs('app') > 0) {
      UI.toast(T('Terlalu banyak percobaan — tunggu ') + Math.ceil(PinGuard.lockedMs('app') / 1000) + T(' dtk'));
      return;
    }
    if (k === 'C') this.pinBuf = this.pinBuf.slice(0, -1);
    else if (k === 'X') this.pinBuf = '';
    else if (this.pinBuf.length < 6) this.pinBuf += k;
    var dots = document.querySelectorAll('#kPinDots span');
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('k-f', i < this.pinBuf.length);
    if (this.pinBuf.length === 6) {
      var self = this;
      setTimeout(function () {
        var vr = PinHash.verify(KDB.data.settings.pin, self.pinBuf);
        if (vr.ok) {
          PinGuard.reset('app');
          if (vr.needsRehash) { // migrasi plaintext lama -> hash
            KDB.data.settings.pin = PinHash.hash(self.pinBuf);
            KDB.save();
          }
          self.unlocked = true;
          document.getElementById('kNav').style.display = 'flex';
          self.rerender();
        } else {
          var locked = PinGuard.fail('app');
          self.pinBuf = '';
          for (var j = 0; j < dots.length; j++) dots[j].classList.remove('k-f');
          UI.toast(locked > 0
            ? T('PIN salah — terkunci ') + Math.ceil(locked / 1000) + T(' dtk')
            : T('PIN salah'));
        }
      }, 150);
    }
  }
};

window.onerror = function (msg) {
  try { UI.toast('Galat: ' + String(msg).slice(0, 80)); } catch (e) {}
};

document.addEventListener('DOMContentLoaded', function () { App.init(); });

/* Splash screen saat aplikasi dibuka */
var Splash = {
  t0: 0,
  show: function () { this.t0 = Date.now(); },
  hide: function () {
    var wait = Math.max(0, 1800 - (Date.now() - this.t0));
    setTimeout(function () {
      var el = document.getElementById('kSplash');
      if (el) { el.classList.add('done'); setTimeout(function () { el.remove(); }, 600); }
    }, wait);
  }
};
