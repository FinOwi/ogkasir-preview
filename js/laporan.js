/* OGKasir - laporan penjualan */
var Lap = {
  period: 'today', // today | yesterday | 7d | 30d | month

  range: function () {
    var now = new Date();
    var start, end, label;
    function sod(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }
    if (this.period === 'today') {
      start = sod(now); end = start + 864e5; label = T('Hari ini');
    } else if (this.period === 'yesterday') {
      start = sod(now) - 864e5; end = start + 864e5; label = T('Kemarin');
    } else if (this.period === '7d') {
      start = sod(now) - 6 * 864e5; end = sod(now) + 864e5; label = T('7 hari terakhir');
    } else if (this.period === '30d') {
      start = sod(now) - 29 * 864e5; end = sod(now) + 864e5; label = T('30 hari terakhir');
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(); label = T('Bulan ini');
    }
    return { start: start, end: end, label: label };
  },

  txsIn: function (r) {
    return KDB.data.txs.filter(function (t) { return !t.voided && t.status !== 'unpaid' && t.at >= r.start && t.at < r.end; });
  },

  piutang: function () {
    var s = 0, n = 0, txs = KDB.data.txs;
    for (var i = 0; i < txs.length; i++) {
      if (!txs[i].voided && txs[i].status === 'unpaid') { s += txs[i].total; n++; }
    }
    return { total: s, count: n };
  },

  render: function () {
    var r = this.range();
    var txs = this.txsIn(r);
    var omzet = 0, laba = 0;
    for (var i = 0; i < txs.length; i++) {
      omzet += txs[i].total;
      for (var j = 0; j < txs[i].items.length; j++) {
        var it = txs[i].items[j];
        laba += (it.price - (it.cost || 0)) * it.qty;
      }
    }
    var h = '<div class="k-chips" style="margin-bottom:12px">' + this.chip('today', T('Hari ini')) +
      this.chip('yesterday', T('Kemarin')) + this.chip('7d', T('7 Hari')) +
      this.chip('30d', T('30 Hari')) + this.chip('month', T('Bulan ini')) + '</div>';
    var pt = this.piutang();
    h += '<div class="k-stats">' +
      T('<div class="k-stat k-hi"><div class="k-l">💰 Omzet (') + r.label + ')</div><div class="k-v">' + K.rp(omzet) + '</div></div>' +
      T('<div class="k-stat k-grn"><div class="k-l">📈 Laba kotor</div><div class="k-v">') + K.rp(laba) + '</div></div>' +
      T('<div class="k-stat"><div class="k-l">🧾 Transaksi</div><div class="k-v">') + txs.length + '</div></div>' +
      T('<div class="k-stat"><div class="k-l">⏳ Belum Bayar</div><div class="k-v">') + K.rp(pt.total) + '</div></div>' +
      T('<div class="k-stat"><div class="k-l">🧮 Rata-rata / trx</div><div class="k-v">') + K.rp(txs.length ? Math.round(omzet / txs.length) : 0) + '</div></div></div>';
    h += T('<div class="k-small k-muted" style="margin:-8px 0 16px">💡 Omzet & laba hanya menghitung transaksi <b>lunas</b>. Tagihan belum dibayar (') + pt.count + T(') tercatat sebagai Belum Bayar di atas.</div>');
    var chartLabel = r.label.replace(T('Hari ini'), T('Hari Ini')).replace(T('Bulan ini'), T('Bulan Ini'));
    h += T('<div class="k-card"><h3>📊 Omzet ') + chartLabel + '</h3><canvas class="k-chart" id="kChart"></canvas></div>';
    var agg = {};
    for (var a = 0; a < txs.length; a++) {
      for (var b = 0; b < txs[a].items.length; b++) {
        var it2 = txs[a].items[b];
        if (!agg[it2.id]) agg[it2.id] = { name: it2.name, qty: 0, omzet: 0, unit: it2.unit || 'pcs' };
        agg[it2.id].qty += it2.qty;
        agg[it2.id].omzet += it2.price * it2.qty;
      }
    }
    var arr = [];
    for (var k in agg) arr.push(agg[k]);
    arr.sort(function (x, y) { return y.qty - x.qty; });
    h += T('<div class="k-card"><h3>🏆 Menu Terlaris</h3>');
    if (!arr.length) h += T('<div class="k-small k-muted">Belum ada penjualan di periode ini.</div>');
    for (var tI = 0; tI < Math.min(arr.length, 5); tI++) {
      var medal = ['🥇', '🥈', '🥉', '4.', '5.'][tI];
      h += '<div class="k-li"><div class="k-tx"><div class="k-t1" style="font-weight:600">' + medal + ' ' + K.esc(arr[tI].name) + '</div>' +
        '<div class="k-t2">' + K.fmtQty(arr[tI].qty, arr[tI].unit) + (arr[tI].unit === 'kg' ? ' kg' : '') + T(' terjual') + '</div></div>' +
        '<div class="k-rt k-money">' + K.rp(arr[tI].omzet) + '</div></div>';
    }
    h += '</div>';
    var pays = {};
    for (var p = 0; p < txs.length; p++) {
      pays[txs[p].pay] = (pays[txs[p].pay] || 0) + txs[p].total;
    }
    h += T('<div class="k-card"><h3>💳 Metode Pembayaran</h3>');
    var pk = Object.keys(pays);
    if (!pk.length) h += T('<div class="k-small k-muted">Belum ada data.</div>');
    for (var q = 0; q < pk.length; q++) {
      h += T('<div class="k-total-row"><span>') + K.esc(I18N.payName(pk[q])) + '</span><span class="k-money">' + K.rp(pays[pk[q]]) + '</span></div>';
    }
    h += '</div>';
    h += T('<div class="k-btn-row" style="margin-top:0"><button class="k-btn k-sec" onclick="Lap.exportCsv()">⬇️ CSV Mentah</button>') +
      T('<button class="k-btn k-pri" onclick="kasirkuExportExcel()">📊 Excel Rapi</button></div>') +
      T('<div class="k-small k-muted" style="margin-top:8px"><b>Excel Rapi</b>: berwarna & berformat — kop laporan, ringkasan, header coklat, angka Rp, baris TOTAL (') + r.label + T(').<br><b>CSV Mentah</b>: data polos tanpa format.</div>');
    var self = this;
    setTimeout(function () { self.drawChart(r); }, 30);
    return h;
  },

  chip: function (id, label) {
    return '<button class="k-chip' + (this.period === id ? ' k-on' : '') + '" onclick="Lap.setP(\'' + id + '\')">' + label + '</button>';
  },
  setP: function (id) { this.period = id; App.rerender(); },

  drawChart: function (r) {
    var cv = document.getElementById('kChart');
    if (!cv) return;
    var dpr = window.devicePixelRatio || 1;
    var W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    var c = cv.getContext('2d');
    c.scale(dpr, dpr);
    var days = Math.max(1, Math.round((r.end - r.start) / 864e5));
    if (days > 31) days = 31;
    var hourly = (days === 1); // 1 hari -> pecah per jam (24 batang), bukan 1 batang raksasa
    var n = hourly ? 24 : days;
    var vals = [], labels = [];
    for (var i = 0; i < n; i++) {
      var ds, de, lab;
      if (hourly) {
        ds = r.start + i * 36e5; de = ds + 36e5; lab = i + '';
      } else {
        ds = r.start + i * 864e5; de = ds + 864e5;
        var d = new Date(ds);
        lab = d.getDate() + '/' + (d.getMonth() + 1);
      }
      var sum = 0;
      var txs = KDB.data.txs;
      for (var j = 0; j < txs.length; j++) {
        if (!txs[j].voided && txs[j].status !== 'unpaid' && txs[j].at >= ds && txs[j].at < de) sum += txs[j].total;
      }
      vals.push(sum);
      labels.push(lab);
    }
    var max = 0, maxI = -1;
    for (var k = 0; k < vals.length; k++) if (vals[k] > max) { max = vals[k]; maxI = k; }
    if (max === 0) max = 1;
    var padL = 10, padB = 22, padT = 18;
    var plotH = H - padB - padT;
    var cw = (W - padL * 2) / vals.length;
    // warna ikut tema aktif (baca CSS variable)
    var cs = getComputedStyle(document.documentElement);
    var brand = cs.getPropertyValue('--brand').trim() || '#c07f26';
    var brandD = cs.getPropertyValue('--brand-d').trim() || '#96600f';
    var brandRgb = cs.getPropertyValue('--brand-rgb').trim() || '192,127,38';
    var muted = cs.getPropertyValue('--muted').trim() || '#9c8771';
    var lineC = cs.getPropertyValue('--line').trim() || '#e8ddc9';
    function shortRp(v) {
      if (v >= 1e9) return (v / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M';
      if (v >= 1e6) return (v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
      if (v >= 1e3) return Math.round(v / 1e3) + ' rb';
      return '' + v;
    }
    // garis bantu horizontal
    c.strokeStyle = lineC; c.globalAlpha = 0.6; c.lineWidth = 1;
    c.beginPath();
    for (var g = 0; g <= 3; g++) { var gy = Math.round(padT + plotH * g / 3) + 0.5; c.moveTo(padL, gy); c.lineTo(W - padL, gy); }
    c.stroke(); c.globalAlpha = 1;
    c.textAlign = 'center';
    for (var b = 0; b < vals.length; b++) {
      var bh = plotH * vals[b] / max;
      var x = padL + b * cw + cw * 0.2;
      var w = Math.max(cw * 0.6, 2);
      var y = padT + plotH - bh;
      if (vals[b] > 0) {
        var grd = c.createLinearGradient(0, y, 0, y + Math.max(bh, 3));
        grd.addColorStop(0, brand); grd.addColorStop(1, brandD);
        c.fillStyle = grd;
        if (b === maxI) { c.shadowColor = 'rgba(' + brandRgb + ',.55)'; c.shadowBlur = 14; }
        var rr = Math.min(w / 2, 6);
        if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, Math.max(bh, 3), [rr, rr, 3, 3]); c.fill(); }
        else c.fillRect(x, y, w, Math.max(bh, 3));
        c.shadowBlur = 0;
        // label nilai: semua batang bila sedikit, bila 24 jam hanya puncak
        if (vals.length <= 14 || b === maxI) {
          c.fillStyle = muted; c.font = '600 10px system-ui,sans-serif';
          c.fillText(shortRp(vals[b]), x + w / 2, y - 5);
        }
      }
      if (vals.length <= 14 || b % Math.ceil(vals.length / 10) === 0) {
        c.fillStyle = muted; c.font = '10px system-ui,sans-serif';
        c.fillText(labels[b], padL + b * cw + cw / 2, H - 7);
      }
    }
  },

  exportCsv: function () {
    var r = this.range();
    var txs = this.txsIn(r);
    var rows = [['No', T('Tanggal'), T('Jam'), T('Menu'), 'Qty', T('Harga'), 'Subtotal', T('Diskon'), T('Total'), T('Bayar'), T('Kembalian')]];
    function q(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }
    for (var i = 0; i < txs.length; i++) {
      var t = txs[i];
      for (var j = 0; j < t.items.length; j++) {
        var it = t.items[j];
        rows.push(['#' + K.pad(t.no, 4), K.fmtDate(t.at), K.fmtTime(t.at), q(it.name), it.qty,
          it.price, it.price * it.qty, j === 0 ? t.disc : 0, j === 0 ? t.total : '',
          j === 0 ? q(t.pay) : '', j === 0 ? t.change : '']);
      }
    }
    var csv = '\ufeff' + rows.map(function (x) { return x.join(';'); }).join('\n');
    var d = new Date(r.start);
    function p2(x) { return (x < 10 ? '0' : '') + x; }
    var fname = 'ogkasir-laporan-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.csv';
    UI.saveFile(fname, csv, 'text/csv');
  }
};
