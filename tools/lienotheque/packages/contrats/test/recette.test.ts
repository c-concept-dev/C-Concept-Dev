import { describe, expect, it } from "vitest";
import { Recette } from "../src/index.js";

/** La recette typée (REC-01) : aucun texte libre interprété, tout paramètre inconnu refusé. */
describe("une zone tracée peut couvrir toute une dimension (REC-01, REC-07)", () => {
  const SOCLE = {
    id: "une-maniere",
    version: 1,
    derivee_de: null,
    preparation: { redressement: "auto", double_page: false },
    regles: { elements: { ordre: "strictement_croissant", saut_max: 6 }, plusieurs_elements_par_piste: true },
    validation: { seuil_confiance: 0.6 },
  };

  it("accepte une bande large comme la page : c'est ce qu'on trace en pied de page", () => {
    const lu = Recette.safeParse({
      ...SOCLE,
      lectures: [{ ancre: "page_imprimee", zone: { type: "rectangle_rel", x: 0, y: 0.9, l: 1, h: 0.1 }, alphabet: "chiffres" }],
    });
    expect(lu.success ? "" : lu.error.issues.map((i) => i.message).join(" ; ")).toBe("");
  });

  it("refuse toujours une zone sans surface", () => {
    const lu = Recette.safeParse({
      ...SOCLE,
      lectures: [{ ancre: "page_imprimee", zone: { type: "rectangle_rel", x: 0, y: 0.9, l: 0, h: 0.1 }, alphabet: "chiffres" }],
    });
    expect(lu.success).toBe(false);
  });

  it("une marge, elle, ne peut pas être la page entière", () => {
    const lu = Recette.safeParse({
      ...SOCLE,
      lectures: [{ ancre: "page_imprimee", zone: { type: "marges_exterieures", largeur_rel: 1 }, alphabet: "chiffres" }],
    });
    expect(lu.success).toBe(false);
  });
});
