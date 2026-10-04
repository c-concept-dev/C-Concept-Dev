// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { coin, ouvrirCache } from "@lienotheque/cache";
import { chargerRecette, comparer, interpreter, lireLot, mediasDuDossier, rejouer, releverCoucheTexte } from "../src/index.js";
import { tesseractDisponible } from "@lienotheque/lecteur-texte";

/** Lire trois cents pages prend un quart d'heure : on garde les lectures entre deux exécutions.
 *  Le cache ne contient que des numéros et des positions — rien du document lui-même. */
const CACHE = coin(ouvrirCache({ avertir: (message) => console.warn(message) }), "lectures");

/** Banc d'essai (OUT-15) : rejoue les fixtures et compare à la référence.
 *
 *  Fixtures sous droits, présentes sur la machine de développement seulement : ces contrôles se
 *  sautent proprement ailleurs. La référence de F3 est la sortie du prototype Python, qui fait
 *  foi — le port doit l'égaler, pas l'approcher (REC-06). */

const RACINE = join(import.meta.dirname, "../../..");
const F1 = join(RACINE, "fixtures/fichiers/F1/aebersold-FRENCH.pdf");
const F3 = join(RACINE, "fixtures/fichiers/F3/'70s Funk & Disco Bass.pdf");
const F3_MEDIAS = join(RACINE, "fixtures/fichiers/F3");

const RECETTE = chargerRecette(JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-pastille-piste.v2.json"), "utf8")));

type Reference = {
  readonly appariements: readonly { exercice: number; piste: number; page_imprimee: number }[];
  readonly mp3_orphelins: readonly number[];
  readonly pages_absentes_du_scan: readonly number[][];
};
const REFERENCE_F3 = join(RACINE, "docs/prototypes/70s_Funk_Disco_appariement_mp3.json");

const siF3 = existsSync(F3) && existsSync(REFERENCE_F3) && tesseractDisponible() ? it : it.skip;
const siF1 = existsSync(F1) ? it : it.skip;

describe("rejeu de F1, PDF natif (OUT-15)", () => {
  siF1(
    "retrouve la couche texte relevée, page par page",
    async () => {
      const reference = JSON.parse(readFileSync(join(RACINE, "fixtures/references/F1-couche-texte.json"), "utf8")) as {
        empreinte: string;
        pages: number;
        caracteres: number;
        pagesAvecTexte: number;
        detail: { index: number; caracteres: number; mots: number; empreinteTexte: string }[];
      };
      const releve = await releverCoucheTexte(F1);

      expect(releve.empreinte, "la fixture est bien celle qui a servi à relever").toBe(reference.empreinte);
      expect(releve.pages).toBe(reference.pages);
      expect(releve.pagesAvecTexte).toBe(reference.pagesAvecTexte);
      expect(releve.caracteres).toBe(reference.caracteres);
      expect(releve.detail).toEqual(reference.detail);
    },
    600_000,
  );
});

describe("rejeu de F3, méthode numérisée (OUT-15, REC-06, critère F3)", () => {
  siF3(
    "relie les 95 éléments à la bonne piste, repère les deux pages absentes et les six médias sans page",
    async () => {
      const reference = JSON.parse(readFileSync(REFERENCE_F3, "utf8")) as Reference;
      const { resultat, association } = await rejouer(F3, F3_MEDIAS, RECETTE, { cache: CACHE });

      const score = comparer(
        resultat.lignes,
        reference.appariements.map((appariement) => ({ numero: appariement.exercice, piste: appariement.piste })),
      );
      expect(score.fautifs, "aucun élément relié à la mauvaise piste").toEqual([]);
      expect(score.manquants, "aucun élément perdu").toEqual([]);
      expect(score.justes, `${score.justes}/${score.attendus} éléments à la bonne piste`).toBe(score.attendus);
      expect(score.attendus).toBe(95);

      // Les pages 30 et 31 ne sont pas dans le lot : la numérotation le dit, elle ne le masque pas.
      expect(resultat.pagesAbsentes).toEqual(reference.pages_absentes_du_scan.flat());
      expect(resultat.pagesAbsentes).toEqual([30, 31]);

      // Les six médias que portaient ces pages n'ont donc aucune page : on les signale.
      expect(association.orphelins).toEqual([...reference.mp3_orphelins]);
      expect(association.orphelins).toEqual([93, 94, 95, 96, 97, 98]);

      // Et chaque élément tombe sur la page que le prototype lui donnait.
      const pagesAttendues = new Map(reference.appariements.map((a) => [a.exercice, a.page_imprimee]));
      for (const ligne of resultat.lignes)
        expect(ligne.pageImprimee, `élément ${ligne.numero}`).toBe(pagesAttendues.get(ligne.numero));

      expect(resultat.ecartes, "aucun élément écarté").toEqual([]);
      expect(association.appariements.filter((a) => a.statut === "auto")).toHaveLength(95);
      expect(association.manquants, "aucune piste réclamée sans média").toEqual([]);
      expect(resultat.recette).toEqual({ id: "methode-pastille-piste", version: 2 });
    },
    3_600_000,
  );

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
