import { Plume, changements } from "./bits.js";
import { FIN_DE_BLOC, HORIZONTAL, PASSE, VERTICAL, codesDePlage } from "./tables-mmr.js";

/** Encodeur CCITT groupe 4 (ITU-T T.6), le format 1 bit retenu pour les pages noir et blanc
 *  (OPT-01). Codage bidimensionnel pur : chaque ligne se dit par rapport à la précédente, la
 *  première par rapport à une ligne blanche imaginaire.
 *
 *  L'entrée est empaquetée à 1 bit par pixel, bit de poids fort en tête, **bit levé = encre**.
 *  C'est la convention de T.6 ; un PDF en `DeviceGray` 1 bit dit l'inverse, et l'appelant
 *  retourne les bits avant d'arriver ici. */

export type OptionsGroupe4 = {
  /** Ajoute le code de fin de bloc. TIFF n'en veut pas, un PDF peut le demander. */
  readonly finDeBloc?: boolean;
};

/** Première position de changement sur `liste` strictement après `depuis`. */
function apres(liste: readonly number[], depuis: number, largeur: number): number {
  for (const position of liste) if (position > depuis) return position;
  return largeur;
}

/** b1 : premier changement de la ligne de référence après a0, de couleur opposée à celle de a0.
 *  Les changements alternent — rang pair = passage à l'encre, rang impair = retour au blanc —
 *  donc la couleur se lit sur le rang, sans jamais relire les pixels. */
function premierB1(reference: readonly number[], a0: number, encre: boolean, largeur: number): number {
  for (let rang = 0; rang < reference.length; rang += 1) {
    const position = reference[rang]!;
    if (position <= a0) continue;
    const passeALEncre = rang % 2 === 0;
    if (passeALEncre === !encre) return position;
  }
  return largeur;
}

function rangDe(reference: readonly number[], position: number): number {
  const rang = reference.indexOf(position);
  return rang < 0 ? reference.length : rang;
}

/** Encode une image empaquetée en un train groupe 4. */
export function encoderGroupe4(
  donnees: Uint8Array,
  largeur: number,
  hauteur: number,
  options: OptionsGroupe4 = {},
): Buffer {
  const parLigne = Math.ceil(largeur / 8);
  if (donnees.length < parLigne * hauteur) throw new Error("Image trop courte pour ses dimensions");

  const plume = new Plume();
  let reference: number[] = [];

  for (let y = 0; y < hauteur; y += 1) {
    const ligne = donnees.subarray(y * parLigne, (y + 1) * parLigne);
    const courants = changements(ligne, largeur);

    let a0 = -1;
    let encre = false;

    while (a0 < largeur) {
      const a1 = apres(courants, a0, largeur);
      const b1 = premierB1(reference, a0, encre, largeur);
      const rangB1 = rangDe(reference, b1);
      const b2 = rangB1 + 1 < reference.length ? reference[rangB1 + 1]! : largeur;

      if (b2 < a1) {
        plume.ecrireCode(PASSE);
        a0 = b2;
        continue;
      }

      const ecart = a1 - b1;
      const vertical = VERTICAL[ecart];
      if (vertical !== undefined) {
        plume.ecrireCode(vertical);
        a0 = a1;
        encre = !encre;
        continue;
      }

      const a2 = apres(courants, a1, largeur);
      const depart = a0 < 0 ? 0 : a0;
      plume.ecrireCode(HORIZONTAL);
      for (const code of codesDePlage(a1 - depart, encre)) plume.ecrireCode(code);
      for (const code of codesDePlage(a2 - a1, !encre)) plume.ecrireCode(code);
      a0 = a2;
    }

    reference = courants;
  }

  if (options.finDeBloc === true) plume.ecrireCode(FIN_DE_BLOC);
  return plume.terminer();
}
