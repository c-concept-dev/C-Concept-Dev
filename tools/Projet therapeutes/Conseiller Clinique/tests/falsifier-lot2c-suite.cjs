// FALSIFICATION DES CONTRÔLES DE 2.4, 2.5 ET 2.6 (D3, D4, D5, D7).
//
// Six mutations, une par promesse. Chacune doit faire tomber le contrôle qui la couvre ; sinon
// la promesse n'était tenue que par le hasard de la fixture.
//
//   NODE_PATH=<playwright> node tests/falsifier-lot2c-suite.cjs [--reprendre]
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const FICHIERS = { coeur: path.join(RACINE, 'studio-clinique-core.js') };
const JOURNAL = path.join(RACINE, 'banc-chutier', 'journal-de-reprise-lot2c-suite.json');
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
    nom: 'D4 — la page est posee a la fin, plus a son rang',
    controle: 'verify-page-inseree-partout.cjs',
    fichier: 'coeur',
    de: "    doc.blocks.splice(ps.index, 0, carte);",
    vers: "    doc.blocks.splice(doc.blocks.length, 0, carte);",
    attendu: 'l’ordre est perdu : mode presentation, sommaire et export autonome le disent',
  },
  {
    nom: 'D5 — le retour en arriere survit a l’ecriture suivante',
    controle: 'verify-annuler-page.cjs',
    fichier: 'coeur',
    de: "    if (window.adocOublierAnnulationPage) window.adocOublierAnnulationPage();\n    const art=adocEditorArt();if(!art)return;",
    vers: "    const art=adocEditorArt();if(!art)return;",
    attendu: 'on pourrait revenir en arriere APRES avoir ecrit autre chose, et l’emporter',
  },
  {
    nom: 'D7 — les listes perdent leurs puces',
    controle: 'verify-texte-diapositives.cjs',
    fichier: 'coeur',
    de: "          return (c.ordered ? (i + 1) + '. ' : '— ') + String(x || '').trim(); }).filter(function (l) {",
    vers: "          return String(x || '').trim(); }).filter(function (l) {",
    attendu: 'une liste lue a voix haute ne se distingue plus d’un paragraphe',
  },
  {
    nom: 'D7 — le tableau n’est plus rendu ligne par ligne',
    controle: 'verify-texte-diapositives.cjs',
    fichier: 'coeur',
    de: "        (c.rows || []).forEach(function (r) { lignes.push((r || []).join(' | ')); });",
    vers: "        lignes.push((c.rows || []).map(function (r) { return (r || []).join(' '); }).join(' '));",
    attendu: 'les lignes se confondent en une seule',
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
        // Une mutation peut viser un AUTRE contrôle que celui par défaut : celle qui rouvre les
        // branches du schéma ne se voit que dans le contrôle du schéma. Sans cette ligne, elle
        // passait pour un trou — et c'en était un, dans le falsificateur.
        execFileSync(process.execPath, [path.join(__dirname, m.controle)],
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
  console.log('\nPASS falsifier-lot2c-suite');
})();
