-- Migration number: 0013
--
-- Panneau "Médias" — sous-onglet "Vidéos" : liens vidéo LOCAUX (servis par un programme séparé sur
-- l'ordinateur de l'utilisatrice, ex. http://localhost:47823/...), jamais un fichier réellement
-- téléversé. Investigation préalable de ce lot : render_assets (checksum/r2_key/mime_type/
-- size_bytes, tous NOT NULL) modélise strictement "des octets réellement détenus dans le bucket
-- R2 BRAND_ASSETS" — un lien local, jamais fetchable par le Worker (localhost pointe la machine de
-- l'utilisatrice, pas Cloudflare), n'a JAMAIS de tels octets à décrire. Forcer ce cas dans
-- render_assets détournerait un contrat pensé pour un vrai binaire (et un `role` de plus dans son
-- CHECK n'y changerait rien : les colonnes NOT NULL resteraient sans valeur légitime). Table
-- séparée, volontairement minimale : seuls l'url et le titre donnés par l'utilisatrice ont un sens
-- à conserver ici.
CREATE TABLE IF NOT EXISTS video_links (
  id         TEXT PRIMARY KEY,
  url        TEXT NOT NULL,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
