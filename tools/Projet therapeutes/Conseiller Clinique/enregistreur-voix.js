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
// CE QU'IL NE FAIT PAS AU JALON I : la bande rythmo, les repères, le compte à rebours, les
// prises multiples nommées, la reprise avec amorce (jalon II) ; le chutier, la forme d'onde, les
// coupes, l'import, les avis T6 (jalon III). Rien n'est grisé : ce qui n'existe pas est ABSENT.
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
    var a = { n: 0, canaux: 0, sommeG: 0, sommeD: 0, sommeCarreG: 0, sommeCarreD: 0,
              sommeProduit: 0, creteG: 0, creteD: 0, zerosG: 0, zerosD: 0 };
    (liste || []).forEach(function (x) {
      if (!x || !x.n) return;
      a.n += x.n;
      a.canaux = Math.max(a.canaux, x.canaux || 0);
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
    var toutes = (b.fenetres || []).map(function (f, k) {
      return { index: (typeof f.index === 'number') ? f.index : k,
               debutEchantillon: f.debutEchantillon || 0,
               n: f.n, sommeCarre: f.sommeCarre, sommeCarreGrave: f.sommeCarreGrave,
               zeros: f.zeros, crete: f.crete, partielle: !!f.partielle,
               dansLeSilenceInitial: !!f.dansLeSilenceInitial,
               niveau: niveauDeFenetre(f) };
    });
    var pleines = toutes.filter(function (f) { return !f.partielle; });
    var initiales = pleines.filter(function (f) { return f.dansLeSilenceInitial; });

    var efficaceFenetreEntiere = Math.sqrt(b.sommeCarre / b.n);
    var dbFenetreEntiere = dbfs(efficaceFenetreEntiere);

    // AUCUNE FENÊTRE LIVRÉE : on le dit. Cela arrive si la mesure a été interrompue avant la
    // première frontière de 100 ms. Un plancher calculé sur rien serait un chiffre sans mesure.
    if (!pleines.length) {
      return { mesure: true, echantillons: b.n, etat: 'non concluant',
               raison: 'la mesure s\'est arrêtée avant la première fenêtre de 100 ms : '
                 + b.n + ' échantillons reçus, aucune fenêtre complète',
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
      population = pleines.filter(function (f) { return f.niveau !== null; });
      source = 'aucune pause d\'une seconde : toute la prise';
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
    '<span class="sc-bm-badge">Banc · jalon I</span>' +
    '<label class="sc-bm-video-title"><span class="sc-bm-sr">Nom de la prise</span>' +
      '<input class="sc-bm-input" data-nom-prise value="Prise d\'essai" aria-label="Nom de la prise"/></label>' +
    '<span class="sc-bm-top-save" data-etat-stockage>Voix conservée sur cet ordinateur</span>' +
  '</header>' +
  '<div class="sc-bm-screen-record-layout">' +
    '<section class="sc-bm-panel sc-bm-record-main">' +
      '<header class="sc-bm-panel-title"><h2>Votre voix, à votre rythme</h2>' +
        '<span class="sc-bm-badge" data-mode>Prêt</span></header>' +

      // ── (D2 / E8) L'ALERTE A SA PROPRE ZONE, ET ELLE EST LA PREMIÈRE ────────────────────
      // E8 : « l'alerte reste affichée, FIXÉE EN HAUT DE LA FENÊTRE, tant que le signal
      // manque ». Deux défauts du relevé d'essais sont ici : l'alerte n'était pas fixée, et les
      // avis d'opérations passées (« Prise récupérée », « WAV exporté ») s'empilaient
      // AU-DESSUS d'elle et la repoussaient hors de vue. Une zone séparée, placée avant les
      // avis dans le document, rend le second défaut impossible par construction plutôt que
      // par vigilance. Le `position: sticky` est posé en ligne sur un conteneur que ce module
      // crée : aucun composant du kit n'est modifié.
      '<div data-alerte style="position:sticky;top:0;z-index:5"></div>' +
      '<div data-messages></div>' +

      // (D2) L'INTITULÉ EST UNE VARIABLE, PAS UN MOT FIGÉ : « Enregistrement 01:16,221 » restait
      // affiché après l'arrêt, ce qui laissait croire que la prise courait encore.
      '<div class="sc-bm-recording" aria-live="polite" data-chrono-ligne hidden>' +
        '<span data-chrono-intitule>Enregistrement</span> ' +
        '<span class="sc-bm-time" data-chrono>00:00,000</span></div>' +

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
        '<button type="button" class="sc-bm-button sc-bm-button--secondary" data-action="arreter" data-lot="3" hidden>' +
          '<svg class="sc-bm-icon" aria-hidden="true"><use href="#icon-stop"></use></svg>Arrêter la prise</button>' +
        '<button type="button" class="sc-bm-button sc-bm-button--secondary" data-action="autoriser" data-lot="3">' +
          '<svg class="sc-bm-icon" aria-hidden="true"><use href="#sc-bm-icon-mic"></use></svg>Autoriser le micro</button>' +
        '<button type="button" class="sc-bm-button sc-bm-button--secondary" data-action="bruit" data-lot="3">' +
          '<svg class="sc-bm-icon" aria-hidden="true"><use href="#sc-bm-icon-mic"></use></svg>Mesurer le bruit de la pièce</button>' +
      '</div>' +
      '<p class="sc-bm-help">Le jalon I ne pose aucun repère et n\'affiche aucune bande rythmo : ' +
        'ils arrivent au jalon II. Rien n\'est grisé — ce qui n\'existe pas est absent.</p>' +
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
  '</footer>' +
'</div>';
  }

  function q(sel) { return _boite ? _boite.querySelector(sel) : null; }

  // LES CLÉS QUI VONT DANS LA ZONE D'ALERTE, et non parmi les avis : celles qui décrivent un
  // signal ou un périphérique qui manque MAINTENANT. Écrite une fois, ici, pour qu'un avis
  // ajouté demain ne se retrouve pas par hasard au-dessus d'une alerte.
  var CLES_ALERTE = { muet: true, piste: true, contexte: true, 'prise-muette': true };

  function message(cle, etat, texte) {
    var hote = q(CLES_ALERTE[cle] ? '[data-alerte]' : '[data-messages]');
    if (!hote) return;
    var el = hote.querySelector('[data-cle="' + cle + '"]');
    if (!texte) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.className = 'sc-bm-message';
      el.setAttribute('role', 'status');
      el.setAttribute('data-cle', cle);
      el.innerHTML = '<svg class="sc-bm-icon" aria-hidden="true"><use></use></svg><span></span>';
      hote.appendChild(el);
    }
    el.setAttribute('data-state', etat);
    // L'icône suit l'état : une information ne porte pas le triangle d'une alerte. Les deux
    // symboles viennent du sprite du kit, aucun n'est dessiné ici.
    el.querySelector('use').setAttribute('href', etat === 'info' ? '#icon-info' : '#icon-warning');
    el.querySelector('span').textContent = texte;
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
      _etat.ecrituresEnVol = _etat.ecrituresEnVol.then(function () {
        return window.VoixStockage.ecrireMorceau(_etat.db, priseId, idx, debut, pcm, partiel);
      }).then(function () {
        _etat.morceauxEcrits++;
        _etat.echantillonsEcrits += pcm.byteLength / 2;
        var sb = q('[data-sb-morceaux]');
        if (sb) sb.textContent = _etat.morceauxEcrits + (_etat.morceauxEcrits > 1 ? ' morceaux' : ' morceau') +
          ' · ' + (_etat.echantillonsEcrits * 2 / 1048576).toFixed(2) + ' Mo écrits';
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
        };
        // L'AFFICHAGE VIENT ICI, et pas plus haut : plus haut, `_etat.microphone` n'est pas
        // encore renseigné et la barre d'état montrait « Micro : — » alors que le rapport portait
        // le bon nom. Un contrôle qui compare la page au rapport l'a dit.
        var sbm = q('[data-sb-micro]');
        if (sbm) sbm.textContent = 'Micro : ' + _etat.microphone.nom;
        _etat.ouverturePiste = journaliser('piste ouverte', 0, {
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
    var r = _etat.dernierReleve;
    var duReleve = (r && typeof r.echantillonsEcrits === 'number') ? r.echantillonsEcrits : 0;
    // Le relevé est plus fin que le compte de morceaux (toutes les 50 ms contre toutes les 5 s) ;
    // le compte de morceaux est plus sûr. On prend le plus avancé des deux, qui est toujours une
    // position de CETTE prise.
    return Math.max(duReleve, _etat.echantillonsEcrits);
  }

  // ── DÉMARRER, ARRÊTER ──────────────────────────────────────────────────────────────────────

  function demarrer() {
    if (_etat.enPrise) return Promise.resolve(null);
    if (!_etat.noeud) return Promise.reject(new Error('micro non autorisé : rien à enregistrer'));

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

    var id = 'prise-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    var nom = (q('[data-nom-prise]') && q('[data-nom-prise]').value) || 'Prise';
    _etat.priseId = id;
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
    // (d) LES FENÊTRES D'UNE PRISE N'APPARTIENNENT QU'À ELLE. Les garder d'une prise à l'autre
    // aurait fait exactement ce que le défaut 4 reproche au compteur d'échantillons : décrire la
    // prise précédente en croyant décrire celle-ci.
    _etat.bruitSommes = null;
    _etat.fenetresBruit = [];
    _etat.bruitProvisoireRendu = false;
    _etat.bruit = null;
    viderTousLesAvis();

    return (_etat.ctx.state === 'suspended' ? _etat.ctx.resume() : Promise.resolve()).then(function () {
      _etat.debutPrise_ctxTemps = _etat.ctx.currentTime;
      // ORDRE VOULU : on démarre le worklet D'ABORD, et on n'écrit la prise qu'une fois qu'il a
      // accusé réception. C'est lui qui connaît la taille de morceau réellement appliquée (un
      // multiple entier de 128), et la prise doit porter CETTE valeur, pas celle qu'on a
      // demandée. Un morceau peut arriver avant la fin de l'écriture de la prise : les écritures
      // de morceaux sont chaînées derrière cette promesse, donc l'ordre est tenu.
      _etat.enPrise = true;
      _etat.noeud.port.postMessage({ type: 'demarrer-prise', canal: dec.canal });
      return attendre(function () { return _etat.priseDemarreeRecue; }, 5000);
    }).then(function () {
      var creation = window.VoixStockage.creerPrise(_etat.db, {
        id: id,
        nom: nom,
        creeLe: new Date().toISOString(),
        echantillonnage: _etat.echantillonnage,
        canaux: (_etat.sommesAnalyse && _etat.sommesAnalyse.canaux) || _etat.canaux || 0,
        canalRetenu: dec.canal,
        canalRaison: dec.raison,
        reglageCanal: _etat.reglageCanal,
        // (c) UNE SEULE GRANDEUR : la taille EFFECTIVE, celle que le worklet applique, un nombre
        // entier de blocs de 128. La taille nominale de 5 s n'est écrite NI dans la prise NI
        // dans le rapport : c'est une consigne d'interface, pas un fait de la prise, et la garder
        // à côté de la valeur réelle faisait deux vérités pour une même grandeur — 220 500 contre
        // 220 544 à 44 100 Hz. Un contrôle vérifie que le rapport et le journal donnent la même.
        echantillonsParMorceau: _etat.echantillonsParMorceauReels,
        nbEchantillons: 0,
        nbMorceaux: 0,
        // 'en-cours' : si la page meurt maintenant, le prochain chargement la trouvera ainsi et
        // la PROPOSERA à la reprise (E5). Une prise 'en-cours' n'est jamais réussie.
        etat: 'en-cours',
        journal: [],
      });
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
      journaliser('prise démarrée', 0, { canal: dec.canal, raison: dec.raison,
        echantillonsParMorceau: _etat.echantillonsParMorceauReels });
      // (d) T13 : LE BRUIT SE MESURE PENDANT LE SILENCE INITIAL, donc sur les premières
      // secondes de la prise — pas sur une fenêtre d'avant, qui ne serait pas dans le fichier.
      _etat.bruit = null;
      _etat.noeud.port.postMessage({ type: 'mesurer-bruit', canal: dec.canal,
        echantillons: Math.round(BRUIT.secondes * _etat.echantillonnage) });
      return id;
    }, function (err) {
      _etat.enPrise = false;
      throw err;
    });
  }

  function arreter() {
    if (!_etat.enPrise) return Promise.resolve(null);
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
        perdus.latenceDuDemarrage_ms = (typeof _etat.debutTempsWorklet === 'number')
          ? Math.round((_etat.debutTempsWorklet - _etat.debutPrise_ctxTemps) * 1000)
          : 'non mesurée';

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
          return peindreListe().then(function () { return mesures; });
        });
      });
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
      frequence: {
        reelle_hz: _etat.echantillonnage,
        demandee: FREQUENCE_DEMANDEE === null ? 'aucune (fréquence native du périphérique)'
                                              : FREQUENCE_DEMANDEE,
        native: FREQUENCE_DEMANDEE === null,
        aReechantillonnerAuLot4: _etat.echantillonnage !== 48000,
        regle: 'le lot 4 rééchantillonne à 48 000 Hz toute prise qui n\'y est pas, avec un avis '
          + 'visible. Mesuré le 10 octobre : Chromium et WebKit honorent tous deux '
          + '`new AudioContext({ sampleRate: 48000 })`, mais la piste du micro reste à sa propre '
          + 'fréquence et le contexte interpole en amont — d\'où le choix du natif, pour que la '
          + 'prise porte la fréquence où la voix est née.',
      },
      // (e) LE PÉRIPHÉRIQUE ET LES LATENCES, mesurés et non devinés.
      microphone: _etat.microphone || 'indisponible (aucune piste réelle : source de fixture)',
      latences: _etat.latences || 'non relevées',
      contexteAudio: {
        echantillonnage: _etat.echantillonnage,
        etat: _etat.ctx ? _etat.ctx.state : 'indisponible',
      },
      echantillonnage: _etat.echantillonnage,
      canauxALEntree: s ? s.canaux : 0,
      canalRetenu: _etat.canalRetenu,
      raisonDuCanal: (_etat.verificationCanal && _etat.verificationCanal.raisonSurLaPrise)
        || _etat.canalRaison,
      // (b) LA VÉRIFICATION, et la fenêtre sur laquelle la décision a été prise.
      verificationDuCanal: _etat.verificationCanal || 'non vérifié',
      reglageCanal: _etat.reglageCanal,
      // (d) LE BRUIT DE PIÈCE (T13), jamais bloquant.
      bruitDePiece: _etat.bruit || 'non mesuré',
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
      ecartVuEcrit: fin ? (fin.echantillonsVus - _etat.echantillonsEcrits) : null,
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
              '<button type="button" class="sc-bm-button sc-bm-button--secondary" data-action="wav" data-lot="3">Exporter en WAV</button>' +
              '<button type="button" class="sc-bm-button sc-bm-button--destructive" data-action="supprimer" data-lot="3">Supprimer</button>' +
            '</div>';
          el.querySelector('h2').textContent = p.nom || p.id;
          el.querySelector('.sc-bm-badge').textContent =
            p.etat === 'terminee' ? 'Terminée'
            : p.etat === 'muette' ? 'MUETTE'
            : p.etat === 'signal-perdu' ? 'SIGNAL PERDU'
            : 'Inachevée';
          el.querySelector('[data-detail]').textContent =
            dur + ' · ' + vrai.nbMorceaux + ' morceaux · ' +
            (vrai.nbEchantillons * 2 / 1048576).toFixed(2) + ' Mo · ' +
            (p.echantillonnage || 0) + ' Hz · ' + nomCanal(p.canalRetenu) +
            ' · ' + (p.creeLe || '').replace('T', ' ').slice(0, 19) +
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
      var ech = 0, nb = 0;
      return window.VoixStockage.parcourirMorceaux(_etat.db, p.id, function (m) {
        nb++; ech += m.pcm.byteLength / 2;
      }).then(function () {
        hote.innerHTML = '<section class="sc-bm-resume" data-lot="3" data-reprise-prise="' + p.id + '">' +
          '<header class="sc-bm-panel-title"><h2>Reprendre la prise interrompue</h2>' +
          '<span class="sc-bm-badge">Inachevée</span></header>' +
          '<p data-reprise-detail></p>' +
          '<div class="sc-bm-row">' +
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
      demarrer().catch(function (e) {
        message('demarrage', 'error', 'La prise n\'a pas démarré : ' + (e && e.message));
      });
    });
    q('[data-action="arreter"]').addEventListener('click', function () {
      arreter().catch(function (e) {
        message('arret', 'error', 'L\'arrêt n\'a pas abouti : ' + (e && e.message) +
          '. La prise reste inachevée plutôt que d\'être annoncée terminée.');
      });
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
      }
    });

    brancherSorties();

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
    _centile: centile,
    _etatDeLaPisteMaintenant: etatDeLaPisteMaintenant,
    CORRELATION_MEME_SIGNAL: CORRELATION_MEME_SIGNAL,
    DBFS_QUASI_VIDE: DBFS_QUASI_VIDE,
    // Pour qu'un contrôle lise l'état sans le déduire de l'affichage.
    _etat: function () { return _etat; },
    _demarrer: demarrer,
    _arreter: arreter,
    _autoriser: autoriser,
  };
})();
