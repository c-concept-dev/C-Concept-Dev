// @vitest-environment node
import type { Boite, ImageGrise } from "@lienotheque/images";
import { describe, expect, it } from "vitest";
import { chiffresDuMorceau } from "../src/index.js";

/** Une image claire où l'on pose des formes sombres, comme l'OCR la reçoit : le repère seuillé
 *  puis inversé, chiffres sombres sur fond clair. */
function dessin(largeur: number, hauteur: number, formes: readonly Boite[]): ImageGrise {
  const pixels = new Uint8Array(largeur * hauteur).fill(255);
  for (const forme of formes)
    for (let y = forme.y; y < forme.y + forme.h; y += 1)
      for (let x = forme.x; x < forme.x + forme.l; x += 1) pixels[y * largeur + x] = 0;
  return { largeur, hauteur, pixels };
}

describe("compter les chiffres d'un repère (OUT-07)", () => {
  it("compte deux formes de la taille d'un chiffre, de gauche à droite", () => {
    const image = dessin(40, 48, [
      { x: 6, y: 6, l: 12, h: 36 },
      { x: 22, y: 6, l: 12, h: 36 },
    ]);
    const chiffres = chiffresDuMorceau(image);
    expect(chiffres).toHaveLength(2);
    expect(chiffres[0]!.x).toBeLessThan(chiffres[1]!.x);
  });

  it("ne compte pas un éclat du seuillage, même s'il est haut", () => {
    // Un trait d'un pixel de large sur toute la hauteur : c'est le bord du repère, pas un chiffre.
    const image = dessin(40, 48, [
      { x: 0, y: 4, l: 1, h: 40 },
      { x: 10, y: 6, l: 12, h: 36 },
      { x: 26, y: 6, l: 12, h: 36 },
    ]);
    expect(chiffresDuMorceau(image)).toHaveLength(2);
  });

  it("ne laisse pas un éclat servir de mesure aux autres", () => {
    // Sans le filtre d'étroitesse, l'éclat de 44 pixels de haut devenait la forme la plus haute
    // et les deux chiffres, à 36, tombaient sous la part de hauteur retenue.
    const image = dessin(40, 48, [
      { x: 0, y: 2, l: 2, h: 44 },
      { x: 10, y: 8, l: 12, h: 26 },
      { x: 26, y: 8, l: 12, h: 26 },
    ]);
    expect(chiffresDuMorceau(image)).toHaveLength(2);
  });

  it("écarte un fragment nettement plus court qu'un chiffre", () => {
    const image = dessin(40, 48, [
      { x: 8, y: 6, l: 12, h: 36 },
      { x: 26, y: 6, l: 8, h: 12 },
    ]);
    expect(chiffresDuMorceau(image)).toHaveLength(1);
  });

  it("écarte une forme qui couvre le morceau : c'est le fond, pas un chiffre", () => {
    expect(chiffresDuMorceau(dessin(40, 48, [{ x: 0, y: 0, l: 40, h: 48 }]))).toEqual([]);
  });

  it("écarte une forme bien plus large que haute : des chiffres soudés ne se comptent pas", () => {
    expect(chiffresDuMorceau(dessin(60, 30, [{ x: 4, y: 8, l: 48, h: 14 }]))).toEqual([]);
  });

  it("ne compte rien sur un morceau vide", () => {
    expect(chiffresDuMorceau(dessin(20, 20, []))).toEqual([]);
  });

  it("compte pareil à deux échelles : rien d'absolu dans la mesure", () => {
    const petit = dessin(40, 48, [
      { x: 6, y: 6, l: 12, h: 36 },
      { x: 22, y: 6, l: 12, h: 36 },
    ]);
    const grand = dessin(160, 192, [
      { x: 24, y: 24, l: 48, h: 144 },
      { x: 88, y: 24, l: 48, h: 144 },
    ]);
    expect(chiffresDuMorceau(grand)).toHaveLength(chiffresDuMorceau(petit).length);
  });
});
