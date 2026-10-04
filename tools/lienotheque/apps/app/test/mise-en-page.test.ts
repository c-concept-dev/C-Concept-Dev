// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), "utf8");

const FEUILLES = {
  premier: lire("../src/pages/PremierLancement.css"),
  base: lire("../src/styles/base.css"),
  lecteur: lire("../src/pages/Lecteur.css"),
};

const sansCommentaires = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Corps de toutes les règles visant exactement `selecteur`, requêtes de média comprises :
 *  une largeur de fenêtre particulière ne doit pas pouvoir rompre le centrage. */
function reglesPour(css: string, selecteur: string): string[] {
  return [...sansCommentaires(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, entete]) =>
      (entete ?? "")
        .split("{")
        .pop()!
        .split(",")
        .map((s) => s.trim())
        .includes(selecteur),
    )
    .map(([, , corps]) => corps ?? "");
}

const declaration = (corps: string, propriete: string): string | undefined =>
  new RegExp(`(?:^|;)\\s*${propriete}\\s*:\\s*([^;]+)`, "m").exec(corps)?.[1]?.trim();

/** Le contenu du premier lancement doit rester au milieu de la fenêtre, quelle qu'en soit la
 *  largeur. Trois règles le produisent : une largeur bornée, des marges automatiques égales et
 *  une colonne unique. jsdom ne calcule aucune mise en page : ce test garde les règles, et les
 *  mesures en navigateur (820, 1024 et 1600 px) sont consignées dans docs/decisions.md. */
describe("premier lancement : contenu centré dans la fenêtre", () => {
  const regles = reglesPour(FEUILLES.premier, ".ln-premier");

  it("borne sa largeur et pose des marges automatiques", () => {
    expect(regles.length).toBeGreaterThan(0);
    expect(regles.some((corps) => declaration(corps, "max-width") !== undefined)).toBe(true);
    expect(regles.some((corps) => declaration(corps, "margin-inline") === "auto")).toBe(true);
  });

  it("n'a qu'une colonne : jamais de grille à deux colonnes qui pousserait le contenu de côté", () => {
    for (const corps of regles) {
      const colonnes = declaration(corps, "grid-template-columns");
      if (colonnes === undefined) continue;
      expect(colonnes.split(/\s+(?![^(]*\))/).length, `colonnes : ${colonnes}`).toBe(1);
    }
  });

  it("ne casse jamais la symétrie, à aucune largeur", () => {
    for (const corps of regles) {
      for (const propriete of ["margin-left", "margin-right", "justify-self", "padding-left", "padding-right"]) {
        expect(declaration(corps, propriete), propriete).toBeUndefined();
      }
      const marges = declaration(corps, "padding");
      if (marges === undefined) continue;
      const valeurs = marges.split(/\s+/);
      if (valeurs.length === 4) expect(valeurs[1], marges).toBe(valeurs[3]);
    }
  });

  it("centre ce qu'elle contient", () => {
    expect(regles.some((corps) => declaration(corps, "justify-items") === "center")).toBe(true);
  });

  it("hérite d'une mise en page elle-même centrée", () => {
    const layout = reglesPour(FEUILLES.base, ".ln-layout");
    expect(layout.some((corps) => declaration(corps, "margin") === "auto")).toBe(true);
  });
});

/** Correction 3 : le Lecteur tient dans la hauteur de la fenêtre — en-tête, barre, feuille et
 *  panneaux — et c'est la feuille qui défile, à l'intérieur. Trois conditions le produisent :
 *  une coque bornée à la fenêtre, une grille dont la rangée basse prend le reste, et des colonnes
 *  autorisées à être plus courtes que leur contenu. Sans `min-height: 0`, une colonne de grille
 *  prend la hauteur de son contenu et pousse l'écran hors de la fenêtre : c'est la règle qu'on
 *  oublie, donc c'est celle qu'on garde ici. */
describe("Lecteur : l'écran tient dans la hauteur de la fenêtre (correction 3)", () => {
  const coque = reglesPour(FEUILLES.base, ".ln-application--pleine");

  it("borne la coque à la hauteur de la fenêtre et lui interdit de déborder", () => {
    expect(coque.length).toBeGreaterThan(0);
    expect(coque.some((corps) => declaration(corps, "height") === "100dvh")).toBe(true);
    expect(coque.some((corps) => declaration(corps, "overflow") === "hidden")).toBe(true);
  });

  it("donne au corps du Lecteur la rangée qui reste, et rien de plus", () => {
    const lecteur = reglesPour(FEUILLES.lecteur, ".ln-lecteur");
    expect(lecteur.some((corps) => declaration(corps, "grid-template-rows")?.endsWith("1fr") === true)).toBe(true);
    expect(lecteur.some((corps) => declaration(corps, "overflow") === "hidden")).toBe(true);
  });

  it("autorise chaque colonne à être plus courte que son contenu", () => {
    for (const selecteur of [".ln-lecteur__corps", ".ln-lecteur__feuille", ".ln-lecteur__cote", ".ln-vignettes"]) {
      const regles = reglesPour(FEUILLES.lecteur, selecteur);
      expect(regles.length, selecteur).toBeGreaterThan(0);
      expect(regles.some((corps) => declaration(corps, "min-height") === "0"), selecteur).toBe(true);
    }
  });

  it("fait défiler la feuille, pas l'écran", () => {
    const feuille = reglesPour(FEUILLES.lecteur, ".ln-lecteur__feuille");
    expect(feuille.some((corps) => declaration(corps, "overflow") === "auto")).toBe(true);
  });
});

/** Correction 3, deuxième moitié : en hybride le fond photographique couvre toute la fenêtre,
 *  quelle que soit la hauteur du contenu.
 *
 *  La forme abrégée `url(...) center / cover fixed` n'arrimait que la dernière couche : le voile,
 *  lui, restait arrimé au document. Sur une page plus courte que la fenêtre, le voile s'arrêtait
 *  avec le document et laissait une bande de photographie nue en bas de l'écran. Les deux couches
 *  sont désormais arrimées à la fenêtre et dimensionnées en `cover`, avec une couleur de fond
 *  dessous — le temps que l'image arrive, il n'y a pas davantage de bande claire. */
describe("Hybride : le fond photographique couvre toute la fenêtre (correction 3)", () => {
  const fond = reglesPour(FEUILLES.base, '[data-theme="hybrid"]');

  it("arrime les deux couches à la fenêtre", () => {
    expect(fond.length).toBeGreaterThan(0);
    const attachement = fond.map((corps) => declaration(corps, "background-attachment")).find((valeur) => valeur !== undefined);
    expect(attachement).toBeDefined();
    expect(attachement!.split(",").map((valeur) => valeur.trim())).toEqual(["fixed", "fixed"]);
  });

  it("dimensionne les deux couches sur la fenêtre, pas sur le document", () => {
    const taille = fond.map((corps) => declaration(corps, "background-size")).find((valeur) => valeur !== undefined);
    expect(taille!.split(",").map((valeur) => valeur.trim())).toEqual(["cover", "cover"]);
  });

  it("pose une couleur sous l'image et une hauteur minimale de fenêtre", () => {
    expect(fond.some((corps) => declaration(corps, "background-color") !== undefined)).toBe(true);
    expect(fond.some((corps) => declaration(corps, "min-height") === "100dvh")).toBe(true);
  });

  it("n'écrit plus la forme abrégée, qui n'arrimait qu'une couche", () => {
    for (const corps of fond) expect(declaration(corps, "background"), corps).toBeUndefined();
  });
});
