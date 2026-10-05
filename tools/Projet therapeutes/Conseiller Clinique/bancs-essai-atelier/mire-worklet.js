// Détecteur d'attaque de bip, dans le fil audio.
//
// Il horodate l'attaque avec `currentTime` du contexte audio et l'indice de l'échantillon dans le
// bloc — jamais Date.now() ni performance.now(), qui ne sont pas l'horloge de l'audio. C'est cet
// horodatage que la page convertit ensuite en temps `performance` par getOutputTimestamp(), pour
// le comparer à l'instant d'affichage d'une image.
class DetecteurBip extends AudioWorkletProcessor {
  constructor() {
    super();
    this.seuil = 0.25;      // relatif au maximum théorique du bip (0,9)
    this.armé = true;
    this.dernier = -1;
  }
  process(entrees) {
    const e = entrees[0];
    if (!e || !e.length) return true;
    const c = e[0];
    for (let i = 0; i < c.length; i++) {
      const a = Math.abs(c[i]);
      if (this.armé && a > this.seuil) {
        const t = currentTime + i / sampleRate;
        // Réarmement après 500 ms : un bip dure 50 ms, les paires sont à 3 s d'écart.
        if (t - this.dernier > 0.5) {
          this.port.postMessage({ type: 'attaque', contextTime: t });
          this.dernier = t;
        }
        this.armé = false;
      } else if (!this.armé && a < this.seuil * 0.4) {
        this.armé = true;
      }
    }
    return true;
  }
}
registerProcessor('detecteur-bip', DetecteurBip);
