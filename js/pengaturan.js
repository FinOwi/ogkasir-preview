/* OGKasir - Dashboard: pusat kelola toko, akun, lisensi, karyawan, saran, dan pengaturan */
var Dashboard = {
  view: 'home',
  roles: ['Pemilik', 'Manajer', 'Kasir', 'Dapur', 'Pelayan', 'Lainnya'],

  open: function (v) {
    this.view = v;
    if (App._booted) App.rerender();
    window.scrollTo(0, 0);
  },

  back: function () {
    this.view = 'home';
    if (App._booted) App.rerender();
    window.scrollTo(0, 0);
  },

  menuRow: function (icon, bg, fg, title, onclick) {
    return '<button class="k-mrow" onclick="' + onclick + '">' +
      '<span class="k-mrow-ico" style="background:' + bg + ';color:' + fg + '">' + KIcon.get(icon, 21) + '</span>' +
      '<span class="k-mrow-main"><span class="k-mrow-t">' + title + '</span></span>' +
      '<span class="k-mrow-chev">›</span></button>';
  },

  subHead: function (title) {
    return '<div class="k-subhead"><button class="k-back-btn" onclick="Dashboard.back()">‹</button>' +
      '<div><div class="k-subhead-t">' + title + '</div>' +
      '<div class="k-subhead-crumb">' + T('Dashboard') + ' › ' + title + '</div></div></div>';
  },

  /* Baris setelan gaya referensi: ikon + judul + sub + sisi kanan (chevron/nilai/saklar/tombol). */
  srow: function (icon, title, sub, onclick, right, cls, icoStyle) {
    var inner = '<span class="k-srow2-ico"' + (icoStyle ? ' style="' + icoStyle + '"' : '') + '>' + icon + '</span>' +
      '<span class="k-srow2-main"><span class="k-srow2-t">' + title + '</span>' +
      (sub ? '<span class="k-srow2-sub">' + sub + '</span>' : '') + '</span>' +
      (right != null ? right : '<span class="k-srow2-chev">›</span>');
    var c = 'k-srow2' + (cls ? ' ' + cls : '');
    if (onclick) return '<button class="' + c + '" onclick="' + onclick + '">' + inner + '</button>';
    return '<div class="' + c + '">' + inner + '</div>';
  },

  /* Baris label -> nilai (statis) gaya referensi. */
  vrow: function (label, value) {
    return '<div class="k-vrow"><span>' + label + '</span><b>' + value + '</b></div>';
  },

  /* Kepala halaman besar gaya referensi: tombol kembali, judul besar, subjudul. */
  bigHead: function (title, sub) {
    return '<div class="k-bighead"><button class="k-back-btn" onclick="Dashboard.back()">‹</button>' +
      '<div class="k-bighead-t">' + title + '</div>' +
      '<div class="k-bighead-sub">' + sub + '</div></div>';
  },

  /* Isi view Pengaturan: kartu profil toko + grup menu. */
  settingsHome: function (s) {
    var lic = Lic.status();
    var licTxt = lic.state === 'active' ? T('Lisensi aktif') :
      (lic.state === 'trial' ? T('Trial · tersisa ') + lic.daysLeft + T(' hari') : T('Lisensi kedaluwarsa'));
    var initial = ((s.shop || 'W').trim().charAt(0) || 'W').toUpperCase();
    var h = '';
    if (typeof BizMode !== 'undefined') {
      h += '<div class="k-card k-group2" style="margin-bottom:14px">' +
        Dashboard.srow(KIcon.get('store', 21), T('Jenis Usaha'), T('Tampilan & fitur sesuai jenis usahamu'),
          "Dashboard.open('jenusaha')", '<span class="k-tag">' + BizMode.label() + '</span>', '', 'background:#E7EEFE;color:#2563EB') +
        '</div>';
    }
    h += '<button class="k-prof-card" onclick="Dashboard.open(\'profil\')">' +
      (K.safeImg(s.logo) ? '<span class="k-prof-ava"><img src="' + K.safeImg(s.logo) + '" alt=""></span>' : '<span class="k-prof-ava k-prof-letter">' + K.esc(initial) + '</span>') +
      '<span class="k-prof-main"><span class="k-prof-name">' + K.esc(s.shop || 'Warkop Saya') + '</span>' +
      '<span class="k-prof-sub">' + licTxt + '</span></span>' +
      '<span class="k-srow2-chev">›</span></button>';
    return h + this.renderGroups(s);
  },

  renderGroups: function (s) {
    var r = this.menuRow;
    var g = function (label, rows) {
      return '<div class="k-section-label">' + label + '</div><div class="k-card k-group">' + rows + '</div>';
    };
    var h = '';
    h += g(T('Akun & Toko'),
      r('store', '#E7EEFE', '#2563EB', T('Informasi Profil'), "Dashboard.open('profil')") +
      r('cloud', '#E0F2FE', '#0284C7', T('Akun & Sync'), "Dashboard.open('akun')") +
      r('idcard', '#FDEBDC', '#EA580C', T('Lisensi'), "Dashboard.open('lisensi')"));
    h += g(T('Tim'),
      r('users', '#E7EEFE', '#2563EB', T('Karyawan'), "Dashboard.open('karyawan')"));
    h += g(T('Operasional'),
      r('utensils', '#FDEBDC', '#EA580C', (typeof BizMode !== 'undefined' ? BizMode.term('catalogTab') : T('Menu')), "App.go('menu')") +
      r('package', '#E3F3E9', '#1F9D61', T('Stok'), "App.go('stok')") +
      r('chart', '#F0E9FE', '#7C3AED', T('Laporan'), "App.go('laporan')") +
      r('receipt', '#FDF3DD', '#B7791F', T('Tagihan'), "Dashboard.goBills()"));
    h += g(T('Perangkat & Sistem'),
      r('printer', '#E7EEFE', '#2563EB', T('Printer Struk'), "Dashboard.open('printer')") +
      r('palette', '#FCE7F3', '#DB2777', T('Tampilan'), "Dashboard.open('tampilan')") +
      r('shield', '#FBE7E3', '#C0392B', T('Keamanan'), "Dashboard.open('keamanan')") +
      r('filetext', '#EDF0F4', '#64748B', T('Preset Catatan'), "Dashboard.open('preset')") +
      r('database', '#FEF3C7', '#D97706', T('Data & Backup'), "Dashboard.open('data')"));
    h += g(T('Bantuan'),
      r('chat', '#F0E9FE', '#7C3AED', T('Kritik & Saran'), "Dashboard.open('saran')") +
      r('info', '#E0F2FE', '#0284C7', T('Tentang & Update'), "Dashboard.open('tentang')"));
    return h;
  },

  ensureData: function () {
    var D = KDB.data, s = D.settings;
    if (!Array.isArray(D.employees) || !D.employees.length) {
      D.employees = [{
        id: 'emp-owner', name: s.userName || 'Pemilik', role: 'Pemilik',
        phone: '', pin: '', active: true, isOwner: true, emoji: s.userEmoji || '👤',
        permissions: { kasir: true, menu: true, stok: true, laporan: true, dashboard: true },
        createdAt: Date.now()
      }];
    }
    if (!Array.isArray(D.feedback)) D.feedback = [];
    if (!s.activeEmployeeId) s.activeEmployeeId = D.employees[0].id;
  },

  stats: function () {
    var start = K.dayStart(Date.now()), omzet = 0, count = 0,
      unpaid = 0, unpaidCount = 0, low = 0, i, t, m;
    for (i = 0; i < KDB.data.txs.length; i++) {
      t = KDB.data.txs[i];
      if (t.voided) continue;
      if (t.status === 'unpaid') { unpaid += t.total || 0; unpaidCount++; }
      /* A-04: bon diakui pada paidAt (tanggal lunas), bukan tanggal dibuat.
         A-11: batas akhir hari ditegakkan juga (selaras Lap.range [start,end))
         — tx bertanggal masa depan tak lagi terhitung omzet hari ini. */
      else if (Lap.effTs(t) >= start && Lap.effTs(t) < start + 864e5) { omzet += t.total || 0; count++; }
    }
    for (i = 0; i < KDB.data.menus.length; i++) {
      m = KDB.data.menus[i];
      if (m.active && m.track && m.stock <= (m.min || 0)) low++;
    }
    return { omzet: omzet, count: count, unpaid: unpaid, unpaidCount: unpaidCount, low: low };
  },

  jump: function (id) {
    var el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  goBills: function () {
    Kasir.mode = 'tagihan';
    App.go('kasir');
  },

  tile: function (icon, title, sub, onclick) {
    return '<button class="k-dash-tile" onclick="' + onclick + '"><span class="k-dash-ico">' + icon +
      '</span><span class="k-dash-tt">' + title + '</span><span class="k-dash-sub">' + sub + '</span></button>';
  },

  /* ---------- Mode Usaha (Fase 1) ---------- */
  modeTile: function (icon, bg, fg, label, onclick) {
    return '<button class="k-dash2-tile" onclick="' + onclick + '">' +
      '<span class="k-dash2-chip" style="background:' + bg + ';color:' + fg + '">' + KIcon.get(icon, 27) + '</span>' +
      '<span class="k-dash2-tlabel">' + label + '</span></button>';
  },

  lowNames: function (max) {
    var out = [], ms = KDB.data.menus;
    for (var i = 0; i < ms.length && out.length < (max || 3); i++) {
      var m = ms[i];
      if (m.active && m.track && m.stock <= (m.min || 0)) out.push(m.name);
    }
    return out;
  },

  /* Kartu sorotan dashboard per mode — lahir dari masalah #1 tiap segmen (riset). */
  modeAlert: function (s, st) {
    var self = this; // lowCard/bonCard = fungsi lepas: `this` di dalamnya BUKAN Dashboard
    var mode = (typeof BizMode !== 'undefined') ? BizMode.id() : 'campuran';
    var bonCard = function () {
      if (st.unpaidCount > 0) {
        return '<button class="k-dash-alert k-dash-alert-gold" onclick="Dashboard.goBills()">' +
          '<span class="k-dash-alert-ico">' + KIcon.get('receipt', 22) + '</span>' +
          '<span class="k-dash-alert-main"><b>' + T('Bon belum lunas: ') + K.rp(st.unpaid) + '</b>' +
          '<span>' + st.unpaidCount + ' ' + BizMode.term('buyer').toLowerCase() + ' — ' + T('tagih pas mereka datang lagi') + '</span></span>' +
          '<span class="k-dash2-chev">›</span></button>';
      }
      return '<div class="k-dash-alert k-dash-alert-ok">' +
        '<span class="k-dash-alert-ico">' + KIcon.get('receipt', 22) + '</span>' +
        '<span class="k-dash-alert-main"><b>' + T('Tidak ada bon yang belum lunas') + '</b></span></div>';
    };
    var lowCard = function () {
      if (st.low > 0) {
        return '<button class="k-dash-alert k-dash-alert-red" onclick="App.go(\'stok\')">' +
          '<span class="k-dash-alert-ico">' + KIcon.get('package', 22) + '</span>' +
          '<span class="k-dash-alert-main"><b>' + T('Stok menipis: ') + st.low + ' ' + BizMode.term('item').toLowerCase() + '</b>' +
          '<span>' + K.esc(self.lowNames(3).join(', ')) + ' — ' + T('kulakan sebelum habis') + '</span></span>' +
          '<span class="k-dash2-chev">›</span></button>';
      }
      return '<div class="k-dash-alert k-dash-alert-ok">' +
        '<span class="k-dash-alert-ico">' + KIcon.get('package', 22) + '</span>' +
        '<span class="k-dash-alert-main"><b>' + T('Semua stok aman') + '</b></span></div>';
    };
    if (mode === 'bangunan') {
      /* sorotan utama Bangunan: piutang proyek yang lewat/dekat tempo */
      var due = Dashboard.dueProjects();
      if (due.count > 0) {
        return '<button class="k-dash-alert ' + (due.late > 0 ? 'k-dash-alert-red' : 'k-dash-alert-gold') + '" onclick="Dashboard.goBills()">' +
          '<span class="k-dash-alert-ico">' + KIcon.get('receipt', 22) + '</span>' +
          '<span class="k-dash-alert-main"><b>' + T('Piutang jatuh tempo: ') + due.count + ' ' + T('proyek') + ' — ' + K.rp(due.total) + '</b>' +
          '<span>' + K.esc(due.names.join(', ')) + (due.late > 0 ? ' — ' + T('ada yang sudah terlambat, tagih sekarang') : ' — ' + T('segera tagih sebelum lewat tempo')) + '</span></span>' +
          '<span class="k-dash2-chev">›</span></button>';
      }
      if (st.low > 0) return lowCard();
      return bonCard();
    }
    if (mode === 'jasa') {
      var oc = (typeof Order !== 'undefined') ? Order.counts() : { aktif: 0, diproses: 0, selesai: 0 };
      if (oc.aktif > 0) {
        return '<button class="k-dash-alert k-dash-alert-blue" onclick="App.go(\'order\')">' +
          '<span class="k-dash-alert-ico">' + KIcon.get('receipt', 22) + '</span>' +
          '<span class="k-dash-alert-main"><b>' + T('Order aktif: ') + oc.aktif + '</b>' +
          '<span>' + oc.diproses + ' ' + T('diproses') + ' • ' + oc.selesai + ' ' + T('selesai belum diambil') + '</span></span>' +
          '<span class="k-dash2-chev">›</span></button>';
      }
      return '';
    }
    if (mode === 'pedagang') return bonCard();
    if (mode === 'ritel') return lowCard();
    if (st.unpaidCount > 0) return bonCard();
    if (st.low > 0) return lowCard();
    return '';
  },

  /* Agregat piutang lewat/dekat tempo per proyek (Mode Bangunan). */
  dueProjects: function () {
    var out = { count: 0, total: 0, late: 0, names: [] };
    if (typeof Kasir === 'undefined') return out;
    var seen = {}, list = Kasir.unpaidList();
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (Kasir.billTypeOf && Kasir.billTypeOf(t) === 'kunjungan') continue; // Bon Meja tak pernah masuk piutang tempo
      var di = Kasir.dueInfo(t);
      if (!di || di.k === 'ok') continue;
      out.total += t.total || 0;
      if (di.k === 'late') out.late++;
      var key = t.project || ('#' + t.no);
      if (!seen[key]) {
        seen[key] = 1;
        out.count++;
        if (out.names.length < 3) out.names.push(t.project || ('#' + K.pad(t.no, 4)));
      }
    }
    return out;
  },

  /* Grid tile dashboard per mode (menggantikan grid generik; hero & omzet tetap). */
  modeTiles: function () {
    var mode = (typeof BizMode !== 'undefined') ? BizMode.id() : 'campuran';
    var t = this.modeTile;
    var set = t('gear', '#EDF0F4', '#64748B', T('Pengaturan'), "Dashboard.open('pengaturan')");
    var kary = t('users', '#E7EEFE', '#3B82F6', T('Karyawan'), "Dashboard.open('karyawan')");
    if (mode === 'pedagang') {
      return '<div class="k-dash2-grid">' +
        t('receipt', '#FDF3DD', '#B7791F', T('Tagihan / Bon'), "Dashboard.goBills()") + kary +
        t('package', '#E3F3E9', '#1F9D61', T('Stok Bahan'), "App.go('stok')") + set + '</div>';
    }
    if (mode === 'ritel') {
      return '<div class="k-dash2-grid">' +
        t('package', '#E3F3E9', '#1F9D61', T('Stok & Opname'), "App.go('stok')") +
        t('receipt', '#FDF3DD', '#B7791F', T('Buku Utang'), "Dashboard.goBills()") +
        t('banknote', '#E7EEFE', '#2563EB', T('Harga Grosir'), "App.go('menu')") + set + '</div>';
    }
    if (mode === 'bangunan') {
      return '<div class="k-dash2-grid">' +
        t('receipt', '#FDF3DD', '#B7791F', T('Bon Proyek'), "Dashboard.goBills()") +
        t('package', '#E3F3E9', '#1F9D61', T('Stok Material'), "App.go('stok')") +
        t('banknote', '#E7EEFE', '#2563EB', T('Harga Proyek'), "App.go('menu')") + set + '</div>';
    }
    if (mode === 'jasa') {
      return '<div class="k-dash2-grid">' +
        t('receipt', '#FCE7F3', '#DB2777', T('Order'), "App.go('order')") +
        t('refresh', '#E0F2FE', '#0284C7', BizMode.term('catalogTab'), "App.go('menu')") + kary + set + '</div>';
    }
    return '<div class="k-dash2-grid">' +
      t('receipt', '#FDF3DD', '#B7791F', T('Tagihan / Bon'), "Dashboard.goBills()") +
      t('package', '#E3F3E9', '#1F9D61', T('Stok'), "App.go('stok')") + kary + set + '</div>';
  },

  /* Banner sekali untuk pengguna lama: ajakan atur jenis usaha (bisa ditutup permanen). */
  modeHint: function (s) {
    if (s.bizModeHintSeen) return '';
    return '<div class="k-dash-alert k-dash-alert-blue" style="margin-bottom:14px">' +
      '<span class="k-dash-alert-ico">' + KIcon.get('store', 22) + '</span>' +
      '<span class="k-dash-alert-main"><b>' + T('Baru: Jenis Usaha') + '</b>' +
      '<span>' + T('Sesuaikan tampilan & fitur OGKasir dengan jenis usahamu — Pedagang, Ritel, Campuran, Bangunan, atau Jasa.') + '</span></span>' +
      '<span style="display:flex;flex-direction:column;gap:6px;flex:0 0 auto">' +
      '<button class="k-chip k-chip-pri" onclick="Dashboard.open(\'jenusaha\')">' + T('Atur') + '</button>' +
      '<button class="k-chip" onclick="Dashboard.dismissModeHint()">' + T('Nanti saja') + '</button></span></div>';
  },
  dismissModeHint: function () {
    KDB.data.settings.bizModeHintSeen = true;
    KDB.save();
    App.rerender();
  },

  /* Baris pemilih mode — dipakai Pengaturan > Jenis Usaha. */
  modeRowHtml: function (id, cur) {
    var p = BizMode.preset(id);
    if (!p) return '';
    var ico = '<span class="k-mode-ico" style="background:' + p.iconBg + ';color:' + p.iconFg + '">' + KIcon.get(p.icon, 22) + '</span>';
    var main = '<span class="k-mode-main"><span class="k-mode-t">' + BizMode.label(id) + '</span>' +
      '<span class="k-mode-sub">' + K.esc(p.examples) + '</span></span>';
    if (!p.selectable) {
      return '<button class="k-mode-row k-dis" onclick="Dashboard.modeSoon(\'' + id + '\')">' + ico + main +
        '<span class="k-tag k-goldtag">' + T('Segera') + '</span></button>';
    }
    return '<button class="k-mode-row' + (id === cur ? ' k-on' : '') + '" onclick="Dashboard.pickBizMode(\'' + id + '\')">' + ico + main +
      '<span class="k-mode-radio' + (id === cur ? ' k-on' : '') + '"></span></button>';
  },

  bizModeCard: function (s) {
    var cur = BizMode.id();
    var h = '<div class="k-card k-group2">';
    for (var i = 0; i < BizMode.ORDER.length; i++) h += this.modeRowHtml(BizMode.ORDER[i], cur);
    h += '</div>' +
      '<p class="k-small k-muted" style="margin:10px 6px 0">' +
      T('Ganti mode hanya mengubah susunan & istilah. Data transaksi, stok, dan bon kamu tidak berubah.') + '</p>';
    /* Mode Jasa: sub-pilih jenis jasa (Laundry/Bengkel/Salon/Rental/Lainnya) */
    if (cur === 'jasa') {
      h += '<div class="k-section-label" style="margin-top:16px">' + T('Jenis Jasa') + '</div>' +
        '<div class="k-card k-group2">';
      for (var j = 0; j < BizMode.SUB_ORDER.length; j++) h += this.subRowHtml(BizMode.SUB_ORDER[j], BizMode.subId());
      h += '</div>' +
        '<p class="k-small k-muted" style="margin:10px 6px 0">' +
        T('Jenis jasa menentukan satuan, field order, dan contoh layanan.') + '</p>';
    }
    return h;
  },

  /* Baris pemilih sub-preset Jasa — dipakai Pengaturan > Jenis Usaha. */
  subRowHtml: function (id, cur) {
    var p = BizMode.subPreset(id);
    if (!p) return '';
    var ico = '<span class="k-mode-ico" style="background:' + p.iconBg + ';color:' + p.iconFg + '">' + KIcon.get(p.icon, 22) + '</span>';
    var main = '<span class="k-mode-main"><span class="k-mode-t">' + BizMode.subLabel(id) + '</span>' +
      '<span class="k-mode-sub">' + K.esc(p.examples) + '</span></span>';
    return '<button class="k-mode-row' + (id === cur ? ' k-on' : '') + '" onclick="Dashboard.pickBizSub(\'' + id + '\')">' + ico + main +
      '<span class="k-mode-radio' + (id === cur ? ' k-on' : '') + '"></span></button>';
  },

  pickBizSub: function (id) {
    if (id === BizMode.subId()) return;
    if (BizMode.setSub(id)) {
      BizMode.applySeedIfFresh(); // hanya mengganti bila data masih contoh bawaan murni
      KDB.save();
      UI.toast(T('Jenis jasa: ') + BizMode.subLabel(id));
      App.rerender();
    }
  },

  /* Ringkasan komisi Salon untuk halaman Karyawan (sederhana — bukan sistem gaji). */
  commissionCard: function () {
    if (typeof BizMode === 'undefined' || BizMode.id() !== 'jasa' || BizMode.subId() !== 'salon') return '';
    if (typeof Order === 'undefined') return '';
    var sum = Order.commissionSummary();
    if (!sum.length) return '';
    var h = '<div class="k-card" style="margin-top:12px"><h3>💇 ' + T('Komisi Karyawan (dari Order Selesai)') + '</h3>';
    for (var i = 0; i < sum.length; i++) {
      h += '<div class="k-total-row"><span>' + K.esc(sum[i].name) +
        ' <span class="k-small k-muted">(' + sum[i].count + ' ' + T('order') + ')</span></span>' +
        '<span class="k-money">' + K.rp(sum[i].amount) + '</span></div>';
    }
    h += '<div class="k-small k-muted" style="margin-top:6px">' +
      T('Ringkasan sederhana dari order salon yang sudah selesai — bukan sistem gaji.') + '</div></div>';
    return h;
  },

  modeSoon: function (id) {
    UI.toast(id === 'jasa' ? T('Mode Jasa sedang disiapkan') : T('Mode Bangunan sedang disiapkan'));
  },

  pickBizMode: function (id) {
    if (id === BizMode.id()) return;
    var label = BizMode.label(id);
    UI.confirm(T('Ganti ke mode ') + label + T('? Yang berubah hanya susunan & istilah — data transaksi, stok, dan bon tidak berubah.'), T('Ganti Mode'), function () {
      if (BizMode.set(id)) {
        BizMode.applySeedIfFresh(); // samakan dgn jalur onboarding: katalog contoh diganti seed mode baru
        KDB.data.settings.bizModeHintSeen = true;
        KDB.save();
        App.renderNav();
        UI.toast(T('Mode usaha: ') + label);
        App.rerender();
      }
    });
  },

  dashTile: function (view, icon, bg, fg, label) {
    return '<button class="k-dash2-tile" onclick="Dashboard.open(\'' + view + '\')">' +
      '<span class="k-dash2-chip" style="background:' + bg + ';color:' + fg + '">' + KIcon.get(icon, 27) + '</span>' +
      '<span class="k-dash2-tlabel">' + label + '</span></button>';
  },

  renderHome: function (s) {
    var st = this.stats();
    var emp = KDB.activeEmployee ? KDB.activeEmployee() : null;
    var lic = Lic.status();
    var licTxt = lic.state === 'active' ? T('Lisensi aktif') :
      (lic.state === 'trial' ? T('Trial ') + lic.daysLeft + T(' hari') : T('Lisensi kedaluwarsa'));
    /* hero biru — dipertahankan persis seperti versi lama (keputusan zgg: Dashboard tetap, yang berubah Pengaturan + sub-bagiannya) */
    var h = '<div class="k-dash-hero"><div class="k-dash-hero-row">' +
      '<div class="k-dash-avatar">' + (K.safeImg(s.logo) ? '<img src="' + K.safeImg(s.logo) + '" alt="">' : '☕') + '</div>' +
      '<div class="k-dash-hero-main"><div class="k-dash-eyebrow">' + T('DASHBOARD OGKASIR') + '</div>' +
      '<div class="k-dash-shop">' + K.esc(s.shop || 'Warkop Saya') + '</div>' +
      '<div class="k-dash-meta">' + T('Kasir aktif: ') + K.esc(emp ? emp.name : (s.userName || 'Pemilik')) +
      ' • ' + K.esc(emp ? emp.role : 'Pemilik') + '</div></div>' +
      '<span class="k-tag k-grn">' + licTxt + '</span></div>' +
      '<div class="k-dash-note">' + T('Pusat kelola akun, sinkronisasi, lisensi, karyawan, dan semua pengaturan toko dalam satu tempat.') + '</div></div>';

    /* kartu omzet hari ini -> Laporan */
    h += '<button class="k-dash2-omzet" onclick="App.go(\'laporan\')">' +
      '<span class="k-dash2-omzet-l">' + T('Omzet Hari Ini') + '</span>' +
      '<span class="k-dash2-omzet-main">' +
      '<span class="k-dash2-chip" style="background:#DFF5E3;color:#1F9D61">' + KIcon.get('banknote', 26) + '</span>' +
      '<span class="k-dash2-omzet-mid"><span class="k-dash2-omzet-v">' + K.rp(st.omzet) + '</span>' +
      '<span class="k-dash2-omzet-n">' + st.count + ' ' + T('transaksi') + '</span></span>' +
      '<span class="k-dash2-chev">›</span></span></button>';

    /* Mode Usaha: ajakan sekali (pengguna lama) + sorotan & tile per mode */
    h += this.modeHint(s);
    h += this.modeAlert(s, st);
    h += this.modeTiles();
    return h;
  },

  accountCard: function (s) {
    var dc = LicCrypto.fmtDevice(Lic.deviceCode());
    var last = s.cloudTs ? new Date(s.cloudTs).toLocaleString('id-ID') : T('Belum pernah');
    var h = T('<div class="k-card" id="dash-akun"><h3>Akun & Sinkronisasi Multi-Platform</h3>');
    if (!Account.signedIn()) {
      h += '<div class="k-row" style="margin-bottom:10px"><div><b>' + T('Belum masuk akun') + '</b><div class="k-small k-muted">' +
        T('Satu akun untuk Android dan tablet tokomu: lisensi mengikuti akun, data ikut tersinkron. Kasir tetap jalan offline — sync menyusul saat ada internet.') + '</div></div>' +
        '<span class="k-tag">' + T('Opsional') + '</span></div>' +
        '<div class="k-vlist">' +
        Dashboard.vrow(T('Perangkat ini'), dc) +
        Dashboard.vrow(T('Cloud Backup terakhir'), K.esc(last)) + '</div>' +
        T('<div class="k-btn-row"><button class="k-btn k-pri" onclick="Account.signInModal(false)">Masuk / Daftar Akun</button>') +
        T('<button class="k-btn k-sec" onclick="Cloud.backup()">Backup Sekarang</button></div></div>');
      return h;
    }
    var sum = Sync.summary();
    var lastSync = sum.lastSyncTs ? new Date(sum.lastSyncTs).toLocaleString('id-ID') : T('Belum pernah');
    var devTxt = Account.devInfo
      ? Account.devInfo.device_count + ' / ' + Account.devInfo.max_devices
      : '—';
    h += '<div class="k-row" style="margin-bottom:10px"><div><b>' + K.esc(Account.email()) + '</b>' +
      '<div class="k-small k-muted">' + T('Akun terhubung — data toko tersinkron antar perangkat.') + '</div></div>' +
      '<span class="k-tag k-grn">' + T('Aktif') + '</span></div>' +
      '<div class="k-vlist">' +
      Dashboard.vrow(T('Perangkat terdaftar'), devTxt) +
      Dashboard.vrow(T('Perangkat ini'), dc) +
      Dashboard.vrow(T('Sync terakhir'), K.esc(lastSync)) +
      Dashboard.vrow(T('Menunggu sync'), sum.pending + T(' bagian data')) +
      Dashboard.vrow(T('Cloud Backup terakhir'), K.esc(last)) + '</div>';
    if (Account.devError === 'device_limit') {
      h += '<div class="k-alert">' + T('Perangkat akun penuh — perangkat ini belum terdaftar. Cabut perangkat lama lewat admin atau tambah slot lisensi.') + '</div>';
    }
    if (sum.conflicts.length) {
      h += '<div class="k-alert"><b>' + T('Ada data yang berbeda antara perangkat ini dan cloud:') + '</b>';
      for (var ci = 0; ci < sum.conflicts.length; ci++) {
        var cf = sum.conflicts[ci];
        h += '<div class="k-btn-row" style="margin-top:6px"><span class="k-small">' + K.esc(cf.k.replace('|', ' • ')) + '</span>' +
          '<button class="k-btn k-sec" onclick="Sync.resolveUseCloud(\'' + cf.k + '\')">' + T('Pakai Cloud') + '</button>' +
          '<button class="k-btn k-sec" onclick="Sync.resolveUseLocal(\'' + cf.k + '\')">' + T('Pakai Perangkat Ini') + '</button></div>';
      }
      h += '</div>';
    }
    h += T('<div class="k-btn-row"><button class="k-btn k-pri" onclick="Sync.syncNow(true)">Sinkronkan Sekarang</button>') +
      T('<button class="k-btn k-sec" onclick="Account.changeEmailModal()">Ganti Email</button>') +
      T('<button class="k-btn k-sec" onclick="Account.doSignOut()">Keluar Akun</button></div>') +
      T('<button class="k-btn k-ghost" style="margin-top:8px" onclick="Dashboard.open(\'data\')">Buka Data & Backup</button></div>');
    return h;
  },

  licenseCard: function () {
    var h = '<div id="dash-lisensi">' + Lic.licCard();
    h += T('<div class="k-card"><h3>Lisensi Berbasis Akun</h3>');
    if (Account.signedIn() && Account.license) {
      var l = Account.license;
      var exp = l.expires_at ? K.fmtDate(Date.parse(l.expires_at)) : T('Unlimited');
      h += '<div class="k-vlist">' +
        Dashboard.vrow(T('Akun'), K.esc(Account.email())) +
        Dashboard.vrow(T('Status lisensi akun'), K.esc(l.status || 'none')) +
        Dashboard.vrow(T('Paket'), K.esc(l.plan_label || '—')) +
        Dashboard.vrow(T('Berlaku sampai'), exp) +
        Dashboard.vrow(T('Maks perangkat'), (l.max_devices || 3)) + '</div>';
    } else if (Account.signedIn()) {
      h += '<p class="k-small k-muted">' + T('Akun masuk, tapi data lisensi akun belum terbaca. Ketuk Sinkronkan di kartu Akun & Sync di atas.') + '</p>';
    } else {
      h += '<ul class="k-dash-ul">' +
        '<li>' + T('Lisensi mengikuti akun — satu akun untuk semua perangkat tokomu yang terdaftar.') + '</li>' +
        '<li>' + T('Lisensi perangkat yang masih aktif tetap dihormati sampai masa berlakunya selesai.') + '</li>' +
        '<li>' + T('Aktivasi & perpanjangan sekarang lewat akun — tanpa kode aktivasi.') + '</li></ul>' +
        T('<div class="k-btn-row"><button class="k-btn k-pri" onclick="Account.signInModal(false)">Masuk Akun</button></div>');
    }
    h += T('<button class="k-btn k-sec" style="margin-top:8px" onclick="UI.openLink(\'https://wa.me/6288279406268?text=Halo%20FinOwi,%20saya%20mau%20bertanya%20tentang%20lisensi%20OGKasir.\')">Tanya / Perpanjang via WhatsApp</button></div>');
    return h + '</div>';
  },

  employeeStats: function (emp) {
    var start = K.dayStart(Date.now()), count = 0, omzet = 0, i, t;
    for (i = 0; i < KDB.data.txs.length; i++) {
      t = KDB.data.txs[i];
      /* A-04: pakai paidAt bila ada; A-11: batas akhir hari juga berlaku */
      if (t.voided || t.status === 'unpaid' || Lap.effTs(t) < start || Lap.effTs(t) >= start + 864e5) continue;
      if ((t.cashierId && t.cashierId === emp.id) || (!t.cashierId && t.cashierName === emp.name)) {
        count++; omzet += t.total || 0;
      }
    }
    return { count: count, omzet: omzet };
  },

  permissionLabels: function (emp) {
    var p = emp.permissions || {}, labels = [];
    if (p.kasir) labels.push('Kasir');
    if (p.menu) labels.push('Menu');
    if (p.stok) labels.push('Stok');
    if (p.laporan) labels.push('Laporan');
    if (p.dashboard) labels.push('Dashboard');
    return labels.length ? labels.join(' • ') : T('Tanpa hak akses khusus');
  },

  employeesCard: function () {
    var es = KDB.data.employees || [];
    var activeId = KDB.data.settings.activeEmployeeId;
    var h = T('<div class="k-card" id="dash-karyawan"><h3>Karyawan</h3>') +
      '<p class="k-small k-muted" style="margin-top:0">' + T('Kelola tim, peran, hak akses, dan kasir yang sedang bertugas. Transaksi baru akan tercatat atas nama kasir aktif.') + '</p>';
    for (var i = 0; i < es.length; i++) {
      var e = es[i], st = this.employeeStats(e), isActive = e.id === activeId;
      h += '<div class="k-emp">' +
        '<div class="k-emp-head"><div class="k-emp-avatar">' + K.esc(e.emoji || '👤') + '</div>' +
        '<div class="k-emp-main"><div class="k-row"><b>' + K.esc(e.name) + '</b>' +
        (isActive ? '<span class="k-tag k-grn">' + T('Sedang bertugas') + '</span>' :
          (e.active ? '<span class="k-tag">' + T('Aktif') + '</span>' : '<span class="k-tag k-red">' + T('Nonaktif') + '</span>')) +
        '</div><div class="k-small k-muted">' + K.esc(e.role || 'Kasir') +
        (e.phone ? ' • ' + K.esc(e.phone) : '') + '</div>' +
        '<div class="k-small">' + T('Hak akses: ') + K.esc(this.permissionLabels(e)) + '</div>' +
        '<div class="k-small k-muted">' + T('Hari ini: ') + st.count + T(' transaksi • ') + K.rp(st.omzet) + '</div></div></div>' +
        '<div class="k-emp-acts">' +
        (!isActive && e.active ? '<button class="k-chip k-chip-pri" onclick="Dashboard.setActiveEmployee(\'' + K.escQ(e.id) + '\')">' + T('Jadikan Kasir Aktif') + '</button>' : '') +
        '<button class="k-chip" onclick="Dashboard.employeeForm(\'' + K.escQ(e.id) + '\')">' + T('Ubah') + '</button>' +
        (!e.isOwner ? '<button class="k-chip" onclick="Dashboard.toggleEmployee(\'' + K.escQ(e.id) + '\')">' + (e.active ? T('Nonaktifkan') : T('Aktifkan')) + '</button>' : '') +
        '</div></div>';
    }
    h += T('<button class="k-btn k-pri" style="margin-top:12px" onclick="Dashboard.employeeForm()">＋ Tambah Karyawan</button></div>');
    return h;
  },

  permCheck: function (key, label, checked) {
    return '<label class="k-chk k-perm"><input type="checkbox" id="empPerm-' + key + '"' +
      (checked ? ' checked' : '') + '> ' + label + '</label>';
  },

  employeeForm: function (id) {
    this.ensureData();
    var e = id ? KDB.employeeById(id) : null;
    var p = e && e.permissions ? e.permissions : { kasir: true, menu: false, stok: false, laporan: false, dashboard: false };
    var roleOpts = '';
    for (var i = 0; i < this.roles.length; i++) {
      roleOpts += '<option value="' + this.roles[i] + '"' + (e && e.role === this.roles[i] ? ' selected' : '') + '>' + this.roles[i] + '</option>';
    }
    var h = '<h3 class="k-sheet-t">' + (e ? T('Ubah Karyawan') : T('Tambah Karyawan')) + '</h3>' +
      '<div class="k-fld"><label>' + T('Nama karyawan') + '</label><input class="k-in" id="empName" value="' + K.esc(e ? e.name : '') + '" placeholder="cth: Rina"></div>' +
      '<div class="k-frow"><div class="k-fld"><label>' + T('Peran') + '</label><select class="k-sel" id="empRole">' + roleOpts + '</select></div>' +
      '<div class="k-fld" style="max-width:88px"><label>Avatar</label><input class="k-in" id="empEmoji" maxlength="4" style="text-align:center" value="' + K.esc(e ? (e.emoji || '👤') : '👤') + '"></div></div>' +
      '<div class="k-fld"><label>' + T('Nomor WhatsApp (opsional)') + '</label><input class="k-in" id="empPhone" inputmode="tel" value="' + K.esc(e ? (e.phone || '') : '') + '" placeholder="08xxxxxxxxxx"></div>' +
      /* S3: field PIN TIDAK pernah di-prefill (tersimpan sebagai hash).
         Kosongkan = PIN lama dipertahankan; isi 6 digit = ganti PIN. */
      '<div class="k-fld"><label>' + T('PIN karyawan (opsional, 6 digit)') + '</label><input class="k-in" id="empPin" type="password" inputmode="numeric" maxlength="6" value="" placeholder="••••••"><div class="k-small k-muted" style="margin-top:5px">' + (e && e.pin ? T('PIN sudah tersimpan (terenkripsi). Kosongkan untuk mempertahankan, isi 6 digit untuk mengganti, atau centang hapus di bawah.') : T('Dicatat untuk fondasi login staf. PIN aplikasi utama tetap terpisah di Keamanan.')) + '</div>' +
      (e && e.pin ? '<label class="k-check" style="margin-top:6px"><input type="checkbox" id="empPinDel"> ' + T('Hapus PIN karyawan ini') + '</label>' : '') + '</div>' +
      '<div class="k-fld"><label>' + T('Hak akses') + '</label><div class="k-perms">' +
      this.permCheck('kasir', 'Kasir & transaksi', !!p.kasir) +
      this.permCheck('menu', 'Menu & harga', !!p.menu) +
      this.permCheck('stok', 'Stok & inventaris', !!p.stok) +
      this.permCheck('laporan', 'Laporan & export', !!p.laporan) +
      this.permCheck('dashboard', 'Dashboard & pengaturan', !!p.dashboard) +
      '</div></div>' +
      '<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeModal()">' + T('Batal') + '</button>' +
      '<button class="k-btn k-pri" onclick="Dashboard.employeeSave(' + (e ? '\'' + K.escQ(e.id) + '\'' : 'null') + ')">' + T('Simpan Karyawan') + '</button></div>' +
      (e && !e.isOwner ? '<button class="k-btn k-danger" style="margin-top:10px" onclick="Dashboard.deleteEmployee(\'' + K.escQ(e.id) + '\')">' + T('Hapus Karyawan') + '</button>' : '');
    UI.openModal(h);
  },

  employeeSave: function (id) {
    var name = (document.getElementById('empName').value || '').trim();
    if (!name) { UI.toast(T('Nama karyawan wajib diisi')); return; }
    var pin = (document.getElementById('empPin').value || '').trim();
    if (pin && !/^[0-9]{6}$/.test(pin)) { UI.toast(T('PIN karyawan harus 6 digit angka')); return; }
    /* S3: kosong = pertahankan PIN lama; terisi = PIN baru (di-hash);
       centang hapus = kosongkan PIN. */
    var delPinEl = document.getElementById('empPinDel');
    var delPin = !!(delPinEl && delPinEl.checked);
    var perms = {
      kasir: document.getElementById('empPerm-kasir').checked,
      menu: document.getElementById('empPerm-menu').checked,
      stok: document.getElementById('empPerm-stok').checked,
      laporan: document.getElementById('empPerm-laporan').checked,
      dashboard: document.getElementById('empPerm-dashboard').checked
    };
    var e = id ? KDB.employeeById(id) : null;
    if (!e) {
      e = { id: K.uid(), active: true, isOwner: false, createdAt: Date.now() };
      KDB.data.employees.push(e);
    }
    e.name = name;
    e.role = document.getElementById('empRole').value;
    e.emoji = (document.getElementById('empEmoji').value || '👤').trim() || '👤';
    e.phone = (document.getElementById('empPhone').value || '').trim();
    if (delPin) e.pin = '';
    else if (pin) e.pin = PinHash.hash(pin); // S3: simpan hash + salt
    /* pin kosong & tanpa centang hapus: e.pin lama dipertahankan apa adanya */
    if (typeof e.pin === 'undefined') e.pin = '';
    e.permissions = perms;
    if (KDB.data.settings.activeEmployeeId === e.id) {
      KDB.data.settings.userName = e.name;
      KDB.data.settings.userEmoji = e.emoji;
    }
    KDB.save();
    UI.closeModal();
    UI.toast(T('Karyawan tersimpan'));
    App.rerender();
  },

  setActiveEmployee: function (id) {
    var e = KDB.employeeById(id);
    if (!e || !e.active) return;
    /* S4 (audit 30 Okt 2026): ganti kasir aktif ke karyawan ber-PIN
       wajib verifikasi PIN karyawan itu (dulu: sekali ketuk, tanpa
       verifikasi apa pun). Karyawan tanpa PIN berpindah seperti biasa. */
    if (e.pin) {
      UI.openModal(T('<h3 class="k-sheet-t">') + T('Ganti Kasir Aktif') + '</h3>' +
        '<p class="k-small k-muted">' + T('Masukkan PIN ') + K.esc(e.name) + T(' untuk menjadikannya kasir aktif.') + '</p>' +
        '<div class="k-fld"><label>PIN</label><input class="k-in" id="empSwitchPin" type="password" inputmode="numeric" maxlength="6" placeholder="••••••"></div>' +
        T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeModal()">Batal</button>') +
        '<button class="k-btn k-pri" onclick="Dashboard.confirmSwitchEmployee(\'' + K.escQ(e.id) + '\')">' + T('Jadikan Kasir Aktif') + '</button></div>');
      return;
    }
    this._doSetActive(e);
  },

  confirmSwitchEmployee: function (id) {
    var e = KDB.employeeById(id);
    if (!e || !e.active) return;
    var scope = 'emp:' + e.id;
    if (PinGuard.lockedMs(scope) > 0) {
      UI.toast(T('Terlalu banyak percobaan — tunggu ') + Math.ceil(PinGuard.lockedMs(scope) / 1000) + T(' dtk'));
      return;
    }
    var el = document.getElementById('empSwitchPin');
    var vr = PinHash.verify(e.pin, el ? el.value : '');
    if (!vr.ok) {
      var locked = PinGuard.fail(scope);
      UI.toast(locked > 0 ? T('PIN salah — terkunci ') + Math.ceil(locked / 1000) + T(' dtk') : T('PIN salah'));
      return;
    }
    PinGuard.reset(scope);
    if (vr.needsRehash) e.pin = PinHash.hash(el.value); // migrasi plaintext warisan
    UI.closeModal();
    this._doSetActive(e);
  },

  _doSetActive: function (e) {
    KDB.data.settings.activeEmployeeId = e.id;
    KDB.data.settings.userName = e.name;
    KDB.data.settings.userEmoji = e.emoji || '👤';
    KDB.save();
    UI.toast(T('Kasir aktif: ') + e.name);
    App.rerender();
  },

  toggleEmployee: function (id) {
    var e = KDB.employeeById(id);
    if (!e || e.isOwner) return;
    if (e.active && KDB.data.settings.activeEmployeeId === id) {
      UI.toast(T('Karyawan yang sedang bertugas tidak bisa dinonaktifkan'));
      return;
    }
    e.active = !e.active;
    KDB.save();
    App.rerender();
  },

  deleteEmployee: function (id) {
    var e = KDB.employeeById(id);
    if (!e || e.isOwner) return;
    UI.confirm(T('Hapus karyawan ') + e.name + T('? Riwayat transaksi tetap tersimpan.'), T('Hapus'), function () {
      KDB.data.employees = KDB.data.employees.filter(function (x) { return x.id !== id; });
      if (KDB.data.settings.activeEmployeeId === id) {
        var first = KDB.data.employees[0];
        KDB.data.settings.activeEmployeeId = first ? first.id : '';
        if (first) {
          KDB.data.settings.userName = first.name;
          KDB.data.settings.userEmoji = first.emoji || '👤';
        }
      }
      KDB.save();
      UI.closeModal();
      UI.toast(T('Karyawan dihapus'));
      App.rerender();
    });
  },

  feedbackCard: function () {
    var items = KDB.data.feedback || [];
    var h = T('<div class="k-card" id="dash-saran"><h3>Kritik dan Saran</h3>') +
      '<p class="k-small k-muted" style="margin-top:0">' + T('Ceritakan kendala atau ide fitur. Masukan tersimpan di perangkat dan bisa diteruskan ke FinOwi lewat WhatsApp.') + '</p>' +
      '<div class="k-fld"><label>' + T('Kategori') + '</label><select class="k-sel" id="fbCat">' +
      '<option>Usulan fitur</option><option>Laporan kendala / bug</option><option>Karyawan & akun</option><option>Lisensi & harga</option><option>Lainnya</option></select></div>' +
      '<div class="k-fld"><label>' + T('Kritik / saran') + '</label><textarea class="k-in" id="fbMsg" rows="4" placeholder="' + T('Tulis masukanmu di sini...') + '"></textarea></div>' +
      '<div class="k-fld"><label>' + T('Kontak yang bisa dihubungi (opsional)') + '</label><input class="k-in" id="fbContact" placeholder="Nomor WhatsApp / email"></div>' +
      T('<button class="k-btn k-pri" onclick="Dashboard.feedbackSave()">Simpan Masukan</button>');
    if (items.length) {
      h += '<div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px"><b>' + T('Masukan terakhir') + '</b>';
      for (var i = 0; i < Math.min(items.length, 5); i++) {
        var f = items[i];
        h += '<div class="k-fb"><div class="k-row"><b>' + K.esc(f.category) + '</b><span class="k-small k-muted">' +
          K.fmtDateTime(f.at) + '</span></div><div style="margin-top:4px">' + K.esc(f.message) + '</div>' +
          '<div class="k-row" style="margin-top:8px"><span class="k-tag">' + K.esc(f.status || 'Tersimpan') + '</span>' +
          '<button class="k-chip" onclick="Dashboard.feedbackWA(\'' + K.escQ(f.id) + '\')">' + T('Kirim via WhatsApp') + '</button></div></div>';
      }
      h += '</div>';
    }
    return h + '</div>';
  },

  feedbackSave: function () {
    var msg = (document.getElementById('fbMsg').value || '').trim();
    if (!msg) { UI.toast(T('Tulis kritik atau saran dulu')); return; }
    var entry = {
      id: K.uid(), at: Date.now(),
      category: document.getElementById('fbCat').value,
      message: msg,
      contact: (document.getElementById('fbContact').value || '').trim(),
      status: 'Tersimpan'
    };
    KDB.data.feedback.unshift(entry);
    // bila masuk akun, teruskan juga ke kotak masuk FinOwi di server
    if (window.Account && Account.signedIn()) {
      Account.pushFeedback(entry).then(function (ok) {
        if (ok) {
          entry.status = 'Terkirim ke FinOwi';
          KDB.save();
          if (App._booted) App.rerender();
        }
      });
    }
    KDB.save();
    UI.toast(T('Masukan tersimpan — terima kasih!'));
    App.rerender();
    setTimeout(function () { Dashboard.jump('dash-saran'); }, 30);
  },

  feedbackWA: function (id) {
    var list = KDB.data.feedback || [], f = null, i;
    for (i = 0; i < list.length; i++) if (list[i].id === id) f = list[i];
    if (!f) return;
    f.status = 'Terkirim via WhatsApp';
    KDB.save();
    var text = 'Kritik/Saran OGKasir\nKategori: ' + f.category + '\nPesan: ' + f.message +
      (f.contact ? '\nKontak: ' + f.contact : '') + '\nToko: ' + (KDB.data.settings.shop || '-');
    UI.openLink('https://wa.me/6288279406268?text=' + encodeURIComponent(text));
    App.rerender();
  }
};

/* OGKasir - pengaturan toko yang kini menjadi bagian Dashboard */
var AppSet = {
  render: function () {
    Dashboard.ensureData();
    var s = KDB.data.settings;
    var sec = {};
    sec.akun = Dashboard.accountCard(s);
    sec.lisensi = Dashboard.licenseCard();
    sec.karyawan = Dashboard.employeesCard() + Dashboard.commissionCard();
    sec.saran = Dashboard.feedbackCard();
    sec.update = '<div id="dash-update">' + Upd.card() + '</div>';
    sec.jenusaha = (typeof BizMode !== 'undefined') ? Dashboard.bizModeCard(s) : '';
    sec.toko = T('<div class="k-card" id="dash-toko"><h3>Profil Toko</h3>') +
      T('<div class="k-fld"><label>Nama toko</label><input class="k-in" id="sShop" value="') + K.esc(s.shop) + '"></div>' +
      T('<div class="k-fld"><label>Alamat (muncul di struk)</label><input class="k-in" id="sAddr" value="') + K.esc(s.addr) + '" placeholder="cth: Jl. Merdeka No. 10"></div>' +
      T('<div class="k-fld"><label>Catatan kaki struk</label><input class="k-in" id="sFoot" value="') + K.esc(s.foot) + '"></div>' +
      T('<div class="k-fld"><label>Nomor WhatsApp toko</label><input class="k-in" id="sPhone" inputmode="tel" value="') + K.esc(s.phone || '') + '" placeholder="08xxxxxxxxxx"></div>' +
      '<div class="k-fld"><label>' + T('Jenis usaha') + '</label><select class="k-sel" id="sShopType">' + AppSet.shopTypeOpts(s.shopType) + '</select></div>' +
      '<div class="k-fld"><label>' + T('Foto Toko / Warung') + '</label>' +
      '<div class="k-photo-row">' +
      (K.safeImg(s.logo) ? '<img src="' + K.safeImg(s.logo) + '" alt="">' : '<div class="k-photo-ph">\u26a1</div>') +
      '<div class="k-photo-main"><b>' + T('Logo / foto toko') + '</b><div class="k-small k-muted">' + T('Tampil di Dashboard, header & struk — otomatis diperkecil.') + '</div></div>' +
      '<button class="k-chip k-chip-pri" onclick="AppSet.pickLogo()">' + T('Ganti Foto') + '</button>' +
      (K.safeImg(s.logo) ? '<button class="k-chip" onclick="AppSet.clearLogo()">' + T('Hapus') + '</button>' : '') +
      '</div></div>' +
      '<input type="file" id="sLogoPick" accept="image/*" class="k-hidden" onchange="AppSet.onLogoPick(this)">' +
      T('<button class="k-btn k-pri" onclick="AppSet.saveProfile()">Simpan Profil</button></div>');

    /* ---- Profil Pengguna ---- */
    var av = (s.userEmoji || '').trim() || '👤';
    sec.user = T('<div class="k-card" id="dash-profil"><h3>Profil Pengguna</h3>') +
      '<div class="k-row" style="align-items:center;margin-bottom:10px"><div style="width:48px;height:48px;border-radius:50%;background:var(--brand-soft);display:flex;align-items:center;justify-content:center;font-size:26px;flex:0 0 auto">' + K.esc(av) + '</div>' +
      '<div><b>' + K.esc(s.userName || T('Pengguna')) + '</b><div class="k-small k-muted">' + T('Kasir aplikasi ini') + '</div></div></div>' +
      '<div class="k-frow"><div class="k-fld"><label>' + T('Nama pengguna') + '</label>' +
      '<input class="k-in" id="sUserName" value="' + K.esc(s.userName || '') + '" placeholder="' + T('cth: Budi') + '"></div>' +
      '<div class="k-fld" style="max-width:88px"><label>Avatar</label>' +
      '<input class="k-in" id="sUserEmoji" value="' + K.esc(s.userEmoji || '') + '" placeholder="😎" maxlength="4" style="text-align:center"></div></div>' +
      '<div class="k-small k-muted" style="margin-bottom:10px">' + T('Nama tampil di struk sebagai kasir.') + '</div>' +
      '<button class="k-btn k-pri" onclick="AppSet.saveProfileUser()">' + T('Simpan Profil') + '</button></div>';

    sec.data = '<div class="k-card k-group2" id="dash-data">' +
      Dashboard.srow(KIcon.get('database',21), T('Data & Backup'), KDB.data.menus.length + T(' menu • ') +
        KDB.data.txs.filter(function (t) { return !t.voided; }).length + T(' transaksi'), null, '', '', 'background:#FDF3DD;color:#B7791F') +
      Dashboard.srow(KIcon.get('upload',21), 'Backup', T('Simpan salinan semua data ke file'), "AppSet.backup()", null, '', 'background:#E3F3E9;color:#1F9D61') +
      Dashboard.srow(KIcon.get('download',21), 'Restore', T('Pulihkan data dari file backup'), "AppSet.restore()", null, '', 'background:#E7EEFE;color:#2563EB') +
      Dashboard.srow(KIcon.get('folder',21), T('Buka Export Terakhir'), '', "UI.openLastExport()", null, '', 'background:#FDEBDC;color:#EA580C') +
      Dashboard.srow(KIcon.get('trash',21), T('Hapus Semua Data'), T('Tidak bisa dibatalkan'), "AppSet.wipe()", null, 'danger', 'background:#FBE7E3;color:#C0392B') +
      '</div>' +
      this.cloudCard();
    sec.printer = '<div class="k-card k-group2" id="dash-printer">' +
      Dashboard.srow(KIcon.get('printer',21), T('Printer Struk'), Printer.statusLine(), null, '', '', 'background:#E7EEFE;color:#2563EB') +
      Dashboard.srow(KIcon.get('image',21), T('Logo toko di struk'), s.logo ? T('Dicetak hitam-putih di bagian atas struk') : T('Atur logo dulu di Informasi Profil'), null,
        '<label class="k-chk"><input type="checkbox"' + (s.receiptLogo !== false ? ' checked' : '') + ' onchange="AppSet.toggleReceiptLogo(this.checked)"></label>', '', 'background:#FDF3DD;color:#B7791F') +
      Dashboard.srow(KIcon.get('bluetooth',21), 'Bluetooth', T('Hubungkan printer Bluetooth'), "Printer.pick()", null, '', 'background:#E0F2FE;color:#0284C7') +
      Dashboard.srow(KIcon.get('wifi',21), 'WiFi', T('Printer di jaringan WiFi yang sama'), "Printer.pickWifi()", null, '', 'background:#F0E9FE;color:#7C3AED') +
      Dashboard.srow(KIcon.get('filetext',21), T('Test Print'), T('Cetak contoh untuk memastikan printer siap'), "Printer.testPrint()", null, '', 'background:#E3F3E9;color:#1F9D61') +
      Dashboard.srow(KIcon.get('eye',21), T('Pratinjau Struk'), T('Lihat contoh struk beserta logonya'), "Printer.preview()", null, '', 'background:#EDF0F4;color:#64748B') +
      (Printer.connected ? Dashboard.srow(KIcon.get('scissors',21), T('Putuskan Printer'), '', "Printer.disconnect()", null, 'danger', 'background:#FBE7E3;color:#C0392B') : '') +
      '</div>' +
      T('<p class="k-small k-muted" style="margin:10px 6px 0">Thermal 58mm. <b>Bluetooth:</b> pairing dulu di pengaturan Bluetooth HP (±10 m). <b>WiFi:</b> printer & HP satu WiFi yang sama, isi IP printer — jangkauan selebar WiFi.</p>');
    sec.preset = T('<div class="k-card" id="dash-preset"><h3>Preset Catatan Pesanan</h3>') +
      T('<p class="k-small k-muted" style="margin-top:0">Pilihan cepat saat kasir mengisi catatan per item (cth: "setengah matang"). Ketuk × untuk hapus.</p>') +
      '<div class="k-chips" style="margin-bottom:10px">' + AppSet.presetChips() + '</div>' +
      T('<div class="k-frow"><input class="k-in" id="sPreset" placeholder="Preset baru, cth: Sambal terpisah">') +
      T('<button class="k-btn k-sec" onclick="AppSet.addPreset()">＋ Tambah</button></div></div>');

    sec.keamanan = '<div class="k-card k-group2" id="dash-keamanan">' +
      Dashboard.srow(KIcon.get('shield',21), T('PIN Aplikasi'), s.pin ? T('Aktif — diminta saat buka aplikasi') : T('Nonaktif'), null,
        '<button class="k-chip" onclick="AppSet.pinForm()">' + (s.pin ? T('Ubah') : 'Aktifkan') + '</button>', '', 'background:#FBE7E3;color:#C0392B') +
      (s.pin ? Dashboard.srow(KIcon.get('lock',21), T('Matikan PIN'), '', "AppSet.pinOff()", null, 'danger', 'background:#FBE7E3;color:#C0392B') : '') +
      '</div>';
    sec.tampilan = AppSet.tampilanCard(s);

    var ver = '?';
    try { if (window.KasirKuNative && KasirKuNative.appVersion) ver = KasirKuNative.appVersion(); } catch (e) {}
    sec.tentang = '<div class="k-card k-group2" id="dash-tentang">' +
      Dashboard.srow(KIcon.get('info',21), 'OGKasir', T('Aplikasi kasir UMKM • v') + K.esc(ver), null, '', '', 'background:#E0F2FE;color:#0284C7') +
      Dashboard.srow(KIcon.get('camera',21), 'Instagram', '@ogkasir', "UI.openLink('https://www.instagram.com/ogkasir')", null, '', 'background:#FCE7F3;color:#DB2777') +
      Dashboard.srow(KIcon.get('chat',21), 'WhatsApp', '+62 882-7940-6268', "UI.openLink('https://wa.me/6288279406268')", null, '', 'background:#E3F3E9;color:#1F9D61') +
      '<p class="k-small k-muted" style="padding:10px 2px 4px">' + T('Data tersimpan aman di HP ini (offline).') + '</p></div>';

    var v = Dashboard.view || 'home';
    if (v === 'home') return '<div class="k-dash-wrap">' + Dashboard.renderHome(s) + '</div>';
    var titles = { profil: 'Informasi Profil', akun: 'Akun & Sync', lisensi: 'Lisensi', karyawan: 'List Karyawan', saran: 'Kritik & Saran', data: 'Data & Backup', printer: 'Printer Struk', preset: 'Preset Catatan', keamanan: 'Keamanan', tampilan: 'Tampilan', tentang: 'Tentang & Update', pengaturan: 'Pengaturan', jenusaha: 'Jenis Usaha' };
    var crumbs = { profil: 'Akun', akun: 'Akun', lisensi: 'Akun', karyawan: 'Tim', saran: 'Bantuan', data: 'Pengaturan', printer: 'Pengaturan', preset: 'Pengaturan', keamanan: 'Pengaturan', tampilan: 'Pengaturan', tentang: 'Bantuan', jenusaha: 'Pengaturan' };
    var body = '';
    if (v === 'profil') body = sec.toko + sec.user;
    else if (v === 'tentang') body = sec.tentang + sec.update;
    else if (v === 'pengaturan') body = Dashboard.settingsHome(s);
    else body = sec[v] || '';
    var title = (crumbs[v] ? T(crumbs[v]) + ' — ' : '') + T(titles[v] || 'Dashboard');
    var head = v === 'pengaturan' ? Dashboard.bigHead(T('Pengaturan'), T('Profil & pengaturan toko')) : Dashboard.subHead(title);
    return '<div class="k-dash-wrap">' + head + body + '</div>';
  },

  /* ---------- preset catatan pesanan ---------- */
  presetChips: function () {
    var p = Kasir.notePresets();
    var h = '';
    for (var i = 0; i < p.length; i++) {
      h += '<span class="k-chip">' + K.esc(p[i]) +
        ' <b style="cursor:pointer;margin-left:2px" onclick="AppSet.delPreset(' + i + ')">×</b></span>';
    }
    return h || T('<span class="k-small k-muted">Belum ada preset</span>');
  },
  addPreset: function () {
    var el = document.getElementById('sPreset');
    var v = el ? el.value.trim() : '';
    if (!v) return;
    var p = Kasir.notePresets().slice();
    if (p.indexOf(v) < 0) { p.push(v); KDB.data.settings.notePresets = p; KDB.save(); }
    App.rerender();
  },
  delPreset: function (i) {
    var p = Kasir.notePresets().slice();
    if (i >= 0 && i < p.length) { p.splice(i, 1); KDB.data.settings.notePresets = p; KDB.save(); }
    App.rerender();
  },

  shopTypeOpts: function (cur) {
    var types = ['', 'Warkop', 'Café / Kedai Kopi', 'Rumah Makan', 'Toko Kelontong', 'Jajanan / Street Food', 'Lainnya'];
    var h = '';
    for (var i = 0; i < types.length; i++) {
      h += '<option value="' + types[i] + '"' + (types[i] === (cur || '') ? ' selected' : '') + '>' +
        (types[i] || '— Pilih jenis usaha —') + '</option>';
    }
    return h;
  },

  saveProfile: function () {
    var s = KDB.data.settings;
    s.shop = document.getElementById('sShop').value.trim() || 'Warkop Saya';
    s.addr = document.getElementById('sAddr').value.trim();
    s.foot = document.getElementById('sFoot').value.trim();
    var ph = document.getElementById('sPhone');
    if (ph) s.phone = ph.value.trim();
    var tp = document.getElementById('sShopType');
    if (tp) s.shopType = tp.value;
    KDB.save();
    // selaraskan juga ke profil akun bila sedang masuk
    if (window.Account && Account.signedIn && Account.signedIn() && Account.userId && Account.userId()) {
      Account.authed('/rest/v1/account_profiles?user_id=eq.' + Account.userId(), {
        method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
        body: { shop_name: s.shop, shop_address: s.addr, phone: s.phone || null, shop_type: s.shopType || null }
      }).catch(function () {});
    }
    UI.toast(T('Profil toko tersimpan'));
    App.renderHeader();
  },

  pickLogo: function () { document.getElementById('sLogoPick').click(); },

  onLogoPick: function (input) {
    var f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    if (f.type.indexOf('image/') !== 0) { UI.toast(T('File bukan gambar')); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        var MAX = 256, sc = Math.min(1, MAX / Math.max(img.width, img.height));
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * sc));
        cv.height = Math.max(1, Math.round(img.height * sc));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        KDB.data.settings.logo = cv.toDataURL('image/png');
        KDB.save();
        UI.toast(T('Logo tersimpan'));
        App.rerender();
      };
      img.onerror = function () { UI.toast(T('File bukan gambar')); };
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  },

  clearLogo: function () {
    KDB.data.settings.logo = '';
    KDB.save();
    UI.toast(T('Logo dihapus'));
    App.rerender();
  },

  toggleReceiptLogo: function (on) {
    KDB.data.settings.receiptLogo = !!on;
    KDB.save();
    UI.toast(T(on ? 'Logo akan dicetak di struk' : 'Logo tidak dicetak di struk'));
  },

  saveProfileUser: function () {
    var s = KDB.data.settings;
    s.userName = document.getElementById('sUserName').value.trim();
    s.userEmoji = document.getElementById('sUserEmoji').value.trim();
    var emp = KDB.activeEmployee ? KDB.activeEmployee() : null;
    if (emp) {
      if (s.userName) emp.name = s.userName;
      if (s.userEmoji) emp.emoji = s.userEmoji;
    }
    KDB.save();
    UI.toast(T('Profil tersimpan'));
    App.rerender();
  },

  /* ---------- cloud backup ---------- */
  cloudCard: function () {
    var s = KDB.data.settings;
    var h = '<div class="k-card k-group2" style="margin-top:14px">' +
      Dashboard.srow(KIcon.get('cloud',21), 'Cloud Backup', s.cloudTs ? T('Terakhir: ') + new Date(s.cloudTs).toLocaleString('id-ID') : T('Belum pernah backup ke cloud'), null, '', '', 'background:#E0F2FE;color:#0284C7');
    if (s.cloudKey) {
      h += Dashboard.vrow(T('Kode pemulihan'), K.esc(s.cloudKey) + ' <button class="k-chip" onclick="Cloud.copyKey()">' + T('Salin') + '</button>');
    }
    h += Dashboard.srow(KIcon.get('upload',21), T('Backup ke Cloud'), '', "Cloud.backup()", null, '', 'background:#E3F3E9;color:#1F9D61') +
      Dashboard.srow(KIcon.get('download',21), T('Pulihkan dari Cloud'), '', "Cloud.restoreSheet()", null, '', 'background:#E7EEFE;color:#2563EB') +
      Dashboard.srow(KIcon.get('refresh',21), T('Backup otomatis bulanan'), '', null,
        '<label class="k-chk"><input type="checkbox"' + (s.cloudAuto !== false ? ' checked' : '') + ' onchange="Cloud.toggleAuto(this.checked)"></label>', '', 'background:#F0E9FE;color:#7C3AED');
    if (Cloud.backend() === 'custom' && !s.cloudUrl) {
      h += '<p class="k-small k-muted" style="padding:8px 2px 4px">' + T('URL server cloud belum diisi — hubungi admin FinOwi.') + '</p>';
    } else if (Cloud.backend() === 'supabase') {
      h += '<p class="k-small k-muted" style="padding:8px 2px 4px">' + T('Cloud FinOwi aktif') + '</p>';
    }
    return h + '</div>';
  },

  backup: function () {
    /* S4: backup = aksi administratif -> hak 'dashboard' */
    if (typeof Perm !== 'undefined' && !Perm.guard('dashboard')) return;
    var json = JSON.stringify(KDB.exportData()); // S3+S5: PIN & cloudKey tidak ikut backup
    var d = new Date();
    function p2(x) { return (x < 10 ? '0' : '') + x; }
    UI.saveFile('ogkasir-backup-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.json', json, 'application/json');
  },
  restore: function () {
    if (typeof Perm !== 'undefined' && !Perm.guard('dashboard')) return;
    document.getElementById('kFilePick').click();
  },
  doRestore: function (text) {
    try {
      var d = JSON.parse(text);
      if (!d.menus || !d.settings) throw new Error(T('format salah'));
      var self = this;
      UI.confirm(T('Restore akan MENGGANTI semua data saat ini dengan file backup. Lanjut?'), T('Restore'), function () {
        /* Intake restore (S3 + X1/X2): PIN dari file SELALU diabaikan
           (PIN perangkat ini yang berlaku); foto menu & logo dinormalkan
           lewat K.safeImg agar nilai jahat tak menembus atribut src. */
        var keepPin = KDB.data.settings.pin || '';
        var keepEmpPins = {};
        (KDB.data.employees || []).forEach(function (e) { keepEmpPins[e.id] = e.pin || ''; });
        /* S5: kredensial cloud perangkat ini dipertahankan — isi backup
           tidak lagi memuat cloudKey (exportData mengosongkannya), dan
           jalur Cloud._showFound menaruh kode yang diketik user ke
           settings lokal tepat sebelum restore dipanggil. */
        var keepCloudKey = KDB.data.settings.cloudKey || '';
        var keepCloudDev = KDB.data.settings.cloudDevId || '';
        /* A-06: sanitasi struktur + migrasi yang sama seperti load() —
           backup lama/sebagian tidak lagi mengganti data secara mentah. */
        d = KDB.sanitize(d);
        d.settings.pin = keepPin;
        d.settings.cloudKey = keepCloudKey;
        d.settings.cloudDevId = keepCloudDev;
        if (Array.isArray(d.employees)) d.employees.forEach(function (e) {
          e.pin = Object.prototype.hasOwnProperty.call(keepEmpPins, e.id) ? keepEmpPins[e.id] : '';
        });
        KDB.data = d;
        KDB.migrate();
        Lic.init(); // verifikasi ulang lisensi untuk device ini
        KDB.save();
        App.applyTheme();
        App.renderHeader();
        UI.toast(T('Restore berhasil'));
        App.rerender();
      });
    } catch (e) { UI.toast(T('File backup tidak valid')); }
  },

  wipe: function () {
    if (typeof Perm !== 'undefined' && !Perm.guard('dashboard')) return;
    UI.confirm(T('Hapus SEMUA data (menu, transaksi, stok)? Tindakan ini tidak bisa dibatalkan.'), T('Hapus Semua'), function () {
      KDB.wipe();
      Kasir.cart = {};
      UI.toast(T('Semua data dihapus'));
      App.applyTheme();
      App.renderHeader();
      App.rerender();
    });
  },

  pinForm: function () {
    var has = !!KDB.data.settings.pin;
    UI.openModal(T('<h3 class="k-sheet-t">  ') + (has ? T('Ubah') : 'Aktifkan') + T(' PIN</h3>') +
      /* S3: mengubah PIN wajib membuktikan PIN lama */
      (has ? T('<div class="k-fld"><label>PIN lama</label><input class="k-in" id="kPin0" type="password" inputmode="numeric" maxlength="6" placeholder="••••••"></div>') : '') +
      T('<div class="k-fld"><label>PIN 6 digit</label><input class="k-in" id="kPin1" type="password" inputmode="numeric" maxlength="6" placeholder="••••••"></div>') +
      T('<div class="k-fld"><label>Ulangi PIN</label><input class="k-in" id="kPin2" type="password" inputmode="numeric" maxlength="6" placeholder="••••••"></div>') +
      T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeModal()">Batal</button>') +
      T('<button class="k-btn k-pri" onclick="AppSet.pinSave()">Simpan</button></div>'));
  },
  /* Verifikasi PIN lama untuk ubah/matikan PIN (S3) — tunduk PinGuard. */
  _checkOldPin: function (scope) {
    if (PinGuard.lockedMs(scope) > 0) {
      UI.toast(T('Terlalu banyak percobaan — tunggu ') + Math.ceil(PinGuard.lockedMs(scope) / 1000) + T(' dtk'));
      return false;
    }
    var el = document.getElementById('kPin0');
    var old = el ? el.value : '';
    var vr = PinHash.verify(KDB.data.settings.pin, old);
    if (!vr.ok) {
      var locked = PinGuard.fail(scope);
      UI.toast(locked > 0
        ? T('PIN lama salah — terkunci ') + Math.ceil(locked / 1000) + T(' dtk')
        : T('PIN lama salah'));
      return false;
    }
    PinGuard.reset(scope);
    return true;
  },
  pinSave: function () {
    var a = document.getElementById('kPin1').value, b = document.getElementById('kPin2').value;
    if (KDB.data.settings.pin && !this._checkOldPin('appset')) return;
    if (!/^[0-9]{6}$/.test(a)) { UI.toast(T('PIN harus 6 digit angka')); return; }
    if (a !== b) { UI.toast(T('PIN tidak sama')); return; }
    KDB.data.settings.pin = PinHash.hash(a); // S3: simpan hash, bukan plaintext
    KDB.save();
    UI.closeModal();
    UI.toast(T('PIN aktif'));
    App.rerender();
  },
  pinOff: function () {
    /* S3: mematikan PIN wajib PIN lama (modal verifikasi) */
    UI.openModal(T('<h3 class="k-sheet-t">') + T('Matikan PIN</h3>') +
      T('<div class="k-fld"><label>PIN lama</label><input class="k-in" id="kPin0" type="password" inputmode="numeric" maxlength="6" placeholder="••••••"></div>') +
      T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeModal()">Batal</button>') +
      T('<button class="k-btn k-danger" onclick="AppSet.pinOffConfirm()">Matikan PIN</button></div>'));
  },
  pinOffConfirm: function () {
    if (!this._checkOldPin('appset')) return;
    KDB.data.settings.pin = '';
    KDB.save();
    UI.closeModal();
    UI.toast(T('PIN dimatikan'));
    App.rerender();
  },


  /* ---------- Tampilan: mode, grid/baris, aksen, bahasa ---------- */
  tampilanCard: function (s) {
    var view = s.menuView || 'grid';
    /* X6 (audit 30 Okt 2026): aksen dari sync/restore divalidasi pola
       hex sebelum masuk atribut style/value kartu Warna Aksen. */
    var accRaw = (s.accent || '').toLowerCase();
    var acc = /^#[0-9a-f]{6}$/.test(accRaw) ? accRaw : '';
    var lang = s.lang || 'id';
    var h = T('<div class="k-card" id="dash-tampilan"><h3>Custom Tampilan</h3>');
    h += '<div class="k-fld"><label>' + T('Tema tampilan') + '</label><div class="k-themes">';
    for (var ti = 0; ti < Theme.THEMES.length; ti++) {
      var th = Theme.THEMES[ti];
      h += '<button class="k-theme' + (s.theme === th.id || (!s.theme && th.id === 'fintech') ? ' k-on' : '') + '" onclick="AppSet.theme(\'' + th.id + '\')">' +
        '<span class="k-tprev"><i style="background:' + th.prev[0] + '"></i><i style="background:' + th.prev[1] + '"></i><i style="background:' + th.prev[2] + '"></i></span>' +
        '<span class="k-tname">' + T(th.name) + '</span><br><span class="k-tdesc">' + T(th.desc) + '</span></button>';
    }
    h += '</div></div>';
    h += '<div class="k-fld"><label>' + T('Tampilan menu') + '</label><div class="k-seg">' +
      '<button class="' + (view === 'grid' ? 'k-on' : '') + '" onclick="AppSet.menuView(\'grid\')">' + T('\u229e Grid') + '</button>' +
      '<button class="' + (view === 'list' ? 'k-on' : '') + '" onclick="AppSet.menuView(\'list\')">' + T('\u2630 Baris') + '</button></div></div>';
    var sw = '';
    for (var i = 0; i < Theme.PRESETS.length; i++) {
      var c = Theme.PRESETS[i][0];
      sw += '<button class="k-sw' + (acc === c ? ' k-on' : '') + '" style="background:' + c + '" title="' + c + '" onclick="AppSet.accent(\'' + c + '\')"></button>';
    }
    var isCustom = acc && Theme.PRESETS.every(function (x) { return x[0] !== acc; });
    sw += '<label class="k-sw" style="background:' + (isCustom ? acc : 'conic-gradient(#f55,#fd5,#5f5,#5df,#55f,#f5f,#f55)') + ';position:relative;overflow:hidden" title="' + T('Warna sendiri') + '">' +
      '<input type="color" value="' + (isCustom ? acc : '#c07f26') + '" onchange="AppSet.accent(this.value)" style="position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer"></label>';
    h += '<div class="k-fld"><label>' + T('Warna aksen') + '</label><div class="k-swatches">' + sw + '</div>' +
      (acc ? '<button class="k-chip" onclick="AppSet.accentReset()">' + T('Kembalikan bawaan') + '</button>' : '') + '</div>';
    h += '<div class="k-fld"><label>' + T('Bahasa') + '</label><div class="k-seg">' +
      '<button class="' + (lang === 'id' ? 'k-on' : '') + '" onclick="AppSet.lang(\'id\')">🇮🇩 Indonesia</button>' +
      '<button class="' + (lang === 'en' ? 'k-on' : '') + '" onclick="AppSet.lang(\'en\')">🇬🇧 English</button></div></div>';
    return h + '</div>';
  },

  menuView: function (v) {
    KDB.data.settings.menuView = v;
    KDB.save();
    App.rerender();
  },

  accent: function (c) {
    KDB.data.settings.accent = c;
    KDB.save();
    App.applyTheme();
    App.rerender();
  },

  accentReset: function () {
    KDB.data.settings.accent = '';
    KDB.save();
    App.applyTheme();
    App.rerender();
  },

  lang: function (v) {
    KDB.data.settings.lang = v;
    KDB.save();
    I18N.setLang(v);
    App.renderHeader();
    App.renderNav();
    App.rerender();
  },

  theme: function (t) {
    KDB.data.settings.theme = Theme.valid(t);
    KDB.save();
    App.applyTheme();
    App.rerender();
  }
};
