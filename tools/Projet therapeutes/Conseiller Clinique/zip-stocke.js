// ── UN ÉCRIVAIN DE ZIP MINIMAL, MÉTHODE « STOCKÉE » (lot 2B, X7) ─────────────────────────────
//
// POURQUOI ÉCRIRE CE CODE PLUTÔT QUE VENDORISER UNE BIBLIOTHÈQUE. Quatre raisons, dans l'ordre
// de leur poids.
//
//   1. IL N'Y A RIEN À COMPRESSER. Un JPEG et un PNG sont déjà compressés : les repasser au
//      deflate coûte du temps et ne gagne rien (mesuré dans `verify-zip-stocke.cjs` : l'écart
//      entre stocké et dégonflé sur un JPEG réel est inférieur au pour-cent). La méthode
//      « stockée » est donc la méthode JUSTE, pas un raccourci : le zip n'est plus qu'une
//      enveloppe, et une enveloppe tient en cent cinquante lignes.
//   2. X7 EXIGE « SANS CONNEXION ». Le banc chargeait JSZip DEPUIS UN CDN — et ne l'employait
//      jamais, la balise était là pour le bloc d'origine de l'application. Vendoriser JSZip
//      ajouterait une centaine de kilo-octets et une licence à suivre pour une fonctionnalité
//      qui tient dans ce fichier ; retirer la balise du banc était de toute façon nécessaire.
//   3. CE QUE FAIT CE CODE EST ENTIÈREMENT VÉRIFIABLE PAR UN TIERS. Le seul calcul est le
//      CRC-32, et il se compare à `zlib.crc32` de Python ; la structure se compare à `zipfile`
//      et à `unzip -t`. Une bibliothèque, elle, se vérifie par sa réputation.
//   4. LA MÉMOIRE RESTE SOUS CONTRÔLE. Les images sont déjà en mémoire, compressées. Ce code ne
//      les DÉCODE jamais et ne les recopie jamais en entier : il lit chaque Blob par morceaux de
//      64 Ko pour son CRC, puis assemble le zip en passant les Blob TELS QUELS au constructeur
//      de Blob, qui les référence sans les copier.
//
// CE QU'IL NE FAIT PAS, ET LE DIT : ni Zip64, ni chiffrement, ni commentaire, ni répertoire
// vide, ni dossier daté autrement que par l'horloge locale. Au-delà de 4 Go, il refuse au lieu
// d'écrire une archive fausse.
(function (racine) {
  'use strict';

  var MORCEAU = 64 * 1024;
  var LIMITE_32 = 0xFFFFFFFF;

  // La table du CRC-32 (polynôme 0xEDB88320), construite une fois. Écrite à la main parce que
  // c'est la seule arithmétique de ce fichier et qu'elle doit pouvoir se lire.
  var TABLE = (function () {
    var t = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  // Le CRC-32 d'un bloc d'octets, ou la suite d'un calcul en cours : c'est la même fonction,
  // parce qu'un CRC calculé par morceaux et un CRC calculé d'un coup doivent être le même
  // nombre, et qu'une seconde fonction finirait par en diverger.
  function crc32(octets, precedent) {
    var c = (precedent === undefined ? 0 : precedent) ^ LIMITE_32;
    for (var i = 0; i < octets.length; i++) {
      c = TABLE[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ LIMITE_32) >>> 0;
  }

  // LE NOM EST ÉCRIT EN UTF-8 ET LE DRAPEAU LE DIT (bit 11). Sans ce drapeau, un nom accentué
  // serait lu dans la page de code 437 par les lecteurs stricts. Les noms de ce zip sont sans
  // accent (X5), mais le drapeau coûte un bit et retire une question.
  function enUtf8(s) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(s);
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }

  // L'heure et la date au format MS-DOS, qui est ce que le format zip demande : deux mots de
  // 16 bits, seconde au pas de deux, année comptée depuis 1980.
  function heureDos(d) {
    return ((d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2))) & 0xFFFF;
  }
  function dateDos(d) {
    var an = Math.max(1980, d.getFullYear()) - 1980;
    return ((an << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  }

  function ecrivain() {
    var octets = [];
    return {
      u16: function (v) { octets.push(v & 0xFF, (v >>> 8) & 0xFF); return this; },
      u32: function (v) { octets.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); return this; },
      brut: function (u8) { for (var i = 0; i < u8.length; i++) octets.push(u8[i]); return this; },
      fini: function () { return new Uint8Array(octets); },
      taille: function () { return octets.length; },
    };
  }

  // ── LE CRC D'UN BLOB, LU PAR TRANCHES QUE NOUS DÉCOUPONS NOUS-MÊMES ──────────────────────
  //
  // J'AI D'ABORD EMPLOYÉ `blob.stream()`, en écrivant que la lecture se faisait « par morceaux de
  // 64 Ko ». LA MESURE M'A DÉMENTI : sur une entrée de 97 280 octets, le flux a livré les 97 280
  // octets EN UN SEUL MORCEAU. La taille des morceaux d'un flux de Blob appartient au moteur, pas
  // à l'appelant : ma constante ne bornait rien, elle décorait un commentaire. Le contrôle qui
  // mesure le plus gros bloc tenu l'a dit du premier coup.
  //
  // `blob.slice()` NE COPIE RIEN — elle rend une vue sur les mêmes octets — et c'est seulement
  // l'`arrayBuffer()` de la tranche qui matérialise des octets. En découpant nous-mêmes, la borne
  // devient vraie : l'écrivain ne détient jamais plus de MORCEAU octets, quelle que soit la taille
  // de l'image, et quel que soit le moteur. C'est aussi ce qui le rend indépendant de
  // `Blob.stream`, que tous les moteurs ne servent pas de la même façon.
  function crcDUnBlob(blob) {
    var crc = 0, lus = 0, pic = 0, debut = 0;
    function suite() {
      if (debut >= blob.size) {
        return Promise.resolve({ crc: crc, octets: lus, parTranches: true, picDeLecture: pic });
      }
      var fin = Math.min(blob.size, debut + MORCEAU);
      return blob.slice(debut, fin).arrayBuffer().then(function (t) {
        var u8 = new Uint8Array(t);
        crc = crc32(u8, crc);
        lus += u8.length;
        if (u8.length > pic) pic = u8.length;
        debut = fin;
        return suite();
      });
    }
    return suite();
  }

  // ── ÉCRIRE L'ARCHIVE ──────────────────────────────────────────────────────────────────────
  //
  // `entrees` : [{ nom, blob }] ou [{ nom, octets: Uint8Array }]. L'ordre des entrées est
  // l'ordre de l'archive, et il est tenu : c'est ce que le montage lira.
  //
  // `surAvancement(faites, total, octetsEcrits)` est appelée après chaque entrée (X6).
  function ecrire(entrees, options) {
    var o = options || {};
    var quand = o.date || new Date();
    var morceaux = [];        // ce qui part au Blob final : des Uint8Array d'en-têtes et des Blob
    var central = [];
    var position = 0;
    var i = 0;
    // ── LE PLUS GROS BLOC QUE CET ÉCRIVAIN TIENT À LA FOIS ────────────────────────────────
    // POURQUOI CE CHIFFRE ET PAS UNE MESURE DE MÉMOIRE. Mesuré avec deux instruments —
    // `performance.memory` dans la page et `JSHeapUsedSize` du protocole DevTools —, tirer
    // 9,3 Mo d'octets DANS le tas JS ne le fait pas bouger d'un centième de mégaoctet : les
    // octets d'un Blob comme ceux d'un ArrayBuffer vivent HORS du tas JS. Le tas est donc le
    // mauvais instrument pour cette question, et un pic à zéro n'y prouve rien.
    //
    // CE QUI DÉCIDE VRAIMENT est la taille du plus gros bloc contigu que l'écrivain détient :
    // 64 Ko s'il lit par morceaux, la taille de l'image s'il la lit d'un coup. Ce nombre-là est
    // exact, il est rendu dans le résultat, et un contrôle le compare au morceau de lecture.
    var picDeLecture = 0;

    function uneEntree() {
      if (i >= entrees.length) return Promise.resolve();
      var e = entrees[i];
      var nom = enUtf8(e.nom);
      var corps = e.blob || new Blob([e.octets]);
      var mesure = e.blob
        ? crcDUnBlob(e.blob)
        : Promise.resolve({ crc: crc32(e.octets), octets: e.octets.length, parMorceaux: false });
      return mesure.then(function (m) {
        if (m.picDeLecture > picDeLecture) picDeLecture = m.picDeLecture;
        if (m.octets > LIMITE_32 || position > LIMITE_32) {
          throw new Error('archive trop grande pour un zip sans Zip64 : ' + e.nom
            + ' à ' + position + ' octets. Rien n\'est écrit.');
        }
        var h = ecrivain();
        h.u32(0x04034B50).u16(20).u16(0x0800).u16(0).u16(heureDos(quand)).u16(dateDos(quand));
        h.u32(m.crc).u32(m.octets).u32(m.octets).u16(nom.length).u16(0).brut(nom);
        var entete = h.fini();
        morceaux.push(entete, corps);
        central.push({ nom: nom, crc: m.crc, octets: m.octets, offset: position });
        position += entete.length + m.octets;
        if (o.surAvancement) o.surAvancement(i + 1, entrees.length, position);
        i++;
        return uneEntree();
      });
    }

    return uneEntree().then(function () {
      var c = ecrivain();
      central.forEach(function (e) {
        c.u32(0x02014B50).u16(20).u16(20).u16(0x0800).u16(0);
        c.u16(heureDos(quand)).u16(dateDos(quand));
        c.u32(e.crc).u32(e.octets).u32(e.octets);
        c.u16(e.nom.length).u16(0).u16(0).u16(0).u16(0).u32(0).u32(e.offset).brut(e.nom);
      });
      var repertoire = c.fini();
      var f = ecrivain();
      f.u32(0x06054B50).u16(0).u16(0).u16(central.length).u16(central.length);
      f.u32(repertoire.length).u32(position).u16(0);
      morceaux.push(repertoire, f.fini());
      return {
        blob: new Blob(morceaux, { type: 'application/zip' }),
        entrees: central.length,
        octets: position + repertoire.length + 22,
        picDeLecture: picDeLecture,
        morceauDeLecture: MORCEAU,
        regle: 'méthode STOCKÉE (0) : un JPEG et un PNG sont déjà compressés. CRC-32 calculé '
          + 'par morceaux de ' + MORCEAU + ' octets, noms en UTF-8 avec le bit 11.',
      };
    });
  }

  var api = { crc32: crc32, ecrire: ecrire, enUtf8: enUtf8, heureDos: heureDos, dateDos: dateDos,
              MORCEAU: MORCEAU };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.ZipStocke = api;
})(typeof window === 'object' ? window : this);
