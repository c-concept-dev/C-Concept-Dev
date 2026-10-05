import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ElementRepere } from "@lienotheque/contrats";
import { chargerRecette, clefDeVision, interpreter, numeroterPages, sequencer, type LectureParVision, type PageLue, type PageNumerotee, supportsPresents } from "../src/index.js";

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

describe("un numéro relu n'est appliqué que si la suite le confirme (ANC-02, OUT-08)", () => {
  const V5 = chargerRecette(
    JSON.parse(readFileSync(join(import.meta.dirname, "../../../fixtures/recettes/methode-pastilles-cd.v5.json"), "utf8")),
  );

  /** Trois éléments sur trois pages, celui du milieu ayant un repère illisible. */
  const pages = (sur: Partial<ElementRepere> = {}): PageNumerotee[] => [
    { index: 10, rang: 20, cote: "gauche", pageImprimee: 70, statut: "lue", elements: [element(1, { pisteLue: 11, accordPiste: 1 })] },
    { index: 11, rang: 22, cote: "gauche", pageImprimee: 71, statut: "lue", elements: [element(2, sur)] },
    { index: 12, rang: 24, cote: "gauche", pageImprimee: 72, statut: "lue", elements: [element(3, { pisteLue: 13, accordPiste: 1 })] },
  ];

  const relu = (numero: number, confiance = 0.9): Map<string, LectureParVision> =>
    new Map([[clefDeVision(11, "gauche", 2), { numero, confiance, outil: { nom: "vision-ciblee", version: "0.1.0" } }]]);

  const deuxieme = (sur: Partial<ElementRepere>, vision?: Map<string, LectureParVision>) =>
    sequencer(pages(sur), V5, { nombreDePistes: 92, ...(vision === undefined ? {} : { vision }) }).lignes.find((ligne) => ligne.numero === 2)!;

  it("l'applique et le dit quand la suite le confirme", () => {
    const ligne = deuxieme({}, relu(12));
    expect(ligne.piste).toBe(12);
    expect(ligne.sourcePiste).toBe("vision");
    expect(ligne.confiance).toBeGreaterThanOrEqual(V5.validation.seuil_confiance);
  });

  it("ne l'applique pas quand la suite tranche ailleurs, et le fait passer sous le seuil", () => {
    // 47 ne tient pas entre 11 et 13 : la suite impose 12, et la relecture est donc contredite.
    const ligne = deuxieme({}, relu(47));
    expect(ligne.piste).not.toBe(47);
    expect(ligne.sourcePiste).not.toBe("vision");
    expect(ligne.confiance).toBeLessThan(V5.validation.seuil_confiance);
  });

  it("reste sous une pastille lue sur place : un seul témoin, pas deux", () => {
    const parVision = deuxieme({}, relu(12, 1));
    const surPlace = deuxieme({ pisteLue: 12, accordPiste: 1 });
    expect(parVision.sourcePiste).toBe("vision");
    expect(surPlace.sourcePiste).toBe("pastille");
    expect(parVision.confiance).toBeLessThan(surPlace.confiance);
  });

  it("l'emporte sur une lecture locale tronquée : c'est pour cela que le pavé est parti", () => {
    const ligne = deuxieme({ pisteLue: 2, accordPiste: 1 }, relu(12));
    expect(ligne.piste).toBe(12);
    expect(ligne.sourcePiste).toBe("vision");
  });

  it("devient porteur de repère alors que rien n'avait été lu sur la page", () => {
    expect(deuxieme({}).sourcePiste).not.toBe("vision");
    expect(deuxieme({}, relu(12)).sourcePiste).toBe("vision");
  });

  it("ne change rien quand aucune relecture n'est fournie", () => {
    expect(sequencer(pages(), V5, { nombreDePistes: 92 })).toEqual(sequencer(pages(), V5, { nombreDePistes: 92, vision: new Map() }));
  });

  it("distingue les deux côtés d'un même cliché", () => {
    expect(clefDeVision(11, "gauche", 2)).not.toBe(clefDeVision(11, "droite", 2));
    expect(clefDeVision(11, undefined, 2)).not.toBe(clefDeVision(11, "gauche", 2));
  });
});

describe("un support absent ne reçoit pas les éléments du précédent (REC-05, A5)", () => {
  const V5 = chargerRecette(
    JSON.parse(readFileSync(join(import.meta.dirname, "../../../fixtures/recettes/methode-pastilles-cd.v5.json"), "utf8")),
  );

  /** Une suite bien engagée sur le premier support, puis un retour franc au début : c'est ce que
   *  la recette appelle un changement de disque. */
  const lot = (): PageNumerotee[] =>
    Array.from({ length: 28 }, (_, rang) => ({
      index: rang,
      rang,
      cote: "gauche" as const,
      pageImprimee: 60 + rang,
      statut: "lue" as const,
      elements: [element(rang + 1, { pisteLue: rang < 25 ? rang + 1 : rang - 24, accordPiste: 1, chiffresComptes: 1 })],
    }));

  it("sans inventaire, les derniers éléments vont sur un second support, comme avant", () => {
    const { lignes } = sequencer(lot(), V5, { nombreDePistes: 25 });
    expect(lignes.filter((ligne) => ligne.disque === 2)).toHaveLength(3);
  });

  it("avec un inventaire qui ne connaît qu'un support, ils restent sans piste", () => {
    const { lignes } = sequencer(lot(), V5, { nombreDePistes: 25, supports: new Map([[1, 25]]) });
    const derniers = lignes.slice(-3);
    expect(derniers.every((ligne) => ligne.piste === undefined)).toBe(true);
    expect(derniers.every((ligne) => ligne.sourcePiste === undefined)).toBe(true);
  });

  it("et ils n'héritent de rien : relier au hasard est pire que ne pas relier", () => {
    const { lignes } = sequencer(lot(), V5, { nombreDePistes: 25, supports: new Map([[1, 25]]) });
    expect(lignes.filter((ligne) => ligne.piste === 25)).toHaveLength(1);
  });

  it("le premier support garde les siens", () => {
    const { lignes } = sequencer(lot(), V5, { nombreDePistes: 25, supports: new Map([[1, 25]]) });
    const premiers = lignes.slice(0, 25);
    expect(premiers.every((ligne) => ligne.disque === 1 && ligne.piste !== undefined)).toBe(true);
    expect(premiers.map((ligne) => ligne.piste)).toEqual(Array.from({ length: 25 }, (_, rang) => rang + 1));
  });

  it("quand le second support est là, il reçoit bien ses éléments", () => {
    const { lignes } = sequencer(lot(), V5, { nombreDePistes: 25, supports: new Map([[1, 25], [2, 10]]) });
    expect(lignes.filter((ligne) => ligne.disque === 2 && ligne.piste !== undefined)).toHaveLength(3);
  });

  it("un repère lu contredit l'inventaire : c'est la page qui fait foi", () => {
    // L'inventaire ne connaît que 20 pistes, mais une pastille en annonce 25 : c'est l'inventaire
    // qui est incomplet, et la piste lue doit pouvoir être attribuée.
    const { lignes } = sequencer(lot(), V5, { nombreDePistes: 25, supports: new Map([[1, 20]]) });
    expect(lignes.some((ligne) => ligne.piste === 25)).toBe(true);
  });

  it("l'inventaire se tire des médias rangés, support par support", () => {
    const inventaire = supportsPresents([
      { piste: 1, disque: 1 },
      { piste: 92, disque: 1 },
      { piste: 3, disque: 2 },
    ]);
    expect([...inventaire]).toEqual([[1, 92], [2, 3]]);
  });

  it("un média sans support déclaré compte pour le premier", () => {
    expect([...supportsPresents([{ piste: 7 }])]).toEqual([[1, 7]]);
  });
});
