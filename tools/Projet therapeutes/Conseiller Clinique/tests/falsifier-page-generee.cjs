// FALSIFICATION DES CONTRÔLES DE LA PAGE CRÉÉE PAR LE STUDIO (lot 2C, 2.3 — D2).
//
// Cinq mutations, une par promesse de D2. Le contrôle visé est celui des BRANCHES, qui couvre
// le champ vide, l'échec, « Refaire » et « Abandonner » ; la mutation du double clic vise le
// contrôle du chemin heureux, qui est le seul à le mettre à l'épreuve.
//
//   NODE_PATH=<playwright> node tests/falsifier-page-generee.cjs [--reprendre]
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const FICHIERS = { page: path.join(RACINE, 'studio-clinique.html'),
                   coeur: path.join(RACINE, 'studio-clinique-core.js') };
const JOURNAL = path.join(RACINE, 'banc-chutier', 'journal-de-reprise-page-generee.json');
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
    nom: 'le schéma de la page neuve n’est plus déclaré strict',
    controle: 'verify-schema-nouvelle-page.cjs',
    fichier: 'coeur',
    de: "    strict: true,\n    input_schema: {\n      type: 'object',\n      additionalProperties: false,\n      required: ['title', 'blocks'],",
    vers: "    input_schema: {\n      type: 'object',\n      additionalProperties: false,\n      required: ['title', 'blocks'],",
    attendu: 'le « strict » demandé pour D2 disparaît sans que rien ne proteste',
  },
  {
    // Le septième schéma doit rester extractible par le test de fumée réel, qui ne connaît que
    // `const `. Si cette déclaration repasse à `var`, rien ne casse localement — sauf ceci.
    nom: 'le schéma de la page neuve redevient introuvable pour le test de fumée',
    controle: 'verify-schema-nouvelle-page.cjs',
    fichier: 'coeur',
    de: '  const ADOC_NEW_SLIDE_TOOL = {',
    vers: '  var ADOC_NEW_SLIDE_TOOL = {',
    attendu: 'le test de fumée réel échouerait sur l’extraction, pas sur un verdict d’Anthropic',
  },
  {
    nom: 'le Studio ne regarde plus les diapositives voisines',
    fichier: 'coeur',
    de: "      out.push((c.content.title || '(sans titre)') + ' : ' + textes.join(' ').slice(0, 300));",
    vers: "      out.push('');",
    attendu: '« proposer d’après les voisines » redevient un mot : leur texte ne part plus',
  },
  {
    nom: 'la consigne « aucune référence bibliographique » disparaît du prompt',
    fichier: 'coeur',
    de: "    lignes.push('N’ajoute AUCUNE référence bibliographique, aucun renvoi de citation, aucun nom '",
    vers: "    lignes.push('' + ((0) ? 'N’ajoute AUCUNE référence bibliographique, aucun renvoi de citation, aucun nom ' : '')",
    attendu: 'le modèle n’est plus tenu d’éviter les références inventées',
  },
  {
    nom: 'un appel en échec laisse quand même entrer une page',
    fichier: 'coeur',
    de: "      ps.page = null;\n      ps.enCours = false;",
    vers: "      ps.page = { title: 'Page de secours', blocks: [{ type: 'paragraph', content: { text: 'x' } }] };\n      ps.enCours = false;",
    attendu: 'la promesse « rien n’est inséré si l’appel échoue » tombe',
  },
  {
    nom: '« Abandonner » n’oublie plus la page en attente',
    fichier: 'coeur',
    de: "  window.adocCancelNewSlide = function () {\n    window._adocPageInsertState = null;",
    vers: "  window.adocCancelNewSlide = function () {\n    if (false) window._adocPageInsertState = null;",
    attendu: 'la page abandonnée reste armée et pourrait entrer plus tard',
  },
  {
    // Celle-ci vise l'autre contrôle : lui seul double-clique.
    nom: 'la garde du double clic saute : deux pages peuvent entrer',
    controle: 'verify-page-generee.cjs',
    fichier: 'coeur',
    de: "    if (!ps || !ps.page || ps.enCours || ps.posee) return;   // double clic : jamais deux pages",
    vers: "    if (!ps || !ps.page) return;",
    attendu: 'un double clic sur « Insérer » pose deux fois la même page',
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
        execFileSync(process.execPath, [path.join(__dirname, m.controle || 'verify-page-generee-branches.cjs')],
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
  console.log('\nPASS falsifier-page-generee');
})();
