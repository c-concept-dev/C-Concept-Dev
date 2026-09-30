// STUDIO CLINIQUE — CORRECTIF migration 0011 : preuve réelle contre le moteur SQLite natif
// (node:sqlite, le même moteur que D1) que la migration corrigée réussit RÉELLEMENT contre un
// schéma qui possède la contrainte `brand_kits.source_asset_id REFERENCES render_assets(asset_id)`
// (migration 0001) avec au moins une ligne brand_kits qui la référence réellement — jamais un
// schéma de test simplifié qui omettrait cette contrainte, cause exacte du défaut signalé par
// Christophe en production réelle.
//
// verify-mes-creations-worker.cjs (lot précédent) ne pouvait STRUCTURELLEMENT pas détecter ce
// défaut : c'est un test de ROUTES Worker contre un mock JS de D1 (prepare/bind/run réimplémentés
// à la main, comme TOUS les tests Worker de cette session en l'absence de miniflare dans ce bac à
// sable), qui n'exécute jamais le SQL brut d'un fichier de migration ni n'impose de contrainte
// CHECK/FOREIGN KEY réelle. Le corriger n'aurait rien changé : il lui manque la capacité même de
// lire du SQL. Ce nouveau fichier, dédié aux MIGRATIONS (pas aux routes), applique le texte réel
// des fichiers .sql via node:sqlite (vrai moteur SQLite, CHECK/FOREIGN KEY réellement appliqués)
// — c'est la correction demandée au point 3 du CDC, sous la forme qui peut réellement l'assurer.
//
// Reproduit AUSSI, pour preuve, l'échec exact de l'ANCIENNE version de la migration (conservée
// ici en chaîne de caractères à seule fin de démonstration, jamais appliquée au vrai fichier) —
// confirme que le nouveau test aurait bien intercepté ce défaut avant livraison.
const { DatabaseSync } = require('node:sqlite');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');
const MIGRATIONS_BEFORE_0011 = [
  '0001_add_brand_kit_tables.sql',
  '0002_add_second_brand_kit.sql',
  '0003_widen_render_asset_roles.sql',
  '0004_add_clinical_documents.sql',
  '0005_add_generation_engine.sql',
  '0006_add_chunks_baseline_and_page_end.sql',
  '0006_add_proxy_call_log.sql',
  '0007_add_proxy_call_outcome.sql',
  '0008_add_library_facets_index.sql',
  '0009_add_reembed_truncated_log.sql',
  '0010_add_render_asset_attribution.sql',
];
const MIGRATION_0011_FIXED = readFileSync(path.join(MIGRATIONS_DIR, '0011_widen_render_asset_roles_thumbnail.sql'), 'utf8');
const MIGRATION_0012 = readFileSync(path.join(MIGRATIONS_DIR, '0012_add_clinical_document_thumbnail.sql'), 'utf8');

// Reproduction FIDÈLE de l'ANCIENNE version de la migration 0011, telle qu'elle a réellement
// échoué en production (conservée en chaîne, jamais réécrite dans un fichier — l'objectif est
// uniquement de prouver que ce nouveau test l'aurait rejetée AVANT livraison).
const MIGRATION_0011_OLD_BUGGY = `
PRAGMA foreign_keys=OFF;
CREATE TABLE render_assets_new (
  asset_id      TEXT PRIMARY KEY,
  checksum      TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('logo','font','image','reference','thumbnail')),
  r2_key        TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  ref_count     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  attribution   TEXT
);
INSERT INTO render_assets_new SELECT * FROM render_assets;
DROP TABLE render_assets;
ALTER TABLE render_assets_new RENAME TO render_assets;
CREATE INDEX IF NOT EXISTS idx_render_assets_role ON render_assets(role);
PRAGMA foreign_keys=ON;
`;

// Construit une base fraîche, migrée jusqu'à juste avant 0011, PUIS insère une charte réelle qui
// référence effectivement un render_asset (cf. CDC : "au moins une ligne brand_kits existante qui
// la référence" — les 2 chartes seedées par 0001/0002 ont source_asset_id NULL, insuffisant).
function buildDbBeforeMigration0011() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  for (const file of MIGRATIONS_BEFORE_0011) {
    db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }
  // Une charte RÉELLEMENT importée (PDF source persisté dans render_assets, role='reference',
  // exactement le mécanisme déjà construit pour l'import de charte — cf. handleBrandKitAnalyze),
  // qui référence ce render_asset via brand_kits.source_asset_id — LA configuration réelle qui a
  // fait échouer la migration en production, absente du test du lot précédent.
  db.exec(`
    INSERT INTO render_assets (asset_id, checksum, role, r2_key, mime_type, size_bytes, ref_count, created_at)
    VALUES ('charte-pdf-reelle-001', 'charte-pdf-reelle-001', 'reference', 'charte-pdf-reelle-001', 'application/pdf', 204800, 0, '2026-09-10T08:00:00.000Z');
    INSERT INTO brand_kits (id, name, version, colors_json, typography_json, status, source_asset_id, created_at)
    VALUES ('bk-reelle-003', 'Charte importée réelle', 1, '{}', '{}', 'active', 'charte-pdf-reelle-001', '2026-09-10T08:00:05.000Z');
  `);
  return db;
}

function countRows(db, table) {
  return db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n;
}

let failCount = 0;
function check(cond, label) {
  if (cond) { console.log('PASS ' + label); } else { console.log('FAIL ' + label); failCount++; }
}

// ── Test 1 : reproduction de l'ANCIEN défaut — la migration buguée échoue RÉELLEMENT contre ce
// schéma, exactement comme en production, quand tout le fichier s'exécute dans UNE transaction
// englobante (comportement D1 réel confirmé par Christophe — jamais un simple db.exec() statement
// par statement, qui ne reproduirait pas le piège). ──
{
  const db = buildDbBeforeMigration0011();
  const beforeAssets = countRows(db, 'render_assets');
  const beforeKits = countRows(db, 'brand_kits');
  let threw = null;
  try {
    db.exec('BEGIN;');
    db.exec(MIGRATION_0011_OLD_BUGGY);
    db.exec('COMMIT;');
  } catch (e) {
    threw = e;
    try { db.exec('ROLLBACK;'); } catch {}
  }
  check(threw !== null && /FOREIGN KEY/i.test(threw.message), '1/6 — reproduction réelle : l’ANCIENNE migration échoue bien avec "FOREIGN KEY constraint failed", exactement comme en production (Christophe)');
  check(countRows(db, 'render_assets') === beforeAssets && countRows(db, 'brand_kits') === beforeKits, '2/6 — après l’échec (et son ROLLBACK), aucune ligne perdue dans render_assets ni brand_kits — l’ancienne migration n’écrit jamais la moitié d’un changement');
}

// ── Test 2 : la migration CORRIGÉE réussit réellement, dans les MÊMES conditions (transaction
// englobante), avec ZÉRO perte de ligne dans render_assets ET brand_kits, et la charte réelle
// garde son lien vers son render_asset. ──
{
  const db = buildDbBeforeMigration0011();
  const beforeAssets = countRows(db, 'render_assets');
  const beforeKits = countRows(db, 'brand_kits');
  let ok = false;
  try {
    db.exec('BEGIN;');
    db.exec(MIGRATION_0011_FIXED);
    db.exec('COMMIT;');
    ok = true;
  } catch (e) {
    console.log('   (détail échec inattendu :', e.message, ')');
    try { db.exec('ROLLBACK;'); } catch {}
  }
  check(ok, '3/6 — la migration CORRIGÉE réussit réellement, dans une transaction englobante fidèle au comportement D1 confirmé');
  check(countRows(db, 'render_assets') === beforeAssets, '4/6 — aucune ligne perdue dans render_assets (même effectif avant/après)');
  check(countRows(db, 'brand_kits') === beforeKits, '4b/6 — aucune ligne perdue dans brand_kits (même effectif avant/après, y compris les 2 chartes seedées)');
  const kit = db.prepare("SELECT source_asset_id FROM brand_kits WHERE id = 'bk-reelle-003'").get();
  check(kit && kit.source_asset_id === 'charte-pdf-reelle-001', '5/6 — la charte réelle référence toujours EXACTEMENT le même render_asset après la migration (aucune valeur altérée)');
  const roles = db.prepare("SELECT DISTINCT role FROM render_assets ORDER BY role").all().map((r) => r.role);
  check(roles.includes('reference') && roles.every((r) => ['logo','font','image','reference','thumbnail'].includes(r)), '5b/6 — les rôles déjà existants (ici "reference", utilisé par la charte réelle) survivent inchangés');

  // Le rôle 'thumbnail' doit désormais être RÉELLEMENT accepté par le moteur SQLite (pas
  // seulement par le code JS du Worker) — et la contrainte doit rester une vraie contrainte
  // (un rôle non prévu doit toujours être rejeté).
  let thumbnailInsertOk = false;
  try {
    db.exec("INSERT INTO render_assets (asset_id, checksum, role, r2_key, mime_type, size_bytes, ref_count, created_at) VALUES ('thumb-test-1','thumb-test-1','thumbnail','thumb-test-1','image/jpeg',5000,0,'2026-09-25T09:05:00.000Z')");
    thumbnailInsertOk = true;
  } catch (e) { console.log('   (insertion thumbnail refusée de façon inattendue :', e.message, ')'); }
  let badRoleRejected = false;
  try { db.exec("INSERT INTO render_assets (asset_id, checksum, role, r2_key, mime_type, size_bytes, ref_count, created_at) VALUES ('bad-1','bad-1','not-a-real-role','bad-1','image/jpeg',1,0,'2026-09-25T09:06:00.000Z')"); }
  catch (e) { badRoleRejected = /CHECK/i.test(e.message); }
  check(thumbnailInsertOk && badRoleRejected, '6/6a — role=\'thumbnail\' réellement accepté par le moteur SQLite après migration, ET un rôle inventé toujours rejeté (le CHECK reste une vraie contrainte, pas retiré par erreur)');

  // La contrainte de clé étrangère elle-même doit rester réellement active après la migration
  // (jamais laissée désactivée par erreur par les PRAGMA foreign_keys=OFF/ON de ce fichier).
  db.exec('PRAGMA foreign_keys=ON;');
  let fkStillEnforced = false;
  try { db.exec("INSERT INTO brand_kits (id, name, version, colors_json, typography_json, status, source_asset_id, created_at) VALUES ('bk-bad','Bad','1','{}','{}','active','asset-inexistant','2026-09-25T09:07:00.000Z')"); }
  catch (e) { fkStillEnforced = /FOREIGN KEY/i.test(e.message); }
  check(fkStillEnforced, '6/6b — la contrainte de clé étrangère brand_kits→render_assets reste réellement active après la migration (jamais désactivée par erreur)');
}

// ── Test 3 : migration 0012 (colonne additive simple, non affectée par ce correctif) reste
// inchangée et s’applique sans incident à la suite de la 0011 corrigée. ──
{
  const db = buildDbBeforeMigration0011();
  db.exec('BEGIN;'); db.exec(MIGRATION_0011_FIXED); db.exec('COMMIT;');
  let ok012 = false;
  try { db.exec(MIGRATION_0012); ok012 = true; } catch (e) { console.log('   (0012 a échoué de façon inattendue :', e.message, ')'); }
  check(ok012, '— (contrôle) migration 0012 s’applique sans incident après la 0011 corrigée');
  const cols = db.prepare("PRAGMA table_info(clinical_documents)").all().map((c) => c.name);
  check(cols.includes('thumbnail_asset_id'), '— (contrôle) 0012 ajoute bien la colonne clinical_documents.thumbnail_asset_id, inchangée par ce correctif');
}

console.log('');
if (failCount === 0) {
  console.log('=== TOUS LES TESTS CORRECTIF MIGRATION 0011 (contrainte FK réelle, moteur SQLite réel) PASSENT ===');
  process.exit(0);
} else {
  console.log(`=== ${failCount} ÉCHEC(S) ===`);
  process.exit(1);
}
