/* OGKasir - shared UI primitives */
var UI = {
  toast: function (msg) {
    var w = document.getElementById('kToast');
    var d = document.createElement('div');
    d.className = 'k-toast-it';
    d.textContent = msg;
    w.appendChild(d);
    setTimeout(function () { d.style.opacity = '0'; }, 2200);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 2600);
  },

  openSheet: function (html) {
    document.getElementById('kSheet').innerHTML = '<div class="k-grab"></div>' + html;
    document.getElementById('kSheetWrap').classList.remove('k-hidden');
    document.getElementById('kSheet').scrollTop = 0;
  },
  closeSheet: function () {
    document.getElementById('kSheetWrap').classList.add('k-hidden');
    document.getElementById('kSheet').innerHTML = '';
  },
  openModal: function (html) {
    document.getElementById('kModal').innerHTML = html;
    document.getElementById('kModalWrap').classList.remove('k-hidden');
  },
  closeModal: function () {
    document.getElementById('kModalWrap').classList.add('k-hidden');
    document.getElementById('kModal').innerHTML = '';
  },
  confirm: function (msg, okLabel, cb) {
    UI.openModal(
      T('<h3 class="k-sheet-t">Konfirmasi</h3>') +
      '<p class="k-muted" style="font-size:14px;line-height:1.6">' + K.esc(msg) + '</p>' +
      T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeModal()">Batal</button>') +
      '<button class="k-btn k-danger" id="kConfirmOk">' + K.esc(okLabel || T('Ya')) + '</button></div>'
    );
    document.getElementById('kConfirmOk').onclick = function () {
      UI.closeModal();
      cb();
    };
  },

  empty: function (emoji, title, sub, btnHtml) {
    return '<div class="k-empty"><div class="k-be">' + emoji + '</div>' +
      '<div style="font-weight:700;color:var(--ink)">' + title + '</div>' +
      '<div class="k-small" style="margin:6px 0 14px">' + (sub || '') + '</div>' +
      (btnHtml || '') + '</div>';
  },

  /* native bridge dengan fallback browser */
  saveFile: function (name, text, mime) {
    try {
      if (window.KasirKuNative && KasirKuNative.saveFile) {
        UI._waitSaveResult(name, 10000, mime || 'text/plain');
        KasirKuNative.saveFile(name, mime || 'text/plain', text);
        return;
      }
    } catch (e) {}
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); }, 500);
    UI.toast('File diunduh: ' + name);
  },

  /* tunggu konfirmasi native: sukses -> dialog, gagal -> toast error */
  _waitSaveResult: function (name, timeoutMs, mime) {
    window.kasirkuSaveCb = function (ok, nm, err, uri) {
      window.kasirkuSaveCb = null;
      if (ok) UI.savedDialog(nm || name, uri, mime);
      else UI.toast(T('Gagal menyimpan') + (err ? ': ' + String(err).slice(0, 110) : T(' — coba lagi')));
    };
    setTimeout(function () {
      if (window.kasirkuSaveCb) {
        window.kasirkuSaveCb = null;
        UI.toast(T('Penyimpanan tidak merespon — coba lagi'));
      }
    }, timeoutMs || 10000);
  },

  _lastFile: null,

  savedDialog: function (name, uri, mime) {
    UI._lastFile = uri ? { uri: uri, mime: mime || '' } : null;
    try {
      // simpan permanen agar tombol "buka export terakhir" tetap jalan habis restart
      if (uri) { KDB.data.settings.lastExport = { uri: uri, mime: mime || '', name: name }; KDB.save(); }
    } catch (e) {}
    var btns = T('<button class="k-btn k-ghost" onclick="UI.closeModal()">Tutup</button>');
    if (UI._lastFile && window.KasirKuNative && KasirKuNative.openFile) {
      btns += T('<button class="k-btn k-sec" onclick="UI.openFile()">📂 Buka File</button>');
    }
    btns += T('<button class="k-btn k-pri" onclick="UI.openDownloads()">📁 Buka Folder</button>');
    UI.openModal(
      T('<h3 class="k-sheet-t">✅ File tersimpan</h3>') +
      '<p class="k-small k-muted" style="line-height:1.7">Folder <b>Download</b>:<br><b style="color:var(--ink)">' + K.esc(name) + '</b></p>' +
      '<div class="k-btn-row">' + btns + '</div>'
    );
  },

  openFile: function () {
    var f = UI._lastFile;
    UI.closeModal();
    if (!f) return;
    try {
      if (window.KasirKuNative && KasirKuNative.openFile) KasirKuNative.openFile(f.uri, f.mime);
    } catch (e) {}
  },

  openLastExport: function () {
    var f = null;
    try { f = KDB.data.settings.lastExport; } catch (e) {}
    if (!f || !f.uri) { UI.toast(T('Belum ada file export — export dulu dari Laporan')); return; }
    try {
      if (window.KasirKuNative && KasirKuNative.openFile) {
        KasirKuNative.openFile(f.uri, f.mime || '');
        return;
      }
    } catch (e) {}
    UI.toast(T('Buka file hanya bisa di aplikasi Android'));
  },

  /* simpan file biner (xlsx) dari base64, dikirim bertahap per 20KB */
  saveXlsx: function (name, b64data) {
    try {
      if (window.KasirKuNative && KasirKuNative.saveXlsxChunk) {
        var mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        UI._waitSaveResult(name, 30000, mime);
        var CH = 20000, total = Math.ceil(b64data.length / CH), i, r, okk = true;
        for (i = 0; i < total; i++) {
          r = KasirKuNative.saveXlsxChunk(name, mime, b64data.substr(i * CH, CH), i, total);
          if (r !== 1) { okk = false; break; }
        }
        if (!okk) {
          window.kasirkuSaveCb = null;
          UI.toast(T('Gagal mengirim data Excel — coba lagi'));
        }
        return;
      }
    } catch (e) {
      window.kasirkuSaveCb = null;
      UI.toast(T('Gagal buat Excel: ') + String((e && e.message) || e).slice(0, 90));
      return;
    }
    UI.toast(T('Export Excel hanya bisa di aplikasi Android'));
  },

  openDownloads: function () {
    UI.closeModal();
    try {
      if (window.KasirKuNative && KasirKuNative.openDownloads) KasirKuNative.openDownloads();
    } catch (e) {}
  },

  openLink: function (url) {
    try {
      if (window.KasirKuNative && KasirKuNative.openUrl) { KasirKuNative.openUrl(url); return; }
    } catch (e) {}
    try { window.open(url, '_blank'); } catch (e2) {}
  },

  shareText: function (subject, text) {
    try {
      if (window.KasirKuNative && KasirKuNative.shareText) {
        KasirKuNative.shareText(subject, text);
        return;
      }
    } catch (e) {}
    if (navigator.share) {
      navigator.share({ title: subject, text: text }).catch(function () {});
      return;
    }
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(text);
      UI.toast(T('Struk disalin — tempel ke WhatsApp'));
    } catch (e2) { UI.toast(T('Bagikan tidak tersedia')); }
  }
};

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('kSheetBackdrop').addEventListener('click', UI.closeSheet);
});

/* Ikon SVG garis (gaya Lucide) untuk navigasi & dashboard */
var KIcon = {
  paths: {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.8"/><rect x="14" y="3" width="7" height="7" rx="1.8"/><rect x="3" y="14" width="7" height="7" rx="1.8"/><rect x="14" y="14" width="7" height="7" rx="1.8"/>',
    dash: '<rect x="3" y="3" width="7" height="9" rx="1.8"/><rect x="14" y="3" width="7" height="5" rx="1.8"/><rect x="14" y="12" width="7" height="9" rx="1.8"/><rect x="3" y="16" width="7" height="5" rx="1.8"/>',
    package: '<path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/>',
    register: '<path d="M5.5 10 6.6 5.6A2 2 0 0 1 8.5 4h7a2 2 0 0 1 1.9 1.4L18.5 10"/><rect x="3" y="10" width="18" height="10" rx="2"/><path d="M7 14.2h.01M11 14.2h.01M15 14.2h.01M17.2 14.2h.01" stroke-width="2.6"/><path d="M7.5 17.4h9"/>',
    chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    idcard: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8.3" cy="10.8" r="1.9"/><path d="M5.6 16.2c.5-1.3 1.5-2 2.7-2s2.2.7 2.7 2"/><path d="M14.8 9.6H18M14.8 13.2H18"/>',
    gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    banknote: '<rect x="2" y="6" width="20" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01" stroke-width="2.6"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    store: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    palette: '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    filetext: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    bluetooth: '<path d="m7 7 10 10-5 5V2l5 5L7 17"/>'
  },
  get: function (name, size) {
    var p = this.paths[name] || '';
    var s = size || 24;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }
};
