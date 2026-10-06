// FALSIFICATION DES CONTRÔLES DU CHUTIER VISUEL (lot 2).
//
// Un test qui passe ne prouve rien tant qu'on n'a pas montré qu'il échoue quand il le doit.
// Chaque mutation ci-dessous retire exactement UN contrôle du moteur, relance le test, et exige
// qu'il ÉCHOUE. Les deux fichiers sont restaurés après chaque essai et leurs empreintes vérifiées
// à la fin : rien de ces mutations ne doit survivre.
//
//   NODE_PATH=<playwright> node tests/falsifier-atelier-images.cjs
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const FICHIERS = {
  moteur: path.join(RACINE, 'atelier-images.js'),
  cœur: path.join(RACINE, 'studio-clinique-core.js'),
};
const original = {};
const empreinteAvant = {};
Object.keys(FICHIERS).forEach(function (k) {
  original[k] = fs.readFileSync(FICHIERS[k], 'utf8');
  empreinteAvant[k] = crypto.createHash('sha256').update(original[k]).digest('hex');
});

const ESSAIS = [
  { nom: 'le mode capture n\'arrête plus l\'animation de nombre',
    fichier: 'cœur',
    de: '    if (window._adocPresentModeCapture) return;\n',
    vers: '',
    attendu: 'une capture part sur une valeur intermédiaire' },

  { nom: 'la scène perd la classe du lecteur, donc sa taille',
    fichier: 'moteur',
    de: "    outer.className = 'cc-ws-present-slide-outer';",
    vers: "    outer.className = '';",
    attendu: 'la scène ne mesure plus 1422x800 et la capture est refusée' },

  // MUTATION D'ABORD ESSAYÉE, PUIS ÉCARTÉE parce qu'elle est ÉQUIVALENTE : remplacer
  // `ctx.drawImage(source, 0, 0, SORTIE.largeur, cibleH)` par un dessin aux dimensions de la
  // source ne change rien, parce qu'à l'échelle 1920/1422 la source tombe DÉJÀ sur 1920×1080
  // (1422 × 1,350210… = 1920 exactement, 800 × 1,350210… = 1080,17 → 1080). Le dessin forcé est
  // une garantie, pas une correction : il tient le jour où l'échelle ou la scène changerait
  // d'un cheveu. Ce n'était donc pas un trou du test, et c'est écrit ici plutôt que tu.
  // La mutation retenue porte sur ce qui EST observable : la taille du canvas de sortie.
  { nom: 'le canvas de sortie est créé à la taille de la scène',
    fichier: 'moteur',
    de: '      sortie.width = SORTIE.largeur; sortie.height = cibleH;',
    vers: '      sortie.width = SCENE.largeur; sortie.height = SCENE.hauteur;',
    attendu: 'les images ne font plus 1920 de large' },

  { nom: 'la signature ne couvre plus le contenu de la carte',
    fichier: 'moteur',
    de: '      carte: carte, rang: etape.rang, surRang: etape.surRang,',
    vers: '      rang: etape.rang, surRang: etape.surRang,',
    attendu: 'un texte modifié ne périme plus son image' },

  { nom: 'la signature ne couvre que les blocs VISIBLES de la carte',
    fichier: 'moteur',
    de: '      carte: carte, rang: etape.rang, surRang: etape.surRang,',
    vers: '      carte: Object.assign({}, carte, { content: Object.assign({}, carte.content, { blocks: (carte.content.blocks || []).slice(0, etape.rang) }) }), rang: etape.rang, surRang: etape.surRang,',
    attendu: 'un bloc ajouté en fin de carte ne périme plus l\'étape 1, alors qu\'il en déplace la mise en page' },

  { nom: 'le décodage ne libère plus l\'image précédente',
    fichier: 'moteur',
    de: '  async function decoder(im) {\n    libererDecodee();',
    vers: '  async function decoder(im) {',
    attendu: 'plus d\'une image décodée en même temps' },

  { nom: 'le débordement n\'est plus mesuré',
    fichier: 'moteur',
    de: '    return Math.max(SCENE.hauteur, h);',
    vers: '    return SCENE.hauteur;',
    attendu: 'le questionnaire n\'est plus capturé sur toute sa hauteur' },

];

function lancer() {
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'verify-atelier-images.cjs')],
      { stdio: 'pipe', encoding: 'utf8', env: process.env });
    return { echoue: false, sortie: '' };
  } catch (e) {
    const tout = String((e.stdout || '') + (e.stderr || ''));
    return { echoue: true, sortie: (tout.split('\n').filter(function (l) { return l.startsWith('FAIL'); })[0] || '').slice(0, 150) };
  }
}

let tenus = 0, applicables = 0;
try {
  const temoin = lancer();
  if (temoin.echoue) { console.error('ARRÊT — le test échoue AVANT toute mutation : ' + temoin.sortie); process.exit(1); }
  console.log('témoin : le test passe sur les sources intactes.\n');

  for (const essai of ESSAIS) {
    const src = original[essai.fichier];
    const n = src.split(essai.de).length - 1;
    if (n !== 1) { console.error('ARRÊT — ancre trouvée ' + n + ' fois : ' + essai.nom); process.exit(1); }
    fs.writeFileSync(FICHIERS[essai.fichier], src.replace(essai.de, essai.vers), 'utf8');
    const r = lancer();
    fs.writeFileSync(FICHIERS[essai.fichier], src, 'utf8');
    applicables++;
    if (r.echoue) { tenus++; console.log('TENU   ' + essai.nom + '\n       → ' + r.sortie); }
    else console.log('MANQUÉ ' + essai.nom + ' — le test est passé malgré la mutation (' + essai.attendu + ')');
  }
} finally {
  Object.keys(FICHIERS).forEach(function (k) { fs.writeFileSync(FICHIERS[k], original[k], 'utf8'); });
}

let intact = true;
Object.keys(FICHIERS).forEach(function (k) {
  const apres = crypto.createHash('sha256').update(fs.readFileSync(FICHIERS[k], 'utf8')).digest('hex');
  if (apres !== empreinteAvant[k]) { intact = false; console.log('ÉCART sur ' + k + ' : ' + apres); }
});
console.log('\nsources restaurées : ' + (intact ? 'empreintes identiques' : 'ÉCART'));
console.log(tenus === applicables && intact
  ? 'PASS falsifier-atelier-images — ' + tenus + '/' + applicables + ' mutations détectées.'
  : 'FAIL falsifier-atelier-images — ' + tenus + '/' + applicables);
process.exit(tenus === applicables && intact ? 0 : 1);
