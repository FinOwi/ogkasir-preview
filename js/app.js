/* OGKasir - init & router */
var App = {
  page: 'kasir',
  unlocked: false,
  pinBuf: '',

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

  boot: function () {
    this.unlocked = false;
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
    var logo = s.logo
      ? '<img src="' + s.logo + '" alt="" style="width:32px;height:32px;border-radius:9px;object-fit:contain;vertical-align:-8px;background:rgba(255,255,255,.08)">'
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
    var items = [
      ['menu', 'grid', T('Menu')],
      ['stok', 'package', T('Stok')],
      ['kasir', 'register', T('Kasir')],
      ['laporan', 'chart', T('Laporan')],
      ['set', 'dash', T('Dashboard')]
    ];
    var h = '';
    for (var i = 0; i < items.length; i++) {
      var main = items[i][0] === 'kasir';
      h += '<button class="k-nav-it' + (main ? ' k-nav-main' : '') + (this.page === items[i][0] ? ' k-on' : '') +
        '" onclick="App.go(\'' + items[i][0] + '\')"><span class="k-ni">' +
        KIcon.get(items[i][1], main ? 27 : 24) + '</span><span class="k-nl">' + items[i][2] + '</span></button>';
    }
    document.getElementById('kNav').innerHTML = h;
  },

  go: function (p) {
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
    var el = document.getElementById('kPage');
    try {
      var html = '';
      if (this.page === 'kasir') {
        html = Kasir.mode === 'struk' ? Kasir.renderStruk() : Kasir.render();
      }
      else if (this.page === 'menu') html = Menu.render();
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
    if (k === 'C') this.pinBuf = this.pinBuf.slice(0, -1);
    else if (k === 'X') this.pinBuf = '';
    else if (this.pinBuf.length < 6) this.pinBuf += k;
    var dots = document.querySelectorAll('#kPinDots span');
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('k-f', i < this.pinBuf.length);
    if (this.pinBuf.length === 6) {
      var self = this;
      setTimeout(function () {
        if (self.pinBuf === KDB.data.settings.pin) {
          self.unlocked = true;
          document.getElementById('kNav').style.display = 'flex';
          self.rerender();
        } else {
          self.pinBuf = '';
          for (var j = 0; j < dots.length; j++) dots[j].classList.remove('k-f');
          UI.toast(T('PIN salah'));
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
