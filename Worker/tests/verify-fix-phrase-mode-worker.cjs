// STUDIO CLINIQUE — Correctif : phrase exacte dans handleRagSearch (Worker/index.js) — un terme
// reçu déjà encadré de guillemets doubles doit conserver ses guillemets dans le MATCH FTS5 (vraie
// recherche de proximité), alors qu'avant ce correctif `t.replace(/['"]/g, "")` les retirait
// inconditionnellement de CHAQUE terme (fts_terms explicite compris) — aucune phrase exacte
// n'était jamais possible. Vérification Worker réelle (fonction extraite TEXTUELLEMENT de
// index.js, jamais réimplémentée) : seule la frontière D1/Vectorize/modèle est mockée.
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../index.js'), 'utf8');
function extract(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, `Bornes introuvables : "${startMarker}" → "${endMarker}"`);
  return source.slice(start, end);
}
const ragSearchCode = extract('async function handleRagSearch(', 'async function handleRagStats(');

function loadHandlers(code, env) {
  const context = vm.createContext({
    Response, Request, env,
    __name() {},
    jsonErr: (message, status) => new Response(JSON.stringify({ error: message }), { status }),
    json: (obj) => new Response(JSON.stringify(obj)),
  });
  vm.runInContext(code, context);
  return context;
}
function req(body) {
  return new Request('https://test.local/', { method: 'POST', body: JSON.stringify(body) });
}

function makeEnv() {
  const sqlLog = [];
  return {
    _sqlLog: sqlLog,
    AI: { async run(model) { if (model === '@cf/baai/bge-m3') return { data: [[0.1, 0.2]] }; throw new Error('modèle inattendu : ' + model); } },
    VECTOR_INDEX: { async query() { return { matches: [] }; } },
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            sqlLog.push({ sql, args });
            return { async all() { return { results: [] }; } };
          },
        };
      },
    },
  };
}

(async () => {
  // ── 1. `fts_terms` explicite, encadré de guillemets doubles — les guillemets DOIVENT être
  //      conservés dans le paramètre lié à MATCH (phrase FTS5 réelle), jamais retirés. ──
  const env1 = makeEnv();
  const ctx1 = loadHandlers(ragSearchCode, env1);
  await ctx1.handleRagSearch(req({ query: 'internal family systems', fts_terms: ['"internal family systems"'], topK: 5 }), env1);
  const ftsCall1 = env1._sqlLog.find((e) => e.sql.includes('chunks_fts'));
  assert.ok(ftsCall1, 'un appel SQL FTS5 doit avoir eu lieu');
  assert.equal(ftsCall1.args[0], '"internal family systems"', `les guillemets doivent être conservés pour une phrase — obtenu ${JSON.stringify(ftsCall1.args[0])}`);
  console.log('PASS 1/6 — fts_terms explicite entre guillemets doubles : guillemets CONSERVÉS dans le paramètre MATCH (vraie phrase FTS5)');

  // ── 2. Terme SANS guillemets — comportement inchangé (apostrophes/guillemets simples encore
  //      retirés, non-régression explicite). ──
  const env2 = makeEnv();
  const ctx2 = loadHandlers(ragSearchCode, env2);
  await ctx2.handleRagSearch(req({ query: 'x', fts_terms: ["l'attachement"], topK: 5 }), env2);
  const ftsCall2 = env2._sqlLog.find((e) => e.sql.includes('chunks_fts'));
  assert.equal(ftsCall2.args[0], 'lattachement', `un terme sans guillemets doubles doit garder l'ancien comportement (apostrophe retirée) — obtenu ${JSON.stringify(ftsCall2.args[0])}`);
  console.log('PASS 2/6 — terme sans guillemets doubles : comportement inchangé (apostrophe retirée, non-régression)');

  // ── 3. Requête auto-dérivée (pas de fts_terms) SANS guillemets dans le texte — comportement
  //      inchangé : mots joints par OR, jamais une phrase. ──
  const env3 = makeEnv();
  const ctx3 = loadHandlers(ragSearchCode, env3);
  await ctx3.handleRagSearch(req({ query: 'internal family systems', topK: 5 }), env3);
  const ftsCall3 = env3._sqlLog.find((e) => e.sql.includes('chunks_fts'));
  assert.equal(ftsCall3.args[0], 'internal OR family OR systems', `sans guillemets, la dérivation automatique doit rester une union OR — obtenu ${JSON.stringify(ftsCall3.args[0])}`);
  console.log('PASS 3/6 — requête auto-dérivée sans guillemets : union OR inchangée (non-régression)');

  // ── 4. Preuve concrète demandée : la MÊME requête, avec puis sans guillemets, produit un
  //      paramètre FTS5 réellement différent (comportement différent, pas supposé). ──
  const env4a = makeEnv();
  const ctx4a = loadHandlers(ragSearchCode, env4a);
  await ctx4a.handleRagSearch(req({ query: 'internal family systems', fts_terms: ['"internal family systems"'], topK: 5 }), env4a);
  const env4b = makeEnv();
  const ctx4b = loadHandlers(ragSearchCode, env4b);
  await ctx4b.handleRagSearch(req({ query: 'internal family systems', topK: 5 }), env4b);
  const withQuotes = env4a._sqlLog.find((e) => e.sql.includes('chunks_fts')).args[0];
  const withoutQuotes = env4b._sqlLog.find((e) => e.sql.includes('chunks_fts')).args[0];
  assert.notEqual(withQuotes, withoutQuotes, 'la même requête, entre guillemets ou non, doit produire un paramètre FTS5 différent');
  console.log(`PASS 4/6 — même requête, comportement réellement différent : avec guillemets = ${JSON.stringify(withQuotes)}, sans = ${JSON.stringify(withoutQuotes)}`);

  // ── 5. Plusieurs termes mixtes (un en phrase, les autres non) — chacun traité selon sa propre
  //      forme, jamais un comportement global "tout ou rien". ──
  const env5 = makeEnv();
  const ctx5 = loadHandlers(ragSearchCode, env5);
  await ctx5.handleRagSearch(req({ query: 'x', fts_terms: ['"parts work"', "l'ifs", 'systems'], topK: 5 }), env5);
  const ftsCall5 = env5._sqlLog.find((e) => e.sql.includes('chunks_fts'));
  assert.equal(ftsCall5.args[0], '"parts work" OR lifs OR systems', `traitement par terme attendu — obtenu ${JSON.stringify(ftsCall5.args[0])}`);
  console.log('PASS 5/6 — termes mixtes (phrase + mots simples) : chacun traité selon sa propre forme, jamais tout-ou-rien');

  // ── 6. Régression ciblée : le correctif approach:"all" (lot précédent) reste actif — les deux
  //      correctifs coexistent dans le même bloc sans interférence. ──
  const env6 = makeEnv();
  const ctx6 = loadHandlers(ragSearchCode, env6);
  await ctx6.handleRagSearch(req({ query: 'internal family systems', approach: 'all', topK: 5 }), env6);
  const ftsCall6 = env6._sqlLog.find((e) => e.sql.includes('chunks_fts'));
  assert.ok(!ftsCall6.sql.includes('AND c.approach = ?'), 'le correctif approach:"all" (lot précédent) doit rester actif après ce correctif phrase');
  console.log('PASS 6/6 — non-régression croisée : le correctif approach:"all" du lot précédent reste actif');

  console.log('\nTOUS LES TESTS CORRECTIF PHRASE EXACTE PASSENT (6/6)');
})().catch((e) => {
  console.error('ÉCHEC:', e);
  process.exitCode = 1;
});
