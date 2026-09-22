-- STUDIO CLINIQUE — Voie 1 : renumérotation in-place de chunk_index (corpus réel)
--
-- Ce fichier est un RECUEIL de requêtes distinctes, jamais un script à exécuter d'un bloc — voir
-- l'en-tête de chaque section pour ce qu'elle fait et quand l'utiliser. `repair-chunk-index.js`
-- orchestre l'exécution livre par livre en réutilisant EXACTEMENT ces mêmes requêtes (jamais une
-- version divergente) ; ce fichier sert de référence lisible et d'outil de vérification manuelle
-- indépendante du script.
--
-- Clé de tri retenue : `rowid`, validée empiriquement (lecture directe du contenu de part et
-- d'autre de plusieurs frontières de collision réelles, sur les 2 livres les plus touchés —
-- narrativement cohérent, confirmé par Christophe). `chunks_fts` n'a besoin d'aucune action
-- manuelle : les 3 triggers déjà en place et confirmés corrects se chargent de tout, et une
-- renumérotation ne touche jamais `rowid` ni `content` (seul `chunk_index` change).
--
-- ⚠️ PRÉCONDITION OPÉRATIONNELLE (micro-lot VOIE1-SAFETY-CLOSE-2, P1.1) ⚠️ — aucune ingestion,
-- suppression ou modification de la bibliothèque ne doit avoir lieu PENDANT une campagne de
-- réparation (dry-run ou exécution). La séquence sauvegarde → UPDATE → vérification →
-- (restauration) n'est PAS transactionnelle entre les commandes distinctes qui l'exécutent —
-- suspendre toute autre activité d'ingestion/suppression sur `bibliotheque-admin.html` le temps
-- de la campagne.

-- ═══════════════════════════════════════════════════════════════════
-- SECTION A — Diagnostic (lecture seule) : quels livres ont encore besoin d'être réparés ?
-- ═══════════════════════════════════════════════════════════════════
-- Un livre est "déjà propre" (à sauter, idempotence) si son chunk_index est déjà une séquence
-- dense 0..N-1 sans doublon — pas seulement "pas de doublon" (COUNT(DISTINCT)=COUNT(*) seul ne
-- garantit pas l'absence de trous ni un minimum à 0).

SELECT book_id,
       COUNT(*)                    AS total_chunks,
       COUNT(DISTINCT chunk_index) AS distinct_index,
       MIN(chunk_index)            AS min_index,
       MAX(chunk_index)            AS max_index
FROM chunks
GROUP BY book_id
HAVING NOT (
  COUNT(DISTINCT chunk_index) = COUNT(*)
  AND MIN(chunk_index) = 0
  AND MAX(chunk_index) = COUNT(*) - 1
)
ORDER BY total_chunks DESC, book_id ASC;

-- ═══════════════════════════════════════════════════════════════════
-- SECTION B — Dry-run détaillé (lecture seule) : mapping ancien → nouveau chunk_index, par chunk
-- ═══════════════════════════════════════════════════════════════════
-- AUCUNE écriture. Remplacer '__BOOK_ID__' par un book_id réel pour un livre précis, ou retirer
-- le WHERE pour voir tout le corpus d'un coup (volumineux — 22 113 lignes).
-- N'affiche que les lignes où quelque chose changerait réellement (old != new) — un livre déjà
-- propre n'apparaît pas.

WITH ranked AS (
  SELECT id, book_id, chunk_index AS old_chunk_index, rowid,
         ROW_NUMBER() OVER (PARTITION BY book_id ORDER BY rowid) - 1 AS new_chunk_index
  FROM chunks
)
SELECT book_id, id, old_chunk_index, new_chunk_index, rowid
FROM ranked
WHERE book_id = '__BOOK_ID__'
  AND old_chunk_index != new_chunk_index
ORDER BY new_chunk_index;

-- ═══════════════════════════════════════════════════════════════════
-- SECTION C — Dry-run résumé par livre (lecture seule)
-- ═══════════════════════════════════════════════════════════════════
-- Compte, par livre, combien de chunks changeraient de chunk_index — sert de vue d'ensemble avant
-- de plonger dans le détail (section B) livre par livre.

WITH ranked AS (
  SELECT book_id, chunk_index AS old_idx,
         ROW_NUMBER() OVER (PARTITION BY book_id ORDER BY rowid) - 1 AS new_idx
  FROM chunks
)
SELECT book_id,
       COUNT(*) AS total_chunks,
       SUM(CASE WHEN old_idx != new_idx THEN 1 ELSE 0 END) AS chunks_a_renumeroter
FROM ranked
GROUP BY book_id
HAVING chunks_a_renumeroter > 0
ORDER BY chunks_a_renumeroter DESC;

-- ═══════════════════════════════════════════════════════════════════
-- SECTION C-BIS — Invariant d'identité exacte id == book_id-rang (micro-lot VOIE1-SAFETY-CLOSE-2,
-- Correctif 6) — LECTURE SEULE, à exécuter AVANT tout dry-run/exécution
-- ═══════════════════════════════════════════════════════════════════
-- CORRIGÉ (Correctif 6) — la version précédente comparait un ORDRE RELATIF (rang par rowid vs
-- rang par suffixe id), ce qui laissait passer à tort des suites TROUÉES (ex. livre-0, livre-2,
-- livre-4 — l'ordre relatif est respecté, mais l'identité ne l'est pas). Remplacé par un invariant
-- d'IDENTITÉ EXACTE : pour CHAQUE ligne, `id` doit valoir très exactement `book_id || '-' ||
-- (rang par rowid, 0-based)`. Détecte en un seul critère : ordre différent, suffixe manquant,
-- trou numérique, doublon avec un format différent, réingestion ayant changé le rowid — tout ce
-- que l'ancien critère de rang relatif laissait passer. `expected_ordinal` dérive uniquement de
-- `rowid` (ordre physique d'insertion SQLite) — comparé à `id`, une colonne stockée à
-- l'ingestion, totalement indépendante — aucune circularité (`chunk_index` n'intervient nulle
-- part dans cette requête).

WITH ranked AS (
    SELECT id, book_id, rowid,
           ROW_NUMBER() OVER (ORDER BY rowid) - 1 AS expected_ordinal
    FROM chunks WHERE book_id = '__BOOK_ID__'
)
SELECT COUNT(*) AS total_chunks,
       SUM(CASE WHEN id != book_id || '-' || expected_ordinal THEN 1 ELSE 0 END)
         AS identity_order_mismatches
FROM ranked;

-- Éligible uniquement si identity_order_mismatches = 0. Exécuter cette requête pour CHAQUE livre
-- listé par la SECTION A (script repair-chunk-index.js, mode --diagnose-order, l'automatise sur
-- les 106 livres et produit manifest-eligible.json / manifest-excluded.json — le manifeste porte
-- désormais le nom de la base, Correctif 7, refusé s'il ne correspond pas à la base ciblée).

-- ═══════════════════════════════════════════════════════════════════
-- SECTION C-TER — Sauvegarde avant écriture (micro-lot VOIE1-SAFETY-CLOSE, Correctif 3)
-- ═══════════════════════════════════════════════════════════════════
-- À exécuter juste avant la SECTION D, pour le même livre. `INSERT OR REPLACE` (clé primaire
-- `id`) rend cette étape sûre à répéter (relance idempotente n'écrase jamais une sauvegarde par
-- une valeur déjà correcte avec un résultat différent — la valeur sauvegardée est toujours l'état
-- réel juste avant l'UPDATE qui suit).

CREATE TABLE IF NOT EXISTS chunk_index_repair_backup (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  old_chunk_index INTEGER NOT NULL,
  backed_up_at TEXT NOT NULL
);

INSERT OR REPLACE INTO chunk_index_repair_backup (id, book_id, old_chunk_index, backed_up_at)
SELECT id, book_id, chunk_index, datetime('now')
FROM chunks WHERE book_id = '__BOOK_ID__';

-- ═══════════════════════════════════════════════════════════════════
-- SECTION D — EXÉCUTION RÉELLE, un livre à la fois (ÉCRITURE — jamais en une seule fois sur tout
-- le corpus) — précédée obligatoirement des sections C-BIS (livre éligible confirmé) et C-TER
-- (sauvegarde effectuée)
-- ═══════════════════════════════════════════════════════════════════
-- Remplacer '__BOOK_ID__' par le book_id réel. Un seul UPDATE, une seule instruction SQL — donc
-- atomique par construction SQLite/D1 (tout ou rien), sans avoir besoin d'un BEGIN/COMMIT
-- explicite ni d'une table temporaire : le sous-select corrélé calcule, pour chaque ligne, son
-- rang 1-based par rowid croissant PARMI LES LIGNES DU MÊME LIVRE (WHERE c2.book_id =
-- chunks.book_id), moins 1 pour un index 0-based — mathématiquement équivalent au
-- ROW_NUMBER() OVER (PARTITION BY book_id ORDER BY rowid) - 1 utilisé en lecture seule ci-dessus,
-- mais utilisable directement dans un UPDATE (une fonction fenêtre ne peut pas être référencée
-- directement dans la clause SET d'un UPDATE en SQLite/D1).

UPDATE chunks
SET chunk_index = (
  SELECT COUNT(*) - 1
  FROM chunks AS c2
  WHERE c2.book_id = chunks.book_id AND c2.rowid <= chunks.rowid
)
WHERE book_id = '__BOOK_ID__';

-- ═══════════════════════════════════════════════════════════════════
-- SECTION E — Vérification post-exécution (lecture seule) — à exécuter après CHAQUE livre
-- ═══════════════════════════════════════════════════════════════════
-- Succès si total_chunks = distinct_index ET min_index = 0 ET max_index = total_chunks - 1.
-- Tout autre résultat = échec pour ce livre, à consigner explicitement, jamais ignoré.

SELECT COUNT(*)                    AS total_chunks,
       COUNT(DISTINCT chunk_index) AS distinct_index,
       MIN(chunk_index)            AS min_index,
       MAX(chunk_index)            AS max_index
FROM chunks
WHERE book_id = '__BOOK_ID__';

-- ═══════════════════════════════════════════════════════════════════
-- SECTION F — Vérification supplémentaire : l'ordre par chunk_index égale bien l'ordre par rowid
-- ═══════════════════════════════════════════════════════════════════
-- Garde-fou contre une erreur de logique qui produirait un chunk_index dense et sans collision
-- mais dans le MAUVAIS ordre (jamais observé avec la requête ci-dessus, mais vérifiable à moindre
-- coût) — doit renvoyer 0 ligne. Si cette vérification échoue (avec la SECTION E), passer
-- immédiatement à la SECTION G (restauration) AVANT d'arrêter la campagne.

SELECT a.id, a.chunk_index, a.rowid
FROM chunks a
JOIN chunks b ON a.book_id = b.book_id AND a.chunk_index = b.chunk_index - 1
WHERE a.book_id = '__BOOK_ID__' AND a.rowid >= b.rowid;

-- ═══════════════════════════════════════════════════════════════════
-- SECTION G — Restauration (micro-lot VOIE1-SAFETY-CLOSE, Correctif 3) — À N'EXÉCUTER QUE SI LA
-- SECTION E OU F A ÉCHOUÉ pour ce livre, immédiatement, avant tout arrêt de campagne
-- ═══════════════════════════════════════════════════════════════════

UPDATE chunks
SET chunk_index = (
  SELECT old_chunk_index FROM chunk_index_repair_backup b
  WHERE b.id = chunks.id AND b.book_id = chunks.book_id
)
WHERE book_id = '__BOOK_ID__'
  AND id IN (SELECT id FROM chunk_index_repair_backup WHERE book_id = '__BOOK_ID__');

-- Vérification de la restauration elle-même — doit renvoyer mismatches = 0. Si mismatches > 0,
-- le livre peut être dans un état incohérent : intervention manuelle immédiate requise, ne pas
-- relancer le script sur ce livre avant vérification manuelle directe du contenu de `chunks`.

SELECT COUNT(*) AS mismatches
FROM chunks c
JOIN chunk_index_repair_backup b ON b.id = c.id AND b.book_id = c.book_id
WHERE c.book_id = '__BOOK_ID__' AND c.chunk_index != b.old_chunk_index;

-- ═══════════════════════════════════════════════════════════════════
-- SECTION G-BIS — Vérification de restauration ÉLARGIE (micro-lot VOIE1-SAFETY-CLOSE-2, P1.2)
-- ═══════════════════════════════════════════════════════════════════
-- La SECTION G ci-dessus ne compare que les VALEURS des lignes déjà appariées entre `chunks` et
-- la sauvegarde — un rollback qui aurait échoué à restaurer CERTAINES lignes (mais réussi pour
-- d'autres) serait invisible à cette seule vérification. Complète avec le NOMBRE de lignes et les
-- identifiants présents d'un seul côté. Restauration pleinement réussie SEULEMENT si :
-- chunks_count = backup_count ET chunks_only = 0 ET backup_only = 0 (en plus de mismatches = 0
-- de la SECTION G).

SELECT
  (SELECT COUNT(*) FROM chunks WHERE book_id = '__BOOK_ID__') AS chunks_count,
  (SELECT COUNT(*) FROM chunk_index_repair_backup WHERE book_id = '__BOOK_ID__') AS backup_count,
  (SELECT COUNT(*) FROM chunks c WHERE c.book_id = '__BOOK_ID__'
     AND NOT EXISTS (SELECT 1 FROM chunk_index_repair_backup b WHERE b.id = c.id)) AS chunks_only,
  (SELECT COUNT(*) FROM chunk_index_repair_backup b WHERE b.book_id = '__BOOK_ID__'
     AND NOT EXISTS (SELECT 1 FROM chunks c WHERE c.id = b.id)) AS backup_only;

-- ═══════════════════════════════════════════════════════════════════
-- SECTION H — Nettoyage de `chunk_index_repair_backup` (micro-lot VOIE1-SAFETY-CLOSE-2, P1.3) —
-- MANUEL UNIQUEMENT, jamais exécuté automatiquement par le script
-- ═══════════════════════════════════════════════════════════════════
-- DÉCISION documentée (voir en-tête de repair-chunk-index.js) : `chunk_index_repair_backup` est
-- une table de maintenance TEMPORAIRE, délibérément HORS du système de migration versionné (elle
-- ne fait pas partie du schéma applicatif réel utilisé par le Worker ou l'admin). Le script ne la
-- supprime JAMAIS lui-même, même après un succès confirmé — cette requête est la SEULE voie de
-- nettoyage, à exécuter par vous, MANUELLEMENT, une fois la campagne de réparation définitivement
-- validée (recommandé : après un contrôle qualité de la recherche sur quelques jours suivant la
-- réparation réelle). Ne pas exécuter tant qu'une possibilité de restauration pourrait encore
-- être nécessaire.

-- DROP TABLE chunk_index_repair_backup;
