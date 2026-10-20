// @vitest-environment node
import { describe, expect, it } from "vitest";
import { foliosDuDocument } from "../src/texte.js";

/** Trancher entre plusieurs nombres dans la marge, en regardant **tout le document** (BAS-02).
 *
 *  ## Le défaut, mesuré sur un livre ordinaire
 *
 *  *Biologie du couple*, 173 pages : **toutes** portent un nombre dans leur bande de marge, et
 *  **67 en portent plusieurs**. `numeroImprime` refuse alors de trancher — « s'ils se
 *  contredisent, on ne tranche pas » — et trente-neuf pour cent des pages perdent leur numéro.
 *  Une page sans numéro ne se cite pas (RCH-09).
 *
 *  La règle « exactement un candidat » est juste pour un livre numérisé, où la marge ne porte que
 *  le folio. Elle est trop stricte pour un livre composé, dont la marge porte aussi un titre
 *  courant numéroté ou un appel de note.
 *
 *  ## Ce qui distingue un folio d'un voisin
 *
 *  **Il progresse.** Un folio avance d'un en un avec le rang de la feuille ; un appel de note, un
 *  numéro de partie, une année ne le font pas. On cherche donc le **décalage** — la différence
 *  entre le nombre lu et le rang — qui revient le plus souvent sur tout le document, et l'on
 *  retient, page par page, le candidat qui s'y tient.
 *
 *  Le vote lui-même n'est pas réécrit : `decalageDominant` existe depuis le 4 octobre pour le
 *  chemin des images, et c'est le même raisonnement. Deux votes pour une même question auraient
 *  fini par ne plus dire la même chose.
 *
 *  ## Ce qu'elle ne fait pas
 *
 *  Elle n'invente aucun numéro. Une page dont aucun candidat ne tient le décalage reste sans
 *  numéro — c'est la règle d'origine, et « ne rien rendre est une réponse, et la bonne ».
 */

/** Les candidats de chaque page, dans l'ordre des pages. */
const marges = (...pages: readonly (readonly number[])[]): readonly (readonly number[])[] => pages;

describe("le folio est celui qui progresse avec le rang", () => {
  it("écarte le voisin qui ne bouge pas", () => {
    // Le cas mesuré : un titre courant numéroté « 7 » sur chaque page, à côté du folio.
    const choisis = foliosDuDocument(marges([7, 20], [7, 21], [7, 22], [7, 23], [7, 24]));
    expect(choisis).toEqual([20, 21, 22, 23, 24]);
  });

  it("laisse passer les pages qui n'ont qu'un candidat", () => {
    expect(foliosDuDocument(marges([20], [21], [22], [23], [24]))).toEqual([20, 21, 22, 23, 24]);
  });

  it("ne rend rien pour une page dont aucun candidat ne tient le décalage", () => {
    // Une page de titre de partie, qui ne porte que le numéro de la partie.
    const choisis = foliosDuDocument(marges([20], [21], [3], [23], [24]));
    expect(choisis).toEqual([20, 21, undefined, 23, 24]);
  });

  it("n'invente jamais un numéro là où la marge est vide", () => {
    expect(foliosDuDocument(marges([20], [], [22], [23], [24]))).toEqual([20, undefined, 22, 23, 24]);
  });

  it("suit un décalage négatif comme un positif", () => {
    // Les pages liminaires ne sont pas numérotées : le folio commence en retard sur le rang.
    const choisis = foliosDuDocument(marges([1], [2], [3], [4]));
    expect(choisis).toEqual([1, 2, 3, 4]);
  });

  it("tient sur une double page, dont les deux moitiés se suivent", () => {
    // Après la coupe, chaque moitié a son propre rang, et le folio progresse d'un en un comme
    // ailleurs. Le décalage est le même pour les deux moitiés d'une feuille.
    const choisis = foliosDuDocument(marges([100, 101], [100, 101], [102, 103], [102, 103]));
    expect(choisis).toEqual([100, 101, 102, 103]);
  });

  it("ne s'impose pas sur un décalage sans appui", () => {
    // Le cas attrapé par une fixture : une feuille qui ne porte **qu'un** folio, coupée en deux,
    // donne un folio toutes les deux pages. Le décalage change alors à chaque folio — 1−1, 2−3,
    // 3−5 — et aucun ne revient. Un « plus fréquent » tiré d'une seule voix emporterait tout le
    // document et effacerait les numéros justes que chaque page avait trouvés seule.
    const choisis = foliosDuDocument(marges([1], [], [2], [], [3], [], [4], []));
    expect(choisis).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
  });

  it("ne tranche pas un document trop court pour voter", () => {
    // Deux pages ne disent rien d'un décalage : le vote serait un tirage au sort déguisé.
    expect(foliosDuDocument(marges([7, 20], [7, 21]))).toEqual([undefined, undefined]);
  });

  it("rend un tableau de la même longueur que ce qu'on lui donne", () => {
    // Une correspondance par rang, sans quoi l'appelant devrait la reconstruire — et c'est là
    // qu'un décalage d'un cran se glisse.
    expect(foliosDuDocument(marges([1], [2], [3], [4], [5])).length).toBe(5);
  });
});
