import { describe, expect, it } from "vitest";
import { DecoupeMedia, PositionDansPiste, Segment, Silence, departDeLecture } from "../src/index.js";

describe("silence relevé dans un média (A4)", () => {
  it("accepte un silence qui dure", () => {
    expect(Silence.safeParse({ debut: 12.5, fin: 13.2 }).success).toBe(true);
  });

  it("refuse un silence qui finit avant de commencer, ou qui ne dure pas", () => {
    expect(Silence.safeParse({ debut: 13.2, fin: 12.5 }).success).toBe(false);
    expect(Silence.safeParse({ debut: 12.5, fin: 12.5 }).success).toBe(false);
  });

  it("refuse une précision que l'on n'a pas : le centième de seconde (ANC)", () => {
    expect(Silence.safeParse({ debut: 12.5017, fin: 13.2 }).success).toBe(false);
  });
});

describe("segment d'un média (A4)", () => {
  it("porte sa confiance : une découpe n'est pas une certitude", () => {
    expect(Segment.safeParse({ debut: 0, fin: 30, confiance: 0.8 }).success).toBe(true);
    expect(Segment.safeParse({ debut: 0, fin: 30 }).success).toBe(false);
    expect(Segment.safeParse({ debut: 0, fin: 30, confiance: 1.4 }).success).toBe(false);
  });
});

describe("découpe d'un média (A4)", () => {
  const decoupe = { dureeS: 100, segments: [{ debut: 0, fin: 40, confiance: 0.9 }, { debut: 42, fin: 100, confiance: 0.7 }] };

  it("accepte des segments qui se suivent", () => {
    expect(DecoupeMedia.safeParse(decoupe).success).toBe(true);
  });

  it("accepte un média qu'on n'a pas su découper : zéro segment, et c'est tout", () => {
    expect(DecoupeMedia.safeParse({ dureeS: 100, segments: [] }).success).toBe(true);
  });

  it("refuse des segments qui se chevauchent", () => {
    const refus = DecoupeMedia.safeParse({ ...decoupe, segments: [{ debut: 0, fin: 50, confiance: 0.9 }, { debut: 40, fin: 100, confiance: 0.7 }] });
    expect(refus.success).toBe(false);
    expect(refus.error?.issues[0]?.message).toContain("chevaucher");
  });

  it("refuse un segment qui dépasse la durée du média", () => {
    const refus = DecoupeMedia.safeParse({ dureeS: 100, segments: [{ debut: 0, fin: 120, confiance: 0.9 }] });
    expect(refus.success).toBe(false);
    expect(refus.error?.issues[0]?.message).toContain("durée");
  });
});

describe("position de lecture dans la piste (ANC-03)", () => {
  it("un segment connu dit où commencer et où finir", () => {
    const position = PositionDansPiste.parse({ segment: "connu", debut: 42.5, fin: 71.2, confiance: 0.8 });
    expect(departDeLecture(position)).toBe(42.5);
  });

  it("un segment inconnu ne dit rien d'autre : aucune position n'est inventée", () => {
    const position = PositionDansPiste.parse({ segment: "inconnu" });
    expect(departDeLecture(position)).toBe(0);
    // Il n'y a pas de place pour une position approchée dans un segment inconnu.
    expect(PositionDansPiste.safeParse({ segment: "inconnu", debut: 42.5 }).success).toBe(false);
  });

  it("un segment connu sans bornes n'est pas connu", () => {
    expect(PositionDansPiste.safeParse({ segment: "connu", confiance: 0.8 }).success).toBe(false);
    expect(PositionDansPiste.safeParse({ segment: "connu", debut: 10, fin: 5, confiance: 0.8 }).success).toBe(false);
  });

  it("n'admet aucun troisième cas", () => {
    expect(PositionDansPiste.safeParse({ segment: "approche", debut: 42 }).success).toBe(false);
  });
});
