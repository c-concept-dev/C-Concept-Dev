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

  var _services = null;
  var _boite = null;
  var _etat = neuf();

  function neuf() {
    return {
      ctx: null, source: null, noeud: null, flux: null,
      db: null,
      priseId: null,
      echantillonnage: 0,
      canaux: 0,
      canalRetenu: null,
      reglageCanal: 'auto',
      tailleMorceau_s: TAILLE_MORCEAU_S_DEFAUT,
      sommesAnalyse: null,   // dernières sommes cumulées en mode analyse (pour décider du canal)
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

      '<div data-messages></div>' +

      '<div class="sc-bm-recording" aria-live="polite" data-chrono-ligne hidden>Enregistrement ' +
        '<span class="sc-bm-time" data-chrono>00:00,000</span></div>' +

      '<div class="sc-bm-meter" data-lot="3">' +
        '<div class="sc-bm-row">' +
          '<svg class="sc-bm-icon" aria-hidden="true"><use href="#sc-bm-icon-mic"></use></svg>' +
          '<strong>Niveau du microphone</strong>' +
          '<span class="sc-bm-time" data-vu-niveau>—</span>' +
        '</div>' +
        '<div class="sc-bm-meter-bar"><span class="sc-bm-meter-fill" data-vu-barre style="width:0%"></span></div>' +
        '<span class="sc-bm-help" data-vu-detail>Parlez à votre volume habituel.</span>' +
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
    '<span data-sb-piste>Piste : inconnue</span>' +
    '<span data-sb-canal>Canal : —</span>' +
  '</footer>' +
'</div>';
  }

  function q(sel) { return _boite ? _boite.querySelector(sel) : null; }

  function message(cle, etat, texte) {
    var hote = q('[data-messages]');
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

  function journaliser(quoi, aEchantillon, extra) {
    var e = { quoi: quoi, aEchantillon: aEchantillon };
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    _etat.journal.push(e);
    var p = q('[data-sb-piste]');
    if (p) p.textContent = 'Piste : ' + quoi;
    return e;
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
    _etat.echantillonnage = m.echantillonnage || _etat.echantillonnage;
    _etat.canaux = (m.releve && m.releve.canaux) || _etat.canaux;
    _etat.dernierReleve = m;

    if (m.mode === 'analyse') _etat.sommesAnalyse = m.total;
    else _etat.sommesTotal = m.total;

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
      journaliser('piste muette', m.depuisEchantillon, { echantillonsAZero: m.echantillonsAZero });
      message('muet', 'error', 'Aucun son reçu du micro. Le signal est à zéro numérique depuis ' +
        (m.echantillonsAZero / (_etat.echantillonnage || 48000)).toFixed(1) + ' s (échantillon ' +
        m.depuisEchantillon + ').');
      return;
    }

    if (m.type === 'son-revenu') {
      _etat.muet = false;
      journaliser('son revenu', m.aEchantillon, null);
      message('muet', 'info', 'Le son est revenu à l\'échantillon ' + m.aEchantillon +
        '. Le passage muet reste consigné dans le journal de la prise.');
      return;
    }

    if (m.type === 'vide-force') {
      journaliser('morceau partiel poussé', _etat.echantillonsEcrits,
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

  function brancherGraphe() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.reject(new Error('Web Audio absent'));
    if (_etat.ctx) { try { _etat.ctx.close(); } catch (e) {} }
    var ctx = new AC();
    _etat.ctx = ctx;
    _etat.echantillonnage = ctx.sampleRate;

    var urlWorklet = (_services && _services.urlWorklet) || 'enregistreur-worklet.js';
    return ctx.audioWorklet.addModule(urlWorklet).then(function () {
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

      // L'état de la piste, journalisé : muette, terminée, contexte suspendu. En échantillons.
      var piste = _etat.flux && _etat.flux.getAudioTracks ? _etat.flux.getAudioTracks()[0] : null;
      if (piste) {
        var reglages = piste.getSettings ? piste.getSettings() : {};
        // Gardé À PART du journal d'une prise : le journal d'une prise se vide à chaque nouvelle
        // prise, et l'ouverture de piste, elle, décrit le périphérique pour TOUTES les prises de
        // la session. L'écraser revenait à perdre la preuve que les traitements du navigateur
        // sont bien désactivés (E3) — trouvé par un contrôle qui ne retrouvait plus l'entrée.
        _etat.ouverturePiste = journaliser('piste ouverte', 0, {
          canaux: reglages.channelCount, echantillonnage: reglages.sampleRate,
          annulationEcho: reglages.echoCancellation,
          suppressionBruit: reglages.noiseSuppression,
          gainAutomatique: reglages.autoGainControl,
        });
        piste.addEventListener('mute', function () {
          journaliser('piste muette (événement)', echantillonsCourants());
          message('piste', 'error', 'La piste audio s\'est déclarée muette.');
        });
        piste.addEventListener('unmute', function () { journaliser('piste non muette', echantillonsCourants()); });
        piste.addEventListener('ended', function () {
          journaliser('piste terminée', echantillonsCourants());
          message('piste', 'error', 'La piste audio s\'est terminée : le périphérique a été retiré ou repris par une autre application.');
        });
      }
      ctx.onstatechange = function () {
        journaliser('contexte ' + ctx.state, echantillonsCourants());
        if (ctx.state === 'suspended' && _etat.enPrise) {
          message('contexte', 'error', 'Le contexte audio est suspendu pendant la prise : les échantillons n\'arrivent plus. Consigné en échantillons.');
        }
      };
      return true;
    });
  }

  function echantillonsCourants() {
    return _etat.dernierReleve ? _etat.dernierReleve.echantillonsEcrits : _etat.echantillonsEcrits;
  }

  // ── DÉMARRER, ARRÊTER ──────────────────────────────────────────────────────────────────────

  function demarrer() {
    if (_etat.enPrise) return Promise.resolve(null);
    if (!_etat.noeud) return Promise.reject(new Error('micro non autorisé : rien à enregistrer'));

    // Le canal est décidé MAINTENANT, à partir de ce que l'analyse a vu, et gelé : on ne peut pas
    // remixer après coup des échantillons déjà écrits.
    var dec = choisirCanal(_etat.sommesAnalyse, _etat.reglageCanal);
    _etat.canalRetenu = dec.canal;
    _etat.canalRaison = dec.raison;

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
    message('muet', '', null);
    message('prise-muette', '', null);

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
        tailleMorceau_s: _etat.tailleMorceau_s,
        // La valeur APPLIQUÉE par le worklet, et la valeur demandée à côté d'elle : les deux sont
        // dans le relevé, et un contrôle vérifie qu'elles s'accordent à moins d'un bloc près.
        echantillonsParMorceau: _etat.echantillonsParMorceauReels,
        echantillonsParMorceauDemandes: Math.round(_etat.tailleMorceau_s * _etat.echantillonnage),
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
      journaliser('prise démarrée', 0, { canal: dec.canal, raison: dec.raison,
        echantillonsParMorceau: _etat.echantillonsParMorceauReels });
      return id;
    }, function (err) {
      _etat.enPrise = false;
      throw err;
    });
  }

  function arreter() {
    if (!_etat.enPrise) return Promise.resolve(null);
    _etat.enPrise = false;
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
        // Un passage muet dans une prise par ailleurs sonore n'est pas un échec, mais il ne se
        // tait pas : il reste au journal, et il est dit.
        var passageMuet = !muette && _etat.journal.some(function (e) { return e.quoi === 'piste muette'; });

        var mesures = rapportDUnePrise(f, perdus, muette, passageMuet);
        _etat.mesures = mesures;

        return window.VoixStockage.majPrise(_etat.db, _etat.priseId, {
          etat: muette ? 'muette' : 'terminee',
          nbEchantillons: _etat.echantillonsEcrits,
          nbMorceaux: _etat.morceauxEcrits,
          journal: _etat.journal.slice(),
          mesures: mesures,
        }).then(function () {
          q('[data-action="demarrer"]').hidden = false;
          q('[data-action="arreter"]').hidden = true;
          q('[data-mode]').textContent = muette ? 'Prise muette' : 'Prise terminée';
          // Clé DISTINCTE de celle du bandeau E8 : le verdict final s'ajoute au bandeau au lieu
          // de l'effacer. Avec la même clé, l'instant où le signal est tombé à zéro — la seule
          // information utile pour comprendre ce qui s'est passé — disparaissait à l'arrêt.
          if (muette) {
            message('prise-muette', 'error', 'Cette prise est MUETTE : ' +
              (_etat.echantillonsEcrits === 0 ? 'aucun échantillon écrit' :
               'le signal retenu est resté à zéro numérique sur la totalité de la prise (' +
               (f.zerosRetenus || 0) + ' échantillons sur ' + (f.echantillonsRetenus || 0) + ')') +
              '. Elle n\'est pas présentée comme réussie (E8).');
          } else if (passageMuet) {
            message('prise-muette', 'info', 'Cette prise est sonore, mais elle contient un ' +
              'passage à zéro numérique de plus de 2 secondes. Il reste consigné au journal, en ' +
              'échantillons.');
          }
          return peindreListe().then(function () { return mesures; });
        });
      });
  }

  // ── LE RAPPORT DE MESURES ──────────────────────────────────────────────────────────────────
  // Niveau et crête PAR CANAL, corrélation vraiment calculée (jamais `null` : une raison à la
  // place), blocs perdus avec leurs deux termes, état de la piste, canal retenu. Chaque nombre
  // porte la grandeur dont il découle.
  function rapportDUnePrise(fin, perdus, muette, passageMuet) {
    var s = _etat.sommesTotal || (fin && fin.total) || null;
    var g = niveauxCanal(s, 'g');
    var d = niveauxCanal(s, 'd');
    var r = correlation(s);
    return {
      prise: _etat.priseId,
      nom: (q('[data-nom-prise]') && q('[data-nom-prise]').value) || null,
      horodatage: new Date().toISOString(),
      echantillonnage: _etat.echantillonnage,
      canauxALEntree: s ? s.canaux : 0,
      canalRetenu: _etat.canalRetenu,
      raisonDuCanal: _etat.canalRaison,
      reglageCanal: _etat.reglageCanal,
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
        dureeMorceau_s: _etat.tailleMorceau_s,
        echantillonsParMorceau: Math.round(_etat.tailleMorceau_s * _etat.echantillonnage),
        morceauxEcrits: _etat.morceauxEcrits,
        echantillonsEcrits: _etat.echantillonsEcrits,
        octetsEcrits: _etat.echantillonsEcrits * 2,
        octetsParMinute: _etat.echantillonnage * 2 * 60,
        duree_s: _etat.echantillonnage ? _etat.echantillonsEcrits / _etat.echantillonnage : 0,
      },
      echantillonsVusParLeWorklet: fin ? fin.echantillonsVus : null,
      ecartVuEcrit: fin ? (fin.echantillonsVus - _etat.echantillonsEcrits) : null,
      etatDeLaPiste: muette ? 'muette' : (passageMuet ? 'sonore avec un passage muet' : 'sonore'),
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
      liste.forEach(function (p) {
        var el = document.createElement('div');
        el.className = 'sc-bm-resume';
        el.setAttribute('data-prise', p.id);
        el.setAttribute('data-etat', p.etat);
        var dur = fmtTemps(p.nbEchantillons || 0, p.echantillonnage || 48000);
        el.innerHTML =
          '<header class="sc-bm-panel-title"><h2></h2><span class="sc-bm-badge"></span></header>' +
          '<p data-detail></p>' +
          '<div class="sc-bm-row">' +
            '<button type="button" class="sc-bm-button sc-bm-button--secondary" data-action="wav" data-lot="3">Exporter en WAV</button>' +
            '<button type="button" class="sc-bm-button sc-bm-button--destructive" data-action="supprimer" data-lot="3">Supprimer</button>' +
          '</div>';
        el.querySelector('h2').textContent = p.nom || p.id;
        el.querySelector('.sc-bm-badge').textContent =
          p.etat === 'terminee' ? 'Terminée' : p.etat === 'muette' ? 'MUETTE' : 'Inachevée';
        el.querySelector('[data-detail]').textContent =
          dur + ' · ' + (p.nbMorceaux || 0) + ' morceaux · ' +
          ((p.nbEchantillons || 0) * 2 / 1048576).toFixed(2) + ' Mo · ' +
          (p.echantillonnage || 0) + ' Hz · ' + nomCanal(p.canalRetenu) +
          ' · ' + (p.creeLe || '').replace('T', ' ').slice(0, 19);
        hote.appendChild(el);
      });
      return liste;
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
      if (_etat.flux) brancherGraphe();   // la taille passe au worklet à sa construction
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
    CORRELATION_MEME_SIGNAL: CORRELATION_MEME_SIGNAL,
    DBFS_QUASI_VIDE: DBFS_QUASI_VIDE,
    // Pour qu'un contrôle lise l'état sans le déduire de l'affichage.
    _etat: function () { return _etat; },
    _demarrer: demarrer,
    _arreter: arreter,
    _autoriser: autoriser,
  };
})();
