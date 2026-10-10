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
  // La page du banc est une source comme une autre : c'est elle qui portait le défaut que
  // Christophe a trouvé — elle annonçait le mode vidéo et rendait le mode fidèle.
  banc: path.join(RACINE, 'tests', 'forger-banc-chutier.cjs'),
  // L'application elle-même : c'est elle qui porte la porte locale du 8 octobre.
  appli: path.join(RACINE, 'studio-clinique.html'),
};
const original = {};
const empreinteAvant = {};
Object.keys(FICHIERS).forEach(function (k) {
  original[k] = fs.readFileSync(FICHIERS[k], 'utf8');
  empreinteAvant[k] = crypto.createHash('sha256').update(original[k]).digest('hex');
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LES SOURCES SONT RESTAURÉES MÊME SI CE SCRIPT EST TUÉ
// ══════════════════════════════════════════════════════════════════════════════════════════════
// LE DÉFAUT QUE CECI CORRIGE, et il m'est arrivé deux fois le 9 octobre. Un `finally` ne protège
// que des erreurs : interrompu par un signal, le processus meurt AVANT lui, et la mutation en
// cours reste dans le fichier. La première fois, une règle de capture est restée retirée du
// moteur ; la seconde, c'est la borne de vitesse du travelling qui est restée désarmée. Dans les
// deux cas le dépôt portait un défaut que personne n'avait écrit, et seul le contrôle des ancres
// l'a vu.
//
// POURQUOI `process.on('exit')` NE SUFFIT PAS : il ne se déclenche pas sur SIGTERM ni sur SIGINT
// (Node tue le processus sans passer par là, sauf si un gestionnaire est posé). Les deux sont donc
// nécessaires : les signaux pour la mort demandée, `exit` pour toute sortie restante, et
// `uncaughtException` pour celle qu'on n'a pas vue venir. Chacun passe par `restaurer()`, qui est
// idempotent et SYNCHRONE — un `exit` n'attend aucune promesse.
//
// Le délai, lui, est là pour la machine qui ne répond plus : au-delà, le script se restaure et
// s'arrête de lui-même plutôt que de tenir les sources en otage.
const DELAI_MAX_MS = Number(process.env.FALSIFIER_DELAI_MS || 3 * 60 * 60 * 1000);

// LE JOURNAL DE REPRISE, et c'est LUI la garantie — pas les gestionnaires de signaux.
//
// Mesuré : un gestionnaire de signal ne peut pas s'exécuter pendant que `execFileSync` bloque la
// boucle d'événements, c'est-à-dire pendant toute la durée du test qu'une mutation éprouve —
// une cinquantaine de secondes. Un SIGTERM envoyé à ce moment-là n'est honoré qu'à la fin du
// test en cours, et un SIGKILL ne l'est JAMAIS : aucun code ne s'exécute après lui.
//
// Les sources sont donc recopiées dans un journal AVANT la première mutation, et tout
// démarrage ultérieur commence par remettre en état ce qu'il y trouve. Cela couvre le signal,
// le plantage, la coupure de courant et la fenêtre fermée. Le journal vit dans banc-chutier/,
// ignoré par git : il contient du code source, il n'a rien à faire dans un dépôt public.
const JOURNAL = path.join(RACINE, 'banc-chutier', '.falsifieur-en-cours.json');
function ecrireJournal() {
  try {
    fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
    fs.writeFileSync(JOURNAL, JSON.stringify({ quand: new Date().toISOString(),
      fichiers: FICHIERS, contenus: original }), 'utf8');
  } catch (e) { console.error('ATTENTION — journal de reprise non écrit : ' + e.message); }
}
function effacerJournal() { try { fs.unlinkSync(JOURNAL); } catch (e) {} }
function reprendreJournal(bavard) {
  if (!fs.existsSync(JOURNAL)) return 0;
  let remises = 0;
  try {
    const j = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
    Object.keys(j.fichiers || {}).forEach(function (k) {
      const chemin = j.fichiers[k];
      const attendu = (j.contenus || {})[k];
      if (typeof attendu !== 'string') return;
      if (fs.readFileSync(chemin, 'utf8') !== attendu) {
        fs.writeFileSync(chemin, attendu, 'utf8');
        remises++;
        if (bavard) console.log('REPRISE — ' + k + ' remis dans l\'état du ' + j.quand);
      }
    });
  } catch (e) { console.error('ATTENTION — journal de reprise illisible : ' + e.message); }
  effacerJournal();
  return remises;
}

// REPRISE AU DÉMARRAGE, avant même de lire les sources : une exécution précédente a pu mourir
// une mutation en place, et l'empreinte « avant » serait alors celle du code muté.
const reprises = reprendreJournal(true);
if (reprises) {
  console.log('REPRISE — ' + reprises + ' fichier(s) remis en état après une exécution interrompue.\n');
  Object.keys(FICHIERS).forEach(function (k) {
    original[k] = fs.readFileSync(FICHIERS[k], 'utf8');
    empreinteAvant[k] = crypto.createHash('sha256').update(original[k]).digest('hex');
  });
}
// `--reprise-seule` ne fait que cela, et s'arrête : c'est ce qu'un contrôle appelle après avoir
// tué le falsifieur pour vérifier que le dépôt se retrouve intact.
if (process.argv.indexOf('--reprise-seule') !== -1) {
  console.log('reprise seule : ' + reprises + ' fichier(s) remis en état.');
  process.exit(0);
}

let restaure = false;
function restaurer(motif) {
  if (restaure) return;
  restaure = true;
  effacerJournal();
  let remises = 0;
  Object.keys(FICHIERS).forEach(function (k) {
    try {
      if (fs.readFileSync(FICHIERS[k], 'utf8') !== original[k]) {
        fs.writeFileSync(FICHIERS[k], original[k], 'utf8');
        remises++;
      }
    } catch (e) { /* un fichier illisible ne doit pas empêcher de restaurer les autres */ }
  });
  if (motif) {
    process.stderr.write('\nINTERROMPU (' + motif + ') — sources restaurées'
      + (remises ? ' : ' + remises + ' fichier(s) remis en état.' : ' (rien n\'était muté).') + '\n');
  }
}
['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'].forEach(function (sig) {
  process.on(sig, function () { restaurer(sig); process.exit(130); });
});
process.on('uncaughtException', function (e) {
  restaurer('exception : ' + (e && e.message)); process.exit(1);
});
process.on('unhandledRejection', function (e) {
  restaurer('promesse rejetée : ' + (e && e.message)); process.exit(1);
});
process.on('exit', function () { restaurer(null); });
const minuteur = setTimeout(function () {
  restaurer('délai de ' + Math.round(DELAI_MAX_MS / 60000) + ' min dépassé');
  process.exit(1);
}, DELAI_MAX_MS);
minuteur.unref();

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

  // L'ancienne ancre (`return Math.max(attendue.hauteur, h)` dans `mesurerHauteurDepliee`) a
  // disparu avec la correction de la troncature : la mesure de hauteur est devenue une fonction
  // à part. La mutation vise donc cette fonction, qui est l'endroit où le débordement se mesure
  // désormais. Ce n'est pas un assouplissement : neutraliser `hauteurContenu` prive le moteur de
  // TOUTE connaissance du débordement, ce que l'ancienne mutation ne faisait qu'en partie.
  { nom: 'le débordement n\'est plus mesuré',
    fichier: 'moteur',
    de: '    return Math.ceil(h);\n  }',
    vers: '    return 0;\n  }',
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
  // ── La scène par diapositive, décision du 9 octobre ───────────────────────────────────────
  { nom: 'la scène redevient unique pour tout le document',
    fichier: 'moteur',
    de: "        if (o.sceneParDiapositive && iCarte !== choixCarte) {",
    vers: "        if (false) {",
    attendu: 'la même scène pour une couverture et un questionnaire' },

  { nom: 'le plancher de lisibilité ne borne plus la recherche',
    fichier: 'moteur',
    de: "    var hautBorne = Math.min(SCENE.largeur, largeurMaxLisible(taille, plancher));",
    vers: "    var hautBorne = SCENE.largeur;",
    attendu: 'un texte sous le plancher pour faire tenir une diapositive dense' },

  { nom: 'la recherche prend la plus GRANDE scène au lieu de la plus petite',
    fichier: 'moteur',
    de: "      if (r.tient) { meilleure = r; haut = milieu; } else { bas = milieu; }",
    vers: "      if (r.tient) { bas = milieu; } else { haut = milieu; }",
    attendu: 'le texte le plus petit possible au lieu du plus grand lisible' },

  { nom: 'la scène retenue n\'est pas reposée après la recherche',
    fichier: 'moteur',
    de: "    await redimensionnerScene(sc, meilleure.scene);\n    return { scene: meilleure.scene, taille_px: taille,",
    vers: "    return { scene: meilleure.scene, taille_px: taille,",
    attendu: 'le DOM et la valeur retenue divergent, et la capture est refusée' },

  // MUTATION ÉQUIVALENTE, CONSIGNÉE. Retirer `iCarte !== choixCarte` ne change RIEN d'observable,
  // et il faut le dire plutôt que de retirer la mutation de la liste :
  //   · le bloc est déjà sous `if (iCarte !== position.carte || rang < position.rang)`, qui n'est
  //     vrai qu'en entrant dans une carte — le rendu complet n'avance jamais autrement ;
  //   · et sur le seul autre chemin, un retour en arrière dans la même carte, le choix refait
  //     rend LA MÊME scène, parce que la révélation masque en `visibility:hidden` : les blocs
  //     pas encore révélés occupent déjà leur place et la carte a une seule hauteur (contrôle 24).
  // Ce garde est donc une ceinture, pas la garantie. La garantie est la prémisse, et c'est elle
  // que le contrôle 24 mesure ; la mutation ci-dessous, qui la casse, est celle qui mord.
  { nom: 'la scène change d\'une étape à l\'autre de la même diapositive',
    fichier: 'moteur',
    equivalente: 'le garde est redondant avec `iCarte !== position.carte` et avec la prémisse du '
      + 'contrôle 24 (une carte, une seule hauteur) : aucun chemin ne les sépare',
    de: "        if (o.sceneParDiapositive && iCarte !== choixCarte) {\n          await attendreStabilite(sc.inner, o.modeCapture);",
    vers: "        if (o.sceneParDiapositive) {\n          await attendreStabilite(sc.inner, o.modeCapture);",
    attendu: 'une diapositive dont les étapes n\'ont pas le même cadre' },

  // LA PRÉMISSE, elle, se falsifie : une hauteur de contenu qui ne compterait que les blocs
  // VISIBLES ferait de chaque étape une hauteur différente. La scène choisie sur l'étape 1
  // serait alors trop petite pour l'étape 4, et le dernier bloc se retrouverait coupé — le
  // défaut du 7 octobre, revenu par la porte d'à côté.
  { nom: 'la hauteur de contenu ne compte que les blocs déjà révélés',
    fichier: 'moteur',
    de: "    var h = Math.max(sc.inner.scrollHeight, carte ? carte.scrollHeight : 0);",
    vers: '    var h = 0;',
    attendu: 'une carte dont chaque étape a sa propre hauteur, donc sa propre scène' },

  { nom: 'le plafond de photo se combine en silence à la scène par diapositive',
    fichier: 'moteur',
    de: "    if (o.sceneParDiapositive && (o.plafondPhoto > 0 || o.blocCourantSeul)) {",
    vers: "    if (false) {",
    attendu: 'un plafond calculé sur une scène qui n\'est plus celle de la diapositive' },

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
    de: "      var hauteurCapture = (deb.verdict === 'aucun') ? scene.hauteur : hauteurNecessaire;",
    vers: '      var hauteurCapture = hauteurNecessaire;',
    attendu: 'des images de 1092 px déclarées sans débordement' },

  // ── Lot 2, suite du 7 octobre : relevés de Christophe sur sa présentation ────────────────
  { nom: 'la puce « Approfondir » reste visible dans la capture',
    fichier: 'moteur',
    de: "    '[data-atelier-capture] .adoc-sc-deepdive-chip{display:none;}' +\n",
    vers: '',
    attendu: 'un bouton d\'approfondissement dans une image de vidéo' },

  { nom: 'les citations sont masquées SANS qu\'on l\'ait demandé',
    fichier: 'moteur',
    de: "    '[data-atelier-capture][data-atelier-sans-citations] .adoc-sc-cite{display:none;}' +",
    vers: "    '[data-atelier-capture] .adoc-sc-cite{display:none;}' +",
    attendu: 'une décision prise à la place de Christophe, qui ne l\'a pas tranchée' },

  // ── LE TRAVELLING (9 octobre) ───────────────────────────────────────────────────────────────
  { nom: 'la pose des deux bouts disparaît du calcul',
    fichier: 'moteur',
    de: "    var pose = (typeof o.poseS === 'number') ? o.poseS : POSE_TRAVELLING_S;",
    vers: '    var pose = 0;',
    attendu: 'un travelling qui part au premier mot et s\'arrête au dernier' },

  { nom: 'le travelling ne borne plus sa vitesse',
    fichier: 'moteur',
    de: '             tenable: vitesse <= vitesseMax,',
    vers: '             tenable: true,',
    attendu: 'une diapositive qui défile trop vite pour être lue, déclarée tenable' },

  { nom: 'la borne de vitesse devient stricte',
    fichier: 'moteur',
    de: '    var vitesse = course / utile;',
    vers: '    var vitesse = course / utile + 0.01;',
    attendu: 'un travelling pile à la borne refusé par un centième de pixel' },

  { nom: 'la course du travelling est prise sur la scène, pas sur l\'image',
    fichier: 'moteur',
    de: "        travelling: planTravelling(Math.min(capture.hauteur, visibleSortie) - SORTIE.hauteur,",
    vers: "        travelling: planTravelling(stable.contenu - scene.hauteur,",
    attendu: 'un plan qui ne décrit pas l\'image livrée' },

  { nom: 'un commentaire plus court que les poses défile quand même',
    fichier: 'moteur',
    de: '    if (utile <= 0) {',
    vers: '    if (false) {',
    attendu: 'une vitesse négative, donc « sous la borne », donc tenable' },

  { nom: 'une vitesse est inventée quand la durée est inconnue',
    fichier: 'moteur',
    de: '    if (!(dureeS > 0)) {',
    vers: '    if (false) {',
    attendu: 'un plan qui se prononce sur une durée qu\'il ne connaît pas' },

  { nom: 'le verdict ne suit plus le plan de travelling',
    fichier: 'moteur',
    de: "      return { verdict: plan.tenable ? 'defilement' : 'scission',",
    vers: "      return { verdict: 'defilement',",
    attendu: 'un verdict et un plan qui se contredisent' },

  // LA CONTRADICTION MESURÉE SUR LA VRAIE PRÉSENTATION, remise en place telle qu'elle était :
  // le résumé lisait « à scinder » sur le seul plan, qui se taisait faute de durée, pendant que
  // la ligne des débordements tranchait sur le rapport. Quatre étapes d'un côté, zéro de l'autre.
  { nom: 'le résumé des travellings ne compte plus les scissions dites par le verdict',
    fichier: 'moteur',
    de: "          a_scinder: ims.filter(function (im) { return im.scission_conseillee; })",
    vers: "          a_scinder: avec.filter(function (im) { return im.travelling.tenable === false; })",
    attendu: 'un relevé qui dit « 4 à scinder » et « 0 à scinder » dans deux lignes voisines' },

  { nom: 'le conseil de scission ne suit plus le verdict',
    fichier: 'moteur',
    de: "        scission_conseillee: deb.verdict === 'scission',",
    vers: '        scission_conseillee: false,',
    attendu: 'une diapositive à scinder que rien ne signale' },

  // ── LE CORPS DE TEXTE ET L'ENCRE VISIBLE (9 octobre, après les trois questions) ──────────────
  { nom: 'la taille du texte inclut de nouveau les titres',
    fichier: 'moteur',
    de: "      if (!avecTitres && el.closest('.adoc-sc-heading')) return;",
    vers: '      if (false) return;',
    attendu: 'le titre mesuré à la place du corps, soit 1,5 fois trop' },

  { nom: 'l\'appareil de citation compte comme du texte à lire',
    fichier: 'moteur',
    de: "  var HORS_LECTURE = '.adoc-sc-card-title, .adoc-sc-cite, .adoc-sc-cite-flagged,'",
    vers: "  var HORS_LECTURE = '.rien-du-tout, .adoc-sc-card-title-absent,'",
    attendu: 'un appel de citation de 7,7 px traité comme du corps de texte' },

  { nom: 'les éléments masqués en display:none comptent dans la taille du texte',
    fichier: 'moteur',
    equivalente: 'tout ce que la capture masque en display:none est DÉJÀ nommé dans HORS_LECTURE '
      + '(barèmes, barème des profils, bouton de résultat, bande des deux partenaires) : le garde '
      + 'est aujourd\'hui redondant avec cette liste. Il reste parce qu\'une liste de noms ne '
      + 'restera pas exhaustive, et que la règle juste est « absent de l\'image, absent de la '
      + 'mesure » — pas « absent de la liste »',
    de: "      if (st.display === 'none') return;\n      var t = parseFloat(st.fontSize);",
    vers: '      var t = parseFloat(st.fontSize);',
    attendu: 'les barèmes de questionnaire, absents de l\'image, mesurés comme du texte' },

  { nom: 'un conteneur compte pour le texte de ses enfants',
    fichier: 'moteur',
    equivalente: 'dans ce lecteur, un conteneur et le span qui porte son texte ont la MÊME taille '
      + 'calculée (le span hérite). Compter les deux ne fait que dupliquer des valeurs identiques, '
      + 'ce qui ne déplace pas la médiane. Le garde reste parce qu\'il cesserait d\'être vrai dès '
      + 'qu\'un conteneur porterait une taille propre, et parce que la médiane suivrait alors la '
      + 'profondeur du balisage au lieu du texte',
    de: "      if (!propre) return;",
    vers: '      if (false) return;',
    attendu: 'une médiane qui suit la profondeur du balisage, pas le texte' },

  // L'ANCRE A DÛ ÊTRE REPRISE : elle ne portait que sur `visible`, alors que la course se calcule
  // sur `visibleSortie`. La mutation ne mutait donc rien d'observable et le falsifieur l'a
  // signalée MANQUÉE — à juste titre : ce n'était pas un trou dans les contrôles, c'était une
  // mutation mal écrite. Les deux lignes y passent maintenant.
  { nom: 'le bas de l\'encre est mesuré AVANT l\'agrandissement de la capture',
    fichier: 'moteur',
    de: '      var visible = capture.visible_scene;\n      var visibleSortie = capture.visible_sortie;',
    vers: '      var visible = hauteurVisible(sc);\n'
      + '      var visibleSortie = Math.round(visible * (SORTIE.largeur / scene.largeur));',
    attendu: 'un travelling qui s\'arrête avant l\'encadré final — 350 000 pixels oubliés' },

  { nom: 'le bas de l\'encre inclut les blocs pas encore révélés',
    fichier: 'moteur',
    de: "      if (st.display === 'none' || st.visibility === 'hidden') return;",
    vers: "      if (st.display === 'none') return;",
    attendu: 'un travelling qui parcourt du vide dès la première étape' },

  { nom: 'le résumé ne compte plus les étapes qui débordent sans rien à faire défiler',
    fichier: 'moteur',
    de: "          sans_course: ims.filter(function (im) { return im.debordement && !im.travelling; }).length,",
    vers: '          sans_course: 0,',
    attendu: 'un relevé qui annonce 4 débordements et 1 travelling sans expliquer l\'écart' },

  { nom: 'la page du banc ne nomme plus la taille du corps de texte',
    fichier: 'banc',
    test: 'verify-banc-reglage-defaut.cjs',
    de: "          + '  —  corps ' + x.taille_px + ' px, soit ' + x.texte_pc + ' % de la hauteur du cadre'",
    vers: "          + '  —  texte ' + x.texte_pc + ' %'",
    attendu: 'une colonne qui ne dit pas de quelle taille son pourcentage découle' },

  { nom: 'la page du banc ne dit plus les travellings',
    fichier: 'banc',
    test: 'verify-banc-reglage-defaut.cjs',
    de: "    ligne('travellings', trav.nombre === 0 ? 'aucun — toutes les images tiennent dans le cadre'",
    vers: "    if (false) ligne('travellings', trav.nombre === 0 ? 'aucun'",
    attendu: 'un travelling calculé que rien n\'affiche' },

  // LE DÉFAUT DU 7 OCTOBRE, remis en place sous sa forme actuelle : la page annonce un réglage
  // et en envoie un autre par-dessus. Elle dirait « SCÈNE PAR DIAPOSITIVE » et rendrait une
  // scène fixe — exactement ce que Christophe avait trouvé en mesurant ses propres images.
  { nom: 'la page du banc envoie son propre réglage par-dessus le défaut du moteur',
    fichier: 'banc',
    test: 'verify-banc-reglage-defaut.cjs',
    de: '    auto: {},',
    vers: "    auto: { mode: 'fidele' },",
    attendu: 'la page annonce la scène par diapositive et rend une scène fixe' },

  { nom: 'la page du banc n\'affiche plus le plancher de lisibilité',
    fichier: 'banc',
    test: 'verify-banc-reglage-defaut.cjs',
    de: "      ligne('plancher de lisibilité', res.plancher_lisibilite_pc + ' % de la hauteur du cadre');",
    vers: "      if (false) ligne('plancher', '');",
    attendu: 'un plancher appliqué que rien n\'affiche' },

  // LE DÉFAUT DU 7 OCTOBRE, remis en place tel qu'il était : une seule mesure, prise AVANT que
  // la scène ne soit agrandie. Le contrôle 15 doit le voir, et le voir par les PIXELS — parce
  // qu'avec cette mutation le moteur reste parfaitement cohérent avec lui-même : il annonce
  // 766 px de contenu pour 766 px de capture, et son propre refus l'accepte. C'est précisément
  // ce qui le rendait crédible.
  { nom: 'la hauteur est mesurée une seule fois, avant l\'agrandissement de la scène',
    fichier: 'moteur',
    de: '      var stable = await stabiliserHauteur(sc, scene);',
    vers: '      var stable = (function () { var c = hauteurContenu(sc); return { hauteur: Math.max(c, scene.hauteur),'
      + ' contenu: c, tours: 1, methode: \'sonde unique\', converge: true, hauteur_avant_stabilisation: c }; })();',
    attendu: 'le dernier bloc est coupé en bas de l\'image, et le moteur n\'en sait rien' },

  { nom: 'le refus d\'une image trop courte ne refuse plus rien',
    fichier: 'moteur',
    de: '    if (contenu <= Math.ceil(hauteurCapture * (tolerance || TOLERANCE_DEBORDEMENT))) return false;',
    vers: '    if (true) return false;',
    attendu: 'une image plus courte que son contenu serait livrée en silence' },

  // ── Les trois comportements ajoutés le 8 octobre ──────────────────────────────────────────
  // Le plafond du bandeau photo reste un POURCENTAGE : il grandit donc avec la carte, et ne
  // plafonne rien du tout. C'est l'erreur qu'il aurait été le plus naturel de commettre.
  { nom: 'le plafond du bandeau photo est posé en pourcentage, pas en pixels',
    fichier: 'moteur',
    de: "    '[data-atelier-capture][data-atelier-plafond-photo] .adoc-sc-card-img{max-height:var(--atelier-plafond-photo);}';",
    vers: "    '[data-atelier-capture][data-atelier-plafond-photo] .adoc-sc-card-img{max-height:25%;}';",
    attendu: 'le plafond suit la carte agrandie et ne plafonne rien' },

  // « Bloc courant seul » masque avec la classe du lecteur, qui CONSERVE la mise en page : la
  // carte reste aussi haute qu'un empilement complet et l'option ne sert à rien. C'est la même
  // méprise que celle qui avait rendu `mesurerHauteurDepliee` fausse.
  { nom: 'bloc courant seul masque sans retirer de la mise en page',
    fichier: 'moteur',
    de: "      blocs[i].style.display = (i === rang) ? '' : 'none';",
    vers: "      blocs[i].style.visibility = (i === rang) ? '' : 'hidden';",
    attendu: 'la carte reste aussi haute, et l\'option ne raccourcit rien' },

  // ── La porte locale ───────────────────────────────────────────────────────────────────────
  // Ces trois mutations portent sur studio-clinique.html. Les contrôles 1 à 5 de
  // verify-porte-locale s'exécutent sur CE fichier, donc elles les atteignent sans qu'il faille
  // régénérer la page du banc ; le contrôle 7, lui, vérifie séparément que la copie est à jour.
  { nom: 'la porte locale s\'ouvre sur N\'IMPORTE QUEL hôte',
    fichier: 'appli',
    test: 'verify-porte-locale.cjs',
    de: "      local = (location.hostname === '127.0.0.1' || location.hostname === 'localhost')\n        && new URLSearchParams(location.search).has('atelier-local');",
    vers: "      local = new URLSearchParams(location.search).has('atelier-local');",
    attendu: 'le site publié s\'ouvrirait sans mot de passe à qui ajoute le paramètre' },

  { nom: 'la porte locale s\'ouvre SANS paramètre',
    fichier: 'appli',
    test: 'verify-porte-locale.cjs',
    de: "        && new URLSearchParams(location.search).has('atelier-local');",
    vers: "        && true;",
    attendu: 'toute ouverture locale contournerait l\'écran, y compris par accident' },

  // Celle-ci est la plus grave : poser une clé serait déverrouiller POUR DE BON, et non cesser
  // de masquer. Le contrôle 5 vérifie qu'aucune clé n'est en stock — cette mutation prouve que
  // cette vérification n'est pas décorative.
  { nom: 'la porte locale POSE une clé au lieu de masquer l\'écran',
    fichier: 'appli',
    test: 'verify-porte-locale.cjs',
    de: "      document.documentElement.setAttribute('data-atelier-local', '');",
    vers: "      document.documentElement.setAttribute('data-atelier-local', '');\n      try { localStorage.setItem('workerApiKey', 'porte-locale'); } catch (_) {}",
    attendu: 'une clé inventée entrerait dans tous les appels au Worker' },

  { nom: 'le décodage des photos n\'est plus attendu',
    fichier: 'moteur',
    de: '  async function attendreImages(inner) {\n    var imgs = Array.prototype.slice.call(inner.querySelectorAll(\'img\'));',
    vers: '  async function attendreImages(inner) {\n    if (true) return { attendues: 0, pretes: 0 };\n    var imgs = Array.prototype.slice.call(inner.querySelectorAll(\'img\'));',
    attendu: 'une photo non décodée occupe 0 px et le bandeau se mesure à zéro' },
];

function lancer(test) {
  try {
    execFileSync(process.execPath, [path.join(__dirname, test || 'verify-atelier-images.cjs')],
      { stdio: 'pipe', encoding: 'utf8', env: process.env });
    return { echoue: false, sortie: '' };
  } catch (e) {
    const tout = String((e.stdout || '') + (e.stderr || ''));
    return { echoue: true, sortie: (tout.split('\n').filter(function (l) { return l.startsWith('FAIL'); })[0] || '').slice(0, 150) };
  }
}

// `--seulement <fragment>` n'éprouve que les mutations dont le nom contient ce fragment. Cela
// sert à reprendre une mutation qu'on vient d'écrire sans rejouer les cinquante-six — jamais à
// conclure : le relevé final dit alors explicitement qu'il est PARTIEL.
const iSeulement = process.argv.indexOf('--seulement');
const FILTRE = iSeulement !== -1 ? String(process.argv[iSeulement + 1] || '') : null;
const CHOISIS = FILTRE ? ESSAIS.filter((e) => e.nom.indexOf(FILTRE) !== -1) : ESSAIS;
if (FILTRE) {
  if (!CHOISIS.length) { console.error('ARRÊT — aucune mutation ne contient « ' + FILTRE + ' »'); process.exit(1); }
  console.log('RELEVÉ PARTIEL — ' + CHOISIS.length + ' mutation(s) sur ' + ESSAIS.length
    + ' contenant « ' + FILTRE + ' ». Ne vaut pas pour l\'ensemble.\n');
}

let tenus = 0, applicables = 0, equivalentes = 0, surprises = 0;
try {
  // Le témoin passe sur CHAQUE test qu'une mutation emploie : sinon un échec préexistant se
  // ferait passer pour une détection.
  const testsEmployes = Array.from(new Set(CHOISIS.map((e) => e.test || 'verify-atelier-images.cjs')));
  for (const t of testsEmployes) {
    const temoin = lancer(t);
    if (temoin.echoue) { console.error('ARRÊT — ' + t + ' échoue AVANT toute mutation : ' + temoin.sortie); process.exit(1); }
  }
  console.log('témoin : ' + testsEmployes.length + ' test(s) passent sur les sources intactes.\n');
  // LE JOURNAL EST ÉCRIT ICI, juste avant la première mutation : avant cette ligne, aucune
  // source n'a été touchée et il n'y aurait rien à reprendre.
  ecrireJournal();

  for (const essai of CHOISIS) {
    const src = original[essai.fichier];
    const n = src.split(essai.de).length - 1;
    if (n !== 1) { console.error('ARRÊT — ancre trouvée ' + n + ' fois : ' + essai.nom); process.exit(1); }
    fs.writeFileSync(FICHIERS[essai.fichier], src.replace(essai.de, essai.vers), 'utf8');
    const r = lancer(essai.test);
    fs.writeFileSync(FICHIERS[essai.fichier], src, 'utf8');
    // UNE MUTATION ÉQUIVALENTE SE CONSIGNE, ELLE NE SE TAIT PAS. On l'applique quand même, et on
    // attend l'inverse : que les tests PASSENT. Le jour où elle se met à les faire échouer, elle
    // n'est plus équivalente et c'est l'inventaire qui est faux — on le dit alors aussi fort.
    if (essai.equivalente) {
      equivalentes++;
      if (r.echoue) { surprises++; console.log('SURPRISE ' + essai.nom + ' — annoncée équivalente, elle est détectée : ' + r.sortie); }
      else console.log('ÉQUIV  ' + essai.nom + '\n       → ' + essai.equivalente);
      continue;
    }
    applicables++;
    if (r.echoue) { tenus++; console.log('TENU   ' + essai.nom + '\n       → ' + r.sortie); }
    else console.log('MANQUÉ ' + essai.nom + ' — le test est passé malgré la mutation (' + essai.attendu + ')');
  }
} finally {
  restaurer(null);
  // La page du banc est reforgée depuis les sources restaurées : une mutation de la forge laisse
  // sinon derrière elle une page produite à partir d'un code qui n'existe plus.
  try { execFileSync(process.execPath, [path.join(__dirname, 'forger-banc-chutier.cjs')], { stdio: 'pipe' }); } catch (e) {}
}

let intact = true;
Object.keys(FICHIERS).forEach(function (k) {
  const apres = crypto.createHash('sha256').update(fs.readFileSync(FICHIERS[k], 'utf8')).digest('hex');
  if (apres !== empreinteAvant[k]) { intact = false; console.log('ÉCART sur ' + k + ' : ' + apres); }
});
console.log('\nsources restaurées : ' + (intact ? 'empreintes identiques' : 'ÉCART'));
const suffixe = (equivalentes ? ', ' + equivalentes + ' équivalente(s) consignée(s)' : '')
  + (FILTRE ? '  — RELEVÉ PARTIEL (« ' + FILTRE + ' »), ne vaut pas pour l\'ensemble' : '');
console.log(tenus === applicables && intact && !surprises
  ? 'PASS falsifier-atelier-images — ' + tenus + '/' + applicables + ' mutations détectées' + suffixe + '.'
  : 'FAIL falsifier-atelier-images — ' + tenus + '/' + applicables + suffixe
    + (surprises ? ', ' + surprises + ' annoncée(s) équivalente(s) à tort' : ''));
process.exit(tenus === applicables && intact && !surprises ? 0 : 1);
