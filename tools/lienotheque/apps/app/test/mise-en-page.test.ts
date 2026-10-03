// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), "utf8");

const FEUILLES = {
  premier: lire("../src/pages/PremierLancement.css"),
  base: lire("../src/styles/base.css"),
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
