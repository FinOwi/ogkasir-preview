/* OGKasir - Mode Usaha (Fase 1): preset konfigurasi runtime per jenis usaha.
   Satu aplikasi untuk semua usaha — mode BUKAN fork/deploy terpisah.
   Mode disimpan di settings.bizMode dan diterapkan saat render:
   istilah, layout kasir, susunan dashboard, seed awal, fitur grosir/kemasan.
   Ganti mode TIDAK PERNAH mengubah data transaksi/stok/bon pengguna.
   Dasar preset: RISET-KEBUTUHAN-PER-SEGMEN.md (masalah nyata -> solusi). */
var BizMode = {
  ORDER: ['pedagang', 'ritel', 'campuran', 'bangunan', 'jasa'],

  MODES: {
    pedagang: {
      id: 'pedagang', phase: 1, selectable: true,
      label: 'Pedagang', labelEn: 'Food & Beverage',
      tagline: 'Buat usaha kuliner & minuman',
      examples: 'Warkop, kedai kopi, warung makan, cafe, kaki lima',
      icon: 'utensils', iconBg: '#E7EEFE', iconFg: '#2563EB',
      terms: {
        id: { item: 'Menu', catalogTab: 'Menu', catalogTitle: 'Daftar Menu', buyer: 'Pelanggan' },
        en: { item: 'Menu', catalogTab: 'Menu', catalogTitle: 'Menu List', buyer: 'Customer' }
      },
      kasirLayout: 'grid', wholesaleForm: false, packForm: false, dashboard: 'pedagang',
      units: ['Porsi', 'Gelas', 'Bungkus', 'Pcs'],
      seed: {
        cats: ['Kopi & Minuman', 'Makanan', 'Gorengan & Camilan', 'Rokok'],
        items: [
          ['Kopi Tubruk', 'Kopi & Minuman', 8000, 3000, 50, '☕', 'img/produk/kopi-tubruk.jpg'],
          ['Es Teh Manis', 'Kopi & Minuman', 6000, 1800, 60, '🧊', 'img/produk/es-teh-manis.jpg'],
          ['Indomie Rebus', 'Makanan', 12000, 5000, 30, '🍜', 'img/produk/indomie-rebus.jpg'],
          ['Gorengan', 'Gorengan & Camilan', 1000, 400, 50, '🍤', '']
        ]
      }
    },
    ritel: {
      id: 'ritel', phase: 1, selectable: true,
      label: 'Ritel', labelEn: 'Retail',
      tagline: 'Buat toko barang & kebutuhan harian',
      examples: 'Toko kelontong, sembako, minimarket, agen grosir kecil',
      icon: 'store', iconBg: '#E3F3E9', iconFg: '#1F9D61',
      terms: {
        id: { item: 'Produk', catalogTab: 'Produk', catalogTitle: 'Daftar Produk', buyer: 'Pembeli' },
        en: { item: 'Products', catalogTab: 'Products', catalogTitle: 'Product List', buyer: 'Buyer' }
      },
      kasirLayout: 'list', wholesaleForm: true, packForm: true, dashboard: 'ritel',
      units: ['Pcs', 'Pak', 'Dus', 'Renteng', 'Karton', 'Kg', 'Liter'],
      seed: {
        cats: ['Sembako', 'Minuman Kemasan', 'Makanan Ringan', 'Kebutuhan Rumah', 'Rokok'],
        items: [
          ['Beras 1kg', 'Sembako', 14500, 12000, 50, '🌾', ''],
          ['Minyak Goreng 1L', 'Sembako', 18000, 15500, 36, '🍶', ''],
          ['Gula Pasir 1kg', 'Sembako', 17000, 14500, 40, '🧂', ''],
          ['Telur Ayam 1kg', 'Sembako', 28000, 24000, 30, '🥚', '']
        ]
      }
    },
    campuran: {
      id: 'campuran', phase: 1, selectable: true,
      label: 'Campuran', labelEn: 'Mixed',
      tagline: 'Gabungan kuliner + barang',
      examples: 'Warkop yang juga jual kelontong, warung makan + toko kecil',
      icon: 'grid', iconBg: '#F0E9FE', iconFg: '#7C3AED',
      terms: {
        id: { item: 'Menu', catalogTab: 'Menu', catalogTitle: 'Daftar Menu', buyer: 'Pelanggan' },
        en: { item: 'Menu', catalogTab: 'Menu', catalogTitle: 'Menu List', buyer: 'Customer' }
      },
      kasirLayout: 'grid', wholesaleForm: true, packForm: true, dashboard: 'campuran',
      units: ['Porsi', 'Pcs', 'Dus', 'Bungkus'],
      seed: {
        cats: ['Kopi & Minuman', 'Makanan', 'Sembako', 'Kebutuhan Rumah'],
        items: [
          ['Kopi Tubruk', 'Kopi & Minuman', 8000, 3000, 50, '☕', 'img/produk/kopi-tubruk.jpg'],
          ['Beras 1kg', 'Sembako', 14500, 12000, 50, '🌾', ''],
          ['Minyak Goreng 1L', 'Sembako', 18000, 15500, 36, '🍶', '']
        ]
      }
    },
    /* Fase 2: konversi satuan (stok satuan dasar + satuan turunan) & Bon Proyek.
       Harga grosir dua tingkat dipakai ulang sebagai "Harga Proyek". */
    bangunan: {
      id: 'bangunan', phase: 2, selectable: true,
      label: 'Bangunan', labelEn: 'Building Supplies',
      tagline: 'Buat toko material & bahan bangunan',
      examples: 'Toko bangunan, toko besi, depo material',
      icon: 'package', iconBg: '#FDEBDC', iconFg: '#EA580C',
      terms: {
        id: { item: 'Barang', catalogTab: 'Barang', catalogTitle: 'Daftar Barang', buyer: 'Mandor' },
        en: { item: 'Materials', catalogTab: 'Materials', catalogTitle: 'Material List', buyer: 'Contractor' }
      },
      kasirLayout: 'list', wholesaleForm: true, packForm: false, convForm: true, dashboard: 'bangunan',
      units: ['Sak', 'Batang', 'Lembar', 'Meter', 'm³', 'Gulung', 'Kaleng', 'Dus', 'Kg', 'Pcs'],
      seed: {
        cats: ['Semen & Pasir', 'Besi & Baja', 'Cat & Finishing', 'Pipa & Plumbing', 'Keramik & Lantai'],
        items: [
          /* stok selalu dalam satuan DASAR: Semen dasarnya kg, dijual juga per Sak (1 sak = 40 kg) */
          ['Semen 40kg', 'Semen & Pasir', 1700, 1500, 2000, '🧱', '', { unit: 'kg', units: [{ name: 'Sak', factor: 40, price: 68000 }] }],
          ['Pasir', 'Semen & Pasir', 250000, 200000, 20, '🏖️', '', { unit: 'm³', units: [{ name: 'Karung', factor: 0.04, price: 12000 }] }],
          ['Besi Beton 10mm', 'Besi & Baja', 65000, 52000, 100, '🔩', '', { unit: 'batang', units: [{ name: 'Meter', factor: 0.0833, price: 6000 }] }],
          ['Cat Tembok 5kg', 'Cat & Finishing', 185000, 150000, 24, '🎨', '', { unit: 'kaleng' }],
          ['Pipa PVC 3m', 'Pipa & Plumbing', 45000, 34000, 60, '🚰', '', { unit: 'batang', units: [{ name: 'Meter', factor: 0.3333, price: 16000 }] }],
          ['Keramik 40x40', 'Keramik & Lantai', 65000, 52000, 40, '🔲', '', { unit: 'dus', units: [{ name: 'm²', factor: 1.04, price: 68000 }] }]
        ]
      }
    },
    /* Fase 3: usaha berbasis Order — sub-preset di BizMode.SUBS (settings.bizSub). */
    jasa: {
      id: 'jasa', phase: 3, selectable: true,
      label: 'Jasa', labelEn: 'Services',
      tagline: 'Buat usaha berbasis order',
      examples: 'Laundry, bengkel, salon & barbershop, rental',
      icon: 'refresh', iconBg: '#FCE7F3', iconFg: '#DB2777',
      terms: {
        id: { item: 'Layanan', catalogTab: 'Layanan', catalogTitle: 'Daftar Layanan', buyer: 'Pelanggan' },
        en: { item: 'Services', catalogTab: 'Services', catalogTitle: 'Service List', buyer: 'Customer' }
      },
      kasirLayout: 'grid', wholesaleForm: false, packForm: false, dashboard: 'jasa',
      units: ['Kg', 'Pcs']
    }
  },

  /* Sub-preset Mode Jasa — dipilih saat mode Jasa aktif (onboarding & Pengaturan).
     Menentukan istilah satuan, field order khusus, dan seed layanan. */
  SUB_ORDER: ['laundry', 'bengkel', 'salon', 'rental', 'lainnya'],
  SUBS: {
    laundry: {
      id: 'laundry', label: 'Laundry', labelEn: 'Laundry',
      examples: 'Laundry kiloan & satuan', icon: 'refresh', iconBg: '#E0F2FE', iconFg: '#0284C7',
      units: ['Kg', 'Pcs'],
      seed: {
        cats: ['Laundry Kiloan', 'Laundry Satuan'],
        items: [
          ['Cuci Kiloan', 'Laundry Kiloan', 7000, 3000, 0, '🧺', '', { unit: 'kg', track: false }],
          ['Cuci + Setrika', 'Laundry Kiloan', 9000, 4000, 0, '👕', '', { unit: 'kg', track: false }],
          ['Setrika Saja', 'Laundry Kiloan', 5000, 2000, 0, '🔥', '', { unit: 'kg', track: false }],
          ['Express (1 Hari)', 'Laundry Kiloan', 12000, 5000, 0, '⚡', '', { unit: 'kg', track: false }],
          ['Cuci Sepatu', 'Laundry Satuan', 25000, 8000, 0, '👟', '', { track: false }],
          ['Cuci Bed Cover', 'Laundry Satuan', 35000, 12000, 0, '🛏️', '', { track: false }]
        ]
      }
    },
    bengkel: {
      id: 'bengkel', label: 'Bengkel', labelEn: 'Workshop',
      examples: 'Bengkel motor / mobil + sparepart', icon: 'gear', iconBg: '#FDEBDC', iconFg: '#EA580C',
      units: ['Unit', 'Pcs'],
      seed: {
        cats: ['Jasa Bengkel', 'Sparepart'],
        items: [
          ['Servis Ringan', 'Jasa Bengkel', 50000, 15000, 0, '🔧', '', { track: false }],
          ['Ganti Oli', 'Jasa Bengkel', 45000, 20000, 0, '🛢️', '', { track: false }],
          ['Tune Up', 'Jasa Bengkel', 75000, 30000, 0, '⚙️', '', { track: false }],
          ['Tambal Ban', 'Jasa Bengkel', 15000, 5000, 0, '🛞', '', { track: false }],
          ['Oli Mesin 1L', 'Sparepart', 55000, 42000, 20, '🛢️', '', {}],
          ['Busi', 'Sparepart', 25000, 15000, 30, '🔌', '', {}],
          ['Kampas Rem', 'Sparepart', 85000, 60000, 10, '🛑', '', {}]
        ]
      }
    },
    salon: {
      id: 'salon', label: 'Salon & Barbershop', labelEn: 'Salon & Barbershop',
      examples: 'Potong rambut, creambath, perawatan', icon: 'scissors', iconBg: '#FCE7F3', iconFg: '#DB2777',
      units: ['Orang', 'Pcs'],
      seed: {
        cats: ['Potong & Gaya', 'Perawatan'],
        items: [
          ['Potong Rambut', 'Potong & Gaya', 25000, 2000, 0, '💇', '', { track: false, commission: 20 }],
          ['Cukur Jenggot', 'Potong & Gaya', 15000, 1000, 0, '🪒', '', { track: false, commission: 20 }],
          ['Cuci + Blow', 'Perawatan', 35000, 5000, 0, '💆', '', { track: false, commission: 20 }],
          ['Creambath', 'Perawatan', 60000, 15000, 0, '🧖', '', { track: false, commission: 25 }],
          ['Semir Rambut', 'Perawatan', 120000, 40000, 0, '🎨', '', { track: false, commission: 25 }]
        ]
      }
    },
    rental: {
      id: 'rental', label: 'Rental', labelEn: 'Rental',
      examples: 'Sewa alat pesta, kendaraan, elektronik', icon: 'folder', iconBg: '#E3F3E9', iconFg: '#1F9D61',
      units: ['Hari', 'Unit', 'Pcs'],
      seed: {
        cats: ['Sewa Alat', 'Sewa Kendaraan'],
        items: [
          ['Sewa Tenda 4x6', 'Sewa Alat', 150000, 30000, 0, '⛺', '', { track: false }],
          ['Sewa Kursi', 'Sewa Alat', 5000, 1000, 0, '🪑', '', { track: false }],
          ['Sewa Sound System', 'Sewa Alat', 500000, 100000, 0, '🔊', '', { track: false }],
          ['Sewa Proyektor', 'Sewa Alat', 200000, 40000, 0, '📽️', '', { track: false }],
          ['Sewa Mobil + Sopir', 'Sewa Kendaraan', 450000, 150000, 0, '🚗', '', { track: false }]
        ]
      }
    },
    lainnya: {
      id: 'lainnya', label: 'Jasa Lainnya', labelEn: 'Other Services',
      examples: 'Jasa umum berbasis order', icon: 'filetext', iconBg: '#EDF0F4', iconFg: '#64748B',
      units: ['Pcs', 'Jam', 'Hari'],
      seed: {
        cats: ['Layanan'],
        items: [
          ['Jasa Konsultasi', 'Layanan', 100000, 0, 0, '💬', '', { track: false }],
          ['Jasa Desain', 'Layanan', 150000, 0, 0, '🎨', '', { track: false }],
          ['Jasa Antar', 'Layanan', 20000, 5000, 0, '🛵', '', { track: false }],
          ['Jasa Lainnya', 'Layanan', 50000, 0, 0, '🧰', '', { track: false }]
        ]
      }
    }
  },

  /* id mode aktif — hanya mode yang selectable di fase ini; nilai lain
     (data lama / backup asing) jatuh ke 'campuran' yang aman. */
  id: function () {
    try {
      var m = KDB.data && KDB.data.settings ? KDB.data.settings.bizMode : '';
      if (m && this.MODES[m] && this.MODES[m].selectable) return m;
    } catch (e) {}
    return 'campuran';
  },
  get: function () { return this.MODES[this.id()]; },
  preset: function (id) { return this.MODES[id] || null; },

  set: function (id) {
    var p = this.MODES[id];
    if (!p || !p.selectable) return false;
    KDB.data.settings.bizMode = id;
    KDB.save();
    return true;
  },

  /* istilah per mode, sadar bahasa (berdiri di atas kamus i18n, tidak mengubahnya) */
  term: function (key) {
    var p = this.get();
    /* Bangunan: tingkat harga kedua BUKAN "grosir" — namanya Harga Proyek */
    if (key === 'wholesaleLabel') return p.id === 'bangunan' ? T('Harga Proyek') : T('Harga grosir');
    var lang = (typeof I18N !== 'undefined' && I18N.lang === 'en') ? 'en' : 'id';
    var t = (p.terms && p.terms[lang]) || (p.terms && p.terms.id) || {};
    return t[key] || key;
  },

  /* ---------- sub-preset Jasa (settings.bizSub) ---------- */
  subId: function () {
    try {
      var s = KDB.data && KDB.data.settings ? KDB.data.settings.bizSub : '';
      if (s && this.SUBS[s]) return s;
    } catch (e) {}
    return 'lainnya';
  },
  sub: function () { return this.SUBS[this.subId()]; },
  subPreset: function (id) { return this.SUBS[id] || null; },
  subLabel: function (id) {
    var p = this.SUBS[id || this.subId()];
    if (!p) return '';
    return (typeof I18N !== 'undefined' && I18N.lang === 'en' && p.labelEn) ? p.labelEn : p.label;
  },
  setSub: function (id) {
    if (!this.SUBS[id]) return false;
    KDB.data.settings.bizSub = id;
    KDB.save();
    return true;
  },

  /* satuan contoh untuk form produk: Jasa mengikuti sub-preset */
  units: function () {
    var p = this.get();
    if (p.id === 'jasa') return this.sub().units;
    return p.units || [];
  },

  /* susunan tab bawah efektif: Jasa menaruh Order paling depan */
  navItems: function () {
    var cat = this.term('catalogTab');
    if (this.id() === 'jasa') {
      return [
        ['order', 'receipt', T('Order')],
        ['menu', 'grid', cat],
        ['kasir', 'register', T('Kasir')],
        ['laporan', 'chart', T('Laporan')],
        ['set', 'dash', T('Dashboard')]
      ];
    }
    return [
      ['menu', 'grid', cat],
      ['stok', 'package', T('Stok')],
      ['kasir', 'register', T('Kasir')],
      ['laporan', 'chart', T('Laporan')],
      ['set', 'dash', T('Dashboard')]
    ];
  },
  label: function (id) {
    var p = this.MODES[id || this.id()];
    if (!p) return '';
    return (typeof I18N !== 'undefined' && I18N.lang === 'en' && p.labelEn) ? p.labelEn : p.label;
  },

  /* layout layar kasir efektif: preset 'list' (Ritel) menang;
     selain itu hormati pilihan tampilan pengguna (grid/baris di Tampilan). */
  kasirLayout: function () {
    if (this.get().kasirLayout === 'list') return 'list';
    return (KDB.data.settings.menuView === 'list') ? 'list' : 'grid';
  },
  wholesaleForm: function () { return !!this.get().wholesaleForm; },
  packForm: function () { return !!this.get().packForm; },

  /* Seed efektif: mode Jasa mengambil seed sub-preset yang sedang dipilih. */
  seedData: function () {
    var p = this.get();
    if (p.id === 'jasa') return this.sub().seed || null;
    return p.seed || null;
  },

  /* Seed kategori & contoh item per mode — HANYA untuk pengguna baru:
     basis data masih berisi 100% data contoh bawaan dan belum ada transaksi.
     Data pengguna yang sudah diisi sendiri TIDAK PERNAH ditimpa.
     Elemen ke-8 item (opsional) = field tambahan: unit, units (konversi),
     track, commission — digabung apa adanya ke menu hasil seed. */
  applySeedIfFresh: function () {
    var D = KDB.data;
    if (!D || !Array.isArray(D.menus) || !D.menus.length) return false;
    if (D.txs && D.txs.length) return false;
    if (D.orders && D.orders.length) return false; // sudah ada order = data asli, jangan reseed
    for (var i = 0; i < D.menus.length; i++) if (!D.menus[i].sample) return false;
    var seed = this.seedData();
    if (!seed) return false;
    D.cats = seed.cats.slice();
    D.menus = seed.items.map(function (m, i) {
      var o = { id: 'bm' + (i + 1), name: m[0], cat: m[1], price: m[2], cost: m[3],
               stock: m[4], min: 5, track: true, active: true, emoji: m[5], photo: m[6] || '', sample: true };
      var ex = m[7];
      if (ex) for (var k in ex) o[k] = ex[k];
      return o;
    });
    KDB.save();
    return true;
  }
};
