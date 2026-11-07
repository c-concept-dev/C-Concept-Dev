// @vitest-environment node
import { describe, expect, it } from "vitest";
import { verdictAvantCommit, type GardeDuVocabulaire } from "../src/avant-commit.js";

/** Ce qu'un commit ne doit pas emporter, décidé avant qu'il parte.
 *
 *  ## Pourquoi une mécanique, et non une relecture
 *
 *  Les garde-fous du banc tiennent déjà ces trois règles — fichiers fantômes, fuites de fichiers
 *  lourds, vocabulaire de domaine. Mais ils tiennent au moment du **contrôle complet**, et deux
 *  erreurs du 7 novembre 2026 ont passé entre les deux :
 *
 *  - un commit d'autorisation qui devait porter une ligne en a emporté quatre-vingt-seize, parce
 *    que `git apply --3way` indexe son résultat ;
 *  - une section de registre effacée par un `cp` depuis une copie antérieure.
 *
 *  Les deux avaient leur sortie sous les yeux — `git diff --cached --stat` montrait deux fichiers
 *  au lieu d'un. Elles ont traversé parce qu'elles reposaient sur une lecture attentive, et
 *  **un garde-fou qui demande qu'on lise attentivement n'est pas un garde-fou.**
 *
 *  ## Ce que cette décision juge
 *
 *  **L'index**, c'est-à-dire ce que le commit contiendra — jamais le disque. C'est la règle du
 *  7 novembre, et c'est ce qui rend la décision utile avant le commit plutôt qu'après. */

const GARDE: GardeDuVocabulaire = {
  zones: [{ chemin: "paquet/src" }, { chemin: "app/src", sauf: ["app/src/donnees"] }],
  termes: ["thérapie", "aebersold"],
  exceptions: [],
};

const contenus = (entrees: Record<string, string>) => (chemin: string) => entrees[chemin] ?? "";

describe("ce qu'un commit ne doit pas emporter", () => {
  it("accepte un index propre", () => {
    const suivis = ["paquet/src/index.ts", "paquet/src/present.ts"];
    expect(
      verdictAvantCommit({
        suivis,
        lire: contenus({ "paquet/src/index.ts": 'export * from "./present.js";\n' }),
        garde: GARDE,
      }).refus,
    ).toEqual([]);
  });

  it("refuse un fichier fantôme : un import que l'index ne porte pas", () => {
    const verdict = verdictAvantCommit({
      suivis: ["paquet/src/index.ts"],
      lire: contenus({ "paquet/src/index.ts": 'export * from "./absent.js";\n' }),
      garde: GARDE,
    });
    expect(verdict.refus).toHaveLength(1);
    expect(verdict.refus[0]).toContain("paquet/src/index.ts");
    expect(verdict.refus[0]).toContain("./absent.js");
  });

  it("refuse un PDF, qui n'a rien à faire dans un dépôt public", () => {
    const verdict = verdictAvantCommit({
      suivis: ["docs/un-recueil.pdf"],
      lire: contenus({}),
      garde: GARDE,
    });
    expect(verdict.refus).toHaveLength(1);
    expect(verdict.refus[0]).toContain("un-recueil.pdf");
  });

  it("refuse un mot de domaine dans une zone inspectée (CLA-01)", () => {
    const verdict = verdictAvantCommit({
      suivis: ["paquet/src/lecture.ts"],
      lire: contenus({ "paquet/src/lecture.ts": "// une approche de thérapie brève\n" }),
      garde: GARDE,
    });
    expect(verdict.refus).toHaveLength(1);
    expect(verdict.refus[0]).toContain("thérapie");
  });

  it("laisse le mot de domaine là où la zone l'excepte", () => {
    const verdict = verdictAvantCommit({
      suivis: ["app/src/donnees/demonstration.ts"],
      lire: contenus({ "app/src/donnees/demonstration.ts": "// aebersold, donnée inventée\n" }),
      garde: GARDE,
    });
    expect(verdict.refus).toEqual([]);
  });

  it("refuse une promesse placée dans une condition", () => {
    const verdict = verdictAvantCommit({
      suivis: ["paquet/src/lire.ts", "paquet/src/usage.ts"],
      lire: contenus({
        "paquet/src/lire.ts": "export async function lireQuelqueChose() { return true; }\n",
        "paquet/src/usage.ts": "if (lireQuelqueChose()) { partir(); }\n",
      }),
      garde: GARDE,
    });
    expect(verdict.refus).toHaveLength(1);
    expect(verdict.refus[0]).toContain("lireQuelqueChose");
  });

  it("nomme TOUTES les fautes, et non la première", () => {
    const verdict = verdictAvantCommit({
      suivis: ["docs/un-recueil.pdf", "paquet/src/index.ts"],
      lire: contenus({ "paquet/src/index.ts": '// thérapie\nexport * from "./absent.js";\n' }),
      garde: GARDE,
    });
    // Un refus qui s'arrête à la première faute fait recommencer le commit autant de fois qu'il
    // y a de fautes, et chaque tour coûte un contrôle.
    expect(verdict.refus.length).toBeGreaterThanOrEqual(3);
  });
});
