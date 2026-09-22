// STUDIO CLINIQUE — Correctif : `approach:"all"` traité littéralement dans handleRagSearch
// (Worker/index.js) — vérification Worker réelle (fonction extraite TEXTUELLEMENT de index.js,
// jamais réimplémentée). Seule la frontière D1/Vectorize/modèle est mockée ; toute la logique de
// filtrage `approach` (construction SQL FTS5 ET filtre final post-réhydratation) est exécutée
// réellement.
//
// Reproduit le cas de production documenté dans RAPPORT-INVESTIGATION-BUG-RAG-SEARCH-0-RESULTAT :
// requête dont de vrais résultats existent des deux côtés (vecteur ET FTS5), `approach:"all"`
// envoyé explicitement — avant correctif, `vector:9, fts5:0 → chunks:[]` ; après correctif, les
// résultats doivent réapparaître aux deux étapes.
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

// Jeu de données fixe, reflétant le cas réel documenté dans l'investigation : deux chunks
// pertinents (anglais, approche 'ifs', trouvés à la fois par le vecteur ET par FTS5 — comme le
// livre "Internal Family Systems Skills Training Manual" en production) et un chunk non pertinent
// d'une AUTRE approche (pour vérifier la non-régression du filtre réel).
const CHUNKS_DB = {
  'ifs-en-1': { book_title: 'IFS Skills Training Manual', author: 'A', page_number: 1, approach: 'ifs', language: 'en', content: 'Internal family systems parts work content one' },
  'ifs-en-2': { book_title: 'IFS Skills Training Manual', author: 'A', page_number: 2, approach: 'ifs', language: 'en', content: 'Internal family systems parts work content two' },
  'systemic-fr-1': { book_title: 'Approche systémique', author: 'B', page_number: 1, approach: 'systemic', language: 'fr', content: 'Contenu totalement différent, approche systémique' },
};
// Résultats FTS5 "bruts" (avant tout filtre approach/language) — modélise fidèlement la clause
// WHERE réelle construite par handleRagSearch : seuls les filtres RÉELLEMENT présents dans le SQL
// (approach/language, selon la même condition que le code testé) sont appliqués ici, jamais un
// filtre en plus ou en moins que ce que produit le code réel.
const FTS_RAW_MATCHES = ['ifs-en-1', 'ifs-en-2', 'systemic-fr-1'].map((id) => ({ id, ...CHUNKS_DB[id] }));

function makeEnv() {
  const sqlLog = [];
  return {
    _sqlLog: sqlLog,
    AI: {
      async run(model) {
        if (model === '@cf/baai/bge-m3') return { data: [[0.1, 0.2]] };
        throw new Error('modèle inattendu appelé (aucune traduction attendue dans ce lot) : ' + model);
      },
    },
    VECTOR_INDEX: {
      async query() {
        return {
          matches: [
            { id: 'ifs-en-1', score: 0.95, metadata: { book_title: 'IFS Skills Training Manual', author: 'A', approach: 'ifs' } },
            { id: 'ifs-en-2', score: 0.9, metadata: { book_title: 'IFS Skills Training Manual', author: 'A', approach: 'ifs' } },
            { id: 'systemic-fr-1', score: 0.8, metadata: { book_title: 'Approche systémique', author: 'B', approach: 'systemic' } },
          ],
        };
      },
    },
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            sqlLog.push({ sql, args });
            return {
              async all() {
                if (sql.includes('chunks_fts')) {
                  let idx = 1; // args[0] est toujours ftsQuery
                  let rows = FTS_RAW_MATCHES;
                  if (sql.includes('AND c.approach = ?')) {
                    rows = rows.filter((r) => r.approach === args[idx]);
                    idx++;
                  }
                  if (sql.includes('AND c.approach != ?')) idx++;
                  if (sql.includes('AND c.book_title LIKE ?')) idx++;
                  if (sql.includes('AND c.language = ?')) {
                    rows = rows.filter((r) => r.language === args[idx]);
                    idx++;
                  }
                  return { results: rows };
                }
                if (sql.includes('SELECT id, content, author, page_number, approach, language')) {
                  return { results: args.filter((id) => CHUNKS_DB[id]).map((id) => ({ id, ...CHUNKS_DB[id] })) };
                }
                return { results: [] };
              },
            };
          },
        };
      },
    },
  };
}

(async () => {
  // ── 1. Cas de production reproduit : approach:"all", requête dont de vrais résultats existent
  //      des deux côtés (query aux mots >3 lettres, comme "parts work internal family systems"
  //      en production). Avant correctif : vector:3, fts5:0 → chunks:[] (les 2 chunks 'ifs'
  //      rejetés par `c.approach = 'all'` en SQL ET par `c.approach === 'all'` au filtre final).
  //      Après correctif : les résultats doivent réapparaître AUX DEUX ÉTAPES. ──
  const env1 = makeEnv();
  const ctx1 = loadHandlers(ragSearchCode, env1);
  const resp1 = await ctx1.handleRagSearch(req({ query: 'parts work internal family systems', approach: 'all', language: 'all', topK: 5 }), env1);
  assert.equal(resp1.status, 200);
  const data1 = await resp1.json();
  assert.ok(data1.stats.fts5 > 0, `AVANT correctif fts5 était 0 (approach="all" traité littéralement) — APRÈS correctif, attendu >0, obtenu ${data1.stats.fts5}`);
  assert.ok(data1.stats.vector > 0, `vector devrait rester >0 (Vectorize n'a jamais été le problème), obtenu ${data1.stats.vector}`);
  assert.ok(data1.chunks.length > 0, `AVANT correctif chunks:[] malgré vector:${data1.stats.vector}/fts5:${data1.stats.fts5} — APRÈS correctif, des résultats doivent apparaître`);
  const ids1 = data1.chunks.map((c) => c.id);
  assert.ok(ids1.includes('ifs-en-1') || ids1.includes('ifs-en-2'), `les chunks IFS réellement pertinents doivent être présents dans la réponse finale, obtenu ${JSON.stringify(ids1)}`);
  console.log(`PASS 1/6 — cas de production reproduit (approach:"all") : résultats réapparus aux DEUX étapes (fts5:${data1.stats.fts5}, vector:${data1.stats.vector}, chunks:${data1.chunks.length})`);

  // ── 2. Vérification directe du SQL FTS5 généré : la clause "AND c.approach = ?" ne doit JAMAIS
  //      apparaître quand approach === "all" — preuve que le correctif touche bien la construction
  //      SQL, pas seulement son résultat observable. ──
  const ftsCall1 = env1._sqlLog.find((e) => e.sql.includes('chunks_fts'));
  assert.ok(ftsCall1, 'un appel SQL FTS5 doit avoir eu lieu');
  assert.ok(!ftsCall1.sql.includes('AND c.approach = ?'), `avec approach:"all", le SQL ne doit contenir aucune clause de filtre sur approach — obtenu : ${ftsCall1.sql}`);
  console.log('PASS 2/6 — SQL FTS5 généré avec approach:"all" ne contient aucune clause `AND c.approach = ?` (correctif vérifié à la source, pas seulement sur le résultat)');

  // ── 3. Non-régression : un approach RÉEL (ex. "ifs") continue de filtrer correctement — un
  //      chunk d'une autre approche (systemic-fr-1) ne doit JAMAIS apparaître. ──
  const env2 = makeEnv();
  const ctx2 = loadHandlers(ragSearchCode, env2);
  const resp2 = await ctx2.handleRagSearch(req({ query: 'parts work internal family systems', approach: 'ifs', language: 'all', topK: 5 }), env2);
  const data2 = await resp2.json();
  const ids2 = data2.chunks.map((c) => c.id);
  assert.ok(!ids2.includes('systemic-fr-1'), `approach:"ifs" doit exclure un chunk d'une autre approche — obtenu ${JSON.stringify(ids2)}`);
  assert.ok(ids2.includes('ifs-en-1') && ids2.includes('ifs-en-2'), `approach:"ifs" doit conserver les chunks de cette approche — obtenu ${JSON.stringify(ids2)}`);
  const ftsCall2 = env2._sqlLog.find((e) => e.sql.includes('chunks_fts'));
  assert.ok(ftsCall2.sql.includes('AND c.approach = ?'), 'avec un approach réel, le SQL doit toujours contenir la clause de filtre sur approach');
  console.log('PASS 3/6 — non-régression : approach réel ("ifs") continue de filtrer correctement, aux deux étapes (SQL FTS5 et filtre final)');

  // ── 4. Non-régression : approach omis entièrement (undefined) continue de ne rien filtrer,
  //      exactement comme avant ce correctif. ──
  const env3 = makeEnv();
  const ctx3 = loadHandlers(ragSearchCode, env3);
  const resp3 = await ctx3.handleRagSearch(req({ query: 'parts work internal family systems', language: 'all', topK: 5 }), env3);
  const data3 = await resp3.json();
  const ids3 = data3.chunks.map((c) => c.id);
  assert.ok(ids3.includes('ifs-en-1') && ids3.includes('ifs-en-2') && ids3.includes('systemic-fr-1'), `approach omis doit laisser passer TOUS les résultats pertinents, obtenu ${JSON.stringify(ids3)}`);
  const ftsCall3 = env3._sqlLog.find((e) => e.sql.includes('chunks_fts'));
  assert.ok(!ftsCall3.sql.includes('AND c.approach = ?'), 'avec approach omis, le SQL ne doit contenir aucune clause de filtre sur approach');
  console.log('PASS 4/6 — non-régression : approach omis (undefined) continue de ne rien filtrer, comme avant ce correctif');

  // ── 5. `exclude_approach` n'a jamais été touché par ce correctif : vérifier qu'il continue de
  //      fonctionner normalement (non-régression explicite demandée). ──
  const env4 = makeEnv();
  const ctx4 = loadHandlers(ragSearchCode, env4);
  const resp4 = await ctx4.handleRagSearch(req({ query: 'parts work internal family systems', exclude_approach: 'systemic', language: 'all', topK: 5 }), env4);
  const data4 = await resp4.json();
  const ftsCall4 = env4._sqlLog.find((e) => e.sql.includes('chunks_fts'));
  assert.ok(ftsCall4.sql.includes('AND c.approach != ?'), 'exclude_approach doit toujours générer sa propre clause SQL, inchangée par ce correctif');
  console.log('PASS 5/6 — non-régression : exclude_approach (jamais touché par ce correctif) continue de fonctionner normalement');

  // ── 6. Non-régression ciblée : `approach:"all"` sans aucun autre filtre ne doit plus jamais
  //      produire chunks:[] alors que vector/fts5 sont non nuls (garde-fou anti-régression du
  //      symptôme exact rapporté). ──
  const env5 = makeEnv();
  const ctx5 = loadHandlers(ragSearchCode, env5);
  const resp5 = await ctx5.handleRagSearch(req({ query: 'parts work internal family systems', approach: 'all', topK: 5 }), env5);
  const data5 = await resp5.json();
  assert.ok(!(data5.stats.vector > 0 && data5.chunks.length === 0), `RÉGRESSION DU BUG EXACT : vector:${data5.stats.vector} mais chunks:[] avec approach:"all" — le correctif n'est plus effectif`);
  console.log('PASS 6/6 — garde-fou anti-régression : approach:"all" avec des candidats vectoriels réels ne produit plus jamais chunks:[]');

  console.log('\nTOUS LES TESTS CORRECTIF approach:"all" PASSENT (6/6)');
})().catch((e) => {
  console.error('ÉCHEC:', e);
  process.exitCode = 1;
});
