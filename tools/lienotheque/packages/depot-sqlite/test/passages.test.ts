// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Passage, VersionDocument } from "@lienotheque/contrats";
import type { Depot } from "@lienotheque/noyau";
import { ouvrirDepot } from "../src/index.js";

/** Les passages dans la base, et la recherche plein texte (RCH-07, RCH-11, RCH-12).
 *
 *  Écrits avant l'écrivain (CLAUDE.md, règle 2). Ce que ces contrôles exigent est ce qui
 *  manquait pour que la bibliothèque soit cherchable : du texte là où une requête peut
 *  l'atteindre, et un extrait qui porte sa page.
 */

const id = (n: number): string => `0190f0a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const LE = "2026-10-11T09:00:00+02:00";
const VERSION = id(11);
const AUTRE = id(12);
const FICHIER = "a".repeat(64);

const passage = (rang: number, texte: string, page = rang + 1, reste: Partial<Passage> = {}): Passage => ({
  rang,
  page,
  texte,
  source: "couche_texte",
  lisible: true,
  ...reste,
});

let dossier = "";
let depot: Depot;

beforeEach(async () => {
  dossier = mkdtempSync(join(tmpdir(), "lienotheque-passages-"));
  depot = ouvrirDepot(dossier);
  await depot.enregistrerFichier({
    empreinte: FICHIER,
    taille: 1234,
    typeMime: "application/pdf",
    nomOrigine: "essai.pdf",
    ajouteLe: LE,
    appareilId: id(99),
  });
  await depot.enregistrerDocument({ id: id(1), bibliothequeId: id(0), titre: "Un document d'essai", alias: [], creeLe: LE });
  // Deux versions du même document : la base les veut numérotées distinctement, et c'est
  // exactement ce qui permet d'éprouver qu'un passage n'en déborde pas sur l'autre.
  for (const [rang, version] of [VERSION, AUTRE].entries())
    await depot.enregistrerVersion(
      VersionDocument.parse({
        id: version,
        documentId: id(1),
        numero: rang + 1,
        etat: "pret_a_lire",
        active: false,
        fichiers: [FICHIER],
        recette: { id: "essai", version: 1 },
        outils: [{ nom: "lecteur-texte", version: "1.0.0" }],
        manques: [],
        creeLe: LE,
      }),
    );
});

afterEach(() => {
  depot.fermer();
  rmSync(dossier, { recursive: true, force: true });
});

describe("écrire et relire les passages d'une version (RCH-07)", () => {
  it("les rend dans l'ordre des rangs, avec leur texte intact", async () => {
    await depot.enregistrerPassages(VERSION, [passage(0, "Le premier passage."), passage(1, "Le second passage.")]);

    const relus = await depot.passages(VERSION);
    expect(relus.map((p) => p.rang)).toEqual([0, 1]);
    expect(relus.map((p) => p.texte)).toEqual(["Le premier passage.", "Le second passage."]);
  });

  it("garde la provenance et le numéro imprimé, parce qu'une citation doit se vérifier (RCH-09)", async () => {
    await depot.enregistrerPassages(VERSION, [
      passage(0, "Lu dans le document.", 1, { pageImprimee: 17 }),
      passage(1, "Reconnu sur l'image.", 2, { source: "ocr", confiance: 0.72 }),
    ]);

    const relus = await depot.passages(VERSION);
    expect(relus[0]).toMatchObject({ source: "couche_texte", pageImprimee: 17, page: 1 });
    expect(relus[1]).toMatchObject({ source: "ocr", confiance: 0.72, page: 2 });
    expect(relus[1]?.pageImprimee).toBeUndefined();
  });

  it("garde le marqueur de qualité basse, et le rend tel quel (FMT-04)", async () => {
    await depot.enregistrerPassages(VERSION, [
      passage(0, "Du texte qui se lit."),
      passage(1, "Xï Œè é }u} ï w Â sèw", 2, { lisible: false }),
    ]);

    const relus = await depot.passages(VERSION);
    expect(relus.map((p) => p.lisible), "le marqueur n'a pas survécu à l'écriture").toEqual([true, false]);
  });

  it("l'index plein texte contient aussi les passages illisibles : marqués, jamais écartés (FMT-04)", async () => {
    // Le piège qu'il faut fermer : indexer seulement les lisibles serait une exclusion
    // silencieuse de plus, déguisée en propreté. La page existe ; qu'on la retrouve et qu'on
    // voie qu'elle est douteuse vaut mieux qu'un trou dans la bibliothèque.
    await depot.enregistrerPassages(VERSION, [passage(0, "Xï Œè sèw ëzè éw brouillage", 1, { lisible: false })]);
    const trouves = await depot.chercherPassages("brouillage");
    expect(trouves).toHaveLength(1);
    expect(trouves[0]?.passage.lisible).toBe(false);
  });

  it("réécrire une version remplace ses passages au lieu de s'y ajouter", async () => {
    // La table est **produite** depuis la lecture, et refaite si la version change. Ajouter
    // doublerait les passages à chaque reprise d'un travail — et une reprise est la règle, pas
    // l'exception (JOB-03).
    await depot.enregistrerPassages(VERSION, [passage(0, "Première écriture."), passage(1, "Deuxième.")]);
    await depot.enregistrerPassages(VERSION, [passage(0, "Après correction.")]);

    const relus = await depot.passages(VERSION);
    expect(relus).toHaveLength(1);
    expect(relus[0]?.texte).toBe("Après correction.");
  });

  it("ne mélange pas deux versions", async () => {
    await depot.enregistrerPassages(VERSION, [passage(0, "Celui de la première version.")]);
    await depot.enregistrerPassages(AUTRE, [passage(0, "Celui de la seconde.")]);

    expect(await depot.passages(VERSION)).toHaveLength(1);
    expect((await depot.passages(VERSION))[0]?.texte).toBe("Celui de la première version.");
    expect((await depot.passages(AUTRE))[0]?.texte).toBe("Celui de la seconde.");
  });

  it("refuse une suite de rangs trouée : le contrat la refuse, la base ne doit pas l'accepter en douce", async () => {
    await expect(depot.enregistrerPassages(VERSION, [passage(0, "Avant."), passage(2, "Après.")])).rejects.toThrow();
    expect(await depot.passages(VERSION)).toHaveLength(0);
  });
});

describe("chercher dans le texte (RCH-07, RCH-11)", () => {
  const corpus = [
    passage(0, "La mémoire du corps garde ce que les mots ont tu.", 1, { pageImprimee: 11 }),
    passage(1, "Une thérapie qui ne nomme rien laisse le corps parler seul.", 2, { pageImprimee: 12 }),
    passage(2, "Le sommeil consolide ce que la journée a inscrit.", 3, { pageImprimee: 13 }),
  ];

  it("retrouve un mot et rend le passage avec sa page (RCH-09)", async () => {
    await depot.enregistrerPassages(VERSION, corpus);

    const trouves = await depot.chercherPassages("sommeil");
    expect(trouves).toHaveLength(1);
    expect(trouves[0]?.passage.texte).toContain("sommeil");
    expect(trouves[0]?.passage.pageImprimee).toBe(13);
    expect(trouves[0]?.versionId).toBe(VERSION);
  });

  it("retrouve une phrase exacte, et seulement elle (RCH-07)", async () => {
    await depot.enregistrerPassages(VERSION, corpus);

    expect(await depot.chercherPassages('"la mémoire du corps"')).toHaveLength(1);
    expect(await depot.chercherPassages('"le corps du mémoire"'), "l'ordre des mots compte dans une phrase exacte").toHaveLength(0);
  });

  it("ignore les accents à la recherche mais rend le texte accentué (RCH-07)", async () => {
    // L'index replie les accents — c'est `remove_diacritics` — pour qu'on retrouve « mémoire »
    // en tapant « memoire ». L'extrait rendu, lui, reste exact : c'est lui qu'on cite.
    await depot.enregistrerPassages(VERSION, corpus);

    const trouves = await depot.chercherPassages("memoire");
    expect(trouves).toHaveLength(1);
    expect(trouves[0]?.passage.texte).toContain("mémoire");
  });

  it("ne rend rien pour ce qui n'y est pas, au lieu du passage le plus proche", async () => {
    await depot.enregistrerPassages(VERSION, corpus);
    expect(await depot.chercherPassages("hydrographie")).toEqual([]);
  });

  it("oublie les passages d'une version réécrite : l'index suit la table", async () => {
    // Le piège d'un index plein texte « contentless » : les déclencheurs le tiennent à jour,
    // mais seulement si l'on passe par la table. Un passage supprimé qui resterait dans l'index
    // ferait trouver une citation qui n'existe plus.
    await depot.enregistrerPassages(VERSION, corpus);
    expect(await depot.chercherPassages("sommeil")).toHaveLength(1);

    await depot.enregistrerPassages(VERSION, [passage(0, "Tout autre chose désormais.")]);
    expect(await depot.chercherPassages("sommeil")).toEqual([]);
    expect(await depot.chercherPassages("désormais")).toHaveLength(1);
  });

  it("borne ce qu'elle rend : une requête d'un mot courant ne rapatrie pas la bibliothèque (RCH-11)", async () => {
    await depot.enregistrerPassages(
      VERSION,
      Array.from({ length: 120 }, (_, rang) => passage(rang, `Le corps, encore, passage numéro ${rang}.`, rang + 1)),
    );

    const trouves = await depot.chercherPassages("corps");
    expect(trouves.length).toBeGreaterThan(0);
    expect(trouves.length).toBeLessThanOrEqual(50);
    expect(await depot.chercherPassages("corps", { plafond: 5 })).toHaveLength(5);
  });
});
