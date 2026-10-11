// FIXTURES SYNTHÉTIQUES DU LOT 3 — aucune voix réelle, jamais.
//
// Rien de la voix de Christophe, aucun WAV réel, aucun export de ses présentations n'entre dans
// ce dépôt (consigne du prompt). Tout ce que les contrôles entendent est fabriqué ici, par le
// calcul, et écrit dans `banc-enregistreur/` — dossier ignoré par git AVANT sa création
// (règle 11 de la gouvernance).
//
//   node tests/enregistreur-fixtures.cjs            → écrit toutes les fixtures
//   node tests/enregistreur-fixtures.cjs --liste     → les décrit sans rien écrire
//
// Les fixtures sont des WAV 16 bits, 48 kHz, à un ou deux canaux. Chacune existe pour éprouver
// UN fait mesuré au lot 0, et porte son identifiant d'exigence.

const fs = require('node:fs');
const path = require('node:path');

const ECH = 48000;
const RACINE = path.join(__dirname, '..');
const SORTIE = path.join(RACINE, 'banc-enregistreur', 'fixtures');

// ── Écriture WAV entrelacé, 16 bits ─────────────────────────────────────────────────────────
// Écrit ici une seconde fois (le produit a la sienne dans voix-stockage.js) et c'est VOULU :
// un témoin doit venir d'un chemin différent de celui qu'il éprouve, jamais de lui-même
// (régression #11(j)). Si les deux en-têtes divergent un jour, le contrôle le dira.
function ecrireWav(chemin, canaux, echantillonnage) {
  const nbCanaux = canaux.length;
  const n = canaux[0].length;
  const octetsDonnees = n * nbCanaux * 2;
  const tampon = Buffer.alloc(44 + octetsDonnees);
  tampon.write('RIFF', 0, 'ascii');
  tampon.writeUInt32LE(36 + octetsDonnees, 4);
  tampon.write('WAVE', 8, 'ascii');
  tampon.write('fmt ', 12, 'ascii');
  tampon.writeUInt32LE(16, 16);
  tampon.writeUInt16LE(1, 20);
  tampon.writeUInt16LE(nbCanaux, 22);
  tampon.writeUInt32LE(echantillonnage, 24);
  tampon.writeUInt32LE(echantillonnage * nbCanaux * 2, 28);
  tampon.writeUInt16LE(nbCanaux * 2, 32);
  tampon.writeUInt16LE(16, 34);
  tampon.write('data', 36, 'ascii');
  tampon.writeUInt32LE(octetsDonnees, 40);
  let p = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nbCanaux; c++) {
      const v = canaux[c][i];
      const b = v < 0 ? Math.max(-1, v) * 32768 : Math.min(1, v) * 32767;
      tampon.writeInt16LE(Math.round(b), p);
      p += 2;
    }
  }
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  fs.writeFileSync(chemin, tampon);
  return { octets: tampon.length, echantillons: n, canaux: nbCanaux };
}

// ── ÉCRITURE WAV À UNE PROFONDEUR CHOISIE, pour les fixtures d'IMPORT (E12) ─────────────────
// Le produit n'écrit que du 16 bits mono ; l'import, lui, doit accepter 16 et 24 bits, mono et
// stéréo, et REFUSER le reste. Il faut donc un générateur capable d'écrire ce que le produit
// n'écrit pas — y compris du 8 bits, qui doit être refusé avec sa raison.
function ecrireWavProfond(chemin, canaux, echantillonnage, bits) {
  const nbCanaux = canaux.length;
  const n = canaux[0].length;
  const octets = bits / 8;
  const octetsDonnees = n * nbCanaux * octets;
  const tampon = Buffer.alloc(44 + octetsDonnees);
  tampon.write('RIFF', 0, 'ascii');
  tampon.writeUInt32LE(36 + octetsDonnees, 4);
  tampon.write('WAVE', 8, 'ascii');
  tampon.write('fmt ', 12, 'ascii');
  tampon.writeUInt32LE(16, 16);
  tampon.writeUInt16LE(1, 20);                                  // PCM entier
  tampon.writeUInt16LE(nbCanaux, 22);
  tampon.writeUInt32LE(echantillonnage, 24);
  tampon.writeUInt32LE(echantillonnage * nbCanaux * octets, 28);
  tampon.writeUInt16LE(nbCanaux * octets, 32);
  tampon.writeUInt16LE(bits, 34);
  tampon.write('data', 36, 'ascii');
  tampon.writeUInt32LE(octetsDonnees, 40);
  let p = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nbCanaux; c++) {
      const v = Math.max(-1, Math.min(1, canaux[c][i]));
      if (bits === 8) {
        // Le 8 bits d'un WAV est NON signé, centré sur 128 : c'est le format, et il doit être
        // refusé par l'import — mais il doit d'abord être écrit correctement, sinon le refus
        // porterait sur un fichier malformé et ne prouverait rien.
        tampon.writeUInt8(Math.max(0, Math.min(255, Math.round(v * 127) + 128)), p);
      } else if (bits === 16) {
        tampon.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), p);
      } else {
        const e = Math.round(v < 0 ? v * 8388608 : v * 8388607);
        tampon.writeUInt8(e & 0xff, p);
        tampon.writeUInt8((e >> 8) & 0xff, p + 1);
        tampon.writeUInt8((e >> 16) & 0xff, p + 2);
      }
      p += octets;
    }
  }
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  fs.writeFileSync(chemin, tampon);
  return { octets: tampon.length, echantillons: n, canaux: nbCanaux, bits: bits,
           echantillonnage: echantillonnage };
}

// Un générateur pseudo-aléatoire À GRAINE : une fixture doit être identique d'une exécution à
// l'autre, sinon un contrôle qui échoue une fois sur dix est indébogable.
function alea(graine) {
  let s = graine >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sinusPlusBruit(n, hz, amplitude, bruit, graine) {
  const r = alea(graine);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / ECH) + bruit * (r() * 2 - 1);
  }
  return a;
}

function zeros(n) { return new Float32Array(n); }

function constante(n, v) {
  const a = new Float32Array(n);
  a.fill(v);
  return a;
}

// ── UN BRUIT LARGE BANDE À UN NIVEAU DEMANDÉ, en dBFS efficaces ────────────────────────────
// Un bruit uniforme sur [−a, +a] a pour valeur efficace a/√3. Pour obtenir d dBFS efficaces il
// faut donc a = √3 × 10^(d/20). Écrit ainsi, et non « au pif », parce que tout l'intérêt des
// fixtures de bruit est que leur niveau soit CONNU avant la mesure.
function bruitAuNiveau(n, dbfs, graine) {
  const r = alea(graine);
  const a = Math.sqrt(3) * Math.pow(10, dbfs / 20);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = a * (r() * 2 - 1);
  return s;
}

// La valeur efficace réelle d'un tableau, en dBFS : le générateur DIT ce qu'il a écrit, et le
// contrôle compare la mesure du produit à ce témoin-là, calculé par un autre code que le sien.
function efficaceDbfs(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return 20 * Math.log10(Math.sqrt(s / a.length));
}

// Le 20e centile des niveaux de fenêtres de 100 ms, calculé ICI, par un code indépendant de
// celui du produit (régression #11(j)). C'est le témoin de l'estimateur robuste.
function centile20DesFenetresDe100ms(a, echantillonnage) {
  const parFenetre = Math.round(echantillonnage * 0.1);
  const niveaux = [];
  for (let d = 0; d + parFenetre <= a.length; d += parFenetre) {
    let s = 0;
    for (let i = d; i < d + parFenetre; i++) s += a[i] * a[i];
    niveaux.push(20 * Math.log10(Math.sqrt(s / parFenetre)));
  }
  niveaux.sort((x, y) => x - y);
  // Même convention que le produit : le plus proche rang inférieur, sans interpolation.
  const rang = Math.max(0, Math.min(niveaux.length - 1, Math.floor(0.20 * (niveaux.length - 1))));
  return { centile20: niveaux[rang], fenetres: niveaux.length,
           plusBas: niveaux[0], plusHaut: niveaux[niveaux.length - 1] };
}

// ── L'INVENTAIRE : chaque fixture nomme le fait qu'elle éprouve ─────────────────────────────
const FIXTURES = [
  {
    nom: 'canal-droit-vide.wav',
    pourquoi: 'E3 — micro intégré du Mac, Safari 26.3 : deux canaux dont le DROIT est à zéro ' +
              'numérique. Le mixage doit prendre le canal actif, pas la moyenne (qui coûterait 6 dB).',
    attendu: 'canal retenu = gauche ; corrélation = « canal vide : droit » ; jamais −6 dB',
    faire: () => {
      const n = ECH * 6;
      return { canaux: [sinusPlusBruit(n, 220, 0.25, 0.0006, 1), zeros(n)] };
    },
  },
  {
    nom: 'canal-gauche-vide.wav',
    pourquoi: 'Le symétrique du précédent : la règle ne doit pas être écrite pour un seul côté.',
    attendu: 'canal retenu = droit',
    faire: () => {
      const n = ECH * 6;
      return { canaux: [zeros(n), sinusPlusBruit(n, 220, 0.25, 0.0006, 2)] };
    },
  },
  {
    nom: 'deux-canaux-correles.wav',
    pourquoi: 'Règle de Christophe du 10 octobre : deux canaux actifs dont la corrélation ' +
              'dépasse 0,8 portent la même chose — on prend la moyenne, qui ne perd rien.',
    attendu: 'corrélation > 0,8 ; canal retenu = moyenne',
    faire: () => {
      const n = ECH * 6;
      const g = sinusPlusBruit(n, 180, 0.2, 0.0008, 3);
      const d = new Float32Array(n);
      // Le même signal à 0,9 fois, plus un bruit indépendant faible : corrélation haute mais
      // pas 1,0 — un cas réaliste, pas un cas de laboratoire.
      const r = alea(4);
      for (let i = 0; i < n; i++) d[i] = g[i] * 0.9 + 0.0008 * (r() * 2 - 1);
      return { canaux: [g, d] };
    },
  },
  {
    nom: 'deux-canaux-differents.wav',
    pourquoi: 'Règle de Christophe : deux canaux actifs mais différents — on prend le plus fort. ' +
              'Deux fréquences sans rapport donnent une corrélation proche de zéro.',
    attendu: 'corrélation proche de 0 ; canal retenu = droit (le plus fort)',
    faire: () => {
      const n = ECH * 6;
      return {
        canaux: [
          sinusPlusBruit(n, 180, 0.08, 0.0008, 5),
          sinusPlusBruit(n, 437, 0.30, 0.0008, 6),
        ],
      };
    },
  },
  {
    nom: 'canal-constant.wav',
    pourquoi: 'Une composante continue sur le canal droit (0,05) contre un sinus sur le gauche ' +
              '(0,2) : la continue ne doit pas se faire passer pour la voix, et c\'est le plus ' +
              'fort qui est retenu.\n' +
              '    CE QUE CETTE FIXTURE NE PROUVE PAS : la branche « canal constant » de la ' +
              'corrélation. Un canal exactement constant ne traverse pas un graphe audio — le ' +
              'contexte rééchantillonne, et la « constante » acquiert une variance minuscule mais ' +
              'non nulle, si bien que la corrélation redevient calculable et vaut environ zéro. ' +
              'Cette branche est éprouvée sur des sommes exactes (§2a du contrôle), là où elle ' +
              'est atteignable.',
    attendu: 'corrélation proche de 0 ; canal retenu = gauche (le plus fort)',
    faire: () => {
      const n = ECH * 4;
      return { canaux: [sinusPlusBruit(n, 220, 0.2, 0.0006, 7), constante(n, 0.05)] };
    },
  },
  {
    nom: 'mono.wav',
    pourquoi: 'Entrée à un seul canal : il n\'y a pas d\'autre canal à corréler.',
    attendu: 'corrélation = « entrée mono » ; canal retenu = gauche',
    faire: () => ({ canaux: [sinusPlusBruit(ECH * 4, 220, 0.22, 0.0006, 8)] }),
  },
  {
    nom: 'zeros-71s.wav',
    pourquoi: 'E8 — constaté au lot 0 : une prise de 71 secondes ENTIÈREMENT à zéro, sans aucune ' +
              'alerte. Le bandeau doit tomber à 2 s de zéro numérique, et la prise ne doit ' +
              'jamais être présentée comme réussie.',
    attendu: 'bandeau « Aucun son reçu du micro » ; prise à l\'état MUETTE',
    faire: () => {
      const n = ECH * 71;
      return { canaux: [zeros(n), zeros(n)] };
    },
  },
  {
    nom: 'silence-initial-non-respecte.wav',
    pourquoi: 'T13 — constaté au lot 0 : le silence initial de 3 s n\'a jamais été silencieux. ' +
              'Ici la voix démarre à 0,4 s : il n\'y a pas d\'ambiance de pièce à prélever au début.',
    attendu: 'aucune alerte muette (moins de 2 s de zéro) ; prise sonore',
    faire: () => {
      const n = ECH * 6;
      const a = sinusPlusBruit(n, 200, 0.25, 0.0008, 9);
      for (let i = 0; i < Math.round(ECH * 0.4); i++) a[i] = 0;
      return { canaux: [a, zeros(n)] };
    },
  },
  {
    nom: 'silence-de-2s-au-milieu.wav',
    pourquoi: 'E8 doit déclencher PUIS se rétracter : 2,5 s de zéro au milieu d\'une prise par ' +
              'ailleurs sonore. Le bandeau tombe, le son revient, et le passage reste consigné.',
    attendu: 'un « piste muette » puis un « son revenu » dans le journal ; prise sonore',
    faire: () => {
      const n = ECH * 8;
      const a = sinusPlusBruit(n, 200, 0.25, 0.0008, 10);
      for (let i = ECH * 3; i < ECH * 5.5; i++) a[i] = 0;
      return { canaux: [a, zeros(n)] };
    },
  },
  {
    nom: 'ecretage.wav',
    pourquoi: 'La conversion en entier 16 bits doit ÉCRÊTER, et aux bornes asymétriques du ' +
              'format : −32768 et +32767. Un fichier WAV est borné à l\'écriture ; c\'est la page ' +
              'de banc qui amplifie (`?gain=3`), ce qu\'un graphe Web Audio fait très bien.\n' +
              '    POURQUOI UNE BASSE FRÉQUENCE, et non un créneau alterné à chaque échantillon : ' +
              'le premier essai alternait +1/−1 par échantillon, soit un créneau à la fréquence ' +
              'de Nyquist. Le contexte du navigateur rééchantillonne (44 100 Hz contre 48 000 du ' +
              'fichier), et ce rééchantillonnage écrase un signal à Nyquist : la crête arrivait à ' +
              '−24 149 au lieu de −32 768, et le contrôle accusait l\'écrêtage alors que le ' +
              'coupable était le rééchantillonnage. 60 Hz à pleine échelle traverse n\'importe ' +
              'quel rééchantillonnage sans perdre ses crêtes.',
    attendu: 'avec gain ×3 : exactement −32768 et +32767 dans ce qui est stocké, rien au-delà',
    faire: () => {
      const n = ECH * 2;
      const a = new Float32Array(n);
      for (let i = 0; i < n; i++) a[i] = Math.sin((2 * Math.PI * 60 * i) / ECH);
      return { canaux: [a, zeros(n)] };
    },
  },
  {
    nom: 'droit-actif-puis-zero.wav',
    pourquoi: 'Étape 1b — LE CANAL MOMENTANÉMENT ACTIF AU DÉMARRAGE. Le canal droit porte du ' +
              'signal pendant la première seconde, puis tombe à zéro numérique pour toujours : ' +
              'c\'est ce qu\'un périphérique fait parfois juste après l\'autorisation, avant de se ' +
              'stabiliser. Décider sur tout l\'historique retiendrait le droit ; décider sur les ' +
              'deux dernières secondes retient le gauche, qui est le bon.',
    attendu: 'sur la fenêtre de 2 s → gauche ; sur tout l\'historique → autre chose',
    faire: () => {
      const n = ECH * 12;
      const g = sinusPlusBruit(n, 196, 0.22, 0.0006, 21);
      const d = new Float32Array(n);
      // Le droit est FORT pendant une seconde, puis zéro exact.
      const bref = sinusPlusBruit(ECH, 320, 0.45, 0.0006, 22);
      for (let i = 0; i < ECH; i++) d[i] = bref[i];
      return { canaux: [g, d] };
    },
  },
  {
    nom: 'bruit-grave-puis-voix.wav',
    pourquoi: 'Étape 1d (T13) — LE PROFIL DE LA SALLE DE CHRISTOPHE. Trois secondes de bruit de ' +
              'pièce à 50 et 100 Hz (les raies qu\'il a mesurées, +14 et +10 dB), au niveau qu\'il ' +
              'a relevé (environ −57 dBFS), puis la voix. La mesure de bruit porte sur les trois ' +
              'premières secondes, le silence initial, et doit conclure « bruyant » et « grave ».',
    attendu: 'état bruyant, part de grave > 0,5, mention du filtre au mixage, prise non bloquée',
    faire: () => {
      const n = ECH * 12;
      const a = new Float32Array(n);
      const r = alea(23);
      // −57 dBFS efficace : amplitude efficace 10^(−57/20) ≈ 1,41e-3. Deux raies graves plus un
      // souffle large très faible, pour que la part de grave soit nettement au-dessus de 0,5.
      const eff = Math.pow(10, -57 / 20);
      const a50 = eff * 1.6, a100 = eff * 0.9, souffle = eff * 0.12;
      const bruit = (i) => a50 * Math.sin((2 * Math.PI * 50 * i) / ECH)
                         + a100 * Math.sin((2 * Math.PI * 100 * i) / ECH)
                         + souffle * (r() * 2 - 1);
      // SEPT secondes de bruit seul, et non trois : la prise ne démarre pas à l'instant zéro de
      // la fixture (il faut autoriser le micro et laisser la fenêtre de décision se remplir),
      // donc une fenêtre de mesure de 3 s doit pouvoir tenir ENTIÈRE dans le bruit malgré ce
      // décalage. Avec trois secondes seulement, la fenêtre mordait sur la voix et la part de
      // grave tombait à 0,14 : la mesure était contaminée, et c'est ce qui a fait écrire la
      // détection du silence initial non respecté.
      for (let i = 0; i < ECH * 7; i++) a[i] = bruit(i);
      const ampVoix = Math.pow(10, -30 / 20) * Math.SQRT2;
      for (let i = ECH * 7; i < n; i++) {
        a[i] = ampVoix * Math.sin((2 * Math.PI * 196 * i) / ECH) + bruit(i);
      }
      return { canaux: [a, zeros(n)] };
    },
  },
  {
    nom: 'droit-devient-actif-pendant.wav',
    pourquoi: 'Étape 1b — LE CANAL QUI CHANGE PENDANT LA PRISE. Le droit est à zéro numérique ' +
              'pendant les quatre premières secondes, puis devient actif et plus fort que le ' +
              'gauche. La fenêtre d\'avant-prise voit donc « droit vide → gauche », et la prise ' +
              'elle-même dit « le plus fort → droit ». C\'est le seul cas où la revérification de ' +
              'fin de prise a quelque chose à dire, et sans lui elle ne s\'éprouve pas.',
    attendu: 'canal gelé = gauche ; recalculé sur la prise = droit ; accord = false ; un avis le dit',
    faire: () => {
      const n = ECH * 20;
      const g = sinusPlusBruit(n, 196, 0.06, 0.0006, 31);
      const d = new Float32Array(n);
      const fort = sinusPlusBruit(n, 437, 0.40, 0.0006, 32);
      for (let i = ECH * 4; i < n; i++) d[i] = fort[i];
      return { canaux: [g, d] };
    },
  },
  {
    nom: 'bruit-120hz.wav',
    pourquoi: 'Étape 1d — LA COUPURE DU PASSE-BAS, À SA FRÉQUENCE EXACTE. Un son pur à 120 Hz, ' +
              'au niveau d\'un bruit de pièce. Le passe-bas de Butterworth du 2e ordre laisse ' +
              'passer la MOITIÉ de l\'énergie à sa coupure : la part de grave doit donc valoir ' +
              '0,50. Un filtre calculé pour 48 kHz mais appliqué à 44,1 kHz couperait à 110 Hz et ' +
              'donnerait environ 0,42 — c\'est ce que ce son-là, et lui seul, rend visible.',
    attendu: 'part de grave = 0,50 à ±0,03 ; hors de cette bande, le filtre ne coupe pas à 120 Hz',
    faire: () => {
      const n = ECH * 12;
      const a = new Float32Array(n);
      const eff = Math.pow(10, -57 / 20) * Math.SQRT2;
      for (let i = 0; i < n; i++) a[i] = eff * Math.sin((2 * Math.PI * 120 * i) / ECH);
      return { canaux: [a, zeros(n)] };
    },
  },
  {
    nom: 'piece-calme.wav',
    pourquoi: 'T1 bis — PREMIER DES TROIS ENVIRONNEMENTS DE RÉFÉRENCE. La pièce calme mesurée ' +
              'au lot 0 : −71 à −73 dBFS, bruit large bande, rien de bref. L\'estimateur robuste ' +
              'et la valeur efficace de la fenêtre entière doivent y donner le MÊME résultat — ' +
              'c\'est le cas où le changement d\'estimateur ne doit rien changer, et sans lui on ' +
              'ne saurait pas si le nouveau calcul se contente de tout baisser.',
    attendu: 'état calme ; plancher robuste à −72 dBFS ± 1,5 ; écart au RMS de la fenêtre < 1 dB',
    faire: () => {
      const n = ECH * 12;
      return { canaux: [bruitAuNiveau(n, -72, 101), zeros(n)] };
    },
  },
  {
    nom: 'salle-generateurs.wav',
    pourquoi: 'T1 bis — DEUXIÈME ENVIRONNEMENT DE RÉFÉRENCE : la salle de soins à générateurs de ' +
              'Christophe, mesurée −55,7 à −57,9 dBFS, énergie surtout sous 120 Hz, raies à 50 et ' +
              '100 Hz à +14 et +10 dB au-dessus du large bande. Le changement d\'estimateur ne ' +
              'doit PAS faire disparaître son bruit : un bruit continu reste bruyant, et grave.',
    attendu: 'état bruyant ; plancher robuste à −56,8 dBFS ± 1,5 ; grave dominant (part > 0,5)',
    faire: () => {
      const n = ECH * 12;
      // Énergies incohérentes : total = large bande × (1 + 10^1,4 + 10^1,0) = 36,1 fois le large
      // bande seul. On part donc du total voulu et on en déduit chaque composante.
      const puissanceTotale = Math.pow(10, 2 * -56.8 / 20);
      const pLarge = puissanceTotale / (1 + Math.pow(10, 1.4) + Math.pow(10, 1.0));
      const dbLarge = 10 * Math.log10(pLarge);
      const a = bruitAuNiveau(n, dbLarge, 102);
      const amp50 = Math.sqrt(2 * pLarge * Math.pow(10, 1.4));
      const amp100 = Math.sqrt(2 * pLarge * Math.pow(10, 1.0));
      for (let i = 0; i < n; i++) {
        a[i] += amp50 * Math.sin((2 * Math.PI * 50 * i) / ECH)
              + amp100 * Math.sin((2 * Math.PI * 100 * i) / ECH);
      }
      return { canaux: [a, zeros(n)] };
    },
  },
  {
    nom: 'plancher-avec-bruits-brefs.wav',
    pourquoi: 'T1 bis — LA FIXTURE QUI PORTE TOUT LE DÉFAUT 1, et la seule qui sépare les deux ' +
              'estimateurs. Un plancher de silence à −75 dBFS (celui des passages calmes de la ' +
              'prise du 10 octobre), et des bruits brefs de 80 ms à −58 dBFS toutes les 375 ms ' +
              '(clic de touche, respiration : −57,9 à −62,8 dBFS mesurés dans ses 3 premières ' +
              'secondes). La valeur efficace de la fenêtre entière annonce environ −64 dBFS, donc ' +
              '« correct » ; le 20e centile des fenêtres de 100 ms rend le plancher, environ ' +
              '−75 dBFS, donc « calme ». C\'est exactement l\'écart constaté par Christophe entre ' +
              'un « −63,9 correct » affiché et des passages calmes à −74/−76.',
    attendu: 'RMS de la fenêtre ≈ −64 dBFS (correct) ; 20e centile ≈ −75 dBFS (calme) ; ' +
             'environ 8 transitoires par 3 s, aucun classé comme voix',
    faire: () => {
      const n = ECH * 12;
      const a = bruitAuNiveau(n, -75, 103);
      const rafale = bruitAuNiveau(n, -58, 104);
      const dureeRafale = Math.round(ECH * 0.080);
      const pas = Math.round(ECH * 0.375);
      const fondu = Math.round(ECH * 0.002);
      // Les bruits brefs REMPLACENT le plancher sur leur durée (un clic ne s'additionne pas au
      // silence : il le couvre). Deux millisecondes de fondu aux bords, pour qu'un front raide
      // n'ajoute pas une énergie haute fréquence qui ne vient pas du bruit mesuré.
      for (let d = Math.round(ECH * 0.1); d + dureeRafale < n; d += pas) {
        for (let i = 0; i < dureeRafale; i++) {
          const k = i < fondu ? (0.5 - 0.5 * Math.cos((Math.PI * i) / fondu))
                  : (i > dureeRafale - fondu
                     ? (0.5 - 0.5 * Math.cos((Math.PI * (dureeRafale - i)) / fondu)) : 1);
          a[d + i] = rafale[d + i] * k;
        }
      }
      return { canaux: [a, zeros(n)] };
    },
  },
  {
    nom: 'voix-des-03s-avec-pauses.wav',
    pourquoi: 'T1 bis — LE SILENCE INITIAL NON TENU, avec une pause où prélever l\'ambiance ' +
              '(T13). Cycle de 5 s : 0,3 s de plancher à −75 dBFS, 2,7 s de voix à −38 dBFS, ' +
              '2,0 s de pause à −75. La voix démarre donc à 0,3 s, comme dans la prise du ' +
              '10 octobre où `silenceInitialRespecte` valait `true` à tort. Aucune fenêtre de 3 s ' +
              'ne peut éviter la voix (les pauses ne font que 2 s) : le contrôle est donc ' +
              'déterminant quel que soit l\'instant où la prise démarre dans la fixture.',
    attendu: 'silenceInitialRespecte = false ; ambiance prélevée dans la pause la plus calme ; ' +
             'état calme à environ −75 dBFS',
    faire: () => {
      const n = ECH * 20;
      const a = bruitAuNiveau(n, -75, 105);
      const ampVoix = Math.pow(10, -38 / 20) * Math.SQRT2;
      const cycle = Math.round(ECH * 5);
      const debutVoix = Math.round(ECH * 0.3);
      const finVoix = Math.round(ECH * 3.0);
      for (let c = 0; c * cycle < n; c++) {
        for (let i = debutVoix; i < finVoix && c * cycle + i < n; i++) {
          a[c * cycle + i] += ampVoix * Math.sin((2 * Math.PI * 196 * (c * cycle + i)) / ECH);
        }
      }
      return { canaux: [a, zeros(n)] };
    },
  },
  {
    nom: 'signal-perdu-au-milieu.wav',
    pourquoi: 'T1 bis (défaut 5) — LE SIGNAL PERDU JUSQU\'À LA FIN, qui n\'est PAS un passage ' +
              'muet. Quatre secondes de voix, puis le zéro numérique jusqu\'au bout. Sur une ' +
              'prise de ce profil (68 % à zéro jusqu\'à la fin), le Studio annonçait « sonore ' +
              'avec un passage muet » : il laissait croire qu\'il y avait quelque chose après.',
    attendu: 'bandeau E8 à 2 s de zéro, aucun « son revenu », état « signal perdu à l\'échantillon N »',
    faire: () => {
      const n = ECH * 14;
      const a = new Float32Array(n);
      const voix = sinusPlusBruit(ECH * 4, 196, 0.22, 0.0006, 106);
      for (let i = 0; i < ECH * 4; i++) a[i] = voix[i];
      // Le reste est le ZÉRO EXACT, pas un bruit faible : E8 parle de zéro numérique.
      return { canaux: [a, zeros(n)] };
    },
  },
  {
    nom: 'import-mono-16-44100.wav',
    bits: 16, hz: 44100,
    pourquoi: 'T1 ter (E12, point 5) — IMPORT 16 BITS MONO À 44 100 Hz. Deux faits à la fois : ' +
              'l\'en-tête est lu à la main et la fréquence du FICHIER est conservée (E11), et ' +
              'cette prise à 44 100 Hz, continuée sur une machine à 48 000 Hz, force le ' +
              'rééchantillonnage de la nouvelle partie SANS toucher à la configuration du Mac.',
    attendu: '44 100 Hz conservés ; morceau de 220 544 échantillons (1 723 blocs) ; canal « entrée mono »',
    faire: () => {
      const n = 44100 * 3;
      const a = new Float32Array(n);
      for (let i = 0; i < n; i++) a[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / 44100);
      return { canaux: [a] };
    },
  },
  {
    nom: 'import-stereo-24-48000.wav',
    bits: 24, hz: 48000,
    pourquoi: 'T1 ter (E12, point 5) — IMPORT 24 BITS STÉRÉO, canal droit à zéro numérique. La ' +
              'conversion doit descendre en 16 bits mono et la stéréo suivre la règle E3: le ' +
              'canal actif pris tel quel, jamais la moyenne, qui coûterait 6 dB.',
    attendu: 'canal retenu = gauche, raison « droit vide » ; 16 bits mono en sortie ; 48 000 Hz',
    faire: () => {
      const n = 48000 * 2;
      const g = new Float32Array(n);
      for (let i = 0; i < n; i++) g[i] = 0.25 * Math.sin((2 * Math.PI * 196 * i) / 48000);
      return { canaux: [g, zeros(n)] };
    },
  },
  {
    nom: 'import-refuse-3canaux.wav',
    bits: 16, hz: 48000,
    pourquoi: 'T1 ter (E12, point 5) — CE QUI DOIT ÊTRE REFUSÉ, second cas. E12 nomme le mono ' +
              'et la stéréo. Trois canaux n\'ont pas de règle de mixage décidée : les accepter ' +
              'obligerait à en inventer une, et E3 ne tranche que pour deux. Sans cette ' +
              'fixture, la garde sur le nombre de canaux n\'était éprouvée par personne — un ' +
              'trou trouvé par le falsifieur.',
    attendu: 'import refusé, raison « 3 canaux », aucune prise créée',
    faire: () => {
      const n = 48000;
      const a = new Float32Array(n), b = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        a[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / 48000);
        b[i] = 0.1 * Math.sin((2 * Math.PI * 330 * i) / 48000);
      }
      return { canaux: [a, b, zeros(n)] };
    },
  },
  {
    nom: 'import-refuse-8bits.wav',
    bits: 8, hz: 48000,
    pourquoi: 'T1 ter (E12, point 5) — CE QUI DOIT ÊTRE REFUSÉ. E12 nomme le PCM 16 ou 24 bits ; ' +
              'le 8 bits n\'en fait pas partie. Un import qui l\'accepterait silencieusement ' +
              'écrirait une voix dont personne n\'a vérifié l\'échelle. Le refus doit porter sa ' +
              'raison, et rien ne doit entrer dans le stockage.',
    attendu: 'import refusé, raison « 8 bits », aucune prise créée',
    faire: () => {
      const n = 48000;
      const a = new Float32Array(n);
      for (let i = 0; i < n; i++) a[i] = 0.4 * Math.sin((2 * Math.PI * 300 * i) / 48000);
      return { canaux: [a] };
    },
  },
  {
    nom: 'voix-5min.wav',
    longue: true,
    pourquoi: 'Critère de sortie du lot 3 : une prise de 5 minutes sans perte. Niveau choisi au ' +
              'plus près des faits du lot 0 : voix à environ −30 dBFS, plancher de bruit vers −71 dBFS.',
    attendu: '5 × 60 × 48000 = 14 400 000 échantillons ; 60 morceaux de 5 s',
    faire: () => {
      const n = ECH * 300;
      // −30 dBFS d'amplitude efficace pour un sinus : amplitude crête = 10^(−30/20) × √2.
      const amp = Math.pow(10, -30 / 20) * Math.SQRT2;
      const bruit = Math.pow(10, -71 / 20) * Math.SQRT2;
      return { canaux: [sinusPlusBruit(n, 196, amp, bruit, 11), zeros(n)] };
    },
  },
  {
    nom: 'voix-15min.wav',
    longue: true,
    pourquoi: 'La limite de conception du CDC (5 à 15 minutes), décidée le 10 octobre comme ' +
              'durée d\'essai haute. 86,4 Mo en entiers 16 bits mono. Ce fichier sert à la mesure ' +
              'de stockage ; la prise de 15 minutes EN TEMPS RÉEL reste l\'essai de Christophe.',
    attendu: '43 200 000 échantillons ; 180 morceaux de 5 s ou 450 de 2 s ; 86,4 Mo',
    faire: () => {
      const n = ECH * 900;
      const amp = Math.pow(10, -30 / 20) * Math.SQRT2;
      const bruit = Math.pow(10, -71 / 20) * Math.SQRT2;
      return { canaux: [sinusPlusBruit(n, 196, amp, bruit, 12), zeros(n)] };
    },
  },
];

function main() {
  const liste = process.argv.includes('--liste');
  // Les deux longues fixtures pèsent 220 Mo et ne servent qu'à un essai EN TEMPS RÉEL : aucun
  // contrôle automatique ne les joue (jouer 15 minutes prendrait 15 minutes, et la mesure de
  // stockage à 15 minutes se fait en écrivant les morceaux directement, sans audio). Elles ne
  // s'écrivent donc que sur demande.
  const longues = process.argv.includes('--longues');
  if (liste) {
    FIXTURES.forEach((f) => {
      console.log('· ' + f.nom + '\n    pourquoi : ' + f.pourquoi + '\n    attendu  : ' + f.attendu);
    });
    console.log('\n' + FIXTURES.length + ' fixtures. Aucune n\'a été écrite (--liste).');
    return;
  }
  fs.mkdirSync(SORTIE, { recursive: true });
  const index = [];
  const retenues = FIXTURES.filter((f) => longues || !f.longue);
  retenues.forEach((f) => {
    const { canaux } = f.faire();
    const chemin = path.join(SORTIE, f.nom);
    // Les fixtures d'import portent leur propre profondeur et leur propre fréquence : c'est ce
    // qu'elles éprouvent. Toutes les autres restent du 16 bits à 48 kHz.
    const r = (f.bits && f.bits !== 16) || f.hz
      ? ecrireWavProfond(chemin, canaux, f.hz || ECH, f.bits || 16)
      : ecrireWav(chemin, canaux, ECH);
    index.push({ nom: f.nom, pourquoi: f.pourquoi, attendu: f.attendu, ...r,
                 duree_s: r.echantillons / (f.hz || ECH) });
    console.log('écrit  ' + f.nom.padEnd(34) + r.echantillons + ' éch · ' + r.canaux +
                ' canal(aux) · ' + (f.bits || 16) + ' bits · ' + (f.hz || ECH) + ' Hz · ' +
                (r.octets / 1048576).toFixed(2) + ' Mo');
  });
  fs.writeFileSync(path.join(SORTIE, 'index.json'), JSON.stringify(index, null, 2));
  console.log('\n' + index.length + ' fixtures dans ' + SORTIE +
    (longues ? ' (longues incluses)' : ' — les 2 longues fixtures sont omises : --longues pour les écrire'));
  console.log('Dossier ignoré par git : rien de tout cela n\'entre dans le dépôt.');
}

module.exports = { FIXTURES, ecrireWav, ecrireWavProfond, sinusPlusBruit, zeros, alea, SORTIE, ECH,
                   bruitAuNiveau, efficaceDbfs, centile20DesFenetresDe100ms };
if (require.main === module) main();
