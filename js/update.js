/* OGKasir - pembaruan aplikasi via GitHub Releases (butuh bridge OGKasirUpdater) */
var Upd = {
  hasBridge: function () {
    try { return !!(window.OGKasirUpdater && OGKasirUpdater.checkUpdate); }
    catch (e) { return false; }
  },

  card: function () {
    var ver = '?';
    try { if (window.KasirKuNative && KasirKuNative.appVersion) ver = KasirKuNative.appVersion(); } catch (e) {}
    var h = T('<div class="k-card"><h3>Pembaruan Aplikasi</h3>') +
      T('<div class="k-row"><div><b>Versi terinstal</b><div class="k-small k-muted">v') + K.esc(ver) + '</div></div>' +
      T('<div style="font-size:30px">📦</div></div>') +
      '<div id="updBox" style="margin-top:10px">';
    if (this.hasBridge()) {
      h += T('<button class="k-btn k-sec" onclick="Upd.check()">🔍 Periksa Pembaruan</button>');
    } else {
      h += T('<div class="k-small k-muted">Pembaruan otomatis butuh OGKasir v1.15+.<br>Unduh versi terbaru dari link download seperti biasa.</div>');
    }
    h += '</div></div>';
    return h;
  },

  box: function () { return document.getElementById('updBox'); },
  setBox: function (h) { var b = this.box(); if (b) b.innerHTML = h; },

  check: function () {
    this.setBox(T('<div class="k-small k-muted">🔍 Memeriksa pembaruan...</div>'));
    try { OGKasirUpdater.checkUpdate(); }
    catch (e) { this.setBox(T('<div class="k-small k-muted">⚠️ Gagal memeriksa.</div>')); }
  },

  onResult: function (jsonStr) {
    var r;
    try { r = JSON.parse(jsonStr); } catch (e) { r = { error: '?' }; }
    var self = this;
    if (r.error) {
      this.setBox(T('<div class="k-small k-muted">⚠️ Gagal memeriksa: ') + K.esc(r.error) + '</div>' +
        T('<button class="k-btn k-sec" style="margin-top:8px" onclick="Upd.check()">🔄 Coba Lagi</button>'));
      return;
    }
    if (!r.hasUpdate) {
      this.setBox(T('<div style="font-size:28px">✅</div><b>Sudah versi terbaru!</b>') +
        T('<div class="k-small k-muted">Tidak ada pembaruan yang tersedia.</div>') +
        T('<button class="k-btn k-ghost" style="margin-top:8px" onclick="Upd.check()">🔄 Periksa Lagi</button>'));
      return;
    }
    var notes = K.esc(r.notes || T('Perbaikan & fitur baru.')).slice(0, 600).replace(/\n/g, '<br>');
    this.setBox(T('<div style="font-size:28px">🎉</div><b>Versi baru tersedia!</b>') +
      '<div style="font-size:20px;font-weight:800;margin:4px 0">' + K.esc(r.versionName || '') + '</div>' +
      '<div class="k-small k-muted" style="text-align:left;background:var(--bg);border-radius:10px;padding:10px;max-height:150px;overflow:auto">' + notes + '</div>' +
      '<button class="k-btn k-pri" style="margin-top:10px" id="updGo" onclick=\'Upd.download(' + JSON.stringify(r.url) + ',' + JSON.stringify(r.versionName || r.versionCode) + T(')\'>⬇️ Update Sekarang</button>') +
      '<div id="updProg" style="margin-top:10px"></div>');
  },

  download: function (url, vname) {
    var go = document.getElementById('updGo');
    if (go) { go.disabled = true; go.textContent = T('⏳ Mengunduh...'); }
    // sanitasi nama file: cegah path traversal dari nama rilis
    vname = String(vname == null ? '' : vname).replace(/[^0-9A-Za-z.\-]/g, '_').slice(0, 40) || 'update';
    window._updFile = 'OGKasir-' + vname + '.apk';
    try { OGKasirUpdater.downloadUpdate(url, window._updFile); }
    catch (e) {
      UI.toast(T('Gagal mengunduh'));
      if (go) { go.disabled = false; go.textContent = T('⬇️ Coba Lagi'); }
    }
  },

  onProgress: function (pct) {
    var p = document.getElementById('updProg');
    if (!p) return;
    p.innerHTML = '<div class="prog"><div style="transform:scaleX(' + (pct / 100) + ')"></div></div>' +
      '<div class="k-small k-muted">' + pct + '%</div>';
    if (pct >= 100) {
      var go = document.getElementById('updGo');
      if (go) go.textContent = T('📦 Membuka installer...');
      UI.toast(T('Unduhan selesai — ikuti layar installer ✓'));
    }
  },

  onError: function (msg) {
    UI.toast('⚠️ ' + msg);
    var go = document.getElementById('updGo');
    if (go) { go.disabled = false; go.textContent = T('⬇️ Coba Lagi'); }
  },

  onNeedPermission: function () {
    this.setBox(T('<div style="font-size:28px">🔐</div><b>Izin instalasi dibutuhkan</b>') +
      T('<div class="k-small k-muted">Android meminta izin sekali saja:<br>Di layar Pengaturan yang terbuka, aktifkan<br><b>"Izinkan dari sumber ini"</b> untuk OGKasir,<br>lalu kembali dan ketuk Periksa Pembaruan lagi.</div>') +
      T('<button class="k-btn k-pri" style="margin-top:8px" onclick="Upd.check()">🔄 Saya Sudah Mengizinkan</button>'));
  }
};

/* callback dari native */
window.ogkasirUpdateResult = function (j) { Upd.onResult(j); };
window.ogkasirUpdateProgress = function (p) { Upd.onProgress(p); };
window.ogkasirUpdateError = function (m) { Upd.onError(m); };
window.ogkasirNeedPermission = function () { Upd.onNeedPermission(); };
