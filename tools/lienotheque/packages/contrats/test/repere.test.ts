import { describe, expect, it } from "vitest";
import { ElementRepere, LigneInterpretee, PageReperee, ResultatRecette, SourcePiste } from "../src/index.js";

const element = {
  y: 0.25,
  numero: 7,
  pisteLue: 7,
  presencePiste: 1,
  suite: false,
  accordNumero: 1,
  accordPiste: 1,
};

describe("lecture d'un élément (OUT-07)", () => {
  it("accepte une lecture complète", () => {
    expect(ElementRepere.safeParse(element).success).toBe(true);
  });

  it("refuse une hauteur hors de la page", () => {
    expect(ElementRepere.safeParse({ ...element, y: 1.4 }).success).toBe(false);
    expect(ElementRepere.safeParse({ ...element, y: -0.1 }).success).toBe(false);
  });

  it("refuse un numéro nul ou négatif : aucun document ne commence à zéro", () => {
    expect(ElementRepere.safeParse({ ...element, numero: 0 }).success).toBe(false);
  });

  it("admet une lecture sans pastille, mais pas un accord inventé", () => {
    const { pisteLue: _sans, ...sansPastille } = element;
    expect(ElementRepere.safeParse({ ...sansPastille, presencePiste: 0, accordPiste: 0 }).success).toBe(true);
    expect(ElementRepere.safeParse({ ...element, accordPiste: 1.5 }).success).toBe(false);
  });

  it("une pastille vue mais illisible reste une information", () => {
    const { pisteLue: _sans, ...vueSeulement } = element;
    const lu = ElementRepere.parse({ ...vueSeulement, presencePiste: 0.9, accordPiste: 0 });
    expect(lu.presencePiste).toBe(0.9);
    expect(lu.pisteLue).toBeUndefined();
  });
});

describe("page repérée (OUT-07)", () => {
  it("une couverture ne porte pas de numéro imprimé", () => {
    expect(PageReperee.safeParse({ index: 0, rang: 0, statut: "couverture", elements: [] }).success).toBe(true);
    const refus = PageReperee.safeParse({ index: 0, rang: 0, statut: "couverture", pageImprimee: 1, elements: [] });
    expect(refus.success).toBe(false);
    expect(refus.error?.issues[0]?.message).toContain("couverture");
  });

  it("une page numérotée porte son numéro", () => {
    expect(PageReperee.safeParse({ index: 1, rang: 1, statut: "lue", elements: [] }).success).toBe(false);
    expect(PageReperee.safeParse({ index: 1, rang: 1, statut: "lue", pageImprimee: 3, elements: [element] }).success).toBe(true);
  });

  it("n'admet que les trois statuts prévus", () => {
    expect(PageReperee.safeParse({ index: 1, rang: 1, statut: "supposee", pageImprimee: 3, elements: [] }).success).toBe(false);
  });

  it("porte son rang : sur un livre photographié, un cliché vaut deux pages", () => {
    const sansRang = { index: 1, statut: "lue", pageImprimee: 3, elements: [] };
    expect(PageReperee.safeParse(sansRang).success).toBe(false);
    expect(PageReperee.safeParse({ ...sansRang, rang: 2, cote: "gauche" }).success).toBe(true);
    expect(PageReperee.safeParse({ ...sansRang, rang: 3, cote: "droite" }).success).toBe(true);
  });
});

describe("ligne interprétée (REC-02, REC-05)", () => {
  const ligne = { numero: 7, pageImprimee: 5, piste: 7, sourcePiste: "pastille", confiance: 0.95 };

  it("accepte les trois provenances de piste", () => {
    for (const source of SourcePiste.options) expect(LigneInterpretee.safeParse({ ...ligne, sourcePiste: source }).success, source).toBe(true);
  });

  it("refuse « d'après le nom du fichier » : un nom ne vaut qu'indice (REC-05)", () => {
    expect(LigneInterpretee.safeParse({ ...ligne, sourcePiste: "nom_de_fichier" }).success).toBe(false);
  });

  it("refuse une confiance hors de l'intervalle", () => {
    expect(LigneInterpretee.safeParse({ ...ligne, confiance: 1.2 }).success).toBe(false);
  });
});

describe("résultat d'une recette (REC-03)", () => {
  const resultat = {
    recette: { id: "methode-pastille-piste", version: 2 },
    pages: [{ index: 1, rang: 1, statut: "lue", pageImprimee: 3, elements: [element] }],
    lignes: [{ numero: 7, pageImprimee: 3, piste: 7, sourcePiste: "pastille", confiance: 1 }],
    pagesAbsentes: [30, 31],
    ecartes: [{ numero: 99, page: 28, motif: "saut trop grand" }],
  };

  it("porte la recette qui l'a produit", () => {
    expect(ResultatRecette.parse(resultat).recette).toEqual({ id: "methode-pastille-piste", version: 2 });
  });

  it("refuse un résultat sans recette : un résultat orphelin ne se rejoue pas", () => {
    const { recette: _sans, ...sansRecette } = resultat;
    expect(ResultatRecette.safeParse(sansRecette).success).toBe(false);
  });

  it("refuse un paramètre de plus", () => {
    expect(ResultatRecette.safeParse({ ...resultat, duree: 12 }).success).toBe(false);
  });

  it("un élément écarté dit toujours pourquoi", () => {
    expect(ResultatRecette.safeParse({ ...resultat, ecartes: [{ numero: 99, page: 28 }] }).success).toBe(false);
    expect(ResultatRecette.safeParse({ ...resultat, ecartes: [{ numero: 99, page: 28, motif: "" }] }).success).toBe(false);
  });
});
