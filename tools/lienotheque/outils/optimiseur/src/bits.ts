/** Écriture et lecture de trains de bits, bit de poids fort en tête — la convention de T.6
 *  comme celle des images 1 bit d'un PDF. */

export class Plume {
  readonly #octets: number[] = [];
  #courant = 0;
  #remplis = 0;

  /** Écrit les `longueur` bits de poids faible de `valeur`, le plus fort d'abord. */
  ecrire(valeur: number, longueur: number): void {
    for (let rang = longueur - 1; rang >= 0; rang -= 1) {
      this.#courant = (this.#courant << 1) | ((valeur >>> rang) & 1);
      this.#remplis += 1;
      if (this.#remplis === 8) {
        this.#octets.push(this.#courant);
        this.#courant = 0;
        this.#remplis = 0;
      }
    }
  }

  /** Écrit un code donné sous forme de chaîne de « 0 » et « 1 ». */
  ecrireCode(code: string): void {
    for (const bit of code) {
      this.#courant = (this.#courant << 1) | (bit === "1" ? 1 : 0);
      this.#remplis += 1;
      if (this.#remplis === 8) {
        this.#octets.push(this.#courant);
        this.#courant = 0;
        this.#remplis = 0;
      }
    }
  }

  /** Complète le dernier octet par des zéros et rend le tout. */
  terminer(): Buffer {
    if (this.#remplis > 0) {
      this.#octets.push(this.#courant << (8 - this.#remplis));
      this.#courant = 0;
      this.#remplis = 0;
    }
    return Buffer.from(this.#octets);
  }

  get bits(): number {
    return this.#octets.length * 8 + this.#remplis;
  }
}

/** Lit le pixel d'indice `x` d'une ligne empaquetée. 1 = encre. */
export const pixel = (ligne: Uint8Array, x: number): number => (ligne[x >> 3]! >> (7 - (x & 7))) & 1;

/** Positions où la couleur change sur une ligne, la ligne commençant toujours en blanc.
 *  Un élément d'indice pair passe à l'encre, un élément d'indice impair revient au blanc. */
export function changements(ligne: Uint8Array, largeur: number): number[] {
  const positions: number[] = [];
  let precedent = 0;
  for (let x = 0; x < largeur; x += 1) {
    const ici = pixel(ligne, x);
    if (ici !== precedent) {
      positions.push(x);
      precedent = ici;
    }
  }
  return positions;
}
