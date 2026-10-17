-- Engendré depuis packages/depot-sqlite/src/migrations.ts — NE PAS MODIFIER ICI.
-- Base : registre · migration 2 « qui-entre »
-- Pour changer le schéma : ajoutez une migration au tableau, puis « pnpm build ».

-- Les personnes qui ont le droit d'entrer. Deux, nommées, et pas d'inscription ouverte :
-- une bibliothèque personnelle n'a pas de visiteurs (SEC-02).
CREATE TABLE utilisateur (
  id      TEXT PRIMARY KEY,
  nom     TEXT NOT NULL,
  cree_le TEXT NOT NULL
);

-- Une clé d'accès enrôlée : la partie publique, jamais de secret. Le navigateur garde la
-- partie privée, l'appareil la déverrouille, et rien de tout cela ne traverse le réseau.
CREATE TABLE cle_acces (
  id              TEXT PRIMARY KEY,
  utilisateur_id  TEXT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  cle_publique    TEXT NOT NULL,
  compteur        INTEGER NOT NULL DEFAULT 0,
  appareil        TEXT,
  enrolee_le      TEXT NOT NULL,
  revoquee_le     TEXT
);
CREATE INDEX idx_cle_utilisateur ON cle_acces(utilisateur_id);

-- Une session ouverte sur un appareil de confiance. Quatre-vingt-dix jours, repoussés à
-- chaque usage : c'est ce qui fait qu'on ne ressaisit rien.
--
-- La table garde une **empreinte** du jeton, jamais le jeton : une base lue ne doit pas
-- livrer de quoi se faire passer pour quelqu'un.
CREATE TABLE session (
  id             TEXT PRIMARY KEY,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  empreinte      TEXT NOT NULL UNIQUE,
  appareil       TEXT,
  ouverte_le     TEXT NOT NULL,
  vue_le         TEXT NOT NULL,
  expire_le      TEXT NOT NULL,
  revoquee_le    TEXT
);
CREATE INDEX idx_session_utilisateur ON session(utilisateur_id);
CREATE INDEX idx_session_expire ON session(expire_le);

-- Ce qu'une personne a le droit de faire, bibliothèque par bibliothèque (SEC-03).
CREATE TABLE droit (
  utilisateur_id TEXT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  bibliotheque   TEXT NOT NULL,
  niveau         TEXT NOT NULL,
  PRIMARY KEY (utilisateur_id, bibliotheque)
);
