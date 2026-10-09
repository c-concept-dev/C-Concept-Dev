/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ATELIER DE MONTAGE — CHUTIER VISUEL, MOTEUR SEUL (lot 2, exigences V1 à V7 du CDC v2)

   FICHIER SÉPARÉ de studio-clinique-core.js, comme le CDC l'exige : le cœur dépasse 23 000 lignes.
   Ce module ne contient AUCUNE interface : seulement le moteur. La page d'essai qui l'exerce vit
   dans un dossier ignoré par git.

   CE QU'IL FAIT. Pour une Présentation, il énumère les étapes (adocPresentStepList, lot 1a),
   PILOTE le vrai lecteur dans une scène hors écran à sa taille réelle (1422×800), attend la fin
   des animations, capture avec SnapDOM épinglé, et compose un canvas de 1920×1080 exactement.

   CE QU'IL NE FAIT PAS. Il ne réimplémente aucune règle du lecteur. La règle de révélation vient
   d'adocPresentApplyReveal et d'adocPresentRevealNext, appelées telles quelles sur la scène hors
   écran — c'est pour cela que revealNext a reçu un paramètre `innerEl` optionnel au lieu qu'une
   seconde règle soit écrite ici (régression #6).

   DEUX PIÈGES DÉJÀ PAYÉS AU LOT 0, dont les parades sont ici et non à réinventer :
   1. Une enveloppe posée dans un conteneur flex se fait COMPRIMER : une enveloppe vide déclarée
      à 1920px se calculait à 816,95px. La scène reprend donc les classes réelles du lecteur
      (.cc-ws-present-slide-outer, qui porte déjà width:1422px;height:800px;flex:0 0 auto) ET
      vérifie la taille obtenue avant toute capture, qu'elle refuse si elle ne correspond pas.
   2. Une capture partie trop tôt montre un état intermédiaire : 16 % au lieu de 37 %. Deux
      parades, l'une ou l'autre selon l'exigence V6 — le mode capture, qui supprime l'animation
      de nombre et laisse la valeur finale, ou l'attente d'au moins 800 ms. Le mode capture est
      le défaut, parce qu'il garantit la valeur finale au lieu de l'espérer d'un délai.

   SnapDOM 3.3.0, MIT, copie locale épinglée — voir vendor/SNAPDOM-PROVENANCE.md.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var MOTEUR_VERSION = '2.0';          // entre dans la signature : un changement de moteur périme les images
  var SNAPDOM_VERSION = '3.3.0';
  var SCENE = { largeur: 1422, hauteur: 800 };          // la scène du lecteur, référence
  var SORTIE = { largeur: 1920, hauteur: 1080 };
  var ATTENTE_ANIMATIONS_MS = 800;     // V6 : transition de révélation (220 ms) + nombre (700 ms)

  // ══════════════════════════════════════════════════════════════════════════════════════════
  // LE MODE VIDÉO EST LE DÉFAUT — décision de Christophe du 6 octobre, sur planche comparative
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // Réglage (d) : scène de 960×540, échelle typographique ×1,4. Mesuré sur onze étapes : le texte
  // passe de 20,3 px à 42 px dans le cadre de 1080, soit de 1,88 % à 3,89 % de sa hauteur. Une
  // vidéo se regarde parfois sur un téléphone, où 20 px de cadre deviennent quatre points.
  //
  // Ce n'est PAS « identique à l'écran » (V1), et c'est assumé : le lecteur dessine une carte dans
  // une page, la vidéo en fait le cadre entier. Le mode fidèle reste accessible — il sert à la
  // mesure de netteté, qui a besoin d'un rendu de référence.
  //
  // CE QUE CE RÉGLAGE COÛTE, mesuré : la scène étant deux fois plus petite, l'agrandissement passe
  // de 1,35 à 2,0 ; et le texte grossissant dans des boîtes qui ne grandissent pas, cinq étapes
  // sur onze débordent au lieu d'une. D'où la politique de débordement ci-dessous.
  // DÉCISION DU 9 OCTOBRE : le texte reste tel quel à l'écran, et tout le visuel reste présent.
  // Le mode vidéo ne grossit donc plus la typographie et n'impose plus une scène unique : c'est
  // la SCÈNE PAR DIAPOSITIVE qui tient ce rôle, et elle le tient mieux — elle s'adapte au
  // contenu de chaque diapositive au lieu d'appliquer le même réglage à toutes.
  var MODE_VIDEO = { scene: null, echelleTypo: 1, sceneParDiapositive: true };
  var MODE_FIDELE = { scene: null, echelleTypo: 1, sceneParDiapositive: false };

  // ── Politique de débordement (V3) ────────────────────────────────────────────────────────
  // Une diapositive plus haute que son cadre peut DÉFILER pendant son commentaire. Au-delà d'un
  // certain point, elle ne le peut plus. Trois notions, et chacune vient d'une mesure.
  //
  // 1. UNE ZONE MORTE, parce que « plus haut que le cadre » n'est pas « déborde ». Mesuré sur les
  //    présentations d'essai en mode vidéo : quatre étapes dépassaient de SIX pixels de scène —
  //    douze à l'image — soit un rapport de 1,01. C'est du bruit de mise en page (sous-pixels,
  //    marges), pas un débordement. Les traiter comme tels aurait fait défiler une diapositive de
  //    douze pixels, ce qui n'a aucun sens. En dessous de la tolérance, le verdict est « aucun ».
  //
  // 2. UN SEUIL EN RAPPORT, et non en pixels : ce qui décide si une diapositive peut défiler
  //    pendant son commentaire, c'est la distance à parcourir rapportée à ce qu'on voit.
  //
  // 3. LE SEUIL PAR DÉFAUT N'EST PAS MESURÉ, et il faut le dire. Les rapports observés sont
  //    1,01 quatre fois puis 2,00 une fois : rien entre les deux, donc rien ne départage une
  //    valeur de 1,5 d'une valeur de 1,9. 1,8 vient d'un calcul, pas d'une observation — à ce
  //    rapport, une étape commentée quinze secondes fait défiler 864 px de cadre, soit 58 px par
  //    seconde, environ 1,4 ligne de texte par seconde à 42 px. C'est la vitesse de lecture. Au
  //    double, on ne lit plus. C'est une proposition raisonnée, pas une mesure.
  //
  // 4. QUAND LA DURÉE EST CONNUE, elle vaut mieux que le rapport, et le lot 1a l'a rendue
  //    disponible : la narration d'une étape donne sa durée estimée. L'atelier, qui la connaîtra,
  //    passe `dureeS` et le verdict se prend alors sur la VITESSE de défilement réelle, en
  //    pixels de sortie par seconde. Le rapport n'est que le repli quand on ne sait pas encore
  //    combien de temps l'étape dure.
  // 5. LE TRAVELLING NE PART PAS AU PREMIER MOT et ne s'arrête pas au dernier. Il faut un temps
  //    de pose aux deux bouts : le spectateur doit pouvoir lire le haut de la diapositive avant
  //    que l'image ne bouge, et le bas après qu'elle s'est arrêtée. Sans pose, le premier et le
  //    dernier bloc défilent pendant qu'on les découvre. 0,8 s de chaque côté : c'est le temps
  //    de lire une ligne. C'est une proposition raisonnée, pas une mesure.
  //
  //    LA POSE ENTRE DANS LE CALCUL DE LA VITESSE, et donc dans le verdict : la diapositive ne
  //    dispose pas de sa durée entière pour défiler, et la vitesse réelle est donc plus grande
  //    que « course ÷ durée ». Le verdict et le plan partagent UNE SEULE formule, celle de
  //    `planTravelling`. Deux formules auraient fini par diverger, et un plan qui contredit son
  //    propre verdict est exactement le défaut crédible que ce lot passe son temps à traquer.
  var TOLERANCE_DEBORDEMENT = 1.02;      // jusqu'à 2 % de plus que le cadre : ce n'est pas un débordement
  var SEUIL_SCISSION = 1.8;              // au-delà : scission conseillée plutôt que défilement
  var VITESSE_PAN_MAX = 60;              // px de sortie par seconde, quand la durée est connue
  var POSE_TRAVELLING_S = 0.8;           // de pose en haut ET en bas, avant et après le mouvement

  // LE PLAN DE TRAVELLING, en pixels de SORTIE : c'est ce que le montage exécutera, et il n'a
  // pas à le recalculer. Rend null quand il n'y a rien à faire défiler.
  //
  // `tenable` dit si la vitesse reste sous la borne : vrai, faux, ou null quand la durée du
  // commentaire n'est pas encore connue. Un plan intenable est rendu QUAND MÊME, avec la vitesse
  // qu'il aurait fallu tenir — un refus muet n'apprend rien à qui doit décider de découper la
  // diapositive en deux.
  function planTravelling(coursePx, dureeS, options) {
    var o = options || {};
    var course = Math.round(coursePx);
    if (!(course > 0)) return null;
    var pose = (typeof o.poseS === 'number') ? o.poseS : POSE_TRAVELLING_S;
    var vitesseMax = o.vitesseMax || VITESSE_PAN_MAX;
    if (!(dureeS > 0)) {
      return { course_px: course, pose_s: pose, duree_s: null, duree_utile_s: null,
               vitesse_px_par_s: null, debut_y: 0, fin_y: course, tenable: null,
               raison: 'durée du commentaire inconnue : la vitesse ne peut pas être calculée' };
    }
    var utile = +(dureeS - 2 * pose).toFixed(3);
    if (utile <= 0) {
      return { course_px: course, pose_s: pose, duree_s: +dureeS.toFixed(2), duree_utile_s: 0,
               vitesse_px_par_s: null, debut_y: 0, fin_y: course, tenable: false,
               raison: 'le commentaire (' + dureeS.toFixed(1) + ' s) ne dépasse pas les deux poses ('
                 + (2 * pose).toFixed(1) + ' s) : il ne reste aucun temps pour défiler' };
    }
    var vitesse = course / utile;
    return { course_px: course, pose_s: pose, duree_s: +dureeS.toFixed(2), duree_utile_s: utile,
             vitesse_px_par_s: +vitesse.toFixed(1), debut_y: 0, fin_y: course,
             tenable: vitesse <= vitesseMax,
             raison: vitesse <= vitesseMax
               ? 'défilement de ' + course + ' px en ' + utile.toFixed(1) + ' s, deux poses de '
                 + pose + ' s comprises'
               : 'il faudrait ' + vitesse.toFixed(1) + ' px/s pour parcourir ' + course + ' px en '
                 + utile.toFixed(1) + ' s, au-delà de la borne de ' + vitesseMax + ' px/s' };
  }

  function verdictDebordement(hauteurContenu, hauteurCadre, options) {
    var o = options || {};
    var tolerance = o.tolerance || TOLERANCE_DEBORDEMENT;
    var seuil = o.seuil || SEUIL_SCISSION;
    var rapport = hauteurContenu / hauteurCadre;
    var px = Math.round(hauteurContenu - hauteurCadre);
    if (rapport <= tolerance) {
      return { verdict: 'aucun', px: px > 0 ? px : 0, rapport: +rapport.toFixed(3),
               sous_tolerance: px > 0, vitesse_px_par_s: null, regle: 'tolerance' };
    }
    if (o.dureeS > 0 && o.echelleSortie > 0) {
      var plan = planTravelling(px * o.echelleSortie, o.dureeS,
                                { vitesseMax: o.vitesseMax, poseS: o.poseS });
      return { verdict: plan.tenable ? 'defilement' : 'scission',
               px: px, rapport: +rapport.toFixed(3), sous_tolerance: false,
               vitesse_px_par_s: plan.vitesse_px_par_s, regle: 'vitesse', plan: plan };
    }
    return { verdict: rapport > seuil ? 'scission' : 'defilement', px: px,
             rapport: +rapport.toFixed(3), sous_tolerance: false,
             vitesse_px_par_s: null, regle: 'rapport' };
  }
  // La durée estimée d'une étape, d'après la narration du lot 1a. Rend null quand l'étape n'est
  // pas narrée : le verdict retombe alors sur le rapport, et le dit.
  function dureeEtapeS(doc, stepId) {
    if (!doc || !Array.isArray(doc.narration)) return null;
    var e = doc.narration.find(function (n) { return n.stepId === stepId; });
    if (!e || !e.text) return null;
    var mots = String(e.text).trim().split(/\s+/).filter(Boolean).length;
    return mots ? mots / 2.5 : null;
  }

  // Chemin du module SnapDOM, résolu par rapport à CE script et non au document : la page d'essai
  // vit dans un autre dossier que studio-clinique.html, et un chemin relatif au document s'y
  // casserait sans un mot.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // CE QUI CHANGE PENDANT LA CAPTURE, ET SEULEMENT PENDANT ELLE
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // Toutes les règles sont portées par [data-atelier-capture], attribut que SEULE la scène hors
  // écran de ce moteur reçoit. Le lecteur, l'espace de travail et les exports ne voient rien :
  // aucun sélecteur ne peut les atteindre. C'est vérifié par un test, pas supposé.
  //
  // PAS DE !important. Le sélecteur d'attribut ajoute un niveau de spécificité, donc
  // « [data-atelier-capture] .adoc-sc-card » (0,2,0) l'emporte déjà sur « .adoc-sc-card » (0,1,0).
  // Au lot 0 j'avais accusé !important d'un défaut qu'il ne causait pas ; on mesure ce que la
  // règle obtient (le crochet `inspecter` lit bordure et rayon réels) au lieu d'empiler des
  // priorités par précaution.
  //
  // CE QUI EST RETIRÉ, et pourquoi — décision de Christophe du 6 octobre, après avoir vu les
  // premières images :
  //   · la porte d'agrandissement (.adoc-sc-image-zoom-badge) : une loupe sur une image de vidéo
  //     annonce un geste qui n'existe pas. « Une vidéo n'a pas de clic », dit déjà le CDC.
  //   · le questionnaire passe en version statique : questions et libellés de réponses, sans
  //     l'habillage de bouton, sans les barèmes (+0, +1…), sans « Voir mon résultat », sans la
  //     grille des profils et sans la bande des deux partenaires.
  //   · la carte perd bordure, rayon et ombre, pour que son fond occupe le cadre entier.
  //
  // LE QUIZ N'EST PAS TOUCHÉ dans sa logique : son masque interactif garde la réponse cachée. Le
  // PDF, lui, la montre. Christophe n'a pas tranché ce point-là, et dévoiler la réponse d'un quiz
  // au moment même où la question s'affiche irait contre son intention manifeste. Seul l'habillage
  // de bouton de ses options est retiré, pour la même raison que pour le questionnaire.
  var CSS_CAPTURE =
    '[data-atelier-capture] .adoc-sc-image-zoom-badge{display:none;}' +
    // La puce « Approfondir » : même raison que la loupe. Elle annonce un geste qu'une vidéo ne
    // permet pas, et le CDC exclut déjà les pages d'approfondissement du fil principal.
    // Relevée par Christophe sur sa propre présentation, diapositive 1.
    '[data-atelier-capture] .adoc-sc-deepdive-chip{display:none;}' +
    '[data-atelier-capture] .adoc-sc-card{border:0;border-radius:0;box-shadow:none;}' +
    '[data-atelier-capture] .adoc-sc-questionnaire{border:0;border-radius:0;padding-left:0;padding-right:0;}' +
    '[data-atelier-capture] .adoc-sc-questionnaire-option-points{display:none;}' +
    '[data-atelier-capture] .adoc-sc-questionnaire-submit{display:none;}' +
    '[data-atelier-capture] .adoc-sc-questionnaire-partners{display:none;}' +
    '[data-atelier-capture] .adoc-sc-questionnaire-scale{display:none;}' +
    '[data-atelier-capture] .adoc-sc-questionnaire-result{display:none;}' +
    '[data-atelier-capture] .adoc-sc-questionnaire-option,' +
    '[data-atelier-capture] .adoc-sc-quiz-option{border:0;background:transparent;box-shadow:none;' +
      'cursor:default;padding-top:2px;padding-bottom:2px;}' +
    '[data-atelier-capture] .adoc-sc-quiz{border:0;border-radius:0;padding-left:0;padding-right:0;}' +
    // ── Citations et lignes « Sources » : SUR OPTION, et désactivé par défaut ────────────────
    // Christophe n'a pas tranché. Tant qu'il n'a pas décidé, l'image montre ce que montre le
    // lecteur : les appels de citation et les lignes de sources restent. L'option existe pour
    // qu'il puisse voir les deux versions côte à côte avant de choisir, et elle est portée par un
    // SECOND attribut, pour que l'activer ne puisse rien changer d'autre.
    '[data-atelier-capture][data-atelier-sans-citations] .adoc-sc-cite{display:none;}' +
    '[data-atelier-capture][data-atelier-sans-citations] .adoc-sc-cite-note{display:none;}' +
    // ── Plafond ABSOLU du bandeau photo : SUR OPTION, désactivé par défaut ──────────────────
    // Le lecteur pose `.adoc-sc-card-img{max-height:45%}`, un pourcentage de la hauteur de la
    // CARTE. Quand la carte grandit pour contenir un débordement, la photo grandit avec elle :
    // c'est le cercle qui a produit la troncature du 7 octobre, et c'est ce que Christophe a
    // observé le 8 (« la photo plafonnée à 45 % grandit avec le contenu »). Un plafond en
    // PIXELS, calculé une fois sur la hauteur du CADRE, ne grandit pas. La valeur est passée en
    // propriété personnalisée pour que la règle reste statique et mesurable.
    // QUATRIÈME attribut : l'activer ne peut rien changer d'autre.
    '[data-atelier-capture][data-atelier-plafond-photo] .adoc-sc-card-img{max-height:var(--atelier-plafond-photo);}';
  var _cssPose = false;
  function poserCssCapture() {
    if (_cssPose || document.getElementById('atelier-capture-css')) { _cssPose = true; return; }
    var el = document.createElement('style');
    el.id = 'atelier-capture-css';
    el.textContent = CSS_CAPTURE;
    document.head.appendChild(el);
    _cssPose = true;
  }

  // ÉCHELLE TYPOGRAPHIQUE. Les tailles du lecteur sont en pixels fixes, dispersées dans plusieurs
  // feuilles ; il n'existe aucun jeton de taille à multiplier (vérifié : --adoc-sc-*size* n'existe
  // pas, et le manifeste de rendu n'en porte pas). Poser une seule font-size sur la scène ne
  // scalerait que ce qui hérite, et laisserait intactes les tailles écrites en px — une
  // typographie à deux vitesses, pire que pas d'échelle du tout.
  //
  // On multiplie donc la taille CALCULÉE de chaque élément, en deux passes : tout lire d'abord,
  // tout écrire ensuite. L'ordre n'est pas un détail — écrire au fil de la lecture changerait la
  // valeur héritée par les descendants pas encore lus, et l'échelle se composerait en cascade.
  //
  // SEULE la taille est touchée, et c'est une conclusion de mesure, pas une économie. J'avais
  // d'abord multiplié aussi l'interligne et l'espacement des lettres, en me disant qu'une taille
  // sans son interligne donne un texte serré. Deux mesures ont montré que ces deux lignes ne
  // corrigeaient rien ici : tous les interlignes du lecteur sont SANS UNITÉ (1, 1,25, 1,4, 1,5,
  // 1,6, 1,65, 1,7, 1,75 — relevés un par un), donc ils suivent la taille d'eux-mêmes ; et aucun
  // élément d'une scène capturée ne porte d'espacement de lettres (les .5px et .8px du dépôt sont
  // sur des classes de la conversation, jamais dans une diapositive). La falsification l'a
  // confirmé : retirer la mise à l'échelle de l'interligne ne changeait aucune image.
  // Si un jour une diapositive portait un interligne ou un espacement EN PIXELS, il faudrait les
  // remettre — ils ne suivraient pas.
  function appliquerEchelleTypo(racine, facteur) {
    if (!facteur || facteur === 1) return 0;
    var elements = [racine].concat(Array.prototype.slice.call(racine.querySelectorAll('*')));
    var aEcrire = [];
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (el.hasAttribute && el.hasAttribute('data-atelier-typo')) continue;   // jamais deux fois
      var taille = parseFloat(getComputedStyle(el).fontSize);
      if (!taille) continue;
      aEcrire.push({ el: el, taille: taille * facteur });
    }
    for (var j = 0; j < aEcrire.length; j++) {
      aEcrire[j].el.style.fontSize = aEcrire[j].taille.toFixed(2) + 'px';
      aEcrire[j].el.setAttribute('data-atelier-typo', '1');
    }
    return aEcrire.length;
  }

  var _cheminSnapdom = (function () {
    try {
      var src = document.currentScript && document.currentScript.src;
      if (src) return new URL('vendor/snapdom.mjs', src).href;
    } catch (e) {}
    return 'vendor/snapdom.mjs';
  })();
  var _snapdom = null;

  async function chargerSnapdom() {
    if (_snapdom) return _snapdom;
    var mod = await import(_cheminSnapdom);
    if (!mod || typeof mod.snapdom !== 'function') {
      throw new Error('SnapDOM introuvable à ' + _cheminSnapdom + ' — le moteur ne capture rien sans lui.');
    }
    _snapdom = mod.snapdom;
    return _snapdom;
  }

  // ── Signature de contenu (V4) ───────────────────────────────────────────────────────────────
  // Ce qui entre dans la signature est ce qui change les PIXELS, rien de plus et rien de moins.
  //
  // La carte ENTIÈRE y entre, pas seulement les blocs révélés à cette étape. Ce n'est pas une
  // précaution : .adoc-sc-reveal masque par opacity:0 + visibility:hidden, qui CONSERVENT la mise
  // en page (le cœur le dit à son propre endroit, mesuré sur une page de 14 paragraphes). Les
  // blocs encore cachés occupent donc leur place, et ajouter un bloc en fin de carte déplace
  // vraiment ce qu'on voit à l'étape 1. Signer les seuls blocs visibles manquerait ce cas.
  //
  // La taille de sortie, la taille de scène, la version de SnapDOM et celle du moteur y entrent
  // aussi : changer l'un d'eux change l'image sans toucher au document.
  function canoniser(v) {
    if (Array.isArray(v)) return v.map(canoniser);
    if (v && typeof v === 'object') {
      var sortie = {};
      Object.keys(v).sort().forEach(function (k) { sortie[k] = canoniser(v[k]); });
      return sortie;
    }
    return v;
  }
  async function empreinte(texte) {
    if (!(window.crypto && window.crypto.subtle && window.crypto.subtle.digest)) {
      throw new Error('crypto.subtle indisponible (contexte non sécurisé) — aucune signature d\'image ne peut être calculée. '
        + 'Aucun repli n\'est tenté : deux algorithmes de signature donneraient deux verdicts de péremption.');
    }
    var octets = new TextEncoder().encode(texte);
    var condense = await window.crypto.subtle.digest('SHA-256', octets);
    return Array.from(new Uint8Array(condense))
      .map(function (b) { return b.toString(16).padStart(2, '0'); }).join('').slice(0, 16);
  }
  async function signatureEtape(doc, etape) {
    var carte = (doc.blocks || []).find(function (c) { return c && c.id === etape.cardId; });
    if (!carte) throw new Error('carte introuvable pour l\'étape ' + etape.stepId);
    return empreinte(JSON.stringify(canoniser({
      carte: carte, rang: etape.rang, surRang: etape.surRang,
      sortie: SORTIE, scene: SCENE, snapdom: SNAPDOM_VERSION, moteur: MOTEUR_VERSION,
    })));
  }

  // ── Scène hors écran ────────────────────────────────────────────────────────────────────────
  // Hors écran par position, JAMAIS par display:none (qui n'a aucune mise en page) ni par
  // visibility:hidden (qui en a une, mais dont SnapDOM ne doit pas hériter). Les deux classes
  // réelles du lecteur sont reprises telles quelles : c'est d'elles que viennent width:1422px,
  // height:800px et flex:0 0 auto, et c'est le CSS du moteur de présentation, déjà injecté dans
  // la page par le cœur, qui les porte.
  // ── Les sources d'un document, étape par étape (préparation du kit X2) ─────────────────────
  // Le CDC prévoit que le kit porte les sources, et une dernière image peut les afficher. Cette
  // fonction les rassemble SANS rien décider de leur affichage : elle rend la liste des citations
  // réellement référencées, leur libellé, et les étapes qui les appellent. Aucune interface.
  // Une citation déclarée dans le document mais appelée par aucun bloc visible n'y figure pas :
  // une liste de sources doit correspondre à ce qu'on a montré.
  function sourcesParEtape(doc) {
    var etapes = (typeof window.adocPresentStepList === 'function') ? window.adocPresentStepList(doc) : [];
    var parCitation = {};
    (doc && doc.citations || []).forEach(function (c) {
      parCitation[c.citationId] = { citationId: c.citationId, displayLabel: c.displayLabel || c.citationId,
                                    sourceSnapshotEntryId: c.sourceSnapshotEntryId || null, etapes: [] };
    });
    var parEtape = {};
    var cartes = (doc && doc.blocks || []).filter(function (b) { return b && b.type === 'card'; });
    etapes.forEach(function (e) {
      var carte = cartes.find(function (c) { return c.id === e.cardId; });
      var blocs = (carte && carte.content && carte.content.blocks) || [];
      // Une étape montre les blocs jusqu'à son rang : ce sont leurs citations qui sont à l'image.
      var visibles = blocs.slice(0, Math.max(1, e.rang));
      var ids = [];
      visibles.forEach(function (b) {
        (b.citationIds || []).forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
        ((b.validation && b.validation.citationLinks) || []).forEach(function (l) {
          if (l && l.citationId && ids.indexOf(l.citationId) === -1) ids.push(l.citationId);
        });
      });
      parEtape[e.stepId] = ids;
      ids.forEach(function (id) {
        if (parCitation[id] && parCitation[id].etapes.indexOf(e.stepId) === -1) parCitation[id].etapes.push(e.stepId);
      });
    });
    var utilisees = Object.keys(parCitation).map(function (k) { return parCitation[k]; })
      .filter(function (c) { return c.etapes.length; });
    return {
      sources: utilisees,
      par_etape: parEtape,
      declarees: Object.keys(parCitation).length,
      utilisees: utilisees.length,
      jamais_appelees: Object.keys(parCitation).filter(function (k) { return !parCitation[k].etapes.length; }),
    };
  }

  function creerScene(scene) {
    poserCssCapture();
    var hote = document.createElement('div');
    hote.setAttribute('data-atelier-scene', '');
    hote.style.cssText = 'position:fixed;left:-20000px;top:0;z-index:-1;'
      + 'display:flex;align-items:center;justify-content:center;pointer-events:none;';
    var outer = document.createElement('div');
    outer.className = 'cc-ws-present-slide-outer';
    // Taille imposée en ligne : les classes du lecteur portent 1422×800, et un autre réglage de
    // scène doit pouvoir être éprouvé sans toucher à ces classes, donc sans rien changer pour le
    // lecteur. `flex:0 0 auto` et les minimums rejouent la parade du lot 0 contre la compression
    // par un conteneur flex.
    outer.style.cssText = 'width:' + scene.largeur + 'px;height:' + scene.hauteur + 'px;'
      + 'min-width:' + scene.largeur + 'px;min-height:' + scene.hauteur + 'px;flex:0 0 auto;';
    // LA MISE À L'ÉCHELLE DU LECTEUR NE DOIT PAS ATTEINDRE CETTE SCÈNE. Une règle du moteur de
    // présentation applique « transform:scale(var(--adoc-present-echelle,1)) » avec origine au
    // centre aux éléments qui portent ces classes, pour que la diapositive tienne dans la fenêtre.
    // Elle a sa raison d'être à l'écran ; ici elle n'en a aucune, et elle a été prise en flagrant
    // délit : la scène, posée à 1920×1080, se mesurait à 1102×620 décalée de (480, 270), avec une
    // transformation de 1,147569 que personne n'avait demandée. La variable est donc fixée à 1 sur
    // l'hôte, d'où elle hérite vers toute la scène.
    hote.style.setProperty('--adoc-present-echelle', '1');
    hote.style.setProperty('--adoc-present-echelle-agrandir', '1');
    var inner = document.createElement('div');
    inner.className = 'cc-ws-present-slide-inner';
    // La marque de capture : c'est elle, et elle seule, qui active CSS_CAPTURE.
    inner.setAttribute('data-atelier-capture', '');
    if (scene.masquerCitations) inner.setAttribute('data-atelier-sans-citations', '');
    // Le plafond est une HAUTEUR EN PIXELS, pas une fraction : c'est tout l'intérêt. Il vaut
    // `fraction x hauteur du cadre`, calculé une fois, et il ne bouge plus quand la scène est
    // agrandie pour contenir un débordement.
    if (scene.plafondPhotoPx > 0) {
      inner.setAttribute('data-atelier-plafond-photo', '');
      hote.style.setProperty('--atelier-plafond-photo', Math.round(scene.plafondPhotoPx) + 'px');
    }
    // La transition de 260 ms de .cc-ws-present-slide-inner sert au glissement d'une diapositive
    // à l'autre dans le lecteur. Ici rien ne glisse : la scène est réécrite d'un coup. On la coupe
    // plutôt que de l'attendre pour rien.
    inner.style.transition = 'none';
    outer.appendChild(inner);
    hote.appendChild(outer);
    document.body.appendChild(hote);
    return {
      hote: hote, outer: outer, inner: inner,
      retirer: function () { if (hote.parentNode) hote.parentNode.removeChild(hote); },
    };
  }
  // Le piège du lot 0, en assertion : la scène doit MESURER 1422×800. Si elle ne le fait pas, on
  // refuse de capturer au lieu de livrer une image à la mauvaise échelle, qui serait indétectable
  // à l'œil sur une vignette.
  function verifierScene(sc, attendue) {
    var l = sc.outer.offsetWidth, h = sc.outer.offsetHeight;
    if (l !== attendue.largeur || h !== attendue.hauteur) {
      throw new Error('scène non conforme : ' + l + 'x' + h + ' au lieu de '
        + attendue.largeur + 'x' + attendue.hauteur + ' — capture refusée. '
        + 'Cause déjà rencontrée au lot 0 : compression par un conteneur flex parent.');
    }
    return { largeur: l, hauteur: h };
  }

  // ── Attente des animations (V6) ─────────────────────────────────────────────────────────────
  function image() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }
  function attendre(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  // LES PHOTOS DOIVENT ÊTRE DÉCODÉES AVANT TOUTE MESURE. Un <img> non décodé occupe 0 px de
  // haut : la hauteur du contenu se mesure trop courte, le bandeau photo se mesure à zéro, et la
  // capture montre un trou là où la photo aurait dû être. Rien dans la chaîne ne l'aurait dit —
  // encore un défaut crédible, de la même famille que la troncature du 7 octobre. Le délai est
  // borné : une photo cassée ne doit pas suspendre un rendu de dix-neuf étapes.
  var ATTENTE_IMAGES_MS = 3000;
  async function attendreImages(inner) {
    var imgs = Array.prototype.slice.call(inner.querySelectorAll('img'));
    if (!imgs.length) return { attendues: 0, pretes: 0 };
    var attentes = imgs.map(function (im) {
      if (im.complete && im.naturalWidth > 0) return Promise.resolve();
      if (im.decode) return im.decode().catch(function () {});
      return new Promise(function (r) {
        im.addEventListener('load', r, { once: true });
        im.addEventListener('error', r, { once: true });
      });
    });
    await Promise.race([
      Promise.all(attentes),
      new Promise(function (r) { setTimeout(r, ATTENTE_IMAGES_MS); }),
    ]);
    return { attendues: imgs.length,
             pretes: imgs.filter(function (im) { return im.complete && im.naturalWidth > 0; }).length };
  }

  async function attendreStabilite(inner, modeCapture) {
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    await attendreImages(inner);
    await image(); await image();
    // Les transitions CSS (la révélation d'un bloc, 220 ms) sont attendues par l'API d'animations
    // quand elle existe : c'est plus juste qu'un délai deviné, et cela couvre toute transition
    // ajoutée plus tard sans qu'il faille revenir ici.
    try {
      if (inner.getAnimations) {
        var anims = inner.getAnimations({ subtree: true });
        await Promise.all(anims.map(function (a) { return a.finished.catch(function () {}); }));
      }
    } catch (e) {}
    // Hors mode capture, l'animation de nombre tourne vraiment : 700 ms, en requestAnimationFrame,
    // donc invisible pour getAnimations. C'est ce seul cas qui justifie le plancher de 800 ms.
    if (!modeCapture) await attendre(ATTENTE_ANIMATIONS_MS);
    await image(); await image();
  }

  // ── Débordement (V3) ────────────────────────────────────────────────────────────────────────
  // Mesuré sur la scène EN PLACE, par scrollHeight, et non en libérant sa hauteur.
  //
  // Première tentative, abandonnée parce qu'elle mesurait faux : mettre height:auto sur la scène
  // et lire la hauteur obtenue. Une carte de deux paragraphes rendait alors 157 px au lieu de 800
  // — la carte se dimensionne en pourcentage de sa scène, donc libérer la scène la fait
  // s'effondrer au lieu de la déplier. Le chiffre était plausible et complètement trompeur.
  //
  // scrollHeight donne la hauteur du contenu Y COMPRIS ce qui dépasse, même sous overflow:hidden.
  // C'est la mesure juste, et elle ne touche pas à la mise en page pour l'obtenir. Le dépliage,
  // lui, a lieu au moment de la capture (voir `capturer`), là où il sert à quelque chose.
  // LA HAUTEUR DU CONTENU, telle qu'elle est À CET INSTANT. Deux sources, et le maximum des deux :
  // le défilement de la carte, et le bas du dernier bloc réellement visible. La seconde rattrape
  // ce que scrollHeight laisse parfois de côté (marge basse du dernier enfant).
  function hauteurContenu(sc) {
    var carte = sc.inner.querySelector('.adoc-sc-card');
    var h = Math.max(sc.inner.scrollHeight, carte ? carte.scrollHeight : 0);
    if (carte) {
      var haut = carte.getBoundingClientRect().top;
      var blocs = Array.prototype.slice.call(sc.inner.querySelectorAll('.adoc-sc-card > .adoc-sc-block'));
      for (var i = 0; i < blocs.length; i++) {
        var sb = getComputedStyle(blocs[i]);
        if (sb.visibility === 'hidden' || sb.display === 'none') continue;
        var bas = blocs[i].getBoundingClientRect().bottom - haut;
        if (bas > h) h = bas;
      }
    }
    return Math.ceil(h);
  }

  // LA HAUTEUR DE CE QUI EST VISIBLE À CETTE ÉTAPE, et non de la carte entière.
  //
  // POURQUOI LES DEUX SONT NÉCESSAIRES, et c'est Christophe qui a posé la question. La carte a la
  // même hauteur à toutes ses étapes, parce que la révélation masque en `visibility:hidden` : les
  // blocs à venir occupent déjà leur place. C'est ce qui permet de choisir une scène par
  // diapositive, et c'est aussi ce qui fait que l'IMAGE doit garder la même taille à toutes les
  // étapes — sans quoi le fondu enchaîné de l'Ef1 n'aurait pas deux images comparables.
  //
  // Mais le TRAVELLING, lui, ne doit pas parcourir du vide. À la première étape d'une
  // diapositive haute, seul le haut porte de l'encre : faire défiler jusqu'en bas montrerait
  // une page blanche pendant la moitié du commentaire. La course se calcule donc sur le bas de
  // ce qui est RÉVÉLÉ, et elle vaut souvent zéro aux premières étapes.
  function hauteurVisible(sc) {
    var carte = sc.inner.querySelector('.adoc-sc-card');
    if (!carte) return 0;
    var haut = carte.getBoundingClientRect().top;
    var bas = 0;
    Array.prototype.slice.call(carte.querySelectorAll('*')).forEach(function (el) {
      var st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return;
      var b = el.getBoundingClientRect().bottom - haut;
      if (b > bas) bas = b;
    });
    // La marge basse de la carte : le lecteur la laisse après son dernier bloc, et l'image la
    // montre. S'arrêter pile sur la dernière ligne la collerait au bord du cadre.
    bas += parseFloat(getComputedStyle(carte).paddingBottom) || 0;
    return Math.ceil(bas);
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════
  // LA HAUTEUR SE STABILISE : agrandir la scène CHANGE la hauteur du contenu
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // LE DÉFAUT QUE CECI CORRIGE, et il était silencieux. Dans la scène, la carte est en
  // `height:100%` et l'image de couverture en `max-height:45%` : agrandir la scène pour y faire
  // tenir un débordement AGRANDIT l'image d'autant, qui repousse le texte vers le bas. La hauteur
  // mesurée AVANT l'agrandissement est donc toujours trop courte, et le dernier bloc se trouve
  // coupé — sans aucun avertissement, sur une image par ailleurs parfaitement crédible.
  //
  // Mesuré sur une carte à la forme de celles de Christophe : contenu à 766 px avant
  // l'agrandissement, 868 px après, dernier bloc dont le bas tombe à 830 — soit 64 px coupés.
  // SANS photo de couverture, rien ne bouge : 540 avant, 540 après. Le défaut ne touchait donc
  // que les diapositives illustrées, ce qui explique qu'il ait échappé aux présentations d'essai.
  //
  // La suite converge : le contenu vaut (fixe + 0,45 × H), donc H tend vers fixe / 0,55. Huit
  // tours sont très au-delà du nécessaire ; au-delà, on REFUSE plutôt que de livrer une hauteur
  // qui n'a pas convergé.
  // LE REFUS, en fonction nommée pour être éprouvable SEULE. Une image plus courte que son
  // contenu n'est jamais livrée : elle serait crédible et fausse, ce qui est la pire espèce de
  // défaut — celui qu'on ne cherche pas, parce que rien ne le signale. La tolérance est la même
  // zone morte qu'ailleurs : quelques pixels de bruit de mise en page ne sont pas une troncature.
  function refuserSiTropCourte(contenu, hauteurCapture, tolerance, stepId) {
    if (contenu <= Math.ceil(hauteurCapture * (tolerance || TOLERANCE_DEBORDEMENT))) return false;
    throw new Error('image plus courte que son contenu pour l\'étape ' + stepId
      + ' : contenu ' + contenu + ' px, capture ' + hauteurCapture + ' px, soit '
      + (contenu - hauteurCapture) + ' px coupés — capture refusée. '
      + 'C\'est le défaut du 7 octobre : la carte est en height:100% et son image de couverture '
      + 'en max-height:45%, donc agrandir la scène agrandit l\'image et repousse le texte.');
  }

  var TOURS_STABILISATION = 12;
  async function stabiliserHauteur(sc, attendue) {
    var outerStyle = sc.outer.style.cssText, innerStyle = sc.inner.style.cssText;
    var poser = async function (h) {
      sc.outer.style.height = h + 'px'; sc.outer.style.overflow = 'visible';
      sc.inner.style.height = h + 'px'; sc.inner.style.overflow = 'visible';
      await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
      return Math.max(attendue.hauteur, hauteurContenu(sc));
    };
    var avant = Math.max(attendue.hauteur, hauteurContenu(sc));
    var h = avant, contenu = avant, tours = 0, methode = 'aucune';
    try {
      // ITÉRER SUFFIT MAIS CONVERGE LENTEMENT : chaque tour ne comble que 55 % du manque, et il en
      // fallait neuf pour une carte illustrée en mode vidéo. Deux sondes donnent la pente, et le
      // point fixe se calcule : contenu(H) = fixe + k·H, donc H* = fixe / (1 − k). Trois
      // redimensionnements au lieu de neuf, et la vérification est la même.
      var c0 = await poser(avant); tours++;
      if (c0 <= avant) { contenu = c0; h = avant; methode = 'immediate'; }
      else {
        var h1 = c0;
        var c1 = await poser(h1); tours++;
        var k = (c1 - c0) / (h1 - avant);
        if (k > 0 && k < 0.98) {
          var fixe = c1 - k * h1;
          h = Math.ceil(fixe / (1 - k));
          contenu = await poser(h); tours++;
          methode = 'point fixe';
          // Un pixel d'arrondi peut subsister : on le rattrape, sans boucler indéfiniment.
          var garde = 0;
          while (contenu > h && garde < 4) { h = contenu; contenu = await poser(h); tours++; garde++; }
        } else {
          // La croissance n'est pas affine : on retombe sur l'itération bornée, qui reste juste.
          methode = 'iteration';
          h = c1; contenu = c1;
          while (tours < TOURS_STABILISATION) {
            contenu = await poser(h); tours++;
            if (contenu <= h) break;
            h = contenu;
          }
        }
      }
    } finally {
      sc.outer.style.cssText = outerStyle;
      sc.inner.style.cssText = innerStyle;
      await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
    }
    return { hauteur: h, contenu: contenu, tours: tours, methode: methode,
             converge: contenu <= h, hauteur_avant_stabilisation: avant };
  }

  // ── UNE SCÈNE PAR DIAPOSITIVE ──────────────────────────────────────────────────────────────
  // Décision de Christophe du 9 octobre : le texte reste tel quel à l'écran, TOUT le visuel
  // reste présent — donc ni plafond de photo, ni bloc courant seul. À la place, la scène est
  // choisie DIAPOSITIVE PAR DIAPOSITIVE pour que la diapositive entière tienne dans 1920×1080,
  // et elle reste constante sur toutes les étapes de cette diapositive.
  //
  // Deux forces opposées, et c'est tout le problème :
  //   · une scène PLUS PETITE agrandit le texte à l'image (la sortie fait toujours 1920 de
  //     large, donc le rapport d'agrandissement est 1920 / largeur de scène) ;
  //   · une scène plus petite donne des lignes plus courtes, donc plus de lignes, donc un
  //     contenu plus HAUT — alors que la scène, elle, est plus basse.
  // On cherche donc la PLUS PETITE scène où le contenu tient encore : c'est celle qui donne le
  // plus grand texte lisible sans rien couper.
  //
  // Le plancher de lisibilité borne la recherche par le haut : au-delà d'une certaine largeur
  // de scène, le texte passerait sous le plancher. Mesuré au lot 2 : 1422 donne 1,88 %, jugé
  // petit pour un téléphone. Le plancher par défaut est 2,0 %, décidé par Christophe.
  var PLANCHER_LISIBILITE_PC = 2.0;
  var SCENE_LARGEUR_MIN = 640;      // en deçà, la mise en page du lecteur se disloque
  var SCENE_RAPPORT = SORTIE.hauteur / SORTIE.largeur;   // 16:9, celui de la sortie

  function sceneDeLargeur(largeur) {
    var l = Math.round(largeur);
    return { largeur: l, hauteur: Math.round(l * SCENE_RAPPORT) };
  }

  // ── LA TAILLE DU CORPS DE TEXTE, mesurée sur ce que le lecteur rend vraiment ────────────────
  //
  // LE DÉFAUT QUE CECI CORRIGE, et c'est Christophe qui l'a vu par le calcul : le relevé
  // annonçait 4,25 % de hauteur pour la diapositive 1 de sa présentation, là où un corps de
  // 15 px dans une scène de 941 px en donne 2,83 %. Le rapport exact est 1,5 — celui du titre de
  // bloc (22,5 px) au corps (15 px). La colonne mesurait donc le TITRE en l'appelant « texte ».
  //
  // Deux causes, et toutes deux relevées dans le DOM réel du lecteur :
  //   · le texte d'un bloc vit dans un `span.adoc-sc-block-text`, et NON dans un <p> : l'ancien
  //     sélecteur `.adoc-sc-block p` ne matchait rien, et son troisième terme `.adoc-sc-block`
  //     prenait les conteneurs, dont la taille vaut 22,5 px pour un bloc de titre ;
  //   · le filtre `innerText` ne voit pas un bloc en `visibility:hidden`. Or la scène se choisit
  //     à la PREMIÈRE étape, où tous les blocs suivants sont encore masqués : le seul élément
  //     mesuré était donc le premier bloc, c'est-à-dire presque toujours le titre.
  //
  // Conséquence sur le plancher, et c'est elle qui compte : `largeurMaxLisible` recevait 22,5
  // au lieu de 15, donc autorisait une scène 1,5 fois plus large, donc un corps à 1,88 % là où
  // la page annonçait 2,0 %. Un plancher annoncé et non tenu, exactement la famille de défaut
  // que ce lot traque.
  //
  // CE QUI N'EST PAS DE LA LECTURE. L'appareil de citation (appels, notes) descend à 7,7 px, la
  // puce d'approfondissement à 11,9, les barèmes de questionnaire à 12,8. Ce sont des marques,
  // pas du texte à lire : protéger 7,7 px par un plancher de 2 % imposerait une scène de 683 px
  // et ferait déborder toutes les diapositives. Les titres, eux, sont de la lecture, mais plus
  // GRANDS : ils ne peuvent jamais être la contrainte, et ils faussent la médiane du corps.
  var HORS_LECTURE = '.adoc-sc-card-title, .adoc-sc-cite, .adoc-sc-cite-flagged,'
    + ' .adoc-sc-cite-note, .adoc-sc-deepdive-chip, .adoc-sc-questionnaire-option-points,'
    + ' .adoc-sc-questionnaire-scale, .adoc-sc-questionnaire-result,'
    + ' .adoc-sc-questionnaire-partners, .adoc-sc-questionnaire-submit';

  function taillesTexte(inner, avecTitres) {
    var carte = inner.querySelector('.adoc-sc-card');
    if (!carte) return [];
    var tailles = [];
    Array.prototype.slice.call(carte.querySelectorAll('*')).forEach(function (el) {
      // L'ÉLÉMENT DOIT PORTER DU TEXTE EN PROPRE. Sans cela, chaque conteneur compterait pour le
      // texte de ses enfants, et la médiane suivrait la profondeur du balisage au lieu du texte.
      var propre = Array.prototype.slice.call(el.childNodes).some(function (n) {
        return n.nodeType === 3 && (n.textContent || '').trim(); });
      if (!propre) return;
      if (el.closest(HORS_LECTURE)) return;
      if (!avecTitres && el.closest('.adoc-sc-heading')) return;
      // `display:none` est ABSENT de l'image : il ne compte pas. `visibility:hidden` y occupe sa
      // place et sera révélé à une étape suivante : il compte, et c'est tout l'intérêt — la
      // scène se choisit à la première étape pour toutes les autres.
      var st = getComputedStyle(el);
      if (st.display === 'none') return;
      var t = parseFloat(st.fontSize);
      if (t) tailles.push(t);
    });
    tailles.sort(function (a, b) { return a - b; });
    return tailles;
  }

  // La taille du CORPS de texte dans la scène, en pixels : la médiane du texte courant, titres
  // exclus. Elle ne dépend pas de la largeur de la scène (les règles du lecteur sont en pixels
  // fixes) : on la mesure une fois par diapositive.
  //
  // Rend aussi le plus petit texte de lecture, qui n'est pas forcément le corps — un encadré
  // descend à 14 px. Le plancher s'applique au CORPS ; le plus petit est RAPPORTÉ, pour qu'un
  // texte sous le plancher se voie au lieu de se taire.
  function mesureTexte(inner) {
    var corpsSeul = taillesTexte(inner, false);
    var tout = taillesTexte(inner, true);
    var base = corpsSeul.length ? corpsSeul : tout;
    return {
      corps_px: base.length ? base[Math.floor(base.length / 2)] : 15,
      plus_petit_px: tout.length ? tout[0] : null,
      sans_texte_courant: !corpsSeul.length,
      tailles: tout,
    };
  }
  function tailleCorpsPx(inner) { return mesureTexte(inner).corps_px; }

  // Le texte à l'image, en % de la hauteur du cadre de sortie.
  function partTexte(taillePx, largeurScene) {
    return (taillePx * (SORTIE.largeur / largeurScene) / SORTIE.hauteur) * 100;
  }

  // La plus grande scène qui respecte le plancher de lisibilité.
  function largeurMaxLisible(taillePx, plancherPc) {
    return Math.floor(taillePx * SORTIE.largeur / (SORTIE.hauteur * (plancherPc / 100)));
  }

  async function choisirScenePourCarte(sc, options) {
    var o = options || {};
    var plancher = (typeof o.plancherLisibilitePc === 'number')
      ? o.plancherLisibilitePc : PLANCHER_LISIBILITE_PC;
    var mt = mesureTexte(sc.inner);
    var taille = mt.corps_px;
    var hautBorne = Math.min(SCENE.largeur, largeurMaxLisible(taille, plancher));
    var basBorne = Math.min(hautBorne, SCENE_LARGEUR_MIN);
    var essais = [];

    // `tient(l)` repose la scène à cette largeur et regarde si le contenu y tient.
    async function tient(l) {
      var s = sceneDeLargeur(l);
      await redimensionnerScene(sc, s);
      var contenu = hauteurContenu(sc);
      essais.push({ largeur: s.largeur, hauteur: s.hauteur, contenu: contenu,
                    tient: contenu <= s.hauteur });
      return { scene: s, contenu: contenu, tient: contenu <= s.hauteur };
    }

    // Si même la plus grande scène lisible ne suffit pas, la diapositive déborde : on la garde
    // et le travelling prendra le relais. On ne descend PAS sous le plancher pour la faire
    // tenir — la lisibilité l'emporte, c'est la décision de Christophe.
    var auPlusGrand = await tient(hautBorne);
    if (!auPlusGrand.tient) {
      return { scene: auPlusGrand.scene, taille_px: taille,
               texte_pc: +partTexte(taille, hautBorne).toFixed(2),
               plus_petit_px: mt.plus_petit_px,
               plus_petit_pc: mt.plus_petit_px ? +partTexte(mt.plus_petit_px, hautBorne).toFixed(2) : null,
               sans_texte_courant: mt.sans_texte_courant,
               contenu_px: auPlusGrand.contenu, deborde: true,
               raison: 'même au plancher de lisibilité (' + plancher + ' %), le contenu dépasse',
               essais: essais, plancher_pc: plancher };
    }

    // Recherche dichotomique de la PLUS PETITE largeur où le contenu tient encore.
    var bas = basBorne, haut = hautBorne, meilleure = auPlusGrand;
    for (var tour = 0; tour < 7 && haut - bas > 8; tour++) {
      var milieu = Math.round((bas + haut) / 2);
      var r = await tient(milieu);
      if (r.tient) { meilleure = r; haut = milieu; } else { bas = milieu; }
    }
    // LA SCÈNE EST REPOSÉE SUR CELLE QU'ON RETIENT. La dichotomie laisse la scène sur sa
    // DERNIÈRE sonde, qui n'est pas forcément la meilleure : sans cette ligne, le DOM et la
    // valeur retenue divergent, et verifierScene refuse la capture — ce qu'il a fait.
    await redimensionnerScene(sc, meilleure.scene);
    return { scene: meilleure.scene, taille_px: taille,
             texte_pc: +partTexte(taille, meilleure.scene.largeur).toFixed(2),
             plus_petit_px: mt.plus_petit_px,
             plus_petit_pc: mt.plus_petit_px
               ? +partTexte(mt.plus_petit_px, meilleure.scene.largeur).toFixed(2) : null,
             sans_texte_courant: mt.sans_texte_courant,
             contenu_px: meilleure.contenu, deborde: false,
             raison: 'plus petite scène où la diapositive tient en entier',
             essais: essais, plancher_pc: plancher };
  }

  // Reposer la scène à une autre taille, et attendre que la mise en page ait suivi.
  async function redimensionnerScene(sc, scene) {
    sc.outer.style.width = scene.largeur + 'px';
    sc.outer.style.height = scene.hauteur + 'px';
    sc.outer.style.minWidth = scene.largeur + 'px';
    sc.outer.style.minHeight = scene.hauteur + 'px';
    await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
  }

  // ── Option « bloc courant seul » ────────────────────────────────────────────────────────────
  // Le lecteur empile : à l'étape 4, les blocs 1 à 3 restent à l'écran. Cette option ne montre
  // que le bloc de l'étape, avec le titre de la diapositive (qui est un <h2 class="adoc-sc-card-
  // title">, hors de .adoc-sc-block, donc conservé sans rien faire) et le bandeau photo.
  //
  // Le masquage se fait en `display:none` et NON par la classe du lecteur : `.adoc-sc-reveal`
  // masque en `opacity:0;visibility:hidden`, qui CONSERVENT la mise en page — la carte resterait
  // aussi haute qu'un empilement complet, et l'option ne servirait à rien.
  //
  // DÉSACTIVÉE PAR DÉFAUT : elle change ce que le spectateur voit, pas seulement la mesure, et
  // le CDC (Ef1) suppose un empilement cumulatif pour le fondu entre étapes.
  function appliquerBlocCourantSeul(inner, rang) {
    var blocs = inner.querySelectorAll('.adoc-sc-card > .adoc-sc-block');
    for (var i = 0; i < blocs.length; i++) {
      blocs[i].style.display = (i === rang) ? '' : 'none';
    }
    return blocs.length;
  }

  // ── Capture et composition ──────────────────────────────────────────────────────────────────
  // SnapDOM rastérise à l'échelle demandée, puis on COMPOSE sur un canvas aux dimensions exactes :
  // 1920×1080 pour une diapositive qui tient dans la scène. L'échelle 1920/1422 vaut 1,350210… et
  // 800 × 1,350210 fait 1080,17 : c'est la composition, avec ses dimensions écrites en entier, qui
  // garantit le 1080 exact. Dessiner sans l'imposer laisserait une image de 1081 px un jour sur
  // deux selon l'arrondi du navigateur.
  //
  // La scène 1422×800 a un rapport de 1,7775 là où 1920×1080 en a 1,7778 : la composition étire
  // donc le contenu de 0,17 px sur la hauteur. C'est dit, c'est mesurable, et c'est en dessous de
  // ce qui se voit — mais ce n'est pas zéro.
  async function capturer(snap, sc, hauteurCapture, attendue) {
    var echelle = SORTIE.largeur / attendue.largeur;
    var cibleH = (hauteurCapture === attendue.hauteur)
      ? SORTIE.hauteur
      : Math.round(hauteurCapture * echelle);
    var restaurer = null;
    if (hauteurCapture !== attendue.hauteur) {
      var outerStyle = sc.outer.style.cssText, innerStyle = sc.inner.style.cssText;
      sc.outer.style.height = hauteurCapture + 'px';
      sc.outer.style.overflow = 'visible';
      sc.inner.style.height = hauteurCapture + 'px';
      sc.inner.style.overflow = 'visible';
      restaurer = function () { sc.outer.style.cssText = outerStyle; sc.inner.style.cssText = innerStyle; };
    }
    try {
      // LE BANDEAU PHOTO SE MESURE ICI, et nulle part ailleurs : la scène vient d'être portée à
      // la hauteur de capture, et `max-height:45%` est un pourcentage de la hauteur de la CARTE.
      // Mesuré avant l'agrandissement, le bandeau serait donné plus petit qu'à l'image — c'est
      // le même piège que la troncature, déplacé d'un cran.
      var photoEl = sc.inner.querySelector('.adoc-sc-card-img');
      var photoH = 0, photoPlafond = null;
      if (photoEl) {
        photoH = Math.round(photoEl.getBoundingClientRect().height);
        photoPlafond = getComputedStyle(photoEl).maxHeight;
      }
      // LE BAS DE CE QUI PORTE DE L'ENCRE SE MESURE ICI AUSSI, et pour la même raison. Je l'avais
      // d'abord mesuré AVANT l'agrandissement : le contrôle des pixels a montré que la zone que
      // le travelling ne parcourait pas contenait l'encadré final et son texte — 350 000 pixels
      // de fond d'encadré et 34 000 pixels de texte. Agrandir la scène fait grandir le bandeau
      // photo (45 % de la carte), qui repousse tout le texte vers le bas : une mesure prise avant
      // l'agrandissement est toujours trop haute. C'est la troncature du 7 octobre, déplacée
      // d'un cran de plus — et cette fois ce sont les pixels qui l'ont dit, pas le code.
      var visibleScene = hauteurVisible(sc);
      var source = await snap.toCanvas(sc.inner, { scale: echelle });
      var sortie = document.createElement('canvas');
      sortie.width = SORTIE.largeur; sortie.height = cibleH;
      var ctx = sortie.getContext('2d');
      var fond = getComputedStyle(sc.inner).backgroundColor;
      var opaque = fond && fond !== 'transparent' && fond.indexOf('rgba(0, 0, 0, 0)') === -1;
      if (opaque) { ctx.fillStyle = fond; ctx.fillRect(0, 0, sortie.width, sortie.height); }
      ctx.drawImage(source, 0, 0, SORTIE.largeur, cibleH);
      return { canvas: sortie, largeur: sortie.width, hauteur: sortie.height,
               photo_px: photoH, photo_plafond_calcule: photoPlafond,
               visible_scene: visibleScene, visible_sortie: Math.round(visibleScene * echelle),
               source: { largeur: source.width, hauteur: source.height }, fond: opaque ? fond : null };
    } finally {
      if (restaurer) restaurer();
    }
  }
  function canvasVersBlob(canvas, type, qualite) {
    return new Promise(function (ok, ko) {
      canvas.toBlob(function (b) { b ? ok(b) : ko(new Error('toBlob a rendu null')); }, type, qualite);
    });
  }

  // ── La scène, pas à pas ─────────────────────────────────────────────────────────────────────
  // `rendreImages` est une boucle sur cette fonction, et non l'inverse : il n'y a donc qu'UNE
  // façon de monter une scène, de la positionner sur une étape et de la capturer.
  //
  // POURQUOI CETTE OUVERTURE EXISTE. Un pilote WebDriver — Safari réel — sérialise ses commandes :
  // impossible de photographier la page pendant qu'un script y tourne. Mesurer SnapDOM contre la
  // rastérisation native de Safari demande donc de pouvoir arrêter la scène sur une étape, rendre
  // la main, puis reprendre. Une boucle monolithique ne le permet pas, et réécrire le montage de
  // la scène dans l'outil de mesure aurait mesuré une autre scène que celle du produit.
  async function ouvrirScene(doc, options) {
    var base = (options && options.mode === 'fidele') ? MODE_FIDELE : MODE_VIDEO;
    var o = Object.assign({ modeCapture: true, type: 'image/png', qualite: undefined, mode: 'video',
                            seuilScission: SEUIL_SCISSION, masquerCitations: false,
                            toleranceDebordement: TOLERANCE_DEBORDEMENT, vitessePanMax: VITESSE_PAN_MAX,
                            // Les deux options du 8 octobre, À L'ARRÊT : mesurées, pas appliquées.
                            plafondPhoto: null, blocCourantSeul: false,
                            poseTravellingS: POSE_TRAVELLING_S,
                            plancherLisibilitePc: PLANCHER_LISIBILITE_PC,
                            sceneParDiapositive: base.sceneParDiapositive,
                            scene: base.scene, echelleTypo: base.echelleTypo }, options || {});
    // Une scène imposée explicitement l'emporte : on ne peut pas à la fois fixer la scène et
    // la laisser se choisir. Le relevé le dira.
    if (options && options.scene) o.sceneParDiapositive = false;
    // DEUX OPTIONS ÉCARTÉES PAR CHRISTOPHE le 9 octobre — tout le visuel reste présent. Elles
    // restent dans le moteur (mesurées le 8 octobre, elles peuvent redevenir utiles), mais
    // elles sont INCOMPATIBLES avec la scène par diapositive : leur plafond se calcule sur une
    // hauteur de scène, et il n'y en a plus une seule. Refuser est plus honnête que calculer
    // sur la mauvaise.
    if (o.sceneParDiapositive && (o.plafondPhoto > 0 || o.blocCourantSeul)) {
      throw new Error('le plafond de photo et « bloc courant seul » supposent une scène unique : '
        + 'ils ne peuvent pas se combiner à la scène par diapositive. Passez mode « fidele » ou '
        + 'une scène explicite si vous voulez les éprouver.');
    }
    var sceneExplicite = !!(options && options.scene);
    var scene = o.scene ? { largeur: o.scene.largeur, hauteur: o.scene.hauteur } : SCENE;

    if (!doc || doc.documentKind !== 'presentation') {
      throw new Error('le chutier visuel ne rend que des Présentations (documentKind reçu : ' + (doc && doc.documentKind) + ').');
    }
    if (typeof window.adocPresentStepList !== 'function'
      || typeof window.adocPresentResolveSlideHTML !== 'function'
      || typeof window.adocPresentApplyReveal !== 'function'
      || typeof window.adocPresentRevealNext !== 'function') {
      throw new Error('le lecteur n\'est pas chargé : atelier-images.js doit venir APRÈS studio-clinique-core.js.');
    }
    var ref = window.adocPresentReference;
    if (!sceneExplicite && (!ref || ref.largeur !== SCENE.largeur || ref.hauteur !== SCENE.hauteur)) {
      throw new Error('la référence du lecteur (' + (ref && ref.largeur) + 'x' + (ref && ref.hauteur)
        + ') ne correspond plus à la scène de ce moteur (' + SCENE.largeur + 'x' + SCENE.hauteur + ').');
    }

    var etapes = window.adocPresentStepList(doc);
    var cartes = (doc.blocks || []).filter(function (b) { return b && b.type === 'card'; });
    var snap = await chargerSnapdom();
    var plafondPhotoPx = (o.plafondPhoto > 0) ? Math.round(o.plafondPhoto * scene.hauteur) : 0;
    var sc = creerScene(Object.assign({ masquerCitations: !!o.masquerCitations,
                                        plafondPhotoPx: plafondPhotoPx }, scene));
    var etatPrecedent = window._adocPresentState;
    var modePrecedent = window._adocPresentModeCapture;
    window._adocPresentModeCapture = !!o.modeCapture;
    var position = { carte: -1, rang: -1 };
    var choixCarte = -1, choixParCarte = {};

    async function allerA(n) {
      var etape = etapes[n];
      if (!etape) throw new Error('étape ' + n + ' inexistante (' + etapes.length + ' étapes).');
      var iCarte = cartes.findIndex(function (c) { return c.id === etape.cardId; });
      var carte = cartes[iCarte];
      var deLaCarte = etapes.filter(function (e) { return e.cardId === etape.cardId; });
      var rang = deLaCarte.indexOf(etape);
      // La révélation ne sait qu'avancer : on remonte la carte dès qu'on recule ou qu'on change.
      if (iCarte !== position.carte || rang < position.rang) {
        sc.inner.innerHTML = await window.adocPresentResolveSlideHTML(carte, iCarte, cartes.length);
        window._adocPresentState = { doc: doc, index: iCarte, revealIndex: null, revealTotal: 0 };
        window.adocPresentApplyReveal(sc.inner, carte, false);
        position = { carte: iCarte, rang: 0 };
        // LA SCÈNE SE CHOISIT ICI, une fois par diapositive, et reste la même sur toutes ses
        // étapes. Les polices et les photos doivent être prêtes AVANT la mesure : une image
        // non décodée occupe 0 px, et la scène choisie serait trop petite (V9).
        if (o.sceneParDiapositive && iCarte !== choixCarte) {
          await attendreStabilite(sc.inner, o.modeCapture);
          var choix = await choisirScenePourCarte(sc, o);
          scene = choix.scene;
          choixParCarte[carte.id] = choix;
          choixCarte = iCarte;
        }
        verifierScene(sc, scene);
      }
      while (position.rang < rang) {
        if (!window.adocPresentRevealNext(sc.inner)) {
          throw new Error('le lecteur a refusé d\'avancer à l\'étape ' + (rang + 1) + ' de la carte ' + carte.id
            + ' : l\'énumération annonce ' + deLaCarte.length + ' étapes, la révélation n\'en connaît que '
            + window._adocPresentState.revealTotal + '.');
        }
        position.rang++;
      }
      if (o.blocCourantSeul) appliquerBlocCourantSeul(sc.inner, rang);
      appliquerEchelleTypo(sc.inner, o.echelleTypo);
      await attendreStabilite(sc.inner, o.modeCapture);
      return { etape: etape, carteIndex: iCarte, rang: rang, surRang: deLaCarte.length };
    }

    function mesurer() {
      var hauteurNecessaire = Math.max(scene.hauteur, hauteurContenu(sc));
      return verdictDebordement(hauteurNecessaire, scene.hauteur, {
        tolerance: o.toleranceDebordement, seuil: o.seuilScission,
        echelleSortie: SORTIE.largeur / scene.largeur, vitesseMax: o.vitessePanMax,
      });
    }

    async function capturerEtape(n, infos) {
      var etape = infos.etape;
      // LA HAUTEUR EST STABILISÉE JUSTE AVANT LA CAPTURE, et c'est elle qui fait foi partout :
      // verdict, métadonnées, et taille d'image.
      var stable = await stabiliserHauteur(sc, scene);
      var hauteurNecessaire = stable.hauteur;
      var deb = verdictDebordement(hauteurNecessaire, scene.hauteur, {
        tolerance: o.toleranceDebordement, seuil: o.seuilScission,
        dureeS: dureeEtapeS(doc, etape.stepId),
        echelleSortie: SORTIE.largeur / scene.largeur, vitesseMax: o.vitessePanMax,
      });
      var hauteurCapture = (deb.verdict === 'aucun') ? scene.hauteur : hauteurNecessaire;
      // LE REFUS. Une image plus courte que son contenu n'est jamais livrée : elle serait
      // crédible et fausse, ce qui est la pire espèce de défaut. La tolérance est la même zone
      // morte qu'ailleurs — quelques pixels de bruit de mise en page ne sont pas une troncature.
      if (!stable.converge) {
        throw new Error('hauteur non convergée après ' + stable.tours + ' tours pour l\'étape '
          + etape.stepId + ' (contenu ' + stable.contenu + ' px, hauteur retenue ' + stable.hauteur
          + ' px) — capture refusée.');
      }
      var tolContenu = o.toleranceDebordement || TOLERANCE_DEBORDEMENT;
      refuserSiTropCourte(stable.contenu, hauteurCapture, o.toleranceDebordement, etape.stepId);
      var capture = await capturer(snap, sc, hauteurCapture, scene);
      // CE QUI PORTE DE L'ENCRE À CETTE ÉTAPE, mesuré DANS la capture, à la hauteur où l'image
      // est vraiment composée. Voir le commentaire de `capturer`.
      var visible = capture.visible_scene;
      var visibleSortie = capture.visible_sortie;
      var blob = await canvasVersBlob(capture.canvas, o.type, o.qualite);
      var image = {
        stepId: etape.stepId, cardId: etape.cardId, cardIndex: infos.carteIndex,
        rang: etape.rang, surRang: etape.surRang, titre: etape.cardTitle,
        largeur: capture.largeur, hauteur: capture.hauteur,
        debordement: deb.verdict !== 'aucun', hauteurScene: hauteurNecessaire,
        // Les trois hauteurs qui manquaient le 7 octobre : ce que mesure le contenu, ce que
        // mesure l'image, et l'écart entre les deux. Le relevé les affiche, donc une troncature
        // ne peut plus passer en silence : elle a désormais une ligne à son nom.
        // DEUX NOMBRES, PAS UN. Le dépassement brut vaut quelques pixels sur presque toutes les
        // cartes : c'est le bruit de la mise en page (546 px mesurés pour 540 px de cadre sur la
        // présentation dense), et l'image ne montre aucune encre au bord. Appeler cela « coupé »
        // ferait crier le relevé à tort sur des images saines — et un relevé qui crie à tort
        // s'apprend à être ignoré, ce qui rouvre le défaut silencieux par l'autre bout.
        // `coupe_px` ne compte donc que ce qui dépasse la zone morte, c'est-à-dire exactement
        // ce que le refus rejette : au-delà de zéro, l'image n'est pas livrée.
        hauteur_contenu: stable.contenu, hauteur_capture: hauteurCapture,
        depassement_px: Math.max(0, stable.contenu - hauteurCapture),
        zone_morte_px: Math.ceil(hauteurCapture * tolContenu) - hauteurCapture,
        coupe_px: Math.max(0, stable.contenu - Math.ceil(hauteurCapture * tolContenu)),
        hauteur_avant_stabilisation: stable.hauteur_avant_stabilisation,
        tours_stabilisation: stable.tours,
        debordement_px: deb.px, debordement_rapport: deb.rapport, debordement_verdict: deb.verdict,
        debordement_px_sortie: Math.round(deb.px * (SORTIE.largeur / scene.largeur)),
        debordement_regle: deb.regle, debordement_sous_tolerance: deb.sous_tolerance,
        debordement_vitesse_px_par_s: deb.vitesse_px_par_s,
        // LE PLAN DE TRAVELLING, en pixels de l'IMAGE LIVRÉE et non de la scène : il est calculé
        // sur la hauteur de l'image telle qu'elle sort, donc sur ce qui défilera vraiment.
        //
        // null quand l'image tient dans le cadre : il n'y a alors rien à faire défiler. Quand il
        // existe mais que `tenable` est faux, l'image est livrée ET la scission est conseillée —
        // le plan dit alors pourquoi, avec la vitesse qu'il aurait fallu tenir.
        // LA COURSE EST CELLE DU VISIBLE, bornée par la hauteur de l'image : on ne fait pas
        // défiler du vide, et on ne défile jamais plus loin que ce qui existe.
        hauteur_visible: visible, hauteur_visible_sortie: visibleSortie,
        travelling: planTravelling(Math.min(capture.hauteur, visibleSortie) - SORTIE.hauteur,
                                   dureeEtapeS(doc, etape.stepId),
                                   { vitesseMax: o.vitessePanMax, poseS: o.poseTravellingS }),
        scission_conseillee: deb.verdict === 'scission',
        fond: capture.fond,
        // Hauteur du bandeau photo telle qu'elle est À L'IMAGE : en pixels de scène, et en
        // pourcentage du cadre comme de l'image livrée. Les deux diffèrent dès qu'il y a
        // débordement, et c'est justement la question posée le 8 octobre.
        photo_px: capture.photo_px,
        photo_pc_cadre: capture.photo_px ? +((capture.photo_px / scene.hauteur) * 100).toFixed(1) : 0,
        photo_pc_image: capture.photo_px ? +((capture.photo_px / hauteurCapture) * 100).toFixed(1) : 0,
        photo_plafond_calcule: capture.photo_plafond_calcule,
        // LA SCÈNE RETENUE POUR CETTE DIAPOSITIVE, et pourquoi. Un réglage qu'on ne peut pas
        // lire est un réglage qu'on finit par croire sur parole — déjà vu le 7 octobre.
        scene_largeur: scene.largeur, scene_hauteur: scene.hauteur,
        scene_choisie: !!o.sceneParDiapositive,
        scene_raison: (choixParCarte[etape.cardId] || {}).raison || null,
        // `texte_pc` est le CORPS de texte en % de la hauteur du cadre — pas le titre. Le nom
        // précédent disait « texte » pour une valeur qui mesurait le titre : la colonne du
        // relevé en était fausse d'un facteur 1,5.
        corps_px: (choixParCarte[etape.cardId] || {}).taille_px || null,
        texte_pc: (choixParCarte[etape.cardId] || {}).texte_pc || null,
        plus_petit_texte_px: (choixParCarte[etape.cardId] || {}).plus_petit_px || null,
        plus_petit_texte_pc: (choixParCarte[etape.cardId] || {}).plus_petit_pc || null,
        plancher_pc: (choixParCarte[etape.cardId] || {}).plancher_pc || null,
        scene_essais: ((choixParCarte[etape.cardId] || {}).essais || []).length,
        signature: await signatureEtape(doc, etape),
        type: o.type, octets: blob.size, blob: blob,
        // `display:none` est filtré ici : avec « bloc courant seul », les blocs précédents
        // portent encore la classe « révélé » du lecteur alors qu'ils ne sont plus à l'image.
        // Des métadonnées qui décrivent autre chose que l'image sont exactement le défaut
        // crédible du 7 octobre, sous une autre forme.
        textes: Array.from(sc.inner.querySelectorAll('.adoc-sc-card > .adoc-sc-block.adoc-sc-reveal-shown, .adoc-sc-card > .adoc-sc-block:not(.adoc-sc-reveal)'))
          .filter(function (el) { return getComputedStyle(el).display !== 'none'; })
          .map(function (el) { return (el.textContent || '').trim().replace(/\s+/g, ' '); }),
      };
      capture.canvas.width = 0; capture.canvas.height = 0;
      return image;
    }

    return {
      etapes: etapes, sortie: SORTIE, options: o,
      get scene() { return scene; },
      choixParCarte: choixParCarte,
      plafondPhotoPx: plafondPhotoPx,
      inner: sc.inner, outer: sc.outer, hote: sc.hote,
      allerA: allerA, capturerEtape: capturerEtape, mesurer: mesurer,
      fermer: function () {
        window._adocPresentState = etatPrecedent;
        window._adocPresentModeCapture = modePrecedent;
        sc.retirer();
      },
    };
  }

  // ── Le rendu complet ────────────────────────────────────────────────────────────────────────
  // Une boucle sur ouvrirScene, rien de plus.
  async function rendreImages(doc, options) {
    var o = options || {};
    var t0 = performance.now();
    var sc = await ouvrirScene(doc, o);
    var images = [];
    try {
      for (var n = 0; n < sc.etapes.length; n++) {
        var infos = await sc.allerA(n);
        var inspection = null;
        if (o.inspecter) {
          try { inspection = await o.inspecter(sc.inner, sc.etapes[n], sc.scene, sc); }
          catch (e) { inspection = { erreur: String(e && e.message || e) }; }
        }
        var image = await sc.capturerEtape(n, infos);
        image.inspection = inspection;
        images.push(image);
        if (o.surAvancement) {
          try { o.surAvancement({ fait: images.length, total: sc.etapes.length, stepId: image.stepId }); } catch (e) {}
        }
      }
    } finally {
      sc.fermer();
    }
    return {
      images: images,
      etapes_annoncees: sc.etapes.length,
      duree_ms: Math.round(performance.now() - t0),
      octets_total: images.reduce(function (a, im) { return a + im.octets; }, 0),
      scene: sc.scene, sortie: SORTIE, echelle_typo: sc.options.echelleTypo,
      mode: sc.options.mode, seuil_scission: sc.options.seuilScission,
      citations_masquees: !!sc.options.masquerCitations,
      sources: sourcesParEtape(doc),
      tolerance_debordement: sc.options.toleranceDebordement, vitesse_pan_max: sc.options.vitessePanMax,
      pose_travelling_s: sc.options.poseTravellingS,
      // LES TRAVELLINGS, RÉSUMÉS : combien d'étapes défilent, celles qui ne peuvent pas et
      // attendent une scission, celles dont la durée manque encore, et la course la plus longue.
      travellings: (function (ims) {
        var avec = ims.filter(function (im) { return im.travelling; });
        var tenables = avec.filter(function (im) { return im.travelling.tenable === true; });
        var vitesses = tenables.map(function (im) { return im.travelling.vitesse_px_par_s; });
        return {
          nombre: avec.length, tenables: tenables.length,
          // LES ÉTAPES QUI DÉBORDENT SANS AVOIR RIEN À FAIRE DÉFILER. Mesuré sur la vraie
          // présentation : la diapositive à questionnaire déborde à ses quatre étapes, et une
          // seule porte une course — les trois premières ne montrent que le haut. Sans ce
          // nombre, le relevé dirait « 4 à faire défiler » et « 1 travelling » sans expliquer
          // l'écart, ce qui est la même contradiction que celle du 9 octobre sous un autre nom.
          sans_course: ims.filter(function (im) { return im.debordement && !im.travelling; }).length,
          sans_duree: avec.filter(function (im) { return im.travelling.tenable === null; }).length,
          // CE QUI EST À SCINDER SE LIT SUR LE VERDICT, ET NON SUR LE SEUL PLAN. Mesuré sur la
          // vraie présentation de Christophe : quatre étapes y étaient « scission » dans la
          // ligne des débordements et « 0 à scinder » dans celle des travellings. Les deux
          // phrases étaient vraies sous leur propre règle, et ensemble elles étaient fausses —
          // l'export ne porte aucune narration, donc le plan n'avait pas de durée tandis que le
          // verdict tranchait sur le rapport. Un relevé qui se contredit ne s'interprète pas.
          // À SCINDER SE COMPTE SUR TOUTES LES ÉTAPES, et non sur les seules qui portent un
          // plan. Le conseil porte sur la DIAPOSITIVE : elle dépasse le seuil, donc elle est à
          // découper. Ses premières étapes n'ont rien à faire défiler — elles ne montrent que le
          // haut — mais elles appartiennent à la même diapositive, et les taire ferait dire au
          // résumé « 1 à scinder » là où la ligne des débordements en compte 2.
          a_scinder: ims.filter(function (im) { return im.scission_conseillee; })
            .map(function (im) {
              return { stepId: im.stepId, regle: im.debordement_regle,
                       raison: (im.travelling && im.travelling.tenable === false)
                         ? im.travelling.raison
                         : 'rapport ' + im.debordement_rapport + ' au-delà du seuil de '
                           + sc.options.seuilScission
                           + (im.debordement_regle === 'rapport'
                              ? ', et la durée du commentaire n\'est pas encore connue : la '
                                + 'narration pourrait en décider autrement' : '') };
            }),
          course_max_px: avec.reduce(function (a, im) { return Math.max(a, im.travelling.course_px); }, 0),
          vitesse_max_px_par_s: vitesses.length ? Math.max.apply(null, vitesses) : null,
        };
      })(images),
      // Les deux options du 8 octobre, dites dans le relevé : une mesure dont on ne sait pas
      // sous quel réglage elle a été prise ne vaut rien — la page du banc l'a déjà prouvé le 7.
      scene_par_diapositive: !!sc.options.sceneParDiapositive,
      plancher_lisibilite_pc: sc.options.plancherLisibilitePc,
      scenes_par_carte: sc.choixParCarte || {},
      plafond_photo: sc.options.plafondPhoto || null,
      plafond_photo_px: sc.plafondPhotoPx || 0,
      bloc_courant_seul: !!sc.options.blocCourantSeul,
      scene_par_defaut: !(options && options.scene),
      debordements: {
        aucun: images.filter(function (im) { return im.debordement_verdict === 'aucun'; }).length,
        defilement: images.filter(function (im) { return im.debordement_verdict === 'defilement'; }).length,
        scission: images.filter(function (im) { return im.debordement_verdict === 'scission'; }).length,
      },
      mode_capture: !!sc.options.modeCapture,
      attente_animations_ms: sc.options.modeCapture ? 0 : ATTENTE_ANIMATIONS_MS,
      snapdom: SNAPDOM_VERSION, moteur: MOTEUR_VERSION,
    };
  }

  // ── Péremption (V4) ─────────────────────────────────────────────────────────────────────────
  // On SIGNALE, on ne remplace jamais en silence. Rend la liste des étapes périmées, celles qui
  // ont disparu et celles qui sont nouvelles — trois états distincts, parce qu'ils n'appellent pas
  // la même décision.
  async function comparerAuDocument(images, doc) {
    var etapes = window.adocPresentStepList(doc);
    var parId = {};
    images.forEach(function (im) { parId[im.stepId] = im; });
    var perimees = [], nouvelles = [], intactes = [];
    for (var i = 0; i < etapes.length; i++) {
      var attendue = await signatureEtape(doc, etapes[i]);
      var im = parId[etapes[i].stepId];
      if (!im) nouvelles.push(etapes[i].stepId);
      else if (im.signature !== attendue) perimees.push(etapes[i].stepId);
      else intactes.push(etapes[i].stepId);
    }
    var vivantes = {};
    etapes.forEach(function (e) { vivantes[e.stepId] = 1; });
    var disparues = images.filter(function (im) { return !vivantes[im.stepId]; })
      .map(function (im) { return im.stepId; });
    return { perimees: perimees, nouvelles: nouvelles, disparues: disparues,
             intactes: intactes, a_jour: !perimees.length && !nouvelles.length && !disparues.length };
  }

  // ── Décodage, une seule à la fois (V5) ──────────────────────────────────────────────────────
  // Une image 1920×1080 décodée pèse environ 8,3 Mo. Quarante images décodées en même temps font
  // 332 Mo pour rien. On n'en tient donc qu'UNE : la précédente est fermée avant que la suivante
  // n'existe, et le compteur est lisible pour qu'un test puisse l'exiger.
  // Le compteur suit les bitmaps VIVANTS, pas celui qu'on a pris la peine de noter. La nuance
  // n'est pas théorique : la première version comptait `_decodee ? 1 : 0`, si bien qu'en retirant
  // la libération, l'ancien bitmap fuyait et le compteur annonçait toujours 1. La falsification
  // l'a montrée creuse. Un compteur qui ne peut pas voir la fuite qu'il est censé interdire ne
  // sert à rien.
  var _decodee = null;
  var _bitmapsVivants = 0;
  function fermerBitmap(bm) {
    if (!bm) return;
    if (bm.close) { try { bm.close(); } catch (e) {} }
    _bitmapsVivants = Math.max(0, _bitmapsVivants - 1);
  }
  async function ouvrirBitmap(blob) {
    var bm = await createImageBitmap(blob);
    _bitmapsVivants++;
    return bm;
  }
  function libererDecodee() {
    if (_decodee) { fermerBitmap(_decodee.bitmap); _decodee = null; }
  }
  async function decoder(im) {
    libererDecodee();
    var bitmap = await ouvrirBitmap(im.blob);
    _decodee = { stepId: im.stepId, bitmap: bitmap };
    return bitmap;
  }
  function nombreDecodees() { return _bitmapsVivants; }

  // ── Export d'images (V5) ────────────────────────────────────────────────────────────────────
  // JPEG de haute qualité pour l'export d'images, PNG pour la vidéo : le texte fin souffre de la
  // compression JPEG, et c'est un risque nommé au CDC. La qualité par défaut est donc haute.
  async function versType(im, type, qualite) {
    var bitmap = await ouvrirBitmap(im.blob);
    try {
      var c = document.createElement('canvas');
      c.width = im.largeur; c.height = im.hauteur;
      var ctx = c.getContext('2d');
      // Un JPEG n'a pas de transparence : sans ce fond, une image transparente sortirait noire.
      if (type === 'image/jpeg') { ctx.fillStyle = im.fond || '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(bitmap, 0, 0);
      var blob = await canvasVersBlob(c, type, qualite);
      c.width = 0; c.height = 0;
      return blob;
    } finally {
      fermerBitmap(bitmap);
    }
  }
  // Nom de fichier conforme à X5 : sans espace ni accent, trié dans l'ordre.
  function nomFichier(im, extension) {
    return String(im.cardIndex + 1).padStart(3, '0') + '-' + String(im.rang).padStart(2, '0')
      + '-' + im.stepId.replace(/[^a-zA-Z0-9-]/g, '-') + '.' + extension;
  }

  window.AtelierImages = {
    MOTEUR_VERSION: MOTEUR_VERSION, SNAPDOM_VERSION: SNAPDOM_VERSION,
    SCENE: SCENE, SORTIE: SORTIE, ATTENTE_ANIMATIONS_MS: ATTENTE_ANIMATIONS_MS,
    MODE_VIDEO: MODE_VIDEO, MODE_FIDELE: MODE_FIDELE, SEUIL_SCISSION: SEUIL_SCISSION,
    TOLERANCE_DEBORDEMENT: TOLERANCE_DEBORDEMENT, VITESSE_PAN_MAX: VITESSE_PAN_MAX,
    verdictDebordement: verdictDebordement, dureeEtapeS: dureeEtapeS,
    refuserSiTropCourte: refuserSiTropCourte,
    POSE_TRAVELLING_S: POSE_TRAVELLING_S, planTravelling: planTravelling,
    mesureTexte: mesureTexte, taillesTexte: taillesTexte, hauteurVisible: hauteurVisible,
    PLANCHER_LISIBILITE_PC: PLANCHER_LISIBILITE_PC, SCENE_LARGEUR_MIN: SCENE_LARGEUR_MIN,
    sceneDeLargeur: sceneDeLargeur, partTexte: partTexte, largeurMaxLisible: largeurMaxLisible,
    tailleCorpsPx: tailleCorpsPx, choisirScenePourCarte: choisirScenePourCarte,
    attendreImages: attendreImages, ATTENTE_IMAGES_MS: ATTENTE_IMAGES_MS,
    sourcesParEtape: sourcesParEtape,
    configurer: function (opts) { if (opts && opts.cheminSnapdom) { _cheminSnapdom = opts.cheminSnapdom; _snapdom = null; } },
    cheminSnapdom: function () { return _cheminSnapdom; },
    signatureEtape: signatureEtape,
    rendreImages: rendreImages, ouvrirScene: ouvrirScene,
    comparerAuDocument: comparerAuDocument,
    decoder: decoder, libererDecodee: libererDecodee, nombreDecodees: nombreDecodees,
    versType: versType, nomFichier: nomFichier,
  };
})();
