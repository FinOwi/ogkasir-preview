/* OGKasir - Order (Mode Jasa, Fase 3): entitas order berbasis status.
   Order hidup berhari-hari: Diterima → Diproses → Selesai → Sudah Diambil & Lunas.
   DP dibayar di awal TERCATAT DI ORDER (bukan transaksi terpisah — supaya tidak
   dobel omzet). Saat order lunas & diambil, order menghasilkan SATU transaksi
   paid di txs senilai total order (+ denda rental) — laporan/omzet tetap satu
   pintu lewat txs, persis seperti penjualan biasa.
   Data: KDB.data.orders (lokal; belum ikut sync dokumen — lihat catatan rilis). */
var Order = {
  filter: 'aktif', // aktif | diterima | diproses | selesai | diambil | semua
  _dpMethod: 'Tunai',
  _settleMethod: 'Tunai',
  _settleId: null,

  STATUSES: ['diterima', 'diproses', 'selesai', 'diambil'],
  statusLabel: function (st) {
    var map = { diterima: T('Diterima'), diproses: T('Diproses'), selesai: T('Selesai'),
      diambil: T('Sudah Diambil & Lunas'), batal: T('Dibatalkan') };
    /* X7 (audit 30 Okt 2026): whitelist enum — status asing dari restore
       tidak lagi mengalir mentah ke HTML/nota. */
    return map[st] || '—';
  },
  statusColor: function (st) {
    var map = { diterima: '#B7791F', diproses: '#2563EB', selesai: '#1F9D61', diambil: '#64748B', batal: '#C0392B' };
    return map[st] || '#64748B';
  },

  list: function () {
    var o = KDB.data.orders;
    return Array.isArray(o) ? o : [];
  },
  byId: function (id) {
    var os = this.list();
    for (var i = 0; i < os.length; i++) if (os[i].id === id) return os[i];
    return null;
  },
  code: function (o) { return 'ORD-' + K.pad(o.no, 4); },
  grandTotal: function (o) { return (o.total || 0) + (o.fee || 0); },
  remaining: function (o) {
    return Math.max(0, this.grandTotal(o) - (o.paidTotal != null ? o.paidTotal : (o.dp || 0)));
  },
  isActive: function (o) { return o.status === 'diterima' || o.status === 'diproses' || o.status === 'selesai'; },
  counts: function () {
    var c = { diterima: 0, diproses: 0, selesai: 0, aktif: 0 };
    var os = this.list();
    for (var i = 0; i < os.length; i++) {
      if (c[os[i].status] != null) c[os[i].status]++;
      if (this.isActive(os[i])) c.aktif++;
    }
    return c;
  },
  /* nomor antrean hari ini (Salon): urutan order yang masuk pada hari yang sama */
  queueNo: function (o) {
    var start = K.dayStart(o.at), n = 0, os = this.list();
    for (var i = 0; i < os.length; i++) {
      if (os[i].status !== 'batal' && K.dayStart(os[i].at) === start && os[i].at <= o.at) n++;
    }
    return n;
  },

  /* ---------- buat order dari keranjang kasir (mode jasa) ---------- */
  openCheckout: function () {
    var ids = Object.keys(Kasir.cart);
    if (!ids.length) { UI.toast(T('Keranjang masih kosong')); return; }
    var sub = (typeof BizMode !== 'undefined') ? BizMode.subId() : 'lainnya';
    var total = Kasir.cartTotal();
    var h = T('<h3 class="k-sheet-t">🧾 Buat Order</h3>');
    h += '<div style="margin-bottom:10px">';
    for (var i = 0; i < ids.length; i++) {
      var m = KDB.menuById(ids[i]);
      if (!m) continue;
      var q = Kasir.cart[ids[i]];
      var kg = K.isKg(m);
      h += '<div class="k-total-row"><span>' + (kg ? K.fmtQty(q, 'kg') + ' kg x ' : q + 'x ') + K.esc(m.name) +
        '</span><span>' + K.rp(Kasir.unitPrice(m, q) * q) + '</span></div>';
    }
    h += '<div class="k-total-row k-grand"><span>Total</span><span class="k-money">' + K.rp(total) + '</span></div></div>';
    h += '<div class="k-fld"><label>' + T('Nama pelanggan') + ' *</label>' +
      '<input class="k-in" id="oCustName" placeholder="' + T('cth: Budi') + '"></div>';
    h += '<div class="k-fld"><label>' + T('No. HP (opsional)') + '</label>' +
      '<input class="k-in" id="oCustPhone" type="tel" placeholder="08xxxxxxxxxx"></div>';
    if (sub === 'bengkel') {
      h += '<div class="k-frow"><div class="k-fld"><label>' + T('Plat nomor') + '</label>' +
        '<input class="k-in" id="oPlate" placeholder="cth: BK 1234 AB"></div>' +
        '<div class="k-fld"><label>' + T('Jenis kendaraan') + '</label>' +
        '<input class="k-in" id="oVehicle" placeholder="' + T('cth: Vario 160') + '"></div></div>';
    }
    if (sub === 'rental') {
      h += '<div class="k-frow"><div class="k-fld"><label>' + T('Jaminan / deposit (Rp)') + '</label>' +
        '<input class="k-in" id="oDeposit" type="number" inputmode="numeric" placeholder="0"></div>' +
        '<div class="k-fld"><label>' + T('Tanggal kembali') + '</label>' +
        '<input class="k-in" id="oReturn" type="date"></div></div>';
    }
    if (sub === 'salon') {
      var emps = (KDB.data.employees || []).filter(function (e) { return e.active; });
      if (emps.length) {
        h += '<div class="k-fld"><label>' + T('Dikerjakan oleh') + '</label><select class="k-sel" id="oEmp">' +
          emps.map(function (e) {
            return '<option value="' + K.esc(e.id) + '"' + (KDB.data.settings.activeEmployeeId === e.id ? ' selected' : '') + '>' + K.esc(e.name) + '</option>';
          }).join('') + '</select></div>';
      }
    }
    h += '<div class="k-fld"><label>' + T('Estimasi selesai (opsional)') + '</label>' +
      '<input class="k-in" id="oEta" type="datetime-local"></div>';
    h += '<div class="k-fld"><label>' + T('Catatan (opsional)') + '</label>' +
      '<input class="k-in" id="oNote" placeholder="' + T('cth: minta wangi soft') + '"></div>';
    h += '<div class="k-fld"><label>' + T('DP / uang muka (opsional)') + '</label>' +
      '<div class="k-paygrid" style="margin-bottom:8px">' +
      this.dpBtn('Tunai', '💵') + this.dpBtn('QRIS', '📱') +
      this.dpBtn('Transfer', '🏦') + this.dpBtn('E-Wallet', '👛') + '</div>' +
      '<input class="k-in" id="oDp" type="number" inputmode="numeric" placeholder="0"></div>';
    h += T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeSheet()">Batal</button>') +
      T('<button class="k-btn k-pri" onclick="Order.create()">🧾 Buat Order</button></div>');
    UI.openSheet(h);
  },
  dpBtn: function (name, emoji) {
    return '<button class="k-pay' + (this._dpMethod === name ? ' k-on' : '') +
      '" onclick="Order.setDpMethod(\'' + name + '\')"><span class="k-pe">' + emoji + '</span>' + I18N.payName(name) + '</button>';
  },
  setDpMethod: function (name) {
    var keep = {};
    ['oCustName', 'oCustPhone', 'oPlate', 'oVehicle', 'oDeposit', 'oReturn', 'oEta', 'oNote', 'oDp', 'oEmp'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) keep[id] = el.value;
    });
    this._dpMethod = name;
    this.openCheckout();
    for (var k in keep) {
      var el2 = document.getElementById(k);
      if (el2) el2.value = keep[k];
    }
  },

  create: function () {
    var ids = Object.keys(Kasir.cart);
    if (!ids.length) return;
    var g = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var name = g('oCustName');
    if (!name) { UI.toast(T('Nama pelanggan wajib diisi')); return; }
    var sub = (typeof BizMode !== 'undefined') ? BizMode.subId() : 'lainnya';
    // cek stok item yang dilacak (sparepart bengkel dsb.)
    var kurang = [];
    for (var i = 0; i < ids.length; i++) {
      var mm = KDB.menuById(ids[i]);
      if (mm && mm.track && Kasir.cart[ids[i]] > mm.stock) kurang.push(mm.name + ' (sisa ' + mm.stock + ')');
    }
    if (kurang.length) { UI.toast(T('Stok kurang: ') + kurang.join(', ')); return; }
    var items = [], total = 0;
    for (var j = 0; j < ids.length; j++) {
      var m = KDB.menuById(ids[j]);
      if (!m) continue;
      var q = Kasir.cart[ids[j]];
      var kg = K.isKg(m);
      if (kg) q = Math.round(q * 1000) / 1000;
      var price = Kasir.unitPrice(m, q);
      items.push({ id: m.id, name: m.name, price: price, cost: m.cost || 0, qty: q,
        unit: kg ? 'kg' : (m.unit && m.unit !== 'pcs' ? m.unit : 'pcs'),
        commission: m.commission || 0, note: (Kasir.cartNote[ids[j]] || '').trim() });
      total += price * q;
      if (m.track) {
        m.stock = Math.round((m.stock - q) * 1000) / 1000;
      }
    }
    var D = KDB.data;
    if (!Array.isArray(D.orders)) D.orders = [];
    if (!D.nextOrderNo) D.nextOrderNo = 1;
    var dp = Math.min(Math.max(0, K.num(g('oDp'))), total);
    var empId = g('oEmp');
    var emp = empId ? KDB.employeeById(empId) : (KDB.activeEmployee ? KDB.activeEmployee() : null);
    var etaV = g('oEta');
    var o = {
      id: K.uid(), no: D.nextOrderNo++, sub: sub,
      customer: { name: name, phone: g('oCustPhone') },
      items: items, total: total, fee: 0,
      dp: dp, dpMethod: dp > 0 ? this._dpMethod : '',
      paidTotal: dp,
      status: 'diterima', at: Date.now(),
      eta: etaV ? (new Date(etaV).getTime() || 0) : 0,
      note: g('oNote'),
      plate: g('oPlate'), vehicle: g('oVehicle'),
      deposit: Math.max(0, K.num(g('oDeposit'))), returnDate: g('oReturn'),
      empId: emp ? emp.id : '', empName: emp ? emp.name : '',
      commissions: [], txId: '', takenAt: 0
    };
    // stok keluar dicatat setelah nomor order pasti (buat label log)
    for (var k = 0; k < items.length; k++) {
      var mi = KDB.menuById(items[k].id);
      if (mi && mi.track) KDB.addStockLog(mi.id, mi.name, 'out', items[k].qty, mi.stock, 'Order ' + this.code(o));
    }
    D.orders.unshift(o);
    KDB.save();
    Kasir.cart = {};
    Kasir.cartUnit = {};
    Kasir.cartNote = {};
    Kasir.renderCartBar();
    UI.closeSheet();
    UI.toast(T('Order ') + this.code(o) + T(' dibuat'));
    App.go('order');
  },

  /* ---------- halaman Order ---------- */
  setFilter: function (f) { this.filter = f; App.rerender(); },
  chip: function (id, label) {
    return '<button class="k-chip' + (this.filter === id ? ' k-on' : '') + '" onclick="Order.setFilter(\'' + id + '\')">' + label + '</button>';
  },

  render: function () {
    var c = this.counts();
    var h = '<div class="k-row" style="margin-bottom:10px"><h3 style="margin:0">🧾 ' + T('Order') +
      (typeof BizMode !== 'undefined' ? ' <span class="k-tag">' + BizMode.subLabel() + '</span>' : '') + '</h3>' +
      '<button class="k-chip k-chip-pri" onclick="App.go(\'kasir\')">＋ ' + T('Order Baru') + '</button></div>';
    h += '<div class="k-card" style="margin-bottom:12px"><div class="k-row">' +
      '<div><b>' + c.aktif + ' ' + T('order aktif') + '</b>' +
      '<div class="k-small k-muted">' + c.diproses + ' ' + T('diproses') + ' • ' + c.selesai + ' ' + T('selesai belum diambil') + '</div></div>' +
      '<span style="font-size:26px">' + KIcon.get('receipt', 26) + '</span></div></div>';
    h += '<div class="k-chips" style="margin-bottom:12px">' +
      this.chip('aktif', T('Aktif')) + this.chip('diterima', T('Diterima')) +
      this.chip('diproses', T('Diproses')) + this.chip('selesai', T('Selesai')) +
      this.chip('diambil', T('Diambil')) + this.chip('semua', T('Semua')) + '</div>';
    var os = this.list().filter(function (o) {
      if (Order.filter === 'semua') return true;
      if (Order.filter === 'aktif') return Order.isActive(o);
      return o.status === Order.filter;
    });
    if (!os.length) {
      h += UI.empty('🧾', T('Belum ada order'), T('Buat order pertama dari tab Kasir: pilih layanan, lalu ketuk Buat Order.'), '');
      return h;
    }
    for (var i = 0; i < os.length; i++) h += this.cardHtml(os[i]);
    return h;
  },

  cardHtml: function (o) {
    var col = this.statusColor(o.status);
    var sisa = this.remaining(o);
    var first = o.items.length ? o.items[0] : null;
    var sum = first ? (K.isKg(first) || first.unit === 'kg' ? K.fmtQty(first.qty, 'kg') + ' kg ' : first.qty + ' ') + K.esc(first.name) +
      (o.items.length > 1 ? ' +' + (o.items.length - 1) : '') : '';
    var adv = o.status === 'diterima' ? T('Proses') : (o.status === 'diproses' ? T('Selesai') : (o.status === 'selesai' ? T('Ambil & Lunasi') : ''));
    var h = '<div class="k-card" style="margin-bottom:8px"><div class="k-row" style="align-items:flex-start">' +
      '<div style="flex:1;cursor:pointer" onclick="Order.detail(\'' + o.id + '\')">' +
      '<b>' + this.code(o) + '</b> ' +
      (o.sub === 'salon' && o.status !== 'batal' ? '<span class="k-tag">' + T('Antrean') + ' #' + this.queueNo(o) + '</span> ' : '') +
      '<span class="k-tag" style="border:1px solid ' + col + ';color:' + col + '">' + this.statusLabel(o.status) + '</span>' +
      '<div class="k-t1" style="margin-top:4px">' + K.esc(o.customer.name) + '</div>' +
      '<div class="k-small k-muted">' + sum + ' • ' + K.fmtDateTime(o.at) +
      (o.eta ? '<br>' + T('Estimasi: ') + K.fmtDateTime(o.eta) : '') + '</div></div>' +
      '<div style="text-align:right"><div class="k-money">' + K.rp(this.grandTotal(o)) + '</div>' +
      (o.status !== 'diambil' && o.status !== 'batal'
        ? '<div class="k-small k-muted">' + T('DP ') + K.rp(o.dp || 0) + ' • ' + T('sisa ') + K.rp(sisa) + '</div>' : '') +
      (adv ? '<button class="k-btn k-pri" style="margin-top:6px;padding:8px 14px;font-size:14px" onclick="event.stopPropagation();Order.advance(\'' + o.id + '\')">' + adv + '</button>' : '') +
      '</div></div></div>';
    return h;
  },

  /* ---------- detail & nota ---------- */
  detail: function (id) {
    var o = this.byId(id);
    if (!o) return;
    var col = this.statusColor(o.status);
    var h = '<h3 class="k-sheet-t">🧾 ' + this.code(o) + ' <span class="k-tag" style="border:1px solid ' + col + ';color:' + col + '">' + this.statusLabel(o.status) + '</span></h3>';
    h += '<div class="k-small k-muted" style="margin-bottom:10px">' +
      K.esc(o.customer.name) + (o.customer.phone ? ' • ' + K.esc(o.customer.phone) : '') +
      '<br>' + T('Masuk: ') + K.fmtDateTime(o.at) +
      (o.eta ? '<br>' + T('Estimasi selesai: ') + K.fmtDateTime(o.eta) : '') +
      (o.takenAt ? '<br>' + T('Diambil: ') + K.fmtDateTime(o.takenAt) : '') + '</div>';
    if (o.sub === 'bengkel' && (o.plate || o.vehicle)) {
      h += '<div class="k-total-row"><span>' + T('Kendaraan') + '</span><span>' +
        K.esc([o.vehicle, o.plate].filter(Boolean).join(' • ')) + '</span></div>';
    }
    if (o.sub === 'rental') {
      if (o.deposit > 0) h += '<div class="k-total-row"><span>' + T('Jaminan / deposit') + '</span><span>' + K.rp(o.deposit) + '</span></div>';
      if (o.returnDate) h += '<div class="k-total-row"><span>' + T('Tanggal kembali') + '</span><span>' + Kasir.fmtDue(o.returnDate) + '</span></div>';
    }
    if (o.sub === 'salon' && o.empName) {
      h += '<div class="k-total-row"><span>' + T('Dikerjakan oleh') + '</span><span>' + K.esc(o.empName) + '</span></div>';
    }
    h += '<div style="margin:8px 0">';
    for (var i = 0; i < o.items.length; i++) {
      var it = o.items[i];
      var ikg = it.unit === 'kg';
      h += '<div class="k-total-row"><span>' + (ikg ? K.fmtQty(it.qty, 'kg') + ' kg x ' : it.qty + 'x ') + K.esc(it.name) +
        (it.commission > 0 ? '<br><span class="k-small k-muted">' + T('Komisi ') + it.commission + '% = ' + K.rp(Math.round(it.price * it.qty * it.commission / 100)) + '</span>' : '') +
        (it.note ? '<br><span class="k-snote">📝 ' + K.esc(it.note) + '</span>' : '') +
        '</span><span>' + K.rp(it.price * it.qty) + '</span></div>';
    }
    h += '</div>';
    if (o.note) h += '<div class="k-small k-muted" style="margin-bottom:8px">📝 ' + K.esc(o.note) + '</div>';
    h += '<div class="k-total-row"><span>Total</span><span>' + K.rp(o.total) + '</span></div>';
    if (o.fee > 0) h += '<div class="k-total-row"><span>' + T('Denda keterlambatan') + '</span><span>' + K.rp(o.fee) + '</span></div>';
    h += '<div class="k-total-row"><span>DP' + (o.dpMethod ? ' (' + K.esc(I18N.payName(o.dpMethod)) + ')' : '') + '</span><span>' + K.rp(o.dp || 0) + '</span></div>';
    if (o.status !== 'diambil') {
      h += '<div class="k-total-row k-grand"><span>' + T('Sisa bayar') + '</span><span class="k-money">' + K.rp(this.remaining(o)) + '</span></div>';
    } else {
      h += '<div class="k-total-row k-grand"><span>' + T('Lunas') + '</span><span class="k-money">' + K.rp(this.grandTotal(o)) + '</span></div>';
    }
    if (o.commissions && o.commissions.length) {
      h += '<div class="k-small" style="margin-top:8px"><b>' + T('Komisi karyawan') + ':</b> ' +
        o.commissions.map(function (cm) { return K.esc(cm.name) + ' ' + K.rp(cm.amount); }).join(' • ') + '</div>';
    }
    h += '<div class="k-btn-row" style="margin-top:12px">' +
      '<button class="k-btn k-ghost" onclick="UI.closeSheet()">' + T('Tutup') + '</button>' +
      '<button class="k-btn k-sec" onclick="Order.shareNota(\'' + o.id + '\')">📤 ' + T('Nota') + '</button>' +
      '<button class="k-btn k-sec" onclick="Order.printNota(\'' + o.id + '\')">🖨️ ' + T('Cetak') + '</button></div>';
    if (o.status === 'diterima' || o.status === 'diproses') {
      h += '<div class="k-btn-row"><button class="k-btn k-pri" onclick="Order.advance(\'' + o.id + '\')">' +
        (o.status === 'diterima' ? T('Mulai Proses') : T('Tandai Selesai')) + '</button>' +
        '<button class="k-btn k-danger" onclick="Order.cancel(\'' + o.id + '\')">' + T('Batalkan Order') + '</button></div>';
    } else if (o.status === 'selesai') {
      h += '<div class="k-btn-row"><button class="k-btn k-pri" onclick="Order.settleSheet(\'' + o.id + '\')">' + T('Ambil & Lunasi') + '</button></div>';
    }
    UI.openSheet(h);
  },

  notaText: function (o) {
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
    L.push(mid(T('NOTA ORDER') + ' ' + this.code(o)));
    L.push('--------------------------------');
    L.push(row(T('Pelanggan'), o.customer.name));
    if (o.customer.phone) L.push(row(T('HP'), o.customer.phone));
    L.push(row(T('Masuk'), K.fmtDateTime(o.at)));
    if (o.eta) L.push(row(T('Estimasi'), K.fmtDateTime(o.eta)));
    if (o.sub === 'bengkel' && (o.plate || o.vehicle)) L.push(row(T('Kendaraan'), [o.vehicle, o.plate].filter(Boolean).join(' ')));
    if (o.sub === 'rental' && o.returnDate) L.push(row(T('Kembali'), Kasir.fmtDue(o.returnDate)));
    L.push('--------------------------------');
    for (var i = 0; i < o.items.length; i++) {
      var it = o.items[i];
      var ikg = it.unit === 'kg';
      L.push(ikg ? K.fmtQty(it.qty, 'kg') + ' kg x ' + it.name : it.qty + 'x ' + it.name);
      L.push(row('   @' + K.rp(it.price) + (ikg ? '/kg' : ''), K.rp(it.price * it.qty)));
      if (it.note) L.push(('   > ' + it.note).slice(0, 32));
    }
    L.push('--------------------------------');
    L.push(row(T('TOTAL'), K.rp(o.total)));
    if (o.fee > 0) L.push(row(T('Denda'), K.rp(o.fee)));
    if (o.dp > 0) L.push(row('DP', K.rp(o.dp)));
    L.push(row(T('SISA'), K.rp(this.remaining(o))));
    L.push(row(T('Status'), this.statusLabel(o.status)));
    if (o.sub === 'rental' && o.deposit > 0) L.push(row(T('Deposit'), K.rp(o.deposit)));
    if (o.note) L.push(('Ket: ' + o.note).slice(0, 32));
    L.push('--------------------------------');
    L.push(mid(T('Tunjukkan kode ') + this.code(o)));
    L.push(mid(T('saat mengambil. Terima kasih!')));
    return L.join('\n');
  },
  shareNota: function (id) {
    var o = this.byId(id);
    if (!o) return;
    UI.shareText(T('Nota Order ') + this.code(o), this.notaText(o));
  },
  printNota: function (id) {
    var o = this.byId(id);
    if (!o) return;
    var text = this.notaText(o);
    try {
      if (window.OGKasirPrinter && Printer.connected) { OGKasirPrinter.printText(text); return; }
    } catch (e) {}
    UI.shareText(T('Nota Order ') + this.code(o), text);
  },

  /* ---------- alur status ---------- */
  advance: function (id) {
    var o = this.byId(id);
    if (!o) return;
    UI.closeSheet();
    if (o.status === 'diterima') {
      o.status = 'diproses';
      KDB.save();
      UI.toast(this.code(o) + ' — ' + T('Diproses'));
      App.rerender();
    } else if (o.status === 'diproses') {
      o.status = 'selesai';
      o.doneAt = Date.now();
      this.snapshotCommissions(o);
      KDB.save();
      UI.toast(this.code(o) + ' — ' + T('Selesai'));
      App.rerender();
    } else if (o.status === 'selesai') {
      this.settleSheet(id);
    }
  },

  /* komisi salon dibekukan saat order selesai: per karyawan penanggung jawab order */
  snapshotCommissions: function (o) {
    o.commissions = [];
    if (o.sub !== 'salon') return;
    var total = 0;
    for (var i = 0; i < o.items.length; i++) {
      var it = o.items[i];
      if (it.commission > 0) total += Math.round(it.price * it.qty * it.commission / 100);
    }
    if (total > 0) {
      o.commissions.push({ empId: o.empId || '', name: o.empName || T('Karyawan'), amount: total });
    }
  },

  /* ringkasan komisi per karyawan dari order selesai/diambil (untuk halaman Karyawan) */
  commissionSummary: function () {
    var agg = {};
    var os = this.list();
    for (var i = 0; i < os.length; i++) {
      var o = os[i];
      if (o.status !== 'selesai' && o.status !== 'diambil') continue;
      var cms = (o.commissions && o.commissions.length) ? o.commissions : null;
      if (!cms && o.sub === 'salon') { this.snapshotCommissions(o); cms = o.commissions; }
      if (!cms) continue;
      for (var j = 0; j < cms.length; j++) {
        var k = cms[j].empId || cms[j].name;
        if (!agg[k]) agg[k] = { name: cms[j].name, amount: 0, count: 0 };
        agg[k].amount += cms[j].amount;
        agg[k].count++;
      }
    }
    var out = [];
    for (var k2 in agg) out.push(agg[k2]);
    out.sort(function (a, b) { return b.amount - a.amount; });
    return out;
  },

  cancel: function (id) {
    var o = this.byId(id);
    if (!o || o.status === 'diambil' || o.status === 'batal') return;
    var self = this;
    UI.confirm(T('Batalkan order ') + this.code(o) + T('? Stok item yang dilacak dikembalikan.') +
      (o.dp > 0 ? T(' DP ') + K.rp(o.dp) + T(' perlu dikembalikan ke pelanggan secara manual.') : ''),
      T('Batalkan Order'), function () {
        for (var i = 0; i < o.items.length; i++) {
          var m = KDB.menuById(o.items[i].id);
          if (m && m.track) {
            m.stock = Math.round((m.stock + o.items[i].qty) * 1000) / 1000;
            KDB.addStockLog(m.id, m.name, 'in', o.items[i].qty, m.stock, 'Batal ' + self.code(o));
          }
        }
        o.status = 'batal';
        KDB.save();
        UI.closeSheet();
        UI.toast(T('Order dibatalkan'));
        App.rerender();
      });
  },

  /* ---------- pelunasan saat ambil → 1 transaksi paid di txs ---------- */
  settleSheet: function (id) {
    var o = this.byId(id);
    if (!o || o.status !== 'selesai') return;
    this._settleId = id;
    var sisa = this.remaining(o);
    var h = T('<h3 class="k-sheet-t">✅ Ambil & Lunasi ') + this.code(o) + '</h3>';
    h += '<div class="k-small k-muted" style="margin-bottom:10px">' + K.esc(o.customer.name) + ' • ' +
      T('Total ') + K.rp(this.grandTotal(o)) + ' • ' + T('sudah dibayar ') + K.rp(o.paidTotal || o.dp || 0) + '</div>';
    if (o.sub === 'rental') {
      h += '<div class="k-fld"><label>' + T('Denda keterlambatan (Rp, manual — kosongkan bila tepat waktu)') + '</label>' +
        '<input class="k-in" id="oFee" type="number" inputmode="numeric" placeholder="0" value="' + (o.fee || '') + '"></div>';
    }
    h += '<div class="k-fld"><label>' + T('Metode pelunasan') + '</label><div class="k-paygrid">' +
      this.settleBtn('Tunai', '💵') + this.settleBtn('QRIS', '📱') +
      this.settleBtn('Transfer', '🏦') + this.settleBtn('E-Wallet', '👛') + '</div></div>';
    h += '<div id="oSettleCashBox" style="display:' + (this._settleMethod === 'Tunai' ? 'block' : 'none') + '">' +
      '<div class="k-fld"><label>' + T('Uang diterima') + '</label>' +
      '<input class="k-in" id="oSettleCash" type="number" inputmode="numeric" placeholder="' + sisa + '"></div></div>';
    h += '<div class="k-total-row k-grand"><span>' + T('Sisa bayar') + '</span><span class="k-money" id="oSettleSisa">' + K.rp(sisa) + '</span></div>';
    h += T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeSheet()">Batal</button>') +
      T('<button class="k-btn k-pri" onclick="Order.settle()">✅ Lunasi & Ambil</button></div>');
    UI.openSheet(h);
    var self = this;
    var feeEl = document.getElementById('oFee');
    if (feeEl) feeEl.oninput = function () { self.settleRecalc(); };
  },
  settleBtn: function (name, emoji) {
    return '<button class="k-pay' + (this._settleMethod === name ? ' k-on' : '') +
      '" onclick="Order.setSettleMethod(\'' + name + '\')"><span class="k-pe">' + emoji + '</span>' + I18N.payName(name) + '</button>';
  },
  setSettleMethod: function (name) {
    // render ulang sheet membuang isian form — pertahankan uang diterima & denda (pola sama seperti setDpMethod)
    var keep = {};
    ['oSettleCash', 'oFee'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) keep[id] = el.value;
    });
    this._settleMethod = name;
    this.settleSheet(this._settleId);
    for (var k in keep) {
      var el2 = document.getElementById(k);
      if (el2) el2.value = keep[k];
    }
    this.settleRecalc(); // angka "Sisa bayar" mengikuti denda yang dipertahankan
  },
  settleRecalc: function () {
    var o = this.byId(this._settleId);
    var el = document.getElementById('oSettleSisa');
    if (!o || !el) return;
    var fee = document.getElementById('oFee') ? Math.max(0, K.num(document.getElementById('oFee').value)) : (o.fee || 0);
    el.textContent = K.rp(Math.max(0, (o.total || 0) + fee - (o.paidTotal || o.dp || 0)));
  },
  settle: function () {
    var o = this.byId(this._settleId);
    if (!o || o.status !== 'selesai') return;
    var feeEl = document.getElementById('oFee');
    if (feeEl) o.fee = Math.max(0, K.num(feeEl.value));
    var grand = this.grandTotal(o);
    var paidBefore = (o.paidTotal != null ? o.paidTotal : (o.dp || 0)); // DP yang sudah masuk sebelum pelunasan
    var sisa = Math.max(0, grand - paidBefore);
    var method = this._settleMethod || 'Tunai';
    var cashIn = K.num(document.getElementById('oSettleCash') ? document.getElementById('oSettleCash').value : 0);
    if (method === 'Tunai' && sisa > 0 && cashIn < sisa) { UI.toast(T('Uang kurang ') + K.rp(sisa - cashIn)); return; }
    // cash di tx = uang yang benar-benar diserahkan SAAT pelunasan (bukan total order);
    // non-tunai selalu pas sebesar sisa. Kembalian dihitung terhadap sisa, bukan total.
    var tendered = (method === 'Tunai') ? cashIn : sisa;
    var change = Math.max(tendered - sisa, 0);
    o.paidTotal = grand;
    o.status = 'diambil';
    o.takenAt = Date.now();
    this.snapshotCommissions(o);
    /* satu pintu laporan: order lunas menjadi transaksi paid */
    if (!o.txId) {
      var D = KDB.data;
      var cashier = (KDB.activeEmployee && KDB.activeEmployee()) || null;
      var tx = {
        id: K.uid(), no: D.nextNo, at: Date.now(), updatedAt: Date.now(),
        items: o.items.map(function (it) {
          return { id: it.id, name: it.name, price: it.price, cost: it.cost || 0, qty: it.qty,
            unit: it.unit || 'pcs', ws: 0, note: it.note || '' };
        }),
        cashierId: cashier ? cashier.id : '',
        cashierName: cashier ? cashier.name : (D.settings.userName || ''),
        cashierRole: cashier ? cashier.role : '',
        sub: grand, disc: 0, total: grand,
        pay: method, cash: tendered, change: change, dpPaid: paidBefore,
        note: T('Order ') + this.code(o), customer: o.customer.name,
        orderId: o.id, status: 'paid', voided: false
      };
      if (o.fee > 0) {
        tx.items.push({ id: 'fee', name: T('Denda keterlambatan'), price: o.fee, cost: 0, qty: 1, unit: 'pcs', ws: 0, note: '' });
        tx.sub = grand; // sub sudah termasuk denda: items menjumlah ke grand
      }
      D.nextNo++;
      D.txs.unshift(tx);
      o.txId = tx.id;
      Kasir.lastTx = tx;
    }
    KDB.save();
    UI.closeSheet();
    UI.toast(this.code(o) + ' — ' + T('Lunas & sudah diambil'));
    Kasir.mode = 'struk';
    App.go('kasir');
  }
};
