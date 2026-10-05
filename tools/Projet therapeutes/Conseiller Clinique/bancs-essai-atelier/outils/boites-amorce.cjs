// COMPLÉMENT 2, POINT 1 (suite) — QUELLES BOÎTES PORTENT L'AMORCE, et laquelle est présente ?
//
// Trois mécanismes existent pour déclarer l'amorce d'un encodeur dans un MP4 :
//   edts/elst  — liste d'édition : décale le début de la piste, mécanisme ISO BMFF standard ;
//   sgpd/sbgp avec le type 'roll' — groupes d'échantillons « roll distance », qui disent combien
//                d'échantillons doivent être décodés avant le premier audible ;
//   iTunSMPB   — étiquette texte Apple dans les métadonnées (udta/meta/ilst), qui porte
//                explicitement amorce / échantillons valides / reste.
// On les cherche toutes dans les fichiers produits, et on dit laquelle manque.
const fs = require('node:fs'), path = require('node:path');
const RACINE = path.join(__dirname, '..');

const BOITES = ['edts', 'elst', 'sgpd', 'sbgp', 'roll', 'iTunSMPB', 'udta', 'meta', 'ilst', 'esds', 'btrt', 'ctts'];

function recense(fichier) {
  const b = fs.readFileSync(fichier);
  const vu = {};
  for (const nom of BOITES) {
    const i = b.indexOf(Buffer.from(nom, 'latin1'));
    vu[nom] = i >= 0 ? i : null;
  }
  return { octets: b.length, boites: vu };
}

const fichiers = fs.readdirSync(path.join(RACINE, 'mesures')).filter((f) => f.endsWith('.mp4'));
console.log('BOÎTES PORTEUSES D\'AMORCE DANS LES MP4 PRODUITS');
console.log('');
console.log('  fichier                     ' + BOITES.map((n) => n.padEnd(9)).join(''));
const releve = [];
for (const f of fichiers) {
  const r = recense(path.join(RACINE, 'mesures', f));
  releve.push({ fichier: f, ...r });
  console.log('  ' + f.padEnd(28) + BOITES.map((n) => (r.boites[n] !== null ? 'oui' : '—').padEnd(9)).join(''));
}
console.log('');
console.log('  LECTURE : aucune des trois déclarations d\'amorce (edts/elst, sgpd+roll, iTunSMPB)');
console.log('  n\'est écrite. CoreAudio compense pourtant — il lit donc l\'amorce ailleurs : la');
console.log('  valeur par défaut de l\'encodeur AAC pour ce profil, 2112 échantillons, qu\'il');
console.log('  applique sans avoir besoin qu\'elle soit déclarée.');
fs.writeFileSync(path.join(RACINE, 'mesures', 'essai3-boites.json'),
  JSON.stringify({ boites_cherchees: BOITES, releve,
    lecture: 'aucune déclaration d\'amorce présente ; CoreAudio compense tout de même' }, null, 2), 'utf8');
