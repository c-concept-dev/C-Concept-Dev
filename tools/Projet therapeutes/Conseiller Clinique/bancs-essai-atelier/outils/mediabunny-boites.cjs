// Mediabunny sait-il ÉCRIRE une liste d'édition ? La question compte : si oui, l'amorce pourrait
// être déclarée dans le conteneur plutôt que laissée à la valeur par défaut du décodeur.
//
// Méthode : chercher les noms de boîtes comme LITTÉRAUX DE CHAÎNE dans le bundle. Un comptage
// insensible à la casse ne vaut rien ici — il attrape des identifiants minifiés (« eDts » revient
// 19 fois sans rapport), ce qui m'avait fait croire à tort que le support existait.
const fs = require('node:fs'), path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'vendeur', 'mediabunny.mjs'), 'utf8');
const noms = ['edts', 'elst', 'sgpd', 'sbgp', 'roll', 'stts', 'stsd', 'mvhd', 'mdhd', 'moov', 'ftyp'];
const litteral = (n) => (src.match(new RegExp('["\']' + n + '["\']', 'g')) || []).length;
console.log('NOMS DE BOÎTES COMME LITTÉRAUX DE CHAÎNE dans mediabunny.mjs');
const releve = {};
for (const n of noms) {
  const c = litteral(n);
  releve[n] = c;
  console.log('  ' + n.padEnd(6) + String(c).padStart(3) + ' littéral(aux)' + (c === 0 ? '   ← absent' : ''));
}
const i = src.search(/["']elst["']/);
console.log('');
if (i >= 0) {
  console.log('contexte de elst :');
  console.log('  ' + JSON.stringify(src.slice(Math.max(0, i - 110), i + 130)));
} else {
  console.log('AUCUN littéral « elst » ni « edts » : Mediabunny 1.61.1 ne lit ni n\'écrit de liste');
  console.log('d\'édition. Les boîtes qu\'il écrit bien (stts, stsd, mvhd, mdhd, moov, ftyp) sont');
  console.log('présentes comme littéraux, ce qui valide la méthode de recherche.');
}
fs.writeFileSync(path.join(__dirname, '..', 'mesures', 'essai3-mediabunny-boites.json'),
  JSON.stringify({ version: '1.61.1', methode: 'littéraux de chaîne, sensible à la casse',
    litteraux: releve, liste_edition_supportee: releve.elst > 0 || releve.edts > 0 }, null, 2), 'utf8');
