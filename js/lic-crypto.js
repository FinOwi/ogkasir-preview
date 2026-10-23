/* OGKasir - kripto lisensi (dipakai aplikasi & generator; offline) */
var LicCrypto = (function () {
  /* Kunci rahasia: dipecah agar tidak terbaca sekilas (obfuskasi ringan).
     CATATAN: diganti => semua kode lama tidak berlaku. */
  var SECRET = ['ogka', 'sir', '-', 'lic', '-', 'pr0', 's3cr3t', '-', '2026', '!', 'og'].join('');
  var DEV_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // tanpa I,L,O,0,1

  /* SHA-256 (ASCII/Latin-1) */
  function sha256(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var maxWord = Math.pow(2, 32), result = '';
    var words = [], asciiBitLength = ascii.length * 8;
    var hash = sha256.h = sha256.h || [], k = sha256.k = sha256.k || [];
    var primeCounter = k.length, isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (var i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    var i, j;
    for (i = 0; i < ascii.length; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return '';
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (asciiBitLength / maxWord) | 0;
    words[words.length] = asciiBitLength;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        var temp1 = hash[7]
          + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + k[i]
          + (w[i] = (i < 16) ? w[i] : (w[i - 16]
            + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }

  function bytesToAscii(b) {
    var s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i] & 0xFF);
    return s;
  }
  function hexToBytes(h) {
    var b = [];
    for (var i = 0; i < h.length; i += 2) b.push(parseInt(h.substr(i, 2), 16));
    return b;
  }

  /* HMAC-SHA256 -> hex */
  function hmacSha256(key, msg) {
    var bs = 64, k = [], i;
    for (i = 0; i < key.length; i++) k.push(key.charCodeAt(i) & 0xFF);
    if (k.length > bs) k = hexToBytes(sha256(key));
    while (k.length < bs) k.push(0);
    var ok = [], ik = [];
    for (i = 0; i < bs; i++) { ok.push(k[i] ^ 0x5c); ik.push(k[i] ^ 0x36); }
    var inner = hexToBytes(sha256(bytesToAscii(ik) + msg));
    return sha256(bytesToAscii(ok) + bytesToAscii(inner));
  }

  /* Kode device 8 char dari ID mentah */
  function deviceCode(rawId) {
    var h = sha256('OGK|' + rawId), out = '';
    for (var i = 0; i < 8; i++) out += DEV_ALPHA[parseInt(h.substr(i * 2, 2), 16) % DEV_ALPHA.length];
    return out;
  }
  function fmtDevice(d) { return d.substr(0, 4) + '-' + d.substr(4, 4); }

  /* Buat kode aktivasi: dev8 + exp(base36,4) + sig(12 hex) */
  function genCode(dev8, expDays) {
    var exp = expDays.toString(36).toUpperCase();
    while (exp.length < 4) exp = '0' + exp;
    var sig = hmacSha256(SECRET, dev8 + '|' + expDays).substr(0, 12).toUpperCase();
    var raw = dev8 + exp + sig;
    return raw.replace(/(.{4})/g, '$1-').replace(/-$/, '');
  }

  /* Verifikasi kode untuk device ini */
  function verifyCode(code, dev8, todayDays) {
    var c = String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (c.length !== 24) return { ok: false, reason: 'format' };
    var d = c.substr(0, 8), e = c.substr(8, 4), s = c.substr(12, 12);
    if (d !== dev8) return { ok: false, reason: 'device' };
    var expDays = parseInt(e, 36);
    if (isNaN(expDays)) return { ok: false, reason: 'format' };
    var expect = hmacSha256(SECRET, d + '|' + expDays).substr(0, 12).toUpperCase();
    if (expect !== s) return { ok: false, reason: 'sig' };
    if (expDays < todayDays) return { ok: false, reason: 'expired' };
    return { ok: true, expDays: expDays };
  }

  return {
    sha256: sha256,
    hmacSha256: hmacSha256,
    deviceCode: deviceCode,
    fmtDevice: fmtDevice,
    genCode: genCode,
    verifyCode: verifyCode
  };
})();
