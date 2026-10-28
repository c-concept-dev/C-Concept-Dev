import { describe, expect, it, vi } from "vitest";
import { DescriptionBibliotheque } from "@lienotheque/contrats";
import type { PortAdministration } from "../src/pont/port.js";
import { bibliothequesPourSession, ouvrirBibliothequeDepuisDisque } from "../src/ouverture-bibliotheque.js";

const DESCRIPTION = DescriptionBibliotheque.parse({
  id: "copie-portable",
  nom: "Copie portable",
  contenus: ["documents"],
  mots: {
    element: { un: "repère", plusieurs: "repères" },
    piste: { un: "plage", plusieurs: "plages" },
    page: { un: "page", plusieurs: "pages" },
  },
  schema: {
    cle: "test",
    nom: "Test",
    langue: "fr",
    version: 1,
    axes: [{ cle: "type", nom: "Type", nature: "etiquettes", cardinalite: "plusieurs" }],
  },
});

const administration = () => {
  const choisirDossier = vi.fn().mockResolvedValue("/Volumes/Carte Ext/Copie");
  const lireBibliotheque = vi.fn().mockResolvedValue(DESCRIPTION);
  const retenirBibliotheque = vi.fn().mockResolvedValue({ bibliotheques: [] });
  return {
    port: { choisirDossier, lireBibliotheque, retenirBibliotheque } as unknown as PortAdministration,
    choisirDossier,
    lireBibliotheque,
    retenirBibliotheque,
  };
};

describe("ouvrir une bibliothèque depuis le disque", () => {
  it("ouvre durablement une bibliothèque ordinaire et la retient", async () => {
    const hote = administration();

    await expect(ouvrirBibliothequeDepuisDisque(hote.port, "durable")).resolves.toEqual({
      racine: "/Volumes/Carte Ext/Copie",
      description: DESCRIPTION,
      temporaire: false,
    });
    expect(hote.retenirBibliotheque).toHaveBeenCalledWith("/Volumes/Carte Ext/Copie");
  });

  it("ouvre une copie de test dans la session sans jamais changer les bibliothèques retenues", async () => {
    const hote = administration();

    await expect(ouvrirBibliothequeDepuisDisque(hote.port, "temporaire")).resolves.toEqual({
      racine: "/Volumes/Carte Ext/Copie",
      description: DESCRIPTION,
      temporaire: true,
    });
    expect(hote.choisirDossier).toHaveBeenCalledWith("Quelle copie tester temporairement ?");
    expect(hote.lireBibliotheque).toHaveBeenCalledWith("/Volumes/Carte Ext/Copie");
    expect(hote.retenirBibliotheque).not.toHaveBeenCalled();
  });
});

describe("reprendre la dernière bibliothèque réellement ouverte", () => {
  it("place en bibliothèque courante la première récente rendue par l’hôte (LIV-07)", () => {
    const musicale = { racine: "/Volumes/Musique", description: DESCRIPTION };
    const connaissance = {
      racine: "/Users/test/Base",
      description: DescriptionBibliotheque.parse({ ...DESCRIPTION, id: "base", nom: "Base de connaissance" }),
    };

    expect(bibliothequesPourSession([musicale, connaissance])).toEqual([connaissance, musicale]);
  });
});
