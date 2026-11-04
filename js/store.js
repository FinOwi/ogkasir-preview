/* OGKasir - data layer (localStorage) */
var KDB = {
  key: 'kasirku_db_v1',
  data: null,

  load: function () {
    var raw = null, parsed = null, bad = false;
    try { raw = localStorage.getItem(this.key); } catch (e) {}
    if (raw) {
      try { parsed = JSON.parse(raw); } catch (e) { bad = true; }
      if (!bad && (!parsed || !parsed.menus)) bad = true;
    }
    if (bad) {
      /* A-06 (audit 30 Okt 2026): data korup TIDAK lagi ditimpa seed
         diam-diam — blob asli disimpan ke kunci karantina
         kasirku_db_corrupt_<ts> (bisa diperiksa/diselamatkan manual)
         dan App.boot memperingatkan user lewat flag corruptRecovered. */
      try { localStorage.setItem('kasirku_db_corrupt_' + Date.now(), raw); } catch (e) {}
      this.corruptRecovered = true;
      parsed = null;
    }
    this.data = parsed;
    if (!this.data) {
      this.data = this.seed();
      this.save();
    }
    this.migrate();
    return this.data;
  },

  /* Migrasi + penjamin struktur — dipakai load() DAN restore backup
     (A-06: restore kini melewati jalur yang sama, bukan mengganti
     mentah). Mengasumsikan this.data.menus sudah berupa array. */
  migrate: function () {
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
    /* Mode Usaha Fase 3: entitas Order — pengguna lama mulai dari array kosong */
    if (!Array.isArray(this.data.orders)) this.data.orders = [];
    if (!this.data.nextOrderNo) this.data.nextOrderNo = 1;
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
    /* Migrasi PIN karyawan plaintext -> hash (S3): PIN karyawan tidak
       punya titik verifikasi interaktif untuk migrasi malas, jadi
       di-hash saat muat. PIN aplikasi bermigrasi saat verifikasi cocok
       pertama kali (App.pinKey / AppSet.pinSave). */
    try {
      var pchg = false;
      for (var pi = 0; pi < this.data.employees.length; pi++) {
        var epin = this.data.employees[pi].pin;
        if (epin && !PinHash.isHashed(epin)) { this.data.employees[pi].pin = PinHash.hash(epin); pchg = true; }
      }
      if (pchg) this.save();
    } catch (e) {}
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

  /* Sanitasi data hasil restore (A-06): pastikan semua koleksi &
     field wajib ada sebelum migrasi berjalan — file backup lama/
     sebagian tidak lagi membuat aplikasi setengah rusak. */
  sanitize: function (d) {
    var sd = this.seed();
    if (!d || typeof d !== 'object') d = {};
    if (!Array.isArray(d.menus)) d.menus = [];
    if (!Array.isArray(d.cats) || !d.cats.length) d.cats = sd.cats;
    if (!Array.isArray(d.txs)) d.txs = [];
    if (!Array.isArray(d.stockLog)) d.stockLog = [];
    if (!Array.isArray(d.employees)) d.employees = [];
    if (!Array.isArray(d.feedback)) d.feedback = [];
    if (!Array.isArray(d.orders)) d.orders = [];
    if (!d.settings || typeof d.settings !== 'object') d.settings = {};
    for (var k in sd.settings) { if (typeof d.settings[k] === 'undefined') d.settings[k] = sd.settings[k]; }
    if (!(d.nextNo > 0)) d.nextNo = 1;
    if (!(d.nextOrderNo > 0)) d.nextOrderNo = 1;
    d.settings.logo = K.safeImg(d.settings.logo);
    for (var i = 0; i < d.menus.length; i++) { if (d.menus[i]) d.menus[i].photo = K.safeImg(d.menus[i].photo); }
    return d;
  },

  save: function () {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); }
    catch (e) {
      /* Q4 (audit 30 Okt 2026): SEMUA kegagalan simpan diperingatkan
         (dulu error non-kuota tertelan diam-diam), dibatasi maks 1x
         per 60 detik supaya tidak membanjiri user. */
      var now = Date.now();
      if (!KDB._saveWarnTs || now - KDB._saveWarnTs > 60000) {
        KDB._saveWarnTs = now;
        KDB._quotaWarned = true;
        try {
          UI.toast(e && (e.name === 'QuotaExceededError' || e.code === 22)
            ? T('⚠️ Penyimpanan penuh — hapus foto menu yg tak perlu')
            : T('⚠️ Gagal menyimpan data — periksa ruang penyimpanan HP'));
        } catch (e2) {}
      }
    }
  },

  wipe: function () {
    try { localStorage.removeItem(this.key); } catch (e) {}
    this.data = this.seed();
    this.save();
  },

  /* Salinan data untuk EKSPOR (backup file & cloud) — perbaikan S3
     (audit 30 Okt 2026): PIN aplikasi & PIN karyawan TIDAK PERNAH
     meninggalkan perangkat. Restore mengabaikan field PIN dari file. */
  exportData: function () {
    var d = JSON.parse(JSON.stringify(this.data));
    if (d.settings) {
      d.settings.pin = '';
      /* S5 (audit 30 Okt 2026): backup TIDAK boleh memuat kredensial
         penariknya sendiri — cloudKey/cloudDevId dikeluarkan dari isi
         backup file & cloud. Restore mempertahankan nilai perangkat
         ini (lihat AppSet.doRestore). */
      d.settings.cloudKey = '';
      d.settings.cloudDevId = '';
    }
    if (Array.isArray(d.employees)) {
      for (var i = 0; i < d.employees.length; i++) d.employees[i].pin = '';
    }
    return d;
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
      orders: [],
      nextOrderNo: 1,
      nextNo: 1,
      settings: {
        shop: 'Warkop Saya', addr: '', foot: T('Terima kasih sudah mampir!'),
        pin: '', theme: 'fintech', themeFreshMigrated: false, printerMac: '', printerName: '',
        printerWifiIp: '', printerWifiPort: 9100, printerType: '',
        menuView: 'grid', accent: '', lang: 'id',
        bizMode: 'campuran', bizModeHintSeen: false, bizSub: 'lainnya',
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
  },
  /* Penormal gambar (perbaikan X1/X2, audit 30 Okt 2026): hanya terima
     data-URI gambar hasil potret internal (png/jpeg/webp base64) atau
     path relatif aset bawaan img/... Selain itu kembalikan '' — nilai
     jahat dari sinkron/restore (mis. x" onerror="...) tidak lagi bisa
     menembus atribut src. Diterapkan saat INTAKE (sync applyDoc &
     restore) dan nilai tersimpan ternormalisasi dipakai semua render. */
  safeImg: function (v) {
    if (typeof v !== 'string' || !v) return '';
    if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) return v;
    if (/^img\/[A-Za-z0-9._\/-]+$/.test(v)) return v;
    return '';
  }
};

/* ---------- PIN ter-hash (perbaikan S3, audit 30 Okt 2026) ----------
   Format tersimpan: 'h1$<salt>$<sha256hex(salt:pin)>' memakai SHA-256
   sinkron yang sudah ada di LicCrypto. PIN plaintext lama tetap lolos
   verifikasi SATU kali ({needsRehash:true}) lalu ditulis ulang sebagai
   hash oleh pemanggil. PIN TIDAK ikut Sync/backup (lihat exportData &
   Sync.collectDocs). */
var PinHash = {
  isHashed: function (v) { return typeof v === 'string' && v.indexOf('h1$') === 0; },
  hash: function (pin) {
    var salt = K.uid() + K.uid();
    return 'h1$' + salt + '$' + LicCrypto.sha256(salt + ':' + pin);
  },
  verify: function (stored, candidate) {
    if (!stored || !candidate) return { ok: false, needsRehash: false };
    if (this.isHashed(stored)) {
      var parts = stored.split('$');
      if (parts.length !== 3) return { ok: false, needsRehash: false };
      return { ok: LicCrypto.sha256(parts[1] + ':' + candidate) === parts[2], needsRehash: false };
    }
    return { ok: stored === candidate, needsRehash: stored === candidate };
  }
};

/* Batas percobaan PIN: sesudah 5x salah -> kunci 30 dtk, naik 2x lipat
   tiap babak (maks 5 menit). Keadaan disimpan per kunci di localStorage
   'kasirku_pinfail_v1' (di luar blob KDB agar tak ikut tereset restore). */
var PinGuard = {
  _key: 'kasirku_pinfail_v1',
  _all: function () {
    try { return JSON.parse(localStorage.getItem(this._key) || '{}'); } catch (e) { return {}; }
  },
  _put: function (all) {
    try { localStorage.setItem(this._key, JSON.stringify(all)); } catch (e) {}
  },
  lockedMs: function (scope) {
    var st = this._all()[scope];
    if (!st || !st.lockUntil) return 0;
    var left = st.lockUntil - Date.now();
    return left > 0 ? left : 0;
  },
  fail: function (scope) {
    var all = this._all(), st = all[scope] || { fails: 0, lockUntil: 0, rounds: 0 };
    st.fails++;
    if (st.fails >= 5) {
      st.rounds++;
      st.lockUntil = Date.now() + Math.min(30000 * Math.pow(2, st.rounds - 1), 300000);
      st.fails = 0;
    }
    all[scope] = st;
    this._put(all);
    return this.lockedMs(scope);
  },
  reset: function (scope) {
    var all = this._all();
    delete all[scope];
    this._put(all);
  }
};

/* ---------- Hak akses karyawan (penegakan S4, audit 30 Okt 2026) ----------
   Matriks hak SUDAH lama didefinisikan di data karyawan
   (permissions: kasir/menu/stok/laporan/dashboard — label form:
   "Laporan & export", "Dashboard & pengaturan") tapi dulu tidak pernah
   ditegakkan. Perm adalah satu pintu penegakannya:
   - Pemilik (isOwner) selalu lolos — mode pemilik tidak berubah.
   - Halaman ditegakkan di App.go/renderNav; aksi sensitif tanpa kunci
     sendiri mengikuti kunci induknya: ekspor -> 'laporan' (sesuai
     label), batalkan transaksi (void) & backup/restore/hapus data
     -> 'dashboard' (aksi administratif). */
var Perm = {
  can: function (key) {
    var e = (typeof KDB !== 'undefined' && KDB.activeEmployee) ? KDB.activeEmployee() : null;
    if (!e) return true;
    if (e.isOwner) return true;
    var p = e.permissions || {};
    return !!p[key];
  },
  guard: function (key) {
    if (this.can(key)) return true;
    try { UI.toast(T('Kasir aktif tidak punya hak akses untuk ini')); } catch (e) {}
    return false;
  }
};
