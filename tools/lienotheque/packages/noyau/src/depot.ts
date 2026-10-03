import type {
  Ancre,
  CarteSynchro,
  ClassementDocument,
  Document,
  Empreinte,
  Fichier,
  Identifiant,
  Lien,
  LigneJournalIndexation,
  SchemaBibliotheque,
  Travail,
  VersionDocument,
} from "@lienotheque/contrats";

/** Port de dépôt : tout ce que le noyau sait demander à un stockage, et rien de plus.
 *
 *  Il ne dit rien de la technique. SQLite le remplit sur l'ordinateur ; D1 le remplira au lot E
 *  avec le même schéma de données. Les méthodes sont asynchrones pour cette raison : un dépôt
 *  distant ne répond jamais tout de suite.
 *
 *  Aucun binaire ne passe par ce port (HEB-02) : les octets vivent dans le dossier de la
 *  bibliothèque, la base ne garde que des empreintes et des chemins relatifs. */
export type Depot = {
  /** Fichiers, identifiés par leur contenu (ID-01). Réenregistrer la même empreinte est sans effet. */
  readonly enregistrerFichier: (fichier: Fichier) => Promise<void>;
  readonly fichier: (empreinte: Empreinte) => Promise<Fichier | undefined>;
  readonly fichiers: () => Promise<readonly Fichier[]>;

  /** Documents et leurs identifiants hérités (ID-02, ID-08). */
  readonly enregistrerDocument: (document: Document) => Promise<void>;
  readonly document: (id: Identifiant) => Promise<Document | undefined>;
  readonly documentParAlias: (alias: string) => Promise<Document | undefined>;
  readonly documents: () => Promise<readonly Document[]>;

  /** Versions (ID-04, ID-05). L'activation est atomique et réversible. */
  readonly enregistrerVersion: (version: VersionDocument) => Promise<void>;
  readonly version: (id: Identifiant) => Promise<VersionDocument | undefined>;
  readonly versions: (documentId: Identifiant) => Promise<readonly VersionDocument[]>;
  readonly versionActive: (documentId: Identifiant) => Promise<VersionDocument | undefined>;
  readonly activerVersion: (id: Identifiant) => Promise<void>;

  /** Ancres, liens et cartes de synchronisation (ANC-01 à ANC-05). */
  readonly enregistrerAncre: (ancre: Ancre) => Promise<void>;
  readonly ancres: (versionId: Identifiant) => Promise<readonly Ancre[]>;
  readonly enregistrerLien: (lien: Lien) => Promise<void>;
  readonly liens: (ancreId: Identifiant) => Promise<readonly Lien[]>;
  readonly enregistrerCarte: (carte: CarteSynchro) => Promise<void>;
  readonly carte: (versionId: Identifiant) => Promise<CarteSynchro | undefined>;

  /** File de travaux (JOB-01 : persistée avant de commencer, JOB-09 : elle survit à l'arrêt). */
  readonly enregistrerTravail: (travail: Travail) => Promise<void>;
  readonly travail: (id: Identifiant) => Promise<Travail | undefined>;
  readonly travaux: () => Promise<readonly Travail[]>;

  /** Journal d'indexation par identifiant (JOB-07). */
  readonly journaliserIndexation: (ligne: LigneJournalIndexation) => Promise<void>;
  readonly journalIndexation: (index: string) => Promise<readonly LigneJournalIndexation[]>;

  /** Nomenclature et classement (CLA). */
  readonly enregistrerSchema: (schema: SchemaBibliotheque) => Promise<void>;
  readonly schema: () => Promise<SchemaBibliotheque | undefined>;
  readonly enregistrerClassement: (classement: ClassementDocument) => Promise<void>;
  readonly classement: (documentId: Identifiant) => Promise<ClassementDocument | undefined>;

  readonly fermer: () => void;
};

/** Agencement d'un dossier de bibliothèque, portable d'une machine à l'autre. */
export const DOSSIERS_BIBLIOTHEQUE = { sources: "sources", derives: "derives", base: "base" } as const;
