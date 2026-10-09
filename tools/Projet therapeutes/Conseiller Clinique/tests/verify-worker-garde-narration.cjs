// LA ROUTE QU'EMPLOIE LE LOT 1b EST-ELLE DÉJÀ PROTÉGÉE ? — éprouvé hors ligne.
//
// Ce lot n'ajoute AUCUNE route au Worker : la rédaction passe par le proxy racine, celui que la
// génération structurée (« appel 2 ») emploie déjà. Encore faut-il le prouver plutôt que de le
// supposer. Ce test découpe la garde du Worker dans Worker/index.js, l'exécute dans un bac à
// sable Node, et lui soumet des requêtes. Aucun appel réseau, aucun secret, rien écrit dans
// Worker/.
//
//   node tests/verify-worker-garde-narration.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const INDEX = path.join(__dirname, '..', '..', '..', '..', 'Worker', 'index.js');
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

function decouper(src, signature) {
  const debut = src.indexOf(signature);
  assert.notEqual(debut, -1, 'introuvable dans Worker/index.js : ' + signature);
  let i = src.indexOf('{', debut), p = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') p++;
    else if (src[j] === '}') { p--; if (p === 0) return src.slice(debut, j + 1); }
  }
  throw new Error('fonction non refermée : ' + signature);
}

(async () => {
  assert.ok(fs.existsSync(INDEX), 'Worker/index.js introuvable');
  const src = fs.readFileSync(INDEX, 'utf8');

  // ── 1. L'origine autorisée est unique et figée ────────────────────────────────────────────
  const origine = src.match(/var ADOC_ALLOWED_ORIGIN = "([^"]+)";/);
  assert.ok(origine, 'ADOC_ALLOWED_ORIGIN introuvable');
  assert.equal(origine[1], 'https://c-concept-dev.github.io');
  const cors = src.match(/"Access-Control-Allow-Origin": ADOC_ALLOWED_ORIGIN/);
  assert.ok(cors, 'l\'en-tête CORS doit employer cette constante, jamais une valeur libre');
  assert.equal(/"Access-Control-Allow-Origin": "\*"/.test(src), false,
    'aucune origine « * » ne doit exister dans le Worker');
  pass('origine autorisée unique et figée : ' + origine[1] + ', jamais « * ».');

  // ── 2. La route du lot 1b n'est PAS publique ──────────────────────────────────────────────
  const publiques = src.match(/var ADOC_PUBLIC_ROUTES = (\[[^\]]*\]);/);
  assert.ok(publiques, 'ADOC_PUBLIC_ROUTES introuvable');
  const bac = { __name: function () {} };
  vm.createContext(bac);
  vm.runInContext('var ADOC_PUBLIC_ROUTES = ' + publiques[1] + ';\n'
    + decouper(src, 'function adocIsPublicRoute('), bac);
  const estPublique = (p) => vm.runInContext('adocIsPublicRoute(' + JSON.stringify(p) + ', "POST")', bac);
  assert.equal(estPublique('/'), false,
    'la racine — la route qu\'emploie la rédaction — ne doit PAS être publique');
  // Le témoin : les routes réellement publiques le sont, sinon ce contrôle ne prouve rien.
  assert.equal(estPublique('/library-stats'), true, 'témoin : /library-stats est publique');
  assert.equal(estPublique('/get-file/abc'), true, 'témoin : /get-file/ est publique');
  pass('la racine n\'est pas publique (liste : ' + JSON.parse(publiques[1]).join(', ') + ').');

  // ── 3. LA GARDE : clé exigée, fail-closed, et le débit ────────────────────────────────────
  // On rejoue la garde telle qu'elle est écrite, avec les quatre cas qui comptent.
  const garde = src.match(/if \(!adocIsPublicRoute\(p, request2\.method\)\) \{[\s\S]*?\n    \}/);
  assert.ok(garde, 'garde générique introuvable');
  const texteGarde = garde[0];
  assert.match(texteGarde, /if \(!env2\.WORKER_API_KEY \|\| k !== env2\.WORKER_API_KEY\)/,
    'la garde doit refuser quand la clé serveur est absente (fail closed) ET quand elle diffère');
  assert.match(texteGarde, /status:401/, 'et rendre 401');
  assert.match(texteGarde, /adocCheckRateLimit\(env2, ip\)/, 'puis appliquer le débit');
  assert.match(texteGarde, /status:429/, 'avec un 429 au-delà');

  const resultats = [];
  const simuler = (cleServeur, cleFournie) => {
    // Le MÊME test que le Worker, rejoué tel quel.
    if (!cleServeur || cleFournie !== cleServeur) return 401;
    return 200;
  };
  resultats.push(['aucune clé fournie', simuler('secrete', null)]);
  resultats.push(['clé fournie fausse', simuler('secrete', 'mauvaise')]);
  resultats.push(['clé serveur absente (fail closed)', simuler(null, 'peu importe')]);
  resultats.push(['clé correcte', simuler('secrete', 'secrete')]);
  assert.deepEqual(resultats.map((r) => r[1]), [401, 401, 401, 200],
    'quatre cas : ' + JSON.stringify(resultats));
  pass('clé exigée : 401 sans clé, 401 avec une fausse, 401 si la clé serveur manque, 200 sinon.');

  // ── 4. LE DÉBIT, exécuté pour de vrai sur un KV simulé ────────────────────────────────────
  const limites = {
    fenetre: Number((src.match(/var ADOC_RATE_LIMIT_WINDOW_S = (\d+)/) || [])[1]),
    max: Number((src.match(/var ADOC_RATE_LIMIT_MAX = (\d+)/) || [])[1]),
  };
  assert.ok(limites.max > 0 && limites.fenetre > 0, 'limites introuvables : ' + JSON.stringify(limites));
  const bac2 = { __name: function () {}, Date: Date, Promise: Promise, parseInt: parseInt };
  vm.createContext(bac2);
  vm.runInContext('var ADOC_RATE_LIMIT_WINDOW_S = ' + limites.fenetre + ';\n'
    + 'var ADOC_RATE_LIMIT_MAX = ' + limites.max + ';\n'
    + decouper(src, 'async function adocCheckRateLimit('), bac2);
  bac2.store = new Map();
  bac2.env = { CLONE_KV: {
    get: async (k) => (bac2.store.has(k) ? bac2.store.get(k) : null),
    put: async (k, v) => { bac2.store.set(k, v); },
  } };
  const appeler = (ip) => vm.runInContext('adocCheckRateLimit(env, ' + JSON.stringify(ip) + ')', bac2);
  let acceptes = 0;
  for (let i = 0; i < limites.max + 5; i++) { if (await appeler('1.2.3.4')) acceptes++; }
  assert.equal(acceptes, limites.max,
    'le débit doit couper à ' + limites.max + ' : ' + acceptes + ' acceptés');
  // Une autre IP n'est pas affectée — sinon la limite serait globale, ce qui n'est pas la règle.
  assert.equal(await appeler('5.6.7.8'), true, 'une autre IP doit passer');
  // Et un KV indisponible ne bloque pas l'outil : c'est écrit ainsi, on le vérifie.
  bac2.env2sansKV = { CLONE_KV: null };
  assert.equal(await vm.runInContext('adocCheckRateLimit(env2sansKV, "1.2.3.4")', bac2), true,
    'un KV indisponible ne doit jamais bloquer');
  pass('débit exécuté : ' + limites.max + ' requêtes par ' + limites.fenetre
    + ' s et par IP, par IP et non globalement, jamais bloquant si le KV est absent.');

  // ── 5. AUCUN SECRET DANS LES JOURNAUX ─────────────────────────────────────────────────────
  const proxy = decouper(src, 'async function handleAnthropicProxy(');
  const journaux = proxy.match(/console\.log\([^;]*\)/g) || [];
  assert.ok(journaux.length > 0, 'le proxy doit journaliser quelque chose');
  journaux.forEach((l) => {
    ['ANTHROPIC_API_KEY', 'WORKER_API_KEY', 'x-api-key', 'X-API-Key', 'payload', 'messages',
     'system'].forEach((interdit) => {
      assert.equal(l.indexOf(interdit), -1,
        'un journal ne doit jamais porter « ' + interdit + ' » : ' + l.slice(0, 120));
    });
  });
  // Le corps envoyé n'est pas journalisé non plus.
  assert.equal(/console\.log\([^;]*JSON\.stringify\(ab\)/.test(proxy), false,
    'le corps de la requête ne doit jamais partir dans un journal');
  pass(journaux.length + ' journal(aux) dans le proxy : identifiant de requête et statut seulement, '
    + 'ni clé, ni prompt, ni message.');

  // ── 6. CE LOT N'AJOUTE AUCUNE ROUTE ───────────────────────────────────────────────────────
  // La preuve par le dépôt : rien n'a changé dans Worker/ sur cette branche.
  const { execFileSync } = require('node:child_process');
  const racine = path.join(__dirname, '..', '..', '..', '..');
  const modifies = execFileSync('git', ['diff', '--name-only', 'origin/main...HEAD', '--', 'Worker/'],
    { cwd: racine, encoding: 'utf8' }).trim();
  assert.equal(modifies, '',
    'le lot 1b ne doit modifier AUCUN fichier de Worker/ — sinon un déploiement serait déclenché '
    + 'à la fusion. Fichiers touchés : ' + modifies);
  pass('aucun fichier de Worker/ modifié par ce lot : aucun déploiement ne sera déclenché.');

  console.log('\nPASS verify-worker-garde-narration — ' + n + '/' + n + '.');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
