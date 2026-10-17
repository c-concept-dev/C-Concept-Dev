-- Engendré depuis packages/depot-sqlite/src/migrations.ts — NE PAS MODIFIER ICI.
-- Base : registre · migration 1 « registre-en-ligne »
-- Pour changer le schéma : ajoutez une migration au tableau, puis « pnpm build ».

CREATE TABLE bibliotheque_publiee (
  cle            TEXT PRIMARY KEY,
  nom            TEXT NOT NULL,
  -- locale, mixte ou publiee. L'état commande ce que l'interface a le droit d'annoncer
  -- avant confirmation (HEB-01), et il se lit ici plutôt que de se deviner.
  etat           TEXT NOT NULL,
  -- La place prise dans la réserve de liaisons, nulle tant que la bibliothèque n'est pas
  -- servie. Une place ne porte qu'une bibliothèque : la contrainte vit dans la base.
  liaison        TEXT,
  prefixe        TEXT NOT NULL UNIQUE,
  -- Choisie explicitement à la création, jamais implicite (HEB-05).
  region         TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  publiee_le     TEXT,
  maj_le         TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_registre_liaison ON bibliotheque_publiee(liaison) WHERE liaison IS NOT NULL;
CREATE INDEX idx_registre_etat ON bibliotheque_publiee(etat);

-- Journal des opérations sensibles (SEC-07) : publication, dépublication, changement
-- d'hébergement, révocation. Chaque ligne dit qui, quoi, quand — et rien ne l'efface.
CREATE TABLE journal_audit (
  id        TEXT PRIMARY KEY,
  objet     TEXT NOT NULL,
  operation TEXT NOT NULL,
  auteur    TEXT NOT NULL,
  detail    TEXT,
  fait_le   TEXT NOT NULL
);
CREATE INDEX idx_audit_objet ON journal_audit(objet);
CREATE INDEX idx_audit_date ON journal_audit(fait_le);
