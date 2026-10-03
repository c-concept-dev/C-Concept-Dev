// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DOSSIERS_BIBLIOTHEQUE } from "../src/index.js";

const PORT = readFileSync(fileURLToPath(new URL("../src/depot.ts", import.meta.url)), "utf8");

/** Le noyau ne porte que des contrats et de la logique pure : c'est ce qui permet au même code
 *  de servir l'application, le Worker, et plus tard D1. Ces tests gardent cette promesse. */
describe("port de dépôt", () => {
  it("décrit un dossier de bibliothèque portable", () => {
    expect(Object.values(DOSSIERS_BIBLIOTHEQUE)).toEqual(["sources", "derives", "base"]);
  });

  it("ne dépend d'aucun hébergement ni d'aucun moteur de base", () => {
    // La prose peut nommer SQLite ou D1 pour expliquer le port ; le code, lui, n'en importe rien.
    const imports = [...PORT.matchAll(/^import [\s\S]*?from "([^"]+)";$/gm)].map((m) => m[1]!);
    expect(imports).toEqual(["@lienotheque/contrats"]);
  });

  it("rend tout asynchrone : un dépôt distant ne répond jamais tout de suite", () => {
    const methodes = [...PORT.matchAll(/readonly (\w+): \(([^)]*)\) => ([^;]+);/g)].map((m) => [m[1]!, m[3]!.trim()] as const);
    const synchrones = methodes.filter(([nom, retour]) => !retour.startsWith("Promise<") && nom !== "fermer");
    expect(methodes.length).toBeGreaterThan(15);
    expect(synchrones).toEqual([]);
  });
});
