/* OGKasir - kelola menu & kategori */
var Menu = {
  render: function () {
    var D = KDB.data;
    var catTitle = (typeof BizMode !== 'undefined') ? BizMode.term('catalogTitle') : 'Daftar Menu';
    var h = '<div class="k-row" style="margin-bottom:10px"><h3 style="margin:0">🍽️ ' + catTitle + '</h3>' +
      T('<button class="k-chip" onclick="Menu.catMgr()">⚙️ Kategori</button></div>');
    var hasSample = D.menus.some(function (m) { return m.sample; });
    if (hasSample) {
      h += T('<div class="k-card" style="border-style:dashed"><div class="k-row"><div class="k-small k-muted">Menu contoh untuk coba-coba. Hapus kalau sudah isi menu sendiri.</div></div>') +
        T('<button class="k-btn k-sec" style="margin-top:8px" onclick="Menu.clearSample()">🗑️ Hapus Menu Contoh</button></div>');
    }
    if (!D.menus.length) {
      h += UI.empty('🍽️', T('Belum ada menu'), T('Ketuk tombol + untuk tambah menu jualanmu.'), '');
    } else {
      var cats = D.cats.slice();
      // kategori yang tak terdaftar ikut ditampilkan
      for (var i = 0; i < D.menus.length; i++) {
        if (cats.indexOf(D.menus[i].cat) < 0) cats.push(D.menus[i].cat);
      }
      for (var c = 0; c < cats.length; c++) {
        var items = D.menus.filter(function (m) { return m.cat === cats[c]; });
        if (!items.length) continue;
        h += '<div class="k-small k-muted" style="margin:12px 2px 6px;font-weight:700">' + K.esc(cats[c]) + ' (' + items.length + ')</div>';
        h += '<div class="k-card" style="padding:6px 14px">';
        for (var j = 0; j < items.length; j++) {
          var m = items[j];
          var su = K.isKg(m) ? ' kg' : '';
          var sq = K.fmtQty(m.stock, m.unit) + su;
          var stk = m.track
            ? (m.stock <= 0 ? T('<span class="k-tag k-red">Habis</span>') : (m.stock <= m.min ? '<span class="k-tag k-red">Sisa ' + sq + '</span>' : T('<span class="k-small k-muted">Stok ') + sq + '</span>'))
            : T('<span class="k-small k-muted">Tanpa stok</span>');
          var vis = K.safeImg(m.photo) ? '<img class="k-thumb" loading="lazy" decoding="async" src="' + K.safeImg(m.photo) + '">' : '<div class="k-emo">' + K.esc(m.emoji || '🍽️') + '</div>';
          h += '<div class="k-li">' + vis +
            '<div class="k-tx"><div class="k-t1">' + K.esc(m.name) + (!m.active ? T(' <span class="k-tag">Nonaktif</span>') : '') + '</div>' +
            '<div class="k-t2">' + K.rp(m.price) + (K.isKg(m) ? '/kg' : '') + ' • ' + stk +
            (m.wPrice > 0 && m.wMin > 1 ? '<br><span style="color:var(--green)">' + (typeof BizMode !== 'undefined' ? BizMode.term('wholesaleLabel') : T('Harga grosir')) + ' ' + K.rp(m.wPrice) + ' (≥' + m.wMin + ')</span>' : '') +
            (m.packUnit && m.packQty > 1 ? '<br><span style="color:var(--muted)">1 ' + K.esc(m.packUnit) + ' = ' + m.packQty + ' pcs</span>' : '') +
            (m.units && m.units.length ? '<br><span style="color:var(--muted)">' + m.units.map(function (u) { return '1 ' + K.esc(u.name) + ' = ' + Kasir.fmtQtyAny(u.factor, m.unit) + ' ' + K.esc((m.unit && m.unit !== 'pcs') ? m.unit : 'pcs'); }).join(' • ') + '</span>' : '') +
            (m.commission > 0 ? '<br><span style="color:var(--muted)">' + T('Komisi karyawan') + ' ' + m.commission + '%</span>' : '') + '</div></div>' +
            T('<button class="k-ico-btn" onclick="Menu.form(\'') + K.escQ(m.id) + T('\')">✏️</button></div>');
        }
        h += '</div>';
      }
    }
    h += T('<button class="k-fab" onclick="Menu.form()">+</button>');
    return h;
  },

  _photo: '',

  form: function (id, presetCode) {
    var D = KDB.data;
    var m = id ? KDB.menuById(id) : { id: K.uid(), name: '', cat: D.cats[0] || '', price: 0, cost: 0, stock: 0, min: 5, track: true, active: true, emoji: '🍽️', photo: '', sample: false };
    if (!id && presetCode) m.code = presetCode;
    this._photo = m.photo || '';
    var h = '<h3 class="k-sheet-t">' + (id ? T('✏️ Ubah Menu') : T('＋ Tambah Menu')) + '</h3>';
    h += T('<div class="k-fld"><label>Foto menu (bisa di-crop biar pas)</label>') +
      '<div class="k-photopick" id="mPhotoPrev">' + (this._photo ? '<img src="' + this._photo + '">' : T('📷 Belum ada foto')) + '</div>' +
      T('<div class="k-btn-row" style="margin-top:8px"><button class="k-btn k-sec" onclick="Menu.pickPhoto()">📷 Pilih Foto</button>') +
      T('<button class="k-btn k-ghost" onclick="Menu.clearPhoto()">Hapus Foto</button></div>') +
      T('<input type="file" id="mPhotoPick" accept="image/*" class="k-hidden" onchange="Menu.onPhoto(this)"></div>');
    h += '<div class="k-fld"><label>Nama menu</label><input class="k-in" id="mName" value="' + K.esc(m.name) + '" placeholder="cth: Es Kopi Susu"></div>';
    h += '<div class="k-fld"><label>' + T('Kode / Barcode (opsional)') + '</label><div style="display:flex;gap:8px">' +
      '<input class="k-in" id="mCode" value="' + K.esc(m.code || '') + '" placeholder="cth: 8991234567890" style="flex:1;min-width:0">' +
      T('<button class="k-scanbtn" type="button" onclick="Menu.scanCode()" title="Scan barcode" aria-label="Scan barcode">') + K.SCAN_SVG + '</button></div></div>';
    h += '<div class="k-frow"><div class="k-fld"><label>Emoji</label><input class="k-in" id="mEmoji" value="' + K.esc(m.emoji || '') + '" placeholder="🍽️" maxlength="4"></div>' +
      '<div class="k-fld"><label>Kategori</label><select class="k-sel" id="mCat">';
    for (var i = 0; i < D.cats.length; i++) {
      h += '<option value="' + K.esc(D.cats[i]) + '"' + (D.cats[i] === m.cat ? ' selected' : '') + '>' + K.esc(D.cats[i]) + '</option>';
    }
    if (D.cats.indexOf(m.cat) < 0 && m.cat) h += '<option selected>' + K.esc(m.cat) + '</option>';
    h += '</select></div></div>';
    h += '<div class="k-frow"><div class="k-fld"><label id="mPriceLbl">' + (K.isKg(m) ? T('Harga per kg (Rp)') : T('Harga jual (Rp)')) + '</label><input class="k-in" id="mPrice" type="number" inputmode="numeric" value="' + m.price + '"></div>' +
      '<div class="k-fld"><label id="mCostLbl">' + (K.isKg(m) ? T('Modal per kg (Rp)') : T('Modal / HPP (Rp)')) + '</label><input class="k-in" id="mCost" type="number" inputmode="numeric" value="' + (m.cost || 0) + '"></div></div>';
    h += T('<div class="k-fld"><label>Satuan jual</label><div class="k-seg" id="mUnitSeg">') +
      '<button type="button" data-u="pcs" class="' + (K.isKg(m) ? '' : 'k-on') + '" onclick="Menu.unitTab(this)">Pcs</button>' +
      '<button type="button" data-u="kg" class="' + (K.isKg(m) ? 'k-on' : '') + '" onclick="Menu.unitTab(this)">⚖️ Kg</button></div>' +
      T('<div class="k-small k-muted">Pilih <b>Kg</b> untuk produk timbangan — buah, sayur, daging, dll.</div></div>');
    h += '<div class="k-check"><input type="checkbox" id="mTrack"' + (m.track ? ' checked' : '') + ' onchange="document.getElementById(\'mStockBox\').style.display=this.checked?\'block\':\'none\'"><label for="mTrack">' + T('Lacak stok menu ini') + '</label></div>';
    var decForm = K.isKg(m) || (typeof Kasir !== 'undefined' && Kasir.hasUnits(m));
    h += '<div id="mStockBox" style="display:' + (m.track ? 'block' : 'none') + '"><div class="k-frow">' +
      '<div class="k-fld"><label>' + T('Stok saat ini') + '</label><input class="k-in" id="mStock" type="' + (decForm ? 'text' : 'number') + '" inputmode="' + (decForm ? 'decimal' : 'numeric') + '" value="' + (decForm ? K.fmtQty(m.stock, 'kg') : m.stock) + '"></div>' +
      '<div class="k-fld"><label>' + T('Batas minimum') + '</label><input class="k-in" id="mMin" type="' + (decForm ? 'text' : 'number') + '" inputmode="' + (decForm ? 'decimal' : 'numeric') + '" value="' + (decForm ? K.fmtQty(m.min, 'kg') : (m.min || 0)) + '"></div></div></div>';
    /* Mode Ritel & Campuran: harga grosir dua tingkat + kemasan sederhana.
       Mode Bangunan: tingkat kedua = Harga Proyek (label menyesuaikan mode). */
    if (typeof BizMode !== 'undefined' && (BizMode.wholesaleForm() || BizMode.packForm())) {
      var bangF = BizMode.id() === 'bangunan';
      h += '<div class="k-card" style="padding:12px 14px;margin:4px 0 12px;background:var(--card2,#f8fafc)">' +
        '<div class="k-small" style="font-weight:800;margin-bottom:8px">' + (bangF ? T('Harga Proyek & Kemasan') : T('Harga Grosir & Kemasan')) + '</div>';
      if (BizMode.wholesaleForm()) {
        h += '<div class="k-frow">' +
          '<div class="k-fld"><label>' + (bangF ? T('Harga proyek (Rp, opsional)') : T('Harga grosir (Rp, opsional)')) + '</label><input class="k-in" id="mWPrice" type="number" inputmode="numeric" value="' + (m.wPrice || '') + '" placeholder="0"></div>' +
          '<div class="k-fld"><label>' + (bangF ? T('Min. beli proyek (qty)') : T('Min. beli grosir (qty)')) + '</label><input class="k-in" id="mWMin" type="number" inputmode="numeric" value="' + (m.wMin || '') + '" placeholder="cth: 10"></div></div>' +
          '<div class="k-small k-muted">' + (bangF ? T('Kasir otomatis pakai harga proyek bila qty mencapai minimum. Kosongkan untuk menonaktifkan.') : T('Kasir otomatis pakai harga grosir bila qty mencapai minimum. Kosongkan untuk menonaktifkan.')) + '</div>';
      }
      if (BizMode.packForm()) {
        var pu = m.packUnit || '';
        var opts = ['', 'dus', 'renteng', 'karton', 'pak'];
        h += '<div class="k-frow" style="margin-top:10px">' +
          '<div class="k-fld"><label>' + T('Satuan kemasan (opsional)') + '</label><select class="k-sel" id="mPackUnit">' +
          opts.map(function (o) { return '<option value="' + o + '"' + (o === pu ? ' selected' : '') + '>' + (o ? o : T('Tidak ada')) + '</option>'; }).join('') + '</select></div>' +
          '<div class="k-fld"><label>' + T('Isi per kemasan (pcs)') + '</label><input class="k-in" id="mPackQty" type="number" inputmode="numeric" value="' + (m.packQty || '') + '" placeholder="cth: 12"></div></div>' +
          '<div class="k-small k-muted">' + T('Stok tetap dihitung per pcs — kemasan hanya mempercepat input (1 kemasan = isi × pcs).') + '</div>';
      }
      h += '</div>';
    }
    /* Mode Bangunan: konversi satuan — stok disimpan dalam satuan DASAR,
       dijual juga dalam satuan turunan (1 turunan = faktor × dasar). */
    if (typeof BizMode !== 'undefined' && BizMode.get().convForm) {
      var uTxt = (m.units || []).map(function (u) {
        return u.name + ' | ' + String(u.factor).replace('.', ',') + (u.price > 0 ? ' | ' + u.price : '');
      }).join('\n');
      h += '<div class="k-card" style="padding:12px 14px;margin:4px 0 12px;background:var(--card2,#f8fafc)">' +
        '<div class="k-small" style="font-weight:800;margin-bottom:8px">' + T('Konversi Satuan') + '</div>' +
        '<div class="k-fld"><label>' + T('Satuan dasar stok') + '</label>' +
        '<input class="k-in" id="mBaseUnit" value="' + K.esc((m.unit && m.unit !== 'pcs') ? m.unit : (m.unit || 'pcs')) + '" placeholder="cth: kg, dus, batang"></div>' +
        '<div class="k-fld"><label>' + T('Satuan turunan (satu per baris: Nama | isi dalam satuan dasar | harga opsional)') + '</label>' +
        '<textarea class="k-in" id="mUnits" rows="3" placeholder="Sak | 40 | 68000">' + K.esc(uTxt) + '</textarea></div>' +
        '<div class="k-small k-muted">' + T('Contoh: Semen satuan dasarnya kg, dijual per Sak — tulis "Sak | 40 | 68000". Harga boleh dikosongkan (dihitung sebanding). Stok selalu berkurang dalam satuan dasar.') + '</div></div>';
    }
    /* Mode Jasa sub Salon: komisi karyawan per layanan */
    if (typeof BizMode !== 'undefined' && BizMode.id() === 'jasa' && (BizMode.subId() === 'salon' || m.commission > 0)) {
      h += '<div class="k-card" style="padding:12px 14px;margin:4px 0 12px;background:var(--card2,#f8fafc)">' +
        '<div class="k-small" style="font-weight:800;margin-bottom:8px">' + T('Komisi Karyawan') + '</div>' +
        '<div class="k-fld"><label>' + T('Komisi per layanan (%)') + '</label>' +
        '<input class="k-in" id="mComm" type="number" inputmode="numeric" value="' + (m.commission || '') + '" placeholder="cth: 20"></div>' +
        '<div class="k-small k-muted">' + T('Komisi tercatat otomatis di order selesai, untuk karyawan yang mengerjakan layanan ini.') + '</div></div>';
    }
    h += '<div class="k-check"><input type="checkbox" id="mActive"' + (m.active ? ' checked' : '') + '><label for="mActive">Tampilkan di kasir</label></div>';
    h += '<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeSheet()">Batal</button>' +
      (id ? '<button class="k-btn k-danger" onclick="Menu.del(\'' + K.escQ(m.id) + '\')">Hapus</button>' : '') +
      '<button class="k-btn k-pri" onclick="Menu.save(\'' + K.escQ(m.id) + '\',' + (id ? '1' : '0') + ')">Simpan</button></div>';
    UI.openSheet(h);
  },

  scanCode: function () {
    Scan.open(function (code) {
      var el = document.getElementById('mCode');
      if (el) el.value = code;
      UI.toast('Kode terbaca: ' + code);
    });
  },

  /* ---------- toggle satuan pcs / kg ---------- */
  unitTab: function (btn) {
    var bs = document.querySelectorAll('#mUnitSeg button');
    for (var i = 0; i < bs.length; i++) bs[i].classList.remove('k-on');
    btn.classList.add('k-on');
    var kg = btn.getAttribute('data-u') === 'kg';
    var pl = document.getElementById('mPriceLbl');
    if (pl) pl.textContent = kg ? T('Harga per kg (Rp)') : T('Harga jual (Rp)');
    var cl = document.getElementById('mCostLbl');
    if (cl) cl.textContent = kg ? T('Modal per kg (Rp)') : T('Modal / HPP (Rp)');
    var ms = document.getElementById('mStock'), mm = document.getElementById('mMin');
    if (ms) { ms.setAttribute('type', kg ? 'text' : 'number'); ms.setAttribute('inputmode', kg ? 'decimal' : 'numeric'); }
    if (mm) { mm.setAttribute('type', kg ? 'text' : 'number'); mm.setAttribute('inputmode', kg ? 'decimal' : 'numeric'); }
  },
  unitVal: function () {
    var on = document.querySelector('#mUnitSeg button.k-on');
    return on ? on.getAttribute('data-u') : 'pcs';
  },

  pickPhoto: function () {
    var p = document.getElementById('mPhotoPick');
    if (p) p.click();
  },
  clearPhoto: function () {
    this._photo = '';
    var pv = document.getElementById('mPhotoPrev');
    if (pv) pv.innerHTML = '📷 Belum ada foto';
  },
  onPhoto: function (input) {
    var f = input.files && input.files[0];
    if (!f) return;
    var self = this;
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        try {
          // kecilkan dulu secukupnya (max 1200) biar ringan, lalu buka editor crop
          var max = 1200, w = img.width, h = img.height;
          if (w > max || h > max) {
            var r = Math.min(max / w, max / h);
            w = Math.round(w * r); h = Math.round(h * r);
            var cv0 = document.createElement('canvas');
            cv0.width = w; cv0.height = h;
            cv0.getContext('2d').drawImage(img, 0, 0, w, h);
            var img2 = new Image();
            img2.onload = function () { self.openCrop(img2); };
            img2.onerror = function () { UI.toast('Gagal memproses foto'); };
            img2.src = cv0.toDataURL('image/jpeg', 0.85);
          } else {
            self.openCrop(img);
          }
        } catch (e) { UI.toast('Gagal memproses foto'); }
      };
      img.onerror = function () { UI.toast('File bukan gambar'); };
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
    input.value = '';
  },

  /* ---------- editor crop foto (kotak 1:1) ---------- */
  cropImg: null,
  cropSt: null, // {scale, cover, tx, ty} dalam piksel canvas 480
  openCrop: function (img) {
    this.cropImg = img;
    var h = T('<h3 class="k-sheet-t">✂️ Atur Foto</h3>') +
      T('<div class="k-small k-muted" style="margin-bottom:10px">Geser & cubit fotonya biar pas, lalu ketuk <b>Potong</b>.</div>') +
      '<div style="display:flex;justify-content:center"><canvas id="kCropCv" width="480" height="480" ' +
      'style="width:min(76vw,330px);height:min(76vw,330px);border-radius:14px;background:#111;touch-action:none"></canvas></div>' +
      '<div class="k-btn-row" style="margin-top:12px">' +
      T('<button class="k-btn k-ghost" onclick="Menu.cropCancel()">Batal</button>') +
      T('<button class="k-btn k-sec" onclick="Menu.cropZoom(0.8)" style="flex:0 0 52px">－</button>') +
      T('<button class="k-btn k-sec" onclick="Menu.cropZoom(1.25)" style="flex:0 0 52px">＋</button>') +
      T('<button class="k-btn k-pri" onclick="Menu.cropOk()">✓ Potong</button></div>');
    UI.openModal(h);
    var cover = Math.max(480 / img.width, 480 / img.height);
    this.cropSt = { scale: cover, cover: cover,
      tx: (480 - img.width * cover) / 2, ty: (480 - img.height * cover) / 2 };
    this.cropDraw();
    var self = this;
    var cv = document.getElementById('kCropCv');
    var mode = 0, lx = 0, ly = 0, lastD = 0;
    function pos(t) {
      var r = cv.getBoundingClientRect();
      return { x: (t.clientX - r.left) * 480 / r.width, y: (t.clientY - r.top) * 480 / r.height };
    }
    cv.addEventListener('touchstart', function (e) {
      e.preventDefault();
      if (e.touches.length === 1) { mode = 1; var p = pos(e.touches[0]); lx = p.x; ly = p.y; }
      else if (e.touches.length >= 2) {
        mode = 2;
        var a = pos(e.touches[0]), b = pos(e.touches[1]);
        lastD = Math.hypot(a.x - b.x, a.y - b.y);
      }
    }, { passive: false });
    cv.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (!self.cropSt) return;
      if (e.touches.length === 1 && mode === 1) {
        var p = pos(e.touches[0]);
        self.cropSt.tx += p.x - lx; self.cropSt.ty += p.y - ly;
        lx = p.x; ly = p.y;
        self.cropClamp(); self.cropDraw();
      } else if (e.touches.length >= 2) {
        var a = pos(e.touches[0]), b = pos(e.touches[1]);
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastD > 0 && d > 0) self.cropZoomAt(d / lastD, (a.x + b.x) / 2, (a.y + b.y) / 2);
        lastD = d;
      }
    }, { passive: false });
    cv.addEventListener('touchend', function (e) {
      lastD = 0;
      if (e.touches.length === 0) { mode = 0; }
      else if (e.touches.length === 1) { mode = 1; var p = pos(e.touches[0]); lx = p.x; ly = p.y; }
    });
  },
  cropClamp: function () {
    var st = this.cropSt, img = this.cropImg;
    if (!st || !img) return;
    var w = img.width * st.scale, h = img.height * st.scale;
    st.tx = Math.min(0, Math.max(480 - w, st.tx));
    st.ty = Math.min(0, Math.max(480 - h, st.ty));
  },
  cropZoomAt: function (f, cx, cy) {
    var st = this.cropSt;
    if (!st) return;
    var ns = Math.min(st.cover * 5, Math.max(st.cover, st.scale * f));
    var k = ns / st.scale;
    st.tx = cx - (cx - st.tx) * k;
    st.ty = cy - (cy - st.ty) * k;
    st.scale = ns;
    this.cropClamp();
    this.cropDraw();
  },
  cropZoom: function (f) { this.cropZoomAt(f, 240, 240); },
  cropDraw: function () {
    var cv = document.getElementById('kCropCv');
    if (!cv || !this.cropSt || !this.cropImg) return;
    var c = cv.getContext('2d'), st = this.cropSt, img = this.cropImg;
    c.fillStyle = '#111';
    c.fillRect(0, 0, 480, 480);
    try { c.drawImage(img, st.tx, st.ty, img.width * st.scale, img.height * st.scale); } catch (e) {}
  },
  cropOk: function () {
    var cv = document.getElementById('kCropCv');
    try {
      this._photo = cv.toDataURL('image/jpeg', 0.82);
      var pv = document.getElementById('mPhotoPrev');
      if (pv) pv.innerHTML = '<img src="' + this._photo + '">';
      UI.toast(T('Foto dipotong ✓'));
    } catch (e) { UI.toast(T('Gagal memotong foto')); }
    this.cropSt = null; this.cropImg = null;
    UI.closeModal();
  },
  cropCancel: function () {
    this.cropSt = null; this.cropImg = null;
    UI.closeModal();
  },

  /* baca field grosir & kemasan dari form (field hanya ada di mode Ritel/Campuran) */
  _readTrade: function (obj) {
    var wp = document.getElementById('mWPrice');
    if (wp) {
      var v = K.num(wp.value), mn = K.num(document.getElementById('mWMin').value);
      if (v > 0 && mn >= 2) { obj.wPrice = v; obj.wMin = mn; }
      else { delete obj.wPrice; delete obj.wMin; }
    }
    var pu = document.getElementById('mPackUnit');
    if (pu) {
      var pq = K.num(document.getElementById('mPackQty').value);
      if (pu.value && pq >= 2) { obj.packUnit = pu.value; obj.packQty = pq; }
      else { delete obj.packUnit; delete obj.packQty; }
    }
    /* Mode Bangunan: satuan dasar + daftar satuan turunan */
    var bu = document.getElementById('mBaseUnit');
    if (bu) {
      var bv = bu.value.trim().toLowerCase();
      if (bv) obj.unit = bv;
      var ut = document.getElementById('mUnits');
      var list = [];
      if (ut) {
        var lines = ut.value.split('\n');
        for (var i = 0; i < lines.length; i++) {
          var parts = lines[i].split('|');
          if (parts.length < 2) continue;
          var nm = parts[0].trim();
          var fc = K.numDec(parts[1]);
          var pr = parts.length > 2 ? K.num(parts[2]) : 0;
          if (nm && fc > 0) list.push({ name: nm, factor: fc, price: pr });
        }
      }
      if (list.length) obj.units = list; else delete obj.units;
    }
    /* Mode Jasa sub Salon: komisi karyawan (%) */
    var cm = document.getElementById('mComm');
    if (cm) {
      var cv = K.num(cm.value);
      if (cv > 0 && cv <= 100) obj.commission = cv; else delete obj.commission;
    }
  },

  /* stok desimal? untuk produk per-kg ATAU produk konversi satuan (dasar non-pcs) */
  _isDec: function (m) {
    if (K.isKg(m)) return true;
    if (typeof Kasir !== 'undefined' && Kasir.hasUnits(m)) return true;
    var bu = document.getElementById('mBaseUnit');
    if (bu) { var v = bu.value.trim().toLowerCase(); return v !== '' && v !== 'pcs'; }
    return false;
  },

  save: function (id, isEdit) {
    var name = document.getElementById('mName').value.trim();
    if (!name) { UI.toast(T('Nama menu wajib diisi')); return; }
    /* X3 (audit 30 Okt 2026): nama satuan bebas (dasar & turunan) tidak
       boleh memuat <, >, " — lapisan validasi di samping K.esc render. */
    var badUnit = /[<">]/;
    var buEl = document.getElementById('mBaseUnit'), unEl = document.getElementById('mUnits');
    if ((buEl && badUnit.test(buEl.value)) || (unEl && badUnit.test(unEl.value))) {
      UI.toast(T('Nama satuan tidak boleh memuat <, >, atau "'));
      return;
    }
    var price = Math.max(0, K.num(document.getElementById('mPrice').value));
    var unit = this.unitVal();
    var kg = unit === 'kg';
    var D = KDB.data;
    if (isEdit) {
      var m = KDB.menuById(id);
      if (!m) return;
      var oldStock = m.stock, oldTrack = m.track;
      m.name = name;
      m.photo = this._photo || '';
      m.emoji = document.getElementById('mEmoji').value.trim() || '🍽️';
      m.cat = document.getElementById('mCat').value;
      m.price = price;
      m.unit = unit;
      m.code = document.getElementById('mCode').value.trim();
      /* M3 (audit 30 Okt 2026): cost & stok/minimum TIDAK boleh negatif
         (cost negatif menggelembungkan laba) — clamp konsisten. */
      m.cost = Math.max(0, K.num(document.getElementById('mCost').value));
      m.track = document.getElementById('mTrack').checked;
      if (m.track) {
        var decE = this._isDec(m);
        m.stock = decE ? Math.max(0, Math.round(K.numDec(document.getElementById('mStock').value) * 1000) / 1000)
                     : Math.max(0, K.num(document.getElementById('mStock').value));
        m.min = decE ? Math.max(0, Math.round(K.numDec(document.getElementById('mMin').value) * 1000) / 1000)
                   : Math.max(0, K.num(document.getElementById('mMin').value));
        if (!oldTrack || m.stock !== oldStock) {
          KDB.addStockLog(m.id, m.name, 'adjust', m.stock - (oldTrack ? oldStock : 0), m.stock, T('Ubah manual'));
        }
      }
      m.active = document.getElementById('mActive').checked;
      this._readTrade(m);
      m.sample = false;
    } else {
      var nm = {
        id: id, name: name,
        photo: this._photo || '',
        emoji: document.getElementById('mEmoji').value.trim() || '🍽️',
        cat: document.getElementById('mCat').value,
        price: price, cost: Math.max(0, K.num(document.getElementById('mCost').value)), // M3
        code: document.getElementById('mCode').value.trim(),
        unit: unit,
        track: document.getElementById('mTrack').checked,
        stock: 0, min: 5, active: document.getElementById('mActive').checked, sample: false
      };
      if (nm.track) {
        var decN = this._isDec(nm);
        nm.stock = decN ? Math.max(0, Math.round(K.numDec(document.getElementById('mStock').value) * 1000) / 1000)
                      : Math.max(0, K.num(document.getElementById('mStock').value));
        nm.min = decN ? Math.max(0, Math.round(K.numDec(document.getElementById('mMin').value) * 1000) / 1000)
                    : Math.max(0, K.num(document.getElementById('mMin').value));
        KDB.addStockLog(nm.id, nm.name, 'adjust', nm.stock, nm.stock, T('Stok awal'));
      }
      this._readTrade(nm);
      D.menus.push(nm);
    }
    KDB.save();
    UI.closeSheet();
    UI.toast(T('Menu tersimpan'));
    App.rerender();
  },

  del: function (id) {
    var m = KDB.menuById(id);
    if (!m) return;
    UI.confirm(T('Hapus menu "') + m.name + T('"? Riwayat transaksi tetap tersimpan.'), T('Hapus'), function () {
      KDB.data.menus = KDB.data.menus.filter(function (x) { return x.id !== id; });
      KDB.save();
      UI.closeSheet();
      UI.toast(T('Menu dihapus'));
      App.rerender();
    });
  },

  clearSample: function () {
    UI.confirm(T('Hapus semua menu contoh?'), T('Hapus'), function () {
      KDB.removeSamples();
      UI.toast(T('Menu contoh dihapus'));
      App.rerender();
    });
  },

  /* ---------- kelola kategori ---------- */
  catMgr: function () {
    var D = KDB.data;
    var h = T('<h3 class="k-sheet-t">⚙️ Kelola Kategori</h3>');
    for (var i = 0; i < D.cats.length; i++) {
      var c = D.cats[i];
      var n = D.menus.filter(function (m) { return m.cat === c; }).length;
      h += '<div class="k-li"><div class="k-tx"><div class="k-t1">' + K.esc(c) + '</div>' +
        '<div class="k-t2">' + n + T(' menu</div></div>') +
        T('<button class="k-ico-btn" onclick="Menu.catRename(\'') + K.escQ(c) + T('\')">✏️</button> ') +
        T('<button class="k-ico-btn" onclick="Menu.catDel(\'') + K.escQ(c) + T('\')">🗑️</button></div>');
    }
    h += T('<div class="k-fld" style="margin-top:12px"><label>Kategori baru</label>') +
      '<div class="k-frow"><input class="k-in" id="kNewCat" placeholder="cth: Dessert">' +
      T('<button class="k-btn k-pri" style="width:auto;flex:0 0 auto" onclick="Menu.catAdd()">＋</button></div></div>');
    h += T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeSheet()">Tutup</button></div>');
    UI.openSheet(h);
  },
  catAdd: function () {
    var v = document.getElementById('kNewCat').value.trim();
    if (!v) return;
    if (KDB.data.cats.indexOf(v) >= 0) { UI.toast(T('Kategori sudah ada')); return; }
    KDB.data.cats.push(v);
    KDB.save();
    this.catMgr();
    App.rerender();
  },
  catRename: function (old) {
    var self = this;
    UI.openModal(T('<h3 class="k-sheet-t">Ubah Kategori</h3>') +
      '<div class="k-fld"><input class="k-in" id="kCatNew" value="' + K.esc(old) + '"></div>' +
      T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeModal()">Batal</button>') +
      T('<button class="k-btn k-pri" id="kCatSave">Simpan</button></div>'));
    document.getElementById('kCatSave').onclick = function () {
      var v = document.getElementById('kCatNew').value.trim();
      if (!v) return;
      var D = KDB.data;
      if (v !== old && D.cats.indexOf(v) >= 0) { UI.toast(T('Kategori "') + v + T('" sudah ada')); return; }
      var ix = D.cats.indexOf(old);
      if (ix >= 0) D.cats[ix] = v;
      for (var i = 0; i < D.menus.length; i++) if (D.menus[i].cat === old) D.menus[i].cat = v;
      KDB.save();
      UI.closeModal();
      self.catMgr();
      App.rerender();
    };
  },
  catDel: function (c) {
    var n = KDB.data.menus.filter(function (m) { return m.cat === c; }).length;
    if (n > 0) { UI.toast(T('Kategori dipakai ') + n + T(' menu — pindahkan dulu')); return; }
    var self = this;
    UI.confirm(T('Hapus kategori "') + c + '"?', T('Hapus'), function () {
      KDB.data.cats = KDB.data.cats.filter(function (x) { return x !== c; });
      KDB.save();
      self.catMgr();
      App.rerender();
    });
  }
};
