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

  // La scène porte sa taille en style EN LIGNE depuis que le réglage de scène existe : retirer
  // la classe du lecteur ne la change plus, et cette mutation-là ne mesurait donc plus rien.
  // Elle vise maintenant ce qui fixe réellement la taille.
  // Réduire la seule `width` ne suffit pas : `min-width` l'emporte, et la scène garde sa taille.
  // C'est une bonne propriété du montage, et c'est aussi ce qui rendait la mutation aveugle. Elle
  // réduit donc les deux, comme le ferait une vraie erreur de calcul de scène.
  { nom: 'la scène est montée dix pixels trop étroite',
    fichier: 'moteur',
    de: "    outer.style.cssText = 'width:' + scene.largeur + 'px;height:' + scene.hauteur + 'px;'\n      + 'min-width:' + scene.largeur + 'px;min-height:' + scene.hauteur + 'px;flex:0 0 auto;';",
    vers: "    outer.style.cssText = 'width:' + (scene.largeur - 10) + 'px;height:' + scene.hauteur + 'px;'\n      + 'min-width:' + (scene.largeur - 10) + 'px;min-height:' + scene.hauteur + 'px;flex:0 0 auto;';",
    attendu: 'la scène ne mesure plus la taille demandée et la capture est refusée' },

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
    de: '    return Math.max(attendue.hauteur, h);',
    vers: '    return attendue.hauteur;',
    attendu: 'le questionnaire n\'est plus capturé sur toute sa hauteur' },


  // ── Lot 2, suite : ce que la capture retire, et l'étanchéité de la couche ────────────────
  { nom: 'la loupe d\'agrandissement reste visible dans la capture',
    fichier: 'moteur',
    de: "    '[data-atelier-capture] .adoc-sc-image-zoom-badge{display:none;}' +\n",
    vers: '',
    attendu: 'une loupe apparaît sur une image de vidéo' },

  { nom: 'la carte garde sa bordure et son rayon dans la capture',
    fichier: 'moteur',
    de: "    '[data-atelier-capture] .adoc-sc-card{border:0;border-radius:0;box-shadow:none;}' +\n",
    vers: '',
    attendu: 'un rectangle à coins arrondis au bord du cadre' },

  { nom: '« Voir mon résultat » reste dans la capture',
    fichier: 'moteur',
    de: "    '[data-atelier-capture] .adoc-sc-questionnaire-submit{display:none;}' +\n",
    vers: '',
    attendu: 'un bouton qu\'on ne peut pas cliquer' },

  { nom: 'les barèmes (+0, +1…) restent dans la capture',
    fichier: 'moteur',
    de: "    '[data-atelier-capture] .adoc-sc-questionnaire-option-points{display:none;}' +\n",
    vers: '',
    attendu: 'un barème interactif rastérisé' },

  { nom: 'la couche de capture n\'est plus portée par sa marque',
    fichier: 'moteur',
    de: "  var CSS_CAPTURE =\n    '[data-atelier-capture] ",
    vers: "  var CSS_CAPTURE =\n    '",
    attendu: 'la première règle déborde sur le lecteur et sur tous les exports' },

  { nom: 'l\'échelle typographique ne fait plus rien',
    fichier: 'moteur',
    de: '    if (!facteur || facteur === 1) return 0;',
    vers: '    if (true) return 0;',
    attendu: 'le réglage (c) rend exactement les mêmes images que (a)' },

  { nom: 'l\'échelle typographique est appliquée plusieurs fois au même élément',
    fichier: 'moteur',
    de: "      if (el.hasAttribute && el.hasAttribute('data-atelier-typo')) continue;   // jamais deux fois",
    vers: '      if (false) continue;',
    attendu: 'les étapes suivantes voient leur texte multiplié deux fois' },


  // ── Lot 2, suite du 6 octobre : mode vidéo par défaut et politique de débordement ────────
  { nom: 'le défaut retombe sur la scène du lecteur',
    fichier: 'moteur',
    de: "    var base = (options && options.mode === 'fidele') ? MODE_FIDELE : MODE_VIDEO;",
    vers: "    var base = MODE_FIDELE;",
    attendu: 'le mode vidéo n\'est plus le défaut décidé le 6 octobre' },

  { nom: 'la zone morte disparaît',
    fichier: 'moteur',
    de: '    if (rapport <= tolerance) {',
    vers: '    if (hauteurContenu <= hauteurCadre) {',
    attendu: 'six pixels de bruit de mise en page deviennent un débordement à faire défiler' },

  { nom: 'le seuil de scission n\'est plus réglable',
    fichier: 'moteur',
    de: '    var seuil = o.seuil || SEUIL_SCISSION;',
    vers: '    var seuil = SEUIL_SCISSION;',
    attendu: 'un seuil passé en option est ignoré' },

  { nom: 'la durée connue ne l\'emporte plus sur le rapport',
    fichier: 'moteur',
    de: '    if (o.dureeS > 0 && o.echelleSortie > 0) {',
    vers: '    if (false) {',
    attendu: 'une étape courte et une étape longue reçoivent le même verdict' },

  { nom: 'une image sous tolérance est capturée à sa hauteur débordante',
    fichier: 'moteur',
    de: "          var hauteurCapture = (deb.verdict === 'aucun') ? scene.hauteur : hauteurNecessaire;",
    vers: '          var hauteurCapture = hauteurNecessaire;',
    attendu: 'des images de 1092 px déclarées sans débordement' },
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
