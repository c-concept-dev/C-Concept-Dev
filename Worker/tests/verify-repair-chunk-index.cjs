// STUDIO CLINIQUE — Voie 1 (renumérotation chunk_index) — vérification réelle du script
// Worker/scripts/repair-chunk-index.js contre une VRAIE base SQLite (node:sqlite, même moteur
// que D1), fonctions importées telles quelles (jamais réimplémentées). Étendu pour
// VOIE1-SAFETY-CLOSE (4 garde-fous) puis VOIE1-SAFETY-CLOSE-2 (3 garde-fous supplémentaires :
// --all-confirmed/--diagnose-order strict, invariant d'identité exact, manifeste lié à la base ;
// + vérification de restauration élargie) puis VOIE1-SAFETY-CLOSE-3 (Correctif 8 : repairBook()
// devient une machine à états — toute exception survenant à partir de l'UPDATE de réparation
// déclenche une tentative de restauration automatique, avec un état CRITIQUE distinct
// (failed_restore_unknown) si la restauration elle-même échoue par exception).
//
// Aucun accès Cloudflare D1/Vectorize n'existe depuis ce bac à sable (`wrangler` n'est même pas
// installé ici) : impossible de tester contre therapeute-library-staging réelle. Alternative
// documentée : le MÊME SQL exécuté contre un moteur SQLite réel (node:sqlite) — seule la couche
// de transport diffère (comme les tests Worker de cette session mockent uniquement la frontière
// réseau, jamais la logique).
const { DatabaseSync } = require('node:sqlite');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const {
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
} = require('../scripts/repair-chunk-index.js');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'repair-chunk-index.js');
const DB_NAME = 'therapeute-library-test';

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE chunks (
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
      tags TEXT,
      page_end INTEGER
    );
  `);
  return db;
}

function makeExec(db) {
  return async (sql) => db.prepare(sql).all();
}

function insertBook(db, bookId, title, count, chunkIndexFn) {
  const stmt = db.prepare(
    `INSERT INTO chunks (id, book_id, book_title, chunk_index, content) VALUES (?, ?, ?, ?, ?)`
  );
  for (let i = 0; i < count; i++) {
    stmt.run(`${bookId}-${i}`, bookId, title, chunkIndexFn(i), `contenu séquentiel réel #${i} du livre ${title}`);
  }
}

function orderedByRowid(db, bookId) {
  return db.prepare(`SELECT id, chunk_index FROM chunks WHERE book_id = ? ORDER BY rowid`).all(bookId);
}

(async () => {
  const db = makeDb();
  const exec = makeExec(db);
  const tmpLog = path.join(os.tmpdir(), `repair-chunk-index-test-${Date.now()}.json`);
  const tmpManifestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-manifests-'));

  // Livre A — reproduit le cas extrême mesuré (960 chunks, 20 index distincts, 48 cycles 0..19).
  insertBook(db, 'book-A-960', 'Métaphores et Suggestions Hypnotiques (test)', 960, (i) => i % 20);
  // Livre B — fortement collisionné avec un motif différent (925 chunks, cycle de 37).
  insertBook(db, 'book-B-925', 'Manuel Clinique des Psychothérapies de Couple (test)', 925, (i) => i % 37);
  // Livre C — déjà propre (chunk_index dense 0..9) — ne doit JAMAIS être touché.
  insertBook(db, 'book-C-clean', 'Livre déjà correct (témoin)', 10, (i) => i);

  // ── 1. Diagnostic : A et B détectés, C absent ──
  const affected = await diagnoseAffectedBooks(exec);
  const affectedIds = affected.map((b) => b.book_id).sort();
  assert.deepEqual(affectedIds, ['book-A-960', 'book-B-925']);
  console.log('PASS 1/43 — diagnostic détecte A et B, ignore le livre déjà propre C');

  // ── 2. Dry-run sur A : aucune écriture, mapping non vide ──
  const beforeDryRun = orderedByRowid(db, 'book-A-960');
  const mapping = await dryRunBook(exec, 'book-A-960');
  assert.ok(mapping.length > 900, `mapping devrait couvrir la quasi-totalité des 960 chunks, obtenu ${mapping.length}`);
  const afterDryRun = orderedByRowid(db, 'book-A-960');
  assert.deepEqual(beforeDryRun, afterDryRun, 'le dry-run ne doit JAMAIS écrire');
  console.log(`PASS 2/43 — dry-run sur le livre A : ${mapping.length} chunks à renuméroter, aucune écriture confirmée`);

  // ── 3. Réparation réelle de A : dense 0..959, ORDRE préservé ──
  const resultA = await repairBook(exec, 'book-A-960');
  assert.equal(resultA.ok, true, `réparation du livre A devrait réussir : ${JSON.stringify(resultA.verify)}`);
  assert.equal(resultA.verify.total_chunks, 960);
  assert.equal(resultA.verify.distinct_index, 960);
  assert.equal(resultA.verify.min_index, 0);
  assert.equal(resultA.verify.max_index, 959);
  const afterRepairA = orderedByRowid(db, 'book-A-960');
  afterRepairA.forEach((row, i) => assert.equal(row.chunk_index, i, `rang ${i} devrait porter chunk_index=${i}, obtenu ${row.chunk_index} pour ${row.id}`));
  console.log('PASS 3/43 — livre A réparé : 960/960 index distincts, 0..959, ordre rowid strictement préservé');

  // ── 4. Réparation réelle de B ──
  const resultB = await repairBook(exec, 'book-B-925');
  assert.equal(resultB.ok, true, `réparation du livre B devrait réussir : ${JSON.stringify(resultB.verify)}`);
  assert.equal(resultB.verify.total_chunks, 925);
  assert.equal(resultB.verify.max_index, 924);
  const afterRepairB = orderedByRowid(db, 'book-B-925');
  afterRepairB.forEach((row, i) => assert.equal(row.chunk_index, i));
  console.log('PASS 4/43 — livre B réparé : 925/925 index distincts, 0..924, ordre rowid strictement préservé');

  // ── 5. Livre témoin C jamais touché ──
  const cRows = orderedByRowid(db, 'book-C-clean');
  cRows.forEach((row, i) => assert.equal(row.chunk_index, i));
  console.log('PASS 5/43 — livre témoin C (déjà propre) inchangé après les réparations de A et B');

  // ── 6. Idempotence ──
  const affectedAfter = await diagnoseAffectedBooks(exec);
  assert.deepEqual(affectedAfter.map((b) => b.book_id), []);
  const beforeRerun = orderedByRowid(db, 'book-A-960');
  const rerunResult = await repairBook(exec, 'book-A-960');
  assert.equal(rerunResult.ok, true);
  const afterRerun = orderedByRowid(db, 'book-A-960');
  assert.deepEqual(beforeRerun, afterRerun, 'relancer la réparation sur un livre déjà propre ne doit rien changer');
  console.log('PASS 6/43 — idempotence confirmée : plus aucun livre affecté après réparation, relance = no-op');

  // ── 7. Échec jamais silencieux + arrêt AVANT le livre suivant (via --all-confirmed) ──
  insertBook(db, 'book-D-broken', 'Livre de test panne', 5, (i) => i % 2);
  insertBook(db, 'book-E-after', 'Livre après la panne (ne doit jamais être atteint)', 5, (i) => i % 2);
  fs.writeFileSync(path.join(tmpManifestDir, 'manifest-eligible.json'), JSON.stringify({ database: DB_NAME, book_ids: ['book-D-broken', 'book-E-after'] }));
  const beforeBookD = orderedByRowid(db, 'book-D-broken');
  let bookEWasProcessed = false;
  const execWithInjectedFailure = async (sql) => {
    if (sql.includes('book-D-broken') && sql.trim().startsWith('SELECT COUNT(*)') && sql.includes('total_chunks') && !sql.includes('WITH ranked') && !sql.includes('chunks_count')) {
      return [{ total_chunks: 5, distinct_index: 4, min_index: 0, max_index: 4 }];
    }
    if (sql.includes('book-E-after')) bookEWasProcessed = true;
    return db.prepare(sql).all();
  };
  const campaignResult = await runRepairCampaign({
    exec: execWithInjectedFailure,
    execute: true,
    bookId: undefined,
    allConfirmed: true,
    dbName: DB_NAME,
    manifestDir: tmpManifestDir,
    logPath: tmpLog,
  });
  assert.deepEqual(campaignResult.failed, ['book-D-broken']);
  assert.equal(bookEWasProcessed, false, 'la campagne ne doit JAMAIS continuer vers le livre suivant après un échec');
  console.log('PASS 7/43 — un échec de vérification post-réparation est détecté et arrête la campagne AVANT le livre suivant');

  // ── 8 (Correctif 3) — le livre en échec est bien RESTAURÉ à son état d'origine ──
  const afterFailureD = orderedByRowid(db, 'book-D-broken');
  assert.deepEqual(afterFailureD, beforeBookD, 'le livre en échec de vérification doit être restauré à son chunk_index d\'origine, pas laissé modifié');
  const loggedProgress = JSON.parse(fs.readFileSync(tmpLog, 'utf8'));
  assert.equal(loggedProgress.books['book-D-broken'].status, 'failed_and_restored');
  console.log('PASS 8/43 — Correctif 3 : le livre en échec est automatiquement restauré à son état antérieur, consigné "failed_and_restored"');
  fs.unlinkSync(tmpLog);

  // ── 9 (Correctif 1) — parsing strict de --execute ──
  assert.equal(parseExecuteFlag(['--db=x']), false);
  assert.equal(parseExecuteFlag(['--db=x', '--execute']), true);
  for (const bad of ['--execute=false', '--execute=no', '--execute=0', '--execute=', '--execute=true']) {
    assert.throws(() => parseExecuteFlag(['--db=x', bad]), /ne prend jamais de valeur/, `--execute avec une valeur (${bad}) devrait être rejeté`);
  }
  console.log('PASS 9/43 — Correctif 1 : --execute strict ; --execute=false/no/0/vide/true tous rejetés explicitement');

  // ── 10 (Correctif 5) — même rigueur appliquée à --all-confirmed et --diagnose-order ──
  assert.equal(parseStrictBooleanFlag(['--db=x'], 'all-confirmed'), false);
  assert.equal(parseStrictBooleanFlag(['--db=x', '--all-confirmed'], 'all-confirmed'), true);
  for (const bad of ['--all-confirmed=false', '--all-confirmed=no', '--all-confirmed=0']) {
    assert.throws(() => parseStrictBooleanFlag(['--db=x', bad], 'all-confirmed'), /ne prend jamais de valeur/, `--all-confirmed avec une valeur (${bad}) devrait être rejeté, exactement comme --execute (même classe de bug)`);
  }
  for (const bad of ['--diagnose-order=false', '--diagnose-order=true']) {
    assert.throws(() => parseStrictBooleanFlag(['--db=x', bad], 'diagnose-order'), /ne prend jamais de valeur/);
  }
  console.log('PASS 10/43 — Correctif 5 : --all-confirmed et --diagnose-order soumis au même parsing strict que --execute');

  // ── 11 (Correctif 6) — invariant d'identité exacte : propre / TROUÉ (le cas que l'ancien
  //      critère de rang relatif laissait passer à tort) / format invalide ──
  const dbOrder = makeDb();
  const execOrder = makeExec(dbOrder);
  dbOrder.exec(`INSERT INTO chunks (id, book_id, chunk_index) VALUES ('ok-0','ok',0),('ok-1','ok',0),('ok-2','ok',1)`);
  const cleanCheck = await checkOrderAgreement(execOrder, 'ok');
  assert.equal(cleanCheck.eligible, true);
  assert.equal(cleanCheck.identityOrderMismatches, 0);

  // Suite TROUÉE : livre-0, livre-2, livre-4 — l'ORDRE RELATIF est parfaitement respecté (0<2<4
  // dans le même ordre que rowid), donc l'ANCIEN critère (rang relatif) aurait dit "éligible" à
  // tort. Le nouvel invariant d'identité doit le détecter : id != book_id-rang pour les rangs 1 et 2.
  dbOrder.exec(`INSERT INTO chunks (id, book_id, chunk_index) VALUES ('gap-0','gap',0),('gap-2','gap',0),('gap-4','gap',1)`);
  const gappedCheck = await checkOrderAgreement(execOrder, 'gap');
  assert.equal(gappedCheck.eligible, false, 'une suite trouée (gap-0, gap-2, gap-4) doit être exclue — l\'ancien critère de rang relatif la laissait passer à tort');
  assert.equal(gappedCheck.identityOrderMismatches, 2, 'les rangs 1 (attendu gap-1, obtenu gap-2) et 2 (attendu gap-2, obtenu gap-4) doivent être détectés comme mismatch');

  dbOrder.exec(`INSERT INTO chunks (id, book_id, chunk_index) VALUES ('inv-customformat','inv',0),('inv-1','inv',0)`);
  const invalidCheck = await checkOrderAgreement(execOrder, 'inv');
  assert.equal(invalidCheck.eligible, false);
  assert.ok(invalidCheck.identityOrderMismatches > 0);
  console.log('PASS 11/43 — Correctif 6 : invariant d\'identité exacte détecte le cas trou numérique (gap-0/gap-2/gap-4) que l\'ancien critère de rang relatif laissait passer, et le format invalide');

  // ── 12 (Correctif 2 élargi) — diagnostic sur TOUT le corpus affecté + manifestes liés à la base (Correctif 7) ──
  insertBook(dbOrder, 'book-F-eligible', 'Livre éligible', 40, (i) => i % 7);
  const diagnosis = await diagnoseOrderForAllAffected(execOrder);
  const eligibleIds = diagnosis.eligible.map((b) => b.bookId).sort();
  const excludedIds = diagnosis.excluded.map((b) => b.bookId).sort();
  assert.ok(eligibleIds.includes('book-F-eligible'));
  assert.ok(excludedIds.includes('gap') && excludedIds.includes('inv'));
  const { eligiblePath, excludedPath } = writeManifests(tmpManifestDir, diagnosis, DB_NAME);
  const rawManifest = JSON.parse(fs.readFileSync(eligiblePath, 'utf8'));
  assert.equal(rawManifest.database, DB_NAME, 'Correctif 7 : le manifeste doit porter le nom de la base sur laquelle il a été généré');
  assert.ok(fs.existsSync(excludedPath));
  const reloadedEligible = loadEligibleManifest(tmpManifestDir, DB_NAME);
  assert.ok(reloadedEligible.includes('book-F-eligible'));
  assert.ok(!reloadedEligible.includes('gap') && !reloadedEligible.includes('inv'));
  console.log(`PASS 12/43 — Correctif 2 élargi + Correctif 7 : diagnostic exhaustif (${diagnosis.eligible.length} éligibles, ${diagnosis.excluded.length} exclus), manifeste porte "database":"${DB_NAME}"`);

  // ── 13 (Correctif 7) — un manifeste généré pour UNE AUTRE base est refusé, jamais réutilisé ──
  assert.throws(
    () => loadEligibleManifest(tmpManifestDir, 'therapeute-library-staging'),
    /Correctif 7.*généré pour la base/,
    'un manifeste généré pour "therapeute-library-test" ne doit jamais être accepté pour "therapeute-library-staging"'
  );
  console.log('PASS 13/43 — Correctif 7 : manifeste refusé si "database" ne correspond pas exactement à --db, empêche une réparation croisée entre bases');

  // ── 14 (Correctif 6, défense en profondeur) — repairBook refuse un livre troué, SANS écrire ──
  const beforeRefusal = orderedByRowid(dbOrder, 'gap');
  const refused = await repairBook(execOrder, 'gap');
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'order_divergence');
  const afterRefusal = orderedByRowid(dbOrder, 'gap');
  assert.deepEqual(beforeRefusal, afterRefusal, 'repairBook ne doit RIEN écrire sur un livre à l\'invariant d\'identité non respecté');
  console.log('PASS 14/43 — Correctif 6 (défense en profondeur) : repairBook refuse un livre troué avant toute écriture');

  // ── 15 (Correctif 4) — --execute seul (sans --book-id ni --all-confirmed) est REFUSÉ ──
  await assert.rejects(
    () => runRepairCampaign({ exec: execOrder, execute: true, bookId: undefined, allConfirmed: false, dbName: DB_NAME, manifestDir: tmpManifestDir, logPath: tmpLog }),
    /Correctif 4.*--execute seul/,
  );
  console.log('PASS 15/43 — Correctif 4 : --execute seul (sans --book-id ni --all-confirmed) est refusé avant toute exécution');

  // ── 16 (Correctif 4 + 7) — --all-confirmed ne traite que les livres du manifeste, de la bonne base ──
  const dbCampaign = makeDb();
  const execCampaign = makeExec(dbCampaign);
  insertBook(dbCampaign, 'manifest-yes', 'Livre confirmé', 15, (i) => i % 4);
  insertBook(dbCampaign, 'manifest-no', 'Livre non confirmé (jamais touché)', 15, (i) => i % 4);
  const campaignManifestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-manifests-campaign-'));
  fs.writeFileSync(path.join(campaignManifestDir, 'manifest-eligible.json'), JSON.stringify({ database: DB_NAME, book_ids: ['manifest-yes'] }));
  const beforeManifestNo = orderedByRowid(dbCampaign, 'manifest-no');
  const confirmedResult = await runRepairCampaign({
    exec: execCampaign, execute: true, bookId: undefined, allConfirmed: true, dbName: DB_NAME, manifestDir: campaignManifestDir, logPath: tmpLog,
  });
  assert.deepEqual(confirmedResult.processed, ['manifest-yes']);
  const afterManifestYes = orderedByRowid(dbCampaign, 'manifest-yes');
  afterManifestYes.forEach((row, i) => assert.equal(row.chunk_index, i));
  const afterManifestNo = orderedByRowid(dbCampaign, 'manifest-no');
  assert.deepEqual(beforeManifestNo, afterManifestNo, 'un livre absent du manifeste ne doit JAMAIS être touché par --all-confirmed');
  console.log('PASS 16/43 — Correctif 4 : --all-confirmed ne traite que les livres listés dans le manifeste');
  fs.unlinkSync(tmpLog);

  // ── 17 (P1.2) — vérification de restauration ÉLARGIE : un rollback partiel (comptage de lignes
  //      incohérent) est détecté même si les VALEURS déjà appariées ne divergent pas ──
  const dbPartial = makeDb();
  const execPartialBase = makeExec(dbPartial);
  insertBook(dbPartial, 'book-partial-restore', 'Livre restauration partielle', 6, (i) => i % 3);
  let completenessQueried = false;
  const execWithPartialRestore = async (sql) => {
    if (sql.includes('book-partial-restore') && sql.trim().startsWith('SELECT COUNT(*)') && sql.includes('total_chunks') && !sql.includes('WITH ranked') && !sql.includes('chunks_count')) {
      return [{ total_chunks: 6, distinct_index: 5, min_index: 0, max_index: 5 }]; // force l'échec de vérification
    }
    if (sql.includes('chunks_count') && sql.includes('book-partial-restore')) {
      completenessQueried = true;
      // Simule un rollback partiel : le nombre de lignes chunks ne correspond plus au nombre de
      // lignes de sauvegarde, alors que les valeurs déjà appariées (SECTION G) ne divergeraient
      // pas — exactement le cas que la SECTION G seule ne peut pas détecter.
      return [{ chunks_count: 6, backup_count: 6, chunks_only: 0, backup_only: 1 }];
    }
    return dbPartial.prepare(sql).all();
  };
  const partialResult = await repairBook(execWithPartialRestore, 'book-partial-restore');
  assert.equal(partialResult.ok, false);
  assert.equal(completenessQueried, true, 'la vérification de restauration élargie (P1.2) doit être appelée après un échec');
  assert.equal(partialResult.restored, false, 'un rollback partiel (backup_only=1) doit être signalé comme restauration NON réussie, même si les valeurs appariées ne divergent pas');
  console.log('PASS 17/43 — P1.2 : un rollback partiel (comptage de lignes incohérent) est détecté par la vérification de restauration élargie, pas seulement par la comparaison de valeurs');

  // ── 18 (Correctif 8) — l'UPDATE réussit, puis la vérification (SECTION E) lève une exception
  //      réelle (pas un résultat négatif) : la restauration automatique doit quand même se
  //      déclencher, réussir (la commande de restauration elle-même n'est pas perturbée ici), et
  //      la campagne doit s'arrêter avec le statut consigné correct — jamais une exception non
  //      gérée remontant jusqu'à main() sans tentative de restauration ni écriture au journal ──
  const dbVerifyThrows = makeDb();
  insertBook(dbVerifyThrows, 'book-F-verify-throws', 'Livre exception vérification', 6, (i) => i % 3);
  insertBook(dbVerifyThrows, 'book-G-after-verify-throw', 'Livre après (ne doit jamais être atteint)', 6, (i) => i % 3);
  const tmpManifestDirVerifyThrows = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-manifests-verify-throws-'));
  fs.writeFileSync(path.join(tmpManifestDirVerifyThrows, 'manifest-eligible.json'), JSON.stringify({ database: DB_NAME, book_ids: ['book-F-verify-throws', 'book-G-after-verify-throw'] }));
  const tmpLogVerifyThrows = path.join(os.tmpdir(), `repair-chunk-index-test-verify-throws-${Date.now()}.json`);
  const beforeBookF = orderedByRowid(dbVerifyThrows, 'book-F-verify-throws');
  let bookGWasProcessed = false;
  const execWithVerifyException = async (sql) => {
    if (sql.includes('book-F-verify-throws') && sql.trim().startsWith('SELECT COUNT(*)') && sql.includes('total_chunks') && !sql.includes('WITH ranked') && !sql.includes('chunks_count')) {
      throw new Error('panne réseau wrangler simulée pendant la vérification (SECTION E)');
    }
    if (sql.includes('book-G-after-verify-throw')) bookGWasProcessed = true;
    return dbVerifyThrows.prepare(sql).all();
  };
  const campaignResultVerifyThrows = await runRepairCampaign({
    exec: execWithVerifyException,
    execute: true,
    bookId: undefined,
    allConfirmed: true,
    dbName: DB_NAME,
    manifestDir: tmpManifestDirVerifyThrows,
    logPath: tmpLogVerifyThrows,
  });
  assert.deepEqual(campaignResultVerifyThrows.failed, ['book-F-verify-throws']);
  assert.equal(bookGWasProcessed, false, 'une exception de vérification doit arrêter la campagne AVANT le livre suivant, comme un échec ordinaire');
  const afterBookF = orderedByRowid(dbVerifyThrows, 'book-F-verify-throws');
  assert.deepEqual(afterBookF, beforeBookF, 'une exception levée pendant la vérification (pas seulement un résultat négatif) doit quand même déclencher une restauration automatique complète');
  const loggedVerifyThrows = JSON.parse(fs.readFileSync(tmpLogVerifyThrows, 'utf8'));
  assert.equal(loggedVerifyThrows.books['book-F-verify-throws'].status, 'failed_and_restored', 'la restauration a réussi (seule la vérification a levé une exception) : le statut doit rester failed_and_restored, pas failed_restore_unknown');
  fs.unlinkSync(tmpLogVerifyThrows);
  fs.rmSync(tmpManifestDirVerifyThrows, { recursive: true, force: true });
  console.log('PASS 18/43 — Correctif 8 : une exception réelle (pas un résultat négatif) levée pendant la vérification post-réparation déclenche quand même la restauration automatique complète, statut "failed_and_restored" correctement consigné, campagne arrêtée');

  // ── 19 (Correctif 8) — la vérification échoue NORMALEMENT (résultat négatif, pas d'exception),
  //      PUIS la commande de restauration ELLE-MÊME lève une exception : état CRITIQUE distinct
  //      failed_restore_unknown attendu EXACTEMENT, jamais un faux failed_and_restored, arrêt
  //      IMMÉDIAT de la campagne ──
  const dbRestoreThrows = makeDb();
  insertBook(dbRestoreThrows, 'book-H-restore-throws', 'Livre exception restauration', 6, (i) => i % 3);
  insertBook(dbRestoreThrows, 'book-I-after-restore-throw', 'Livre après (ne doit jamais être atteint)', 6, (i) => i % 3);
  const tmpManifestDirRestoreThrows = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-manifests-restore-throws-'));
  fs.writeFileSync(path.join(tmpManifestDirRestoreThrows, 'manifest-eligible.json'), JSON.stringify({ database: DB_NAME, book_ids: ['book-H-restore-throws', 'book-I-after-restore-throw'] }));
  const tmpLogRestoreThrows = path.join(os.tmpdir(), `repair-chunk-index-test-restore-throws-${Date.now()}.json`);
  let bookIWasProcessed = false;
  const execWithRestoreException = async (sql) => {
    if (sql.includes('book-H-restore-throws') && sql.trim().startsWith('SELECT COUNT(*)') && sql.includes('total_chunks') && !sql.includes('WITH ranked') && !sql.includes('chunks_count')) {
      // Résultat NÉGATIF ordinaire (pas une exception) — force l'échec de la vérification post-réparation.
      return [{ total_chunks: 6, distinct_index: 5, min_index: 0, max_index: 5 }];
    }
    if (sql.trim().startsWith('UPDATE chunks') && sql.includes('chunk_index_repair_backup') && sql.includes('book-H-restore-throws')) {
      throw new Error('panne réseau wrangler simulée pendant la restauration elle-même');
    }
    if (sql.includes('book-I-after-restore-throw')) bookIWasProcessed = true;
    return dbRestoreThrows.prepare(sql).all();
  };
  const campaignResultRestoreThrows = await runRepairCampaign({
    exec: execWithRestoreException,
    execute: true,
    bookId: undefined,
    allConfirmed: true,
    dbName: DB_NAME,
    manifestDir: tmpManifestDirRestoreThrows,
    logPath: tmpLogRestoreThrows,
  });
  assert.deepEqual(campaignResultRestoreThrows.failed, ['book-H-restore-throws']);
  assert.equal(bookIWasProcessed, false, 'un échec de restauration critique doit arrêter la campagne IMMÉDIATEMENT, jamais une poursuite silencieuse vers le livre suivant');
  const loggedRestoreThrows = JSON.parse(fs.readFileSync(tmpLogRestoreThrows, 'utf8'));
  assert.equal(loggedRestoreThrows.books['book-H-restore-throws'].status, 'failed_restore_unknown', 'la commande de restauration a elle-même levé une exception : le statut doit être EXACTEMENT failed_restore_unknown');
  assert.notEqual(loggedRestoreThrows.books['book-H-restore-throws'].status, 'failed_and_restored', 'jamais un faux failed_and_restored quand la restauration elle-même a levé une exception');
  fs.unlinkSync(tmpLogRestoreThrows);
  fs.rmSync(tmpManifestDirRestoreThrows, { recursive: true, force: true });
  console.log('PASS 19/43 — Correctif 8 : une vérification en échec normal SUIVIE d\'une exception de la commande de restauration elle-même produit l\'état CRITIQUE distinct "failed_restore_unknown" (jamais un faux "failed_and_restored"), arrêt immédiat de la campagne');

  // ── 20-23 (bout en bout CLI réel) — refus AVANT tout appel wrangler ──
  function runCli(args) {
    try {
      execFileSync('node', [SCRIPT_PATH, ...args], { encoding: 'utf8' });
      return { code: 0, output: '' };
    } catch (e) {
      return { code: e.status, output: (e.stdout || '') + (e.stderr || '') };
    }
  }

  const cliExecuteFalse = runCli(['--db=test-db', '--execute=false']);
  assert.notEqual(cliExecuteFalse.code, 0);
  assert.ok(cliExecuteFalse.output.includes('ne prend jamais de valeur'));
  assert.ok(!cliExecuteFalse.output.includes('wrangler'));
  console.log('PASS 20/43 — CLI réel : `--execute=false` refusé explicitement, avant tout appel wrangler');

  const cliAllConfirmedFalse = runCli(['--db=test-db', '--all-confirmed=false']);
  assert.notEqual(cliAllConfirmedFalse.code, 0);
  assert.ok(cliAllConfirmedFalse.output.includes('ne prend jamais de valeur'), `sortie attendue avec le message Correctif 5, obtenu : ${cliAllConfirmedFalse.output}`);
  assert.ok(!cliAllConfirmedFalse.output.includes('wrangler'));
  console.log('PASS 21/43 — CLI réel : `--all-confirmed=false` refusé explicitement (Correctif 5), avant tout appel wrangler');

  const cliBareExecute = runCli(['--db=test-db', '--execute']);
  assert.notEqual(cliBareExecute.code, 0);
  assert.ok(cliBareExecute.output.includes('Correctif 4'));
  console.log('PASS 22/43 — CLI réel : `--execute` seul refusé, avant tout appel wrangler');

  const cliConfirmMismatch = runCli(['--db=test-db', '--execute', '--all-confirmed', '--confirm=autre-base']);
  assert.notEqual(cliConfirmMismatch.code, 0);
  assert.ok(cliConfirmMismatch.output.includes('--confirm doit répéter exactement --db'));
  console.log('PASS 23/43 — CLI réel : `--confirm` non concordant refusé, avant tout appel wrangler');

  // ── 24-35 (Correctif 9, SAFETY-CLOSE-4) — validation de schéma EXHAUSTIVE de process.argv,
  //      exactement les 12 cas listés par l'audit, tous rejetés AVANT tout appel wrangler ──
  const schemaRejectCases = [
    {
      args: ['--db=test-db', '--execute', 'false'],
      mustInclude: 'Argument non reconnu',
      desc: '`--execute false` (le second token isolé "false" n\'est plus silencieusement ignoré)',
    },
    {
      args: ['--db=test-db', '--all-confirmed', 'false'],
      mustInclude: 'Argument non reconnu',
      desc: '`--all-confirmed false`',
    },
    {
      args: ['--db=test-db', '--diagnose-order', 'false'],
      mustInclude: 'Argument non reconnu',
      desc: '`--diagnose-order false`',
    },
    {
      args: ['--db=test-db', '--execute=true'],
      mustInclude: 'ne prend jamais de valeur',
      desc: '`--execute=true`',
    },
    {
      args: ['--db=test-db', '--all-confirmed=no'],
      mustInclude: 'ne prend jamais de valeur',
      desc: '`--all-confirmed=no`',
    },
    {
      args: ['--db=test-db', 'false'],
      mustInclude: 'Argument non reconnu',
      desc: '`false` isolé (ne commence pas par --)',
    },
    {
      args: ['--db=test-db', 'foo'],
      mustInclude: 'Argument non reconnu',
      desc: '`foo` isolé (ne commence pas par --)',
    },
    {
      args: ['--db=test-db', '--unknown'],
      mustInclude: 'Argument non reconnu',
      desc: '`--unknown` (argument jamais défini)',
    },
    {
      args: ['--db=test-db', '--execut'],
      mustInclude: 'Argument non reconnu',
      desc: '`--execut` (faute de frappe sur --execute)',
    },
    {
      args: ['--db'],
      mustInclude: 'exige une valeur explicite',
      desc: '`--db` seul (sans valeur — pourrait aujourd\'hui recevoir `true` par erreur de logique)',
    },
    {
      args: ['--db=test-db', '--book-id'],
      mustInclude: 'exige une valeur explicite',
      desc: '`--book-id` seul (sans valeur)',
    },
    {
      args: ['--db=test-db', '--confirm'],
      mustInclude: 'exige une valeur explicite',
      desc: '`--confirm` seul (sans valeur)',
    },
  ];

  let schemaTestNumber = 24;
  for (const { args: caseArgs, mustInclude, desc } of schemaRejectCases) {
    const result = runCli(caseArgs);
    assert.notEqual(result.code, 0, `${desc} devrait être rejeté (code de sortie non nul), obtenu code=${result.code}, sortie="${result.output}"`);
    assert.ok(result.output.includes(mustInclude), `${desc} : sortie attendue contenant "${mustInclude}", obtenu : "${result.output}"`);
    assert.ok(!result.output.includes('wrangler'), `${desc} : ne doit jamais atteindre wrangler`);
    console.log(`PASS ${schemaTestNumber}/43 — Correctif 9 : ${desc} refusé par la validation de schéma exhaustive, avant tout appel wrangler`);
    schemaTestNumber++;
  }

  // Non-régression explicite : les formes déjà validées dans les lots précédents restent
  // ACCEPTÉES par la nouvelle validation de schéma (elles ne sont pas bloquées avant d'atteindre
  // la logique métier qui les traite normalement — Correctif 4, --confirm, etc. ci-dessus, et
  // tous les tests 1-23 déjà exécutés plus haut dans ce même fichier).
  const cliStillAccepted = runCli(['--db=test-db', '--book-id=some-id']);
  assert.ok(!cliStillAccepted.output.includes('Argument non reconnu'), `--book-id=<valeur> doit rester accepté par le schéma, obtenu : "${cliStillAccepted.output}"`);
  assert.ok(!cliStillAccepted.output.includes('exige une valeur explicite'), `--book-id=<valeur> doit rester accepté par le schéma, obtenu : "${cliStillAccepted.output}"`);
  console.log('PASS 36/43 — Correctif 9 (non-régression) : `--book-id=<valeur>` et les autres formes déjà valides restent acceptées par le schéma (aucun faux positif)');

  // ── 37-41 (Correctif 10, SAFETY-CLOSE-5, P0) — rejet de toute option dupliquée, même
  //      identique, exactement les 5 cas listés par l'audit, tous en CLI réel ──
  const duplicateRejectCases = [
    {
      args: ['--db=prod', '--db=prod'],
      mustInclude: 'apparaît plusieurs fois',
      desc: '`--db=prod --db=prod` (valeurs IDENTIQUES — rejeté quand même)',
    },
    {
      args: ['--db=prod', '--db=staging'],
      mustInclude: 'apparaît plusieurs fois',
      desc: '`--db=prod --db=staging` (valeurs contradictoires)',
    },
    {
      args: ['--db=test-db', '--book-id=A', '--book-id=B'],
      mustInclude: 'apparaît plusieurs fois',
      desc: '`--book-id=A --book-id=B`',
    },
    {
      args: ['--db=test-db', '--execute', '--execute'],
      mustInclude: 'apparaît plusieurs fois',
      desc: '`--execute --execute`',
    },
    {
      args: ['--db=test-db', '--all-confirmed', '--all-confirmed'],
      mustInclude: 'apparaît plusieurs fois',
      desc: '`--all-confirmed --all-confirmed`',
    },
  ];

  let dupTestNumber = 37;
  for (const { args: caseArgs, mustInclude, desc } of duplicateRejectCases) {
    const result = runCli(caseArgs);
    assert.notEqual(result.code, 0, `${desc} devrait être rejeté (code de sortie non nul), obtenu code=${result.code}, sortie="${result.output}"`);
    assert.ok(result.output.includes(mustInclude), `${desc} : sortie attendue contenant "${mustInclude}", obtenu : "${result.output}"`);
    assert.ok(!result.output.includes('wrangler'), `${desc} : ne doit jamais atteindre wrangler`);
    console.log(`PASS ${dupTestNumber}/43 — Correctif 10 : ${desc} refusé, avant tout appel wrangler`);
    dupTestNumber++;
  }

  // ── 42-43 (Correctif 11, SAFETY-CLOSE-5, P1) — modes mutuellement exclusifs ──
  const cliDiagnoseOrderWithExecute = runCli(['--db=test-db', '--diagnose-order', '--execute']);
  assert.notEqual(cliDiagnoseOrderWithExecute.code, 0);
  assert.ok(cliDiagnoseOrderWithExecute.output.includes('incompatible avec --execute'), `sortie attendue mentionnant l'incompatibilité --diagnose-order/--execute, obtenu : "${cliDiagnoseOrderWithExecute.output}"`);
  assert.ok(!cliDiagnoseOrderWithExecute.output.includes('wrangler'));
  console.log('PASS 42/43 — Correctif 11 : `--diagnose-order --execute` refusé (mode lecture seule strictement incompatible avec l\'exécution), avant tout appel wrangler');

  const cliBookIdWithAllConfirmed = runCli(['--db=test-db', '--book-id=A', '--all-confirmed', '--confirm=test-db']);
  assert.notEqual(cliBookIdWithAllConfirmed.code, 0);
  assert.ok(cliBookIdWithAllConfirmed.output.includes('mode distinct et mutuellement exclusif'), `sortie attendue mentionnant l'exclusivité des modes, obtenu : "${cliBookIdWithAllConfirmed.output}"`);
  assert.ok(!cliBookIdWithAllConfirmed.output.includes('wrangler'));
  console.log('PASS 43/43 — Correctif 11 : `--book-id=A --all-confirmed` refusé (deux sélecteurs de mode combinés), avant tout appel wrangler');

  fs.rmSync(tmpManifestDir, { recursive: true, force: true });
  console.log('\nTOUS LES TESTS REPAIR-CHUNK-INDEX PASSENT (43/43)');
})().catch((e) => {
  console.error('ÉCHEC:', e);
  process.exitCode = 1;
});
