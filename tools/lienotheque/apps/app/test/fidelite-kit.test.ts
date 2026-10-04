// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JETONS } from "@lienotheque/jetons";
import { describe, expect, it } from "vitest";
import { CHEMINS, CHEMINS_APPLICATION, SYMBOLES_DU_KIT, TOUS_CHEMINS } from "../src/composants/Icone.js";
import { COLLECTIONS } from "../src/composants/CarteBibliotheque.js";

const COMPOSANTS = fileURLToPath(new URL("../src/composants", import.meta.url));
const SPRITE = readFileSync(fileURLToPath(new URL("../../../docs/ui-kit/assets/icons.svg", import.meta.url)), "utf8");

describe("fidélité au kit UI v1.1", () => {
  it("reprend exactement les tracés du sprite du kit", () => {
    for (const [nom, chemin] of Object.entries(CHEMINS)) {
      const symbole = SYMBOLES_DU_KIT[nom as keyof typeof SYMBOLES_DU_KIT];
      const bloc = new RegExp(`<symbol id="${symbole}"[^>]*>\\s*<path d="([^"]+)"`).exec(SPRITE);
      expect(bloc, `symbole « ${symbole} » absent du sprite`).not.toBeNull();
      expect(bloc?.[1], nom).toBe(chemin);
    }
  });

  it("ne prétend pas que les icônes de l'application viennent du kit", () => {
    // Le kit v1.1 ne couvre ni lecteur de média ni écran de vérification. Ces tracés-là sont
    // tenus à part, et aucun ne revendique un symbole du sprite.
    for (const nom of Object.keys(CHEMINS_APPLICATION)) {
      expect(Object.keys(CHEMINS), `« ${nom} » ne doit pas être dans les tracés du kit`).not.toContain(nom);
      expect(SYMBOLES_DU_KIT, nom).not.toHaveProperty(nom);
    }
    expect(Object.keys(TOUS_CHEMINS)).toHaveLength(Object.keys(CHEMINS).length + Object.keys(CHEMINS_APPLICATION).length);
  });

  it("les icônes de l'application tiennent dans la grille du kit", () => {
    // Même grille de 24, mêmes commandes de tracé : rien qui jure à côté d'une icône du kit.
    for (const [nom, chemin] of Object.entries(CHEMINS_APPLICATION)) {
      expect(chemin, nom).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/);
      for (const nombre of chemin.match(/-?\d+(\.\d+)?/g) ?? []) expect(Math.abs(Number(nombre)), `${nom} : ${nombre}`).toBeLessThanOrEqual(24);
    }
  });

  it("reprend exactement les collections des jetons", () => {
    expect([...COLLECTIONS]).toEqual(Object.keys(JETONS.collections));
  });
});

describe("règle 1 de CLAUDE.md : rien en dur pour le domaine", () => {
  const sources = readdirSync(COMPOSANTS).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));

  it("aucun composant générique ne nomme un domaine", () => {
    for (const nom of sources) {
      const contenu = readFileSync(join(COMPOSANTS, nom), "utf8");
      expect(contenu, nom).not.toMatch(/exercice|partition|th[ée]rap/i);
    }
  });

  it("le vocabulaire affiché arrive par les propriétés, jamais écrit dans le composant", () => {
    const carte = readFileSync(join(COMPOSANTS, "CarteBibliotheque.tsx"), "utf8");
    expect(carte).not.toMatch(/"[0-9]+ (éléments|liens|livres|images|vidéos)"/);
    expect(carte).toContain("compteurs");
  });
});
