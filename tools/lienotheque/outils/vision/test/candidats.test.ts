// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COTE_MAX_RECADRAGE, Recette, type ZoneRelative } from "@lienotheque/contrats";
import type { ImageGrise } from "@lienotheque/images";
import { describe, expect, it } from "vitest";
import { candidatsDePage, motifDeRelecture, recadrageDuRepere, type ElementAsonder, type PageAsonder } from "../src/index.js";

const RECETTES = join(import.meta.dirname, "../../../fixtures/recettes");
const lire = (nom: string): Recette => Recette.parse(JSON.parse(readFileSync(join(RECETTES, nom), "utf8")));
/** La recette qui déclare une relecture ciblée, et celle qui n'en déclare pas. */
const AVEC = lire("methode-pastilles-cd.v5.json");
const SANS = lire("methode-pastilles-cd.v4.json");

const page = (elements: readonly ElementAsonder[], largeur = 1786, hauteur = 2410): PageAsonder => ({
  index: 7,
  image: { largeur, hauteur, pixels: new Uint8Array(largeur * hauteur).fill(240) },
  cote: "gauche",
  elements,
});

/** Un repère de 100 × 60 px vers le milieu de la page : l'ordre de grandeur mesuré sur F4. */
const repere = (y = 0.4): ZoneRelative => ({ x: 0.2, y, l: 100 / 1786, h: 60 / 2410 });

const element = (sur: Partial<ElementAsonder> = {}): ElementAsonder => ({
  numero: 160,
  y: 0.4,
  zoneRepere: repere(),
  pisteLue: 1,
  chiffresComptes: 2,
  ...sur,
});

describe("quels repères méritent une relecture (OUT-08)", () => {
  it("part quand le repère montre plus de chiffres que la lecture n'en rend", () => {
    expect(motifDeRelecture(element({ pisteLue: 1, chiffresComptes: 2 }))).toBe("lecture_incomplete");
  });

  it("part quand rien n'a été lu alors qu'un repère est bien là", () => {
    expect(motifDeRelecture(element({ pisteLue: undefined, chiffresComptes: 2 }))).toBe("sans_lecture");
    // Même sans comptage : un repère vu et non lu est un repère à relire.
    expect(motifDeRelecture(element({ pisteLue: undefined, chiffresComptes: undefined }))).toBe("sans_lecture");
  });

  it("ne part pas quand le compte répond à la lecture", () => {
    expect(motifDeRelecture(element({ pisteLue: 14, chiffresComptes: 2 }))).toBeUndefined();
    expect(motifDeRelecture(element({ pisteLue: 4, chiffresComptes: 1 }))).toBeUndefined();
  });

  it("ne part pas sans repère localisé : il n'y aurait rien à recadrer", () => {
    expect(motifDeRelecture(element({ zoneRepere: undefined, pisteLue: undefined }))).toBeUndefined();
  });

  it("ne devine pas l'incomplétude quand la lecture n'a pas compté", () => {
    expect(motifDeRelecture(element({ pisteLue: 1, chiffresComptes: undefined }))).toBeUndefined();
  });

  it("ne part pas sur un compte plus petit que la lecture : ce serait l'inverse du défaut", () => {
    expect(motifDeRelecture(element({ pisteLue: 14, chiffresComptes: 1 }))).toBeUndefined();
  });
});

describe("recadrage d'un repère (OUT-08)", () => {
  const image: ImageGrise = { largeur: 1786, hauteur: 2410, pixels: new Uint8Array(1) };

  it("garde le repère et une marge claire autour", () => {
    const boite = recadrageDuRepere(repere(), image)!;
    expect(boite.l).toBeGreaterThan(100);
    expect(boite.h).toBeGreaterThan(60);
    // La marge vaut 0,4 de la hauteur du repère, de chaque côté.
    expect(boite.l).toBe(100 + 2 * Math.round(60 * 0.4));
    expect(boite.h).toBe(60 + 2 * Math.round(60 * 0.4));
  });

  it("reste très loin du plafond du contrat : ce qui part est un repère, pas une page", () => {
    const boite = recadrageDuRepere(repere(), image)!;
    expect(Math.max(boite.l, boite.h)).toBeLessThanOrEqual(COTE_MAX_RECADRAGE);
    expect(Math.max(boite.l, boite.h)).toBeLessThan(250);
  });

  it("ne sort pas de la page quand le repère touche un bord", () => {
    for (const zone of [
      { x: 0, y: 0, l: 0.05, h: 0.02 },
      { x: 0.95, y: 0.98, l: 0.05, h: 0.02 },
    ]) {
      const boite = recadrageDuRepere(zone, image)!;
      expect(boite.x).toBeGreaterThanOrEqual(0);
      expect(boite.y).toBeGreaterThanOrEqual(0);
      expect(boite.x + boite.l).toBeLessThanOrEqual(image.largeur);
      expect(boite.y + boite.h).toBeLessThanOrEqual(image.hauteur);
    }
  });

  it("rogne la marge plutôt que de dépasser ce que le contrat accepte", () => {
    const grande: ImageGrise = { largeur: 4000, hauteur: 4000, pixels: new Uint8Array(1) };
    const boite = recadrageDuRepere({ x: 0.1, y: 0.1, l: 1000 / 4000, h: 1000 / 4000 }, grande)!;
    expect(Math.max(boite.l, boite.h)).toBeLessThanOrEqual(COTE_MAX_RECADRAGE);
  });

  it("renonce quand le repère lui-même dépasse : on n'envoie pas une page", () => {
    const grande: ImageGrise = { largeur: 4000, hauteur: 4000, pixels: new Uint8Array(1) };
    expect(recadrageDuRepere({ x: 0, y: 0, l: 0.5, h: 0.5 }, grande)).toBeUndefined();
  });
});

describe("candidats d'une page (OUT-08, REC-04)", () => {
  it("ne rend rien quand la recette ne déclare aucune relecture ciblée", () => {
    expect(candidatsDePage(page([element()]), SANS)).toEqual([]);
  });

  it("rend le repère douteux, avec son motif et sa provenance", () => {
    const [candidat, ...reste] = candidatsDePage(page([element()]), AVEC);
    expect(reste).toEqual([]);
    expect(candidat).toMatchObject({ page: 7, cote: "gauche", numero: 160, motif: "lecture_incomplete" });
    expect(candidat!.repere.l).toBe(100);
    expect(candidat!.recadrage.l).toBeGreaterThan(candidat!.repere.l);
  });

  it("laisse les repères sûrs tranquilles : un lot qui se lit ne coûte rien", () => {
    const sages = [element({ numero: 1, pisteLue: 4, chiffresComptes: 1 }), element({ numero: 2, pisteLue: 14, chiffresComptes: 2 })];
    expect(candidatsDePage(page(sages), AVEC)).toEqual([]);
  });

  it("rend les repères dans l'ordre de la page", () => {
    const melanges = [
      element({ numero: 3, y: 0.8, zoneRepere: repere(0.8), pisteLue: undefined }),
      element({ numero: 1, y: 0.2, zoneRepere: repere(0.2), pisteLue: undefined }),
      element({ numero: 2, y: 0.5, zoneRepere: repere(0.5), pisteLue: undefined }),
    ];
    expect(candidatsDePage(page(melanges), AVEC).map((c) => c.numero)).toEqual([1, 2, 3]);
  });

  it("s'arrête au plafond par page que la recette déclare", () => {
    // On ne fixe pas la valeur : elle n'est plus un budget mais un garde-fou, et elle bouge. Ce
    // qui doit tenir, c'est que le plafond s'applique.
    const plafond = AVEC.vision!.zones_max_par_page;
    const beaucoup = Array.from({ length: plafond + 6 }, (_, rang) =>
      element({ numero: rang + 1, y: rang / (plafond + 6), zoneRepere: repere(rang / (plafond + 6)), pisteLue: undefined }),
    );
    expect(candidatsDePage(page(beaucoup), AVEC)).toHaveLength(plafond);
  });

  it("rend le même résultat à chaque exécution", () => {
    const donnee = page([element({ numero: 2, y: 0.5, zoneRepere: repere(0.5) }), element({ numero: 1, y: 0.5, zoneRepere: repere(0.5) })]);
    expect(candidatsDePage(donnee, AVEC)).toEqual(candidatsDePage(donnee, AVEC));
  });
});

describe("un éclat n'est pas un repère (OUT-08)", () => {
  /** Relevé sur les clichés : le lecteur rend parfois une forme de trois pixels de large pour
   *  dix-huit de haut. Son recadrage ne contient rien, et l'envoyer serait payer pour rien. */
  const eclat: ZoneRelative = { x: 0.2, y: 0.4, l: 3 / 1786, h: 18 / 2410 };

  it("ne part pas, quel que soit le motif", () => {
    const proportions = { largeur: 1786, hauteur: 2410 };
    expect(motifDeRelecture(element({ zoneRepere: eclat, pisteLue: undefined }), proportions)).toBeUndefined();
    expect(motifDeRelecture(element({ zoneRepere: eclat, pisteLue: 1, chiffresComptes: 2 }), proportions)).toBeUndefined();
  });

  it("et les vrais pavés passent : ils sont à peu près aussi larges que hauts", () => {
    const proportions = { largeur: 1786, hauteur: 2410 };
    // Le plus étroit des vrais repères mesurés : 31 × 42 px.
    const etroit: ZoneRelative = { x: 0.2, y: 0.4, l: 31 / 1786, h: 42 / 2410 };
    expect(motifDeRelecture(element({ zoneRepere: etroit, pisteLue: 1, chiffresComptes: 2 }), proportions)).toBe("lecture_incomplete");
  });

  it("la sélection d'une page l'écarte d'elle-même", () => {
    expect(candidatsDePage(page([element({ zoneRepere: eclat, pisteLue: undefined })]), AVEC)).toEqual([]);
  });

  it("sans proportions, la règle ne s'applique pas : une zone relative seule ne dit rien", () => {
    expect(motifDeRelecture(element({ zoneRepere: eclat, pisteLue: undefined }))).toBe("sans_lecture");
  });
});
