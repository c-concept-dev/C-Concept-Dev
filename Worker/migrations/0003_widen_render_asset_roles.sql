-- Migration number: 0003 	 2026-09-05T16:33:19.852Z
--
-- UX-8B Lot 3 — élargit render_assets.role pour accepter 'reference' en plus de
-- 'logo'/'font'/'image' (migration 0001). Nécessaire pour stocker le PDF ORIGINAL d'une charte
-- importée via /brand-assets/upload (réutilisation telle quelle du mécanisme de déduplication
-- SHA-256, cf. CDC UX-8B : "sourceAssetId/sourceChecksum/provenance... jamais embarqué
-- directement dans la ligne brand_kits"). Un PDF de charte n'est ni un logo, ni une police, ni
-- une image consommée par le rendu (renderAssetsSnapshot) : c'est un DOCUMENT DE RÉFÉRENCE,
-- conservé pour la traçabilité/provenance uniquement, jamais réutilisé pour composer un rendu —
-- lui donner le rôle 'image' aurait été trompeur (laisserait croire qu'il peut être consommé par
-- adocRenderClinicalDocument comme un actif visuel, ce qui n'est jamais le cas).
--
-- SQLite ne permet pas d'ALTER TABLE un CHECK existant : reconstruction de la table (schéma
-- identique par ailleurs), copie des lignes existantes, puis bascule — aucune ligne perdue,
-- aucune colonne renommée. Les deux chartes déjà seedées (migrations 0001/0002) ont
-- source_asset_id NULL : rien à migrer sur les données existantes, uniquement le schéma.

PRAGMA foreign_keys=OFF;

CREATE TABLE render_assets_new (
  asset_id      TEXT PRIMARY KEY,
  checksum      TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('logo','font','image','reference')),
  r2_key        TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  ref_count     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO render_assets_new SELECT * FROM render_assets;

DROP TABLE render_assets;
ALTER TABLE render_assets_new RENAME TO render_assets;

CREATE INDEX IF NOT EXISTS idx_render_assets_role ON render_assets(role);

PRAGMA foreign_keys=ON;
