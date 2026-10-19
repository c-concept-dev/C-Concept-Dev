// FALSIFICATION DU CONTRÔLE « OÙ LA PAGE VA SE POSER » (lot 2C, 2.2 — D1).
//
// Quatre mutations, une par promesse de D1. Chacune retire une seule chose, et le contrôle doit
// tomber à chaque fois : sinon la promesse n'était pas réellement tenue par le code, seulement
// par le hasard de la fixture.
//
//   NODE_PATH=<playwright> node tests/falsifier-insertion-page-cible.cjs [--reprendre]
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const FICHIERS = { page: path.join(RACINE, 'studio-clinique.html'),
                   coeur: path.join(RACINE, 'studio-clinique-core.js') };
const JOURNAL = path.join(RACINE, 'banc-chutier', 'journal-de-reprise-page-cible.json');
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

const original = {}, avant = {};
Object.keys(FICHIERS).forEach((k) => {
  original[k] = fs.readFileSync(FICHIERS[k], 'utf8');
  avant[k] = sha(original[k]);
});

if (process.argv.includes('--reprendre')) {
  if (!fs.existsSync(JOURNAL)) { console.error('Aucun journal : rien à restaurer.'); process.exit(2); }
  const j = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
  Object.keys(j.sources).forEach((k) => {
    fs.writeFileSync(FICHIERS[k], j.sources[k]);
    console.log((sha(j.sources[k]) === j.empreintes[k] ? 'restauré  ' : 'DIVERGENT ')
      + path.basename(FICHIERS[k]));
  });
  fs.unlinkSync(JOURNAL);
  process.exit(0);
}

const MUTATIONS = [
  {
    // Convention (c) : un bloc de contenu doit remonter à sa diapositive.
    nom: 'un bloc de contenu ne remonte plus à sa diapositive',
    fichier: 'coeur',
    de: "      if (carte && carte.type === 'card' && carte.content && porte(carte.content.blocks)) return carte.id;",
    vers: "      if (false && carte) return carte.id;",
    attendu: 'les trois conventions cessent de désigner la même diapositive',
  },
  {
    // Convention (b) : la diapositive sélectionnée par son image (zone « cover »).
    nom: 'la diapositive sélectionnée par son image n’est plus reconnue',
    fichier: 'coeur',
    de: "    if (direct && direct.type === 'card') return direct.id;   // couvre zone === 'cover'",
    vers: "    if (false) return null;",
    attendu: 'la sélection en zone « cover » ne désigne plus la même cible que le titre',
  },
  {
    // La décision prise pour D1 : « avant la première » est accepté et vaut le rang 0.
    nom: 'insérer avant la première diapositive redevient interdit',
    fichier: 'coeur',
    de: "    return { cardId: cardId, index: direction === 'before' ? rang : rang + 1 };",
    vers: "    if (direction === 'before' && rang === 0) throw new Error('Interdit.');\n    return { cardId: cardId, index: direction === 'before' ? rang : rang + 1 };",
    attendu: 'le rang 0 n’est plus rendu : la décision de D1 n’était pas tenue par le code',
  },
  {
    // Le garde qui a manqué la première fois : un document ANCIEN étiqueté « présentation ».
    nom: 'un document ancien repasse pour une présentation',
    fichier: 'coeur',
    de: "    if (art._adocGenerationEngine === 'legacy-html') {\n      return 'Ajouter une page n\u2019est possible que dans une pr\u00e9sentation cr\u00e9\u00e9e par le Studio ; ce document est un document ancien.';",
    vers: "    if (false) {\n      return null;",
    attendu: 'le refus pour un document ancien disparaît — c’est le trou que le contrôle avait trouvé',
  },
];

function appliquer(m) {
  const chemin = FICHIERS[m.fichier];
  const t = fs.readFileSync(chemin, 'utf8');
  const n = t.split(m.de).length - 1;
  if (n !== 1) throw new Error('ancre trouvée ' + n + ' fois : ' + m.de.slice(0, 60));
  fs.writeFileSync(chemin, t.replace(m.de, m.vers));
}
const restaurer = () => Object.keys(FICHIERS).forEach((k) => fs.writeFileSync(FICHIERS[k], original[k]));

(async () => {
  let trous = 0, conformes = 0;
  MUTATIONS.forEach((m) => {
    const t = original[m.fichier];
    const n = t.split(m.de).length - 1;
    if (n !== 1) { console.log('  · ancre absente ou multiple (' + n + ') : ' + m.nom); trous++; }
  });
  if (trous) { console.error('\nInventaire périmé, rien n\'a été muté.'); process.exit(2); }
  console.log(MUTATIONS.length + ' ancres vérifiées, chacune présente une fois et une seule.\n');

  fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
  fs.writeFileSync(JOURNAL, JSON.stringify({ sources: original, empreintes: avant }));
  console.log('Journal de reprise écrit :\n  ' + JOURNAL + '\n');

  try {
    for (let i = 0; i < MUTATIONS.length; i++) {
      const m = MUTATIONS[i];
      console.log('#' + (i + 1) + ' ' + m.nom);
      appliquer(m);
      let echoue = false;
      try {
        execFileSync(process.execPath, [path.join(__dirname, 'verify-insertion-page-cible.cjs')],
          { stdio: 'pipe', timeout: 900000 });
      } catch (e) { echoue = true; }
      restaurer();
      if (echoue) { console.log('     le contrôle ÉCHOUE, comme il le doit'); conformes++; }
      else { console.log('     TROU : le contrôle PASSE malgré la mutation'); trous++; }
    }
  } finally {
    restaurer();
    Object.keys(FICHIERS).forEach((k) => {
      const e = sha(fs.readFileSync(FICHIERS[k], 'utf8'));
      console.log('  ' + e.slice(0, 16) + '  ' + path.basename(FICHIERS[k])
        + (e === avant[k] ? '  restauré' : '  DIVERGENT'));
    });
    if (fs.existsSync(JOURNAL)) fs.unlinkSync(JOURNAL);
  }
  console.log('\n' + MUTATIONS.length + ' mutations · ' + conformes + ' conformes · ' + trous + ' trou(s)');
  if (trous) process.exit(1);
  console.log('\nPASS falsifier-insertion-page-cible');
})();
