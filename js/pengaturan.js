/* OGKasir - pengaturan: profil toko, backup, PIN, tema */
var AppSet = {
  render: function () {
    var s = KDB.data.settings;
    var h = Lic.licCard();
    h += Upd.card();
    h += T('<div class="k-card"><h3>🏪 Profil Toko</h3>') +
      T('<div class="k-fld"><label>Nama toko</label><input class="k-in" id="sShop" value="') + K.esc(s.shop) + '"></div>' +
      T('<div class="k-fld"><label>Alamat (muncul di struk)</label><input class="k-in" id="sAddr" value="') + K.esc(s.addr) + '" placeholder="cth: Jl. Merdeka No. 10"></div>' +
      T('<div class="k-fld"><label>Catatan kaki struk</label><input class="k-in" id="sFoot" value="') + K.esc(s.foot) + '"></div>' +
      '<div class="k-fld"><label>' + T('Logo toko (opsional)') + '</label>' +
      '<div class="k-row" style="align-items:center">' +
      (s.logo ? '<img src="' + s.logo + '" alt="" style="width:44px;height:44px;border-radius:10px;object-fit:contain;background:var(--brand-soft);flex:0 0 auto">' : '<div style="width:44px;height:44px;border-radius:10px;background:var(--brand-soft);display:flex;align-items:center;justify-content:center;font-size:24px;flex:0 0 auto">\u26a1</div>') +
      '<button class="k-btn k-sec" style="width:auto;flex:1" onclick="AppSet.pickLogo()">' + T('Pilih Logo') + '</button>' +
      (s.logo ? '<button class="k-btn k-ghost" style="width:auto" onclick="AppSet.clearLogo()">' + T('Hapus') + '</button>' : '') +
      '</div></div>' +
      '<input type="file" id="sLogoPick" accept="image/*" class="k-hidden" onchange="AppSet.onLogoPick(this)">' +
      T('<button class="k-btn k-pri" onclick="AppSet.saveProfile()">Simpan Profil</button></div>');

    /* ---- Profil Pengguna ---- */
    var av = (s.userEmoji || '').trim() || '👤';
    h += T('<div class="k-card"><h3>👤 Profil Pengguna</h3>') +
      '<div class="k-row" style="align-items:center;margin-bottom:10px"><div style="width:48px;height:48px;border-radius:50%;background:var(--brand-soft);display:flex;align-items:center;justify-content:center;font-size:26px;flex:0 0 auto">' + K.esc(av) + '</div>' +
      '<div><b>' + K.esc(s.userName || T('Pengguna')) + '</b><div class="k-small k-muted">' + T('Kasir aplikasi ini') + '</div></div></div>' +
      '<div class="k-frow"><div class="k-fld"><label>' + T('Nama pengguna') + '</label>' +
      '<input class="k-in" id="sUserName" value="' + K.esc(s.userName || '') + '" placeholder="' + T('cth: Budi') + '"></div>' +
      '<div class="k-fld" style="max-width:88px"><label>Avatar</label>' +
      '<input class="k-in" id="sUserEmoji" value="' + K.esc(s.userEmoji || '') + '" placeholder="😎" maxlength="4" style="text-align:center"></div></div>' +
      '<div class="k-small k-muted" style="margin-bottom:10px">' + T('Nama tampil di struk sebagai kasir.') + '</div>' +
      '<button class="k-btn k-pri" onclick="AppSet.saveProfileUser()">' + T('Simpan Profil') + '</button></div>';

    h += T('<div class="k-card"><h3>💾 Data & Backup</h3>') +
      '<div class="k-small k-muted" style="margin-bottom:10px">' + KDB.data.menus.length + T(' menu • ') +
      KDB.data.txs.filter(function (t) { return !t.voided; }).length + T(' transaksi</div>') +
      T('<div class="k-btn-row" style="margin-top:0"><button class="k-btn k-sec" onclick="AppSet.backup()">⬆️ Backup</button>') +
      T('<button class="k-btn k-sec" onclick="AppSet.restore()">⬇️ Restore</button></div>') +
      T('<button class="k-btn k-sec" style="margin-top:10px" onclick="UI.openLastExport()">📂 Buka Export Terakhir</button>') +
      T('<button class="k-btn k-danger" style="margin-top:10px" onclick="AppSet.wipe()">🗑️ Hapus Semua Data</button>') +
      this.cloudCard() + '</div>';

    h += T('<div class="k-card"><h3>🖨️ Printer Struk</h3>') +
      '<div style="margin-bottom:10px;font-size:14px">' + Printer.statusLine() + '</div>' +
      T('<div class="k-btn-row" style="margin-top:0"><button class="k-btn k-sec" onclick="Printer.pick()">📶 Bluetooth</button>') +
      T('<button class="k-btn k-sec" onclick="Printer.pickWifi()">🛜 WiFi</button></div>') +
      T('<div class="k-btn-row" style="margin-top:10px"><button class="k-btn k-sec" onclick="Printer.testPrint()">🧪 Test Print</button></div>') +
      T('<div class="k-btn-row" style="margin-top:10px"><button class="k-btn k-sec" onclick="Printer.preview()">👁️ Pratinjau Struk</button>') +
      (Printer.connected ? T('<button class="k-btn k-ghost" onclick="Printer.disconnect()">❌ Putuskan</button>') : '') + '</div>' +
      T('<p class="k-small k-muted" style="margin-top:8px">Thermal 58mm. <b>Bluetooth:</b> pairing dulu di pengaturan Bluetooth HP (±10 m). <b>WiFi:</b> printer & HP satu WiFi yang sama, isi IP printer — jangkauan selebar WiFi.</p></div>');
    h += T('<div class="k-card"><h3>📝 Preset Catatan Pesanan</h3>') +
      T('<p class="k-small k-muted" style="margin-top:0">Pilihan cepat saat kasir mengisi catatan per item (cth: "setengah matang"). Ketuk × untuk hapus.</p>') +
      '<div class="k-chips" style="margin-bottom:10px">' + AppSet.presetChips() + '</div>' +
      T('<div class="k-frow"><input class="k-in" id="sPreset" placeholder="Preset baru, cth: Sambal terpisah">') +
      T('<button class="k-btn k-sec" onclick="AppSet.addPreset()">＋ Tambah</button></div></div>');

    h += T('<div class="k-card"><h3>🔒 Keamanan</h3>') +
      T('<div class="k-row"><div><b>PIN Aplikasi</b><div class="k-small k-muted">') + (s.pin ? T('Aktif — diminta saat buka aplikasi') : T('Nonaktif')) + '</div></div>' +
      '<button class="k-chip" onclick="AppSet.pinForm()">' + (s.pin ? T('Ubah') : 'Aktifkan') + '</button></div>' +
      (s.pin ? T('<button class="k-btn k-ghost" style="margin-top:8px" onclick="AppSet.pinOff()">Matikan PIN</button>') : '') + '</div>';

    h += AppSet.tampilanCard(s);

    var ver = '?';
    try { if (window.KasirKuNative && KasirKuNative.appVersion) ver = KasirKuNative.appVersion(); } catch (e) {}
    h += T('<div class="k-card"><h3>ℹ️ Tentang</h3>') +
      T('<div class="k-row"><div><b>OGKasir</b><div class="k-small k-muted">Aplikasi kasir UMKM • v') + K.esc(ver) + '</div></div>' +
      T('<div style="font-size:34px">☕</div></div>') +
      T('<div class="k-row" style="margin-top:10px"><div><b>📸 Instagram</b><div class="k-small k-muted">@ogkasir</div></div>') +
      T('<button class="k-chip" onclick="UI.openLink(\'https://www.instagram.com/ogkasir\')">Buka</button></div>') +
      T('<div class="k-row" style="margin-top:8px"><div><b>💬 WhatsApp</b><div class="k-small k-muted">+62 882-7940-6268</div></div>') +
      '<button class="k-chip" onclick="UI.openLink(\'https://wa.me/6288279406268\')">Chat</button></div>' +
      T('<div class="k-small k-muted" style="margin-top:8px">Data tersimpan aman di HP ini (offline).</div></div>');
    return h;
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

  saveProfile: function () {
    var s = KDB.data.settings;
    s.shop = document.getElementById('sShop').value.trim() || 'Warkop Saya';
    s.addr = document.getElementById('sAddr').value.trim();
    s.foot = document.getElementById('sFoot').value.trim();
    KDB.save();
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

  saveProfileUser: function () {
    var s = KDB.data.settings;
    s.userName = document.getElementById('sUserName').value.trim();
    s.userEmoji = document.getElementById('sUserEmoji').value.trim();
    KDB.save();
    UI.toast(T('Profil tersimpan'));
    App.rerender();
  },

  /* ---------- cloud backup ---------- */
  cloudCard: function () {
    var s = KDB.data.settings;
    var h = T('<div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px"><b>☁️ Cloud Backup</b>');
    if (s.cloudTs) {
      h += '<div class="k-small k-muted" style="margin:6px 0">' + T('Terakhir: ') +
        new Date(s.cloudTs).toLocaleString('id-ID') + '</div>';
    } else {
      h += '<div class="k-small k-muted" style="margin:6px 0">' + T('Belum pernah backup ke cloud') + '</div>';
    }
    if (s.cloudKey) {
      h += '<div class="k-row" style="margin-bottom:10px"><span class="k-small">' + T('Kode pemulihan:') +
        ' <b>' + s.cloudKey + '</b></span>' +
        T('<button class="k-chip" onclick="Cloud.copyKey()">Salin</button>') + '</div>';
    }
    h += T('<div class="k-btn-row" style="margin-top:0"><button class="k-btn k-sec" onclick="Cloud.backup()">☁️ Backup ke Cloud</button>') +
      T('<button class="k-btn k-sec" onclick="Cloud.restoreSheet()">⬇️ Pulihkan dari Cloud</button></div>');
    if (Cloud.backend() === 'custom' && !s.cloudUrl) {
      h += '<div class="k-small k-muted" style="margin-top:8px">' +
        T('URL server cloud belum diisi — hubungi admin FinOwi.') + '</div>';
    } else if (Cloud.backend() === 'supabase') {
      h += '<div class="k-small k-muted" style="margin-top:8px">☁️ ' + T('Cloud FinOwi aktif') + '</div>';
    }
    h += '<label class="k-chk" style="margin-top:10px"><input type="checkbox"' +
      (s.cloudAuto !== false ? ' checked' : '') +
      ' onchange="Cloud.toggleAuto(this.checked)"> ' + T('Backup otomatis bulanan') + '</label>';
    return h + '</div>';
  },

  backup: function () {
    var json = JSON.stringify(KDB.data);
    var d = new Date();
    function p2(x) { return (x < 10 ? '0' : '') + x; }
    UI.saveFile('ogkasir-backup-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.json', json, 'application/json');
  },
  restore: function () {
    document.getElementById('kFilePick').click();
  },
  doRestore: function (text) {
    try {
      var d = JSON.parse(text);
      if (!d.menus || !d.settings) throw new Error(T('format salah'));
      var self = this;
      UI.confirm(T('Restore akan MENGGANTI semua data saat ini dengan file backup. Lanjut?'), T('Restore'), function () {
        KDB.data = d;
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
    UI.openModal(T('<h3 class="k-sheet-t">🔒 ') + (has ? T('Ubah') : 'Aktifkan') + T(' PIN</h3>') +
      T('<div class="k-fld"><label>PIN 6 digit</label><input class="k-in" id="kPin1" type="password" inputmode="numeric" maxlength="6" placeholder="••••••"></div>') +
      T('<div class="k-fld"><label>Ulangi PIN</label><input class="k-in" id="kPin2" type="password" inputmode="numeric" maxlength="6" placeholder="••••••"></div>') +
      T('<div class="k-btn-row"><button class="k-btn k-ghost" onclick="UI.closeModal()">Batal</button>') +
      T('<button class="k-btn k-pri" onclick="AppSet.pinSave()">Simpan</button></div>'));
  },
  pinSave: function () {
    var a = document.getElementById('kPin1').value, b = document.getElementById('kPin2').value;
    if (!/^[0-9]{6}$/.test(a)) { UI.toast(T('PIN harus 6 digit angka')); return; }
    if (a !== b) { UI.toast(T('PIN tidak sama')); return; }
    KDB.data.settings.pin = a;
    KDB.save();
    UI.closeModal();
    UI.toast(T('PIN aktif'));
    App.rerender();
  },
  pinOff: function () {
    UI.confirm(T('Matikan PIN aplikasi?'), 'Matikan', function () {
      KDB.data.settings.pin = '';
      KDB.save();
      UI.toast(T('PIN dimatikan'));
      App.rerender();
    });
  },


  /* ---------- Tampilan: mode, grid/baris, aksen, bahasa ---------- */
  tampilanCard: function (s) {
    var view = s.menuView || 'grid';
    var acc = (s.accent || '').toLowerCase();
    var lang = s.lang || 'id';
    var h = T('<div class="k-card"><h3>🎨 Custom Tampilan</h3>');
    h += '<div class="k-fld"><label>' + T('Tema tampilan') + '</label><div class="k-themes">';
    for (var ti = 0; ti < Theme.THEMES.length; ti++) {
      var th = Theme.THEMES[ti];
      h += '<button class="k-theme' + (s.theme === th.id || (!s.theme && th.id === 'light') ? ' k-on' : '') + '" onclick="AppSet.theme(\'' + th.id + '\')">' +
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
