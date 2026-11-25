// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NOM_DU_CACHE, PLAFOND_PAR_DEFAUT, cacheParDefaut, coin, nettoyer, ouvrirCache, peser } from "../src/index.js";

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

/** Où le cache vit, depuis le lot `0z undecies` (PLT-02).
 *
 *  Trois choses se jugent ici, et chacune a coûté quelque chose avant d'être écrite.
 *
 *  **Le défaut est celui de la plateforme.** Il était en dur vers `/Volumes/Macbook Pro/…`, un
 *  volume débranchable : chaque course sans ce volume se repliait, et le repli écrivait **dans la
 *  copie de travail**. Sur une machine d'intégration continue, qui n'a aucun `/Volumes`, c'était
 *  toutes les courses.
 *
 *  **Un dossier déclaré et introuvable refuse.** Choisir à la place de la personne qui a nommé un
 *  dossier, c'est travailler ailleurs qu'où elle l'a dit sans qu'elle le sache — et c'est
 *  exactement ce qui a fait perdre 877 s au contrôle du 24 novembre 2026, en relisant des pages
 *  qu'un cache démonté portait déjà.
 *
 *  **La plateforme et l'environnement sont des paramètres, pas des variables qu'on écrit.**
 *  `process.env` et `process.platform` sont globaux au processus : deux contrôles en parallèle se
 *  les disputeraient. Ils entrent donc par `Reglages`, et les trois systèmes s'éprouvent depuis
 *  un seul.
 *
 *  Ce qui n'est **pas** jugé ici : le séparateur de chemin. C'est le travail de `path.join`, juste
 *  par construction sur chaque hôte ; ce qui peut être faux, et qu'on juge, c'est **quel dossier
 *  de base** et **quel nom** la convention demande. */
describe("où le cache vit (PLT-02)", () => {
  it("PLT-02 : le défaut est le dossier de cache du système, sur chacune des trois plateformes", () => {
    expect(cacheParDefaut("darwin", { HOME: "/Users/une-personne" })).toBe(
      join("/Users/une-personne", "Library", "Caches", NOM_DU_CACHE),
    );
    expect(cacheParDefaut("linux", { HOME: "/home/une-personne" })).toBe(
      join("/home/une-personne", ".cache", NOM_DU_CACHE),
    );
    expect(
      cacheParDefaut("linux", { HOME: "/home/une-personne", XDG_CACHE_HOME: "/ailleurs/caches" }),
      "la convention XDG passe devant le défaut qu'elle porte",
    ).toBe(join("/ailleurs/caches", NOM_DU_CACHE));
    // Windows est suspendu, pas abandonné : son chemin est conservé, donc éprouvé.
    expect(cacheParDefaut("win32", { LOCALAPPDATA: "C:\\Users\\p\\AppData\\Local" })).toBe(
      join("C:\\Users\\p\\AppData\\Local", NOM_DU_CACHE, "cache"),
    );
    expect(
      cacheParDefaut("win32", { USERPROFILE: "C:\\Users\\p" }),
      "sans LOCALAPPDATA, la place que Windows lui donne",
    ).toBe(join("C:\\Users\\p", "AppData", "Local", NOM_DU_CACHE, "cache"));
  });

  it("PLT-02 : connaître le défaut ne crée rien sur le disque", () => {
    const maison = neuf();
    const attendu = cacheParDefaut("linux", { HOME: maison });
    expect(existsSync(attendu), "savoir où il irait n'est pas y aller").toBe(false);
  });

  it("PLT-02 : sans rien de déclaré, le cache ouvert est celui du système", () => {
    const maison = neuf();
    const cache = ouvrirCache({ plateforme: "linux", environnement: { HOME: maison } });
    expect(cache.dossier).toBe(join(maison, ".cache", NOM_DU_CACHE));
    expect(existsSync(cache.dossier), "celui-là, on l'ouvre, donc on le crée").toBe(true);
    expect(cache.plafond).toBe(PLAFOND_PAR_DEFAUT);
  });

  it("PLT-02 : un dossier déclaré en réglage et joignable est pris tel quel", () => {
    const voulu = join(neuf(), "cache");
    const cache = ouvrirCache({ dossier: voulu });
    expect(cache.dossier).toBe(voulu);
    expect(existsSync(voulu), "le dossier est créé").toBe(true);
  });

  it("PLT-02 : LIENOTHEQUE_CACHE passe devant le dossier du système", () => {
    const voulu = join(neuf(), "declare");
    const cache = ouvrirCache({ plateforme: "linux", environnement: { HOME: neuf(), LIENOTHEQUE_CACHE: voulu } });
    expect(cache.dossier).toBe(voulu);
  });

  /** **Le cœur du lot.** Un dossier nommé et absent est une erreur ou un volume démonté : on le
   *  dit, on ne choisit pas ailleurs. */
  it("PLT-02 : un dossier déclaré et introuvable refuse, avant tout traitement, et le nomme", () => {
    const absent = injoignable();
    let attrape: unknown;
    try {
      ouvrirCache({ dossier: absent });
    } catch (souci) {
      attrape = souci;
    }
    expect(attrape, "il refuse, il ne rend pas un cache ailleurs").toBeInstanceOf(Error);
    const message = (attrape as Error).message;
    expect(message).toContain("Cache déclaré introuvable");
    expect(message, "le dossier qu'il n'a pas pu ouvrir est nommé").toContain(absent);
    expect(message, "et la personne sait quoi faire").toMatch(/retirez la déclaration/);
  });

  it("PLT-02 : déclaré par l'environnement et introuvable, il refuse de la même façon", () => {
    const absent = injoignable();
    expect(() =>
      ouvrirCache({ plateforme: "linux", environnement: { HOME: neuf(), LIENOTHEQUE_CACHE: absent } }),
    ).toThrow(/Cache déclaré introuvable/);
  });

  it("PLT-02 : un dossier déclaré et introuvable n'ouvre PAS le dossier du système à la place", () => {
    const maison = neuf();
    const systeme = cacheParDefaut("linux", { HOME: maison });
    expect(() =>
      ouvrirCache({ plateforme: "linux", environnement: { HOME: maison, LIENOTHEQUE_CACHE: injoignable() } }),
    ).toThrow();
    expect(existsSync(systeme), "le refus n'a rien créé ailleurs").toBe(false);
  });

  /** Le repli supprimé, jugé sur le comportement et sur le texte.
   *
   *  Sur le comportement, parce qu'un défaut qui tomberait sous la copie de travail la salirait
   *  sans que personne le voie. Sur le texte, parce que le repli était **une seule ligne** —
   *  `join(process.cwd(), ".cache")` — et qu'une ligne se remet en une seconde. */
  it("PLT-02 : aucun chemin de la copie de travail n'est jamais choisi", () => {
    const travail = process.cwd();
    for (const [plateforme, environnement] of [
      ["darwin", { HOME: "/Users/p" }],
      ["linux", { HOME: "/home/p" }],
      ["win32", { LOCALAPPDATA: "C:\\Users\\p\\AppData\\Local" }],
    ] as const)
      expect(cacheParDefaut(plateforme, environnement), `${plateforme} : hors de la copie de travail`).not.toContain(
        travail,
      );
    expect(ouvrirCache({ plateforme: "linux", environnement: { HOME: neuf() } }).dossier).not.toContain(travail);
  });

  it("PLT-02 : le module ne connaît plus le dossier courant, ni aucun volume en dur", () => {
    const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    const code = source
      .split("\n")
      .filter((ligne) => !/^\s*(?:\*|\/\/|\/\*)/u.test(ligne))
      .join("\n");
    expect(code, "le repli dans la copie de travail passait par là").not.toContain("cwd(");
    expect(code, "plus aucun chemin de volume en dur").not.toContain("/Volumes");
  });

  it("PLT-02 : plafond du cache, cinquante gibioctets — porté, pas encore appliqué", () => {
    expect(PLAFOND_PAR_DEFAUT).toBe(50 * 1024 ** 3);
  });
});

describe("coins du cache", () => {
  it("crée le coin demandé et le rend", () => {
    const cache = ouvrirCache({ dossier: join(neuf(), "cache") });
    const lectures = coin(cache, "lectures");
    expect(existsSync(lectures)).toBe(true);
    expect(coin(cache, "lectures"), "deux appels, un seul coin").toBe(lectures);
  });
});

describe("pesée et nettoyage", () => {
  it("pèse ce que le cache contient, sous-dossiers compris", () => {
    const cache = ouvrirCache({ dossier: join(neuf(), "cache") });
    poser(cache.dossier, "a.bin", 1000);
    poser(coin(cache, "images"), "b.bin", 2000);
    expect(peser(cache.dossier)).toEqual({ octets: 3000, fichiers: 2 });
  });

  it("ne pèse rien sur un dossier absent", () => {
    expect(peser(join(neuf(), "jamais-créé"))).toEqual({ octets: 0, fichiers: 0 });
  });

  it("retire le plus ancien jusqu'à repasser sous le plafond", () => {
    const cache = ouvrirCache({ dossier: join(neuf(), "cache") });
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
    const cache = ouvrirCache({ dossier: join(neuf(), "cache") });
    poser(cache.dossier, "a.bin", 500);
    expect(nettoyer(cache, 10_000)).toEqual({ octets: 0, fichiers: 0 });
    expect(readdirSync(cache.dossier)).toEqual(["a.bin"]);
  });
});
