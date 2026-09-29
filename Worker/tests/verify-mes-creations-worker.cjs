// STUDIO CLINIQUE — "Mes créations" (UX-10B), construction : preuve réelle des routes Worker
// GET /clinical-documents (liste, tous moteurs confondus, thumbnail_asset_id inclus) et
// POST /clinical-documents/:id/thumbnail (association d'une miniature déjà persistée), extraites
// TEXTUELLEMENT de index.js (jamais réimplémentées) — même patron que
// verify-media-panel-worker.cjs (extraction par bornes + exécution vm, miniflare indisponible
// dans ce bac à sable). Vérifie aussi que handleClinicalDocumentCreate (INCHANGÉ) continue de
// fonctionner à l'identique, et que handleBrandAssetUpload accepte désormais role='thumbnail'
// (migration 0011, BRAND_ASSET_ROLES élargi) sans rien changer pour les rôles déjà existants.
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../index.js'), 'utf8');

function slice(startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, `Bornes introuvables pour ${label} — index.js a changé de forme`);
  return source.slice(start, end);
}

const jsonHelpers = slice('function json(data, status = 200) {', '__name(jsonErr, "jsonErr");', 'json/jsonErr') + '__name(jsonErr, "jsonErr");\n';
const brandRoles = slice('var BRAND_ASSET_ROLES = ', '\n', 'BRAND_ASSET_ROLES') + '\n';
const clinicalDocsCode = slice(
  'var CLINICAL_DOCUMENT_KINDS = ',
  '__name(handleBrandAssetUpload, "handleBrandAssetUpload");',
  'code clinical-documents + brand-assets upload'
) + '__name(handleBrandAssetUpload, "handleBrandAssetUpload");\n';

const wrapperSrc = `
${jsonHelpers}
${brandRoles}
${clinicalDocsCode}
module.exports = { handleClinicalDocumentCreate, handleClinicalDocumentsList, handleClinicalDocumentThumbnailSet, adocPersistRenderAsset, handleBrandAssetUpload };
`;

function loadModule() {
  const CORS = { 'Access-Control-Allow-Origin': 'https://c-concept-dev.github.io' };
  const sandbox = { module: { exports: {} }, CORS, Response, crypto, TextEncoder, console, URL, atob, btoa, __name: (fn) => fn };
  vm.createContext(sandbox);
  vm.runInContext(wrapperSrc, sandbox, { filename: 'mes-creations-extract.js' });
  return sandbox.module.exports;
}

// ── D1 factice — assez fidèle pour prepare().bind().first()/all()/run()/batch() ──
function makeD1() {
  const docs = new Map(); // document_id -> row (title, document_kind, created_at, current_version_id, generation_engine, thumbnail_asset_id)
  const versions = new Map(); // version_id -> row
  const assets = new Map(); // asset_id -> row (render_assets)
  let seq = 0;

  function makeStmt(sql) {
    return {
      _sql: sql,
      _binds: [],
      bind(...args) { this._binds = args; return this; },
      async first() {
        if (this._sql.includes('SELECT document_id, current_version_id, generation_engine, document_kind FROM clinical_documents')) {
          return docs.get(this._binds[0]) || null;
        }
        if (this._sql.includes('SELECT document_id FROM clinical_documents WHERE document_id = ?')) {
          const d = docs.get(this._binds[0]);
          return d ? { document_id: d.document_id } : null;
        }
        if (this._sql.includes("SELECT asset_id FROM render_assets WHERE asset_id = ? AND role = 'thumbnail'")) {
          const a = assets.get(this._binds[0]);
          return a && a.role === 'thumbnail' ? { asset_id: a.asset_id } : null;
        }
        if (this._sql.includes('SELECT asset_id, size_bytes FROM render_assets WHERE asset_id = ?')) {
          const a = assets.get(this._binds[0]);
          return a ? { asset_id: a.asset_id, size_bytes: a.size_bytes } : null;
        }
        return null;
      },
      async all() {
        if (this._sql.includes('SELECT document_id, title, document_kind, created_at, thumbnail_asset_id FROM clinical_documents')) {
          const results = Array.from(docs.values())
            .sort((a, b) => (a._seq < b._seq ? 1 : -1))
            .map((d) => ({ document_id: d.document_id, title: d.title, document_kind: d.document_kind, created_at: d.created_at, thumbnail_asset_id: d.thumbnail_asset_id || null }));
          return { results };
        }
        return { results: [] };
      },
      async run() {
        if (this._sql.includes('UPDATE clinical_documents SET thumbnail_asset_id = ? WHERE document_id = ?')) {
          const [assetId, documentId] = this._binds;
          const d = docs.get(documentId);
          if (d) d.thumbnail_asset_id = assetId;
        } else if (this._sql.includes('INSERT OR IGNORE INTO render_assets')) {
          const [assetId, checksum, role, r2Key, mimeType, sizeBytes, createdAt, attribution] = this._binds;
          if (!assets.has(assetId)) {
            assets.set(assetId, { asset_id: assetId, checksum, role, r2_key: r2Key, mime_type: mimeType, size_bytes: sizeBytes, ref_count: 0, created_at: createdAt, attribution: attribution || null });
          }
        }
        return {};
      },
    };
  }

  return {
    prepare(sql) { return makeStmt(sql); },
    async batch(stmts) {
      // handleClinicalDocumentCreate : INSERT clinical_documents, INSERT clinical_document_versions, UPDATE current_version_id
      for (const stmt of stmts) {
        if (stmt._sql.includes('INSERT INTO clinical_documents')) {
          // current_version_id est un littéral NULL dans le SQL (jamais un "?"), donc absent des
          // binds — 5 valeurs liées seulement : document_id, title, document_kind, created_at,
          // generation_engine (cf. Worker/index.js, handleClinicalDocumentCreate).
          const [documentId, title, documentKind, createdAt, engine] = stmt._binds;
          docs.set(documentId, { document_id: documentId, current_version_id: null, title, document_kind: documentKind, created_at: createdAt, generation_engine: engine, thumbnail_asset_id: null, _seq: seq++ });
        } else if (stmt._sql.includes('INSERT INTO clinical_document_versions')) {
          // previous_version_id et change_summary sont des littéraux NULL dans le SQL — 6 valeurs
          // liées seulement : version_id, document_id, schema_version, content_json, created_at,
          // generation_engine.
          const [versionId, documentId, schemaVersion, contentJson, createdAt, engine] = stmt._binds;
          versions.set(versionId, { version_id: versionId, document_id: documentId, schema_version: schemaVersion, content_json: contentJson, created_at: createdAt, generation_engine: engine });
        } else if (stmt._sql.includes('UPDATE clinical_documents SET current_version_id = ?')) {
          const [versionId, documentId] = stmt._binds;
          const d = docs.get(documentId);
          if (d) d.current_version_id = versionId;
        }
      }
      return [];
    },
    _docs: docs,
    _assets: assets,
  };
}

function makeR2() {
  const store = new Map();
  return {
    async put(key, buf, opts) { store.set(key, { buf, contentType: opts && opts.httpMetadata && opts.httpMetadata.contentType }); },
    async get(key) { return store.has(key) ? { body: store.get(key).buf, httpMetadata: { contentType: store.get(key).contentType } } : null; },
    async delete(key) { store.delete(key); },
    _store: store,
  };
}

function makeRequest(bodyObj) {
  return { async json() { return bodyObj; } };
}

function bufFromString(s) {
  return new TextEncoder().encode(s).buffer;
}

(async () => {
  const { handleClinicalDocumentCreate, handleClinicalDocumentsList, handleClinicalDocumentThumbnailSet, adocPersistRenderAsset, handleBrandAssetUpload } = loadModule();
  let failCount = 0;
  function check(cond, label) {
    if (cond) { console.log('PASS ' + label); } else { console.log('FAIL ' + label); failCount++; }
  }

  const env = { DB: makeD1(), BRAND_ASSETS: makeR2() };

  // ── 1. Création réelle de 2 documents (fiche + carrousel), via la route INCHANGÉE ──
  const ficheDoc = {
    schemaVersion: 1,
    clinicalDocument: { title: 'Fiche A', documentKind: 'fiche', blocks: [{ id: 'b1', type: 'paragraph', content: { text: 'x' }, citationIds: [], validation: {} }] },
    sourceSnapshot: { sourceSnapshotId: 'snap-1', entries: [] },
    renderManifestOverride: null,
  };
  const r1 = await handleClinicalDocumentCreate(makeRequest({ document: ficheDoc, title: 'Fiche A', documentKind: 'fiche', generationEngine: 'structured' }), env);
  const d1data = await r1.json();
  check(r1.status === 201 && d1data.document_id, '1/9 — création réelle du 1er document (fiche, structured) via la route inchangée');

  await new Promise((resolve) => setTimeout(resolve, 5)); // created_at distinct pour le tri
  const carrouselDoc = {
    schemaVersion: 1,
    clinicalDocument: { title: 'Carrousel B', documentKind: 'carrousel', blocks: [{ id: 'c1', type: 'card', content: { title: 'x' }, citationIds: [], validation: {} }] },
    sourceSnapshot: { sourceSnapshotId: 'snap-2', entries: [] },
    renderManifestOverride: null,
  };
  const r2 = await handleClinicalDocumentCreate(makeRequest({ document: carrouselDoc, title: 'Carrousel B', documentKind: 'carrousel', generationEngine: 'structured' }), env);
  const d2data = await r2.json();
  check(r2.status === 201 && d2data.document_id, '2/9 — création réelle du 2e document (carrousel, structured)');

  // ── 2. GET /clinical-documents : liste TOUS les documents, tous moteurs, thumbnail_asset_id NULL par défaut ──
  const listRes1 = await handleClinicalDocumentsList(env);
  const list1 = await listRes1.json();
  check(
    listRes1.status === 200 && Array.isArray(list1.documents) && list1.documents.length === 2,
    '3/9 — GET /clinical-documents renvoie les 2 documents (aucune colonne auteur, jamais un sous-ensemble)'
  );
  check(
    list1.documents[0].document_id === d2data.document_id && list1.documents[1].document_id === d1data.document_id,
    '4/9 — tri du plus récent au plus ancien (created_at DESC)'
  );
  check(
    list1.documents.every((d) => d.thumbnail_asset_id === null),
    '5/9 — thumbnail_asset_id NULL avant toute capture (repli textuel attendu côté client, jamais un échec)'
  );

  // ── 3. Persistance d'une miniature via le endpoint générique élargi (role='thumbnail') ──
  const thumbUploadRes = await handleBrandAssetUpload({ headers: { get: () => 'image/jpeg' }, url: 'https://worker.example/brand-assets/upload?role=thumbnail', arrayBuffer: async () => bufFromString('FAKE_JPEG_BYTES') }, env);
  const thumbUploadData = await thumbUploadRes.json();
  check(thumbUploadRes.status === 200 && thumbUploadData.asset_id, '6/9 — POST /brand-assets/upload?role=thumbnail accepte désormais ce rôle (migration 0011)');

  // ── 4. Association réelle au document ──
  const setRes = await handleClinicalDocumentThumbnailSet(makeRequest({ assetId: thumbUploadData.asset_id }), env, d1data.document_id);
  const setData = await setRes.json();
  check(setRes.status === 200 && setData.thumbnail_asset_id === thumbUploadData.asset_id, '7/9 — POST /clinical-documents/:id/thumbnail associe réellement l’asset_id vérifié');

  const listRes2 = await handleClinicalDocumentsList(env);
  const list2 = await listRes2.json();
  const ficheRow = list2.documents.find((d) => d.document_id === d1data.document_id);
  check(ficheRow && ficheRow.thumbnail_asset_id === thumbUploadData.asset_id, '8/9 — la liste reflète immédiatement la miniature associée, sans affecter l’autre document');
  const carrouselRow = list2.documents.find((d) => d.document_id === d2data.document_id);
  check(carrouselRow && carrouselRow.thumbnail_asset_id === null, '8b/9 — le document non associé reste inchangé (aucune fuite entre documents)');

  // ── 5. Garde-fous : document inconnu, asset inconnu, asset d’un autre rôle ──
  const setUnknownDoc = await handleClinicalDocumentThumbnailSet(makeRequest({ assetId: thumbUploadData.asset_id }), env, 'doc-inexistant');
  check(setUnknownDoc.status === 404, '9/9a — document inconnu → 404, jamais une association silencieuse');

  const setUnknownAsset = await handleClinicalDocumentThumbnailSet(makeRequest({ assetId: 'assetid-inexistant' }), env, d2data.document_id);
  check(setUnknownAsset.status === 404, '9/9b — asset_id inexistant → 404 (vérifié en base, jamais fait confiance sans contrôle)');

  const logoUploadRes = await handleBrandAssetUpload({ headers: { get: () => 'image/png' }, url: 'https://worker.example/brand-assets/upload?role=logo', arrayBuffer: async () => bufFromString('FAKE_LOGO_BYTES') }, env);
  const logoUploadData = await logoUploadRes.json();
  const setWrongRole = await handleClinicalDocumentThumbnailSet(makeRequest({ assetId: logoUploadData.asset_id }), env, d2data.document_id);
  check(setWrongRole.status === 404, "9/9c — un asset d'un autre rôle (logo) est refusé, jamais associé comme miniature");

  // ── 6. Non-régression : les rôles déjà existants continuent de fonctionner à l'identique ──
  check(
    logoUploadRes.status === 200 && logoUploadData.asset_id && !logoUploadData.deduplicated,
    '9/9d — non-régression : handleBrandAssetUpload role=logo (glisser-déposer charte) inchangé après l’élargissement à thumbnail'
  );

  console.log('');
  if (failCount === 0) {
    console.log('=== TOUS LES TESTS "MES CRÉATIONS" — ROUTES WORKER (9 vérifications) PASSENT ===');
    process.exit(0);
  } else {
    console.log(`=== ${failCount} ÉCHEC(S) ===`);
    process.exit(1);
  }
})();
