// L'ÉCRIVAIN DE ZIP, ÉPROUVÉ CONTRE PYTHON ET CONTRE `unzip` (lot 2B, X7).
//
// CE TEST NE PASSE PAR AUCUN NAVIGATEUR : l'écrivain est une fonction d'octets, et ses témoins
// sont `zlib.crc32` et `zipfile` de Python, plus `unzip -t`. Si l'écrivain et Python ne tombent
// pas d'accord, c'est l'écrivain qui a tort — et c'est tout l'intérêt d'un témoin qui ne partage
// pas une ligne de code avec lui.
//
//   node tests/verify-zip-stocke.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlibNode = require('node:zlib');
const { execFileSync } = require('node:child_process');
const Zip = require('../zip-stocke.js');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-stocke-'));
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

function pythonCrc(octets) {
  const f = path.join(temp, 'crc.bin');
  fs.writeFileSync(f, Buffer.from(octets));
  return Number(execFileSync('/usr/bin/python3',
    ['-I', '-c', 'import sys,zlib;print(zlib.crc32(open(sys.argv[1],"rb").read()) & 0xffffffff)', f],
    { encoding: 'utf8' }).trim());
}

function pythonLit(fichier) {
  const programme = `
import json, hashlib, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
out = {"mauvais": z.testzip(), "entrees": []}
for i in z.infolist():
    d = z.read(i.filename)
    out["entrees"].append({"nom": i.filename, "octets": len(d), "methode": i.compress_type,
                           "crc": i.CRC, "utf8": bool(i.flag_bits & 0x800),
                           "sha256": hashlib.sha256(d).hexdigest(),
                           "date": list(i.date_time)})
print(json.dumps(out))
`;
  return JSON.parse(execFileSync('/usr/bin/python3', ['-I', '-c', programme, fichier],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

const sha = (b) => require('node:crypto').createHash('sha256').update(b).digest('hex');

(async () => {
  // ── 1. LE CRC-32 EST LE MÊME QUE CELUI DE PYTHON, sur des cas qui mordent ────────────────
  // Le vide, un octet, la frontière du morceau de lecture, et des octets de toutes les valeurs :
  // un CRC qui se tromperait sur la table ou sur le repliement se verrait sur l'un des quatre.
  const cas = [
    new Uint8Array(0),
    new Uint8Array([0]),
    new Uint8Array([97, 98, 99]),
    Uint8Array.from({ length: Zip.MORCEAU + 7 }, (_, i) => (i * 31 + 7) & 0xFF),
    Uint8Array.from({ length: 256 }, (_, i) => i),
  ];
  cas.forEach((c, i) => {
    const mien = Zip.crc32(c);
    const sien = pythonCrc(c);
    const nodeCrc = zlibNode.crc32 ? zlibNode.crc32(Buffer.from(c)) >>> 0 : sien;
    assert.equal(mien, sien, 'cas ' + i + ' (' + c.length + ' octets) : ' + mien + ' contre ' + sien);
    assert.equal(mien, nodeCrc, 'cas ' + i + ' : désaccord avec zlib de Node');
  });
  assert.equal(Zip.crc32(new Uint8Array([97, 98, 99])), 0x352441C2,
    'le CRC-32 de « abc » est 0x352441C2, chiffre publié');
  pass('CRC-32 identique à zlib de Python et de Node sur 5 cas, dont le vide et la frontière de morceau.');

  // ── 2. LE CRC PAR MORCEAUX ÉGALE LE CRC D'UN COUP ────────────────────────────────────────
  // C'est l'invariant qui autorise à lire une image de 2 Mo sans la copier : si les deux
  // chemins divergeaient, le zip serait refusé par tous les lecteurs.
  const long = Uint8Array.from({ length: 3 * Zip.MORCEAU + 123 }, (_, i) => (i * 17 + 3) & 0xFF);
  let parMorceaux = 0;
  for (let i = 0; i < long.length; i += Zip.MORCEAU) {
    parMorceaux = Zip.crc32(long.subarray(i, Math.min(long.length, i + Zip.MORCEAU)), parMorceaux);
  }
  assert.equal(parMorceaux, Zip.crc32(long), 'CRC par morceaux ≠ CRC d\'un coup');
  pass('CRC-32 par morceaux identique au CRC d\'un coup sur ' + long.length + ' octets.');

  // ── 3. UNE ARCHIVE RÉELLE : PYTHON ET `unzip` LA LISENT, et le contenu est intact ────────
  const entrees = [
    { nom: 'images-presentation-par-etape/01-1.jpg', octets: Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) & 0xFF) },
    { nom: 'images-presentation-par-etape/01-2.jpg', octets: Uint8Array.from({ length: 1 }, () => 42) },
    { nom: 'images-presentation-par-etape/10-3.png', octets: Uint8Array.from({ length: Zip.MORCEAU + 1 }, (_, i) => i & 0xFF) },
    { nom: 'images-presentation-par-etape/index.csv', octets: new TextEncoder().encode('fichier;diapositive\n01-1.jpg;1\n') },
  ];
  const avancements = [];
  const r = await Zip.ecrire(entrees, { date: new Date(2026, 9, 18, 11, 30, 44),
    surAvancement: (f, t, o) => avancements.push([f, t, o]) });
  const fichier = path.join(temp, 'essai.zip');
  fs.writeFileSync(fichier, Buffer.from(await r.blob.arrayBuffer()));

  const t = execFileSync('/usr/bin/unzip', ['-t', fichier], { encoding: 'utf8' });
  assert.match(t, /No errors detected/, 'unzip -t : ' + t);
  const lu = pythonLit(fichier);
  assert.equal(lu.mauvais, null, 'aucun CRC ne doit être mauvais : ' + lu.mauvais);
  assert.deepEqual(lu.entrees.map((e) => e.nom), entrees.map((e) => e.nom),
    'les noms et leur ORDRE doivent être tenus');
  lu.entrees.forEach((e, i) => {
    assert.equal(e.methode, 0, e.nom + ' doit être stocké (méthode 0) : ' + e.methode);
    assert.equal(e.utf8, true, e.nom + ' doit porter le drapeau UTF-8 (bit 11)');
    assert.equal(e.octets, entrees[i].octets.length, e.nom + ' : taille');
    assert.equal(e.sha256, sha(Buffer.from(entrees[i].octets)), e.nom + ' : contenu altéré');
    assert.equal(e.crc, Zip.crc32(entrees[i].octets), e.nom + ' : CRC inscrit ≠ CRC calculé');
    assert.deepEqual(e.date, [2026, 10, 18, 11, 30, 44],
      e.nom + ' : la date MS-DOS doit être celle demandée : ' + JSON.stringify(e.date));
  });
  assert.equal(r.entrees, 4, 'le compte rendu annonce 4 entrées : ' + r.entrees);
  assert.equal(avancements.length, 4, 'un avancement par entrée (X6) : ' + avancements.length);
  assert.deepEqual(avancements.map((a) => a[0]), [1, 2, 3, 4], 'avancement croissant');
  pass('archive de 4 entrées (dont une de 1 octet et une au-delà du morceau) lue par Python et unzip, contenu et dates exacts.');

  // ── 4. UN BLOB EST ÉCRIT SANS ÊTRE RECOPIÉ, et son CRC est le même ───────────────────────
  const gros = Uint8Array.from({ length: 2 * Zip.MORCEAU + 999 }, (_, i) => (i * 13 + 5) & 0xFF);
  const parBlob = await Zip.ecrire([{ nom: 'a.bin', blob: new Blob([gros]) }]);
  const f2 = path.join(temp, 'blob.zip');
  fs.writeFileSync(f2, Buffer.from(await parBlob.blob.arrayBuffer()));
  const lu2 = pythonLit(f2);
  assert.equal(lu2.mauvais, null, 'CRC d\'une entrée venue d\'un Blob');
  assert.equal(lu2.entrees[0].sha256, sha(Buffer.from(gros)), 'contenu du Blob altéré');
  assert.equal(lu2.entrees[0].crc, Zip.crc32(gros), 'CRC d\'un Blob ≠ CRC de ses octets');
  pass('une entrée donnée comme Blob, lue par morceaux, produit le même CRC et le même contenu.');

  // ── 5. CE QUE LE STOCKÉ COÛTE : MESURÉ, PAS SUPPOSÉ ─────────────────────────────────────
  //
  // J'avais écrit ici que le deflate « ne gagne rien » sur un JPEG, et posé un seuil de 2 %.
  // LA MESURE M'A CONTREDIT : sur la photo de la fixture, il gagne 5,1 %. Le seuil était une
  // opinion déguisée en contrôle, et il est retiré. Ce que ce contrôle affirme maintenant est la
  // PROPRIÉTÉ de la méthode stockée — elle n'ajoute rien aux octets — et il MESURE le gain
  // qu'aurait le deflate, pour que le choix se discute sur un chiffre. Le chiffre qui tranche
  // vraiment est celui des images RENDUES (1920 px, JPEG 0,92), relevé par
  // `verify-zip-chutier.cjs` dans le navigateur : une photo source de 10 Ko et une capture de
  // 1 Mo ne se dégonflent pas de la même façon.
  const { PHOTO_DATA_URI } = require('./chutier-fixtures.cjs');
  {
    const brut = Buffer.from(PHOTO_DATA_URI.split(',')[1], 'base64');
    assert.ok(brut.length > 8000,
      'le témoin doit être un vrai JPEG, pas un fragment : ' + brut.length + ' octets');
    assert.deepEqual([...brut.subarray(0, 3)], [0xFF, 0xD8, 0xFF],
      'et il doit commencer par la signature JPEG');
    const degonfle = zlibNode.deflateRawSync(brut, { level: 9 });
    const gain = (1 - degonfle.length / brut.length) * 100;
    // LA PROPRIÉTÉ, elle, est vérifiable : stocker n'ajoute pas un octet au contenu.
    const stocke = await Zip.ecrire([{ nom: 'photo.jpg', octets: new Uint8Array(brut) }]);
    const f3 = path.join(temp, 'photo.zip');
    fs.writeFileSync(f3, Buffer.from(await stocke.blob.arrayBuffer()));
    const lu3 = pythonLit(f3);
    assert.equal(lu3.entrees[0].octets, brut.length,
      'la méthode stockée ne doit ni gonfler ni rogner le contenu');
    assert.equal(lu3.entrees[0].sha256, sha(brut), 'et ne doit pas l\'altérer');
    const surcout = fs.statSync(f3).size - brut.length;
    assert.ok(surcout > 0 && surcout < 400,
      'le surcoût d\'enveloppe doit rester une poignée d\'octets : ' + surcout);
    console.log('      photo de ' + brut.length + ' octets : le deflate gagnerait '
      + gain.toFixed(2) + ' % (' + degonfle.length + ' octets) ; l\'enveloppe du zip stocké '
      + 'coûte ' + surcout + ' octets');
    pass('la méthode stockée rend le contenu intact, pour ' + surcout + ' octets d\'enveloppe ; '
      + 'le gain du deflate sur cette photo est mesuré à ' + gain.toFixed(2) + ' %.');
  }

  console.log('\nPASS verify-zip-stocke — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
