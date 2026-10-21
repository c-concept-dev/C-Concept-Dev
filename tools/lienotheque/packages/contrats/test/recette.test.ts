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


/** La double page se **déclare**, ou se laisse voir (REC-01)
 *
 *  Elle était un booléen obligatoire, donc toujours présent, donc toujours une déclaration — et
 *  comme rien dans l'éditeur ne la touche, toute manière de lire écrivait « une page par
 *  feuille » sans que personne l'ait dit. La chaîne, qui obéit à ce qui est déclaré, ne regardait
 *  donc jamais le document.
 *
 *  Facultative, l'absence redevient ce qu'elle doit être : « je n'ai pas tranché, regarde ». Un
 *  `false` écrit reste un `false` qui fait autorité — c'est une décision, et elle vaut contre un
 *  détecteur qui se tromperait. */
describe("la double page se déclare, ou se laisse voir (REC-01)", () => {
  const SANS_PREPARATION = {
    id: "une-maniere",
    version: 1,
    derivee_de: null,
    lectures: [{ ancre: "page_imprimee", zone: { type: "rectangle_rel", x: 0, y: 0.9, l: 1, h: 0.1 }, alphabet: "chiffres" }],
    regles: { elements: { ordre: "strictement_croissant", saut_max: 6 }, plusieurs_elements_par_piste: true },
    validation: { seuil_confiance: 0.6 },
  };

  it("accepte une préparation qui ne dit rien de la double page", () => {
    const lu = Recette.safeParse({ ...SANS_PREPARATION, preparation: { redressement: "aucun" } });
    expect(lu.success ? "" : lu.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; ")).toBe("");
    expect(lu.success && lu.data.preparation.double_page, "une absence ne se remplit pas toute seule").toBeUndefined();
  });

  it("garde les deux déclarations, qui ne veulent pas dire la même chose", () => {
    for (const declare of [true, false]) {
      const lu = Recette.safeParse({ ...SANS_PREPARATION, preparation: { redressement: "aucun", double_page: declare } });
      expect(lu.success && lu.data.preparation.double_page).toBe(declare);
    }
  });

  it("refuse toujours ce qui n'est pas un booléen : une absence n'est pas n'importe quoi", () => {
    const lu = Recette.safeParse({ ...SANS_PREPARATION, preparation: { redressement: "aucun", double_page: "oui" } });
    expect(lu.success).toBe(false);
  });
});
