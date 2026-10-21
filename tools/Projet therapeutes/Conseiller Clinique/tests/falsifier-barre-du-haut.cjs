// FALSIFICATION DU CONTRAT Q6 : géométrie, menu, clavier et visibilité conditionnelle.
// Journal de reprise écrit AVANT la première mutation : un gestionnaire de signal ne s'exécute
// pas pendant un `execFileSync`, et jamais sur SIGKILL.
//
//   NODE_PATH=<playwright> node tests/falsifier-barre-du-haut.cjs [--reprendre]
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const FICHIERS = { page: path.join(RACINE, 'studio-clinique.html'),
                   coeur: path.join(RACINE, 'studio-clinique-core.js') };
const JOURNAL = path.join(RACINE, 'banc-chutier', 'journal-de-reprise-barre.json');
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
    nom: 'l\'espacement force plusieurs rangées à 1 272 px',
    fichier: 'page',
    de: '      display: flex; align-items: center; gap: 14px;',
    vers: '      display: flex; align-items: center; gap: 300px;',
    attendu: 'le contrôle mesure le débordement et le nombre de rangées',
  },
  {
    nom: 'le menu fermé expose ses actions',
    fichier: 'page',
    de: '    .cc-ws-menu-items[hidden] { display: none; }',
    vers: '    .cc-ws-menu-items[hidden] { display: flex; }',
    attendu: 'une action d\'export ne doit pas être visible avant ouverture',
  },
  {
    nom: 'l\'ouverture du menu ne révèle plus les gestes',
    fichier: 'coeur',
    de: '    parts.menu.hidden = false;',
    vers: '    parts.menu.hidden = true;',
    attendu: 'le clic sur Exporter doit révéler son action d\'export',
  },
  {
    nom: 'Échap ne protège plus la fenêtre de travail',
    fichier: 'coeur',
    de: 'event.preventDefault(); event.stopImmediatePropagation(); adocWsMenuClose(true);',
    vers: 'event.preventDefault(); adocWsMenuClose(true);',
    attendu: 'Échap doit fermer le menu et rendre le focus sans fermer le document',
  },
  {
    nom: 'Échap sur un menu déjà fermé ne ferme plus le document',
    fichier: 'coeur',
    de: '      if (parts.menu.hidden) return;\n      event.preventDefault();',
    vers: '      event.preventDefault();',
    attendu: 'un menu fermé ne doit pas intercepter le raccourci global de fermeture',
  },
  {
    nom: 'Supprimer disparaît même pour un document sauvegardé',
    fichier: 'coeur',
    de: '    if (deleteBtn) deleteBtn.hidden = !saved;',
    vers: '    if (deleteBtn) deleteBtn.hidden = true;',
    attendu: 'la visibilité conditionnelle doit être mesurée dans le menu Fichier',
  },
  {
    nom: 'l’icône des sources disparaît sur grand écran',
    fichier: 'page',
    de: '    @media (min-width: 769px) { .cc-ws-panel.collapsed { display: none; } }',
    vers: '    @media (min-width: 769px) { .cc-ws-panel-toggle { display: none; } }',
    attendu: 'le contrôle garde visible le panneau et son bouton sur grand écran',
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
        execFileSync(process.execPath, [path.join(__dirname, 'verify-barre-du-haut.cjs')],
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
  console.log('\nPASS falsifier-barre-du-haut');
})();
