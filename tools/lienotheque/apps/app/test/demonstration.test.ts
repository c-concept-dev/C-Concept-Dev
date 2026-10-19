import { VueBibliotheque } from "@lienotheque/contrats";
import { describe, expect, it } from "vitest";
import { VUE_DEMONSTRATION } from "../src/donnees/vue-demonstration.js";

/** Le jeu de démonstration tient-il le contrat des écrans ?
 *
 *  Ce test manquait, et son absence a coûté deux jours de rouge sans que personne le voie. Les
 *  écrans lisent cet instantané là où les fixtures sous droits sont absentes — l'intégration
 *  continue, une autre machine. S'il ne tient plus le contrat, **les trois moteurs n'ont rien à
 *  montrer**, et les épreuves de rendu échouent sur « élément introuvable » : un symptôme qui ne
 *  désigne pas sa cause.
 *
 *  Le contrat a changé le 17 octobre — `PageAffichee.index` est devenu obligatoire — et ce jeu
 *  n'a pas suivi. `pnpm check` ne l'a pas vu, puisque rien ne le lisait hors d'un navigateur.
 *  Il le voit maintenant, et une seconde dérive du même genre sera dite ici plutôt qu'en CI. */

describe("le jeu de démonstration (B6)", () => {
  it("tient le contrat que les écrans attendent", () => {
    const vu = VueBibliotheque.safeParse(VUE_DEMONSTRATION);
    const ecarts = vu.success
      ? []
      : vu.error.issues.map((souci) => `${souci.path.join(".")} : ${souci.message}`);
    expect(ecarts, `le jeu de démonstration s'écarte du contrat : ${ecarts.join(" · ")}`).toEqual([]);
  });

  it("a de quoi montrer un Lecteur : au moins une page, et des rangs qui se suivent", () => {
    // Les épreuves de rendu ouvrent « #lecteur/page=3 » : un jeu sans troisième page n'a rien à
    // afficher, et l'échec serait de nouveau « élément introuvable ».
    const vue = VueBibliotheque.parse(VUE_DEMONSTRATION);
    expect(vue.pages.length).toBeGreaterThanOrEqual(3);
    expect(vue.pages.map((page) => page.index)).toEqual(vue.pages.map((_, rang) => rang + 1));
  });
});
