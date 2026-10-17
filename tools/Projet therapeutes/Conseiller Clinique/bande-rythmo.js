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
    var demandes = Math.round(secondes * hz);
    // On ne joue jamais plus que ce que la prise source contient : si elle est plus courte que
    // l'amorce demandée, on joue tout, et on le DIT.
    var disponibles = Math.max(0, Math.round(a.echantillonsDeLaSource || 0));
    var joues = Math.min(demandes, disponibles);
    var debutSource = Math.max(0, disponibles - joues);
    return {
      mode: a.mode === 'amorce-puis-silence' ? 'amorce-puis-silence' : 'doublage',
      secondesDemandees: secondes,
      echantillonsDemandes: demandes,
      echantillonsJoues: joues,
      tronquee: joues < demandes,
      raisonDeLaTroncature: joues < demandes
        ? 'la prise source ne porte que ' + disponibles + ' échantillons : l\'amorce a été '
          + 'raccourcie à ' + joues + ' au lieu de ' + demandes
        : 'sans objet',
      priseSource: a.priseSource || null,
      debutDansLaSource: debutSource,
      finDansLaSource: disponibles,
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
  };
})();
