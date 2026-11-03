import { describe, expect, it, vi } from "vitest";
import { DescriptionBibliotheque } from "@lienotheque/contrats";
import type { PortAdministration } from "../src/pont/port.js";
import {
  bibliothequesPourSession,
  choisirBibliothequeConnue,
  ouvrirBibliothequeDepuisDisque,
} from "../src/ouverture-bibliotheque.js";

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

describe("choisir une bibliothèque déjà connue de la session (LIV-07)", () => {
  it("relit son dossier et rend ce qui s'y trouve, pas ce que la liste croyait", async () => {
    const hote = administration();
    const surLeDisque = DescriptionBibliotheque.parse({ ...DESCRIPTION, nom: "Renommée hors de l’application" });
    hote.lireBibliotheque.mockResolvedValue(surLeDisque);

    await expect(choisirBibliothequeConnue(hote.port, "/Volumes/Carte Ext/Copie")).resolves.toEqual({
      etat: "ouverte",
      description: surLeDisque,
    });
    expect(hote.lireBibliotheque).toHaveBeenCalledWith("/Volumes/Carte Ext/Copie");
  });

  it("dit absente quand le dossier ne porte plus de bibliothèque, au lieu d’en montrer une autre", async () => {
    const hote = administration();
    hote.lireBibliotheque.mockResolvedValue(undefined);

    await expect(choisirBibliothequeConnue(hote.port, "/Volumes/Carte Ext/Copie")).resolves.toEqual({
      etat: "absente",
    });
  });

  it("dit absente aussi quand la lecture échoue : un volume débranché n’est pas une erreur à jeter à l’écran", async () => {
    const hote = administration();
    hote.lireBibliotheque.mockRejectedValue(new Error("No such file or directory"));

    await expect(choisirBibliothequeConnue(hote.port, "/Volumes/Carte Ext/Copie")).resolves.toEqual({
      etat: "absente",
    });
  });

  it("ne retouche jamais les bibliothèques retenues par l’hôte : rebrancher le volume la ramène", async () => {
    const hote = administration();
    hote.lireBibliotheque.mockResolvedValue(undefined);

    await choisirBibliothequeConnue(hote.port, "/Volumes/Carte Ext/Copie");

    expect(hote.retenirBibliotheque).not.toHaveBeenCalled();
  });
});
