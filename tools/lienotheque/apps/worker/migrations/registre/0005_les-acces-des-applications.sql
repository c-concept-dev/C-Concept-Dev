-- Engendré depuis packages/depot-sqlite/src/migrations.ts — NE PAS MODIFIER ICI.
-- Base : registre · migration 5 « les-acces-des-applications »
-- Pour changer le schéma : ajoutez une migration au tableau, puis « pnpm build ».

-- Un secret d'application n'est jamais rangé : seule son empreinte permet de le reconnaître.
-- Une ligne désigne exactement une bibliothèque et se retire sans atteindre les autres.
CREATE TABLE jeton_application (
  id            TEXT PRIMARY KEY,
  application   TEXT NOT NULL,
  nom           TEXT NOT NULL,
  bibliotheque  TEXT NOT NULL REFERENCES bibliotheque_publiee(cle) ON DELETE RESTRICT,
  empreinte     TEXT NOT NULL UNIQUE,
  cree_par      TEXT NOT NULL,
  cree_le       TEXT NOT NULL,
  expire_le     TEXT NOT NULL,
  revoque_le    TEXT
);
CREATE INDEX idx_jeton_application_bibliotheque ON jeton_application(bibliotheque);
CREATE INDEX idx_jeton_application_expire ON jeton_application(expire_le);

-- Les capacités sont des cases explicites, pas le niveau large des personnes. La
-- contrainte ferme aussi la porte à un mot ajouté à la main dans la base.
CREATE TABLE jeton_application_action (
  jeton_id TEXT NOT NULL REFERENCES jeton_application(id) ON DELETE CASCADE,
  action   TEXT NOT NULL CHECK (action IN ('lire', 'chercher', 'ouvrir_fichier')),
  PRIMARY KEY (jeton_id, action)
);
