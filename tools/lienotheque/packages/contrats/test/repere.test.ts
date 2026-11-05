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
    const sansRang = { feuille: 1, statut: "lue", pageImprimee: 3, elements: [] };
    expect(PageReperee.safeParse(sansRang).success).toBe(false);
    expect(PageReperee.safeParse({ ...sansRang, rang: 2, cote: "gauche" }).success).toBe(true);
    expect(PageReperee.safeParse({ ...sansRang, rang: 3, cote: "droite" }).success).toBe(true);
  });

  // OUT-15, 5 novembre 2026. Le champ s'appelait `index` et comptait les feuilles **retenues** :
  // une feuille sans image était écartée, et toutes les suivantes prenaient son rang. `feuille`
  // dit le rang réel, et la suite n'a donc aucune raison d'être contiguë.
  it("une suite de feuilles peut comporter des trous (OUT-15)", () => {
    const feuille = (rang: number) => ({ feuille: rang, rang, statut: "lue", pageImprimee: rang, elements: [element] });
    // Les feuilles 1, 11 et 24 : les autres ne portaient aucune image, elles n'ont pas été lues.
    const pages = [feuille(1), feuille(11), feuille(24)].map((page) => PageReperee.safeParse(page));
    expect(pages.every((page) => page.success), "un trou dans la suite des feuilles est une donnée valide").toBe(true);
    expect(pages.map((page) => page.data?.feuille)).toEqual([1, 11, 24]);
  });

  it("relit `index` des versions et des caches écrits avant le renommage (OUT-15)", () => {
    const relu = PageReperee.safeParse({ index: 7, rang: 7, statut: "lue", pageImprimee: 5, elements: [element] });
    expect(relu.success, "une version d'avant le 5 novembre 2026 reste lisible").toBe(true);
    expect(relu.data?.feuille, "l'ancien `index` devient la feuille, sans réécrire le fichier").toBe(7);
    const prefere = PageReperee.safeParse({ index: 7, feuille: 9, rang: 9, statut: "lue", pageImprimee: 5, elements: [element] });
    expect(prefere.success, "les deux noms ensemble : `feuille` fait foi, `index` est refusé").toBe(false);
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

  it("nomme la corroboration indépendante d'une table lue dans le document (OUT-10, REC-02)", () => {
    expect(LigneInterpretee.safeParse({ ...ligne, sourcePiste: "corroboration_table" }).success).toBe(true);
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
