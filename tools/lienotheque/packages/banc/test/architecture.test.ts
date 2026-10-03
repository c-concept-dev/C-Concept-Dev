// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Le port de dépôt aura trois implémentations : `node:sqlite` pour les tests et l'outillage,
 *  l'hôte Rust pour l'application de bureau, SQLite en WebAssembly pour la version en ligne.
 *  Pour que ce soit tenable, un seul adaptateur connaît le moteur — tout le reste ne voit que
 *  le port. Ce garde-fou le vérifie. */

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));

/** Seul paquet du dépôt autorisé à connaître `node:sqlite` : l'adaptateur et ses propres tests,
 *  qui ouvrent la base pour vérifier ce qu'il y a écrit. */
const ADAPTATEUR = "packages/depot-sqlite/";

/** Et dedans, le code qui doit réellement l'employer. */
const MOTEUR = "packages/depot-sqlite/src";

const ZONES = ["packages", "apps", "outils"];
const IGNORES = new Set(["node_modules", "dist", "target", "moteurs", "gen", "src-tauri"]);

function sources(dossier: string): string[] {
  if (!statSync(dossier, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dossier).flatMap((entree) => {
    if (IGNORES.has(entree) || entree.startsWith(".")) return [];
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) return sources(chemin);
    return /\.(ts|tsx)$/.test(entree) ? [chemin] : [];
  });
}

const fichiers = ZONES.flatMap((zone) => sources(join(RACINE, zone))).map((chemin) =>
  relative(RACINE, chemin).replaceAll("\\", "/"),
);

const importe = (chemin: string, module: string): boolean =>
  new RegExp(`from "${module}"|require\\("${module}"\\)|import\\("${module}"\\)`).test(readFileSync(join(RACINE, chemin), "utf8"));

describe("un seul adaptateur connaît le moteur de base", () => {
  it("trouve bien du code à contrôler", () => {
    expect(fichiers.length).toBeGreaterThan(30);
    expect(fichiers.some((c) => c.startsWith(MOTEUR))).toBe(true);
  });

  it("personne n'importe node:sqlite hors de l'adaptateur", () => {
    const fautifs = fichiers.filter((chemin) => !chemin.startsWith(ADAPTATEUR) && importe(chemin, "node:sqlite"));
    expect(fautifs, "node:sqlite ne doit vivre que dans packages/depot-sqlite").toEqual([]);
  });

  it("l'adaptateur, lui, l'emploie bien : sinon ce garde-fou ne garderait rien", () => {
    const dans = fichiers.filter((chemin) => chemin.startsWith(MOTEUR) && importe(chemin, "node:sqlite"));
    expect(dans.length).toBeGreaterThan(0);
  });

  it("le noyau ne dépend d'aucun paquet de stockage", () => {
    const noyau = fichiers.filter((chemin) => chemin.startsWith("packages/noyau/src"));
    for (const chemin of noyau) {
      const contenu = readFileSync(join(RACINE, chemin), "utf8");
      expect(contenu, chemin).not.toMatch(/@lienotheque\/depot-|node:sqlite|better-sqlite3/);
    }
  });
});
