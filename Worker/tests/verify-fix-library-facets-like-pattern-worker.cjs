// STUDIO CLINIQUE — CORRECTIF URGENT : `/library-facets` échoue sur toute phrase de recherche
// longue ("LIKE or GLOB pattern too complex: SQLITE_ERROR") — vérification Worker réelle.
//
// Cause confirmée par reproduction DIRECTE contre le vrai Cloudflare D1 (therapeute-library,
// 5ce316e7-f5c1-406a-ac01-4f773ba8362e, lecture seule, 2026-09-22) : la vraie limite D1 pour un
// motif LIKE est de 50 OCTETS TOTAL (délimiteurs '%' compris) — recherche dichotomique exacte :
//   - "%" + 48*'a' + "%"  = 50 octets  -> réussit
//   - "%" + 49*'a' + "%"  = 51 octets  -> échoue ("LIKE or GLOB pattern too complex")
//   - "%" + 24*'é' + "%"  = 50 octets  -> réussit (limite bien en OCTETS UTF-8, pas en caractères)
//   - "%" + 25*'é' + "%"  = 52 octets  -> échoue
//   - la phrase française réelle "comment identifier les différents modes chez un patient en
//     thérapie" (67 caractères, 69 octets UTF-8, 71 octets avec les '%') -> échoue, reproduisant
//     exactement le bug rapporté.
// C'est TRÈS en-deçà du défaut de node:sqlite (50 000 octets) utilisé par les tests locaux
// existants (verify-library-facets.cjs) — aucun test local n'aurait jamais pu révéler ce bug,
// ni même la limite de 100 caractères posée par le correctif Phase 3 monobloc précédent (qui
// visait handleD1Query, jamais handleLibraryFacets, et n'a lui-même jamais été validé contre le
// vrai D1 : un motif tronqué à 100 caractères PUIS échappé peut largement dépasser 50 octets).
//
// La fonction extraite ici est celle RÉELLEMENT modifiée par ce correctif ; la frontière D1 est
// mockée pour reproduire FIDÈLEMENT le comportement réel confirmé ci-dessus (throw au-delà de
// 50 octets UTF-8 sur un paramètre lié à une clause LIKE), afin que la régression soit détectée
// localement sans dépendre d'un accès réseau à D1.
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

const D1_REAL_LIKE_BYTE_LIMIT = 50; // confirmé empiriquement contre le vrai Cloudflare D1, cf. en-tête.
const byteLen = (s) => new TextEncoder().encode(s).length;

// ── 1. Unité : d1BoundedLikePattern / d1SearchLikeParam / d1SearchLikePrefixParam ──
// Extraites et exécutées TEXTUELLEMENT (jamais réimplémentées) : aucune frontière à mocker ici,
// ce sont des fonctions pures de construction de chaîne.
const helpersCode = extract('const D1_LIKE_HARD_BYTE_LIMIT', 'async function handleD1Query(');
const helpersCtx = vm.createContext({ TextEncoder, __name() {} });
vm.runInContext(helpersCode, helpersCtx);
const { d1SearchLikeParam, d1SearchLikePrefixParam } = helpersCtx;

(function unitTests() {
  const cases = [
    'comment identifier les différents modes chez un patient en thérapie', // le cas réel signalé
    'a'.repeat(10000),
    '%'.repeat(500),
    '_'.repeat(500),
    '\\'.repeat(500),
    'é'.repeat(1000), // multi-octet UTF-8 partout
    '%_\\%_\\'.repeat(200), // mélange adversarial jokers + échappements
    '',
    'court',
    'Développer une compréhension approfondie des mécanismes de régulation émotionnelle chez les patients présentant un trouble de la personnalité limite avec comorbidité anxieuse et des schémas précoces inadaptés',
  ];
  for (const c of cases) {
    const like = d1SearchLikeParam(c);
    const prefix = d1SearchLikePrefixParam(c);
    assert.ok(byteLen(like) <= D1_REAL_LIKE_BYTE_LIMIT,
      `d1SearchLikeParam doit TOUJOURS rester ≤ ${D1_REAL_LIKE_BYTE_LIMIT} octets (limite réelle D1), obtenu ${byteLen(like)} pour l'entrée ${JSON.stringify(c.slice(0, 30))}...`);
    assert.ok(byteLen(prefix) <= D1_REAL_LIKE_BYTE_LIMIT,
      `d1SearchLikePrefixParam doit TOUJOURS rester ≤ ${D1_REAL_LIKE_BYTE_LIMIT} octets, obtenu ${byteLen(prefix)} pour l'entrée ${JSON.stringify(c.slice(0, 30))}...`);
    // Aucune séquence UTF-8 coupée en deux : la ré-encodage doit rester une chaîne JS valide
    // (un caractère de remplacement U+FFFD apparaîtrait sinon).
    assert.ok(!like.includes('�'), `motif LIKE corrompu (séquence UTF-8 coupée) pour ${JSON.stringify(c.slice(0, 30))}`);
    assert.ok(!prefix.includes('�'), `motif PREFIX corrompu (séquence UTF-8 coupée) pour ${JSON.stringify(c.slice(0, 30))}`);
  }
  // Motif vide reste un motif LIKE valide et minimal ("%%" / "%").
  assert.equal(d1SearchLikeParam(''), '%%');
  assert.equal(d1SearchLikePrefixParam(''), '%');
  console.log(`PASS 1/4 — d1SearchLikeParam/d1SearchLikePrefixParam : motif TOUJOURS ≤ ${D1_REAL_LIKE_BYTE_LIMIT} octets (limite réelle D1 confirmée empiriquement), quelle que soit la longueur ou le contenu (ASCII, UTF-8 multi-octets, jokers, échappements, adversarial, vide) — jamais de séquence UTF-8 coupée`);
})();

// ── 2/3/4. handleLibraryFacets réel, avec un mock D1 qui reproduit FIDÈLEMENT le vrai
//      comportement Cloudflare D1 : throw "LIKE or GLOB pattern too complex: SQLITE_ERROR" pour
//      TOUT paramètre lié à une clause LIKE dépassant réellement 50 octets UTF-8. ──
const facetsCode = extract('async function handleLibraryFacets(', '__name(handleLibraryFacets, "handleLibraryFacets");') + '\n__name(handleLibraryFacets, "handleLibraryFacets");';
// d1BoundedLikePattern / d1SearchLikeParam / d1SearchLikePrefixParam doivent être visibles dans
// le même contexte que handleLibraryFacets (référencées directement par son code).
const fullCode = helpersCode + facetsCode;

function loadHandlers(code) {
  const context = vm.createContext({
    Response, Request, TextEncoder,
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

// Un LIKE ? ESCAPE '\' est identifié par position dans le SQL : le 2e paramètre lié quand la
// clause "rowid IN (... UNION SELECT rowid FROM chunks WHERE author LIKE ? ESCAPE" est présente,
// ou le seul paramètre pour "c.book_title LIKE ? ESCAPE". Reproduit fidèlement le comportement
// réel D1 confirmé par requêtes directes : SEUL le paramètre effectivement utilisé dans une
// clause LIKE est soumis à la limite — le paramètre MATCH (FTS5) n'a AUCUNE limite de ce type.
function makeRealisticD1({ chunksRows }) {
  const calls = [];
  return {
    _calls: calls,
    prepare(sql) {
      const isFacetsQuery = sql.includes('GROUP BY c.approach COLLATE NOCASE');
      return {
        bind(...args) {
          return {
            async all() {
              calls.push({ sql, args });
              if (isFacetsQuery) {
                const hasAuthorLike = sql.includes('author LIKE ? ESCAPE');
                const hasTitleLike = sql.includes('c.book_title LIKE ? ESCAPE');
                // Ordre des paramètres exactement comme construit par handleLibraryFacets :
                // [match, authorLikeParam?] puis [titleLikeParam?] en fin de liste.
                let idx = 0;
                if (sql.includes('chunks_fts MATCH ?')) idx++; // paramètre MATCH, jamais borné
                if (hasAuthorLike) {
                  const p = args[idx++];
                  if (byteLen(p) > D1_REAL_LIKE_BYTE_LIMIT) {
                    throw new Error('D1_ERROR: LIKE or GLOB pattern too complex: SQLITE_ERROR');
                  }
                }
                if (hasTitleLike) {
                  const p = args[idx++];
                  if (byteLen(p) > D1_REAL_LIKE_BYTE_LIMIT) {
                    throw new Error('D1_ERROR: LIKE or GLOB pattern too complex: SQLITE_ERROR');
                  }
                }
                // Réponse fonctionnelle minimale : ne prétend pas simuler FTS5, seulement
                // prouver que la requête S'EXÉCUTE (le point même de ce correctif).
                return { results: chunksRows };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

(async () => {
  const chunksRows = [{ approach: 'schema_therapy', language: 'en', count: 190 }, { approach: 'schema_therapy', language: 'fr', count: 1780 }];

  // ── 2. Cas réel reproduit et résolu : la phrase française exacte rapportée ce soir. ──
  {
    const env = { DB: makeRealisticD1({ chunksRows }) };
    const ctx = loadHandlers(fullCode);
    const resp = await ctx.handleLibraryFacets(req({ query: 'comment identifier les différents modes chez un patient en thérapie' }), env);
    assert.equal(resp.status, 200, `ÉCHEC : la phrase française réelle de dix mots doit maintenant réussir (200), obtenu ${resp.status} — ${JSON.stringify(await resp.clone().json().catch(() => null))}`);
    const data = await resp.json();
    assert.ok(data.facets, 'la réponse doit contenir des facettes réelles, pas une erreur masquée');
    console.log('PASS 2/4 — cas réel reproduit et résolu : la phrase française exacte rapportée ce soir ("comment identifier les différents modes...") ne déclenche plus "LIKE or GLOB pattern too complex" — preuve concrète contre un mock reproduisant fidèlement le vrai comportement D1 (50 octets)');
  }

  // ── 3. "Quelle que soit sa longueur" : phrases de longueur croissante jusqu'à très longue,
  //      avec caractères accentués, aucune ne doit jamais échouer. ──
  {
    const longPhrases = [
      'court',
      'une phrase de longueur moyenne sur la thérapie',
      'comment identifier les différents modes thérapeutiques utilisés chez un patient présentant un trouble de la personnalité limite avec comorbidité anxieuse',
      'Développer '.repeat(50) + 'une compréhension approfondie des mécanismes émotionnels sous-jacents à la régulation affective chez les patients en thérapie des schémas avec des modes précoces inadaptés persistants malgré un travail thérapeutique prolongé',
    ];
    for (const phrase of longPhrases) {
      const env = { DB: makeRealisticD1({ chunksRows }) };
      const ctx = loadHandlers(fullCode);
      const resp = await ctx.handleLibraryFacets(req({ query: phrase.slice(0, 1000) }), env);
      assert.equal(resp.status, 200, `ÉCHEC pour une phrase de ${phrase.length} caractères : ${JSON.stringify(await resp.clone().json().catch(() => null))}`);
    }
    console.log('PASS 3/4 — "jamais d\'erreur quelle que soit sa longueur" vérifié sur 4 longueurs croissantes (court à ~1000 caractères, avec accents) — toutes réussissent (200)');
  }

  // ── 4. book_title long (clause LIKE prefix distincte) + contrôle négatif : le mock reproduit
  //      bien fidèlement l'échec réel pour un motif VOLONTAIREMENT non borné (preuve que le
  //      test détecterait une régression, pas seulement qu'il passe toujours). ──
  {
    const env = { DB: makeRealisticD1({ chunksRows }) };
    const ctx = loadHandlers(fullCode);
    const longTitle = 'Un titre de livre extrêmement long qui dépasse très largement toute limite raisonnable pour un titre réel de publication';
    const resp = await ctx.handleLibraryFacets(req({ query: 'trauma', book_title: longTitle }), env);
    assert.equal(resp.status, 200, 'un book_title long ne doit plus jamais déclencher "LIKE or GLOB pattern too complex" non plus (même clause corrigée)');

    // Contrôle négatif : le mock DOIT rejeter un motif non borné — sinon ce test ne prouverait
    // rien. On le vérifie directement en appelant le mock avec un motif brut non échappé/borné,
    // exactement comme le faisait l'ANCIEN code avant ce correctif.
    const controlEnv = { DB: makeRealisticD1({ chunksRows }) };
    const rawUnboundedPattern = '%' + 'comment identifier les différents modes chez un patient en thérapie'.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    let threw = false;
    try {
      await controlEnv.DB.prepare('SELECT c.approach, c.language, COUNT(*) AS count FROM chunks c WHERE c.rowid IN (SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ? UNION SELECT rowid FROM chunks WHERE author LIKE ? ESCAPE \'\\\') GROUP BY c.approach COLLATE NOCASE, c.language COLLATE NOCASE')
        .bind('"comment" OR "identifier"', rawUnboundedPattern).all();
    } catch (e) {
      threw = e.message.includes('LIKE or GLOB pattern too complex');
    }
    assert.ok(threw, 'CONTRÔLE NÉGATIF : le mock doit reproduire fidèlement l\'échec réel pour un motif non borné (comme l\'ancien code) — sinon ce test ne prouverait rien sur le vrai correctif');
    console.log('PASS 4/4 — book_title long également corrigé, ET contrôle négatif confirmé : le mock rejette bien un motif construit à l\'ANCIENNE manière (non borné), prouvant que ce test détecterait une régression future');
  }

  console.log('\nTOUS LES TESTS CORRECTIF LIKE-PATTERN /library-facets PASSENT (4/4)');
})().catch((e) => {
  console.error('ÉCHEC:', e);
  process.exitCode = 1;
});
