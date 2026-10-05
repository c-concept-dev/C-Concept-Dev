import { formesSombres, type Boite, type ImageGrise } from "@lienotheque/images";

/** Compter les chiffres d'un repère, pour savoir quand une lecture en a laissé un de côté.
 *
 *  Un moteur d'OCR rend un texte ou rien. Quand il rend « 4 » là où le repère porte 14, il ne
 *  signale aucune difficulté : sa réponse est complète de son point de vue. L'image, elle, dit le
 *  contraire — on y voit deux formes de la taille d'un chiffre, et une seule a été lue. Compter
 *  ces formes rend donc une information que l'OCR ne donne pas, et l'attribution des pistes s'en
 *  sert pour préférer un nombre qui contient la lecture à la lecture seule.
 *
 *  **Ce que le comptage ne fait pas, et pourquoi.** On a essayé d'aller plus loin : reconnaître le
 *  chiffre manquant en le comparant aux lectures sûres du document, chaque document constituant
 *  ses propres modèles. Mesuré, cela ne marche pas, et il est inutile de le retenter sous cette
 *  forme — quatre grilles de normalisation, trois distances, cent exemples tirés du document
 *  entier : aucun seuil ne rend plus de repères qu'il n'en abîme. Le détail des chiffres est dans
 *  `docs/decisions.md` et la mesure qui l'a réfuté dans `mesures/comptage-chiffres-f4.ts`. La
 *  raison de fond tient en une phrase : le document est riche en exemples du chiffre des unités —
 *  vingt-neuf « 2 », vingt-trois « 3 » — et pauvre en exemples de celui des dizaines, sept « 1 »,
 *  qui est précisément celui qui manque. */

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
 *  et faisait taire les vrais chiffres : le comptage tombait de 33 repères justes sur 37 à 19, et
 *  douze lectures justes sur vingt-deux passaient pour incomplètes. */
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

  const larges = candidates.filter((boite) => boite.l >= boite.h * PART_ETROITESSE);
  if (larges.length === 0) return [];

  const plusHaute = Math.max(...larges.map((boite) => boite.h));
  return larges
    .filter((boite) => boite.h >= plusHaute * PART_HAUTEUR && boite.l <= boite.h * PART_LARGEUR)
    .sort((a, b) => a.x - b.x);
}
