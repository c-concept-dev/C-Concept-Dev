// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Depot } from "@lienotheque/noyau";
import { VersionDocument, type Passage } from "@lienotheque/contrats";
import { DOSSIERS_BIBLIOTHEQUE } from "@lienotheque/noyau";
import { mkdirSync } from "node:fs";
import { MIGRATIONS, migrer, ouvrirDepot } from "../src/index.js";

/** D'où un passage vient dans son document, gardé par le dépôt (étape 7, migration 7).
 *
 *  ## Ce que la colonne porte
 *
 *  Un EPUB n'a pas de pages : son rang est un feuillet, et « feuillet 162 » ne situe rien pour
 *  un lecteur. Le chapitre le situe — et il doit survivre à l'enregistrement, sinon il ne sert
 *  qu'au traitement et jamais à l'écran.
 *
 *  ## La migration ne doit rien casser
 *
 *  Elle ajoute une colonne **facultative** : les passages écrits avant elle n'en ont pas, et
 *  doivent rester lisibles tels quels. C'est l'épreuve la plus importante de ce fichier, parce
 *  qu'une migration qui abîme l'existant se découvre sur la bibliothèque de quelqu'un.
 */

const id = (n: number): string => `0190f0a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const sha = (c: string): string => c.repeat(64).slice(0, 64);
const LE = "2026-10-20T09:00:00+02:00";

let dossier = "";
let depot: Depot;

const poserVersion = async (d: Depot): Promise<void> => {
  await d.enregistrerFichier({
    empreinte: sha("a"),
    taille: 1,
    typeMime: "application/epub+zip",
    nomOrigine: "un-livre.epub",
    ajouteLe: LE,
    appareilId: id(99),
  });
  await d.enregistrerDocument({ id: id(10), bibliothequeId: id(1), titre: "Un livre", alias: [], creeLe: LE });
  await d.enregistrerVersion(
    VersionDocument.parse({
      id: id(20),
      documentId: id(10),
      numero: 1,
      etat: "pret_a_lire",
      active: false,
      fichiers: [sha("a")],
      recette: { id: "livre-natif", version: 1 },
      outils: [{ nom: "lecteur-texte", version: "1.0.0" }],
      manques: [],
      creeLe: LE,
    }),
  );
};

beforeEach(async () => {
  dossier = mkdtempSync(join(tmpdir(), "lienotheque-emplacement-"));
  depot = await ouvrirDepot(dossier);
  await poserVersion(depot);
});

afterEach(() => {
  rmSync(dossier, { recursive: true, force: true });
});

describe("le dépôt garde d'où un passage vient", () => {
  it("rend l'emplacement tel qu'il a été écrit", async () => {
    const passages: readonly Passage[] = [
      { rang: 0, page: 1, texte: "Le début du livre.", source: "couche_texte", emplacement: "Text/ch01.xhtml", lisible: true },
    ];
    await depot.enregistrerPassages(id(20), passages);
    expect((await depot.passages(id(20)))[0]?.emplacement).toBe("Text/ch01.xhtml");
  });

  it("le rend aussi par la recherche, qui est l'endroit où il sert", async () => {
    await depot.enregistrerPassages(id(20), [
      { rang: 0, page: 162, texte: "une phrase singulière du livre", source: "couche_texte", emplacement: "Text/ch07.xhtml", lisible: true },
    ]);
    const trouves = await depot.chercherPassages("singulière");
    expect(trouves[0]?.passage.emplacement).toBe("Text/ch07.xhtml");
  });

  it("n'en invente pas pour un passage qui n'en déclare aucun", async () => {
    await depot.enregistrerPassages(id(20), [
      { rang: 0, page: 1, texte: "Une page de PDF, qui n'a rien de plus à dire.", source: "couche_texte", lisible: true },
    ]);
    expect((await depot.passages(id(20)))[0]?.emplacement).toBeUndefined();
  });
});

describe("la migration ne casse pas ce qui est déjà écrit", () => {
  it("relit des passages enregistrés avant qu'elle existe", async () => {
    // Un dépôt arrêté à la migration 6, rempli, puis migré : c'est exactement ce qui arrive à
    // la bibliothèque de quelqu'un quand la version suivante s'installe.
    const avant = mkdtempSync(join(tmpdir(), "lienotheque-avant-"));
    try {
      const jusquA6 = MIGRATIONS.filter((migration) => migration.version <= 6);
      // Au même endroit que `ouvrirDepot` l'attend : une base posée à côté ne serait pas migrée,
      // et l'épreuve passerait en ne prouvant rien.
      mkdirSync(join(avant, DOSSIERS_BIBLIOTHEQUE.base), { recursive: true });
      const base = new DatabaseSync(join(avant, DOSSIERS_BIBLIOTHEQUE.base, "bibliotheque.sqlite"));
      migrer(base, jusquA6);
      base.exec(`
        INSERT INTO fichier (empreinte, taille, type_mime, nom_origine, ajoute_le, appareil_id)
        VALUES ('${sha("a")}', 1, 'application/pdf', 'vieux.pdf', '${LE}', '${id(99)}');
        INSERT INTO document (id, bibliotheque_id, titre, cree_le)
        VALUES ('${id(10)}', '${id(1)}', 'Un vieux document', '${LE}');
        INSERT INTO version (id, document_id, numero, etat, active, recette_id, recette_ver, cree_le)
        VALUES ('${id(20)}', '${id(10)}', 1, 'pret_a_lire', 0, 'r', 1, '${LE}');
        INSERT INTO passage (id, version_id, rang, texte, source, page, lisible)
        VALUES ('p0', '${id(20)}', 0, 'Un texte écrit avant la migration.', 'couche_texte', 1, 1);
      `);
      base.close();

      // La version suivante s'installe : toutes les migrations, sur la base existante.
      const apres = await ouvrirDepot(avant);
      const passages = await apres.passages(id(20));
      expect(passages, "les passages d'avant la migration ont disparu").toHaveLength(1);
      expect(passages[0]?.texte).toBe("Un texte écrit avant la migration.");
      expect(passages[0]?.emplacement, "une colonne neuve a inventé une valeur").toBeUndefined();

      // Et l'index plein texte les retrouve toujours.
      expect(await apres.chercherPassages("migration")).toHaveLength(1);
    } finally {
      rmSync(avant, { recursive: true, force: true });
    }
  });
});
