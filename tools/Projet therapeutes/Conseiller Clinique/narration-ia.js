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

  // TOLÉRANCE DE LONGUEUR : ±20 %, avec un plancher de 5 mots. 20 % de 60 mots font 12 mots,
  // soit environ 5 secondes — inaudible comme défaut de rythme. Le plancher évite qu'une cible
  // de 15 mots soit refusée pour 3 mots d'écart, ce qu'aucun modèle ne sait éviter.
  var TOLERANCE = 0.20;
  var TOLERANCE_PLANCHER = 5;

  // BUDGET DE DÉLAI, par la règle maison : 90 s pour 8 000 jetons, proportionnel. Le plancher
  // est le délai de transport de l'appel 2 existant (45 s) : descendre en dessous contredirait
  // un précédent déjà mesuré dans ce dépôt.
  var BUDGET_MS_POUR_8000_JETONS = 90000;
  var BUDGET_PLANCHER_MS = 45000;
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
    var poids = etapes.map(function (e) { return Math.max(1, compterMots(e.texte)); });
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
      cibles: etapes.map(function (e, i) { return { stepId: e.stepId, mots: cibles[i] }; }),
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
    } else if (/patient|accompagn|consultant|couple en|personne suivie/.test(pub)) {
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
      '- Aucune parenthèse, aucun tiret d\'incise, aucune énumération à puces, aucune tournure',
      '  qui ne se dit pas (« cf. », « c.-à-d. », « etc. », « voir ci-dessous »).',
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
      'UN SEUL DISCOURS, DU DÉBUT À LA FIN.',
      'Vous n\'écrivez pas des commentaires séparés : vous écrivez UN texte continu, découpé en',
      'étapes. Chaque étape reprend là où la précédente s\'est arrêtée.',
      '- Ne réutilisez jamais un exemple, une image ou une comparaison déjà employés. Si vous avez',
      '  parlé d\'une porte fermée à l\'étape deux, n\'y revenez pas à l\'étape sept.',
      '- La PREMIÈRE étape ouvre la vidéo : elle pose la question à laquelle tout le reste répond.',
      '  Ne commencez pas par « Dans cette présentation, nous allons voir… ».',
      '- La DERNIÈRE étape referme. Elle ne récapitule pas mécaniquement ce qui a été dit : elle',
      '  laisse le spectateur avec une chose à emporter, ou une question à se poser.',
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

  var MARKDOWN_RE = /(^|\s)([*_]{1,2})\S|\*\*|^#{1,6}\s|^\s*[-*+]\s|\[[^\]]*\]\([^)]*\)|`/m;

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

  function validerReponse(brut, etapesDemandees, repartition, options) {
    var o = options || {};
    var tolerance = typeof o.tolerance === 'number' ? o.tolerance : TOLERANCE;
    var plancher = typeof o.plancher === 'number' ? o.plancher : TOLERANCE_PLANCHER;
    var violations = [];
    var tableau = extraireJSON(brut);
    if (!Array.isArray(tableau)) {
      return { ok: false, entrees: [], violations: ['la réponse n\'est pas un tableau JSON lisible'] };
    }
    var attendus = etapesDemandees.map(function (e) { return e.stepId; });
    var cibles = {};
    repartition.cibles.forEach(function (c) { cibles[c.stepId] = c.mots; });

    var vus = [], entrees = [], normalisations = [];
    tableau.forEach(function (el, i) {
      if (!el || typeof el !== 'object') { violations.push('élément ' + (i + 1) + ' : pas un objet'); return; }
      var id = el.stepId, texte = el.text;
      if (typeof id !== 'string' || !id) { violations.push('élément ' + (i + 1) + ' : stepId absent'); return; }
      if (typeof texte !== 'string' || !texte.trim()) { violations.push(id + ' : texte vide'); return; }
      if (attendus.indexOf(id) === -1) { violations.push(id + ' : identifiant inconnu'); return; }
      if (vus.indexOf(id) !== -1) { violations.push(id + ' : en double'); return; }
      vus.push(id);
      if (MARKDOWN_RE.test(texte)) violations.push(id + ' : le texte contient du Markdown');
      var typo = normaliserTypographie(texte);
      if (typo.refus) { violations.push(id + ' : ' + typo.refus); return; }
      if (typo.notes.length) normalisations.push(id + ' : ' + typo.notes.join(', '));
      texte = typo.texte;
      var n = compterMots(texte), cible = cibles[id] || 0;
      var marge = Math.max(plancher, Math.round(cible * tolerance));
      if (n < cible - marge) violations.push(id + ' : trop court (' + n + ' mots pour ' + cible + ' ± ' + marge + ')');
      if (n > cible + marge) violations.push(id + ' : trop long (' + n + ' mots pour ' + cible + ' ± ' + marge + ')');
      entrees.push({ stepId: id, text: texte.trim(), mots: n, cible: cible });
    });
    attendus.forEach(function (id) {
      if (vus.indexOf(id) === -1) violations.push(id + ' : étape manquante');
    });
    return { ok: violations.length === 0, entrees: entrees, violations: violations,
             normalisations: normalisations };
  }

  // ── L'appel, avec UN seul tour de correction ───────────────────────────────────────────────
  // Le transport est injectable : c'est ce qui permet d'éprouver toute la chaîne sans un seul
  // appel réel, et c'est le même procédé que adocResolveImagesForExport (opts.fetchPhoto).
  async function transportReel(requete) {
    var workerUrl = window.adocGetWorkerUrl && window.adocGetWorkerUrl();
    if (!workerUrl) throw new Error('adresse du Worker non configurée.');
    var ctrl = new AbortController();
    var tid = setTimeout(function () { ctrl.abort(); }, requete.budgetMs);
    try {
      var r = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': window.adocGetApiKey() },
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
        throw new Error('le serveur a refusé l’appel (' + r.status + (detail ? ' — ' + detail : '') + ').');
      }
      var data = await r.json();
      var bloc = (data.content || []).filter(function (c) { return c.type === 'text'; })[0];
      return (bloc && bloc.text) || '';
    } catch (e) {
      if (e && e.name === 'AbortError') {
        throw new Error('pas de réponse en ' + Math.round(requete.budgetMs / 1000) + ' s — appel abandonné.');
      }
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

    for (var tour = 0; tour < 2; tour++) {
      var brut = await transport({ system: system, messages: messages, maxTokens: maxTokens,
                                   budgetMs: budgetMs, tour: tour });
      var v = validerReponse(brut, etapes, repartition, o);
      journal.push({ tour: tour + 1, violations: v.violations.slice(0, 12) });
      if (v.ok) {
        return { entrees: v.entrees, repartition: repartition, tours: tour + 1, journal: journal,
                 normalisations: v.normalisations,
                 maxTokens: maxTokens, budgetMs: budgetMs, etapesDemandees: etapes.length };
      }
      if (tour === 1) break;
      // UN SEUL tour de correction, et il dit exactement ce qui ne va pas. Jamais un résultat
      // partiel rendu en silence : ou tout est conforme, ou l'appel échoue avec la raison.
      messages = messages.concat([
        { role: 'assistant', content: brut },
        { role: 'user', content: 'Votre réponse ne respecte pas le contrat sur les points suivants :\n'
          + v.violations.map(function (x) { return '- ' + x; }).join('\n')
          + '\n\nRecommencez. Rendez UNIQUEMENT le tableau JSON complet, corrigé, '
          + 'avec exactement un élément par étape demandée.' },
      ]);
    }
    var e = new Error('le modèle n’a pas respecté le contrat après un tour de correction : '
      + journal[journal.length - 1].violations.slice(0, 6).join(' ; '));
    e.journal = journal;
    throw e;
  }

  window.NarrationIA = {
    // Constantes, exposées pour que les contrôles mesurent les vraies valeurs et non des copies.
    DUREE_DEFAUT_MIN: DUREE_DEFAUT_MIN, DUREE_MIN: DUREE_MIN, DUREE_MAX: DUREE_MAX,
    MOTS_MIN_ETAPE: MOTS_MIN_ETAPE, MOTS_MAX_ETAPE: MOTS_MAX_ETAPE,
    TOLERANCE: TOLERANCE, TOLERANCE_PLANCHER: TOLERANCE_PLANCHER,
    BUDGET_MS_POUR_8000_JETONS: BUDGET_MS_POUR_8000_JETONS,
    BUDGET_PLANCHER_MS: BUDGET_PLANCHER_MS, BUDGET_PLAFOND_MS: BUDGET_PLAFOND_MS,
    ENTREE_MAX_CARACTERES: ENTREE_MAX_CARACTERES, MODELE: MODELE, pauseRe: pauseRe,
    compterMots: compterMots, dureeSecondes: dureeSecondes,
    contenuParEtape: contenuParEtape, repartirMots: repartirMots,
    jetonsPour: jetonsPour, budgetDelaiMs: budgetDelaiMs,
    promptSysteme: promptSysteme, construireMessage: construireMessage,
    extraireJSON: extraireJSON, validerReponse: validerReponse,
    normaliserTypographie: normaliserTypographie,
    rediger: rediger,
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
    + '.nia-etape .nia-meta{color:var(--muted,#667);font-size:11px;margin:0 0 3px;}'
    + '.nia-etape p.nia-texte{margin:0;white-space:pre-wrap;line-height:1.45;}'
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
    zone.innerHTML = res.entrees.map(function (en) {
      var s = Math.round(IA.dureeSecondes(en.text));
      return '<div class="nia-etape"><h5></h5>'
        + '<p class="nia-meta"></p><p class="nia-texte"></p></div>';
    }).join('');
    Array.prototype.forEach.call(zone.querySelectorAll('.nia-etape'), function (el, i) {
      var en = res.entrees[i];
      el.querySelector('h5').textContent = titres[en.stepId] || en.stepId;
      el.querySelector('.nia-meta').textContent = en.mots + ' mots (cible ' + en.cible + ') — '
        + Math.round(IA.dureeSecondes(en.text)) + ' s';
      el.querySelector('.nia-texte').textContent = en.text;
    });
  }

  function brancher(boite) {
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
        rendreApercu(panneau, res, doc);
        panneau.querySelector('.nia-appliquer').disabled = false;
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
        dire(panneau, res.entrees.length + ' étape(s) rédigée(s), '
          + r.total_reparti + ' mots répartis, environ '
          + Math.round(r.duree_estimee_s / 60 * 10) / 10 + ' min.'
          + avertissement
          + (res.tours > 1 ? '\nUn tour de correction a été nécessaire.' : '')
          + '\nRien n’est encore écrit : relisez, puis cliquez « Appliquer ».');
      } catch (e) {
        panneau.querySelector('.nia-apercu').hidden = true;
        dire(panneau, 'Rédaction impossible : ' + (e && e.message || e), true);
      } finally { btn.disabled = false; }
    };

    panneau.querySelector('.nia-appliquer').onclick = function () {
      var doc = docCourant();
      if (!doc || !dernierResultat) return;
      // N4 — JAMAIS d'écrasement sans confirmation. On compte ce qui serait remplacé, et on le
      // dit avec le nombre exact : « des narrations existent » ne permet pas de décider.
      var existantes = dernierResultat.entrees.filter(function (en) {
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
      dernierResultat.entrees.forEach(function (en) {
        window.adocNarrationWrite(doc, en.stepId, en.text);
      });
      panneau.querySelector('.nia-annuler').disabled = false;
      dire(panneau, dernierResultat.entrees.length + ' narration(s) écrite(s) dans le document.'
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
  window.NarrationIA._dernierGeste = function () { return dernierGeste; };
})();
