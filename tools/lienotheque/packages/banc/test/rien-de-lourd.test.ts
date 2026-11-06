// @vitest-environment node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TOLERES, fichiersRefuses } from "../src/rien-de-lourd.js";

/** Rien de lourd dans un dépôt public (CLAUDE.md, règle 5).
 *
 *  Le garde-fou lui-même est au-dessus ; ici on prouve qu'il voit, puis on le lance sur l'index
 *  réel. L'ordre compte : un garde-fou qu'on ne vérifie que sur l'état du dépôt passerait au vert
 *  le jour où il cesserait de voir quoi que ce soit. */

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));

describe("la règle voit ce qu'elle doit voir", () => {
  it("refuse un document et un enregistrement", () => {
    const refuses = fichiersRefuses(["docs/note.md", "fixtures/un livre.pdf", "medias/01 - x.mp3"]);
    expect(refuses.map((refuse) => refuse.chemin)).toEqual(["fixtures/un livre.pdf", "medias/01 - x.mp3"]);
    expect(refuses[0]?.pourquoi).toMatch(/public/);
  });

  it("refuse une sortie de mesure, quelle que soit son extension", () => {
    const refuses = fichiersRefuses([
      "outils/ingestion/mesures/sorties/rapports/noyau.json",
      "outils/ingestion/mesures/sorties/captures/ecran.png",
      "outils/ingestion/mesures/une-mesure.ts",
    ]);
    expect(refuses.map((refuse) => refuse.chemin)).toEqual([
      "outils/ingestion/mesures/sorties/rapports/noyau.json",
      "outils/ingestion/mesures/sorties/captures/ecran.png",
    ]);
    expect(refuses[0]?.pourquoi).toMatch(/régénérable/);
  });

  it("laisse passer ce qui est toléré, et seulement cela", () => {
    expect(fichiersRefuses(TOLERES.map((tolere) => tolere.chemin))).toEqual([]);
    expect(fichiersRefuses(["docs/ui-kit/autre.pdf"]), "la tolérance vise un chemin, pas un dossier").toHaveLength(1);
  });

  it("ne se laisse pas tromper par la casse", () => {
    expect(fichiersRefuses(["x/UN LIVRE.PDF"])).toHaveLength(1);
  });

  it("chaque tolérance porte sa raison écrite", () => {
    for (const tolere of TOLERES) expect(tolere.raison.length, tolere.chemin).toBeGreaterThan(40);
  });
});

describe("et l'index du dépôt ne porte rien de tel", () => {
  it("aucune œuvre ni sortie de mesure n'est suivie sous ce projet", () => {
    // `git ls-files` lit l'**index** : un fichier ajouté et pas encore commité est déjà vu.
    // C'est le seul moment où le refus sert encore à quelque chose.
    // Lancé depuis la racine du projet, `git ls-files` rend des chemins relatifs à elle : c'est
    // la même forme que celle qu'emploient `TOLERES` et les contrôles ci-dessus.
    const suivis = execFileSync("git", ["ls-files"], {
      cwd: RACINE,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\n")
      .filter((ligne) => ligne.length > 0);

    expect(suivis.length, "le dépôt doit bien porter des fichiers de ce projet").toBeGreaterThan(100);
    const refuses = fichiersRefuses(suivis);
    expect(
      refuses.map((refuse) => `${refuse.chemin} — ${refuse.pourquoi}`),
      "retirez-les de l'index (git rm --cached), ou justifiez-les dans TOLERES",
    ).toEqual([]);
  });
});
