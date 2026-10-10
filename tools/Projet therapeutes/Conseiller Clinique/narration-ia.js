// ── LOT 1b — « RÉDIGER LA NARRATION » (second appel dédié) ───────────────────────────────────
//
// Fichier SÉPARÉ de studio-clinique-core.js, comme atelier-images.js : décision « Module à part »
// du CDC v2. Le cœur ne reçoit que deux points d'accroche (un bouton dans la boîte Narration du
// lot 1a, et un appel à `NarrationIA.brancher`) ; tout le reste vit ici.
//
// CE QUE CE LOT N'A PAS BESOIN DE CHANGER : le Worker. Mesuré, pas supposé — le second appel
// existant (« appel 2 », génération structurée) poste déjà au proxy racine du Worker, qui est
// protégé par la garde générique : origine fixe ADOC_ALLOWED_ORIGIN, X-API-Key obligatoire en
// fail-closed, et 60 requêtes par minute et par IP. Une route neuve n'ajouterait rien que cette
// garde ne donne déjà, et tout fichier de Worker/** arrivant sur main déclenche un déploiement.
// Le principe 0E de la gouvernance (« usage réel avant nouvelle construction ») tranche.
(function () {
  'use strict';

  // ── Constantes, toutes nommées et justifiées ───────────────────────────────────────────────
  // N3 du CDC : la durée d'un commentaire est son nombre de mots divisé par 2,5. Le lot 1a porte
  // déjà cette constante (ADOC_NARRATION_MOTS_PAR_SECONDE) ; on la relit plutôt que de la
  // redéclarer, pour qu'un futur changement ne crée pas deux vérités.
  function motsParSeconde() {
    return (typeof window.ADOC_NARRATION_MOTS_PAR_SECONDE === 'number')
      ? window.ADOC_NARRATION_MOTS_PAR_SECONDE : 2.5;
  }

  var DUREE_DEFAUT_MIN = 8;          // proposition de départ, modifiable dans le champ
  var DUREE_MIN = 1, DUREE_MAX = 60; // bornes du champ

  // BORNES PAR ÉTAPE, avec leur justification (à juger par Christophe) :
  //  · 15 mots ≈ 6 secondes. En dessous, l'image change avant que l'oreille ait suivi : le
  //    commentaire devient un hoquet plutôt qu'une phrase.
  //  · 120 mots ≈ 48 secondes. Au-delà, le spectateur regarde une image fixe trop longtemps —
  //    et c'est aussi ce qui pousse une diapositive à déborder, mesuré au lot 2.
  var MOTS_MIN_ETAPE = 15;
  var MOTS_MAX_ETAPE = 120;

  // LE POIDS D'UNE ÉTAPE, en deux facteurs — parce qu'un seul ne suffisait pas.
  //
  // 1. LE TYPE du bloc. Un titre n'appelle pas le même commentaire qu'un paragraphe : il
  //    annonce, et le commentaire l'introduit sans le développer. Une liste porte plusieurs
  //    éléments à illustrer. Un questionnaire doit être expliqué, d'autant que le spectateur
  //    d'une vidéo ne peut pas y répondre.
  // 2. LA LONGUEUR, mais par sa RACINE, jamais proportionnellement. Le commentaire ajoute une
  //    couche, il ne relit pas : un paragraphe de cent mots demande plus qu'un de neuf, mais pas
  //    onze fois plus. La racine donne 10 contre 3, soit un rapport de 3,3 — défendable à
  //    l'oreille. Le rapport linéaire donnait 11 contre 1, ce qui affamait les titres.
  var POIDS_TYPE = {
    heading: 0.6,         // annonce : le commentaire ouvre, il ne développe pas
    paragraph: 1.0,       // la référence
    callout: 1.0,         // une idée clé, qui mérite son commentaire
    quote: 1.0,           // une citation se laisse respirer, puis se commente
    list: 1.2,            // plusieurs éléments à illustrer
    table: 1.1,           // un tableau se lit mal à l'oral : il faut guider
    questionnaire: 1.3,   // à expliquer, et le spectateur ne peut pas y répondre
    quiz: 1.3,
    image: 0.8,           // pas de texte à commenter, mais une image à faire parler
    video: 0.8,
    card: 0.8,            // une carte sans bloc : le titre seul
  };
  function poidsEtape(e) {
    var type = POIDS_TYPE[e.type] != null ? POIDS_TYPE[e.type] : 1.0;
    return type * Math.max(1, Math.sqrt(compterMots(e.texte)));
  }

  // TOLÉRANCE DE LONGUEUR : ±20 %, avec un plancher de 5 mots. 20 % de 60 mots font 12 mots,
  // soit environ 5 secondes — inaudible comme défaut de rythme. Le plancher évite qu'une cible
  // de 15 mots soit refusée pour 3 mots d'écart, ce qu'aucun modèle ne sait éviter.
  var TOLERANCE = 0.20;
  var TOLERANCE_PLANCHER = 5;

  // BUDGET DE DÉLAI, par la règle maison : 90 s pour 8 000 jetons, proportionnel. Le plancher
  // est le délai de transport de l'appel 2 existant (45 s) : descendre en dessous contredirait
  // un précédent déjà mesuré dans ce dépôt.
  var BUDGET_MS_POUR_8000_JETONS = 90000;
  // PLANCHER PORTÉ DE 45 À 90 s le 9 octobre. Les 45 s venaient du délai de TRANSPORT de
  // l'appel 2 (ADOC_CALL2_TRANSPORT_TIMEOUT_MS), qui se réarme à chaque octet reçu : c'est un
  // seuil de SILENCE, pas une durée totale. Ce transport-ci ne lit pas un flux, il attend une
  // réponse entière — environ 3 000 jetons pour 1 200 mots, qui dépassent couramment 45 s. Le
  // précédent qui convient est l'autre minuterie du même appel, la sémantique, portée à 120 s
  // après mesure. 90 s se place entre les deux et coïncide avec la règle maison à 8 000 jetons.
  var BUDGET_PLANCHER_MS = 90000;
  var BUDGET_PLAFOND_MS = 300000;

  // Conversion mots → jetons pour le français : ~1,6 jeton par mot (un mot français fait en
  // moyenne 5 caractères, un jeton ~3,5), plus 25 % pour l'enveloppe JSON (identifiants
  // d'étape, guillemets, échappements), plus un plancher pour les très courtes présentations.
  var JETONS_PAR_MOT = 1.6;
  var MARGE_JSON = 1.25;
  var JETONS_PLANCHER = 500;
  var JETONS_PLAFOND = 16000;

  // Le modèle : celui de la génération existante, jamais un autre choisi ici.
  var MODELE = 'claude-sonnet-4-6';

  // MARQUES DE PAUSE, compatibles R8 (« une marque de pause ajoute un silence réglable et n'est
  // pas lue »). Syntaxe finale proposée : [pause] pour le silence par défaut, [pause 2 s] pour
  // une durée donnée (décimale acceptée, virgule ou point). Crochets plutôt qu'accolades ou
  // balises : rien dans un texte français courant ne ressemble à « [pause] », alors qu'une
  // parenthèse est un signe de ponctuation ordinaire. Ces marques ne comptent JAMAIS dans le
  // nombre de mots, puisqu'elles ne sont pas prononcées.
  // Le motif vient du cœur (ADOC_NARRATION_PAUSE_MOTIF), jamais d'une copie : l'éditeur du lot
  // 1a et ce module doivent compter EXACTEMENT pareil, sinon l'aperçu annonce une durée que le
  // champ contredit. Repli seulement si le cœur est plus ancien que ce module.
  function motifPause() {
    return window.ADOC_NARRATION_PAUSE_MOTIF || '\\[pause(?:\\s+\\d+(?:[.,]\\d+)?\\s*s)?\\]';
  }
  function pauseRe() { return new RegExp(motifPause(), 'gi'); }

  // Borne d'entrée : au-delà, on refuse AVANT d'appeler, plutôt que de laisser le fournisseur
  // ou le Worker trancher par un message obscur.
  var ENTREE_MAX_CARACTERES = 60000;

  // ── LES SERVICES DU CŒUR, injectés ─────────────────────────────────────────────────────────
  // adocGetWorkerUrl et adocGetApiKey sont déclarées DANS l'IIFE du cœur, sans affectation sur
  // window : le module ne peut pas les voir. Le cœur les lui passe donc à `brancher`. Elles sont
  // gardées ici, dans la portée du module — la clé n'est jamais posée sur window, et le module
  // ne la conserve pas : il appelle `cleApi()` au moment de l'envoi, pas avant.
  var _services = null;
  function services() { return _services; }

  // Un message d'erreur ne doit JAMAIS contenir la clé. Le serveur n'a aucune raison de la
  // renvoyer, mais un message d'erreur est une chose qui se copie-colle dans une conversation :
  // on la retire avant de lever, plutôt que d'espérer qu'elle n'y soit pas.
  function sansCle(message) {
    var m = String(message == null ? '' : message);
    try {
      var cle = _services && _services.cleApi && _services.cleApi();
      if (cle && String(cle).length >= 8) m = m.split(String(cle)).join('[clé masquée]');
    } catch (e) {}
    return m;
  }

  // ── Compter les mots comme ils seront DITS ─────────────────────────────────────────────────
  // UNE SEULE IMPLÉMENTATION, celle du lot 1a. Un second compteur, même « meilleur », ferait
  // diverger l'aperçu du module et le compte affiché sous le champ — deux vérités pour le même
  // texte. C'est la régression #8 de la gouvernance (vérifier tous les consommateurs d'un champ
  // avant d'y brancher un nouvel usage).
  function compterMots(texte) {
    if (typeof window.adocNarrationCount === 'function') return window.adocNarrationCount(texte).mots;
    return String(texte || '').replace(pauseRe(), ' ').trim().split(/\s+/).filter(Boolean).length;
  }

  function dureeSecondes(texte) { return compterMots(texte) / motsParSeconde(); }

  // ── Le contenu d'une étape, tel qu'il sera à l'écran ───────────────────────────────────────
  function texteDuBloc(b) {
    if (!b || !b.content) return '';
    var c = b.content;
    if (typeof c.text === 'string') return c.text;
    if (Array.isArray(c.items)) return c.items.map(function (x) {
      return typeof x === 'string' ? x : (x && x.text) || ''; }).join(' — ');
    if (Array.isArray(c.questions)) return c.questions.map(function (q) {
      return (q && q.text) || ''; }).join(' — ');
    return '';
  }

  function cartes(doc) {
    return (doc && doc.blocks || []).filter(function (b) { return b && b.type === 'card'; });
  }

  // Pour chaque étape : son titre de diapositive, le texte de SON bloc, et le texte des blocs
  // déjà révélés avant elle. Le modèle a besoin des deux : ce qu'il doit commenter, et ce que le
  // spectateur a déjà entendu commenter — sans quoi il répète.
  function contenuParEtape(doc) {
    var etapes = window.adocPresentStepList(doc);
    var cs = cartes(doc);
    return etapes.map(function (e) {
      var carte = cs.filter(function (c) { return c.id === e.cardId; })[0];
      var sous = (carte && carte.content && carte.content.blocks) || [];
      var i = -1;
      for (var k = 0; k < sous.length; k++) { if (sous[k] && sous[k].id === e.stepId) { i = k; break; } }
      var propre = (i >= 0) ? texteDuBloc(sous[i]) : '';
      // Carte sans bloc : l'étape porte l'identifiant de la carte, et son contenu est le titre.
      if (i < 0 && !sous.length) propre = (carte && carte.content && carte.content.title) || '';
      var avant = (i > 0) ? sous.slice(0, i).map(texteDuBloc).filter(Boolean) : [];
      return {
        stepId: e.stepId, cardId: e.cardId, cardTitle: e.cardTitle || '',
        rang: e.rang, surRang: e.surRang,
        type: (i >= 0 && sous[i] && sous[i].type) || 'card',
        // Le contenu BRUT du bloc : les avertissements ont besoin des éléments d'une liste ou
        // des questions d'un questionnaire, pas seulement de leur texte aplati.
        contenuBrut: (i >= 0 && sous[i] && sous[i].content) || null,
        texte: propre, dejaVu: avant,
      };
    });
  }

  // ── Répartition des mots ───────────────────────────────────────────────────────────────────
  // Total = durée visée × 60 × 2,5. Réparti au prorata du POIDS de chaque étape — le nombre de
  // mots de son propre contenu, plancher à 1 pour qu'une étape sans texte (une image, un titre
  // seul) reçoive quand même sa part : c'est souvent là qu'il y a le plus à dire.
  function repartirMots(etapes, minutes, bornes) {
    var b = bornes || {};
    var min = typeof b.min === 'number' ? b.min : MOTS_MIN_ETAPE;
    var max = typeof b.max === 'number' ? b.max : MOTS_MAX_ETAPE;
    var total = Math.round(minutes * 60 * motsParSeconde());
    var poids = etapes.map(poidsEtape);
    var sommePoids = poids.reduce(function (a, x) { return a + x; }, 0);

    var cibles = poids.map(function (p) {
      return Math.round(total * (p / sommePoids));
    });
    // Application des bornes, puis redistribution de l'écart sur les étapes encore libres : sans
    // cette seconde passe, borner ferait perdre (ou gagner) des mots au total sans le dire.
    var fige = cibles.map(function () { return false; });
    for (var tour = 0; tour < 8; tour++) {
      var dette = 0, libres = [];
      for (var i = 0; i < cibles.length; i++) {
        if (cibles[i] < min) { dette += cibles[i] - min; cibles[i] = min; fige[i] = true; }
        else if (cibles[i] > max) { dette += cibles[i] - max; cibles[i] = max; fige[i] = true; }
        else if (!fige[i]) libres.push(i);
      }
      if (!dette || !libres.length) break;
      var sommeLibres = libres.reduce(function (a, i) { return a + cibles[i]; }, 0) || libres.length;
      libres.forEach(function (i) {
        cibles[i] = Math.round(cibles[i] + dette * (cibles[i] / sommeLibres));
      });
    }
    var atteint = cibles.reduce(function (a, x) { return a + x; }, 0);
    // LA DURÉE VISÉE N'EST PAS TOUJOURS ATTEIGNABLE, et il faut le DIRE. Huit étapes plafonnées
    // à 120 mots ne peuvent pas porter dix minutes : 960 mots, soit 6,4 min. Livrer cela en
    // silence serait un chiffre crédible et faux — exactement le défaut du 7 octobre.
    var ecart = atteint - total;
    var limite = null;
    if (ecart < 0) limite = 'plafond';
    else if (ecart > 0) limite = 'plancher';
    return {
      total_vise: total, total_reparti: atteint, min: min, max: max,
      bornees: fige.filter(Boolean).length,
      ecart_mots: ecart, limite: limite,
      atteignable: Math.abs(ecart) <= etapes.length,     // l'arrondi par étape, rien de plus
      duree_visee_s: Math.round(total / motsParSeconde()),
      duree_estimee_s: Math.round(atteint / motsParSeconde()),
      cibles: etapes.map(function (e, i) {
        return { stepId: e.stepId, mots: cibles[i], type: e.type,
                 mots_du_bloc: compterMots(e.texte), poids: +poids[i].toFixed(2) };
      }),
    };
  }

  // ── Budget de délai et jetons ──────────────────────────────────────────────────────────────
  function jetonsPour(totalMots) {
    var t = Math.ceil(totalMots * JETONS_PAR_MOT * MARGE_JSON) + JETONS_PLANCHER;
    return Math.min(JETONS_PLAFOND, t);
  }
  function budgetDelaiMs(maxTokens) {
    var brut = Math.ceil(BUDGET_MS_POUR_8000_JETONS * maxTokens / 8000);
    return Math.min(BUDGET_PLAFOND_MS, Math.max(BUDGET_PLANCHER_MS, brut));
  }

  // ── LE PROMPT SYSTÈME ──────────────────────────────────────────────────────────────────────
  // Écrit, pas improvisé. Montré intégralement à Christophe avant tout usage réel.
  function promptSysteme(options) {
    var o = options || {};
    var vouvoie = o.adresse !== 'tu';
    var adresse = vouvoie
      ? 'Adressez-vous au spectateur en disant « vous ». Jamais « tu ».'
      : 'Adressez-vous au spectateur en disant « tu ». Jamais « vous ».';
    // LE SUJET VIENT DE LA PRÉSENTATION, jamais d'une supposition. Le dossier de Christophe
    // porte aussi des documents sur l'attachement et sur la panique : « une vidéo sur le
    // couple » était faux cinq fois sur six, et un prompt qui se trompe de sujet oriente tout
    // le commentaire.
    var titre = (o.titre || '').trim();
    // LE REGISTRE SUIT LE PUBLIC ANNONCÉ par le document. Le message transportait déjà
    // « Public : … » sans qu'aucune consigne ne lui soit attachée : le modèle le lisait sans
    // savoir qu'en faire. Trois familles, et un repli qui ne suppose rien.
    var pub = String(o.public || '').toLowerCase();
    var registre;
    if (/profession|clinicien|thérapeute|therapeute|praticien|soignant/.test(pub)) {
      registre = 'Des professionnels. Vous pouvez nommer un mécanisme par son nom, à condition '
        + 'de l\'expliquer en une phrase. Pas de vulgarisation appuyée, pas de ton pédagogique '
        + 'envers quelqu\'un qui connaît le sujet mieux que la vidéo.';
    // « couple en » ne reconnaissait pas « couples en difficulté » — trouvé en éprouvant la
    // phrase réelle du document de Christophe à côté de six autres. Le motif est désormais
    // explicite sur ce qu'il vise, plutôt que large et approximatif.
    } else if (/patient|accompagn|consultant|personnes? suivies?|couples? en (difficult|crise|souffrance|th[ée]rapie)/.test(pub)) {
      registre = 'Des personnes accompagnées, qui se reconnaîtront peut-être dans ce qui est dit. '
        + 'Redoublez de précaution : aucune description qui ressemble à un jugement, aucune phrase '
        + 'qui laisse entendre qu\'elles auraient dû savoir. Nommez ce qui se passe sans le qualifier.';
    } else if (pub) {
      registre = 'Un public large (« ' + o.public + ' »), sans formation. Partez de l\'expérience '
        + 'ordinaire avant toute notion. Aucun terme technique sans une phrase qui l\'explique.';
    } else {
      registre = 'Le public n\'est pas précisé : écrivez pour quelqu\'un sans formation, qui écoute '
        + 'par curiosité ou parce que le sujet le touche.';
    }
    return [
      'Vous êtes auteur de scripts de doublage. Vous écrivez le commentaire que dira, à voix',
      'haute, un acteur de doublage, pour une vidéo de psychoéducation.',
      titre
        ? 'Le sujet est celui de la présentation fournie, intitulée « ' + titre +' ». Tenez-vous-y :'
        : 'Le sujet est celui de la présentation fournie. Tenez-vous-y :',
      'ne traitez pas d\'un sujet voisin parce qu\'il vous vient plus facilement.',
      '',
      'CE TEXTE SERA DIT, PAS LU.',
      '- Des phrases courtes. Une idée par phrase.',
      '- Des mots simples, ceux de la conversation.',
      '- Du rythme : alternez les phrases brèves et les phrases un peu plus longues.',
      '- Aucune parenthèse, aucune énumération à puces, aucune tournure qui ne se dit pas',
      '  (« cf. », « c.-à-d. », « etc. », « voir ci-dessous »).',
      '- Évitez les longues incises entre tirets ; un tiret ponctuel est acceptable.',
      '- Aucun Markdown : ni astérisque, ni dièse, ni tiret de liste, ni guillemet de code.',
      '- Si vous citez, employez les guillemets français : « comme ceci ». N\'employez JAMAIS le',
      '  guillemet droit " : il casserait le fichier. L\'apostrophe s\'écrit ’, jamais \'.',
      '- Écrivez les nombres en toutes lettres quand ils se disent ainsi : « douze semaines »,',
      '  « trois mois ». Jamais un chiffre qui ne figure pas dans le document fourni, même pour',
      '  illustrer : ni proportion, ni pourcentage, ni durée, ni effectif inventés.',
      '',
      'CE QUE LE COMMENTAIRE FAIT.',
      'Il AJOUTE à la diapositive, il l\'ILLUSTRE et il la COMMENTE. Il ne la lit pas et ne la',
      'répète pas. Le spectateur voit le texte à l\'écran : le redire est une perte de temps.',
      'Apportez donc : un exemple concret, une image, une nuance, une objection fréquente, ou',
      'une question posée au spectateur. Reliez l\'étape à la précédente quand cela aide.',
      '',
      'SI L\'ÉCRAN MONTRE UN PARAGRAPHE.',
      'Ne le reformulez pas. Le spectateur vient de le lire : redire la même idée avec d\'autres',
      'mots lui prend son temps, même si votre formulation est meilleure. Dites ce que la phrase',
      'affichée NE DIT PAS, sans introduire de fait, de chiffre ni d\'étude qui ne soient dans le',
      'document, et sans le contredire. Trois façons, choisissez-en une :',
      '- la conséquence vécue : ce que cela change concrètement pour quelqu\'un. Formulez-la comme',
      '  une possibilité — « cela peut vouloir dire que… », « il arrive que… » — jamais comme une',
      '  règle ni comme une généralité sur les gens ;',
      '- un exemple qui donne un visage à l\'idée, annoncé comme exemple ;',
      '- une question posée au spectateur, à laquelle l\'écran ne répond pas.',
      'Si le paragraphe énumère plusieurs éléments, ne reprenez pas son énumération : choisissez-en',
      'un seul et montrez-le.',
      'Avant de rendre votre texte, barrez mentalement tout ce que la diapositive dit déjà.',
      'S\'il ne reste rien, vous avez reformulé.',
      '',
      'SI L\'ÉCRAN MONTRE UNE LISTE OU UN QUESTIONNAIRE.',
      'Ne les parcourez pas, élément par élément, dans l\'ordre : le spectateur les lit lui-même.',
      'Choisissez UN élément et illustrez-le par un exemple, ou dites ce qui relie tous les',
      'éléments, ou posez une seule question qui les résume. Pour un questionnaire, ne lisez',
      'jamais les questions : invitez le spectateur à y répondre pour lui-même, en une ou deux',
      'phrases. N\'ajoutez aucune question qui ne figure pas à l\'écran.',
      'LA RÈGLE EST UN COMPTE, pas une impression : SI VOUS EN NOMMEZ PLUS D\'UNE, VOUS PARCOUREZ',
      'LA LISTE. Nommez-en UNE SEULE, ou AUCUNE. « Retenez une idée » puis trois idées énumérées',
      'est un parcours de liste, même annoncé comme un choix — et c\'est exactement ce qui a été',
      'relevé sur une étape à quatre idées.',
      '',
      'SI VOUS CITEZ LE DOCUMENT.',
      'Reprenez ses mots exacts, entre guillemets français, sans en retirer ni en ajouter.',
      'Un DIALOGUE IMAGINÉ peut s\'écrire entre guillemets français, à condition d\'être introduit',
      'comme imaginé — « imaginez quelqu\'un qui dirait : « … » ». Une CITATION DU DOCUMENT, elle,',
      'reste mot pour mot. Les deux s\'écrivent entre guillemets ; ce qui les sépare est',
      'l\'introduction, et elle doit être explicite.',
      'N\'attribuez jamais une phrase ou une idée à un groupe (« les chercheurs », « les',
      'spécialistes », « ceux qui travaillent avec des couples ») que le document ne nomme pas.',
      'Si le document ne dit pas qui parle, ne dites pas qui parle.',
      '',
      'UN SEUL DISCOURS, DU DÉBUT À LA FIN.',
      'Vous n\'écrivez pas des commentaires séparés : vous écrivez UN texte continu, découpé en',
      'étapes. Chaque étape reprend là où la précédente s\'est arrêtée.',
      '- Ne réutilisez jamais un exemple, une image ou une comparaison déjà employés. Si vous avez',
      '  parlé d\'une porte fermée à l\'étape deux, n\'y revenez pas à l\'étape sept.',
      '- La PREMIÈRE étape ouvre la vidéo : elle pose la question à laquelle tout le reste répond.',
      '  Ne commencez pas par « Dans cette présentation, nous allons voir… ».',
      '- La DERNIÈRE étape referme. Elle ne récapitule pas mécaniquement ce qui a été dit : elle',
      '  laisse le spectateur avec une chose à emporter, ou une question à se poser.',
      '- Le message vous donne l\'OBJECTIF de la présentation. C\'est lui qui décide de ces deux',
      '  étapes : la première doit faire naître le besoin auquel l\'objectif répond, la dernière',
      '  doit laisser le spectateur en mesure de faire ce que l\'objectif annonce. Ne récitez',
      '  jamais l\'objectif : il se voit dans ce que vous écrivez, il ne se dit pas.',
      '',
      'CE QUI EST INTERDIT.',
      '- Aucune statistique, aucun pourcentage, aucune étude, aucune source, aucun nom d\'auteur',
      '  qui ne figure pas déjà dans le document fourni. Si le document n\'en donne pas, n\'en',
      '  inventez aucun : parlez sans chiffre.',
      '- Toute affirmation factuelle doit venir du document fourni.',
      '- Les exemples sont annoncés comme des exemples : « Imaginez un couple où… »,',
      '  « Prenons le cas de… ». Jamais un cas présenté comme réel.',
      '- Aucun diagnostic, aucun conseil adressé à une personne en particulier, aucune promesse',
      '  de résultat thérapeutique.',
      '- Aucun jargon. Si un terme technique est indispensable, expliquez-le en une phrase.',
      '- N\'attribuez jamais d\'office un rôle à l\'homme ou à la femme : ni celui qui se tait, ni',
      '  celle qui demande, ni l\'inverse. Dites « l\'un » et « l\'autre », ou « l\'un des deux ».',
      '  Un couple n\'est pas forcément un homme et une femme, et le rôle décrit n\'appartient à',
      '  aucun des deux par nature.',
      '',
      'LE TON.',
      'Chaleureux, posé, jamais culpabilisant. Vous ne jugez personne. Vous ne vous adressez pas',
      'à « ceux qui ont un problème », mais à quelqu\'un qui écoute et se reconnaîtra peut-être.',
      adresse,
      'Un seul pronom d\'adresse dans tout le texte. Avant de répondre, relisez : aucun « toi »,',
      '« tu », « ton », « ta », « tes » dans un texte en « vous » (et réciproquement).',
      '',
      'À QUI VOUS PARLEZ.',
      registre,
      '',
      'CE QUE CE DOCUMENT EST.',
      'Une présentation clinique dont la relecture humaine est requise. Votre commentaire est un',
      'BROUILLON que le thérapeute relira et corrigera. Ce n\'est jamais une validation clinique,',
      'et vous n\'avez pas à faire comme si c\'en était une.',
      '',
      'LES PAUSES.',
      'Vous pouvez marquer un silence avec [pause] pour une respiration courte, ou [pause 2 s]',
      'pour une durée précise. Ces marques ne sont pas prononcées et ne comptent pas dans les',
      'mots. Servez-vous-en pour laisser une question respirer, jamais plus d\'une fois ou deux',
      'par étape.',
      '',
      'LA LONGUEUR.',
      'Chaque étape porte une cible en mots. Respectez-la à ' + Math.round(TOLERANCE * 100) + ' % près',
      '(au minimum ' + TOLERANCE_PLANCHER + ' mots d\'écart tolérés). C\'est une contrainte de montage :',
      'le commentaire doit tenir dans le temps où l\'image est à l\'écran.',
      '',
      'DEUX EXEMPLES, POUR LA DIFFÉRENCE.',
      'Écran : « Un bon jardin se prépare en hiver. »',
      '✗ Un commentaire qui répète : « Pour avoir un beau jardin, il faut le préparer pendant',
      '  l\'hiver. »',
      '✓ Un commentaire qui ajoute : « Ceux qui jardinent le savent : le travail qu\'on ne voit',
      '  pas est celui qui compte. [pause] Pendant que la terre dort, vous décidez déjà de ce',
      '  qui poussera. »',
      'Ces deux exemples illustrent la différence ; ne les reprenez jamais, ni leurs images.',
      '',
      'VOTRE RÉPONSE.',
      'Uniquement un tableau JSON, rien avant, rien après, sans bloc de code :',
      '[{"stepId": "...", "text": "..."}]',
      'Exactement un élément par étape demandée, dans le même ordre, avec les identifiants',
      'exacts. Aucun identifiant inventé, aucun oublié. Le champ "text" est du texte brut,',
      'en français.',
    ].join('\n');
  }

  // ── Le message utilisateur : le strict nécessaire ──────────────────────────────────────────
  // Jamais le document brut entier : ni citations, ni snapshot, ni identifiants techniques
  // autres que ceux des étapes, ni rien qui ressemble à une donnée personnelle.
  function construireMessage(doc, etapes, repartition, options) {
    var o = options || {};
    var parStep = {};
    repartition.cibles.forEach(function (c) { parStep[c.stepId] = c.mots; });
    var lignes = [];
    lignes.push('Titre de la présentation : ' + (doc.title || 'sans titre'));
    if (doc.audience) lignes.push('Public : ' + doc.audience);
    // L'OBJECTIF du document. Il dit ce que la présentation cherche à produire chez le
    // spectateur — c'est la seule chose qui permette d'ouvrir et de refermer juste. Sans lui,
    // la première et la dernière étape ne pouvaient que deviner.
    if (doc.purpose) lignes.push('Objectif : ' + doc.purpose);
    lignes.push('Durée visée pour l\'ensemble : ' + o.minutes + ' minutes, soit environ '
      + repartition.total_reparti + ' mots.');
    lignes.push('');
    lignes.push('Les étapes, dans l\'ordre. Écrivez un commentaire pour CHACUNE :');
    lignes.push('');
    var carteCourante = null;
    etapes.forEach(function (e) {
      if (e.cardId !== carteCourante) {
        carteCourante = e.cardId;
        lignes.push('── Diapositive : ' + (e.cardTitle || 'sans titre'));
      }
      lignes.push('  stepId: ' + e.stepId);
      lignes.push('  cible: ' + (parStep[e.stepId] || 0) + ' mots');
      if (e.dejaVu.length) {
        lignes.push('  déjà à l\'écran : ' + e.dejaVu.join(' | ').slice(0, 600));
      }
      lignes.push('  contenu de cette étape : ' + (e.texte || '(pas de texte, image ou titre seul)'));
      lignes.push('');
    });
    return lignes.join('\n');
  }

  // ── Le contrat de réponse, vérifié ─────────────────────────────────────────────────────────
  function extraireJSON(brut) {
    if (!brut) return null;
    var t = String(brut).trim();
    // Un bloc de code est toléré à la lecture, jamais à l'écriture : le modèle en met parfois
    // un malgré la consigne, et refuser pour cela seul ferait perdre une réponse par ailleurs
    // correcte. La consigne reste « sans bloc de code » ; c'est la tolérance qui est ici.
    var fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (fence) t = fence[1].trim();
    var i = t.indexOf('['), j = t.lastIndexOf(']');
    if (i === -1 || j === -1 || j < i) return null;
    try { return JSON.parse(t.slice(i, j + 1)); } catch (e) { return null; }
  }

  // Une PUCE ORPHELINE : une ligne qui ne contient qu'un « * », un « - » ou un « + ». La règle
  // précédente exigeait une espace APRÈS la puce (`^\s*[-*+]\s`), ce qui laissait passer une
  // puce en toute fin de texte, sans retour à la ligne derrière — et l'aperçu affichait alors
  // une ligne isolée sous chaque étape. Relevé par Christophe le 9 octobre ; vérifié : les trois
  // caractères en fin de texte passaient tous les trois.
  // Le tiret CADRATIN (—) n'est pas visé : il est légitime, et ce n'est pas le même caractère.
  var PUCE_ORPHELINE_RE = /(^|\n)[ \t]*[-*+][ \t]*(\n|$)/;
  var MARKDOWN_RE = /(^|\s)([*_]{1,2})\S|\*\*|^#{1,6}\s|^\s*[-*+]\s|\[[^\]]*\]\([^)]*\)|`/m;
  function contientMarkdown(texte) {
    return MARKDOWN_RE.test(texte) || PUCE_ORPHELINE_RE.test(texte);
  }

  // ── MESURER LE RECOUVREMENT AVEC L'ÉCRAN ───────────────────────────────────────────────────
  // Le 9 octobre, cinq étapes sur dix-neuf ont été refusées par Christophe. Trois des cinq
  // REDISENT l'écran au lieu de l'augmenter — et cela se mesure, contrairement à la paraphrase,
  // qui se juge à l'oreille. Deux mesures, parce qu'une seule se contourne :
  //   · la PLUS LONGUE SUITE de mots communs (un emprunt littéral de huit mots s'entend) ;
  //   · la part des TRIGRAMMES du commentaire qu'on retrouve à l'écran (un emprunt dispersé).
  // Les seuils (8 mots, 20 %) sont ceux qui séparent les étapes gardées des étapes refusées.
  // Ils sont reconfirmés sur les fixtures d'essai du lot, jamais calibrés sur un document réel.
  var SEUIL_SUITE_MOTS = 8;
  var SEUIL_TRIGRAMMES = 0.20;
  var SEUIL_PHRASE_LONGUE = 30;
  var SEUIL_ELEMENT_REPRIS = 0.40;   // part des mots d'un élément de liste repris
  var SEUIL_ELEMENTS_PARCOURUS = 3;  // nombre d'éléments repris qui font un « parcours »

  function normaliserMots(texte) {
    return String(texte || '')
      .replace(pauseRe(), ' ')
      .toLowerCase()
      .replace(/[\u2019']/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim().split(/\s+/).filter(Boolean);
  }

  function plusLongueSuite(a, b) {
    if (!a.length || !b.length) return 0;
    // Programmation dynamique sur une seule ligne : les textes font quelques dizaines de mots.
    var prec = new Array(b.length + 1).fill(0), max = 0;
    for (var i = 1; i <= a.length; i++) {
      var cour = new Array(b.length + 1).fill(0);
      for (var j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          cour[j] = prec[j - 1] + 1;
          if (cour[j] > max) max = cour[j];
        }
      }
      prec = cour;
    }
    return max;
  }

  function trigrammes(mots) {
    var out = [];
    for (var i = 0; i + 2 < mots.length; i++) out.push(mots[i] + ' ' + mots[i + 1] + ' ' + mots[i + 2]);
    return out;
  }

  function partTrigrammesCommuns(commentaire, ecran) {
    var tc = trigrammes(commentaire);
    if (!tc.length) return 0;
    var te = {};
    trigrammes(ecran).forEach(function (t) { te[t] = true; });
    var n = 0;
    tc.forEach(function (t) { if (te[t]) n++; });
    return n / tc.length;
  }

  // Les passages entre guillemets français du commentaire.
  function citations(texte) {
    var out = [], re = /\u00ab\s*([^\u00bb]*?)\s*\u00bb/g, m;
    while ((m = re.exec(String(texte || '')))) { if (m[1].trim()) out.push(m[1].trim()); }
    return out;
  }

  function contient(grandeSuite, petiteSuite) {
    if (!petiteSuite.length) return true;
    for (var i = 0; i + petiteSuite.length <= grandeSuite.length; i++) {
      var ok = true;
      for (var j = 0; j < petiteSuite.length; j++) {
        if (grandeSuite[i + j] !== petiteSuite[j]) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  // LE DÉCOUPAGE EN PHRASES, UNE SEULE FOIS — et sa différence est un PARAMÈTRE, pas une
  // seconde implémentation (régression #11(f) : une grandeur, une fonction ; quand deux endroits
  // doivent la connaître, le second appelle le premier).
  //
  // Les points de suspension coupent une phrase pour qui COMPTE SA LONGUEUR — celui qui dit le
  // texte y reprend son souffle. Ils ne la coupent PAS pour qui compare une citation à l'écran :
  // « Imaginez… » introduit ce qui suit, il ne le termine pas, et couper là séparerait
  // l'introduction de son dialogue, donc ferait chuter la part de mots partagés sur deux
  // moitiés au lieu d'une phrase. D'où le drapeau, nommé et justifié ici plutôt que deux
  // fonctions qui divergeraient un jour.
  function phrasesDe(texte, options) {
    var couperSurSuspension = !!(options && options.couperSurSuspension);
    var brut = String(texte || '');
    if (!couperSurSuspension) brut = brut.replace(/\u2026/g, ' ');
    var separateur = couperSurSuspension ? /[.!?\u2026]+/ : /[.!?]+[\s\u00a0]+|[.!?]+$|\n+/;
    return brut.split(separateur)
      .map(function (p) { return p.trim(); })
      .filter(Boolean);
  }

  function phrasesLongues(texte) {
    // Le découpage vient de `phrasesDe`, avec la coupure sur les points de suspension : pour
    // celui qui dit le texte, « … » est une respiration, donc une fin de phrase. Comportement
    // identique à celui d'avant cette correction, et c'est un contrôle qui le vérifie.
    return phrasesDe(String(texte || '').replace(pauseRe(), ' '), { couperSurSuspension: true })
      .map(function (p) { return normaliserMots(p).length; })
      .filter(function (n) { return n > SEUIL_PHRASE_LONGUE; });
  }

  // Les éléments d'une liste ou d'un questionnaire, tels qu'ils sont à l'écran.
  function elementsDeLEtape(etape) {
    var c = (etape && etape.contenuBrut) || null;
    if (!c) return [];
    if (Array.isArray(c.items)) return c.items.map(function (x) {
      return typeof x === 'string' ? x : (x && x.text) || ''; }).filter(Boolean);
    if (Array.isArray(c.questions)) return c.questions.map(function (q) {
      return (q && q.text) || ''; }).filter(Boolean);
    return [];
  }

  // ── LES BORNES DE MOT, EN UNICODE ET NON EN ASCII ─────────────────────────────────────────
  //
  // `\b` ne connaît que les lettres ASCII. En JavaScript, sans le drapeau `u`, « ê » est une
  // NON-lettre : il y a donc une borne de mot entre « ê » et « t », et `/\btes\b/` se retrouve
  // dans « êtes ». C'est ce qui a fait dire au relevé « passe au tu » sur deux étapes de la
  // présentation de Christophe dont le seul mot commun était « êtes » — « vous êtes ensemble »
  // et « vous en êtes réellement ».
  //
  // LA FAMILLE EST PLUS LARGE QUE « êtes », et c'est la mesure qui l'a dit, pas le raisonnement :
  // quinze faux positifs sur une liste de mots français ordinaires. « fêtes », « têtes »,
  // « bêtes », « quêtes », « arrêtes », « tempêtes », « prêtes », « pâtes » (par `tes`) ;
  // « béton », « bâton », « piéton » (par `ton`) ; « appâta » (par `ta`). Toute lettre accentuée
  // placée juste avant l'un de ces pronoms ouvre la même porte.
  //
  // Les bornes Unicode la ferment : `(?<![\p{L}\p{N}_])` et `(?![\p{L}\p{N}_])` avec le drapeau
  // `u` traitent « ê » pour ce qu'elle est — une lettre. Le lookbehind demande Safari 16.4 ou
  // plus récent ; Christophe est en 26.3, et un contrôle le vérifie DANS la page plutôt que de
  // s'en remettre à une table de compatibilité.
  var BORNE_AVANT = '(?<![\\p{L}\\p{N}_])';
  var BORNE_APRES = '(?![\\p{L}\\p{N}_])';
  function borneMot(alternatives) {
    return new RegExp(BORNE_AVANT + '(' + alternatives + ')' + BORNE_APRES, 'iu');
  }
  // Part de mots qu'un passage entre guillemets doit partager avec UNE phrase de l'écran pour
  // être tenu pour une citation abîmée plutôt que pour un propos imaginé. 60 %, valeur de
  // Christophe du 10 octobre : au-dessus, les deux phrases parlent de la même chose et l'écart
  // est un défaut ; en dessous, le passage raconte autre chose.
  var SEUIL_CITATION_PROCHE = 0.60;

  var PRONOMS = {
    vous: borneMot('toi|tu|ton|ta|tes'),
    tu: borneMot('vous|votre|vos'),
  };

  // ── LES AVERTISSEMENTS, par étape. AUCUN n'est bloquant. ──────────────────────────────────
  // Ils ne refusent rien : ils montrent à Christophe où regarder. Un texte conforme au contrat
  // peut être mauvais, et c'est lui qui juge — mais il ne doit pas avoir à relire dix-neuf
  // étapes pour trouver les trois qui redisent l'écran.
  function avertissementsEtape(texteCommentaire, etape, options) {
    var o = options || {};
    var out = [];
    var com = normaliserMots(texteCommentaire);
    var ecran = normaliserMots(etape && etape.texte);

    // LA MESURE DE REPRISE IGNORE LES CITATIONS. Citer l'écran mot pour mot est non seulement
    // permis, c'est EXIGÉ par le prompt — une citation est par construction une longue suite
    // commune. La compter comme un emprunt ferait crier l'avertissement sur exactement ce
    // qu'on demande, et un avertissement qui crie à tort s'apprend à être ignoré.
    // Trouvé par le témoin du contrôle 20, pas deviné.
    var comHorsCitations = normaliserMots(
      String(texteCommentaire || '').replace(/\u00ab[^\u00bb]*\u00bb/g, ' '));
    var suite = plusLongueSuite(comHorsCitations, ecran);
    var part = partTrigrammesCommuns(comHorsCitations, ecran);
    if (suite >= SEUIL_SUITE_MOTS || part >= SEUIL_TRIGRAMMES) {
      out.push({ type: 'reprise', texte: 'reprend ' + suite + ' mots de suite de l\u2019écran ('
        + Math.round(part * 100) + ' % de trigrammes communs)', suite: suite, part: part });
    }

    var elements = elementsDeLEtape(etape);
    if (elements.length >= SEUIL_ELEMENTS_PARCOURUS) {
      var repris = 0;
      elements.forEach(function (el) {
        var mots = normaliserMots(el);
        if (!mots.length) return;
        var dedans = 0;
        var vus = {};
        com.forEach(function (m) { vus[m] = true; });
        mots.forEach(function (m) { if (vus[m]) dedans++; });
        if (dedans / mots.length >= SEUIL_ELEMENT_REPRIS) repris++;
      });
      if (repris >= SEUIL_ELEMENTS_PARCOURUS) {
        out.push({ type: 'parcours', texte: 'parcourt la liste élément par élément ('
          + repris + ' éléments sur ' + elements.length + ' repris)', repris: repris });
      }
    }

    // Le pronom de l'AUTRE adresse, hors citations : une citation peut légitimement tutoyer.
    var adresse = o.adresse === 'tu' ? 'tu' : 'vous';
    var horsCitations = String(texteCommentaire || '')
      .replace(/\u00ab[^\u00bb]*\u00bb/g, ' ');
    if (PRONOMS[adresse].test(horsCitations)) {
      out.push({ type: 'adresse', texte: adresse === 'vous' ? 'passe au tu' : 'passe au vous' });
    }

    // ── CITATION DU DOCUMENT, OU PROPOS IMAGINÉ ? ───────────────────────────────────────────
    //
    // La règle d'avant signalait TOUT passage entre guillemets qui ne se retrouvait pas mot pour
    // mot à l'écran. Elle a donc crié sur deux phrases de dialogue imaginé introduites par
    // « Imaginez… » — qui ne citent rien et n'ont pas à être identiques. Un relevé qui crie à
    // tort s'apprend à être ignoré, et c'est le vrai défaut.
    //
    // Règle de Christophe du 10 octobre : un passage entre guillemets n'est un défaut que s'il
    // est PROCHE d'une phrase de l'écran sans lui être identique — au moins 60 % de ses mots en
    // commun avec UNE phrase. C'est là qu'une citation a été abîmée. En dessous, c'est un propos
    // imaginé : affiché comme information neutre, et il ne compte pas comme avertissement.
    // DEUX FORMES, DEUX USAGES, et il ne faut pas les confondre — c'est ce que le contrôle a
    // attrapé. `texteDocument` arrive des appelants DÉJÀ NORMALISÉ en tableau de mots : c'est ce
    // qu'il faut à `contient`, qui compare mot à mot. Mais les PHRASES, elles, ne se découpent
    // que sur une chaîne : passer le tableau à `phrasesDe` en aurait fait une seule phrase géante
    // (« mot1,mot2,mot3 »), et la part de mots partagés aurait été calculée contre le document
    // entier au lieu d'une phrase — ce qui aurait classé un dialogue imaginé en citation abîmée
    // dès qu'il emploie des mots courants.
    var brutDocument = (typeof o.texteDocumentBrut === 'string')
      ? o.texteDocumentBrut
      : String((etape && etape.texte) || '');
    // Tolérant sur la forme reçue, pour que le prochain appelant ne retombe pas dans le piège :
    // un tableau passe tel quel, une chaîne est normalisée ici.
    var motsDocument = Array.isArray(o.texteDocument)
      ? o.texteDocument
      : (o.texteDocument ? normaliserMots(o.texteDocument) : ecran);
    var phrasesDoc = phrasesDe(brutDocument).map(normaliserMots)
      .filter(function (m) { return m.length; });
    citations(texteCommentaire).forEach(function (c) {
      var motsC = normaliserMots(c);
      if (!motsC.length) return;
      // Identique à l'écran : rien à signaler, c'est une citation en règle.
      if (contient(motsDocument, motsC)) return;
      // La phrase de l'écran dont elle est la PLUS proche, et la part de mots partagés.
      var part = 0;
      phrasesDoc.forEach(function (phrase) {
        var vus = {};
        phrase.forEach(function (m) { vus[m] = true; });
        var dedans = 0;
        motsC.forEach(function (m) { if (vus[m]) dedans++; });
        var p = dedans / motsC.length;
        if (p > part) part = p;
      });
      var extrait = c.slice(0, 60) + (c.length > 60 ? '…' : '');
      if (part >= SEUIL_CITATION_PROCHE) {
        out.push({ type: 'citation', part: part,
          texte: 'citation non identique à l\u2019écran (' + Math.round(part * 100)
            + ' % des mots d\u2019une phrase affichée) : « ' + extrait + ' »' });
      } else {
        // INFORMATION, PAS DÉFAUT. `information: true` la retire du compte des avertissements :
        // un chiffre qui enfle sur des propos légitimes ne veut plus rien dire.
        out.push({ type: 'propos-imagine', part: part, information: true,
          texte: 'propos imaginé entre guillemets (' + Math.round(part * 100)
            + ' % des mots de la phrase la plus proche) : « ' + extrait
            + ' » — rien à corriger, pour information' });
      }
    });

    phrasesLongues(texteCommentaire).forEach(function (n) {
      out.push({ type: 'phrase', texte: 'phrase de ' + n + ' mots', mots: n });
    });

    return out;
  }

  // ── TYPOGRAPHIE : normaliser quand c'est sans ambiguïté, refuser quand ça ne l'est pas ─────
  // Le guillemet droit est le vrai danger : c'est le délimiteur du JSON. L'apostrophe droite
  // n'est qu'une faute de typographie française. On ne traite donc pas les deux pareil :
  //   · l'apostrophe droite est REMPLACÉE, toujours — refuser pour cela gâcherait un tour de
  //     correction sur un détail que personne ne verrait à l'oreille ;
  //   · les guillemets droits sont APPARIÉS en « … » quand leur nombre est pair, ce qui est le
  //     cas ordinaire d'une citation ; un nombre IMPAIR est ambigu (ouvre-t-il ou ferme-t-il ?)
  //     et c'est le seul cas refusé.
  // Rien n'est silencieux : chaque normalisation est rendue dans la liste `normalisations`.
  function normaliserTypographie(texte) {
    var notes = [];
    var t = String(texte || '');
    var apostrophes = (t.match(/'/g) || []).length;
    if (apostrophes) {
      t = t.replace(/'/g, '\u2019');
      notes.push(apostrophes + ' apostrophe(s) droite(s) remplacée(s)');
    }
    var droits = (t.match(/"/g) || []).length;
    if (droits) {
      if (droits % 2 !== 0) {
        return { texte: t, notes: notes, refus: 'guillemet droit non apparié (' + droits + ')' };
      }
      var ouvre = true;
      t = t.replace(/\s*"\s*/g, function (m) {
        var avant = /^\s/.test(m) ? ' ' : '';
        var apres = /\s$/.test(m) ? ' ' : '';
        var r = ouvre ? (avant + '\u00ab\u00a0') : ('\u00a0\u00bb' + apres);
        ouvre = !ouvre;
        return r;
      });
      notes.push((droits / 2) + ' citation(s) passée(s) en guillemets français');
    }
    return { texte: t, notes: notes, refus: null };
  }

  // PLANCHER DE TOLÉRANCE PLUS LARGE POUR UN TITRE. Une cible de 20 mots avec ±5 refuse à 14 ;
  // or un titre se commente en une phrase, dont la longueur varie beaucoup. 8 mots, décision du
  // 9 octobre.
  var TOLERANCE_PLANCHER_TITRE = 8;
  // Un tour de correction n'est demandé pour la LONGUEUR que si l'écart est vraiment grave :
  // une étape à moins de la moitié (ou plus d'une fois et demie) sa cible, ou plus d'un quart
  // des étapes hors tolérance. Sinon on signale et on laisse Christophe juger — le 9 octobre,
  // 1 109 mots pour 1 197 visés (−7 %) étaient parfaitement utilisables.
  var PART_ETAPES_HORS_TOLERANCE = 0.25;

  function validerReponse(brut, etapesDemandees, repartition, options) {
    var o = options || {};
    var tolerance = typeof o.tolerance === 'number' ? o.tolerance : TOLERANCE;
    var plancher = typeof o.plancher === 'number' ? o.plancher : TOLERANCE_PLANCHER;
    var violations = [];
    var tableau = extraireJSON(brut);
    if (!Array.isArray(tableau)) {
      // MÊME FORME que le retour normal. Un objet à géométrie variable fait planter l'appelant
      // sur le chemin d'erreur, c'est-à-dire exactement quand il a besoin de lire le résultat.
      return { ok: false, entrees: [], violations: ['la réponse n\'est pas un tableau JSON lisible'],
               normalisations: [], avertissements: [], longueurs: [],
               longueurGrave: false, raisonLongueur: null, mots_recus: 0 };
    }
    var attendus = etapesDemandees.map(function (e) { return e.stepId; });
    var cibles = {};
    repartition.cibles.forEach(function (c) { cibles[c.stepId] = c.mots; });

    var vus = [], entrees = [], normalisations = [], avertissements = [], longueurs = [];
    var parId = {};
    etapesDemandees.forEach(function (e) { parId[e.stepId] = e; });
    tableau.forEach(function (el, i) {
      if (!el || typeof el !== 'object') { violations.push('élément ' + (i + 1) + ' : pas un objet'); return; }
      var id = el.stepId, texte = el.text;
      if (typeof id !== 'string' || !id) { violations.push('élément ' + (i + 1) + ' : stepId absent'); return; }
      if (typeof texte !== 'string' || !texte.trim()) { violations.push(id + ' : texte vide'); return; }
      if (attendus.indexOf(id) === -1) { violations.push(id + ' : identifiant inconnu'); return; }
      if (vus.indexOf(id) !== -1) { violations.push(id + ' : en double'); return; }
      vus.push(id);
      if (contientMarkdown(texte)) violations.push(id + ' : le texte contient du Markdown');
      var typo = normaliserTypographie(texte);
      if (typo.refus) { violations.push(id + ' : ' + typo.refus); return; }
      if (typo.notes.length) normalisations.push(id + ' : ' + typo.notes.join(', '));
      texte = typo.texte;
      var etape = parId[id];
      var n = compterMots(texte), cible = cibles[id] || 0;
      // LA LONGUEUR N'EST PLUS BLOQUANTE. Elle est mesurée, signalée par étape, et ne déclenche
      // un tour de correction que sur un écart grave (voir `longueurGrave` plus bas). Refuser
      // une réponse à −7 % aurait coûté un second appel pour rien, le 9 octobre.
      var plancherEtape = (etape && etape.type === 'heading') ? TOLERANCE_PLANCHER_TITRE : plancher;
      var marge = Math.max(plancherEtape, Math.round(cible * tolerance));
      var ecart = n - cible;
      var horsTolerance = Math.abs(ecart) > marge;
      if (horsTolerance) {
        longueurs.push({ stepId: id, mots: n, cible: cible, marge: marge, ecart: ecart,
          texte: id + ' : ' + (ecart < 0 ? 'trop court' : 'trop long') + ' (' + n + ' mots pour '
            + cible + ' ± ' + marge + ')' });
      }
      var avertis = avertissementsEtape(texte, etape, o);
      if (avertis.length) avertissements.push({ stepId: id, liste: avertis });
      entrees.push({ stepId: id, text: texte.trim(), mots: n, cible: cible, marge: marge,
                     ecart: ecart, horsTolerance: horsTolerance, avertissements: avertis });
    });
    attendus.forEach(function (id) {
      if (vus.indexOf(id) === -1) violations.push(id + ' : étape manquante');
    });
    // LA RÈGLE DE REPRISE POUR LA LONGUEUR, dite une seule fois ici.
    var grave = longueurs.some(function (l) { return Math.abs(l.ecart) > l.cible / 2; });
    var tropNombreuses = entrees.length
      && (longueurs.length / entrees.length) > PART_ETAPES_HORS_TOLERANCE;
    return {
      ok: violations.length === 0,
      entrees: entrees, violations: violations, normalisations: normalisations,
      avertissements: avertissements, longueurs: longueurs,
      longueurGrave: !!(grave || tropNombreuses),
      raisonLongueur: grave ? 'un écart dépasse la moitié de la cible'
        : (tropNombreuses ? 'plus du quart des étapes sont hors tolérance' : null),
      mots_recus: entrees.reduce(function (a, e) { return a + e.mots; }, 0),
    };
  }

  // ── L'appel, avec UN seul tour de correction ───────────────────────────────────────────────
  // Le transport est injectable : c'est ce qui permet d'éprouver toute la chaîne sans un seul
  // appel réel, et c'est le même procédé que adocResolveImagesForExport (opts.fetchPhoto).
  async function transportReel(requete) {
    var s = (requete && requete.services) || services();
    if (!s || typeof s.urlWorker !== 'function' || typeof s.cleApi !== 'function') {
      throw new Error('le module n\u2019a pas reçu les services du cœur : « Rédiger la narration » '
        + 'doit être branché par studio-clinique-core.js, qui seul connaît l\u2019adresse du Worker.');
    }
    var workerUrl = s.urlWorker();
    if (!workerUrl) throw new Error('adresse du Worker non configurée.');
    var cle = s.cleApi();
    if (!cle) throw new Error('aucune clé d\u2019accès en mémoire : connectez-vous d\u2019abord.');
    var ctrl = new AbortController();
    var tid = setTimeout(function () { ctrl.abort(); }, requete.budgetMs);
    try {
      var r = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': cle },
        body: JSON.stringify({ payload: {
          model: MODELE, max_tokens: requete.maxTokens, temperature: 1,
          system: requete.system,
          messages: requete.messages,
        } }),
        signal: ctrl.signal,
      });
      if (!r.ok) {
        var detail = '';
        try { detail = (await r.json()).error || ''; } catch (e) {}
        throw new Error(sansCle('le serveur a refusé l’appel (' + r.status
          + (detail ? ' — ' + detail : '') + ').'));
      }
      var data = await r.json();
      var bloc = (data.content || []).filter(function (c) { return c.type === 'text'; })[0];
      return (bloc && bloc.text) || '';
    } catch (e) {
      if (e && e.name === 'AbortError') {
        throw new Error('pas de réponse en ' + Math.round(requete.budgetMs / 1000) + ' s — appel abandonné.');
      }
      e.message = sansCle(e.message);
      throw e;
    } finally { clearTimeout(tid); }
  }

  async function rediger(doc, options) {
    var o = options || {};
    var minutes = typeof o.minutes === 'number' ? o.minutes : DUREE_DEFAUT_MIN;
    if (!(minutes >= DUREE_MIN && minutes <= DUREE_MAX)) {
      throw new Error('durée visée hors bornes (' + DUREE_MIN + ' à ' + DUREE_MAX + ' minutes).');
    }
    var toutes = contenuParEtape(doc);
    if (!toutes.length) throw new Error('ce document ne porte aucune étape.');
    var dejaNarrees = {};
    (doc.narration || []).forEach(function (n) { if (n && n.text && n.text.trim()) dejaNarrees[n.stepId] = true; });
    var etapes = o.seulementVides ? toutes.filter(function (e) { return !dejaNarrees[e.stepId]; }) : toutes;
    if (!etapes.length) throw new Error('toutes les étapes portent déjà une narration : rien à écrire.');

    // La répartition se calcule sur les étapes DEMANDÉES : si on ne réécrit que les vides, la
    // durée visée s'applique à elles seules, sinon on redemanderait la durée totale pour une
    // fraction de la présentation.
    var repartition = repartirMots(etapes, minutes, { min: o.motsMin, max: o.motsMax });
    var maxTokens = jetonsPour(repartition.total_reparti);
    var budgetMs = budgetDelaiMs(maxTokens);
    var system = promptSysteme(Object.assign({}, o, { titre: doc.title, public: doc.audience }));
    var message = construireMessage(doc, etapes, repartition, { minutes: minutes });
    if (message.length > ENTREE_MAX_CARACTERES) {
      throw new Error('présentation trop longue pour un seul appel (' + message.length
        + ' caractères pour une borne de ' + ENTREE_MAX_CARACTERES + ').');
    }
    var transport = o.transport || transportReel;
    var messages = [{ role: 'user', content: message }];
    var journal = [];
    var dernierBrut = '';
    // Le texte de TOUTE la présentation, normalisé : une citation peut venir d'une autre
    // diapositive que celle de l'étape, et elle reste légitime si elle y figure telle quelle.
    // DEUX FORMES du même document, chacune pour son usage : le tableau de mots pour comparer
    // une citation mot à mot, la chaîne brute pour en découper les PHRASES. Une seule source,
    // deux dérivations — et non deux sources qui finiraient par différer.
    var brutDocument = toutes.map(function (e) {
      return (e.cardTitle || '') + ' ' + (e.texte || ''); }).join(' ');
    var texteDocument = normaliserMots(brutDocument);
    var opts = Object.assign({}, o, { texteDocument: texteDocument,
                                      texteDocumentBrut: brutDocument,
                                      adresse: o.adresse === 'tu' ? 'tu' : 'vous' });

    for (var tour = 0; tour < 2; tour++) {
      var brut = await transport({ system: system, messages: messages, maxTokens: maxTokens,
                                   budgetMs: budgetMs, tour: tour });
      dernierBrut = brut;
      var v = validerReponse(brut, etapes, repartition, opts);
      journal.push({ tour: tour + 1, violations: v.violations.slice(0, 12),
                     longueurs: v.longueurs.map(function (l) { return l.texte; }).slice(0, 12),
                     longueurGrave: v.longueurGrave, raisonLongueur: v.raisonLongueur });
      // LA LONGUEUR N'EST PAS BLOQUANTE : elle ne provoque un second tour que si elle est grave.
      var refaire = !v.ok || (tour === 0 && v.longueurGrave);
      if (!refaire) {
        return { entrees: v.entrees, repartition: repartition, tours: tour + 1, journal: journal,
                 normalisations: v.normalisations, avertissements: v.avertissements,
                 longueurs: v.longueurs, mots_recus: v.mots_recus,
                 duree_recue_s: Math.round(v.mots_recus / motsParSeconde()),
                 brut: brut,
                 maxTokens: maxTokens, budgetMs: budgetMs, etapesDemandees: etapes.length };
      }
      if (tour === 1) break;
      // UN SEUL tour de correction, et il dit exactement ce qui ne va pas. Jamais un résultat
      // partiel rendu en silence : ou tout est conforme, ou l'appel échoue avec la raison.
      var aCorriger = v.violations.concat(
        v.longueurGrave ? v.longueurs.map(function (l) { return l.texte; }) : []);
      messages = messages.concat([
        { role: 'assistant', content: brut },
        { role: 'user', content: 'Votre réponse ne respecte pas le contrat sur les points suivants :\n'
          + aCorriger.map(function (x) { return '- ' + x; }).join('\n')
          + '\n\nRecommencez. Rendez UNIQUEMENT le tableau JSON complet, corrigé, '
          + 'avec exactement un élément par étape demandée.' },
      ]);
    }
    // L'ÉCHEC CITE CHAQUE TOUR, pas seulement le dernier : savoir que le second tour a échoué
    // sans savoir ce que le premier reprochait ne permet pas de comprendre ce qui s'est passé.
    var detail = journal.map(function (j) {
      var l = j.violations.concat(j.longueurGrave ? j.longueurs : []);
      return 'tour ' + j.tour + ' : ' + (l.length ? l.slice(0, 6).join(' ; ') : 'aucune violation');
    }).join('\n');
    var e = new Error('le modèle n’a pas respecté le contrat après un tour de correction.\n'
      + detail);
    e.journal = journal;
    e.brut = dernierBrut;   // pour « Voir la réponse du modèle » — jamais la clé, jamais un secret
    throw e;
  }

  // ── RÉÉCRIRE UNE SEULE ÉTAPE ───────────────────────────────────────────────────────────────
  // L'appel ne porte QUE cette étape : l'en-tête du document, le contenu de l'étape, le
  // commentaire de l'étape précédente et de la suivante (pour que la continuité tienne), la
  // cible de mots et la consigne libre de Christophe. Pas les dix-huit autres étapes : elles
  // coûteraient des jetons sans rien apporter, et le modèle n'a pas à les réécrire.
  async function reecrireEtape(doc, stepId, consigne, options) {
    var o = options || {};
    var toutes = contenuParEtape(doc);
    var i = -1;
    for (var k = 0; k < toutes.length; k++) { if (toutes[k].stepId === stepId) { i = k; break; } }
    if (i === -1) throw new Error('étape inconnue : ' + stepId);
    var etape = toutes[i];
    var cible = (o.cible > 0) ? o.cible
      : repartirMots([etape], (typeof o.minutes === 'number' ? o.minutes : DUREE_DEFAUT_MIN)).cibles[0].mots;
    var dejaEcrites = o.dejaEcrites || {};
    var avant = i > 0 ? dejaEcrites[toutes[i - 1].stepId] : null;
    var apres = i + 1 < toutes.length ? dejaEcrites[toutes[i + 1].stepId] : null;

    var lignes = [];
    lignes.push('Titre de la présentation : ' + (doc.title || 'sans titre'));
    if (doc.audience) lignes.push('Public : ' + doc.audience);
    if (doc.purpose) lignes.push('Objectif : ' + doc.purpose);
    lignes.push('');
    lignes.push('Vous réécrivez le commentaire d’UNE SEULE étape. Rendez un tableau JSON d\'un');
    lignes.push('seul élément, pour cette étape et pour aucune autre.');
    lignes.push('');
    if (avant) lignes.push('Commentaire de l’étape PRÉCÉDENTE (ne le répétez pas) : ' + avant);
    if (apres) lignes.push('Commentaire de l’étape SUIVANTE (n’empiétez pas dessus) : ' + apres);
    if (avant || apres) lignes.push('');
    lignes.push('Diapositive : ' + (etape.cardTitle || 'sans titre'));
    lignes.push('  stepId: ' + etape.stepId);
    lignes.push('  cible: ' + cible + ' mots');
    lignes.push('  contenu de cette étape : ' + (etape.texte || '(pas de texte, image ou titre seul)'));
    lignes.push('');
    lignes.push('Consigne de l’auteur : ' + (String(consigne || '').trim() || 'réécrivez autrement.'));

    var message = lignes.join('\n');
    if (message.length > ENTREE_MAX_CARACTERES) throw new Error('consigne trop longue.');
    var maxTokens = jetonsPour(cible);
    var budgetMs = budgetDelaiMs(maxTokens);
    var system = promptSysteme(Object.assign({}, o, { titre: doc.title, public: doc.audience }));
    var transport = o.transport || transportReel;
    var repartition = { cibles: [{ stepId: stepId, mots: cible }] };
    // DEUX FORMES du même document, chacune pour son usage : le tableau de mots pour comparer
    // une citation mot à mot, la chaîne brute pour en découper les PHRASES. Une seule source,
    // deux dérivations — et non deux sources qui finiraient par différer.
    var brutDocument = toutes.map(function (e) {
      return (e.cardTitle || '') + ' ' + (e.texte || ''); }).join(' ');
    var texteDocument = normaliserMots(brutDocument);
    var opts = Object.assign({}, o, { texteDocument: texteDocument,
                                      texteDocumentBrut: brutDocument,
                                      adresse: o.adresse === 'tu' ? 'tu' : 'vous' });
    var messages = [{ role: 'user', content: message }];
    var journal = [];
    for (var tour = 0; tour < 2; tour++) {
      var brut = await transport({ system: system, messages: messages, maxTokens: maxTokens,
                                   budgetMs: budgetMs, tour: tour });
      var v = validerReponse(brut, [etape], repartition, opts);
      journal.push({ tour: tour + 1, violations: v.violations.slice(0, 12) });
      if (v.ok) {
        return { entree: v.entrees[0], tours: tour + 1, journal: journal, brut: brut,
                 cible: cible, avertissements: v.avertissements };
      }
      if (tour === 1) break;
      messages = messages.concat([
        { role: 'assistant', content: brut },
        { role: 'user', content: 'Votre réponse ne respecte pas le contrat :\n'
          + v.violations.map(function (x) { return '- ' + x; }).join('\n')
          + '\n\nRecommencez, avec UNIQUEMENT le tableau JSON d\'un seul élément.' },
      ]);
    }
    var e = new Error('la réécriture n\u2019a pas respecté le contrat : '
      + journal.map(function (j) { return 'tour ' + j.tour + ' : ' + j.violations.join(' ; '); }).join(' | '));
    e.journal = journal;
    throw e;
  }

  window.NarrationIA = {
    // Constantes, exposées pour que les contrôles mesurent les vraies valeurs et non des copies.
    DUREE_DEFAUT_MIN: DUREE_DEFAUT_MIN, DUREE_MIN: DUREE_MIN, DUREE_MAX: DUREE_MAX,
    MOTS_MIN_ETAPE: MOTS_MIN_ETAPE, MOTS_MAX_ETAPE: MOTS_MAX_ETAPE,
    POIDS_TYPE: POIDS_TYPE, poidsEtape: poidsEtape,
    TOLERANCE: TOLERANCE, TOLERANCE_PLANCHER: TOLERANCE_PLANCHER,
    BUDGET_MS_POUR_8000_JETONS: BUDGET_MS_POUR_8000_JETONS,
    BUDGET_PLANCHER_MS: BUDGET_PLANCHER_MS, BUDGET_PLAFOND_MS: BUDGET_PLAFOND_MS,
    ENTREE_MAX_CARACTERES: ENTREE_MAX_CARACTERES, MODELE: MODELE, pauseRe: pauseRe,
    compterMots: compterMots, dureeSecondes: dureeSecondes,
    contenuParEtape: contenuParEtape, repartirMots: repartirMots,
    jetonsPour: jetonsPour, budgetDelaiMs: budgetDelaiMs,
    promptSysteme: promptSysteme, construireMessage: construireMessage,
    normaliserMots: normaliserMots, plusLongueSuite: plusLongueSuite,
    partTrigrammesCommuns: partTrigrammesCommuns, citations: citations,
    phrasesLongues: phrasesLongues, avertissementsEtape: avertissementsEtape,
    phrasesDe: phrasesDe, borneMot: borneMot, PRONOMS: PRONOMS,
    SEUIL_CITATION_PROCHE: SEUIL_CITATION_PROCHE,
    SEUIL_SUITE_MOTS: SEUIL_SUITE_MOTS, SEUIL_TRIGRAMMES: SEUIL_TRIGRAMMES,
    SEUIL_PHRASE_LONGUE: SEUIL_PHRASE_LONGUE, TOLERANCE_PLANCHER_TITRE: TOLERANCE_PLANCHER_TITRE,
    PART_ETAPES_HORS_TOLERANCE: PART_ETAPES_HORS_TOLERANCE,
    extraireJSON: extraireJSON, validerReponse: validerReponse,
    contientMarkdown: contientMarkdown,
    // Le cœur pose ses services par ici. La clé n'est pas gardée : seule la FONCTION qui la
    // lit l'est, et elle n'est appelée qu'au moment de l'envoi.
    _poserServices: function (s) { _services = s; },
    _aLesServices: function () { return !!(_services && _services.urlWorker && _services.cleApi); },
    transportReel: transportReel, sansCle: sansCle,
    normaliserTypographie: normaliserTypographie,
    rediger: rediger, reecrireEtape: reecrireEtape,
  };
})();

// ── L'INTERFACE : un geste contextuel dans la boîte Narration, jamais une fenêtre séparée ────
// Principe 0B de la gouvernance (« palette-et-geste ») : le panneau s'ouvre SOUS le champ, dans
// le document, avec quelques choix rapides. Il n'écrit rien tant que Christophe n'a pas vu.
(function () {
  'use strict';
  var IA = window.NarrationIA;
  if (!IA) return;

  var CSS = '.nia-panneau{margin-top:8px;border:1px solid var(--stone-300,#c9c3b8);border-radius:10px;'
    + 'padding:10px;background:var(--ivory,#faf7f2);font-size:12px;}'
    + '.nia-ligne{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px;}'
    + '.nia-ligne label{display:flex;gap:5px;align-items:center;font-size:12px;}'
    + '.nia-ligne input[type=number]{width:64px;}'
    + '.nia-apercu{max-height:260px;overflow:auto;border-top:1px solid var(--stone-300,#c9c3b8);'
    + 'margin-top:8px;padding-top:8px;}'
    + '.nia-etape{margin-bottom:10px;}'
    + '.nia-etape h5{margin:0 0 2px;font-size:12px;font-weight:600;}'
    + '.nia-garder{display:flex;gap:5px;align-items:center;font-size:11px;color:var(--muted,#667);'
    + 'margin-bottom:2px;cursor:pointer;}'
    + '.nia-etape[data-ecartee="1"] .nia-texte{opacity:.45;}'
    + '.nia-etape .nia-meta{color:var(--muted,#667);font-size:11px;margin:0 0 3px;}'
    + '.nia-etape p.nia-texte{margin:0;white-space:pre-wrap;line-height:1.45;}'
    + '.nia-avertis{margin:4px 0 0;padding-left:16px;}'
    + '.nia-avertis li{font-size:11px;color:var(--terracotta-700,#9c4221);}'
    + '.nia-reecrire-ligne{margin:5px 0 0;gap:6px;}'
    + '.nia-consigne{flex:1 1 180px;font:inherit;font-size:11px;padding:2px 5px;}'
    + '.nia-reecrire-etat{font-size:11px;color:var(--muted,#667);}'
    + '.nia-brut{max-height:160px;overflow:auto;white-space:pre-wrap;font-size:11px;'
    + 'background:#fff;border:1px solid var(--stone-300,#c9c3b8);padding:6px;margin-top:6px;}'
    + '.nia-etat{margin:6px 0 0;color:var(--muted,#667);white-space:pre-wrap;}'
    + '.nia-etat[data-erreur]{color:var(--terracotta-700,#9c4221);}';

  function poserCss() {
    if (document.getElementById('nia-css')) return;
    var el = document.createElement('style');
    el.id = 'nia-css'; el.textContent = CSS;
    document.head.appendChild(el);
  }

  function docCourant() {
    var cle = window._adocWsState && window._adocWsState.storeKey;
    var art = cle && window._adocArtifacts && window._adocArtifacts[cle];
    return (art && art._adocStructuredDoc) || null;
  }

  // Le dernier geste, pour l'annuler. Une seule profondeur : « annulation d'un geste », pas un
  // historique — c'est ce que demande le lot, et un historique qui n'est pas éprouvé ment.
  var dernierGeste = null;

  function dire(panneau, texte, erreur) {
    var e = panneau.querySelector('.nia-etat');
    e.textContent = texte || '';
    if (erreur) e.setAttribute('data-erreur', ''); else e.removeAttribute('data-erreur');
  }

  function construirePanneau() {
    var p = document.createElement('div');
    p.className = 'nia-panneau';
    p.hidden = true;
    p.innerHTML =
      '<div class="nia-ligne">'
      + '<label>Durée visée <input type="number" class="nia-minutes" min="' + IA.DUREE_MIN + '" max="' + IA.DUREE_MAX + '" step="1" value="' + IA.DUREE_DEFAUT_MIN + '"> min</label>'
      + '<label>Adresse <select class="nia-adresse"><option value="vous" selected>vous</option><option value="tu">tu</option></select></label>'
      + '<label><input type="checkbox" class="nia-vides" checked> n’écrire que les étapes vides</label>'
      + '</div>'
      + '<div class="nia-ligne">'
      + '<button type="button" class="nia-generer">Rédiger</button>'
      + '<button type="button" class="nia-appliquer" disabled>Appliquer</button>'
      + '<button type="button" class="nia-annuler" disabled>Annuler ce geste</button>'
      + '<button type="button" class="nia-fermer">Fermer</button>'
      + '</div>'
      + '<p class="nia-etat" role="status" aria-live="polite"></p>'
      + '<div class="nia-apercu" hidden></div>';
    return p;
  }

  function rendreApercu(panneau, res, doc) {
    var zone = panneau.querySelector('.nia-apercu');
    zone.hidden = false;
    var etapes = IA.contenuParEtape(doc);
    var titres = {};
    etapes.forEach(function (e) {
      titres[e.stepId] = 'Diapositive « ' + (e.cardTitle || 'sans titre') + ' », étape '
        + e.rang + ' sur ' + e.surRang;
    });
    zone.innerHTML = res.entrees.map(function () {
      return '<div class="nia-etape">'
        + '<label class="nia-garder"><input type="checkbox" class="nia-garder-case" checked>'
        + ' appliquer cette étape</label>'
        + '<h5></h5><p class="nia-meta"></p>'
        + '<p class="nia-texte"></p><ul class="nia-avertis"></ul>'
        + '<div class="nia-ligne nia-reecrire-ligne">'
        + '<input type="text" class="nia-consigne" placeholder="plus court, un autre exemple…">'
        + '<button type="button" class="nia-reecrire">Réécrire cette étape</button>'
        + '<span class="nia-reecrire-etat"></span></div></div>';
    }).join('');
    Array.prototype.forEach.call(zone.querySelectorAll('.nia-etape'), function (el, i) {
      var en = res.entrees[i];
      el.dataset.stepId = en.stepId;
      el.querySelector('h5').textContent = titres[en.stepId] || en.stepId;
      el.querySelector('.nia-meta').textContent = en.mots + ' mots (cible ' + en.cible + ') — '
        + Math.round(IA.dureeSecondes(en.text)) + ' s'
        + (en.horsTolerance ? '  —  hors tolérance (± ' + en.marge + ')' : '');
      el.querySelector('.nia-texte').textContent = en.text;
      // LES AVERTISSEMENTS, SOUS LE TEXTE DE L'ÉTAPE. Ils ne refusent rien : ils disent où
      // regarder. Christophe ne doit pas relire dix-neuf étapes pour trouver les trois qui
      // redisent l'écran.
      var ul = el.querySelector('.nia-avertis');
      // Jamais de puce vide : un avertissement sans texte afficherait un point isolé sous
      // l'étape, exactement le genre de chose qu'on passe dix minutes à chercher.
      (en.avertissements || []).filter(function (a) {
        return a && typeof a.texte === 'string' && a.texte.trim();
      }).forEach(function (a) {
        var li = document.createElement('li');
        li.className = 'nia-avertis-' + a.type;
        li.textContent = a.texte;
        ul.appendChild(li);
      });
      ul.hidden = !ul.children.length;
      var case_ = el.querySelector('.nia-garder-case');
      // L'état de la case SURVIT à un nouveau rendu de l'aperçu : réécrire une étape ne doit
      // pas recocher celles que Christophe avait écartées.
      case_.checked = (en.appliquer !== false);
      el.dataset.ecartee = case_.checked ? '0' : '1';
      case_.onchange = function () {
        en.appliquer = case_.checked;
        el.dataset.ecartee = case_.checked ? '0' : '1';
        majCompteAppliquer(panneau, res);
      };
      el.querySelector('.nia-reecrire').onclick = function () {
        reecrire(panneau, el, en.stepId, res, doc);
      };
    });
  }

  // « Réécrire cette étape » ne touche QUE l'aperçu : le document n'est écrit qu'à « Appliquer ».
  async function reecrire(panneau, el, stepId, res, doc) {
    var btn = el.querySelector('.nia-reecrire');
    var etat = el.querySelector('.nia-reecrire-etat');
    var consigne = el.querySelector('.nia-consigne').value;
    var i = -1;
    for (var k = 0; k < res.entrees.length; k++) { if (res.entrees[k].stepId === stepId) { i = k; break; } }
    if (i === -1) return;
    btn.disabled = true;
    etat.textContent = 'réécriture…';
    try {
      var dejaEcrites = {};
      res.entrees.forEach(function (x) { dejaEcrites[x.stepId] = x.text; });
      var r = await IA.reecrireEtape(doc, stepId, consigne, {
        cible: res.entrees[i].cible,
        adresse: panneau.querySelector('.nia-adresse').value,
        dejaEcrites: dejaEcrites,
        transport: window.NarrationIA._transportDEssai || undefined,
      });
      res.entrees[i] = Object.assign({}, r.entree,
        { avertissements: (r.avertissements[0] && r.avertissements[0].liste) || [] });
      rendreApercu(panneau, res, doc);
      majCompteAppliquer(panneau, res);
      dire(panneau, 'Étape réécrite dans l\u2019aperçu seulement. Rien n\u2019est écrit tant que '
        + 'vous n\u2019avez pas cliqué « Appliquer ».');
    } catch (e) {
      etat.textContent = '';
      dire(panneau, 'Réécriture impossible : ' + (e && e.message || e), true);
    } finally { btn.disabled = false; }
  }

  // Le libellé du bouton « Appliquer » dit COMBIEN d'étapes il écrira. Un bouton qui ne dit pas
  // ce qu'il va faire est un bouton qu'on clique en espérant.
  function majCompteAppliquer(panneau, res) {
    var btn = panneau.querySelector('.nia-appliquer');
    if (!btn || !res) return;
    var n = res.entrees.filter(function (e) { return e.appliquer !== false; }).length;
    btn.textContent = n === res.entrees.length
      ? 'Appliquer (' + n + ')'
      : 'Appliquer (' + n + ' sur ' + res.entrees.length + ')';
    btn.disabled = n === 0;
  }

  function brancher(boite, servicesDuCoeur) {
    // Les services sont enregistrés MÊME si le bouton est déjà posé : `brancher` est rappelé à
    // chaque rafraîchissement de l'éditeur, et sortir tôt sans les prendre laisserait le module
    // sans adresse après un simple changement de sélection.
    if (servicesDuCoeur && typeof servicesDuCoeur.urlWorker === 'function'
      && typeof servicesDuCoeur.cleApi === 'function') {
      IA._poserServices(servicesDuCoeur);
    }
    if (!boite || boite.querySelector('.nia-bouton')) return;
    poserCss();
    var bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'nia-bouton';
    bouton.textContent = 'Rédiger la narration';
    bouton.style.cssText = 'margin-top:6px;font:inherit;padding:4px 10px;cursor:pointer;';
    var panneau = construirePanneau();
    boite.appendChild(bouton);
    boite.appendChild(panneau);

    bouton.onclick = function () { panneau.hidden = !panneau.hidden; };
    panneau.querySelector('.nia-fermer').onclick = function () { panneau.hidden = true; };

    var dernierResultat = null;

    panneau.querySelector('.nia-generer').onclick = async function () {
      var doc = docCourant();
      if (!doc) { dire(panneau, 'Aucun document ouvert.', true); return; }
      var btn = this;
      btn.disabled = true;
      panneau.querySelector('.nia-appliquer').disabled = true;
      dire(panneau, 'Rédaction en cours…');
      try {
        var res = await IA.rediger(doc, {
          minutes: Number(panneau.querySelector('.nia-minutes').value),
          adresse: panneau.querySelector('.nia-adresse').value,
          seulementVides: panneau.querySelector('.nia-vides').checked,
          transport: window.NarrationIA._transportDEssai || undefined,
        });
        dernierResultat = res;
        // Gardés pour que les contrôles puissent redemander un rendu identique — c'est ce que
        // fait une réécriture, et c'est là que l'état des cases doit survivre.
        window.__dernierRes = res; window.__dernierDoc = doc;
        rendreApercu(panneau, res, doc);
        panneau.querySelector('.nia-appliquer').disabled = false;
        majCompteAppliquer(panneau, res);
        var r = res.repartition;
        // Une durée inatteignable est DITE, pas tue. Sans cette phrase, l'aperçu annoncerait
        // 6,4 min pour une demande de 10 min sans que rien ne l'explique.
        var avertissement = '';
        if (!r.atteignable) {
          avertissement = '\nLa durée visée n’est pas atteignable sur ' + res.entrees.length
            + ' étape(s) : ' + (r.limite === 'plafond'
              ? 'le plafond de ' + r.max + ' mots par étape donne au plus '
              : 'le plancher de ' + r.min + ' mots par étape donne au moins ')
            + Math.round(r.duree_estimee_s / 60 * 10) / 10 + ' min, pas '
            + Math.round(r.duree_visee_s / 60 * 10) / 10 + ' min.';
        }
        // LE TOTAL AFFICHÉ EST LA MESURE, JAMAIS LA CIBLE. Le 9 octobre, la ligne d'état
        // annonçait « 1197 mots répartis » alors que 1 109 mots avaient été reçus : 1197 était
        // la cible de la répartition, pas un résultat. Un chiffre affiché doit être ce que la
        // page a reçu, pas ce que le code avait demandé.
        var ecart = r.total_reparti ? (res.mots_recus - r.total_reparti) / r.total_reparti : 0;
        var signe = ecart >= 0 ? '+' : '−';
        // LES INFORMATIONS NEUTRES NE COMPTENT PAS. Un propos imaginé entre guillemets est
        // légitime : le faire entrer dans le compte ferait monter un chiffre que Christophe lit
        // comme « ce qu'il reste à corriger », et ce chiffre deviendrait faux.
        var nAvertis = (res.avertissements || []).reduce(function (a, x) {
          return a + x.liste.filter(function (av) { return !av.information; }).length;
        }, 0);
        dire(panneau, res.entrees.length + ' étape(s) rédigée(s).'
          + '\n' + res.mots_recus + ' mots reçus, cible ' + r.total_reparti + ', '
          + signe + Math.abs(Math.round(ecart * 100)) + ' %, environ '
          + Math.round(res.duree_recue_s / 60 * 10) / 10 + ' min pour '
          + Math.round(r.duree_estimee_s / 60 * 10) / 10 + '.'
          + avertissement
          + (res.longueurs && res.longueurs.length
              ? '\n' + res.longueurs.length + ' étape(s) hors tolérance — signalées, non bloquantes.' : '')
          + (nAvertis ? '\n' + nAvertis + ' avertissement(s) sous les étapes : à relire de près.' : '')
          + (res.tours > 1 ? '\nUn tour de correction a été nécessaire.' : '')
          + '\nRien n’est encore écrit : relisez, puis cliquez « Appliquer ».');
      } catch (e) {
        panneau.querySelector('.nia-apercu').hidden = true;
        dire(panneau, 'Rédaction impossible : ' + (e && e.message || e), true);
        // « VOIR LA RÉPONSE DU MODÈLE » — le brut de la dernière réponse, pour comprendre ce
        // qui s'est passé. Jamais la clé : elle n'est ni dans le message, ni dans le brut, qui
        // est ce que le modèle a écrit. Le bouton n'apparaît que s'il y a quelque chose à voir.
        var ancien = panneau.querySelector('.nia-voir-brut');
        if (ancien) ancien.remove();
        var ancienBloc = panneau.querySelector('.nia-brut');
        if (ancienBloc) ancienBloc.remove();
        if (e && e.brut) {
          var voir = document.createElement('button');
          voir.type = 'button';
          voir.className = 'nia-voir-brut';
          voir.textContent = 'Voir la réponse du modèle';
          voir.style.cssText = 'font:inherit;font-size:11px;padding:3px 8px;margin-top:6px;cursor:pointer;';
          var bloc = document.createElement('pre');
          bloc.className = 'nia-brut';
          bloc.hidden = true;
          bloc.textContent = IA.sansCle(String(e.brut));
          voir.onclick = function () { bloc.hidden = !bloc.hidden; };
          panneau.appendChild(voir);
          panneau.appendChild(bloc);
        }
      } finally { btn.disabled = false; }
    };

    panneau.querySelector('.nia-appliquer').onclick = function () {
      var doc = docCourant();
      if (!doc || !dernierResultat) return;
      // N4 — JAMAIS d'écrasement sans confirmation. On compte ce qui serait remplacé, et on le
      // dit avec le nombre exact : « des narrations existent » ne permet pas de décider.
      // SEULES LES ÉTAPES COCHÉES sont écrites. Christophe en garde environ quatorze sur
      // dix-neuf et refait les autres : refaire une étape ne doit pas écraser les treize
      // qu'il avait validées.
      var aEcrire = dernierResultat.entrees.filter(function (en) { return en.appliquer !== false; });
      if (!aEcrire.length) { dire(panneau, 'Aucune étape cochée : rien à écrire.'); return; }
      var existantes = aEcrire.filter(function (en) {
        var t = window.adocNarrationRead(doc, en.stepId);
        return t && t.trim();
      });
      if (existantes.length) {
        var ok = window.confirm(existantes.length + ' étape(s) portent déjà une narration. '
          + 'L’appliquer remplacera ce texte.\n\nContinuer ?');
        if (!ok) { dire(panneau, 'Rien n’a été écrit.'); return; }
      }
      // L'état d'AVANT, en entier : c'est lui que « Annuler ce geste » restaure.
      dernierGeste = { doc: doc, avant: JSON.parse(JSON.stringify(doc.narration || [])) };
      aEcrire.forEach(function (en) {
        window.adocNarrationWrite(doc, en.stepId, en.text);
      });
      panneau.querySelector('.nia-annuler').disabled = false;
      dire(panneau, aEcrire.length + ' narration(s) écrite(s) dans le document'
        + (aEcrire.length < dernierResultat.entrees.length
            ? ' (' + (dernierResultat.entrees.length - aEcrire.length) + ' étape(s) écartée(s)).' : '.')
        + (existantes.length ? '\n' + existantes.length + ' remplacée(s), après confirmation.' : '')
        + '\nRien n’est enregistré tant que vous n’avez pas enregistré le document.');
      rafraichirChamp();
    };

    panneau.querySelector('.nia-annuler').onclick = function () {
      if (!dernierGeste) return;
      // Restaure l'état d'avant EXACTEMENT : on vide puis on repose, plutôt que de réécrire
      // étape par étape — une narration ajoutée là où il n'y en avait aucune doit disparaître.
      dernierGeste.doc.narration = JSON.parse(JSON.stringify(dernierGeste.avant));
      if (!dernierGeste.doc.narration.length) delete dernierGeste.doc.narration;
      dire(panneau, 'Geste annulé : la narration est revenue à son état d’avant.');
      dernierGeste = null;
      this.disabled = true;
      rafraichirChamp();
    };
  }

  function rafraichirChamp() {
    // Le champ du lot 1a doit montrer ce que le document porte maintenant. On passe par le
    // rafraîchissement de l'éditeur plutôt que d'écrire dans le textarea : une seule source.
    if (typeof window.adocEditorRefreshControls === 'function') {
      try { window.adocEditorRefreshControls(); return; } catch (e) {}
    }
    var zone = document.querySelector('[data-editor-narration]');
    var doc = docCourant();
    if (zone && doc && zone.dataset.stepId) {
      zone.value = window.adocNarrationRead(doc, zone.dataset.stepId) || '';
      zone.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  window.NarrationIA.brancher = brancher;
  // Exposé POUR ÊTRE ÉPROUVÉ : le filtre contre les puces vides défend contre un avertissement
  // sans texte, qu'aucun des cinq ne produit aujourd'hui. Sans ce point d'entrée, la défense
  // serait intestable — et une défense intestable finit par disparaître sans que personne
  // le voie.
  window.NarrationIA._rendreApercu = rendreApercu;
  window.NarrationIA._dernierGeste = function () { return dernierGeste; };
})();
