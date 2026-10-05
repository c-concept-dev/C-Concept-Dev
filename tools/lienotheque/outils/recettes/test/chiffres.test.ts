// @vitest-environment node
import type { Boite, ImageGrise } from "@lienotheque/images";
import { describe, expect, it } from "vitest";
import { chiffresDuMorceau, ecart, normaliser, rassembler, reconnaitre } from "../src/index.js";

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

describe("normaliser une forme (OUT-07)", () => {
  it("garde les proportions : une forme étroite reste étroite", () => {
    const image = dessin(40, 48, [{ x: 10, y: 4, l: 4, h: 40 }]);
    const glyphe = normaliser(image, { x: 10, y: 4, l: 4, h: 40 });
    const colonnes = new Set<number>();
    for (let rang = 0; rang < glyphe.parts.length; rang += 1) if (glyphe.parts[rang]! > 0) colonnes.add(rang % 8);
    expect(colonnes.size).toBeLessThanOrEqual(2);
  });

  it("remplit la grille d'une forme large", () => {
    const image = dessin(40, 48, [{ x: 4, y: 4, l: 36, h: 40 }]);
    const glyphe = normaliser(image, { x: 4, y: 4, l: 36, h: 40 });
    const colonnes = new Set<number>();
    for (let rang = 0; rang < glyphe.parts.length; rang += 1) if (glyphe.parts[rang]! > 0) colonnes.add(rang % 8);
    expect(colonnes.size).toBe(8);
  });

  it("rend une grille vide sur une boîte vide", () => {
    expect([...normaliser(dessin(10, 10, []), { x: 0, y: 0, l: 0, h: 0 }).parts].every((part) => part === 0)).toBe(true);
  });

  it("rapproche deux tirages de la même forme plus que deux formes différentes", () => {
    const barre = dessin(40, 48, [{ x: 10, y: 4, l: 5, h: 40 }]);
    const barreDecalee = dessin(40, 48, [{ x: 20, y: 6, l: 5, h: 38 }]);
    const pave = dessin(40, 48, [{ x: 8, y: 4, l: 24, h: 40 }]);

    const a = normaliser(barre, { x: 10, y: 4, l: 5, h: 40 });
    const b = normaliser(barreDecalee, { x: 20, y: 6, l: 5, h: 38 });
    const c = normaliser(pave, { x: 8, y: 4, l: 24, h: 40 });
    expect(ecart(a, b)).toBeLessThan(ecart(a, c));
  });

  it("rend un écart nul entre une forme et elle-même", () => {
    const image = dessin(40, 48, [{ x: 8, y: 4, l: 16, h: 40 }]);
    const glyphe = normaliser(image, { x: 8, y: 4, l: 16, h: 40 });
    expect(ecart(glyphe, glyphe)).toBe(0);
  });
});

describe("modèles tirés du document (OUT-07)", () => {
  const barre = (() => {
    const image = dessin(40, 48, [{ x: 10, y: 4, l: 5, h: 40 }]);
    return normaliser(image, { x: 10, y: 4, l: 5, h: 40 });
  })();
  const pave = (() => {
    const image = dessin(40, 48, [{ x: 8, y: 4, l: 24, h: 40 }]);
    return normaliser(image, { x: 8, y: 4, l: 24, h: 40 });
  })();

  it("prend une lecture dont le compte des formes répond au compte des chiffres", () => {
    const modeles = rassembler([{ lu: 17, glyphes: [barre, pave] }]);
    expect(modeles.get(1)).toHaveLength(1);
    expect(modeles.get(7)).toHaveLength(1);
  });

  it("laisse de côté une lecture dont les comptes ne se répondent pas", () => {
    expect(rassembler([{ lu: 17, glyphes: [barre] }]).size).toBe(0);
  });

  it("accumule plusieurs exemples d'un même chiffre", () => {
    expect(rassembler([{ lu: 1, glyphes: [barre] }, { lu: 1, glyphes: [barre] }]).get(1)).toHaveLength(2);
  });

  it("reconnaît le chiffre le plus proche et dit de combien il devance l'autre", () => {
    const modeles = rassembler([{ lu: 17, glyphes: [barre, pave] }]);
    const trouve = reconnaitre(barre, modeles);
    expect(trouve?.chiffre).toBe(1);
    expect(trouve?.ecart).toBe(0);
    expect(trouve?.avance).toBeGreaterThan(0);
  });

  it("ne reconnaît rien quand le document n'a fourni aucun modèle", () => {
    expect(reconnaitre(barre, new Map())).toBeUndefined();
  });

  it("n'avance rien quand un seul chiffre a un modèle : il n'y a personne à devancer", () => {
    const trouve = reconnaitre(pave, rassembler([{ lu: 1, glyphes: [barre] }]));
    expect(trouve?.chiffre).toBe(1);
    expect(trouve?.avance).toBe(1 - trouve!.ecart);
  });

  it("rend le même résultat à chaque exécution", () => {
    const modeles = rassembler([{ lu: 17, glyphes: [barre, pave] }]);
    expect(reconnaitre(pave, modeles)).toEqual(reconnaitre(pave, modeles));
  });
});
