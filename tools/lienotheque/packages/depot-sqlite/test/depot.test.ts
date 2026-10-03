// @vitest-environment node
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOSSIERS_BIBLIOTHEQUE, type Depot } from "@lienotheque/noyau";
import { DatabaseSync } from "node:sqlite";
import { LigneJournalIndexation, Travail, VersionDocument, ecartsDIndexation } from "@lienotheque/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS, migrer, ouvrirDepot, ouvrirRegistre } from "../src/index.js";

const id = (n: number): string => `0190f0a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const sha = (c: string): string => c.repeat(64).slice(0, 64);
const LE = "2026-10-03T09:00:00+02:00";

let dossier = "";
let depot: Depot;

const fichier = (c: string, nom: string) => ({
  empreinte: sha(c),
  taille: 1234,
  typeMime: "application/pdf",
  nomOrigine: nom,
  ajouteLe: LE,
  appareilId: id(99),
});

const document = (n: number) => ({ id: id(n), bibliothequeId: id(1), titre: `Document ${n}`, alias: [], creeLe: LE });

const version = (n: number, documentN: number, extra: Record<string, unknown> = {}) =>
  VersionDocument.parse({
    id: id(n),
    documentId: id(documentN),
    numero: 1,
    etat: "pret_a_lire",
    active: false,
    fichiers: [sha("a")],
    recette: { id: "livre-natif", version: 1 },
    outils: [{ nom: "lecteur-texte", version: "1.0.0" }],
    manques: [],
    creeLe: LE,
    ...extra,
  });

beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), "lienotheque-depot-"));
  depot = ouvrirDepot(dossier);
});

afterEach(() => {
  depot.fermer();
  rmSync(dossier, { recursive: true, force: true });
});

describe("dossier portable d'une bibliothèque", () => {
  it("pose sources, derives et base", () => {
    for (const sous of Object.values(DOSSIERS_BIBLIOTHEQUE)) {
      expect(existsSync(join(dossier, sous)), sous).toBe(true);
    }
    expect(existsSync(join(dossier, DOSSIERS_BIBLIOTHEQUE.base, "bibliotheque.sqlite"))).toBe(true);
  });

  it("rouvre une bibliothèque existante sans rejouer ses migrations", () => {
    const base = new DatabaseSync(join(dossier, DOSSIERS_BIBLIOTHEQUE.base, "bibliotheque.sqlite"));
    expect(migrer(base, MIGRATIONS)).toBe(0);
    const faites = base.prepare("SELECT COUNT(*) AS n FROM migration").get() as { n: number };
    expect(faites.n).toBe(MIGRATIONS.length);
    base.close();
  });
});

describe("fichiers identifiés par leur contenu (ID-01)", () => {
  it("retrouve un fichier par son empreinte, et ignore un second enregistrement", async () => {
    await depot.enregistrerFichier(fichier("a", "Original.pdf"));
    await depot.enregistrerFichier({ ...fichier("a", "Renommé n'importe comment.pdf"), taille: 9999 });

    const lu = await depot.fichier(sha("a"));
    expect(lu?.nomOrigine).toBe("Original.pdf");
    expect(lu?.taille).toBe(1234);
    expect(await depot.fichiers()).toHaveLength(1);
  });

  it("ne connaît pas une empreinte jamais vue", async () => {
    expect(await depot.fichier(sha("z"))).toBeUndefined();
  });
});

describe("documents et identifiants hérités (ID-02, ID-08)", () => {
  it("retrouve un document par son identifiant et par un alias de l'ancienne base", async () => {
    await depot.enregistrerDocument({ ...document(10), alias: ["ancien-123", "ancien-456"] });

    expect((await depot.document(id(10)))?.titre).toBe("Document 10");
    expect((await depot.documentParAlias("ancien-456"))?.id).toBe(id(10));
    expect(await depot.documentParAlias("jamais-vu")).toBeUndefined();
  });

  it("garde les alias à jour quand le document change", async () => {
    await depot.enregistrerDocument({ ...document(10), alias: ["a"] });
    await depot.enregistrerDocument({ ...document(10), titre: "Titre corrigé", alias: ["b"] });

    expect((await depot.document(id(10)))?.titre).toBe("Titre corrigé");
    expect((await depot.document(id(10)))?.alias).toEqual(["b"]);
    expect(await depot.documentParAlias("a")).toBeUndefined();
  });
});

describe("versions : activation atomique et réversible (ID-04, ID-05, JOB-06)", () => {
  beforeEach(async () => {
    await depot.enregistrerFichier(fichier("a", "source.pdf"));
    await depot.enregistrerDocument(document(10));
    await depot.enregistrerVersion(version(20, 10));
    await depot.enregistrerVersion(version(21, 10, { numero: 2, precedenteId: id(20) }));
  });

  it("n'active qu'une version à la fois", async () => {
    await depot.activerVersion(id(20));
    expect((await depot.versionActive(id(10)))?.id).toBe(id(20));

    await depot.activerVersion(id(21));
    expect((await depot.versionActive(id(10)))?.id).toBe(id(21));
    expect((await depot.version(id(20)))?.active).toBe(false);
  });

  it("revient à la version précédente sans rien perdre", async () => {
    await depot.activerVersion(id(21));
    await depot.activerVersion(id(20));

    expect((await depot.versionActive(id(10)))?.id).toBe(id(20));
    expect(await depot.versions(id(10))).toHaveLength(2);
  });

  it("refuse d'activer une version inconnue, sans toucher à l'existante", async () => {
    await depot.activerVersion(id(20));
    await expect(depot.activerVersion(id(99))).rejects.toThrow(/inconnue/i);
    expect((await depot.versionActive(id(10)))?.id).toBe(id(20));
  });

  it("rend une version complète : fichiers, outils et manques", async () => {
    await depot.enregistrerVersion(version(22, 10, { numero: 3, etat: "partiel", manques: ["pages 30-31"] }));
    const lue = await depot.version(id(22));
    expect(lue?.fichiers).toEqual([sha("a")]);
    expect(lue?.outils).toEqual([{ nom: "lecteur-texte", version: "1.0.0" }]);
    expect(lue?.manques).toEqual(["pages 30-31"]);
  });
});

describe("ancres, liens et cartes (ANC-01 à ANC-05)", () => {
  beforeEach(async () => {
    await depot.enregistrerFichier(fichier("a", "source.pdf"));
    await depot.enregistrerDocument(document(10));
    await depot.enregistrerVersion(version(20, 10));
  });

  it("garde une ancre et son sélecteur", async () => {
    await depot.enregistrerAncre({ id: id(30), versionId: id(20), fichier: sha("a"), selecteur: { type: "page", index: 127 } });
    const [ancre] = await depot.ancres(id(20));
    expect(ancre?.selecteur).toEqual({ type: "page", index: 127 });
  });

  it("relie deux ancres et retrouve le lien des deux côtés", async () => {
    for (const n of [30, 31]) {
      await depot.enregistrerAncre({ id: id(n), versionId: id(20), fichier: sha("a"), selecteur: { type: "page", index: n } });
    }
    await depot.enregistrerLien({
      id: id(40),
      de: id(30),
      vers: id(31),
      nature: "piste_de",
      preuve: "lu",
      confiance: 0.9,
      auteur: { type: "outil", outil: { nom: "associateur", version: "1.0.0" } },
    });
    expect(await depot.liens(id(30))).toHaveLength(1);
    expect((await depot.liens(id(31)))[0]?.de).toBe(id(30));
  });

  it("garde une carte de synchronisation, segment inconnu compris (ANC-03)", async () => {
    await depot.enregistrerAncre({ id: id(30), versionId: id(20), fichier: sha("a"), selecteur: { type: "page", index: 1 } });
    await depot.enregistrerCarte({
      id: id(50),
      versionId: id(20),
      media: sha("b"),
      paires: [{ segment: "inconnu", ancre: id(30) }],
    });
    expect((await depot.carte(id(20)))?.paires).toEqual([{ segment: "inconnu", ancre: id(30) }]);
  });
});

describe("nomenclature et classement (CLA)", () => {
  it("garde le schéma et le classement d'un document", async () => {
    await depot.enregistrerDocument(document(10));
    const schema = {
      cle: "essai",
      nom: "Essai",
      langue: "fr",
      version: 1,
      axes: [
        {
          cle: "axe-a",
          nom: "Axe A",
          nature: "referentiel" as const,
          cardinalite: "une" as const,
          structure: "plat" as const,
          obligatoire: false,
          alias: [],
          valeurs: [{ cle: "v1", nom: "V1", synonymes: [], alias: [], retiree: false }],
        },
      ],
    };
    await depot.enregistrerSchema(schema);
    await depot.enregistrerClassement({
      documentId: id(10),
      schema: "essai",
      schemaVersion: 1,
      axes: { "axe-a": { type: "reference", valeurs: ["v1"] } },
    });

    expect((await depot.schema())?.axes[0]?.cle).toBe("axe-a");
    expect((await depot.classement(id(10)))?.axes["axe-a"]).toEqual({ type: "reference", valeurs: ["v1"] });
  });
});

describe("HEB-02 : aucun binaire en base", () => {
  it("ne déclare aucune colonne qui puisse accueillir des octets", () => {
    const base = new DatabaseSync(join(dossier, DOSSIERS_BIBLIOTHEQUE.base, "bibliotheque.sqlite"), { readOnly: true });
    const tables = (base.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
    const binaires: string[] = [];
    for (const table of tables) {
      for (const colonne of base.prepare(`PRAGMA table_info(${table})`).all() as { name: string; type: string }[]) {
        if (/BLOB/i.test(colonne.type)) binaires.push(`${table}.${colonne.name}`);
      }
    }
    base.close();
    expect(tables.length).toBeGreaterThan(5);
    expect(binaires).toEqual([]);
  });

  it("n'écrit aucun octet brut, même si on le lui demande", async () => {
    await depot.enregistrerFichier(fichier("a", "source.pdf"));
    const base = new DatabaseSync(join(dossier, DOSSIERS_BIBLIOTHEQUE.base, "bibliotheque.sqlite"), { readOnly: true });
    const valeurs = (base.prepare("SELECT * FROM fichier").all() as Record<string, unknown>[]).flatMap(Object.values);
    base.close();
    expect(valeurs.filter((v) => v instanceof Uint8Array)).toEqual([]);
  });
});

describe("registre des bibliothèques", () => {
  it("retient où vit chaque bibliothèque", () => {
    const registre = ouvrirRegistre(join(dossier, "registre.sqlite"));
    registre.inscrire({ cle: "une", nom: "Une", dossier: "/quelque/part" });
    registre.inscrire({ cle: "une", nom: "Une, renommée", dossier: "/ailleurs" });
    registre.inscrire({ cle: "deux", nom: "Deux", dossier: "/ici" });

    const toutes = registre.bibliotheques();
    expect(toutes).toHaveLength(2);
    expect(toutes.find((b) => b.cle === "une")?.dossier).toBe("/ailleurs");
    registre.fermer();
  });
});

describe("file de travaux durable (JOB-01, JOB-04, JOB-06, JOB-07, JOB-09)", () => {
  const travail = (n: number, extra: Record<string, unknown> = {}) =>
    Travail.parse({
      id: id(n),
      outil: { nom: "lecteur-texte", version: "1.0.0" },
      versionCible: id(20),
      etat: "en_file",
      tentative: 1,
      progression: 0,
      creeLe: LE,
      majLe: LE,
      ...extra,
    });

  beforeEach(async () => {
    await depot.enregistrerFichier(fichier("a", "source.pdf"));
    await depot.enregistrerDocument(document(10));
    await depot.enregistrerVersion(version(20, 10));
    await depot.enregistrerVersion(version(21, 10, { numero: 2 }));
  });

  it("persiste un travail avant qu'il ne commence, et le retrouve après réouverture (JOB-01, JOB-09)", async () => {
    await depot.enregistrerTravail(travail(30, { empreinteEntree: "entree-a" }));
    depot.fermer();

    const rouvert = ouvrirDepot(dossier);
    const lu = await rouvert.travail(id(30));
    expect(lu?.etat).toBe("en_file");
    expect(lu?.empreinteEntree).toBe("entree-a");
    expect(lu?.lieu).toBe("application");
    rouvert.fermer();
    depot = ouvrirDepot(dossier);
  });

  it("garde le bail, le point de reprise et l'erreur tels quels", async () => {
    await depot.enregistrerTravail(
      travail(31, {
        etat: "en_echec_recuperable",
        progression: 0.25,
        pointReprise: { unite: "page", valeur: 25 },
        erreur: { cause: "page illisible", elements: ["page 26"], reprisePossible: true },
      }),
    );
    const lu = await depot.travail(id(31));
    expect(lu?.pointReprise).toEqual({ unite: "page", valeur: 25 });
    expect(lu?.erreur?.cause).toBe("page illisible");
    expect(lu?.verrou).toBeUndefined();
  });

  it("refuse deux fois la même demande en file (JOB-04)", async () => {
    await depot.enregistrerTravail(travail(32, { empreinteEntree: "meme-entree" }));
    await expect(depot.enregistrerTravail(travail(33, { empreinteEntree: "meme-entree" }))).rejects.toThrow(/UNIQUE|contrainte|constraint/i);

    // Une fois le premier terminé, la même demande peut repartir.
    await depot.enregistrerTravail(travail(32, { empreinteEntree: "meme-entree", etat: "termine", progression: 1 }));
    await depot.enregistrerTravail(travail(33, { empreinteEntree: "meme-entree" }));
    expect(await depot.travaux()).toHaveLength(2);
  });

  it("travaille sur la version cible sans toucher à la version active (JOB-06)", async () => {
    await depot.activerVersion(id(20));
    await depot.enregistrerTravail(travail(34, { versionCible: id(21), etat: "en_cours", progression: 0.5 }));

    expect((await depot.versionActive(id(10)))?.id, "la version active ne bouge pas pendant le travail").toBe(id(20));

    await depot.enregistrerTravail(travail(34, { versionCible: id(21), etat: "termine", progression: 1 }));
    expect((await depot.versionActive(id(10)))?.id, "terminer un travail n'active rien tout seul").toBe(id(20));

    await depot.activerVersion(id(21));
    expect((await depot.versionActive(id(10)))?.id).toBe(id(21));
  });

  it("tient le journal d'indexation et laisse voir les écarts (JOB-07)", async () => {
    const lignes = [
      { index: "passages", objetId: id(20), etape: "prevu", majLe: "2026-10-03T10:00:00Z" },
      { index: "passages", objetId: id(20), etape: "envoye", majLe: "2026-10-03T10:00:05Z" },
      { index: "passages", objetId: id(20), etape: "confirme", majLe: "2026-10-03T10:00:09Z" },
      { index: "passages", objetId: id(21), etape: "prevu", majLe: "2026-10-03T10:00:01Z" },
      { index: "passages", objetId: id(21), etape: "envoye", majLe: "2026-10-03T10:00:06Z" },
    ];
    for (const ligne of lignes) await depot.journaliserIndexation(LigneJournalIndexation.parse(ligne));

    const journal = await depot.journalIndexation("passages");
    expect(journal).toHaveLength(5);
    expect(ecartsDIndexation(journal), "un objet envoyé mais jamais confirmé est un écart").toEqual([`passages/${id(21)}`]);

    await depot.journaliserIndexation(
      LigneJournalIndexation.parse({ index: "passages", objetId: id(21), etape: "confirme", majLe: "2026-10-03T10:00:12Z" }),
    );
    expect(ecartsDIndexation(await depot.journalIndexation("passages"))).toEqual([]);
  });
});
