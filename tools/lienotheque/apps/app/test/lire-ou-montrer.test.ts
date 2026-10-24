import { describe, expect, it } from "vitest";
import { COUVERTURE_MINIMALE, parOuLire, quelquesImagesSeulement } from "../src/lire-ou-montrer.js";

/** Par où entrer dans un document : ses pages, ou son texte (RCH-07, et le relevé du 22 octobre).
 *
 *  Les chiffres de ces épreuves sont ceux de la bibliothèque réimportée, pas des exemples
 *  inventés : 1 page pour 231 passages sur l'un, 3 pour 289 sur un
 *  autre, et 480 pour 480 sur un livre numérisé. */


describe("par où entrer dans un document", () => {
  it("par ses pages, quand elles le couvrent — un livre numérisé", () => {
    // 480 pages pour 480 passages : le cas mesuré sur un livre numérisé réel.
    expect(parOuLire(480, 480)).toBe("pages");
  });

  it("par son texte, quand il n'a aucune page", () => {
    expect(parOuLire(0, 239)).toBe("texte");
  });

  it("par son texte, quand une couverture seule tient lieu de pages", () => {
    // Une image, 231 passages derrière elle.
    expect(parOuLire(1, 231)).toBe("texte");
    // Trois images, 289 passages.
    expect(parOuLire(3, 289)).toBe("texte");
  });

  it("par ses pages, quand rien n'a été lu — il n'y a pas d'autre entrée", () => {
    expect(parOuLire(1, 0)).toBe("pages");
    expect(parOuLire(0, 0)).toBe("pages");
  });

  it("bascule exactement à la part annoncée, et pas ailleurs", () => {
    const combien = 100;
    const juste = Math.ceil(combien * COUVERTURE_MINIMALE);
    expect(parOuLire(juste, combien)).toBe("pages");
    expect(parOuLire(juste - 1, combien)).toBe("texte");
  });
});

describe("ce que l'écran de texte doit dire", () => {
  it("qu'il existe quelques images, quand il en existe", () => {
    expect(quelquesImagesSeulement(1, 231)).toBe(true);
  });

  it("rien de tel quand le document n'a aucune image", () => {
    expect(quelquesImagesSeulement(0, 239)).toBe(false);
  });

  it("rien de tel quand les pages couvrent le document : on n'est pas sur cet écran", () => {
    expect(quelquesImagesSeulement(480, 480)).toBe(false);
  });
});
