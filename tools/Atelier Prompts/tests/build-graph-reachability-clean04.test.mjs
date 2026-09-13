/* CLEAN-04 — LE GRAPHE DE BUILD, ET CE QU'IL EMBARQUE VRAIMENT.
 * ============================================================================
 *
 * CLEAN-03 avait signalé un fait sans le fermer : le runtime navigateur embarque
 * neuf modules qui n'ont AUCUN consommateur frontend direct, dont tout le
 * sous-graphe d'orchestration écrit pour le worker. Ce lot répond à la seule
 * question qui restait : sont-ils morts, ou simplement indirects ?
 *
 * LA RÉPONSE EST MESURÉE, ET ELLE INTERDIT DE LES RETIRER. Les neuf sont
 * atteints par fermeture transitive depuis deux entrées bien vivantes :
 *
 *   ADN, LOCKS, ROUTING          ← ADAPTERS, qui construit les enveloppes ADN
 *   ORCORE, ORORCH, ORSTATE,     ← MANUAL, le round-trip OPRIE par collage —
 *   DECISIONCORE, ROLEDEG,         le parcours Architecte SANS CLÉ, celui qui
 *   PROVIDERHA                     existe justement pour ne dépendre d'aucun
 *                                  fournisseur.
 *
 * Autrement dit : le sous-graphe « worker » est ce qui permet à quelqu'un sans
 * clé API de faire tourner un tour OPRIE à la main. L'appeler code mort aurait
 * été une erreur de lecture — et l'élaguer aurait cassé le seul chemin qui
 * fonctionne hors ligne.
 *
 * CE QUI A ÉTÉ RETIRÉ, PARCE QUE VRAIMENT MORT : un symbole importé et jamais
 * utilisé, et deux constantes exportées que personne ne lit — ni le produit, ni
 * un autre module, ni un test, ni le banc, ni la façade publique du paquet.
 * Trois lignes. C'est tout ce que ce graphe contenait de mort, et le dire
 * précisément vaut mieux que d'annoncer un grand nettoyage.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  ARCHITECTE_TURN_OUTCOMES, buildPortableRolePrompt, createManualRoleExecutor,
  createProviderRoleExecutor, runOprieTurnWithExecutor
} from '../core/adn/oprie-manual-roundtrip.js';
import {
  analystOutputFixture, arbiterOutputFixture, criticOutputFixture, runPastedOprieTurn
} from './offline-oprie-roundtrip-b0.helper.mjs';
import { html } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = fs.readFileSync(path.join(root, 'tools/build-adn-browser-runtime.mjs'), 'utf8');
const BUNDLE = fs.readFileSync(path.join(root, 'core/adn/browser-runtime.generated.js'), 'utf8');
const FRONTEND = (() => { const i = html.indexOf('/* GENERATED'); const j = html.indexOf('})(window);', i); return html.slice(0, i) + html.slice(j); })();
const FRONT_CODE = FRONTEND.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Le manifeste de build, lu tel qu'il est — une seule source, évaluée. */
const MODULES = (() => {
  const a = BUILD.indexOf('const modules'); const b = BUILD.indexOf('\n];', a);
  // eslint-disable-next-line no-eval
  return eval(BUILD.slice(BUILD.indexOf('[', a), b + 2));
})();
const PAR_NOM = Object.fromEntries(MODULES.map((m) => [m.name, m]));
const source = (m) => fs.readFileSync(path.join(root, m.dir || 'core/adn', m.file), 'utf8');
const mot = (n) => new RegExp(`\\b${n.replace(/[$]/g, '\\$')}\\b`);

/** Les modules dont au moins un export est nommé par le frontend écrit à la main. */
const DIRECTS = new Set(MODULES.filter((m) => m.exports.some((e) => mot(e).test(FRONT_CODE))).map((m) => m.name));
/** Fermeture transitive du graphe déclaré. */
const ATTEINTS = (() => {
  const vus = new Set(DIRECTS);
  for (let bouge = true; bouge;) {
    bouge = false;
    for (const n of [...vus]) for (const d of PAR_NOM[n].deps || []) if (!vus.has(d)) { vus.add(d); bouge = true; }
  }
  return vus;
})();

// =================================================================================================
// §53 — LE GRAPHE
// =================================================================================================

test('T-CLEAN04-01 : chaque module embarqué est atteignable depuis un chemin produit', () => {
  const inatteignables = MODULES.filter((m) => !ATTEINTS.has(m.name)).map((m) => m.name);
  assert.deepEqual(inatteignables, [], 'aucun module n’est embarqué sans raison.');
  assert.equal(MODULES.length, 21, 'le graphe compte vingt-et-un modules.');
  /* OPRIE-MATERIAL-CONTENT-02 — DECISIONCORE EST PASSÉ D'INDIRECT À DIRECT, et c'est
     voulu : l'enveloppe navigateur lit maintenant TRANSPORT_LIMITS depuis le runtime
     plutôt que de recopier la limite en dur. Le graphe enregistre ce lien nouveau,
     et c'est précisément ce qu'on voulait qu'il enregistre. */
  assert.equal(DIRECTS.size, 13, 'treize ont un consommateur frontend direct…');
  assert.equal(ATTEINTS.size - DIRECTS.size, 8, '…et huit sont atteints indirectement.');
});

test('T-CLEAN04-02/04 : les neuf modules indirects ont chacun une chaîne nommée', () => {
  /* Ne pas confondre « sans consommateur direct » et « mort » : voici la chaîne. */
  const attendu = {
    ADN: ['ADAPTERS'], LOCKS: ['ADAPTERS'], ROUTING: ['ADAPTERS'],
    /* OPRIE-MATERIAL-CONTENT-02 — DECISIONCORE a QUITTÉ cette liste : l enveloppe
       navigateur lit désormais TRANSPORT_LIMITS depuis le runtime, ce qui lui donne
       un consommateur frontend direct. Il n est plus atteint indirectement. */
    ORSTATE: ['ORCORE', 'ORORCH'],
    PROVIDERHA: ['ROLEDEG'], ORCORE: ['ROLEDEG', 'ORORCH', 'MANUAL'],
    ROLEDEG: ['ORORCH'], ORORCH: ['MANUAL']
  };
  const indirects = MODULES.filter((m) => ATTEINTS.has(m.name) && !DIRECTS.has(m.name)).map((m) => m.name);
  assert.deepEqual(indirects.sort(), Object.keys(attendu).sort());
  for (const [module, via] of Object.entries(attendu)) {
    const porteurs = MODULES.filter((m) => (m.deps || []).includes(module) && ATTEINTS.has(m.name)).map((m) => m.name);
    assert.deepEqual(porteurs.sort(), [...via].sort(), `${module} est requis par ${via.join(', ')}`);
  }
  /* Les deux racines de ces chaînes sont bien consommées par le produit. */
  for (const racine of ['ADAPTERS', 'MANUAL']) assert.ok(DIRECTS.has(racine), `${racine} est consommé directement.`);
});

test('T-CLEAN04-03 : le round-trip manuel possède un ensemble de modules explicite', () => {
  /* C'est le parcours Architecte SANS CLÉ. Il ne dépend d'aucun fournisseur, et
     c'est précisément pour cela qu'il embarque l'orchestrateur côté navigateur. */
  const requis = new Set(['MANUAL']);
  for (let bouge = true; bouge;) {
    bouge = false;
    for (const n of [...requis]) for (const d of PAR_NOM[n].deps || []) if (!requis.has(d)) { requis.add(d); bouge = true; }
  }
  assert.deepEqual([...requis].sort(),
    ['ARCHENRICH', 'CANON', 'DECISIONCORE', 'MANUAL', 'ORCORE', 'ORORCH', 'ORSTATE', 'PROVIDERHA', 'ROLEDEG'].sort());
  /* Et le frontend appelle bien ce module — sinon la chaîne entière serait morte. */
  for (const entree of ['startManualOprieTurn', 'runOprieTurnWithExecutor',
                        'createProviderRoleExecutor', 'buildArchitecteContractFromTurn']) {
    assert.ok(FRONT_CODE.includes(entree), `${entree} est appelé par le produit.`);
  }
});

test('T-CLEAN04-05 : un seul graphe de build, et il ne diverge pas des imports réels', () => {
  /* Le manifeste déclare des dépendances À LA MAIN. Si elles divergeaient des
     `import` réels, il existerait deux graphes — et l'un des deux mentirait. */
  for (const m of MODULES) {
    const src = source(m);
    const reels = [...new Set([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)]
      .map((x) => x[1].split('/').pop())
      .map((f) => (MODULES.find((o) => o.file === f) || {}).name)
      .filter(Boolean))].sort();
    assert.deepEqual([...(m.deps || [])].sort(), reels, `${m.name} : deps déclarées = imports réels`);
  }
  /* Et il n'existe qu'une seule liste de modules dans tout le dépôt. */
  assert.equal((BUILD.match(/const modules\s*=\s*\[/g) || []).length, 1);
  /* HTML-FINAL-02 — le répertoire d'outils accueille un troisième programme, et
     c'est volontaire : build-release-manifest.mjs ne participe pas au graphe de
     build, il le CONSTATE. Il ne compile rien, ne réinjecte rien, n'écrit dans
     aucune source ; il lit l'inventaire et produit un document. L'invariant que
     ce test défend — un seul graphe de build, une seule liste de modules — reste
     entier, et on le vérifie ici plutôt que de se contenter d'élargir la liste. */
  const outils = fs.readdirSync(path.join(root, 'tools'));
  assert.deepEqual(outils.sort(), ['build-adn-browser-runtime.mjs', 'build-release-manifest.mjs',
    'frozen-guard.mjs']);
  const manifeste = fs.readFileSync(path.join(root, 'tools/build-release-manifest.mjs'), 'utf8');
  assert.equal(/const modules\s*=\s*\[/.test(manifeste), false,
    'le générateur de manifeste ne tient aucune seconde liste de modules.');
  const ecritures = [...manifeste.matchAll(/writeFileSync\(path\.join\(racine, ([A-Z_]+)\)/g)].map((m) => m[1]);
  assert.deepEqual(ecritures, ['MANIFESTE'], 'il n’écrit que le manifeste, nulle part ailleurs.');
});

// =================================================================================================
// §54 — IMPORTS, EXPORTS, DOUBLONS
// =================================================================================================

test('T-CLEAN04-06 : aucun symbole importé sans être utilisé', () => {
  const morts = [];
  for (const m of MODULES) {
    const src = source(m);
    const corps = src.replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?/g, '');
    for (const im of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
      for (const brut of im[1].split(',').map((x) => x.trim()).filter(Boolean)) {
        const nom = brut.split(' as ').pop().trim();
        if (!mot(nom).test(corps)) morts.push(`${m.name}.${nom}`);
      }
    }
  }
  assert.deepEqual(morts, [], 'aucun import mort.');
});

test('T-CLEAN04-07 : aucun export sans consommateur, hors façade publique caractérisée', () => {
  const tests = fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.mjs'))
    .map((f) => fs.readFileSync(path.join(root, 'tests', f), 'utf8')).join('\n');
  const barrel = fs.readFileSync(path.join(root, 'core/adn/index.js'), 'utf8');
  const modulesSrc = MODULES.map(source).join('\n');
  const morts = [];
  for (const m of MODULES) {
    for (const e of m.exports) {
      const r = mot(e);
      const ailleurs = (modulesSrc.match(new RegExp(r.source, 'g')) || []).length > 1;
      if (!r.test(FRONT_CODE) && !ailleurs && !r.test(tests) && !r.test(barrel)) morts.push(`${m.name}.${e}`);
    }
  }
  assert.deepEqual(morts, [], 'aucun export mort non justifié.');
  /* Deux constantes du vocabulaire ADN ne sont lues que par la façade publique
     du paquet : elles ne sont pas mortes, elles sont l'API. */
  for (const api of ['ADN_PROPERTY_IDS', 'ADN_TECHNIQUE_IDS']) {
    assert.ok(barrel.includes(api), `${api} est exposé par core/adn/index.js`);
    assert.equal(FRONT_CODE.includes(api), false, `${api} n’est pas utilisé par le produit…`);
  }
  /* Et les trois morts réels de ce lot ne sont pas revenus. */
  for (const parti of ['FONDEMENT_NATURES', 'MANUAL_ROUNDTRIP_VERSION']) {
    assert.equal(BUNDLE.includes(parti), false, `${parti} ne revient pas dans le bundle.`);
    assert.equal(BUILD.includes(parti), false, `${parti} ne revient pas dans le manifeste.`);
  }
  assert.equal(fs.readFileSync(path.join(root, 'workers/shared/operational-request-core.js'), 'utf8')
    .includes('CANDIDATE_LIST_FIELDS'), false, 'l’import mort ne revient pas.');
});

test('T-CLEAN04-08 : aucun module concaténé deux fois', () => {
  for (const m of MODULES) {
    assert.equal((BUNDLE.match(new RegExp(`const ${m.name}=\\(`, 'g')) || []).length, 1,
      `${m.name} n’est présent qu’une fois.`);
  }
  /* Un seul agrégat, et il étale exactement les vingt-et-un modules. */
  const agg = BUNDLE.match(/__ATELIER_ADN_RUNTIME__=Object\.freeze\(\{([^}]*)\}\)/);
  assert.ok(agg);
  assert.equal(agg[1].split(',').filter((x) => x.trim().startsWith('...')).length, MODULES.length);
});

test('T-CLEAN04-09 : chaque export global du runtime appartient à un module du manifeste', () => {
  const contexte = { window: {}, console };
  vm.createContext(contexte);
  vm.runInContext(BUNDLE, contexte, { timeout: 2000 });
  const runtime = contexte.window.__ATELIER_ADN_RUNTIME__;
  assert.ok(runtime);
  const declares = new Set(MODULES.flatMap((m) => m.exports));
  const exposes = Object.keys(runtime).filter((k) => k !== 'source_sha256');
  const intrus = exposes.filter((k) => !declares.has(k));
  assert.deepEqual(intrus, [], 'aucun symbole exposé hors manifeste.');
  const absents = [...declares].filter((k) => !exposes.includes(k));
  assert.deepEqual(absents, [], 'et chaque export déclaré est réellement exposé.');
});

// =================================================================================================
// §55 — OUTILS, TESTS, BUILD
// =================================================================================================

test('T-CLEAN04-10/11/12 : aucun outil orphelin, aucun module de test ou de build embarqué', () => {
  for (const f of fs.readdirSync(path.join(root, 'tools'))) {
    const src = fs.readFileSync(path.join(root, 'tools', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const noms = [...new Set([...src.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]))];
    const orphelines = noms.filter((n) => (src.match(new RegExp(`\\b${n}\\b`, 'g')) || []).length <= 1);
    assert.deepEqual(orphelines, [], `${f} : aucune fonction orpheline.`);
  }
  /* Aucun fichier de tests ni d'outil n'entre dans le bundle. */
  for (const m of MODULES) {
    assert.doesNotMatch(m.file, /\.test\.|helper|harness|fixture/, `${m.file} n’est pas un module de test.`);
    assert.ok(['core/adn', 'workers/shared'].includes(m.dir || 'core/adn'), `${m.file} vient d’un dossier de production.`);
  }
  /* La mesure porte sur le CODE : des commentaires de conception PARLENT de tests et
     de fixtures, ce qui est de la documentation, pas du code de test embarqué. */
  const bundleCode = BUNDLE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const interdit of ['/tests/', 'harness', 'fixture', 'assert.', 'node:test', 'node:assert']) {
    assert.equal(bundleCode.includes(interdit), false, `${interdit} n’entre pas dans le runtime.`);
  }
  /* `describe(` existe bien dans le bundle — c'est une MÉTHODE du cycle d'exécution,
     pas un cadre de test. Nommer la différence vaut mieux qu'une mesure qui se trompe. */
  assert.doesNotMatch(bundleCode, /\bdescribe\s*\(\s*['"`]/, 'aucun bloc de test embarqué.');
  assert.match(bundleCode, /describe\(executionId\)/, 'la méthode du cycle, elle, est bien là.');
});

// =================================================================================================
// §56 — LE ROUND-TRIP, EXERCÉ POUR DE VRAI
// =================================================================================================

test('T-CLEAN04-13/14 : le round-trip manuel — Architecte sans clé — fonctionne toujours', async () => {
  /* C'est ce parcours qui rend le sous-graphe worker nécessaire. On l'exécute
     entièrement : trois rôles, collés à la main, aucun fournisseur appelé. */
  const colles = {
    analyst: JSON.stringify(analystOutputFixture()),
    critic: JSON.stringify(criticOutputFixture()),
    arbiter: JSON.stringify(arbiterOutputFixture('operational_request_ready'))
  };
  const prompts = [];
  const { turn, seen, sequence } = await runPastedOprieTurn(
    { original_request: 'Rédige une note de cadrage.' }, colles,
    { onPrompt: (role, prompt) => prompts.push([role, prompt.length]) }
  );
  assert.equal(turn.state, 'operational_request_ready', 'le tour aboutit, sans aucun réseau.');
  assert.deepEqual(seen, sequence, 'les trois rôles sont passés à la main, dans l’ordre du serveur.');
  assert.equal(prompts.length, 3, 'et chaque rôle a produit son prompt portable.');
  for (const [, taille] of prompts) assert.ok(taille > 50, 'un prompt portable réel, pas un gabarit vide.');
  /* Le prompt portable est bien celui du module embarqué, construit hors ligne. */
  const direct = buildPortableRolePrompt('analyst', { original_request: 'X', clarification_history: [] });
  assert.ok(typeof direct === 'string' && direct.length > 50);
  /* Et la session de collage expose exactement les quatre opérations attendues. */
  const session = createManualRoleExecutor({});
  assert.deepEqual(Object.keys(session).sort(), ['abort', 'complete', 'executeRole', 'snapshot', 'submit']);
  assert.equal(session.snapshot().status, 'idle');
});

test('T-CLEAN04-15 : le chemin Architecte AVEC clé passe par le même orchestrateur', async () => {
  /* Même graphe, même tour : seule l'exécution du rôle change — un fournisseur
     simulé au lieu d'un collage. Aucune branche parallèle. */
  const reponses = {
    analyst: JSON.stringify(analystOutputFixture()),
    critic: JSON.stringify(criticOutputFixture()),
    arbiter: JSON.stringify(arbiterOutputFixture('operational_request_ready'))
  };
  const appels = [];
  const executeRole = createProviderRoleExecutor(async ({ role }) => { appels.push(role); return reponses[role]; });
  const turn = await runOprieTurnWithExecutor({ original_request: 'Rédige une note de cadrage.' }, executeRole);
  assert.equal(turn.state, 'operational_request_ready');
  assert.deepEqual(appels, ['analyst', 'critic', 'arbiter'], 'la même séquence de rôles.');
  assert.ok(Object.keys(ARCHITECTE_TURN_OUTCOMES).length > 0, 'les issues du tour restent énumérées.');
  /* Le manuel et le fournisseur partagent UN exécuteur de tour, pas deux. */
  const manual = fs.readFileSync(path.join(root, 'core/adn/oprie-manual-roundtrip.js'), 'utf8');
  const corpsManual = manual.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?/g, '');
  assert.equal((corpsManual.match(/runOperationalRequestTurn\(/g) || []).length, 1,
    'un seul appel au tour, partagé par le collage et le fournisseur.');
});

// =================================================================================================
// §57 — LE CONTRAT DE BUILD
// =================================================================================================

test('T-CLEAN04-16/17/18/19 : un bloc, un manifeste, un build reproductible', () => {
  assert.equal((html.match(/\/\* GENERATED — LOT 10G\.3B\.3F\.[12]/g) || []).length, 1);
  assert.equal((html.match(/\}\)\(window\);/g) || []).length, 1);
  /* Le bloc embarqué est exactement le fichier généré, à l'octet. */
  const a = html.indexOf('/* GENERATED — LOT 10G.3B.3F');
  const embarque = html.slice(a, html.indexOf('})(window);', a)) + '})(window);\n';
  assert.equal(embarque.trim(), BUNDLE.trim());
  /* Le hash de source du bundle est celui inscrit dans le HTML. */
  const hash = BUNDLE.match(/source-sha256:\s*([a-f0-9]{64})/)[1];
  assert.match(html, new RegExp(`source-sha256: ${hash}`));
  /* Le manifeste est unique, et le build vérifie lui-même chaque export déclaré. */
  assert.equal((BUILD.match(/const modules\s*=\s*\[/g) || []).length, 1);
  assert.match(BUILD, /export déclaré mais introuvable/, 'le build refuse un export fantôme.');
  assert.match(BUILD, /dépendance \$\{dep\} non injectée/, 'et une dépendance non injectée.');
  assert.match(BUILD, /symbole importé non destructuré dans le bundle/, 'et un symbole non destructuré.');
});
