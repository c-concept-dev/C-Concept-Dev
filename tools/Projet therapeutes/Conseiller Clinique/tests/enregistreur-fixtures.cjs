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
    const r = ecrireWav(chemin, canaux, ECH);
    index.push({ nom: f.nom, pourquoi: f.pourquoi, attendu: f.attendu, ...r,
                 duree_s: r.echantillons / ECH });
    console.log('écrit  ' + f.nom.padEnd(34) + r.echantillons + ' éch · ' + r.canaux +
                ' canal(aux) · ' + (r.octets / 1048576).toFixed(2) + ' Mo');
  });
  fs.writeFileSync(path.join(SORTIE, 'index.json'), JSON.stringify(index, null, 2));
  console.log('\n' + index.length + ' fixtures dans ' + SORTIE +
    (longues ? ' (longues incluses)' : ' — les 2 longues fixtures sont omises : --longues pour les écrire'));
  console.log('Dossier ignoré par git : rien de tout cela n\'entre dans le dépôt.');
}

module.exports = { FIXTURES, ecrireWav, sinusPlusBruit, zeros, alea, SORTIE, ECH };
if (require.main === module) main();
