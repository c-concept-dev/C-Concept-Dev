// FALSIFICATION DES TESTS DE NARRATION — un test qui passe ne prouve rien tant qu'on n'a pas
// montré qu'il échoue quand il le doit.
//
// Chaque mutation ci-dessous retire exactement UNE des garanties du lot 1a, relance le test qui
// devrait la défendre, et exige qu'il ÉCHOUE. La source est restaurée après chaque essai, et
// l'empreinte du fichier est vérifiée à la fin : rien ne doit rester de ces mutations.
//
//   NODE_PATH=<playwright> node tests/falsifier-narration.cjs
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CŒUR = path.join(__dirname, '..', 'studio-clinique-core.js');
const original = fs.readFileSync(CŒUR, 'utf8');
const empreinteAvant = crypto.createHash('sha256').update(original).digest('hex');

const ESSAIS = [
  { nom: 'le document part dans l\'export sans retrait de la narration',
    test: 'verify-narration-etapes.cjs',
    de: "JSON.stringify(adocDocumentPourExport(doc)) + ';'",
    vers: "JSON.stringify(doc) + ';'" },
  { nom: 'l\'enregistrement ne purge plus les narrations orphelines',
    test: 'verify-narration-etapes.cjs',
    de: 'const narrationRetiree = adocNarrationPurge(art._adocStructuredDoc);',
    vers: 'const narrationRetiree = [];' },
  { nom: 'l\'insertion d\'un premier bloc ne reporte plus la narration de la carte',
    test: 'verify-narration-etapes.cjs',
    de: '      adocNarrationSuivreChangementEtapes(doc, etapesAvant);\n',
    vers: '' },
  { nom: 'le champ Narration ne se masque plus hors Présentation',
    test: 'verify-narration-editeur.cjs',
    de: '      narrBoite.hidden = !etape;',
    vers: '      narrBoite.hidden = false;' },
  // Le seuil de la règle d'étape. La mutation évidente — `<= 1` vers `< 1` — a été essayée et
  // n'a RIEN cassé : elle est équivalente. À un bloc, les deux branches produisent exactement la
  // même étape unique portée par l'identifiant du bloc ; seul le zéro bloc distingue les deux
  // écritures, et il tombe du même côté dans les deux cas. Ce n'était donc pas un trou du test
  // mais une mutation sans effet, et c'est noté ici plutôt que passé sous silence. La mutation
  // retenue déplace le seuil vers le haut : une carte à deux blocs n'aurait plus qu'une étape.
  { nom: 'la règle d\'étape fond deux blocs en une seule étape',
    test: 'verify-narration-etapes.cjs',
    de: '      if (blocs.length <= 1) {',
    vers: '      if (blocs.length <= 2) {' },
];

function lancer(test) {
  try {
    execFileSync(process.execPath, [path.join(__dirname, test)],
      { stdio: 'pipe', encoding: 'utf8', env: process.env });
    return { echoue: false, sortie: '' };
  } catch (e) {
    return { echoue: true, sortie: String((e.stdout || '') + (e.stderr || '')).split('\n').filter(function (l) { return l.startsWith('FAIL'); })[0] || '' };
  }
}

let tenus = 0;
try {
  // Contrôle préalable : sans mutation, les deux tests doivent PASSER. Sinon tout ce qui suit
  // mesurerait autre chose.
  for (const t of ['verify-narration-etapes.cjs', 'verify-narration-editeur.cjs']) {
    const r = lancer(t);
    if (r.echoue) { console.error('ARRÊT — ' + t + ' échoue AVANT toute mutation : ' + r.sortie); process.exit(1); }
  }
  console.log('témoin : les deux tests passent sur la source intacte.\n');

  for (const essai of ESSAIS) {
    const n = original.split(essai.de).length - 1;
    if (n !== 1) { console.error('ARRÊT — ancre trouvée ' + n + ' fois : ' + essai.nom); process.exit(1); }
    fs.writeFileSync(CŒUR, original.replace(essai.de, essai.vers), 'utf8');
    const r = lancer(essai.test);
    fs.writeFileSync(CŒUR, original, 'utf8');
    if (r.echoue) { tenus++; console.log('TENU   ' + essai.nom + '\n       → ' + r.sortie); }
    else console.log('MANQUÉ ' + essai.nom + ' — le test est passé malgré la mutation');
  }
} finally {
  fs.writeFileSync(CŒUR, original, 'utf8');
}

const empreinteApres = crypto.createHash('sha256').update(fs.readFileSync(CŒUR, 'utf8')).digest('hex');
console.log('\nsource restaurée : ' + (empreinteApres === empreinteAvant ? 'empreinte identique' : 'ÉCART — ' + empreinteApres));
console.log(tenus === ESSAIS.length ? 'PASS falsifier-narration — ' + tenus + '/' + ESSAIS.length + ' mutations détectées.'
                                    : 'FAIL falsifier-narration — ' + tenus + '/' + ESSAIS.length);
process.exit(empreinteApres === empreinteAvant && tenus === ESSAIS.length ? 0 : 1);
