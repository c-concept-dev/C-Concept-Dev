import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { appartientA, bibliothequeDe, cleDerive, cleSource } from "../src/objets.js";

const EMPREINTE = "a".repeat(64);

describe("où un objet vit dans le compartiment", () => {
  it("range une source sous sa bibliothèque, par son empreinte", () => {
    expect(cleSource("essai", EMPREINTE)).toBe(`essai/sources/aa/${EMPREINTE}`);
  });

  it("range un dérivé sous sa version", () => {
    expect(cleDerive("essai", "v3", "pages/page-0001.webp")).toBe("essai/derives/v3/pages/page-0001.webp");
  });

  it("retrouve la bibliothèque d'une clé", () => {
    expect(bibliothequeDe(cleSource("essai", EMPREINTE))).toBe("essai");
    expect(bibliothequeDe("n'importe quoi")).toBeUndefined();
  });

  it("ne confond pas deux bibliothèques dont l'une commence comme l'autre", () => {
    // Le piège qu'un `startsWith` ne voit pas : « essai-bis/ » commence par « essai ».
    // Servir un fichier de la mauvaise bibliothèque serait la fuite que SEC-05 interdit.
    const cle = cleSource("essai-bis", EMPREINTE);
    expect(cle.startsWith("essai")).toBe(true);
    expect(appartientA(cle, "essai")).toBe(false);
    expect(appartientA(cle, "essai-bis")).toBe(true);
  });

  it("refuse une clé qui remonte dans l'arborescence", () => {
    expect(bibliothequeDe("../autre/sources/aa/x")).toBeUndefined();
    expect(appartientA("essai/../autre/sources/aa/x", "essai")).toBe(false);
  });
});

describe("personne d'autre ne compose de préfixe (le garde-fou)", () => {
  /** L'isolation des fichiers n'est pas structurelle : c'est du code qui la tient. Un second
   *  endroit qui composerait une clé serait un second endroit à relire à chaque revue, et celui
   *  qu'on oublierait. Ce contrôle le refuse. */
  const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
  const SOURCES = ["packages/noyau/src", "packages/depot-sqlite/src", "apps/worker/src", "outils/ingestion/src"];
  const AUTORISE = "packages/noyau/src/objets.ts";

  const fichiersTypeScript = (dossier: string): string[] => {
    const complet = join(RACINE, dossier);
    let entrees: string[];
    try {
      entrees = readdirSync(complet, { recursive: true }) as string[];
    } catch {
      return [];
    }
    return entrees.filter((nom) => nom.endsWith(".ts")).map((nom) => join(dossier, nom));
  };

  it("aucun module hors objets.ts ne fabrique « /sources/ » ni « /derives/ »", () => {
    const coupables: string[] = [];
    for (const dossier of SOURCES) {
      for (const chemin of fichiersTypeScript(dossier)) {
        if (chemin === AUTORISE) continue;
        const contenu = readFileSync(join(RACINE, chemin), "utf8");
        // On cherche la composition, pas la mention : un gabarit ou une concaténation qui
        // fabrique le chemin. Un commentaire qui en parle ne gêne personne.
        const lignes = contenu.split("\n").filter((ligne) => !ligne.trimStart().startsWith("//") && !ligne.trimStart().startsWith("*"));
        if (/["'`][^"'`]*\/(sources|derives)\//.test(lignes.join("\n"))) coupables.push(chemin);
      }
    }
    expect(coupables, `ces modules composent un chemin d'objet : ${coupables.join(", ")}`).toEqual([]);
  });
});
