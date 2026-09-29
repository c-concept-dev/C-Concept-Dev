// STUDIO CLINIQUE — LOT VIDÉO-1 : preuve réelle de la route Worker /fetch-video
// (handleFetchVideo + adocPickPexelsVideoFile), extraites TEXTUELLEMENT de index.js (jamais
// réimplémentées) — même patron d'extraction par bornes + exécution vm que
// verify-video-links-worker.cjs (miniflare indisponible dans ce bac à sable). Objectif central :
// prouver que l'aperçu de vignette utilise réellement une définition BASSE (~360p) et jamais la
// version lourde (~1080p) — l'inverse serait un vrai défaut de performance/coût, pas cosmétique.
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
const fetchVideoCode = slice(
  'function adocPickPexelsVideoFile(files, targetHeight) {',
  '__name(handleFetchVideo, "handleFetchVideo");',
  'adocPickPexelsVideoFile + handleFetchVideo'
) + '__name(handleFetchVideo, "handleFetchVideo");\n';

const wrapperSrc = `
${jsonHelpers}
${fetchVideoCode}
module.exports = { adocPickPexelsVideoFile, handleFetchVideo };
`;

function loadModule(fetchImpl) {
  const CORS = { 'Access-Control-Allow-Origin': 'https://c-concept-dev.github.io' };
  const sandbox = {
    module: { exports: {} }, CORS, Response, TextEncoder, console, URL,
    __name: (fn) => fn,
    fetch: fetchImpl,
  };
  vm.createContext(sandbox);
  vm.runInContext(wrapperSrc, sandbox, { filename: 'fetch-video-extract.js' });
  return sandbox.module.exports;
}

function makeUrl(query) {
  return new URL('https://worker.example/fetch-video' + (query ? '?' + query : ''));
}

// Réponse Pexels Videos Search factice — hauteurs volontairement étalées pour que le choix "le
// plus proche de 360" et "le plus proche de 1080" pointent vers des fichiers réellement distincts,
// jamais le même par coïncidence.
function pexelsVideoFixture(id, overrides) {
  return Object.assign({
    id,
    duration: 12,
    user: { name: 'Jane Doe' },
    video_files: [
      { link: 'https://videos.pexels.com/f-144.mp4', height: 144, file_type: 'video/mp4' },
      { link: 'https://videos.pexels.com/f-360.mp4', height: 360, file_type: 'video/mp4' },
      { link: 'https://videos.pexels.com/f-540.mp4', height: 540, file_type: 'video/mp4' },
      { link: 'https://videos.pexels.com/f-1080.mp4', height: 1080, file_type: 'video/mp4' },
      { link: 'https://videos.pexels.com/f-1440.mp4', height: 1440, file_type: 'video/mp4' },
    ],
    video_pictures: [
      { picture: 'https://images.pexels.com/videos/1/pic-0.jpeg' },
      { picture: 'https://images.pexels.com/videos/1/pic-1.jpeg' },
      { picture: 'https://images.pexels.com/videos/1/pic-2.jpeg' },
    ],
  }, overrides);
}

(async () => {
  // ── Test 1 — clé absente → 500 explicite, jamais un appel Pexels tenté sans clé ──
  {
    const { handleFetchVideo } = loadModule(async () => { throw new Error('fetch ne doit jamais être appelé sans clé'); });
    const r = await handleFetchVideo(makeUrl('q=calme'), {});
    assert.equal(r.status, 500);
    const data = JSON.parse(await r.text());
    assert.match(data.error, /PEXELS_API_KEY/, 'le message doit nommer la clé manquante');
    console.log('PASS 1/7 — PEXELS_API_KEY absente : 500 explicite, aucun appel réseau tenté');
  }

  // ── Test 2 — aperçu ~360p, téléchargement ~1080p : DEUX fichiers réellement distincts, jamais
  // la version lourde utilisée comme aperçu (défaut de performance/coût sinon) ──
  {
    let calledUrl = null;
    const fetchImpl = async (url) => {
      calledUrl = url;
      return { ok: true, json: async () => ({ videos: [pexelsVideoFixture(1)], total_results: 1 }) };
    };
    const { handleFetchVideo } = loadModule(fetchImpl);
    const r = await handleFetchVideo(makeUrl('q=respiration&per_page=4'), { PEXELS_API_KEY: 'k' });
    assert.equal(r.status, 200);
    const data = JSON.parse(await r.text());
    assert.equal(data.videos.length, 1);
    const v = data.videos[0];
    assert.equal(v.previewUrl, 'https://videos.pexels.com/f-360.mp4', 'l’aperçu doit être le fichier le plus proche de 360p');
    assert.equal(v.downloadUrl, 'https://videos.pexels.com/f-1080.mp4', 'le téléchargement doit être le fichier le plus proche de 1080p');
    assert.notEqual(v.previewUrl, v.downloadUrl, 'aperçu et téléchargement doivent être deux fichiers distincts, jamais le même');
    assert.equal(v.photographer, 'Jane Doe');
    assert.ok(calledUrl.toString().includes('api.pexels.com/videos/search'), 'doit appeler le bon endpoint Pexels Vidéos (jamais /v1/search, réservé aux photos)');
    console.log('PASS 2/7 — aperçu ~360p et téléchargement ~1080p sont deux fichiers distincts, jamais la version lourde en aperçu');
  }

  // ── Test 3 — vignette allégée : image du MILIEU de video_pictures, largeur réécrite (?w=480),
  // jamais un second appel réseau pour l’alléger ──
  {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ videos: [pexelsVideoFixture(2)], total_results: 1 }) });
    const { handleFetchVideo } = loadModule(fetchImpl);
    const r = await handleFetchVideo(makeUrl('q=calme'), { PEXELS_API_KEY: 'k' });
    const data = JSON.parse(await r.text());
    assert.equal(data.videos[0].thumbUrl, 'https://images.pexels.com/videos/1/pic-1.jpeg?w=480', 'doit choisir l’image du milieu et lui ajouter ?w=480, sans second appel réseau');
    console.log('PASS 3/7 — vignette allégée : image du milieu, largeur réécrite, aucun second appel réseau');
  }

  // ── Test 4 — vidéo sans video_pictures/video_files (cas limite Pexels) : jamais un crash, des
  // chaînes vides plutôt qu’une exception qui ferait échouer toute la recherche ──
  {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ videos: [{ id: 3, duration: 5, user: {} }], total_results: 1 }) });
    const { handleFetchVideo } = loadModule(fetchImpl);
    const r = await handleFetchVideo(makeUrl('q=x'), { PEXELS_API_KEY: 'k' });
    assert.equal(r.status, 200, 'une vidéo sans fichiers ne doit jamais faire échouer toute la recherche');
    const data = JSON.parse(await r.text());
    assert.deepEqual(data.videos[0], { id: 3, photographer: '', duration: 5, previewUrl: '', downloadUrl: '', thumbUrl: '' });
    console.log('PASS 4/7 — vidéo sans fichiers/images : champs vides, jamais un crash');
  }

  // ── Test 5 — erreur Pexels (ex. 401/429) relayée avec son VRAI code, même patron que
  // handleFetchImage (jamais un 502 générique qui masquerait la vraie cause) ──
  {
    const fetchImpl = async () => ({ ok: false, status: 429, text: async () => 'Rate limit exceeded' });
    const { handleFetchVideo } = loadModule(fetchImpl);
    const r = await handleFetchVideo(makeUrl('q=x'), { PEXELS_API_KEY: 'k' });
    assert.equal(r.status, 429);
    const data = JSON.parse(await r.text());
    assert.match(data.error, /429/);
    assert.match(data.error, /Rate limit exceeded/);
    console.log('PASS 5/7 — erreur Pexels relayée avec son vrai code HTTP et son corps, jamais masquée');
  }

  // ── Test 6 — exception réseau (fetch qui lève) → 500 explicite, jamais une exception non
  // gérée qui remonterait jusqu’au routeur ──
  {
    const fetchImpl = async () => { throw new Error('DNS failure'); };
    const { handleFetchVideo } = loadModule(fetchImpl);
    const r = await handleFetchVideo(makeUrl('q=x'), { PEXELS_API_KEY: 'k' });
    assert.equal(r.status, 500);
    const data = JSON.parse(await r.text());
    assert.match(data.error, /DNS failure/);
    console.log('PASS 6/7 — exception réseau capturée, 500 explicite, jamais une exception non gérée');
  }

  // ── Test 7 — adocPickPexelsVideoFile directement : préfère mp4 quand plusieurs types coexistent,
  // jamais un format illisible par <video>/PptxGenJS choisi par accident ──
  {
    const { adocPickPexelsVideoFile } = loadModule(async () => { throw new Error('non utilisé ici'); });
    const files = [
      { link: 'a.webm', height: 360, file_type: 'video/webm' },
      { link: 'b.mp4', height: 358, file_type: 'video/mp4' },
    ];
    const picked = adocPickPexelsVideoFile(files, 360);
    assert.equal(picked.link, 'b.mp4', 'doit préférer mp4 même si un autre format est numériquement plus proche de la cible');
    assert.equal(adocPickPexelsVideoFile([], 360), null, 'une liste vide doit renvoyer null, jamais une exception');
    console.log('PASS 7/7 — adocPickPexelsVideoFile préfère mp4, gère une liste vide sans exception');
  }

  console.log('\n=== TOUS LES TESTS "/fetch-video" (7/7) PASSENT ===');
})().catch((err) => { console.error('ÉCHEC :', err); process.exit(1); });
