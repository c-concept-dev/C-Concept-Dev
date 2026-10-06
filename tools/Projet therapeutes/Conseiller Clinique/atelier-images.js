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
  var SCENE = { largeur: 1422, hauteur: 800 };
  var SORTIE = { largeur: 1920, hauteur: 1080 };
  var ATTENTE_ANIMATIONS_MS = 800;     // V6 : transition de révélation (220 ms) + nombre (700 ms)

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
    '[data-atelier-capture] .adoc-sc-quiz{border:0;border-radius:0;padding-left:0;padding-right:0;}';
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
    var inner = document.createElement('div');
    inner.className = 'cc-ws-present-slide-inner';
    // La marque de capture : c'est elle, et elle seule, qui active CSS_CAPTURE.
    inner.setAttribute('data-atelier-capture', '');
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
  async function attendreStabilite(inner, modeCapture) {
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
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
  function mesurerHauteurNecessaire(sc, attendue) {
    var carte = sc.inner.querySelector('.adoc-sc-card');
    var h = Math.max(sc.inner.scrollHeight, carte ? carte.scrollHeight : 0);
    return Math.max(attendue.hauteur, h);
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
      var source = await snap.toCanvas(sc.inner, { scale: echelle });
      var sortie = document.createElement('canvas');
      sortie.width = SORTIE.largeur; sortie.height = cibleH;
      var ctx = sortie.getContext('2d');
      var fond = getComputedStyle(sc.inner).backgroundColor;
      var opaque = fond && fond !== 'transparent' && fond.indexOf('rgba(0, 0, 0, 0)') === -1;
      if (opaque) { ctx.fillStyle = fond; ctx.fillRect(0, 0, sortie.width, sortie.height); }
      ctx.drawImage(source, 0, 0, SORTIE.largeur, cibleH);
      return { canvas: sortie, largeur: sortie.width, hauteur: sortie.height,
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

  // ── Le rendu complet ────────────────────────────────────────────────────────────────────────
  async function rendreImages(doc, options) {
    // `inspecter` reçoit la scène VIVANTE juste avant la capture et ce qu'elle rend est rangé
    // dans l'image. C'est le seul moyen d'observer ce que SnapDOM va rastériser sans ouvrir une
    // seconde scène ailleurs, qui mesurerait autre chose que celle-ci (régression #6).
    var o = Object.assign({ modeCapture: true, type: 'image/png', qualite: undefined,
                            surAvancement: null, inspecter: null,
                            scene: null, echelleTypo: 1 }, options || {});
    // La scène de travail : celle du lecteur par défaut, une autre si on l'impose explicitement.
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
    // La référence du lecteur fait foi sur la taille de scène : si le cœur la changeait un jour,
    // ce moteur doit s'arrêter, pas capturer à une taille qui n'est plus celle de l'écran.
    // Le garde-fou ne porte que sur le DÉFAUT : si le cœur changeait sa référence, le moteur doit
    // s'arrêter au lieu de capturer à une taille qui n'est plus celle de l'écran. Une scène
    // imposée explicitement est un essai assumé, et elle est reportée dans le relevé.
    var ref = window.adocPresentReference;
    if (!o.scene && (!ref || ref.largeur !== SCENE.largeur || ref.hauteur !== SCENE.hauteur)) {
      throw new Error('la référence du lecteur (' + (ref && ref.largeur) + 'x' + (ref && ref.hauteur)
        + ') ne correspond plus à la scène de ce moteur (' + SCENE.largeur + 'x' + SCENE.hauteur + ').');
    }

    var etapes = window.adocPresentStepList(doc);
    var snap = await chargerSnapdom();
    var sc = creerScene(scene);
    var etatPrecedent = window._adocPresentState;
    var modePrecedent = window._adocPresentModeCapture;
    var t0 = performance.now();
    var images = [];
    var cartes = (doc.blocks || []).filter(function (b) { return b && b.type === 'card'; });
    try {
      window._adocPresentModeCapture = !!o.modeCapture;
      for (var i = 0; i < cartes.length; i++) {
        var carte = cartes[i];
        var deLaCarte = etapes.filter(function (e) { return e.cardId === carte.id; });
        if (!deLaCarte.length) continue;
        sc.inner.innerHTML = await window.adocPresentResolveSlideHTML(carte, i, cartes.length);
        verifierScene(sc, scene);
        // L'état du lecteur, le temps de la capture seulement. adocPresentRevealNext le lit et
        // l'avance ; on le restaure à la fin pour ne jamais laisser le vrai lecteur dérangé.
        window._adocPresentState = { doc: doc, index: i, revealIndex: null, revealTotal: 0 };
        window.adocPresentApplyReveal(sc.inner, carte, false);
        for (var r = 0; r < deLaCarte.length; r++) {
          if (r > 0) {
            var avance = window.adocPresentRevealNext(sc.inner);
            if (!avance) {
              throw new Error('le lecteur a refusé d\'avancer à l\'étape ' + (r + 1) + ' de la carte ' + carte.id
                + ' : l\'énumération annonce ' + deLaCarte.length + ' étapes, la révélation n\'en connaît que '
                + window._adocPresentState.revealTotal + '.');
            }
          }
          // L'échelle typographique AVANT l'attente de stabilité : elle change la mise en page,
          // et c'est la mise en page d'après qui doit se stabiliser.
          appliquerEchelleTypo(sc.inner, o.echelleTypo);
          await attendreStabilite(sc.inner, o.modeCapture);
          var inspection = null;
          if (o.inspecter) { try { inspection = o.inspecter(sc.inner, deLaCarte[r], scene); } catch (e) { inspection = { erreur: String(e && e.message || e) }; } }
          var hauteurNecessaire = mesurerHauteurNecessaire(sc, scene);
          var debordement = hauteurNecessaire > scene.hauteur;
          var capture = await capturer(snap, sc, hauteurNecessaire, scene);
          var blob = await canvasVersBlob(capture.canvas, o.type, o.qualite);
          var etape = deLaCarte[r];
          images.push({
            stepId: etape.stepId, cardId: etape.cardId, cardIndex: i, rang: etape.rang,
            surRang: etape.surRang, titre: etape.cardTitle,
            largeur: capture.largeur, hauteur: capture.hauteur,
            debordement: debordement, hauteurScene: hauteurNecessaire,
            fond: capture.fond,
            signature: await signatureEtape(doc, etape),
            type: o.type, octets: blob.size, blob: blob, inspection: inspection,
            // Ce que le DOM portait À L'INSTANT de la capture. C'est la seule preuve possible
            // qu'aucun nombre n'a été saisi en cours d'animation (V6) : un test peut l'exiger
            // égal au texte final, au lieu de faire confiance à un délai.
            textes: Array.from(sc.inner.querySelectorAll('.adoc-sc-card > .adoc-sc-block.adoc-sc-reveal-shown, .adoc-sc-card > .adoc-sc-block:not(.adoc-sc-reveal)'))
              .map(function (el) { return (el.textContent || '').trim().replace(/\s+/g, ' '); }),
          });
          // Le canvas est relâché tout de suite : seule la forme COMPRESSÉE est gardée (V5).
          capture.canvas.width = 0; capture.canvas.height = 0;
          if (o.surAvancement) {
            try { o.surAvancement({ fait: images.length, total: etapes.length, stepId: etape.stepId }); } catch (e) {}
          }
        }
      }
    } finally {
      window._adocPresentState = etatPrecedent;
      window._adocPresentModeCapture = modePrecedent;
      sc.retirer();
    }
    return {
      images: images,
      etapes_annoncees: etapes.length,
      duree_ms: Math.round(performance.now() - t0),
      octets_total: images.reduce(function (a, im) { return a + im.octets; }, 0),
      scene: scene, sortie: SORTIE, echelle_typo: o.echelleTypo,
      scene_par_defaut: !o.scene,
      mode_capture: !!o.modeCapture,
      attente_animations_ms: o.modeCapture ? 0 : ATTENTE_ANIMATIONS_MS,
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
    configurer: function (opts) { if (opts && opts.cheminSnapdom) { _cheminSnapdom = opts.cheminSnapdom; _snapdom = null; } },
    cheminSnapdom: function () { return _cheminSnapdom; },
    signatureEtape: signatureEtape,
    rendreImages: rendreImages,
    comparerAuDocument: comparerAuDocument,
    decoder: decoder, libererDecodee: libererDecodee, nombreDecodees: nombreDecodees,
    versType: versType, nomFichier: nomFichier,
  };
})();
