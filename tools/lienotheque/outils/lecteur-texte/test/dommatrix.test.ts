// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MatriceIdentite, poserDOMMatrixSiAbsent } from "../src/index.js";

/** Le dépannage de `DOMMatrix` pour le moteur embarqué (PLT-02).
 *
 *  pdfjs évalue `const SCALE_MATRIX = new DOMMatrix();` au chargement de son module de rendu —
 *  une constante de module, qui n'a rien à voir avec l'extraction de texte. Il suffit qu'elle
 *  **existe**. Dans le dépôt, pdfjs la prend de `@napi-rs/canvas`, présent sous `node_modules` ;
 *  le moteur embarqué, lui, est un fichier unique sans `node_modules`, et deux documents sur
 *  sept y échouaient sur « DOMMatrix is not defined » — l'un après avoir atteint cent pour cent.
 *
 *  **Ce dépannage ne calcule rien.** Il rend une identité, et toute opération refuse de
 *  répondre. C'est voulu : une matrice à moitié juste rendrait des coordonnées fausses sans
 *  prévenir, et une ancre fausse est pire qu'une ancre absente (ANC-01). Si le rendu canvas est
 *  un jour exercé dans le moteur, il s'arrêtera net et dira quoi embarquer.
 */

describe("la matrice de dépannage ne calcule rien, et le dit (ANC-01)", () => {
  it("se construit sans argument et vaut l'identité", () => {
    const matrice = new MatriceIdentite();
    expect([matrice.a, matrice.b, matrice.c, matrice.d, matrice.e, matrice.f]).toEqual([1, 0, 0, 1, 0, 0]);
    expect(matrice.is2D).toBe(true);
    expect(matrice.isIdentity).toBe(true);
  });

  it("porte aussi les noms longs, que pdfjs lit parfois", () => {
    const matrice = new MatriceIdentite();
    expect([matrice.m11, matrice.m22, matrice.m33, matrice.m44]).toEqual([1, 1, 1, 1]);
    expect([matrice.m12, matrice.m21, matrice.m41, matrice.m42]).toEqual([0, 0, 0, 0]);
  });

  it("refuse toute opération au lieu d'en inventer le résultat", () => {
    const matrice = new MatriceIdentite();
    for (const operation of ["translate", "scale", "multiply", "multiplySelf", "preMultiplySelf", "invertSelf", "setMatrixValue"] as const)
      expect(() => (matrice[operation] as () => unknown)(), `« ${operation} » a répondu au lieu de refuser`).toThrow(/ne sait pas calculer/i);
  });

  it("refuse aussi qu'on la construise depuis des valeurs : on croirait qu'elle les porte", () => {
    // Le piège qu'il faut fermer : `new DOMMatrix([2, 0, 0, 2, 0, 0])` rendant une identité
    // silencieusement, c'est un facteur deux perdu quelque part, et personne pour le voir.
    expect(() => new MatriceIdentite([2, 0, 0, 2, 0, 0])).toThrow(/ne sait pas calculer/i);
    expect(() => new MatriceIdentite("scale(2)")).toThrow(/ne sait pas calculer/i);
  });
});

describe("on ne la pose que s'il n'y a rien de mieux (PLT-02)", () => {
  it("ne remplace pas un DOMMatrix déjà présent", () => {
    const vrai = (globalThis as Record<string, unknown>)["DOMMatrix"];
    (globalThis as Record<string, unknown>)["DOMMatrix"] = class Vraie {};
    try {
      expect(poserDOMMatrixSiAbsent()).toBe("déjà là");
      expect((globalThis as Record<string, unknown>)["DOMMatrix"]).not.toBe(MatriceIdentite);
    } finally {
      if (vrai === undefined) delete (globalThis as Record<string, unknown>)["DOMMatrix"];
      else (globalThis as Record<string, unknown>)["DOMMatrix"] = vrai;
    }
  });

  it("dans le dépôt, laisse pdfjs prendre la vraie implémentation de son paquet de rendu", () => {
    // Ici `@napi-rs/canvas` se résout : poser le dépannage priverait le dépôt de la vraie
    // matrice, et le rendu marcherait alors en production et pas en développement — à l'envers.
    const vrai = (globalThis as Record<string, unknown>)["DOMMatrix"];
    delete (globalThis as Record<string, unknown>)["DOMMatrix"];
    try {
      expect(poserDOMMatrixSiAbsent()).toBe("rien à faire, le paquet de rendu est là");
      expect((globalThis as Record<string, unknown>)["DOMMatrix"]).toBeUndefined();
    } finally {
      if (vrai === undefined) delete (globalThis as Record<string, unknown>)["DOMMatrix"];
      else (globalThis as Record<string, unknown>)["DOMMatrix"] = vrai;
    }
  });
});
