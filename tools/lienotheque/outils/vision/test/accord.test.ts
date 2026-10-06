// @vitest-environment node
import { appui } from "@lienotheque/recettes";
import { describe, expect, it } from "vitest";
import { seContredisent, troisTemoins } from "../src/index.js";

describe("deux témoins qui se contredisent (OUT-08)", () => {
  const contredit = (un: number | undefined, autre: number | undefined) => seContredisent(un, autre, appui);

  it("ne voit pas de contradiction entre une lecture et sa troncature", () => {
    expect(contredit(4, 14)).toBe(false);
    expect(contredit(14, 4)).toBe(false);
  });

  it("ni entre deux lectures identiques", () => {
    expect(contredit(14, 14)).toBe(false);
  });

  it("en voit une entre deux nombres sans rapport", () => {
    expect(contredit(34, 24)).toBe(true);
    expect(contredit(3, 8)).toBe(true);
  });

  it("n'en voit aucune quand un témoin se tait", () => {
    expect(contredit(undefined, 14)).toBe(false);
    expect(contredit(14, undefined)).toBe(false);
  });
});

describe("ce que trois témoins décident (OUT-08, ANC-02)", () => {
  it("retient la valeur que deux soutiennent", () => {
    expect(troisTemoins([34, 24, 34])).toEqual({ valeur: 34, voix: 2, temoins: 3 });
  });

  it("retient d'autant plus volontiers que les trois s'accordent", () => {
    expect(troisTemoins([14, 14, 14])).toEqual({ valeur: 14, voix: 3, temoins: 3 });
  });

  it("ne retient rien quand les trois diffèrent : l'élément part se faire vérifier", () => {
    expect(troisTemoins([3, 8, 12]).valeur).toBeUndefined();
    expect(troisTemoins([3, 8, 12]).temoins).toBe(3);
  });

  it("compte deux témoins qui s'accordent même si le troisième s'est tu", () => {
    expect(troisTemoins([34, undefined, 34]).valeur).toBe(34);
  });

  it("ne retient rien de deux témoins qui se contredisent et d'un silence", () => {
    expect(troisTemoins([34, 24, undefined]).valeur).toBeUndefined();
  });

  it("ne retient rien d'un témoin seul : une voix n'est pas une majorité", () => {
    expect(troisTemoins([34, undefined, undefined]).valeur).toBeUndefined();
    expect(troisTemoins([]).temoins).toBe(0);
  });

  it("s'abstient sur une égalité, plutôt que de préférer la première", () => {
    expect(troisTemoins([5, 5, 7, 7]).valeur).toBeUndefined();
  });

  it("rend le même résultat quel que soit l'ordre des voix", () => {
    expect(troisTemoins([34, 24, 34])).toEqual(troisTemoins([24, 34, 34]));
  });
});
