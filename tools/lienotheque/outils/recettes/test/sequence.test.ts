import { describe, expect, it } from "vitest";
import { ancrer, numeroterElements, reparer, sautPermis, type ElementPlace } from "../src/index.js";

/** Un élément lu, posé sur une page. Seuls le numéro et la page comptent ici. */
const element = (numero: number, pageImprimee: number, cliche = 0): ElementPlace => ({
  y: 0.1,
  numero,
  suite: false,
  presencePiste: 0,
  accordNumero: 1,
  accordPiste: 0,
  pageImprimee,
  cliche,
});

const suite = (numeros: readonly number[], parPage = 100): ElementPlace[] =>
  numeros.map((numero, rang) => element(numero, 1 + Math.floor(rang / parPage)));

describe("saut permis (REC-02)", () => {
  it("vaut le saut de la recette sur une même page ou la suivante", () => {
    expect(sautPermis(element(1, 10), element(2, 10), 6)).toBe(6);
    expect(sautPermis(element(1, 10), element(2, 11), 6)).toBe(6);
  });

  it("compte les pages traversées quand il en manque", () => {
    expect(sautPermis(element(1, 29), element(2, 32), 6)).toBe(18);
  });
});

describe("ancrage par la plus longue suite (REC-02)", () => {
  it("prend tout quand tout est en ordre", () => {
    expect(ancrer(suite([1, 2, 3, 4, 5]), 6)).toEqual([0, 1, 2, 3, 4]);
  });

  it("laisse de côté l'intrus, pas la suite", () => {
    expect(ancrer(suite([1, 2, 90, 3, 4]), 6)).toEqual([0, 1, 3, 4]);
  });

  it("laisse de côté un retour en arrière", () => {
    expect(ancrer(suite([10, 11, 2, 12, 13]), 6)).toEqual([0, 1, 3, 4]);
  });

  it("refuse un saut plus grand que la recette ne le permet", () => {
    expect(ancrer(suite([1, 20]), 6)).toEqual([0]);
    expect(ancrer(suite([1, 7]), 6)).toEqual([0, 1]);
  });

  it("accepte le même saut quand des pages manquent entre les deux", () => {
    const traverse = [element(1, 29), element(8, 32)];
    expect(ancrer(traverse, 6)).toEqual([0, 1]);
  });

  it("ne rend rien sur un lot vide", () => {
    expect(ancrer([], 6)).toEqual([]);
  });

  it("rend les mêmes ancres à chaque exécution", () => {
    const lot = suite([3, 1, 4, 2, 5, 6]);
    expect(ancrer(lot, 6)).toEqual(ancrer(lot, 6));
  });
});

describe("réparation entre deux ancres (REC-02)", () => {
  it("interpole quand il reste autant de places que de numéros libres", () => {
    // 5 est mal lu ; entre 4 et 6 il n'y a qu'une place et qu'un numéro libre.
    const lot = suite([4, 55, 6]);
    const numeros = reparer(lot, [0, 2]);
    expect(numeros[1]).toEqual({ numero: 5, repare: "interpolation" });
  });

  it("se rattrape sur la fin du numéro quand l'interpolation ne suffit pas", () => {
    // Entre 180 et 185 il y a quatre numéros libres pour une seule place : seul 183 finit par 83.
    const lot = suite([180, 83, 185]);
    const numeros = reparer(lot, [0, 2]);
    expect(numeros[1]).toEqual({ numero: 183, repare: "suffixe" });
  });

  it("ne répare pas quand plusieurs numéros conviendraient", () => {
    // Entre 100 et 130, « 1 » finit aussi bien 101, 111 et 121 : on s'abstient.
    const lot = suite([100, 1, 130]);
    expect(reparer(lot, [0, 2])[1]).toBeUndefined();
  });

  it("laisse les ancres telles qu'elles ont été lues", () => {
    const lot = suite([4, 5, 6]);
    expect(reparer(lot, [0, 1, 2]).map((n) => n?.numero)).toEqual([4, 5, 6]);
    expect(reparer(lot, [0, 1, 2]).every((n) => n?.repare === undefined)).toBe(true);
  });

  it("ne répare rien après la dernière ancre : rien ne l'y force", () => {
    const lot = suite([4, 5, 99]);
    expect(reparer(lot, [0, 1])[2]).toBeUndefined();
  });
});

describe("numérotation d'un lot (REC-02)", () => {
  it("rend les éléments numérotés et dit ceux qu'il renonce à placer", () => {
    const lot = suite([10, 11, 777, 12, 13]);
    const { numerotes, ecartes } = numeroterElements(lot, 6);
    expect(numerotes.map((e) => e.numeroRetenu)).toEqual([10, 11, 12, 13]);
    expect(ecartes.map((e) => e.numero)).toEqual([777]);
    expect(ecartes[0]?.motif).toContain("suite croissante");
  });

  it("marque ce qui a été réparé, pour que la confiance s'en souvienne", () => {
    const { numerotes } = numeroterElements(suite([180, 83, 185]), 12);
    expect(numerotes.map((e) => e.numeroRetenu)).toEqual([180, 183, 185]);
    expect(numerotes[1]?.repare).toBe("suffixe");
    expect(numerotes[0]?.repare).toBeUndefined();
  });

  it("garde l'ordre d'arrivée des éléments", () => {
    const { numerotes } = numeroterElements(suite([1, 2, 3]), 6);
    expect(numerotes.map((e) => e.numeroRetenu)).toEqual([1, 2, 3]);
  });
});
