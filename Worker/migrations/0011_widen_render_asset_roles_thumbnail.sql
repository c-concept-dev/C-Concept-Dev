-- Migration number: 0011
--
-- CORRECTIF (Christophe, test réel en production) — la version précédente de cette migration
-- (DROP TABLE render_assets précédé de PRAGMA foreign_keys=OFF, motif de la migration 0003)
-- échouait réellement contre D1 : `SELECT sql FROM sqlite_master WHERE name='brand_kits'`
-- confirme `source_asset_id TEXT REFERENCES render_assets(asset_id)` (migration 0001), et
-- PRAGMA foreign_keys=OFF s'est révélé un no-op dans le contexte d'exécution D1 réel (tout le
-- fichier de migration s'exécute dans une transaction implicite — la procédure officielle
-- SQLite exige que ce PRAGMA soit posé HORS TRANSACTION, ce qu'un seul fichier D1 ne permet
-- jamais). Migration jamais appliquée en production (l'erreur est levée avant toute écriture).
--
-- PRAGMA defer_foreign_keys=TRUE a aussi été testé (vérifié par reproduction réelle contre le
-- moteur SQLite natif, sous une transaction englobante qui reproduit fidèlement le comportement
-- D1 confirmé) et échoue tout autant, mais plus tard : toutes les instructions passent, puis le
-- COMMIT lui-même échoue — SQLite comptabilise le DROP TABLE d'une table encore référencée comme
-- une violation différée non résolue au moment du commit, même si la table reconstruite sous le
-- même nom satisfait de nouveau la contrainte avec un contenu identique. Aucune manipulation de
-- PRAGMA ne permet donc de contourner ce cas précis à l'intérieur d'une transaction imposée.
--
-- CORRECTIF RETENU, vérifié réel (y compris SANS aucun PRAGMA de clés étrangères, cf. rapport de
-- lot) : ne jamais DROP une table encore activement référencée. brand_kits (le seul référenceur,
-- vérifié — aucune autre table ne référence render_assets par clé étrangère) est reconstruite
-- UNE PREMIÈRE FOIS sans la contrainte, le temps de reconstruire render_assets avec le rôle
-- 'thumbnail' accepté, PUIS reconstruite UNE SECONDE FOIS en réintroduisant la contrainte —
-- render_assets existe alors déjà de nouveau avec les mêmes asset_id qu'avant, et un CREATE
-- TABLE avec une clause REFERENCES ne revalide jamais rétroactivement les lignes déjà
-- présentes en SQLite (seules les écritures futures sont vérifiées). Schéma final de brand_kits
-- strictement identique à la migration 0001 — aucune colonne ajoutée, retirée ni renommée.

PRAGMA foreign_keys=OFF;

-- Étape 1/3 — brand_kits reconstruite SANS la contrainte de clé étrangère (le temps de
-- reconstruire render_assets ci-dessous sans qu'aucune table ne la référence encore).
CREATE TABLE brand_kits_tmp (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  version               INTEGER NOT NULL DEFAULT 1,
  colors_json           TEXT NOT NULL,
  typography_json       TEXT NOT NULL,
  density               TEXT,
  icon_style            TEXT,
  photo_direction       TEXT,
  tone_rules            TEXT,
  visual_prohibitions   TEXT,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','deleted')),
  source_asset_id       TEXT,
  source_checksum       TEXT,
  source_type           TEXT CHECK (source_type IS NULL OR source_type IN ('pptx','pdf','image','font')),
  imported_at           TEXT,
  provenance_json       TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO brand_kits_tmp SELECT * FROM brand_kits;
DROP TABLE brand_kits;
ALTER TABLE brand_kits_tmp RENAME TO brand_kits;

-- Étape 2/3 — render_assets reconstruite avec le rôle 'thumbnail' accepté. Plus aucune table ne
-- la référence à cet instant : ce DROP TABLE ne viole plus aucune contrainte.
CREATE TABLE render_assets_new (
  asset_id      TEXT PRIMARY KEY,
  checksum      TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('logo','font','image','reference','thumbnail')),
  r2_key        TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  ref_count     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  attribution   TEXT
);
INSERT INTO render_assets_new SELECT * FROM render_assets;
DROP TABLE render_assets;
ALTER TABLE render_assets_new RENAME TO render_assets;
CREATE INDEX IF NOT EXISTS idx_render_assets_role ON render_assets(role);

-- Étape 3/3 — brand_kits reconstruite une seconde fois, contrainte de clé étrangère
-- réintroduite. Schéma final strictement identique à la migration 0001.
CREATE TABLE brand_kits_final (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  version               INTEGER NOT NULL DEFAULT 1,
  colors_json           TEXT NOT NULL,
  typography_json       TEXT NOT NULL,
  density               TEXT,
  icon_style            TEXT,
  photo_direction       TEXT,
  tone_rules            TEXT,
  visual_prohibitions   TEXT,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','deleted')),
  source_asset_id       TEXT REFERENCES render_assets(asset_id),
  source_checksum       TEXT,
  source_type           TEXT CHECK (source_type IS NULL OR source_type IN ('pptx','pdf','image','font')),
  imported_at           TEXT,
  provenance_json       TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO brand_kits_final SELECT * FROM brand_kits;
DROP TABLE brand_kits;
ALTER TABLE brand_kits_final RENAME TO brand_kits;
CREATE INDEX IF NOT EXISTS idx_brand_kits_status ON brand_kits(status);

PRAGMA foreign_keys=ON;
