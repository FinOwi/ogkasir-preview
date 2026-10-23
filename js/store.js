/* OGKasir - data layer (localStorage) */
var KDB = {
  key: 'kasirku_db_v1',
  data: null,

  load: function () {
    try {
      var raw = localStorage.getItem(this.key);
      this.data = raw ? JSON.parse(raw) : null;
    } catch (e) { this.data = null; }
    if (!this.data || !this.data.menus) {
      this.data = this.seed();
      this.save();
    }
    // migrasi ringan: pastikan field baru ada
    var s = this.data.settings;
    if (!s) { this.data.settings = this.seed().settings; }
    var dflt = this.seed().settings;
    for (var k in dflt) { if (typeof this.data.settings[k] === 'undefined') this.data.settings[k] = dflt[k]; }
    // migrasi v1.49: identitas warna baru — pemakai tema bawaan lama (light/Klasik)
    // beralih ke Biru Fresh, sekali saja. Pilihan tema eksplisit lain tidak disentuh;
    // yang memilih Klasik lagi sesudah migrasi tetap dihormati.
    if (!s.themeFreshMigrated) {
      if (s.theme === 'light' || !s.theme) s.theme = 'fintech';
      s.themeFreshMigrated = true;
    }
    if (!this.data.stockLog) this.data.stockLog = [];
    if (!this.data.nextNo) this.data.nextNo = 1;
    if (!Array.isArray(this.data.employees) || !this.data.employees.length) {
      this.data.employees = [{
        id: 'emp-owner', name: s.userName || 'Pemilik', role: 'Pemilik',
        phone: '', pin: '', active: true, isOwner: true,
        emoji: s.userEmoji || '👤',
        permissions: { kasir: true, menu: true, stok: true, laporan: true, dashboard: true },
        createdAt: Date.now()
      }];
    }
    if (!Array.isArray(this.data.feedback)) this.data.feedback = [];
    if (!s.activeEmployeeId) s.activeEmployeeId = this.data.employees[0].id;
    // migrasi v1.40: isi foto produk contoh yg belum punya foto (data lama)
    try {
      var seedMenus = this.seed().menus, byName = {}, i, m;
      for (i = 0; i < seedMenus.length; i++) { if (seedMenus[i].photo) byName[seedMenus[i].name] = seedMenus[i].photo; }
      var chg = false;
      for (i = 0; i < this.data.menus.length; i++) {
        m = this.data.menus[i];
        if (m.sample && !m.photo && byName[m.name]) { m.photo = byName[m.name]; chg = true; }
      }
      if (chg) this.save();
    } catch (e) {}
    return this.data;
  },

  save: function () {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); }
    catch (e) {
      // penyimpanan penuh (mis. kebanyakan foto menu) — jangan gagal diam-diam
      if (!KDB._quotaWarned && e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        KDB._quotaWarned = true;
        try { UI.toast(T('⚠️ Penyimpanan penuh — hapus foto menu yg tak perlu')); } catch (e2) {}
      }
    }
  },

  wipe: function () {
    try { localStorage.removeItem(this.key); } catch (e) {}
    this.data = this.seed();
    this.save();
  },

  seed: function () {
    var cats = ['Kopi', 'Minuman', 'Makanan', 'Snack'];
    var M = [
      ['Kopi Tubruk', 'Kopi', 8000, 3000, 50, '☕', 'img/produk/kopi-tubruk.jpg'],
      ['Kopi Hitam', 'Kopi', 10000, 3500, 50, '☕', 'img/produk/kopi-hitam.jpg'],
      ['Es Kopi Susu', 'Kopi', 15000, 6000, 40, '🧋', 'img/produk/es-kopi-susu.jpg'],
      ['Kopi Susu Panas', 'Kopi', 13000, 5500, 40, '☕', 'img/produk/kopi-susu-panas.jpg'],
      ['Teh Manis Panas', 'Minuman', 5000, 1500, 60, '🍵', 'img/produk/teh-manis-panas.jpg'],
      ['Es Teh Manis', 'Minuman', 6000, 1800, 60, '🧊', 'img/produk/es-teh-manis.jpg'],
      ['Es Jeruk', 'Minuman', 8000, 2500, 40, '🍊', 'img/produk/es-jeruk.jpg'],
      ['Air Mineral', 'Minuman', 4000, 2000, 100, '💧', 'img/produk/air-mineral.jpg'],
      ['Indomie Goreng', 'Makanan', 12000, 5000, 30, '🍜', 'img/produk/indomie-goreng.jpg'],
      ['Indomie Rebus', 'Makanan', 12000, 5000, 30, '🍜', 'img/produk/indomie-rebus.jpg'],
      ['Nasi Goreng', 'Makanan', 15000, 7000, 20, '🍛', 'img/produk/nasi-goreng.jpg'],
      ['Mie Goreng Jawa', 'Makanan', 14000, 6500, 20, '🍝', 'img/produk/mie-goreng-jawa.jpg'],
      ['Pisang Goreng', 'Snack', 10000, 4000, 25, '🍌', 'img/produk/pisang-goreng.jpg'],
      ['Roti Bakar', 'Snack', 12000, 5000, 25, '🍞', 'img/produk/roti-bakar.jpg'],
      ['Tahu Crispy', 'Snack', 8000, 3500, 25, '🧆', 'img/produk/tahu-crispy.jpg'],
      ['Kentang Goreng', 'Snack', 12000, 5000, 20, '🍟', 'img/produk/kentang-goreng.jpg'],
    ];
    var menus = M.map(function (m, i) {
      return { id: 'm' + (i + 1), name: m[0], cat: m[1], price: m[2], cost: m[3],
               stock: m[4], min: 5, track: true, active: true, emoji: m[5], photo: m[6]||'', sample: true };
    });
    return {
      menus: menus,
      cats: cats,
      txs: [],
      stockLog: [],
      employees: [{
        id: 'emp-owner', name: 'Pemilik', role: 'Pemilik', phone: '', pin: '',
        active: true, isOwner: true, emoji: '👤',
        permissions: { kasir: true, menu: true, stok: true, laporan: true, dashboard: true },
        createdAt: Date.now()
      }],
      feedback: [],
      nextNo: 1,
      settings: {
        shop: 'Warkop Saya', addr: '', foot: T('Terima kasih sudah mampir!'),
        pin: '', theme: 'fintech', themeFreshMigrated: false, printerMac: '', printerName: '',
        printerWifiIp: '', printerWifiPort: 9100, printerType: '',
        menuView: 'grid', accent: '', lang: 'id',
        userName: '', userEmoji: '', activeEmployeeId: 'emp-owner',
        phone: '', shopType: '',
        accountEmail: '', accountName: '', syncEnabled: false, lastSyncTs: 0,
        logo: '', receiptLogo: true,
        cloudUrl: '', cloudKey: '', cloudTs: 0, cloudDevId: '',
        supaUrl: '', supaAnon: '', cloudAuto: true,
        notePresets: ['Setengah matang', 'Matang banget', 'Pedas', 'Tidak pedas',
          'Es sedikit', 'Tanpa es', 'Gula sedikit', 'Tanpa gula']
      }
    };
  },

  menuById: function (id) {
    var ms = this.data.menus;
    for (var i = 0; i < ms.length; i++) if (ms[i].id === id) return ms[i];
    return null;
  },
  menuByCode: function (code) {
    if (!code) return null;
    var ms = this.data.menus;
    for (var i = 0; i < ms.length; i++) if (ms[i].code && ms[i].code === code) return ms[i];
    return null;
  },

  employeeById: function (id) {
    var es = this.data.employees || [];
    for (var i = 0; i < es.length; i++) if (es[i].id === id) return es[i];
    return null;
  },

  activeEmployee: function () {
    var s = this.data.settings || {};
    return this.employeeById(s.activeEmployeeId) ||
      (this.data.employees && this.data.employees[0]) || null;
  },

  addStockLog: function (menuId, name, type, qty, after, note) {
    this.data.stockLog.unshift({ id: K.uid(), at: Date.now(), menuId: menuId,
      name: name, type: type, qty: qty, after: after, note: note || '' });
    if (this.data.stockLog.length > 500) this.data.stockLog.length = 500;
  },

  removeSamples: function () {
    this.data.menus = this.data.menus.filter(function (m) { return !m.sample; });
    this.save();
  }
};

/* ---------- helpers ---------- */
var K = {
  uid: function () {
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },
  // ikon scan barcode (dipakai Kasir + form Menu)
  SCAN_SVG: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><line x1="8" y1="9" x2="8" y2="15"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="16" y1="10" x2="16" y2="14"/></svg>',
  rp: function (n) {
    n = Math.round(Number(n) || 0);
    var neg = n < 0;
    var s = String(Math.abs(n)), out = '';
    while (s.length > 3) { out = '.' + s.slice(-3) + out; s = s.slice(0, -3); }
    return (neg ? '-Rp' : 'Rp') + s + out;
  },
  num: function (v) {
    var n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  },
  // angka desimal (koma/titik) untuk berat kg & stok desimal
  numDec: function (v) {
    var n = parseFloat(String(v == null ? '' : v).replace(',', '.').replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  },
  // true bila menu dijual per kilo; menu lama tanpa field unit = pcs
  isKg: function (m) { return !!m && m.unit === 'kg'; },
  // tampilkan qty: kg -> desimal koma Indonesia ("1,5"), pcs -> bulat
  fmtQty: function (q, unit) {
    q = Number(q) || 0;
    if (unit === 'kg') return String(Math.round(q * 1000) / 1000).replace('.', ',');
    return String(Math.round(q));
  },
  dayStart: function (ts) {
    var d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime();
  },
  fmtDate: function (ts) {
    var d = new Date(ts);
    var mo = I18N.months();
    return d.getDate() + ' ' + mo[d.getMonth()] + ' ' + d.getFullYear();
  },
  fmtDateTime: function (ts) {
    var d = new Date(ts);
    function p(x){ return (x < 10 ? '0' : '') + x; }
    return K.fmtDate(ts) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  },
  fmtTime: function (ts) {
    var d = new Date(ts);
    function p(x){ return (x < 10 ? '0' : '') + x; }
    return p(d.getHours()) + ':' + p(d.getMinutes());
  },
  pad: function (n, l) {
    n = String(n);
    while (n.length < (l || 4)) n = '0' + n;
    return n;
  },
  esc: function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
  // untuk nilai string di dalam onclick='...': amankan backslash & kutip satu juga
  escQ: function (s) {
    return K.esc(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
  }
};
