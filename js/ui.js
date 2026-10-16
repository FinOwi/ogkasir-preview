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
