// STUDIO CLINIQUE — Intégration HAL comme 4e pilier (bibliothèque + web + IA + HAL) —
// vérification Worker réelle de `handleSearchAcademicStudies` (fonction extraite TEXTUELLEMENT
// de index.js, jamais réimplémentée). Seule la frontière réseau (`fetch` global vers
// api.archives-ouvertes.fr) est mockée — impossible d'appeler la vraie API HAL depuis cette
// session (egress bloqué, confirmé par curl ET WebFetch renvoyant EGRESS_BLOCKED) : ce test
// vérifie donc la LOGIQUE du Worker (garde-fou 1, mise en forme, dégradation gracieuse), pas la
// justesse des noms de champs Solr eux-mêmes (voir avertissement dans le code et le rapport).
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../../../../Worker/index.js'), 'utf8');
function extract(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, `Bornes introuvables : "${startMarker}" → "${endMarker}"`);
  return source.slice(start, end);
}
const code = extract('const HAL_ALLOWED_DOC_TYPES', '__name(handleSearchAcademicStudies, "handleSearchAcademicStudies");') +
  '\n__name(handleSearchAcademicStudies, "handleSearchAcademicStudies");';

function loadHandler(fetchImpl) {
  const context = vm.createContext({
    Response, Request, URLSearchParams, fetch: fetchImpl,
    __name() {},
    jsonErr: (message, status) => new Response(JSON.stringify({ error: message }), { status }),
    json: (obj) => new Response(JSON.stringify(obj)),
  });
  vm.runInContext(code, context);
  return context;
}
function req(body) {
  return new Request('https://test.local/', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
}

(async () => {
  // ── 1. query manquante ou invalide → 400, JAMAIS d'appel réseau ──
  {
    let fetchCalled = false;
    const ctx = loadHandler(async () => { fetchCalled = true; throw new Error('ne doit jamais être appelé'); });
    for (const bad of [{}, { query: '' }, { query: '   ' }, { query: 'x'.repeat(301) }]) {
      const resp = await ctx.handleSearchAcademicStudies(req(bad), {});
      assert.equal(resp.status, 400, JSON.stringify(bad));
    }
    assert.equal(fetchCalled, false, 'une query invalide ne doit jamais déclencher d\'appel réseau vers HAL');
    console.log('PASS 1/11 — query manquante/vide/trop longue refusée (400), jamais d\'appel réseau');
  }

  // ── 2. Garde-fou 1 (filtrage type de document) — TOUJOURS en dur, jamais influencé par la
  //      query, jamais laissé au choix de l'appelant (aucun paramètre docType accepté). ──
  {
    let capturedUrl = null;
    const ctx = loadHandler(async (url) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ response: { docs: [] } }), { status: 200 });
    });
    await ctx.handleSearchAcademicStudies(req({ query: 'couple', docType: 'BLOG' }), {});
    const parsed = new URL(capturedUrl);
    const fq = parsed.searchParams.get('fq');
    assert.match(fq, /docType_s:ART/); assert.match(fq, /docType_s:COMM/);
    assert.match(fq, /docType_s:THESE/); assert.match(fq, /docType_s:COUV/);
    assert.ok(!fq.includes('BLOG'), 'un docType fourni par l\'appelant ne doit JAMAIS être pris en compte (garde-fou 1 en dur)');
    assert.ok(!fq.includes('POSTER'), 'BLOG/POSTER doivent rester exclus par défaut');
    console.log('PASS 2/11 — garde-fou 1 (filtrage docType) toujours ART/COMM/THESE/COUV, en dur, jamais influencé par l\'appelant');
  }

  // ── 3. Mise en forme réelle des résultats — fullTextAvailable dérivé de fileMain_s/files_s,
  //      abstract tronqué à 600 caractères, champs tableau/scalaire normalisés. ──
  {
    const ctx = loadHandler(async () => new Response(JSON.stringify({
      response: { docs: [
        { halId_s: 'halshs-01', title_s: ['Coping dyadique et couple'], authFullName_s: ['Guy Bodenmann'], docType_s: 'ART', producedDate_s: '2005', abstract_s: ['x'.repeat(800)], uri_s: 'https://hal.science/halshs-01', fileMain_s: 'https://hal.science/halshs-01/document' },
        { halId_s: 'halshs-02', title_s: 'Titre scalaire (pas un tableau)', authFullName_s: [], docType_s: 'COMM', producedDate_s: '2010', abstract_s: 'résumé court', uri_s: 'https://hal.science/halshs-02' },
      ] },
    }), { status: 200 }));
    const resp = await ctx.handleSearchAcademicStudies(req({ query: 'Bodenmann coping dyadique' }), {});
    assert.equal(resp.status, 200);
    const data = await resp.json();
    assert.equal(data.results.length, 2);
    assert.equal(data.results[0].title, 'Coping dyadique et couple');
    assert.equal(data.results[0].authors[0], 'Guy Bodenmann');
    assert.equal(data.results[0].abstract.length, 600, 'abstract doit être tronqué à 600 caractères');
    assert.equal(data.results[0].fullTextAvailable, true, 'fileMain_s présent → texte intégral disponible');
    assert.equal(data.results[0].fullTextUrl, 'https://hal.science/halshs-01/document');
    assert.equal(data.results[1].title, 'Titre scalaire (pas un tableau)', 'un champ scalaire (non-tableau) doit être géré, pas seulement le cas tableau');
    assert.equal(data.results[1].fullTextAvailable, false, 'ni fileMain_s ni files_s → aucun texte intégral vérifiable');
    console.log('PASS 3/11 — mise en forme réelle : champs tableau/scalaire normalisés, abstract borné à 600 caractères, fullTextAvailable dérivé de fileMain_s/files_s');
  }

  // ── 4. Aucun résultat réel — tableau vide, jamais une erreur ──
  {
    const ctx = loadHandler(async () => new Response(JSON.stringify({ response: { docs: [] } }), { status: 200 }));
    const resp = await ctx.handleSearchAcademicStudies(req({ query: 'sujet totalement inexistant xyzabc' }), {});
    assert.equal(resp.status, 200);
    const data = await resp.json();
    assert.deepEqual(data.results, []);
    console.log('PASS 4/11 — aucun résultat réel : tableau vide, jamais une erreur');
  }

  // ── 5. HAL indisponible (HTTP non-200) — dégradation gracieuse, TOUJOURS 200 côté Worker
  //      (le modèle doit recevoir un tool_result exploitable, jamais un crash de la génération). ──
  {
    const ctx = loadHandler(async () => new Response('Service Unavailable', { status: 503 }));
    const resp = await ctx.handleSearchAcademicStudies(req({ query: 'test' }), {});
    assert.equal(resp.status, 200, 'une panne HAL ne doit jamais se traduire par un statut d\'erreur côté Worker — le client a besoin d\'un tool_result exploitable');
    const data = await resp.json();
    assert.deepEqual(data.results, []);
    assert.ok(data.error && data.error.includes('503'));
    console.log('PASS 5/11 — HAL répond une erreur HTTP : dégradation gracieuse (200, results:[], error explicite), jamais un crash de la génération');
  }

  // ── 6. Panne réseau (fetch qui rejette) — même garantie de dégradation gracieuse ──
  {
    const ctx = loadHandler(async () => { throw new Error('network unreachable'); });
    const resp = await ctx.handleSearchAcademicStudies(req({ query: 'test' }), {});
    assert.equal(resp.status, 200);
    const data = await resp.json();
    assert.deepEqual(data.results, []);
    assert.ok(data.error && data.error.includes('network unreachable'));
    console.log('PASS 6/11 — panne réseau (fetch rejeté) : même dégradation gracieuse, jamais une exception non gérée');
  }

  // ── 7. CORRECTIF FINAL "HAL 0 résultat" — les 3 requêtes réelles rapportées par Christophe (5-6
  //      mots chacune, numFound:0 confirmé contre la vraie API) doivent désormais être réduites à
  //      leurs 2 PREMIERS mots-clés seulement, séparés par un simple espace — JAMAIS un OR (2
  //      tentatives OR abandonnées : illimité → 74768 résultats bruités, plafonné à 3 → encore
  //      11-12 mille ; l'ET implicite par défaut de HAL/Solr sur 2 mots est le point d'équilibre
  //      confirmé, 15 à 34 résultats pertinents contre la vraie API). ──
  {
    const cases = [
      { in: 'idéal amoureux couple contemporain psychologie clinique', expectWords: ['idéal', 'amoureux'] },
      { in: 'mythe fusion couple thérapie conjugale Neuburger', expectWords: ['mythe', 'fusion'] },
      { in: 'couple idéal romantique illusion désillusion psychothérapie', expectWords: ['couple', 'idéal'] },
    ];
    for (const c of cases) {
      let capturedUrl = null;
      const ctx = loadHandler(async (url) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ response: { docs: [] } }), { status: 200 });
      });
      await ctx.handleSearchAcademicStudies(req({ query: c.in }), {});
      const q = new URL(capturedUrl).searchParams.get('q');
      assert.equal(q, c.expectWords.join(' '), `requête "${c.in}" doit être réduite à SES 2 PREMIERS mots-clés seulement, séparés par un espace (ET implicite), jamais tous ses mots ni un OR`);
      assert.ok(!q.includes(' OR '), 'plus aucun OR ne doit jamais être construit — l\'ET implicite par défaut de HAL/Solr est désormais le mécanisme recherché, pas contourné');
      assert.ok(!q.includes(c.in), 'la requête brute intégrale (6 mots) ne doit plus jamais être envoyée telle quelle à HAL');
    }
    console.log('PASS 7/11 — CORRECTIF FINAL confirmé : les 3 requêtes réelles rapportées sont désormais réduites à leurs 2 premiers mots-clés (ET implicite, jamais un OR, jamais plus de 2 mots) — point d\'équilibre confirmé contre la vraie API après 2 tentatives OR abandonnées');
  }

  // ── 8. Non-régression — une requête déjà à exactement 2 mots continue de fonctionner sans perte
  //      de mot (déjà la limite du plafond). ──
  {
    let capturedUrl = null;
    const ctx = loadHandler(async (url) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ response: { docs: [{ halId_s: 'x', title_s: 'x', authFullName_s: [], docType_s: 'ART', producedDate_s: '2020', abstract_s: '', uri_s: 'x' }] } }), { status: 200 });
    });
    const resp = await ctx.handleSearchAcademicStudies(req({ query: 'Bodenmann coping' }), {});
    assert.equal(resp.status, 200);
    const data = await resp.json();
    assert.equal(data.results.length, 1, 'une requête courte déjà fonctionnelle avant ce correctif doit continuer de renvoyer des résultats');
    const q = new URL(capturedUrl).searchParams.get('q');
    assert.equal(q, 'Bodenmann coping', 'une requête à exactement 2 mots (déjà la limite du plafond) ne doit jamais perdre de mot ni recevoir de OR');
    console.log('PASS 8/11 — non-régression : une requête déjà courte (exactement 2 mots, la limite du plafond) continue de fonctionner sans perte de mot, sans OR ajouté');
  }

  // ── 9. Acronymes cliniques courts (3 caractères) préservés ET plafond appliqué APRÈS le filtre
  //      de longueur (jamais avant) — sur 4 mots dont aucun n'est ≤2 caractères, seuls les 2
  //      PREMIERS mots restants après filtrage sont gardés, jamais un tri par pertinence. ──
  {
    let capturedUrl = null;
    const ctx = loadHandler(async (url) => { capturedUrl = url; return new Response(JSON.stringify({ response: { docs: [] } }), { status: 200 }); });
    await ctx.handleSearchAcademicStudies(req({ query: 'IFS Schwartz système familial' }), {});
    const q = new URL(capturedUrl).searchParams.get('q');
    assert.equal(q, 'IFS Schwartz', 'le plafond garde les 2 PREMIERS mots restants après filtrage (jamais un tri par pertinence, jamais plus de 2) — "système" et "familial" sont ceux qui sautent ici, l\'acronyme "IFS" (3 caractères) n\'est jamais filtré comme un connecteur');
    console.log('PASS 9/11 — acronymes cliniques courts (IFS/TCC/ACT/DBT) jamais éliminés par le filtre de longueur ; le plafond à 2 s\'applique bien APRÈS ce filtre, jamais avant');
  }

  // ── 10. CORRECTIF plafond — un mot-clé filtrable AVANT le plafond (connecteur ≤2 caractères)
  //       ne doit jamais compter dans les 2 retenus : "le" doit sauter, jamais prendre la place
  //       d'un mot significatif dans le plafond de 2. ──
  {
    let capturedUrl = null;
    const ctx = loadHandler(async (url) => { capturedUrl = url; return new Response(JSON.stringify({ response: { docs: [] } }), { status: 200 }); });
    await ctx.handleSearchAcademicStudies(req({ query: 'IFS le couple systémique' }), {});
    const q = new URL(capturedUrl).searchParams.get('q');
    assert.equal(q, 'IFS couple', '"le" (≤2 caractères) doit être écarté par le filtre AVANT le plafond, jamais compté parmi les 2 mots retenus à la place d\'un mot significatif ("systémique" saute ici, pas "le")');
    console.log('PASS 10/11 — ordre filtre-puis-plafond confirmé : un connecteur court ne prend jamais la place d\'un mot-clé significatif dans le plafond de 2');
  }

  // ── 11. Caractères spéciaux Solr et requête réduite à des tokens de bruit — jamais de motif
  //       cassé envoyé à HAL, jamais une requête vide non plus (filet de sécurité), jamais de OR
  //       littéral confondu avec le mot anglais "OR" (filtré comme tout mot ≤2 caractères). ──
  {
    let capturedUrl = null;
    const ctx = loadHandler(async (url) => { capturedUrl = url; return new Response(JSON.stringify({ response: { docs: [] } }), { status: 200 }); });
    await ctx.handleSearchAcademicStudies(req({ query: 'couple: (idéal) OR "romantique"' }), {});
    let q = new URL(capturedUrl).searchParams.get('q');
    assert.ok(!/[():"]/.test(q), `les caractères spéciaux Solr doivent être retirés de chaque mot-clé — obtenu : "${q}"`);
    assert.equal(q, 'couple idéal', 'le mot anglais "OR" (2 caractères) doit être écarté par le filtre de longueur comme tout autre connecteur court, jamais traité comme un opérateur (il n\'y en a plus) ; "romantique" saute ici, plafonné à 2 mots');

    const ctx2 = loadHandler(async (url) => { capturedUrl = url; return new Response(JSON.stringify({ response: { docs: [] } }), { status: 200 }); });
    await ctx2.handleSearchAcademicStudies(req({ query: 'de la et' }), {});
    q = new URL(capturedUrl).searchParams.get('q');
    assert.equal(q, 'de la et', 'si tous les mots sont ≤2 caractères, filet de sécurité : la requête brute est envoyée telle quelle, jamais une requête vide à HAL');
    console.log('PASS 11/11 — caractères spéciaux Solr retirés de chaque mot-clé (jamais de motif cassé), filet de sécurité si tous les mots sont trop courts (jamais une requête vide envoyée à HAL)');
  }

  console.log('\nTOUS LES TESTS HAL /search-academic-studies PASSENT (11/11)');
})().catch((e) => {
  console.error('ÉCHEC:', e);
  process.exitCode = 1;
});
