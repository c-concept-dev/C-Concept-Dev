// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RACINE = fileURLToPath(new URL("..", import.meta.url));

/** Textes qui n'existent que dans le jeu de démonstration. */
const MARQUEURS_DEMONSTRATION = [
  "Méthode d'instrument",
  "Bibliothèque de recherche",
  "Archives photo",
  "Cours vidéo",
  "0190f0a0-0000-7000-8000",
];

/** Texte de l'application elle-même : il prouve que le contrôle lit bien le résultat. */
const MARQUEUR_PRODUIT = "Vos documents et médias, enfin reliés.";

let sortie = "";
let textes: [string, string][] = [];

function lister(dossier: string): string[] {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    return statSync(chemin).isDirectory() ? lister(chemin) : [chemin];
  });
}

beforeAll(() => {
  sortie = mkdtempSync(join(tmpdir(), "lienotheque-construction-"));
  // La vraie commande, dans un processus à part : appeler l'API de Vite depuis les tests
  // laisserait NODE_ENV à « test », et `import.meta.env.DEV` resterait vrai.
  const vite = join(dirname(createRequire(import.meta.url).resolve("vite/package.json")), "bin", "vite.js");
  execFileSync(process.execPath, [vite, "build", "--outDir", sortie, "--emptyOutDir", "--logLevel", "error"], {
    cwd: RACINE,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: "pipe",
  });
  textes = lister(sortie)
    .filter((chemin) => /\.(js|css|html)$/.test(chemin))
    .map((chemin) => [chemin.slice(sortie.length + 1), readFileSync(chemin, "utf8")]);
}, 180_000);

afterAll(() => {
  if (sortie) rmSync(sortie, { recursive: true, force: true });
});

describe("construction de production", () => {
  it("produit bien du code à contrôler", () => {
    expect(textes.length).toBeGreaterThan(1);
    expect(textes.some(([, contenu]) => contenu.includes(MARQUEUR_PRODUIT))).toBe(true);
  });

  it("n'embarque aucune donnée de démonstration", () => {
    for (const [nom, contenu] of textes) {
      for (const marqueur of MARQUEURS_DEMONSTRATION) {
        expect(contenu.includes(marqueur), `${nom} contient « ${marqueur} »`).toBe(false);
      }
    }
  });

  it("n'émet pas non plus le module de démonstration comme morceau séparé", () => {
    expect(textes.map(([nom]) => nom).filter((nom) => /demonstration/i.test(nom))).toEqual([]);
  });
});
