// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { BASES_D1, fichiersDe, nomDeFichier, type BaseD1 } from "../src/d1.js";
import { migrer } from "../src/depot.js";

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
const DOSSIER = join(RACINE, "apps/worker/migrations");
const bases = Object.keys(BASES_D1) as BaseD1[];

/** La première ligne qui diffère, et rien d'autre. Un message d'échec qui recrache deux fichiers
 *  entiers oblige à chercher ; celui-ci montre. */
function premiereDifference(sur_disque: string, attendu: string): string | undefined {
  const a = sur_disque.split("\n");
  const b = attendu.split("\n");
  for (let rang = 0; rang < Math.max(a.length, b.length); rang += 1) {
    if (a[rang] !== b[rang]) return `ligne ${rang + 1} : disque « ${a[rang] ?? "(fin)"} », attendu « ${b[rang] ?? "(fin)"} »`;
  }
  return undefined;
}

describe("migrations D1 engendrées (HEB-03)", () => {
  it.each(bases)("%s : les fichiers sur le disque sont ceux qu'on engendrerait", (base) => {
    const dossier = join(DOSSIER, base);
    expect(existsSync(dossier), `${dossier} manque — lancez « pnpm build »`).toBe(true);

    const attendus = fichiersDe(base);
    const presents = readdirSync(dossier).sort();
    expect(presents, `le dossier ${base} a dérivé — relancez « pnpm build »`).toEqual(attendus.map((f) => f.nom).sort());

    for (const fichier of attendus) {
      // Les fins de ligne sont mises de côté avant la comparaison. Le dépôt normalise en
      // « text=auto », donc une sortie sur Windows rend des CRLF : le test échouerait alors en
      // montrant deux textes rigoureusement identiques à l'écran, ce qui est la pire façon
      // d'échouer. Le `.gitattributes` du dossier fige les fins de ligne ; ceci est la ceinture
      // qui va avec la bretelle, et le message dit ce qui diffère vraiment.
      const sur_disque = readFileSync(join(dossier, fichier.nom), "utf8").replace(/\r\n/g, "\n");
      const ecart = premiereDifference(sur_disque, fichier.contenu);
      expect(ecart, `${base}/${fichier.nom} a dérivé du tableau — relancez « pnpm build »`).toBeUndefined();
    }
  });

  it.each(bases)("%s : les versions sont uniques et se suivent", (base) => {
    const versions = BASES_D1[base].map((migration) => migration.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((a, b) => a - b)).toEqual([...Array(versions.length).keys()].map((rang) => rang + 1));
  });

  it.each(bases)("%s : le SQL s'applique vraiment, sur une base neuve", (base) => {
    // Le test qui compte : un schéma qui se compare mais ne s'exécute pas ne sert à rien.
    const memoire = new DatabaseSync(":memory:");
    expect(migrer(memoire, BASES_D1[base])).toBe(BASES_D1[base].length);
    const tables = (memoire.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
      (ligne) => ligne.name,
    );
    expect(tables).toContain("migration");
    expect(tables.length).toBeGreaterThan(1);
    memoire.close();
  });

  it("une bibliothèque et le registre ne partagent aucune table", () => {
    // L'isolation est structurelle : deux bases, deux schémas. Si une table se mettait à vivre
    // des deux côtés, elle finirait par être écrite des deux côtés, et il faudrait les accorder.
    const tablesDe = (base: BaseD1): Set<string> => {
      const memoire = new DatabaseSync(":memory:");
      migrer(memoire, BASES_D1[base]);
      const noms = (memoire.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
        .map((ligne) => ligne.name)
        .filter((nom) => nom !== "migration");
      memoire.close();
      return new Set(noms);
    };
    const communes = [...tablesDe("registre")].filter((nom) => tablesDe("bibliotheque").has(nom));
    expect(communes).toEqual([]);
  });

  it("le nom de fichier se trie dans l'ordre d'application", () => {
    expect(nomDeFichier({ version: 1, nom: "socle", sql: "" })).toBe("0001_socle.sql");
    expect(["0010_dix.sql", "0002_deux.sql"].sort()).toEqual(["0002_deux.sql", "0010_dix.sql"]);
  });

  it("le registre ne porte aucune colonne binaire (HEB-02)", () => {
    // D1 ne doit contenir aucun fichier : la règle vaut pour le registre comme pour le reste.
    for (const base of bases) {
      const memoire = new DatabaseSync(":memory:");
      migrer(memoire, BASES_D1[base]);
      const schema = (memoire.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL").all() as { sql: string }[])
        .map((ligne) => ligne.sql)
        .join("\n");
      expect(schema, `${base} déclare un BLOB`).not.toMatch(/\bBLOB\b/i);
      memoire.close();
    }
  });
});
