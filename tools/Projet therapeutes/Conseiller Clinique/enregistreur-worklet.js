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
