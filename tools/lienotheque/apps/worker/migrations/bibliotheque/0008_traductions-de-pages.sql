-- Engendré depuis packages/depot-sqlite/src/migrations.ts — NE PAS MODIFIER ICI.
-- Base : bibliotheque · migration 8 « traductions-de-pages »
-- Pour changer le schéma : ajoutez une migration au tableau, puis « pnpm build ».

-- Cache des traductions demandées dans le Lecteur en ligne (OUT-11).
--
-- Une ligne n'existe qu'après la réussite de tous les segments de la page. L'empreinte
-- invalide naturellement la ligne si le texte canonique change, sans créer un second
-- magasin de contenu. La suppression d'une version emporte son cache.
CREATE TABLE traduction_page (
  -- La version appartient à l'instantané publié dans R2. La D1 de façade ne recopie pas
  -- ces 243 documents : elle ne peut donc pas porter ici une clé étrangère vers la table version.
  version_id       TEXT NOT NULL,
  page             INTEGER NOT NULL CHECK (page > 0),
  langue_source    TEXT NOT NULL,
  langue_cible     TEXT NOT NULL CHECK (langue_cible = 'fr'),
  empreinte_source TEXT NOT NULL,
  modele           TEXT NOT NULL,
  traductions      TEXT NOT NULL,
  cree_le          TEXT NOT NULL,
  PRIMARY KEY (version_id, page, langue_cible)
);
