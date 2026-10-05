// ESSAI 1 — le worklet de capture. Fichier séparé (et non un Blob) : addModule accepte les deux,
// mais un fichier servi par le même serveur local se débogue dans l'inspecteur de Safari.
//
// POURQUOI LE COMPTEUR VIT ICI, et nulle part ailleurs : un marqueur doit être posé sur l'HORLOGE
// AUDIO, jamais sur l'horloge murale. Date.now() et performance.now() dérivent de la position réelle
// dans le flux (démarrage du graphe, blocs perdus, onglet en arrière-plan), et un marqueur décalé de
// 200 ms place une diapositive au mauvais endroit. Le compteur d'échantillons traités est la SEULE
// référence qui soit exactement celle du fichier WAV produit.
//
// GRANULARITÉ : process() reçoit un « quantum de rendu », soit 128 échantillons par défaut dans la
// spécification Web Audio. Un ordre de marquage arrivé en cours de quantum est donc daté au début du
// quantum suivant — la page mesure et affiche cette granularité réelle, jamais une valeur supposée.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.total = 0;            // échantillons traités depuis le démarrage, par canal
    this.enPause = false;
    this.marqueursEnAttente = 0;
    this.quantum = 0;          // mesuré au premier process(), jamais supposé
    this.port.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'marqueur') this.marqueursEnAttente++;
      else if (m.type === 'pause') this.enPause = !!m.valeur;
    };
  }
  process(entrees) {
    const entree = entrees[0];
    if (!entree || entree.length === 0) return true;
    const n = entree[0].length;
    if (!this.quantum) { this.quantum = n; this.port.postMessage({ type: 'quantum', valeur: n }); }
    // Un marqueur demandé est daté AVANT d'ajouter ce quantum : il désigne la frontière exacte
    // entre ce qui est déjà capturé et ce qui va l'être.
    while (this.marqueursEnAttente > 0) {
      this.marqueursEnAttente--;
      this.port.postMessage({ type: 'marqueur', echantillon: this.total });
    }
    if (!this.enPause) {
      // Copie OBLIGATOIRE : les tableaux de process() sont réutilisés d'un quantum à l'autre.
      const canaux = [];
      for (let c = 0; c < entree.length; c++) canaux.push(new Float32Array(entree[c]));
      this.total += n;
      this.port.postMessage({ type: 'audio', canaux: canaux, total: this.total }, canaux.map((a) => a.buffer));
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
