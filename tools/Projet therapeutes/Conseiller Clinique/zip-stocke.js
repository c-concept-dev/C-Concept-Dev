(function () {
  'use strict';

  var table = null;
  function crcTable() {
    if (table) return table;
    table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  }
  function crc32(bytes) {
    var t = crcTable(), c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function u16(n) { return [n & 255, (n >>> 8) & 255]; }
  function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }
  function concat(parts) {
    var size = parts.reduce(function (sum, p) { return sum + p.length; }, 0);
    var out = new Uint8Array(size), offset = 0;
    parts.forEach(function (p) { out.set(p, offset); offset += p.length; });
    return out;
  }
  async function creer(fichiers) {
    var encoder = new TextEncoder(), locaux = [], centraux = [], offset = 0;
    for (var i = 0; i < fichiers.length; i++) {
      var fichier = fichiers[i];
      var nom = encoder.encode(fichier.nom);
      var donnees = new Uint8Array(await fichier.blob.arrayBuffer());
      var crc = crc32(donnees);
      var local = new Uint8Array([].concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(donnees.length), u32(donnees.length), u16(nom.length), u16(0)
      ));
      locaux.push(local, nom, donnees);
      var central = new Uint8Array([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(donnees.length), u32(donnees.length), u16(nom.length), u16(0),
        u16(0), u16(0), u16(0), u32(0), u32(offset)
      ));
      centraux.push(central, nom);
      offset += local.length + nom.length + donnees.length;
    }
    var repertoire = concat(centraux);
    var fin = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(fichiers.length), u16(fichiers.length),
      u32(repertoire.length), u32(offset), u16(0)
    ));
    return new Blob([concat(locaux), repertoire, fin], { type: 'application/zip' });
  }
  window.AtelierZip = { creer: creer };
})();
