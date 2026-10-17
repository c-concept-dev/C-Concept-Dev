import { describe, expect, it } from "vitest";
import {
  centile,
  citationsNonVerifiees,
  cleDeResultat,
  ouvragesPerdus,
  recouvrement,
  SEUILS,
  verdict,
} from "../src/comparaison.js";

const r = (titre: string, page: number | null, texte: string) => ({ book_title: titre, page_number: page, content: texte });

describe("la clé qui dédoublonne, reprise de l'application", () => {
  it("joint titre, page et début du texte", () => {
    expect(cleDeResultat(r("Un titre", 12, "le début du passage"))).toBe("Un titre|12|le début du passage");
  });

  it("ne coupe qu'au-delà de soixante caractères", () => {
    const long = "x".repeat(100);
    expect(cleDeResultat(r("T", 1, long))).toBe(`T|1|${"x".repeat(60)}`);
  });

  it("supporte une page absente", () => {
    expect(cleDeResultat(r("T", null, "a"))).toBe("T||a");
    expect(cleDeResultat({ book_title: "T", content: "a" })).toBe("T||a");
  });
});

describe("ce qui bloque une bascule", () => {
  it("nomme les ouvrages que la nouvelle ne retrouve plus", () => {
    const ancienne = [r("Premier", 1, "a"), r("Second", 2, "b")];
    const nouvelle = [r("Premier", 1, "a")];
    expect(ouvragesPerdus(ancienne, nouvelle)).toEqual(["Second"]);
  });

  it("ne reproche rien quand la nouvelle en trouve davantage", () => {
    // Trouver plus n'est pas une régression : le seuil porte sur ce qu'on perd.
    expect(ouvragesPerdus([r("Premier", 1, "a")], [r("Premier", 1, "a"), r("Autre", 3, "c")])).toEqual([]);
  });

  it("repère une citation qui n'existe pas mot pour mot dans sa source", () => {
    const sources = new Map([["Premier|1|presque le texte", "le texte exact de la page"]]);
    const fautives = citationsNonVerifiees([r("Premier", 1, "presque le texte")], (res) => sources.get(cleDeResultat(res)));
    expect(fautives).toHaveLength(1);
  });

  it("accepte une citation qui s'y trouve", () => {
    const fautives = citationsNonVerifiees([r("Premier", 1, "le texte")], () => "voici le texte exact");
    expect(fautives).toEqual([]);
  });

  it("compte comme fautive une citation dont la source est introuvable", () => {
    // Ne pas pouvoir vérifier n'est pas avoir vérifié. C'est la leçon de l'ancien outil, dont
    // les contrôles manqués passaient pour des contrôles réussis.
    expect(citationsNonVerifiees([r("Premier", 1, "x")], () => undefined)).toHaveLength(1);
  });
});

describe("le recouvrement, rapporté mais jamais bloquant", () => {
  it("vaut 1 quand les deux rendent la même chose", () => {
    const memes = [r("T", 1, "a"), r("T", 2, "b")];
    expect(recouvrement(memes, memes)).toBe(1);
  });

  it("vaut 0 quand rien ne se recoupe", () => {
    expect(recouvrement([r("T", 1, "a")], [r("T", 2, "b")])).toBe(0);
  });

  it("vaut 1 entre deux silences : il n'y a pas de désaccord entre deux riens", () => {
    expect(recouvrement([], [])).toBe(1);
  });

  it("vaut un tiers pour un commun sur trois", () => {
    expect(recouvrement([r("T", 1, "a"), r("T", 2, "b")], [r("T", 1, "a"), r("T", 3, "c")])).toBeCloseTo(1 / 3);
  });
});

describe("les centiles", () => {
  it("interpole plutôt que de tomber sur le maximum", () => {
    // Avec trente mesures, un p95 par simple index vaudrait la plus lente et ferait croire à
    // une mesure plus sévère qu'elle n'est.
    const durees = [...Array(30).keys()].map((rang) => rang + 1);
    expect(centile(durees, 0.95)).toBeCloseTo(28.55);
    expect(centile(durees, 0.95)).toBeLessThan(30);
  });

  it("rend la valeur unique quand il n'y en a qu'une, et zéro quand il n'y en a pas", () => {
    expect(centile([42], 0.95)).toBe(42);
    expect(centile([], 0.5)).toBe(0);
  });

  it("rend la médiane au milieu", () => {
    expect(centile([10, 20, 30], 0.5)).toBe(20);
  });
});

describe("le verdict, seuils annoncés d'avance", () => {
  const bon = { ouvragesPerdus: [], citationsNonVerifiees: [], p95Ancienne: 100, p95Nouvelle: 120 };

  it("tient quand rien ne manque et que la latence reste dans le facteur", () => {
    expect(verdict(bon)).toMatchObject({ tenu: true, motifs: [] });
  });

  it("refuse dès qu'un ouvrage se perd, et le nomme", () => {
    const rendu = verdict({ ...bon, ouvragesPerdus: ["Second"] });
    expect(rendu.tenu).toBe(false);
    expect(rendu.motifs[0]).toMatch(/Second/);
  });

  it("refuse une seule citation non vérifiée", () => {
    expect(verdict({ ...bon, citationsNonVerifiees: ["x"] }).tenu).toBe(false);
  });

  it("refuse une latence au-delà d'une fois et demie l'ancienne", () => {
    expect(verdict({ ...bon, p95Nouvelle: 151 }).tenu).toBe(false);
    expect(verdict({ ...bon, p95Nouvelle: 150 }).tenu).toBe(true);
  });

  it("ne juge pas la latence quand l'ancienne n'a pas été mesurée", () => {
    expect(verdict({ ...bon, p95Ancienne: 0, p95Nouvelle: 9999 }).tenu).toBe(true);
  });

  it("énumère tous les motifs, pas seulement le premier", () => {
    const rendu = verdict({ ouvragesPerdus: ["A"], citationsNonVerifiees: ["x"], p95Ancienne: 10, p95Nouvelle: 100 });
    expect(rendu.motifs).toHaveLength(3);
  });

  it("les seuils sont écrits, pas devinés", () => {
    expect(SEUILS).toEqual({ ouvragesPerdus: 0, facteurLatence: 1.5, citationsNonVerifiees: 0 });
  });
});
