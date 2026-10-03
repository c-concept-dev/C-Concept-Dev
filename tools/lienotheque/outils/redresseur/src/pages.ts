import { imageIntegrale, moyennesParColonne, recadrer, type ImageGrise } from "@lienotheque/images";

/** Couper, nettoyer, binariser une page photographiée (OUT-03).
 *
 *  Tout ici produit un dérivé. L'image d'origine n'est jamais modifiée : c'est elle qui fait foi,
 *  et c'est sur elle que les ancres sont posées (OPT-04, ANC). */

/** Part de l'image, de part et d'autre du centre, où la pliure peut se trouver. Au-delà, ce
 *  serait une marge, pas une reliure. */
const BANDE_CENTRALE = 0.18;

/** Abscisse de la pliure d'un livre ouvert : la colonne la plus sombre près du centre.
 *
 *  Le papier plonge vers la reliure et y prend l'ombre, sur toute la hauteur. On lisse les
 *  moyennes pour qu'une portée ou une barre de mesure isolée ne passe pas pour une pliure. */
export function gouttiere(image: ImageGrise, bande = BANDE_CENTRALE): number {
  const moyennes = moyennesParColonne(image);
  const centre = image.largeur / 2;
  const marge = Math.max(1, Math.round(image.largeur * bande));
  const debut = Math.max(1, Math.round(centre - marge));
  const fin = Math.min(image.largeur - 2, Math.round(centre + marge));

  // Lissage sur une fenêtre proportionnelle : une pliure est large de plusieurs colonnes.
  const demi = Math.max(1, Math.round(image.largeur * 0.004));
  let meilleure = debut;
  let plusSombre = Number.POSITIVE_INFINITY;

  for (let x = debut; x <= fin; x += 1) {
    let somme = 0;
    let compte = 0;
    for (let voisin = x - demi; voisin <= x + demi; voisin += 1)
      if (voisin >= 0 && voisin < image.largeur) {
        somme += moyennes[voisin]!;
        compte += 1;
      }
    const lissee = somme / compte;
    if (lissee < plusSombre) {
      plusSombre = lissee;
      meilleure = x;
    }
  }
  return meilleure;
}

/** Les deux pages d'un cliché, coupées à la pliure. La pliure elle-même n'appartient à aucune
 *  des deux : on en retire une mince bande de chaque côté. */
export function couperDoublePage(image: ImageGrise, x = gouttiere(image)): { gauche: ImageGrise; droite: ImageGrise; x: number } {
  const retrait = Math.round(image.largeur * 0.005);
  return {
    x,
    gauche: recadrer(image, { x: 0, y: 0, l: Math.max(1, x - retrait), h: image.hauteur }),
    droite: recadrer(image, { x: Math.min(image.largeur - 1, x + retrait), y: 0, l: image.largeur, h: image.hauteur }),
  };
}

/** Ton du papier : le plus fréquent parmi les tons clairs. Une page est surtout du papier.
 *
 *  À fréquence égale, le plus clair l'emporte : ce qui transparaît du verso est toujours plus
 *  sombre que le papier, jamais plus clair. */
export function tonDuPapier(image: ImageGrise): number {
  const comptes = new Uint32Array(256);
  for (const ton of image.pixels) comptes[ton]! += 1;
  let meilleur = 255;
  let plusFrequent = 0;
  for (let ton = 128; ton < 256; ton += 1)
    if (comptes[ton]! >= plusFrequent) {
      plusFrequent = comptes[ton]!;
      meilleur = ton;
    }
  return meilleur;
}

export type OptionsVerso = {
  /** Jusqu'où descendre le point blanc sous le ton du papier, en part de ce ton. Plus c'est
   *  grand, plus on efface — et plus on risque de manger un trait pâle. */
  readonly force?: number;
};

/** Efface ce qui transparaît du verso.
 *
 *  Le verso se voit comme un gris pâle, plus clair que l'encre et plus sombre que le papier. On
 *  remonte le point blanc juste sous le ton du papier : tout ce qui est au-dessus devient blanc,
 *  le reste est réétalé. L'encre, elle, est bien plus sombre et ne bouge pas. */
export function effacerVerso(image: ImageGrise, options: OptionsVerso = {}): ImageGrise {
  // 0,15 : sur les photos de F4 le papier tourne autour de 235 et le verso autour de 205 ;
  // le point blanc tombe alors vers 200, au-dessus du verso et bien au-dessus de l'encre.
  const force = options.force ?? 0.15;
  const papier = tonDuPapier(image);
  const blanc = Math.max(1, Math.round(papier * (1 - force)));
  const table = new Uint8Array(256);
  for (let ton = 0; ton < 256; ton += 1) table[ton] = ton >= blanc ? 255 : Math.round((ton / blanc) * 255);

  const pixels = new Uint8Array(image.pixels.length);
  for (let rang = 0; rang < pixels.length; rang += 1) pixels[rang] = table[image.pixels[rang]!]!;
  return { largeur: image.largeur, hauteur: image.hauteur, pixels };
}

export type OptionsBinarisation = {
  /** Côté de la fenêtre locale, en part de la largeur. */
  readonly fenetre?: number;
  /** Sensibilité de Sauvola. Plus c'est grand, plus le seuil descend, moins on noircit. */
  readonly k?: number;
};

/** Binarisation adaptative, méthode de Sauvola.
 *
 *  Un seuil unique ne marche pas sur une photo : un bord de page est dans l'ombre, le centre est
 *  en pleine lumière. Sauvola décide pour chaque pixel d'après la moyenne et l'écart-type de son
 *  voisinage — là où rien ne varie, c'est du papier ; là où ça varie, il y a de l'encre.
 *
 *  Les images intégrales rendent chaque voisinage en quatre lectures : le coût ne dépend pas de
 *  la taille de la fenêtre. */
export function binariserAdaptatif(image: ImageGrise, options: OptionsBinarisation = {}): ImageGrise {
  const { largeur, hauteur } = image;
  const cote = Math.max(3, Math.round(largeur * (options.fenetre ?? 0.025)) | 1);
  const demi = (cote - 1) / 2;
  const k = options.k ?? 0.2;
  const R = 128;

  const { sommes, carres } = imageIntegrale(image);
  const pas = largeur + 1;
  const rectangle = (table: Float64Array, x0: number, y0: number, x1: number, y1: number): number =>
    table[y1 * pas + x1]! - table[y0 * pas + x1]! - table[y1 * pas + x0]! + table[y0 * pas + x0]!;

  const pixels = new Uint8Array(image.pixels.length);
  for (let y = 0; y < hauteur; y += 1) {
    const y0 = Math.max(0, y - demi);
    const y1 = Math.min(hauteur, y + demi + 1);
    for (let x = 0; x < largeur; x += 1) {
      const x0 = Math.max(0, x - demi);
      const x1 = Math.min(largeur, x + demi + 1);
      const n = (x1 - x0) * (y1 - y0);
      const moyenne = rectangle(sommes, x0, y0, x1, y1) / n;
      const variance = Math.max(0, rectangle(carres, x0, y0, x1, y1) / n - moyenne * moyenne);
      const seuil = moyenne * (1 + k * (Math.sqrt(variance) / R - 1));
      pixels[y * largeur + x] = image.pixels[y * largeur + x]! < seuil ? 0 : 255;
    }
  }
  return { largeur, hauteur, pixels };
}
