// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** CLA-01 : le code générique ne connaît aucun domaine. Un mot de thérapie, de droit, de cuisine,
 *  de philatélie ou de musique dans le noyau est une régression : il annonce une branche
 *  spécifique qui cassera au domaine suivant. La liste des mots est une donnée extensible. */

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));

type Garde = {
  readonly zones: readonly { readonly chemin: string; readonly sauf?: readonly string[] }[];
  readonly termes: readonly string[];
  readonly exceptions: readonly { readonly chemin: string; readonly raison: string }[];
};

const garde = JSON.parse(readFileSync(join(RACINE, "fixtures/termes-de-domaine.json"), "utf8")) as Garde;

const sansAccents = (texte: string): string => texte.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function sources(dossier: string, sauf: readonly string[]): string[] {
  if (!statSync(dossier, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    const relatif = relative(RACINE, chemin).replaceAll("\\", "/");
    if (sauf.some((exclu) => relatif === exclu || relatif.startsWith(`${exclu}/`))) return [];
    if (statSync(chemin).isDirectory()) return sources(chemin, sauf);
    return /\.(ts|tsx)$/.test(entree) ? [chemin] : [];
  });
}

const exceptions = new Set(garde.exceptions.map((e) => e.chemin));

const fichiers = garde.zones
  .flatMap((zone) => sources(join(RACINE, zone.chemin), zone.sauf ?? []))
  .map((chemin) => relative(RACINE, chemin).replaceAll("\\", "/"))
  .filter((chemin) => !exceptions.has(chemin));

describe("CLA-01 : aucun mot de domaine dans le code générique", () => {
  it("trouve bien du code à contrôler", () => {
    expect(fichiers.length).toBeGreaterThan(10);
    expect(garde.termes.length).toBeGreaterThan(10);
  });

  it("ne laisse passer aucun terme de la liste", () => {
    for (const chemin of fichiers) {
      const contenu = sansAccents(readFileSync(join(RACINE, chemin), "utf8"));
      const trouves = garde.termes.filter((terme) => contenu.includes(sansAccents(terme)));
      expect(trouves, `${chemin} emploie un vocabulaire de domaine`).toEqual([]);
    }
  });

  it("repérerait un terme introduit par mégarde", () => {
    const sonde = sansAccents("const approche = 'Thérapie brève';");
    expect(garde.termes.filter((t) => sonde.includes(sansAccents(t)))).toContain("thérapie");
  });

  it("justifie chacune de ses exceptions", () => {
    for (const exception of garde.exceptions) {
      expect(exception.raison.length, exception.chemin).toBeGreaterThan(40);
      expect(statSync(join(RACINE, exception.chemin), { throwIfNoEntry: false })?.isFile(), exception.chemin).toBe(true);
    }
  });
});
