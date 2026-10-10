// ── LOT 3, JALON I — LE WORKLET DE CAPTURE ──────────────────────────────────────────────────
//
// Fichier SÉPARÉ et OBLIGATOIREMENT servi : `audioWorklet.addModule()` charge ce fichier dans un
// AUTRE contexte global (AudioWorkletGlobalScope). Rien de `window` n'existe ici — pas de DOM,
// pas d'IndexedDB. C'est aussi pourquoi l'enregistrement n'existe pas depuis un fichier d'export
// ouvert du disque (E1 du CDC).
//
// CE QUE CE FICHIER FAIT, ET RIEN DE PLUS : il voit les échantillons. Donc il les COMPTE, il les
// ACCUMULE bruts, il les mixe en mono sur le canal QU'ON LUI DIT, il les verse en entiers 16 bits
// dans des morceaux, et il surveille le zéro numérique.
//
// CE QU'IL NE FAIT PAS, ET POURQUOI : il ne calcule ni décibel, ni corrélation, ni verdict de
// canal. Ces trois grandeurs sont aussi nécessaires au rapport de mesures, sur le fil principal.
// Les calculer ici AUSSI ferait deux formules pour une même grandeur — la régression #11(f) de la
// gouvernance, celle du « 4 étapes à scinder » contre « 0 à scinder », chacune vraie sous sa
// propre règle. Une grandeur, une fonction : le worklet poste les SOMMES BRUTES, et le module
// est le seul endroit où une somme devient un décibel, une corrélation ou un choix de canal.
// C'est pour ça que `demarrer-prise` arrive avec son canal déjà décidé : le worklet obéit.
//
// TOUT SE COMPTE EN ÉCHANTILLONS. L'écart avec l'horloge murale ne prouve aucune dérive (mesuré
// au lot 0) : le seul témoin honnête du temps est le nombre d'échantillons reçus, et c'est pour
// ça que ce processeur tient SON PROPRE compteur de blocs. Le fil principal le confrontera à
// l'horloge audio sans présumer que l'écart est nul.

// Un bloc de rendu fait 128 échantillons : 2,7 ms à 48 kHz (2,9 ms à 44,1 kHz). C'est la
// granularité d'un repère, et la raison pour laquelle un morceau doit faire un nombre ENTIER de
// blocs : sinon un repère tomberait à cheval sur deux morceaux.
const ECHANTILLONS_PAR_BLOC = 128;

// Cadence des relevés postés au fil principal. 19 blocs = 2 432 échantillons = 50,7 ms à
// 48 kHz, soit environ 20 relevés par seconde : assez pour qu'un vu-mètre vive, assez peu pour
// ne pas noyer le fil principal (375 messages par seconde si on postait chaque bloc).
const BLOCS_PAR_RELEVE = 19;

// E8 du CDC : « si le signal reste à zéro numérique pendant 2 secondes ». Deux secondes se
// comptent en ÉCHANTILLONS, jamais en millisecondes d'horloge d'interface — c'est la différence
// entre une détection et une impression. Le seuil est calculé à partir de `sampleRate`, pas
// écrit en dur : à 44,1 kHz, 2 secondes ne font pas le même nombre d'échantillons.
const SECONDES_DE_SILENCE_AVANT_ALERTE = 2;

// ── LE BRUIT DE PIÈCE, ET SA PART DE GRAVE (T13, étape 1d) ──────────────────────────────────
//
// Les prises réelles de Christophe l'ont montré : −55,7 à −57,9 dBFS dans une salle de soins à
// générateurs, avec l'énergie surtout sous 120 Hz et des raies à 50 et 100 Hz. Un plancher à
// −71 dBFS, mesuré au lot 0 dans une pièce calme, ne décrit pas sa salle.
//
// COMMENT ON MESURE LA PART DE GRAVE, et ce que cette mesure vaut exactement : un passe-bas de
// Butterworth du SECOND ordre à 120 Hz (Q = 1/√2), puis le rapport entre l'énergie qui en
// ressort et l'énergie qui y entre. Ce n'est PAS un mur de brique : à 120 Hz pile, le filtre
// laisse passer la moitié de l'énergie, donc un son à 120 Hz donne un rapport d'environ 0,5. En
// dessous il tend vers 1, au-dessus il chute en 1/f⁴. C'est une mesure de PENTE, pas de
// découpage net, et le relevé le dit avec sa règle — un rapport sans sa règle se lirait comme un
// pourcentage exact, ce qu'il n'est pas.
const BRUIT_COUPURE_HZ = 120;

class PasseBas {
  constructor(fc, fs) {
    var w0 = 2 * Math.PI * fc / fs;
    var alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
    var cosw = Math.cos(w0);
    var a0 = 1 + alpha;
    this.b0 = ((1 - cosw) / 2) / a0;
    this.b1 = (1 - cosw) / a0;
    this.b2 = ((1 - cosw) / 2) / a0;
    this.a1 = (-2 * cosw) / a0;
    this.a2 = (1 - alpha) / a0;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  filtrer(x) {
    var y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
          - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

class EnregistreurProcesseur extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};

    // Taille d'un morceau, en échantillons, imposée par le module (qui la justifie et la mesure).
    // Ramenée à un multiple entier de 128 : un morceau qui ne serait pas un nombre entier de
    // blocs ferait tomber un repère à cheval sur deux morceaux.
    const demandee = Math.max(ECHANTILLONS_PAR_BLOC, Math.round(o.echantillonsParMorceau || 240000));
    this.echantillonsParMorceau =
      Math.round(demandee / ECHANTILLONS_PAR_BLOC) * ECHANTILLONS_PAR_BLOC;

    // 'analyse' : on mesure, on ne garde rien. 'prise' : on écrit des morceaux.
    // Le canal est décidé par le module PENDANT l'analyse (le vu-mètre d'avant-prise, E2) et
    // arrive gelé avec `demarrer-prise`. On ne peut pas remixer après coup des échantillons déjà
    // écrits : c'est la raison d'être de ces deux modes.
    this.mode = 'analyse';
    this.canal = 'gauche';

    this.morceau = new Int16Array(this.echantillonsParMorceau);
    this.dansLeMorceau = 0;
    this.indexMorceau = 0;

    // ── LES TÉMOINS, tenus ici et nulle part ailleurs ──────────────────────────────────────
    this.blocsVus = 0;            // appels à process() qui ont vu de l'entrée
    this.blocsSansEntree = 0;     // appels sans aucun canal : l'entrée a disparu
    this.echantillonsVus = 0;     // total reçu — le seul temps de référence
    this.echantillonsEcrits = 0;  // total versé dans des morceaux

    // SUR LE SIGNAL RETENU, après mixage mono : combien d'échantillons, et combien à zéro
    // numérique. C'est la seule grandeur qui répond à « cette prise est-elle VIDE ? » — les
    // sommes par canal ne le disent pas quand le canal retenu est la moyenne des deux. Comptée
    // ici, où les échantillons passent, et nulle part ailleurs.
    this.echantillonsRetenus = 0;
    this.zerosRetenus = 0;

    // Sommes brutes, par canal. `releve` est remis à zéro à chaque envoi (le vu-mètre montre
    // l'instant) ; `total` court sur toute la prise (le rapport de mesures).
    this.releve = sommesNeuves();
    this.total = sommesNeuves();

    // Suivi du zéro numérique, en échantillons.
    this.echantillonsAZeroDeSuite = 0;
    this.debutTrame = 0;

    // La mesure de bruit tourne sur demande, pendant un nombre d'échantillons fixé par le
    // module. Elle accumule l'énergie totale et l'énergie qui ressort du passe-bas, plus la
    // crête — trois grandeurs brutes, dont le module tirera les décibels et le verdict.
    this.bruit = null;
    this.seuilSilence = Math.round(SECONDES_DE_SILENCE_AVANT_ALERTE * sampleRate);
    this.muetAnnonce = false;
    this.blocsDepuisReleve = 0;

    this.port.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'demarrer-prise') {
        // Le canal vient du module, déjà décidé. S'il manque, on prend le canal 0 et on le DIT
        // dans l'accusé : un canal retenu par défaut sans trace est un canal que personne ne
        // peut contredire.
        this.canal = m.canal || 'gauche';
        this.total = sommesNeuves();
        this.dansLeMorceau = 0;
        this.indexMorceau = 0;
        this.echantillonsEcrits = 0;
        this.echantillonsVus = 0;
        this.blocsVus = 0;
        this.blocsSansEntree = 0;
        this.echantillonsAZeroDeSuite = 0;
        this.echantillonsRetenus = 0;
        this.zerosRetenus = 0;
        this.muetAnnonce = false;
        this.mode = 'prise';
        // L'INSTANT DU DÉMARRAGE, PRIS SUR LE FIL AUDIO. `currentFrame` est le compteur de
        // trames du contexte, lu ici, dans le même temps que les échantillons. Le fil principal
        // ne peut pas fournir cet instant : entre son `postMessage` et l'exécution de cette
        // ligne, dix à douze blocs passent (environ 30 ms, mesuré). Compter les blocs attendus
        // depuis l'instant du fil PRINCIPAL faisait apparaître ces blocs comme « perdus », et
        // c'était faux : c'était la latence du message. Un écart qui ne veut rien dire est pire
        // qu'un écart absent, parce qu'on le lit quand même.
        this.debutTrame = currentFrame;
        this.port.postMessage({
          type: 'prise-demarree',
          canal: this.canal,
          canalFourni: !!m.canal,
          echantillonsParMorceau: this.echantillonsParMorceau,
          echantillonnage: sampleRate,
          seuilSilenceEchantillons: this.seuilSilence,
          debutTrame: currentFrame,
          debutTemps: currentTime,
        });
      } else if (m.type === 'arreter-prise') {
        this._viderLeMorceau(true);
        this.mode = 'analyse';
        this.port.postMessage({
          type: 'prise-terminee',
          echantillonsVus: this.echantillonsVus,
          echantillonsEcrits: this.echantillonsEcrits,
          blocsVus: this.blocsVus,
          blocsSansEntree: this.blocsSansEntree,
          morceaux: this.indexMorceau,
          total: this.total,
          canal: this.canal,
          echantillonsRetenus: this.echantillonsRetenus,
          zerosRetenus: this.zerosRetenus,
          debutTrame: this.debutTrame,
          finTrame: currentFrame,
          finTemps: currentTime,
          // Les trames écoulées sur le fil AUDIO entre le démarrage et l'arrêt : le témoin du
          // temps contre lequel le compte de blocs du worklet se confronte.
          tramesEcoulees: currentFrame - (this.debutTrame || 0),
        });
      } else if (m.type === 'mesurer-bruit') {
        // Le filtre est construit ICI, avec la fréquence RÉELLE du contexte : ses coefficients
        // en dépendent, et un filtre calculé pour 48 kHz appliqué à 44,1 kHz couperait ailleurs
        // qu'à 120 Hz.
        this.bruit = {
          restants: Math.max(1, Math.round(m.echantillons || sampleRate * 3)),
          demandes: Math.max(1, Math.round(m.echantillons || sampleRate * 3)),
          n: 0, sommeCarre: 0, sommeCarreGrave: 0, crete: 0, zeros: 0,
          // DEUX MOITIÉS, pour savoir si le silence initial en était un. T13 porte la trace du
          // contraire : au lot 0, « un silence initial de 3 s n'a jamais été silencieux ». Si la
          // seconde moitié est nettement plus forte que la première, quelqu'un a commencé à
          // parler et la mesure de bruit ne mesure plus le bruit. Le module le dira plutôt que
          // de rendre un verdict faux.
          n1: 0, sommeCarre1: 0, n2: 0, sommeCarre2: 0,
          filtre: new PasseBas(BRUIT_COUPURE_HZ, sampleRate),
          canal: m.canal || 'gauche',
        };
        this.port.postMessage({ type: 'bruit-demarre', echantillons: this.bruit.demandes,
                                coupureHz: BRUIT_COUPURE_HZ, echantillonnage: sampleRate });
      } else if (m.type === 'vider-maintenant') {
        // Appelé quand la page se masque ou se décharge : on pousse le morceau PARTIEL plutôt
        // que de le perdre. Ce qui est RÉELLEMENT garanti est écrit dans le module, pas ici :
        // ce message peut n'être jamais traité si le processus meurt avant.
        const avant = this.dansLeMorceau;
        this._viderLeMorceau(true);
        this.port.postMessage({
          type: 'vide-force',
          morceaux: this.indexMorceau,
          echantillonsPousses: avant,
          raison: m.raison || 'inconnue',
        });
      }
    };
  }

  _viderLeMorceau(partiel) {
    if (this.dansLeMorceau === 0) return;
    const taille = this.dansLeMorceau;
    const copie = this.morceau.slice(0, taille);
    this.port.postMessage({
      type: 'morceau',
      index: this.indexMorceau,
      debutEchantillon: this.echantillonsEcrits - taille,
      nbEchantillons: taille,
      partiel: !!partiel,
      pcm: copie.buffer,
    }, [copie.buffer]);
    this.indexMorceau++;
    this.dansLeMorceau = 0;
  }

  process(entrees) {
    const entree = entrees[0];

    if (!entree || entree.length === 0 || !entree[0] || entree[0].length === 0) {
      // Aucun canal : l'entrée a disparu (piste terminée, contexte suspendu, périphérique
      // retiré). On le COMPTE au lieu de rendre `true` en silence — c'est exactement la prise de
      // 71 secondes entièrement à zéro du lot 0, qui n'avait levé aucune alerte.
      this.blocsSansEntree++;
      return true;
    }

    const g = entree[0];
    const d = entree.length > 1 ? entree[1] : null;

    this.blocsVus++;
    this.echantillonsVus += g.length;
    accumuler(this.releve, g, d, entree.length);
    accumuler(this.total, g, d, entree.length);

    // ── LA MESURE DU BRUIT DE PIÈCE, quand elle est en cours ────────────────────────────────
    // Elle tourne en mode analyse comme en mode prise : le silence initial de 3 s appartient à
    // la prise (T13), et c'est là qu'on veut la mesurer.
    if (this.bruit && this.bruit.restants > 0) {
      const b = this.bruit;
      const prendre = Math.min(b.restants, g.length);
      for (let i = 0; i < prendre; i++) {
        const v = b.canal === 'droit' ? (d ? d[i] : 0)
                : b.canal === 'moyenne' ? (d ? (g[i] + d[i]) / 2 : g[i])
                : g[i];
        const grave = b.filtre.filtrer(v);
        b.sommeCarre += v * v;
        b.sommeCarreGrave += grave * grave;
        if (b.n < b.demandes / 2) { b.n1++; b.sommeCarre1 += v * v; }
        else { b.n2++; b.sommeCarre2 += v * v; }
        const a = v < 0 ? -v : v;
        if (a > b.crete) b.crete = a;
        if (v === 0) b.zeros++;
        b.n++;
      }
      b.restants -= prendre;
      if (b.restants <= 0) {
        this.port.postMessage({
          type: 'bruit', n: b.n, demandes: b.demandes,
          sommeCarre: b.sommeCarre, sommeCarreGrave: b.sommeCarreGrave,
          crete: b.crete, zeros: b.zeros, canal: b.canal,
          n1: b.n1, sommeCarre1: b.sommeCarre1, n2: b.n2, sommeCarre2: b.sommeCarre2,
          coupureHz: BRUIT_COUPURE_HZ, echantillonnage: sampleRate,
        });
        this.bruit = null;
      }
    }

    if (this.mode === 'prise') {
      const canal = this.canal;
      for (let i = 0; i < g.length; i++) {
        // LE MIXAGE MONO (E3). `moyenne` n'est choisie par le module que lorsque les DEUX canaux
        // portent le même signal ; sur un canal vide elle coûterait 6 dB, ce que E3 interdit.
        const v = canal === 'droit' ? (d ? d[i] : 0)
                : canal === 'moyenne' ? (d ? (g[i] + d[i]) / 2 : g[i])
                : g[i];

        // Suivi du zéro numérique sur le signal RETENU : c'est celui-là qui sera la voix.
        this.echantillonsRetenus++;
        if (v === 0) {
          this.zerosRetenus++;
          this.echantillonsAZeroDeSuite++;
          if (!this.muetAnnonce && this.echantillonsAZeroDeSuite >= this.seuilSilence) {
            this.muetAnnonce = true;
            this.port.postMessage({
              type: 'muet',
              depuisEchantillon: this.echantillonsEcrits - this.echantillonsAZeroDeSuite + 1,
              echantillonsAZero: this.echantillonsAZeroDeSuite,
            });
          }
        } else {
          if (this.muetAnnonce) {
            this.port.postMessage({ type: 'son-revenu', aEchantillon: this.echantillonsEcrits });
          }
          this.echantillonsAZeroDeSuite = 0;
          this.muetAnnonce = false;
        }

        // Float32 → entier 16 bits signé. Les deux bornes sont ASYMÉTRIQUES parce que le format
        // l'est : −32768 à +32767. Un écrêtage symétrique à ±32767 perdrait le dernier pas
        // négatif, et un facteur unique de 32767 rendrait −1.0 inatteignable.
        const borne = v < 0 ? (v < -1 ? -1 : v) * 32768 : (v > 1 ? 1 : v) * 32767;
        this.morceau[this.dansLeMorceau++] = Math.round(borne);
        this.echantillonsEcrits++;
        if (this.dansLeMorceau === this.echantillonsParMorceau) this._viderLeMorceau(false);
      }
    }

    this.blocsDepuisReleve++;
    if (this.blocsDepuisReleve >= BLOCS_PAR_RELEVE) {
      this.port.postMessage({
        type: 'releve',
        mode: this.mode,
        canal: this.mode === 'prise' ? this.canal : null,
        releve: this.releve,
        total: this.total,
        echantillonnage: sampleRate,
        echantillonsVus: this.echantillonsVus,
        echantillonsEcrits: this.echantillonsEcrits,
        blocsVus: this.blocsVus,
        blocsSansEntree: this.blocsSansEntree,
        echantillonsAZeroDeSuite: this.echantillonsAZeroDeSuite,
        echantillonsRetenus: this.echantillonsRetenus,
        zerosRetenus: this.zerosRetenus,
        morceaux: this.indexMorceau,
      });
      this.releve = sommesNeuves();
      this.blocsDepuisReleve = 0;
    }

    return true;
  }
}

// Les sommes dont le module tirera niveau, crête et corrélation. Σx est gardé EN PLUS de Σx²
// parce qu'une corrélation de Pearson honnête retire les moyennes : le raccourci
// Σgd/√(Σg²·Σd²) suppose une moyenne nulle, et un signal audio porte une composante continue
// faible mais non nulle.
function sommesNeuves() {
  return {
    n: 0, canaux: 0,
    sommeG: 0, sommeD: 0,
    sommeCarreG: 0, sommeCarreD: 0,
    sommeProduit: 0,
    creteG: 0, creteD: 0,
    zerosG: 0, zerosD: 0,
  };
}

function accumuler(acc, g, d, nbCanaux) {
  acc.canaux = nbCanaux;
  for (let i = 0; i < g.length; i++) {
    const vg = g[i];
    acc.sommeG += vg;
    acc.sommeCarreG += vg * vg;
    const ag = vg < 0 ? -vg : vg;
    if (ag > acc.creteG) acc.creteG = ag;
    if (vg === 0) acc.zerosG++;
    if (d) {
      const vd = d[i];
      acc.sommeD += vd;
      acc.sommeCarreD += vd * vd;
      const ad = vd < 0 ? -vd : vd;
      if (ad > acc.creteD) acc.creteD = ad;
      if (vd === 0) acc.zerosD++;
      acc.sommeProduit += vg * vd;
    }
    acc.n++;
  }
}

registerProcessor('enregistreur-voix', EnregistreurProcesseur);
