import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ElementRepere } from "@lienotheque/contrats";
import { chargerRecette, interpreter, numeroterPages, sequencer, type PageLue } from "../src/index.js";

const RECETTE = chargerRecette(
  JSON.parse(readFileSync(join(import.meta.dirname, "../../../fixtures/recettes/methode-pastille-piste.v2.json"), "utf8")),
);

const element = (numero: number, sur: Partial<ElementRepere> = {}): ElementRepere => ({
  y: 0.1 * numero,
  numero,
  suite: false,
  presencePiste: 0,
  accordNumero: 1,
  accordPiste: 0,
  ...sur,
});

const page = (index: number, pageLue: number | undefined, numeros: readonly ElementRepere[]): PageLue => ({
  index,
  ...(pageLue === undefined ? {} : { pageLue }),
  elements: numeros,
});

describe("numérotation des pages (OUT-07)", () => {
  it("tient une première page sans élément pour une couverture", () => {
    const { pages } = numeroterPages([page(0, 1, []), page(1, 3, [element(1)])]);
    expect(pages[0]?.statut).toBe("couverture");
    expect(pages[0]?.pageImprimee).toBeUndefined();
  });

  it("déduit le décalage et le garde quand une lecture isolée se trompe", () => {
    const pages = [
      page(0, undefined, [element(1)]),
      page(1, 3, [element(2)]),
      page(2, 4, [element(3)]),
      page(3, 97, [element(4)]),
      page(4, 6, [element(5)]),
    ];
    const numerotees = numeroterPages(pages).pages;
    expect(numerotees.map((p) => p.pageImprimee)).toEqual([2, 3, 4, 5, 6]);
    expect(numerotees[3]?.statut, "la lecture aberrante ne fait pas foi").toBe("deduite");
  });

  it("relève les pages absentes quand le décalage augmente durablement", () => {
    const pages = [
      page(0, 3, [element(1)]),
      page(1, 4, [element(2)]),
      page(2, 5, [element(3)]),
      page(3, 8, [element(7)]),
      page(4, 9, [element(8)]),
      page(5, 10, [element(9)]),
    ];
    const { absentes } = numeroterPages(pages);
    expect(absentes).toEqual([6, 7]);
  });

  it("ne relève rien quand la numérotation est continue", () => {
    const pages = [page(0, 3, [element(1)]), page(1, 4, [element(2)]), page(2, 5, [element(3)])];
    expect(numeroterPages(pages).absentes).toEqual([]);
  });

  it("dit « lue » quand le numéro lu confirme le déduit, « deduite » sinon", () => {
    const { pages } = numeroterPages([page(0, 3, [element(1)]), page(1, undefined, [element(2)])]);
    expect(pages[0]?.statut).toBe("lue");
    expect(pages[1]?.statut).toBe("deduite");
  });
});

describe("enchaînement des éléments et des pistes (REC-02)", () => {
  const numerote = (pages: readonly PageLue[]) => numeroterPages(pages).pages;

  it("prend la pastille quand son pas est permis", () => {
    const { lignes } = sequencer(numerote([page(0, 3, [element(1, { pisteLue: 1, accordPiste: 1 })])]), RECETTE);
    expect(lignes[0]).toMatchObject({ numero: 1, piste: 1, sourcePiste: "pastille" });
  });

  it("retombe sur le numéro d'élément quand la recette dit qu'ils coïncident", () => {
    const { lignes } = sequencer(numerote([page(0, 3, [element(1)])]), RECETTE);
    expect(lignes[0]).toMatchObject({ piste: 1, sourcePiste: "numero_element" });
  });

  it("garde la piste précédente sur une mention de suite", () => {
    const { lignes } = sequencer(
      numerote([page(0, 3, [element(1, { pisteLue: 1, accordPiste: 1 }), element(2, { suite: true })])]),
      RECETTE,
    );
    expect(lignes[1]).toMatchObject({ numero: 2, piste: 1, sourcePiste: "suite" });
  });

  it("écarte un élément qui rompt l'ordre, et dit pourquoi", () => {
    const { lignes, ecartes } = sequencer(numerote([page(0, 3, [element(1), element(40)])]), RECETTE);
    expect(lignes.map((l) => l.numero)).toEqual([1]);
    expect(ecartes[0]?.numero).toBe(40);
    expect(ecartes[0]?.motif).toContain("suite croissante");
  });

  it("écarte un retour en arrière", () => {
    const { lignes, ecartes } = sequencer(numerote([page(0, 3, [element(5), element(2)])]), RECETTE);
    expect(lignes.map((l) => l.numero)).toEqual([5]);
    expect(ecartes[0]?.numero).toBe(2);
  });

  it("garde la plus longue suite, pas la première venue", () => {
    // Un 90 isolé au milieu d'une suite régulière : c'est lui qui saute, pas le reste.
    const pages = numerote([page(0, 3, [element(1), element(2), element(90), element(3), element(4)])]);
    const { lignes, ecartes } = sequencer(pages, RECETTE);
    expect(lignes.map((l) => l.numero)).toEqual([1, 2, 3, 4]);
    expect(ecartes.map((e) => e.numero)).toEqual([90]);
  });

  it("élargit le saut permis à proportion des pages traversées", () => {
    // Deux pages manquent entre la 5 et la 8 : les éléments qu'elles portaient manquent aussi,
    // et le saut qui les enjambe est légitime. Sans cela l'écart se propagerait à toute la suite.
    const pages = numerote([
      page(0, 3, [element(1)]),
      page(1, 4, [element(2)]),
      page(2, 5, [element(3)]),
      page(3, 8, [element(10), element(11), element(12)]),
    ]);
    const { lignes, ecartes } = sequencer(pages, RECETTE);
    expect(ecartes, "aucun élément écarté après un trou connu").toEqual([]);
    expect(lignes.map((l) => l.numero)).toEqual([1, 2, 3, 10, 11, 12]);
  });

  it("n'élargit rien sur une page consécutive : un saut de 40 reste un saut de 40", () => {
    const pages = numerote([page(0, 3, [element(1)]), page(1, 4, [element(41)])]);
    expect(sequencer(pages, RECETTE).ecartes).toHaveLength(1);
  });

  it("une pastille qui confirme le numéro d'élément vaut pleine confiance", () => {
    const sur = sequencer(numerote([page(0, 3, [element(1, { pisteLue: 1, accordNumero: 0.7, accordPiste: 0.7 })])]), RECETTE);
    expect(sur.lignes[0]?.confiance).toBe(0.95);
  });
});

describe("déterminisme (REC-02)", () => {
  const lot: PageLue[] = [
    page(0, 3, [element(1, { pisteLue: 1, accordPiste: 1 }), element(2, { suite: true })]),
    page(1, 4, [element(3, { pisteLue: 3, accordPiste: 0.67 })]),
    page(2, 7, [element(8)]),
  ];

  it("rejoué, rend exactement le même résultat", () => {
    const premier = interpreter(lot, RECETTE);
    const second = interpreter(lot, RECETTE);
    expect(JSON.stringify(second)).toBe(JSON.stringify(premier));
  });

  it("porte la recette qui l'a produit (REC-03)", () => {
    const resultat = interpreter(lot, RECETTE);
    expect(resultat.recette).toEqual({ id: "methode-pastille-piste", version: 2 });
  });

  it("une autre version de la recette se voit dans le résultat", () => {
    const v1 = chargerRecette(
      JSON.parse(readFileSync(join(import.meta.dirname, "../../../fixtures/recettes/methode-pastille-piste.v1.json"), "utf8")),
    );
    expect(interpreter(lot, v1).recette.version).toBe(1);
  });
});
