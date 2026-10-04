// @vitest-environment node
import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CACHE_PAR_DEFAUT, PLAFOND_PAR_DEFAUT, PLAFOND_REPLI, coin, nettoyer, ouvrirCache, peser, vider } from "../src/index.js";

const dossiers: string[] = [];
const neuf = (): string => {
  const chemin = mkdtempSync(join(tmpdir(), "lienotheque-cache-essai-"));
  dossiers.push(chemin);
  return chemin;
};
afterEach(() => {
  for (const dossier of dossiers.splice(0)) rmSync(dossier, { recursive: true, force: true });
});

/** Un chemin qu'aucun système ne peut créer : il descend sous un fichier ordinaire, et un fichier
 *  ne devient pas un dossier — ENOTDIR partout.
 *
 *  Un chemin de volume absent ne vaut que sur macOS : sous Windows il se crée sans bruit sur le
 *  disque courant, le cache se croyait joignable, et ni le repli ni l'échec n'arrivaient. */
const injoignable = (): string => {
  const fichier = join(neuf(), "un-fichier");
  writeFileSync(fichier, "");
  return join(fichier, "cache");
};

/** Écrit un fichier de `octets` octets, vu à la date donnée. */
function poser(dossier: string, nom: string, octets: number, vuLe = Date.now()): string {
  const chemin = join(dossier, nom);
  writeFileSync(chemin, Buffer.alloc(octets));
  utimesSync(chemin, new Date(vuLe), new Date(vuLe));
  return chemin;
}

describe("ouverture du cache (décision 6)", () => {
  it("prend le dossier demandé quand il est joignable", () => {
    const voulu = join(neuf(), "cache");
    const cache = ouvrirCache({ dossier: voulu, avertir: () => {} });
    expect(cache.dossier).toBe(voulu);
    expect(cache.replie).toBe(false);
    expect(cache.plafond).toBe(PLAFOND_PAR_DEFAUT);
    expect(existsSync(voulu), "le dossier est créé").toBe(true);
  });

  it("se replie en le disant quand le volume n'est pas joignable", () => {
    const repli = join(neuf(), "repli");
    const avertissements: string[] = [];
    const cache = ouvrirCache({
      dossier: injoignable(),
      repli,
      avertir: (message) => avertissements.push(message),
    });
    expect(cache.replie).toBe(true);
    expect(cache.dossier).toBe(repli);
    expect(cache.plafond).toBe(PLAFOND_REPLI);
    expect(avertissements[0], "l'avertissement nomme les deux dossiers").toContain(repli);
    expect(avertissements[0]).toContain("n'est pas joignable");
  });

  it("échoue avant de commencer, jamais au milieu, quand rien n'est utilisable", () => {
    expect(() =>
      ouvrirCache({
        dossier: injoignable(),
        repli: injoignable(),
        avertir: () => {},
      }),
    ).toThrow(/Aucun cache utilisable/);
  });

  it("le dossier par défaut contient une espace : tout chemin qui le traverse se cite", () => {
    expect(CACHE_PAR_DEFAUT).toContain(" ");
  });

  it("plafonds : cinquante gibioctets au principal, deux au repli", () => {
    expect(PLAFOND_PAR_DEFAUT).toBe(50 * 1024 ** 3);
    expect(PLAFOND_REPLI).toBe(2 * 1024 ** 3);
  });
});

describe("coins du cache", () => {
  it("crée le coin demandé et le rend", () => {
    const cache = ouvrirCache({ dossier: join(neuf(), "cache"), avertir: () => {} });
    const lectures = coin(cache, "lectures");
    expect(existsSync(lectures)).toBe(true);
    expect(coin(cache, "lectures"), "deux appels, un seul coin").toBe(lectures);
  });
});

describe("pesée et nettoyage", () => {
  it("pèse ce que le cache contient, sous-dossiers compris", () => {
    const cache = ouvrirCache({ dossier: join(neuf(), "cache"), avertir: () => {} });
    poser(cache.dossier, "a.bin", 1000);
    poser(coin(cache, "images"), "b.bin", 2000);
    expect(peser(cache.dossier)).toEqual({ octets: 3000, fichiers: 2 });
  });

  it("ne pèse rien sur un dossier absent", () => {
    expect(peser(join(neuf(), "jamais-créé"))).toEqual({ octets: 0, fichiers: 0 });
  });

  it("retire le plus ancien jusqu'à repasser sous le plafond", () => {
    const cache = ouvrirCache({ dossier: join(neuf(), "cache"), avertir: () => {} });
    const base = Date.now() - 100_000;
    poser(cache.dossier, "vieux.bin", 1000, base);
    poser(cache.dossier, "moyen.bin", 1000, base + 10_000);
    poser(cache.dossier, "recent.bin", 1000, base + 20_000);

    const libere = nettoyer(cache, 1500);
    expect(libere.fichiers).toBe(2);
    expect(libere.octets).toBe(2000);
    expect(readdirSync(cache.dossier), "le plus récent reste").toEqual(["recent.bin"]);
  });

  it("ne retire rien quand le plafond est tenu", () => {
    const cache = ouvrirCache({ dossier: join(neuf(), "cache"), avertir: () => {} });
    poser(cache.dossier, "a.bin", 500);
    expect(nettoyer(cache, 10_000)).toEqual({ octets: 0, fichiers: 0 });
    expect(readdirSync(cache.dossier)).toEqual(["a.bin"]);
  });

  it("vide un coin de fond en comble, et le laisse utilisable", () => {
    const cache = ouvrirCache({ dossier: join(neuf(), "cache"), avertir: () => {} });
    const images = coin(cache, "images");
    poser(images, "a.pgm", 10);
    poser(images, "b.pgm", 10);
    vider(images);
    expect(existsSync(images)).toBe(true);
    expect(readdirSync(images)).toEqual([]);
  });
});
