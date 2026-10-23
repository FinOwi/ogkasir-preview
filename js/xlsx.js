/* OGKasir - penulis file .xlsx asli (tanpa library) + export laporan rapi */
var XLSX = (function () {
  /* ---------- CRC32 ---------- */
  var T = (function () {
    var t = [], c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();
  function crc32(s) {
    var c = 0xFFFFFFFF, i;
    for (i = 0; i < s.length; i++) c = T[(c ^ s.charCodeAt(i)) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(s) { return unescape(encodeURIComponent(s)); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- ZIP (stored, tanpa kompresi) ---------- */
  function zip(files) {
    var out = [], entries = [], cdOut = [], off = 0, i, f;
    function w16(a, v) { a.push(v & 0xFF, (v >>> 8) & 0xFF); }
    function w32(a, v) { a.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); }
    function ws(a, s) { for (var j = 0; j < s.length; j++) a.push(s.charCodeAt(j) & 0xFF); }
    for (i = 0; i < files.length; i++) {
      f = files[i];
      var nm = utf8(f.name), dt = utf8(f.data);
      var crc = crc32(dt), ln = dt.length, nl = nm.length;
      ws(out, 'PK\x03\x04'); w16(out, 20); w16(out, 0x0800); w16(out, 0); w16(out, 0); w16(out, 0);
      w32(out, crc); w32(out, ln); w32(out, ln); w16(out, nl); w16(out, 0);
      ws(out, nm); ws(out, dt);
      entries.push({ nm: nm, crc: crc, ln: ln, off: off });
      off += 30 + nl + ln;
    }
    var cdStart = off, k, n = entries.length;
    for (k = 0; k < n; k++) {
      var e = entries[k];
      ws(cdOut, 'PK\x01\x02'); w16(cdOut, 20); w16(cdOut, 20); w16(cdOut, 0x0800);
      w16(cdOut, 0); w16(cdOut, 0); w16(cdOut, 0);
      w32(cdOut, e.crc); w32(cdOut, e.ln); w32(cdOut, e.ln); w16(cdOut, e.nm.length);
      w16(cdOut, 0); w16(cdOut, 0); w16(cdOut, 0); w16(cdOut, 0); w32(cdOut, 0); w32(cdOut, e.off);
      ws(cdOut, e.nm);
    }
    var cdLen = cdOut.length;
    ws(cdOut, 'PK\x05\x06'); w16(cdOut, 0); w16(cdOut, 0); w16(cdOut, n); w16(cdOut, n);
    w32(cdOut, cdLen); w32(cdOut, cdStart); w16(cdOut, 0);
    return out.concat(cdOut);
  }

  function b64(bytes) {
    var s = '', i;
    for (i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    var o = '';
    // PENTING: potongan harus kelipatan 3, kalau tidak btoa menghasilkan
    // padding '=' di tengah stream dan decoder ketat (Android) melempar error
    for (i = 0; i < s.length; i += 6144) o += btoa(s.substr(i, 6144));
    return o;
  }

  /* ---------- parts ---------- */
  function contentTypes() {
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>';
  }
  function rels() {
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';
  }
  function workbook(sheetName) {
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="' + esc(sheetName).slice(0, 31) + '" sheetId="1" r:id="rId1"/></sheets></workbook>';
  }
  function wbRels() {
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';
  }
  function styles() {
    var thin = '<border><left style="thin"><color rgb="FFD9C7A7"/></left>' +
      '<right style="thin"><color rgb="FFD9C7A7"/></right>' +
      '<top style="thin"><color rgb="FFD9C7A7"/></top>' +
      '<bottom style="thin"><color rgb="FFD9C7A7"/></bottom><diagonal/></border>';
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;Rp&quot;#,##0"/></numFmts>' +
      '<fonts count="4">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="14"/><color rgb="FF3B2A1E"/><name val="Calibri"/></font>' +
      '</fonts>' +
      '<fills count="5">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFB06A2C"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF6E9D4"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEADFCD"/><bgColor indexed="64"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' + thin + '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="10">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +                                     // 0 normal
      '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0"/>' +                                     // 1 judul
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>' +                                     // 2 subjudul bold
      '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 3 header
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>' +                                     // 4 sel
      '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0"/>' +                                     // 5 sel selang
      '<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0"/>' +                                     // 6 angka
      '<xf numFmtId="3" fontId="0" fillId="3" borderId="1" xfId="0"/>' +                                     // 7 angka selang
      '<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0"><alignment horizontal="right"/></xf>' +  // 8 total label
      '<xf numFmtId="164" fontId="1" fillId="4" borderId="1" xfId="0"/>' +                                   // 9 total Rp
      '</cellXfs><cellStyles count="1">' +
      '<cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  }

  function colRef(i) {
    var s = '';
    i++;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  // rows: array of array of {v, s} ; v string|number ; s style idx ; t auto
  function sheet(rows, widths, merges) {
    var x = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>';
    for (var w = 0; w < widths.length; w++) {
      x += '<col min="' + (w + 1) + '" max="' + (w + 1) + '" width="' + widths[w] + '" customWidth="1"/>';
    }
    x += '</cols><sheetData>';
    for (var r = 0; r < rows.length; r++) {
      x += '<row r="' + (r + 1) + '">';
      var row = rows[r];
      for (var c = 0; c < row.length; c++) {
        var cell = row[c];
        if (!cell) continue;
        var ref = colRef(c) + (r + 1);
        var st = cell.s != null ? ' s="' + cell.s + '"' : '';
        if (typeof cell.v === 'number') {
          x += '<c r="' + ref + '"' + st + '><v>' + cell.v + '</v></c>';
        } else {
          x += '<c r="' + ref + '" t="inlineStr"' + st + '><is><t>' + esc(cell.v == null ? '' : cell.v) + '</t></is></c>';
        }
      }
      x += '</row>';
    }
    x += '</sheetData>';
    if (merges && merges.length) {
      x += '<mergeCells count="' + merges.length + '">';
      for (var m = 0; m < merges.length; m++) x += '<mergeCell ref="' + merges[m] + '"/>';
      x += '</mergeCells>';
    }
    x += '</worksheet>';
    return x;
  }

  function build(sheetName, rows, widths, merges) {
    var files = [
      { name: '[Content_Types].xml', data: contentTypes() },
      { name: '_rels/.rels', data: rels() },
      { name: 'xl/workbook.xml', data: workbook(sheetName) },
      { name: 'xl/_rels/workbook.xml.rels', data: wbRels() },
      { name: 'xl/styles.xml', data: styles() },
      { name: 'xl/worksheets/sheet1.xml', data: sheet(rows, widths, merges) }
    ];
    return b64(zip(files));
  }

  return { build: build, esc: esc };
})();

/* ---------- export laporan OGKasir ke .xlsx rapi ---------- */
function kasirkuExportExcel() {
  try {
    kasirkuExportExcelInner();
  } catch (e) {
    UI.toast('Gagal buat Excel: ' + String((e && e.message) || e).slice(0, 90));
  }
}
function kasirkuExportExcelInner() {
  var r = Lap.range();
  var txs = Lap.txsIn(r);
  var S = KDB.data.settings;
  var omzet = 0, laba = 0, i, j;
  for (i = 0; i < txs.length; i++) {
    omzet += txs[i].total;
    for (j = 0; j < txs[i].items.length; j++) {
      var it0 = txs[i].items[j];
      laba += (it0.price - (it0.cost || 0)) * it0.qty;
    }
  }
  function C(v, s) { return { v: v, s: s }; }
  var rows = [];
  rows.push([C(S.shop.toUpperCase(), 1)]);
  rows.push([C('LAPORAN PENJUALAN — ' + r.label.toUpperCase(), 2)]);
  rows.push([C('Diekspor: ' + K.fmtDateTime(Date.now()) + (S.addr ? ' • ' + S.addr : ''), 0)]);
  rows.push([]);
  rows.push([C('RINGKASAN', 2)]);
  rows.push([C('Omzet', 4), C(omzet, 9)]);
  rows.push([C('Laba kotor', 4), C(laba, 9)]);
  rows.push([C('Jumlah transaksi', 4), C(txs.length, 6)]);
  rows.push([C('Rata-rata per transaksi', 4), C(txs.length ? Math.round(omzet / txs.length) : 0, 9)]);
  rows.push([]);
  var heads = ['No', 'Tanggal', 'Jam', 'Menu', 'Qty', 'Harga', 'Subtotal', 'Diskon', 'Total', 'Cara Bayar'];
  rows.push(heads.map(function (hh) { return C(hh, 3); }));
  var alt = false;
  for (i = 0; i < txs.length; i++) {
    var t = txs[i];
    for (j = 0; j < t.items.length; j++) {
      var it = t.items[j];
      var first = j === 0;
      var cs = alt ? 5 : 4, ns = alt ? 7 : 6;
      rows.push([
        C(first ? '#' + K.pad(t.no, 4) : '', cs),
        C(first ? K.fmtDate(t.at) : '', cs),
        C(first ? K.fmtTime(t.at) : '', cs),
        C(it.name, cs),
        C(it.qty, ns),
        C(it.price, ns),
        C(it.price * it.qty, ns),
        C(first ? t.disc : '', ns),
        C(first ? t.total : '', ns),
        C(first ? t.pay : '', cs)
      ]);
    }
    alt = !alt;
  }
  rows.push([]);
  rows.push([C('', 0), C('', 0), C('', 0), C('', 0), C('', 0), C('', 0), C('', 0), C('TOTAL', 8), C(omzet, 9), C('', 0)]);
  var widths = [10, 13, 8, 30, 8, 14, 16, 14, 16, 13];
  var merges = ['A1:J1', 'A2:J2'];
  var b64data = XLSX.build('Laporan', rows, widths, merges);
  var d = new Date(r.start);
  function p2(x) { return (x < 10 ? '0' : '') + x; }
  var fname = 'ogkasir-laporan-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.xlsx';
  UI.saveXlsx(fname, b64data);
}
