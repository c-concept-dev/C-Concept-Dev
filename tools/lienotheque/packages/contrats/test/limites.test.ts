import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BATTEMENT_VERROU_S,
  DELAI_ARRET_PROPRE_S,
  DELAI_ENTRE_TENTATIVES_S,
  TENTATIVES_MAX,
  EXPIRATION_VERROU_S,
  MEMOIRE_MAX_MO,
  TRAVAUX_LOURDS_SIMULTANES,
  VERSION_PROTOCOLE,
} from "../src/index.js";

/** Les limites d'exécution sont une donnée, pas du code (PLT-02, JOB-02).
 *
 *  Elles vivent dans `limites.json`, que le TypeScript lit par import et l'hôte Rust par
 *  `include_str!`. Ce contrôle garde deux choses : que le fichier a la forme attendue, et que
 *  personne n'a recopié une de ces valeurs ailleurs — la recopie est la panne, pas l'écart. */

const RACINE = join(import.meta.dirname, "../../..");
const FICHIER = join(RACINE, "packages/contrats/limites.json");

const Limites = z
  .object({
    _lisez_moi: z.string().min(1),
    protocole: z.number().int().positive(),
    travauxLourdsSimultanes: z.number().int().positive(),
    memoireMaxMo: z.number().int().positive(),
    delaiArretPropreS: z.number().int().positive(),
    battementVerrouS: z.number().int().positive(),
    expirationVerrouS: z.number().int().positive(),
    tentativesMax: z.number().int().positive(),
    delaiEntreTentativesS: z.number().int().positive(),
  })
  .strict();

describe("le fichier des limites", () => {
  const brut: unknown = JSON.parse(readFileSync(FICHIER, "utf8"));

  it("a exactement la forme attendue, sans champ en trop ni manquant", () => {
    expect(Limites.safeParse(brut).success).toBe(true);
  });

  it("est ce que le TypeScript expose : aucune valeur n'est réécrite en chemin", () => {
    const limites = Limites.parse(brut);
    expect(VERSION_PROTOCOLE).toBe(limites.protocole);
    expect(TRAVAUX_LOURDS_SIMULTANES).toBe(limites.travauxLourdsSimultanes);
    expect(MEMOIRE_MAX_MO).toBe(limites.memoireMaxMo);
    expect(DELAI_ARRET_PROPRE_S).toBe(limites.delaiArretPropreS);
    expect(BATTEMENT_VERROU_S).toBe(limites.battementVerrouS);
    expect(EXPIRATION_VERROU_S).toBe(limites.expirationVerrouS);
    expect(TENTATIVES_MAX).toBe(limites.tentativesMax);
    expect(DELAI_ENTRE_TENTATIVES_S).toBe(limites.delaiEntreTentativesS);
  });

  it("laisse deux battements de marge avant qu'un bail n'expire (JOB-02)", () => {
    // Un battement manqué ne doit pas suffire à faire voler son verrou à un travail bien vivant.
    expect(EXPIRATION_VERROU_S).toBeGreaterThan(BATTEMENT_VERROU_S * 2);
  });

  it("laisse plus d'une tentative, sinon « récupérable » ne veut rien dire", () => {
    expect(TENTATIVES_MAX).toBeGreaterThan(1);
  });

  it("laisse au délai le temps d'être utile : plus long qu'un battement de bail", () => {
    // Un délai plus court que le bail ferait repartir le travail avant même que le processus
    // précédent ait fini de mourir.
    expect(DELAI_ENTRE_TENTATIVES_S).toBeGreaterThan(EXPIRATION_VERROU_S);
  });

  it("plafonne la mémoire au-dessus de la marque haute observée", () => {
    // 1,1 Go relevé sur F3 : le plafond est un garde-fou, pas un budget.
    expect(MEMOIRE_MAX_MO).toBeGreaterThan(1100);
  });
});

describe("personne ne recopie une limite", () => {
  /** Les fichiers où une valeur recopiée serait une seconde vérité. On lit le dépôt plutôt que
   *  de tenir une liste : un fichier ajouté demain est couvert sans qu'on y pense. */
  const sources = [
    "packages/contrats/src",
    "packages/noyau/src",
    "outils/ingestion/src",
    "apps/app/src-tauri/src",
  ];

  it("ni dans le TypeScript du noyau, ni dans le Rust de l'hôte", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const fichiers: string[] = [];
    const parcourir = (dossier: string): void => {
      for (const entree of readdirSync(dossier)) {
        const chemin = join(dossier, entree);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (/\.(ts|rs)$/.test(entree)) fichiers.push(chemin);
      }
    };
    for (const source of sources) {
      const dossier = join(RACINE, source);
      try {
        parcourir(dossier);
      } catch {
        // Un paquet absent de cette copie du dépôt n'est pas une faute : on ne contrôle que ce
        // qui est là.
      }
    }

    const fautifs: string[] = [];
    for (const fichier of fichiers) {
      const texte = readFileSync(fichier, "utf8");
      for (const ligne of texte.split("\n")) {
        // Une déclaration de constante qui porte un nombre : c'est la forme qu'aurait une recopie.
        const recopie =
          /^\s*(?:pub\s+)?const\s+(BATTEMENT|EXPIRATION|MEMOIRE_MAX|DELAI_ARRET|DELAI_ENTRE|TENTATIVES_MAX|TRAVAUX_LOURDS|VERSION_PROTOCOLE)[A-Z_]*\s*(?::[^=]+)?=\s*\d/.test(
            ligne,
          );
        if (recopie) fautifs.push(`${fichier.slice(RACINE.length + 1)} : ${ligne.trim()}`);
      }
    }
    expect(fautifs, "ces valeurs viennent de limites.json, jamais d'un littéral").toEqual([]);
  });
});
