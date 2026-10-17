// ── LOT 3, JALON II — LA BANDE RYTHMO : LA LOGIQUE, ET RIEN QUE LA LOGIQUE ──────────────────
//
// Ce fichier ne touche ni au DOM, ni à l'audio, ni au stockage. Il ne contient que des fonctions
// PURES : un texte entre, des passages sortent ; un indice d'échantillon entre, une position de
// bande sort. C'est voulu, pour deux raisons.
//
// LA PREMIÈRE est R6, qui tient en six mots : « Le défilement suit l'horloge audio, jamais celle
// de l'interface. » Une position calculée à partir d'un indice d'échantillon ne PEUT pas suivre
// l'horloge de l'interface : elle n'y a pas accès. La séparation n'est pas une élégance, c'est la
// garantie elle-même — et un contrôle (§38) vérifie qu'en pause, où le temps du mur avance et
// l'horloge audio s'arrête, la bande ne bouge pas d'un mot.
//
// LA SECONDE est qu'un découpage de texte et un calcul de durée s'éprouvent sans navigateur, sans
// micro et sans périphérique. Tout ce qui est ici est décidable par le calcul.
(function () {
  'use strict';

  // ── LA VITESSE, ET D'OÙ ELLE VIENT ────────────────────────────────────────────────────────
  // R6 : « défilement à vitesse constante et réglable (2,5 mots par seconde par défaut, comme en
  // N3) ». 2,5 mots par seconde, soit 150 mots par minute, est le débit d'une lecture posée —
  // celui que Christophe a retenu au lot N3 et que le CDC reprend. C'est un réglage, pas une loi.
  var VITESSE_DEFAUT = 2.5;

  // R8 : « une marque de pause dans le texte ajoute un silence réglable et n'est pas lue ».
  // `[pause]` prend cette durée ; `[pause 2 s]` prend la sienne. Deux secondes par défaut, parce
  // qu'une respiration entre deux idées en prend à peu près autant.
  var PAUSE_DEFAUT_S = 2;

  // E9 : « deux repères à moins d'un délai court (à régler, 250 ms au départ) sont signalés ».
  // Constaté au lot 0 : quatre repères en 0,3 s, c'est-à-dire une touche qui rebondit.
  var ANTIREBOND_MS_DEFAUT = 250;

  // ── LE DÉCOUPAGE D'UN TEXTE EN PASSAGES ───────────────────────────────────────────────────
  //
  // UNE LIGNE, UN PASSAGE. Le prompt dit « texte de la narration (lot 1a) découpé en passages par
  // étape (ou texte collé) » : au banc, c'est du texte collé, et la frontière la plus naturelle
  // — celle que Christophe verra en collant son texte — est la fin de ligne. Les lignes vides
  // sont ignorées : un double saut de ligne sépare sans créer un passage fantôme.
  //
  // CE QUE CE DÉCOUPAGE NE FAIT PAS : il ne devine aucune frontière à l'intérieur d'une ligne.
  // T14 est explicite — « les repères se posent où l'utilisateur le souhaite, sans grille ni
  // ordre imposé ». Un découpage automatique par phrase imposerait une grille.
  function decouperEnPassages(texte, options) {
    var o = options || {};
    var pauseDefaut = (typeof o.pauseDefaut_s === 'number') ? o.pauseDefaut_s : PAUSE_DEFAUT_S;
    var lignes = String(texte == null ? '' : texte).split(/\r?\n/);
    var passages = [];
    lignes.forEach(function (ligne, numeroDeLigne) {
      var brut = ligne.trim();
      if (!brut) return;
      var marques = lireLesMarquesDePause(brut, pauseDefaut);
      var mots = marques.texteSansMarques.split(/\s+/).filter(function (m) { return m.length > 0; });
      passages.push({
        index: passages.length,
        ligne: numeroDeLigne + 1,
        texte: brut,
        // CE QUI SE LIT, sans les marques : c'est ce texte que la bande montre, et c'est sur lui
        // que les mots se comptent. R8 : une marque de pause « n'est pas lue ».
        // Les espaces laissés par une marque retirée sont ramenés à un seul : sans cela le
        // texte affiché porterait des trous là où Christophe a écrit « [pause] », et il les
        // lirait comme des hésitations.
        texteLu: marques.texteSansMarques.replace(/\s+/g, ' ').trim(),
        mots: mots,
        nbMots: mots.length,
        pauses: marques.pauses,
        secondesDePause: marques.secondesDePause,
      });
    });
    return passages;
  }

  // ── LES MARQUES DE PAUSE ──────────────────────────────────────────────────────────────────
  //
  // `[pause]` et `[pause 2 s]`, et rien d'autre : la forme est écrite ici, une seule fois. Une
  // marque mal formée — `[Pause]`, `[pause 2]`, `[pause deux secondes]` — n'est PAS silencieuse :
  // elle est rendue telle quelle avec sa raison, parce qu'une marque qu'on croit comprise et
  // qu'on ignore est un silence qui manquera dans la voix sans que personne l'ait voulu.
  var MARQUE = /\[\s*pause(?:\s+([0-9]+(?:[.,][0-9]+)?)\s*s)?\s*\]/gi;

  function lireLesMarquesDePause(texte, pauseDefaut) {
    var pauses = [];
    var secondes = 0;
    var sansMarques = String(texte).replace(MARQUE, function (tout, duree) {
      var s = (duree === undefined) ? pauseDefaut : parseFloat(String(duree).replace(',', '.'));
      if (!isFinite(s) || s < 0) s = pauseDefaut;
      pauses.push({ forme: tout, secondes: s });
      secondes += s;
      return ' ';
    });
    return { texteSansMarques: sansMarques, pauses: pauses, secondesDePause: secondes };
  }

  // Les formes qui RESSEMBLENT à une marque sans en être une. Rendues pour être DITES, jamais
  // interprétées : c'est à Christophe de corriger son texte, pas à ce code de deviner.
  var MARQUE_DOUTEUSE = /\[[^\]]*pause[^\]]*\]/gi;

  function marquesDouteuses(texte) {
    var douteuses = [];
    String(texte == null ? '' : texte).replace(MARQUE_DOUTEUSE, function (tout) {
      // Une marque bien formée n'est pas douteuse : on la reconnaît en la relisant seule.
      MARQUE.lastIndex = 0;
      var bienFormee = new RegExp('^' + MARQUE.source + '$', 'i').test(tout);
      if (!bienFormee) douteuses.push(tout);
      return tout;
    });
    return douteuses;
  }

  // ── LA DURÉE D'UN PASSAGE ─────────────────────────────────────────────────────────────────
  // Les mots à la vitesse choisie, plus les silences des marques. Rien d'autre : R7 dit que
  // « les mots d'un passage sont répartis proportionnellement » et que « seules les limites de
  // passage sont exactes ». On ne prétend donc pas placer chaque mot.
  function dureeDUnPassage(passage, vitesse) {
    var v = (typeof vitesse === 'number' && vitesse > 0) ? vitesse : VITESSE_DEFAUT;
    return passage.nbMots / v + passage.secondesDePause;
  }

  function dureeTotale(passages, vitesse) {
    return (passages || []).reduce(function (t, p) { return t + dureeDUnPassage(p, vitesse); }, 0);
  }

  // ── LA POSITION DE LA BANDE, FONCTION D'UN INDICE D'ÉCHANTILLON ───────────────────────────
  //
  // C'EST LE CŒUR DE R6, et sa signature le dit : cette fonction prend un indice d'échantillon et
  // une fréquence, et rien qui ressemble à une horloge d'interface. Elle ne peut pas suivre le
  // temps du mur, puisqu'elle ne le voit pas. En pause, l'indice d'échantillon ne bouge pas (§30
  // le prouve) : la position ne bouge donc pas non plus, et la bande se fige comme E12 l'exige.
  //
  // `motsEcoules` est un nombre à virgule : c'est la position du curseur DANS le texte, pas un
  // compte de mots prononcés. Le curseur est fixe (R8) et c'est le texte qui défile sous lui.
  function positionDeLaBande(echantillon, echantillonnage, passages, vitesse, options) {
    var o = options || {};
    var v = (typeof vitesse === 'number' && vitesse > 0) ? vitesse : VITESSE_DEFAUT;
    var hz = (typeof echantillonnage === 'number' && echantillonnage > 0) ? echantillonnage : 0;
    var liste = passages || [];
    if (!hz) {
      return {
        calageSur: 'horloge audio (indice d\'échantillon) — fréquence inconnue, bande à l\'arrêt',
        positionEchantillon: 0, secondes: 0, motsEcoules: 0,
        passageCourant: 0, offsetDansLePassage_s: 0, partDuPassage: 0,
        vitesseMotsParSeconde: v, nbPassages: liste.length,
        termine: false, passageAffiche: liste[0] ? liste[0].texteLu : '',
        passageSuivant: liste[1] ? liste[1].texteLu : '',
      };
    }
    var ech = Math.max(0, Math.round(echantillon || 0));
    var secondes = ech / hz;
    // Le DÉCALAGE d'un retour de passage (R6 : « retour d'un passage ») : la bande repart au
    // début du passage demandé sans que l'horloge audio recule — on ne peut pas défaire des
    // échantillons déjà écrits. Le décalage est donc une grandeur de la BANDE, dite comme telle.
    var decalage_s = (typeof o.decalage_s === 'number') ? o.decalage_s : 0;
    var surLaBande = Math.max(0, secondes - decalage_s);

    var reste = surLaBande;
    var index = 0;
    var mots = 0;
    for (; index < liste.length; index++) {
      var d = dureeDUnPassage(liste[index], v);
      if (reste < d || index === liste.length - 1) break;
      reste -= d;
      mots += liste[index].nbMots;
    }
    var courant = liste[index] || null;
    var dureeCourant = courant ? dureeDUnPassage(courant, v) : 0;
    // Dans le passage courant, les mots avancent à la vitesse choisie, les silences ne comptent
    // pas comme des mots. On ne répartit donc pas les mots sur les silences : un passage qui
    // porte une pause de deux secondes garde ses mots au même débit, et la pause s'ajoute.
    var motsDansLePassage = Math.min(courant ? courant.nbMots : 0,
      Math.max(0, (reste - 0) * v));
    return {
      calageSur: 'horloge audio (indice d\'échantillon)',
      positionEchantillon: ech,
      secondes: secondes,
      secondesSurLaBande: surLaBande,
      decalage_s: decalage_s,
      motsEcoules: mots + motsDansLePassage,
      passageCourant: index,
      offsetDansLePassage_s: reste,
      partDuPassage: dureeCourant > 0 ? Math.min(1, reste / dureeCourant) : 0,
      vitesseMotsParSeconde: v,
      nbPassages: liste.length,
      termine: liste.length > 0 && index === liste.length - 1 && reste >= dureeCourant,
      passageAffiche: courant ? courant.texteLu : '',
      passageSuivant: liste[index + 1] ? liste[index + 1].texteLu : '',
      regle: 'la position vient de l\'indice d\'échantillon du fil audio, divisé par la fréquence '
        + 'réelle, puis parcouru passage par passage à la vitesse choisie. L\'horloge de '
        + 'l\'interface n\'entre dans ce calcul à aucun moment (R6).',
    };
  }

  // ── L'ANTIREBOND DES REPÈRES (E9) ─────────────────────────────────────────────────────────
  //
  // Constaté au lot 0 : quatre repères en 0,3 s. Deux causes, deux remèdes, et il faut les deux :
  // la répétition automatique d'une touche maintenue (que `event.repeat` signale, et qu'on
  // ignore) et le rebond mécanique ou le doigt qui tremble (que seul un délai attrape).
  //
  // LE DÉLAI SE COMPTE EN ÉCHANTILLONS, pas en millisecondes d'horloge : c'est la même raison
  // qu'en R6, et c'est la seule façon de comparer deux repères qui sont eux-mêmes datés en
  // échantillons. 250 ms à 48 kHz font 12 000 échantillons, à 44,1 kHz 11 025.
  function antirebond(dernierEchantillon, nouveauEchantillon, echantillonnage, delai_ms) {
    var ms = (typeof delai_ms === 'number' && delai_ms >= 0) ? delai_ms : ANTIREBOND_MS_DEFAUT;
    var hz = (typeof echantillonnage === 'number' && echantillonnage > 0) ? echantillonnage : 48000;
    var seuil = Math.round((ms / 1000) * hz);
    if (typeof dernierEchantillon !== 'number') {
      return { accepte: true, raison: 'premier repère', ecart: null, seuilEchantillons: seuil };
    }
    var ecart = nouveauEchantillon - dernierEchantillon;
    if (ecart < seuil) {
      return {
        accepte: false,
        raison: 'deux repères à ' + ecart + ' échantillons (' + (ecart / hz * 1000).toFixed(0)
          + ' ms), sous le seuil de ' + ms + ' ms : signalé avant validation (E9)',
        ecart: ecart, seuilEchantillons: seuil,
      };
    }
    return { accepte: true, raison: 'écart suffisant', ecart: ecart, seuilEchantillons: seuil };
  }

  // ── LES TROIS CONTRÔLES DE T6 ─────────────────────────────────────────────────────────────
  //
  // T6 : « Trois contrôles bloquent l'export : le nombre de commentaires attendu, l'ordre
  // croissant des marqueurs, aucun marqueur hors de la durée de la voix. Le lot 3 les calcule et
  // les signale à la fin de la prise ; le blocage effectif de l'export est du lot 4. »
  //
  // Ils sont donc des AVIS ici, jamais des blocages — et la fonction les rend comme des faits
  // chiffrés, pas comme des verdicts : c'est au lot 4 de décider ce qu'il en fait.
  function controlesDeT6(reperes, nbPassagesAttendus, dureeVoix_echantillons) {
    var liste = (reperes || []).map(function (r) {
      return (typeof r === 'number') ? r : r.aEchantillon;
    });
    var croissants = true;
    var premierDesordre = null;
    for (var i = 1; i < liste.length; i++) {
      if (liste[i] <= liste[i - 1]) {
        croissants = false;
        if (premierDesordre === null) premierDesordre = i;
      }
    }
    var horsVoix = liste.filter(function (e) {
      return e < 0 || e > dureeVoix_echantillons;
    });
    // LE NOMBRE ATTENDU : T14 fait d'un repère la FRONTIÈRE entre deux commentaires consécutifs.
    // Pour n passages, il y a n − 1 frontières intérieures ; un repère de fin est facultatif
    // (T14 : « le dernier commentaire se termine à la fin de la voix OU à un repère de fin »).
    // On accepte donc n − 1 ou n, et on le dit, au lieu d'imposer un chiffre unique.
    var attendusMin = Math.max(0, nbPassagesAttendus - 1);
    var attendusMax = Math.max(0, nbPassagesAttendus);
    return {
      nombre: {
        poses: liste.length,
        attendusMin: attendusMin, attendusMax: attendusMax,
        conforme: liste.length >= attendusMin && liste.length <= attendusMax,
        regle: 'un repère est la frontière entre deux commentaires (T14) : pour '
          + nbPassagesAttendus + ' passages il en faut ' + attendusMin + ' à l\'intérieur, et un '
          + 'repère de fin est facultatif, donc ' + attendusMin + ' ou ' + attendusMax + '.',
      },
      ordre: {
        croissants: croissants,
        premierDesordre: premierDesordre === null ? 'sans objet' : premierDesordre,
        conforme: croissants,
        regle: 'les repères sont datés en échantillons : leur ordre doit être strictement '
          + 'croissant, deux repères au même échantillon étant un rebond, non deux frontières.',
      },
      dansLaVoix: {
        horsVoix: horsVoix.length,
        lesquels: horsVoix,
        dureeVoix_echantillons: dureeVoix_echantillons,
        conforme: horsVoix.length === 0,
        regle: 'aucun repère au-delà de la durée de la voix écrite : un repère hors de la voix '
          + 'désignerait une image qui ne dure rien.',
      },
      // T6 LE DIT : ces trois contrôles bloquent l'export AU LOT 4. Ici ils informent.
      bloquantIci: false,
      regle: 'T6 : le lot 3 les calcule et les signale à la fin de la prise ; le blocage effectif '
        + 'de l\'export est du lot 4.',
    };
  }

  // ── LA ZONE D'AMORCE D'UNE REPRISE (E10, R7, point 4 du prompt) ───────────────────────────
  //
  // E10, mode « doublage » : « la piste armée enregistre pendant que la voix qui précède joue aux
  // haut-parleurs et où Christophe enchaîne à la fin de l'amorce ; la fuite des haut-parleurs est
  // alors dans la prise, la zone d'amorce y est marquée et elle se coupe au montage ».
  //
  // La zone d'amorce est donc une grandeur de la PRISE NEUVE — là où la fuite se trouve —, et
  // elle pointe vers la prise SOURCE et la position d'où l'amorce a été jouée. Quatre nombres,
  // tous en échantillons, parce que c'est ainsi que le montage les coupera.
  function zoneDAmorce(args) {
    var a = args || {};
    var hz = a.echantillonnage || 48000;
    var secondes = (typeof a.secondes === 'number' && a.secondes > 0) ? a.secondes : 5;
    var disponibles = Math.max(0, Math.round(a.echantillonsDeLaSource || 0));
    // ── L'AMORCE PRÉCÈDE LE PASSAGE, PAS LA FIN DE LA PRISE ──────────────────────────────
    // R7 : « les dernières secondes de la voix qui précède » le passage qu'on refait. Le
    // passage est à SA position dans la prise source — un repère —, et c'est de là qu'on
    // remonte. Prendre la fin de la prise source donnerait l'amorce du DERNIER passage quel
    // que soit celui qu'on refait : juste pour un seul cas, faux pour tous les autres.
    var position = (typeof a.positionDansLaSource === 'number')
      ? Math.max(0, Math.min(disponibles, Math.round(a.positionDansLaSource)))
      : disponibles;
    // L'option « tout le bout » : toute la voix qui précède le passage, et non cinq secondes.
    var tout = !!a.tout;
    var demandes = tout ? position : Math.round(secondes * hz);
    var joues = Math.min(demandes, position);
    var debutSource = position - joues;
    return {
      mode: a.mode === 'amorce-puis-silence' ? 'amorce-puis-silence' : 'doublage',
      toutLeBout: tout,
      secondesDemandees: tout ? +(demandes / hz).toFixed(3) : secondes,
      echantillonsDemandes: demandes,
      echantillonsJoues: joues,
      tronquee: joues < demandes,
      raisonDeLaTroncature: joues < demandes
        ? 'la voix qui précède le passage ne fait que ' + position + ' échantillons ('
          + (position / hz).toFixed(3) + ' s) dans la prise source : l\'amorce a été raccourcie '
          + 'à ' + joues + ' échantillons au lieu de ' + demandes
        : 'sans objet',
      priseSource: a.priseSource || null,
      positionDuPassageDansLaSource: position,
      debutDansLaSource: debutSource,
      finDansLaSource: position,
      // DANS LA PRISE NEUVE : en doublage, la fuite occupe les premiers échantillons écrits ;
      // en « amorce puis silence », rien n'est écrit avant la fin du son et la garde, donc la
      // zone est vide et la prise commence propre.
      debutDansLaPriseNeuve: 0,
      finDansLaPriseNeuve: a.mode === 'amorce-puis-silence' ? 0 : joues,
      gardeApresLAmorce_echantillons: a.mode === 'amorce-puis-silence'
        ? Math.round((typeof a.garde_s === 'number' ? a.garde_s : 1) * hz) : 0,
      regle: 'en doublage, la voix qui précède joue aux haut-parleurs PENDANT que la prise '
        + 'enregistre : la fuite est dans la prise, la zone est marquée et le montage la coupe '
        + '(E10). En « amorce puis silence », l\'enregistrement ne démarre qu\'après la fin du son '
        + 'et la garde, donc la zone est vide. La lecture s\'arrête EXACTEMENT à la fin de '
        + 'l\'amorce : jouer au-delà ferait entendre la suite de l\'ancienne prise par-dessus la '
        + 'nouvelle.',
    };
  }

  // ── (R5) LE SEUIL D'ALERTE SUR LA VITESSE, ET D'OÙ IL VIENT ───────────────────────────────
  //
  // R5 : « chaque passage affiche sa vitesse en mots par seconde, calculée d'après sa durée ;
  // une alerte réglable signale un écart avec la vitesse choisie ». Le CDC laisse le seuil
  // ouvert. Je propose VINGT POUR CENT, et voici le raisonnement, qui ne tient pas à mon goût.
  //
  // LA BORNE BASSE EST IMPOSÉE PAR LA MESURE ELLE-MÊME. La durée d'un passage est bornée par
  // deux repères posés À LA MAIN. Un repère posé à la main est incertain : E9 fixe l'antirebond
  // à 250 ms parce que c'est l'ordre de grandeur du geste, et deux frontières incertaines de
  // 250 ms font une durée incertaine de 500 ms. Sur un passage de 10 s, c'est déjà 5 % d'écart
  // qui ne viennent pas de la lecture mais du doigt. Un seuil à 5 % alerterait donc sur le
  // geste ; un seuil à 10 % alerterait sur tout passage de moins de 5 secondes.
  //
  // LA BORNE HAUTE EST IMPOSÉE PAR L'OREILLE. À 2,5 mots par seconde, 20 % font un demi-mot par
  // seconde : un passage lu à 3 mots/s au lieu de 2,5 s'entend comme pressé, et c'est exactement
  // ce que l'alerte doit attraper. Au-delà de 30 % on n'attraperait plus que les accidents.
  //
  // ET LA CONSÉQUENCE EST CALCULÉE, NON POSÉE. Du seuil découle la durée en dessous de laquelle
  // la vitesse n'est pas significative : 500 ms d'incertitude pour 20 % d'écart toléré, cela
  // fait 2,5 secondes. En dessous, le passage est affiché SANS alerte et avec sa raison — une
  // alerte sur du bruit de mesure est une alerte qu'on apprend à ignorer. Si Christophe change
  // le seuil, cette durée suit : c'est une fonction du seuil, pas un second réglage à tenir.
  var SEUIL_VITESSE_POURCENT_DEFAUT = 20;

  function dureeMinSignificative_s(seuil_pourCent, antirebond_ms) {
    var seuil = (typeof seuil_pourCent === 'number' && seuil_pourCent > 0)
      ? seuil_pourCent : SEUIL_VITESSE_POURCENT_DEFAUT;
    var ms = (typeof antirebond_ms === 'number' && antirebond_ms >= 0)
      ? antirebond_ms : ANTIREBOND_MS_DEFAUT;
    // Deux frontières, chacune incertaine de l'antirebond.
    return (2 * ms / 1000) / (seuil / 100);
  }

  // ── (R5) LA VITESSE DE CHAQUE PASSAGE, MESURÉE SUR SA DURÉE ───────────────────────────────
  //
  // LES BORNES D'UN PASSAGE SONT SES REPÈRES. T14 fait d'un repère la frontière entre deux
  // commentaires, et T6 accepte n − 1 repères (le dernier passage finit avec la voix) ou n (un
  // repère de fin). Les deux cas sont traités, et tout autre nombre rend « non mesurable » avec
  // sa raison : inventer des bornes produirait des vitesses qui ne mesurent rien.
  //
  // LE TEMPS DE PAUSE EST RETIRÉ AVANT DE DIVISER. Un passage qui porte « [pause 2 s] » dure
  // deux secondes de plus sans qu'un mot de plus y soit dit. Diviser ses mots par sa durée
  // brute le ferait paraître lent de 2 s, c'est-à-dire déclencherait une alerte sur un silence
  // VOULU. La bande modélise déjà la durée d'un passage par `nbMots / v + secondesDePause`
  // (`dureeDUnPassage`) : la vitesse se mesure donc sur le même temps de parole, sinon la
  // grandeur affichée et la grandeur attendue ne seraient pas la même grandeur (#11(f)).
  function vitessesParPassage(args) {
    var a = args || {};
    var passages = a.passages || [];
    var hz = (typeof a.echantillonnage === 'number' && a.echantillonnage > 0)
      ? a.echantillonnage : 48000;
    var choisie = (typeof a.vitesseChoisie === 'number' && a.vitesseChoisie > 0)
      ? a.vitesseChoisie : VITESSE_DEFAUT;
    var seuil = (typeof a.seuil_pourCent === 'number' && a.seuil_pourCent > 0)
      ? a.seuil_pourCent : SEUIL_VITESSE_POURCENT_DEFAUT;
    var antirebond_ms = (typeof a.antirebond_ms === 'number' && a.antirebond_ms >= 0)
      ? a.antirebond_ms : ANTIREBOND_MS_DEFAUT;
    var duree = Math.max(0, Math.round(a.dureeVoix_echantillons || 0));
    var minimum_s = dureeMinSignificative_s(seuil, antirebond_ms);
    var commun = {
      vitesseChoisie: choisie,
      seuil_pourCent: seuil,
      antirebond_ms: antirebond_ms,
      dureeMinSignificative_s: +minimum_s.toFixed(3),
      nbPassages: passages.length,
    };

    // UN REPÈRE DOUTEUX N'EST PAS UNE BORNE. E9 le pose et le signale au lieu de le jeter ; il
    // reste dans la liste, mais s'en servir comme frontière découperait un passage en deux sur
    // un rebond de touche. Il est donc compté et écarté, et le dit.
    var tous = (a.reperes || []).map(function (r) {
      return (typeof r === 'number') ? { aEchantillon: r, douteux: false } : r;
    });
    var ecartes = tous.filter(function (r) { return r && r.douteux; }).length;
    var positions = tous.filter(function (r) { return r && !r.douteux; })
      .map(function (r) { return Math.max(0, Math.round(r.aEchantillon)); })
      .sort(function (x, y) { return x - y; });

    if (!passages.length) {
      return Object.assign({ mesurable: false, reperesEcartes: ecartes,
        raison: 'aucun passage : sans texte de bande, un repère ne délimite rien de mesurable.',
        passages: [] }, commun);
    }
    var bornes = [0].concat(positions);
    var raisonDesBornes;
    if (bornes.length === passages.length) {
      bornes.push(duree);
      raisonDesBornes = positions.length + ' repères pour ' + passages.length + ' passages : le '
        + 'dernier passage se termine avec la voix écrite (' + duree + ' échantillons), comme '
        + 'T14 l\'autorise.';
    } else if (bornes.length === passages.length + 1) {
      raisonDesBornes = positions.length + ' repères pour ' + passages.length + ' passages : le '
        + 'dernier ferme le dernier passage (repère de fin).';
    } else {
      return Object.assign({ mesurable: false, reperesEcartes: ecartes,
        raison: 'vitesses non mesurables : ' + positions.length + ' repères retenus pour '
          + passages.length + ' passages, alors qu\'il en faut ' + (passages.length - 1)
          + ' ou ' + passages.length + ' (T6). Des bornes inventées donneraient des vitesses '
          + 'qui ne mesurent rien.',
        passages: [] }, commun);
    }

    var alertes = 0;
    var lignes = passages.map(function (p, k) {
      var debut = bornes[k], fin = bornes[k + 1];
      var duree_s = Math.max(0, (fin - debut) / hz);
      var pause_s = p.secondesDePause || 0;
      var parole_s = Math.max(0, duree_s - pause_s);
      var mots = p.nbMots || 0;
      var ligne = {
        passage: k,
        texteLu: p.texteLu,
        nbMots: mots,
        debutEchantillon: debut,
        finEchantillon: fin,
        duree_s: +duree_s.toFixed(3),
        secondesDePauseEcrites: pause_s,
        tempsDeParole_s: +parole_s.toFixed(3),
      };
      if (mots === 0 || parole_s <= 0) {
        ligne.motsParSeconde = null;
        ligne.ecart_pourCent = null;
        ligne.alerte = false;
        ligne.etat = 'non mesurable';
        ligne.raison = mots === 0
          ? 'aucun mot dans ce passage : une vitesse en mots par seconde n\'y a pas de sens.'
          : 'temps de parole nul ou négatif (durée ' + duree_s.toFixed(3) + ' s, dont '
            + pause_s + ' s de pause écrite) : rien à diviser.';
        return ligne;
      }
      var v = mots / parole_s;
      var ecart = (v - choisie) / choisie * 100;
      ligne.motsParSeconde = +v.toFixed(3);
      ligne.ecart_pourCent = +ecart.toFixed(1);
      if (duree_s < minimum_s) {
        // SANS ALERTE, ET AVEC LA RAISON : sur un passage plus court que cela, l'incertitude des
        // deux repères dépasse à elle seule le seuil.
        ligne.alerte = false;
        ligne.etat = 'durée trop courte pour juger';
        ligne.raison = 'ce passage dure ' + duree_s.toFixed(2) + ' s, moins que les '
          + minimum_s.toFixed(2) + ' s en dessous desquelles l\'incertitude des deux repères ('
          + (2 * antirebond_ms) + ' ms en tout) atteint à elle seule le seuil de ' + seuil
          + ' %. La vitesse est affichée, l\'alerte non.';
        return ligne;
      }
      ligne.alerte = Math.abs(ecart) > seuil;
      if (ligne.alerte) alertes++;
      ligne.etat = !ligne.alerte ? 'conforme' : (ecart > 0 ? 'trop rapide' : 'trop lent');
      ligne.raison = ligne.alerte
        ? mots + ' mots en ' + parole_s.toFixed(2) + ' s de parole font '
          + v.toFixed(2) + ' mots/s, soit ' + (ecart > 0 ? '+' : '') + ecart.toFixed(1)
          + ' % de la vitesse choisie (' + choisie + ') : au-delà du seuil de ' + seuil + ' %.'
        : 'écart de ' + (ecart > 0 ? '+' : '') + ecart.toFixed(1) + ' %, dans le seuil de '
          + seuil + ' %.';
      return ligne;
    });

    return Object.assign({
      mesurable: true,
      reperesEcartes: ecartes,
      bornesEnEchantillons: bornes,
      raisonDesBornes: raisonDesBornes,
      nbAlertes: alertes,
      passages: lignes,
      regle: 'la vitesse d\'un passage est son nombre de mots divisé par son TEMPS DE PAROLE, '
        + 'c\'est-à-dire sa durée entre repères moins les pauses écrites dans son texte — la '
        + 'même décomposition que `dureeDUnPassage`, pour que la grandeur mesurée et la grandeur '
        + 'attendue soient la même. En dessous de ' + minimum_s.toFixed(2) + ' s, l\'incertitude '
        + 'des repères posés à la main dépasse le seuil : la vitesse s\'affiche sans alerte.',
    }, commun);
  }

  // ── (R6) LES MARQUEURS THÉORIQUES, POSÉS D'APRÈS LA BANDE ─────────────────────────────────
  //
  // R6 : « une option, désactivée par défaut, pose des marqueurs théoriques d'après la bande, à
  // ajuster ensuite. » Théorique veut dire : à la durée que la bande PRÉVOIT pour chaque
  // passage, et non à celle qu'une voix a mise. Ce sont donc les frontières intérieures du
  // texte, cumulées, converties en échantillons.
  //
  // CE QUE CETTE FONCTION NE FAIT PAS : décider. Elle rend des positions ; c'est l'appelant qui
  // les pose, par le MÊME chemin qu'un repère de la main (antirebond compris), pour qu'un
  // marqueur théorique soit « un repère comme les autres » — y compris modifiable et effaçable.
  function marqueursTheoriques(passages, vitesse, echantillonnage) {
    var liste = passages || [];
    var v = (typeof vitesse === 'number' && vitesse > 0) ? vitesse : VITESSE_DEFAUT;
    var hz = (typeof echantillonnage === 'number' && echantillonnage > 0) ? echantillonnage : 48000;
    var out = [];
    var cumul = 0;
    // n passages → n − 1 frontières intérieures. Pas de repère de fin : la voix n'est pas encore
    // enregistrée, donc sa fin n'est pas connue, et un repère posé au-delà serait « hors voix »
    // au sens de T6.
    for (var i = 0; i < liste.length - 1; i++) {
      cumul += dureeDUnPassage(liste[i], v);
      out.push({
        aEchantillon: Math.round(cumul * hz),
        // Le passage qu'un repère de la main aurait enregistré à cet instant : la frontière
        // tombe au premier échantillon du passage suivant.
        passage: i + 1,
        secondes: +cumul.toFixed(3),
        theorique: true,
      });
    }
    return out;
  }

  window.BandeRythmo = {
    VITESSE_DEFAUT: VITESSE_DEFAUT,
    PAUSE_DEFAUT_S: PAUSE_DEFAUT_S,
    ANTIREBOND_MS_DEFAUT: ANTIREBOND_MS_DEFAUT,
    decouperEnPassages: decouperEnPassages,
    lireLesMarquesDePause: lireLesMarquesDePause,
    marquesDouteuses: marquesDouteuses,
    dureeDUnPassage: dureeDUnPassage,
    dureeTotale: dureeTotale,
    positionDeLaBande: positionDeLaBande,
    antirebond: antirebond,
    controlesDeT6: controlesDeT6,
    zoneDAmorce: zoneDAmorce,
    SEUIL_VITESSE_POURCENT_DEFAUT: SEUIL_VITESSE_POURCENT_DEFAUT,
    dureeMinSignificative_s: dureeMinSignificative_s,
    vitessesParPassage: vitessesParPassage,
    marqueursTheoriques: marqueursTheoriques,
  };
})();
