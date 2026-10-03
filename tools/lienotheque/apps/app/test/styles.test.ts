// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function fichiers(dossier: string, extensions: readonly string[]): string[] {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) return fichiers(chemin, extensions);
    return extensions.some((e) => entree.endsWith(e)) ? [chemin] : [];
  });
}

const relatif = (chemin: string) => chemin.slice(SRC.length + 1);

/** Mêmes contrôles statiques que docs/ui-kit/VERIFICATION.md, appliqués au produit. */
describe("règle 3 de CLAUDE.md : aucune couleur en dur (UX-07)", () => {
  const sources = fichiers(SRC, [".css", ".ts", ".tsx"]);

  it("trouve bien les sources à contrôler", () => {
    expect(sources.length).toBeGreaterThan(4);
  });

  it("n'écrit aucune couleur hexadécimale", () => {
    for (const chemin of sources) {
      const trouvees = readFileSync(chemin, "utf8").match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      expect(trouvees, relatif(chemin)).toEqual([]);
    }
  });

  it("n'écrit aucune couleur rgb(), hsl() ni mot-clé de couleur", () => {
    for (const chemin of sources) {
      const contenu = readFileSync(chemin, "utf8");
      expect(contenu, relatif(chemin)).not.toMatch(/\b(rgba?|hsla?|oklch|lab)\s*\(/);
      expect(contenu, relatif(chemin)).not.toMatch(/:\s*(red|blue|green|black|white|grey|gray)\s*[;}]/);
    }
  });

  /** Seules les déclarations et les lectures de propriétés personnalisées comptent :
   *  un modificateur de classe comme « ln-badge--avertissement » n'en est pas une. */
  it("n'utilise que des propriétés personnalisées préfixées --ln-", () => {
    const declarees = /(?:^|[;{]|\s)(--[\w-]+)\s*:/gm;
    const lues = /var\(\s*(--[\w-]+)/g;

    for (const chemin of sources) {
      const contenu = readFileSync(chemin, "utf8");
      const noms = [
        ...[...contenu.matchAll(declarees)].map((m) => m[1]),
        ...[...contenu.matchAll(lues)].map((m) => m[1]),
      ];
      const horsCharte = [...new Set(noms)].filter((nom) => nom !== undefined && !nom.startsWith("--ln-"));
      expect(horsCharte, relatif(chemin)).toEqual([]);
    }
  });

  it("repérerait bien une propriété personnalisée hors charte", () => {
    const sonde = ":root { --rouge: 1; }\n.a { color: var(--rouge); }";
    const noms = [...sonde.matchAll(/(?:^|[;{]|\s)(--[\w-]+)\s*:/gm)].map((m) => m[1]);
    expect(noms.filter((nom) => nom !== undefined && !nom.startsWith("--ln-"))).toEqual(["--rouge"]);
  });
});
