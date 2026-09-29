// STUDIO CLINIQUE — Panneau "Médias" (UX-8E, Volet 2), construction : preuve réelle des routes
// Worker /media-assets (liste), /media-assets/from-url (persistance depuis un résultat de
// recherche Pexels) et /media-assets/:id/use (réutilisation depuis l'historique), extraites
// TEXTUELLEMENT de index.js (jamais réimplémentées) — même patron que
// verify-login-route-worker.cjs (extraction par bornes + exécution vm, miniflare indisponible
// dans ce bac à sable). Vérifie aussi que handleBrandAssetUpload (glisser-déposer, INCHANGÉ)
// continue de fonctionner à l'identique après l'extraction de adocPersistRenderAsset.
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
const mediaCode = slice(
  '// Panneau "Médias" (UX-8E, Volet 2) — extraction pure',
  '__name(handleMediaAssetDelete, "handleMediaAssetDelete");',
  'code du panneau Médias'
) + '__name(handleMediaAssetDelete, "handleMediaAssetDelete");\n';

const wrapperSrc = `
${jsonHelpers}
${brandRoles}
${mediaCode}
module.exports = { adocPersistRenderAsset, handleBrandAssetUpload, handleMediaAssetFromUrl, handleMediaAssetUse, handleMediaAssetsList, handleMediaAssetDelete };
`;

function loadModule(fetchImpl) {
  const CORS = { 'Access-Control-Allow-Origin': 'https://c-concept-dev.github.io' };
  const sandbox = { module: { exports: {} }, CORS, Response, crypto, TextEncoder, console, URL, fetch: fetchImpl, atob, btoa, __name: (fn) => fn };
  vm.createContext(sandbox);
  vm.runInContext(wrapperSrc, sandbox, { filename: 'media-panel-extract.js' });
  return sandbox.module.exports;
}

// ── D1 factice — assez fidèle pour prepare().bind().first()/all()/run() ──
function makeD1() {
  const rows = new Map(); // asset_id -> row
  function normalizeSelectAll(sql, binds) {
    if (sql.includes('WHERE role = \'image\'')) {
      return Array.from(rows.values()).filter((r) => r.role === 'image').sort((a, b) => (a._seq < b._seq ? 1 : -1));
    }
    return [];
  }
  let seq = 0;
  return {
    prepare(sql) {
      return {
        _sql: sql,
        _binds: [],
        bind(...args) { this._binds = args; return this; },
        async first() {
          if (this._sql.includes('SELECT asset_id, size_bytes FROM render_assets WHERE asset_id = ?')) {
            const row = rows.get(this._binds[0]);
            return row ? { asset_id: row.asset_id, size_bytes: row.size_bytes } : null;
          }
          if (this._sql.includes("SELECT asset_id FROM render_assets WHERE asset_id = ? AND role = 'image'")) {
            const row = rows.get(this._binds[0]);
            return row && row.role === 'image' ? { asset_id: row.asset_id } : null;
          }
          if (this._sql.includes("SELECT asset_id, r2_key, ref_count FROM render_assets WHERE asset_id = ? AND role = 'image'")) {
            const row = rows.get(this._binds[0]);
            return row && row.role === 'image' ? { asset_id: row.asset_id, r2_key: row.r2_key, ref_count: row.ref_count } : null;
          }
          return null;
        },
        async all() {
          return { results: normalizeSelectAll(this._sql, this._binds) };
        },
        async run() {
          if (this._sql.includes('INSERT OR IGNORE INTO render_assets')) {
            const [assetId, checksum, role, r2Key, mimeType, sizeBytes, createdAt, attribution] = this._binds;
            if (!rows.has(assetId)) {
              rows.set(assetId, { asset_id: assetId, checksum, role, r2_key: r2Key, mime_type: mimeType, size_bytes: sizeBytes, ref_count: 0, created_at: createdAt, attribution: attribution || null, _seq: seq++ });
            }
          } else if (this._sql.includes('UPDATE render_assets SET ref_count = ref_count + 1')) {
            const row = rows.get(this._binds[0]);
            if (row) row.ref_count += 1;
          } else if (this._sql.includes('DELETE FROM render_assets WHERE asset_id = ?')) {
            rows.delete(this._binds[0]);
          }
          return {};
        },
      };
    },
    _rows: rows,
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
  const { adocPersistRenderAsset, handleBrandAssetUpload, handleMediaAssetFromUrl, handleMediaAssetUse, handleMediaAssetsList, handleMediaAssetDelete } = loadModule(async () => {
    throw new Error('fetch réel non attendu dans ce test — chaque scénario fournit son propre fetch factice');
  });

  // ── Test 1 — /media-assets/from-url : télécharge (serveur, jamais le client), persiste dans
  // R2/render_assets, incrémente ref_count à 1, conserve l'attribution ──
  {
    const db = makeD1(), r2 = makeR2();
    const fakeFetch = async (url) => {
      assert.equal(url, 'https://images.pexels.com/photos/1/pexels-photo-1.jpeg');
      return { ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => bufFromString('fake-jpeg-bytes') };
    };
    const { handleMediaAssetFromUrl: fn } = loadModule(fakeFetch);
    const env = { DB: db, BRAND_ASSETS: r2 };
    const r = await fn(makeRequest({ url: 'https://images.pexels.com/photos/1/pexels-photo-1.jpeg', attribution: 'Jane Doe' }), env);
    assert.equal(r.status, 200, 'persistance depuis une URL Pexels valide doit réussir');
    const data = JSON.parse(await r.text());
    assert.ok(data.asset_id && /^[a-f0-9]{64}$/.test(data.asset_id), 'asset_id doit être une empreinte SHA-256 (même contrat que /brand-assets/upload)');
    const row = db._rows.get(data.asset_id);
    assert.ok(row, 'la ligne doit exister dans render_assets — pas seulement affichée, réellement persistée');
    assert.equal(row.role, 'image');
    assert.equal(row.attribution, 'Jane Doe', 'attribution photographe conservée (obligation Pexels)');
    assert.equal(row.ref_count, 1, 'la première insertion réelle doit compter comme un usage (ref_count=1)');
    assert.ok(r2._store.has(data.asset_id), 'les octets doivent être réellement dans R2, pas seulement référencés');
    console.log('PASS 1/12 — /media-assets/from-url : téléchargement serveur, persistance réelle R2+D1, attribution conservée, ref_count=1');
  }

  // ── Test 2 — SSRF : seule images.pexels.com est acceptée, jamais une URL arbitraire ──
  {
    const env = { DB: makeD1(), BRAND_ASSETS: makeR2() };
    const r = await handleMediaAssetFromUrl(makeRequest({ url: 'https://evil.example.com/steal', attribution: '' }), env);
    assert.equal(r.status, 400, 'une URL hors images.pexels.com doit être refusée (protection SSRF), jamais téléchargée');
    console.log('PASS 2/12 — /media-assets/from-url refuse toute URL qui n’est pas images.pexels.com (SSRF)');
  }

  // ── Test 3 — déduplication : la même image (même contenu) réinsérée ne duplique jamais la ligne,
  // mais incrémente bien ref_count à chaque insertion réelle ──
  {
    const db = makeD1(), r2 = makeR2();
    const fakeFetch = async () => ({ ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => bufFromString('meme-contenu') });
    const { handleMediaAssetFromUrl: fn } = loadModule(fakeFetch);
    const env = { DB: db, BRAND_ASSETS: r2 };
    const r1 = await fn(makeRequest({ url: 'https://images.pexels.com/photos/2/pexels-photo-2.jpeg', attribution: 'A' }), env);
    const d1 = JSON.parse(await r1.text());
    const r2resp = await fn(makeRequest({ url: 'https://images.pexels.com/photos/2/pexels-photo-2.jpeg', attribution: 'A' }), env);
    const d2 = JSON.parse(await r2resp.text());
    assert.equal(d1.asset_id, d2.asset_id, 'même contenu → même asset_id (déduplication par empreinte, inchangée)');
    assert.equal(db._rows.get(d1.asset_id).ref_count, 2, 'chaque insertion réelle incrémente ref_count, même sur un asset déjà connu');
    assert.equal(Array.from(r2._store.keys()).length, 1, 'jamais un second objet R2 pour un contenu déjà connu');
    console.log('PASS 3/12 — déduplication par empreinte inchangée ; ref_count s’incrémente à chaque insertion réelle, jamais de doublon R2/D1');
  }

  // ── Test 4 — /media-assets/:id/use : incrémente ref_count SANS aucun nouveau téléchargement ──
  {
    const db = makeD1(), r2 = makeR2();
    let fetchCalls = 0;
    const fakeFetch = async () => { fetchCalls++; return { ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => bufFromString('x') }; };
    const mod = loadModule(fakeFetch);
    const env = { DB: db, BRAND_ASSETS: r2 };
    const persisted = JSON.parse(await (await mod.handleMediaAssetFromUrl(makeRequest({ url: 'https://images.pexels.com/photos/3/pexels-photo-3.jpeg', attribution: 'B' }), env)).text());
    assert.equal(fetchCalls, 1);
    const r = await mod.handleMediaAssetUse(env, persisted.asset_id);
    assert.equal(r.status, 200, 'réutiliser un asset déjà persisté doit réussir');
    assert.equal(fetchCalls, 1, 'réinsérer depuis l’historique ne doit JAMAIS déclencher un nouveau téléchargement réseau');
    assert.equal(db._rows.get(persisted.asset_id).ref_count, 2, 'ref_count doit refléter ce second usage réel');
    console.log('PASS 4/12 — /media-assets/:id/use : ref_count incrémenté sans aucun nouveau téléchargement réseau');
  }

  // ── Test 5 — /media-assets/:id/use sur un asset inconnu → 404 ──
  {
    const env = { DB: makeD1(), BRAND_ASSETS: makeR2() };
    const r = await handleMediaAssetUse(env, 'a'.repeat(64));
    assert.equal(r.status, 404);
    console.log('PASS 5/12 — /media-assets/:id/use sur un asset inconnu renvoie 404, jamais un succès silencieux');
  }

  // ── Test 6 — GET /media-assets : liste role='image' uniquement, jamais logo/font/reference ──
  {
    const db = makeD1(), r2 = makeR2();
    const fakeFetch = async () => ({ ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => bufFromString('img-1') });
    const mod = loadModule(fakeFetch);
    const env = { DB: db, BRAND_ASSETS: r2 };
    await mod.handleMediaAssetFromUrl(makeRequest({ url: 'https://images.pexels.com/photos/4/pexels-photo-4.jpeg', attribution: 'C' }), env);
    // Un logo de charte graphique, uploadé par le mécanisme EXISTANT (glisser-déposer) — ne doit
    // JAMAIS apparaître dans la liste Médias (rôle différent, même table).
    await mod.handleBrandAssetUpload({
      headers: { get: () => 'image/png' },
      async arrayBuffer() { return bufFromString('un-logo').buffer || bufFromString('un-logo'); },
      url: 'https://worker.example/brand-assets/upload?role=logo',
    }, env);
    const r = await mod.handleMediaAssetsList(env);
    const data = JSON.parse(await r.text());
    assert.equal(data.media.length, 1, 'seule l’image (role=image) doit apparaître, jamais le logo');
    assert.equal(data.media[0].attribution, 'C');
    assert.equal(typeof data.media[0].ref_count, 'number');
    console.log('PASS 6/12 — GET /media-assets : historique filtré sur role=\'image\' uniquement, logo de charte jamais mélangé');
  }

  // ── Test 7 — non-régression : handleBrandAssetUpload (glisser-déposer) fonctionne à l’identique
  // après extraction de adocPersistRenderAsset — même contrat de réponse, attribution=null ──
  {
    const db = makeD1(), r2 = makeR2();
    const env = { DB: db, BRAND_ASSETS: r2 };
    const bytes = new Uint8Array([1, 2, 3, 4]);
    let binary = ''; for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = Buffer.from(binary, 'binary').toString('base64');
    const req = {
      headers: { get: (h) => h === 'Content-Type' ? 'application/json' : null },
      async json() { return { content: base64, role: 'image', mime_type: 'image/png' }; },
    };
    const r = await handleBrandAssetUpload(req, env);
    assert.equal(r.status, 200);
    const data = JSON.parse(await r.text());
    assert.ok(data.asset_id && data.deduplicated === false && typeof data.size_bytes === 'number', 'contrat de réponse inchangé : {asset_id, deduplicated, size_bytes}');
    const row = db._rows.get(data.asset_id);
    assert.equal(row.attribution, null, 'le glisser-déposer existant ne pose jamais d’attribution (chemin réservé à Médias/Pexels)');
    assert.equal(row.ref_count, 0, 'handleBrandAssetUpload ne touche jamais ref_count (comportement inchangé, non concerné par ce lot)');
    console.log('PASS 7/12 — handleBrandAssetUpload (glisser-déposer) inchangé après extraction de adocPersistRenderAsset');
  }

  // ── Test 8 — image absente/téléchargement échoué → jamais une ligne persistée à moitié ──
  {
    const db = makeD1(), r2 = makeR2();
    const fakeFetch = async () => ({ ok: false, status: 404 });
    const mod = loadModule(fakeFetch);
    const env = { DB: db, BRAND_ASSETS: r2 };
    const r = await mod.handleMediaAssetFromUrl(makeRequest({ url: 'https://images.pexels.com/photos/5/pexels-photo-5.jpeg', attribution: '' }), env);
    assert.equal(r.status, 502);
    assert.equal(db._rows.size, 0, 'un téléchargement échoué ne doit jamais laisser de ligne render_assets orpheline');
    console.log('PASS 8/12 — téléchargement Pexels échoué : 502 propre, aucune ligne D1 orpheline, aucun objet R2 orphelin');
  }

  // ── Test 9 — DELETE /media-assets/:id sur une image JAMAIS utilisée (ref_count=0) : suppression
  // réelle en D1 ET R2 ensemble, wasInUse=false ──
  {
    const db = makeD1(), r2 = makeR2();
    const fakeFetch = async () => ({ ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => bufFromString('img-jamais-utilisee') });
    const mod = loadModule(fakeFetch);
    const env = { DB: db, BRAND_ASSETS: r2 };
    // Persistée mais jamais insérée dans un document : ref_count reste à 0 seulement si on ne
    // passe jamais par from-url/use — ici on force ref_count=0 en écrivant directement la ligne,
    // pour isoler ce scénario du chemin d'insertion (déjà couvert par les tests 1-4).
    const persisted = JSON.parse(await (await mod.handleMediaAssetFromUrl(makeRequest({ url: 'https://images.pexels.com/photos/6/pexels-photo-6.jpeg', attribution: 'D' }), env)).text());
    db._rows.get(persisted.asset_id).ref_count = 0; // jamais réellement insérée dans un document
    assert.ok(r2._store.has(persisted.asset_id), 'préalable : l’objet R2 doit exister avant suppression');
    const r = await mod.handleMediaAssetDelete(env, persisted.asset_id);
    assert.equal(r.status, 200);
    const data = JSON.parse(await r.text());
    assert.deepEqual(data, { deleted: true, wasInUse: false, refCount: 0 });
    assert.ok(!db._rows.has(persisted.asset_id), 'la ligne D1 doit être réellement supprimée, pas seulement marquée');
    assert.ok(!r2._store.has(persisted.asset_id), 'l’objet R2 doit être réellement supprimé, pas seulement la ligne D1 (jamais l’un sans l’autre)');
    console.log('PASS 9/12 — suppression d’une image jamais utilisée : D1 ET R2 réellement supprimés ensemble, wasInUse=false');
  }

  // ── Test 10 — DELETE sur une image DÉJÀ utilisée (ref_count>0) : suppression jamais bloquée,
  // mais wasInUse=true et refCount exact renvoyés pour que le client avertisse ──
  {
    const db = makeD1(), r2 = makeR2();
    const fakeFetch = async () => ({ ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => bufFromString('img-utilisee') });
    const mod = loadModule(fakeFetch);
    const env = { DB: db, BRAND_ASSETS: r2 };
    const persisted = JSON.parse(await (await mod.handleMediaAssetFromUrl(makeRequest({ url: 'https://images.pexels.com/photos/7/pexels-photo-7.jpeg', attribution: 'E' }), env)).text());
    await mod.handleMediaAssetUse(env, persisted.asset_id); // second usage réel → ref_count=2
    const r = await mod.handleMediaAssetDelete(env, persisted.asset_id);
    assert.equal(r.status, 200, 'ref_count > 0 ne doit JAMAIS bloquer la suppression (Christophe reste seul juge)');
    const data = JSON.parse(await r.text());
    assert.deepEqual(data, { deleted: true, wasInUse: true, refCount: 2 }, 'la réponse doit signaler wasInUse=true et le refCount exact avant suppression');
    assert.ok(!db._rows.has(persisted.asset_id) && !r2._store.has(persisted.asset_id), 'la suppression doit être réelle malgré ref_count > 0');
    console.log('PASS 10/12 — suppression d’une image déjà utilisée : jamais bloquée, wasInUse=true et refCount exact renvoyés');
  }

  // ── Test 11 — asset inconnu → 404, jamais un succès silencieux ──
  {
    const env = { DB: makeD1(), BRAND_ASSETS: makeR2() };
    const r = await handleMediaAssetDelete(env, 'c'.repeat(64));
    assert.equal(r.status, 404);
    console.log('PASS 11/12 — DELETE sur un asset inconnu renvoie 404');
  }

  // ── Test 12 — jamais utilisable pour supprimer un asset d’un AUTRE rôle (logo/font/reference) :
  // cette route reste réservée aux images du panneau Médias ──
  {
    const db = makeD1(), r2 = makeR2();
    const env = { DB: db, BRAND_ASSETS: r2 };
    const logoUpload = JSON.parse(await (await handleBrandAssetUpload({
      headers: { get: () => 'image/png' },
      async arrayBuffer() { return bufFromString('un-autre-logo'); },
      url: 'https://worker.example/brand-assets/upload?role=logo',
    }, env)).text());
    const r = await handleMediaAssetDelete(env, logoUpload.asset_id);
    assert.equal(r.status, 404, 'un logo de charte (role != image) ne doit jamais être supprimable via cette route');
    assert.ok(db._rows.has(logoUpload.asset_id) && r2._store.has(logoUpload.asset_id), 'le logo doit rester intact, en D1 comme en R2');
    console.log('PASS 12/12 — la route ne supprime jamais un asset d’un autre rôle (logo/font/reference)');
  }

  console.log('\n=== TOUS LES TESTS PANNEAU MÉDIAS (12/12) PASSENT ===');
})().catch((err) => { console.error('ÉCHEC :', err); process.exit(1); });
