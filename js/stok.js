/* OGKasir - stok opname */
var Stok = {
  render: function () {
    var D = KDB.data;
    var tracked = D.menus.filter(function (m) { return m.track; });
    var low = tracked.filter(function (m) { return m.active && m.stock <= m.min; });
    var h = '';
    if (low.length) {
      h += T('<div class="k-alert">⚠️ <b>') + low.length + T(' menu stok menipis:</b> ') +
        low.map(function (m) { return K.esc(m.name) + ' (' + K.fmtQty(m.stock, m.unit) + (K.isKg(m) ? ' kg' : '') + ')'; }).join(', ') + '</div>';
    }
    h += T('<div class="k-card"><h3>📦 Stok Menu</h3>');
    if (!tracked.length) {
      h += UI.empty('📦', T('Belum ada stok dilacak'), T('Aktifkan "Lacak stok" saat tambah/ubah menu.'), '');
    } else {
      for (var i = 0; i < tracked.length; i++) {
        var m = tracked[i];
        var tag = m.stock <= 0 ? T('<span class="k-tag k-red">HABIS</span>')
          : (m.stock <= m.min ? '<span class="k-tag k-red">MENIPIS</span>' : T('<span class="k-tag k-grn">AMAN</span>'));
        var svis = m.photo ? '<img class="k-thumb" src="' + m.photo + '">' : '<div class="k-emo">' + K.esc(m.emoji || '🍽️') + '</div>';
        h += '<div class="k-li">' + svis +
          '<div class="k-tx"><div class="k-t1">' + K.esc(m.name) + '</div>' +
          '<div class="k-t2">' + tag + ' <span class="k-small k-muted">min ' + K.fmtQty(m.min, m.unit) + (K.isKg(m) ? ' kg' : '') + '</span></div></div>' +
          '<div class="k-rt"><div class="k-money" style="font-size:17px">' + K.fmtQty(m.stock, m.unit) + (K.isKg(m) ? '<span style="font-size:12px"> kg</span>' : '') + '</div>' +
          T('<button class="k-chip" style="margin-top:4px" onclick="Stok.adj(\'') + m.id + T('\')">Ubah</button></div></div>');
      }
    }
    h += '</div>';
    // riwayat stok
    h += T('<div class="k-card"><h3>🕘 Riwayat Stok</h3>');
    var log = D.stockLog.slice(0, 30);
    if (!log.length) h += T('<div class="k-small k-muted">Belum ada perubahan stok.</div>');
    for (var j = 0; j < log.length; j++) {
      var l = log[j];
      var lbl = l.type === 'in' ? T('Masuk') : (l.type === 'out' ? T('Keluar') : T('Penyesuaian'));
      var col = l.type === 'in' ? 'var(--green)' : (l.type === 'out' ? 'var(--red)' : 'var(--amber)');
      var sign = l.type === 'in' ? '+' : (l.type === 'out' ? '−' : '→');
      var lq = Number(l.qty) || 0, la = Number(l.after) || 0;
      var aq = Math.abs(lq);
      var qtxt = (Math.round(aq * 1000) / 1000) % 1 !== 0 ? K.fmtQty(aq, 'kg') : aq;
      var atxt = (Math.round(la * 1000) / 1000) % 1 !== 0 ? K.fmtQty(la, 'kg') : la;
      h += '<div class="k-li"><div class="k-tx"><div class="k-t1" style="font-weight:600">' + K.esc(l.name) + '</div>' +
        '<div class="k-t2">' + lbl + ' • ' + K.fmtDateTime(l.at) + (l.note ? ' • ' + K.esc(l.note) : '') + '</div></div>' +
        '<div class="k-rt"><div class="k-money" style="color:' + col + '">' + sign + qtxt + '</div>' +
        '<div class="k-small k-muted">sisa ' + atxt + '</div></div></div>';
    }
    h += '</div>';
    return h;
  },

  adj: function (id) {
    var m = KDB.menuById(id);
    if (!m) return;
    var kg = K.isKg(m);
    var h = T('<h3 class="k-sheet-t">📦 ') + K.esc(m.name) + '</h3>' +
      T('<div class="k-small k-muted" style="margin-bottom:10px">Stok saat ini: <b>') + K.fmtQty(m.stock, m.unit) + (kg ? ' kg' : '') + '</b></div>' +
      '<div class="k-seg" id="kAdjSeg">' +
      T('<button class="k-on" data-t="in" onclick="Stok.adjTab(this)">Masuk</button>') +
      T('<button data-t="out" onclick="Stok.adjTab(this)">Keluar</button>') +
      T('<button data-t="set" onclick="Stok.adjTab(this)">Atur</button></div>') +
      (kg
        ? T('<div class="k-fld"><label>Jumlah (kg)</label><input class="k-in" id="kAdjQty" type="text" inputmode="decimal" placeholder="0"></div>')
        : T('<div class="k-fld"><label>Jumlah</label><input class="k-in" id="kAdjQty" type="number" inputmode="numeric" placeholder="0"></div>')) +
      T('<div class="k-fld"><label>Catatan (opsional)</label><input class="k-in" id="kAdjNote" placeholder="cth: belanja pagi"></div>') +
      T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeSheet()">Batal</button>') +
      T('<button class="k-btn k-pri" onclick="Stok.adjSave(\'') + m.id + T('\')">Simpan</button></div>');
    UI.openSheet(h);
  },
  adjTab: function (btn) {
    var bs = document.querySelectorAll('#kAdjSeg button');
    for (var i = 0; i < bs.length; i++) bs[i].classList.remove('k-on');
    btn.classList.add('k-on');
  },
  adjSave: function (id) {
    var m = KDB.menuById(id);
    if (!m) return;
    var kg = K.isKg(m);
    var on = document.querySelector('#kAdjSeg button.k-on');
    var t = on ? on.getAttribute('data-t') : 'in';
    var q = kg ? Math.round(K.numDec(document.getElementById('kAdjQty').value) * 1000) / 1000
               : K.num(document.getElementById('kAdjQty').value);
    if (q < 0) q = 0;
    var note = document.getElementById('kAdjNote').value.trim();
    var after = m.stock, delta = 0;
    if (t === 'in') { delta = q; after = m.stock + q; }
    else if (t === 'out') {
      if (q > m.stock) { UI.toast(T('Stok cuma ') + K.fmtQty(m.stock, m.unit) + (kg ? ' kg' : '')); return; }
      delta = -q; after = m.stock - q;
    } else { delta = q - m.stock; after = q; }
    if (kg) { after = Math.round(after * 1000) / 1000; delta = Math.round(delta * 1000) / 1000; }
    if (t !== 'set' && q === 0) { UI.toast(T('Isi jumlah dulu')); return; }
    m.stock = after;
    m.sample = false;
    KDB.addStockLog(m.id, m.name, t === 'set' ? 'adjust' : t, delta, after, note);
    KDB.save();
    UI.closeSheet();
    UI.toast(T('Stok ') + m.name + ' → ' + K.fmtQty(after, m.unit) + (kg ? ' kg' : ''));
    App.rerender();
  }
};
