// FALSIFICATION DU CONTRÔLE DE L'ORDRE DES POLICES (lot 2D-a, Q3).
//
// Deux mutations : l'ancien ordre remis, et le tri alphabétique cassé. Le contrôle doit tomber
// à chaque fois — sinon il ne mesurait pas l'ordre.
//
//   NODE_PATH=<playwright> node tests/falsifier-ordre-polices.cjs [--reprendre]
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const FICHIERS = { page: path.join(RACINE, 'studio-clinique.html'),
                   coeur: path.join(RACINE, 'studio-clinique-core.js') };
const JOURNAL = path.join(RACINE, 'banc-chutier', 'journal-de-reprise-polices.json');
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
    nom: 'l’ancien ordre revient : l’ordinateur avant les chartes',
    fichier: 'coeur',
    de: "      if (autres.length) html += '<optgroup label=\"Polices des chartes et des paires\">' + autres.map(opt).join('') + '</optgroup>';\n      if (mac.length) html += '<optgroup label=\"Polices de cet ordinateur\">' + mac.map(opt).join('') + '</optgroup>';",
    vers: "      if (mac.length) html += '<optgroup label=\"Polices de cet ordinateur\">' + mac.map(opt).join('') + '</optgroup>';\n      if (autres.length) html += '<optgroup label=\"Polices des chartes et des paires\">' + autres.map(opt).join('') + '</optgroup>';",
    attendu: 'les 227 polices de l’ordinateur repoussent de nouveau celles de la charte hors de vue',
  },
  {
    nom: 'le tri alphabetique du groupe des chartes est casse',
    fichier: 'coeur',
    de: "      const autres = Array.from(families).filter(function (f) { return !macSet.has(f); })\n        .sort(function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });",
    vers: "      const autres = Array.from(families).filter(function (f) { return !macSet.has(f); })\n        .sort(function (a, b) { return b.toLowerCase().localeCompare(a.toLowerCase()); });",
    attendu: 'l’ordre DANS le groupe devait rester inchange : il ne l’est plus',
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
        execFileSync(process.execPath, [path.join(__dirname, 'verify-ordre-polices.cjs')],
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
  console.log('\nPASS falsifier-ordre-polices');
})();
