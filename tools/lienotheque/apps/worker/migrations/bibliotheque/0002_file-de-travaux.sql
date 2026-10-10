-- Engendré depuis packages/depot-sqlite/src/migrations.ts — NE PAS MODIFIER ICI.
-- Base : bibliotheque · migration 2 « file-de-travaux »
-- Pour changer le schéma : ajoutez une migration au tableau, puis « pnpm build ».

CREATE TABLE travail (
  id               TEXT PRIMARY KEY,
  outil_nom        TEXT NOT NULL,
  outil_version    TEXT NOT NULL,
  version_cible    TEXT NOT NULL,
  etat             TEXT NOT NULL,
  lieu             TEXT NOT NULL,
  empreinte_entree TEXT,
  tentative        INTEGER NOT NULL,
  progression      REAL NOT NULL,
  verrou           TEXT,
  point_reprise    TEXT,
  erreur           TEXT,
  cree_le          TEXT NOT NULL,
  maj_le           TEXT NOT NULL
);
CREATE INDEX idx_travail_etat ON travail(etat);
-- Une seule demande identique en file à la fois (JOB-04).
CREATE UNIQUE INDEX idx_travail_entree ON travail(empreinte_entree)
  WHERE empreinte_entree IS NOT NULL AND etat NOT IN ('termine', 'annule', 'en_echec_definitif');

CREATE TABLE journal_indexation (
  index_nom TEXT NOT NULL,
  objet_id  TEXT NOT NULL,
  etape     TEXT NOT NULL,
  maj_le    TEXT NOT NULL,
  PRIMARY KEY (index_nom, objet_id, etape)
);
CREATE INDEX idx_journal_index ON journal_indexation(index_nom);
