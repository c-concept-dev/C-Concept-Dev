// ── LOT 3, JALON I — ENREGISTREUR DE VOIX : CAPTURE ET STOCKAGE ─────────────────────────────
//
// Module SÉPARÉ, branché par injection comme narration-ia.js (décision « Module à part » du CDC).
// Le cœur — ou, au jalon I, la page de banc — ne fournit que deux accroches : un conteneur et un
// appel à `EnregistreurVoix.brancher`. Aucune clé, aucune adresse, aucun appel réseau : la voix
// reste sur le Mac (exigence de confidentialité du CDC), et ce module ne sait pas parler à un
// serveur.
//
// CE QUE CE FICHIER EST SEUL À FAIRE : transformer des SOMMES en grandeurs. Décibels,
// corrélation entre canaux, choix du canal retenu, blocs perdus. Le worklet poste des sommes
// brutes et n'en tire rien (voir son en-tête) : une grandeur, une fonction — régression #11(f).
//
// CE QU'IL NE FAIT PAS À CE JALON (II) : la forme d'onde, donc ni le raccord d'une pause ni les
// repères tracés dessus ; l'image à côté de la bande (R10, lot 4) ; le déplacement d'un repère à
// la souris (T4) ; le chutier, les coupes, le blocage de l'export par T6. La bande rythmo, les
// repères, le compte à rebours, l'import et la reprise avec amorce, eux, SONT là (T3, T3 bis).
// Rien n'est grisé : ce qui n'existe pas est ABSENT.
//
// LES NOMS PRIS SUR `window` — la liste est BALAYÉE dans cette source par le contrôle, jamais
// écrite à la main (régression #11(b)) : `window.VoixStockage` (le stockage, fichier voisin).
// Tout le reste arrive par `brancher`.

(function () {
  'use strict';

  // ── LA TAILLE D'UN MORCEAU, ET POURQUOI ────────────────────────────────────────────────────
  //
  // 48 000 Hz × 2 octets (entier 16 bits) × 1 canal = 96 000 octets par seconde.
  //   · 5 s  → 240 000 échantillons, 480 000 octets, 1 875 blocs de worklet EXACTEMENT.
  //   · 2 s  →  96 000 échantillons, 192 000 octets,   750 blocs EXACTEMENT.
  // Quinze minutes : 180 morceaux de 5 s, ou 450 morceaux de 2 s, pour 86,4 Mo dans les deux cas.
  //
  // Ce qui se perd si l'ordinateur s'arrête net : au plus UN morceau — la durée du morceau. 5 s
  // est la proposition ; 2 s divise la perte par 2,5 au prix de 2,5 fois plus de transactions.
  // Les deux sont mesurées côte à côte avant que la valeur ne soit figée (le contrôle le fait),
  // et la taille reste réglable dans l'interface.
  var TAILLES_MORCEAU_S = [5, 2];
  var TAILLE_MORCEAU_S_DEFAUT = 5;

  // Plancher d'affichage du vu-mètre. −60 dBFS est sous le plancher de bruit mesuré du micro
  // intégré (−71 à −73 dBFS) : en dessous, la barre serait à zéro et l'aiguille ne dirait plus
  // rien. Le CHIFFRE affiché, lui, descend plus bas que la barre — c'est la mesure, pas la cible.
  var DBFS_PLANCHER_BARRE = -60;

  // Un canal est « quasi vide » sous −80 dBFS de valeur efficace : il porte quelque chose, mais
  // pas la voix. Pourquoi ce palier en plus du zéro numérique strict : le micro intégré du Mac
  // livre un canal droit à ZÉRO EXACT (mesuré au lot 0), mais une entrée débranchée peut livrer
  // −90 dBFS de bruit de convertisseur. La confondre avec un canal actif ferait prendre une
  // moyenne, et la moyenne avec un canal vide coûte 6 dB — l'erreur que E3 interdit.
  var DBFS_QUASI_VIDE = -80;

  // Seuil de la règle de Christophe : deux canaux actifs dont la corrélation dépasse 0,8
  // portent la même chose, et leur moyenne ne perd rien.
  var CORRELATION_MEME_SIGNAL = 0.8;

  // ── (a) LA FRÉQUENCE : MESURÉE, PUIS DÉCIDÉE ──────────────────────────────────────────────
  //
  // Les deux prises réelles de Christophe sont arrivées à 44 100 Hz, là où le lot 0 avait mesuré
  // 48 000. J'ai donc essayé `new AudioContext({ sampleRate: 48000 })` et mesuré ce qui arrive.
  //
  // CE QUE J'AI MESURÉ. Chromium ET WebKit (le moteur de son Safari) honorent la demande : le
  // contexte rend bien 48 000. Mais la PISTE du micro reste à 44 100 — c'est le périphérique qui
  // la fixe — et le contexte rééchantillonne donc 44 100 → 48 000 en amont de nous.
  //
  // POURQUOI JE GARDE LE NATIF, malgré une option honorée. Demander 48 000 ne donne pas une
  // capture à 48 kHz : cela donne une INTERPOLATION, faite par un rééchantillonneur que nous ne
  // choisissons pas et que nous ne pouvons pas éprouver de l'intérieur, qui coûte 8,8 % d'octets
  // sans ajouter un seul échantillon d'information, et qui EFFACE la fréquence réelle de la
  // capture — la prise dirait 48 000 et plus personne ne saurait que la voix est née à 44 100.
  // Le lot 4 doit de toute façon savoir rééchantillonner, puisqu'une voix importée arrive à
  // n'importe quelle fréquence : autant que ce rééchantillonnage se fasse UNE fois, là où nous
  // le choisissons et où un contrôle peut le mesurer, avec l'avis visible que le CDC demande.
  //
  // Mettre 48000 ici rétablit la demande : le reste du code suit, et la prise enregistrera la
  // fréquence que le contexte aura réellement.
  var FREQUENCE_DEMANDEE = null;   // null = la fréquence native du périphérique

  // ── (b) LA FENÊTRE DE DÉCISION DU CANAL ───────────────────────────────────────────────────
  //
  // La décision se prend sur les DEUX DERNIÈRES SECONDES mesurées juste avant « Commencer », et
  // non sur tout ce qui a été vu depuis l'autorisation : après `getUserMedia`, le périphérique
  // met un instant à se stabiliser, et les premiers dixièmes de seconde peuvent porter un canal
  // momentanément actif qui retombera à zéro. Une fenêtre minimale d'une seconde évite de
  // décider sur trois relevés.
  var FENETRE_CANAL_S = 2;
  var FENETRE_CANAL_MIN_S = 1;

  // ── (d) LE BRUIT DE PIÈCE (T13) : UNE SEULE CONSTANTE ─────────────────────────────────────
  //
  // LES TROIS PALIERS SONT CEUX DU CDC et ne bougent pas (décision de Christophe du 11 octobre) :
  // ils viennent de PLANCHERS DE SILENCE mesurés — −71 à −73 dBFS dans une pièce calme au lot 0,
  // −55,7 à −57,9 dBFS dans sa salle de soins à générateurs — et non de moyennes. C'est
  // l'ESTIMATEUR qui change, pas les seuils : ils s'appliquent désormais à un plancher, c'est-à-
  // dire à la grandeur dont ils ont toujours été tirés.
  //
  // `partGraveMin` : au-delà de cette part d'énergie conservée par le passe-bas de 120 Hz du
  // worklet, le bruit est dit GRAVE — c'est le cas de sa salle (raies à 50 et 100 Hz). Un filtre
  // le réduira au mixage, donc on le dit sans rien bloquer.
  var BRUIT = {
    calmeMax_dbfs: -65,      // ≤ −65 : calme
    bruyantMin_dbfs: -58,    // > −58 : bruyant ; entre les deux : correct
    partGraveMin: 0.5,       // plus de la moitié de l'énergie sous la coupure du passe-bas
    secondes: 3,             // la durée du silence initial de T13

    // ── LES RÉGLAGES DE L'ESTIMATEUR ROBUSTE, chacun avec le fait qui le fixe ──────────────
    //
    // `centile` : 20, demandé par Christophe. Un centile bas décrit le PLANCHER de la pièce ;
    // pour qu'un bruit le déplace, il devrait occuper plus d'un cinquième du temps — et il ne
    // serait alors plus bref. La valeur efficace de la fenêtre entière, elle, est une moyenne
    // d'énergie : 640 ms de clics à −58 dBFS y pèsent plus que 2,36 s de silence à −75, ce qui
    // donnait les −63,9 dBFS « correct » d'une pièce dont le plancher est à −75.
    centile: 20,
    //
    // `margeOccupee_db` : au-delà de cette hauteur au-dessus de la fenêtre de 100 ms LA PLUS
    // CALME, une fenêtre est dite occupée par autre chose que le bruit de la pièce. 12 dB, et la
    // valeur est encadrée par deux mesures faites sur les fixtures de référence, pas choisie :
    //   · un bruit STATIONNAIRE ne s'écarte presque pas de son propre plancher — 0,24 dB d'écart
    //     entre la fenêtre la plus calme et la plus forte sur la pièce calme, 0,10 dB sur la
    //     salle à générateurs. Toute marge au-delà de 1 dB les laisse donc intactes ;
    //   · les bruits brefs de référence (80 ms à −58 dBFS sur un plancher à −75) culminent à
    //     −59,0 dBFS, soit 16,0 dB au-dessus du plancher, et 13,9 dB dans le pire alignement
    //     (un bruit à cheval sur deux fenêtres).
    // 12 dB se place donc entre 1 et 13,9 : au-dessus du bruit de fond de la mesure, au-dessous
    // du plus faible événement à détecter.
    margeOccupee_db: 12,
    //
    // `dureeVoixMin_s` : une suite de fenêtres occupées qui dure au moins 300 ms est de la VOIX ;
    // plus courte, c'est un bruit bref. Les claquements de touche mesurés au lot 0 durent 50 à
    // 80 ms, une respiration guère plus ; une syllabe tenue dépasse 150 ms et une phrase occupe
    // des secondes entières. 300 ms, soit trois fenêtres, sépare les deux populations mesurées.
    dureeVoixMin_s: 0.3,
    //
    // `pauseMin_s` : quand le silence initial n'a pas été tenu, T13 demande de prélever
    // l'ambiance dans une pause. Une pause n'est retenue qu'à partir d'une seconde, soit dix
    // fenêtres : en dessous, un 20e centile tomberait sur la première ou la deuxième fenêtre et
    // ne serait plus un centile mais un minimum.
    pauseMin_s: 1,
    //
    // `tolerancePlancher_db` : la part de grave est calculée sur les fenêtres qui SONT le
    // plancher, à 1 dB près — pas sur la fenêtre entière, qui contenait les bruits brefs dont
    // T13 veut précisément se débarrasser. C'est le sens de « recalculer grave dominant sur le
    // plancher robuste ».
    tolerancePlancher_db: 1,
  };

  var _services = null;
  var _boite = null;
  var _etat = neuf();

  function neuf() {
    return {
      ctx: null, source: null, noeud: null, flux: null,
      piste: null,           // (D3) la MediaStreamTrack : seule autorité sur l'état de la piste
      // ── (E12) LA PAUSE, LA REPRISE, LA CONTINUATION ────────────────────────────────────
      enPause: false,
      canauxVivants: null,   // (E3) nombre de canaux entrant réellement dans le mixage
      bruitNonMesure: null,  // (T13) renseigné sur une continuation : l'ambiance n'est pas mesurée
      bruitDeLaPremierePartie: null,
      entreeDePause: null,   // l'entrée de journal à compléter quand le worklet répondra
      pauseCommenceeA_ms: 0,  // horloge du fil principal : sert à NOTER la durée, jamais à dater
      indexDepart: 0,         // index du prochain morceau quand on PROLONGE une prise
      continuationDe: null,   // l'identifiant de la prise qu'on prolonge, ou null
      microPerdu: false,      // (E8) la piste s'est terminée ou le contexte a été interrompu
      toucheBascule: ' ',     // (E4) Espace par défaut, réglable et apprenable
      // ── JALON II : LA BANDE, LES REPÈRES, LE COMPTE À REBOURS ──────────────────────────
      passages: [],           // (R6) le texte découpé, une ligne un passage
      bande: null,            // (R6) la position courante, FONCTION de l'indice d'échantillon
      vitesseBande: 2.5,      // (R6) mots par seconde, réglable
      decalageBande_s: 0,     // (R6) retour d'un passage : la bande recule, l'audio non
      reperes: [],            // (E4, T14) frontières entre commentaires, datées en échantillons
      dernierRepere: null,    // (E9) pour l'antirebond, en échantillons
      toucheRepere: 'ArrowRight',
      apprendLaToucheRepere: false,
      empreintes: null,       // (E13) l'empreinte courte de chaque module servi
      amorce: null,           // (E10, R7) la zone d'amorce d'une reprise de passage
      repriseDuPassage: null, // (T10) le passage que cette prise reprend
      priseEnCloture: false, // (D4) la prise est finie mais ses mesures de fin s'écrivent encore
      muetDepuis: 0,         // (D3) l'échantillon où le signal est tombé à zéro
      db: null,
      priseId: null,
      echantillonnage: 0,
      canaux: 0,
      canalRetenu: null,
      reglageCanal: 'auto',
      tailleMorceau_s: TAILLE_MORCEAU_S_DEFAUT,
      fenetre: [],           // (b) les relevés des 2 dernières secondes, pour décider du canal
      microphone: null,      // (e) ce que la piste dit du périphérique, relevé à l'ouverture
      bruit: null,           // (d) le verdict de bruit de pièce de la prise en cours
      bruitEnCours: false,
      bruitSommes: null,     // (d) les sommes de la fenêtre entière, témoin de l'ancien calcul
      fenetresBruit: [],     // (d) les sommes par fenêtre de 100 ms, d'où sort le plancher
      bruitProvisoireRendu: false,
      sommesAnalyse: null,   // sommes cumulées depuis l'autorisation (pour le repli seulement)
      sommesTotal: null,     // sommes cumulées de la prise en cours
      dernierReleve: null,
      enPrise: false,
      debutPrise_ctxTemps: 0,
      morceauxEcrits: 0,
      echantillonsEcrits: 0,
      ecrituresEnVol: Promise.resolve(),
      journal: [],
      muet: false,
      persistance: null,
      mesures: null,
    };
  }

  // ── LES GRANDEURS, CHACUNE UNE SEULE FOIS ──────────────────────────────────────────────────

  // Amplitude linéaire → décibels pleine échelle. −Infinity pour un zéro exact : on ne le
  // remplace pas par un nombre rond, on l'écrit « −∞ » là où il s'affiche.
  function dbfs(amplitude) {
    var a = Math.abs(amplitude);
    if (a === 0) return -Infinity;
    return 20 * Math.log10(a);
  }

  // Les niveaux d'un canal, tirés des sommes brutes du worklet. Chaque valeur porte la GRANDEUR
  // dont elle découle : l'amplitude à côté du décibel, pour que le lecteur puisse refaire le
  // calcul (régression #11(j)).
  function niveauxCanal(sommes, quel) {
    var n = sommes && sommes.n ? sommes.n : 0;
    if (!n) return { mesure: false, raison: 'rien mesuré' };
    var g = quel === 'g';
    var sommeCarre = g ? sommes.sommeCarreG : sommes.sommeCarreD;
    var crete = g ? sommes.creteG : sommes.creteD;
    var zeros = g ? sommes.zerosG : sommes.zerosD;
    if ((sommes.canaux || 0) < 2 && !g) return { mesure: false, raison: 'entrée mono' };
    var efficace = Math.sqrt(sommeCarre / n);
    var etat = (crete === 0 && zeros === n) ? 'vide'
             : (dbfs(efficace) < DBFS_QUASI_VIDE) ? 'quasi-vide'
             : 'actif';
    return {
      mesure: true,
      echantillons: n,
      crete: crete, creteDbfs: dbfs(crete),
      efficace: efficace, efficaceDbfs: dbfs(efficace),
      echantillonsAZero: zeros,
      partAZero: zeros / n,
      etat: etat,
    };
  }

  // LA CORRÉLATION DE PEARSON, vraiment calculée : les moyennes sont retirées. Le raccourci
  // Σgd/√(Σg²·Σd²) suppose une moyenne nulle, et un signal audio porte une composante continue
  // faible mais non nulle.
  //
  // ELLE NE REND JAMAIS `null`. Quand elle n'est pas calculable, elle rend une RAISON lisible :
  // « canal vide », « entrée mono », « canal constant ». Un `null` dans un rapport de mesure est
  // une case que le lecteur remplit lui-même, et il se trompe.
  function correlation(sommes) {
    var n = sommes && sommes.n ? sommes.n : 0;
    if (!n) return 'rien mesuré';
    if ((sommes.canaux || 0) < 2) return 'entrée mono';
    var videG = sommes.creteG === 0 && sommes.zerosG === n;
    var videD = sommes.creteD === 0 && sommes.zerosD === n;
    if (videG && videD) return 'deux canaux vides';
    if (videG) return 'canal vide : gauche';
    if (videD) return 'canal vide : droit';
    var varG = sommes.sommeCarreG - (sommes.sommeG * sommes.sommeG) / n;
    var varD = sommes.sommeCarreD - (sommes.sommeD * sommes.sommeD) / n;
    if (varG <= 0) return 'canal constant : gauche';
    if (varD <= 0) return 'canal constant : droit';
    var cov = sommes.sommeProduit - (sommes.sommeG * sommes.sommeD) / n;
    var r = cov / Math.sqrt(varG * varD);
    if (!isFinite(r)) return 'indéterminée';
    return Math.max(-1, Math.min(1, r));
  }

  // Additionne plusieurs relevés de sommes en un seul. Les sommes sont additives par
  // construction (Σ, Σx², Σxy, n) ; la crête est un maximum et les zéros s'additionnent. C'est
  // ce qui permet de reconstituer une fenêtre de deux secondes à partir des relevés sans
  // redemander au worklet de la tenir lui-même.
  function fusionnerSommes(liste) {
    var a = { n: 0, canaux: 0, canauxMin: 0, canauxMax: 0,
              sommeG: 0, sommeD: 0, sommeCarreG: 0, sommeCarreD: 0,
              sommeProduit: 0, creteG: 0, creteD: 0, zerosG: 0, zerosD: 0 };
    (liste || []).forEach(function (x) {
      if (!x || !x.n) return;
      a.n += x.n;
      a.canaux = Math.max(a.canaux, x.canaux || 0);
      // Les bornes se fusionnent en bornes, pas en maximum : c'est leur variation qui dit si le
      // périphérique a changé de layout en cours de route.
      if (a.canauxMax === 0 || (x.canauxMax || 0) > a.canauxMax) a.canauxMax = x.canauxMax || 0;
      if (a.canauxMin === 0 || ((x.canauxMin || 0) && x.canauxMin < a.canauxMin)) a.canauxMin = x.canauxMin;
      a.sommeG += x.sommeG; a.sommeD += x.sommeD;
      a.sommeCarreG += x.sommeCarreG; a.sommeCarreD += x.sommeCarreD;
      a.sommeProduit += x.sommeProduit;
      a.creteG = Math.max(a.creteG, x.creteG); a.creteD = Math.max(a.creteD, x.creteD);
      a.zerosG += x.zerosG; a.zerosD += x.zerosD;
    });
    return a;
  }

  // ── (d) LE BRUIT DE PIÈCE (T13) : L'ESTIMATEUR ROBUSTE ────────────────────────────────────
  //
  // Six fonctions pures, chacune pour UNE grandeur, toutes éprouvables sans navigateur. Le
  // worklet ne livre que des sommes par fenêtre de 100 ms : tout ce qui est dérivé — décibel,
  // centile, plancher, verdict, part de grave — se calcule ici, une seule fois (#11(f)).

  // LA LONGUEUR D'UNE FENÊTRE, LUE DANS LA MESURE et jamais redéclarée ici. Le worklet la
  // calcule à partir de la fréquence réelle du contexte (4 800 échantillons à 48 kHz, 4 410 à
  // 44,1 kHz) ; l'écrire une seconde fois dans ce fichier ferait deux vérités pour une grandeur,
  // et à 44,1 kHz la seconde serait fausse (régression #11(f)).
  function fenetreSecondes(b) {
    var f = (b.fenetres || []).filter(function (x) { return !x.partielle && x.n; })[0];
    if (f && b.echantillonnage) return f.n / b.echantillonnage;
    if (b.parFenetre && b.echantillonnage) return b.parFenetre / b.echantillonnage;
    return 0;
  }

  // LE NIVEAU D'UNE FENÊTRE, en dBFS. Une fenêtre entièrement à zéro n'a PAS de niveau :
  // 20·log10(0) n'est pas un nombre, et rendre −∞ comme s'il était une mesure est exactement ce
  // qui a produit le « CALME — −∞ dB » d'un micro muet. On rend `null` ici, à l'intérieur du
  // calcul, et aucun `null` ne sort jamais vers le rapport : il est traduit en raison.
  function niveauDeFenetre(f) {
    if (!f || !f.n) return null;
    if (f.zeros === f.n) return null;
    return dbfs(Math.sqrt(f.sommeCarre / f.n));
  }

  // LE CENTILE, convention écrite : les niveaux triés par ordre croissant, rang inférieur, SANS
  // interpolation. Pour 30 fenêtres et le 20e centile, c'est la 6e plus calme. Le générateur de
  // fixtures calcule le même centile avec un code qui n'est pas celui-ci : si les deux
  // divergent, un contrôle le dira (#11(j)).
  function centile(niveaux, pourCent) {
    if (!niveaux.length) return null;
    var tries = niveaux.slice().sort(function (a, b) { return a - b; });
    var rang = Math.floor((pourCent / 100) * (tries.length - 1));
    if (rang < 0) rang = 0;
    if (rang > tries.length - 1) rang = tries.length - 1;
    return tries[rang];
  }

  // LES SUITES DE FENÊTRES OCCUPÉES. « Occupée » veut dire : plus de `margeOccupee_db` au-dessus
  // de la fenêtre LA PLUS CALME de l'ensemble. On compare au plus calme et non au centile, et
  // c'est la correction d'un piège mesuré : quand la voix remplit la fenêtre, le 20e centile EST
  // un niveau de voix, et comparer à lui ne trouve plus rien d'occupé — la voix se cache dans sa
  // propre moyenne. Le plus calme, lui, reste le plancher tant qu'il reste 100 ms de silence.
  function suitesOccupees(fenetres, marge) {
    var avec = fenetres.filter(function (f) { return f.niveau !== null; });
    if (!avec.length) return { plusCalme: null, suites: [], occupees: 0 };
    var plusCalme = avec.reduce(function (m, f) { return f.niveau < m ? f.niveau : m; }, avec[0].niveau);
    var seuil = plusCalme + marge;
    var suites = [];
    var courante = null;
    fenetres.forEach(function (f) {
      var occupee = f.niveau !== null && f.niveau > seuil;
      f.occupee = occupee;
      if (occupee) {
        if (!courante) { courante = { debut: f.index, fenetres: 0, debutEchantillon: f.debutEchantillon }; suites.push(courante); }
        courante.fenetres++;
      } else { courante = null; }
    });
    return { plusCalme: plusCalme, seuilOccupee: seuil, suites: suites,
             occupees: fenetres.filter(function (f) { return f.occupee; }).length };
  }

  // LES SUITES DE FENÊTRES CALMES, c'est-à-dire les PAUSES. Rendues de la plus calme à la moins
  // calme, chacune avec son 20e centile : c'est là qu'on prélève l'ambiance quand le silence
  // initial n'a pas été tenu (T13).
  function pauses(fenetres, minFenetres, pourCent) {
    var trouvees = [];
    var courante = null;
    fenetres.forEach(function (f) {
      if (!f.occupee && f.niveau !== null) {
        if (!courante) { courante = { debutEchantillon: f.debutEchantillon, membres: [] }; trouvees.push(courante); }
        courante.membres.push(f);
      } else { courante = null; }
    });
    return trouvees
      .filter(function (p) { return p.membres.length >= minFenetres; })
      .map(function (p) {
        return {
          debutEchantillon: p.debutEchantillon,
          fenetres: p.membres.length,
          echantillons: p.membres.reduce(function (t, f) { return t + f.n; }, 0),
          plancher: centile(p.membres.map(function (f) { return f.niveau; }), pourCent),
          membres: p.membres,
        };
      })
      .sort(function (a, b) { return a.plancher - b.plancher; });
  }

  // LA PART DE GRAVE, CALCULÉE SUR LE PLANCHER (T13 : « recalculée sur le plancher robuste »).
  // On ne prend que les fenêtres qui SONT le plancher, à `tolerancePlancher_db` près — pas la
  // fenêtre entière, qui contenait les bruits brefs dont tout l'estimateur cherche à se défaire.
  // Un clic de touche est large bande : le compter ferait paraître la pièce moins grave qu'elle
  // n'est, et c'est l'erreur que le relevé d'essais reproche à la mention « bruit grave ».
  function partDeGraveDuPlancher(fenetres, plancher, tolerance) {
    var retenues = fenetres.filter(function (f) {
      return f.niveau !== null && f.niveau <= plancher + tolerance;
    });
    if (!retenues.length) return { part: 0, fenetres: 0, raison: 'aucune fenêtre au plancher' };
    var tot = 0, grave = 0;
    retenues.forEach(function (f) { tot += f.sommeCarre; grave += f.sommeCarreGrave; });
    return { part: tot > 0 ? grave / tot : 0, fenetres: retenues.length,
             echantillons: retenues.reduce(function (t, f) { return t + f.n; }, 0) };
  }

  // L'ÉTAT, AUX TROIS PALIERS DU CDC, appliqués au plancher robuste.
  function etatDuPlancher(db) {
    return (db <= BRUIT.calmeMax_dbfs) ? 'calme'
         : (db > BRUIT.bruyantMin_dbfs) ? 'bruyant'
         : 'correct';
  }

  // (d) LE VERDICT DE BRUIT. Il prend les sommes de la fenêtre entière (le TÉMOIN de l'ancien
  // calcul, gardé pour que l'écart soit visible et non raconté) et la liste des fenêtres de
  // 100 ms. Quatre états, ceux de T13 : calme, correct, bruyant, et « aucun signal » pour un
  // micro muet, qui n'est JAMAIS calme.
  function verdictBruit(b) {
    if (!b || !b.n) return { mesure: false, raison: 'bruit non mesuré' };

    // Les fenêtres pleines seulement : la dernière d'une prise porte moins de 100 ms, donc son
    // niveau est statistiquement plus agité, et la mêler aux autres ferait d'une fin de prise un
    // événement. Elle est comptée et dite à part.
    // ── (T13, avenant 5) SEULES LES FENÊTRES DONT LES ÉCHANTILLONS SONT ÉCRITS ──────────
    //
    // DÉFAUT CORRIGÉ, mesuré sur la prise du 11 octobre 19:12 : le plancher annoncé
    // (−91,6 dBFS, « pause la plus calme de la prise », fenêtres 528 000 à 1 209 600) tombait
    // ENTIÈREMENT dans le temps de pause — intervalle vu 520 448 à 1 627 264 —, c'est-à-dire
    // dans un audio qui n'est pas dans le fichier. Le 5e centile des fenêtres du fichier
    // lui-même valait −81,7 dBFS, dix décibels au-dessus. T13 (avenant 5) : « l'ambiance n'est
    // prélevée que dans un passage ÉCRIT de la prise : le temps de pause (E12) n'est jamais une
    // source d'ambiance ».
    //
    // Les positions sont celles DE LA PRISE, et non du flux reçu : c'est dans le temps de la
    // prise que l'atelier ira chercher ces secondes d'ambiance.
    var brutes = (b.fenetres || []).map(function (f, k) {
      return { index: (typeof f.index === 'number') ? f.index : k,
               debutEchantillon: (typeof f.debutDansLaPrise === 'number')
                 ? f.debutDansLaPrise : (f.debutEchantillon || 0),
               debutDansLeFluxRecu: f.debutEchantillon || 0,
               ecrit: f.ecrit !== false,
               n: f.n, sommeCarre: f.sommeCarre, sommeCarreGrave: f.sommeCarreGrave,
               zeros: f.zeros, crete: f.crete, partielle: !!f.partielle,
               dansLeSilenceInitial: !!f.dansLeSilenceInitial,
               niveau: niveauDeFenetre(f) };
    });
    var ecartees = brutes.filter(function (f) { return !f.ecrit; }).length;
    var toutes = brutes.filter(function (f) { return f.ecrit; });
    var pleines = toutes.filter(function (f) { return !f.partielle; });
    var initiales = pleines.filter(function (f) { return f.dansLeSilenceInitial; });

    var efficaceFenetreEntiere = Math.sqrt(b.sommeCarre / b.n);
    var dbFenetreEntiere = dbfs(efficaceFenetreEntiere);

    // AUCUNE FENÊTRE LIVRÉE : on le dit. Cela arrive si la mesure a été interrompue avant la
    // première frontière de 100 ms. Un plancher calculé sur rien serait un chiffre sans mesure.
    if (!pleines.length) {
      return { mesure: true, echantillons: b.n, etat: 'non concluant',
               raison: ecartees
                 ? 'aucune fenêtre ÉCRITE : les ' + ecartees + ' fenêtres mesurées tombent dans '
                   + 'du temps non enregistré (pause), qui n\'est jamais une source d\'ambiance (T13)'
                 : 'la mesure s\'est arrêtée avant la première fenêtre de 100 ms : '
                   + b.n + ' échantillons reçus, aucune fenêtre complète',
               fenetresEcartees: ecartees,
               efficaceDbfsFenetreEntiere: dbFenetreEntiere,
               echantillonsAZero: b.zeros, coupureHz: b.coupureHz, regle: REGLE_BRUIT(b) };
    }

    // ── AUCUN SIGNAL : UN MICRO MUET N'EST JAMAIS CALME (T13) ───────────────────────────────
    // Le défaut 1 du relevé d'essais, dans sa forme la plus grave : « CALME — −∞ dB » sur une
    // prise où rien n'avait été capté. Une fausse assurance, pas une fausse alarme. Le témoin
    // est le compte d'échantillons EXACTEMENT à zéro : s'il égale le nombre d'échantillons de la
    // fenêtre, aucun niveau n'existe, et on le dit au lieu d'en fabriquer un.
    if (b.zeros === b.n) {
      return {
        mesure: true,
        echantillons: b.n,
        secondes: b.echantillonnage ? b.n / b.echantillonnage : 0,
        etat: 'aucun-signal',
        echantillonsAZero: b.zeros,
        raisonDuNiveau: 'les ' + b.n + ' échantillons de la fenêtre sont à zéro numérique : '
          + 'aucun niveau en dBFS n\'existe, 20·log10(0) n\'étant pas un nombre. Le micro n\'a '
          + 'rien livré — ce n\'est pas une pièce calme, c\'est une absence de capture.',
        silenceInitialRespecte: false,
        raisonDuSilence: 'aucun signal n\'a été reçu : la question du silence ne se pose pas',
        graveDominant: false,
        partGrave: 0,
        partGraveRaison: 'aucun signal : aucune énergie à répartir',
        fenetres: { total: toutes.length, pleines: pleines.length,
                    sansSignal: toutes.length, auPlancher: 0 },
        mention: 'aucun son reçu du micro pendant la mesure : le bruit de la pièce n\'a pas pu '
          + 'être mesuré (voir le bandeau de capture muette)',
        coupureHz: b.coupureHz,
        regle: REGLE_BRUIT(b),
      };
    }

    // ── LE SILENCE INITIAL EN ÉTAIT-IL UN ? ─────────────────────────────────────────────────
    // T13, corrigé le 11 octobre : « le silence initial n'est déclaré respecté que si la fenêtre
    // ne contient pas de voix ». Sur la prise du 10 octobre, `silenceInitialRespecte` valait
    // `true` alors que la voix démarrait à 0,3 s. La voix se reconnaît à sa DURÉE : une suite de
    // fenêtres occupées d'au moins 300 ms. Plus court, c'est un bruit bref, et un bruit bref ne
    // disqualifie pas le silence — il est seulement compté.
    var occ = suitesOccupees(pleines, BRUIT.margeOccupee_db);
    var minVoix = Math.max(1, Math.round(BRUIT.dureeVoixMin_s / fenetreSecondes(b)));
    var suitesInitiales = occ.suites.filter(function (su) {
      var f = pleines.filter(function (x) { return x.index === su.debut; })[0];
      return f && f.dansLeSilenceInitial;
    });
    var voix = suitesInitiales.filter(function (su) { return su.fenetres >= minVoix; });
    var transitoires = suitesInitiales.filter(function (su) { return su.fenetres < minVoix; });
    var silenceRespecte = voix.length === 0;

    // ── D'OÙ VIENT L'AMBIANCE ───────────────────────────────────────────────────────────────
    // Silence tenu : les fenêtres du silence initial. Sinon, T13 demande de prélever dans une
    // pause, et c'est la PLUS CALME de la prise qui est prise. S'il n'y a aucune pause d'une
    // seconde, on le DIT et on se rabat sur le 20e centile de toute la prise, qui reste un
    // plancher — mais un plancher dont on annonce la provenance.
    var lesPauses = pauses(pleines, Math.max(1, Math.round(BRUIT.pauseMin_s / fenetreSecondes(b))), BRUIT.centile);
    var population, source, pauseRetenue = null;
    if (silenceRespecte && initiales.length) {
      population = initiales.filter(function (f) { return f.niveau !== null; });
      source = 'silence initial';
    } else if (lesPauses.length) {
      pauseRetenue = lesPauses[0];
      population = pauseRetenue.membres;
      source = 'pause la plus calme de la prise';
    } else {
      // ── (T13, avenant 6) NON MESURABLE, ET AUCUN ÉTAT AFFICHÉ ───────────────────────────
      // T13 : « Faute de pause d'une seconde dans les passages écrits, l'ambiance est "non
      // mesurable" : aucun état calme, correct ou bruyant n'est affiché, parce qu'une estimation
      // prise dans la voix serait une fausse alerte. »
      //
      // C'est exactement ce que faisait l'ancien repli : le 20e centile de TOUTE la prise. Sur
      // de la parole continue il tombe au niveau de la voix — mesuré −33,2 dBFS sur la fixture
      // de parole — et annonce « bruyant » sur une pièce dont on ne sait rien. Mieux vaut ne
      // rien dire que dire faux.
      return {
        mesure: true,
        echantillons: b.n,
        secondes: b.echantillonnage ? b.n / b.echantillonnage : 0,
        etat: 'non mesurable',
        raison: 'aucune pause d\'une seconde dans les passages écrits de la prise : il n\'y a '
          + 'nulle part où prélever une ambiance. Une estimation prise dans la voix serait une '
          + 'fausse alerte (T13).',
        silenceInitialRespecte: silenceRespecte,
        raisonDuSilence: silenceRespecte
          ? 'aucune voix dans le silence initial'
          : voix.length + ' passage(s) de voix dans le silence initial',
        transitoires: transitoires.length,
        fenetreLaPlusCalmeDbfs: occ.plusCalme,
        seuilFenetreOccupeeDbfs: occ.seuilOccupee,
        // LE TÉMOIN DE CE QU'ON AURAIT DIT À TORT : la valeur efficace de la fenêtre entière.
        efficaceDbfsFenetreEntiere: dbFenetreEntiere,
        pausesTrouvees: 0,
        pauseMinimale_s: BRUIT.pauseMin_s,
        echantillonsAZero: b.zeros,
        crete: b.crete, creteDbfs: dbfs(b.crete),
        fenetres: {
          total: toutes.length, pleines: pleines.length,
          partielles: toutes.length - pleines.length,
          dansLeSilenceInitial: initiales.length, sansSignal: 0,
          occupees: occ.occupees, pausesTrouvees: 0,
          secondes: fenetreSecondes(b),
          ecarteesCarNonEcrites: ecartees,
          regleDesFenetres: 'seules les fenêtres ÉCRITES entrent au verdict ; ici aucune suite '
            + 'calme n\'atteint ' + BRUIT.pauseMin_s + ' s.',
        },
        graveDominant: false,
        partGrave: 0,
        partGraveRaison: 'ambiance non mesurable : aucun plancher d\'où tirer une part de grave',
        mention: '',
        coupureHz: b.coupureHz,
        regle: REGLE_BRUIT(b),
      };
    }

    var plancher = centile(population.map(function (f) { return f.niveau; }), BRUIT.centile);
    var pg = partDeGraveDuPlancher(population, plancher, BRUIT.tolerancePlancher_db);
    var etat = etatDuPlancher(plancher);
    var grave = pg.part > BRUIT.partGraveMin;
    var sansSignal = toutes.filter(function (f) { return f.niveau === null; }).length;

    return {
      mesure: true,
      echantillons: b.n,
      secondes: b.echantillonnage ? b.n / b.echantillonnage : 0,

      // CE QUI EST AFFICHÉ ET CE QUI DÉCIDE : le plancher robuste, et lui seul.
      etat: etat,
      plancherDbfs: plancher,
      plancherSource: source,
      // LE DÉNOMINATEUR DU PLANCHER, et non celui de la prise entière. Un trou du falsifieur l'a
      // exigé : mon assertion comparait les fenêtres de la part de grave au nombre TOTAL de
      // fenêtres pleines de la prise, si bien qu'une part de grave calculée sur toutes les
      // fenêtres du silence initial passait quand même. Le bon témoin est la population d'où
      // sort le plancher.
      plancherCalculeSur: { fenetres: population.length,
                            echantillons: population.reduce(function (t, f) { return t + f.n; }, 0),
                            // (T13, avenant 5) LES BORNES, DANS LE TEMPS DE LA PRISE. Sans
                            // elles, rien ne permet de vérifier après coup que l'ambiance a été
                            // prélevée dans de l'audio qui est bien dans le fichier — ce qui est
                            // exactement ce que Christophe a dû vérifier à la main.
                            premierEchantillon: population.length
                              ? Math.min.apply(null, population.map(function (f) { return f.debutEchantillon; })) : 0,
                            dernierEchantillon: population.length
                              ? Math.max.apply(null, population.map(function (f) { return f.debutEchantillon + f.n; })) : 0,
                            toutesEcrites: population.every(function (f) { return f.ecrit; }) },
      pauseRetenue: pauseRetenue ? { debutEchantillon: pauseRetenue.debutEchantillon,
                                     echantillons: pauseRetenue.echantillons,
                                     fenetres: pauseRetenue.fenetres } : 'sans objet',
      centile: BRUIT.centile,

      // LE TÉMOIN DE L'ANCIEN CALCUL, gardé exprès : c'est lui qui rend le défaut 1 mesurable.
      // Sur la salle de Christophe les deux valeurs s'accordent à 0,02 dB ; sur un plancher
      // parsemé de clics elles diffèrent de plus de 10 dB, et c'est la seconde qui mentait.
      efficaceDbfsFenetreEntiere: dbFenetreEntiere,
      etatSelonLaFenetreEntiere: etatDuPlancher(dbFenetreEntiere),
      ecartFenetreEntiereMoinsPlancher_db: dbFenetreEntiere - plancher,

      crete: b.crete, creteDbfs: dbfs(b.crete),
      echantillonsAZero: b.zeros,

      silenceInitialRespecte: silenceRespecte,
      raisonDuSilence: silenceRespecte
        ? 'aucune suite de fenêtres occupées d\'au moins ' + BRUIT.dureeVoixMin_s + ' s dans le '
          + 'silence initial' + (transitoires.length ? ' (' + transitoires.length + ' bruit(s) bref(s) compté(s))' : '')
        : voix.length + ' passage(s) de voix dans le silence initial, le plus long de '
          + (Math.max.apply(null, voix.map(function (v) { return v.fenetres; })) * fenetreSecondes(b)).toFixed(1)
          + ' s : l\'ambiance a été prélevée ailleurs',
      transitoires: transitoires.length,
      transitoiresDetail: transitoires.map(function (t) {
        return { debutEchantillon: t.debutEchantillon,
                 secondes: +(t.fenetres * fenetreSecondes(b)).toFixed(3) };
      }),
      fenetreLaPlusCalmeDbfs: occ.plusCalme,
      seuilFenetreOccupeeDbfs: occ.seuilOccupee,

      partGrave: pg.part,
      graveDominant: grave,
      partGraveCalculeeSur: { fenetres: pg.fenetres, echantillons: pg.echantillons || 0,
                              regle: 'les fenêtres dont le niveau ne dépasse pas le plancher de '
                                + BRUIT.tolerancePlancher_db + ' dB' },

      fenetres: {
        total: toutes.length, pleines: pleines.length, partielles: toutes.length - pleines.length,
        dansLeSilenceInitial: initiales.length, sansSignal: sansSignal,
        occupees: occ.occupees, pausesTrouvees: lesPauses.length,
        secondes: fenetreSecondes(b),
        // (T13) CE QUI A ÉTÉ ÉCARTÉ parce que ses échantillons ne sont pas dans le fichier :
        // le temps de pause. Le dire, plutôt que de laisser croire que tout a été considéré.
        ecarteesCarNonEcrites: ecartees,
        regleDesFenetres: 'seules les fenêtres dont les échantillons sont ÉCRITS dans la prise '
          + 'entrent dans le verdict ; les positions sont celles de la prise. Le temps de pause '
          + 'n\'est jamais une source d\'ambiance (T13).',
      },

      mention: grave ? 'bruit grave : un filtre le réduira au mixage' : '',
      coupureHz: b.coupureHz,
      regle: REGLE_BRUIT(b),
    };
  }

  // LA RÈGLE, ÉCRITE À CÔTÉ DU CHIFFRE. Un plancher de −74 dBFS sans sa règle ne se refait pas,
  // et un rapport de 0,62 se lirait comme « 62 % de l'énergie est sous 120 Hz », ce qu'il n'est
  // pas : le passe-bas est une pente.
  function REGLE_BRUIT(b) {
    return 'le bruit de pièce est le ' + BRUIT.centile + 'e centile des niveaux de fenêtres de '
      + (fenetreSecondes(b) * 1000).toFixed(0) + ' ms (plancher), et NON la valeur '
      + 'efficace de la fenêtre entière (moyenne d\'énergie, que quelques bruits brefs suffisent '
      + 'à relever de plus de 10 dB). États : calme ≤ ' + BRUIT.calmeMax_dbfs + ' dBFS, bruyant > '
      + BRUIT.bruyantMin_dbfs + ' dBFS, correct entre les deux ; « aucun signal » si tous les '
      + 'échantillons sont à zéro, cas où aucun niveau n\'existe. Une fenêtre est dite OCCUPÉE si '
      + 'elle dépasse de ' + BRUIT.margeOccupee_db + ' dB la fenêtre la plus calme ; une suite '
      + 'd\'au moins ' + BRUIT.dureeVoixMin_s + ' s de fenêtres occupées est de la voix, plus '
      + 'courte c\'est un bruit bref. partGrave = énergie qui ressort d\'un passe-bas de '
      + 'Butterworth du 2e ordre à ' + b.coupureHz + ' Hz divisée par l\'énergie totale, calculée '
      + 'sur les seules fenêtres du plancher ; ce filtre est une PENTE et non un mur (0,5 à la '
      + 'coupure, 1 en dessous, 1/f⁴ au-dessus), donc ce rapport n\'est pas un pourcentage '
      + 'd\'énergie sous ' + b.coupureHz + ' Hz. Grave dominant si le rapport dépasse '
      + BRUIT.partGraveMin + '.';
  }

  // LA RÈGLE DE CHRISTOPHE, écrite une fois, ici, et rien qu'ici (E3 ne tranchait pas le cas de
  // deux canaux pleins ; il l'a tranché le 10 octobre) :
  //   un seul canal actif            → on le prend
  //   deux actifs, corrélation > 0,8 → moyenne : les deux portent la même chose, rien à perdre
  //   deux actifs différents         → le plus fort, en valeur efficace
  // Et JAMAIS la moyenne quand un canal est vide : elle coûterait 6 dB (E3).
  //
  // Rend aussi la RAISON du choix, parce qu'un canal retenu sans raison affichée est un canal
  // que personne ne peut contredire.
  function choisirCanal(sommes, reglage) {
    if (reglage && reglage !== 'auto') {
      return { canal: reglage, raison: 'forcé par le réglage : ' + reglage, auto: false };
    }
    var n = sommes && sommes.n ? sommes.n : 0;
    if (!n) return { canal: 'gauche', raison: 'aucune mesure : canal 0 par défaut', auto: true };
    if ((sommes.canaux || 0) < 2) {
      return { canal: 'gauche', raison: 'entrée mono : un seul canal', auto: true };
    }
    var g = niveauxCanal(sommes, 'g');
    var d = niveauxCanal(sommes, 'd');
    var gActif = g.mesure && g.etat === 'actif';
    var dActif = d.mesure && d.etat === 'actif';
    if (gActif && !dActif) {
      return { canal: 'gauche', raison: 'droit ' + d.etat + ' : canal actif pris tel quel, sans moyenne', auto: true };
    }
    if (dActif && !gActif) {
      return { canal: 'droit', raison: 'gauche ' + g.etat + ' : canal actif pris tel quel, sans moyenne', auto: true };
    }
    if (!gActif && !dActif) {
      return { canal: 'gauche', raison: 'les deux canaux sont ' + g.etat + '/' + d.etat + ' : canal 0, le problème n\'est pas masqué', auto: true };
    }
    var r = correlation(sommes);
    if (typeof r === 'number' && r > CORRELATION_MEME_SIGNAL) {
      return { canal: 'moyenne', raison: 'deux canaux actifs, corrélation ' + r.toFixed(3) + ' > ' + CORRELATION_MEME_SIGNAL + ' : moyenne', auto: true, correlation: r };
    }
    var plusFort = d.efficace > g.efficace ? 'droit' : 'gauche';
    return {
      canal: plusFort,
      raison: 'deux canaux actifs, corrélation ' + (typeof r === 'number' ? r.toFixed(3) : r) +
              ' : le plus fort (' + plusFort + ', ' + fmtDb(plusFort === 'droit' ? d.efficaceDbfs : g.efficaceDbfs) + ')',
      auto: true,
      correlation: r,
    };
  }

  // BLOCS PERDUS — sans présumer zéro. Le worklet compte SES appels ; l'horloge audio dit combien
  // de blocs ont dû passer. On rend les deux et l'écart, jamais seulement l'écart : un « 0 bloc
  // perdu » sans ses deux termes est une affirmation qu'on ne peut pas refaire.
  function blocsPerdus(blocsVus, blocsSansEntree, tramesEcoulees, echantillonnage) {
    var attendus = Math.floor(tramesEcoulees / 128);
    var comptes = blocsVus + blocsSansEntree;
    return {
      blocsComptesParLeWorklet: blocsVus,
      blocsSansEntree: blocsSansEntree,
      blocsAttendusParLHorlogeAudio: attendus,
      tramesEcouleesSurLeFilAudio: tramesEcoulees,
      secondesHorlogeAudio: echantillonnage ? tramesEcoulees / echantillonnage : 0,
      ecart: attendus - comptes,
      regle: 'attendus = plancher(trames écoulées sur le FIL AUDIO entre le démarrage et l\'arrêt, lues dans le worklet, / 128) ; comptés = blocs vus + blocs sans entrée. Les trames viennent du fil audio et non du fil principal : la latence du postMessage de démarrage (environ 30 ms, soit 10 à 12 blocs) ferait sinon passer pour perdus des blocs qui n\'ont jamais manqué.',
    };
  }

  function fmtDb(v) {
    if (v === -Infinity) return '−∞ dB';
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    return (v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + ' dB';
  }

  function nomCanal(c) {
    return c === 'droit' ? 'canal droit' : c === 'moyenne' ? 'moyenne des deux canaux' : 'canal gauche';
  }

  // ── L'INTERFACE : composants du kit, lot ≤ 3 seulement ─────────────────────────────────────
  // meter + meter.vuMetre (lot 3) · recording (3) · message (tous lots) · resume (3) ·
  // statebar (3 et 4) · button--primary / --record / --secondary / --destructive (1 et 3) ·
  // select (3) · time-field (3) · empty (1 à 4 et 6).
  // ABSENTS, pas grisés : steps (lot 4), preview (4), band (lot 3 mais jalon II), blocking
  // (lot 3 mais jalon III), countdown / headphones-check / retake-passage (lot 3, jalon II).
  function gabarit() {
    return '' +
'<div class="sc-bm-screen-shell sc-bm-screen-shell--no-montage sc-bm-screen-shell--record">' +
  '<header class="sc-bm-topbar">' +
    '<span class="sc-bm-badge">Banc · jalon II</span>' +
    '<label class="sc-bm-video-title"><span class="sc-bm-sr">Nom de la prise</span>' +
      '<input class="sc-bm-input" data-nom-prise value="Prise d\'essai" aria-label="Nom de la prise"/></label>' +
    '<span class="sc-bm-top-save" data-etat-stockage>Voix conservée sur cet ordinateur</span>' +
  '</header>' +
  '<div class="sc-bm-screen-record-layout">' +
    '<section class="sc-bm-panel sc-bm-record-main">' +
      '<header class="sc-bm-panel-title"><h2>Votre voix, à votre rythme</h2>' +
        '<span class="sc-bm-badge" data-mode>Prêt</span></header>' +

      // ── (D2 / E8) L'ALERTE A SA PROPRE ZONE, FIXÉE EN HAUT DE LA FENÊTRE ───────────────
      // E8, mot pour mot : « l'alerte reste affichée, FIXÉE EN HAUT DE LA FENÊTRE, tant que le
      // signal manque ». Deux défauts du relevé d'essais sont ici : l'alerte n'était pas fixée,
      // et les avis d'opérations passées (« Prise récupérée », « WAV exporté ») s'empilaient
      // AU-DESSUS d'elle et la repoussaient hors de vue. Une zone séparée, placée avant les
      // avis dans le document, rend le second défaut impossible par construction plutôt que
      // par vigilance.
      //
      // `fixed` ET NON `sticky`, et c'est une correction du 11 octobre. `sticky` collait
      // l'alerte en haut du PANNEAU : dès que la page défilait au-delà du panneau, l'alerte
      // partait avec lui. Christophe a relevé que E8 dit « la fenêtre » et non « le panneau ».
      // `fixed` la rattache à la fenêtre : elle reste visible où qu'on en soit dans la page.
      // Le fond opaque vient du composant `sc-bm-message` du kit, qui en porte un ; ce
      // conteneur n'en a pas besoin, et aucun composant du kit n'est modifié.
      '<div data-alerte style="position:fixed;top:0;left:0;right:0;z-index:60;' +
        'display:grid;gap:8px;padding:8px 16px"></div>' +
      '<div data-messages></div>' +

      // (D2) L'INTITULÉ EST UNE VARIABLE, PAS UN MOT FIGÉ : « Enregistrement 01:16,221 » restait
      // affiché après l'arrêt, ce qui laissait croire que la prise courait encore.
      '<div class="sc-bm-recording" aria-live="polite" data-chrono-ligne hidden>' +
        '<span data-chrono-intitule>Enregistrement</span> ' +
        '<span class="sc-bm-time" data-chrono>00:00,000</span></div>' +

      // ── (R6, R8) LA BANDE RYTHMO — composants du kit du jalon II, sans exception ───────
      // `sc-bm-band` porte le CURSEUR FIXE que R8 demande : son `::before` dessine une barre
      // verticale à 24 px du bord gauche, et c'est le texte qui défile sous elle. `-current` est
      // en 24 px et `-next` en 18 px atténué : la grande police et le fort contraste de R8
      // viennent du kit, pas d'ici.
      '<div class="sc-bm-band" data-bande hidden>' +
        '<div class="sc-bm-band-meta"><span data-bande-passage>Passage —</span>' +
          '<span class="sc-bm-band-speed" data-bande-vitesse>2,5 mots/s</span></div>' +
        '<p class="sc-bm-band-current" data-bande-courant></p>' +
        '<p class="sc-bm-band-next" data-bande-suivant></p>' +
      '</div>' +
      // (E2, E10) LE COMPTE À REBOURS : `sc-bm-amorce-clock` du kit, dont le `strong` est en
      // 32 px à chiffres tabulaires. Le même composant sert à l'horloge d'amorce d'une reprise.
      '<div class="sc-bm-amorce-clock" data-rebours hidden>' +
        '<span data-rebours-libelle>Compte à rebours</span><strong data-rebours-valeur>3</strong>' +
      '</div>' +
      // (E10) L'HORLOGE DE L'AMORCE : `sc-bm-amorce-clock`, le composant que le kit nomme
      // précisément pour cela. Distinct de celui du rebours : les deux peuvent se suivre.
      '<div class="sc-bm-amorce-clock" data-amorce-horloge hidden>' +
        '<span data-amorce-libelle>Amorce</span><strong data-amorce-valeur>—</strong>' +
      '</div>' +
      // (E4, T14) LES REPÈRES POSÉS, chacun un `sc-bm-marker` du kit.
      '<div class="sc-bm-record-markers" data-reperes></div>' +
      // (R5) LA VITESSE DE CHAQUE PASSAGE, chacune un `sc-bm-retake-status` du kit.
      '<div class="sc-bm-record-markers" data-vitesses hidden></div>' +

      '<div class="sc-bm-meter" data-lot="3">' +
        '<div class="sc-bm-row">' +
          '<svg class="sc-bm-icon" aria-hidden="true"><use href="#sc-bm-icon-mic"></use></svg>' +
          '<strong>Niveau du microphone</strong>' +
          '<span class="sc-bm-time" data-vu-niveau>—</span>' +
        '</div>' +
        '<div class="sc-bm-meter-bar"><span class="sc-bm-meter-fill" data-vu-barre style="width:0%"></span></div>' +
        '<span class="sc-bm-help" data-vu-detail>Parlez à votre volume habituel.</span>' +
        '<span class="sc-bm-help" data-bruit>Bruit de pièce : non mesuré.</span>' +
      '</div>' +

      '<label class="sc-bm-field" data-lot="3">Microphone' +
        '<select class="sc-bm-input sc-bm-select" data-micro aria-label="Microphone"></select></label>' +

      '<label class="sc-bm-field" data-lot="3">Canal retenu' +
        '<select class="sc-bm-input sc-bm-select" data-reglage-canal aria-label="Canal retenu">' +
          '<option value="auto">Automatique</option>' +
          '<option value="gauche">Gauche</option>' +
          '<option value="droit">Droit</option>' +
          '<option value="moyenne">Moyenne</option>' +
        '</select></label>' +
      '<span class="sc-bm-help" data-canal-retenu>Canal non encore décidé.</span>' +

      '<label class="sc-bm-field" data-lot="3">Durée d\'un morceau' +
        '<select class="sc-bm-input sc-bm-select" data-taille-morceau aria-label="Durée d\'un morceau"></select></label>' +

      '<div class="sc-bm-row">' +
        '<button type="button" class="sc-bm-button sc-bm-button--primary" data-action="demarrer" data-lot="3">' +
          '<svg class="sc-bm-icon" aria-hidden="true"><use href="#sc-bm-icon-record"></use></svg>Commencer la prise</button>' +
        // ── (E12 / E4) LA PAUSE : UN BOUTON ET UNE TOUCHE ──────────────────────────────
        // LE SYMBOLE VIENT DU KIT. `sc-bm-pause-symbol` existe dans `banc-montage.css` (deux
        // barres verticales) : on l'emploie plutôt que de dessiner une icône. En revanche le
        // kit n'a PAS d'état de badge « pause » — le badge y est un composant à texte libre,
        // celui qui porte déjà « Prise en cours » et « Prise terminée ». Rien n'est inventé :
        // le badge dit « Prise en pause », comme il dit les autres états.
        '<button type="button" class="sc-bm-button sc-bm-button--secondary" data-action="pause" data-lot="3" hidden>' +
          '<span class="sc-bm-pause-symbol" aria-hidden="true"></span><span data-pause-libelle>Pause</span></button>' +
        '<button type="button" class="sc-bm-button sc-bm-button--secondary" data-action="arreter" data-lot="3" hidden>' +
          '<svg class="sc-bm-icon" aria-hidden="true"><use href="#icon-stop"></use></svg>Arrêter la prise</button>' +
        '<button type="button" class="sc-bm-button sc-bm-button--secondary" data-action="autoriser" data-lot="3">' +
          '<svg class="sc-bm-icon" aria-hidden="true"><use href="#sc-bm-icon-mic"></use></svg>Autoriser le micro</button>' +
        '<button type="button" class="sc-bm-button sc-bm-button--secondary" data-action="bruit" data-lot="3">' +
          '<svg class="sc-bm-icon" aria-hidden="true"><use href="#sc-bm-icon-mic"></use></svg>Mesurer le bruit de la pièce</button>' +
      '</div>' +
      // (E4) LA TOUCHE DE BASCULE, RÉGLABLE ET APPRENABLE. Espace par défaut. « Apprenable
      // depuis la télécommande » (E4) suppose une télécommande, qui est du lot 4 : ici elle
      // s'apprend du clavier, ce qui est le même geste — on presse la touche qu'on veut.
      '<label class="sc-bm-field" data-lot="3">Touche pause / reprise' +
        '<input class="sc-bm-input" data-touche readonly value="Espace" aria-label="Touche pause et reprise"/></label>' +
      '<div class="sc-bm-row">' +
        '<button type="button" class="sc-bm-button sc-bm-button--secondary" data-action="apprendre-touche" data-lot="3">Apprendre une touche</button>' +
      '</div>' +
      // ── (R6) LE TEXTE DE LA BANDE, SA VITESSE ET SA TAILLE ────────────────────────────
      '<label class="sc-bm-field" data-lot="3">Texte de la narration (une ligne par passage, ' +
        '« [pause] » ou « [pause 2 s] » pour un silence non lu)' +
        '<textarea class="sc-bm-textarea" data-texte-bande rows="4" ' +
          'aria-label="Texte de la narration"></textarea></label>' +
      '<label class="sc-bm-field" data-lot="3">Vitesse de défilement (mots par seconde)' +
        '<input class="sc-bm-input" type="number" step="0.1" min="0.5" max="6" value="2.5" ' +
          'data-vitesse-bande aria-label="Vitesse de défilement"/></label>' +
      '<label class="sc-bm-field" data-lot="3">Taille du texte de la bande (pixels)' +
        '<input class="sc-bm-input" type="number" step="2" min="16" max="72" value="24" ' +
          'data-taille-bande aria-label="Taille du texte de la bande"/></label>' +
      '<label class="sc-bm-field" data-lot="3">Compte à rebours avant la prise (secondes)' +
        '<input class="sc-bm-input" type="number" step="1" min="0" max="10" value="3" ' +
          'data-rebours-secondes aria-label="Compte à rebours"/></label>' +
      '<label class="sc-bm-field sc-bm-check" data-lot="3">' +
        '<input type="checkbox" data-rebours-bips checked aria-label="Bips du compte à rebours"/>' +
        ' Bips du compte à rebours (aux haut-parleurs, jamais enregistrés)</label>' +
      '<label class="sc-bm-field" data-lot="3">Touche de repère' +
        '<input class="sc-bm-input" data-touche-repere readonly value="Flèche droite" ' +
          'aria-label="Touche de repère"/></label>' +
      '<div class="sc-bm-row">' +
        '<button type="button" class="sc-bm-button sc-bm-button--secondary" data-action="apprendre-repere" data-lot="3">Choisir la touche de repère</button>' +
        '<button type="button" class="sc-bm-button sc-bm-button--secondary" data-action="repere" data-lot="3">Poser un repère</button>' +
        '<button type="button" class="sc-bm-button sc-bm-button--secondary" data-action="passage-precedent" data-lot="3">Passage précédent</button>' +
      '</div>' +
      // (E12, point 5) L'IMPORT D'UNE VOIX, pour la continuer ensuite.
      // (R5) LE SEUIL D'ALERTE, RÉGLABLE : 20 % par défaut, justifié dans `bande-rythmo.js`.
      '<label class="sc-bm-field" data-lot="3">Alerte de vitesse au-delà de (%)' +
        '<input class="sc-bm-input" type="number" step="1" min="1" max="100" value="20" ' +
          'data-seuil-vitesse aria-label="Seuil d\'alerte de vitesse"/></label>' +
      // (R6) L'OPTION DES MARQUEURS THÉORIQUES, SANS `checked` : désactivée par défaut.
      '<label class="sc-bm-field sc-bm-check" data-lot="3">' +
        '<input type="checkbox" data-marqueurs-theoriques ' +
          'aria-label="Poser des marqueurs théoriques"/>' +
        '<span>Poser des marqueurs théoriques d\'après la bande (à ajuster ensuite)</span></label>' +
      // ── (E10, R7, point 4) REFAIRE UN PASSAGE ─────────────────────────────────────────
      // Les quatre composants que le prompt nomme, et rien d'autre : `sc-bm-retake-inspector`
      // pour le cadre, `sc-bm-reprise-settings` pour les réglages, `sc-bm-reprise-notice` pour
      // la troncature et le passage sans source, `sc-bm-retake-status` pour l'état.
      // NOM DISTINCT DE `data-reprise`, qui appartient à l'encadré « Reprendre la prise
      // interrompue » (E5) : celui-ci VIDE son hôte quand aucune prise n'est inachevée, et il
      // effaçait donc ce panneau à chaque chargement. Trouvé par §48, pas par relecture.
      '<section class="sc-bm-retake-inspector" data-lot="3" data-refaire-passage>' +
        '<h2>Refaire un passage</h2>' +
        '<div class="sc-bm-reprise-settings">' +
          '<label class="sc-bm-field">Prise source' +
            '<select class="sc-bm-input sc-bm-select" data-reprise-source ' +
              'aria-label="Prise source"></select></label>' +
          '<label class="sc-bm-field">Passage à refaire' +
            '<select class="sc-bm-input sc-bm-select" data-reprise-passage ' +
              'aria-label="Passage à refaire"></select></label>' +
          '<label class="sc-bm-field">Mode' +
            '<select class="sc-bm-input sc-bm-select" data-reprise-mode aria-label="Mode">' +
              '<option value="doublage">Doublage — amorce et enregistrement ensemble</option>' +
              '<option value="amorce-puis-silence">Amorce, puis silence, puis enregistrement</option>' +
            '</select></label>' +
          '<div class="sc-bm-retake-field-grid">' +
            '<label class="sc-bm-field">Amorce (s)' +
              '<input class="sc-bm-input" type="number" step="0.5" min="0.5" max="120" ' +
                'value="5" data-reprise-amorce aria-label="Durée de l\'amorce"/></label>' +
            '<label class="sc-bm-field">Garde (s)' +
              '<input class="sc-bm-input" type="number" step="0.5" min="0" max="10" value="1" ' +
                'data-reprise-garde aria-label="Silence de garde"/></label>' +
          '</div>' +
          '<label class="sc-bm-field sc-bm-check">' +
            '<input type="checkbox" data-reprise-tout aria-label="Tout le bout"/>' +
            '<span>Tout le bout qui précède, au lieu des secondes ci-dessus</span></label>' +
          '<button type="button" class="sc-bm-button sc-bm-button--primary" ' +
            'data-action="refaire-passage" data-lot="3">Refaire ce passage</button>' +
        '</div>' +
        '<p class="sc-bm-reprise-notice" data-reprise-notice hidden></p>' +
        '<span class="sc-bm-retake-status" data-reprise-etat>Aucune reprise en cours.</span>' +
      '</section>' +
      '<label class="sc-bm-field" data-lot="3">Importer une voix (WAV PCM 16 ou 24 bits)' +
        '<input class="sc-bm-input" type="file" accept=".wav,audio/wav,audio/x-wav" data-import aria-label="Importer un fichier WAV"/></label>' +
      '<p class="sc-bm-help">Ce jalon pose les repères, affiche la bande rythmo et refait un ' +
        'passage avec son amorce. Ce qui n\'y est pas : la FORME D\'ONDE, donc ni le raccord ' +
        'd\'une pause ni les repères tracés dessus ; l\'IMAGE à côté de la bande (R10, lot 4) ; ' +
        'le déplacement d\'un repère à la souris (T4) — ici on l\'ajuste au bouton, par pas de ' +
        '100 ms ; et le blocage de l\'export par les trois contrôles de T6, qui informent ici et ' +
        'bloqueront au lot 4. Rien n\'est grisé : ce qui n\'existe pas est absent.</p>' +
    '</section>' +

    '<aside class="sc-bm-panel sc-bm-record-side">' +
      '<h2>Prises sur cet ordinateur</h2>' +
      '<div data-reprise></div>' +
      '<div data-prises></div>' +
      '<div class="sc-bm-row">' +
        '<button type="button" class="sc-bm-button sc-bm-button--secondary" data-action="rapport" data-lot="3">' +
          '<svg class="sc-bm-icon" aria-hidden="true"><use href="#sc-bm-icon-check"></use></svg>Rapport de mesures (JSON)</button>' +
      '</div>' +
      '<span class="sc-bm-help" data-persistance>Persistance du stockage : non demandée.</span>' +
    '</aside>' +
  '</div>' +
  '<footer class="sc-bm-statebar">' +
    '<span class="sc-bm-time" data-sb-duree>Durée 00:00,000</span>' +
    '<span data-sb-morceaux>0 morceau</span>' +
    // (D3) TROIS GRANDEURS, TROIS CASES, chacune lue à sa propre source. La barre ne montrait
    // qu'une case « Piste », remplie par le DERNIER ÉVÉNEMENT du journal : elle affichait donc
    // « contexte running » ou « son revenu » comme si c'était l'état de la piste audio. Un état
    // de piste doit venir de la piste, un état de contexte du contexte, et l'état du signal du
    // signal (régression #11(f) : une grandeur, une source).
    '<span data-sb-piste>Piste : inconnue</span>' +
    '<span data-sb-contexte>Contexte : —</span>' +
    '<span data-sb-signal>Signal : —</span>' +
    '<span data-sb-canal>Canal : —</span>' +
    '<span data-sb-frequence>Fréquence : —</span>' +
    '<span data-sb-micro>Micro : —</span>' +
    // (E13) « un rapport sans empreinte n'est pas une preuve » : elle est donc à l'écran, pas
    // seulement dans le fichier.
    '<span data-sb-empreintes>Version : —</span>' +
  '</footer>' +
'</div>';
  }

  function q(sel) { return _boite ? _boite.querySelector(sel) : null; }

  // LES CLÉS QUI VONT DANS LA ZONE D'ALERTE, et non parmi les avis : celles qui décrivent un
  // signal ou un périphérique qui manque MAINTENANT. Écrite une fois, ici, pour qu'un avis
  // ajouté demain ne se retrouve pas par hasard au-dessus d'une alerte.
  var CLES_ALERTE = { muet: true, piste: true, contexte: true, 'prise-muette': true,
                      micro: true, frequence: true };

  function message(cle, etat, texte, action) {
    var hote = q(CLES_ALERTE[cle] ? '[data-alerte]' : '[data-messages]');
    if (!hote) return;
    var el = hote.querySelector('[data-cle="' + cle + '"]');
    if (!texte) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.className = 'sc-bm-message';
      el.setAttribute('role', 'status');
      el.setAttribute('data-cle', cle);
      el.innerHTML = '<svg class="sc-bm-icon" aria-hidden="true"><use></use></svg><span></span>' +
        '<span data-message-action></span>';
      hote.appendChild(el);
    }
    el.setAttribute('data-state', etat);
    // L'icône suit l'état : une information ne porte pas le triangle d'une alerte. Les deux
    // symboles viennent du sprite du kit, aucun n'est dessiné ici.
    el.querySelector('use').setAttribute('href', etat === 'info' ? '#icon-info' : '#icon-warning');
    el.querySelector('span').textContent = texte;
    // (E8) « le Studio l'annonce et propose Reprendre » : l'avis peut porter un bouton. Le
    // bouton est celui du kit, et son `data-action` passe par le même aiguillage que les autres.
    var zone = el.querySelector('[data-message-action]');
    if (zone) {
      if (action && action.nom) {
        zone.innerHTML = '<button type="button" class="sc-bm-button sc-bm-button--primary" ' +
          'data-action="' + action.nom + '" data-lot="3"></button>';
        zone.querySelector('button').textContent = action.libelle;
      } else {
        zone.innerHTML = '';
      }
    }
  }

  // (D4) CHAQUE ENTRÉE DIT À QUELLE PRISE SA POSITION SE RAPPORTE, et le dit quand il n'y en a
  // aucune. Sans cela, rien ne permet de constater après coup qu'une position appartient bien à
  // sa prise — c'est ce qui a laissé passer le chiffre périmé pendant toute une session d'essais.
  // (D2 / E8) « les alertes et avis d'une prise ne persistent pas à la prise suivante ». Le
  // relevé d'essais montrait le bandeau rouge d'une prise encore affiché sur la suivante, ce qui
  // est le pire des deux mondes : il décrit un fait ancien avec l'urgence d'un fait présent.
  // On vide les DEUX zones au démarrage, et rien n'est épargné : un avis qui mérite de survivre
  // à une prise n'existe pas dans ce jalon.
  function viderTousLesAvis() {
    ['[data-alerte]', '[data-messages]'].forEach(function (sel) {
      var h = q(sel);
      if (h) h.innerHTML = '';
    });
  }

  // ── (T3 bis) LE CONTEXTE DE L'INSTANT, À CHAQUE ÉVÉNEMENT DE PISTE ────────────────────────
  //
  // POURQUOI CE DIAGNOSTIC EXISTE. La prise du 17 octobre à 14:01 a perdu le micro à
  // l'échantillon 1 022 208 : le journal porte « piste muette » puis « piste non muette », la
  // pause automatique et la reprise ont fonctionné — et la CAUSE est inconnue. Je l'avais
  // attribuée au « Mode micro » du Centre de contrôle ; Christophe a corrigé le 17 octobre : il
  // n'y avait pas touché. L'événement est spontané, observé une fois sur un vrai Safari.
  //
  // CE QUE LE JOURNAL NE SAVAIT PAS DIRE, et qui aurait permis de trancher : la page était-elle
  // au premier plan, l'onglet visible, un périphérique venait-il de changer, Christophe
  // venait-il de faire un geste ? Chacune de ces questions départage une hypothèse (mise en
  // veille de l'onglet, bascule de périphérique, économie d'énergie, action de l'utilisateur).
  // Aucune n'est reconstituable après coup : elles doivent être LUES à l'instant de
  // l'événement. C'est tout ce que ce code fait — il ne diagnostique rien, il consigne de quoi
  // diagnostiquer.
  var FENETRE_DIAGNOSTIC_S = 5;
  var _dernierGeste_ms = null;
  var _changementsDePeripherique = [];
  var _diagnosticBranche = false;

  function maintenant_ms() {
    return (self.performance && performance.now()) || Date.now();
  }

  // LES GESTES SONT ÉCOUTÉS EN CAPTURE ET EN PASSIF : un écouteur de diagnostic ne doit ni
  // retarder une frappe, ni être empêché par un `stopPropagation` du reste de la page.
  function brancherLeDiagnostic() {
    if (_diagnosticBranche || typeof document === 'undefined') return;
    _diagnosticBranche = true;
    ['keydown', 'mousedown', 'mousemove', 'wheel', 'pointerdown', 'touchstart'].forEach(
      function (nom) {
        document.addEventListener(nom, function () { _dernierGeste_ms = maintenant_ms(); },
          { capture: true, passive: true });
      });
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', function () {
        _changementsDePeripherique.push({ quand_ms: maintenant_ms() });
        // On ne garde pas l'historique de la session : la fenêtre de diagnostic fait cinq
        // secondes, et une liste qui grandit sans fin est une fuite.
        if (_changementsDePeripherique.length > 50) _changementsDePeripherique.shift();
      });
    }
  }

  // FONCTION PURE, pour que « les cinq secondes précédentes » s'éprouve par le calcul : un
  // contrôle lui donne un changement vieux de six secondes et un vieux d'une seconde, et lit
  // lequel sort. Une mutation qui rend toute la liste se fait prendre là, sans attendre.
  function changementsRecents(liste, maintenant, fenetre_s) {
    var f = (typeof fenetre_s === 'number' && fenetre_s >= 0) ? fenetre_s : FENETRE_DIAGNOSTIC_S;
    return (liste || []).filter(function (c) {
      return (maintenant - c.quand_ms) <= f * 1000 && (maintenant - c.quand_ms) >= 0;
    }).map(function (c) {
      return { ageEnSecondes: +((maintenant - c.quand_ms) / 1000).toFixed(3) };
    });
  }

  // LES QUATRE ÉVÉNEMENTS QUE LE COMPLÉMENT NOMME. Le libellé réel porte parfois une précision
  // (« piste muette (événement) » vient de la piste, « piste muette » du worklet qui voit le
  // signal tomber à zéro ; « contexte suspended », « contexte interrupted »). On reconnaît donc
  // par le début du libellé, et un contexte redevenu `running` n'est pas un incident.
  function evenementADiagnostiquer(quoi) {
    var q0 = String(quoi || '');
    if (q0.indexOf('piste muette') === 0) return true;
    if (q0.indexOf('piste non muette') === 0) return true;
    if (q0.indexOf('piste terminée') === 0) return true;
    if (q0.indexOf('contexte ') === 0 && q0 !== 'contexte running') return true;
    return false;
  }

  function contexteDeLInstant() {
    var m = maintenant_ms();
    var piste = _etat.piste;
    var recents = changementsRecents(_changementsDePeripherique, m, FENETRE_DIAGNOSTIC_S);
    var doc = (typeof document !== 'undefined') ? document : null;
    return {
      visibilite: doc ? doc.visibilityState : 'document indisponible',
      fenetreAuPremierPlan: (doc && typeof doc.hasFocus === 'function')
        ? doc.hasFocus() : 'hasFocus indisponible',
      depuisDernierGeste_s: _dernierGeste_ms === null
        ? null : +((m - _dernierGeste_ms) / 1000).toFixed(3),
      raisonSansGeste: _dernierGeste_ms === null
        ? 'aucune interaction clavier ou souris depuis le chargement de la page'
        : 'sans objet',
      changementsDePeripherique: {
        fenetre_s: FENETRE_DIAGNOSTIC_S,
        nombre: recents.length,
        lesquels: recents,
      },
      etatDuContexteAudio: _etat.ctx ? _etat.ctx.state : 'aucun contexte audio',
      etatDeLaPiste: etatDeLaPisteMaintenant(piste),
      pisteDeclaree: piste
        ? { readyState: piste.readyState, muted: piste.muted, enabled: piste.enabled }
        : 'aucune piste',
      regle: 'relevé À L\'INSTANT de l\'événement, jamais reconstitué : la visibilité, le focus '
        + 'et l\'état de la piste d\'il y a une seconde ne sont plus lisibles une seconde plus '
        + 'tard. La cause de la perte du 17 octobre est inconnue ; ces champs servent à la '
        + 'trouver si elle revient.',
    };
  }

  function journaliser(quoi, aEchantillon, extra) {
    var e = { quoi: quoi, aEchantillon: aEchantillon };
    // UN ÉVÉNEMENT DE CLÔTURE APPARTIENT ENCORE À SA PRISE. `enPrise` tombe à faux dès la
    // première ligne de `arreter`, pour qu'aucune autre prise ne démarre pendant la fermeture —
    // mais le verdict de bruit, la revérification du canal et le canal démenti sont des mesures
    // DE cette prise, datées à sa fin. Les marquer « hors prise » les aurait privés de leur
    // position et rendu l'invariant du §22 faux pour une bonne raison, ce qui est la pire espèce
    // de contrôle. Trouvé par ce contrôle, pas par relecture.
    if (_etat.enPrise || _etat.priseEnCloture) e.priseId = _etat.priseId;
    else e.horsPrise = true;
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    // (T3 bis) LE DIAGNOSTIC EST POSÉ ICI, dans le seul endroit par lequel tout événement
    // passe. Le poser aux quatre sites d'émission aurait fait quatre occasions d'en oublier un
    // — et c'est exactement ce qui s'est passé pour la perte du 17 octobre, qu'aucun champ ne
    // permet d'expliquer. Après la fusion de `extra`, pour qu'un appelant ne puisse pas
    // l'écraser par mégarde.
    if (evenementADiagnostiquer(quoi)) e.contexteDeLInstant = contexteDeLInstant();
    _etat.journal.push(e);
    return e;
  }

  // ── (D3) L'ÉTAT DE LA PISTE, LU SUR LA PISTE ──────────────────────────────────────────────
  //
  // DÉFAUT 3 DU RELEVÉ D'ESSAIS : « la barre du bas affiche Piste : contexte running au lieu de
  // terminée ». La cause était que `journaliser` écrivait son propre libellé dans la case
  // « Piste » à chaque événement, quel qu'il soit. Désormais la case est peinte à partir de
  // l'objet `MediaStreamTrack` lui-même — `readyState` et `muted` —, qui est la seule autorité
  // sur l'état d'une piste. Le journal garde les événements ; il ne décrit plus l'état.
  function etatDeLaPisteMaintenant(piste) {
    if (!piste) return 'aucune piste (source d\'essai ou autorisation non accordée)';
    if (piste.readyState === 'ended') return 'terminée (périphérique retiré ou repris)';
    if (piste.muted) return 'muette (le périphérique la déclare muette)';
    return 'vivante';
  }

  // L'ÉTAT DU SIGNAL, qui est une AUTRE grandeur que l'état de la piste : une piste vivante peut
  // ne livrer que des zéros, et c'est précisément le cas du défaut 3. « son revenu » n'est pas
  // un état mais un événement : au retour du son, l'état redevient « sonore ».
  function etatDuSignalMaintenant() {
    if (!_etat.enPrise) return 'hors prise';
    if (_etat.muet) return 'à zéro numérique depuis l\'échantillon ' + (_etat.muetDepuis || 0);
    return 'sonore';
  }

  // L'ÉTAT EST LU, JAMAIS MÉMORISÉ. Mesuré par le contrôle §23 : `MediaStreamTrack.stop()` fait
  // passer `readyState` à « ended » SANS déclencher l'événement `ended` (la spécification le
  // réserve aux fins qui ne viennent pas de l'application). Une barre peinte uniquement sur
  // événement affichait donc « vivante » sur une piste morte — le même genre de mensonge que le
  // défaut 3, par un autre chemin. `peindreEtats` est donc appelée à CHAQUE relevé du worklet,
  // c'est-à-dire une vingtaine de fois par seconde, et elle relit la piste à chaque fois.
  // ── (D2 / E8) LE TEXTE DU BANDEAU, ÉCRIT UNE SEULE FOIS ───────────────────────────────────
  //
  // E8 demande « l'échantillon de début et la durée courante ». Le relevé d'essais a montré le
  // bandeau figé sur « depuis 2,0 s » alors que le signal manquait depuis plus de cinq secondes :
  // le texte était calculé une fois, à l'instant de l'alerte, et jamais revu. Il est désormais
  // recalculé à chaque relevé du worklet — une vingtaine de fois par seconde — à partir de la
  // position courante de la prise. Une seule fonction le compose, pour que le bandeau vivant et
  // le résumé final ne puissent pas raconter deux choses différentes (#11(f)).
  function texteAlerteMuette(depuis, position, echantillonnage) {
    var manquants = Math.max(0, position - depuis);
    return 'Aucun son reçu du micro. Le signal est à zéro numérique depuis l\'échantillon '
      + depuis + ' (' + fmtTemps(depuis, echantillonnage) + '), soit '
      + (manquants / (echantillonnage || 48000)).toFixed(1) + ' s.';
  }

  // LE RÉSUMÉ NEUTRE, à l'arrêt ou au retour du son. E8 : « au retour du signal ou à l'arrêt,
  // elle devient un résumé neutre ». Neutre veut dire : plus de rouge, et un fait au passé.
  function resumeAlerteMuette(depuis, jusqua, echantillonnage) {
    var duree = Math.max(0, jusqua - depuis);
    return 'Le signal avait été à zéro numérique de l\'échantillon ' + depuis + ' ('
      + fmtTemps(depuis, echantillonnage) + ') à ' + jusqua + ' ('
      + fmtTemps(jusqua, echantillonnage) + '), soit '
      + (duree / (echantillonnage || 48000)).toFixed(1) + ' s. Consigné au journal de la prise.';
  }

  function peindreEtats() {
    var p = q('[data-sb-piste]');
    if (p) p.textContent = 'Piste : ' + etatDeLaPisteMaintenant(_etat.piste);
    var c = q('[data-sb-contexte]');
    if (c) c.textContent = 'Contexte : ' + ((_etat.ctx && _etat.ctx.state) || '—');
    var g = q('[data-sb-signal]');
    if (g) g.textContent = 'Signal : ' + etatDuSignalMaintenant();
  }

  function fmtTemps(echantillons, echantillonnage) {
    var s = echantillonnage ? echantillons / echantillonnage : 0;
    var mm = Math.floor(s / 60);
    var ss = Math.floor(s % 60);
    var ms = Math.round((s - Math.floor(s)) * 1000);
    return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss + ',' +
           (ms < 100 ? (ms < 10 ? '00' : '0') : '') + ms;
  }

  // ── LE VU-MÈTRE : ce qu'il affiche est ce qui a été REÇU ───────────────────────────────────
  // Jamais une cible, jamais une valeur demandée (régression #11(e)). Le chiffre vient des
  // sommes du worklet, et la barre vient du même chiffre — pas d'un second calcul.
  function peindreReleve(m) {
    peindreEtats();
    // (R6) LA BANDE SUIT L'HORLOGE AUDIO : elle est peinte ici, au rythme des relevés du
    // worklet, à partir de l'indice d'échantillon. Aucune horloge d'interface n'intervient.
    peindreBande();
    // (E8) LA PERTE DU MICRO SE CONSTATE ICI, vingt fois par seconde : `track.stop()` ne
    // déclenche aucun événement, et une piste morte continue de livrer des zéros.
    surveillerLeMicro();
    // (D2 / E8) LA DURÉE COURANTE DU BANDEAU, à chaque relevé.
    if (_etat.muet && _etat.enPrise) {
      message('muet', 'error', texteAlerteMuette(_etat.muetDepuis,
        Math.max(m.echantillonsEcrits || 0, _etat.echantillonsEcrits), _etat.echantillonnage));
    }
    _etat.echantillonnage = m.echantillonnage || _etat.echantillonnage;
    _etat.canaux = (m.releve && m.releve.canaux) || _etat.canaux;
    _etat.dernierReleve = m;

    if (m.mode === 'analyse') {
      _etat.sommesAnalyse = m.total;
      // (b) LA FENÊTRE GLISSANTE DES DEUX DERNIÈRES SECONDES. Chaque relevé porte les sommes
      // d'environ 50 ms ; on en garde juste assez pour couvrir la fenêtre, et on jette le reste.
      // Décider sur tout ce qui a été vu depuis l'autorisation ferait peser les premiers
      // dixièmes de seconde, où le périphérique n'est pas encore stabilisé, autant que l'instant
      // présent — et un canal momentanément actif au démarrage emporterait la décision.
      _etat.fenetre.push({ sommes: m.releve, echantillons: m.releve.n });
      var limite = Math.round(FENETRE_CANAL_S * (_etat.echantillonnage || 48000));
      var cumul = 0;
      for (var i = _etat.fenetre.length - 1; i >= 0; i--) {
        cumul += _etat.fenetre[i].echantillons;
        if (cumul > limite) { _etat.fenetre = _etat.fenetre.slice(i + 1); break; }
      }
    } else {
      _etat.sommesTotal = m.total;
    }

    var sommes = m.releve;
    var canalPourLeMetre = _etat.canalRetenu ||
      choisirCanal(_etat.sommesAnalyse || sommes, _etat.reglageCanal).canal;
    var n = niveauxCanal(sommes, canalPourLeMetre === 'droit' ? 'd' : 'g');

    var niv = q('[data-vu-niveau]');
    var barre = q('[data-vu-barre]');
    var detail = q('[data-vu-detail]');
    if (n.mesure) {
      niv.textContent = fmtDb(n.efficaceDbfs);
      var pc = Math.max(0, Math.min(100,
        ((n.efficaceDbfs - DBFS_PLANCHER_BARRE) / (0 - DBFS_PLANCHER_BARRE)) * 100));
      barre.style.width = (isFinite(pc) ? pc : 0).toFixed(1) + '%';
      // La grandeur dont le pourcentage découle, à côté de lui (régression #11(j)).
      detail.textContent = 'efficace ' + fmtDb(n.efficaceDbfs) + ' (amplitude ' +
        n.efficace.toExponential(2) + ') · crête ' + fmtDb(n.creteDbfs) +
        ' · ' + nomCanal(canalPourLeMetre) + ' · barre ' + pc.toFixed(1) + ' % sur ' +
        Math.abs(DBFS_PLANCHER_BARRE) + ' dB de plage';
    } else {
      niv.textContent = '—';
      barre.style.width = '0%';
      detail.textContent = n.raison || 'rien mesuré';
    }

    var dec = choisirCanal(m.mode === 'prise' ? (_etat.sommesTotal || sommes)
                                              : (_etat.sommesAnalyse || sommes), _etat.reglageCanal);
    var cr = q('[data-canal-retenu]');
    if (cr) {
      cr.textContent = (_etat.enPrise ? 'Canal retenu pour cette prise : ' : 'Canal qui serait retenu : ') +
        nomCanal(_etat.canalRetenu || dec.canal) + ' — ' + (_etat.enPrise && _etat.canalRaison ? _etat.canalRaison : dec.raison);
    }
    var sbc = q('[data-sb-canal]');
    if (sbc) sbc.textContent = 'Canal : ' + nomCanal(_etat.canalRetenu || dec.canal);

    if (m.blocsSansEntree > 0) {
      journaliser('entrée absente', m.echantillonsVus, { blocsSansEntree: m.blocsSansEntree });
    }

    if (_etat.enPrise) {
      q('[data-chrono]').textContent = fmtTemps(m.echantillonsEcrits, _etat.echantillonnage);
      q('[data-sb-duree]').textContent = 'Durée ' + fmtTemps(m.echantillonsEcrits, _etat.echantillonnage);
    }
  }

  // ── LES MESSAGES DU WORKLET ────────────────────────────────────────────────────────────────
  // LES SOMMES DE LA MESURE ET SES FENÊTRES, RÉUNIES EN UN SEUL OBJET. Une seule construction,
  // utilisée par le verdict provisoire comme par le verdict final : deux assemblages distincts
  // feraient deux vérités pour une mesure.
  function fusionBruit() {
    var b = _etat.bruitSommes || {};
    var o = { fenetres: _etat.fenetresBruit.slice() };
    Object.keys(b).forEach(function (k) { if (k !== 'fenetres') o[k] = b[k]; });
    return o;
  }

  // L'AFFICHAGE DU BRUIT, écrit une seule fois et appelé deux fois (provisoire, puis final).
  // Ce qui est montré est le PLANCHER, puisque c'est lui qui décide. La valeur efficace de la
  // fenêtre entière est montrée à côté, nommée pour ce qu'elle est : sur un plancher parsemé de
  // clics, c'est elle qui annonçait « correct » là où la pièce était calme.
  function peindreBruit(v, quand) {
    _etat.bruit = v;
    var el = q('[data-bruit]');
    if (!el) return v;
    el.setAttribute('data-etat', v.etat);
    if (!v.mesure) { el.textContent = 'Bruit de pièce : ' + (v.raison || 'non mesuré') + '.'; return v; }
    if (v.etat === 'aucun-signal') {
      el.textContent = 'Bruit de pièce : AUCUN SIGNAL — ' + v.echantillonsAZero + ' échantillons '
        + 'sur ' + v.echantillons + ' à zéro numérique. ' + v.raisonDuNiveau;
    } else if (v.etat === 'non concluant') {
      el.textContent = 'Bruit de pièce : NON CONCLUANT — ' + v.raison + '.';
    } else if (v.etat === 'non mesurable') {
      // (T13, avenant 6) AUCUN ÉTAT N'EST AFFICHÉ : ni calme, ni correct, ni bruyant. On dit
      // seulement pourquoi. « une estimation prise dans la voix serait une fausse alerte ».
      el.textContent = 'Bruit de pièce : NON MESURABLE — ' + v.raison;
    } else {
      el.textContent = 'Bruit de pièce : ' + v.etat.toUpperCase() + ' — plancher '
        + fmtDb(v.plancherDbfs) + ' (' + v.centile + 'e centile de '
        + v.fenetres.pleines + ' fenêtres de ' + (v.fenetres.secondes * 1000).toFixed(0) + ' ms, '
        + v.plancherSource + ')'
        + ' · part de grave ' + v.partGrave.toFixed(3) + ' (passe-bas ' + v.coupureHz + ' Hz)'
        + ' · fenêtre entière ' + fmtDb(v.efficaceDbfsFenetreEntiere) + ' efficace'
        + (v.silenceInitialRespecte ? '' : ' · silence initial non tenu : ' + v.raisonDuSilence)
        + (v.transitoires ? ' · ' + v.transitoires + ' bruit(s) bref(s) écarté(s)' : '')
        + (v.mention ? ' · ' + v.mention : '')
        + (quand === 'provisoire' ? ' · mesure provisoire, revue à l\'arrêt' : '');
    }
    // Jamais bloquant : une information, pas un défaut (T13).
    if (v.etat === 'bruyant') {
      message('bruit', 'info', 'La pièce est bruyante (plancher ' + fmtDb(v.plancherDbfs)
        + ', seuil ' + BRUIT.bruyantMin_dbfs + ' dBFS)'
        + (v.graveDominant ? '. ' + v.mention : '. Le bruit n\'est pas surtout grave.')
        + ' Rien n\'est bloqué : la prise se fait quand même.');
    } else {
      message('bruit', '', null);
    }
    return v;
  }

  function surMessageWorklet(m) {
    if (m.type === 'releve') { peindreReleve(m); return; }

    if (m.type === 'prise-demarree') {
      _etat.echantillonnage = m.echantillonnage;
      // LA TAILLE RÉELLE D'UN MORCEAU EST CELLE DU WORKLET, pas celle que le module a demandée.
      // Le worklet l'arrondit au multiple de 128 le plus proche, et il a raison : à 44 100 Hz,
      // 5 secondes font 220 500 échantillons, qui ne sont PAS un nombre entier de blocs. Garder
      // la valeur demandée à côté de la valeur appliquée, c'était deux vérités pour une même
      // grandeur — exactement la régression #11(f).
      _etat.echantillonsParMorceauReels = m.echantillonsParMorceau;
      _etat.seuilSilenceEchantillons = m.seuilSilenceEchantillons;
      _etat.debutTempsWorklet = m.debutTemps;
      _etat.debutTrameWorklet = m.debutTrame;
      _etat.priseDemarreeRecue = true;
      if (!m.canalFourni) {
        journaliser('canal non fourni au worklet', 0, { retombeeSur: m.canal });
        message('canal', 'warning', 'Le canal n\'a pas été décidé avant la prise : le canal ' +
          m.canal + ' a été pris par défaut. La mesure le dit plutôt que de le taire.');
      }
      return;
    }

    if (m.type === 'bruit-demarre') {
      _etat.bruitEnCours = true;
      var eb = q('[data-bruit]');
      if (eb) eb.textContent = 'Bruit de pièce : mesure en cours sur '
        + (m.echantillons / (m.echantillonnage || 48000)).toFixed(1) + ' s…';
      return;
    }

    if (m.type === 'bruit') {
      // Les sommes de la fenêtre entière sont GARDÉES, pas encore jugées : à cet instant la
      // dernière fenêtre de 100 ms du silence initial n'est pas arrivée (le worklet poste les
      // deux dans la même boucle, les sommes d'abord). Le verdict provisoire se rend à la
      // première fenêtre d'après, le verdict FINAL à l'arrêt — une pause où prélever l'ambiance
      // ne peut être trouvée qu'une fois la prise terminée (T13).
      _etat.bruitEnCours = false;
      _etat.bruitSommes = m;
      return;
    }

    if (m.type === 'fenetre-bruit') {
      _etat.fenetresBruit.push(m);
      if (_etat.bruitSommes && !m.dansLeSilenceInitial && !_etat.bruitProvisoireRendu) {
        _etat.bruitProvisoireRendu = true;
        peindreBruit(verdictBruit(fusionBruit()), 'provisoire');
      }
      return;
    }

    if (m.type === 'morceau') {
      // E5 : chaque morceau part vers IndexedDB dès qu'il est plein. On CHAÎNE les écritures
      // pour ne pas ouvrir 180 transactions concurrentes, et on garde la promesse : à l'arrêt,
      // on attend que tout soit réellement écrit avant d'annoncer quoi que ce soit.
      var priseId = _etat.priseId;
      var idx = m.index, debut = m.debutEchantillon, pcm = m.pcm, partiel = m.partiel;
      var vers = _etat.reechantillonnerVers;
      var de = _etat.echantillonnage;
      _etat.ecrituresEnVol = _etat.ecrituresEnVol.then(function () {
        if (!vers || vers === de) return pcm;
        return reechantillonnerPcm(pcm, de, vers);
      }).then(function (donnees) {
        pcm = donnees;
        // QUAND ON RÉÉCHANTILLONNE, LA POSITION DU MORCEAU EST CELLE DE LA PRISE, pas celle du
        // worklet : le worklet compte dans la fréquence du PÉRIPHÉRIQUE, la prise vit dans la
        // sienne. On écrit donc le total déjà écrit dans la prise, qui est la seule position
        // dont l'en-tête WAV et les repères auront besoin.
        var position = (vers && vers !== de) ? _etat.echantillonsEcrits : debut;
        return window.VoixStockage.ecrireMorceau(_etat.db, priseId, idx, position, pcm, partiel);
      }).then(function () {
        _etat.morceauxEcrits++;
        _etat.echantillonsEcrits += pcm.byteLength / 2;
        var sb = q('[data-sb-morceaux]');
        if (sb) sb.textContent = _etat.morceauxEcrits + (_etat.morceauxEcrits > 1 ? ' morceaux' : ' morceau') +
          ' · ' + (_etat.echantillonsEcrits * 2 / 1048576).toFixed(2) + ' Mo écrits';
        // ── (E5 / E12) LE JOURNAL SUIT LA PRISE SUR LE DISQUE, morceau par morceau ────────
        // Trouvé par le contrôle de la continuation après crash : le journal n'était écrit QU'À
        // L'ARRÊT. Une prise tuée en route perdait donc tous ses raccords — ses pauses, l'instant
        // où le micro avait été perdu, le retour du son —, et E12 demande que chaque pause soit
        // journalisée et marquée sur la forme d'onde. Une prise qu'on peut continuer doit se
        // souvenir de ce qui lui est arrivé avant le crash.
        //
        // L'écriture est CHAÎNÉE derrière celle du morceau, donc elle ne double aucune
        // transaction, et elle ne coûte qu'un enregistrement toutes les deux à cinq secondes.
        // Ces compteurs restent en RETARD d'au plus un morceau sur ce qui est réellement là :
        // la relecture reste l'autorité (défaut 6), et un contrôle vérifie qu'ils ne sont jamais
        // en AVANCE.
        return window.VoixStockage.majPrise(_etat.db, priseId, {
          nbEchantillons: _etat.echantillonsEcrits,
          nbMorceaux: _etat.morceauxEcrits,
          journal: _etat.journal.slice(),
        }).catch(function () { /* un journal non écrit ne doit pas perdre le morceau */ });
      }, function (err) {
        message('ecriture', 'error', 'Un morceau n\'a pas pu être écrit : ' + (err && err.message) +
          '. La prise n\'est pas complète et n\'est pas présentée comme réussie.');
        journaliser('écriture refusée', debut, { erreur: String(err && err.message) });
      });
      return;
    }

    if (m.type === 'muet') {
      // E8 : le bandeau, aussitôt. Et le journal, en ÉCHANTILLONS.
      _etat.muet = true;
      _etat.muetDepuis = m.depuisEchantillon;
      peindreEtats();
      journaliser('piste muette', m.depuisEchantillon, { echantillonsAZero: m.echantillonsAZero });
      message('muet', 'error', texteAlerteMuette(m.depuisEchantillon,
        m.depuisEchantillon + m.echantillonsAZero, _etat.echantillonnage));
      return;
    }

    if (m.type === 'son-revenu') {
      // (D3) « son revenu » est un ÉVÉNEMENT, pas un état : l'état redevient « sonore ». Le
      // relevé d'essais notait « Piste : son revenu reste affiché longtemps après le retour du
      // son » — c'était un libellé d'événement collé dans une case d'état.
      _etat.muet = false;
      peindreEtats();
      journaliser('son revenu', m.aEchantillon, null);
      message('muet', 'info', resumeAlerteMuette(_etat.muetDepuis, m.aEchantillon,
        _etat.echantillonnage) + ' Le son est revenu.');
      return;
    }

    if (m.type === 'vide-force') {
      // (D3) PAS DEUX FOIS LE MÊME ÉVÉNEMENT POUR DEUX FAITS DIFFÉRENTS. Le journal d'essai
      // portait « morceau partiel poussé » deux fois, dont une à 0 échantillon : `visibilitychange`
      // et `pagehide` demandent tous deux la vidange, et la seconde n'avait plus rien à pousser.
      // Les deux demandes sont consignées — les taire masquerait l'ordre réel des événements —
      // mais sous deux libellés, parce que ce sont deux faits : un morceau poussé, et rien à
      // pousser.
      journaliser(m.echantillonsPousses > 0 ? 'morceau partiel poussé'
                                            : 'vidange demandée, rien à pousser',
        _etat.echantillonsEcrits,
        { raison: m.raison, echantillonsPousses: m.echantillonsPousses });
      return;
    }

    if (m.type === 'canaux-vivants') {
      // (E3) LE JEU DE CANAUX VIVANTS A CHANGÉ, et c'est un fait de la prise. On le date en
      // échantillons. Le premier message arrive au tout début et dit l'état de départ ; les
      // suivants disent les bascules — chez Christophe, le moment où le canal droit est mort.
      _etat.canauxVivants = m.vivants;
      journaliser('mixage sur ' + m.vivants + ' canal' + (m.vivants > 1 ? 'aux' : '') + ' vivant'
        + (m.vivants > 1 ? 's' : ''), m.aEchantillon,
        { gaucheVivant: m.gauche, droitVivant: m.droit,
          regle: 'en mode moyenne, le diviseur est le nombre de canaux VIVANTS : un canal mort '
            + 'n\'entre pas dans la moyenne, qui retirerait 6 dB (E3). La moyenne n\'étant '
            + 'choisie que pour deux canaux corrélés à plus de 0,8, retirer le mort ne change '
            + 'pas le niveau.' });
      return;
    }

    if (m.type === 'en-pause') {
      _etat.enPause = true;
      if (m.raison === 'micro perdu' && _etat.entreeDePause) {
        // L'ENTRÉE EXISTE DÉJÀ : la surveillance l'a écrite avec la position qu'elle connaissait.
        // On la COMPLÈTE avec ce que seul le worklet sait — combien de zéros il a pu retirer de
        // la fin et combien étaient déjà dans un morceau clos. En créer une seconde ferait le
        // doublon que §29 interdit.
        _etat.entreeDePause.zerosVusParLeWorklet = m.zerosVus;
        _etat.entreeDePause.zerosRetiresDeLaFin = m.zerosRetires;
        _etat.entreeDePause.zerosDejaEcrits = m.zerosNonRetires;
        _etat.entreeDePause.aEchantillonSelonLeWorklet = m.aEchantillon;
        _etat.entreeDePause = null;
        var el = q('[data-alerte] [data-cle="micro"] span');
        if (el && (m.zerosRetires || m.zerosNonRetires)) {
          el.textContent += (m.zerosRetires
            ? ' ' + m.zerosRetires + ' échantillons à zéro ont été retirés de la fin.' : '')
            + (m.zerosNonRetires
            ? ' ' + m.zerosNonRetires + ' zéros étaient déjà dans un morceau clos et n\'ont pas '
              + 'pu être retirés.' : '');
        }
      } else {
        // (E12) LE RACCORD d'une pause DEMANDÉE : échantillon de la prise, et la raison. La
        // DURÉE n'est connue qu'à la reprise — on ne l'invente pas ici.
        journaliser('pause', m.aEchantillon, { raison: m.raison, morceaux: m.morceaux,
          zerosVusParLeWorklet: m.zerosVus,
          zerosRetiresDeLaFin: m.zerosRetires, zerosDejaEcrits: m.zerosNonRetires });
      }
      peindrePause();
      peindreEtats();
      return;
    }

    if (m.type === 'reprise-faite') {
      _etat.enPause = false;
      var duree = _etat.pauseCommenceeA_ms
        ? (((self.performance && performance.now()) || Date.now()) - _etat.pauseCommenceeA_ms) / 1000
        : 0;
      // (E12) « sa durée est seulement notée au journal » : elle est mesurée sur l'horloge du
      // fil principal, et elle ne sert à DATER aucun échantillon — la position du raccord, elle,
      // est en échantillons, et c'est la même qu'à la pause.
      journaliser('reprise', m.aEchantillon, { dureePause_s: +duree.toFixed(3),
        morceaux: m.morceaux, canal: m.canal,
        regle: 'la pause n\'occupe aucun temps dans la voix : la reprise repart de l\'échantillon '
          + 'où la pause a commencé (E12). La durée ci-dessus est une mesure d\'horloge, notée '
          + 'pour mémoire, et elle ne date aucun échantillon.' });
      _etat.pauseCommenceeA_ms = 0;
      peindrePause();
      peindreEtats();
      return;
    }

    if (m.type === 'prise-terminee') {
      _etat.sommesTotal = m.total;
      _etat.finDuWorklet = m;
      return;
    }
  }

  // ── AUTORISATION, PÉRIPHÉRIQUES, GRAPHE ────────────────────────────────────────────────────

  // E3 : capture SANS traitement du navigateur. L'écho, le bruit et le gain automatiques sont
  // désactivés explicitement — sinon Safari « améliore » la voix et la mesure ne vaut plus rien.
  function contraintes(deviceId) {
    var a = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,   // on DEMANDE deux canaux pour pouvoir constater lequel est vide
    };
    if (deviceId) a.deviceId = { exact: deviceId };
    return { audio: a, video: false };
  }

  function autoriser(deviceId) {
    var obtenir = (_services && _services.obtenirFlux)
      ? _services.obtenirFlux(contraintes(deviceId))
      : navigator.mediaDevices.getUserMedia(contraintes(deviceId));
    return Promise.resolve(obtenir).then(function (flux) {
      // (D3) LES PISTES DU FLUX PRÉCÉDENT SONT ARRÊTÉES. Sans cela elles restaient vivantes,
      // leurs écouteurs aussi, et une reprise du périphérique écrivait « piste terminée » autant
      // de fois qu'il y avait eu d'autorisations. Constaté dans le journal d'essai, deux fois.
      if (_etat.flux && _etat.flux !== flux && _etat.flux.getAudioTracks) {
        _etat.flux.getAudioTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
      }
      _etat.flux = flux;
      return listerMicros();
    }).then(function () {
      return brancherGraphe();
    }).then(function () {
      message('autorisation', '', null);
      return true;
    }, function (err) {
      message('autorisation', 'error', 'Le micro n\'a pas été autorisé : ' + (err && err.name) +
        ' — ' + (err && err.message) + '. Sans autorisation, aucune prise n\'est possible (E2).');
      throw err;
    });
  }

  function listerMicros() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return Promise.resolve();
    return navigator.mediaDevices.enumerateDevices().then(function (l) {
      var sel = q('[data-micro]');
      if (!sel) return;
      var entrees = l.filter(function (d) { return d.kind === 'audioinput'; });
      sel.innerHTML = '';
      entrees.forEach(function (d) {
        var o = document.createElement('option');
        o.value = d.deviceId;
        o.textContent = d.label || ('Entrée ' + d.deviceId.slice(0, 6));
        sel.appendChild(o);
      });
      if (!entrees.length) {
        var o2 = document.createElement('option');
        o2.textContent = 'Aucune entrée audio déclarée';
        sel.appendChild(o2);
      }
    }, function () {});
  }

  // ── UNE SEULE CONSTRUCTION DE GRAPHE À LA FOIS ─────────────────────────────────────────────
  //
  // DEUX APPELS CONCURRENTS LAISSAIENT UN NŒUD ORPHELIN, et c'est un contrôle qui l'a montré :
  // changer la taille de morceau lance une construction, cliquer « Autoriser » en lance une
  // seconde. Comme `addModule` est asynchrone, la seconde fermait le contexte que la première
  // venait de créer, puis la première finissait par installer SON nœud — appartenant désormais à
  // un contexte fermé. La prise suivante démarrait sur un graphe mort : zéro échantillon, « prise
  // muette », et dans le journal un « contexte closed » qui disait tout.
  //
  // Le compteur de génération règle cela sans verrou : chaque construction prend un numéro et
  // n'installe son résultat que si elle est encore la plus récente. Celle qui a été dépassée
  // ferme ce qu'elle a créé et se retire.
  var _generation = 0;

  function brancherGraphe() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.reject(new Error('Web Audio absent'));
    var moi = ++_generation;
    if (_etat.ctx) { try { _etat.ctx.close(); } catch (e) {} }
    // La fenêtre de décision appartient au graphe qu'on vient de fermer : la garder ferait
    // décider la prochaine prise sur les relevés d'un autre contexte, et une attente de « fenêtre
    // pleine » la trouverait pleine alors qu'aucun échantillon n'est encore arrivé.
    _etat.fenetre = [];
    _etat.sommesAnalyse = null;
    // (a) La fréquence demandée, ou rien du tout. Mesuré : les deux moteurs honorent l'option,
    // mais la piste du micro garde la sienne et le contexte interpole — voir la constante.
    //
    // IL N'Y A AUCUN LEVIER POUR EN IMPOSER UNE AUTRE, et c'est une décision mesurée. J'en avais
    // ajouté un pour produire deux prises de fréquences différentes (T1 a) : demander une
    // fréquence au contexte fait basculer celle du PÉRIPHÉRIQUE AUDIO DU MAC, et elle y reste,
    // même après fermeture du navigateur — la machine de Christophe est ainsi passée de 44 100 à
    // 48 000 Hz. Un levier qui change l'état de sa machine n'a rien à faire ici. Le test de T1 a
    // écrit désormais les deux prises directement dans le stockage (§16b).
    var ctx = (FREQUENCE_DEMANDEE === null) ? new AC() : new AC({ sampleRate: FREQUENCE_DEMANDEE });
    _etat.ctx = ctx;
    _etat.echantillonnage = ctx.sampleRate;

    var urlWorklet = (_services && _services.urlWorklet) || 'enregistreur-worklet.js';
    return ctx.audioWorklet.addModule(urlWorklet).then(function () {
      // Dépassée pendant l'attente de `addModule` : on ferme ce qu'on a créé et on ne touche à
      // rien. Sans ce retour, ce nœud-ci s'installerait par-dessus le graphe le plus récent.
      if (moi !== _generation) {
        try { ctx.close(); } catch (e) {}
        return false;
      }
      // `channelCountMode: 'max'` et NON 'explicit' à 2. Avec 'explicit', une entrée mono est
      // complétée par un second canal de zéros, et le worklet voit alors deux canaux dont un
      // vide : le résultat serait juste (on prend le canal actif) mais le RAPPORT mentirait, en
      // écrivant « canal vide : droit » là où la vérité est « entrée mono ». Avec 'max', le
      // worklet voit le nombre de canaux que le périphérique livre réellement.
      // `discrete` : aucun mélange automatique — c'est nous qui décidons du mixage (E3).
      var noeud = new AudioWorkletNode(ctx, 'enregistreur-voix', {
        numberOfInputs: 1, numberOfOutputs: 0,
        channelCount: 2, channelCountMode: 'max', channelInterpretation: 'discrete',
        processorOptions: {
          echantillonsParMorceau: Math.round(_etat.tailleMorceau_s * ctx.sampleRate),
        },
      });
      noeud.port.onmessage = function (e) { surMessageWorklet(e.data || {}); };
      _etat.noeud = noeud;

      var source = (_services && _services.creerSource)
        ? _services.creerSource(ctx)
        : ctx.createMediaStreamSource(_etat.flux);
      _etat.source = source;
      source.connect(noeud);

      // ── (A / E3) CE QUE LE GRAPHE DÉCLARE, RELEVÉ ET NON SUPPOSÉ ────────────────────────
      //
      // Christophe a relevé trois prises où la fenêtre d'avant voyait deux canaux actifs et la
      // prise un canal droit à zéro. La première question était : le graphe est-il le MÊME avant
      // et pendant ? Il l'est — c'est un seul nœud, construit une fois, et ni le mode ni
      // l'interprétation ne changent au démarrage d'une prise. Mais cela ne se DÉMONTRE que si
      // les paramètres sont écrits dans le rapport. Les voici, relevés sur les objets eux-mêmes.
      //
      // Ce qui compte dans ces trois lignes : `channelCountMode` à « max » signifie que
      // `channelCount` est IGNORÉ et que le nœud prend le nombre de canaux de sa source ; et
      // `channelInterpretation` à « discrete » signifie qu'un mono n'est PAS dupliqué sur deux
      // canaux — il reste un canal. Un up-mix par duplication aurait expliqué une corrélation
      // de 1,000 suivie d'un canal vide ; « discrete » l'exclut.
      _etat.grapheDeCapture = {
        source: {
          type: (_services && _services.creerSource) ? 'source d\'essai (fixture)' : 'MediaStreamSource',
          canauxEnSortie: (typeof source.channelCount === 'number') ? source.channelCount : 'indisponible',
          modeDeComptage: source.channelCountMode || 'indisponible',
          interpretation: source.channelInterpretation || 'indisponible',
          sorties: (typeof source.numberOfOutputs === 'number') ? source.numberOfOutputs : 'indisponible',
        },
        worklet: {
          canauxDemandes: noeud.channelCount,
          modeDeComptage: noeud.channelCountMode,
          interpretation: noeud.channelInterpretation,
          entrees: noeud.numberOfInputs,
          sorties: noeud.numberOfOutputs,
        },
        regle: 'le graphe est construit UNE fois et ne change pas au démarrage d\'une prise : '
          + 'ni le mode de comptage ni l\'interprétation ne sont touchés. `channelCountMode` à '
          + '« max » fait que le nœud prend le nombre de canaux de sa source et IGNORE '
          + '`channelCount` ; `channelInterpretation` à « discrete » fait qu\'un mono n\'est pas '
          + 'dupliqué sur deux canaux. Un canal qui porte un signal avant la prise et le zéro '
          + 'numérique pendant ne peut donc pas venir du graphe : il vient du périphérique.',
      };

      // (a) LA FRÉQUENCE RÉELLE, affichée dès que le graphe existe : c'est elle que la prise
      // enregistrera, et c'est elle que Christophe doit pouvoir lire dans le rapport.
      var sbf = q('[data-sb-frequence]');
      if (sbf) sbf.textContent = 'Fréquence : ' + ctx.sampleRate + ' Hz'
        + (ctx.sampleRate === 48000 ? '' : ' (le lot 4 rééchantillonnera à 48 000)');

      // L'état de la piste, journalisé : muette, terminée, contexte suspendu. En échantillons.
      var piste = _etat.flux && _etat.flux.getAudioTracks ? _etat.flux.getAudioTracks()[0] : null;
      if (piste) {
        var reglages = piste.getSettings ? piste.getSettings() : {};
        // Gardé À PART du journal d'une prise : le journal d'une prise se vide à chaque nouvelle
        // prise, et l'ouverture de piste, elle, décrit le périphérique pour TOUTES les prises de
        // la session. L'écraser revenait à perdre la preuve que les traitements du navigateur
        // sont bien désactivés (E3) — trouvé par un contrôle qui ne retrouvait plus l'entrée.
        // (e) LE NOM DU PÉRIPHÉRIQUE, tel que la piste le donne. Il n'existe qu'APRÈS
        // l'autorisation : avant, les libellés sont vides, par protection de la vie privée.
        // On le relève donc ici, et on dit « indisponible » plutôt que d'inventer.
        _etat.microphone = {
          nom: piste.label || 'indisponible (libellé vide : autorisation refusée ou non accordée)',
          identifiant: reglages.deviceId || 'indisponible',
          canauxLivres: (typeof reglages.channelCount === 'number') ? reglages.channelCount : 'indisponible',
          echantillonnageDeLaPiste: (typeof reglages.sampleRate === 'number') ? reglages.sampleRate : 'indisponible',
          latenceEntree_s: (typeof reglages.latency === 'number') ? reglages.latency : 'indisponible',
          annulationEcho: reglages.echoCancellation,
          suppressionBruit: reglages.noiseSuppression,
          gainAutomatique: reglages.autoGainControl,
          // ── (A) CE QUE LA PISTE DÉCLARE, SANS TRI NI INTERPRÉTATION ─────────────────────
          // Les champs ci-dessus sont ceux que j'ai choisi de nommer, et trois d'entre eux
          // revenaient « indisponible » dans les rapports de Christophe sans qu'on sache si la
          // piste ne les déclarait pas ou si je les lisais mal. On joint donc `getSettings()`
          // TEL QUEL, plus la liste de ce qui manque : mesuré sur son Safari du 17 octobre,
          // `channelCount` et `latency` sont absents, et `noiseSuppression` comme
          // `autoGainControl` ne sont pas déclarés non plus — seul `echoCancellation` l'est.
          reglagesDeLaPiste: reglages,
          champsDeclares: Object.keys(reglages).sort(),
          champsAbsents: ['channelCount', 'sampleRate', 'latency', 'echoCancellation',
                          'noiseSuppression', 'autoGainControl', 'deviceId', 'groupId']
            .filter(function (k) { return !(k in reglages); }),
          regle: 'ce que le navigateur ne déclare pas ne peut pas être vérifié : les champs '
            + 'absents sont nommés plutôt que remplacés par une valeur plausible. E3 exige que '
            + 'l\'écho, le bruit et le gain automatiques soient désactivés ; ils sont DEMANDÉS '
            + 'dans les contraintes, et ce rapport dit lesquels la piste confirme.',
          etatDeLaPisteALOuverture: piste.readyState,
          muetteALOuverture: piste.muted,
        };
        // L'AFFICHAGE VIENT ICI, et pas plus haut : plus haut, `_etat.microphone` n'est pas
        // encore renseigné et la barre d'état montrait « Micro : — » alors que le rapport portait
        // le bon nom. Un contrôle qui compare la page au rapport l'a dit.
        var sbm = q('[data-sb-micro]');
        if (sbm) sbm.textContent = 'Micro : ' + _etat.microphone.nom;
        // ── (3) « PISTE OUVERTE » EST DATÉE À SON ÉCHANTILLON RÉEL ────────────────────
        // Elle était datée à 0 en toutes circonstances. Sur une session REPRISE — après une
        // perte de micro, ou une continuation — la piste s'ouvre au MILIEU de la prise, et la
        // dater à zéro la place avant son début. Hors prise, zéro est la vérité (il n'y a pas
        // de position) ; en prise, c'est la position courante.
        _etat.ouverturePiste = journaliser('piste ouverte', echantillonsCourants(), {
          canaux: reglages.channelCount, echantillonnage: reglages.sampleRate,
          annulationEcho: reglages.echoCancellation,
          suppressionBruit: reglages.noiseSuppression,
          gainAutomatique: reglages.autoGainControl,
        });
        // (D3) LA PISTE EST GARDÉE : c'est elle, et non le journal, qui dira son état.
        _etat.piste = piste;
        peindreEtats();
        // (D3) UNE GARDE DE GÉNÉRATION SUR CHAQUE ÉCOUTEUR. Le journal d'essai portait
        // « piste terminée » DEUX FOIS : `autoriser` remplaçait `_etat.flux` sans arrêter les
        // pistes du flux précédent, qui restaient vivantes avec leurs écouteurs. Quand le
        // périphérique a été repris, les deux pistes se sont terminées et les deux l'ont écrit.
        // Les pistes anciennes sont maintenant arrêtées (voir `autoriser`), et cette garde est la
        // seconde barrière : un écouteur d'une génération dépassée se tait.
        var maGeneration = moi;
        piste.addEventListener('mute', function () {
          if (maGeneration !== _generation) return;
          journaliser('piste muette (événement)', echantillonsCourants());
          peindreEtats();
          message('piste', 'error', 'La piste audio s\'est déclarée muette.');
        });
        piste.addEventListener('unmute', function () {
          if (maGeneration !== _generation) return;
          journaliser('piste non muette', echantillonsCourants());
          peindreEtats();
        });
        piste.addEventListener('ended', function () {
          if (maGeneration !== _generation) return;
          journaliser('piste terminée', echantillonsCourants());
          peindreEtats();
          message('piste', 'error', 'La piste audio s\'est terminée : le périphérique a été retiré ou repris par une autre application.');
        });
      }
      if (!piste) {
        _etat.piste = null;
        peindreEtats();
        var sbm0 = q('[data-sb-micro]');
        if (sbm0) sbm0.textContent = 'Micro : aucune piste (source d\'essai)';
      }
      ctx.onstatechange = function () {
        journaliser('contexte ' + ctx.state, echantillonsCourants());
        peindreEtats();
        // (E8) UN CONTEXTE INTERROMPU EST UNE PERTE DE MICRO. Et c'est le SEUL endroit où elle
        // peut se constater : un contexte suspendu ne produit plus de relevé, donc la
        // surveillance qui vit dans le relevé ne tournerait jamais pour ce cas-là.
        surveillerLeMicro();
        if (ctx.state === 'suspended' && _etat.enPrise) {
          message('contexte', 'error', 'Le contexte audio est suspendu pendant la prise : les échantillons n\'arrivent plus. Consigné en échantillons.');
        }
      };
      return true;
    }, function (err) {
      // ── LE REJET D'UNE CONSTRUCTION DÉPASSÉE SE TAIT ─────────────────────────────────────
      // Trouvé par un contrôle, et c'était un défaut à moi : quand une seconde construction
      // ferme le contexte de la première, l'`addModule` de celle-ci échoue avec « Unable to
      // load a worklet's module ». Comme le garde de génération vivait dans le `then`, ce rejet
      // passait devant lui et remontait au gestionnaire du sélecteur, qui annonçait « le graphe
      // n'a pas pu être reconstruit » — pour une reconstruction qui venait de réussir. Un
      // bandeau d'erreur sans erreur est pire que pas de bandeau : il apprend à les ignorer.
      if (moi !== _generation) {
        try { ctx.close(); } catch (e) {}
        return false;
      }
      throw err;
    });
  }

  // (b) Les sommes de la fenêtre de décision, avec de quoi juger si elle est assez longue.
  function fenetreDeDecision() {
    var sommes = fusionnerSommes(_etat.fenetre.map(function (x) { return x.sommes; }));
    var ech = _etat.echantillonnage || 48000;
    return {
      sommes: sommes,
      secondes: sommes.n / ech,
      suffisante: sommes.n >= Math.round(FENETRE_CANAL_MIN_S * ech),
      relevés: _etat.fenetre.length,
    };
  }

  // ── (D4) LA POSITION COURANTE DANS LA PRISE EN COURS ──────────────────────────────────────
  //
  // DÉFAUT 4 DU RELEVÉ D'ESSAIS, et sa cause exacte. Christophe a relevé que l'événement
  // « contexte running » était daté à l'échantillon 1 071 616, puis 2 962 176, puis 3 963 008,
  // puis 1 666 816 — à chaque fois la longueur EXACTE de la prise précédente. Ce n'était pas un
  // décalage ni un arrondi : c'était un compteur résiduel. Cette fonction rendait
  // `_etat.dernierReleve.echantillonsEcrits`, et le worklet, hors prise, continuait d'envoyer
  // ses relevés avec ce compteur figé à la valeur de la prise qui venait de finir. Un événement
  // survenu ENTRE deux prises était donc daté dans la précédente.
  //
  // LA RÈGLE : hors prise, il n'y a pas de position, et zéro est la vérité. Le worklet remet son
  // compteur à zéro dès que son message d'arrêt est parti ; cette garde est la seconde, et elle
  // est indépendante — un chiffre qui a menti une fois mérite deux gardes.
  function echantillonsCourants() {
    if (!_etat.enPrise) return 0;
    // (E12) QUAND LA NOUVELLE PARTIE EST RÉÉCHANTILLONNÉE, le compteur du worklet est dans la
    // fréquence du PÉRIPHÉRIQUE et celui du module dans celle de la PRISE : les deux ne sont
    // plus comparables, et c'est celui de la prise qui compte, puisque c'est lui que l'en-tête
    // WAV et les repères emploient.
    if (_etat.reechantillonnerVers && _etat.reechantillonnerVers !== _etat.echantillonnage) {
      return _etat.echantillonsEcrits;
    }
    var r = _etat.dernierReleve;
    var duReleve = (r && typeof r.echantillonsEcrits === 'number') ? r.echantillonsEcrits : 0;
    // Le relevé est plus fin que le compte de morceaux (toutes les 50 ms contre toutes les 5 s) ;
    // le compte de morceaux est plus sûr. On prend le plus avancé des deux, qui est toujours une
    // position de CETTE prise.
    return Math.max(duReleve, _etat.echantillonsEcrits);
  }

  // ── (E12, point 5) L'IMPORT D'UNE VOIX : L'EN-TÊTE EST LU À LA MAIN ──────────────────────
  //
  // POURQUOI À LA MAIN, et non par `decodeAudioData`. Trois raisons mesurables : `decodeAudioData`
  // rééchantillonne D'OFFICE vers la fréquence du contexte, ce qui perdrait la fréquence du
  // fichier que E11 demande de conserver ; il ne dit pas combien de bits portait l'original ; et
  // il accepterait des formats que T1 ter laisse au jalon III réduit en les convertissant en
  // silence. Lire l'en-tête, c'est pouvoir REFUSER ce qu'on ne sait pas faire en le disant.
  //
  // Ce qui est accepté, et rien de plus : RIFF/WAVE, PCM entier (format 1), 16 ou 24 bits, un ou
  // deux canaux, n'importe quelle fréquence. Tout le reste est refusé avec sa raison.
  function lireEnTeteWav(tampon) {
    var o = new DataView(tampon);
    var lire4 = function (p) {
      return String.fromCharCode(o.getUint8(p), o.getUint8(p + 1), o.getUint8(p + 2), o.getUint8(p + 3));
    };
    if (tampon.byteLength < 44) throw new Error('fichier trop court pour un WAV : ' + tampon.byteLength + ' octets');
    if (lire4(0) !== 'RIFF') throw new Error('ce n\'est pas un RIFF : « ' + lire4(0) + ' »');
    if (lire4(8) !== 'WAVE') throw new Error('ce n\'est pas un WAVE : « ' + lire4(8) + ' »');
    // LES MORCEAUX DE L'EN-TÊTE SE PARCOURENT, ils ne se supposent pas à 12 et 36 octets : un
    // WAV écrit par un autre outil peut porter un `LIST` ou un `fact` avant `data`.
    var p = 12, fmt = null, donnees = null;
    while (p + 8 <= tampon.byteLength) {
      var nom = lire4(p);
      var taille = o.getUint32(p + 4, true);
      var corps = p + 8;
      if (nom === 'fmt ') {
        fmt = {
          format: o.getUint16(corps, true),
          canaux: o.getUint16(corps + 2, true),
          echantillonnage: o.getUint32(corps + 4, true),
          bits: o.getUint16(corps + 14, true),
        };
      } else if (nom === 'data') {
        donnees = { debut: corps, octets: Math.min(taille, tampon.byteLength - corps) };
        break;   // on s'arrête au premier `data` : c'est la voix
      }
      p = corps + taille + (taille % 2);   // les morceaux RIFF sont alignés sur 2 octets
    }
    if (!fmt) throw new Error('aucun morceau « fmt » dans ce WAV');
    if (!donnees) throw new Error('aucun morceau « data » dans ce WAV');
    if (fmt.format !== 1) {
      throw new Error('format ' + fmt.format + ' : seul le PCM entier (format 1) est accepté à '
        + 'cette étape ; les autres formats sont du jalon III réduit');
    }
    if (fmt.bits !== 16 && fmt.bits !== 24) {
      throw new Error(fmt.bits + ' bits : seuls 16 et 24 bits sont acceptés (E12)');
    }
    if (fmt.canaux !== 1 && fmt.canaux !== 2) {
      throw new Error(fmt.canaux + ' canaux : seuls le mono et la stéréo sont acceptés (E12)');
    }
    if (!fmt.echantillonnage) throw new Error('fréquence nulle dans l\'en-tête');
    var parTrame = fmt.canaux * (fmt.bits / 8);
    return {
      format: fmt.format, canaux: fmt.canaux, bits: fmt.bits,
      echantillonnage: fmt.echantillonnage,
      debutDonnees: donnees.debut, octetsDonnees: donnees.octets,
      octetsParTrame: parTrame,
      nbEchantillons: Math.floor(donnees.octets / parTrame),
    };
  }

  // LES ÉCHANTILLONS D'UN WAV, CANAL PAR CANAL, en flottants. Un entier 24 bits se lit en trois
  // octets de poids croissant, avec extension du signe ; on le ramène à l'échelle du 16 bits par
  // division, pas par décalage — un décalage tronquerait toujours vers le bas et introduirait un
  // biais continu de un demi-pas, mesurable sur un silence.
  function echantillonsDuWav(tampon, t) {
    var o = new DataView(tampon);
    var g = new Float32Array(t.nbEchantillons);
    var d = t.canaux === 2 ? new Float32Array(t.nbEchantillons) : null;
    var octets = t.bits / 8;
    for (var i = 0; i < t.nbEchantillons; i++) {
      for (var c = 0; c < t.canaux; c++) {
        var p = t.debutDonnees + i * t.octetsParTrame + c * octets;
        var v;
        if (t.bits === 16) {
          var e16 = o.getInt16(p, true);
          v = e16 < 0 ? e16 / 32768 : e16 / 32767;
        } else {
          var b0 = o.getUint8(p), b1 = o.getUint8(p + 1), b2 = o.getUint8(p + 2);
          var e24 = b0 | (b1 << 8) | (b2 << 16);
          if (e24 & 0x800000) e24 -= 0x1000000;
          v = e24 < 0 ? e24 / 8388608 : e24 / 8388607;
        }
        if (c === 0) g[i] = v; else d[i] = v;
      }
    }
    return { g: g, d: d };
  }

  // LES SOMMES D'UN SIGNAL IMPORTÉ, dans la forme EXACTE que la règle du canal attend. On ne
  // réécrit pas la règle E3 pour l'import : on lui donne à manger ce qu'elle mange déjà, et
  // `choisirCanal` décide — un seul canal actif on le prend, deux corrélés on moyenne, deux
  // différents le plus fort. Une seconde règle écrite ici aurait divergé de la première.
  function sommesDUnSignal(g, d) {
    var acc = { n: 0, canaux: d ? 2 : 1, sommeG: 0, sommeD: 0, sommeCarreG: 0, sommeCarreD: 0,
                sommeProduit: 0, creteG: 0, creteD: 0, zerosG: 0, zerosD: 0 };
    for (var i = 0; i < g.length; i++) {
      var vg = g[i];
      acc.sommeG += vg; acc.sommeCarreG += vg * vg;
      var ag = vg < 0 ? -vg : vg;
      if (ag > acc.creteG) acc.creteG = ag;
      if (vg === 0) acc.zerosG++;
      if (d) {
        var vd = d[i];
        acc.sommeD += vd; acc.sommeCarreD += vd * vd;
        var ad = vd < 0 ? -vd : vd;
        if (ad > acc.creteD) acc.creteD = ad;
        if (vd === 0) acc.zerosD++;
        acc.sommeProduit += vg * vd;
      }
      acc.n++;
    }
    return acc;
  }

  // ── (E12, point 5) IMPORTER UNE VOIX ET EN FAIRE UNE PRISE QU'ON PEUT CONTINUER ──────────
  //
  // La prise importée est une prise comme les autres : des morceaux de 16 bits mono, à la
  // fréquence DU FICHIER (E11 : « chaque prise garde la fréquence réelle de la capture »), avec
  // son journal et sa raison de canal. Elle naît « terminée », donc « Continuer cette prise »
  // s'y applique — et c'est tout l'objet de l'import.
  function importerWav(fichier) {
    if (!fichier) return Promise.reject(new Error('aucun fichier'));
    if (!_etat.db) return Promise.reject(new Error('stockage non ouvert'));
    return fichier.arrayBuffer().then(function (tampon) {
      var t = lireEnTeteWav(tampon);
      var ech = echantillonsDuWav(tampon, t);
      var sommes = sommesDUnSignal(ech.g, ech.d);
      // (E3) LA MÊME RÈGLE QUE POUR LE MICRO, appliquée au fichier.
      var dec = choisirCanal(sommes, _etat.reglageCanal);
      var mono = new Int16Array(t.nbEchantillons);
      for (var i = 0; i < t.nbEchantillons; i++) {
        var v = dec.canal === 'droit' ? (ech.d ? ech.d[i] : 0)
              : dec.canal === 'moyenne' ? (ech.d ? (ech.g[i] + ech.d[i]) / 2 : ech.g[i])
              : ech.g[i];
        var borne = v < 0 ? (v < -1 ? -1 : v) * 32768 : (v > 1 ? 1 : v) * 32767;
        mono[i] = Math.round(borne);
      }
      // LA TAILLE DES MORCEAUX EST CELLE DU PRODUIT : un nombre entier de blocs de 128, calculé
      // sur la fréquence DU FICHIER (E11). Le worklet en est l'auteur pour les prises du micro ;
      // ici il n'y a pas de worklet, et la règle est appliquée telle quelle, à un seul endroit.
      var demandee = Math.round(_etat.tailleMorceau_s * t.echantillonnage);
      var parMorceau = Math.max(128, Math.round(demandee / 128) * 128);
      var id = 'prise-import-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
      var nom = (fichier.name || 'voix importée').replace(/\.wav$/i, '');
      var journal = [{ quoi: 'voix importée', aEchantillon: 0, priseId: id,
                       fichierBits: t.bits, fichierCanaux: t.canaux,
                       echantillonnage: t.echantillonnage, echantillons: t.nbEchantillons,
                       canalRetenu: dec.canal, canalRaison: dec.raison,
                       regle: 'en-tête lu à la main (RIFF/WAVE, PCM entier) ; la fréquence du '
                         + 'fichier est conservée (E11) ; la stéréo suit la règle du canal (E3) ; '
                         + 'la conversion est en 16 bits mono.' }];
      var descripteur = descripteurDePrise({
        id: id, nom: nom, creeLe: new Date().toISOString(),
        echantillonnage: t.echantillonnage,
        canaux: t.canaux, canalRetenu: dec.canal, canalRaison: dec.raison,
        reglageCanal: _etat.reglageCanal,
        echantillonsParMorceauAppliquee: parMorceau,
      });
      descripteur.origine = 'import WAV';
      descripteur.journal = journal;
      return window.VoixStockage.creerPrise(_etat.db, descripteur).then(function () {
        // Les morceaux à la file, chaînés : on n'ouvre pas trois cents transactions d'un coup.
        var chaine = Promise.resolve();
        var nb = 0, ecrits = 0;
        for (var debut = 0, idx = 0; debut < mono.length; debut += parMorceau, idx++) {
          (function (debut, idx) {
            chaine = chaine.then(function () {
              var bout = mono.slice(debut, Math.min(debut + parMorceau, mono.length));
              var partiel = bout.length < parMorceau;
              return window.VoixStockage.ecrireMorceau(_etat.db, id, idx, debut, bout.buffer, partiel)
                .then(function () { nb++; ecrits += bout.length; });
            });
          })(debut, idx);
        }
        return chaine.then(function () {
          return window.VoixStockage.majPrise(_etat.db, id, {
            etat: 'terminee', nbEchantillons: ecrits, nbMorceaux: nb, journal: journal,
          });
        }).then(function () {
          message('import', 'info', 'Voix importée : ' + t.nbEchantillons + ' échantillons, '
            + t.echantillonnage + ' Hz, ' + t.bits + ' bits, ' + t.canaux + ' canal(aux) → '
            + nb + ' morceaux de 16 bits mono (' + ecrits + ' échantillons écrits, '
            + nomCanal(dec.canal) + ' : ' + dec.raison + '). Vous pouvez la CONTINUER.');
          return peindreListe().then(function () {
            return { id: id, echantillonnage: t.echantillonnage, bits: t.bits,
                     canaux: t.canaux, morceaux: nb, echantillons: ecrits,
                     canalRetenu: dec.canal, canalRaison: dec.raison };
          });
        });
      });
    }).catch(function (e) {
      // `.then(f, r)` n'attrape PAS ce que `f` lève : il ne couvrirait que la lecture du
      // fichier, et un en-tête refusé serait remonté nu. C'est `.catch` qu'il faut ici.
      message('import', 'error', 'Import refusé : ' + (e && e.message)
        + '. Rien n\'a été écrit dans le stockage.');
      throw e;
    });
  }

  // ── (E11 / E12) RÉÉCHANTILLONNER LA NOUVELLE PARTIE D'UNE PRISE ──────────────────────────
  //
  // E12 : « si le périphérique a changé de fréquence, le Studio le dit et rééchantillonne la
  // nouvelle partie ». Une prise à deux fréquences est une prise dont aucune durée n'est juste :
  // l'en-tête WAV n'en porte qu'une, et la moitié du fichier jouerait trop vite.
  //
  // C'EST LE RÉÉCHANTILLONNEUR DU NAVIGATEUR QUI TRAVAILLE, dans un `OfflineAudioContext` à la
  // fréquence de la prise — le même code que celui qui a produit toutes les autres prises, et
  // AUCUN périphérique audio n'est ouvert (règle du 11 octobre : rien ne touche à la
  // configuration de la machine). Une interpolation linéaire écrite à la main serait plus
  // courte et ferait entendre la différence sur une voix.
  function reechantillonnerPcm(tampon, deHz, versHz) {
    if (!deHz || !versHz || deHz === versHz) return Promise.resolve(tampon);
    var entree = new Int16Array(tampon);
    if (!entree.length) return Promise.resolve(tampon);
    var OAC = self.OfflineAudioContext || self.webkitOfflineAudioContext;
    if (!OAC) return Promise.reject(new Error('OfflineAudioContext absent : rééchantillonnage impossible'));
    var cible = Math.max(1, Math.round(entree.length * versHz / deHz));
    var oc = new OAC(1, cible, versHz);
    var source = oc.createBuffer(1, entree.length, deHz);
    var flottants = source.getChannelData(0);
    for (var i = 0; i < entree.length; i++) {
      // L'inverse exact de l'écriture : le format est asymétrique, la lecture doit l'être aussi.
      flottants[i] = entree[i] < 0 ? entree[i] / 32768 : entree[i] / 32767;
    }
    var n = oc.createBufferSource();
    n.buffer = source;
    n.connect(oc.destination);
    n.start();
    return oc.startRendering().then(function (rendu) {
      var sortie = rendu.getChannelData(0);
      var out = new Int16Array(sortie.length);
      for (var k = 0; k < sortie.length; k++) {
        var v = sortie[k];
        var borne = v < 0 ? (v < -1 ? -1 : v) * 32768 : (v > 1 ? 1 : v) * 32767;
        out[k] = Math.round(borne);
      }
      return out.buffer;
    });
  }

  // ── (E12) LA PAUSE ET LA REPRISE ──────────────────────────────────────────────────────────
  //
  // UNE SEULE TOUCHE, UN SEUL BOUTON, UNE SEULE FONCTION. E12 : « une seule touche bascule pause
  // et reprise ». Écrire deux fonctions, une pour chaque sens, ferait deux chemins pour un seul
  // geste et laisserait l'état se contredire. Le flux du micro RESTE OUVERT pendant la pause :
  // on ne ferme rien, on cesse seulement d'écrire. C'est ce qui permet au vu-mètre de continuer
  // à vivre et à la reprise d'être immédiate.
  function basculerPause(raison) {
    if (!_etat.enPrise || !_etat.noeud) return Promise.resolve(null);
    if (_etat.enPause) {
      // ── REPRISE ───────────────────────────────────────────────────────────────────────────
      // Si le micro avait été perdu, la reprise passe par `reprendreLeMicro` : il faut un
      // nouveau `getUserMedia`, et il faut un geste de l'utilisateur pour l'obtenir.
      if (_etat.microPerdu) return reprendreLeMicro();
      _etat.noeud.port.postMessage({ type: 'reprendre', canal: _etat.canalRetenu });
      return Promise.resolve('reprise');
    }
    // ── PAUSE ───────────────────────────────────────────────────────────────────────────────
    _etat.pauseCommenceeA_ms = (self.performance && performance.now()) || Date.now();
    _etat.noeud.port.postMessage({ type: 'mettre-en-pause', raison: raison || 'demandée',
      retirerZerosDeFin: raison === 'micro perdu' });
    return Promise.resolve('pause');
  }

  // L'INTERFACE DE LA PAUSE, peinte depuis l'état et nulle part ailleurs.
  function peindrePause() {
    var mode = q('[data-mode]');
    if (mode && _etat.enPrise) mode.textContent = _etat.enPause ? 'Prise en pause' : 'Prise en cours';
    var lib = q('[data-pause-libelle]');
    if (lib) lib.textContent = _etat.enPause ? 'Reprendre' : 'Pause';
    var b = q('[data-action="pause"]');
    if (b) b.hidden = !_etat.enPrise;
    var intitule = q('[data-chrono-intitule]');
    if (intitule && _etat.enPrise) {
      intitule.textContent = _etat.enPause ? 'Prise en pause' : 'Enregistrement';
    }
  }

  // ── (E8) LA PERTE DU MICRO MET LA PRISE EN PAUSE D'ELLE-MÊME ──────────────────────────────
  //
  // E8 : « Quand la piste audio se termine ou que le contexte audio est interrompu, la prise se
  // met en pause (E12) : aucun zéro n'est écrit, le Studio l'annonce et propose Reprendre. »
  // Mesuré aux essais du 10 octobre : la prise avait écrit 52,13 s de zéros après la perte, et
  // le Studio affichait toujours « Enregistrement ». La détection ne peut PAS venir du worklet :
  // une piste morte continue de livrer des canaux pleins de zéros, et un zéro ne se distingue
  // pas d'un silence volontaire. Elle vient donc de la piste elle-même et du contexte, relus à
  // chaque relevé — vingt fois par seconde — parce que `track.stop()` ne déclenche aucun
  // événement (mesuré au §23).
  function surveillerLeMicro() {
    if (!_etat.enPrise || _etat.enPause || _etat.microPerdu) return;
    var piste = _etat.piste;
    var ctxEtat = _etat.ctx ? _etat.ctx.state : 'indisponible';
    var cause = null;
    if (piste && piste.readyState === 'ended') cause = 'la piste audio s\'est terminée';
    else if (piste && piste.muted) cause = 'le périphérique a déclaré la piste muette';
    else if (ctxEtat === 'suspended' || ctxEtat === 'interrupted') cause = 'le contexte audio est ' + ctxEtat;
    else if (ctxEtat === 'closed') cause = 'le contexte audio est fermé';
    if (!cause) return;
    _etat.microPerdu = true;
    _etat.causeDeLaPerte = cause;

    // ── LA PAUSE EST PRONONCÉE PAR LE MODULE, PAS ATTENDUE DU WORKLET ────────────────────
    // Trouvé en écrivant le contrôle du contexte interrompu : quand le contexte est suspendu,
    // le worklet ne tourne plus — il ne traite plus aucun message et n'en envoie plus. Attendre
    // son accusé « en-pause » pour déclarer la prise en pause aurait donc marché pour une piste
    // morte et JAMAIS pour un contexte suspendu, c'est-à-dire pour la moitié de ce que E8
    // nomme. Le module prononce donc la pause lui-même, avec la position qu'il connaît, et le
    // message au worklet n'est qu'une demande de ménage (retirer les zéros de fin) dont la
    // réponse viendra si elle peut venir.
    var position = echantillonsCourants();
    _etat.enPause = true;
    _etat.pauseCommenceeA_ms = (self.performance && performance.now()) || Date.now();
    _etat.entreeDePause = journaliser('pause', position,
      { raison: 'micro perdu', cause: cause,
        zerosRetiresDeLaFin: 'en attente du worklet', zerosDejaEcrits: 'en attente du worklet' });
    peindrePause();
    peindreEtats();
    // (E8) LE BANDEAU FIXÉ À LA FENÊTRE, AVEC « REPRENDRE ».
    message('micro', 'error', 'Le micro a été perdu à l\'échantillon ' + position
      + ' (' + fmtTemps(position, _etat.echantillonnage) + ') : ' + cause
      + '. La prise est EN PAUSE et n\'écrit plus rien.',
      { nom: 'reprendre-micro', libelle: 'Reprendre' });
    if (_etat.noeud) {
      _etat.noeud.port.postMessage({ type: 'mettre-en-pause', raison: 'micro perdu',
        retirerZerosDeFin: true });
    }
  }

  // LA REPRISE APRÈS UNE PERTE : un NOUVEAU getUserMedia, qui exige un geste de l'utilisateur.
  // On ne le tente donc jamais tout seul : le bandeau porte un bouton, et c'est le clic qui
  // l'appelle. Si le périphérique est revenu à une autre fréquence, on le DIT et la nouvelle
  // partie sera rééchantillonnée à celle de la prise (E11, E12).
  function reprendreLeMicro() {
    var frequenceDeLaPrise = _etat.frequenceDeLaPrise || _etat.echantillonnage;
    return autoriser(q('[data-micro]') ? (q('[data-micro]').value || null) : null).then(function () {
      var nouvelle = _etat.echantillonnage;
      _etat.microPerdu = false;
      _etat.causeDeLaPerte = null;
      if (nouvelle !== frequenceDeLaPrise) {
        _etat.reechantillonnerVers = frequenceDeLaPrise;
        journaliser('fréquence du périphérique changée', echantillonsCourants(),
          { deLaPrise: frequenceDeLaPrise, duPeripherique: nouvelle });
        message('frequence', 'warning', 'Le périphérique est revenu à ' + nouvelle + ' Hz alors '
          + 'que cette prise est à ' + frequenceDeLaPrise + ' Hz : la nouvelle partie est '
          + 'rééchantillonnée vers ' + frequenceDeLaPrise + ' Hz pour que la prise reste à une '
          + 'seule fréquence (E11).');
      }
      // Le graphe a été reconstruit : le worklet est NEUF et ne sait rien de la prise. On le lui
      // dit, avec les compteurs RELUS du stockage.
      return reprendreDansLeWorklet();
    }, function (err) {
      message('micro', 'error', 'Le micro n\'a pas pu être rouvert : ' + (err && err.message)
        + '. La prise reste en pause, et rien n\'est écrit.');
      throw err;
    });
  }

  // Redit au worklet où la prise en est, puis rouvre l'écriture. Les compteurs viennent du
  // STOCKAGE, relus morceau par morceau : après une reconstruction du graphe, c'est la seule
  // source qui n'ait pas pu mentir.
  function reprendreDansLeWorklet() {
    return relireLesCompteurs(_etat.priseId).then(function (vrai) {
      _etat.morceauxEcrits = vrai.nbMorceaux;
      _etat.echantillonsEcrits = vrai.nbEchantillons;
      _etat.indexDepart = vrai.prochainIndex;
      // LE DRAPEAU D'ACCUSÉ DE RÉCEPTION EST REMIS À FAUX AVANT D'ATTENDRE. Il est resté vrai
      // depuis le démarrage de la prise : sans cette remise, l'attente serait satisfaite
      // AUSSITÔT, par l'accusé du worklet PRÉCÉDENT — celui d'un contexte qu'on vient de fermer.
      // On croirait le nouveau worklet prêt alors qu'il n'a rien reçu.
      _etat.priseDemarreeRecue = false;
      _etat.noeud.port.postMessage({ type: 'demarrer-prise', canal: _etat.canalRetenu,
        indexDepart: vrai.prochainIndex, echantillonsDepart: vrai.nbEchantillons });
      return attendre(function () { return _etat.priseDemarreeRecue; }, 5000).then(function () {
        _etat.enPause = false;
        peindrePause();
        peindreEtats();
        journaliser('reprise après perte du micro', vrai.nbEchantillons,
          { morceaux: vrai.nbMorceaux, prochainIndex: vrai.prochainIndex });
        message('micro', 'info', 'Le micro a été rouvert et la prise continue à l\'échantillon '
          + vrai.nbEchantillons + '. Aucun zéro n\'a été écrit pendant la perte.');
        return 'reprise';
      });
    });
  }

  // LES COMPTEURS D'UNE PRISE, RELUS DANS LE STOCKAGE. Une seule fonction, employée par la
  // continuation, la reprise après perte et la fiche d'une prise inachevée : trois endroits qui
  // posaient la même question et auraient pu se répondre trois choses (#11(f)).
  function relireLesCompteurs(priseId) {
    var nb = 0, ech = 0, maxIndex = -1;
    return window.VoixStockage.parcourirMorceaux(_etat.db, priseId, function (m) {
      nb++;
      ech += m.pcm.byteLength / 2;
      if (m.index > maxIndex) maxIndex = m.index;
    }).then(function () {
      return { nbMorceaux: nb, nbEchantillons: ech, prochainIndex: maxIndex + 1 };
    });
  }

  // ── (E2, E10) LE COMPTE À REBOURS, JOUÉ AUX HAUT-PARLEURS ET JAMAIS ENREGISTRÉ ────────────
  //
  // E2 : « compte à rebours de 3 secondes (réglable) avant chaque prise, y compris les reprises ».
  // E10 : « Le compte à rebours (avec ses bips facultatifs) se joue aux haut-parleurs avant le
  // début de la prise, comme le pré-compte de Logic Pro, et ne s'enregistre JAMAIS dans la voix. »
  //
  // COMMENT « JAMAIS » EST GARANTI, et ce n'est pas une promesse : la prise ne DÉMARRE qu'après.
  // Pendant le rebours le worklet est en mode analyse — il mesure, il n'écrit pas —, donc aucun
  // échantillon du rebours ne peut entrer dans la voix. La GARDE de 0,5 s qui suit le dernier bip
  // existe pour la traîne : un bip a une décroissance, et les haut-parleurs du Mac la rendent
  // encore quelques dizaines de millisecondes après la fin de l'enveloppe. Démarrer sur le
  // dernier bip mettrait cette traîne dans les premiers échantillons.
  var GARDE_APRES_REBOURS_S = 0.5;

  function compteARebours() {
    var champ = q('[data-rebours-secondes]');
    var secondes = champ ? parseInt(champ.value, 10) : 3;
    if (!isFinite(secondes) || secondes < 0) secondes = 3;
    var avecBips = !!(q('[data-rebours-bips]') && q('[data-rebours-bips]').checked);
    var boite = q('[data-rebours]');
    var valeur = q('[data-rebours-valeur]');
    var libelle = q('[data-rebours-libelle]');
    if (secondes === 0) {
      journaliser('compte à rebours ignoré (0 s)', 0, null);
      return Promise.resolve({ secondes: 0, bips: 0, garde_s: 0, joue: false });
    }
    if (boite) boite.hidden = false;
    if (libelle) libelle.textContent = 'Compte à rebours';
    var joues = 0;
    var debut = (self.performance && performance.now()) || Date.now();

    function unePulsation(reste) {
      if (valeur) valeur.textContent = String(reste);
      if (avecBips && _etat.ctx && _etat.ctx.state === 'running') {
        // LE BIP VIENT DU CONTEXTE LUI-MÊME, vers sa destination — c'est-à-dire les
        // haut-parleurs. Il ne passe PAS par le worklet, qui n'a pas d'entrée depuis la
        // destination : il ne peut donc pas être capté autrement que par le micro, ce que E10
        // assume et que la garde limite.
        try {
          var o = _etat.ctx.createOscillator();
          var g = _etat.ctx.createGain();
          // Le dernier bip est plus haut : c'est le signal que ça commence, comme en studio.
          o.frequency.value = (reste === 1) ? 1320 : 880;
          o.type = 'sine';
          var t = _etat.ctx.currentTime;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.18, t + 0.01);
          g.gain.linearRampToValueAtTime(0, t + 0.12);
          o.connect(g); g.connect(_etat.ctx.destination);
          o.start(t); o.stop(t + 0.14);
          joues++;
        } catch (e) { /* un bip qui ne sort pas ne doit pas empêcher la prise */ }
      }
      // ── CHAQUE SECONDE DURE UNE SECONDE, Y COMPRIS LA DERNIÈRE ────────────────────────
      // Défaut trouvé par §42 : la dernière pulsation passait directement à la garde, si bien
      // qu'un rebours de deux secondes ne durait qu'une seconde et demie — mesuré 1 565 ms. Un
      // « compte à rebours de 3 secondes » (E2) doit prendre trois secondes : on attend donc
      // après CHAQUE pulsation, la dernière comprise, et la garde vient après.
      if (reste <= 1) {
        return attendreMs(1000).then(function () { return finirLeRebours(); });
      }
      return attendreMs(1000).then(function () { return unePulsation(reste - 1); });
    }

    function finirLeRebours() {
        // LA GARDE : on attend la traîne du dernier bip avant de rendre la main.
        if (libelle) libelle.textContent = 'Garde avant la prise';
        if (valeur) valeur.textContent = GARDE_APRES_REBOURS_S.toFixed(1).replace('.', ',');
        return attendreMs(GARDE_APRES_REBOURS_S * 1000).then(function () {
          if (boite) boite.hidden = true;
          var ecoule = (((self.performance && performance.now()) || Date.now()) - debut) / 1000;
          // LE REBOURS N'ÉCRIT PAS LUI-MÊME AU JOURNAL. Il PRÉCÈDE la prise, dont le journal est
          // remis à neuf au démarrage : une entrée écrite ici serait effacée une seconde plus
          // tard. C'est `demarrer` qui la consigne, dans le journal de la prise qu'elle ouvre, à
          // l'échantillon zéro — trouvé par le contrôle §42, qui ne la retrouvait pas.
          return { secondes: secondes, bips: joues, garde_s: GARDE_APRES_REBOURS_S, joue: true,
                   ecoule_s: +ecoule.toFixed(3),
                   regle: 'joué AVANT le démarrage de la prise : le worklet est en mode analyse, '
                     + 'il mesure et n\'écrit pas, donc aucun échantillon du rebours ne peut '
                     + 'entrer dans la voix (E10). La garde laisse passer la traîne du dernier '
                     + 'bip.' };
        });
    }
    return unePulsation(secondes);
  }

  // Une attente simple, nommée : `setTimeout` enveloppé une fois plutôt que dix.
  function attendreMs(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  // ── (E10, R7) JOUER L'AMORCE, ET S'ARRÊTER EXACTEMENT À LA FIN DE LA ZONE ────────────────
  //
  // E10 : « la piste armée enregistre pendant que la voix qui précède joue aux haut-parleurs et
  // où Christophe enchaîne à la fin de l'amorce ». Tout tient dans « à la fin » : si la lecture
  // continue au-delà de la zone, Christophe entend la suite de l'ANCIENNE prise par-dessus sa
  // propre voix, et les haut-parleurs la mettent dans la nouvelle. Une demi-seconde de trop
  // suffit à rendre la reprise inutilisable.
  //
  // UNE SEULE BORNE, ET C'EST LA DURÉE PASSÉE À `start`. J'avais d'abord programmé en plus un
  // `stop` à la même date d'horloge audio, en me disant « ceinture et bretelles ». Le falsifieur
  // a montré que c'était faux dans les deux sens : avec les deux mécanismes, retirer l'un
  // laissait §44 passer, et retirer l'autre aussi. Deux garanties pour une seule grandeur, c'est
  // #11(f) — et la conséquence n'est pas théorique : aucune des deux n'était éprouvée, et le
  // jour où l'une se serait cassée, rien ne l'aurait dit. Il n'en reste donc qu'une, et §44 la
  // falsifie, sur une source volontairement plus longue que la zone et dont la suite porte une
  // autre amplitude.
  //
  // ARRÊTER AVANT LA FIN est un AUTRE besoin, pas une seconde borne : si Christophe arrête la
  // prise pendant l'amorce, la lecture doit se taire. C'est `arreter` qui le demande, sur le
  // nœud que cette fonction rend, et le journal le consigne.
  //
  // LES DEUX DATES SONT SUR L'HORLOGE AUDIO (`ctx.currentTime`), jamais sur celle de
  // l'interface : c'est la même raison qu'en R6, et la seule façon que le début de
  // l'enregistrement et le début de la lecture tombent ensemble en mode doublage.
  function _lireLAmorce(ctx, pcm, hz, options) {
    var o = options || {};
    var echantillons = new Int16Array(pcm);
    var hzSource = (typeof hz === 'number' && hz > 0) ? hz : (ctx.sampleRate || 48000);
    var debut = Math.max(0, Math.round(o.debutEchantillon || 0));
    var finDemandee = (typeof o.finEchantillon === 'number')
      ? Math.round(o.finEchantillon) : echantillons.length;
    var fin = Math.max(debut, Math.min(echantillons.length, finDemandee));
    var n = fin - debut;

    // Le tampon porte la prise source TELLE QUELLE, à sa propre fréquence : si le périphérique
    // est à une autre, c'est le navigateur qui rééchantillonne à la lecture, et la durée en
    // secondes reste celle de la zone. Recopier seulement la zone aurait marché aussi, mais
    // aurait caché ce que §44 doit pouvoir éprouver : qu'on ne joue PAS ce qui suit.
    var tampon = ctx.createBuffer(1, Math.max(1, echantillons.length), hzSource);
    var canal = tampon.getChannelData(0);
    for (var i = 0; i < echantillons.length; i++) canal[i] = echantillons[i] / 32768;

    var noeud = ctx.createBufferSource();
    noeud.buffer = tampon;
    noeud.connect(ctx.destination);
    var duree_s = n / hzSource;
    var t0 = (typeof o.debut_s === 'number') ? o.debut_s : ctx.currentTime;
    noeud.start(t0, debut / hzSource, duree_s);

    return {
      debutEchantillon: debut,
      finEchantillon: fin,
      echantillons: n,
      duree_s: +duree_s.toFixed(6),
      commenceA_horlogeAudio_s: +t0.toFixed(6),
      finitA_horlogeAudio_s: +(t0 + duree_s).toFixed(6),
      echantillonnageDeLaSource: hzSource,
      echantillonnageDuContexte: ctx.sampleRate,
      // (point 4) LA LATENCE DE SORTIE, LUE PAR L'API QUAND ELLE EXISTE. Safari ne déclare ni
      // `outputLatency` ni `baseLatency` : on dit alors qu'on ne la connaît pas, plutôt que
      // d'écrire un zéro qui passerait pour une mesure.
      latenceDeSortie_s: (typeof ctx.outputLatency === 'number') ? ctx.outputLatency
        : ((typeof ctx.baseLatency === 'number') ? ctx.baseLatency : null),
      sourceDeLaLatence: (typeof ctx.outputLatency === 'number') ? 'AudioContext.outputLatency'
        : ((typeof ctx.baseLatency === 'number') ? 'AudioContext.baseLatency'
          : 'aucune : ce moteur ne déclare ni outputLatency ni baseLatency'),
      noeud: noeud,
      regle: 'une seule borne : la DURÉE passée à start, qui borne ce qui est lu dans le '
        + 'tampon. La lecture ne dépasse donc pas la zone, et ce qui suit l\'amorce dans la '
        + 'prise source n\'est jamais entendu (E10). Un arrêt de la prise pendant l\'amorce '
        + 'coupe la lecture par le nœud, et le journal le dit.',
    };
  }

  // CE QU'ON GARDE DE LA LECTURE, ET CE QU'ON NE GARDE PAS. Le descripteur de l'amorce est
  // écrit DANS la prise (IndexedDB) et dans le rapport : il doit donc être fait de nombres et de
  // phrases, rien d'autre. Le nœud audio, lui, n'est utile qu'au moment de la lecture et ne se
  // sérialise pas — « AudioBufferSourceNode object could not be cloned », trouvé par §48b, qui a
  // fait échouer l'écriture de la prise sans que §48 s'en aperçoive : ses assertions lisaient
  // l'état en mémoire, pas le stockage. §48 relit maintenant la prise écrite.
  function sansLeNoeud(lue) {
    if (!lue) return lue;
    var copie = {};
    Object.keys(lue).forEach(function (k) { if (k !== 'noeud') copie[k] = lue[k]; });
    return copie;
  }

  // ── LIRE UNE PLAGE D'ÉCHANTILLONS DANS UNE PRISE DÉJÀ ÉCRITE ──────────────────────────────
  //
  // LES POSITIONS VIENNENT DES MORCEAUX EUX-MÊMES (`debutEchantillon`), jamais d'un cumul : une
  // prise continuée a des morceaux dont les positions se suivent sans que l'ordre de lecture du
  // curseur ait à le garantir, et un cumul se décalerait d'un morceau partiel.
  function lirePcmDUnePlage(priseId, debut, fin) {
    var d = Math.max(0, Math.round(debut));
    var f = Math.max(d, Math.round(fin));
    var sortie = new Int16Array(f - d);
    var lus = 0, totalVu = 0, trous = 0;
    var couvert = new Uint8Array(f - d);
    return window.VoixStockage.parcourirMorceaux(_etat.db, priseId, function (m) {
      var n = m.pcm.byteLength / 2;
      var d0 = m.debutEchantillon, f0 = d0 + n;
      if (f0 > totalVu) totalVu = f0;
      var a = Math.max(d, d0), b = Math.min(f, f0);
      if (b > a) {
        var vue = new Int16Array(m.pcm, (a - d0) * 2, b - a);
        sortie.set(vue, a - d);
        for (var i = a - d; i < b - d; i++) couvert[i] = 1;
        lus += (b - a);
      }
    }).then(function () {
      for (var i = 0; i < couvert.length; i++) if (!couvert[i]) trous++;
      return {
        pcm: sortie,
        echantillonsLus: lus,
        echantillonsNonCouverts: trous,
        echantillonsDeLaPrise: totalVu,
        regle: trous === 0 ? 'plage entièrement couverte par des morceaux écrits'
          : trous + ' échantillons de la plage ne sont couverts par aucun morceau : ils restent '
            + 'à zéro et le nombre est dit, plutôt que de faire passer un trou pour du silence.',
      };
    });
  }

  // ── (E13) L'EMPREINTE DE CHAQUE MODULE SERVI ──────────────────────────────────────────────
  //
  // E13 : « la page du banc et le rapport de mesures portent l'empreinte courte (8 hexadécimaux)
  // du contenu de chaque module servi, pour savoir quelle version a produit une prise ; un
  // rapport sans empreinte n'est pas une preuve. »
  //
  // L'empreinte est calculée sur le CONTENU SERVI, relu par le réseau, et non sur une version
  // écrite à la main dans le code : une constante de version se périme en silence, un condensat
  // du contenu ne peut pas. Un contrôle compare ces empreintes à celles des fichiers du dépôt,
  // ce qui prouve que la page a exécuté le code qu'on croit.
  function empreintesDesModules(noms) {
    var liste = noms || [];
    if (!self.crypto || !self.crypto.subtle) {
      return Promise.resolve({ disponible: false,
        raison: 'crypto.subtle absent : hors contexte sécurisé, aucune empreinte calculable' });
    }
    return Promise.all(liste.map(function (nom) {
      return fetch(nom, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error(nom + ' : ' + r.status);
        return r.arrayBuffer();
      }).then(function (octets) {
        return crypto.subtle.digest('SHA-256', octets).then(function (h) {
          var hex = Array.prototype.map.call(new Uint8Array(h), function (b) {
            return ('0' + b.toString(16)).slice(-2);
          }).join('');
          return { module: nom, octets: octets.byteLength, courte: hex.slice(0, 8), entiere: hex };
        });
      }, function (e) {
        return { module: nom, erreur: String(e && e.message) };
      });
    })).then(function (lues) {
      var par = {};
      lues.forEach(function (x) { par[x.module] = x.courte || ('erreur : ' + x.erreur); });
      return {
        disponible: true,
        modules: lues,
        parModule: par,
        regle: 'SHA-256 du CONTENU SERVI, relu par le réseau sans cache, tronqué à 8 '
          + 'hexadécimaux (E13). Une constante de version écrite à la main se périme en '
          + 'silence ; un condensat du contenu ne peut pas.',
      };
    });
  }

  // ── (R6) LA BANDE : SA POSITION VIENT DE L'HORLOGE AUDIO, ET DE RIEN D'AUTRE ───────────────
  //
  // Cette fonction est appelée depuis `peindreReleve`, c'est-à-dire à chaque relevé du worklet —
  // une vingtaine de fois par seconde. Elle ne lit AUCUNE horloge d'interface : elle passe à
  // `BandeRythmo.positionDeLaBande` l'indice d'échantillon et la fréquence, et peint ce qui en
  // sort. En pause, l'indice ne bouge pas, donc la bande ne bouge pas (R6, E12).
  function peindreBande() {
    if (!window.BandeRythmo) return;
    var pos = window.BandeRythmo.positionDeLaBande(
      echantillonsCourants(), _etat.echantillonnage, _etat.passages, _etat.vitesseBande,
      { decalage_s: _etat.decalageBande_s });
    _etat.bande = pos;
    var hote = q('[data-bande]');
    if (hote) hote.hidden = _etat.passages.length === 0;
    var courant = q('[data-bande-courant]');
    if (courant) courant.textContent = pos.passageAffiche || '';
    var suivant = q('[data-bande-suivant]');
    if (suivant) suivant.textContent = pos.passageSuivant || '';
    var meta = q('[data-bande-passage]');
    if (meta) {
      meta.textContent = _etat.passages.length
        ? 'Passage ' + (pos.passageCourant + 1) + ' sur ' + _etat.passages.length
          + ' · ' + (pos.partDuPassage * 100).toFixed(0) + ' %'
        : 'Passage —';
    }
    var vit = q('[data-bande-vitesse]');
    if (vit) {
      // (R5) LA VITESSE EN MOTS PAR SECONDE, à côté du texte : c'est la grandeur que R5 demande
      // d'afficher par passage, et celle dont R6 fixe le défaut à 2,5.
      vit.textContent = pos.vitesseMotsParSeconde.toFixed(1).replace('.', ',') + ' mots/s';
    }
    return pos;
  }

  // Le texte collé devient des passages. Appelé à chaque frappe : le découpage est pur et ne
  // coûte rien, et Christophe voit son texte se découper en direct.
  function relireLeTexte() {
    if (!window.BandeRythmo) return;
    var champ = q('[data-texte-bande]');
    var texte = champ ? champ.value : '';
    _etat.passages = window.BandeRythmo.decouperEnPassages(texte);
    var douteuses = window.BandeRythmo.marquesDouteuses(texte);
    if (douteuses.length) {
      // (R8) UNE MARQUE QU'ON CROIT COMPRISE ET QU'ON IGNORE est un silence qui manquera dans la
      // voix sans que personne l'ait voulu. On la DIT au lieu de la deviner.
      message('marques', 'warning', 'Ces marques ressemblent à une pause sans en être une et '
        + 'seront LUES à voix haute : ' + douteuses.join(' ') + '. Les formes reconnues sont '
        + '« [pause] » et « [pause 2 s] ».');
    } else {
      message('marques', '', null);
    }
    peindreBande();
    peindreChoixDeReprise(null);
    peindreVitesses();
  }

  // ── (E4, E9, T14) POSER UN REPÈRE ─────────────────────────────────────────────────────────
  //
  // Un repère est la FRONTIÈRE entre deux commentaires (T14), daté dans le fil audio et jamais
  // avec l'horloge de l'interface — même raison qu'en R6, et même conséquence : un repère daté
  // sur l'horloge du mur tomberait à côté dès que l'audio et l'écran se séparent.
  //
  // E9 demande deux gardes, et il faut les deux : `event.repeat` pour la touche MAINTENUE, et un
  // délai pour le rebond. Le lot 0 a vu quatre repères en 0,3 s.
  //
  // (R6) UNE POSITION PEUT ÊTRE IMPOSÉE, et c'est par là que passent les marqueurs théoriques.
  // Ils empruntent CE chemin — antirebond compris, journal compris, peinture comprise — pour
  // qu'un marqueur théorique soit « un repère comme les autres », comme R6 le demande. Une
  // seconde fonction qui les aurait poussés dans la liste les aurait rendus différents par
  // construction : non soumis à l'antirebond, absents du journal, et invisibles aux contrôles
  // de T6.
  function poserUnRepere(source, positionImposee, propres) {
    if (!_etat.enPrise) {
      message('repere', 'warning', 'Aucune prise en cours : un repère est une frontière DANS la '
        + 'voix, il n\'a pas de sens hors d\'une prise.');
      return null;
    }
    var impose = (typeof positionImposee === 'number');
    var ech = impose ? Math.max(0, Math.round(positionImposee)) : echantillonsCourants();
    // ── L'ANTIREBOND GARDE LE GESTE, ET UN SEUL GARDE SUFFIT ────────────────────────────
    // E9 existe contre une TOUCHE qui rebondit — « quatre repères en 0,3 s » au lot 0. Une
    // position imposée ne vient pas d'une touche : elle vient de la bande (R6). Le garde est
    // donc UNIQUE et il est plus bas : `dernierRepere` ne suit que les GESTES. L'antirebond
    // tourne pour tout le monde, mais une position imposée se compare à la dernière position
    // de GESTE, et il n'y en a aucune quand les marqueurs théoriques sont posés (le démarrage
    // vient de les remettre à zéro).
    //
    // J'avais d'abord écrit DEUX gardes — celui-ci et une exception qui sautait l'antirebond
    // pour une position imposée. Le falsifieur a montré que la seconde ne servait à rien : la
    // retirer ne faisait échouer aucun contrôle, parce que le premier garde suffit. Deux gardes
    // dont un inerte, c'est #11(f), et c'est surtout un garde dont personne ne verrait la
    // disparition.
    //
    // CE QUE LE GARDE ÉVITE, concrètement : les marqueurs théoriques étant posés d'un coup,
    // `dernierRepere` sauterait à la fin du texte, et le premier repère posé À LA MAIN pendant
    // la prise serait déclaré DOUTEUX pour un écart négatif.
    var verdict = window.BandeRythmo.antirebond(_etat.dernierRepere, ech,
      _etat.echantillonnage, window.BandeRythmo.ANTIREBOND_MS_DEFAUT);
    if (!verdict.accepte) {
      // E9 : « signalés AVANT validation ». On ne jette donc pas : on le pose en le marquant
      // douteux, et l'opérateur voit lequel. Le jeter en silence perdrait une frontière voulue.
      _etat.reperes.push({ aEchantillon: ech, passage: _etat.bande ? _etat.bande.passageCourant : 0,
        source: source, douteux: true, raison: verdict.raison, ecart: verdict.ecart });
      journaliser('repère douteux', ech, { raison: verdict.raison, ecart: verdict.ecart,
        source: source });
      message('repere', 'warning', 'Deux repères très rapprochés : ' + verdict.raison
        + '. Il est posé et SIGNALÉ, pas jeté — à vous de le garder ou de le retirer.');
      peindreReperes();
      return _etat.reperes[_etat.reperes.length - 1];
    }
    if (!impose) _etat.dernierRepere = ech;
    var r = { aEchantillon: ech, passage: _etat.bande ? _etat.bande.passageCourant : 0,
              source: source, douteux: false };
    if (propres) Object.keys(propres).forEach(function (k) { r[k] = propres[k]; });
    _etat.reperes.push(r);
    journaliser('repère posé', ech, { passage: r.passage, source: source,
      regle: 'daté dans le fil audio, en échantillons ; jamais avec l\'horloge de l\'interface' });
    message('repere', '', null);
    peindreReperes();
    return r;
  }

  // ── (R6) AJUSTER UN REPÈRE APRÈS COUP ────────────────────────────────────────────────────
  //
  // R6 : les marqueurs théoriques sont « à ajuster ensuite ». Ajuster veut dire deux gestes, et
  // ils valent pour TOUS les repères, théoriques ou posés à la main : déplacer de cent
  // millisecondes, et retirer. Un marqueur qu'on ne peut pas bouger n'est pas « à ajuster », et
  // deux jeux de gestes selon l'origine du repère feraient deux espèces de repères.
  var PAS_DE_RECALAGE_MS = 100;

  function recalerUnRepere(k, pas_ms) {
    var r = _etat.reperes[k];
    if (!r) return null;
    var hz = _etat.echantillonnage || 48000;
    var avant = r.aEchantillon;
    r.aEchantillon = Math.max(0, Math.round(avant + (pas_ms / 1000) * hz));
    r.ajuste = true;
    journaliser('repère recalé', r.aEchantillon, { rang: k, de_echantillons: avant,
      pas_ms: pas_ms, origine: r.source,
      regle: 'un repère se déplace en échantillons : le pas en millisecondes est converti à la '
        + 'fréquence de la prise, jamais appliqué à une position de l\'horloge de l\'interface.' });
    peindreReperes();
    peindreVitesses();
    return r;
  }

  function retirerUnRepere(k) {
    var r = _etat.reperes[k];
    if (!r) return null;
    _etat.reperes.splice(k, 1);
    // L'antirebond compare au DERNIER repère posé : si c'était celui-là, il faut le reprendre
    // sur le plus tardif de ceux qui restent, sinon le prochain serait comparé à un fantôme.
    // Recalculé sur les repères de GESTE seulement, pour la raison dite dans `poserUnRepere`.
    var gestes = _etat.reperes.filter(function (x) { return !x.theorique; });
    _etat.dernierRepere = gestes.length
      ? gestes.reduce(function (m, x) { return Math.max(m, x.aEchantillon); }, 0) : null;
    journaliser('repère retiré', r.aEchantillon, { rang: k, origine: r.source,
      restants: _etat.reperes.length });
    peindreReperes();
    peindreVitesses();
    return r;
  }

  // ── (R5) LA VITESSE DE CHAQUE PASSAGE, AFFICHÉE APRÈS LA PRISE ────────────────────────────
  function vitessesMaintenant() {
    if (!window.BandeRythmo) return null;
    var seuil = parseFloat((q('[data-seuil-vitesse]') || {}).value);
    return window.BandeRythmo.vitessesParPassage({
      passages: _etat.passages,
      reperes: _etat.reperes,
      dureeVoix_echantillons: _etat.echantillonsEcrits,
      echantillonnage: _etat.echantillonnage || _etat.frequenceDeLaPrise || 48000,
      vitesseChoisie: _etat.vitesseBande,
      seuil_pourCent: isFinite(seuil) && seuil > 0 ? seuil : undefined,
    });
  }

  function peindreVitesses() {
    var hote = q('[data-vitesses]');
    if (!hote) return null;
    var v = vitessesMaintenant();
    if (!v || !_etat.passages.length) { hote.innerHTML = ''; hote.hidden = true; return v; }
    hote.hidden = false;
    hote.innerHTML = '';
    if (!v.mesurable) {
      var seul = document.createElement('span');
      seul.className = 'sc-bm-retake-status';
      seul.setAttribute('data-state', 'warning');
      seul.textContent = v.raison;
      hote.appendChild(seul);
      message('vitesses', '', null);
      return v;
    }
    v.passages.forEach(function (x) {
      var el = document.createElement('span');
      el.className = 'sc-bm-retake-status';
      el.setAttribute('data-vitesse-passage', String(x.passage));
      if (x.alerte) el.setAttribute('data-state', 'error');
      el.textContent = 'Passage ' + (x.passage + 1) + ' · '
        + (x.motsParSeconde === null ? '—'
           : x.motsParSeconde.toFixed(2).replace('.', ',') + ' mots/s')
        + ' · ' + x.duree_s.toFixed(2).replace('.', ',') + ' s'
        + (x.ecart_pourCent === null ? ''
           : ' · ' + (x.ecart_pourCent > 0 ? '+' : '')
             + x.ecart_pourCent.toFixed(1).replace('.', ',') + ' %')
        + ' · ' + x.etat;
      el.title = x.raison;
      hote.appendChild(el);
    });
    if (v.nbAlertes) {
      message('vitesses', 'warning', v.nbAlertes + ' passage(s) s\'écartent de plus de '
        + v.seuil_pourCent + ' % de la vitesse choisie (' + v.vitesseChoisie + ' mots/s) : '
        + v.passages.filter(function (x) { return x.alerte; }).map(function (x) {
            return 'passage ' + (x.passage + 1) + ' ' + x.etat + ' ('
              + x.motsParSeconde.toFixed(2).replace('.', ',') + ' mots/s)';
          }).join(', ') + '. Le seuil est réglable ; en dessous de '
        + v.dureeMinSignificative_s.toFixed(2).replace('.', ',') + ' s un passage est affiché '
        + 'sans alerte, parce que l\'incertitude des deux repères y atteint le seuil.');
    } else {
      message('vitesses', '', null);
    }
    return v;
  }

  // (R6) « retour d'un passage » : la bande recule, l'horloge audio NON — on ne peut pas défaire
  // des échantillons écrits. Le décalage est une grandeur de la bande, et le rapport le dit.
  function passagePrecedent() {
    if (!window.BandeRythmo || !_etat.passages.length) return;
    var pos = _etat.bande || peindreBande();
    var cible = Math.max(0, pos.passageCourant - 1);
    var jusqua = 0;
    for (var i = 0; i < cible; i++) {
      jusqua += window.BandeRythmo.dureeDUnPassage(_etat.passages[i], _etat.vitesseBande);
    }
    _etat.decalageBande_s = pos.secondes - jusqua;
    journaliser('retour au passage ' + (cible + 1), echantillonsCourants(),
      { decalageBande_s: +_etat.decalageBande_s.toFixed(3),
        regle: 'la bande recule, l\'horloge audio non : on ne défait pas des échantillons écrits. '
          + 'Le décalage est une grandeur de la BANDE (R6).' });
    peindreBande();
  }

  // Le nom d'une touche tel qu'un humain le lit. Écrit une fois : il sert au champ, au journal
  // et aux avis, et trois traductions différentes du même `event.key` seraient trois vérités.
  function nomDeTouche(k) {
    if (k === ' ') return 'Espace';
    if (k === 'ArrowRight') return 'Flèche droite';
    if (k === 'ArrowLeft') return 'Flèche gauche';
    if (k === 'PageDown') return 'Page suivante';
    if (k === 'PageUp') return 'Page précédente';
    return k;
  }

  // ── (T3 ter) LE RELEVÉ DES TOUCHES, ET CE QU'IL NE DIT JAMAIS ────────────────────────────
  //
  // POURQUOI CE RELEVÉ EXISTE. La prise de 52 secondes du 17 octobre porte DEUX repères pour SIX
  // passages, et rien au journal n'expliquait les quatre manquants : une touche refusée avant
  // d'atteindre le module ne laissait aucune trace. §49 a montré la cause (le curseur dans la
  // zone de texte), mais la mesure doit rester, parce que Safari n'est pas Chromium et que la
  // prochaine touche perdue aura peut-être une autre cause.
  //
  // CE QU'IL NE CONSIGNE JAMAIS : le contenu d'une touche de texte. Le vocabulaire est FERMÉ —
  // flèche droite, flèche gauche, Page suivante, Page précédente, Espace, touche apprise — et
  // tout le reste est « autre touche », sans sa valeur. Christophe tape le texte de ses
  // présentations dans cette page : un journal qui noterait `ev.key` serait un enregistreur de
  // frappe, et ce journal part dans un rapport.
  var VOCABULAIRE_DES_TOUCHES = {
    ArrowRight: 'flèche droite', ArrowLeft: 'flèche gauche',
    PageDown: 'Page suivante', PageUp: 'Page précédente', ' ': 'Espace',
  };

  function libelleDeTouche(ev, role) {
    if (VOCABULAIRE_DES_TOUCHES[ev.key]) return VOCABULAIRE_DES_TOUCHES[ev.key];
    if (role !== 'autre') return 'touche apprise';
    return 'autre touche (non journalisée)';
  }

  // UNE SEULE FONCTION DIT LE RÔLE D'UNE TOUCHE, et c'est elle qui sert à la décision ET au
  // relevé : deux lectures séparées auraient pu dire deux choses de la même frappe (#11(f)).
  function roleDeLaTouche(ev) {
    if (_etat.apprendLaTouche) return 'apprentissage-pause';
    if (_etat.apprendLaToucheRepere) return 'apprentissage-repere';
    if (ev.key === _etat.toucheRepere || ev.key === 'PageDown') return 'repere';
    if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') return 'passage-precedent';
    if (ev.key === _etat.toucheBascule) return 'pause';
    return 'autre';
  }

  function compteursDeTouches() {
    if (!_etat.touches) {
      _etat.touches = { recues: 0, acceptees: 0, refusees: 0, parRaison: {} };
    }
    return _etat.touches;
  }

  function journaliserLaTouche(ev, role, accepte, raison) {
    var c = compteursDeTouches();
    c.recues++;
    if (accepte) c.acceptees++;
    else {
      c.refusees++;
      c.parRaison[raison] = (c.parRaison[raison] || 0) + 1;
    }
    var cible = ev.target;
    journaliser('touche ' + (accepte ? 'acceptée' : 'refusée'), echantillonsCourants(), {
      touche: libelleDeTouche(ev, role),
      toucheApprise: !VOCABULAIRE_DES_TOUCHES[ev.key] && role !== 'autre',
      role: role,
      elementFocalise: (cible && cible.tagName) ? cible.tagName : 'aucun',
      repetitionAutomatique: !!ev.repeat,
      accepte: accepte,
      raison: raison,
      regle: 'le contenu d\'une touche de texte n\'est JAMAIS consigné : le vocabulaire est '
        + 'fermé (flèche droite, flèche gauche, Page suivante, Page précédente, Espace, touche '
        + 'apprise), et tout le reste est « autre touche » sans sa valeur.',
    });
  }

  function peindreReperes() {
    var hote = q('[data-reperes]');
    if (!hote) return;
    hote.innerHTML = '';
    _etat.reperes.forEach(function (r, k) {
      var el = document.createElement('span');
      el.className = 'sc-bm-marker';
      el.setAttribute('data-repere', String(k));
      if (r.douteux) el.setAttribute('data-state', 'error');
      el.textContent = (k + 1) + ' · ' + fmtTemps(r.aEchantillon, _etat.echantillonnage)
        + ' · passage ' + (r.passage + 1) + (r.theorique ? ' · théorique' : '')
        + (r.ajuste ? ' · ajusté' : '') + (r.douteux ? ' · DOUTEUX' : '');
      // (R6) « À AJUSTER ENSUITE » : reculer, avancer, retirer. Les mêmes trois gestes pour
      // tous les repères, qu'ils viennent de la bande ou de la main.
      ['-', '+', '\u00d7'].forEach(function (signe, rang) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'sc-bm-button sc-bm-button--secondary';
        b.textContent = signe;
        if (rang === 2) {
          b.setAttribute('data-repere-retirer', String(k));
          b.setAttribute('aria-label', 'Retirer le repère ' + (k + 1));
        } else {
          b.setAttribute('data-repere-recaler', String(k));
          b.setAttribute('data-pas-ms', String(rang === 0 ? -PAS_DE_RECALAGE_MS : PAS_DE_RECALAGE_MS));
          b.setAttribute('aria-label', (rang === 0 ? 'Reculer' : 'Avancer') + ' le repère '
            + (k + 1) + ' de ' + PAS_DE_RECALAGE_MS + ' millisecondes');
        }
        el.appendChild(b);
      });
      hote.appendChild(el);
    });
  }

  // ── (E10, R7, point 4) REFAIRE UN PASSAGE ────────────────────────────────────────────────
  //
  // R7 : « Refaire un passage relit les dernières secondes de la voix qui précède (cinq par
  // défaut, réglable, ou tout le bout), puis enregistre la nouvelle prise du passage : c'est une
  // prise SÉPARÉE, liée au passage, et l'ancienne reste. » T10 : « rien n'est écrasé : une
  // reprise crée une prise de plus. »
  //
  // DEUX MODES, ET LA DIFFÉRENCE EST PHYSIQUE, PAS COSMÉTIQUE (E10) :
  //   — DOUBLAGE (par défaut) : la lecture et l'enregistrement démarrent ENSEMBLE. La fuite des
  //     haut-parleurs est donc DANS la prise, sur les premiers échantillons ; la zone est
  //     marquée pour que le montage la coupe. C'est le mode qui permet d'enchaîner dans le
  //     rythme, et c'est pour cela qu'il est le défaut.
  //   — AMORCE PUIS SILENCE : la lecture se termine, un silence de garde passe (une seconde par
  //     défaut, réglable), PUIS l'enregistrement commence. Rien de l'amorce n'est écrit, et la
  //     zone est vide — mais on a perdu l'enchaînement.
  //
  // L'ORDRE EST CHOISI, ET MESURÉ. En doublage, on démarre la prise D'ABORD et on programme la
  // lecture à l'instant où la prise a commencé : `demarrer` attend l'accusé de réception du
  // worklet, donc à son retour les échantillons tombent déjà. L'écart entre l'instant de la
  // lecture et celui du premier échantillon est alors MESURÉ sur l'horloge audio et écrit dans
  // la zone — plutôt qu'annoncé à zéro, ce qu'aucune des deux horloges ne garantirait.
  var MARGE_DOUBLAGE_S = 0;

  function debutDuPassageSurLaBande_s(index) {
    var t = 0;
    for (var i = 0; i < index && i < _etat.passages.length; i++) {
      t += window.BandeRythmo.dureeDUnPassage(_etat.passages[i], _etat.vitesseBande);
    }
    return t;
  }

  // LA POSITION DU PASSAGE DANS LA PRISE SOURCE VIENT DES MÊMES BORNES QUE LES VITESSES (R5) :
  // une seconde façon de découper la prise en passages aurait pu donner deux positions
  // différentes pour la même frontière (#11(f)).
  function positionDuPassageDansLaSource(prise, index) {
    var v = window.BandeRythmo.vitessesParPassage({
      passages: _etat.passages,
      reperes: (prise.mesures && prise.mesures.reperes) || [],
      dureeVoix_echantillons: prise.nbEchantillons || 0,
      echantillonnage: prise.echantillonnage || 48000,
      vitesseChoisie: _etat.vitesseBande,
    });
    if (!v.mesurable) return { position: null, raison: v.raison };
    return { position: v.bornesEnEchantillons[index],
             bornes: v.bornesEnEchantillons, raison: v.raisonDesBornes };
  }

  function refaireLePassage() {
    if (_etat.enPrise) {
      message('reprise', 'warning', 'Une prise est en cours : arrêtez-la avant de refaire un '
        + 'passage. Une reprise est une prise SÉPARÉE (R7, T10), pas une continuation.');
      return Promise.resolve(null);
    }
    if (!_etat.noeud) {
      message('reprise', 'warning', 'Micro non autorisé : il n\'y a rien à enregistrer.');
      return Promise.resolve(null);
    }
    if (!window.BandeRythmo || !_etat.passages.length) {
      message('reprise', 'warning', 'Aucun texte de bande : sans passages, « refaire ce '
        + 'passage » ne désigne rien.');
      return Promise.resolve(null);
    }
    var index = parseInt((q('[data-reprise-passage]') || {}).value, 10);
    if (!isFinite(index) || index < 0 || index >= _etat.passages.length) index = 0;
    var sourceId = ((q('[data-reprise-source]') || {}).value) || '';
    var mode = ((q('[data-reprise-mode]') || {}).value) === 'amorce-puis-silence'
      ? 'amorce-puis-silence' : 'doublage';
    var secondes = parseFloat((q('[data-reprise-amorce]') || {}).value);
    if (!isFinite(secondes) || secondes <= 0) secondes = 5;
    var garde_s = parseFloat((q('[data-reprise-garde]') || {}).value);
    if (!isFinite(garde_s) || garde_s < 0) garde_s = 1;
    var tout = !!((q('[data-reprise-tout]') || {}).checked);
    var notice = q('[data-reprise-notice]');
    var etatBoite = q('[data-reprise-etat]');
    function dire(texte) { if (etatBoite) etatBoite.textContent = texte; }
    function avertir(texte) {
      if (!notice) return;
      notice.hidden = !texte;
      notice.textContent = texte || '';
    }
    avertir('');
    dire('Préparation de la reprise du passage ' + (index + 1) + '…');

    var lire = sourceId
      ? window.VoixStockage.lirePrise(_etat.db, sourceId)
      : Promise.resolve(null);

    return lire.then(function (prise) {
      var hzSource = (prise && prise.echantillonnage) || _etat.echantillonnage || 48000;
      var dispo = (prise && prise.nbEchantillons) || 0;
      var pos = prise ? positionDuPassageDansLaSource(prise, index) : { position: null,
        raison: 'aucune prise source choisie : il n\'y a pas de voix qui précède à relire.' };
      // ── UN PASSAGE SANS PRISE SOURCE (complément du prompt) ─────────────────────────────
      // Trois cas tombent ici : aucune prise choisie, une prise dont les repères ne permettent
      // pas de situer le passage, et un passage qui commence à l'échantillon zéro (rien ne le
      // précède). Dans les trois, on refait quand même le passage — c'est ce que Christophe
      // demande — mais SANS amorce, et la raison est écrite à l'écran et dans la prise. Jouer
      // une amorce prise ailleurs serait pire que pas d'amorce.
      var sansAmorce = (pos.position === null) || (pos.position === 0) || !prise;
      var zone = window.BandeRythmo.zoneDAmorce({
        echantillonnage: hzSource,
        secondes: secondes,
        tout: tout,
        mode: mode,
        garde_s: garde_s,
        echantillonsDeLaSource: dispo,
        positionDansLaSource: sansAmorce ? 0 : pos.position,
        priseSource: sourceId || null,
      });
      zone.passage = index;
      zone.raisonDesBornes = pos.raison;
      if (sansAmorce) {
        zone.sansAmorce = true;
        zone.raisonSansAmorce = !prise
          ? 'aucune prise source choisie : rien à relire avant le passage.'
          : (pos.position === 0
            ? 'ce passage commence au premier échantillon de la prise source : aucune voix ne le '
              + 'précède, donc aucune amorce n\'est possible.'
            : 'le passage n\'a pas pu être situé dans la prise source — ' + pos.raison);
        avertir('Reprise SANS amorce : ' + zone.raisonSansAmorce + ' La prise est enregistrée '
          + 'quand même, et le rapport le dit.');
      } else if (zone.tronquee) {
        avertir('Amorce raccourcie : ' + zone.raisonDeLaTroncature + '.');
      }

      var plage = (zone.echantillonsJoues > 0 && sourceId)
        ? lirePcmDUnePlage(sourceId, zone.debutDansLaSource, zone.finDansLaSource)
        : Promise.resolve({ pcm: new Int16Array(0), echantillonsLus: 0,
            echantillonsNonCouverts: 0, echantillonsDeLaPrise: dispo,
            regle: 'aucune amorce à lire' });

      return plage.then(function (p) {
        if (p.echantillonsNonCouverts > 0) {
          avertir('Amorce incomplète : ' + p.echantillonsNonCouverts + ' échantillons de la '
            + 'plage ne sont couverts par aucun morceau écrit et restent à zéro.');
        }
        // (E2) LE COMPTE À REBOURS AVANT LA REPRISE, comme avant toute prise.
        dire('Compte à rebours…');
        return compteARebours().then(function (r) {
          _etat.rebours = r;
          return { zone: zone, pcm: p, hzSource: hzSource, sansAmorce: sansAmorce,
                   lecture: p.echantillonsLus > 0 };
        });
      });
    }).then(function (prep) {
      var zone = prep.zone;
      var hz = _etat.echantillonnage || 48000;
      // LA BANDE DÉMARRE AU PASSAGE CHOISI, CALÉE SUR LA FIN DE L'AMORCE. En doublage, la fin
      // de l'amorce tombe à l'échantillon `echantillonsJoues` de la prise neuve ; en « amorce
      // puis silence », rien de l'amorce n'est écrit, donc à l'échantillon zéro.
      var alignement = (zone.mode === 'doublage') ? zone.echantillonsJoues : 0;
      var surLaBande_s = debutDuPassageSurLaBande_s(zone.passage);
      var decalage = alignement / hz - surLaBande_s;
      var reprise = {
        passage: zone.passage,
        texteDuPassage: _etat.passages[zone.passage].texteLu,
        priseSource: zone.priseSource,
        positionDansLaSource: zone.positionDuPassageDansLaSource,
        modeDeReprise: zone.mode,
        decalageBande_s: decalage,
        alignementDeLaBande_echantillon: alignement,
        debutDuPassageSurLaBande_s: +surLaBande_s.toFixed(3),
        regle: 'prise SÉPARÉE liée au passage (R7, T10) : l\'ancienne prise reste, et une '
          + 'seconde reprise du même passage crée une troisième prise. La bande démarre au '
          + 'passage choisi, calée sur la fin de l\'amorce.',
      };

      if (zone.mode === 'amorce-puis-silence') {
        // ── AMORCE PUIS SILENCE : on joue, on laisse passer la garde, PUIS on enregistre ───
        dire('Amorce (' + (zone.echantillonsJoues / prep.hzSource).toFixed(1) + ' s) puis '
          + garde_s + ' s de silence…');
        var lue = null;
        if (prep.lecture) {
          lue = _lireLAmorce(_etat.ctx, prep.pcm.pcm.buffer, prep.hzSource,
            { debutEchantillon: 0, finEchantillon: prep.pcm.pcm.length });
          peindreHorlogeDeLAmorce(lue, 'Amorce');
        }
        var attente = (prep.lecture ? lue.duree_s : 0) + garde_s;
        return attendreMs(attente * 1000).then(function () {
          peindreHorlogeDeLAmorce(null);
          _etat.amorce = Object.assign({}, zone, {
            lecture: sansLeNoeud(lue) || 'aucune amorce jouée',
            amorceDansLaPcmDeLaPrise: 'aucune : l\'enregistrement n\'a commencé qu\'après la '
              + 'fin de l\'amorce et la garde de ' + garde_s + ' s',
            gardeAppliquee_s: garde_s,
            echantillonsLusDeLaSource: prep.pcm.echantillonsLus,
            couvertureDeLaPlage: prep.pcm.regle,
          });
          return demarrer({ reprise: reprise });
        });
      }

      // ── DOUBLAGE : la prise démarre, et la lecture est programmée à l'instant du premier
      // échantillon. La fuite des haut-parleurs est dans la prise, et la zone la borne.
      dire('Doublage : amorce aux haut-parleurs et enregistrement ensemble…');
      return demarrer({ reprise: reprise }).then(function (id) {
        var lue2 = null;
        var debutDansLaPriseNeuve = 0;
        if (prep.lecture) {
          var t0 = Math.max(_etat.ctx.currentTime + MARGE_DOUBLAGE_S, _etat.debutPrise_ctxTemps);
          lue2 = _lireLAmorce(_etat.ctx, prep.pcm.pcm.buffer, prep.hzSource,
            { debutEchantillon: 0, finEchantillon: prep.pcm.pcm.length, debut_s: t0 });
          // MESURÉ, pas annoncé : l'écart entre le premier échantillon de la prise et le début
          // de la lecture, sur l'horloge audio, converti en échantillons de la prise.
          debutDansLaPriseNeuve = Math.max(0,
            Math.round((t0 - _etat.debutPrise_ctxTemps) * hz));
          peindreHorlogeDeLAmorce(lue2, 'Amorce (doublage)');
          // LE NŒUD EST GARDÉ POUR POUVOIR LE TAIRE : il n'est pas une seconde borne, c'est le
          // moyen d'arrêter la lecture si la prise s'arrête avant la fin de l'amorce.
          _etat.lectureDeLAmorce = lue2.noeud;
          // ── LA FIN DE LA LECTURE EST MESURÉE PAR LE NŒUD, PAS DÉCLARÉE PAR MOI ──────────
          // `onended` est le navigateur qui dit « j'ai fini », et `currentTime` est l'horloge
          // audio à cet instant. En comparant à la fin PRÉVUE, on sait si la lecture s'est
          // arrêtée en avance — c'est-à-dire si l'arrêt de la prise l'a réellement coupée, au
          // lieu de se contenter d'écrire au journal qu'on l'a coupée (#11(e)).
          _etat.amorceFinie = null;
          lue2.noeud.onended = function () {
            var h = _etat.ctx ? _etat.ctx.currentTime : null;
            var mesure = {
              aHorlogeAudio_s: (h === null) ? null : +h.toFixed(6),
              finPrevue_s: lue2.finitA_horlogeAudio_s,
              enAvance_s: (h === null) ? null : +(lue2.finitA_horlogeAudio_s - h).toFixed(6),
              regle: 'relevé par l\'événement `ended` du nœud et l\'horloge audio : une avance '
                + 'positive signifie que la lecture a été coupée avant la fin de la zone, une '
                + 'avance nulle qu\'elle est allée jusqu\'au bout.',
            };
            _etat.amorceFinie = mesure;
            if (_etat.amorce) _etat.amorce.finDeLaLecture = mesure;
          };
          attendreMs(lue2.duree_s * 1000).then(function () {
            peindreHorlogeDeLAmorce(null);
            _etat.lectureDeLAmorce = null;
          });
        }
        _etat.amorce = Object.assign({}, zone, {
          lecture: sansLeNoeud(lue2) || 'aucune amorce jouée',
          prevuDansLaPriseNeuve: { debut: zone.debutDansLaPriseNeuve,
                                   fin: zone.finDansLaPriseNeuve },
          debutDansLaPriseNeuve: debutDansLaPriseNeuve,
          finDansLaPriseNeuve: debutDansLaPriseNeuve + (prep.lecture ? lue2.echantillons : 0),
          ecartEntreLaLectureEtLePremierEchantillon_echantillons: debutDansLaPriseNeuve,
          gardeAppliquee_s: 0,
          echantillonsLusDeLaSource: prep.pcm.echantillonsLus,
          couvertureDeLaPlage: prep.pcm.regle,
          regleDuDoublage: 'la fuite des haut-parleurs occupe la zone ci-dessus dans la prise '
            + 'neuve : le montage la coupe (E10). L\'écart est MESURÉ sur l\'horloge audio, '
            + 'entre l\'instant programmé de la lecture et celui du premier échantillon écrit.',
        });
        journaliser('amorce jouée', debutDansLaPriseNeuve, {
          mode: zone.mode, passage: zone.passage, priseSource: zone.priseSource,
          echantillonsJoues: zone.echantillonsJoues,
          debutDansLaSource: zone.debutDansLaSource, finDansLaSource: zone.finDansLaSource,
          latenceDeSortie_s: lue2 ? lue2.latenceDeSortie_s : 'sans objet' });
        dire('Reprise du passage ' + (zone.passage + 1) + ' en cours (prise ' + id + ').');
        return id;
      });
    }).then(function (id) {
      if (id && _etat.amorce && _etat.amorce.mode === 'amorce-puis-silence') {
        journaliser('amorce jouée', 0, {
          mode: 'amorce-puis-silence', passage: _etat.amorce.passage,
          priseSource: _etat.amorce.priseSource,
          echantillonsJoues: _etat.amorce.echantillonsJoues,
          gardeAppliquee_s: _etat.amorce.gardeAppliquee_s,
          regle: 'jouée AVANT le démarrage : aucun échantillon de l\'amorce n\'est dans la '
            + 'prise, la zone est vide.' });
        dire('Reprise du passage ' + (_etat.amorce.passage + 1) + ' en cours (prise ' + id + ').');
      }
      return id;
    }, function (err) {
      peindreHorlogeDeLAmorce(null);
      dire('La reprise a échoué : ' + (err && err.message ? err.message : err));
      throw err;
    });
  }

  // (E10) L'HORLOGE DE L'AMORCE : le composant `sc-bm-amorce-clock` du kit, le même que celui du
  // compte à rebours, parce que c'est la même information — le temps qui reste avant d'enchaîner.
  function peindreHorlogeDeLAmorce(lue, libelle) {
    var boite = q('[data-amorce-horloge]');
    if (!boite) return;
    if (!lue) { boite.hidden = true; return; }
    boite.hidden = false;
    var lib = q('[data-amorce-libelle]');
    var val = q('[data-amorce-valeur]');
    if (lib) lib.textContent = libelle || 'Amorce';
    if (val) val.textContent = lue.duree_s.toFixed(1).replace('.', ',') + ' s';
  }

  // ── (R7) LES DEUX CHOIX D'UNE REPRISE : LA PRISE SOURCE ET LE PASSAGE ────────────────────
  //
  // LA LISTE DES PRISES SOURCES COMPREND LES REPRISES. Refaire une reprise est un cas ordinaire
  // — on s'y reprend à deux fois —, et l'amorce doit alors venir de la dernière version, pas de
  // l'originale. Rien ne distingue donc une reprise d'une prise pour ce choix-là.
  function peindreChoixDeReprise(prises) {
    var selPrise = q('[data-reprise-source]');
    if (selPrise) {
      var garde = selPrise.value;
      var utilisables = (prises || []).filter(function (p) {
        // Une prise 'en-cours' n'est pas relisable de bout en bout : ses morceaux sont encore
        // en train d'arriver. Une prise muette n'a rien à faire entendre.
        return p.etat === 'terminee' || p.etat === 'importee' || p.etat === 'recuperee';
      });
      selPrise.innerHTML = '<option value="">— aucune (reprise sans amorce) —</option>';
      utilisables.forEach(function (p) {
        var o = document.createElement('option');
        o.value = p.id;
        o.textContent = (p.nom || 'Prise') + ' · '
          + fmtTemps(p.nbEchantillons || 0, p.echantillonnage || 48000)
          + (p.repriseDuPassage ? ' · reprise du passage '
             + ((p.repriseDuPassage.passage || 0) + 1) : '');
        selPrise.appendChild(o);
      });
      // Par défaut, la plus récente : `listerPrises` les rend du plus récent au plus ancien.
      if (garde && selPrise.querySelector('option[value="' + garde + '"]')) selPrise.value = garde;
      else if (utilisables.length) selPrise.value = utilisables[0].id;
    }
    var selPassage = q('[data-reprise-passage]');
    if (selPassage) {
      var gardeP = selPassage.value;
      selPassage.innerHTML = '';
      _etat.passages.forEach(function (x, k) {
        var o = document.createElement('option');
        o.value = String(k);
        var t = x.texteLu || '';
        o.textContent = (k + 1) + ' · ' + (t.length > 48 ? t.slice(0, 47) + '…' : t);
        selPassage.appendChild(o);
      });
      if (gardeP && selPassage.querySelector('option[value="' + gardeP + '"]')) {
        selPassage.value = gardeP;
      }
    }
  }

  // ── DÉMARRER, ARRÊTER ──────────────────────────────────────────────────────────────────────

  // ── (E12) DÉMARRER UNE PRISE, OU PROLONGER CELLE QU'ON LUI DÉSIGNE ───────────────────────
  //
  // `demarrer()` ouvre une prise neuve. `demarrer({ continuer: id })` PROLONGE la prise `id` :
  // c'est le même chemin, les mêmes contrôles, le même worklet — seuls les compteurs de départ
  // changent, et ils sont RELUS dans le stockage. Deux fonctions séparées auraient dupliqué le
  // choix du canal, l'attente de l'accusé de réception et l'ordre d'écriture, soit trois
  // occasions de diverger (#11(f)). Ce que le CDC distingue, et que ce code ne confond pas : une
  // reprise de PASSAGE (R7) est une prise SÉPARÉE, et ne passe pas par ici.
  function demarrer(options) {
    if (_etat.enPrise) return Promise.resolve(null);
    if (!_etat.noeud) return Promise.reject(new Error('micro non autorisé : rien à enregistrer'));
    var prolonge = options && options.continuer ? String(options.continuer) : null;
    // (R7) UNE REPRISE DE PASSAGE EST UNE PRISE NEUVE, pas une continuation : elle passe par le
    // même chemin que n'importe quelle prise — même choix de canal, même accusé de réception,
    // même ordre d'écriture — et n'en diffère que par ce qu'elle PORTE : le passage qu'elle
    // reprend, sa zone d'amorce et le décalage de la bande.
    var reprise = (options && options.reprise) ? options.reprise : null;

    // (b) LE CANAL EST DÉCIDÉ SUR LA FENÊTRE DES DEUX DERNIÈRES SECONDES, et gelé : on ne peut
    // pas remixer après coup des échantillons déjà écrits. Si la fenêtre est trop courte — moins
    // d'une seconde, parce qu'on a cliqué aussitôt après l'autorisation — on le DIT et on se
    // rabat sur tout ce qui a été vu, plutôt que de décider sur trois relevés en silence.
    var f = fenetreDeDecision();
    var sommesDecision = f.suffisante ? f.sommes : _etat.sommesAnalyse;
    var dec = choisirCanal(sommesDecision, _etat.reglageCanal);
    _etat.canalRetenu = dec.canal;
    _etat.canalRaison = dec.raison;
    _etat.fenetreDecision = {
      secondes: +f.secondes.toFixed(3), relevés: f.relevés, suffisante: f.suffisante,
      minimum_s: FENETRE_CANAL_MIN_S, visee_s: FENETRE_CANAL_S,
      source: f.suffisante ? 'les ' + f.secondes.toFixed(2) + ' s avant le démarrage'
                           : 'REPLI : fenêtre de ' + f.secondes.toFixed(2) + ' s, sous le minimum de '
                             + FENETRE_CANAL_MIN_S + ' s — décision prise sur tout ce qui a été vu',
    };
    if (!f.suffisante) {
      message('fenetre', 'info', 'La fenêtre de décision du canal ne fait que '
        + f.secondes.toFixed(2) + ' s (minimum ' + FENETRE_CANAL_MIN_S + ' s) : le canal a été '
        + 'choisi sur tout ce qui a été mesuré depuis l\'autorisation. Laissez le vu-mètre '
        + 'tourner deux secondes avant de commencer.');
    }

    var id = prolonge
      || ('prise-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7));
    var nom = (q('[data-nom-prise]') && q('[data-nom-prise]').value) || 'Prise';
    _etat.priseId = id;
    _etat.continuationDe = prolonge;
    _etat.enPause = false;
    _etat.microPerdu = false;
    _etat.causeDeLaPerte = null;
    _etat.reechantillonnerVers = null;
    _etat.indexDepart = 0;
    _etat.pauseCommenceeA_ms = 0;
    // Le journal de la prise commence par le contexte du périphérique, puis ne porte que ce qui
    // arrive PENDANT la prise.
    _etat.journal = _etat.ouverturePiste ? [_etat.ouverturePiste] : [];
    _etat.morceauxEcrits = 0;
    _etat.echantillonsEcrits = 0;
    _etat.ecrituresEnVol = Promise.resolve();
    _etat.muet = false;
    _etat.finDuWorklet = null;
    _etat.priseDemarreeRecue = false;
    _etat.echantillonsParMorceauReels = 0;
    // ── LE RELEVÉ APPARTIENT À SA PRISE (défaut 4, trouvé par §22 en sursaut) ─────────────
    // `echantillonsCourants` prend le plus avancé du dernier relevé et du compte de morceaux.
    // Sans cette remise à zéro, le relevé de la prise PRÉCÉDENTE survivait jusqu'au premier
    // relevé de la nouvelle — une cinquantaine de millisecondes — et tout événement journalisé
    // dans cet intervalle était daté à la position de la prise d'avant : §22 a vu « contexte
    // running » daté 265 728 dans une prise de 111 104 échantillons. Le défaut était là depuis
    // le lot 1 et ne se montrait que par intermittence, selon l'ordre d'arrivée du changement
    // d'état du contexte et du premier relevé. §22c l'éprouve maintenant sans course.
    _etat.dernierReleve = null;
    // ── (T3 ter) LE CHAMP DE TEXTE PERD LE FOCUS ET PASSE EN LECTURE SEULE ────────────────
    // Politique décidée par Christophe le 17 octobre. Le `blur` traite la cause du défaut des
    // quatre repères perdus : après avoir collé son texte, le curseur restait dans la zone, et
    // la flèche droite y déplaçait le caret au lieu de poser un repère. La lecture seule traite
    // une seconde conséquence, moins visible : le texte que la bande affiche ne doit pas changer
    // PENDANT la prise, sinon les passages, les durées et les vitesses de R5 ne décriraient plus
    // la voix qu'on est en train d'enregistrer. Les deux sont rendus à l'arrêt.
    var champTexte = q('[data-texte-bande]');
    if (champTexte) {
      if (document.activeElement === champTexte) champTexte.blur();
      champTexte.readOnly = true;
    }
    // Les compteurs de touches appartiennent à LEUR prise, comme les fenêtres et les relevés.
    _etat.touches = { recues: 0, acceptees: 0, refusees: 0, parRaison: {} };
    // (d) LES FENÊTRES D'UNE PRISE N'APPARTIENNENT QU'À ELLE. Les garder d'une prise à l'autre
    // aurait fait exactement ce que le défaut 4 reproche au compteur d'échantillons : décrire la
    // prise précédente en croyant décrire celle-ci.
    // (E4, T14) LES REPÈRES APPARTIENNENT À LEUR PRISE : ce sont des frontières DANS une voix.
    // Les garder d'une prise à l'autre les daterait dans la mauvaise.
    if (!prolonge) {
      _etat.reperes = [];
      _etat.dernierRepere = null;
      _etat.decalageBande_s = 0;
      _etat.repetitionsIgnorees = 0;
      peindreReperes();
      // (R7) Ce que la prise neuve porte, et qu'une prise ordinaire ne porte pas.
      _etat.repriseDuPassage = reprise || null;
      if (!reprise) _etat.amorce = null;
      // La bande démarre au passage choisi, calée sur la fin de l'amorce : le décalage est
      // calculé par `refaireLePassage` et adopté ici, après la remise à zéro ci-dessus.
      if (reprise) _etat.decalageBande_s = reprise.decalageBande_s;
    }
    _etat.bruitSommes = null;
    _etat.fenetresBruit = [];
    _etat.bruitProvisoireRendu = false;
    _etat.bruit = null;
    viderTousLesAvis();

    // CE QUI PRÉCÈDE TOUT LE RESTE QUAND ON PROLONGE : relire la prise et ses morceaux. Les
    // compteurs ne sont jamais déduits ni repris d'un affichage ; ils viennent du stockage.
    var depart = prolonge
      ? window.VoixStockage.lirePrise(_etat.db, prolonge).then(function (p) {
          if (!p) throw new Error('prise introuvable : ' + prolonge);
          return relireLesCompteurs(prolonge).then(function (vrai) {
            return { prise: p, vrai: vrai };
          });
        })
      : Promise.resolve({ prise: null, vrai: { nbMorceaux: 0, nbEchantillons: 0, prochainIndex: 0 } });

    return depart.then(function (d) {
      _etat.morceauxEcrits = d.vrai.nbMorceaux;
      _etat.echantillonsEcrits = d.vrai.nbEchantillons;
      _etat.indexDepart = d.vrai.prochainIndex;
      if (d.prise) {
        // (E12) LA NOUVELLE PARTIE GARDE LA FRÉQUENCE DE LA PRISE. Si le périphérique n'est plus
        // à la même, on le DIT et on rééchantillonne — une prise à deux fréquences serait une
        // prise dont aucune durée n'est juste.
        _etat.frequenceDeLaPrise = d.prise.echantillonnage;
        _etat.journal = (d.prise.journal || []).slice();
        // (C) LE VERDICT D'AMBIANCE DE LA PREMIÈRE PARTIE, cité et non recalculé, avec la
        // position jusqu'où il valait : c'est tout ce qu'on sait honnêtement de l'ambiance de
        // cette prise, et le rapport le dira sous ce nom.
        _etat.bruitDeLaPremierePartie = (d.prise.mesures && d.prise.mesures.bruitDePiece)
          ? { verdict: d.prise.mesures.bruitDePiece,
              valaitJusquA_echantillon: d.vrai.nbEchantillons,
              regle: 'mesuré à l\'arrêt de la première partie, sur ses propres fenêtres écrites ; '
                + 'cité tel quel, jamais recalculé sur la nouvelle partie.' }
          : 'la première partie n\'avait pas de verdict d\'ambiance';
        if (d.prise.echantillonnage !== _etat.echantillonnage) {
          _etat.reechantillonnerVers = d.prise.echantillonnage;
          message('frequence', 'warning', 'Cette prise est à ' + d.prise.echantillonnage
            + ' Hz et le périphérique est à ' + _etat.echantillonnage + ' Hz : la partie qui '
            + 'vient est rééchantillonnée vers ' + d.prise.echantillonnage + ' Hz, pour que la '
            + 'prise reste à une seule fréquence (E11, E12).');
        }
      } else {
        _etat.frequenceDeLaPrise = _etat.echantillonnage;
      }
      return (_etat.ctx.state === 'suspended' ? _etat.ctx.resume() : Promise.resolve());
    }).then(function () {
      _etat.debutPrise_ctxTemps = _etat.ctx.currentTime;
      // (3) LA GÉNÉRATION DU GRAPHE AU DÉMARRAGE : c'est elle qui dit si l'instant d'arrêt est
      // comparable à celui du démarrage.
      _etat.generationDuDebut = _generation;
      // ORDRE VOULU : on démarre le worklet D'ABORD, et on n'écrit la prise qu'une fois qu'il a
      // accusé réception. C'est lui qui connaît la taille de morceau réellement appliquée (un
      // multiple entier de 128), et la prise doit porter CETTE valeur, pas celle qu'on a
      // demandée. Un morceau peut arriver avant la fin de l'écriture de la prise : les écritures
      // de morceaux sont chaînées derrière cette promesse, donc l'ordre est tenu.
      _etat.enPrise = true;
      _etat.noeud.port.postMessage({ type: 'demarrer-prise', canal: dec.canal,
        indexDepart: _etat.indexDepart, echantillonsDepart: _etat.echantillonsEcrits });
      return attendre(function () { return _etat.priseDemarreeRecue; }, 5000);
    }).then(function () {
      // QUAND ON PROLONGE, LA PRISE EXISTE DÉJÀ : on ne la recrée pas, on la rouvre. La recréer
      // écraserait son journal et ses compteurs, c'est-à-dire tout ce qu'on vient de relire.
      if (prolonge) {
        var reouverture = window.VoixStockage.majPrise(_etat.db, prolonge, { etat: 'en-cours' });
        _etat.ecrituresEnVol = reouverture;
        return reouverture;
      }
      var creation = window.VoixStockage.creerPrise(_etat.db, descripteurDePrise({
        id: id,
        nom: nom,
        creeLe: new Date().toISOString(),
        echantillonnage: _etat.echantillonnage,
        canaux: (_etat.sommesAnalyse && _etat.sommesAnalyse.canaux) || _etat.canaux || 0,
        canalRetenu: dec.canal,
        canalRaison: dec.raison,
        reglageCanal: _etat.reglageCanal,
        echantillonsParMorceauAppliquee: _etat.echantillonsParMorceauReels,
        repriseDuPassage: reprise,
        zoneDAmorce: _etat.amorce,
      }));
      // Les morceaux attendent que la prise existe : sans cela, un premier morceau très court
      // (page masquée aussitôt) pourrait être écrit avant son parent.
      _etat.ecrituresEnVol = creation;
      return creation;
    }).then(function () {
      q('[data-action="demarrer"]').hidden = true;
      q('[data-action="arreter"]').hidden = false;
      q('[data-chrono-ligne]').hidden = false;
      q('[data-mode]').textContent = 'Prise en cours';
      var intituleEnCours = q('[data-chrono-intitule]');
      if (intituleEnCours) intituleEnCours.textContent = 'Enregistrement';
      peindreEtats();
      peindrePause();
      if (prolonge) {
        // (E12) LE RACCORD DE CONTINUATION, daté en échantillons depuis le DÉBUT de la prise.
        journaliser('continuation', _etat.echantillonsEcrits, {
          morceauxDejaLa: _etat.morceauxEcrits, prochainIndex: _etat.indexDepart,
          frequenceDeLaPrise: _etat.frequenceDeLaPrise,
          frequenceDuPeripherique: _etat.echantillonnage,
          reechantillonnageVers: _etat.reechantillonnerVers || 'sans objet',
          canal: dec.canal, raison: dec.raison });
      } else {
        journaliser('prise démarrée', 0, { canal: dec.canal, raison: dec.raison,
          echantillonsParMorceau: _etat.echantillonsParMorceauReels });
        // ── (R6) L'OPTION DES MARQUEURS THÉORIQUES, DÉSACTIVÉE PAR DÉFAUT ───────────────
        // R6 : « une option, désactivée par défaut, pose des marqueurs théoriques d'après la
        // bande, à ajuster ensuite. » Elle est posée AU DÉMARRAGE, pour que les marqueurs
        // soient là pendant la prise et qu'on les ajuste ensuite ; les poser à l'arrêt les
        // aurait mis après coup sur une voix déjà écrite, c'est-à-dire sans rien à ajuster.
        var optionTheorique = q('[data-marqueurs-theoriques]');
        var activeTheorique = !!(optionTheorique && optionTheorique.checked);
        _etat.marqueursTheoriques = {
          active: activeTheorique,
          parDefaut: false,
          poses: 0,
          regle: 'désactivée par défaut (R6). Activée, elle pose les frontières intérieures que '
            + 'la bande PRÉVOIT, par le même chemin qu\'un repère de la main : ils sont dans la '
            + 'même liste, datés en échantillons, comptés par les contrôles de T6, et '
            + 'ajustables ou effaçables comme les autres.',
        };
        if (activeTheorique && window.BandeRythmo && _etat.passages.length > 1) {
          var theoriques = window.BandeRythmo.marqueursTheoriques(
            _etat.passages, _etat.vitesseBande, _etat.echantillonnage);
          theoriques.forEach(function (t) {
            poserUnRepere('théorique', t.aEchantillon,
              { theorique: true, passage: t.passage, secondesTheoriques: t.secondes });
          });
          _etat.marqueursTheoriques.poses = theoriques.length;
          journaliser('marqueurs théoriques posés', 0, {
            nombre: theoriques.length, vitesse: _etat.vitesseBande,
            positions: theoriques.map(function (t) { return t.aEchantillon; }),
            regle: 'd\'après la bande, à ajuster ensuite (R6). Ce sont des repères comme les '
              + 'autres : l\'antirebond ne s\'applique pas à une position imposée, qui ne vient '
              + 'd\'aucune touche.' });
        }
        // (E2, E10) LE REBOURS APPARTIENT À CETTE PRISE, daté à zéro puisqu'il la précède.
        if (_etat.rebours && _etat.rebours.joue) {
          journaliser('compte à rebours joué', 0, {
            secondes: _etat.rebours.secondes, bipsJoues: _etat.rebours.bips,
            garde_s: _etat.rebours.garde_s, ecoule_s: _etat.rebours.ecoule_s,
            regle: _etat.rebours.regle });
        }
      }
      // (d) T13 : LE BRUIT SE MESURE PENDANT LE SILENCE INITIAL, donc sur les premières
      // secondes de la prise — pas sur une fenêtre d'avant, qui ne serait pas dans le fichier.
      _etat.bruit = null;
      if (prolonge) {
        // ── (T13, avenant 5 / C) SUR UNE CONTINUATION, L'AMBIANCE N'EST PAS MESURÉE ───────
        //
        // T13 laisse deux routes : « pour une prise continuée, l'estimation couvre la prise
        // entière, OU le rapport dit « ambiance non mesurée » ». Je prends la seconde, et voici
        // pourquoi. Couvrir la prise entière demanderait de garder les niveaux par fenêtre à
        // côté des morceaux. Ces niveaux pourraient alors diverger de l'audio de TROIS façons :
        // un WAV importé n'en a aucun, un rééchantillonnage les périme, et un crash peut écrire
        // un morceau sans eux. Or l'avenant 5 vient précisément d'écrire que « l'ambiance n'est
        // prélevée que dans un passage ÉCRIT de la prise » : fabriquer une seconde source de
        // vérité à côté de l'audio serait reproduire, sous une autre forme, le défaut qu'on
        // corrige. Le rapport dit donc ce qu'il sait, et porte le verdict de la première partie
        // avec la position jusqu'où il valait.
        //
        // DÉFAUT CORRIGÉ EN MÊME TEMPS : le rapport de la prise continuée du 11 octobre 19:36
        // calculait le bruit sur la seule nouvelle partie (205 fenêtres) et annonçait « 2
        // passages de voix dans le silence initial » — alors qu'une continuation n'a PAS de
        // silence initial. Elle commence au milieu d'une voix.
        _etat.bruitNonMesure = {
          mesure: false,
          raison: 'ambiance non mesurée : cette prise est une continuation, et une continuation '
            + 'n\'a pas de silence initial. T13 n\'autorise à prélever l\'ambiance que dans un '
            + 'passage écrit de la prise ; pour la couvrir entière il faudrait garder les niveaux '
            + 'par fenêtre à côté des morceaux, ce qui créerait une seconde source de vérité que '
            + 'l\'import, le rééchantillonnage et un crash pourraient désaccorder de l\'audio.',
          premierePartie: 'voir `bruitDePieceDeLaPremierePartie`',
          aRefaire: 'prélever l\'ambiance dans une pause de la prise entière, au jalon où la '
            + 'forme d\'onde existe et où la prise est relue de bout en bout.',
        };
      } else {
        _etat.bruitNonMesure = null;
        _etat.noeud.port.postMessage({ type: 'mesurer-bruit', canal: dec.canal,
          echantillons: Math.round(BRUIT.secondes * _etat.echantillonnage) });
      }
      return id;
    }, function (err) {
      _etat.enPrise = false;
      throw err;
    });
  }

  function arreter() {
    if (!_etat.enPrise) return Promise.resolve(null);
    // (E10) SI LA PRISE S'ARRÊTE PENDANT L'AMORCE, LA LECTURE SE TAIT. Laisser jouer l'ancienne
    // prise après l'arrêt n'écrirait rien de faux, mais ferait entendre une voix dont plus rien
    // à l'écran ne rend compte — et sur une reprise ratée qu'on relance aussitôt, deux amorces
    // se superposeraient.
    if (_etat.lectureDeLAmorce) {
      try { _etat.lectureDeLAmorce.stop(); } catch (e) { /* déjà terminée */ }
      _etat.lectureDeLAmorce = null;
      journaliser('amorce interrompue', echantillonsCourants(),
        { raison: 'la prise a été arrêtée avant la fin de l\'amorce : la lecture est coupée' });
    }
    _etat.enPrise = false;
    _etat.priseEnCloture = true;
    _etat.noeud.port.postMessage({ type: 'arreter-prise' });

    // On attend que le worklet ait rendu son dernier morceau ET que toutes les écritures soient
    // réellement terminées. Annoncer une prise avant que son dernier morceau soit écrit, c'est
    // présenter comme réussie une prise qui ne l'est pas (E8 dans son esprit).
    return attendre(function () { return !!_etat.finDuWorklet; }, 5000)
      .then(function () { return _etat.ecrituresEnVol; })
      .then(function () {
        var f = _etat.finDuWorklet || {};
        var perdus = blocsPerdus(f.blocsVus || 0, f.blocsSansEntree || 0,
          f.tramesEcoulees || 0, _etat.echantillonnage);
        // La latence du message de démarrage, mesurée pour ELLE-MÊME plutôt que confondue avec
        // une perte : écart entre l'instant du fil principal et celui du fil audio.
        // ── (3) UNE LATENCE NE PEUT PAS ÊTRE NÉGATIVE ──────────────────────────────────
        // Christophe a relevé « latenceDuDemarrage_ms: −1504 » sur une session REPRISE après une
        // perte de micro. La cause : les deux instants ne venaient pas du même contexte.
        // `debutPrise_ctxTemps` était lu sur le contexte d'origine, `debutTempsWorklet` sur le
        // NOUVEAU contexte, reconstruit par `autoriser` — et le `currentTime` d'un contexte
        // repart de zéro. Soustraire deux horloges différentes ne donne pas une latence, mais
        // un nombre. On compare donc les GÉNÉRATIONS de graphe, et quand elles diffèrent on le
        // DIT au lieu de rendre un chiffre impossible.
        perdus.latenceDuDemarrage_ms = (typeof _etat.debutTempsWorklet !== 'number')
          ? 'non mesurée'
          : (_etat.generationDuDebut !== _generation)
            ? 'non mesurable : le graphe a été reconstruit pendant la prise (génération '
              + _etat.generationDuDebut + ' au démarrage, ' + _generation + ' à l\'arrêt), et le '
              + '`currentTime` d\'un contexte neuf repart de zéro — les deux instants '
              + 'n\'appartiennent pas à la même horloge'
            : Math.round((_etat.debutTempsWorklet - _etat.debutPrise_ctxTemps) * 1000);

        // UNE PRISE EST MUETTE QUAND ELLE EST VIDE, pas quand elle CONTIENT un passage muet.
        // E8 dit « refuse de présenter une prise VIDE comme réussie ». La première règle que
        // j'avais écrite — « le journal porte une alerte muette » — condamnait une prise de huit
        // secondes pour deux secondes et demie de silence au milieu, ce qui est faux et ce qu'un
        // contrôle a montré. Le témoin honnête est le compte de zéros SUR LE SIGNAL RETENU, tenu
        // par le worklet là où les échantillons passent.
        var retenus = f.echantillonsRetenus || 0;
        var zeros = f.zerosRetenus || 0;
        var muette = _etat.echantillonsEcrits === 0 || (retenus > 0 && zeros === retenus);

        // ── (D5) UN PASSAGE MUET N'EST PAS UN SIGNAL PERDU ────────────────────────────────
        // Défaut 5 du relevé d'essais : une prise dont 68 % est à zéro JUSQU'À LA FIN était
        // annoncée « sonore avec un passage muet ». Ce n'est pas un passage : c'est une perte.
        // Les deux se distinguent par un fait, pas par une appréciation — le signal est-il
        // revenu après la dernière chute à zéro ? Le journal porte la réponse, en échantillons.
        var dernierMuet = -1, dernierRetour = -1;
        _etat.journal.forEach(function (e, k) {
          if (e.quoi === 'piste muette') dernierMuet = k;
          if (e.quoi === 'son revenu') dernierRetour = k;
        });
        var signalPerdu = !muette && dernierMuet >= 0 && dernierRetour < dernierMuet;
        var passageMuet = !muette && dernierMuet >= 0 && dernierRetour > dernierMuet;
        var perduDepuis = signalPerdu ? _etat.journal[dernierMuet].aEchantillon : null;

        // ── (d) LE VERDICT FINAL DE BRUIT, rendu ICI et nulle part ailleurs ────────────────
        // Le verdict provisoire portait sur le silence initial seul. T13 demande, quand ce
        // silence n'a pas été tenu, de prélever l'ambiance dans une pause — et une pause ne peut
        // être trouvée qu'une fois la prise finie. C'est donc ce verdict-là, et lui seul, que le
        // rapport porte et que le journal date.
        if (_etat.bruitSommes) {
          var vb = peindreBruit(verdictBruit(fusionBruit()), 'final');
          journaliser('bruit de pièce ' + vb.etat, _etat.echantillonsEcrits, {
            plancherDbfs: (typeof vb.plancherDbfs === 'number') ? +vb.plancherDbfs.toFixed(1) : vb.raisonDuNiveau || vb.raison,
            source: vb.plancherSource || 'sans objet',
            efficaceFenetreEntiereDbfs: (typeof vb.efficaceDbfsFenetreEntiere === 'number')
              ? +vb.efficaceDbfsFenetreEntiere.toFixed(1) : 'sans objet',
            silenceInitialRespecte: vb.silenceInitialRespecte,
            transitoires: vb.transitoires || 0,
            partGrave: (typeof vb.partGrave === 'number') ? +vb.partGrave.toFixed(3) : 'sans objet',
            graveDominant: !!vb.graveDominant,
            fenetres: vb.fenetres ? vb.fenetres.pleines : 0 });
        }

        // ── (b) LA REVÉRIFICATION DU CANAL, SUR LA PRISE ELLE-MÊME ────────────────────────
        // La décision a été prise sur deux secondes AVANT la prise. La prise, elle, dure parfois
        // cinq minutes : un canal qui semblait actif peut être retombé à zéro, et l'inverse.
        // On rejoue donc la même règle sur les sommes de la PRISE, et c'est CETTE raison-là que
        // le rapport écrit. Si les deux verdicts diffèrent, on le dit — un canal retenu qui
        // contredit la mesure de la prise est précisément ce qu'on ne doit pas taire.
        var surLaPrise = choisirCanal(_etat.sommesTotal || f.total, _etat.reglageCanal);
        _etat.verificationCanal = {
          geleAvantLaPrise: _etat.canalRetenu,
          raisonAvantLaPrise: _etat.canalRaison,
          recalculeSurLaPrise: surLaPrise.canal,
          raisonSurLaPrise: surLaPrise.raison,
          accord: surLaPrise.canal === _etat.canalRetenu,
          fenetreDeDecision: _etat.fenetreDecision || null,
          regle: 'la décision est gelée avant la prise (on ne peut pas remixer des échantillons '
            + 'déjà écrits) ; la vérification rejoue la même règle sur les sommes de la prise, et '
            + 'c\'est la raison SUR LA PRISE que le rapport porte.',
        };
        if (!_etat.verificationCanal.accord) {
          journaliser('canal démenti par la prise', _etat.echantillonsEcrits,
            { gele: _etat.canalRetenu, surLaPrise: surLaPrise.canal });
          message('canal-verif', 'error', 'Le canal retenu (' + nomCanal(_etat.canalRetenu)
            + ') ne correspond pas à ce que la prise elle-même indique ('
            + nomCanal(surLaPrise.canal) + ') : ' + surLaPrise.raison
            + '. La prise est utilisable, mais le mixage n\'est peut-être pas le bon.');
        }

        // (e) LA LATENCE DE SORTIE SE LIT TARD, et c'est une mesure, pas une devinette.
        // Mesuré ce soir : `ctx.outputLatency` vaut 0 tant qu'aucune source n'est connectée, puis
        // 0,029 s une fois le graphe vivant. La lire à la création du contexte donnerait donc un
        // zéro qui RESSEMBLE à une mesure et n'en est pas. On la relève à l'arrêt de la prise,
        // graphe en marche, et on distingue « absente de cette API » de « nulle ».
        _etat.latences = {
          sortie_s: ('outputLatency' in _etat.ctx)
            ? _etat.ctx.outputLatency
            : 'propriété outputLatency absente de ce navigateur',
          base_s: ('baseLatency' in _etat.ctx)
            ? _etat.ctx.baseLatency
            : 'propriété baseLatency absente de ce navigateur',
          entree_s: (_etat.microphone && _etat.microphone.latenceEntree_s) || 'indisponible',
          releveeQuand: 'à l\'arrêt de la prise, graphe en marche',
          // ── D'OÙ VIENNENT CES CHIFFRES, ÉCRIT DANS LE RAPPORT LUI-MÊME ──────────────────
          // Une latence n'a de sens qu'avec le moteur et la machine qui l'ont produite : celles
          // d'un Chromium de test ne valent pas pour Safari, et les confondre ferait calibrer le
          // lot 3B sur les chiffres d'un autre navigateur. Le rapport porte donc son origine.
          mesureesSur: (self.navigator && self.navigator.userAgent) || 'agent indisponible',
          avertissement: 'CES LATENCES SONT CELLES DU NAVIGATEUR ET DE LA MACHINE QUI ONT PRODUIT '
            + 'CETTE PRISE, lisibles dans `mesureesSur`. Elles ne sont transposables à aucun '
            + 'autre moteur : une valeur relevée dans un Chromium de test ne dit rien de Safari.',
          regle: 'outputLatency vaut 0 tant qu\'aucune source n\'est connectée : la lire à la '
            + 'création du contexte donnerait un zéro qui n\'est pas une mesure. Le calibrage '
            + 'micro-haut-parleur, lui, est du lot 3B.',
        };

        var mesures = rapportDUnePrise(f, perdus, muette, passageMuet, signalPerdu, perduDepuis);
        _etat.mesures = mesures;

        return window.VoixStockage.majPrise(_etat.db, _etat.priseId, {
          etat: muette ? 'muette' : (signalPerdu ? 'signal-perdu' : 'terminee'),
          nbEchantillons: _etat.echantillonsEcrits,
          nbMorceaux: _etat.morceauxEcrits,
          journal: _etat.journal.slice(),
          mesures: mesures,
        }).then(function () {
          q('[data-action="demarrer"]').hidden = false;
          q('[data-action="arreter"]').hidden = true;
          q('[data-mode]').textContent = muette ? 'Prise muette' : 'Prise terminée';
          // (D2) L'INTITULÉ DIT CE QU'IL EST : « Enregistrement 01:16,221 » après l'arrêt
          // laissait croire que la prise courait encore.
          var intitule = q('[data-chrono-intitule]');
          if (intitule) intitule.textContent = 'Dernière prise';
          // (T3 ter) LE CHAMP REDEVIENT MODIFIABLE : hors prise, on écrit librement.
          var champFin = q('[data-texte-bande]');
          if (champFin) champFin.readOnly = false;
          _etat.enPause = false;
          _etat.microPerdu = false;
          q('[data-action="pause"]').hidden = true;
          // (D2 / E8) LE BANDEAU DEVIENT UN RÉSUMÉ NEUTRE. Il ne disparaît pas : l'instant où
          // le signal est tombé est la seule information utile pour comprendre la prise.
          if (_etat.muet) {
            message('muet', 'info', resumeAlerteMuette(_etat.muetDepuis,
              _etat.echantillonsEcrits, _etat.echantillonnage)
              + ' Le son n\'est pas revenu avant l\'arrêt.');
            _etat.muet = false;
          }
          peindreEtats();
          // Clé DISTINCTE de celle du bandeau E8 : le verdict final s'ajoute au bandeau au lieu
          // de l'effacer. Avec la même clé, l'instant où le signal est tombé à zéro — la seule
          // information utile pour comprendre ce qui s'est passé — disparaissait à l'arrêt.
          if (muette) {
            message('prise-muette', 'error', 'Cette prise est MUETTE : ' +
              (_etat.echantillonsEcrits === 0 ? 'aucun échantillon écrit' :
               'le signal retenu est resté à zéro numérique sur la totalité de la prise (' +
               (f.zerosRetenus || 0) + ' échantillons sur ' + (f.echantillonsRetenus || 0) + ')') +
              '. Elle n\'est pas présentée comme réussie (E8).');
          } else if (signalPerdu) {
            message('prise-muette', 'error', 'SIGNAL PERDU à l\'échantillon ' + perduDepuis +
              ' (' + fmtTemps(perduDepuis, _etat.echantillonnage) + ') et jamais revenu : tout ' +
              'ce qui suit est à zéro numérique. Ce n\'est pas un passage muet, c\'est une perte ' +
              'de capture — seul le début de la prise est utilisable.');
          } else if (passageMuet) {
            message('prise-muette', 'info', 'Cette prise est sonore, mais elle contient un ' +
              'passage à zéro numérique de plus de 2 secondes, suivi d\'un retour du son. Il ' +
              'reste consigné au journal, en échantillons.');
          }
          _etat.priseEnCloture = false;
          // (R5) « après la prise, chaque passage affiche sa vitesse » : c'est ici, quand la
          // durée de la voix est connue et que les repères ne bougent plus d'eux-mêmes.
          peindreVitesses();
          return peindreListe().then(function () { return mesures; });
        });
      });
  }

  // ── (a / E11) LA FRÉQUENCE DE LA PRISE, FONCTION PURE DE LA FRÉQUENCE ─────────────────────
  //
  // POURQUOI UNE FONCTION, ET NON UN LITTÉRAL DANS LE RAPPORT. Trois mutations du falsifieur
  // — annoncer 48 000 Hz quoi qu'il arrive, taire le rééchantillonnage du lot 4, écrire une
  // constante dans la prise — étaient NON DÉCIDABLES sur la machine de Christophe, dont la
  // sortie est à 48 000 Hz : à cette fréquence, la valeur fausse et la valeur juste coïncident.
  // Christophe a refusé (11 octobre) de remettre sa machine à 44 100 Hz pour un test, et il a
  // raison : aucun contrôle ne doit dépendre de la configuration de son Mac. La règle est donc
  // sortie de son contexte et prend la fréquence en PARAMÈTRE : un contrôle l'éprouve à
  // 44 100 Hz sans qu'aucun périphérique soit ouvert. Elle reste sur le vrai chemin — le
  // rapport l'appelle, et §8 (vrai getUserMedia) l'emprunte.
  function blocFrequence(echantillonnage) {
    return {
      reelle_hz: echantillonnage,
      demandee: FREQUENCE_DEMANDEE === null ? 'aucune (fréquence native du périphérique)'
                                            : FREQUENCE_DEMANDEE,
      native: FREQUENCE_DEMANDEE === null,
      aReechantillonnerAuLot4: echantillonnage !== 48000,
      regle: 'le lot 4 rééchantillonne à 48 000 Hz toute prise qui n\'y est pas, avec un avis '
        + 'visible. Mesuré le 10 octobre : Chromium et WebKit honorent tous deux '
        + '`new AudioContext({ sampleRate: 48000 })`, mais la piste du micro reste à sa propre '
        + 'fréquence et le contexte interpole en amont — d\'où le choix du natif, pour que la '
        + 'prise porte la fréquence où la voix est née.',
    };
  }

  // ── (c / E11) LE DESCRIPTEUR D'UNE PRISE, FONCTION PURE DE SES ARGUMENTS ──────────────────
  //
  // Même raison. Deux grandeurs de ce descripteur ne se distinguent de leur contrefaçon qu'à une
  // fréquence autre que 48 000 Hz : la fréquence de la prise (qui doit être celle du CONTEXTE,
  // non une valeur de réglage) et la taille d'un morceau (qui doit être celle que le worklet
  // APPLIQUE — un nombre entier de blocs de 128 —, non celle que le module a demandée : à
  // 44 100 Hz, 5 secondes font 220 500 échantillons, qui ne sont pas un entier de blocs, et la
  // valeur appliquée est 220 544). Les deux sont ici, prises en paramètre, et un contrôle les
  // éprouve aux deux fréquences sans ouvrir de périphérique.
  function descripteurDePrise(a) {
    return {
      id: a.id,
      nom: a.nom,
      creeLe: a.creeLe,
      echantillonnage: a.echantillonnage,
      canaux: a.canaux,
      canalRetenu: a.canalRetenu,
      canalRaison: a.canalRaison,
      reglageCanal: a.reglageCanal,
      // (c) UNE SEULE GRANDEUR : la taille EFFECTIVE, celle que le worklet applique. La taille
      // nominale n'est écrite NI dans la prise NI dans le rapport : c'est une consigne
      // d'interface, pas un fait de la prise, et la garder à côté de la valeur réelle faisait
      // deux vérités pour une même grandeur — 220 500 contre 220 544 à 44 100 Hz (#11(f)).
      echantillonsParMorceau: a.echantillonsParMorceauAppliquee,
      // (R7, T10) LE LIEN AU PASSAGE, PORTÉ PAR LA PRISE ELLE-MÊME. Sans lui, une reprise
      // serait une prise de plus sans qu'on sache de quoi : c'est ce lien qui permet au lot 4
      // de choisir laquelle des deux versions d'un passage il monte, et à la liste de dire
      // « reprise du passage 3 » au lieu de « Prise d'essai » pour la troisième fois.
      repriseDuPassage: a.repriseDuPassage || null,
      zoneDAmorce: a.zoneDAmorce || null,
      nbEchantillons: 0,
      nbMorceaux: 0,
      // 'en-cours' : si la page meurt maintenant, le prochain chargement la trouvera ainsi et
      // la PROPOSERA à la reprise (E5). Une prise 'en-cours' n'est jamais réussie.
      etat: 'en-cours',
      journal: [],
    };
  }

  // ── LE RAPPORT DE MESURES ──────────────────────────────────────────────────────────────────
  // Niveau et crête PAR CANAL, corrélation vraiment calculée (jamais `null` : une raison à la
  // place), blocs perdus avec leurs deux termes, état de la piste, canal retenu. Chaque nombre
  // porte la grandeur dont il découle.
  function rapportDUnePrise(fin, perdus, muette, passageMuet, signalPerdu, perduDepuis) {
    var s = _etat.sommesTotal || (fin && fin.total) || null;
    var g = niveauxCanal(s, 'g');
    var d = niveauxCanal(s, 'd');
    var r = correlation(s);
    return {
      prise: _etat.priseId,
      nom: (q('[data-nom-prise]') && q('[data-nom-prise]').value) || null,
      horodatage: new Date().toISOString(),
      // ── (a) LA FRÉQUENCE RÉELLE, et ce que le lot 4 devra en faire ──────────────────────
      frequence: blocFrequence(_etat.echantillonnage),
      // (e) LE PÉRIPHÉRIQUE ET LES LATENCES, mesurés et non devinés.
      microphone: _etat.microphone || 'indisponible (aucune piste réelle : source de fixture)',
      latences: _etat.latences || 'non relevées',
      contexteAudio: {
        echantillonnage: _etat.echantillonnage,
        etat: _etat.ctx ? _etat.ctx.state : 'indisponible',
      },
      echantillonnage: _etat.echantillonnage,
      canauxALEntree: s ? s.canaux : 0,
      canauxVusALEntree: s ? { minimum: s.canauxMin || 0, maximum: s.canauxMax || 0,
                               aVarie: (s.canauxMin || 0) !== (s.canauxMax || 0) } : 'non mesuré',
      // ── (D / E3) UN SEUL CHAMP POUR LE CANAL UTILISÉ, AVEC LA RAISON DE CE CANAL-LÀ ─────
      //
      // DÉFAUT CORRIGÉ : le rapport portait « canalRetenu: moyenne » et « raisonDuCanal: droit
      // vide… sans moyenne » dans le même document. Deux champs, deux grandeurs différentes —
      // le mode gelé et le verdict de la prise — sous des noms qui laissaient croire qu'ils se
      // répondaient. E3 (avenant 5) l'exige en toutes lettres : « le rapport dit toujours le
      // canal réellement utilisé, avec la raison de ce canal-là ».
      canalUtilise: {
        canal: _etat.canalRetenu,
        raison: _etat.canalRaison,
        quand: 'décidé avant la prise, sur la fenêtre ci-dessous, et appliqué à tous les '
          + 'échantillons écrits',
        // (E3) CE QUE LA MOYENNE A RÉELLEMENT MOYENNÉ. Le mode ne suffit pas : « moyenne » sur
        // un canal mort n'est pas une moyenne, c'est le canal vivant — et c'est ce qui empêche
        // la perte de 6 dB.
        mixageEffectif: (_etat.canalRetenu !== 'moyenne') ? 'sans objet (un seul canal)'
          : {
              echantillonsMixesSurUnCanal: fin ? (fin.mixeSurUnCanal || 0) : 0,
              echantillonsMixesSurDeuxCanaux: fin ? (fin.mixeSurDeuxCanaux || 0) : 0,
              partSurUnCanal: (fin && (fin.mixeSurUnCanal + fin.mixeSurDeuxCanaux))
                ? fin.mixeSurUnCanal / (fin.mixeSurUnCanal + fin.mixeSurDeuxCanaux) : 0,
              maintienDUnCanal_echantillons: fin ? (fin.maintienCanal || 0) : 0,
              regle: 'en mode moyenne, le diviseur est le nombre de canaux VIVANTS — ceux qui '
                + 'ont livré un échantillon non nul depuis moins de '
                + (fin && fin.maintienCanal ? fin.maintienCanal : 0) + ' échantillons. Un canal '
                + 'mort n\'entre pas dans la moyenne : E3 interdit la perte de 6 dB qu\'elle '
                + 'coûterait. La moyenne n\'étant choisie que pour deux canaux corrélés à plus '
                + 'de ' + CORRELATION_MEME_SIGNAL + ', retirer le mort ne change pas le niveau.',
            },
      },
      // (b) LE VERDICT DE LA PRISE, à côté et sous son propre nom : ce que la prise elle-même
      // dit du canal, qui peut contredire la décision d'avant — et qui le dit alors.
      verdictSurLaPrise: _etat.verificationCanal
        ? { canal: _etat.verificationCanal.recalculeSurLaPrise,
            raison: _etat.verificationCanal.raisonSurLaPrise,
            accordAvecLeCanalUtilise: _etat.verificationCanal.accord }
        : 'non vérifié',
      // ── (E2, E10) LE COMPTE À REBOURS DE CETTE PRISE ────────────────────────────────────
      compteARebours: _etat.rebours || 'aucun',
      // ── (E13) QUELLE VERSION A PRODUIT CETTE PRISE ──────────────────────────────────────
      // « un rapport sans empreinte n'est pas une preuve » (E13).
      versionTestee: _etat.empreintes || 'empreintes non calculées',
      // ── (R6, E4, T14) LA BANDE ET LES REPÈRES ───────────────────────────────────────────
      bande: _etat.bande
        ? { calageSur: _etat.bande.calageSur,
            vitesseMotsParSeconde: _etat.bande.vitesseMotsParSeconde,
            nbPassages: _etat.bande.nbPassages,
            passageAtteint: _etat.bande.passageCourant,
            motsEcoules: _etat.bande.motsEcoules,
            decalage_s: _etat.bande.decalage_s,
            dureeTheoriqueDuTexte_s: window.BandeRythmo
              ? window.BandeRythmo.dureeTotale(_etat.passages, _etat.vitesseBande) : 0,
            regle: _etat.bande.regle }
        : 'aucun texte de bande',
      reperes: _etat.reperes.slice(),
      repetitionsDeToucheIgnorees: _etat.repetitionsIgnorees || 0,
      // ── (T3 ter) LES TOUCHES REÇUES PENDANT LA PRISE, ET CE QU'ELLES SONT DEVENUES ──────
      // Quatre repères perdus sur la prise du 17 octobre n'avaient laissé aucune trace : une
      // touche refusée avant d'atteindre le module n'était comptée par personne. Ces compteurs
      // existent pour que la prochaine touche perdue soit CHIFFRÉE, avec sa raison.
      touchesPendantLaPrise: _etat.touches
        ? { recues: _etat.touches.recues, acceptees: _etat.touches.acceptees,
            refusees: _etat.touches.refusees, parRaison: _etat.touches.parRaison,
            regle: 'une ligne de journal par frappe pendant la prise : l\'élément focalisé, la '
              + 'touche (vocabulaire FERMÉ, jamais le contenu d\'une touche de texte), si elle '
              + 'est apprise, acceptée ou refusée, et la raison du refus.' }
        : 'aucune touche relevée',
      // ── (R5) LA VITESSE DE CHAQUE PASSAGE, AVEC SON SEUIL ───────────────────────────────
      vitessesParPassage: vitessesMaintenant()
        || 'sans objet : module de bande absent',
      // ── (R6) L'OPTION DES MARQUEURS THÉORIQUES, ET CE QU'ELLE A FAIT ────────────────────
      marqueursTheoriques: _etat.marqueursTheoriques
        || { active: false, poses: 0, regle: 'option non consultée : prise ouverte autrement '
             + 'que par le bouton (reprise de session, import)' },
      // ── (T6) LES TROIS CONTRÔLES, calculés à la fin de la prise, JAMAIS bloquants ici ────
      controlesDeT6: (window.BandeRythmo && _etat.passages.length)
        ? window.BandeRythmo.controlesDeT6(_etat.reperes, _etat.passages.length,
            _etat.echantillonsEcrits)
        : 'sans objet : aucun texte de bande, donc aucun nombre de commentaires attendu',
      // ── (E10, R7) LA ZONE D'AMORCE d'une reprise de passage ─────────────────────────────
      zoneDAmorce: _etat.amorce || 'sans objet : cette prise n\'est pas une reprise de passage',
      repriseDuPassage: (_etat.repriseDuPassage === null || _etat.repriseDuPassage === undefined)
        ? 'sans objet' : _etat.repriseDuPassage,
      // ── (A) CE QUE LE GRAPHE DE CAPTURE DÉCLARE ─────────────────────────────────────────
      grapheDeCapture: _etat.grapheDeCapture || 'graphe non construit',
      verificationDuCanal: _etat.verificationCanal || 'non vérifié',
      reglageCanal: _etat.reglageCanal,
      // (d) LE BRUIT DE PIÈCE (T13), jamais bloquant.
      bruitDePiece: _etat.bruitNonMesure || _etat.bruit || 'non mesuré',
      // (C) Sur une continuation, le verdict de la PREMIÈRE partie, tel qu'il a été rendu à son
      // arrêt, avec la position jusqu'où il valait. On ne le recalcule pas : on le cite.
      bruitDePieceDeLaPremierePartie: _etat.bruitDeLaPremierePartie || 'sans objet',
      regleDuCanal: 'un seul actif → ce canal ; deux actifs et corrélation > ' +
        CORRELATION_MEME_SIGNAL + ' → moyenne ; deux actifs différents → le plus fort',
      niveaux: {
        gauche: g, droit: d,
        regle: 'efficace = √(Σx²/n) ; crête = max|x| ; dBFS = 20·log10(amplitude) ; « vide » = zéro numérique sur tous les échantillons, « quasi-vide » = efficace sous ' + DBFS_QUASI_VIDE + ' dBFS',
      },
      correlationEntreCanaux: r,
      regleCorrelation: 'Pearson, moyennes retirées : (Σgd − ΣgΣd/n) / √((Σg² − (Σg)²/n)(Σd² − (Σd)²/n)). Jamais null : une raison à la place.',
      blocs: perdus,
      morceaux: {
        // (c) LA TAILLE EFFECTIVE, et elle seule : celle que le worklet applique, un nombre
        // entier de blocs de 128. La nominale de 5 s n'entre pas dans le rapport.
        echantillonsParMorceau: _etat.echantillonsParMorceauReels,
        blocsParMorceau: _etat.echantillonsParMorceauReels / 128,
        morceauxEcrits: _etat.morceauxEcrits,
        echantillonsEcrits: _etat.echantillonsEcrits,
        octetsEcrits: _etat.echantillonsEcrits * 2,
        octetsParMinute: _etat.echantillonnage * 2 * 60,
        duree_s: _etat.echantillonnage ? _etat.echantillonsEcrits / _etat.echantillonnage : 0,
      },
      echantillonsVusParLeWorklet: fin ? fin.echantillonsVus : null,
      // ── (C) L'ÉCART VU / ÉCRIT SE COMPARE PAR SESSION ─────────────────────────────────
      // DÉFAUT CORRIGÉ : la prise continuée du 11 octobre 19:36 annonçait « ecartVuEcrit
      // −1 440 000 ». Le premier terme comptait les échantillons VUS depuis le démarrage de
      // CETTE session, le second le total CUMULÉ de la prise — qui portait déjà la première
      // partie. La soustraction mêlait deux domaines et rendait un nombre qui ne décrivait rien.
      ecartVuEcritDeLaSession: fin
        ? { vus: fin.echantillonsVus,
            ecrits: fin.echantillonsEcritsCetteSession,
            ecart: fin.echantillonsVus - (fin.echantillonsEcritsCetteSession || 0),
            departDeLaSession: fin.departEcrits || 0,
            regle: 'les deux termes appartiennent à la MÊME session d\'enregistrement. Sur une '
              + 'prise continuée, le total de la prise porte aussi la première partie : le '
              + 'comparer aux échantillons vus par cette session n\'aurait aucun sens.' }
        : 'non mesuré',
      // (D5) TROIS ÉTATS DISTINCTS, et le troisième est celui qui manquait : un signal perdu
      // jusqu'à la fin de la prise n'est pas « un passage muet », et l'appeler ainsi laissait
      // croire qu'il y avait quelque chose après.
      etatDeLaPiste: muette ? 'muette'
        : signalPerdu ? ('signal perdu à l\'échantillon ' + perduDepuis + ' et jamais revenu')
        : passageMuet ? 'sonore avec un passage muet puis retour du son'
        : 'sonore',
      signalPerduAEchantillon: signalPerdu ? perduDepuis : 'sans objet',
      signalRetenu: {
        echantillons: (fin && fin.echantillonsRetenus) || 0,
        echantillonsAZero: (fin && fin.zerosRetenus) || 0,
        partAZero: (fin && fin.echantillonsRetenus)
          ? (fin.zerosRetenus / fin.echantillonsRetenus) : 0,
        regle: 'une prise est MUETTE quand tout le signal retenu est à zéro, ou que rien n\'a été écrit ; un passage muet dans une prise sonore est consigné, pas condamné',
      },
      journal: _etat.journal.slice(),
      persistance: _etat.persistance,
      aJugerParChristophe: [
        'La qualité sonore réelle de la prise : aucun test automatique ne l\'entend.',
        'Le confort du vu-mètre et la lisibilité du niveau affiché.',
        'La durée de 5 s pour un morceau, au vu de ce qu\'une fermeture brutale fait perdre.',
      ],
      nonVerifiable: [
        'Le comportement du micro intégré du Mac dans Safari : aucun micro réel dans les tests.',
        'La réponse de « Mode micro » du Centre de contrôle de macOS.',
      ],
    };
  }

  // ── LA LISTE DES PRISES ET LA REPRISE (E5) ─────────────────────────────────────────────────

  // ── (D6) UNE PRISE INACHEVÉE AFFICHE CE QUI EST RÉELLEMENT LÀ ─────────────────────────────
  //
  // DÉFAUT 6 DU RELEVÉ D'ESSAIS : « une prise inachevée affiche 0 morceau, 0,00 Mo alors que
  // l'encadré de reprise en retrouve 7 (35 s) ». Les deux chiffres venaient de deux sources :
  // la fiche lisait les compteurs ÉCRITS DANS LA PRISE, qui restent à zéro justement parce que
  // la prise n'a pas eu le temps de se clore, tandis que l'encadré de reprise relisait les
  // morceaux. Deux vérités pour une grandeur (#11(f)), et c'est la plus pessimiste qui
  // s'affichait : un opérateur qui lit « 0 morceau » supprime la prise.
  //
  // Désormais une prise 'en-cours' est RELUE, morceau par morceau, comme l'encadré le fait, et
  // la fiche dit d'où viennent ses chiffres. Une prise close garde ses compteurs : ils ont été
  // écrits après que toutes les écritures ont été attendues (§6b), ils ne peuvent pas mentir.
  function relireSiInachevee(p) {
    if (p.etat !== 'en-cours') {
      return Promise.resolve({ nbMorceaux: p.nbMorceaux || 0, nbEchantillons: p.nbEchantillons || 0,
                               relu: false });
    }
    var nb = 0, ech = 0;
    return window.VoixStockage.parcourirMorceaux(_etat.db, p.id, function (m) {
      nb++; ech += m.pcm.byteLength / 2;
    }).then(function () {
      return { nbMorceaux: nb, nbEchantillons: ech, relu: true };
    }, function () {
      // La relecture a échoué : on le DIT plutôt que de retomber sur des compteurs qu'on sait
      // faux. Un zéro affiché sans explication est ce qui a fait ce défaut.
      return { nbMorceaux: p.nbMorceaux || 0, nbEchantillons: p.nbEchantillons || 0,
               relu: false, echecDeRelecture: true };
    });
  }

  function peindreListe() {
    return window.VoixStockage.listerPrises(_etat.db).then(function (liste) {
      // (R7) La liste des prises sources suit la liste des prises : une prise qui vient d'être
      // terminée doit pouvoir servir d'amorce tout de suite.
      peindreChoixDeReprise(liste);
      var hote = q('[data-prises]');
      if (!hote) return liste;
      if (!liste.length) {
        // Composant `empty` (lot 1 à 4 et 6) + illustration `aucune-prise-voix` (lot 3).
        hote.innerHTML = '<div class="sc-bm-empty"><p>Aucune prise sur cet ordinateur.</p>' +
          '<span class="sc-bm-help">Autorisez le micro, puis commencez une prise.</span></div>';
        return liste;
      }
      hote.innerHTML = '';
      // (D6) Les relectures d'abord, l'affichage ensuite : une fiche ne s'écrit qu'avec des
      // chiffres qu'on a en main, jamais avec un zéro en attendant.
      return Promise.all(liste.map(relireSiInachevee)).then(function (relus) {
        liste.forEach(function (p, k) {
          var vrai = relus[k];
          var el = document.createElement('div');
          el.className = 'sc-bm-resume';
          el.setAttribute('data-prise', p.id);
          el.setAttribute('data-etat', p.etat);
          var dur = fmtTemps(vrai.nbEchantillons, p.echantillonnage || 48000);
          el.innerHTML =
            '<header class="sc-bm-panel-title"><h2></h2><span class="sc-bm-badge"></span></header>' +
            '<p data-detail></p>' +
            '<div class="sc-bm-row">' +
              // (E12) « Toute prise peut être continuée par Continuer cette prise » : une prise
              // terminée, une prise récupérée, une prise importée. Le bouton est donc sur
              // CHAQUE fiche, et il prolonge la MÊME prise — à ne pas confondre avec la reprise
              // d'un passage (R7), qui crée une prise séparée et n'existe pas à ce jalon.
              '<button type="button" class="sc-bm-button sc-bm-button--primary" data-action="continuer" data-lot="3">Continuer cette prise</button>' +
              '<button type="button" class="sc-bm-button sc-bm-button--secondary" data-action="wav" data-lot="3">Exporter en WAV</button>' +
              '<button type="button" class="sc-bm-button sc-bm-button--destructive" data-action="supprimer" data-lot="3">Supprimer</button>' +
            '</div>';
          el.querySelector('h2').textContent = p.nom || p.id;
          el.querySelector('.sc-bm-badge').textContent =
            p.etat === 'terminee' ? (p.origine === 'import WAV' ? 'Importée' : 'Terminée')
            : p.etat === 'muette' ? 'MUETTE'
            : p.etat === 'signal-perdu' ? 'SIGNAL PERDU'
            : 'Inachevée';
          el.querySelector('[data-detail]').textContent =
            dur + ' · ' + vrai.nbMorceaux + ' morceaux · ' +
            (vrai.nbEchantillons * 2 / 1048576).toFixed(2) + ' Mo · ' +
            (p.echantillonnage || 0) + ' Hz · ' + nomCanal(p.canalRetenu) +
            ' · ' + (p.creeLe || '').replace('T', ' ').slice(0, 19) +
            (p.origine ? ' · ' + p.origine : '') +
            (vrai.relu ? ' · relu dans IndexedDB, pas déduit des compteurs de la prise' : '') +
            (vrai.echecDeRelecture ? ' · RELECTURE IMPOSSIBLE : ces chiffres sont ceux de la prise, qui est inachevée' : '');
          hote.appendChild(el);
        });
        return liste;
      });
    });
  }

  // E5 : une prise restée 'en-cours' au chargement vient d'une fermeture accidentelle. On la
  // PROPOSE, en disant ce qui a réellement survécu — relu dans IndexedDB, pas déduit.
  function proposerReprise() {
    return window.VoixStockage.listerPrises(_etat.db).then(function (liste) {
      var inachevees = liste.filter(function (p) { return p.etat === 'en-cours'; });
      var hote = q('[data-reprise]');
      if (!hote) return;
      if (!inachevees.length) { hote.innerHTML = ''; return; }
      var p = inachevees[0];
      // On compte ce qui est RÉELLEMENT là, morceau par morceau. La prise annonçait 0 : c'est
      // justement parce qu'elle n'a pas eu le temps de se clore.
      return relireLesCompteurs(p.id).then(function (vrai) {
        var nb = vrai.nbMorceaux, ech = vrai.nbEchantillons;
        hote.innerHTML = '<section class="sc-bm-resume" data-lot="3" data-reprise-prise="' + p.id + '">' +
          '<header class="sc-bm-panel-title"><h2>Reprendre la prise interrompue</h2>' +
          '<span class="sc-bm-badge">Inachevée</span></header>' +
          '<p data-reprise-detail></p>' +
          '<div class="sc-bm-row">' +
            // (E5) « reprise proposée après une fermeture accidentelle : Récupérer, OU Continuer
            // cette prise comme après une pause (E12) ». Les deux, donc, et côte à côte : le
            // premier clôt la prise sur ce qui a survécu, le second la PROLONGE.
            '<button type="button" class="sc-bm-button sc-bm-button--primary" data-action="continuer" data-lot="3">Continuer cette prise</button>' +
            '<button type="button" class="sc-bm-button sc-bm-button--secondary" data-action="recuperer" data-lot="3">Récupérer ce qui a survécu</button>' +
          '</div></section>';
        hote.querySelector('[data-reprise-detail]').textContent =
          (p.nom || p.id) + ' · ' + nb + ' morceaux retrouvés · ' + ech + ' échantillons · ' +
          fmtTemps(ech, p.echantillonnage || 48000) + ' · relu dans IndexedDB, pas déduit';
      });
    });
  }

  function recuperer(priseId) {
    var ech = 0, nb = 0;
    return window.VoixStockage.parcourirMorceaux(_etat.db, priseId, function (m) {
      nb++; ech += m.pcm.byteLength / 2;
    }).then(function () {
      return window.VoixStockage.majPrise(_etat.db, priseId, {
        etat: ech > 0 ? 'terminee' : 'muette',
        nbEchantillons: ech,
        nbMorceaux: nb,
      });
    }).then(function () {
      message('reprise', 'info', 'Prise récupérée : ' + nb + ' morceaux, ' + ech +
        ' échantillons. Ce qui n\'avait pas été écrit est perdu, et n\'est pas inventé.');
      return proposerReprise().then(peindreListe);
    });
  }

  // ── CE QUI EST RÉELLEMENT GARANTI QUAND LA PAGE PART ───────────────────────────────────────
  //
  // `visibilitychange` vers 'hidden' : la page continue de tourner. Le message atteint le
  // worklet, le morceau partiel revient, la transaction IndexedDB a le temps de se clore. En
  // pratique la perte tombe à zéro — mais « en pratique » n'est pas « garanti ».
  //
  // `pagehide` : le dernier instant où du code tourne encore. Le message part, mais une
  // transaction IndexedDB est ASYNCHRONE : si le navigateur tue la page avant `oncomplete`, le
  // morceau partiel est perdu. C'est du meilleur effort, pas une garantie.
  //
  // Panne, SIGKILL, batterie à plat : rien ne tourne, rien n'est poussé.
  //
  // CE QUI EST GARANTI, DANS TOUS LES CAS : la perte est bornée par UN morceau — au plus
  // 5 secondes avec la taille par défaut — parce que tout morceau plein est déjà écrit. C'est la
  // seule affirmation que ce code peut tenir, et c'est celle que le rapport écrit.
  function brancherSorties() {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && _etat.enPrise && _etat.noeud) {
        journaliser('page masquée', echantillonsCourants());
        _etat.noeud.port.postMessage({ type: 'vider-maintenant', raison: 'visibilitychange' });
      }
    });
    window.addEventListener('pagehide', function () {
      if (_etat.enPrise && _etat.noeud) {
        journaliser('page déchargée', echantillonsCourants());
        _etat.noeud.port.postMessage({ type: 'vider-maintenant', raison: 'pagehide' });
      }
    });
  }

  function attendre(predicat, msMax) {
    var depart = Date.now();
    return new Promise(function (resolut, rejet) {
      (function tour() {
        if (predicat()) { resolut(true); return; }
        if (Date.now() - depart > msMax) { rejet(new Error('attente dépassée : ' + msMax + ' ms')); return; }
        setTimeout(tour, 10);
      })();
    });
  }

  function telecharger(nom, blob) {
    var u = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = u; a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 10000);
  }

  // ── BRANCHEMENT ────────────────────────────────────────────────────────────────────────────
  function brancher(boite, servicesDuCoeur) {
    // (T3 bis) LES ÉCOUTEURS DU DIAGNOSTIC D'ABORD : le dernier geste et les changements de
    // périphérique doivent être connus AVANT le premier événement de piste, sinon le premier
    // incident serait justement celui qu'on ne pourrait pas expliquer.
    brancherLeDiagnostic();
    _services = servicesDuCoeur || {};
    _boite = boite;
    boite.innerHTML = gabarit();

    var selTaille = q('[data-taille-morceau]');
    TAILLES_MORCEAU_S.forEach(function (s) {
      var o = document.createElement('option');
      o.value = String(s);
      o.textContent = s + ' s (' + (s * 48000) + ' échantillons, ' + (s * 96000 / 1000) + ' ko, ' +
        (s * 48000 / 128) + ' blocs)';
      selTaille.appendChild(o);
    });
    selTaille.value = String(TAILLE_MORCEAU_S_DEFAUT);
    selTaille.addEventListener('change', function () {
      _etat.tailleMorceau_s = parseFloat(selTaille.value);
      // La taille ne passe au worklet qu'à la construction du graphe : il faut donc le
      // reconstruire. L'erreur est rapportée plutôt qu'avalée — un graphe qui n'a pas été
      // reconstruit laisserait la prise suivante sur l'ancienne taille, en silence.
      if (_etat.flux) {
        brancherGraphe().catch(function (e) {
          message('graphe', 'error', 'Le graphe audio n\'a pas pu être reconstruit après le '
            + 'changement de taille : ' + (e && e.message) + '. La taille précédente reste en place.');
        });
      }
    });

    q('[data-reglage-canal]').addEventListener('change', function () {
      _etat.reglageCanal = q('[data-reglage-canal]').value;
      if (_etat.noeud) _etat.noeud.port.postMessage({ type: 'reglage-canal', canal: _etat.reglageCanal });
    });

    q('[data-action="autoriser"]').addEventListener('click', function () {
      autoriser(q('[data-micro]').value || null).catch(function () {});
    });
    q('[data-micro]').addEventListener('change', function () {
      if (_etat.flux) autoriser(q('[data-micro]').value || null).catch(function () {});
    });
    q('[data-action="demarrer"]').addEventListener('click', function () {
      // (E2, E10) LE REBOURS D'ABORD, LA PRISE ENSUITE — « avant chaque prise, y compris les
      // reprises ». Le bouton est caché pendant le rebours : cliquer deux fois lancerait deux
      // rebours et deux prises.
      var b = q('[data-action="demarrer"]');
      b.hidden = true;
      compteARebours().then(function (reb) {
        _etat.rebours = reb;
        return demarrer();
      }).catch(function (e) {
        b.hidden = false;
        message('demarrage', 'error', 'La prise n\'a pas démarré : ' + (e && e.message));
      });
    });
    q('[data-action="arreter"]').addEventListener('click', function () {
      arreter().catch(function (e) {
        message('arret', 'error', 'L\'arrêt n\'a pas abouti : ' + (e && e.message) +
          '. La prise reste inachevée plutôt que d\'être annoncée terminée.');
      });
    });
    // ── (E12 / E4) LA PAUSE : LE BOUTON ET LA TOUCHE, UNE SEULE FONCTION ──────────────────
    q('[data-action="pause"]').addEventListener('click', function () {
      basculerPause('demandée').catch(function (e) {
        message('pause', 'error', 'La pause n\'a pas abouti : ' + (e && e.message));
      });
    });
    // ── (E4, E9, T14, T3 ter) UN SEUL POINT DE DÉCISION POUR TOUTES LES TOUCHES ───────────
    //
    // IL Y AVAIT DEUX ÉCOUTEURS, et c'était la cause du défaut. Chacun portait sa propre garde
    // « le curseur est-il dans un champ ? », chacun décidait pour son compte, et aucun ne
    // comptait. La prise de 52 secondes du 17 octobre a perdu quatre repères sur six sans que
    // rien ne le dise, parce que la garde du second écouteur renvoyait avant le module : le
    // curseur était resté dans la zone de texte après le collage du texte. Deux gardes pour une
    // même question, c'est #11(f) ; et une décision qui ne laisse pas de trace, c'est un défaut
    // qu'on ne peut pas chercher.
    //
    // LA POLITIQUE DE CHRISTOPHE (17 octobre), et elle comble un silence du CDC : E4 dit que la
    // flèche droite pose le marqueur, T14 que les repères se posent « où l'utilisateur le
    // souhaite, EN DIRECT » ; ni l'un ni l'autre ne parle du focus.
    //   — PENDANT UNE PRISE, les touches de pilotage (flèches, Page suivante et précédente,
    //     Espace, touche apprise) sont reçues par la page QUEL QUE SOIT l'élément focalisé.
    //     Conséquence assumée : pendant une prise, ces touches appartiennent à la prise, et non
    //     au champ qui a le focus. On n'écrit pas pendant qu'on enregistre.
    //   — AU DÉMARRAGE, le champ de texte perd le focus et passe en lecture seule jusqu'à
    //     l'arrêt (voir `demarrer` et `arreter`) : le curseur ne peut plus y être, et le texte
    //     que la bande affiche ne peut plus changer sous les pieds de la prise.
    //   — HORS PRISE, la saisie dans un champ n'est JAMAIS interceptée : taper un espace dans
    //     le nom de la prise écrit un espace.
    document.addEventListener('keydown', function (ev) {
      var role = roleDeLaTouche(ev);
      var cible = ev.target;
      var dansUnChamp = !!(cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA'
                                     || cible.tagName === 'SELECT' || cible.isContentEditable));

      // L'APPRENTISSAGE PASSE AVANT TOUT ET PARTOUT : Christophe vient de cliquer « Apprendre
      // une touche », la frappe qui suit est sa réponse, où que soit le curseur.
      if (role === 'apprentissage-pause') {
        ev.preventDefault();
        _etat.toucheBascule = ev.key;
        _etat.apprendLaTouche = false;
        var champ = q('[data-touche]');
        if (champ) champ.value = (ev.key === ' ' ? 'Espace' : ev.key);
        message('touche', 'info', 'La touche de pause est maintenant « '
          + (ev.key === ' ' ? 'Espace' : ev.key) + ' ».');
        if (_etat.enPrise) journaliserLaTouche(ev, role, true, 'touche de pause apprise');
        return;
      }
      if (role === 'apprentissage-repere') {
        ev.preventDefault();
        _etat.toucheRepere = ev.key;
        _etat.apprendLaToucheRepere = false;
        var champR = q('[data-touche-repere]');
        if (champR) champR.value = nomDeTouche(ev.key);
        message('touche-repere', 'info', 'La touche de repère est maintenant « '
          + nomDeTouche(ev.key) + ' ».');
        if (_etat.enPrise) journaliserLaTouche(ev, role, true, 'touche de repère apprise');
        return;
      }

      // ── HORS PRISE : ON NE TOUCHE À RIEN DE CE QUE CHRISTOPHE TAPE ──────────────────────
      if (!_etat.enPrise) {
        if (dansUnChamp || role === 'autre') return;
        // Hors prise et hors champ : une touche de pilotage n'a rien à piloter. `poserUnRepere`
        // le dit déjà par un avis ; on l'appelle donc pour que l'avis apparaisse, sans rien
        // inventer ici.
        if (role === 'repere') { ev.preventDefault(); poserUnRepere('touche hors prise'); }
        return;
      }

      // ── PENDANT UNE PRISE ──────────────────────────────────────────────────────────────
      if (role === 'autre') {
        journaliserLaTouche(ev, role, false, 'touche non attribuée');
        return;
      }
      // (E9) LA TOUCHE MAINTENUE NE POSE QU'UN SEUL REPÈRE. `event.repeat` est le seul témoin
      // fiable d'une répétition automatique : un délai ne la distinguerait pas d'un doigt rapide.
      if (ev.repeat) {
        ev.preventDefault();
        _etat.repetitionsIgnorees = (_etat.repetitionsIgnorees || 0) + 1;
        journaliserLaTouche(ev, role, false,
          'répétition automatique d\'une touche maintenue, ignorée (E9)');
        return;
      }
      ev.preventDefault();
      if (role === 'repere') {
        journaliserLaTouche(ev, role, true, 'repère demandé');
        poserUnRepere(ev.key === 'PageDown' ? 'télécommande (Page suivante)' : 'touche '
          + nomDeTouche(ev.key));
        return;
      }
      if (role === 'passage-precedent') {
        // E4 : « la flèche gauche revient SANS EFFACER ». Aucun repère n'est retiré.
        journaliserLaTouche(ev, role, true, 'retour au passage précédent');
        passagePrecedent();
        return;
      }
      if (role === 'pause') {
        journaliserLaTouche(ev, role, true, 'bascule pause / reprise');
        basculerPause('touche').catch(function () {});
        return;
      }
    });
    // ── (R6, R8) LE TEXTE, LA VITESSE, LA TAILLE ───────────────────────────────────────────
    q('[data-texte-bande]').addEventListener('input', relireLeTexte);
    q('[data-vitesse-bande]').addEventListener('change', function () {
      var v = parseFloat(q('[data-vitesse-bande]').value);
      if (isFinite(v) && v > 0) {
        _etat.vitesseBande = v;
        journaliser('vitesse de bande ' + v + ' mots/s', echantillonsCourants(), null);
        peindreBande();
      }
    });
    q('[data-taille-bande]').addEventListener('change', function () {
      // (R8) « grande police » : la taille est RÉGLABLE, et elle s'applique au composant du kit
      // sans le modifier — une propriété en ligne sur l'élément, pas une règle CSS réécrite.
      var t = parseInt(q('[data-taille-bande]').value, 10);
      if (isFinite(t) && t >= 16 && t <= 72) {
        var c = q('[data-bande-courant]');
        if (c) c.style.fontSize = t + 'px';
        var su = q('[data-bande-suivant]');
        if (su) su.style.fontSize = Math.round(t * 0.75) + 'px';
      }
    });

    q('[data-action="apprendre-repere"]').addEventListener('click', function () {
      _etat.apprendLaToucheRepere = true;
      message('touche-repere', 'info', 'Pressez la touche de votre télécommande qui doit poser '
        + 'un repère.');
    });
    q('[data-action="repere"]').addEventListener('click', function () { poserUnRepere('bouton'); });
    q('[data-action="passage-precedent"]').addEventListener('click', passagePrecedent);
    // (R6) AJUSTER UN REPÈRE : délégation sur l'hôte, parce que les boutons sont repeints à
    // chaque changement de la liste et qu'un écouteur par bouton fuirait à chaque peinture.
    q('[data-reperes]').addEventListener('click', function (ev) {
      var cible = ev.target;
      if (!cible || !cible.getAttribute) return;
      var retirer = cible.getAttribute('data-repere-retirer');
      if (retirer !== null) { retirerUnRepere(parseInt(retirer, 10)); return; }
      var recaler = cible.getAttribute('data-repere-recaler');
      if (recaler !== null) {
        recalerUnRepere(parseInt(recaler, 10),
          parseFloat(cible.getAttribute('data-pas-ms')) || 0);
      }
    });
    // (R5) LE SEUIL D'ALERTE : le changer repeint les vitesses, sans refaire la prise.
    q('[data-seuil-vitesse]').addEventListener('change', function () {
      var v = peindreVitesses();
      if (v) {
        journaliser('seuil de vitesse ' + v.seuil_pourCent + ' %', echantillonsCourants(),
          { dureeMinSignificative_s: v.dureeMinSignificative_s,
            regle: 'la durée en dessous de laquelle la vitesse n\'est pas significative découle '
              + 'du seuil : deux repères incertains de l\'antirebond chacun.' });
      }
    });
    // (E10, R7, point 4) REFAIRE UN PASSAGE.
    q('[data-action="refaire-passage"]').addEventListener('click', function () {
      refaireLePassage().catch(function (e) {
        message('reprise', 'error', 'La reprise du passage a échoué : '
          + (e && e.message ? e.message : e));
      });
    });

    q('[data-action="apprendre-touche"]').addEventListener('click', function () {
      _etat.apprendLaTouche = true;
      message('touche', 'info', 'Pressez la touche que vous voulez employer pour la pause.');
    });
    // (E12, point 5) L'IMPORT D'UNE VOIX.
    q('[data-import]').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) return;
      importerWav(f).catch(function () {}).then(function () { ev.target.value = ''; });
    });
    q('[data-action="bruit"]').addEventListener('click', function () {
      if (!_etat.noeud) {
        message('bruit', 'error', 'Autorisez d\'abord le micro : sans lui, il n\'y a rien à mesurer.');
        return;
      }
      var canal = _etat.canalRetenu
        || choisirCanal(fenetreDeDecision().sommes, _etat.reglageCanal).canal;
      _etat.noeud.port.postMessage({ type: 'mesurer-bruit', canal: canal,
        echantillons: Math.round(BRUIT.secondes * _etat.echantillonnage) });
    });
    q('[data-action="rapport"]').addEventListener('click', function () {
      var r = _etat.mesures ||
        rapportDUnePrise(_etat.finDuWorklet, blocsPerdus(0, 0, 0, _etat.echantillonnage || 48000), true, false);
      telecharger('rapport-enregistreur-' + Date.now() + '.json',
        new Blob([JSON.stringify(r, remplacerInfinis, 2)], { type: 'application/json' }));
    });

    boite.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-action]');
      if (!b) return;
      var act = b.getAttribute('data-action');
      var carte = b.closest('[data-prise]');
      if (act === 'wav' && carte) {
        window.VoixStockage.exporterWav(_etat.db, carte.getAttribute('data-prise')).then(function (r) {
          telecharger((carte.getAttribute('data-prise')) + '.wav', r.blob);
          message('wav', 'info', 'WAV exporté : ' + r.nbEchantillons + ' échantillons relus, ' +
            r.nbMorceaux + ' morceaux, ' + r.octets + ' octets, ' + r.echantillonnage + ' Hz' +
            (r.nbEchantillons !== r.echantillonsAnnonces
              ? ' — ATTENTION : la prise annonçait ' + r.echantillonsAnnonces +
                ' échantillons ; l\'en-tête porte le nombre RELU.'
              : ' — conforme à ce que la prise annonçait.'));
        }, function (e) { message('wav', 'error', 'Export WAV refusé : ' + (e && e.message)); });
      } else if (act === 'supprimer' && carte) {
        // T9 : une prise n'est jamais écrasée ; la supprimer demande une confirmation.
        if (!window.confirm('Supprimer définitivement cette prise ? Elle ne sera pas récupérable.')) return;
        window.VoixStockage.supprimerPrise(_etat.db, carte.getAttribute('data-prise')).then(peindreListe);
      } else if (act === 'recuperer') {
        var s = b.closest('[data-reprise-prise]');
        if (s) recuperer(s.getAttribute('data-reprise-prise'));
      } else if (act === 'continuer') {
        // (E12) « Continuer cette prise » : sur une prise terminée, une prise récupérée après
        // crash ou fermeture, une prise importée. Le même chemin pour les trois.
        var hote = b.closest('[data-prise]') || b.closest('[data-reprise-prise]');
        var cible = hote && (hote.getAttribute('data-prise')
                             || hote.getAttribute('data-reprise-prise'));
        if (!cible) return;
        if (!_etat.noeud) {
          message('continuation', 'error', 'Autorisez d\'abord le micro : une prise se continue '
            + 'en enregistrant.');
          return;
        }
        demarrer({ continuer: cible }).then(function () {
          return peindreListe().then(proposerReprise);
        }).catch(function (e) {
          message('continuation', 'error', 'La continuation n\'a pas abouti : ' + (e && e.message)
            + '. La prise n\'a pas été modifiée.');
        });
      } else if (act === 'reprendre-micro') {
        // (E8) « propose Reprendre » : un NOUVEAU getUserMedia, qui exige ce geste-ci.
        reprendreLeMicro().catch(function () {});
      }
    });

    brancherSorties();

    // ── (E13) LES EMPREINTES, CALCULÉES AU CHARGEMENT ──────────────────────────────────────
    // Elles ne dépendent de rien d'autre : ni du micro, ni du stockage. On les lance tout de
    // suite, et la barre d'état les porte dès qu'elles sont là.
    empreintesDesModules((_services && _services.modulesServis) || []).then(function (e) {
      _etat.empreintes = e;
      var el = q('[data-sb-empreintes]');
      if (!el) return;
      el.textContent = e.disponible
        ? 'Version : ' + (e.modules || []).map(function (m) {
            return m.module.replace(/\.js$/, '') + ' ' + (m.courte || '?');
          }).join(' · ')
        : 'Version : ' + e.raison;
    }, function () {});

    return window.VoixStockage.ouvrir().then(function (db) {
      _etat.db = db;
      return window.VoixStockage.demanderPersistance();
    }).then(function (p) {
      _etat.persistance = p;
      var el = q('[data-persistance]');
      if (el) {
        el.textContent = 'Persistance du stockage : demandée → ' + JSON.stringify(p.accordee) +
          ' (persistant avant : ' + JSON.stringify(p.persistantAvant) + ') · quota ' +
          (typeof p.quotaOctets === 'number' ? (p.quotaOctets / 1048576).toFixed(0) + ' Mo' : p.quotaOctets) +
          ' · utilisé ' +
          (typeof p.utiliseOctets === 'number' ? (p.utiliseOctets / 1048576).toFixed(1) + ' Mo' : p.utiliseOctets);
      }
      return proposerReprise();
    }).then(peindreListe).then(function () {
      q('[data-mode]').textContent = 'Prêt';
      return true;
    });
  }

  // JSON.stringify rend `null` pour −Infinity : ce serait précisément le `null` interdit. On
  // écrit la valeur telle qu'elle se lit.
  function remplacerInfinis(cle, valeur) {
    if (typeof valeur === 'number' && !isFinite(valeur)) {
      return valeur === Infinity ? '+∞' : valeur === -Infinity ? '−∞' : 'NaN';
    }
    return valeur;
  }

  window.EnregistreurVoix = {
    brancher: brancher,
    // Surface exposée pour les contrôles : des fonctions PURES, éprouvables sans micro.
    dbfs: dbfs,
    niveauxCanal: niveauxCanal,
    correlation: correlation,
    choisirCanal: choisirCanal,
    blocsPerdus: blocsPerdus,
    fmtTemps: fmtTemps,
    remplacerInfinis: remplacerInfinis,
    TAILLES_MORCEAU_S: TAILLES_MORCEAU_S,
    FREQUENCE_DEMANDEE: FREQUENCE_DEMANDEE, BRUIT: BRUIT,
    FENETRE_CANAL_S: FENETRE_CANAL_S, FENETRE_CANAL_MIN_S: FENETRE_CANAL_MIN_S,
    fusionnerSommes: fusionnerSommes, verdictBruit: verdictBruit,
    _fenetreDeDecision: fenetreDeDecision,
    // (D4) exposée pour que le chiffre périmé s'éprouve à sa SOURCE, sans dépendre de
    // l'ordre d'arrivée des événements — qui diffère d'un moteur à l'autre.
    _echantillonsCourants: echantillonsCourants,
    // Éprouvables à n'importe quelle fréquence, sans ouvrir de périphérique audio : la
    // configuration du Mac de Christophe ne doit dépendre d'aucun test (règle du 11 octobre).
    blocFrequence: blocFrequence,
    descripteurDePrise: descripteurDePrise,
    _centile: centile,
    _etatDeLaPisteMaintenant: etatDeLaPisteMaintenant,
    CORRELATION_MEME_SIGNAL: CORRELATION_MEME_SIGNAL,
    DBFS_QUASI_VIDE: DBFS_QUASI_VIDE,
    // Pour qu'un contrôle lise l'état sans le déduire de l'affichage.
    _etat: function () { return _etat; },
    _demarrer: demarrer,
    // (E12 / T1 ter) exposés pour les contrôles : le chemin réel passe par les boutons et la
    // touche, mais la lecture d'en-tête et le rééchantillonnage sont des fonctions pures qu'un
    // contrôle doit pouvoir éprouver sans micro et sans périphérique.
    _basculerPause: basculerPause,
    _importerWav: importerWav,
    lireEnTeteWav: lireEnTeteWav,
    sommesDUnSignal: sommesDUnSignal,
    reechantillonnerPcm: reechantillonnerPcm,
    _relireLesCompteurs: function (id) { return relireLesCompteurs(id); },
    _arreter: arreter,
    // (E10, R7, T3 bis) La lecture de l'amorce est éprouvée dans un contexte DIFFÉRÉ : §44
    // lui passe un OfflineAudioContext, qui n'ouvre aucun périphérique et rend hors du temps.
    _lireLAmorce: _lireLAmorce,
    _refaireLePassage: refaireLePassage,
    _vitessesMaintenant: vitessesMaintenant,
    _recalerUnRepere: recalerUnRepere,
    _retirerUnRepere: retirerUnRepere,
    _poserUnRepere: poserUnRepere,
    _lirePcmDUnePlage: lirePcmDUnePlage,
    // (T3 bis) Le filtre des cinq secondes, pur, et le contexte de l'instant tel qu'il est
    // écrit au journal : un contrôle l'éprouve sans provoquer de vraie perte de micro.
    _changementsRecents: changementsRecents,
    _contexteDeLInstant: contexteDeLInstant,
    _evenementADiagnostiquer: evenementADiagnostiquer,
    FENETRE_DIAGNOSTIC_S: FENETRE_DIAGNOSTIC_S,
    _autoriser: autoriser,
  };
})();
