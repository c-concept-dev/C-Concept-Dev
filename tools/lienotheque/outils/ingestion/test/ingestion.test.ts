// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DecoupeMedia, Document, Fichier, LigneInterpretee, SchemaBibliotheque, VersionDocument } from "@lienotheque/contrats";
import { ouvrirDepot } from "@lienotheque/depot-sqlite";
import type { Depot } from "@lienotheque/noyau";
import type { Association } from "@lienotheque/recettes";
import { identifiantDe, ingerer, preuveDe, segmentDuRang, type Lot, type MediaIngere } from "../src/index.js";

const dossiers: string[] = [];
const depots: Depot[] = [];
afterEach(() => {
  for (const depot of depots.splice(0)) depot.fermer();
  for (const dossier of dossiers.splice(0)) rmSync(dossier, { recursive: true, force: true });
});

async function depotNeuf(): Promise<Depot> {
  const dossier = mkdtempSync(join(tmpdir(), "lienotheque-ingestion-"));
  dossiers.push(dossier);
  const depot = await ouvrirDepot(dossier);
  depots.push(depot);
  return depot;
}

const EMPREINTE = (lettre: string): string => lettre.repeat(64);

const SCHEMA: SchemaBibliotheque = {
  cle: "methode",
  nom: "Méthode",
  langue: "fr",
  version: 1,
  axes: [
    {
      cle: "niveau",
      nom: "Niveau",
      nature: "referentiel",
      cardinalite: "une",
      alias: [],
      structure: "plat",
      obligatoire: false,
      valeurs: [{ cle: "debutant", nom: "Débutant", alias: [], synonymes: [], retiree: false }],
    },
  ],
};

const DOCUMENT: Document = {
  id: identifiantDe("document/methode-f3"),
  bibliothequeId: identifiantDe("bibliotheque/essai"),
  titre: "Méthode",
  alias: [],
  creeLe: "2026-10-04T08:00:00.000Z",
};
const VERSION: VersionDocument = {
  id: identifiantDe("version/methode-f3/1"),
  documentId: identifiantDe("document/methode-f3"),
  numero: 1,
  etat: "indexe",
  active: true,
  fichiers: [EMPREINTE("a")],
  recette: { id: "methode-pastille-piste", version: 2 },
  outils: [{ nom: "interpreteur-de-recettes", version: "0.1.0" }],
  manques: [],
  creeLe: "2026-10-04T08:00:00.000Z",
};

const ligne = (numero: number, sur: Partial<LigneInterpretee> = {}): LigneInterpretee => ({
  numero,
  pageImprimee: 3,
  piste: numero,
  disque: 1,
  sourcePiste: "pastille",
  confiance: 1,
  ...sur,
});

const media = (piste: number, sur: Partial<MediaIngere> = {}): MediaIngere => ({
  empreinte: EMPREINTE(String.fromCharCode(97 + piste)),
  piste,
  disque: 1,
  dureeS: 180,
  ...sur,
});

const fichier = (empreinte: string, nom: string): Fichier => ({
  empreinte,
  taille: 1000,
  typeMime: "audio/mpeg",
  nomOrigine: nom,
  ajouteLe: "2026-10-04T08:00:00.000Z",
  appareilId: identifiantDe("appareil/essai"),
});

const lot = (sur: Partial<Lot> = {}): Lot => ({
  document: DOCUMENT,
  version: VERSION,
  schema: SCHEMA,
  fichiers: [fichier(EMPREINTE("a"), "methode.pdf")],
  lignes: [ligne(1), ligne(2)],
  association: { appariements: [], orphelins: [], manquants: [] } satisfies Association,
  medias: [media(1), media(2)],
  ...sur,
});

describe("preuve d'un lien (ANC-02, REC-05)", () => {
  it("une pastille lue vaut une lecture", () => {
    expect(preuveDe("pastille")).toBe("lu");
  });

  it("tout le reste vaut la séquence — jamais le nom d'un fichier", () => {
    for (const source of ["sequence", "suite", "numero_element", undefined] as const) expect(preuveDe(source)).toBe("sequence");
  });
});

describe("segment du rang d'un élément (ANC-03)", () => {
  const decoupe: DecoupeMedia = {
    dureeS: 100,
    segments: [
      { debut: 0, fin: 40, confiance: 0.9 },
      { debut: 42, fin: 100, confiance: 0.8 },
    ],
  };

  it("apparie par le rang quand il y a autant de segments que d'éléments", () => {
    expect(segmentDuRang(decoupe, 0, 2)?.fin).toBe(40);
    expect(segmentDuRang(decoupe, 1, 2)?.debut).toBe(42);
  });

  it("ne devine rien quand les comptes ne correspondent pas", () => {
    expect(segmentDuRang(decoupe, 0, 3)).toBeUndefined();
    expect(segmentDuRang(undefined, 0, 1)).toBeUndefined();
  });
});

describe("ingestion d'un lot (B5)", () => {
  it("range le schéma, le document et sa version", async () => {
    const depot = await depotNeuf();
    await ingerer(depot, lot());
    expect((await depot.schema())?.cle).toBe("methode");
    expect((await depot.document(DOCUMENT.id))?.titre).toBe("Méthode");
    expect((await depot.versionActive(DOCUMENT.id))?.id).toBe(VERSION.id);
  });

  it("pose une ancre par élément, qui dit sa page et son numéro", async () => {
    const depot = await depotNeuf();
    const bilan = await ingerer(depot, lot());
    const ancres = await depot.ancres(VERSION.id);
    const element = ancres.find((a) => a.selecteur.type === "element");
    expect(element?.selecteur).toMatchObject({ type: "element", page: 3, valeur: "1" });
    expect(bilan.ancres).toBeGreaterThanOrEqual(2);
  });

  it("relie chaque élément à son média, avec la preuve et la confiance (ANC-02)", async () => {
    const depot = await depotNeuf();
    const bilan = await ingerer(depot, lot());
    expect(bilan.liens).toBe(2);
    const liens = await depot.liens(identifiantDe(`${DOCUMENT.id}/element-1`));
    expect(liens[0]).toMatchObject({ nature: "piste_de", preuve: "lu", confiance: 1 });
    expect(liens[0]?.auteur).toMatchObject({ type: "outil" });
  });

  it("dit « séquence » quand la piste vient de la suite et non d'un repère lu", async () => {
    const depot = await depotNeuf();
    await ingerer(depot, lot({ lignes: [ligne(1, { sourcePiste: "sequence", confiance: 0.8 })] }));
    expect((await depot.liens(identifiantDe(`${DOCUMENT.id}/element-1`)))[0]?.preuve).toBe("sequence");
  });

  it("sans segment vérifié, la paire est inconnue et l'ancre couvre la piste entière (ANC-03)", async () => {
    const depot = await depotNeuf();
    const bilan = await ingerer(depot, lot());
    expect(bilan.segmentsInconnus).toBe(2);
    const carte = await depot.carte(VERSION.id);
    expect(carte?.paires[0]).toMatchObject({ segment: "inconnu" });

    const ancres = await depot.ancres(VERSION.id);
    const surLeMedia = ancres.find((a) => a.selecteur.type === "temps");
    expect(surLeMedia?.selecteur, "la piste entière, pas une position inventée").toMatchObject({ type: "temps", debut: 0, fin: 180 });
  });

  it("avec un segment vérifié, la paire le porte", async () => {
    const depot = await depotNeuf();
    const decoupe: DecoupeMedia = { dureeS: 180, segments: [{ debut: 2, fin: 90, confiance: 0.9 }] };
    const bilan = await ingerer(depot, lot({ lignes: [ligne(1)], medias: [media(1, { decoupe })] }));
    expect(bilan.segmentsInconnus).toBe(0);
    const carte = await depot.carte(VERSION.id);
    expect(carte?.paires[0]).toMatchObject({ segment: "connu", debut: 2, fin: 90 });
  });

  it("compte les éléments sans piste, et ne leur invente aucun lien", async () => {
    const depot = await depotNeuf();
    const { piste: _sans, sourcePiste: _ni, ...sansPiste } = ligne(1);
    const bilan = await ingerer(depot, lot({ lignes: [sansPiste as LigneInterpretee] }));
    expect(bilan.sansPiste).toBe(1);
    expect(bilan.liens).toBe(0);
    expect(await depot.carte(VERSION.id)).toBeUndefined();
  });

  it("une carte par média, indépendante de l'emplacement des fichiers (ANC-05)", async () => {
    const depot = await depotNeuf();
    const bilan = await ingerer(depot, lot());
    expect(bilan.cartes).toBe(2);
    const carte = await depot.carte(VERSION.id);
    expect(carte?.media, "la carte cite une empreinte, pas un chemin").toMatch(/^[0-9a-z]{64}$/);
  });

  it("rejoué, range exactement la même chose", async () => {
    const premier = await depotNeuf();
    const second = await depotNeuf();
    expect(await ingerer(premier, lot())).toEqual(await ingerer(second, lot()));
  });
});
