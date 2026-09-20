-- Migration number: 0006
--
-- ⚠️ AVERTISSEMENT (micro-lot 0A-PACKAGE-CLOSE, tenue documentaire) ⚠️
-- Cette migration N'EST PAS un baseline complet reproductible du schéma de production. Elle est
-- ADDITIVE UNIQUEMENT sur une base D1 déjà existante (`CREATE TABLE IF NOT EXISTS` = NO-OP contre
-- la production réelle, où `chunks` existe déjà avec 239 livres / ~22 113 chunks ; seul l'`ALTER
-- TABLE ... ADD COLUMN page_end` a un effet réel là-bas). Elle NE recrée PAS `chunks_fts` (index
-- virtuel FTS5 dont la définition exacte — colonnes indexées, tokenizer, options `content=`/
-- `content_rowid=` — n'a jamais pu être vérifiée depuis cette session, cf. plus bas). Un
-- environnement qui appliquerait CETTE SEULE migration sur une base neuve n'obtiendrait donc PAS
-- un environnement fonctionnellement équivalent à la production (recherche lexicale FTS5 absente).
--
-- AVANT tout déploiement de cette migration sur une base existante (dev, staging ou production),
-- exécuter manuellement ces deux requêtes de préflight (lecture seule, aucune écriture) pour
-- vérifier l'état réel de la base ciblée :
--
--   PRAGMA table_info(chunks);
--   SELECT sql FROM sqlite_master WHERE name IN ('chunks', 'chunks_fts');
--
-- Objectif de ces deux requêtes : (1) confirmer que `page_end` n'existe pas déjà sous un autre nom
-- (un `ALTER TABLE ADD COLUMN` échoue si la colonne existe déjà — la première requête le révèle
-- avant coup) ; (2) obtenir le DDL réel exact de `chunks` et `chunks_fts` tel que SQLite/D1 les a
-- persistés, pour comparer avec le schéma reconstruit ci-dessous et documenter enfin `chunks_fts`
-- avec certitude dans une migration future (jamais deviné ici, faute de preuve).
--
-- Lot 2/2 (P1) bibliotheque-admin/Worker, correctif 2 — `page_end` reçu de l'admin (calculé et
-- transmis depuis l'ingestion) n'était stocké nulle part côté Worker (`handleIngest` ne
-- persistait que `page_number = ck.page`), rendant la localisation d'un passage imprécise pour
-- toute citation professionnelle vérifiable.
--
-- Dette technique héritée signalée dans l'audit précédent (CDC moteur de recherche
-- documentaire) : la table `chunks` (et l'index virtuel `chunks_fts` qui l'accompagne) a été
-- créée EN PRODUCTION en dehors de tout système de migration versionné — absente des 5
-- migrations existantes (0001-0005). Elle contient déjà 239 livres / ~22 113 chunks réels.
--
-- `CREATE TABLE IF NOT EXISTS` ci-dessous est donc un NO-OP contre la base de production réelle
-- (la table existe déjà) — son seul effet réel là-bas est le `ALTER TABLE ... ADD COLUMN
-- page_end` qui suit. Son utilité est de documenter enfin ce schéma dans le système de
-- migration pour tout environnement FRAIS (dev/test) qui n'a jamais reçu la table par un autre
-- moyen, remplaçant une création "hors système" par une source unique versionnée.
--
-- Schéma reconstruit UNIQUEMENT à partir des colonnes confirmées par lecture directe du code
-- réel (handleIngest, la requête INSERT OR REPLACE réelle, et handleD1Query/handleRagSearch qui
-- les lisent) — PAS une copie certifiée du DDL original (inconnu, jamais versionné). Si la table
-- de production porte d'autres colonnes que celles ci-dessous, ce CREATE ne les documentera pas,
-- mais ne les supprimera ni ne les affectera non plus (IF NOT EXISTS, jamais exécuté contre une
-- table déjà présente).
--
-- `chunks_fts` (index virtuel FTS5, jointure confirmée par rowid dans le code réel :
-- `chunks_fts JOIN chunks c ON c.rowid = chunks_fts.rowid`) N'EST PAS reconstruit ici : sa
-- définition exacte (colonnes indexées, options `content=`/`content_rowid=`) n'a pas pu être
-- vérifiée avec certitude depuis cette session (accès D1 production non disponible) — une
-- reconstruction incertaine risquerait d'être appliquée telle quelle sur un environnement frais
-- et de créer un index FTS5 subtilement différent de celui de production. Reste une dette
-- technique distincte, hors du périmètre précis de ce correctif (page_end).
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  book_title TEXT,
  author TEXT,
  language TEXT,
  chapter TEXT,
  page_number INTEGER,
  chunk_index INTEGER,
  content TEXT,
  approach TEXT,
  tags TEXT
);

ALTER TABLE chunks ADD COLUMN page_end INTEGER;
