import { describe, expect, it } from "vitest";
import { EXIGE, NIVEAUX, permet, refus, type Niveau } from "../src/droits.js";

const MAINTENANT = 1_800_000_000;
// `exactOptionalPropertyTypes` distingue « absent » de « présent et indéfini », et il a raison :
// une révocation « présente mais indéfinie » n'a pas de sens.
const porte = (niveau: Niveau, bibliotheque = "essai", revoqueLe?: number) => ({
  bibliotheque,
  niveau,
  ...(revoqueLe === undefined ? {} : { revoqueLe }),
});

describe("l'échelle des droits (SEC-03)", () => {
  it("qui peut le plus peut le moins", () => {
    expect(permet("administration", "lire")).toBe(true);
    expect(permet("administration", "annoter")).toBe(true);
    expect(permet("contribution", "lire")).toBe(true);
  });

  it("qui peut le moins ne peut pas le plus", () => {
    expect(permet("lecture", "annoter")).toBe(false);
    expect(permet("lecture", "publier")).toBe(false);
    expect(permet("contribution", "publier")).toBe(false);
    expect(permet("contribution", "supprimer")).toBe(false);
  });

  it("refuse une action qu'on a oublié de classer", () => {
    // Le défaut doit être le refus. Une action absente de la table est une action que personne
    // n'a pensé à autoriser, et une permission qu'on accorde par distraction ne se rattrape pas.
    expect(permet("administration", "faire_sauter_la_banque")).toBe(false);
    expect(permet("administration", "")).toBe(false);
  });

  it("chaque action de la table est permise à au moins un niveau", () => {
    for (const action of Object.keys(EXIGE))
      expect(NIVEAUX.some((niveau) => permet(niveau, action)), `${action} n'est permise à personne`).toBe(true);
  });

  it("aucune action n'est permise au niveau le plus bas si la table dit le contraire", () => {
    for (const [action, exige] of Object.entries(EXIGE))
      expect(permet("lecture", action)).toBe(exige === "lecture");
  });
});

describe("ce qui refuse un porteur", () => {
  it("laisse passer un porteur suffisant sur sa bibliothèque", () => {
    expect(refus(porte("contribution"), "essai", "annoter", MAINTENANT)).toBeUndefined();
  });

  it("refuse un accès révoqué, et le dit", () => {
    // Celui-là mérite sa phrase : la personne a eu un accès, elle doit comprendre pourquoi il ne
    // marche plus, et l'information n'apprend rien à qui ne l'avait pas.
    expect(refus(porte("administration", "essai", MAINTENANT - 1), "essai", "lire", MAINTENANT)).toMatch(/révoqué/);
  });

  it("répond la même chose pour une bibliothèque interdite et pour un droit insuffisant", () => {
    // « Droits insuffisants » sur une bibliothèque qu'on n'a pas le droit de voir apprendrait
    // qu'elle existe. Les deux refus sont donc indiscernables.
    const autre = refus(porte("administration", "ailleurs"), "essai", "lire", MAINTENANT);
    const faible = refus(porte("lecture"), "essai", "publier", MAINTENANT);
    expect(autre).toBe(faible);
    expect(autre).toBe("Accès refusé.");
  });

  it("révoquer un accès n'atteint aucun autre (INT-01)", () => {
    const application = porte("lecture", "essai", MAINTENANT - 1);
    const personne = porte("administration", "essai");
    expect(refus(application, "essai", "lire", MAINTENANT)).toBeDefined();
    expect(refus(personne, "essai", "lire", MAINTENANT)).toBeUndefined();
  });

  it("une révocation datée du futur ne révoque pas encore", () => {
    expect(refus(porte("lecture", "essai", MAINTENANT + 10), "essai", "lire", MAINTENANT)).toBeUndefined();
  });
});
