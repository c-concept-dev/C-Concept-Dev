// STUDIO CLINIQUE — Panneau "Médias", sous-onglet "Vidéos" : preuve réelle des routes Worker
// /video-links (création/liste/suppression) et du repli PPTX (adocRenderPptxNestedBlock, case
// "video"), extraites TEXTUELLEMENT de index.js (jamais réimplémentées) — même patron que
// verify-media-panel-worker.cjs (extraction par bornes + exécution vm, miniflare indisponible
// dans ce bac à sable).
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
const videoLinksCode = slice(
  '// Panneau "Médias", sous-onglet "Vidéos" — CRUD minimal',
  '__name(handleVideoLinkDelete, "handleVideoLinkDelete");',
  'code des routes video_links'
) + '__name(handleVideoLinkDelete, "handleVideoLinkDelete");\n';
const pptxPxToIn = slice('var ADOC_CARROUSEL_PPTX_PX_PER_INCH = 96;', '// Même règle de tri', 'adocPxToIn');
const pptxNestedBlock = slice('async function adocRenderPptxNestedBlock(slide, prs, env2, block, box) {', '\n}\n', 'adocRenderPptxNestedBlock') + '\n}\n';

const wrapperSrc = `
${jsonHelpers}
${videoLinksCode}
${pptxPxToIn}
${pptxNestedBlock}
module.exports = { handleVideoLinkCreate, handleVideoLinksList, handleVideoLinkDelete, adocRenderPptxNestedBlock };
`;

function loadModule() {
  const CORS = { 'Access-Control-Allow-Origin': 'https://c-concept-dev.github.io' };
  const sandbox = { module: { exports: {} }, CORS, Response, crypto, TextEncoder, console, URL, __name: (fn) => fn };
  vm.createContext(sandbox);
  vm.runInContext(wrapperSrc, sandbox, { filename: 'video-links-extract.js' });
  return sandbox.module.exports;
}

// ── D1 factice — assez fidèle pour prepare().bind().first()/all()/run() sur video_links ──
function makeD1() {
  const rows = new Map(); // id -> row
  let seq = 0;
  return {
    prepare(sql) {
      return {
        _sql: sql,
        _binds: [],
        bind(...args) { this._binds = args; return this; },
        async first() {
          // LOT VIDÉO-2 — handleVideoLinkDelete ne sélectionne plus seulement l'id : il lit aussi
          // storage_type et r2_key, pour ne purger l'objet R2 que s'il n'est plus référencé ailleurs.
          // Un mock qui ne répondait qu'à « SELECT id FROM video_links WHERE id = ? » renvoyait donc
          // null sur le vrai SQL, et la suppression répondait 404 alors que la ligne existait bien.
          // Le motif couvre les DEUX formes, jamais un includes() partiel qui masquerait un nouvel
          // élargissement de colonnes du même SELECT.
          if (/^SELECT id(, storage_type, r2_key)? FROM video_links WHERE id = \?/.test(this._sql.trim())) {
            const row = rows.get(this._binds[0]);
            return row ? { id: row.id, storage_type: row.storage_type, r2_key: row.r2_key || null } : null;
          }
          return null;
        },
        async all() {
          // LOT VIDÉO-1 — migration 0014 (attribution/storage_type) : la sélection réelle
          // (handleVideoLinksList) porte désormais ces deux colonnes en plus.
          if (this._sql.includes('SELECT id, url, title, attribution, storage_type, created_at FROM video_links')) {
            return { results: Array.from(rows.values()).sort((a, b) => b._seq - a._seq).map((r) => ({ id: r.id, url: r.url, title: r.title, attribution: r.attribution, storage_type: r.storage_type, created_at: r.created_at })) };
          }
          return { results: [] };
        },
        async run() {
          if (this._sql.includes('INSERT INTO video_links')) {
            const [id, url, title, attribution] = this._binds;
            rows.set(id, { id, url, title, attribution: attribution || null, storage_type: 'local', created_at: new Date().toISOString(), _seq: seq++ });
          } else if (this._sql.includes('DELETE FROM video_links WHERE id = ?')) {
            rows.delete(this._binds[0]);
          }
          return {};
        },
      };
    },
    _rows: rows,
  };
}

function makeRequest(bodyObj) {
  return { async json() { return bodyObj; } };
}

(async () => {
  const { handleVideoLinkCreate, handleVideoLinksList, handleVideoLinkDelete, adocRenderPptxNestedBlock } = loadModule();

  // ── Test 1 — POST /video-links : création réelle, id en UUID, jamais un téléchargement ──
  {
    const db = makeD1();
    const env = { DB: db };
    const r = await handleVideoLinkCreate(makeRequest({ url: 'http://localhost:47823/seance1.mp4', title: 'Exercice de respiration' }), env);
    assert.equal(r.status, 200, 'création avec url+title valides doit réussir');
    const data = JSON.parse(await r.text());
    assert.ok(data.id && /^[0-9a-f-]{36}$/.test(data.id), 'id doit être un UUID (jamais une empreinte SHA-256 — aucun octet à empreinter ici)');
    assert.equal(data.url, 'http://localhost:47823/seance1.mp4');
    assert.equal(data.title, 'Exercice de respiration');
    const row = db._rows.get(data.id);
    assert.ok(row, 'la ligne doit exister dans video_links — réellement persistée, pas seulement renvoyée');
    console.log('PASS 1/9 — POST /video-links : création réelle persistée, id en UUID');
  }

  // ── Test 2 — url manquante → 400, jamais une ligne à moitié créée ──
  {
    const db = makeD1();
    const r = await handleVideoLinkCreate(makeRequest({ url: '', title: 'Sans lien' }), { DB: db });
    assert.equal(r.status, 400, 'url vide doit être refusée');
    assert.equal(db._rows.size, 0, 'aucune ligne ne doit être créée si la validation échoue');
    console.log('PASS 2/9 — url manquante refusée (400), aucune ligne orpheline');
  }

  // ── Test 3 — title manquant → 400, jamais une ligne à moitié créée ──
  {
    const db = makeD1();
    const r = await handleVideoLinkCreate(makeRequest({ url: 'http://localhost:47823/x.mp4', title: '' }), { DB: db });
    assert.equal(r.status, 400, 'title vide doit être refusé');
    assert.equal(db._rows.size, 0, 'aucune ligne ne doit être créée si la validation échoue');
    console.log('PASS 3/9 — title manquant refusé (400), aucune ligne orpheline');
  }

  // ── Test 4 — GET /video-links : liste réellement ce qui a été créé, plus récent en premier ──
  {
    const db = makeD1();
    const env = { DB: db };
    await handleVideoLinkCreate(makeRequest({ url: 'http://localhost:1/a.mp4', title: 'A' }), env);
    await handleVideoLinkCreate(makeRequest({ url: 'http://localhost:1/b.mp4', title: 'B' }), env);
    const r = await handleVideoLinksList(env);
    assert.equal(r.status, 200);
    const data = JSON.parse(await r.text());
    assert.equal(data.videos.length, 2, 'les 2 vidéos créées doivent apparaître');
    assert.equal(data.videos[0].title, 'B', 'la plus récente doit apparaître en premier (ORDER BY created_at DESC)');
    console.log('PASS 4/9 — GET /video-links : liste réelle, ordre décroissant par date de création');
  }

  // ── Test 5 — DELETE /video-links/:id : suppression réelle ──
  {
    const db = makeD1();
    const env = { DB: db };
    const created = JSON.parse(await (await handleVideoLinkCreate(makeRequest({ url: 'http://localhost:1/c.mp4', title: 'C' }), env)).text());
    assert.ok(db._rows.has(created.id), 'préalable : la ligne doit exister avant suppression');
    const r = await handleVideoLinkDelete(env, created.id);
    assert.equal(r.status, 200);
    const data = JSON.parse(await r.text());
    assert.deepEqual(data, { deleted: true });
    assert.ok(!db._rows.has(created.id), 'la ligne doit être réellement supprimée, pas seulement marquée');
    console.log('PASS 5/9 — DELETE /video-links/:id : suppression réelle');
  }

  // ── Test 6 — DELETE sur un id inconnu → 404, jamais un succès silencieux ──
  {
    const env = { DB: makeD1() };
    const r = await handleVideoLinkDelete(env, 'id-inexistant');
    assert.equal(r.status, 404);
    console.log('PASS 6/9 — DELETE sur un id inconnu renvoie 404, jamais un succès silencieux');
  }

  // ── Test 7 — PPTX (Carrousel) : un nestedBlock "video" se replie en texte titre+lien, jamais un
  // embed vidéo réel (aucune API PptxGenJS pour ça) ni un slide.addImage (aucun octet à embarquer) ──
  {
    const calls = { addText: [], addImage: [], addShape: [] };
    const slide = {
      addText(text, opts) { calls.addText.push({ text, opts }); },
      addImage(opts) { calls.addImage.push(opts); },
      addShape(shape, opts) { calls.addShape.push({ shape, opts }); },
    };
    const block = { type: 'video', content: { url: 'http://localhost:47823/seance2.mp4', title: 'Séance 2' } };
    const box = { x: 10, y: 20, width: 300, height: 150 };
    await adocRenderPptxNestedBlock(slide, {}, {}, block, box);
    assert.equal(calls.addImage.length, 0, 'jamais slide.addImage pour une vidéo — aucun octet réel à embarquer');
    assert.equal(calls.addText.length, 1, 'le repli honnête doit être un texte visible, pas un échec silencieux');
    assert.equal(calls.addText[0].text, 'Séance 2 — http://localhost:47823/seance2.mp4', 'titre ET lien doivent être visibles, jamais l’un sans l’autre');
    console.log('PASS 7/9 — PPTX Carrousel : bloc vidéo replié en texte "titre — lien", jamais un embed ni un addImage');
  }

  // ── Test 8 — PPTX : une vidéo SANS titre (cas limite) affiche au moins le lien, jamais un texte
  // vide qui laisserait une case invisible sur la diapositive ──
  {
    const calls = { addText: [] };
    const slide = { addText(text, opts) { calls.addText.push({ text, opts }); }, addImage() {}, addShape() {} };
    const block = { type: 'video', content: { url: 'http://localhost:47823/x.mp4', title: '' } };
    await adocRenderPptxNestedBlock(slide, {}, {}, block, { x: 0, y: 0, width: 100, height: 50 });
    assert.equal(calls.addText[0].text, ' — http://localhost:47823/x.mp4', 'le lien doit rester visible même sans titre');
    console.log('PASS 8/9 — PPTX : vidéo sans titre affiche au moins le lien, jamais un texte totalement vide');
  }

  // ── Test 9 (LOT VIDÉO-1) — attribution Pexels : persistée à la création, visible à la liste,
  // jamais retirée ni minimisée (obligation des conditions Pexels, même patron que
  // render_assets.attribution pour les photos) ; storage_type reste 'local' par défaut (ce lot ne
  // produit encore que des liens locaux, migration 0014 sans effet ici). ──
  {
    const db = makeD1();
    const env = { DB: db };
    const created = JSON.parse(await (await handleVideoLinkCreate(makeRequest({
      url: 'https://videos.pexels.com/video-files/123/123.mp4',
      title: 'Respiration guidée',
      attribution: 'Vidéo : Jane Doe — Pexels',
    }), env)).text());
    assert.equal(created.attribution, 'Vidéo : Jane Doe — Pexels', 'la réponse de création doit renvoyer l’attribution telle quelle');
    const listed = JSON.parse(await (await handleVideoLinksList(env)).text());
    assert.equal(listed.videos[0].attribution, 'Vidéo : Jane Doe — Pexels', 'l’attribution doit être réellement persistée et relue, pas seulement renvoyée');
    assert.equal(listed.videos[0].storage_type, 'local', 'storage_type doit valoir "local" par défaut (migration 0014, aucune vidéo Cloudflare dans ce lot)');
    // Un lien manuel (sans attribution, flux déjà existant) doit rester intact — jamais régressé
    // par l’ajout du champ.
    const manual = JSON.parse(await (await handleVideoLinkCreate(makeRequest({ url: 'http://localhost:1/manuel.mp4', title: 'Lien manuel' }), env)).text());
    assert.equal(manual.attribution, null, 'un lien manuel sans attribution doit rester à null, jamais une chaîne vide ni undefined perdu');
    console.log('PASS 9/9 — attribution Pexels persistée et relue, storage_type=local par défaut, lien manuel non régressé');
  }

  console.log('\n=== TOUS LES TESTS "VIDÉOS" (9/9) PASSENT ===');
})().catch((err) => { console.error('ÉCHEC :', err); process.exit(1); });
