// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { coin, ouvrirCache } from "@lienotheque/cache";
import { chargerRecette, interpreter, lireLot, mediasDuDossier } from "../src/index.js";
import { tesseractDisponible } from "@lienotheque/lecteur-texte";

/** Lire trois cents pages prend un quart d'heure : on garde les lectures entre deux exécutions.
 *  Le cache ne contient que des numéros et des positions — rien du document lui-même. */
const CACHE = coin(ouvrirCache({ avertir: (message) => console.warn(message) }), "lectures");

/** Banc d'essai (OUT-15) : rejoue les fixtures et compare à la référence.
 *
 *  Fixtures sous droits, présentes sur la machine de développement seulement : ces contrôles se
 *  sautent proprement ailleurs. */

const RACINE = join(import.meta.dirname, "../../..");
const F3 = join(RACINE, "fixtures/fichiers/F3/'70s Funk & Disco Bass.pdf");
const F3_MEDIAS = join(RACINE, "fixtures/fichiers/F3");

const RECETTE = chargerRecette(JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-pastille-piste.v2.json"), "utf8")));

const REFERENCE_F3 = join(RACINE, "docs/prototypes/70s_Funk_Disco_appariement_mp3.json");

const siF3 = existsSync(F3) && existsSync(REFERENCE_F3) && tesseractDisponible() ? it : it.skip;

/** Ce que le banc sait faire, éprouvé sur F3. Le critère du corpus, lui, se mesure à la porte de
 *  l'application — `outils/ingestion/test/criteres.test.ts` — et nulle part ailleurs : deux
 *  mesures d'un même critère finissent par diverger. */
describe("lecture et association d'un lot numérisé (OUT-15)", () => {
  siF3(
    "rejoué deux fois, rend exactement le même résultat (REC-02)",
    async () => {
      // Quatre pages suffisent à éprouver le déterminisme de bout en bout, OCR compris.
      const lues = await lireLot(F3, RECETTE, { pages: 4, cache: CACHE });
      const premier = interpreter(lues, RECETTE);
      const second = interpreter(lues, RECETTE);
      expect(JSON.stringify(second)).toBe(JSON.stringify(premier));
      expect(premier.lignes.length).toBeGreaterThan(8);
    },
    1_800_000,
  );

  siF3(
    "retrouve les 99 médias sous leurs noms d'origine, dans leur sous-dossier",
    async () => {
      const medias = await mediasDuDossier(F3_MEDIAS);
      expect(medias).toHaveLength(99);
      expect(medias.map((media) => media.piste)).toEqual(Array.from({ length: 99 }, (_, rang) => rang + 1));
      // Rien n'est renommé : le nom d'origine, espaces compris, reste tel quel.
      expect(medias[44]?.nom).toBe("Track 45.mp3");
      expect(new Set(medias.map((media) => media.empreinte)).size, "99 fichiers distincts").toBe(99);
    },
    600_000,
  );
});

describe("cache de lecture (décision 4)", () => {
  it("désigne le document et la recette, et change si l'un des deux change", async () => {
    const { clefDeLecture } = await import("../src/index.js");
    if (!existsSync(F3)) return;
    const v2 = RECETTE;
    const v1 = chargerRecette(JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-pastille-piste.v1.json"), "utf8")));
    expect(clefDeLecture(F3, v2)).toBe(clefDeLecture(F3, v2));
    expect(clefDeLecture(F3, v1), "une autre version de recette, une autre lecture").not.toBe(clefDeLecture(F3, v2));
    expect(clefDeLecture(F3, v2, 4), "un lot tronqué n'est pas le lot entier").not.toBe(clefDeLecture(F3, v2));
  });
});
