-- Migration number: 0014
--
-- Panneau "Médias", sous-onglet "Vidéos" — LOT VIDÉO-1 : prépare le stockage Cloudflare réel
-- (Lot Vidéo-2, hors périmètre de ce lot) sans effet sur les lignes existantes ni sur ce que ce
-- lot produit lui-même (uniquement des liens locaux). Investigation préalable de ce chantier :
-- extension de video_links retenue plutôt qu'une 3ᵉ table ou la réutilisation de render_assets
-- (qui n'a pas de colonne `title`, pourtant essentielle ici, et dont élargir le CHECK de rôle
-- exigerait la reconstruction lourde déjà vue aux migrations 0003/0011) — /video-links reste
-- l'unique surface pour les deux origines, jamais deux sources à fusionner côté Worker.
--
-- Six ALTER TABLE ADD COLUMN simples (même technique, la plus sûre, que la migration 0010 pour
-- render_assets.attribution) : aucune reconstruction de table, aucun CHECK existant à toucher.
-- Toute ligne déjà existante reste storage_type='local' (valeur par défaut), les 5 autres
-- colonnes neuves à NULL — non-régression garantie par construction, aucune ligne à migrer.
--
-- storage_type porte son propre CHECK (colonne neuve, jamais un ALTER d'un CHECK existant).
-- checksum/r2_key/mime_type/size_bytes restent NULL tant qu'aucune ligne n'est 'cloudflare'
-- (Lot Vidéo-2). attribution, en revanche, est utilisée dès ce lot (crédit vidéaste Pexels,
-- même obligation déjà tenue pour les photos sur render_assets.attribution).

ALTER TABLE video_links ADD COLUMN storage_type TEXT NOT NULL DEFAULT 'local' CHECK (storage_type IN ('local','cloudflare'));
ALTER TABLE video_links ADD COLUMN checksum   TEXT;
ALTER TABLE video_links ADD COLUMN r2_key     TEXT;
ALTER TABLE video_links ADD COLUMN mime_type  TEXT;
ALTER TABLE video_links ADD COLUMN size_bytes INTEGER;
ALTER TABLE video_links ADD COLUMN attribution TEXT;
