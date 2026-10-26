-- Schéma dérivé de recherche du bureau (C10).
--
-- Ce fichier appartient à depot-sqlite : Node, D1 et l'hôte Rust partagent ainsi les mêmes
-- choix FTS5. L'hôte l'inclut à la compilation ; il n'embarque ni Node ni cet adaptateur.
-- Les JSON des versions actives restent la vérité, cette base peut être effacée et reconstruite.

CREATE TABLE IF NOT EXISTS document_recherche (
  empreinte  TEXT PRIMARY KEY,
  version    TEXT NOT NULL,
  titre      TEXT NOT NULL,
  activee_le INTEGER NOT NULL
);

-- Empreinte très légère des deux sources qui rendent une réconciliation nécessaire. Sans elle,
-- chaque frappe relirait les centaines de petits fichiers de travaux d'un volume externe.
CREATE TABLE IF NOT EXISTS etat_recherche (
  cle    TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS passage_recherche (
  id            INTEGER PRIMARY KEY,
  empreinte     TEXT NOT NULL REFERENCES document_recherche(empreinte) ON DELETE CASCADE,
  rang          INTEGER NOT NULL,
  page          INTEGER NOT NULL,
  page_imprimee INTEGER,
  texte         TEXT NOT NULL,
  source        TEXT NOT NULL,
  confiance     REAL,
  lisible       INTEGER NOT NULL,
  emplacement   TEXT,
  UNIQUE (empreinte, rang)
);

CREATE INDEX IF NOT EXISTS passage_recherche_document ON passage_recherche(empreinte);

CREATE VIRTUAL TABLE IF NOT EXISTS passage_recherche_texte USING fts5(
  texte,
  content = 'passage_recherche',
  content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS passage_recherche_ajoute AFTER INSERT ON passage_recherche BEGIN
  INSERT INTO passage_recherche_texte(rowid, texte) VALUES (new.id, new.texte);
END;
CREATE TRIGGER IF NOT EXISTS passage_recherche_retire AFTER DELETE ON passage_recherche BEGIN
  INSERT INTO passage_recherche_texte(passage_recherche_texte, rowid, texte)
  VALUES ('delete', old.id, old.texte);
END;
CREATE TRIGGER IF NOT EXISTS passage_recherche_change AFTER UPDATE ON passage_recherche BEGIN
  INSERT INTO passage_recherche_texte(passage_recherche_texte, rowid, texte)
  VALUES ('delete', old.id, old.texte);
  INSERT INTO passage_recherche_texte(rowid, texte) VALUES (new.id, new.texte);
END;
