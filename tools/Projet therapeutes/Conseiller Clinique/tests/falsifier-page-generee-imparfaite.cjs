// FALSIFICATION DES CONTRÔLES DE LA PAGE IMPARFAITE (lot 2C, D2).
//
// Quatre mutations, chacune remettant une part du défaut réel du 19 octobre : un champ omis par
// le modèle devenait une valeur VIDE, la page invalide s'affichait en cases vides, et
// l'insertion faisait refuser l'affichage du document.
//
//   NODE_PATH=<playwright> node tests/falsifier-page-generee-imparfaite.cjs [--reprendre]
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const FICHIERS = { coeur: path.join(RACINE, 'studio-clinique-core.js') };
const JOURNAL = path.join(RACINE, 'banc-chutier', 'journal-de-reprise-imparfaite.json');
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
    nom: 'la page n’est plus jugee AVANT l’apercu',
    fichier: 'coeur',
    de: "      const refus = adocPageNeuveRefus(doc, ps.index, candidate);",
    vers: "      const refus = null;",
    attendu: 'une page invalide atteint de nouveau l’apercu : les cases vides du 19 octobre reviennent',
  },
  {
    nom: 'la page n’est plus rejugee AVANT l’insertion',
    fichier: 'coeur',
    de: "    const refusTardif = adocPageNeuveRefus(doc, ps.index, ps.page);",
    vers: "    const refusTardif = null;",
    attendu: 'une page devenue invalide apres l’apercu entre dans le document',
  },
  {
    nom: 'la validation dit toujours oui',
    fichier: 'coeur',
    de: "    if (bilan.valid && !bilan.skipped) return null;",
    vers: "    if (true) return null;",
    attendu: 'le seul mecanisme qui juge la page cesse de juger',
  },
  {
    nom: 'le brut n’est plus conserve',
    fichier: 'coeur',
    de: "    window._adocDernierBrutPageNeuve = { recuLe: new Date().toISOString(), brut: toolUse.input };",
    vers: "    window._adocDernierBrutPageNeuve = null;",
    attendu: 'la reponse du modele disparait des qu’elle est refusee — c’est justement la qu’on en a besoin',
  },
  {
    nom: 'le brut est ecrit dans localStorage',
    fichier: 'coeur',
    de: "    window._adocDernierBrutPageNeuve = { recuLe: new Date().toISOString(), brut: toolUse.input };",
    vers: "    window._adocDernierBrutPageNeuve = { recuLe: new Date().toISOString(), brut: toolUse.input };\n    try { localStorage.setItem('brut-page-neuve', JSON.stringify(toolUse.input)); } catch (e) {}",
    attendu: 'le brut quitte la memoire pour le disque du navigateur : interdit',
  },
  {
    nom: 'une page sans aucun bloc redevient acceptable',
    fichier: 'coeur',
    de: "      if (!blocs.length) throw adocPageIncomplete('la page ne contient aucun bloc');",
    vers: "      if (false) throw adocPageIncomplete('x');",
    attendu: 'le schema accepte une diapositive vide : ce garde-la est le seul a la refuser',
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
        execFileSync(process.execPath, [path.join(__dirname, 'verify-page-generee-imparfaite.cjs')],
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
  console.log('\nPASS falsifier-page-generee-imparfaite');
})();
