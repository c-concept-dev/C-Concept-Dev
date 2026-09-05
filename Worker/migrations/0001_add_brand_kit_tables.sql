-- Migration number: 0001 	 2026-09-05T14:34:59.101Z
--
-- UX-8B Lot 1 — infrastructure de stockage pour les chartes graphiques (Clinical Brand Kit).
-- Ce lot ne crée aucun parcours utilisateur : uniquement les deux tables et la ligne de départ
-- (charte pétrole/terracotta déjà en production, jetons repris tels quels de
-- fixtures/tokens-studio-clinique-default-v1.json et du CDC-STUDIO-CLINIQUE-BRANDING.md §11.2).

-- Actifs binaires immuables, dédupliqués par empreinte SHA-256 (asset_id = checksum = clé R2).
-- Créée avant brand_kits, qu'elle référence (source_asset_id) — ordre requis pour la clarté du
-- fichier, même si SQLite n'impose pas l'ordre des tables pour une clé étrangère différée.
-- ref_count présent mais pas encore incrémenté activement (câblage réel une fois les documents
-- eux-mêmes persistés, lot ultérieur) — colonne prête, comportement volontairement différé.
CREATE TABLE IF NOT EXISTS render_assets (
  asset_id      TEXT PRIMARY KEY,
  checksum      TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('logo','font','image')),
  r2_key        TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  ref_count     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS brand_kits (
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

CREATE INDEX IF NOT EXISTS idx_brand_kits_status ON brand_kits(status);
CREATE INDEX IF NOT EXISTS idx_render_assets_role ON render_assets(role);

-- Seed — charte par défaut déjà en production (source_asset_id NULL : codée en dur, pas importée).
-- Sert de point de départ réel pour "au moins 2 chartes sélectionnables" une fois qu'une
-- deuxième charte sera ajoutée dans un lot suivant.
--
-- colors_json : mapping proposé vers le schéma primary/accent/background/text/success/warning/
-- critical demandé pour ce lot. Le CDC de marque (§11.2) ne définit que le chrome de
-- l'application (pétrole/terracotta/ivoire/encre/pierre) : il ne fixe pas de rôles success/
-- warning/critical pour un document. warning reprend la valeur terracotta-700 déjà utilisée par
-- le moteur de rendu existant pour les encarts d'avertissement (adocTokensToCSSVars,
-- --adoc-sc-callout-warning-border). success et critical sont de NOUVELLES valeurs proposées
-- pour ce lot, cohérentes avec la palette mais non actées par un CDC — à valider ou ajuster,
-- aucun écran ne les affiche encore dans ce lot.
INSERT INTO brand_kits (
  id, name, version, colors_json, typography_json, status,
  source_asset_id, source_checksum, source_type, imported_at, provenance_json, created_at
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Studio Clinique — pétrole/terracotta (par défaut)',
  1,
  '{"primary":"#102F31","accent":"#9B4E36","background":"#F6F2EA","text":"#273331","success":"#2F6E52","warning":"#8A3F29","critical":"#A13327"}',
  '{"headingFont":"\"Source Serif 4\", Georgia, serif","bodyFont":"\"IBM Plex Sans\", system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif","minSizes":{"body":"16px","small":"13px","heading1":"28px","heading2":"22px","heading3":"18px"},"spacing":{"lineHeight":"1.5","sectionGap":"2rem","blockGap":"1rem"}}',
  'active',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);
