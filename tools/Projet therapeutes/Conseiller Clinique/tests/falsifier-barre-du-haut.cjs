// FALSIFICATION DU CONTRÔLE DE LA BARRE DU HAUT (lot 2C, 2.2 bis).
//
// Deux mutations, chacune remettant un des deux défauts constatés sur la capture de Christophe.
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
    nom: 'la barre déborde de nouveau : le retour à la ligne est retiré',
    fichier: 'page',
    de: '      flex-wrap: wrap; row-gap: 6px;',
    vers: '      void: 0;',
    attendu: 'c\'est le défaut même : le dernier bouton était coupé à droite sur la capture',
  },
  {
    nom: 'les espacements desserrés : la barre repasse au-dessus de 80 px',
    fichier: 'page',
    de: '      flex-shrink: 0; background: var(--petrol-950); color: #fff; padding: 8px 20px;',
    vers: '      flex-shrink: 0; background: var(--petrol-950); color: #fff; padding: 12px 20px;',
    attendu: '8 + 28 + 6 + 28 + 8 = 78 px ; avec 12 px de marge, 86 px, au-delà de la cible',
  },
  {
    // Celle-ci n'attaque pas la barre : elle attaque la COUVERTURE du contrôle. Le contrôle
    // a longtemps cru mesurer l'état enregistré alors qu'il n'avait fait que réécrire un
    // libellé, et « Supprimer » restait caché — la barre la plus chargée n'était jamais vue.
    // Si l'on peut empêcher « Supprimer » de paraître sans que le contrôle bronche, c'est que
    // sa précondition ne tient rien et que le trou est revenu.
    nom: 'la barre la plus chargée redevient invisible : « Supprimer » ne paraît plus',
    fichier: 'coeur',
    de: '    if (deleteBtn) deleteBtn.hidden = !saved;',
    vers: '    if (deleteBtn) deleteBtn.hidden = true;',
    attendu: 'la précondition de l\'état enregistré tombe : le contrôle refuse de mesurer un état qui n\'est pas celui qu\'il annonce',
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
