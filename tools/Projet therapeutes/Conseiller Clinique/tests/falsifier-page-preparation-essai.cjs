// FALSIFICATION DU CONTRÔLE DE LA PAGE D'ESSAI (lot 2C).
//
// Trois mutations, une par promesse de la page :
//   (a) poser le relais AVANT d'ouvrir le Studio — c'est sa raison d'être : par la console, le
//       Studio démarrait d'abord et appelait le vrai Worker deux fois ;
//   (b) charger la présentation d'essai ;
//   (c) n'accorder AUCUN droit d'écriture.
// Rien ne sort de la machine : le contrôle coupe le réseau tout en comptant les hôtes visés.
//
//   NODE_PATH=<playwright> node tests/falsifier-page-preparation-essai.cjs [--reprendre]
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const FICHIERS = { essai: path.join(RACINE, 'tests', 'preparer-essai.html') };
const JOURNAL = path.join(RACINE, 'banc-chutier', 'journal-de-reprise-page-essai.json');
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
    nom: '(b) la presentation d’essai n’est plus chargee',
    fichier: 'essai',
    de: "      var reponse = await fetch('tests/fixture-page-generee.json', { cache: 'no-store' });",
    vers: "      var reponse = { ok: true, json: function () { return {}; } };",
    attendu: 'le bouton n’ouvre plus rien : ni cinq diapositives, ni gestes de page',
  },
  {
    nom: '(a) le relais n’est plus pose AVANT d’ouvrir le Studio',
    fichier: 'essai',
    de: "      localStorage.setItem('workerUrl', location.origin);",
    vers: "      localStorage.removeItem('workerUrl');",
    attendu: 'le Studio repart vers son adresse par defaut : le Worker reapparait parmi les hotes vises — c’est exactement le defaut que cette page corrige',
  },
  {
    nom: '(c) l’essai recupere le droit d’ecrire',
    fichier: 'essai',
    de: "        _adocCapabilities: { workspace: true, persist: false, fineCitations: true,",
    vers: "        _adocCapabilities: { workspace: true, persist: true, fineCitations: true,",
    attendu: 'persist: true rouvre adocWsSave et adocWsSaveAs, donc l’ecriture vers la base',
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
        execFileSync(process.execPath, [path.join(__dirname, 'verify-page-preparation-essai.cjs')],
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
  console.log('\nPASS falsifier-page-preparation-essai');
})();
