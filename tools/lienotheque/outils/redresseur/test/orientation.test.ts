// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { MotLu, Rotation } from "@lienotheque/contrats";
import { lectureTranche, noteDeLecture, orientationDuLot, poidsDuVote, rotationDansOsd, rotationDeForme } from "../src/index.js";

/** Trouver dans quel sens une photo a été prise (OUT-03).
 *
 *  Le défaut qu'on répare : Tesseract se prononce toujours en mode orientation, et sur les
 *  quatorze clichés de référence de F4 il s'est trompé quatre fois. Comme il se prononçait, on ne
 *  regardait pas plus loin — et une page mal tournée ne donne plus rien à lire. */

const mot = (texte: string, confiance?: number): MotLu => ({ texte, x: 0, y: 0, l: 10, h: 10, ...(confiance === undefined ? {} : { confiance }) });

describe("ce qu'une image donne à lire, en un nombre", () => {
  it("compte les mots sûrs plus que les mots douteux", () => {
    expect(noteDeLecture([mot("Pattern", 0.9)])).toBeGreaterThan(noteDeLecture([mot("Pattern", 0.3)]));
  });

  it("écarte les fragments d'un caractère : une page couchée en produit autant qu'une droite", () => {
    expect(noteDeLecture([mot("|", 0.9), mot("-", 0.9), mot("l", 0.9)])).toBe(0);
  });

  it("écarte ce qui n'a pas deux lettres ou chiffres de suite", () => {
    expect(noteDeLecture([mot("—–", 0.9), mot(". .", 0.9)])).toBe(0);
    expect(noteDeLecture([mot("12", 0.9)])).toBeCloseTo(0.9);
  });

  it("prête une demi-confiance à ce qui n'en déclare pas", () => {
    expect(noteDeLecture([mot("Pattern")])).toBe(0.5);
  });
});

describe("la lecture ne tranche que si elle se détache", () => {
  const notes = (...valeurs: number[]) => valeurs.map((note, rang) => ({ rotation: (rang * 90) as Rotation, note }));

  it("tranche quand le meilleur sens domine nettement", () => {
    expect(lectureTranche(notes(255, 107, 9, 2))).toBe(true);
  });

  it("ne tranche pas quand quelques points séparent les quatre sens", () => {
    // Cliché 44 de F4 : 12, 11, 7, 4. Laisser décider cela, c'est jouer à pile ou face.
    expect(lectureTranche(notes(12, 11, 7, 4))).toBe(false);
  });

  it("ne tranche pas quand rien n'a été lu", () => {
    expect(lectureTranche(notes(0, 0, 0, 0))).toBe(false);
    expect(lectureTranche([])).toBe(false);
  });
});

describe("l'orientation est une propriété du lot, pas du cliché", () => {
  const cliche = (gagnant: Rotation, ...notes: number[]) =>
    notes.map((note, rang) => ({ rotation: (((gagnant / 90 + rang) % 4) * 90) as Rotation, note }));

  it("laisse les clichés bavards décider pour les muets", () => {
    // Les vraies notes de F4 : quatre clichés tranchent largement pour 270°, dix hésitent.
    const lot = [
      cliche(270, 255, 107, 9, 2),
      cliche(270, 294, 113, 7, 3),
      cliche(270, 151, 72, 18, 3),
      cliche(270, 130, 99, 23, 18),
      cliche(0, 174, 170, 133, 107),
      cliche(0, 18, 11, 4, 1),
      cliche(180, 12, 10, 10, 10),
      cliche(0, 11, 10, 6, 5),
    ];
    expect(orientationDuLot(lot)?.rotation).toBe(270);
  });

  it("pèse par l'écart, pas par le nombre de clichés", () => {
    // Trois clichés hésitants pour 0°, un seul net pour 90° : c'est le net qui l'emporte.
    const lot = [cliche(0, 10, 9, 8, 7), cliche(0, 10, 9, 8, 7), cliche(0, 10, 9, 8, 7), cliche(90, 200, 20, 10, 5)];
    expect(orientationDuLot(lot)?.rotation).toBe(90);
  });

  it("ne se prononce pas quand aucun cliché ne tranche", () => {
    expect(orientationDuLot([cliche(0, 5, 5, 5, 5), cliche(90, 3, 3, 3, 3)])).toBeUndefined();
    expect(orientationDuLot([])).toBeUndefined();
  });

  it("rend le même lot deux fois : un rejeu ne change pas d'avis", () => {
    const lot = [cliche(0, 10, 10, 10, 10), cliche(90, 10, 10, 10, 10)];
    expect(orientationDuLot(lot)).toEqual(orientationDuLot(lot));
  });

  it("le poids d'un cliché est l'écart entre ses deux meilleurs sens", () => {
    expect(poidsDuVote(cliche(270, 255, 107, 9, 2))).toBe(148);
    expect(poidsDuVote(cliche(0, 10, 10, 10, 10)), "un cliché qui ne départage rien ne pèse rien").toBe(0);
  });
});

describe("les replis d'avant restent", () => {
  it("lit encore la réponse de Tesseract en mode orientation", () => {
    expect(rotationDansOsd("Orientation in degrees: 90\nRotate: 270\n")).toBe(270);
    expect(rotationDansOsd("rien de tel")).toBeUndefined();
    expect(rotationDansOsd("Rotate: 45")).toBeUndefined();
  });

  it("déduit de la forme en dernier recours", () => {
    expect(rotationDeForme({ largeur: 100, hauteur: 200, pixels: new Uint8Array(0) })).toBe(90);
    expect(rotationDeForme({ largeur: 200, hauteur: 100, pixels: new Uint8Array(0) })).toBe(0);
  });
});
