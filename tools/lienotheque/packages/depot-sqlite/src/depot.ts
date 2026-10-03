import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  Ancre,
  CarteSynchro,
  ClassementDocument,
  Document,
  Fichier,
  LigneJournalIndexation,
  SchemaBibliotheque,
  Travail,
  VersionDocument,
  type Empreinte,
  type Identifiant,
  type Lien,
} from "@lienotheque/contrats";
import { DOSSIERS_BIBLIOTHEQUE, type Depot } from "@lienotheque/noyau";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS, MIGRATIONS_REGISTRE, type Migration } from "./migrations.js";

type Lignes = Record<string, unknown>;

/** `node:sqlite` est livré avec Node : aucune compilation native, donc rien à installer sur
 *  macOS, Windows ni Linux. Il n'offre pas d'aide aux transactions : la voici. */
function transaction<T>(base: DatabaseSync, travail: () => T): T {
  base.exec("BEGIN");
  try {
    const resultat = travail();
    base.exec("COMMIT");
    return resultat;
  } catch (erreur) {
    base.exec("ROLLBACK");
    throw erreur;
  }
}

/** Applique les migrations manquantes, dans l'ordre, une seule fois chacune. */
export function migrer(base: DatabaseSync, migrations: readonly Migration[]): number {
  base.exec("CREATE TABLE IF NOT EXISTS migration (version INTEGER PRIMARY KEY, nom TEXT NOT NULL, appliquee_le TEXT NOT NULL)");
  const faites = new Set((base.prepare("SELECT version FROM migration").all() as { version: number }[]).map((l) => l.version));
  let appliquees = 0;
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (faites.has(migration.version)) continue;
    transaction(base, () => {
      base.exec(migration.sql);
      base
        .prepare("INSERT INTO migration (version, nom, appliquee_le) VALUES (?, ?, ?)")
        .run(migration.version, migration.nom, new Date().toISOString());
    });
    appliquees += 1;
  }
  return appliquees;
}

const json = (valeur: unknown): string => JSON.stringify(valeur);

/** Dépôt local d'une bibliothèque. Le dossier est portable : `sources/`, `derives/`, `base/`. */
export function ouvrirDepot(dossier: string): Depot {
  for (const sous of Object.values(DOSSIERS_BIBLIOTHEQUE)) mkdirSync(join(dossier, sous), { recursive: true });
  const base = new DatabaseSync(join(dossier, DOSSIERS_BIBLIOTHEQUE.base, "bibliotheque.sqlite"));
  base.exec("PRAGMA journal_mode = WAL");
  base.exec("PRAGMA foreign_keys = ON");
  migrer(base, MIGRATIONS);

  const unique = <T>(requete: string, ...args: unknown[]): T | undefined =>
    (base.prepare(requete).get(...(args as never[])) as T | undefined) ?? undefined;

  const lireVersion = (ligne: Lignes | undefined): VersionDocument | undefined => {
    if (ligne === undefined) return undefined;
    const id = ligne["id"] as string;
    const fichiers = (base.prepare("SELECT empreinte FROM version_fichier WHERE version_id = ? ORDER BY rang").all(id) as Lignes[]).map(
      (l) => l["empreinte"] as string,
    );
    const outils = (base.prepare("SELECT nom, version FROM version_outil WHERE version_id = ?").all(id) as Lignes[]).map((l) => ({
      nom: l["nom"] as string,
      version: l["version"] as string,
    }));
    const manques = (base.prepare("SELECT manque FROM version_manque WHERE version_id = ?").all(id) as Lignes[]).map(
      (l) => l["manque"] as string,
    );
    return VersionDocument.parse({
      id,
      documentId: ligne["document_id"],
      numero: ligne["numero"],
      etat: ligne["etat"],
      active: ligne["active"] === 1,
      fichiers,
      recette: { id: ligne["recette_id"], version: ligne["recette_ver"] },
      outils,
      manques,
      ...(ligne["precedente_id"] === null ? {} : { precedenteId: ligne["precedente_id"] }),
      creeLe: ligne["cree_le"],
    });
  };

  const lireTravail = (ligne: Lignes | undefined): Travail | undefined => {
    if (ligne === undefined) return undefined;
    const peutEtreNul = (valeur: unknown) => (valeur === null ? undefined : JSON.parse(valeur as string));
    return Travail.parse({
      id: ligne["id"],
      outil: { nom: ligne["outil_nom"], version: ligne["outil_version"] },
      versionCible: ligne["version_cible"],
      etat: ligne["etat"],
      lieu: ligne["lieu"],
      ...(ligne["empreinte_entree"] === null ? {} : { empreinteEntree: ligne["empreinte_entree"] }),
      tentative: ligne["tentative"],
      progression: ligne["progression"],
      ...(ligne["verrou"] === null ? {} : { verrou: peutEtreNul(ligne["verrou"]) }),
      ...(ligne["point_reprise"] === null ? {} : { pointReprise: peutEtreNul(ligne["point_reprise"]) }),
      ...(ligne["erreur"] === null ? {} : { erreur: peutEtreNul(ligne["erreur"]) }),
      creeLe: ligne["cree_le"],
      majLe: ligne["maj_le"],
    });
  };

  const lireDocument = (ligne: Lignes | undefined): Document | undefined => {
    if (ligne === undefined) return undefined;
    const alias = (
      base.prepare("SELECT alias FROM document_alias WHERE document_id = ?").all(ligne["id"] as string) as Lignes[]
    ).map((l) => l["alias"] as string);
    return Document.parse({
      id: ligne["id"],
      bibliothequeId: ligne["bibliotheque_id"],
      titre: ligne["titre"],
      alias,
      creeLe: ligne["cree_le"],
    });
  };

  const enregistrerVersion = (version: VersionDocument): void =>
    transaction(base, () => {
    base
      .prepare(
        `INSERT INTO version (id, document_id, numero, etat, active, recette_id, recette_ver, precedente_id, cree_le)
         VALUES (@id, @documentId, @numero, @etat, @active, @recetteId, @recetteVer, @precedenteId, @creeLe)
         ON CONFLICT(id) DO UPDATE SET etat = @etat, active = @active, precedente_id = @precedenteId`,
      )
      .run({
        id: version.id,
        documentId: version.documentId,
        numero: version.numero,
        etat: version.etat,
        active: version.active ? 1 : 0,
        recetteId: version.recette.id,
        recetteVer: version.recette.version,
        precedenteId: version.precedenteId ?? null,
        creeLe: version.creeLe,
      });
    base.prepare("DELETE FROM version_fichier WHERE version_id = ?").run(version.id);
    version.fichiers.forEach((empreinte, rang) =>
      base.prepare("INSERT INTO version_fichier (version_id, empreinte, rang) VALUES (?, ?, ?)").run(version.id, empreinte, rang),
    );
    base.prepare("DELETE FROM version_outil WHERE version_id = ?").run(version.id);
    for (const outil of version.outils)
      base.prepare("INSERT INTO version_outil (version_id, nom, version) VALUES (?, ?, ?)").run(version.id, outil.nom, outil.version);
    base.prepare("DELETE FROM version_manque WHERE version_id = ?").run(version.id);
      for (const manque of version.manques)
        base.prepare("INSERT INTO version_manque (version_id, manque) VALUES (?, ?)").run(version.id, manque);
    });

  /** Activation atomique et réversible : l'ancienne et la nouvelle changent dans la même
   *  transaction, et l'ancienne reste là pour qu'on puisse revenir (ID-04, ID-05, JOB-06). */
  const activerVersion = (id: string): void =>
    transaction(base, () => {
      const ligne = unique<Lignes>("SELECT document_id FROM version WHERE id = ?", id);
      if (ligne === undefined) throw new Error(`Version inconnue : ${id}`);
      base.prepare("UPDATE version SET active = 0 WHERE document_id = ?").run(ligne["document_id"] as string);
      base.prepare("UPDATE version SET active = 1 WHERE id = ?").run(id);
    });

  return {
    async enregistrerFichier(fichier) {
      base
        .prepare(
          `INSERT INTO fichier (empreinte, taille, type_mime, nom_origine, ajoute_le, appareil_id)
           VALUES (@empreinte, @taille, @typeMime, @nomOrigine, @ajouteLe, @appareilId)
           ON CONFLICT(empreinte) DO NOTHING`,
        )
        .run(fichier);
    },
    async fichier(empreinte: Empreinte) {
      const ligne = unique<Lignes>("SELECT * FROM fichier WHERE empreinte = ?", empreinte);
      return ligne === undefined
        ? undefined
        : Fichier.parse({
            empreinte: ligne["empreinte"],
            taille: ligne["taille"],
            typeMime: ligne["type_mime"],
            nomOrigine: ligne["nom_origine"],
            ajouteLe: ligne["ajoute_le"],
            appareilId: ligne["appareil_id"],
          });
    },
    async fichiers() {
      const lignes = base.prepare("SELECT empreinte FROM fichier ORDER BY ajoute_le").all() as Lignes[];
      const tous = await Promise.all(lignes.map((l) => this.fichier(l["empreinte"] as Empreinte)));
      return tous.filter((f): f is Fichier => f !== undefined);
    },

    async enregistrerDocument(document) {
      base
        .prepare(
          `INSERT INTO document (id, bibliotheque_id, titre, cree_le) VALUES (@id, @bibliothequeId, @titre, @creeLe)
           ON CONFLICT(id) DO UPDATE SET titre = @titre`,
        )
        .run({ id: document.id, bibliothequeId: document.bibliothequeId, titre: document.titre, creeLe: document.creeLe });
      base.prepare("DELETE FROM document_alias WHERE document_id = ?").run(document.id);
      for (const alias of document.alias)
        base.prepare("INSERT INTO document_alias (alias, document_id) VALUES (?, ?)").run(alias, document.id);
    },
    async document(id: Identifiant) {
      return lireDocument(unique<Lignes>("SELECT * FROM document WHERE id = ?", id));
    },
    async documentParAlias(alias: string) {
      const ligne = unique<Lignes>(
        "SELECT d.* FROM document d JOIN document_alias a ON a.document_id = d.id WHERE a.alias = ?",
        alias,
      );
      return lireDocument(ligne);
    },
    async documents() {
      const lignes = base.prepare("SELECT * FROM document ORDER BY cree_le").all() as Lignes[];
      return lignes.map(lireDocument).filter((d): d is Document => d !== undefined);
    },

    async enregistrerVersion(version) {
      enregistrerVersion(version);
    },
    async version(id: Identifiant) {
      return lireVersion(unique<Lignes>("SELECT * FROM version WHERE id = ?", id));
    },
    async versions(documentId: Identifiant) {
      const lignes = base.prepare("SELECT * FROM version WHERE document_id = ? ORDER BY numero").all(documentId) as Lignes[];
      return lignes.map(lireVersion).filter((v): v is VersionDocument => v !== undefined);
    },
    async versionActive(documentId: Identifiant) {
      return lireVersion(unique<Lignes>("SELECT * FROM version WHERE document_id = ? AND active = 1", documentId));
    },
    async activerVersion(id: Identifiant) {
      activerVersion(id);
    },

    async enregistrerAncre(ancre) {
      base
        .prepare(
          `INSERT INTO ancre (id, version_id, fichier, selecteur) VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET selecteur = excluded.selecteur`,
        )
        .run(ancre.id, ancre.versionId, ancre.fichier, json(ancre.selecteur));
    },
    async ancres(versionId: Identifiant) {
      const lignes = base.prepare("SELECT * FROM ancre WHERE version_id = ? ORDER BY id").all(versionId) as Lignes[];
      return lignes.map((l) =>
        Ancre.parse({ id: l["id"], versionId: l["version_id"], fichier: l["fichier"], selecteur: JSON.parse(l["selecteur"] as string) }),
      );
    },
    async enregistrerLien(lien) {
      base
        .prepare(
          `INSERT INTO lien (id, de, vers, nature, preuve, confiance, auteur) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET confiance = excluded.confiance, preuve = excluded.preuve`,
        )
        .run(lien.id, lien.de, lien.vers, lien.nature, lien.preuve, lien.confiance, json(lien.auteur));
    },
    async liens(ancreId: Identifiant) {
      const lignes = base.prepare("SELECT * FROM lien WHERE de = ? OR vers = ? ORDER BY id").all(ancreId, ancreId) as Lignes[];
      return lignes.map(
        (l) =>
          ({
            id: l["id"],
            de: l["de"],
            vers: l["vers"],
            nature: l["nature"],
            preuve: l["preuve"],
            confiance: l["confiance"],
            auteur: JSON.parse(l["auteur"] as string),
          }) as Lien,
      );
    },
    async enregistrerCarte(carte) {
      base
        .prepare(
          `INSERT INTO carte_synchro (id, version_id, media, paires) VALUES (?, ?, ?, ?)
           ON CONFLICT(version_id) DO UPDATE SET media = excluded.media, paires = excluded.paires`,
        )
        .run(carte.id, carte.versionId, carte.media, json(carte.paires));
    },
    async carte(versionId: Identifiant) {
      const ligne = unique<Lignes>("SELECT * FROM carte_synchro WHERE version_id = ?", versionId);
      return ligne === undefined
        ? undefined
        : CarteSynchro.parse({
            id: ligne["id"],
            versionId: ligne["version_id"],
            media: ligne["media"],
            paires: JSON.parse(ligne["paires"] as string),
          });
    },

    async enregistrerTravail(travail) {
      base
        .prepare(
          `INSERT INTO travail (id, outil_nom, outil_version, version_cible, etat, lieu, empreinte_entree,
                                tentative, progression, verrou, point_reprise, erreur, cree_le, maj_le)
           VALUES (@id, @outilNom, @outilVersion, @versionCible, @etat, @lieu, @empreinteEntree,
                   @tentative, @progression, @verrou, @pointReprise, @erreur, @creeLe, @majLe)
           ON CONFLICT(id) DO UPDATE SET etat = @etat, tentative = @tentative, progression = @progression,
             verrou = @verrou, point_reprise = @pointReprise, erreur = @erreur, maj_le = @majLe`,
        )
        .run({
          id: travail.id,
          outilNom: travail.outil.nom,
          outilVersion: travail.outil.version,
          versionCible: travail.versionCible,
          etat: travail.etat,
          lieu: travail.lieu,
          empreinteEntree: travail.empreinteEntree ?? null,
          tentative: travail.tentative,
          progression: travail.progression,
          verrou: travail.verrou === undefined ? null : json(travail.verrou),
          pointReprise: travail.pointReprise === undefined ? null : json(travail.pointReprise),
          erreur: travail.erreur === undefined ? null : json(travail.erreur),
          creeLe: travail.creeLe,
          majLe: travail.majLe,
        });
    },
    async travail(id: Identifiant) {
      return lireTravail(unique<Lignes>("SELECT * FROM travail WHERE id = ?", id));
    },
    async travaux() {
      const lignes = base.prepare("SELECT * FROM travail ORDER BY cree_le").all() as Lignes[];
      return lignes.map(lireTravail).filter((t): t is Travail => t !== undefined);
    },

    async journaliserIndexation(ligne) {
      base
        .prepare(
          `INSERT INTO journal_indexation (index_nom, objet_id, etape, maj_le) VALUES (?, ?, ?, ?)
           ON CONFLICT(index_nom, objet_id, etape) DO UPDATE SET maj_le = excluded.maj_le`,
        )
        .run(ligne.index, ligne.objetId, ligne.etape, ligne.majLe);
    },
    async journalIndexation(index: string) {
      const lignes = base.prepare("SELECT * FROM journal_indexation WHERE index_nom = ? ORDER BY maj_le").all(index) as Lignes[];
      return lignes.map((l) =>
        LigneJournalIndexation.parse({ index: l["index_nom"], objetId: l["objet_id"], etape: l["etape"], majLe: l["maj_le"] }),
      );
    },

    async enregistrerSchema(schema) {
      base
        .prepare(
          `INSERT INTO schema_bibliotheque (cle, version, contenu) VALUES (?, ?, ?)
           ON CONFLICT(cle) DO UPDATE SET version = excluded.version, contenu = excluded.contenu`,
        )
        .run(schema.cle, schema.version, json(schema));
    },
    async schema() {
      const ligne = unique<Lignes>("SELECT contenu FROM schema_bibliotheque ORDER BY cle LIMIT 1");
      return ligne === undefined ? undefined : SchemaBibliotheque.parse(JSON.parse(ligne["contenu"] as string));
    },
    async enregistrerClassement(classement) {
      base
        .prepare(
          `INSERT INTO classement (document_id, schema_cle, schema_version, axes) VALUES (?, ?, ?, ?)
           ON CONFLICT(document_id) DO UPDATE SET schema_cle = excluded.schema_cle,
             schema_version = excluded.schema_version, axes = excluded.axes`,
        )
        .run(classement.documentId, classement.schema, classement.schemaVersion, json(classement.axes));
    },
    async classement(documentId: Identifiant) {
      const ligne = unique<Lignes>("SELECT * FROM classement WHERE document_id = ?", documentId);
      return ligne === undefined
        ? undefined
        : ClassementDocument.parse({
            documentId: ligne["document_id"],
            schema: ligne["schema_cle"],
            schemaVersion: ligne["schema_version"],
            axes: JSON.parse(ligne["axes"] as string),
          });
    },

    fermer() {
      base.close();
    },
  };
}

/** Registre des bibliothèques de cet ordinateur : où elles vivent, rien de plus. */
export type Registre = {
  readonly inscrire: (entree: { cle: string; nom: string; dossier: string }) => void;
  readonly bibliotheques: () => readonly { cle: string; nom: string; dossier: string; creeLe: string }[];
  readonly fermer: () => void;
};

export function ouvrirRegistre(chemin: string): Registre {
  const base = new DatabaseSync(chemin);
  migrer(base, MIGRATIONS_REGISTRE);
  return {
    inscrire({ cle, nom, dossier }) {
      base
        .prepare(
          `INSERT INTO bibliotheque (cle, nom, dossier, cree_le) VALUES (?, ?, ?, ?)
           ON CONFLICT(cle) DO UPDATE SET nom = excluded.nom, dossier = excluded.dossier`,
        )
        .run(cle, nom, dossier, new Date().toISOString());
    },
    bibliotheques() {
      return (base.prepare("SELECT * FROM bibliotheque ORDER BY nom").all() as Lignes[]).map((l) => ({
        cle: l["cle"] as string,
        nom: l["nom"] as string,
        dossier: l["dossier"] as string,
        creeLe: l["cree_le"] as string,
      }));
    },
    fermer() {
      base.close();
    },
  };
}
