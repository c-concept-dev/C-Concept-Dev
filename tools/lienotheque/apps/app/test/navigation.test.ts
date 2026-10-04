import { describe, expect, it } from "vitest";
import { ACCUEIL, ecrireRoute, lireRoute, type Route } from "../src/navigation.js";

describe("lecture d'une adresse (B4)", () => {
  it("l'adresse vide est l'accueil", () => {
    expect(lireRoute("")).toEqual(ACCUEIL);
    expect(lireRoute("#")).toEqual(ACCUEIL);
  });

  it("reconnaît les écrans sans paramètre", () => {
    expect(lireRoute("#reglages")).toEqual({ ecran: "reglages" });
    expect(lireRoute("#verifier")).toEqual({ ecran: "verifier" });
    expect(lireRoute("#catalogue")).toEqual({ ecran: "catalogue" });
  });

  it("lit la page du catalogue et du Lecteur", () => {
    expect(lireRoute("#catalogue/page=127")).toEqual({ ecran: "catalogue", page: 127 });
    expect(lireRoute("#lecteur/page=127")).toEqual({ ecran: "lecteur", page: 127 });
  });

  it("lit l'élément ouvert dans le Lecteur", () => {
    expect(lireRoute("#lecteur/page=127&element=abc-123")).toEqual({ ecran: "lecteur", page: 127, element: "abc-123" });
  });

  it("ramène à l'accueil plutôt que de laisser l'écran vide", () => {
    expect(lireRoute("#inconnu")).toEqual(ACCUEIL);
    expect(lireRoute("#lecteur"), "un Lecteur sans page n'ouvre rien").toEqual(ACCUEIL);
    expect(lireRoute("#lecteur/page=zero")).toEqual(ACCUEIL);
    expect(lireRoute("#catalogue/page=-3"), "une page négative n'existe pas").toEqual({ ecran: "catalogue" });
  });
});

describe("écriture d'une adresse (B4)", () => {
  const routes: readonly Route[] = [
    ACCUEIL,
    { ecran: "reglages" },
    { ecran: "verifier" },
    { ecran: "catalogue" },
    { ecran: "catalogue", page: 127 },
    { ecran: "lecteur", page: 127 },
    { ecran: "lecteur", page: 127, element: "abc-123" },
  ];

  it("l'aller-retour est fidèle : ce qu'on écrit se relit à l'identique", () => {
    for (const route of routes) expect(lireRoute(ecrireRoute(route)), ecrireRoute(route)).toEqual(route);
  });

  it("rend des adresses partageables, pas un état caché", () => {
    expect(ecrireRoute({ ecran: "lecteur", page: 127, element: "abc" })).toBe("#lecteur/page=127&element=abc");
    expect(ecrireRoute({ ecran: "catalogue", page: 12 })).toBe("#catalogue/page=12");
  });
});
