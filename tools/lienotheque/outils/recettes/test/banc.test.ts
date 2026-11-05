// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { coin, ouvrirCache } from "@lienotheque/cache";
import {
  chargerRecette,
  ciblesStructurellesAttendues,
  comparer,
  completerResultatParCiblesValidees,
  fondDesPages,
  integrerCiblesValidees,
  interpreter,
  lireLot,
  mediasDeLInventaire,
  mediasDuDossier,
  retenirCiblesValidees,
} from "../src/index.js";
import { tesseractDisponible } from "@lienotheque/lecteur-texte";
import { ResultatRecette } from "@lienotheque/contrats";

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

describe("inventaire portable des médias (REC-05, ANC-05)", () => {
  it("lit le rang dans le nom d'origine, jamais dans le nom de rangement", () => {
    const medias = mediasDeLInventaire([
      {
        nom: "Piste 07.mp3",
        empreinte: "f".repeat(64),
      },
    ]);
    expect(medias).toEqual([{ piste: 7, nom: "Piste 07.mp3", empreinte: "f".repeat(64) }]);
  });

  it("conserve le support porté par les sous-dossiers CD1 et CD2 d'un ZIP (C9.1)", () => {
    const medias = mediasDeLInventaire([
      { nom: "CD1/Piste 03.mp3", empreinte: "a".repeat(64) },
      { nom: "CD2/Piste 03.mp3", empreinte: "b".repeat(64) },
    ]);
    expect(medias).toEqual([
      { piste: 3, disque: 1, nom: "CD1/Piste 03.mp3", empreinte: "a".repeat(64) },
      { piste: 3, disque: 2, nom: "CD2/Piste 03.mp3", empreinte: "b".repeat(64) },
    ]);
  });
});

describe("comparateur strict du banc de vérité terrain (OUT-15)", () => {
  it("signale une association produite en plus de la référence", () => {
    const score = comparer(
      [
        { numero: 1, piste: 10 },
        { numero: 2, piste: 20 },
      ],
      [{ numero: 1, piste: 10 }],
    );

    expect(score.justes).toBe(1);
    expect(score.supplementaires).toEqual([{ numero: 2, piste: 20 }]);
  });

  it("ne masque pas un doublon produit sous le même numéro qu'une association juste", () => {
    const score = comparer(
      [
        { numero: 1, piste: 10 },
        { numero: 1, piste: 11 },
      ],
      [{ numero: 1, piste: 10 }],
    );

    expect(score.justes).toBe(1);
    expect(score.supplementaires).toEqual([{ numero: 1, piste: 11 }]);
  });

  /** Un lien peut être juste par le numéro et faux par la page (OUT-15).
   *
   *  Mesuré le 29 octobre 2026 sur un recueil de cinquante-deux éléments. Ceux-ci portaient le
   *  bon numéro et la bonne piste, et tombaient tous **une page trop tôt** : la page qui ouvre un
   *  élément et porte sa pastille n'avait aucun son, et la suivante — encore le même élément —
   *  renvoyait à la piste du suivant. L'oracle annonçait cinquante-deux sur cinquante-deux.
   *
   *  Il l'annonçait de bonne foi : il comparait le numéro à la piste, et cette correspondance-là
   *  était exacte. Ce qu'il ne regardait pas, c'est **où** le lien était posé. Un oracle aveugle à
   *  la page ne peut pas voir un décalage de page, et le score reste vert pendant que le produit
   *  renvoie au mauvais exercice. */
  it("OUT-15 : un élément posé sur la mauvaise page ne compte pas comme juste", () => {
    const score = comparer(
      [{ numero: 3, piste: 3, pageImprimee: 9 }],
      [{ numero: 3, piste: 3, pageImprimee: 10 }],
    );

    expect(score.justes).toBe(0);
    expect(score.decales).toEqual([{ numero: 3, piste: 3, attendue: 10, obtenue: 9 }]);
  });

  it("OUT-15 : le même élément sur la bonne page compte comme juste", () => {
    const score = comparer(
      [{ numero: 3, piste: 3, pageImprimee: 10 }],
      [{ numero: 3, piste: 3, pageImprimee: 10 }],
    );

    expect(score.justes).toBe(1);
    expect(score.decales).toEqual([]);
  });

  /** Une référence qui ne nomme pas de page ne juge pas la page : les oracles anciens, écrits en
   *  paires numéro-piste, gardent exactement le sens qu'ils avaient. */
  it("OUT-15 : une référence sans page ne juge pas la page", () => {
    const score = comparer([{ numero: 3, piste: 3, pageImprimee: 9 }], [{ numero: 3, piste: 3 }]);

    expect(score.justes).toBe(1);
    expect(score.decales).toEqual([]);
  });

  /** En revanche, une référence qui nomme une page face à un rejeu qui n'en porte aucune ne peut
   *  pas être déclarée juste : on ne sait pas. Et « on ne sait pas » n'est pas « c'est bon ». */
  it("OUT-15 : une ligne sans page ne satisfait pas une référence qui en nomme une", () => {
    const score = comparer([{ numero: 3, piste: 3 }], [{ numero: 3, piste: 3, pageImprimee: 10 }]);

    expect(score.justes).toBe(0);
  });

  /** Un score ne vaut que le terrain sur lequel il repose (OUT-15).
   *
   *  Relevé du 29 octobre 2026, sur deux documents de la même bibliothèque :
   *
   *  | | folios lus | statuts |
   *  |---|---:|---|
   *  | un recueil de vingt-neuf pages | **29 sur 29** | 26 lues, 2 déduites |
   *  | un recueil de cinquante-deux éléments | **0 sur 115** | 114 déduites |
   *
   *  Le second annonçait cinquante-deux associations justes sur cinquante-deux. Il n'avait pas lu
   *  un seul numéro de page. */
  it("OUT-15 : une numérotation sans un seul folio lu n'est pas ancrée", () => {
    const fond = fondDesPages([
      { statut: "couverture" },
      ...Array.from({ length: 114 }, () => ({ statut: "deduite" })),
    ]);

    expect(fond.ancree).toBe(false);
    expect(fond.lues).toBe(0);
    expect(fond.deduites).toBe(114);
    expect(fond.pourquoi).toContain("supposée");
  });

  it("OUT-15 : un seul folio lu ancre la numérotation", () => {
    const fond = fondDesPages([
      { statut: "couverture" },
      { statut: "lue", pageLue: 8 },
      { statut: "deduite" },
    ]);

    expect(fond.ancree).toBe(true);
    expect(fond.lues).toBe(1);
  });

  it("OUT-15 : la part réellement lue est rendue, pour qui veut être plus exigeant", () => {
    const fond = fondDesPages([
      { statut: "lue", pageLue: 1 },
      { statut: "lue", pageLue: 2 },
      { statut: "deduite" },
    ]);

    expect(fond.lues).toBe(2);
    expect(fond.pages).toBe(3);
    expect(fond.pourquoi).toContain("ancrée");
  });

  it("interdit l'injection de validations ciblées dans le rejeu C9.3 normal", () => {
    const banc = readFileSync(join(import.meta.dirname, "../mesures/c9-3-cinq-methodes.ts"), "utf8");
    expect(banc).not.toContain("LIENOTHEQUE_VALIDATIONS_CIBLES");
    expect(banc).not.toContain("ciblesValideesPour");
  });
});

describe("repli structurel validé", () => {
  it("ne demande que les trous bornés par deux lectures de la même page", () => {
    const pages = [
      {
        feuille: 72,
        elements: [
          { y: 0.2, numero: 5039, numeroLu: "5.39", presencePiste: 0, suite: false, accordNumero: 1, accordPiste: 0 },
          { y: 0.8, numero: 5042, numeroLu: "5.42", presencePiste: 0, suite: false, accordNumero: 1, accordPiste: 0 },
        ],
      },
      {
        feuille: 73,
        elements: [{ y: 0.2, numero: 5100, numeroLu: "5.100", presencePiste: 0, suite: false, accordNumero: 1, accordPiste: 0 }],
      },
    ];
    const medias = new Map([
      [5040, { piste: 40, disque: 1 }],
      [5041, { piste: 41, disque: 1 }],
      [5099, { piste: 99, disque: 1 }],
    ]);

    expect(ciblesStructurellesAttendues(pages, medias, "5.19", new Set([5039, 5042]))).toEqual([
      { numero: 5040, numeroLu: "5.40", pagesPdf: [73] },
      { numero: 5041, numeroLu: "5.41", pagesPdf: [73] },
    ]);
  });

  it("s'abstient devant un grand intervalle, un identifiant non structuré ou un média ambigu", () => {
    const pages = [
      {
        feuille: 1,
        elements: [
          { y: 0.2, numero: 5001, numeroLu: "5.1", presencePiste: 0, suite: false, accordNumero: 1, accordPiste: 0 },
          { y: 0.8, numero: 5010, numeroLu: "5.10", presencePiste: 0, suite: false, accordNumero: 1, accordPiste: 0 },
        ],
      },
    ];
    expect(ciblesStructurellesAttendues(pages, new Map([[5008, { piste: 8, disque: 1 }]]), "5.19", new Set())).toEqual([]);
    expect(ciblesStructurellesAttendues(pages, new Map([[5008, { piste: 8, disque: 1 }]]), undefined, new Set())).toEqual([]);
  });

  it("propose les deux pages voisines à une rupture de page et ignore un élément déjà interprété", () => {
    const pages = [
      { feuille: 71, elements: [{ y: 0.8, numero: 5036, numeroLu: "5.36", presencePiste: 0, suite: false, accordNumero: 1, accordPiste: 0 }] },
      { feuille: 72, elements: [{ y: 0.2, numero: 5038, numeroLu: "5.38", presencePiste: 0, suite: false, accordNumero: 1, accordPiste: 0 }] },
    ];
    const medias = new Map([[5037, { piste: 37, disque: 1 }]]);
    expect(ciblesStructurellesAttendues(pages, medias, "5.19", new Set())).toEqual([
      { numero: 5037, numeroLu: "5.37", pagesPdf: [72, 73] },
    ]);
    expect(ciblesStructurellesAttendues(pages, medias, "5.19", new Set([5037]))).toEqual([]);
  });

  it("rejette toute validation qui ne répond pas exactement à une cible demandée sur sa page", () => {
    const attendues = [{ numero: 5008, numeroLu: "5.8", pagesPdf: [64, 65] }];
    const zone = { x: 0.09, y: 0.63, l: 0.04, h: 0.04 };
    expect(
      retenirCiblesValidees(attendues, [
        { numero: 5008, numeroLu: "5.8", pagePdf: 65, zone, confiance: 0.95 },
        { numero: 5008, numeroLu: "5.8", pagePdf: 66, zone, confiance: 0.99 },
        { numero: 5009, numeroLu: "5.9", pagePdf: 65, zone, confiance: 0.99 },
      ]),
    ).toEqual([{ numero: 5008, numeroLu: "5.8", pagePdf: 65, zone, confiance: 0.95 }]);
  });

  it("ajoute seulement une cible vue avec confiance et corroborée par un média unique", () => {
    const pages = [
      {
        feuille: 64,
        elements: [
          { y: 0.2, numero: 5007, numeroLu: "5.7", presencePiste: 0, suite: false, accordNumero: 1, accordPiste: 0 },
          { y: 0.8, numero: 5009, numeroLu: "5.9", presencePiste: 0, suite: false, accordNumero: 1, accordPiste: 0 },
        ],
      },
    ];
    const medias = new Map([[5008, { piste: 9, disque: 1 }]]);
    const completees = integrerCiblesValidees(
      pages,
      [
        { numero: 5008, numeroLu: "5.8", pagePdf: 65, zone: { x: 0.09, y: 0.63, l: 0.04, h: 0.04 }, confiance: 0.95 },
        { numero: 5010, numeroLu: "5.10", pagePdf: 65, zone: { x: 0.09, y: 0.9, l: 0.04, h: 0.04 }, confiance: 0.99 },
      ],
      medias,
      0.9,
    );
    expect(completees[0]!.elements.map((element) => element.numero)).toEqual([5007, 5008, 5009]);
    expect(completees[0]!.elements[1]).toMatchObject({ numeroLu: "5.8", accordNumero: 0.95 });
  });

  it("s'abstient si la confiance est insuffisante ou si l'élément existe déjà", () => {
    const pages = [{ feuille: 64, elements: [{ y: 0.2, numero: 5008, numeroLu: "5.8", presencePiste: 0, suite: false, accordNumero: 1, accordPiste: 0 }] }];
    const medias = new Map([[5008, { piste: 9, disque: 1 }]]);
    expect(
      integrerCiblesValidees(
        pages,
        [{ numero: 5008, numeroLu: "5.8", pagePdf: 65, zone: { x: 0.09, y: 0.63, l: 0.04, h: 0.04 }, confiance: 0.4 }],
        medias,
        0.9,
      )[0]!.elements,
    ).toHaveLength(1);
  });

  it("rétablit après interprétation une cible exacte que la suite prudente a écartée", () => {
    const resultat = ResultatRecette.parse({
      recette: { id: "composee", version: 1 },
      pages: [{ feuille: 64, rang: 64, pageImprimee: 65, statut: "deduite", elements: [] }],
      lignes: [],
      pagesAbsentes: [],
      ecartes: [],
    });
    const complete = completerResultatParCiblesValidees(
      resultat,
      [{ numero: 5008, numeroLu: "5.8", pagePdf: 65, zone: { x: 0.09, y: 0.63, l: 0.04, h: 0.04 }, confiance: 0.95 }],
      new Map([[5008, { piste: 9, disque: 1 }]]),
      0.9,
    );
    expect(complete.lignes).toEqual([
      expect.objectContaining({ numero: 5008, numeroLu: "5.8", pageImprimee: 65, piste: 9, sourcePiste: "corroboration_media" }),
    ]);
  });
});
