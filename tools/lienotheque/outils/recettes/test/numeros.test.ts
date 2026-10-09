import { describe, expect, it } from "vitest";
import { FORME_PAR_DEFAUT, caracteresAcceptes, formeDepuisExemple, rangDuNumero } from "../src/numeros.js";

/** La forme d'un numéro, donnée par l'exemple (REC-01, REC-07). */

describe("sans exemple, rien ne change", () => {
  it("un numéro reste un nombre de un à trois chiffres", () => {
    for (const bon of ["1", "42", "400"]) expect(FORME_PAR_DEFAUT.motif.test(bon), bon).toBe(true);
    for (const mauvais of ["0400", "2.46", "A1", ""]) expect(FORME_PAR_DEFAUT.motif.test(mauvais), mauvais).toBe(false);
  });

  it("son rang est le nombre lui-même : l'ordre d'avant est l'ordre d'après", () => {
    expect(rangDuNumero("400", FORME_PAR_DEFAUT)).toBe(400);
    expect(rangDuNumero("401", FORME_PAR_DEFAUT)).toBeGreaterThan(rangDuNumero("400", FORME_PAR_DEFAUT)!);
  });

  it("« 0 » n'est le numéro d'aucun élément", () => {
    expect(rangDuNumero("0", FORME_PAR_DEFAUT)).toBeUndefined();
  });
});

describe("l'exemple décide, et deux règles le lisent", () => {
  const FORME = formeDepuisExemple("2.46");

  it("chaque groupe de chiffres vaut un à trois chiffres", () => {
    for (const bon of ["2.46", "3.3", "12.108", "1.1"]) expect(FORME.motif.test(bon), bon).toBe(true);
  });

  it("tout le reste est repris tel quel : le point est exigé", () => {
    for (const mauvais of ["246", "2-46", "2.", ".46"]) expect(FORME.motif.test(mauvais), mauvais).toBe(false);
  });

  it("un groupe de plus de trois chiffres n'est plus un numéro", () => {
    expect(FORME.motif.test("2.4600")).toBe(false);
  });

  it("dit combien de groupes et quels séparateurs, pour que le lecteur sache les lire", () => {
    expect(FORME.groupes).toBe(2);
    expect(FORME.separateurs).toBe(".");
  });

  it("un exemple sans chiffre n'en est pas un : on retombe sur ce qui a toujours été lu", () => {
    expect(formeDepuisExemple("abc")).toEqual(FORME_PAR_DEFAUT);
  });

  it("d'autres séparateurs valent aussi, sans rien de particulier", () => {
    const tiret = formeDepuisExemple("4-12");
    expect(tiret.motif.test("4-12")).toBe(true);
    expect(tiret.motif.test("4.12")).toBe(false);
    expect(formeDepuisExemple("A1").motif.test("A9")).toBe(true);
  });
});

describe("l'ordre se tient, groupe par groupe", () => {
  const FORME = formeDepuisExemple("2.46");

  it("« 2.46 » passe avant « 3.3 », et « 12.108 » après les deux", () => {
    const rangs = ["2.46", "3.3", "12.108"].map((texte) => rangDuNumero(texte, FORME)!);
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
  });

  it("deux numéros voisins d'un même chapitre se suivent d'un", () => {
    expect(rangDuNumero("2.47", FORME)! - rangDuNumero("2.46", FORME)!).toBe(1);
  });

  it("refuse ce qui ne répond pas à la forme, plutôt que d'inventer un rang", () => {
    expect(rangDuNumero("246", FORME)).toBeUndefined();
    expect(rangDuNumero("", FORME)).toBeUndefined();
  });
});

describe("les caractères que le lecteur doit accepter", () => {
  it("les chiffres, et les séparateurs que l'exemple impose", () => {
    expect(caracteresAcceptes("chiffres", formeDepuisExemple("2.46"))).toBe("0123456789.");
  });

  it("sans exemple, exactement ce qui était accepté avant", () => {
    expect(caracteresAcceptes("chiffres", FORME_PAR_DEFAUT)).toBe("0123456789");
  });

  it("« tous » n'impose aucune liste : le lecteur prend ce qu'il trouve", () => {
    expect(caracteresAcceptes("tous", FORME_PAR_DEFAUT)).toBeUndefined();
  });
});
