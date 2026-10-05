// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PageLueBrute } from "@lienotheque/contrats";
import { ecrireCache, lireCache } from "../src/index.js";

/** Le cache de lecture : ce qu'il garde, et ce qu'il refuse de rendre.
 *
 *  Lire un lot de F4 prend cinquante minutes. Le cache les épargne — mais une entrée à moitié
 *  écrite, servie comme si elle était complète, coûterait bien plus que le temps qu'il fait
 *  gagner : elle rendrait une mesure fausse sans que rien ne le dise. */

const dossiers: string[] = [];
afterEach(() => {
  for (const dossier of dossiers.splice(0)) rmSync(dossier, { recursive: true, force: true });
});

const dossierNeuf = (): string => {
  const dossier = mkdtempSync(join(tmpdir(), "lienotheque-cache-"));
  dossiers.push(dossier);
  return dossier;
};

const page = (index: number) => ({
  index,
  rang: index,
  cote: "gauche" as const,
  pageLue: 60 + index,
  elements: [
    { y: 0.2, numero: 100 + index, pisteLue: 10 + index, presencePiste: 0.9, suite: false, accordNumero: 1, accordPiste: 1 },
  ],
});

describe("une entrée complète se relit telle quelle", () => {
  it("rend ce qui a été écrit", () => {
    const fichier = join(dossierNeuf(), "lot.json");
    const lues = [page(1), page(2)].map((p) => PageLueBrute.parse(p));
    ecrireCache(fichier, lues as never);
    expect(lireCache(fichier)).toEqual(lues);
  });

  it("rend « rien » quand il n'y a rien, sans se plaindre", () => {
    expect(lireCache(join(dossierNeuf(), "absent.json"))).toBeUndefined();
  });
});

describe("l'écriture ne laisse jamais d'entrée à moitié", () => {
  it("passe par un fichier temporaire, puis renomme", () => {
    const dossier = dossierNeuf();
    const fichier = join(dossier, "lot.json");
    ecrireCache(fichier, [PageLueBrute.parse(page(1))] as never);

    // Le renommage est atomique sur un même système de fichiers : ou l'entrée est là entière,
    // ou elle n'est pas là. Et rien ne traîne après coup.
    expect(existsSync(fichier)).toBe(true);
    expect(readdirSync(dossier).filter((nom) => nom.endsWith(".tmp")), "aucun temporaire laissé").toEqual([]);
  });

  it("ne laisse rien derrière lui quand l'écriture échoue", () => {
    const dossier = dossierNeuf();
    // Un chemin impossible : le dossier parent n'existe pas.
    const fichier = join(dossier, "absent", "lot.json");
    expect(() => ecrireCache(fichier, [PageLueBrute.parse(page(1))] as never), "une écriture refusée n'arrête rien").not.toThrow();
    expect(existsSync(fichier)).toBe(false);
    expect(readdirSync(dossier), "ni entrée, ni temporaire").toEqual([]);
  });

  it("deux écritures côte à côte ne se marchent pas dessus", () => {
    // Le temporaire porte le numéro du processus : il ne peut pas être celui d'un autre.
    const dossier = dossierNeuf();
    const fichier = join(dossier, "lot.json");
    ecrireCache(fichier, [PageLueBrute.parse(page(1))] as never);
    ecrireCache(fichier, [PageLueBrute.parse(page(2))] as never);
    expect(lireCache(fichier)?.[0]?.index).toBe(2);
    expect(readdirSync(dossier)).toEqual(["lot.json"]);
  });
});

describe("une entrée douteuse est relue, jamais servie", () => {
  const abimer = (contenu: string): string => {
    const fichier = join(dossierNeuf(), "lot.json");
    writeFileSync(fichier, contenu);
    return fichier;
  };

  it("refuse une entrée tronquée au milieu", () => {
    const entier = JSON.stringify([page(1), page(2)]);
    const fichier = abimer(entier.slice(0, Math.floor(entier.length / 2)));
    expect(lireCache(fichier)).toBeUndefined();
  });

  it("refuse du JSON valide qui n'est pas une lecture", () => {
    // C'est ce que `JSON.parse` seul laissait passer : la forme n'était jamais vérifiée.
    expect(lireCache(abimer('{"bonjour": true}'))).toBeUndefined();
    expect(lireCache(abimer("[1, 2, 3]"))).toBeUndefined();
    expect(lireCache(abimer('[{"index": 1}]')), "une page sans ses éléments n'est pas une page lue").toBeUndefined();
  });

  it("refuse une entrée vide", () => {
    expect(lireCache(abimer(""))).toBeUndefined();
  });

  it("retire l'entrée refusée, pour ne pas buter dessus à chaque fois", () => {
    const fichier = abimer("ceci n'est pas du JSON");
    expect(lireCache(fichier)).toBeUndefined();
    expect(existsSync(fichier), "l'entrée fautive est écartée").toBe(false);
  });

  it("et la relecture suivante peut la remplacer", () => {
    const fichier = abimer("tronqué");
    expect(lireCache(fichier)).toBeUndefined();
    const lues = [PageLueBrute.parse(page(7))];
    ecrireCache(fichier, lues as never);
    expect(lireCache(fichier)).toEqual(lues);
  });
});

describe("ce que le cache garde, et ce qu'il ne garde pas", () => {
  it("des numéros et des positions, jamais un extrait du document", () => {
    const fichier = join(dossierNeuf(), "lot.json");
    ecrireCache(fichier, [PageLueBrute.parse(page(1))] as never);
    const brut = readFileSync(fichier, "utf8");
    // Le contrat est « strict » : rien d'autre que ces champs ne peut y entrer, et donc aucun
    // pixel ni texte du document sous droits.
    expect(Object.keys(JSON.parse(brut)[0]).sort()).toEqual(["cote", "elements", "index", "pageLue", "rang"]);
  });
});
