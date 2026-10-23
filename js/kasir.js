/* OGKasir - kasir, keranjang, pembayaran, struk, riwayat */
var Kasir = {
  cart: {},        // menuId -> qty
  cartNote: {},    // menuId -> catatan khusus per item (cth: "setengah matang")
  cat: 'Semua', // kanonis: JANGAN dibungkus T() — nilai filter
  q: '',
  mode: 'kasir',  // kasir | riwayat | tagihan | struk
  lastTx: null,
  payMethod: 'Tunai',
  _payTagId: null,      // id transaksi yg sedang dilunasi
  _payTagMethod: 'Tunai',
  _editingTagId: null,  // id tagihan yg sedang ditambah pesanannya

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
      h += '<button class="k-chip" onclick="Kasir.tapPreset(\'' + id + '\',\'' +
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
    if ((KDB.data.settings.menuView || 'grid') === 'list') {
      h += '</div>' + this.listHtml(list);
      return h;
    }
    h += '</div><div class="k-grid">';
    for (var j = 0; j < list.length; j++) {
      var m = list[j];
      var out = m.track && m.stock <= 0;
      var low = m.track && !out && m.stock <= m.min;
      var visual = m.photo ? '<img class="k-photo" loading="lazy" decoding="async" src="' + m.photo + '">' : '<div class="k-emo">' + K.esc(m.emoji || '🍽️') + '</div>';
      var inCart = Kasir.cart[m.id] || 0;
      h += '<button class="k-mi' + (out ? ' k-empty' : '') + '" data-mid="' + m.id + T('" onclick="Kasir.add(\'') + m.id + '\')">' +
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

  /* Tampilan Baris: daftar menu horizontal, cocok untuk banyak produk */
  listHtml: function (list) {
    var h = '<div class="k-list">';
    for (var j = 0; j < list.length; j++) {
      var m = list[j];
      var out = m.track && m.stock <= 0;
      var low = m.track && !out && m.stock <= m.min;
      var visual = m.photo ? '<img class="k-lphoto" loading="lazy" decoding="async" src="' + m.photo + '">' :
        '<div class="k-lemo">' + K.esc(m.emoji || '🍽️') + '</div>';
      h += '<button class="k-li' + (out ? ' k-empty' : '') + T('" onclick="Kasir.add(\'') + m.id + '\')">' +
        visual +
        '<div class="k-linfo"><div class="k-nm">' + K.esc(m.name) + '</div>' +
        (m.track ? T('<div class="k-stk">Stok: ') + K.fmtQty(m.stock, m.unit) + (K.isKg(m) ? ' kg' : '') + '</div>' : T('<div class="k-stk">Tanpa stok</div>')) +
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
    var cls = (KDB.data.settings.menuView === 'list') ? '.k-list' : '.k-grid';
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
      T('<button class="k-btn k-pri" onclick="Kasir.weightOk(\'') + id + T('\')">✓ Masuk Keranjang</button></div>');
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
    el.textContent = K.rp(w * m.price);
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
    for (var k in this.cart) n += this.cart[k];
    return n;
  },
  cartTotal: function () {
    var t = 0;
    for (var k in this.cart) { var m = KDB.menuById(k); if (m) t += m.price * this.cart[k]; }
    return t;
  },

  renderCartBar: function () {
    var w = document.getElementById('kCartBar');
    var n = this.cartCount();
    if (!n || App.page !== 'kasir' || this.mode !== 'kasir') { w.innerHTML = ''; return; }
    var nTxt = String(Math.round(n * 100) / 100).replace('.', ',');
    w.innerHTML = T('<button class="k-cartbar" onclick="Kasir.cartBarTap()">') +
      (this._editingTagId ? T('<span>✏️ ') : T('<span>🛒 ')) + nTxt + ' item</span><span>' + K.rp(this.cartTotal()) + T(' →</span></button>');
  },

  chQty: function (id, d) {
    var m = KDB.menuById(id);
    var cur = this.cart[id] || 0;
    var nx = cur + d;
    if (nx <= 0) { delete this.cart[id]; delete this.cartNote[id]; }
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
      var qTxt = kg ? K.fmtQty(q, 'kg') + ' kg' : q;
      var cvis = m.photo ? '<img class="k-thumb" loading="lazy" decoding="async" src="' + m.photo + '">' : '<div class="k-emo">' + K.esc(m.emoji || '🍽️') + '</div>';
      var noteVal = this.cartNote[m.id] || '';
      h += '<div class="k-li">' + cvis +
        '<div class="k-tx"><div class="k-t1">' + K.esc(m.name) + '</div>' +
        '<div class="k-t2">' + K.rp(m.price) + (kg ? '/kg × ' : ' × ') + qTxt + ' = <b>' + K.rp(m.price * q) + '</b></div>' +
        this.noteChipsHtml(m.id) +
        T('<input class="k-in k-note-in" id="kNote_') + m.id + T('" placeholder="Catatan (opsional, cth: setengah matang)" value="') + K.esc(noteVal) +
        '" oninput="Kasir.setNote(\'' + m.id + '\', this.value)"></div>' +
        (kg
          ? '<div class="k-step"><button style="min-width:70px" onclick="Kasir.weightModal(\'' + m.id + '\',1)">⚖️ ' + T('Ubah') + '</button></div></div>'
          : T('<div class="k-step"><button onclick="Kasir.chQty(\'') + m.id + T('\',-1)">−</button>') +
            '<span class="k-q">' + q + '</span>' +
            T('<button onclick="Kasir.chQty(\'') + m.id + '\',1)">+</button></div></div>');
    }
    var sub = this.cartTotal();
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
      h += '<div id="kCustBox" style="display:' + (isTag ? 'block' : 'none') + T('"><div class="k-fld"><label>Nama / meja (opsional)</label>') +
        T('<input class="k-in" id="kCust" placeholder="cth: Meja 3, Bang Joko"></div></div>');
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
    this.openCart();
    if (document.getElementById('kDisc')) document.getElementById('kDisc').value = disc;
    if (document.getElementById('kDiscType')) document.getElementById('kDiscType').value = dt;
    if (document.getElementById('kCash')) document.getElementById('kCash').value = cash;
    if (document.getElementById('kNote')) document.getElementById('kNote').value = note;
    if (document.getElementById('kCust')) document.getElementById('kCust').value = cust;
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
    // cek stok
    var kurang = [];
    for (var i = 0; i < ids.length; i++) {
      var m = KDB.menuById(ids[i]);
      if (m && m.track && this.cart[ids[i]] > m.stock) kurang.push(m.name + ' (sisa ' + m.stock + ')');
    }
    if (kurang.length) { UI.toast(T('Stok kurang: ') + kurang.join(', ')); return; }
    if (!isTag && this.payMethod === 'Tunai' && c.cash < c.total) { UI.toast(T('Uang kurang ') + K.rp(c.total - c.cash)); return; }
    // susun transaksi
    var items = [];
    for (var j = 0; j < ids.length; j++) {
      var mm = KDB.menuById(ids[j]);
      if (!mm) continue;
      var q = this.cart[ids[j]];
      var kgu = K.isKg(mm);
      if (kgu) q = Math.round(q * 1000) / 1000;
      items.push({ id: mm.id, name: mm.name, price: mm.price, cost: mm.cost || 0, qty: q,
        unit: kgu ? 'kg' : 'pcs', note: (this.cartNote[ids[j]] || '').trim() });
      if (mm.track) {
        mm.stock = kgu ? Math.round((mm.stock - q) * 1000) / 1000 : mm.stock - q;
        KDB.addStockLog(mm.id, mm.name, 'out', q, mm.stock, 'Penjualan #' + K.pad(KDB.data.nextNo, 4));
      }
    }
    var D = KDB.data;
    var cashier = (KDB.activeEmployee && KDB.activeEmployee()) || null;
    var tx = {
      id: K.uid(), no: D.nextNo, at: Date.now(), updatedAt: Date.now(), items: items,
      cashierId: cashier ? cashier.id : '',
      cashierName: cashier ? cashier.name : (D.settings.userName || ''),
      cashierRole: cashier ? cashier.role : '',
      sub: c.sub, disc: c.disc, total: c.total,
      pay: this.payMethod, cash: this.payMethod === 'Tunai' ? c.cash : (isTag ? 0 : c.total),
      change: this.payMethod === 'Tunai' ? Math.max(c.change, 0) : 0,
      note: document.getElementById('kNote') ? document.getElementById('kNote').value.trim() : '',
      customer: isTag ? (document.getElementById('kCust') ? document.getElementById('kCust').value.trim() : '') : '',
      status: isTag ? 'unpaid' : 'paid',
      voided: false
    };
    D.nextNo++;
    D.txs.unshift(tx);
    KDB.save();
    this.cart = {};
    this.cartNote = {};
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
    var uname = (s.userName || '').trim();
    if (uname && /^[\x20-\x7E]*$/.test(uname)) L.push(row(T('Kasir'), uname)); // ASCII saja utk printer
    if (tx.note) L.push(row('Ket:', tx.note));
    L.push('--------------------------------');
    for (var i = 0; i < tx.items.length; i++) {
      var it = tx.items[i];
      var ikg = it.unit === 'kg';
      L.push(ikg ? K.fmtQty(it.qty, 'kg') + ' kg x ' + it.name : it.qty + 'x ' + it.name);
      L.push(row('   @' + K.rp(it.price) + (ikg ? '/kg' : ''), K.rp(it.price * it.qty)));
      if (it.note) L.push(('   > ' + it.note).slice(0, 32)); // catatan dapur, max 32 kolom
    }
    L.push('--------------------------------');
    L.push(row('Subtotal', K.rp(tx.sub)));
    if (tx.disc > 0) L.push(row(T('Diskon'), '-' + K.rp(tx.disc)));
    L.push(row(T('TOTAL'), K.rp(tx.total)));
    if (tx.status === 'unpaid') {
      L.push(row('Status', T('BELUM DIBAYAR')));
      if (tx.customer) L.push(row(T('Nama'), tx.customer));
    } else {
      L.push(row(tx.pay, K.rp(tx.cash)));
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
    if (s.logo && s.receiptLogo !== false) h += '<div class="k-c" style="margin-bottom:6px"><img src="' + s.logo + '" alt="" style="max-height:64px;max-width:180px;object-fit:contain"></div>';
    h += T('<div class="k-c k-b">') + K.esc(s.shop.toUpperCase()) + '</div>';
    if (s.addr) h += '<div class="k-c">' + K.esc(s.addr) + '</div>';
    h += '<hr><div class="k-srow"><span>No: #' + K.pad(tx.no, 4) + '</span><span>' + K.fmtDateTime(tx.at) + '</span></div>';
    if (s.userName) h += T('<div class="k-srow"><span>Kasir:</span><span>') + K.esc(s.userName) + '</span></div>';
    if (tx.customer) h += T('<div class="k-srow"><span>Nama:</span><span>') + K.esc(tx.customer) + '</span></div>';
    if (tx.note) h += '<div class="k-srow"><span>Ket:</span><span>' + K.esc(tx.note) + '</span></div>';
    h += '<hr>';
    for (var i = 0; i < tx.items.length; i++) {
      var it = tx.items[i];
      var hkg = it.unit === 'kg';
      h += '<div>' + (hkg ? K.fmtQty(it.qty, 'kg') + ' kg x ' : it.qty + 'x ') + K.esc(it.name) + '</div>' +
        '<div class="k-srow"><span>&nbsp;&nbsp;@' + K.rp(it.price) + (hkg ? '/kg' : '') + '</span><span>' + K.rp(it.price * it.qty) + '</span></div>';
      if (it.note) h += '<div class="k-snote">📝 ' + K.esc(it.note) + '</div>';
    }
    h += '<hr><div class="k-srow"><span>Subtotal</span><span>' + K.rp(tx.sub) + '</span></div>';
    if (tx.disc > 0) h += T('<div class="k-srow"><span>Diskon</span><span>-') + K.rp(tx.disc) + '</span></div>';
    h += T('<div class="k-srow k-b"><span>TOTAL</span><span>') + K.rp(tx.total) + '</span></div>';
    if (unpaid) {
      h += T('<div class="k-srow k-b"><span>Status</span><span>BELUM DIBAYAR</span></div>');
    } else {
      h += '<div class="k-srow"><span>' + K.esc(tx.pay) + '</span><span>' + K.rp(tx.cash) + '</span></div>';
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

  /* ---------- daftar tagihan (belum dibayar) ---------- */
  tagihanHtml: function () {
    var list = this.unpaidList();
    if (!list.length) return UI.empty('⏳', T('Tidak ada tagihan'), T('Transaksi "Belum Dibayar" muncul di sini. Cocok untuk pelanggan yang pesan dulu, bayar belakangan.'), '');
    var h = '<div class="k-card" style="margin-bottom:10px;border-color:var(--gold)">' +
      T('<div class="k-row"><div><b>⏳ Total belum bayar</b><div class="k-small k-muted">') + list.length + T(' tagihan belum dibayar</div></div>') +
      '<div class="k-money">' + K.rp(this.unpaidTotal()) + '</div></div></div>';
    var lastDay = '';
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var day = K.fmtDate(t.at);
      if (day !== lastDay) { h += '<div class="k-small k-muted" style="margin:12px 2px 4px;font-weight:700">' + day + '</div>'; lastDay = day; }
      var nItems = 0;
      for (var j = 0; j < t.items.length; j++) nItems += t.items[j].qty;
      h += '<div class="k-card" style="margin-bottom:8px;border-color:var(--gold)"><div class="k-row">' +
        T('<div style="flex:1;cursor:pointer" onclick="Kasir.detail(\'') + t.id + '\')">' +
        '<b>#' + K.pad(t.no, 4) + '</b> <span class="k-tag">' + (t.customer ? K.esc(t.customer) : T('Tanpa nama')) + '</span>' +
        '<div class="k-small k-muted">' + K.fmtTime(t.at) + ' • ' + nItems + ' item' + (t.disc > 0 ? T(' • disc ') + K.rp(t.disc) : '') + '</div></div>' +
        '<div style="text-align:right"><div class="k-money">' + K.rp(t.total) + '</div>' +
        T('<button class="k-btn k-pri" style="margin-top:6px;padding:8px 16px;font-size:14px" onclick="event.stopPropagation();Kasir.bayarTagihan(\'') + t.id + T('\')">💰 Bayar</button>') +
        T('<div style="margin-top:6px"><button class="k-btn k-sec" style="padding:6px 12px;font-size:13px" onclick="event.stopPropagation();Kasir.tambahPesanan(\'') + t.id + T('\')">➕ Tambah</button></div>') +
        '</div></div></div>';
    }
    return h;
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
        if (tx.items[i].id === id) s = Math.round((s + tx.items[i].qty) * 1000) / 1000;
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
    this.cartNote = {};
    for (var i = 0; i < tx.items.length; i++) {
      var it = tx.items[i];
      if (!KDB.menuById(it.id)) continue; // menu sudah dihapus: lewati
      this.cart[it.id] = (this.cart[it.id] || 0) + it.qty;
      if (it.note) this.cartNote[it.id] = this.cartNote[it.id] ? this.cartNote[it.id] + ', ' + it.note : it.note;
    }
    this._editingTagId = id;
    this.payMethod = 'Belum Dibayar';
    this.mode = 'kasir';
    this.renderCartBar();
    App.rerender();
    UI.toast(T('✏️ Tambah pesanan #') + K.pad(tx.no, 4) + T(' — pilih menu, lalu simpan di keranjang'));
  },
  cancelEdit: function () {
    this.cart = {};
    this.cartNote = {};
    this._editingTagId = null;
    UI.closeSheet();
    this.renderCartBar();
  },
  saveEdit: function () {
    var tx = this.txById(this._editingTagId);
    if (!tx || !this.isUnpaid(tx)) { this._editingTagId = null; UI.closeSheet(); return; }
    var c = this.calc();
    var ids = Object.keys(this.cart);
    if (!ids.length) { UI.toast(T('Keranjang kosong')); return; }
    // stok item lama akan dikembalikan dulu → ketersediaan termasuk itu
    var kurang = [];
    for (var j = 0; j < ids.length; j++) {
      var mm = KDB.menuById(ids[j]);
      if (mm && mm.track && this.cart[ids[j]] > this.availStock(ids[j]))
        kurang.push(mm.name + ' (sisa ' + this.availStock(ids[j]) + ')');
    }
    if (kurang.length) { UI.toast(T('Stok kurang: ') + kurang.join(', ')); return; }
    // 1. kembalikan stok item lama
    for (var k = 0; k < tx.items.length; k++) {
      var io = tx.items[k];
      var mo = KDB.menuById(io.id);
      if (mo && mo.track) {
        mo.stock = Math.round((mo.stock + io.qty) * 1000) / 1000;
        KDB.addStockLog(mo.id, mo.name, 'in', io.qty, mo.stock, 'Edit tagihan #' + K.pad(tx.no, 4));
      }
    }
    // 2. susun item baru + kurangi stok (seperti pay)
    var items = [];
    for (var n = 0; n < ids.length; n++) {
      var m2 = KDB.menuById(ids[n]);
      if (!m2) continue;
      var q = this.cart[ids[n]];
      var kgu = K.isKg(m2);
      if (kgu) q = Math.round(q * 1000) / 1000;
      items.push({ id: m2.id, name: m2.name, price: m2.price, cost: m2.cost || 0, qty: q,
        unit: kgu ? 'kg' : 'pcs', note: (this.cartNote[ids[n]] || '').trim() });
      if (m2.track) {
        m2.stock = kgu ? Math.round((m2.stock - q) * 1000) / 1000 : m2.stock - q;
        KDB.addStockLog(m2.id, m2.name, 'out', q, m2.stock, 'Edit tagihan #' + K.pad(tx.no, 4));
      }
    }
    tx.items = items;
    tx.sub = c.sub;
    tx.disc = Math.min(c.disc, c.sub);
    tx.total = c.total;
    var noteEl = document.getElementById('kNote');
    if (noteEl) tx.note = noteEl.value.trim();
    var custEl = document.getElementById('kCust');
    if (custEl) tx.customer = custEl.value.trim();
    KDB.save();
    this.cart = {};
    this.cartNote = {};
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
      var nItems = 0;
      for (var j = 0; j < t.items.length; j++) nItems += t.items[j].qty;
      h += T('<div class="k-card" style="margin-bottom:8px;cursor:pointer" onclick="Kasir.detail(\'') + t.id + '\')">' +
        '<div class="k-row"><div><b>#' + K.pad(t.no, 4) + '</b> <span class="k-tag">' + K.esc(t.pay) + '</span>' +
        (t.note ? ' <span class="k-small k-muted">' + K.esc(t.note) + '</span>' : '') +
        '<div class="k-small k-muted">' + K.fmtTime(t.at) + ' • ' + nItems + ' item' + (t.disc > 0 ? T(' • disc ') + K.rp(t.disc) : '') + '</div></div>' +
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
      (tx.note ? ' • ' + K.esc(tx.note) : '') + '</div>';
    for (var j = 0; j < tx.items.length; j++) {
      var it = tx.items[j];
      var dkg = it.unit === 'kg';
      h += T('<div class="k-total-row"><span>') + (dkg ? K.fmtQty(it.qty, 'kg') + ' kg x ' : it.qty + 'x ') + K.esc(it.name) +
        (it.note ? '<br><span class="k-snote">📝 ' + K.esc(it.note) + '</span>' : '') + '</span><span>' + K.rp(it.price * it.qty) + '</span></div>';
    }
    h += T('<div class="k-total-row"><span>Subtotal</span><span>') + K.rp(tx.sub) + '</span></div>';
    if (tx.disc > 0) h += T('<div class="k-total-row"><span>Diskon</span><span>-') + K.rp(tx.disc) + '</span></div>';
    h += T('<div class="k-total-row k-grand"><span>Total</span><span class="k-money">') + K.rp(tx.total) + '</span></div>';
    h += T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeSheet()">Tutup</button>') +
      (unpaid ? '' : T('<button class="k-btn k-sec" onclick="Kasir.shareOne(\'') + tx.id + T('\')">📤 Struk</button>')) +
      T('<button class="k-btn k-sec" onclick="Printer.printStruk(Kasir.txById(\'') + tx.id + T('\'))">🖨️ Cetak</button>') +
      (unpaid ? T('<button class="k-btn k-pri" onclick="Kasir.bayarTagihan(\'') + tx.id + T('\')">💰 Bayar</button>') : '') +
      T('<button class="k-btn k-danger" onclick="Kasir.voidTx(\'') + tx.id + T('\')">Batalkan</button></div>');
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
          m.stock = it.unit === 'kg' ? Math.round((m.stock + it.qty) * 1000) / 1000 : m.stock + it.qty;
          KDB.addStockLog(m.id, m.name, 'in', it.qty, m.stock, T('Void #') + K.pad(tx.no, 4));
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
