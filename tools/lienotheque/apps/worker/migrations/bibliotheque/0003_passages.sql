-- Engendré depuis packages/depot-sqlite/src/migrations.ts — NE PAS MODIFIER ICI.
-- Base : bibliotheque · migration 3 « passages »
-- Pour changer le schéma : ajoutez une migration au tableau, puis « pnpm build ».

-- Le texte d'un passage, là où une requête peut l'atteindre.
--
-- Jusqu'ici le texte lisible d'une bibliothèque vivait dans la vue — un fichier JSON à
-- côté de la base — et la recherche locale le parcourait en entier. C'est tenable pour une
-- bibliothèque ouverte sur un ordinateur ; ça ne l'est pas pour une bibliothèque servie,
-- où chaque requête devrait rapatrier la vue entière avant de chercher dedans.
--
-- La façade de compatibilité le réclame en clair : elle doit rendre un champ « content ».
-- Un texte qui n'existe que dans un fichier JSON ne se cherche pas en SQL.
--
-- Ce n'est pas un second magasin à tenir à jour à la main : la table est **produite** à
-- partir de la vue au moment où une version est activée, et refaite si la version change.
-- La vue reste ce qui fait foi.
CREATE TABLE passage (
  id          TEXT PRIMARY KEY,
  version_id  TEXT NOT NULL REFERENCES version(id) ON DELETE CASCADE,
  ancre_id    TEXT REFERENCES ancre(id) ON DELETE SET NULL,
  rang        INTEGER NOT NULL,
  texte       TEXT NOT NULL,
  UNIQUE (version_id, rang)
);
CREATE INDEX idx_passage_version ON passage(version_id);
CREATE INDEX idx_passage_ancre ON passage(ancre_id);
