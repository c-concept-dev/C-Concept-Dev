import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Recette } from "@lienotheque/contrats";
import {
  BROUILLON_NEUF,
  depuisRecette,
  enRecette,
  manqueALaManiere,
  versionSuivante,
  type Brouillon,
} from "../src/index.js";

/** Montrer où regarder, plutôt que taper une recette (REC-01, REC-03, REC-06, REC-07). */

const DOSSIER = join(import.meta.dirname, "../../../fixtures/recettes");
const RECETTES = readdirSync(DOSSIER)
  .filter((fichier) => fichier.endsWith(".json"))
  .map((fichier) => ({ fichier, recette: Recette.parse(JSON.parse(readFileSync(join(DOSSIER, fichier), "utf8"))) }));

/** Un brouillon complet : une zone de page, une zone d'éléments, un repère de piste. */
const COMPLET: Brouillon = {
  ...BROUILLON_NEUF,
  id: "une-maniere",
  zones: [
    { cle: "a", role: "page_imprimee", rectangle: { x: 0.8, y: 0.92, l: 0.15, h: 0.05 } },
    { cle: "b", role: "element", rectangle: { x: 0.05, y: 0.1, l: 0.08, h: 0.8 }, libelle: "Numéro" },
  ],
  piste: { position: "droite", motif: "losange_sombre_chiffres_clairs", etiquetteDisque: false },
};

describe("ce qui manque se dit, il ne se devine pas (UX-09)", () => {
  it("rien ne manque à un brouillon complet", () => {
    expect(manqueALaManiere(COMPLET)).toBeUndefined();
  });

  it("sans zone d'éléments, il n'y a rien à lire", () => {
    expect(manqueALaManiere(BROUILLON_NEUF)).toMatch(/numéro d’un élément/);
  });

  it("deux zones pour la même chose : les numéros sont tous au même endroit", () => {
    const deux = { ...COMPLET, zones: [...COMPLET.zones, { cle: "c", role: "element" as const, rectangle: { x: 0.5, y: 0.1, l: 0.1, h: 0.5 } }] };
    expect(manqueALaManiere(deux)).toMatch(/une seule zone/i);
  });

  it("une zone sans surface ne cherche nulle part", () => {
    const plate = { ...COMPLET, zones: [{ cle: "b", role: "element" as const, rectangle: { x: 0.1, y: 0.1, l: 0, h: 0.5 } }] };
    expect(manqueALaManiere(plate)).toMatch(/sans surface/);
  });
});

describe("les zones deviennent une recette que le contrat accepte (REC-01)", () => {
  it("une zone tracée devient un rectangle relatif, aux mêmes coordonnées", () => {
    const recette = enRecette(COMPLET);
    const element = recette.lectures.find((lecture) => lecture.ancre === "element")!;
    expect(element.zone).toEqual({ type: "rectangle_rel", x: 0.05, y: 0.1, l: 0.08, h: 0.8 });
  });

  it("le repère de piste ne se trace pas : il se cherche à côté de l'élément", () => {
    const piste = enRecette(COMPLET).lectures.find((lecture) => lecture.ancre === "piste");
    expect(piste).toMatchObject({ relatif_a: "element", position: "droite" });
  });

  it("un document sans repère de piste n'en fait pas chercher : on ne devine pas ce qui n'est pas écrit", () => {
    const { piste: _sans, ...sansPiste } = COMPLET;
    const recette = enRecette(sansPiste);
    expect(recette.lectures.some((lecture) => lecture.ancre === "piste")).toBe(false);
    expect(recette.regles.pistes).toBeUndefined();
  });

  it("refuse d'écrire une recette d'un brouillon incomplet, en disant ce qui manque", () => {
    expect(() => enRecette(BROUILLON_NEUF)).toThrow(/numéro d’un élément/);
  });
});

describe("le va-et-vient : rouvrir puis enregistrer n'abîme rien", () => {
  it("un brouillon rend le même brouillon après l'aller-retour", () => {
    expect(depuisRecette(enRecette(COMPLET))).toEqual({ ...COMPLET, zones: COMPLET.zones.map((zone, rang) => ({ ...zone, cle: `zone-${rang}` })) });
  });

  it("chaque recette du dépôt se rouvre et se réécrit sans rien perdre d'essentiel", () => {
    for (const { fichier, recette } of RECETTES) {
      const refaite = enRecette(depuisRecette(recette));
      expect(refaite.id, fichier).toBe(recette.id);
      expect(refaite.validation, fichier).toEqual(recette.validation);
      expect(refaite.preparation.double_page, fichier).toBe(recette.preparation.double_page);
      expect(refaite.lectures.map((l) => l.ancre), fichier).toEqual(recette.lectures.map((l) => l.ancre));
    }
  });

  it("une zone décrite par un bord revient en rectangle qu'on peut déplacer", () => {
    const parBord = Recette.parse({
      ...RECETTES[0]!.recette,
      lectures: [
        { ancre: "page_imprimee", zone: { type: "coins", bord: "bas" }, alphabet: "chiffres" },
        { ancre: "element", zone: { type: "marges_exterieures", largeur_rel: 0.25 }, hauteur_rel: { min: 0.012, max: 0.04 }, alphabet: "chiffres" },
      ],
    });
    const zones = depuisRecette(parBord).zones;
    expect(zones[0]!.rectangle.h).toBeGreaterThan(0);
    expect(zones[1]!.rectangle.l).toBe(0.25);
  });
});

describe("une manière de lire corrigée est une version de plus (REC-03, REC-06)", () => {
  it("monte d'un cran et dit de laquelle elle dérive", () => {
    const suivante = versionSuivante({ ...COMPLET, version: 2 });
    expect(suivante.version).toBe(3);
    expect(suivante.derivee).toEqual({ id: "une-maniere", version: 2 });
    expect(enRecette(suivante).derivee_de).toEqual({ id: "une-maniere", version: 2 });
  });

  it("une première version ne dérive de rien", () => {
    expect(enRecette(COMPLET).derivee_de).toBeNull();
  });
});
