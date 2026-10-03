// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { chargerDonnees, demonstrationDemandee } from "../src/donnees/chargement.js";
import { ACCUEIL_VIDE } from "../src/donnees/modele.js";

describe("chargement des données de l'accueil", () => {
  it("part vide quand rien n'est demandé", async () => {
    expect(await chargerDonnees("")).toEqual(ACCUEIL_VIDE);
    expect(await chargerDonnees("?autre=1")).toEqual(ACCUEIL_VIDE);
  });

  it("ne reconnaît que le paramètre explicite", () => {
    expect(demonstrationDemandee("?demonstration")).toBe(true);
    expect(demonstrationDemandee("?demonstration=1")).toBe(true);
    expect(demonstrationDemandee("?demo")).toBe(false);
    expect(demonstrationDemandee("")).toBe(false);
  });

  it("verse le jeu de démonstration quand l'adresse le réclame, en développement", async () => {
    const donnees = await chargerDonnees("?demonstration");
    expect(donnees.bibliotheques).toHaveLength(4);
    expect(donnees.reprises).toHaveLength(3);
    expect(donnees.aVerifier?.nombre).toBe(9);
  });
});
