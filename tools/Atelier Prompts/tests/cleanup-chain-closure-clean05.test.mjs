/* CLEAN-05 — LA FERMETURE DE LA CHAÎNE DE NETTOYAGE.
 * ============================================================================
 *
 * Quatre lots ont retiré du code. Celui-ci n'en retire presque pas : il vérifie
 * que ce qui a été retiré l'est resté, que rien de neuf n'est apparu, et — c'est
 * l'essentiel — que les PREUVES elles-mêmes mesurent encore quelque chose.
 *
 * LE DÉFAUT QUE CE LOT A TROUVÉ, ET QUI N'ÉTAIT VISIBLE DANS AUCUN ÉCHEC. Cinq
 * tranches de test étaient ancrées sur des symboles supprimés par CLEAN-01.
 * `html.indexOf()` rend -1 pour une borne introuvable, et `slice(a, -1)` ne
 * lève rien : il rend une tranche ARBITRAIRE. Quatre de ces tests mesuraient
 * donc tout le fichier au lieu d'une fonction, et un cinquième mesurait une
 * chaîne VIDE — une assertion `doesNotMatch` sur une chaîne vide passe
 * toujours. La suite était verte, et l'une de ses preuves ne prouvait plus rien.
 *
 * C'est le risque propre à une suite qui lit son produit par tranches de texte :
 * un lot de nettoyage déplace une borne, et la preuve devient silencieusement
 * vacante. Le test d'intégrité des ancres ci-dessous ferme cette classe entière
 * de défaut pour tous les fichiers de test, présents et futurs.
 *
 * CE QUI RESTE, ET QUI EST ASSUMÉ, PAS OUBLIÉ :
 *   copierRapide       borne de fin d'une plage gelée — la retirer changerait un hash
 *   etat.prompt        case « prompt courant » de l'espace avancé, propriétaire nommé
 *   5 champs d'oprieState  trace d'observation lue par les preuves, jamais par le produit
 *   9 modules indirects    dépendances transitives du round-trip manuel hors ligne
 *   #polices-distantes     garde de confidentialité dont la cible n'existe pas dans ce
 *                          document — elle ne promet pas un effet, elle en prévient un
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadPilot, arbiterTurn, delay, html } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = fs.readFileSync(path.join(root, 'core/adn/browser-runtime.generated.js'), 'utf8');
const BUILD = fs.readFileSync(path.join(root, 'tools/build-adn-browser-runtime.mjs'), 'utf8');
const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const tranche = (d, f) => { const a = html.indexOf(d); return html.slice(a, html.indexOf(f, a + d.length)); };
const FRONTEND = (() => { const i = html.indexOf('/* GENERATED'); const j = html.indexOf('})(window);', i); return html.slice(0, i) + html.slice(j); })();
const FRONT_CODE = sansProse(FRONTEND);
const FICHIERS_TEST = fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.mjs'));

/* FORMAT-STRUCT-01 a créé un registre persistant : ces listes ne sont donc plus
   recopiées ici, elles en sont LUES. Une dette ne peut plus diverger entre deux
   fichiers, puisqu'il n'y a plus qu'un endroit qui la déclare. */
const REGISTRE_DETTES = fs.readFileSync(path.join(root, 'docs/OPEN-DEBTS.md'), 'utf8');
const DETTES_OUVERTES = Object.freeze(
  [...REGISTRE_DETTES.slice(REGISTRE_DETTES.indexOf('## Ouvertes'), REGISTRE_DETTES.indexOf('## Fermées'))
    .matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]));
const DETTES_FERMEES = Object.freeze(
  [...REGISTRE_DETTES.slice(REGISTRE_DETTES.indexOf('## Fermées'))
    .matchAll(/^\| ([A-Z][A-Z-]+-\d{2}) \|/gm)].map((m) => m[1]));

// =================================================================================================
// §54 — CE QUI A ÉTÉ RETIRÉ L'EST RESTÉ
// =================================================================================================

test('T-CLEAN05-01/02 : l’orchestration héritée et son pont d’entrées restent absents', () => {
  for (const parti of ['nextConversationAction', 'adnNextConversationAction', 'adpDecideRapide',
                       'adpRecordConversationAction', 'adpResumeAfterClarification',
                       'createConversationAuditEvent', 'CONVERSATION_ORCHESTRATOR_VERSION']) {
    assert.equal(html.includes(parti), false, `${parti} reste absent du produit.`);
    assert.equal(BUNDLE.includes(parti), false, `${parti} reste absent du bundle.`);
  }
  for (const id of ['v11-prepare', 'v11-go-rapide', 'v11-go-avance', 'v11-go-architecte', 'ui-hidden-bridge']) {
    assert.equal(html.includes(id), false, `${id} reste absent.`);
  }
  assert.equal(fs.existsSync(path.join(root, 'core/adn/conversation-orchestrator.js')), false);
});

test('T-CLEAN05-03/04 : ni flou hérité, ni repli sémantique hérité', () => {
  assert.equal(html.includes('conversationQuestionsSimilar'), false);
  assert.equal(html.includes('source: "local-prudent"'), false, 'plus aucun producteur du repli.');
  assert.equal((html.match(/source:\s*'local-prudent'/g) || []).length, 0);
  /* La garde consommatrice demeure : la valeur reste un mot légal du contrat de fil. */
  assert.match(html, /source !== 'local-prudent'/);
  /* Le seul appariement restant est le VALIDATEUR de sortie du Decision Provider :
     il refuse une question répétée, il ne promeut aucun état. */
  const validateur = sansProse(tranche('function adpQuestionsSimilaires(', 'async function askDecisionProvider('));
  assert.match(validateur, /throw new Error\('La question répète une clarification déjà posée\.'\)/);
  for (const etat of ['operational_request_ready', 'execution_ready', 'exploitable']) {
    assert.equal([...validateur.matchAll(new RegExp(`(?<![=!<>])\\b${etat}\\s*=(?![=>])`, 'g'))].length, 0);
  }
});

// =================================================================================================
// §55 — ÉTATS ET INTERFACE
// =================================================================================================

test('T-CLEAN05-05 : aucun nouvel état partagé écrit sans lecteur', () => {
  const ETATS = {
    adpState: ['pendingQuestion', 'clarifications', 'lastEnvelope', 'requestedMode', 'returnFocus'],
    oprieState: ['seq', 'controller', 'running', 'lastTurn', 'canonicalContract', 'requestedMode',
                 'fastController', 'fastInteraction', 'lastReconciliation', 'lastOrchestration',
                 'concludedTurn', 'appliedActions', 'lifecycle', 'executionId', 'telemetry'],
    state: ['docs', 'answers', 'exchangeId', 'requestName', 'responseName'],
    etat: ['prompt', 'demande', 'contrat', 'mesures', 'sourceManquante']
  };
  const muets = [];
  for (const [porteur, champs] of Object.entries(ETATS)) {
    for (const champ of champs) {
      const nom = `${porteur}\\.${champ}`;
      const w = [...FRONT_CODE.matchAll(new RegExp(`(?<![=!<>])\\b${nom}\\s*=(?![=>])`, 'g'))].length;
      const tot = [...FRONT_CODE.matchAll(new RegExp(`\\b${nom}\\b`, 'g'))].length;
      if (w > 0 && tot - w === 0) muets.push(`${porteur}.${champ}`);
    }
  }
  assert.deepEqual(muets.sort(), ['oprieState.executionId', 'oprieState.lastOrchestration',
                                  'oprieState.lastReconciliation', 'oprieState.lastTurn'],
    'les seuls muets sont la trace d’observation nommée en CLEAN-03.');
  /* Et les champs retirés par CLEAN-02 ne sont pas revenus. */
  for (const parti of ['lastProjection', 'adpState.running', 'adpState.lastAction',
                       'state.lastRequest', 'state.analysis', 'oprieState.enrichedContract']) {
    assert.equal(FRONT_CODE.includes(parti), false, `${parti} n’est pas revenu.`);
  }
});

test('T-CLEAN05-06 : aucune référence DOM active sans cible', () => {
  const nommes = new Set([
    ...[...FRONT_CODE.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]),
    ...[...FRONT_CODE.matchAll(/getElementById\('([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]),
    ...[...FRONT_CODE.matchAll(/querySelector\('#([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1])
  ]);
  assert.ok(nommes.size > 250, 'la mesure porte bien sur tout le frontend.');
  const orphelins = [...nommes].filter((id) => !html.includes(`id="${id}"`));
  /* UNE exception, et elle est caractérisée : la garde de confidentialité du mode
     sensible retire un lien de polices distantes. Ce document n'en charge AUCUNE —
     ni @font-face, ni domaine de polices. La garde ne promet donc pas un effet
     qu'elle n'a pas : elle prévient un effet qui n'existe pas. La retirer
     supprimerait un filet ; la laisser ne ment sur rien. */
  assert.deepEqual(orphelins, ['polices-distantes']);
  assert.equal(/@font-face|fonts\.googleapis|fonts\.gstatic/.test(html), false,
    'aucune police distante n’est chargée, dans aucun mode.');
  assert.match(FRONT_CODE, /const l = document\.getElementById\('polices-distantes'\);\s*if\(actif\)\{\s*if\(l\) l\.remove\(\)/,
    'et la garde est écrite défensivement : elle teste avant d’agir.');
});

test('T-CLEAN05-07/08 : aucun résidu d’interface masquée ni de sélecteur orphelin', () => {
  /* Les états masqués restants sont des ÉTATS D'INTERFACE légitimes : des étapes
     que le parcours montre et cache. Aucun n'est un pont hérité. */
  const masques = [...html.matchAll(/id="([A-Za-z0-9_-]+)"[^>]*\shidden/g)].map((m) => m[1]);
  for (const id of masques) {
    assert.match(FRONT_CODE, new RegExp(`#${id}`), `${id} est masqué ET piloté par le code.`);
  }
  assert.equal(html.includes('ui-hidden-bridge'), false, 'plus aucun pont caché.');
  /* Aucune règle CSS de l'ancienne coque sans élément ni classe dynamique. */
  const css = html.slice(0, html.indexOf('</style>'));
  const selecteurs = new Set([...css.matchAll(/\.((?:ui|v11|atelier|arch|lot4|rail)[A-Za-z0-9_-]+)\s*[,{:.\[]/g)].map((m) => m[1]));
  const orphelins = [...selecteurs].filter((c) => !html.includes(`class="${c}`) && !html.includes(` ${c}"`)
    && !html.includes(` ${c} `) && !FRONT_CODE.includes(`'${c}'`) && !FRONT_CODE.includes(`"${c}"`));
  assert.deepEqual(orphelins, [], 'aucun sélecteur orphelin.');
});

test('T-CLEAN05-09 : aucun écouteur sur une cible inexistante', () => {
  const cibles = new Set([...FRONT_CODE.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)(?:\?)?\.addEventListener/g)].map((m) => m[1]));
  assert.ok(cibles.size > 100, 'la mesure porte bien sur les écouteurs réels.');
  assert.deepEqual([...cibles].filter((id) => !html.includes(`id="${id}"`)), []);
  const classes = new Set([...FRONT_CODE.matchAll(/\$\$\('\.([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]));
  assert.deepEqual([...classes].filter((c) => !html.includes(`class="${c}`) && !html.includes(` ${c}"`) && !html.includes(` ${c} `)), []);
});

// =================================================================================================
// §56 — LE GRAPHE DE BUILD RESTE FERMÉ
// =================================================================================================

test('T-CLEAN05-10/14 : vingt-et-un modules, tous atteignables, aucun en double', () => {
  const a = BUILD.indexOf('const modules'); const b = BUILD.indexOf('\n];', a);
  // eslint-disable-next-line no-eval
  const modules = eval(BUILD.slice(BUILD.indexOf('[', a), b + 2));
  assert.equal(modules.length, 21);
  const parNom = Object.fromEntries(modules.map((m) => [m.name, m]));
  const directs = new Set(modules.filter((m) => m.exports.some((e) => new RegExp(`\\b${e}\\b`).test(FRONT_CODE))).map((m) => m.name));
  const atteints = new Set(directs);
  for (let bouge = true; bouge;) {
    bouge = false;
    for (const n of [...atteints]) for (const d of parNom[n].deps || []) if (!atteints.has(d)) { atteints.add(d); bouge = true; }
  }
  assert.deepEqual(modules.filter((m) => !atteints.has(m.name)).map((m) => m.name), []);
  for (const m of modules) assert.equal((BUNDLE.match(new RegExp(`const ${m.name}=\\(`, 'g')) || []).length, 1);
});

test('T-CLEAN05-11/12/13 : ni import mort, ni export mort, ni symbole exposé hors manifeste', () => {
  const a = BUILD.indexOf('const modules'); const b = BUILD.indexOf('\n];', a);
  // eslint-disable-next-line no-eval
  const modules = eval(BUILD.slice(BUILD.indexOf('[', a), b + 2));
  const morts = [];
  for (const m of modules) {
    const src = fs.readFileSync(path.join(root, m.dir || 'core/adn', m.file), 'utf8');
    const corps = src.replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?/g, '');
    for (const im of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g)) {
      for (const brut of im[1].split(',').map((x) => x.trim()).filter(Boolean)) {
        const nom = brut.split(' as ').pop().trim();
        if (!new RegExp(`\\b${nom}\\b`).test(corps)) morts.push(`${m.name}.${nom}`);
      }
    }
  }
  assert.deepEqual(morts, [], 'aucun import mort.');
  const contexte = { window: {}, console }; vm.createContext(contexte);
  vm.runInContext(BUNDLE, contexte, { timeout: 2000 });
  const declares = new Set(modules.flatMap((m) => m.exports));
  const exposes = Object.keys(contexte.window.__ATELIER_ADN_RUNTIME__).filter((k) => k !== 'source_sha256');
  assert.deepEqual(exposes.filter((k) => !declares.has(k)), [], 'rien d’exposé hors manifeste.');
  assert.deepEqual([...declares].filter((k) => !exposes.includes(k)), [], 'et tout le manifeste est exposé.');
  for (const parti of ['FONDEMENT_NATURES', 'MANUAL_ROUNDTRIP_VERSION']) {
    assert.equal(BUNDLE.includes(parti), false, `${parti} n’est pas revenu.`);
  }
});

// =================================================================================================
// §57 — L'OBSERVATION RESTE UNE OBSERVATION
// =================================================================================================

test('T-CLEAN05-15/16 : la trace ne décide rien, et ne grandit pas sans fin', () => {
  const decisionnels = [
    tranche('function oprieDriveOrchestration(', 'function oprieApplyTurn('),
    tranche('function oprieEnterExecution(', 'function oprieDecideOrchestration'),
    tranche('function adpRunRapide(', 'async function v11StartRapide'),
    tranche('function adpEnterArchitecte(', 'function adpRunRapide(')
  ].map(sansProse).join('\n');
  for (const champ of ['lastTurn', 'lastReconciliation', 'lastOrchestration', 'executionId', 'telemetry']) {
    assert.equal(decisionnels.includes(`oprieState.${champ}`), false,
      `aucune décision ne lit oprieState.${champ}.`);
  }
  assert.match(sansProse(tranche('function oprieMark(', 'function oprieFastRuntime')),
    /while\(marks\.length>OPRIE_TELEMETRY_MAX\)marks\.shift\(\)/);
  assert.match(FRONT_CODE, /while\(oprieState\.appliedActions\.length>ORCHESTRATION_APPLIED_MAX\)/);
});

// =================================================================================================
// §58 — LES DETTES
// =================================================================================================

test('T-CLEAN05-17 : aucun marqueur de travail inachevé dans le produit', () => {
  const production = [html, BUILD,
    ...fs.readdirSync(path.join(root, 'core/adn')).filter((f) => f.endsWith('.js') && !f.includes('generated'))
      .map((f) => fs.readFileSync(path.join(root, 'core/adn', f), 'utf8')),
    ...fs.readdirSync(path.join(root, 'workers/shared')).filter((f) => f.endsWith('.js'))
      .map((f) => fs.readFileSync(path.join(root, 'workers/shared', f), 'utf8'))
  ].join('\n');
  for (const marqueur of ['TODO', 'FIXME', 'XXX', 'HACK', 'TEMPORARY', 'DEPRECATED', 'WORKAROUND']) {
    assert.equal(new RegExp(`\\b${marqueur}\\b`).test(production), false, `aucun ${marqueur}.`);
  }
});

test('T-CLEAN05-18/19/20 : les dettes ouvertes sont nommées par le registre, et aucune autre', () => {
  /* CLEAN-05 déclarait trois dettes dans son propre fichier. FORMAT-STRUCT-01 en a
     fermé une ET créé le registre persistant : la liste est désormais LUE, pas recopiée. */
  /* EXEC-PHASE-INSTRUMENT-01 a fermé la sienne à son tour : il n'en reste qu'une. */
  assert.equal(DETTES_OUVERTES.length, 1);
  assert.deepEqual([...DETTES_OUVERTES], ['PERF-REAL-01']);
  assert.deepEqual([...DETTES_FERMEES].sort(),
    ['EXEC-PHASE-INSTRUMENT-01', 'FORMAT-STRUCT-01', 'ORCH-LEGACY-CLEAN-01']);
  /* Aucun identifiant de dette du dépôt n'est en dehors des trois ouvertes et
     de celles que la chaîne CLEAN a refermées. */
  const tout = [html, ...FICHIERS_TEST.map((f) => fs.readFileSync(path.join(root, 'tests', f), 'utf8'))].join('\n');
  /* On cherche les identifiants de DETTE, pas les noms de lot : CLEAN-02 ou MODE-05
     désignent un lot, pas une dette. Le vocabulaire de dette est celui-ci, et lui seul. */
  const trouves = new Set((tout.match(/(?<!-)\b[A-Z][A-Z-]{4,30}-\d{2}\b/g) || [])
    .filter((x) => /(STRUCT|-REAL-|INSTRUMENT|LEGACY-CLEAN|DEBT)/.test(x))
    /* Les identifiants de TEST commencent par « T- » : ce ne sont pas des dettes. */
    .filter((x) => !/^T-/.test(x)));
  assert.ok(trouves.size > 0, 'la mesure trouve bien des identifiants de dette.');
  for (const id of trouves) {
    assert.ok(DETTES_OUVERTES.includes(id) || DETTES_FERMEES.includes(id),
      `${id} est soit une dette ouverte déclarée, soit une dette refermée.`);
  }
  /* EXEC-PHASE-INSTRUMENT-01 est la seule des trois qui porte une marque dans le
     code : les deux autres ne vivent que dans l'historique des lots. C'est un fait,
     pas un oubli — et le dire ici est ce qui les rend traçables depuis le dépôt. */
  assert.ok(tout.includes('EXEC-PHASE-INSTRUMENT-01'), 'celle-ci est marquée dans les preuves.');
  /* Et le registre les porte toutes, y compris celles qu'aucune preuve ne marque. */
  for (const id of [...DETTES_OUVERTES, ...DETTES_FERMEES]) assert.ok(REGISTRE_DETTES.includes(id));
});

// =================================================================================================
// §59 — LES ARTEFACTS, ET LES PREUVES ELLES-MÊMES
// =================================================================================================

test('T-CLEAN05-21 : aucun artefact temporaire dans le périmètre', () => {
  const suspects = [];
  const parcourir = (rel) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) parcourir(p);
      else if (/\.(tmp|bak|old|orig|rej|log|zip)$|~$|^\.DS_Store$/.test(e.name)) suspects.push(p);
    }
  };
  parcourir('');
  assert.deepEqual(suspects, [], 'aucun fichier temporaire, de sauvegarde ou d’OS.');
});

test('T-CLEAN05-22 : chaque tranche de test mesure une région qui existe VRAIMENT', () => {
  /* LA GARDE CENTRALE DE CE LOT. `html.indexOf()` rend -1 pour une borne
     introuvable, et `slice(a, -1)` ne lève rien : il rend une tranche arbitraire.
     Cinq tranches étaient dans ce cas après CLEAN-01 — quatre mesuraient tout le
     fichier, une mesurait le vide, et la suite restait verte. Une preuve qui ne
     mesure plus rien est pire qu'une preuve absente : elle rassure. */
  const introuvables = [];
  for (const f of FICHIERS_TEST) {
    const src = fs.readFileSync(path.join(root, 'tests', f), 'utf8');
    const ancres = new Set();
    for (const m of src.matchAll(/(?:html|HTML|FRONTEND|FRONT_CODE)\.indexOf\(\s*(['"])((?:(?!\1).){6,120})\1/g)) ancres.add(m[2]);
    for (const nom of ['productionSlice', 'tranche', 'bloc', 'productionSlice']) {
      const re = new RegExp(`${nom}\\(\\s*(['"])((?:(?!\\1).){6,120})\\1\\s*,\\s*(['"])((?:(?!\\3).){6,120})\\3`, 'g');
      for (const m of src.matchAll(re)) { ancres.add(m[2]); ancres.add(m[4]); }
    }
    for (const a of ancres) {
      const cible = a.replace(/\\\\/g, '\\');
      if (!html.includes(cible) && !BUNDLE.includes(cible)) introuvables.push(`${f} : ${cible}`);
    }
  }
  assert.deepEqual(introuvables, [], 'aucune borne de tranche introuvable dans le produit.');
});

test('T-CLEAN05-23 : aucun commentaire n’attribue un travail à une dette refermée', () => {
  /* Un commentaire qui renvoie à une dette FERMÉE décrit un état devenu faux.
     C'était le cas d'une note de MODE-05 sur `etat.prompt`, corrigée par ce lot. */
  const prose = [html, ...FICHIERS_TEST.map((f) => fs.readFileSync(path.join(root, 'tests', f), 'utf8'))].join('\n');
  for (const fermee of DETTES_FERMEES) {
    for (const m of prose.matchAll(new RegExp(`.{140}${fermee}.{60}`, 'g'))) {
      assert.match(m[0], /ferm|CLOSED|retir|supprim/i,
        `toute mention de ${fermee} doit dire qu'elle est refermée : ${m[0].slice(0, 90)}`);
    }
  }
  /* Et le produit ne décrit plus des faits que les lots MODE ont démentis. */
  assert.equal(html.includes('producesFinalDeliverable: true,\n    manualComposition: true'), false);
});

// =================================================================================================
// §43..§46 — LES QUATRE LOTS PRÉCÉDENTS TIENNENT ENCORE
// =================================================================================================

test('T-CLEAN05-CHAINE : les gardes posées par CLEAN-01 à CLEAN-04 sont toutes en place', async () => {
  /* CLEAN-01 : une seule politique, un seul pilote, un seul routeur. */
  assert.equal((html.match(/const ORCHESTRATION_DRIVER=/g) || []).length, 1);
  assert.equal((FRONT_CODE.match(/window\.__V11_ROUTER__=Object\.freeze/g) || []).length, 1);
  /* CLEAN-02 : le propriétaire de `etat.prompt` est nommé, et il n'entre dans aucun tour. */
  const tour = sansProse(tranche('function oprieBuildBody()', 'function oprieSetBusy'));
  assert.doesNotMatch(tour, /etat\.prompt|lastEnvelope/);
  /* CLEAN-03 : la classification des traces est écrite là où l'état vit. */
  assert.ok(html.includes('/* CLEAN-03 — CET ÉTAT PORTE DEUX CHOSES'));
  /* CLEAN-04 : le manifeste ne déclare que des modules dont le fichier existe. */
  for (const f of [...BUILD.matchAll(/file: '([^']+)'/g)].map((m) => m[1])) {
    assert.ok(fs.existsSync(path.join(root, 'core/adn', f)) || fs.existsSync(path.join(root, 'workers/shared', f)), f);
  }
  /* Et le produit se comporte toujours comme avant : un tour périmé n'exécute rien. */
  const h = loadPilot({ mode: 'rapide', deep: async () => { await delay(120); return arbiterTurn('operational_request_ready'); } });
  const enVol = h.pilot.oprieRunTurn('rapide');
  await delay(20);
  h.pilot.oprieState.seq += 1;
  await enVol;
  assert.deepEqual(h.spy.executed, []);
});
