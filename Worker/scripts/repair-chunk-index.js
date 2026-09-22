// STUDIO CLINIQUE — Voie 1 : orchestrateur de renumérotation in-place de chunk_index.
//
// Script autonome (jamais un endpoint Worker, jamais câblé dans Worker/index.js).
//
// ⚠️ PRÉCONDITION OPÉRATIONNELLE (P1.1) ⚠️ — aucune ingestion, suppression ou modification de la
// bibliothèque ne doit avoir lieu PENDANT une campagne de réparation (dry-run ou exécution). La
// séquence backup → UPDATE → vérification → (restauration) n'est PAS transactionnelle entre les
// commandes distinctes qui l'exécutent (chaque appel `wrangler d1 execute` est sa propre requête
// réseau) — une écriture concurrente sur le même livre pendant cette fenêtre pourrait produire un
// résultat incohérent que ce script ne détecterait pas. Ce n'est pas une refonte transactionnelle
// dans ce lot (documentaire uniquement) : suspendre toute autre activité d'ingestion/suppression
// sur `bibliotheque-admin.html` le temps de la campagne.
//
// Micro-lot VOIE1-SAFETY-CLOSE (4 garde-fous) + VOIE1-SAFETY-CLOSE-2 (3 garde-fous
// supplémentaires + 3 points P1) :
//   1. `--execute` n'accepte QUE la forme stricte (sans valeur).
//   2. Aucune réparation automatique sur un livre dont l'ordre est incertain — vérifié à nouveau
//      pour CE livre précis, dans `repairBook` lui-même (défense en profondeur).
//   3. Sauvegarde avant chaque UPDATE ; restauration automatique si la vérification échoue.
//   4. `--execute` seul (sans `--book-id` ni `--all-confirmed --confirm=<db>`) est refusé.
//   5. (SAFETY-CLOSE-2) `--all-confirmed` et `--diagnose-order` sont désormais soumis au même
//      parsing strict que `--execute` — `--all-confirmed=false` etc. sont rejetés explicitement,
//      jamais silencieusement acceptés ni silencieusement rétrogradés en dry-run.
//   6. (SAFETY-CLOSE-2) Le critère d'éligibilité n'est plus une comparaison de RANGS RELATIFS
//      (`rowid` vs suffixe id) — trop permissif : il laissait passer des suites trouées
//      (`livre-0, livre-2, livre-4`) tant que l'ordre relatif était respecté. Remplacé par
//      l'invariant d'IDENTITÉ EXACTE : `id` doit valoir très exactement `${book_id}-${rang-1}`
//      pour chaque ligne (rang par rowid). Détecte en un seul critère : trou numérique, suffixe
//      manquant, doublon de format différent, réingestion ayant changé rowid — tout ce que
//      l'ancien critère de rang relatif laissait passer.
//   7. (SAFETY-CLOSE-2) Le manifeste d'éligibilité porte désormais le nom de la base
//      (`database`) — `loadEligibleManifest` refuse tout manifeste dont ce champ ne correspond
//      pas exactement à `--db`, empêchant la réutilisation accidentelle d'un manifeste généré
//      sur une autre base (ex. `-staging`) contre la production.
//   8. (SAFETY-CLOSE-3) `repairBook` est désormais une machine à états explicite : PRE_WRITE →
//      BACKUP_DONE → UPDATE_ATTEMPTED → VERIFYING → (RESTORING) → DONE. À partir de
//      UPDATE_ATTEMPTED, TOUTE exception (pas seulement un résultat de vérification négatif —
//      ex. une panne réseau `wrangler` en pleine vérification) déclenche automatiquement une
//      tentative de restauration, jamais laissée remonter sans filet. Trois issues distinctes,
//      jamais confondues : `failed_and_restored` (échec constaté, restauration réussie),
//      `failed_restore_failed` (restauration tentée mais dont la vérification échoue, sans
//      exception), et `failed_restore_unknown` — état CRITIQUE distinct — quand la commande de
//      restauration ELLE-MÊME lève une exception : l'état réel du livre est alors inconnu,
//      `runRepairCampaign` arrête la campagne IMMÉDIATEMENT (jamais une poursuite silencieuse
//      vers le livre suivant) et exige une intervention manuelle. Un filet de sécurité
//      supplémentaire entoure l'appel à `repairBook` lui-même dans la boucle de campagne : une
//      exception levée avant tout état restaurable (PRE_WRITE/BACKUP_DONE, hors du try/catch
//      interne de `repairBook`) est aussi capturée, consignée au journal sous
//      `failed_restore_unknown`, et arrête la campagne — jamais une exception brute remontant
//      non consignée jusqu'à `main()`.
//
// P1.2 — la vérification de restauration compare désormais, en plus des valeurs de chunk_index,
// le NOMBRE de lignes (chunks vs backup) et les identifiants présents d'un seul côté — détecte un
// rollback lui-même partiel, pas seulement des valeurs de chunk_index divergentes.
//
// P1.3 — DÉCISION sur `chunk_index_repair_backup` : table de maintenance TEMPORAIRE,
// délibérément HORS du système de migration versionné (elle ne fait pas partie du schéma
// applicatif utilisé par le Worker ou l'admin — l'y intégrer élargirait à tort le schéma réel
// pour un artefact de campagne ponctuelle). Le script ne la supprime JAMAIS automatiquement
// (aucune destruction automatique après un succès, même confirmé) — un nettoyage manuel explicite
// (`DROP TABLE chunk_index_repair_backup;`, fournie en Section H de `repair-chunk-index.sql`) est
// la seule voie, à exécuter par vous une fois la campagne définitivement validée (recommandé :
// après un contrôle qualité de la recherche sur quelques jours), jamais par ce script lui-même.
//
// Correctif 9 (SAFETY-CLOSE-4) — `validateArgsSchema(args)` valide l'intégralité de
// `process.argv` AVANT toute autre logique (avant même l'extraction de `--db`) : chaque token
// doit être soit une option à valeur obligatoire sous la forme stricte `--nom=valeur` (db,
// book-id, confirm, log, manifest-dir — jamais la forme nue, qui pourrait recevoir une valeur
// devinée plutôt qu'une vraie valeur), soit un flag booléen sous la forme stricte `--nom` sans
// valeur (execute, all-confirmed, diagnose-order). Tout le reste — un token qui ne commence même
// pas par `--` (`--execute false` où `false` devient un second token isolé jamais examiné
// auparavant, `foo`), une faute de frappe (`--execut`), ou une option à valeur obligatoire sans
// `=` (`--db` seul) — est rejeté avant tout traitement, avant toute tentative `wrangler`.
//
// Correctif 10 (SAFETY-CLOSE-5, P0) — la même validation refuse désormais toute option apparaissant
// plus d'une fois dans l'invocation (`--db=prod --db=prod`), MÊME quand les deux occurrences sont
// strictement identiques : deviner laquelle des deux « compte » n'est pas un jugement que ce
// script doit faire — un doublon, identique ou non, signale toujours une invocation malformée.
//
// Correctif 11 (SAFETY-CLOSE-5, P1) — `--diagnose-order`, `--book-id` et `--all-confirmed`
// sélectionnent chacun un mode mutuellement exclusif ; les combiner entre eux est rejeté, plus
// aucune priorité implicite non documentée. `--diagnose-order` (lecture seule) est en outre
// strictement incompatible avec `--execute`.
//
// Usage :
//   node repair-chunk-index.js --db=<nom_base> --diagnose-order
//   node repair-chunk-index.js --db=<nom_base> [--book-id=<id>]                    (dry-run)
//   node repair-chunk-index.js --db=<nom_base> --execute --book-id=<id>
//   node repair-chunk-index.js --db=<nom_base> --execute --all-confirmed --confirm=<nom_base>
//
// Réserve honnête (inchangée) : `execViaWrangler` shell-out vers `wrangler d1 execute <db>
// --remote --json --command "<sql>"`, jamais testé en conditions réelles depuis ce bac à sable.

'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// ═══════════════════════════════════════════════════════════════════
// Requêtes SQL — identiques à repair-chunk-index.sql, jamais une version divergente
// ═══════════════════════════════════════════════════════════════════

const SECTION_A_DIAGNOSTIC = `
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
`.trim();

function sectionBDryRunMapping(bookId) {
  return `
WITH ranked AS (
  SELECT id, book_id, chunk_index AS old_chunk_index, rowid,
         ROW_NUMBER() OVER (PARTITION BY book_id ORDER BY rowid) - 1 AS new_chunk_index
  FROM chunks
)
SELECT book_id, id, old_chunk_index, new_chunk_index, rowid
FROM ranked
WHERE book_id = '${escapeSqlLiteral(bookId)}'
  AND old_chunk_index != new_chunk_index
ORDER BY new_chunk_index;
`.trim();
}

// ── Correctif 6 (SAFETY-CLOSE-2) : invariant d'identité exacte, remplace la comparaison de rangs
// relatifs (trop permissive — laissait passer des suites trouées type livre-0/livre-2/livre-4
// tant que l'ordre relatif était respecté). `expected_ordinal` dérive uniquement de `rowid`
// (ordre physique d'insertion SQLite) — comparé à `id`, une colonne totalement indépendante,
// stockée à l'ingestion. Aucune circularité : chunk_index n'intervient nulle part ici.
function sectionOrderAgreement(bookId) {
  const esc = escapeSqlLiteral(bookId);
  return `
WITH ranked AS (
    SELECT id, book_id, rowid,
           ROW_NUMBER() OVER (ORDER BY rowid) - 1 AS expected_ordinal
    FROM chunks WHERE book_id = '${esc}'
)
SELECT COUNT(*) AS total_chunks,
       SUM(CASE WHEN id != book_id || '-' || expected_ordinal THEN 1 ELSE 0 END)
         AS identity_order_mismatches
FROM ranked;
`.trim();
}

function sectionDRepairUpdate(bookId) {
  return `
UPDATE chunks
SET chunk_index = (
  SELECT COUNT(*) - 1
  FROM chunks AS c2
  WHERE c2.book_id = chunks.book_id AND c2.rowid <= chunks.rowid
)
WHERE book_id = '${escapeSqlLiteral(bookId)}';
`.trim();
}

function sectionEVerify(bookId) {
  return `
SELECT COUNT(*)                    AS total_chunks,
       COUNT(DISTINCT chunk_index) AS distinct_index,
       MIN(chunk_index)            AS min_index,
       MAX(chunk_index)            AS max_index
FROM chunks
WHERE book_id = '${escapeSqlLiteral(bookId)}';
`.trim();
}

function sectionFOrderCheck(bookId) {
  return `
SELECT a.id, a.chunk_index, a.rowid
FROM chunks a
JOIN chunks b ON a.book_id = b.book_id AND a.chunk_index = b.chunk_index - 1
WHERE a.book_id = '${escapeSqlLiteral(bookId)}' AND a.rowid >= b.rowid;
`.trim();
}

// ── Correctif 3 : sauvegarde / restauration ──
const SECTION_BACKUP_TABLE_CREATE = `
CREATE TABLE IF NOT EXISTS chunk_index_repair_backup (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  old_chunk_index INTEGER NOT NULL,
  backed_up_at TEXT NOT NULL
);
`.trim();

function sectionBackupBook(bookId, timestamp) {
  return `
INSERT OR REPLACE INTO chunk_index_repair_backup (id, book_id, old_chunk_index, backed_up_at)
SELECT id, book_id, chunk_index, '${escapeSqlLiteral(timestamp)}'
FROM chunks WHERE book_id = '${escapeSqlLiteral(bookId)}';
`.trim();
}

function sectionRestoreBook(bookId) {
  return `
UPDATE chunks
SET chunk_index = (
  SELECT old_chunk_index FROM chunk_index_repair_backup b
  WHERE b.id = chunks.id AND b.book_id = chunks.book_id
)
WHERE book_id = '${escapeSqlLiteral(bookId)}'
  AND id IN (SELECT id FROM chunk_index_repair_backup WHERE book_id = '${escapeSqlLiteral(bookId)}');
`.trim();
}

function sectionVerifyRestore(bookId) {
  return `
SELECT COUNT(*) AS mismatches
FROM chunks c
JOIN chunk_index_repair_backup b ON b.id = c.id AND b.book_id = c.book_id
WHERE c.book_id = '${escapeSqlLiteral(bookId)}' AND c.chunk_index != b.old_chunk_index;
`.trim();
}

// P1.2 — vérification de restauration ÉLARGIE : compare aussi le nombre de lignes et détecte les
// identifiants présents d'un seul côté (chunks vs backup) — un rollback qui aurait, par exemple,
// échoué à restaurer certaines lignes (mais réussi pour d'autres) serait invisible à
// sectionVerifyRestore seule (qui ne regarde que les valeurs des lignes déjà appariées).
function sectionVerifyRestoreComplete(bookId) {
  const esc = escapeSqlLiteral(bookId);
  return `
SELECT
  (SELECT COUNT(*) FROM chunks WHERE book_id = '${esc}') AS chunks_count,
  (SELECT COUNT(*) FROM chunk_index_repair_backup WHERE book_id = '${esc}') AS backup_count,
  (SELECT COUNT(*) FROM chunks c WHERE c.book_id = '${esc}'
     AND NOT EXISTS (SELECT 1 FROM chunk_index_repair_backup b WHERE b.id = c.id)) AS chunks_only,
  (SELECT COUNT(*) FROM chunk_index_repair_backup b WHERE b.book_id = '${esc}'
     AND NOT EXISTS (SELECT 1 FROM chunks c WHERE c.id = b.id)) AS backup_only;
`.trim();
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

// ═══════════════════════════════════════════════════════════════════
// Correctifs 1 et 5 (SAFETY-CLOSE-2) — parsing strict de TOUT flag booléen sensible
// ═══════════════════════════════════════════════════════════════════
// `--<name>` (forme exacte, sans valeur) est le SEUL déclencheur accepté pour `execute`,
// `all-confirmed` et `diagnose-order`. `--<name>=<quoi que ce soit>` est un usage invalide,
// REJETÉ avec une erreur explicite — jamais silencieusement accepté comme déclencheur, jamais
// silencieusement rétrogradé en dry-run (deviner l'intention serait aussi dangereux qu'exécuter
// à tort). Un seul helper générique, réutilisé par les trois — jamais une logique divergente
// entre `--execute` et les autres, comme c'était le cas avant ce correctif.
function parseStrictBooleanFlag(args, name) {
  let seen = false;
  for (const arg of args) {
    if (arg === `--${name}`) {
      seen = true;
      continue;
    }
    if (arg.startsWith(`--${name}=`)) {
      throw new Error(
        `Usage invalide : "${arg}" — --${name} ne prend jamais de valeur. ` +
        `Utilisez exactement --${name}, ou omettez-le.`
      );
    }
  }
  return seen;
}

function parseExecuteFlag(args) {
  return parseStrictBooleanFlag(args, 'execute');
}

// ═══════════════════════════════════════════════════════════════════
// Correctif 9 (SAFETY-CLOSE-4) — validation de schéma EXHAUSTIVE de process.argv
// ═══════════════════════════════════════════════════════════════════
// Les correctifs 1/5 ne validaient strictement QUE les flags booléens déjà nommés
// (`execute`/`all-confirmed`/`diagnose-order`) contre leur propre forme `=valeur`. Tout le reste
// de `process.argv` n'était jamais validé : un argument non reconnu (faute de frappe, argument
// séparé par un espace comme `--execute false` où `false` devient un token isolé jamais examiné,
// ou une option "à valeur obligatoire" comme `--db` utilisée sans `=`) passait silencieusement au
// travers — avec, pour `--db` seul, un risque concret : `flagValue('db')` renverrait alors `true`
// (booléen) plutôt qu'un vrai nom de base, une valeur qui passe le test `if (!dbName)` (`true` est
// vérité) sans jamais désigner une base réelle.
//
// Correctif : un seul point d'entrée de validation, `validateArgsSchema(args)`, appelé en tout
// premier dans `main()` — avant même l'extraction de `dbName`/`bookId`/etc., avant toute tentative
// `wrangler`. Chaque token de `process.argv` (après le nom du script) doit correspondre EXACTEMENT
// à l'une des deux catégories reconnues, sinon rejet immédiat :
//   - à valeur OBLIGATOIRE, forme `--nom=valeur` UNIQUEMENT (jamais la forme nue, qui pourrait
//     recevoir une valeur devinée/booléenne par erreur de logique) : db, book-id, confirm, log,
//     manifest-dir.
//   - sans valeur, forme stricte `--nom` UNIQUEMENT (jamais suivie d'un argument séparé qui serait
//     silencieusement ignoré, jamais `--nom=...`) : execute, all-confirmed, diagnose-order.
// Tout token qui n'est ni l'une ni l'autre — y compris un token qui ne commence même pas par
// `--` (`false` isolé après `--execute`, `foo`, une faute de frappe comme `--execut`) — est
// rejeté avant tout autre traitement. Aucune validation partielle : un nouveau cas non anticipé
// (un argument totalement inconnu) est refusé par construction, jamais laissé passer par défaut.
const ARGS_WITH_REQUIRED_VALUE = ['db', 'book-id', 'confirm', 'log', 'manifest-dir'];
const ARGS_STRICT_BOOLEAN = ['execute', 'all-confirmed', 'diagnose-order'];

function describeValidArgs() {
  return [
    ...ARGS_WITH_REQUIRED_VALUE.map((n) => `--${n}=<valeur>`),
    ...ARGS_STRICT_BOOLEAN.map((n) => `--${n}`),
  ].join(', ');
}

// Correctif 10 (SAFETY-CLOSE-5, P0) — une option (à valeur ou booléenne stricte) ne peut
// apparaître qu'une seule fois par invocation. Une seconde occurrence est rejetée MÊME si sa
// valeur est strictement identique à la première (`--db=prod --db=prod`) : deviner laquelle des
// deux occurrences "compte" serait un jugement que ce script n'a pas à faire — la présence d'un
// doublon, identique ou non, signale toujours une invocation malformée (script appelant buggé,
// concaténation d'arguments accidentelle, copier-coller).
//
// Correctif 11 (SAFETY-CLOSE-5, P1) — `--diagnose-order`, `--book-id` et `--all-confirmed`
// sélectionnent chacun un MODE mutuellement exclusif (diagnostic en lecture seule ; ciblage d'un
// livre précis ; campagne globale confirmée). Combiner plusieurs sélecteurs de mode ne doit plus
// laisser une priorité implicite non documentée décider silencieusement lequel l'emporte — toute
// combinaison est rejetée avant tout traitement. `--diagnose-order` est en outre strictement
// incompatible avec `--execute` : c'est un mode de lecture seule, jamais un mode qui déclenche une
// écriture, même si `--execute` était auparavant sans effet pratique en sa présence.
const MODE_SELECTOR_ARGS = ['diagnose-order', 'book-id', 'all-confirmed'];

function validateArgsSchema(args) {
  const seenNames = new Set();

  for (const arg of args) {
    if (!arg.startsWith('--')) {
      throw new Error(
        `Argument non reconnu : "${arg}" — tout argument doit commencer par "--". ` +
        `Arguments valides : ${describeValidArgs()}.`
      );
    }
    const eqIndex = arg.indexOf('=');
    const hasValue = eqIndex !== -1;
    const name = hasValue ? arg.slice(2, eqIndex) : arg.slice(2);

    if (ARGS_WITH_REQUIRED_VALUE.includes(name) || ARGS_STRICT_BOOLEAN.includes(name)) {
      if (seenNames.has(name)) {
        throw new Error(
          `Usage invalide : "--${name}" apparaît plusieurs fois dans cette invocation — chaque ` +
          `option ne peut être fournie qu'une seule fois, même avec une valeur identique. ` +
          `Retirez le doublon.`
        );
      }
      seenNames.add(name);
    }

    if (ARGS_WITH_REQUIRED_VALUE.includes(name)) {
      if (!hasValue) {
        throw new Error(
          `Usage invalide : "${arg}" — --${name} exige une valeur explicite sous la forme ` +
          `--${name}=<valeur>, jamais la forme nue (qui pourrait recevoir une valeur devinée ` +
          `plutôt qu'une vraie valeur).`
        );
      }
      continue;
    }

    if (ARGS_STRICT_BOOLEAN.includes(name)) {
      if (hasValue) {
        throw new Error(
          `Usage invalide : "${arg}" — --${name} ne prend jamais de valeur. ` +
          `Utilisez exactement --${name}, ou omettez-le.`
        );
      }
      continue;
    }

    throw new Error(
      `Argument non reconnu : "--${name}" — argument inconnu ou faute de frappe. ` +
      `Arguments valides : ${describeValidArgs()}.`
    );
  }

  // Correctif 11 — modes mutuellement exclusifs : au plus un sélecteur de mode à la fois.
  const modesPresent = MODE_SELECTOR_ARGS.filter((name) => seenNames.has(name));
  if (modesPresent.length > 1) {
    throw new Error(
      `Usage invalide : ${modesPresent.map((n) => `--${n}`).join(' et ')} ne peuvent pas être ` +
      `combinés — chacun sélectionne un mode distinct et mutuellement exclusif (diagnostic en ` +
      `lecture seule, ciblage d'un livre précis, ou campagne globale confirmée). Choisissez un ` +
      `seul mode par invocation.`
    );
  }
  if (seenNames.has('diagnose-order') && seenNames.has('execute')) {
    throw new Error(
      `Usage invalide : --diagnose-order est un mode de lecture seule, strictement incompatible ` +
      `avec --execute — jamais une priorité implicite entre les deux. Lancez --diagnose-order ` +
      `seul, puis --execute séparément (--book-id=<id> ou --all-confirmed) une fois son résultat ` +
      `examiné.`
    );
  }
}

// ── Exécuteur réel (wrangler) — la seule fonction à remplacer si un autre outil D1 est utilisé ──
function execViaWrangler(dbName, sql) {
  const out = execFileSync(
    'wrangler',
    ['d1', 'execute', dbName, '--remote', '--json', '--command', sql],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  return parseWranglerJson(out);
}

function parseWranglerJson(rawOutput) {
  const parsed = JSON.parse(rawOutput);
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!first || first.success === false) {
    throw new Error('wrangler d1 execute a signalé un échec : ' + rawOutput.slice(0, 500));
  }
  return first.results || [];
}

// ── Journal de progression (audit lisible ; jamais la seule source de vérité) ──
function loadProgress(logPath) {
  try {
    return JSON.parse(fs.readFileSync(logPath, 'utf8'));
  } catch {
    return { books: {} };
  }
}

function saveProgress(logPath, progress) {
  fs.writeFileSync(logPath, JSON.stringify(progress, null, 2));
}

function recordBookStatus(logPath, bookId, status, detail) {
  const progress = loadProgress(logPath);
  progress.books[bookId] = { status, detail, at: new Date().toISOString() };
  saveProgress(logPath, progress);
}

// ═══════════════════════════════════════════════════════════════════
// Étapes réutilisables (testées telles quelles par verify-repair-chunk-index.cjs)
// ═══════════════════════════════════════════════════════════════════

async function diagnoseAffectedBooks(exec) {
  return exec(SECTION_A_DIAGNOSTIC);
}

async function dryRunBook(exec, bookId) {
  return exec(sectionBDryRunMapping(bookId));
}

// Correctif 6 — vérité indépendante par livre, invariant d'identité exacte (pas un rang relatif).
async function checkOrderAgreement(exec, bookId) {
  const [row] = await exec(sectionOrderAgreement(bookId));
  const identityOrderMismatches = Number(row?.identity_order_mismatches || 0);
  return {
    bookId,
    totalChunks: Number(row?.total_chunks || 0),
    identityOrderMismatches,
    eligible: identityOrderMismatches === 0,
  };
}

// Correctif 2 (élargi) — diagnostic sur TOUT le corpus affecté, jamais seulement 2 livres.
async function diagnoseOrderForAllAffected(exec) {
  const affected = await diagnoseAffectedBooks(exec);
  const eligible = [];
  const excluded = [];
  for (const book of affected) {
    const result = await checkOrderAgreement(exec, book.book_id);
    if (result.eligible) eligible.push(result);
    else excluded.push(result);
  }
  return { eligible, excluded, totalAffected: affected.length };
}

// Correctif 7 — le manifeste porte désormais le nom de la base, pour empêcher sa réutilisation
// contre une base différente de celle où il a été généré.
function writeManifests(dir, diagnosis, dbName) {
  const eligiblePath = path.join(dir, 'manifest-eligible.json');
  const excludedPath = path.join(dir, 'manifest-excluded.json');
  fs.writeFileSync(eligiblePath, JSON.stringify({
    database: dbName,
    generated_at: new Date().toISOString(),
    book_ids: diagnosis.eligible.map((b) => b.bookId),
    detail: diagnosis.eligible,
  }, null, 2));
  fs.writeFileSync(excludedPath, JSON.stringify({
    database: dbName,
    generated_at: new Date().toISOString(),
    detail: diagnosis.excluded,
  }, null, 2));
  return { eligiblePath, excludedPath };
}

// Correctif 7 — refuse tout manifeste dont `database` ne correspond pas exactement à `dbName`
// attendu, empêchant la réutilisation accidentelle d'un manifeste généré sur une autre base
// (ex. therapeute-library-staging) contre la production.
function loadEligibleManifest(dir, dbName) {
  const eligiblePath = path.join(dir, 'manifest-eligible.json');
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(eligiblePath, 'utf8'));
  } catch (e) {
    throw new Error(
      `Manifeste d'éligibilité introuvable ou illisible (${eligiblePath}) — lancez d'abord ` +
      `--diagnose-order avant --all-confirmed. (${e.message})`
    );
  }
  if (!Array.isArray(parsed.book_ids)) {
    throw new Error(`Manifeste d'éligibilité malformé (${eligiblePath}) — régénérez-le avec --diagnose-order.`);
  }
  if (parsed.database !== dbName) {
    throw new Error(
      `Correctif 7 : le manifeste (${eligiblePath}) a été généré pour la base "${parsed.database}", ` +
      `pas "${dbName}" — refusé pour empêcher une réparation croisée entre bases. ` +
      `Régénérez le manifeste avec --db=${dbName} --diagnose-order.`
    );
  }
  return parsed.book_ids;
}

// Correctif 3 — réparation avec sauvegarde/restauration automatique.
// Correctif 6 (défense en profondeur) — refuse l'exécution si l'invariant d'identité (Correctif
// 6) n'est pas respecté pour CE livre précis, quel que soit le chemin d'appel.
// Correctif 8 (SAFETY-CLOSE-3) — machine d'état explicite :
//   PRE_WRITE → BACKUP_DONE → UPDATE_ATTEMPTED → VERIFYING → RESTORING → DONE
// Règle centrale : à partir du moment où l'UPDATE a été TENTÉ (que l'appel réussisse ou lève une
// exception — l'écriture a pu être commitée côté D1 avant qu'une erreur réseau ne survienne sur
// la réponse), TOUTE exception ultérieure (UPDATE, vérification E, contrôle d'ordre F) déclenche
// une tentative de restauration automatique — jamais remontée directement sans passer par ce
// filet. Sous la précondition déjà documentée (aucune autre écriture pendant la campagne), une
// restauration lancée même quand l'UPDATE n'avait pas été appliqué reste un no-op inoffensif
// (réécrit la même valeur déjà en place).
async function repairBook(exec, bookId, { timestamp = new Date().toISOString() } = {}) {
  // PRE_WRITE
  const agreement = await checkOrderAgreement(exec, bookId);
  if (!agreement.eligible) {
    return {
      ok: false,
      reason: 'order_divergence',
      agreement,
      verify: null,
      orderViolations: [],
      restored: null,
    };
  }

  // PRE_WRITE → BACKUP_DONE (pas encore de risque d'état incohérent : aucun UPDATE tenté)
  await exec(SECTION_BACKUP_TABLE_CREATE);
  await exec(sectionBackupBook(bookId, timestamp));

  // BACKUP_DONE → UPDATE_ATTEMPTED → VERIFYING — à partir d'ici, toute exception est capturée,
  // jamais laissée remonter sans tentative de restauration.
  let verify = null;
  let orderViolations = [];
  let verificationException = null;
  try {
    await exec(sectionDRepairUpdate(bookId));
    [verify] = await exec(sectionEVerify(bookId));
    orderViolations = await exec(sectionFOrderCheck(bookId));
  } catch (err) {
    verificationException = err;
  }

  const ok =
    !verificationException &&
    verify &&
    Number(verify.total_chunks) === Number(verify.distinct_index) &&
    Number(verify.min_index) === 0 &&
    Number(verify.max_index) === Number(verify.total_chunks) - 1 &&
    orderViolations.length === 0;

  if (ok) {
    return { ok: true, reason: null, agreement, verify, orderViolations, restored: null };
  }

  // VERIFYING → RESTORING — échec (résultat négatif OU exception) : restauration immédiate AVANT
  // de remonter l'échec, jamais un livre laissé modifié sans tentative de restauration. La
  // commande de restauration elle-même peut aussi lever une exception — état CRITIQUE distinct,
  // jamais confondu avec un échec de vérification ordinaire.
  let restoreCheck = null;
  let restoreComplete = null;
  let restoreException = null;
  try {
    await exec(sectionRestoreBook(bookId));
    [restoreCheck] = await exec(sectionVerifyRestore(bookId));
    [restoreComplete] = await exec(sectionVerifyRestoreComplete(bookId));
  } catch (err) {
    restoreException = err;
  }

  const restoreDetail = { mismatches: restoreCheck, completeness: restoreComplete };

  if (restoreException) {
    // RESTORING a lui-même levé une exception — état CRITIQUE, distinct de failed_and_restored/
    // failed_restore_failed : la commande de restauration n'a peut-être même pas pu s'exécuter,
    // l'état réel du livre est inconnu. Jamais un faux `failed_and_restored`.
    return {
      ok: false,
      reason: verificationException ? 'verification_exception' : 'verification_failed',
      agreement,
      verify,
      orderViolations,
      verificationError: verificationException ? verificationException.message : null,
      restored: false,
      restoreCritical: true,
      restoreError: restoreException.message,
      restoreDetail,
    };
  }

  // P1.2 — restauration considérée réussie seulement si : (a) aucune valeur de chunk_index ne
  // diffère de la sauvegarde ET (b) le compte de lignes chunks == compte de lignes backup ET
  // (c) aucun id présent d'un seul côté — un rollback partiel (certaines lignes restaurées,
  // d'autres non) est ainsi détecté, pas seulement des valeurs isolées divergentes.
  // `??` (jamais `||`) : chunks_only/backup_only=0 est une valeur légitime (aucune ligne
  // orpheline) — `|| 1` la traiterait à tort comme "absente" et la remplacerait par 1,
  // faisant échouer à tort une restauration parfaitement réussie.
  const restoreOk =
    Number(restoreCheck?.mismatches ?? 1) === 0 &&
    Number(restoreComplete?.chunks_count ?? -1) === Number(restoreComplete?.backup_count ?? -2) &&
    Number(restoreComplete?.chunks_only ?? 1) === 0 &&
    Number(restoreComplete?.backup_only ?? 1) === 0;

  // DONE
  return {
    ok: false,
    reason: verificationException ? 'verification_exception' : 'verification_failed',
    agreement,
    verify,
    orderViolations,
    verificationError: verificationException ? verificationException.message : null,
    restored: restoreOk,
    restoreCritical: false,
    restoreDetail,
  };
}

async function runRepairCampaign({ exec, execute, bookId, allConfirmed, dbName, manifestDir, logPath }) {
  if (execute && !bookId && !allConfirmed) {
    throw new Error(
      'Correctif 4 : --execute seul (sans --book-id ni --all-confirmed) est refusé. ' +
      'Ciblez un livre précis (--book-id=<id>) ou lancez une campagne confirmée ' +
      '(--all-confirmed --confirm=<nom_base>, après --diagnose-order).'
    );
  }

  let targets;
  if (bookId) {
    const affected = await diagnoseAffectedBooks(exec);
    targets = affected.filter((b) => b.book_id === bookId);
    if (targets.length === 0) {
      console.log(`Livre ${bookId} déjà propre (chunk_index dense, sans collision) — rien à faire.`);
      return { processed: [], skipped: [bookId], failed: [] };
    }
  } else if (allConfirmed) {
    const eligibleIds = loadEligibleManifest(manifestDir, dbName);
    const affected = await diagnoseAffectedBooks(exec);
    const affectedById = new Map(affected.map((b) => [b.book_id, b]));
    targets = eligibleIds
      .map((id) => affectedById.get(id))
      .filter(Boolean); // un livre du manifeste déjà réparé entre-temps n'apparaît plus ici — normal, sauté silencieusement (idempotence), pas une erreur.
  } else {
    // Dry-run par défaut, sans filtre : tout le corpus affecté.
    targets = await diagnoseAffectedBooks(exec);
  }

  console.log(`${targets.length} livre(s) à traiter (${execute ? 'EXÉCUTION RÉELLE' : 'DRY-RUN, aucune écriture'}).`);

  const processed = [];
  const failed = [];

  for (const book of targets) {
    const id = book.book_id;
    console.log(`\n— Livre ${id} (${book.total_chunks} chunks, ${book.distinct_index} index distincts avant) —`);

    if (!execute) {
      const agreement = await checkOrderAgreement(exec, id);
      const mapping = await dryRunBook(exec, id);
      console.log(`  DRY-RUN : ${mapping.length} chunk(s) changeraient de chunk_index.`);
      console.log(`  Invariant d'identité (id == book_id-rang) : ${agreement.eligible ? 'RESPECTÉ (éligible)' : `NON RESPECTÉ (${agreement.identityOrderMismatches} ligne(s) sur ${agreement.totalChunks}) — EXCLU, examen manuel requis`}`);
      for (const row of mapping.slice(0, 20)) {
        console.log(`    ${row.id} : ${row.old_chunk_index} → ${row.new_chunk_index} (rowid ${row.rowid})`);
      }
      if (mapping.length > 20) console.log(`    ... et ${mapping.length - 20} de plus.`);
      recordBookStatus(logPath, id, 'dry_run_shown', { chunks_a_renumeroter: mapping.length, agreement });
      processed.push(id);
      continue;
    }

    // Filet de sécurité de dernier recours : repairBook() encapsule déjà toute exception à partir
    // de UPDATE_ATTEMPTED, mais checkOrderAgreement/SECTION_BACKUP_TABLE_CREATE/sectionBackupBook
    // (état PRE_WRITE → BACKUP_DONE) restent hors de son propre try/catch interne — une exception
    // levée là (ex. `wrangler` injoignable avant même la sauvegarde) doit quand même être consignée
    // au journal et arrêter la campagne, jamais remonter non capturée jusqu'à main().
    let result;
    let repairBookException = null;
    try {
      result = await repairBook(exec, id);
    } catch (err) {
      repairBookException = err;
    }

    if (repairBookException) {
      console.error(`  🚨 EXCEPTION NON GÉRÉE avant tout état restaurable pour le livre ${id} : ${repairBookException.message}. État réel du livre INCONNU — INTERVENTION MANUELLE IMMÉDIATE REQUISE, ne pas relancer le script sur ce livre avant vérification manuelle.`);
      recordBookStatus(logPath, id, 'failed_restore_unknown', { error: repairBookException.message, stage: 'pre_write_or_backup' });
      failed.push(id);
      console.error('\nArrêt CRITIQUE de la campagne.');
      break;
    } else if (result.ok) {
      console.log(`  ✅ RÉPARÉ — ${result.verify.total_chunks} chunks, chunk_index maintenant 0..${result.verify.max_index}, ordre rowid confirmé.`);
      recordBookStatus(logPath, id, 'repaired', result.verify);
      processed.push(id);
    } else if (result.reason === 'order_divergence') {
      console.error(`  ⛔ EXCLU — invariant d'identité non respecté pour ce livre (${result.agreement.identityOrderMismatches} ligne(s) sur ${result.agreement.totalChunks}) — jamais de réparation automatique sur un ordre incertain.`);
      recordBookStatus(logPath, id, 'excluded_order_divergence', result.agreement);
      failed.push(id);
      console.error('\nArrêt de la campagne.');
      break;
    } else if (result.restoreCritical) {
      // La commande de restauration elle-même a levé une exception — état CRITIQUE distinct,
      // jamais confondu avec failed_and_restored/failed_restore_failed : l'état réel du livre est
      // inconnu (la restauration n'a peut-être même pas pu s'exécuter). Arrêt IMMÉDIAT, jamais une
      // poursuite silencieuse vers le livre suivant.
      console.error(`  🚨 RESTAURATION EN ÉCHEC CRITIQUE — la commande de restauration elle-même a levé une exception pour le livre ${id} : ${result.restoreError}. État réel du livre INCONNU — INTERVENTION MANUELLE IMMÉDIATE REQUISE, ne pas relancer le script sur ce livre avant vérification manuelle.`);
      recordBookStatus(logPath, id, 'failed_restore_unknown', result);
      failed.push(id);
      console.error('\nArrêt CRITIQUE de la campagne.');
      break;
    } else {
      console.error(`  ❌ ÉCHEC — vérification post-réparation non satisfaite : ${JSON.stringify(result.verify)}, violations d'ordre : ${result.orderViolations.length}`);
      if (result.restored) {
        console.error(`  ↩️  Livre restauré à son état antérieur (valeurs ET nombre de lignes confirmés identiques à la sauvegarde).`);
      } else {
        console.error(`  🚨 ÉCHEC DE RESTAURATION — le livre ${id} peut être dans un état incohérent (détail : ${JSON.stringify(result.restoreDetail)}). INTERVENTION MANUELLE IMMÉDIATE REQUISE, ne pas relancer le script sur ce livre avant vérification manuelle.`);
      }
      recordBookStatus(logPath, id, result.restored ? 'failed_and_restored' : 'failed_restore_failed', result);
      failed.push(id);
      console.error('\nArrêt de la campagne — un échec ne doit jamais être ignoré silencieusement.');
      break;
    }
  }

  return { processed, skipped: [], failed };
}

// ═══════════════════════════════════════════════════════════════════
// Point d'entrée CLI
// ═══════════════════════════════════════════════════════════════════
async function main() {
  const args = process.argv.slice(2);

  // Correctif 9 — point d'entrée UNIQUE de validation, avant absolument toute autre logique
  // (avant même l'extraction de --db, avant toute tentative wrangler).
  try {
    validateArgsSchema(args);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
    return;
  }

  const flag = (name) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  const flagValue = (name) => {
    const f = flag(name);
    if (!f) return undefined;
    return f.includes('=') ? f.split('=').slice(1).join('=') : true;
  };

  const dbName = flagValue('db');
  const bookId = flagValue('book-id');
  const confirmValue = flagValue('confirm');
  const logPath = flagValue('log') || path.join(__dirname, 'repair-chunk-index-progress.json');
  const manifestDir = flagValue('manifest-dir') || __dirname;

  let execute, allConfirmed, diagnoseOrder;
  try {
    execute = parseStrictBooleanFlag(args, 'execute');
    allConfirmed = parseStrictBooleanFlag(args, 'all-confirmed');
    diagnoseOrder = parseStrictBooleanFlag(args, 'diagnose-order');
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
    return;
  }

  if (!dbName) {
    console.error('Usage: node repair-chunk-index.js --db=<nom_base_D1> [--diagnose-order | --book-id=<id> | --all-confirmed --confirm=<nom_base>] [--execute]');
    process.exitCode = 1;
    return;
  }

  if (allConfirmed && confirmValue !== dbName) {
    console.error(`Correctif 4 : --confirm doit répéter exactement --db ("${dbName}") — obtenu "${confirmValue}". Refusé par précaution.`);
    process.exitCode = 1;
    return;
  }

  const exec = (sql) => execViaWrangler(dbName, sql);

  if (diagnoseOrder) {
    console.log('Diagnostic Correctif 6 — invariant d\'identité exacte sur tout le corpus affecté (lecture seule)...');
    const diagnosis = await diagnoseOrderForAllAffected(exec);
    const { eligiblePath, excludedPath } = writeManifests(manifestDir, diagnosis, dbName);
    console.log(`\n${diagnosis.totalAffected} livre(s) affecté(s) au total.`);
    console.log(`  ✅ ${diagnosis.eligible.length} éligible(s) à la réparation automatique → ${eligiblePath}`);
    console.log(`  ⛔ ${diagnosis.excluded.length} exclu(s) (invariant d'identité non respecté, examen manuel requis) → ${excludedPath}`);
    for (const b of diagnosis.excluded) {
      console.log(`     - ${b.bookId} : ${b.identityOrderMismatches} ligne(s) sur ${b.totalChunks} ne respectent pas id == book_id-rang`);
    }
    return;
  }

  if (execute) {
    console.log('⚠️  MODE EXÉCUTION RÉELLE — écriture contre la base D1 distante.');
  } else {
    console.log('Mode DRY-RUN (par défaut) — aucune écriture. Ajouter --execute pour appliquer réellement.');
  }

  let result;
  try {
    result = await runRepairCampaign({ exec, execute, bookId, allConfirmed, dbName, manifestDir, logPath });
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
    return;
  }
  console.log(`\nTerminé — ${result.processed.length} traité(s), ${result.failed.length} échec(s).`);
  if (result.failed.length) process.exitCode = 1;
}

module.exports = {
  diagnoseAffectedBooks,
  dryRunBook,
  checkOrderAgreement,
  diagnoseOrderForAllAffected,
  writeManifests,
  loadEligibleManifest,
  repairBook,
  runRepairCampaign,
  parseExecuteFlag,
  parseStrictBooleanFlag,
  validateArgsSchema,
  sectionBDryRunMapping,
  sectionOrderAgreement,
  sectionDRepairUpdate,
  sectionEVerify,
  sectionFOrderCheck,
  SECTION_A_DIAGNOSTIC,
  SECTION_BACKUP_TABLE_CREATE,
  sectionBackupBook,
  sectionRestoreBook,
  sectionVerifyRestore,
  sectionVerifyRestoreComplete,
  escapeSqlLiteral,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('ÉCHEC:', err);
    process.exitCode = 1;
  });
}
