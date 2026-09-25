-- Migration number: 0011
--
-- UX-10B — élargit render_assets.role pour accepter 'thumbnail' en plus de
-- 'logo'/'font'/'image'/'reference' (migrations 0001/0003). Nécessaire pour persister la
-- miniature réelle d'un document enregistré ("Mes créations") via le même mécanisme de
-- persistance déjà éprouvé (adocPersistRenderAsset, POST /brand-assets/upload) — jamais une
-- deuxième table ou un deuxième bucket pour un simple rôle supplémentaire. Une miniature n'est
-- ni un logo, ni une police, ni une image de contenu consommée par le rendu d'un document
-- (role='image', panneau Médias), ni un document de référence archivé (role='reference') :
-- c'est un dérivé visuel du document lui-même, généré côté serveur (Browser Rendering), jamais
-- fourni par l'utilisatrice — un rôle distinct évite tout mélange avec les listes/historiques
-- déjà filtrés par role='image' (GET /media-assets, panneau Médias).
--
-- SQLite ne permet pas d'ALTER TABLE un CHECK existant : reconstruction de la table (schéma
-- identique par ailleurs), copie des lignes existantes, puis bascule — MÊME patron que la
-- migration 0003, aucune ligne perdue, aucune colonne renommée.

PRAGMA foreign_keys=OFF;

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

PRAGMA foreign_keys=ON;
