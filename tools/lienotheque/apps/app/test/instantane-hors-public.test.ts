import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** L'instantané de bibliothèque ne passe jamais par `public/` (correction 8).
 *
 *  `public/` est recopié tel quel dans la construction et publié avec elle. Un instantané est
 *  produit depuis des fichiers sous droits : il vit au cache de travail, et un greffon de Vite le
 *  sert de là. Le dossier était ignoré par Git, ce qui protégeait le dépôt mais pas la
 *  construction — un `pnpm build` l'emportait dans `dist/`. */

const PUBLIC = join(import.meta.dirname, "../public");

const fichiers = (dossier: string): string[] =>
  !existsSync(dossier)
    ? []
    : readdirSync(dossier).flatMap((nom) => {
        const chemin = join(dossier, nom);
        return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
      });

describe("l’instantané ne passe pas par public/ (correction 8)", () => {
  it("aucun fichier de données dans public/", () => {
    const donnees = fichiers(PUBLIC).filter((chemin) => chemin.endsWith(".json"));
    expect(donnees, "public/ est publié tel quel : les données vont au cache de travail").toEqual([]);
  });

  it("le dossier public/donnees n’existe plus", () => {
    expect(existsSync(join(PUBLIC, "donnees"))).toBe(false);
  });

  it("l’application lit l’instantané à une adresse servie par le greffon, pas un fichier de public/", async () => {
    const { CHEMIN_INSTANTANE } = await import("../src/donnees/vue.js");
    expect(CHEMIN_INSTANTANE).toBe("/donnees/bibliotheque.json");
    expect(existsSync(join(PUBLIC, CHEMIN_INSTANTANE)), "servi, pas posé dans public/").toBe(false);
  });
});
