import { formesSombres, type Boite, type ImageGrise } from "@lienotheque/images";

/** Chiffres d'un repère : les compter, les découper, et reconnaître celui que l'OCR a perdu.
 *
 *  Un moteur d'OCR rend un texte ou rien. Quand il rend « 4 » là où le repère porte 14, il ne
 *  signale aucune difficulté : sa réponse est complète de son point de vue. Pourtant l'image dit
 *  le contraire — on y voit deux formes de la taille d'un chiffre, et une seule a été lue.
 *
 *  D'où les deux temps de ce module. **Compter** d'abord : si le repère montre deux chiffres et
 *  que la lecture n'en rend qu'un, la lecture est incomplète, et on le sait sans oracle.
 *  **Comparer** ensuite : les repères à un seul chiffre, eux, se lisent bien, et chacun fournit
 *  un exemple sûr de son chiffre dans la fonte de ce document. Le chiffre perdu est découpé et
 *  rapproché de ces exemples.
 *
 *  Rien n'est écrit en dur : chaque document constitue ses propres modèles à partir de ses
 *  propres lectures sûres. Un document qui n'en fournit pas assez ne se voit rien deviner — la
 *  lecture reste incomplète, et c'est Vérifier qui tranchera. */

/** Grille d'un glyphe normalisé. Plus haute que large : un chiffre l'est.
 *
 *  Des parts d'encre par cellule, non des pixels : à cette échelle une grille binaire se décide
 *  sur un pixel de décalage, alors qu'une moyenne de surface tolère le décalage et l'épaisseur
 *  de trait, qui varient d'un tirage à l'autre. */
const GRILLE_L = 8;
const GRILLE_H = 12;

/** Une forme ramenée à la grille, comparable à une autre. `part` vaut 0 (fond) à 255 (encre). */
export type Glyphe = { readonly parts: Uint8Array };

/** Ramène une forme de l'image à la grille, en gardant ses proportions.
 *
 *  L'échelle est prise sur la hauteur seule, et la forme est centrée dans la largeur : un « 1 »
 *  reste étroit et un « 0 » reste large, alors qu'étirer chacun à la grille entière les
 *  rapprocherait justement sur ce qui les sépare le mieux. */
export function normaliser(binaire: ImageGrise, boite: Boite, seuil = 128): Glyphe {
  const parts = new Uint8Array(GRILLE_L * GRILLE_H);
  if (boite.l <= 0 || boite.h <= 0) return { parts };

  const echelle = GRILLE_H / boite.h;
  const large = Math.min(GRILLE_L, Math.max(1, Math.round(boite.l * echelle)));
  const marge = Math.floor((GRILLE_L - large) / 2);

  for (let ligne = 0; ligne < GRILLE_H; ligne += 1) {
    const y0 = boite.y + (ligne * boite.h) / GRILLE_H;
    const y1 = boite.y + ((ligne + 1) * boite.h) / GRILLE_H;
    for (let colonne = 0; colonne < large; colonne += 1) {
      const x0 = boite.x + (colonne * boite.l) / large;
      const x1 = boite.x + ((colonne + 1) * boite.l) / large;

      let encre = 0;
      let vus = 0;
      for (let y = Math.floor(y0); y < Math.max(Math.floor(y0) + 1, Math.ceil(y1)); y += 1) {
        if (y < 0 || y >= binaire.hauteur) continue;
        for (let x = Math.floor(x0); x < Math.max(Math.floor(x0) + 1, Math.ceil(x1)); x += 1) {
          if (x < 0 || x >= binaire.largeur) continue;
          vus += 1;
          if (binaire.pixels[y * binaire.largeur + x]! < seuil) encre += 1;
        }
      }
      if (vus > 0) parts[ligne * GRILLE_L + marge + colonne] = Math.round((encre / vus) * 255);
    }
  }
  return { parts };
}

/** Écart entre deux glyphes, de 0 (identiques) à 1. Moyenne des écarts par cellule. */
export function ecart(a: Glyphe, b: Glyphe): number {
  let somme = 0;
  for (let rang = 0; rang < a.parts.length; rang += 1) somme += Math.abs(a.parts[rang]! - b.parts[rang]!);
  return somme / (a.parts.length * 255);
}

/** Part de la forme la plus haute en deçà de laquelle une forme n'est pas un chiffre du repère.
 *
 *  Les chiffres d'une fonte partagent leur hauteur ; ce qui est nettement plus court est un
 *  fragment, un point ou une poussière. */
const PART_HAUTEUR = 0.62;
/** Au-delà de cette part de la hauteur ou de la largeur du morceau, une forme n'est pas un
 *  chiffre : c'est le fond du repère, ou le papier qui l'entoure, pris dans le découpage. */
const PART_MORCEAU = 0.92;
/** Une forme plus large que haute dans cette proportion porte plusieurs chiffres soudés, ou
 *  n'est pas un chiffre. On préfère alors ne compter qu'une forme : sous-compter laisse la
 *  lecture telle quelle, sur-compter invente un chiffre à chercher. */
const PART_LARGEUR = 1.25;
/** Et en deçà de cette part de sa hauteur, une forme est un éclat, pas un chiffre.
 *
 *  Mesuré sur les repères des clichés de référence : les éclats du seuillage font un à trois
 *  pixels de large pour trente à quarante de haut, soit 0,03 à 0,08 ; le plus étroit des chiffres
 *  de cette fonte, un « 1 », en fait sept pour trente-cinq, soit 0,20. La séparation est franche
 *  et ce seuil se tient au milieu. Sans lui, un éclat devenait la forme la plus haute du repère
 *  et faisait taire les vrais chiffres. */
const PART_ETROITESSE = 0.15;

/** Les chiffres du morceau, de gauche à droite, tels que l'image les montre.
 *
 *  L'image attendue est celle que l'OCR reçoit : le repère seuillé puis inversé, chiffres sombres
 *  sur fond clair. On n'y cherche pas « des chiffres » — on ne sait pas encore lesquels — mais
 *  **des formes qui ont la taille d'un chiffre**, en prenant pour mesure la plus haute d'entre
 *  elles. Rien d'absolu : un repère de vingt pixels et un de deux cents se comptent pareil. */
export function chiffresDuMorceau(binaire: ImageGrise): Boite[] {
  const candidates = formesSombres(binaire)
    .map((forme) => forme.boite)
    .filter((boite) => boite.h < binaire.hauteur * PART_MORCEAU && boite.l < binaire.largeur * PART_MORCEAU);
  if (candidates.length === 0) return [];

  const larges = candidates.filter((boite) => boite.l >= boite.h * PART_ETROITESSE);
  if (larges.length === 0) return [];

  const plusHaute = Math.max(...larges.map((boite) => boite.h));
  return larges
    .filter((boite) => boite.h >= plusHaute * PART_HAUTEUR && boite.l <= boite.h * PART_LARGEUR)
    .sort((a, b) => a.x - b.x);
}

/** Les exemples sûrs d'un document, par chiffre. */
export type Modeles = ReadonlyMap<number, readonly Glyphe[]>;

/** Rassemble les modèles d'un document à partir de ses lectures sûres.
 *
 *  Une lecture est un exemple quand elle est complète — autant de formes comptées que de chiffres
 *  lus — et qu'elle emporte le vote. Chaque forme donne alors un exemple du chiffre qui lui
 *  correspond, dans l'ordre de gauche à droite. */
export function rassembler(
  sures: Iterable<{ readonly lu: number; readonly glyphes: readonly Glyphe[] }>,
): Modeles {
  const modeles = new Map<number, Glyphe[]>();
  for (const { lu, glyphes } of sures) {
    const chiffres = String(lu).split("").map(Number);
    if (chiffres.length !== glyphes.length) continue;
    for (const [rang, chiffre] of chiffres.entries()) {
      const exemples = modeles.get(chiffre) ?? [];
      exemples.push(glyphes[rang]!);
      modeles.set(chiffre, exemples);
    }
  }
  return modeles;
}

/** Ce qu'une comparaison aux modèles donne : le chiffre le plus proche, son écart, et de combien
 *  il devance le meilleur des autres chiffres. */
export type Reconnaissance = { readonly chiffre: number; readonly ecart: number; readonly avance: number };

/** Rapproche un glyphe des modèles du document. Le plus proche de chaque chiffre compte pour ce
 *  chiffre : deux exemples moyennés feraient une forme qui n'existe dans aucun tirage. */
export function reconnaitre(glyphe: Glyphe, modeles: Modeles): Reconnaissance | undefined {
  const ecarts = [...modeles]
    .map(([chiffre, exemples]) => ({ chiffre, ecart: Math.min(...exemples.map((exemple) => ecart(glyphe, exemple))) }))
    .sort((a, b) => a.ecart - b.ecart || a.chiffre - b.chiffre);
  const meilleur = ecarts[0];
  if (meilleur === undefined) return undefined;
  return { chiffre: meilleur.chiffre, ecart: meilleur.ecart, avance: (ecarts[1]?.ecart ?? 1) - meilleur.ecart };
}
