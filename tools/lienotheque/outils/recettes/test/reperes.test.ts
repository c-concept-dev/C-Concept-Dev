// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { LectureRepere } from "@lienotheque/contrats";
import { amorceDeSuite, coinsDePage, consolider, motifLibelle, zonePastille } from "../src/index.js";

describe("motif tiré du libellé de la recette (OUT-07)", () => {
  it("accepte le libellé tel quel, quelle que soit la casse", () => {
    const motif = motifLibelle("Pattern");
    expect(motif.test("Pattern")).toBe(true);
    expect(motif.test("pattern")).toBe(true);
  });

  it("tolère un doublement mangé par l'OCR, et rien d'autre", () => {
    const motif = motifLibelle("Pattern");
    expect(motif.test("Patern"), "la lettre doublée peut manquer").toBe(true);
    expect(motif.test("Patten"), "mais pas une autre lettre").toBe(false);
    expect(motif.test("Patternes")).toBe(false);
    expect(motif.test("Pattern 3")).toBe(false);
  });

  it("n'invente aucune tolérance sur un libellé sans doublement", () => {
    const motif = motifLibelle("Exemple");
    expect(motif.test("Exemple")).toBe(true);
    expect(motif.test("Exemle")).toBe(false);
  });

  it("échappe ce qui aurait un sens dans une expression régulière", () => {
    expect(motifLibelle("N°.").test("N°.")).toBe(true);
    expect(motifLibelle("N°.").test("N°x")).toBe(false);
  });
});

describe("amorce d'une mention de suite", () => {
  it("garde les lettres de tête : une apostrophe ne survit pas à l'OCR", () => {
    expect(amorceDeSuite("cont'd")).toBe("cont");
    expect(amorceDeSuite("suite")).toBe("suite");
  });
});

describe("où chercher les repères", () => {
  const image = { largeur: 1000, hauteur: 2000, pixels: new Uint8Array(0) };

  it("cherche le numéro de page dans les deux coins du bord indiqué", () => {
    const bas = coinsDePage(image, "bas");
    expect(bas).toHaveLength(2);
    expect(bas[0]).toEqual({ x: 0, y: 1860, l: 200, h: 140 });
    expect(bas[1]?.x).toBe(800);
    expect(coinsDePage(image, "haut")[0]?.y).toBe(0);
  });

  it("place la pastille du côté que dit la recette", () => {
    const boite = { x: 300, y: 100, l: 40, h: 20 };
    expect(zonePastille(boite, "droite", 6).x).toBe(346);
    expect(zonePastille(boite, "gauche", 6).x).toBe(300 - 6 - 100);
    expect(zonePastille(boite, "dessous", 6).y).toBe(126);
    expect(zonePastille(boite, "dessus", 6).y).toBe(100 - 6 - 80);
  });

  it("met la zone à l'échelle du numéro, pas à celle de la page", () => {
    const petite = zonePastille({ x: 0, y: 0, l: 10, h: 10 }, "droite", 0);
    const grande = zonePastille({ x: 0, y: 0, l: 20, h: 20 }, "droite", 0);
    expect(grande.l).toBe(petite.l * 2);
    expect(grande.h).toBe(petite.h * 2);
  });
});

describe("consolidation des lectures (OUT-07)", () => {
  const lecture = (y: number, numero: number, sur: Partial<LectureRepere> = {}): LectureRepere => ({ y, numero, suite: false, ...sur });

  it("regroupe par hauteur et fait voter le numéro", () => {
    const consolides = consolider([lecture(0.1, 7), lecture(0.105, 7), lecture(0.102, 1)]);
    expect(consolides).toHaveLength(1);
    expect(consolides[0]?.numero).toBe(7);
    expect(consolides[0]?.accordNumero).toBeCloseTo(0.67, 2);
  });

  it("sépare ce qui est loin sur la page", () => {
    expect(consolider([lecture(0.1, 1), lecture(0.5, 2)]).map((e) => e.numero)).toEqual([1, 2]);
  });

  it("vote la piste à part du numéro : l'un peut être sûr quand l'autre ne l'est pas", () => {
    const consolides = consolider([
      lecture(0.2, 5, { pisteLue: 5 }),
      lecture(0.2, 5, { pisteLue: 5 }),
      lecture(0.2, 5, { pisteLue: 8 }),
    ]);
    expect(consolides[0]?.accordNumero).toBe(1);
    expect(consolides[0]?.pisteLue).toBe(5);
    expect(consolides[0]?.accordPiste).toBeCloseTo(0.67, 2);
  });

  it("une seule lecture de suite suffit à marquer le groupe", () => {
    expect(consolider([lecture(0.2, 5), lecture(0.2, 5, { suite: true })])[0]?.suite).toBe(true);
  });

  it("ne rend aucune piste quand aucune n'a été lue", () => {
    const consolide = consolider([lecture(0.2, 5)])[0];
    expect(consolide?.pisteLue).toBeUndefined();
    expect(consolide?.accordPiste).toBe(0);
  });

  it("rend le même résultat quel que soit l'ordre d'arrivée des lectures", () => {
    const lectures = [lecture(0.5, 9, { pisteLue: 9 }), lecture(0.1, 3), lecture(0.102, 3), lecture(0.5, 9)];
    const direct = consolider(lectures);
    const inverse = consolider([...lectures].reverse());
    expect(JSON.stringify(inverse)).toBe(JSON.stringify(direct));
  });

  it("à égalité de voix, le plus petit numéro l'emporte : une règle, pas un hasard", () => {
    expect(consolider([lecture(0.2, 8), lecture(0.2, 3)])[0]?.numero).toBe(3);
  });
});
