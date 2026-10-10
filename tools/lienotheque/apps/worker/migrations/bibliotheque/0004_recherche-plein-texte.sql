-- Engendré depuis packages/depot-sqlite/src/migrations.ts — NE PAS MODIFIER ICI.
-- Base : bibliotheque · migration 4 « recherche-plein-texte »
-- Pour changer le schéma : ajoutez une migration au tableau, puis « pnpm build ».

-- L'index plein texte des passages.
--
-- Il entre maintenant et non quand la recherche en aura besoin, pour la même raison que la
-- table qu'il indexe : une mécanique découverte nécessaire plus tard devient une migration
-- sur une base en service. Et la bibliothèque qu'on doit égaler en a un — comparer deux
-- recherches dont l'une cherche par balayage ne dirait rien sur la pertinence.
--
-- « contentless » : l'index ne recopie pas le texte, il renvoie à la table `passage` par
-- son identifiant de ligne. Un seul magasin, donc rien à tenir d'accord.
CREATE VIRTUAL TABLE passage_texte USING fts5(
  texte,
  content = 'passage',
  content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 2'
);

-- L'index suit la table, sans que personne ait à y penser. Un index qu'on met à jour à la
-- main est un index qui se désaccorde le jour où l'on oublie.
CREATE TRIGGER passage_ajoute AFTER INSERT ON passage BEGIN
  INSERT INTO passage_texte (rowid, texte) VALUES (new.rowid, new.texte);
END;
CREATE TRIGGER passage_retire AFTER DELETE ON passage BEGIN
  INSERT INTO passage_texte (passage_texte, rowid, texte) VALUES ('delete', old.rowid, old.texte);
END;
CREATE TRIGGER passage_change AFTER UPDATE ON passage BEGIN
  INSERT INTO passage_texte (passage_texte, rowid, texte) VALUES ('delete', old.rowid, old.texte);
  INSERT INTO passage_texte (rowid, texte) VALUES (new.rowid, new.texte);
END;
