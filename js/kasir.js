/* OGKasir - kasir, keranjang, pembayaran, struk, riwayat */
var Kasir = {
  cart: {},        // menuId -> qty (untuk produk konversi: qty dalam SATUAN DASAR)
  cartUnit: {},    // menuId -> nama satuan turunan yang dipilih (Mode Bangunan)
  cartNote: {},    // menuId -> catatan khusus per item (cth: "setengah matang")
  cartPrice: {},   // menuId -> snapshot {price,cost,name,ws} dari item tx (mode edit tagihan, M1)
  _editOrphans: [], // item tx yang menunya sudah dihapus saat edit tagihan (M2) — diteruskan apa adanya
  cat: 'Semua', // kanonis: JANGAN dibungkus T() — nilai filter
  q: '',
  mode: 'kasir',  // kasir | riwayat | tagihan | struk
  lastTx: null,
  payMethod: 'Tunai',
  _payTagId: null,      // id transaksi yg sedang dilunasi
  _payTagMethod: 'Tunai',
  _editingTagId: null,  // id tagihan yg sedang ditambah pesanannya
  _billType: null,      // tipe bon baru yg dipilih di sheet bayar: 'kunjungan' | 'tempo'
  _billQ: '',           // kata kunci pencarian daftar Bon Meja

  /* ---------- catatan per item ---------- */
  notePresets: function () {
    try {
      var p = KDB.data.settings.notePresets;
      if (Array.isArray(p) && p.length) return p;
    } catch (e) {}
    return ['Setengah matang', 'Pedas', 'Es sedikit', 'Tanpa gula'];
  },
  setNote: function (id, v) {
    this.cartNote[id] = v;
  },
  tapPreset: function (id, preset) {
    var cur = (this.cartNote[id] || '').trim();
    var parts = cur ? cur.split(/\s*,\s*/) : [];
    if (parts.indexOf(preset) < 0) parts.push(preset);
    this.cartNote[id] = parts.join(', ');
    var el = document.getElementById('kNote_' + id);
    if (el) el.value = this.cartNote[id];
  },
  clearNote: function (id) {
    this.cartNote[id] = '';
    var el = document.getElementById('kNote_' + id);
    if (el) el.value = '';
  },
  noteChipsHtml: function (id) {
    var presets = this.notePresets();
    var h = '<div class="k-chips" style="margin:6px 0 4px">';
    for (var i = 0; i < presets.length; i++) {
      h += '<button class="k-chip" onclick="Kasir.tapPreset(\'' + K.escQ(id) + '\',\'' +
        K.escQ(presets[i]) + '\')">' + K.esc(presets[i]) + '</button>';
    }
    return h + '</div>';
  },

  /* ---------- helper tagihan (belum dibayar) ---------- */
  isUnpaid: function (t) { return t.status === 'unpaid' && !t.voided; },
  unpaidList: function () {
    var self = this;
    return KDB.data.txs.filter(function (t) { return self.isUnpaid(t); });
  },
  unpaidTotal: function () {
    var s = 0, l = this.unpaidList();
    for (var i = 0; i < l.length; i++) s += l[i].total;
    return s;
  },

  /* ---------- dua versi bon: Bon Meja (kunjungan) & Piutang Bertempo ----------
     tx lama tanpa field billType dianggap 'tempo' (backward compatible, tanpa migrasi). */
  billTypeOf: function (t) { return (t && t.billType === 'kunjungan') ? 'kunjungan' : 'tempo'; },
  billList: function (type) {
    var self = this;
    return this.unpaidList().filter(function (t) { return self.billTypeOf(t) === type; });
  },
  /* Tab segmented halaman Tagihan — pilihan tersimpan per perangkat (localStorage,
     TIDAK ikut sync); bawaan mengikuti mode: Pedagang → Bon Meja, lainnya → Bertempo. */
  billTab: function () {
    var saved = null;
    try { saved = localStorage.getItem('kasirku_billtab_v1'); } catch (e) {}
    if (saved === 'meja' || saved === 'tempo') return saved;
    return (typeof BizMode !== 'undefined' && BizMode.id() === 'pedagang') ? 'meja' : 'tempo';
  },
  setBillTab: function (tab) {
    try { localStorage.setItem('kasirku_billtab_v1', tab); } catch (e) {}
    App.rerender();
  },
  /* Tipe bawaan bon baru di sheet bayar = segmented yang terakhir dibuka
     (billTab sendiri berawal dari mode) — satu sumber kebenaran, konsisten. */
  billDefaultType: function () { return this.billTab() === 'meja' ? 'kunjungan' : 'tempo'; },
  setBillType: function (t) {
    this._billType = (t === 'kunjungan') ? 'kunjungan' : 'tempo';
    this.openCartKeep();
  },
  txById: function (id) {
    var txs = KDB.data.txs;
    for (var i = 0; i < txs.length; i++) if (txs[i].id === id) return txs[i];
    return null;
  },

  /* ---------- halaman kasir ---------- */
  render: function () {
    var D = KDB.data;
    var cats = ['Semua'].concat(D.cats); // kanonis
    var nTag = this.unpaidList().length;
    var h = '<div class="k-seg" style="margin-bottom:10px">' +
      '<button class="' + (this.mode === 'kasir' ? 'k-on' : '') + T('" onclick="Kasir.setMode(\'kasir\')">🧾 Kasir</button>') +
      '<button class="' + (this.mode === 'riwayat' ? 'k-on' : '') + T('" onclick="Kasir.setMode(\'riwayat\')">🕘 Riwayat</button>') +
      '<button class="' + (this.mode === 'tagihan' ? 'k-on' : '') + T('" onclick="Kasir.setMode(\'tagihan\')">⏳ Tagihan') + (nTag ? ' (' + nTag + ')' : '') + '</button></div>';
    if (this.mode === 'riwayat') { h += this.riwayatHtml(); return h; }
    if (this.mode === 'tagihan') { h += this.tagihanHtml(); return h; }
    if (typeof BizMode !== 'undefined' && BizMode.id() === 'jasa') {
      h += '<div class="k-small k-muted" style="margin-bottom:10px">' +
        T('Pilih layanan di bawah, lalu ketuk Buat Order — DP & pelunasan diatur di halaman Order.') + '</div>';
    }
    var MAG_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>';
    var SCAN_SVG = K.SCAN_SVG;
    h += '<div class="k-srow"><div class="k-swrap"><span class="k-sicon">' + MAG_SVG + '</span>' +
      T('<input class="k-search" id="kKasirQ" placeholder="Cari nama produk atau scan" value="') + K.esc(this.q) + T('" oninput="Kasir.search(this.value)"></div>') +
      T('<button class="k-scanbtn" onclick="Kasir.scanAdd()" title="Scan barcode" aria-label="Scan barcode">') + SCAN_SVG + '</button></div>';
    h += '<div class="k-chips">';
    for (var i = 0; i < cats.length; i++) {
      var cl = cats[i] === 'Semua' ? T('Semua') : cats[i]; // label tampil boleh terjemahan
      h += '<button class="k-chip' + (this.cat === cats[i] ? ' k-on' : '') + T('" onclick="Kasir.setCat(\'') + K.escQ(cats[i]) + '\')">' + K.esc(cl) + '</button>';
    }
    var list = this.filteredMenus();
    if (!list.length) {
      h += '</div>' + UI.empty('🍽️', T('Belum ada menu'), T('Tambah menu dulu di tab Menu, bro.'), '');
      return h;
    }
    if (this.layout() === 'list') {
      h += '</div>' + this.scanBarHtml() + this.listHtml(list);
      return h;
    }
    h += '</div><div class="k-grid">';
    for (var j = 0; j < list.length; j++) {
      var m = list[j];
      var out = m.track && m.stock <= 0;
      var low = m.track && !out && m.stock <= m.min;
      var visual = K.safeImg(m.photo) ? '<img class="k-photo" loading="lazy" decoding="async" src="' + K.safeImg(m.photo) + '">' : '<div class="k-emo">' + K.esc(m.emoji || '🍽️') + '</div>';
      var inCart = Kasir.cart[m.id] || 0;
      h += '<button class="k-mi' + (out ? ' k-empty' : '') + '" data-mid="' + K.esc(m.id) + T('" onclick="Kasir.add(\'') + K.escQ(m.id) + '\')">' +
        (out ? T('<span class="k-badge k-out">HABIS</span>') : (low ? '<span class="k-badge k-low">SISA ' + K.fmtQty(m.stock, m.unit) + (K.isKg(m) ? ' kg' : '') + '</span>' : '')) +
        visual +
        '<span class="k-pr">' + K.rp(m.price) + (K.isKg(m) ? '<span style="font-size:10px">/kg</span>' : '') + '</span>' +
        (inCart ? '<span class="k-qty">' + (inCart > 1 ? inCart : '✓') + '</span>' : '') +
        '<span class="k-nm">' + K.esc(m.name) + '</span>' +
        '</button>';
    }
    h += '</div>';
    return h;
  },

  /* layout kasir efektif (preset Mode Usaha menang atas pilihan tampilan) */
  layout: function () {
    if (typeof BizMode !== 'undefined') return BizMode.kasirLayout();
    return (KDB.data.settings.menuView === 'list') ? 'list' : 'grid';
  },

  /* Tombol scan besar — ciri layout daftar Ritel & Bangunan (memakai ulang Scan yg sudah ada) */
  scanBarHtml: function () {
    if (typeof BizMode === 'undefined') return '';
    var mid = BizMode.id();
    if (mid !== 'ritel' && mid !== 'bangunan') return '';
    return '<button class="k-scanbar" onclick="Kasir.scanAdd()">' + K.SCAN_SVG +
      '<span>' + T('Scan Barcode') + '</span></button>';
  },

  /* ---- harga dua tingkat (grosir) ---- */
  unitPrice: function (m, qty) {
    if (!m) return 0;
    if (m.wPrice > 0 && m.wMin > 1 && (qty || 0) >= m.wMin) return m.wPrice;
    return m.price;
  },
  isWholesale: function (m, qty) {
    return !!m && m.wPrice > 0 && this.unitPrice(m, qty) !== m.price;
  },

  /* ---- konversi satuan (Mode Bangunan, Fase 2) ----
     Stok SELALU disimpan dalam satuan dasar produk (m.unit, cth: kg).
     m.units = [{name, factor, price}] — 1 satuan turunan = factor × satuan dasar.
     Keranjang menyimpan qty satuan DASAR; satuan pilihan pembeli ada di cartUnit. */
  hasUnits: function (m) {
    return !!m && Array.isArray(m.units) && m.units.length > 0;
  },
  unitDef: function (m, name) {
    if (!this.hasUnits(m) || !name) return null;
    for (var i = 0; i < m.units.length; i++) if (m.units[i].name === name) return m.units[i];
    return null;
  },
  baseUnitName: function (m) {
    return (m && m.unit && m.unit !== 'pcs') ? m.unit : 'pcs';
  },
  /* harga efektif per satuan tampil: turunan terpilih menang; selain itu grosir/dasar.
     M1 (audit 30 Okt 2026): dalam mode edit tagihan, harga SNAPSHOT item
     tx asli menang atas harga menu terkini — bon lama tidak dinilai ulang. */
  linePrice: function (m, qtyBase) {
    var sn = this.cartPrice[m.id];
    if (sn) return sn.price;
    var un = this.cartUnit[m.id];
    if (un) {
      var d = this.unitDef(m, un);
      if (d) return d.price > 0 ? d.price : Math.round(m.price * d.factor);
    }
    return this.unitPrice(m, qtyBase);
  },
  /* qty dalam satuan pilihan pembeli (keranjang = satuan dasar) */
  dispQty: function (m, qtyBase) {
    var un = this.cartUnit[m.id];
    if (un) {
      var d = this.unitDef(m, un);
      if (d && d.factor > 0) return Math.round(qtyBase / d.factor * 1000) / 1000;
    }
    return qtyBase;
  },
  /* format qty umum: bulat tampil bulat, desimal tampil koma (maks 3 desimal) */
  fmtQtyAny: function (q, unit) {
    q = Math.round((Number(q) || 0) * 1000) / 1000;
    if (unit === 'kg') return K.fmtQty(q, 'kg');
    return q % 1 === 0 ? String(q) : K.fmtQty(q, 'kg');
  },
  wsWord: function (tx) {
    var mode = tx ? (tx.mode || '') : ((typeof BizMode !== 'undefined') ? BizMode.id() : '');
    return mode === 'bangunan' ? T('proyek') : T('grosir');
  },
  fmtDue: function (dstr) {
    var p = String(dstr || '').split('-');
    if (p.length !== 3) return dstr || '';
    return K.fmtDate(new Date(+p[0], +p[1] - 1, +p[2]).getTime());
  },
  /* status tempo tagihan: late | today | soon (≤3 hari) | ok | null (tanpa tempo) */
  dueInfo: function (t) {
    if (!t || !t.dueDate) return null;
    var p = String(t.dueDate).split('-');
    if (p.length !== 3) return null;
    var due = new Date(+p[0], +p[1] - 1, +p[2]).getTime();
    var diff = Math.round((due - K.dayStart(Date.now())) / 864e5);
    if (diff < 0) return { k: 'late', label: T('Terlambat ') + (-diff) + T(' hari') };
    if (diff === 0) return { k: 'today', label: T('Jatuh tempo hari ini') };
    if (diff <= 3) return { k: 'soon', label: T('Jatuh tempo ') + diff + T(' hari lagi') };
    return { k: 'ok', label: T('Jatuh tempo ') + K.fmtDate(due) };
  },

  /* ---------- pemilih satuan saat menjual produk konversi ---------- */
  _uId: null, _uFrom: 'grid', _uSel: '',
  unitSheet: function (id, fromCart) {
    var m = KDB.menuById(id);
    if (!m || !this.hasUnits(m)) return;
    this._uId = id;
    this._uFrom = fromCart ? 'cart' : 'grid';
    this._uSel = this.cartUnit[id] || '';
    var base = this.baseUnitName(m);
    var opts = [{ name: '', factor: 1, price: m.price, label: base }];
    for (var i = 0; i < m.units.length; i++) {
      var u = m.units[i];
      opts.push({ name: u.name, factor: u.factor, price: u.price > 0 ? u.price : Math.round(m.price * u.factor), label: u.name });
    }
    var h = T('<h3 class="k-sheet-t">📐 ') + K.esc(m.name) + '</h3>';
    h += '<div class="k-small k-muted" style="margin-bottom:10px">' + T('Stok tercatat dalam satuan dasar') +
      ': <b>' + this.fmtQtyAny(m.stock, m.unit) + ' ' + K.esc(base) + '</b> — ' + T('pilih satuan jualnya') + '</div>';
    h += '<div class="k-unitlist">';
    for (var j = 0; j < opts.length; j++) {
      var o = opts[j];
      var avail = m.track ? this.fmtQtyAny(m.stock / o.factor, o.name || m.unit) : '∞';
      h += '<button type="button" class="k-unitopt' + (this._uSel === o.name ? ' k-on' : '') + '" data-u="' + K.esc(o.name) + '" onclick="Kasir.unitSel(\'' + K.escQ(o.name) + '\')">' +
        '<span class="k-unitname">' + K.esc(o.label) + '</span>' +
        '<span class="k-unitprice">' + K.rp(o.price) + '/' + K.esc(o.label) + (m.track ? ' • ' + T('stok ') + avail : '') + '</span></button>';
    }
    h += '</div>';
    var curQ = this.cart[id] ? this.dispQty(m, this.cart[id]) : 1;
    h += T('<div class="k-fld" style="margin-top:12px"><label>Jumlah</label>') +
      '<input class="k-in" id="kUnitQty" type="text" inputmode="decimal" value="' + this.fmtQtyAny(curQ, 'kg') + '"></div>';
    h += T('<div class="k-total-row k-grand"><span>Total</span><span class="k-money" id="kUnitTotal">') + K.rp(0) + '</span></div>';
    h += T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="Kasir.unitCancel()">Batal</button>') +
      T('<button class="k-btn k-pri" onclick="Kasir.unitOk()">✓ Masuk Keranjang</button></div>');
    UI.openSheet(h);
    var self = this;
    document.getElementById('kUnitQty').oninput = function () { self.unitRecalc(); };
    this.unitRecalc();
  },
  unitSel: function (name) {
    this._uSel = name || '';
    var btns = document.querySelectorAll('#kSheet .k-unitopt');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('k-on', (btns[i].getAttribute('data-u') || '') === this._uSel);
    }
    this.unitRecalc();
  },
  unitPriceSel: function (m) {
    if (!this._uSel) return m.price;
    var d = this.unitDef(m, this._uSel);
    if (!d) return m.price;
    return d.price > 0 ? d.price : Math.round(m.price * d.factor);
  },
  unitRecalc: function () {
    var m = KDB.menuById(this._uId);
    var el = document.getElementById('kUnitTotal');
    if (!el || !m) return;
    var q = Math.max(0, K.numDec(document.getElementById('kUnitQty').value));
    el.textContent = K.rp(q * this.unitPriceSel(m));
  },
  unitOk: function () {
    var m = KDB.menuById(this._uId);
    if (!m) return;
    var q = Math.round(Math.max(0, K.numDec(document.getElementById('kUnitQty').value)) * 1000) / 1000;
    if (q <= 0) { UI.toast(T('Isi jumlah dulu')); return; }
    var d = this._uSel ? this.unitDef(m, this._uSel) : null;
    var base = Math.round(q * (d ? d.factor : 1) * 1000) / 1000;
    if (m.track && base > this.availStock(m.id)) {
      UI.toast(T('Stok ') + m.name + ' tinggal ' + this.fmtQtyAny(this.availStock(m.id), m.unit) + ' ' + this.baseUnitName(m));
      return;
    }
    this.cart[m.id] = base;
    if (this._uSel) this.cartUnit[m.id] = this._uSel; else delete this.cartUnit[m.id];
    this.syncQtyBadge(m.id);
    if (this._uFrom === 'cart') this.openCart();
    else { UI.closeSheet(); UI.toast(m.name + ' ' + this.fmtQtyAny(q, this._uSel || m.unit) + (this._uSel ? ' ' + this._uSel : '')); }
    this.renderCartBar();
  },
  unitCancel: function () {
    if (this._uFrom === 'cart') this.openCart(); else UI.closeSheet();
  },

  /* ---- konversi kemasan sederhana: 1 kemasan (dus/renteng/dll) = N pcs ---- */
  packQtyOf: function (m) {
    return (m && m.packUnit && m.packQty > 1 && !K.isKg(m)) ? m.packQty : 0;
  },
  addPack: function (id) {
    var m = KDB.menuById(id);
    var pq = this.packQtyOf(m);
    if (!m || !pq || !m.active) return;
    var cur = this.cart[id] || 0;
    if (m.track && cur + pq > m.stock) { UI.toast(T('Stok ') + m.name + ' tinggal ' + m.stock); return; }
    this.cart[id] = cur + pq;
    this.renderCartBar();
    this.syncQtyBadge(id);
    UI.toast(m.name + ' +1 ' + m.packUnit + ' (' + pq + ' pcs)');
  },

  /* Tampilan Baris: daftar menu horizontal, cocok untuk banyak produk */
  listHtml: function (list) {
    var h = '<div class="k-list">';
    for (var j = 0; j < list.length; j++) {
      var m = list[j];
      var out = m.track && m.stock <= 0;
      var low = m.track && !out && m.stock <= m.min;
      var visual = K.safeImg(m.photo) ? '<img class="k-lphoto" loading="lazy" decoding="async" src="' + K.safeImg(m.photo) + '">' :
        '<div class="k-lemo">' + K.esc(m.emoji || '🍽️') + '</div>';
      var pq = this.packQtyOf(m);
      h += '<button class="k-li' + (out ? ' k-empty' : '') + T('" onclick="Kasir.add(\'') + K.escQ(m.id) + '\')">' +
        visual +
        '<div class="k-linfo"><div class="k-nm">' + K.esc(m.name) + '</div>' +
        (m.track ? T('<div class="k-stk">Stok: ') + K.fmtQty(m.stock, m.unit) + (K.isKg(m) ? ' kg' : '') + '</div>' : T('<div class="k-stk">Tanpa stok</div>')) +
        (m.wPrice > 0 && m.wMin > 1 ? '<div class="k-stk" style="color:var(--green)">' + (typeof BizMode !== 'undefined' ? BizMode.term('wholesaleLabel') : T('Harga grosir')) + ' ≥' + m.wMin + ': ' + K.rp(m.wPrice) + '</div>' : '') +
        (this.hasUnits(m) ? '<div class="k-stk" style="color:var(--brand)">' + T('Bisa satuan lain: ') + m.units.map(function (u) { return K.esc(u.name); }).join(', ') + '</div>' : '') +
        (pq ? '<span class="k-packchip" onclick="event.stopPropagation();Kasir.addPack(\'' + K.escQ(m.id) + '\')">+1 ' + K.esc(m.packUnit) + ' = ' + pq + ' pcs</span>' : '') +
        (out ? T('<span class="k-badge k-out">HABIS</span>') : (low ? '<span class="k-badge k-low">SISA ' + K.fmtQty(m.stock, m.unit) + (K.isKg(m) ? ' kg' : '') + '</span>' : '')) +
        '</div>' +
        '<div class="k-lside"><div class="k-pr">' + K.rp(m.price) + (K.isKg(m) ? '<span style="font-size:11px">/kg</span>' : '') + '</div>' +
        '<div class="k-ladd">＋</div></div></button>';
    }
    return h + '</div>';
  },

  filteredMenus: function () {
    var D = KDB.data, out = [], q = this.q.toLowerCase();
    for (var i = 0; i < D.menus.length; i++) {
      var m = D.menus[i];
      if (!m.active) continue;
      if (this.cat !== 'Semua' && m.cat !== this.cat) continue; // 'Semua' kanonis: jangan dibungkus T()
      if (q && m.name.toLowerCase().indexOf(q) < 0) continue;
      out.push(m);
    }
    return out;
  },

  setMode: function (m) { this.mode = m; App.rerender(); },
  setCat: function (c) { this.cat = c; App.rerender(); },
  search: function (v) {
    this.q = v;
    // render ulang daftar menu saja tanpa kehilangan fokus input
    var cls = (this.layout() === 'list') ? '.k-list' : '.k-grid';
    var grid = document.querySelector('#kPage ' + cls);
    var tmp = document.createElement('div');
    tmp.innerHTML = this.render();
    var ng = tmp.querySelector(cls);
    if (grid && ng) grid.outerHTML = ng.outerHTML;
    else App.rerender();
    var inp = document.getElementById('kKasirQ');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  },

  scanAdd: function () {
    Scan.open(function (code) {
      var m = KDB.menuByCode(code);
      if (m) { Kasir.add(m.id); return; }
      UI.confirm(T('Kode "') + K.esc(code) + T('" belum terdaftar. Daftarkan sebagai menu baru?'), 'Daftarkan', function () {
        Menu.form(null, code);
      });
    });
  },

  add: function (id) {
    var m = KDB.menuById(id);
    if (!m || !m.active) return;
    if (this.hasUnits(m)) { this.unitSheet(id, 0); return; }
    if (K.isKg(m)) { this.weightModal(id, 0); return; }
    var cur = this.cart[id] || 0;
    if (m.track && cur + 1 > m.stock) { UI.toast(T('Stok ') + m.name + ' tinggal ' + m.stock); return; }
    this.cart[id] = cur + 1;
    this.renderCartBar();
    this.syncQtyBadge(id);
    UI.toast(m.name + ' ×' + this.cart[id]);
  },

  /* badge ✓/angka di kartu grid saat isi keranjang berubah */
  syncQtyBadge: function (id) {
    var grid = document.querySelector('#kPage .k-grid');
    if (!grid) return;
    var btn = grid.querySelector('button[data-mid="' + id + '"]');
    if (!btn) return;
    var q = this.cart[id] || 0;
    var b = btn.querySelector('.k-qty');
    if (q > 0) {
      var t = q > 1 ? String(q) : '\u2713';
      if (b) b.textContent = t;
      else { b = document.createElement('span'); b.className = 'k-qty'; b.textContent = t; btn.appendChild(b); }
    } else if (b) b.remove();
  },

  /* ---------- input berat untuk produk per-kg ---------- */
  _wId: null,
  _wFrom: 'grid', // 'grid' | 'cart'
  weightModal: function (id, fromCart) {
    var m = KDB.menuById(id);
    if (!m || !K.isKg(m)) return;
    this._wId = id;
    this._wFrom = fromCart ? 'cart' : 'grid';
    var cur = this.cart[id] || 0;
    var h = T('<h3 class="k-sheet-t">⚖️ ') + K.esc(m.name) + '</h3>';
    h += '<div class="k-small k-muted" style="margin-bottom:10px">' + K.rp(m.price) + '/kg' +
      (m.track ? ' • ' + T('Stok: ') + K.fmtQty(m.stock, 'kg') + ' kg' : '') + '</div>';
    h += T('<div class="k-fld"><label>Berat (kg)</label>') +
      '<input class="k-in" id="kWeight" type="text" inputmode="decimal" placeholder="cth: 1,5" value="' + (cur ? K.fmtQty(cur, 'kg') : '') + '"></div>';
    h += '<div class="k-cashgrid">' +
      [0.25, 0.5, 1, 2, 5].map(function (w) {
        return '<button class="k-cash" onclick="Kasir.setWeight(' + w + ')">' + K.fmtQty(w, 'kg') + ' kg</button>';
      }).join('') + '</div>';
    h += T('<div class="k-total-row k-grand"><span>Total</span><span class="k-money" id="kWeightTotal">') + K.rp(0) + '</span></div>';
    h += T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="Kasir.weightCancel()">Batal</button>') +
      T('<button class="k-btn k-pri" onclick="Kasir.weightOk(\'') + K.escQ(id) + T('\')">✓ Masuk Keranjang</button></div>');
    UI.openSheet(h);
    var self = this;
    document.getElementById('kWeight').oninput = function () { self.weightRecalc(); };
    this.weightRecalc();
  },
  setWeight: function (w) {
    var el = document.getElementById('kWeight');
    if (el) { el.value = K.fmtQty(w, 'kg'); this.weightRecalc(); }
  },
  weightRecalc: function () {
    var m = KDB.menuById(this._wId);
    var el = document.getElementById('kWeightTotal');
    if (!el || !m) return;
    var w = Math.max(0, K.numDec(document.getElementById('kWeight').value));
    el.textContent = K.rp(w * Kasir.unitPrice(m, w));
  },
  weightOk: function (id) {
    var m = KDB.menuById(id || this._wId);
    if (!m) return;
    var w = Math.round(Math.max(0, K.numDec(document.getElementById('kWeight').value)) * 1000) / 1000;
    if (w <= 0) { UI.toast(T('Isi berat dulu')); return; }
    if (m.track && w > this.availStock(m.id)) { UI.toast(T('Stok ') + m.name + ' tinggal ' + K.fmtQty(this.availStock(m.id), 'kg') + ' kg'); return; }
    this.cart[m.id] = w;
    this.syncQtyBadge(m.id);
    if (this._wFrom === 'cart') { this.openCart(); }
    else { UI.closeSheet(); UI.toast(m.name + ' ' + K.fmtQty(w, 'kg') + ' kg'); }
    this.renderCartBar();
  },
  weightCancel: function () {
    if (this._wFrom === 'cart') this.openCart(); else UI.closeSheet();
  },

  cartCount: function () {
    var n = 0;
    for (var k in this.cart) {
      var m = KDB.menuById(k);
      n += m ? this.dispQty(m, this.cart[k]) : this.cart[k];
    }
    return n;
  },
  cartTotal: function () {
    var t = 0;
    for (var k in this.cart) { var m = KDB.menuById(k); if (m) t += this.linePrice(m, this.cart[k]) * this.dispQty(m, this.cart[k]); }
    /* M2: selama edit tagihan, item yatim (menu terhapus) tetap terhitung */
    if (this._editingTagId) {
      for (var i = 0; i < this._editOrphans.length; i++) {
        t += (this._editOrphans[i].price || 0) * (this._editOrphans[i].qty || 0);
      }
    }
    return t;
  },

  renderCartBar: function () {
    var w = document.getElementById('kCartBar');
    var n = this.cartCount();
    if (!n || App.page !== 'kasir' || this.mode !== 'kasir') { w.innerHTML = ''; return; }
    var nTxt = String(Math.round(n * 100) / 100).replace('.', ',');
    /* Mode Jasa: keranjang kasir BUKAN transaksi tunai — jadi Order (DP & pelunasan di Order) */
    if (!this._editingTagId && typeof BizMode !== 'undefined' && BizMode.id() === 'jasa' && typeof Order !== 'undefined') {
      w.innerHTML = '<button class="k-cartbar" onclick="Order.openCheckout()"><span>🧾 ' + T('Buat Order') +
        '</span><span>' + K.rp(this.cartTotal()) + T(' →</span></button>');
      return;
    }
    w.innerHTML = T('<button class="k-cartbar" onclick="Kasir.cartBarTap()">') +
      (this._editingTagId ? T('<span>✏️ ') : T('<span>🛒 ')) + nTxt + ' item</span><span>' + K.rp(this.cartTotal()) + T(' →</span></button>');
  },

  chQty: function (id, d) {
    var m = KDB.menuById(id);
    var cur = this.cart[id] || 0;
    /* produk konversi: tombol −/+ melangkah 1 satuan PILIHAN (keranjang = satuan dasar) */
    var un = this.cartUnit[id];
    if (un && m) {
      var ud = this.unitDef(m, un);
      if (ud) {
        var nxB = Math.round((cur + d * ud.factor) * 1000) / 1000;
        if (nxB <= 0) { delete this.cart[id]; delete this.cartNote[id]; delete this.cartUnit[id]; delete this.cartPrice[id]; }
        else {
          var avB = this.availStock(id);
          if (m.track && nxB > avB) {
            UI.toast(T('Stok ') + m.name + ' tinggal ' + this.fmtQtyAny(avB, m.unit) + ' ' + this.baseUnitName(m));
            return;
          }
          this.cart[id] = nxB;
        }
        this.syncQtyBadge(id);
        this.openCart();
        this.renderCartBar();
        return;
      }
    }
    var nx = cur + d;
    if (nx <= 0) { delete this.cart[id]; delete this.cartNote[id]; delete this.cartUnit[id]; delete this.cartPrice[id]; }
    else {
      var av = this.availStock(id);
      if (m && m.track && nx > av) { UI.toast(T('Stok ') + m.name + ' tinggal ' + av); return; }
      this.cart[id] = nx;
    this.syncQtyBadge(id);
    }
    this.openCart();
    this.renderCartBar();
  },

  /* ---------- sheet keranjang & bayar ---------- */
  openCart: function () {
    var D = KDB.data;
    var editing = !!this._editingTagId;
    var etx = editing ? this.txById(this._editingTagId) : null;
    if (editing && !etx) { this._editingTagId = null; editing = false; }
    var h = editing ? T('<h3 class="k-sheet-t">✏️ Tambah Pesanan #') + K.pad(etx.no, 4) + '</h3>'
                    : T('<h3 class="k-sheet-t">🛒 Keranjang</h3>');
    var ids = Object.keys(this.cart);
    if (!ids.length) { UI.closeSheet(); return; }
    for (var i = 0; i < ids.length; i++) {
      var m = KDB.menuById(ids[i]);
      if (!m) continue;
      var q = this.cart[ids[i]];
      var kg = K.isKg(m);
      var un = this.cartUnit[m.id];
      var udef = un ? this.unitDef(m, un) : null;
      var qDisp = udef ? this.dispQty(m, q) : q;
      var qTxt = udef ? this.fmtQtyAny(qDisp, un) + ' ' + K.esc(un)
        : (kg ? K.fmtQty(q, 'kg') + ' kg' : q + ((m.unit && m.unit !== 'pcs') ? ' ' + K.esc(m.unit) : ''));
      var up = this.linePrice(m, q); // M1: snapshot edit menang lewat linePrice
      var sn = this.cartPrice[m.id];
      var ws = sn ? !!sn.ws : (udef ? false : this.isWholesale(m, q));
      var bang = (typeof BizMode !== 'undefined' && BizMode.id() === 'bangunan');
      var pq2 = this.packQtyOf(m);
      var packAnno = (!kg && !udef && pq2 && q % pq2 === 0 && q >= pq2) ? ' (' + (q / pq2) + ' ' + K.esc(m.packUnit) + ')' : '';
      var cvis = K.safeImg(m.photo) ? '<img class="k-thumb" loading="lazy" decoding="async" src="' + K.safeImg(m.photo) + '">' : '<div class="k-emo">' + K.esc(m.emoji || '🍽️') + '</div>';
      var noteVal = this.cartNote[m.id] || '';
      h += '<div class="k-li">' + cvis +
        '<div class="k-tx"><div class="k-t1">' + K.esc(m.name) + (ws ? ' <span class="k-tag k-grn">' + (bang ? T('PROYEK') : T('GROSIR')) + '</span>' : '') + '</div>' +
        '<div class="k-t2">' + K.rp(up) + (udef ? '/' + K.esc(un) + ' × ' : (kg ? '/kg × ' : ' × ')) + qTxt + packAnno + ' = <b>' + K.rp(up * qDisp) + '</b>' +
        (ws ? ' <span style="color:var(--green)">' + (bang ? T('Harga proyek aktif') : T('Harga grosir aktif')) + '</span>' : '') +
        (udef ? ' <a style="color:var(--brand);cursor:pointer" onclick="Kasir.unitSheet(\'' + K.escQ(m.id) + '\',1)">' + T('ganti satuan') + '</a>' : '') + '</div>' +
        this.noteChipsHtml(m.id) +
        T('<input class="k-in k-note-in" id="kNote_') + K.esc(m.id) + T('" placeholder="Catatan (opsional, cth: setengah matang)" value="') + K.esc(noteVal) +
        '" oninput="Kasir.setNote(\'' + K.escQ(m.id) + '\', this.value)"></div>' +
        (udef
          ? T('<div class="k-step"><button onclick="Kasir.chQty(\'') + K.escQ(m.id) + T('\',-1)">−</button>') +
            '<span class="k-q">' + this.fmtQtyAny(qDisp, un) + '</span>' +
            T('<button onclick="Kasir.chQty(\'') + K.escQ(m.id) + '\',1)">+</button></div></div>'
          : (kg
            ? '<div class="k-step"><button style="min-width:70px" onclick="Kasir.weightModal(\'' + K.escQ(m.id) + '\',1)">⚖️ ' + T('Ubah') + '</button></div></div>'
            : T('<div class="k-step"><button onclick="Kasir.chQty(\'') + K.escQ(m.id) + T('\',-1)">−</button>') +
              '<span class="k-q">' + q + '</span>' +
              T('<button onclick="Kasir.chQty(\'') + K.escQ(m.id) + '\',1)">+</button></div></div>'));
    }
    /* M2: item yatim (menu terhapus) tetap tampil & terhitung selama edit */
    var orphSub = 0;
    if (editing && this._editOrphans.length) {
      for (var oi = 0; oi < this._editOrphans.length; oi++) {
        var oit = this._editOrphans[oi];
        orphSub += (oit.price || 0) * (oit.qty || 0);
        h += '<div class="k-li"><div class="k-emo">⚠️</div>' +
          '<div class="k-tx"><div class="k-t1">' + K.esc(oit.name) + '</div>' +
          '<div class="k-t2">' + K.rp(oit.price) + ' × ' + oit.qty + ' = <b>' + K.rp((oit.price || 0) * (oit.qty || 0)) + '</b></div>' +
          '<div class="k-t2" style="color:var(--gold)">' + T('Menu sudah dihapus — item tetap dihitung di tagihan ini') + '</div></div></div>';
      }
    }
    var sub = this.cartTotal(); // sudah termasuk item yatim (M2)
    h += '<div style="margin-top:10px">';
    h += T('<div class="k-fld"><label>Diskon</label><div class="k-frow">') +
      '<input class="k-in" id="kDisc" type="number" inputmode="numeric" placeholder="0" value="' + (editing ? etx.disc : 0) + '">' +
      '<select class="k-sel" id="kDiscType" style="max-width:110px"><option value="rp">Rp</option><option value="pct">%</option></select></div></div>';
    h += T('<div class="k-fld"><label>Meja / Nama pelanggan (opsional)</label>') +
      T('<input class="k-in" id="kNote" placeholder="cth: Meja 3" value="') + K.esc(editing ? (etx.note || '') : '') + '"></div>';
    if (editing) {
      h += T('<p class="k-small k-muted" style="margin:2px 0 10px">Mode tambah pesanan — tagihan tetap <b>belum dibayar</b>. Stok dihitung ulang otomatis saat disimpan. <a style="color:var(--brand);cursor:pointer" onclick="Kasir.cancelEdit()">batalkan edit</a></p>');
      h += '<div id="kCustBox">' + T('<div class="k-fld"><label>Nama / meja (opsional)</label>') +
        T('<input class="k-in" id="kCust" placeholder="cth: Meja 3, Bang Joko" value="') + K.esc(etx.customer || '') + '"></div></div>';
    } else {
      h += T('<div class="k-fld"><label>Metode pembayaran</label><div class="k-paygrid">') +
        this.payBtn('Tunai', '💵') + this.payBtn('QRIS', '📱') +
        this.payBtn('Transfer', '🏦') + this.payBtn('E-Wallet', '👛') +
        this.payBtn('Belum Dibayar', '📝') + '</div></div>';
      var isTag = this.payMethod === 'Belum Dibayar';
      if (!this._billType) this._billType = this.billDefaultType();
      var bt = this._billType;
      if (isTag) {
        /* pemilih dua versi bon: Bon Meja (kunjungan) vs Piutang Bertempo */
        h += '<div class="k-fld"><label>' + T('Jenis bon') + '</label><div class="k-seg">' +
          '<button class="' + (bt === 'kunjungan' ? 'k-on' : '') + '" onclick="Kasir.setBillType(\'kunjungan\')">🪑 ' + T('Bon Meja') + '</button>' +
          '<button class="' + (bt === 'tempo' ? 'k-on' : '') + '" onclick="Kasir.setBillType(\'tempo\')">⏳ ' + T('Piutang Bertempo') + '</button></div></div>';
      }
      if (isTag && bt === 'kunjungan') {
        /* Bon Meja: identitas fleksibel — nomor meja ATAU nama (salah satu cukup), tanpa tempo/proyek */
        h += '<div id="kCustBox"><div class="k-fld"><label>' + T('Nama pelanggan') + '</label>' +
          '<input class="k-in" id="kCust" placeholder="' + T('cth: Bang Joko') + '"></div>' +
          '<div class="k-fld"><label>' + T('Nomor meja') + '</label>' +
          '<input class="k-in" id="kTable" inputmode="numeric" placeholder="' + T('cth: 3') + '"></div>' +
          '<p class="k-small k-muted" style="margin:2px 0 0">' + T('Isi nomor meja atau nama pelanggan — salah satu cukup.') + '</p></div>';
      } else {
        h += '<div id="kCustBox" style="display:' + (isTag ? 'block' : 'none') + T('"><div class="k-fld"><label>Nama / meja (opsional)</label>') +
          T('<input class="k-in" id="kCust" placeholder="cth: Meja 3, Bang Joko"></div></div>');
      }
      /* Mode Bangunan + Bertempo: bon bisa diikat ke proyek + tanggal tempo */
      if (typeof BizMode !== 'undefined' && BizMode.id() === 'bangunan') {
        h += '<div id="kProjBox" style="display:' + (isTag && bt === 'tempo' ? 'block' : 'none') + '">' +
          '<div class="k-fld"><label>' + T('Nama proyek (bon proyek, opsional)') + '</label>' +
          '<input class="k-in" id="kProj" placeholder="' + T('cth: Renovasi Pak Haji') + '"></div>' +
          '<div class="k-fld"><label>' + T('Jatuh tempo / tempo (opsional)') + '</label>' +
          '<input class="k-in" id="kDue" type="date"></div></div>';
      }
    }
    h += '<div id="kCashBox" style="display:' + (!editing && this.payMethod === 'Tunai' ? 'block' : 'none') + T('"><div class="k-fld"><label>Uang diterima</label>') +
      '<input class="k-in" id="kCash" type="number" inputmode="numeric" placeholder="' + sub + '">' +
      '<div class="k-cashgrid">' +
      T('<button class="k-cash" onclick="Kasir.setCash(') + sub + T(')">Uang pas</button>') +
      T('<button class="k-cash" onclick="Kasir.setCash(10000)">10rb</button>') +
      T('<button class="k-cash" onclick="Kasir.setCash(20000)">20rb</button>') +
      T('<button class="k-cash" onclick="Kasir.setCash(50000)">50rb</button>') +
      T('<button class="k-cash" onclick="Kasir.setCash(100000)">100rb</button>') +
      T('<button class="k-cash" onclick="Kasir.setCash(150000)">150rb</button></div></div></div>');
    h += T('<div class="k-total-row"><span>Subtotal</span><span>') + K.rp(sub) + '</span></div>';
    h += T('<div class="k-total-row"><span>Diskon</span><span id="kDiscView">Rp0</span></div>');
    h += T('<div class="k-total-row k-grand"><span>Total</span><span class="k-money" id="kGrandView">') + K.rp(sub) + '</span></div>';
    h += T('<div class="k-total-row" id="kChangeRow" style="display:none"><span>Kembalian</span><span class="k-money" id="kChangeView" style="color:var(--green)">Rp0</span></div>');
    h += editing
      ? T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeSheet()">Tutup</button>') +
        T('<button class="k-btn k-pri" onclick="Kasir.saveEdit()">💾 Simpan Perubahan</button></div></div>')
      : T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeSheet()">Tutup</button>') +
        T('<button class="k-btn k-pri" onclick="Kasir.pay()">') + (this.payMethod === 'Belum Dibayar' ? T('📝 Simpan Tagihan') : T('💰 Bayar')) + '</button></div></div>';
    UI.openSheet(h);
    var self = this;
    document.getElementById('kDisc').oninput = function () { self.recalc(); };
    document.getElementById('kDiscType').onchange = function () { self.recalc(); };
    document.getElementById('kCash').oninput = function () { self.recalc(); };
  },

  cartBarTap: function () {
    if (this._editingTagId) this.openCart(); // lanjutkan mode tambah pesanan
    else this.openCartFresh();
  },

  openCartFresh: function () {
    this._editingTagId = null;
    this.payMethod = 'Tunai';
    this._billType = this.billDefaultType();
    this.openCart();
  },

  payBtn: function (name, emoji) {
    return '<button class="k-pay' + (this.payMethod === name ? ' k-on' : '') +
      T('" onclick="Kasir.setPay(\'') + name + '\')"><span class="k-pe">' + emoji + '</span>' + I18N.payName(name) + '</button>';
  },
  setPay: function (name) {
    this.payMethod = name;
    var btns = document.querySelectorAll('#kSheet .k-pay');
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove('k-on');
    // tandai ulang via render ulang grid pay
    this.openCartKeep();
  },
  openCartKeep: function () {
    // buka ulang sheet tapi pertahankan input user
    var disc = document.getElementById('kDisc') ? document.getElementById('kDisc').value : '0';
    var dt = document.getElementById('kDiscType') ? document.getElementById('kDiscType').value : 'rp';
    var cash = document.getElementById('kCash') ? document.getElementById('kCash').value : '';
    var note = document.getElementById('kNote') ? document.getElementById('kNote').value : '';
    var cust = document.getElementById('kCust') ? document.getElementById('kCust').value : '';
    var tbl = document.getElementById('kTable') ? document.getElementById('kTable').value : '';
    var proj = document.getElementById('kProj') ? document.getElementById('kProj').value : '';
    var due = document.getElementById('kDue') ? document.getElementById('kDue').value : '';
    this.openCart();
    if (document.getElementById('kDisc')) document.getElementById('kDisc').value = disc;
    if (document.getElementById('kDiscType')) document.getElementById('kDiscType').value = dt;
    if (document.getElementById('kCash')) document.getElementById('kCash').value = cash;
    if (document.getElementById('kNote')) document.getElementById('kNote').value = note;
    if (document.getElementById('kCust')) document.getElementById('kCust').value = cust;
    if (document.getElementById('kTable')) document.getElementById('kTable').value = tbl;
    if (document.getElementById('kProj')) document.getElementById('kProj').value = proj;
    if (document.getElementById('kDue')) document.getElementById('kDue').value = due;
    this.recalc();
  },
  setCash: function (v) {
    document.getElementById('kCash').value = v;
    this.recalc();
  },

  calc: function () {
    var sub = this.cartTotal();
    var discRaw = Math.max(0, K.num(document.getElementById('kDisc') ? document.getElementById('kDisc').value : 0));
    var dt = document.getElementById('kDiscType') ? document.getElementById('kDiscType').value : 'rp';
    var disc = dt === 'pct' ? Math.round(sub * Math.min(discRaw, 100) / 100) : Math.min(discRaw, sub);
    var total = sub - disc;
    var cash = K.num(document.getElementById('kCash') ? document.getElementById('kCash').value : 0);
    return { sub: sub, disc: disc, discRaw: discRaw, discType: dt, total: total, cash: cash, change: cash - total };
  },
  recalc: function () {
    var c = this.calc();
    var dv = document.getElementById('kDiscView');
    if (dv) dv.textContent = K.rp(c.disc);
    var gv = document.getElementById('kGrandView');
    if (gv) gv.textContent = K.rp(c.total);
    var cr = document.getElementById('kChangeRow');
    if (cr) {
      if (this.payMethod === 'Tunai' && c.cash > 0) {
        cr.style.display = 'flex';
        document.getElementById('kChangeView').textContent = K.rp(Math.max(c.change, 0));
      } else cr.style.display = 'none';
    }
  },

  pay: function () {
    var c = this.calc();
    var ids = Object.keys(this.cart);
    if (!ids.length) return;
    var isTag = this.payMethod === 'Belum Dibayar';
    var bt = isTag ? (this._billType || this.billDefaultType()) : '';
    var tbl = '';
    if (isTag && bt === 'kunjungan') {
      tbl = document.getElementById('kTable') ? document.getElementById('kTable').value.trim() : '';
      var custV = document.getElementById('kCust') ? document.getElementById('kCust').value.trim() : '';
      if (!tbl && !custV) { UI.toast(T('Bon Meja butuh nomor meja atau nama pelanggan')); return; }
    }
    // cek stok
    var kurang = [];
    for (var i = 0; i < ids.length; i++) {
      var m = KDB.menuById(ids[i]);
      if (m && m.track && this.cart[ids[i]] > m.stock) kurang.push(m.name + ' (sisa ' + m.stock + ')');
    }
    if (kurang.length) { UI.toast(T('Stok kurang: ') + kurang.join(', ')); return; }
    // susun transaksi — qty item = qty TAMPIL (satuan pilihan pembeli);
    // baseQty = qty satuan dasar (yang mengurangi stok). Tanpa konversi: baseQty == qty.
    // M4 (audit 30 Okt 2026): qty <= 0 DITOLAK & harga di-clamp >= 0 di sini —
    // state korup/hasil sync tidak boleh membalik stok atau total.
    // M5: subtotal dihitung dari item yang SUDAH dibulatkan (3 desimal),
    // bukan dari keranjang mentah — struk & total tidak lagi selisih.
    var items = [];
    for (var j = 0; j < ids.length; j++) {
      var mm = KDB.menuById(ids[j]);
      if (!mm) continue;
      var qBase = this.cart[ids[j]];
      if (!(qBase > 0)) { UI.toast(T('Jumlah item tidak valid — transaksi dibatalkan')); return; }
      var kgu = K.isKg(mm);
      var un = this.cartUnit[ids[j]];
      var udef = un ? this.unitDef(mm, un) : null;
      var qDisp = udef ? this.dispQty(mm, qBase) : qBase;
      if (kgu) { qBase = Math.round(qBase * 1000) / 1000; qDisp = Math.round(qDisp * 1000) / 1000; }
      var sn = this.cartPrice[ids[j]];
      items.push({ id: mm.id, name: sn ? sn.name : mm.name, price: Math.max(0, this.linePrice(mm, qBase)),
        cost: sn ? (sn.cost || 0) : (mm.cost || 0), qty: qDisp, baseQty: qBase,
        unit: udef ? un : (kgu ? 'kg' : (mm.unit && mm.unit !== 'pcs' ? mm.unit : 'pcs')),
        ws: sn ? (sn.ws ? 1 : 0) : (udef ? 0 : (this.isWholesale(mm, qBase) ? 1 : 0)), note: (this.cartNote[ids[j]] || '').trim() });
    }
    if (!items.length) return;
    var sub = 0;
    for (var s2 = 0; s2 < items.length; s2++) sub += Math.round(items[s2].price * items[s2].qty);
    var disc = c.discType === 'pct' ? Math.round(sub * Math.min(c.discRaw, 100) / 100) : Math.min(c.discRaw, sub);
    var total = sub - disc;
    if (!isTag && this.payMethod === 'Tunai' && c.cash < total) { UI.toast(T('Uang kurang ') + K.rp(total - c.cash)); return; }
    // kurangi stok (sesudah semua validasi lolos)
    for (var d2 = 0; d2 < items.length; d2++) {
      var md = KDB.menuById(items[d2].id);
      if (md && md.track) {
        md.stock = Math.round((md.stock - items[d2].baseQty) * 1000) / 1000;
        KDB.addStockLog(md.id, md.name, 'out', items[d2].baseQty, md.stock, 'Penjualan #' + K.pad(KDB.data.nextNo, 4));
      }
    }
    var D = KDB.data;
    var cashier = (KDB.activeEmployee && KDB.activeEmployee()) || null;
    var bangMode = (typeof BizMode !== 'undefined' && BizMode.id() === 'bangunan');
    var tx = {
      id: K.uid(), no: D.nextNo, at: Date.now(), updatedAt: Date.now(), items: items,
      cashierId: cashier ? cashier.id : '',
      cashierName: cashier ? cashier.name : (D.settings.userName || ''),
      cashierRole: cashier ? cashier.role : '',
      sub: sub, disc: disc, total: total,
      pay: this.payMethod, cash: this.payMethod === 'Tunai' ? c.cash : (isTag ? 0 : total),
      change: this.payMethod === 'Tunai' ? Math.max(c.cash - total, 0) : 0,
      note: document.getElementById('kNote') ? document.getElementById('kNote').value.trim() : '',
      customer: isTag ? (document.getElementById('kCust') ? document.getElementById('kCust').value.trim() : '') : '',
      billType: isTag ? bt : '',
      table: (isTag && bt === 'kunjungan') ? tbl : '',
      project: (isTag && bt === 'tempo' && bangMode && document.getElementById('kProj')) ? document.getElementById('kProj').value.trim() : '',
      dueDate: (isTag && bt === 'tempo' && bangMode && document.getElementById('kDue')) ? document.getElementById('kDue').value : '',
      mode: (typeof BizMode !== 'undefined') ? BizMode.id() : '',
      status: isTag ? 'unpaid' : 'paid',
      voided: false
    };
    D.nextNo++;
    D.txs.unshift(tx);
    KDB.save();
    this.cart = {};
    this.cartUnit = {};
    this.cartNote = {};
    this.cartPrice = {};
    this._editOrphans = [];
    this._editingTagId = null;
    this.lastTx = tx;
    UI.closeSheet();
    this.mode = 'struk'; // struk langsung tampil agar bisa print/bagikan (juga untuk tagihan)
    App.rerender();
  },

  /* ---------- struk ---------- */
  receiptText: function (tx) {
    var s = KDB.data.settings;
    var L = [];
    function mid(t) {
      t = String(t);
      var w = 32, pad = Math.max(0, Math.floor((w - t.length) / 2));
      return new Array(pad + 1).join(' ') + t;
    }
    function row(l, r) {
      l = String(l); r = String(r);
      var sp = 32 - l.length - r.length;
      return l + (sp > 0 ? new Array(sp + 1).join(' ') : ' ') + r;
    }
    L.push(mid(s.shop.toUpperCase()));
    if (s.addr) L.push(mid(s.addr));
    L.push('--------------------------------');
    L.push(row('No: #' + K.pad(tx.no, 4), K.fmtDateTime(tx.at)));
    /* Q5 (audit 30 Okt 2026): kasir dari SNAPSHOT tx (bukan kasir saat
       ini; fallback nama saat ini hanya untuk tx warisan tanpa
       snapshot); karakter non-ASCII dibuang per karakter agar nama
       tidak hilang seluruhnya dari struk teks. */
    var uname = String(tx.cashierName || s.userName || '').replace(/[^\x20-\x7E]/g, '').trim();
    if (uname) L.push(row(T('Kasir'), uname));
    if (tx.note) L.push(row('Ket:', tx.note));
    L.push('--------------------------------');
    for (var i = 0; i < tx.items.length; i++) {
      var it = tx.items[i];
      var ikg = it.unit === 'kg';
      var iunit = !ikg && it.unit && it.unit !== 'pcs';
      var wmark = it.ws ? ' (' + this.wsWord(tx) + ')' : '';
      L.push(ikg ? K.fmtQty(it.qty, 'kg') + ' kg x ' + it.name
        : iunit ? this.fmtQtyAny(it.qty, it.unit) + ' ' + it.unit + ' x ' + it.name + wmark
        : it.qty + 'x ' + it.name + wmark);
      L.push(row('   @' + K.rp(it.price) + (ikg ? '/kg' : (iunit ? '/' + it.unit : '')), K.rp(it.price * it.qty)));
      if (it.note) L.push(('   > ' + it.note).slice(0, 32)); // catatan dapur, max 32 kolom
    }
    /* Q5: identitas bon (nama/meja/proyek/tempo) dicetak untuk SEMUA
       status — menyamakan aturan struk teks dengan struk HTML. */
    if (tx.customer) L.push(row(T('Nama'), tx.customer));
    if (tx.table) L.push(row(T('Meja'), tx.table));
    if (tx.project) L.push(row(T('Proyek'), tx.project));
    if (tx.dueDate) L.push(row(T('Tempo'), this.fmtDue(tx.dueDate)));
    L.push('--------------------------------');
    L.push(row('Subtotal', K.rp(tx.sub)));
    if (tx.disc > 0) L.push(row(T('Diskon'), '-' + K.rp(tx.disc)));
    L.push(row(T('TOTAL'), K.rp(tx.total)));
    if (tx.status === 'unpaid') {
      L.push(row('Status', T('BELUM DIBAYAR')));
    } else {
      if (tx.orderId && tx.dpPaid > 0) L.push(row(T('DP (sudah dibayar)'), K.rp(tx.dpPaid)));
      /* A-10: uang di baris ini = pelunasan saja (DP terpisah di atas) */
      L.push(row(tx.pay + (tx.orderId && tx.dpPaid > 0 ? ' ' + T('(pelunasan)') : ''), K.rp(tx.cash)));
      if (tx.pay === 'Tunai') L.push(row(T('Kembalian'), K.rp(tx.change)));
    }
    L.push('--------------------------------');
    if (s.foot) L.push(mid(s.foot));
    return L.join('\n');
  },

  renderStruk: function () {
    var tx = this.lastTx;
    if (!tx) { this.mode = 'kasir'; return this.render(); }
    var s = KDB.data.settings;
    var unpaid = this.isUnpaid(tx);
    var h = '<div class="k-card"><h3>' + (unpaid ? T('⏳ Tagihan Tersimpan') : T('✅ Pembayaran Berhasil')) + '</h3>';
    h += T('<div class="k-struk">');
    if (K.safeImg(s.logo) && s.receiptLogo !== false) h += '<div class="k-c" style="margin-bottom:6px"><img src="' + K.safeImg(s.logo) + '" alt="" style="max-height:64px;max-width:180px;object-fit:contain"></div>';
    h += T('<div class="k-c k-b">') + K.esc(s.shop.toUpperCase()) + '</div>';
    if (s.addr) h += '<div class="k-c">' + K.esc(s.addr) + '</div>';
    h += '<hr><div class="k-srow"><span>No: #' + K.pad(tx.no, 4) + '</span><span>' + K.fmtDateTime(tx.at) + '</span></div>';
    if (tx.cashierName || s.userName) h += T('<div class="k-srow"><span>Kasir:</span><span>') + K.esc(tx.cashierName || s.userName) + '</span></div>';
    if (tx.customer) h += T('<div class="k-srow"><span>Nama:</span><span>') + K.esc(tx.customer) + '</span></div>';
    if (tx.table) h += '<div class="k-srow"><span>' + T('Meja') + ':</span><span>' + K.esc(tx.table) + '</span></div>';
    if (tx.project) h += '<div class="k-srow"><span>' + T('Proyek') + ':</span><span>' + K.esc(tx.project) + '</span></div>';
    if (tx.dueDate) h += '<div class="k-srow"><span>' + T('Jatuh tempo') + ':</span><span>' + this.fmtDue(tx.dueDate) + '</span></div>';
    if (tx.note) h += '<div class="k-srow"><span>Ket:</span><span>' + K.esc(tx.note) + '</span></div>';
    h += '<hr>';
    for (var i = 0; i < tx.items.length; i++) {
      var it = tx.items[i];
      var hkg = it.unit === 'kg';
      var hunit = !hkg && it.unit && it.unit !== 'pcs';
      h += '<div>' + (hkg ? K.fmtQty(it.qty, 'kg') + ' kg x ' : (hunit ? this.fmtQtyAny(it.qty, it.unit) + ' ' + K.esc(it.unit) + ' x ' : it.qty + 'x ')) + K.esc(it.name) + (it.ws ? ' <span class="k-tag k-grn">' + (tx.mode === 'bangunan' ? T('PROYEK') : T('GROSIR')) + '</span>' : '') + '</div>' +
        '<div class="k-srow"><span>&nbsp;&nbsp;@' + K.rp(it.price) + (hkg ? '/kg' : (hunit ? '/' + K.esc(it.unit) : '')) + '</span><span>' + K.rp(it.price * it.qty) + '</span></div>';
      if (it.note) h += '<div class="k-snote">📝 ' + K.esc(it.note) + '</div>';
    }
    h += '<hr><div class="k-srow"><span>Subtotal</span><span>' + K.rp(tx.sub) + '</span></div>';
    if (tx.disc > 0) h += T('<div class="k-srow"><span>Diskon</span><span>-') + K.rp(tx.disc) + '</span></div>';
    h += T('<div class="k-srow k-b"><span>TOTAL</span><span>') + K.rp(tx.total) + '</span></div>';
    if (unpaid) {
      h += T('<div class="k-srow k-b"><span>Status</span><span>BELUM DIBAYAR</span></div>');
    } else {
      if (tx.orderId && tx.dpPaid > 0) h += T('<div class="k-srow"><span>DP (sudah dibayar)</span><span>') + K.rp(tx.dpPaid) + '</span></div>';
      /* A-10: label metode + "(pelunasan)" untuk tx order ber-DP */
      h += '<div class="k-srow"><span>' + K.esc(tx.pay) + (tx.orderId && tx.dpPaid > 0 ? ' ' + T('(pelunasan)') : '') + '</span><span>' + K.rp(tx.cash) + '</span></div>';
      if (tx.pay === 'Tunai') h += T('<div class="k-srow"><span>Kembalian</span><span>') + K.rp(tx.change) + '</span></div>';
    }
    h += '<hr><div class="k-c">' + K.esc(s.foot || T('Terima kasih!')) + '</div></div></div>';
    h += T('<div class="k-btn-row"><button class="k-btn k-sec" onclick="Kasir.shareStruk()">📤 Bagikan Struk</button>') +
      T('<button class="k-btn k-sec" onclick="Printer.printStruk(Kasir.lastTx)">🖨️ Cetak</button>') +
      T('<button class="k-btn k-pri" onclick="Kasir.baru()">+ Transaksi Baru</button></div>');
    return h;
  },
  shareStruk: function () {
    if (!this.lastTx) return;
    UI.shareText(T('Struk #') + K.pad(this.lastTx.no, 4), this.receiptText(this.lastTx));
  },
  baru: function () { this.mode = 'kasir'; this.lastTx = null; App.rerender(); },

  /* ---------- daftar tagihan (belum dibayar): dua versi bon ---------- */
  tagihanHtml: function () {
    var tab = this.billTab();
    var meja = this.billList('kunjungan');
    var tempo = this.billList('tempo');
    var h = '<div class="k-seg" style="margin-bottom:10px">' +
      '<button class="' + (tab === 'meja' ? 'k-on' : '') + '" onclick="Kasir.setBillTab(\'meja\')">🪑 ' + T('Bon Meja') + (meja.length ? ' (' + meja.length + ')' : '') + '</button>' +
      '<button class="' + (tab === 'tempo' ? 'k-on' : '') + '" onclick="Kasir.setBillTab(\'tempo\')">⏳ ' + T('Piutang Bertempo') + (tempo.length ? ' (' + tempo.length + ')' : '') + '</button></div>';
    return h + (tab === 'meja' ? this.bonMejaHtml(meja) : this.bonTempoHtml(tempo));
  },

  /* urutan nomor meja: angka menaik dulu, lalu teks A–Z */
  _tableCmp: function (a, b) {
    a = String(a == null ? '' : a); b = String(b == null ? '' : b);
    var na = parseFloat(a), nb = parseFloat(b);
    var aNum = a.trim() !== '' && !isNaN(na), bNum = b.trim() !== '' && !isNaN(nb);
    if (aNum && bNum) return na - nb;
    if (aNum) return -1;
    if (bNum) return 1;
    return a < b ? -1 : (a > b ? 1 : 0);
  },

  /* Label identitas Bon Meja apa adanya:
     meja + nama → "Meja 5 — Budi"; meja saja → "Meja 5"; nama saja → "a.n. Budi". */
  billLabel: function (t) {
    if (t.table && t.customer) return T('Meja ') + t.table + ' — ' + t.customer;
    if (t.table) return T('Meja ') + t.table;
    if (t.customer) return T('a.n. ') + t.customer;
    return T('Tanpa nama');
  },
  billSearch: function (v) {
    this._billQ = v;
    var el = document.getElementById('kBillList');
    if (el) el.innerHTML = this.bonMejaListHtml(this.billList('kunjungan'));
  },

  /* Bon Meja: tab kunjungan yang masih TERBUKA. Urutan: bernomor meja (angka menaik,
     dikelompokkan per meja) dulu, lalu tab atas-nama saja. Tanpa jatuh tempo &
     tanpa pengingat — ditutup lewat "Bayar & Tutup". */
  bonMejaHtml: function (list) {
    var MAG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>';
    var h = '<div class="k-swrap" style="margin-bottom:10px"><span class="k-sicon">' + MAG + '</span>' +
      '<input class="k-search" id="kBillQ" placeholder="' + T('Cari meja / nama') + '" value="' + K.esc(this._billQ || '') + '" oninput="Kasir.billSearch(this.value)"></div>';
    return h + '<div id="kBillList">' + this.bonMejaListHtml(list) + '</div>';
  },
  bonMejaListHtml: function (list) {
    var self = this;
    if (!list.length) return UI.empty('🪑', T('Belum ada Bon Meja terbuka'), T('Pelanggan yang pesan dulu dan bayar pas mau pulang muncul di sini, terurut per meja.'), '');
    var q = (this._billQ || '').trim().toLowerCase();
    var view = list;
    if (q) {
      view = list.filter(function (t) {
        return self.billLabel(t).toLowerCase().indexOf(q) >= 0 ||
          String(t.customer || '').toLowerCase().indexOf(q) >= 0 ||
          String(t.table || '').toLowerCase().indexOf(q) >= 0;
      });
      if (!view.length) return UI.empty('🔍', T('Tidak ada tab yang cocok'), T('Coba kata kunci lain — cari dari nomor meja atau nama pelanggan.'), '');
    }
    var tot = 0, i;
    for (i = 0; i < list.length; i++) tot += list[i].total;
    var h = '<div class="k-card" style="margin-bottom:10px;border-color:var(--gold)">' +
      '<div class="k-row"><div><b>🪑 ' + T('Total tab terbuka') + '</b><div class="k-small k-muted">' + list.length + ' ' + T('tab belum ditutup') + '</div></div>' +
      '<div class="k-money">' + K.rp(tot) + '</div></div></div>';
    var cardHtml = function (t) {
      return '<div class="k-card" style="margin-bottom:8px;border-color:var(--gold)"><div class="k-row">' +
        '<div style="flex:1;cursor:pointer" onclick="Kasir.detail(\'' + K.escQ(t.id) + '\')">' +
        '<b>' + K.esc(self.billLabel(t)) + '</b>' +
        '<div class="k-small k-muted">#' + K.pad(t.no, 4) + ' • ' + K.fmtTime(t.at) + ' • ' + self.itemsSummary(t) + (t.disc > 0 ? T(' • disc ') + K.rp(t.disc) : '') + '</div>' +
        '</div>' +
        '<div style="text-align:right"><div class="k-money">' + K.rp(t.total) + '</div>' +
        '<button class="k-btn k-pri" style="margin-top:6px;padding:8px 16px;font-size:14px" onclick="event.stopPropagation();Kasir.bayarTagihan(\'' + K.escQ(t.id) + '\')">💰 ' + T('Bayar & Tutup') + '</button>' +
        '<div style="margin-top:6px"><button class="k-btn k-sec" style="padding:6px 12px;font-size:13px" onclick="event.stopPropagation();Kasir.tambahPesanan(\'' + K.escQ(t.id) + '\')">➕ ' + T('Tambah') + '</button></div>' +
        '</div></div></div>';
    };
    /* 1) tab bernomor meja: urut angka, header per meja */
    var withTable = view.filter(function (t) { return !!t.table; })
      .sort(function (a, b) { return self._tableCmp(a.table, b.table) || (a.at - b.at); });
    var lastTable = null;
    for (i = 0; i < withTable.length; i++) {
      var t = withTable[i];
      if (t.table !== lastTable) {
        lastTable = t.table;
        var sub = 0, cnt = 0;
        for (var k = 0; k < withTable.length; k++) if (withTable[k].table === t.table) { sub += withTable[k].total; cnt++; }
        h += '<div class="k-proj-head">🪑 ' + T('Meja ') + K.esc(t.table) + ' — ' + cnt + ' tab • ' + K.rp(sub) + '</div>';
      }
      h += cardHtml(t);
    }
    /* 2) tab atas-nama saja: sesudah semua meja, header pemisah jelas */
    var byName = view.filter(function (t) { return !t.table; })
      .sort(function (a, b) {
        var an = String(a.customer || '').toLowerCase(), bn = String(b.customer || '').toLowerCase();
        return an < bn ? -1 : (an > bn ? 1 : (a.at - b.at));
      });
    if (byName.length) {
      var subN = 0;
      for (i = 0; i < byName.length; i++) subN += byName[i].total;
      h += '<div class="k-proj-head">🙋 ' + T('Atas nama') + ' — ' + byName.length + ' tab • ' + K.rp(subN) + '</div>';
      for (i = 0; i < byName.length; i++) h += cardHtml(byName[i]);
    }
    return h;
  },

  /* Piutang Bertempo: perilaku versi lama persis (per hari; Bangunan per proyek + tempo) */
  bonTempoHtml: function (list) {
    if (!list.length) return UI.empty('⏳', T('Tidak ada tagihan'), T('Transaksi "Belum Dibayar" muncul di sini. Cocok untuk pelanggan yang pesan dulu, bayar belakangan.'), '');
    var bang = (typeof BizMode !== 'undefined' && BizMode.id() === 'bangunan');
    var self = this;
    var totT = 0;
    for (var txi = 0; txi < list.length; txi++) totT += list[txi].total;
    var h = '<div class="k-card" style="margin-bottom:10px;border-color:var(--gold)">' +
      T('<div class="k-row"><div><b>⏳ Total belum bayar</b><div class="k-small k-muted">') + list.length + T(' tagihan belum dibayar</div></div>') +
      '<div class="k-money">' + K.rp(totT) + '</div></div></div>';
    var rowHtml = function (t) {
      var di = bang ? self.dueInfo(t) : null;
      var diCol = di ? (di.k === 'late' ? 'var(--red)' : (di.k === 'ok' ? 'var(--muted)' : '#B7791F')) : '';
      return '<div class="k-card" style="margin-bottom:8px;border-color:var(--gold)"><div class="k-row">' +
        '<div style="flex:1;cursor:pointer" onclick="Kasir.detail(\'' + K.escQ(t.id) + '\')">' +
        '<b>#' + K.pad(t.no, 4) + '</b> <span class="k-tag">' + (t.customer ? K.esc(t.customer) : T('Tanpa nama')) + '</span>' +
        '<div class="k-small k-muted">' + K.fmtTime(t.at) + ' • ' + self.itemsSummary(t) + (t.disc > 0 ? T(' • disc ') + K.rp(t.disc) : '') + '</div>' +
        (di ? '<div class="k-small" style="font-weight:700;color:' + diCol + '">⏰ ' + di.label + '</div>' : '') +
        '</div>' +
        '<div style="text-align:right"><div class="k-money">' + K.rp(t.total) + '</div>' +
        '<button class="k-btn k-pri" style="margin-top:6px;padding:8px 16px;font-size:14px" onclick="event.stopPropagation();Kasir.bayarTagihan(\'' + K.escQ(t.id) + '\')">💰 ' + T('Bayar') + '</button>' +
        '<div style="margin-top:6px"><button class="k-btn k-sec" style="padding:6px 12px;font-size:13px" onclick="event.stopPropagation();Kasir.tambahPesanan(\'' + K.escQ(t.id) + '\')">➕ ' + T('Tambah') + '</button>' +
        (bang ? ' <button class="k-btn k-sec" style="padding:6px 12px;font-size:13px" onclick="event.stopPropagation();Kasir.projSheet(\'' + K.escQ(t.id) + '\')">📁 ' + T('Proyek') + '</button>' : '') +
        '</div></div></div>';
    };
    if (!bang) {
      var lastDay = '';
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        var day = K.fmtDate(t.at);
        if (day !== lastDay) { h += '<div class="k-small k-muted" style="margin:12px 2px 4px;font-weight:700">' + day + '</div>'; lastDay = day; }
        h += rowHtml(t);
      }
      return h;
    }
    /* Mode Bangunan: kelompok per proyek — yang terlambat tempo tampil paling atas */
    var groups = {}, order = [];
    for (var gi = 0; gi < list.length; gi++) {
      var g = list[gi].project || '';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(list[gi]);
    }
    var rank = function (gname) {
      if (gname === '') return 4;
      var worst = 3;
      for (var x = 0; x < groups[gname].length; x++) {
        var di = self.dueInfo(groups[gname][x]);
        if (!di) continue;
        var r = di.k === 'late' ? 0 : (di.k === 'ok' ? 2 : 1);
        if (r < worst) worst = r;
      }
      return worst;
    };
    order.sort(function (a, b) { return rank(a) - rank(b); });
    for (var oi = 0; oi < order.length; oi++) {
      var gn = order[oi], gt = 0, gDue = null;
      for (var gj = 0; gj < groups[gn].length; gj++) {
        gt += groups[gn][gj].total;
        var gd = self.dueInfo(groups[gn][gj]);
        if (gd && (!gDue || gd.k === 'late')) gDue = gd;
      }
      h += '<div class="k-proj-head">📁 ' + (gn ? K.esc(gn) : T('Tanpa proyek')) +
        ' — ' + T('sisa') + ' ' + K.rp(gt) + (gDue ? ' • ⏰ ' + gDue.label : '') + '</div>';
      for (var gk = 0; gk < groups[gn].length; gk++) h += rowHtml(groups[gn][gk]);
    }
    return h;
  },

  /* atur nama proyek + tempo pada tagihan yang sudah ada (Mode Bangunan) */
  projSheet: function (id) {
    var tx = this.txById(id);
    if (!tx || !this.isUnpaid(tx)) return;
    var h = T('<h3 class="k-sheet-t">📁 Bon Proyek #') + K.pad(tx.no, 4) + '</h3>' +
      '<div class="k-fld"><label>' + T('Nama proyek') + '</label>' +
      '<input class="k-in" id="pProj" value="' + K.esc(tx.project || '') + '" placeholder="' + T('cth: Renovasi Pak Haji') + '"></div>' +
      '<div class="k-fld"><label>' + T('Jatuh tempo / tempo') + '</label>' +
      '<input class="k-in" id="pDue" type="date" value="' + K.esc(tx.dueDate || '') + '"></div>' +
      T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeSheet()">Batal</button>') +
      '<button class="k-btn k-pri" onclick="Kasir.projSave(\'' + K.escQ(tx.id) + '\')">' + T('Simpan') + '</button></div>';
    UI.openSheet(h);
  },
  projSave: function (id) {
    var tx = this.txById(id);
    if (!tx) return;
    var pe = document.getElementById('pProj'), de = document.getElementById('pDue');
    if (pe) tx.project = pe.value.trim();
    if (de) tx.dueDate = de.value || '';
    tx.updatedAt = Date.now();
    KDB.save();
    UI.closeSheet();
    UI.toast(T('Bon proyek tersimpan'));
    App.rerender();
  },

  /* ---------- pelunasan tagihan ---------- */
  bayarTagihan: function (id) {
    var tx = this.txById(id);
    if (!tx || !this.isUnpaid(tx)) return;
    this._payTagId = id;
    this._payTagMethod = 'Tunai';
    this.bayarTagihanRender();
  },
  payBtnTag: function (name, emoji) {
    return '<button class="k-pay' + (this._payTagMethod === name ? ' k-on' : '') +
      T('" onclick="Kasir.setPayTag(\'') + name + '\')"><span class="k-pe">' + emoji + '</span>' + I18N.payName(name) + '</button>';
  },
  setPayTag: function (name) {
    this._payTagMethod = name;
    this.bayarTagihanRender();
  },
  bayarTagihanRender: function () {
    var tx = this.txById(this._payTagId);
    if (!tx || !this.isUnpaid(tx)) { UI.closeSheet(); return; }
    var h = T('<h3 class="k-sheet-t">💰 Bayar Tagihan #') + K.pad(tx.no, 4) + '</h3>';
    h += '<div class="k-small k-muted" style="margin-bottom:10px">' +
      (tx.customer ? K.esc(tx.customer) + ' • ' : '') + K.fmtDateTime(tx.at) + '</div>';
    h += T('<div class="k-fld"><label>Metode pembayaran</label><div class="k-paygrid">') +
      this.payBtnTag('Tunai', '💵') + this.payBtnTag('QRIS', '📱') +
      this.payBtnTag('Transfer', '🏦') + this.payBtnTag('E-Wallet', '👛') + '</div></div>';
    h += '<div id="kTagCashBox" style="display:' + (this._payTagMethod === 'Tunai' ? 'block' : 'none') + '">' +
      T('<div class="k-fld"><label>Uang diterima</label>') +
      '<input class="k-in" id="kTagCash" type="number" inputmode="numeric" placeholder="' + tx.total + '"></div></div>';
    h += T('<div class="k-total-row k-grand"><span>Total tagihan</span><span class="k-money">') + K.rp(tx.total) + '</span></div>';
    h += T('<div class="k-total-row" id="kTagChangeRow" style="display:none"><span>Kembalian</span><span class="k-money" id="kTagChangeView" style="color:var(--green)">Rp0</span></div>');
    h += T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeSheet()">Batal</button>') +
      T('<button class="k-btn k-pri" onclick="Kasir.confirmBayarTagihan()">✅ Konfirmasi Bayar</button></div>');
    UI.openSheet(h);
    var self = this;
    var kc = document.getElementById('kTagCash');
    if (kc) kc.oninput = function () { self.recalcTagihan(); };
  },

  /* stok tersedia; dlm mode edit termasuk qty tagihan yg akan dikembalikan saat simpan */
  availStock: function (id) {
    var m = KDB.menuById(id);
    if (!m) return 0;
    var s = m.stock;
    if (this._editingTagId) {
      var tx = this.txById(this._editingTagId);
      if (tx) for (var i = 0; i < tx.items.length; i++)
        if (tx.items[i].id === id) s = Math.round((s + (tx.items[i].baseQty != null ? tx.items[i].baseQty : tx.items[i].qty)) * 1000) / 1000;
    }
    return s;
  },

  /* ---------- tambah pesanan ke tagihan (mode edit) ---------- */
  tambahPesanan: function (id) {
    var tx = this.txById(id);
    if (!tx || !this.isUnpaid(tx)) return;
    var self = this;
    var mulai = function () { self._mulaiEdit(id); };
    if (Object.keys(this.cart).length && !this._editingTagId) {
      UI.confirm(T('Keranjang ada isinya — ganti dengan item tagihan ini?'), T('Ganti'), function () { mulai(); });
    } else mulai();
  },
  _mulaiEdit: function (id) {
    var tx = this.txById(id);
    if (!tx || !this.isUnpaid(tx)) return;
    this.cart = {};
    this.cartUnit = {};
    this.cartNote = {};
    this.cartPrice = {};
    this._editOrphans = [];
    for (var i = 0; i < tx.items.length; i++) {
      var it = tx.items[i];
      var im = KDB.menuById(it.id);
      if (!im) {
        /* M2 (audit 30 Okt 2026): item yang menunya terhapus TIDAK hilang
           diam-diam — diteruskan apa adanya (nama/harga snapshot) dan
           tetap tampil + terhitung selama edit. */
        this._editOrphans.push(it);
        continue;
      }
      this.cart[it.id] = (this.cart[it.id] || 0) + (it.baseQty != null ? it.baseQty : it.qty);
      /* M1: bekukan harga/modal/nama snapshot item tx — edit tidak boleh
         menilai ulang dengan harga menu terkini. Item BARU yang ditambah
         saat edit tidak punya snapshot -> harga menu saat itu. */
      if (!this.cartPrice[it.id]) {
        this.cartPrice[it.id] = { price: it.price || 0, cost: it.cost || 0, name: it.name || im.name, ws: it.ws ? 1 : 0 };
      }
      if (this.unitDef(im, it.unit)) this.cartUnit[it.id] = it.unit; // pulihkan satuan pilihan pembeli
      if (it.note) this.cartNote[it.id] = this.cartNote[it.id] ? this.cartNote[it.id] + ', ' + it.note : it.note;
    }
    this._editingTagId = id;
    this.payMethod = 'Belum Dibayar';
    this.mode = 'kasir';
    this.renderCartBar();
    App.rerender();
    UI.toast(T('✏️ Tambah pesanan #') + K.pad(tx.no, 4) + T(' — pilih menu, lalu simpan di keranjang') +
      (this._editOrphans.length ? T(' • ⚠️ ') + this._editOrphans.length + T(' item menunya sudah dihapus — tetap dihitung') : ''));
  },
  cancelEdit: function () {
    this.cart = {};
    this.cartUnit = {};
    this.cartNote = {};
    this.cartPrice = {};
    this._editOrphans = [];
    this._editingTagId = null;
    UI.closeSheet();
    this.renderCartBar();
  },
  saveEdit: function () {
    var tx = this.txById(this._editingTagId);
    if (!tx || !this.isUnpaid(tx)) { this._editingTagId = null; UI.closeSheet(); return; }
    var c = this.calc();
    var ids = Object.keys(this.cart);
    if (!ids.length && !this._editOrphans.length) { UI.toast(T('Keranjang kosong')); return; }
    /* M4: qty tidak valid ditolak SEBELUM stok lama dikembalikan */
    for (var v = 0; v < ids.length; v++) {
      if (!(this.cart[ids[v]] > 0)) { UI.toast(T('Jumlah item tidak valid — perubahan dibatalkan')); return; }
    }
    // stok item lama akan dikembalikan dulu → ketersediaan termasuk itu
    var kurang = [];
    for (var j = 0; j < ids.length; j++) {
      var mm = KDB.menuById(ids[j]);
      if (mm && mm.track && this.cart[ids[j]] > this.availStock(ids[j]))
        kurang.push(mm.name + ' (sisa ' + this.availStock(ids[j]) + ')');
    }
    if (kurang.length) { UI.toast(T('Stok kurang: ') + kurang.join(', ')); return; }
    // 1. kembalikan stok item lama (satuan DASAR)
    for (var k = 0; k < tx.items.length; k++) {
      var io = tx.items[k];
      var mo = KDB.menuById(io.id);
      if (mo && mo.track) {
        var iob = (io.baseQty != null ? io.baseQty : io.qty);
        mo.stock = Math.round((mo.stock + iob) * 1000) / 1000;
        KDB.addStockLog(mo.id, mo.name, 'in', iob, mo.stock, 'Edit tagihan #' + K.pad(tx.no, 4));
      }
    }
    // 2. susun item baru + kurangi stok (seperti pay, termasuk konversi satuan)
    var items = [];
    for (var n = 0; n < ids.length; n++) {
      var m2 = KDB.menuById(ids[n]);
      if (!m2) continue;
      var qB = this.cart[ids[n]];
      var kgu = K.isKg(m2);
      var unE = this.cartUnit[ids[n]];
      var udE = unE ? this.unitDef(m2, unE) : null;
      var qD = udE ? this.dispQty(m2, qB) : qB;
      if (kgu) { qB = Math.round(qB * 1000) / 1000; qD = Math.round(qD * 1000) / 1000; }
      /* M1: item lama memakai harga/modal/nama SNAPSHOT; item baru
         (tanpa snapshot) memakai harga menu saat ini. */
      var snE = this.cartPrice[ids[n]];
      items.push({ id: m2.id, name: snE ? snE.name : m2.name, price: Math.max(0, this.linePrice(m2, qB)),
        cost: snE ? (snE.cost || 0) : (m2.cost || 0), qty: qD, baseQty: qB,
        unit: udE ? unE : (kgu ? 'kg' : (m2.unit && m2.unit !== 'pcs' ? m2.unit : 'pcs')),
        ws: snE ? (snE.ws ? 1 : 0) : (udE ? 0 : (this.isWholesale(m2, qB) ? 1 : 0)), note: (this.cartNote[ids[n]] || '').trim() });
      if (m2.track) {
        m2.stock = Math.round((m2.stock - qB) * 1000) / 1000;
        KDB.addStockLog(m2.id, m2.name, 'out', qB, m2.stock, 'Edit tagihan #' + K.pad(tx.no, 4));
      }
    }
    /* M2: item yatim diteruskan apa adanya ke tagihan hasil edit */
    for (var o2 = 0; o2 < this._editOrphans.length; o2++) items.push(this._editOrphans[o2]);
    /* M5: total dari item terbulatkan (sama seperti pay) */
    var subE = 0;
    for (var s3 = 0; s3 < items.length; s3++) subE += Math.round((items[s3].price || 0) * (items[s3].qty || 0));
    var discE = c.discType === 'pct' ? Math.round(subE * Math.min(c.discRaw, 100) / 100) : Math.min(c.discRaw, subE);
    tx.items = items;
    tx.sub = subE;
    tx.disc = discE;
    tx.total = subE - discE;
    tx.updatedAt = Date.now();
    var noteEl = document.getElementById('kNote');
    if (noteEl) tx.note = noteEl.value.trim();
    var custEl = document.getElementById('kCust');
    if (custEl) tx.customer = custEl.value.trim();
    KDB.save();
    this.cart = {};
    this.cartUnit = {};
    this.cartNote = {};
    this.cartPrice = {};
    this._editOrphans = [];
    this._editingTagId = null;
    this.lastTx = tx;
    UI.closeSheet();
    this.mode = 'struk';
    App.rerender();
    UI.toast(T('✅ Tagihan #') + K.pad(tx.no, 4) + T(' diperbarui'));
  },

  recalcTagihan: function () {
    var tx = this.txById(this._payTagId);
    if (!tx) return;
    var cash = K.num(document.getElementById('kTagCash') ? document.getElementById('kTagCash').value : 0);
    var cr = document.getElementById('kTagChangeRow');
    if (cr) {
      if (this._payTagMethod === 'Tunai' && cash > 0) {
        cr.style.display = 'flex';
        document.getElementById('kTagChangeView').textContent = K.rp(Math.max(cash - tx.total, 0));
      } else cr.style.display = 'none';
    }
  },
  confirmBayarTagihan: function () {
    var tx = this.txById(this._payTagId);
    if (!tx || !this.isUnpaid(tx)) return;
    var method = this._payTagMethod || 'Tunai';
    var cash = K.num(document.getElementById('kTagCash') ? document.getElementById('kTagCash').value : 0);
    if (method === 'Tunai' && cash < tx.total) { UI.toast(T('Uang kurang ') + K.rp(tx.total - cash)); return; }
    tx.status = 'paid';
    tx.pay = method;
    tx.paidAt = Date.now();
    tx.updatedAt = Date.now();
    tx.cash = method === 'Tunai' ? cash : tx.total;
    tx.change = method === 'Tunai' ? Math.max(cash - tx.total, 0) : 0;
    KDB.save();
    this._payTagId = null;
    UI.closeSheet();
    UI.toast(T('Tagihan #') + K.pad(tx.no, 4) + T(' lunas ✅'));
    App.rerender();
  },

  /* Ringkasan isi tx utk daftar: item satuan non-pcs ditampilkan dgn qty + satuannya
     (mis. "2,5 kg"), item pcs tetap dihitung sebagai "N item". */
  itemsSummary: function (t) {
    var pcs = 0, byUnit = {}, order = [];
    for (var j = 0; j < t.items.length; j++) {
      var it = t.items[j];
      var u = it.unit || 'pcs';
      if (u === 'pcs') pcs += it.qty;
      else {
        if (!(u in byUnit)) { byUnit[u] = 0; order.push(u); }
        byUnit[u] += it.qty;
      }
    }
    var parts = [];
    for (var i = 0; i < order.length; i++) parts.push(this.fmtQtyAny(byUnit[order[i]], order[i]) + ' ' + K.esc(order[i]));
    if (pcs > 0 || !parts.length) parts.push(pcs + ' item');
    return parts.join(' + ');
  },

  /* ---------- riwayat (lunas) ---------- */
  riwayatHtml: function () {
    var txs = KDB.data.txs.filter(function (t) { return !t.voided && t.status !== 'unpaid'; });
    var h = '';
    if (!txs.length) return UI.empty('🕘', T('Belum ada transaksi'), T('Transaksi yang sudah dibayar muncul di sini.'), '');
    var lastDay = '';
    for (var i = 0; i < txs.length; i++) {
      var t = txs[i];
      var day = K.fmtDate(t.at);
      if (day !== lastDay) { h += '<div class="k-small k-muted" style="margin:12px 2px 4px;font-weight:700">' + day + '</div>'; lastDay = day; }
      h += T('<div class="k-card" style="margin-bottom:8px;cursor:pointer" onclick="Kasir.detail(\'') + K.escQ(t.id) + '\')">' +
        '<div class="k-row"><div><b>#' + K.pad(t.no, 4) + '</b> <span class="k-tag">' + K.esc(t.pay) + '</span>' +
        (t.note ? ' <span class="k-small k-muted">' + K.esc(t.note) + '</span>' : '') +
        '<div class="k-small k-muted">' + K.fmtTime(t.at) + ' • ' + this.itemsSummary(t) + (t.disc > 0 ? T(' • disc ') + K.rp(t.disc) : '') + '</div></div>' +
        '<div class="k-money">' + K.rp(t.total) + '</div></div></div>';
    }
    return h;
  },

  detail: function (id) {
    var tx = this.txById(id);
    if (!tx || tx.voided) return;
    var unpaid = this.isUnpaid(tx);
    var h = T('<h3 class="k-sheet-t">Transaksi #') + K.pad(tx.no, 4) + '</h3>';
    if (unpaid) h += T('<div style="margin-bottom:10px"><span class="k-tag" style="background:rgba(255,213,79,.15);border:1px solid var(--gold);color:var(--gold)">⏳ BELUM DIBAYAR</span></div>');
    h += '<div class="k-small k-muted" style="margin-bottom:10px">' + K.fmtDateTime(tx.at) + ' • ' + K.esc(tx.pay) +
      (tx.customer ? ' • ' + K.esc(tx.customer) : '') +
      (tx.table ? ' • ' + T('Meja ') + K.esc(tx.table) : '') +
      (tx.project ? ' • ' + T('Proyek: ') + K.esc(tx.project) : '') +
      (tx.dueDate ? ' • ' + T('Tempo: ') + this.fmtDue(tx.dueDate) : '') +
      (tx.note ? ' • ' + K.esc(tx.note) : '') + '</div>';
    for (var j = 0; j < tx.items.length; j++) {
      var it = tx.items[j];
      var dkg = it.unit === 'kg';
      var dunit = !dkg && it.unit && it.unit !== 'pcs';
      h += T('<div class="k-total-row"><span>') + (dkg ? K.fmtQty(it.qty, 'kg') + ' kg x ' : (dunit ? this.fmtQtyAny(it.qty, it.unit) + ' ' + K.esc(it.unit) + ' x ' : it.qty + 'x ')) + K.esc(it.name) + (it.ws ? ' (' + this.wsWord(tx) + ')' : '') +
        (it.note ? '<br><span class="k-snote">📝 ' + K.esc(it.note) + '</span>' : '') + '</span><span>' + K.rp(it.price * it.qty) + '</span></div>';
    }
    h += T('<div class="k-total-row"><span>Subtotal</span><span>') + K.rp(tx.sub) + '</span></div>';
    if (tx.disc > 0) h += T('<div class="k-total-row"><span>Diskon</span><span>-') + K.rp(tx.disc) + '</span></div>';
    h += T('<div class="k-total-row k-grand"><span>Total</span><span class="k-money">') + K.rp(tx.total) + '</span></div>';
    h += T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeSheet()">Tutup</button>') +
      (unpaid ? '' : T('<button class="k-btn k-sec" onclick="Kasir.shareOne(\'') + K.escQ(tx.id) + T('\')">📤 Struk</button>')) +
      T('<button class="k-btn k-sec" onclick="Printer.printStruk(Kasir.txById(\'') + K.escQ(tx.id) + T('\'))">🖨️ Cetak</button>') +
      (unpaid ? T('<button class="k-btn k-pri" onclick="Kasir.bayarTagihan(\'') + K.escQ(tx.id) + T('\')">💰 Bayar</button>') : '') +
      T('<button class="k-btn k-danger" onclick="Kasir.voidTx(\'') + K.escQ(tx.id) + T('\')">Batalkan</button></div>');
    UI.openSheet(h);
  },
  shareOne: function (id) {
    var txs = KDB.data.txs;
    for (var i = 0; i < txs.length; i++) if (txs[i].id === id) {
      UI.shareText(T('Struk #') + K.pad(txs[i].no, 4), this.receiptText(txs[i]));
      return;
    }
  },
  voidTx: function (id) {
    /* S4: membatalkan transaksi = aksi administratif -> hak 'dashboard' */
    if (typeof Perm !== 'undefined' && !Perm.guard('dashboard')) return;
    var txs = KDB.data.txs, tx = null;
    for (var i = 0; i < txs.length; i++) if (txs[i].id === id) tx = txs[i];
    if (!tx || tx.voided) return;
    var self = this;
    UI.confirm(T('Batalkan transaksi #') + K.pad(tx.no, 4) + ' (' + K.rp(tx.total) + T(')? Stok akan dikembalikan.'), T('Batalkan'), function () {
      if (tx.voided) return; // cegah eksekusi ganda
      for (var j = 0; j < tx.items.length; j++) {
        var it = tx.items[j];
        var m = KDB.menuById(it.id);
        if (m && m.track) {
          var bq = (it.baseQty != null ? it.baseQty : it.qty); // stok kembali dalam satuan DASAR
          m.stock = Math.round((m.stock + bq) * 1000) / 1000;
          KDB.addStockLog(m.id, m.name, 'in', bq, m.stock, T('Void #') + K.pad(tx.no, 4));
        }
      }
      tx.voided = true;
      tx.updatedAt = Date.now();
      KDB.save();
      UI.closeSheet();
      UI.toast(T('Transaksi dibatalkan, stok dikembalikan'));
      App.rerender();
    });
  }
};
