-- Présentation : élargissement du CHECK, schéma de stockage uniquement.
-- Patron 0011 : reconstruire le référenceur sans FK, reconstruire la cible,
-- puis restituer le référenceur et ses contraintes. Ici les références sont
-- circulaires : différer leur contrôle et réinsérer APRES chaque DROP/CREATE
-- de versions résout les références courantes (un simple RENAME ne suffit pas).
-- Exécuter dans la transaction englobante de D1. Ne pas désactiver foreign_keys.
-- AVANT APPLICATION : comparer sqlite_master de production à l'inventaire testé ;
-- tout index/déclencheur supplémentaire impose de réviser cette migration.
PRAGMA defer_foreign_keys=ON;

CREATE TABLE clinical_versions_0015_backup AS SELECT * FROM clinical_document_versions;
DROP TABLE clinical_document_versions;
CREATE TABLE clinical_document_versions (
  version_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  previous_version_id TEXT,
  schema_version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  change_summary TEXT,
  generation_engine TEXT NOT NULL DEFAULT 'structured' CHECK (generation_engine IN ('structured','legacy-html'))
);
INSERT INTO clinical_document_versions SELECT * FROM clinical_versions_0015_backup;

CREATE TABLE clinical_documents_0015_new (
  document_id TEXT PRIMARY KEY,
  current_version_id TEXT REFERENCES clinical_document_versions(version_id),
  title TEXT NOT NULL,
  document_kind TEXT NOT NULL CHECK (document_kind IN ('fiche','carrousel','tableau','script','liens','presentation')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  generation_engine TEXT NOT NULL DEFAULT 'structured' CHECK (generation_engine IN ('structured','legacy-html')),
  thumbnail_asset_id TEXT
);
INSERT INTO clinical_documents_0015_new
  SELECT document_id,current_version_id,title,document_kind,created_at,generation_engine,thumbnail_asset_id FROM clinical_documents;
DROP TABLE clinical_documents;
ALTER TABLE clinical_documents_0015_new RENAME TO clinical_documents;

DROP TABLE clinical_document_versions;
CREATE TABLE clinical_document_versions (
  version_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES clinical_documents(document_id),
  previous_version_id TEXT REFERENCES clinical_document_versions(version_id),
  schema_version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  change_summary TEXT,
  generation_engine TEXT NOT NULL DEFAULT 'structured' CHECK (generation_engine IN ('structured','legacy-html'))
);
INSERT INTO clinical_document_versions
  SELECT version_id,document_id,previous_version_id,schema_version,content_json,created_at,change_summary,generation_engine FROM clinical_versions_0015_backup;
CREATE INDEX idx_clinical_document_versions_document_id ON clinical_document_versions(document_id);
DROP TABLE clinical_versions_0015_backup;
-- Laisser defer_foreign_keys actif jusqu'au COMMIT : ne pas masquer une violation.
