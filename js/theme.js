/* OGKasir - Tema: mode terang/gelap + warna aksen custom.
   Aksen menimpa --brand, --brand-d, --brand-soft via inline style di <html>.
   Kosongkan aksen untuk kembali ke bawaan tiap mode. */
var Theme = {
  /* id, nama, deskripsi, warna preview [bg, brand, card] */
  THEMES: [
    { id: 'fintech',  name: 'Biru Fresh',    desc: 'Identitas baru — bersih & segar', prev: ['#f1f5f9', '#2563eb', '#ffffff'] },
    { id: 'light',    name: 'Klasik',        desc: 'Terang bawaan',      prev: ['#f5f3ee', '#c07f26', '#ffffff'] },
    { id: 'dark',     name: 'Gelap',         desc: 'Mode gelap',         prev: ['#14100a', '#e2a355', '#221a11'] },
    { id: 'midnight', name: 'Midnight Gold', desc: 'Premium gelap emas', prev: ['#0b1120', '#f59e0b', '#151d2e'] },
    { id: 'warkop',   name: 'Bold Warkop',   desc: 'Energik ceria',       prev: ['#fff7ed', '#ea580c', '#ffffff'] }
  ],
  DARK: { dark: 1, midnight: 1 }, // tema gelap (untuk campuran aksen)
  valid: function (t) {
    for (var i = 0; i < this.THEMES.length; i++) if (this.THEMES[i].id === t) return t;
    return 'fintech';
  },
  PRESETS: [
    ['#c07f26', 'Emas'], ['#1e7e46', 'Hijau'], ['#2563eb', 'Biru'],
    ['#7c3aed', 'Ungu'], ['#db2777', 'Pink'], ['#ea580c', 'Oranye'],
    ['#0e7490', 'Teal'], ['#c0392b', 'Merah']
  ],

  _rgb: function (hex) {
    var h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  },
  _hex: function (r, g, b) {
    function p(x) { x = Math.max(0, Math.min(255, Math.round(x))); var s = x.toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + p(r) + p(g) + p(b);
  },
  /* pct -100..100: negatif = gelapkan, positif = terangkan */
  shade: function (hex, pct) {
    var c = this._rgb(hex), t = pct < 0 ? 0 : 255, a = Math.abs(pct) / 100;
    return this._hex(c[0] + (t - c[0]) * a, c[1] + (t - c[1]) * a, c[2] + (t - c[2]) * a);
  },
  /* campur dua warna; w = bobot warna pertama 0..1 */
  mix: function (hex1, hex2, w) {
    var a = this._rgb(hex1), b = this._rgb(hex2);
    return this._hex(a[0] * w + b[0] * (1 - w), a[1] * w + b[1] * (1 - w), a[2] * w + b[2] * (1 - w));
  },

  apply: function () {
    var s = KDB.data.settings;
    var theme = this.valid(s.theme || 'fintech');
    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    var st = root.style;
    st.removeProperty('--brand'); st.removeProperty('--brand-d'); st.removeProperty('--brand-soft');
    var acc = (s.accent || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(acc)) {
      var dark = !!this.DARK[theme];
      st.setProperty('--brand', acc);
      st.setProperty('--brand-d', this.shade(acc, -22));
      st.setProperty('--brand-soft', this.mix(acc, dark ? '#3a2a17' : '#e8eef7', 0.28));
    }
    /* Samakan status bar native dgn warna header (--card), biar tak terlihat "webview" */
    try {
      if (window.KasirKuNative && KasirKuNative.setStatusBar) {
        var card = getComputedStyle(root).getPropertyValue('--card').trim() || '#ffffff';
        KasirKuNative.setStatusBar(card, !!this.DARK[theme]);
      }
    } catch (e) { /* preview browser: abaikan */ }
  }
};
