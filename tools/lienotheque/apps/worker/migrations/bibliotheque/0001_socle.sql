-- Engendré depuis packages/depot-sqlite/src/migrations.ts — NE PAS MODIFIER ICI.
-- Base : bibliotheque · migration 1 « socle »
-- Pour changer le schéma : ajoutez une migration au tableau, puis « pnpm build ».

CREATE TABLE fichier (
  empreinte   TEXT PRIMARY KEY,
  taille      INTEGER NOT NULL,
  type_mime   TEXT NOT NULL,
  nom_origine TEXT NOT NULL,
  ajoute_le   TEXT NOT NULL,
  appareil_id TEXT NOT NULL
);

CREATE TABLE document (
  id              TEXT PRIMARY KEY,
  bibliotheque_id TEXT NOT NULL,
  titre           TEXT NOT NULL,
  cree_le         TEXT NOT NULL
);

CREATE TABLE document_alias (
  alias       TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE
);
CREATE INDEX idx_alias_document ON document_alias(document_id);

CREATE TABLE version (
  id            TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  numero        INTEGER NOT NULL,
  etat          TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 0,
  recette_id    TEXT NOT NULL,
  recette_ver   INTEGER NOT NULL,
  precedente_id TEXT,
  cree_le       TEXT NOT NULL,
  UNIQUE (document_id, numero)
);
CREATE INDEX idx_version_document ON version(document_id);
-- Une seule version active par document : la contrainte vit dans la base, pas dans le code.
CREATE UNIQUE INDEX idx_version_active ON version(document_id) WHERE active = 1;

CREATE TABLE version_fichier (
  version_id TEXT NOT NULL REFERENCES version(id) ON DELETE CASCADE,
  empreinte  TEXT NOT NULL REFERENCES fichier(empreinte),
  rang       INTEGER NOT NULL,
  PRIMARY KEY (version_id, rang)
);

CREATE TABLE version_outil (
  version_id TEXT NOT NULL REFERENCES version(id) ON DELETE CASCADE,
  nom        TEXT NOT NULL,
  version    TEXT NOT NULL,
  PRIMARY KEY (version_id, nom, version)
);

CREATE TABLE version_manque (
  version_id TEXT NOT NULL REFERENCES version(id) ON DELETE CASCADE,
  manque     TEXT NOT NULL,
  PRIMARY KEY (version_id, manque)
);

CREATE TABLE ancre (
  id          TEXT PRIMARY KEY,
  version_id  TEXT NOT NULL REFERENCES version(id) ON DELETE CASCADE,
  fichier     TEXT NOT NULL,
  selecteur   TEXT NOT NULL
);
CREATE INDEX idx_ancre_version ON ancre(version_id);

CREATE TABLE lien (
  id        TEXT PRIMARY KEY,
  de        TEXT NOT NULL,
  vers      TEXT NOT NULL,
  nature    TEXT NOT NULL,
  preuve    TEXT NOT NULL,
  confiance REAL NOT NULL,
  auteur    TEXT NOT NULL
);
CREATE INDEX idx_lien_de ON lien(de);
CREATE INDEX idx_lien_vers ON lien(vers);

CREATE TABLE carte_synchro (
  id         TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES version(id) ON DELETE CASCADE,
  media      TEXT NOT NULL,
  paires     TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_carte_version ON carte_synchro(version_id);

CREATE TABLE schema_bibliotheque (
  cle     TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  contenu TEXT NOT NULL
);

CREATE TABLE classement (
  document_id    TEXT PRIMARY KEY REFERENCES document(id) ON DELETE CASCADE,
  schema_cle     TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  axes           TEXT NOT NULL
);
