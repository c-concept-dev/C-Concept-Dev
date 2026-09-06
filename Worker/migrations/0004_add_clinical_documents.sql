-- Migration number: 0004
--
-- UX-10A Étape 2 — persistance réelle d'un ClinicalDocument (Fiche synthèse, Carrousel, etc.)
-- avec historique de versions. Avant ce lot, un document généré ne vivait que dans le
-- navigateur (window._adocArtifacts) et disparaissait à la fermeture de l'onglet — confirmé par
-- l'investigation de l'Étape 1. Base indispensable avant UX-9A (correction ciblée), qui a besoin
-- d'un document persisté à corriger.
--
-- Suppression : manuelle explicite uniquement (DELETE /clinical-documents/:id), jamais de purge
-- automatique par durée — politique déjà tranchée avec Christophe, non rouverte ici. La jauge
-- d'usage D1/R2 (UX-10A Étape 1) existe précisément pour qu'il sache quand agir lui-même.
--
-- Migration de schéma future (§4 de la demande) : `schema_version` (repris de `schemaVersion`
-- du ClinicalDocument, UX-8A) est stocké sur CHAQUE version, jamais seulement au niveau du
-- document — c'est ce qui permettra, le jour où schemaVersion changera, un aiguillage AU MOMENT
-- DE LA LECTURE d'une version précise (ex. dans le futur handleClinicalDocumentVersionGet :
-- `if (row.schema_version < CURRENT_SCHEMA_VERSION) { /* migrer content_json avant de le
-- retourner */ }`), jamais une perte silencieuse. Rien à migrer aujourd'hui : schemaVersion=1
-- partout, aucune ancienne version en circulation — voir handleClinicalDocumentVersionGet dans
-- Worker/index.js pour le point d'ancrage exact laissé en commentaire.

-- Le document en tant qu'entité stable (identité + pointeur vers sa version courante).
-- current_version_id nullable pour robustesse (ne devrait normalement jamais rester NULL une
-- fois une première version créée — POST /clinical-documents crée document + version 1 dans le
-- même appel), mais la contrainte n'est pas NOT NULL pour ne jamais bloquer une insertion
-- défensive si l'ordre d'écriture devait un jour changer.
CREATE TABLE IF NOT EXISTS clinical_documents (
  document_id           TEXT PRIMARY KEY,
  current_version_id    TEXT REFERENCES clinical_document_versions(version_id),
  title                 TEXT NOT NULL,
  document_kind         TEXT NOT NULL CHECK (document_kind IN ('fiche','carrousel','tableau','script','liens')),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Chaque version, immuable une fois créée (jamais d'UPDATE sur une ligne existante de cette
-- table — une correction crée toujours une NOUVELLE ligne, jamais une modification en place).
CREATE TABLE IF NOT EXISTS clinical_document_versions (
  version_id            TEXT PRIMARY KEY,
  document_id           TEXT NOT NULL REFERENCES clinical_documents(document_id),
  previous_version_id   TEXT REFERENCES clinical_document_versions(version_id),
  schema_version        INTEGER NOT NULL,
  content_json          TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  change_summary        TEXT
);

CREATE INDEX IF NOT EXISTS idx_clinical_document_versions_document_id ON clinical_document_versions(document_id);
