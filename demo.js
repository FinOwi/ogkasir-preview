/* OGKasir — mode DEMO untuk preview web (BUKAN bagian dari APK). */
window.OGK_DEMO = true;
document.addEventListener('DOMContentLoaded', function () {
  var b = document.createElement('div');
  b.setAttribute('style', 'position:sticky;top:0;z-index:40;background:#0B2B4B;color:#fff;font:600 13px/1.45 system-ui,sans-serif;padding:8px 12px;text-align:center');
  b.innerHTML = '🧪 <b>Mode Demo</b> — coba semua fitur dengan data contoh, tanpa perlu masuk. ' +
    '<a href="https://ogkasir.my.id/" target="_blank" rel="noopener" style="color:#F6C453;font-weight:800;text-decoration:none">Download aplikasi aslinya →</a>';
  document.body.insertBefore(b, document.body.firstChild);
});
