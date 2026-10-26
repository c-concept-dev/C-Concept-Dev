import { describe, expect, it } from "vitest";
import { CorrespondanceBibliotheque, CorrespondancesBibliotheque } from "../src/index.js";

const EMPREINTE = "ab".repeat(32);

describe("résultat de recherche dans toute une bibliothèque (C10, RCH-07, RCH-09)", () => {
  it("désigne le document, sa version, son passage et sa page", () => {
    expect(CorrespondanceBibliotheque.parse({
      empreinte: EMPREINTE,
      version: "version-1",
      titre: "Un document",
      passage: {
        rang: 7,
        page: 12,
        pageImprimee: 42,
        texte: "Une phrase retrouvée.",
        source: "couche_texte",
        lisible: true,
      },
    })).toMatchObject({ titre: "Un document", passage: { page: 12, pageImprimee: 42 } });
  });

  it("refuse une réponse qui ne dit pas dans quel document ouvrir le passage", () => {
    expect(() => CorrespondancesBibliotheque.parse([{
      version: "version-1",
      titre: "Sans document",
      passage: { rang: 0, page: 1, texte: "Texte", source: "couche_texte", lisible: true },
    }])).toThrow();
  });
});
