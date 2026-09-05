/* OPRIE-MATERIAL-CONTEXT-02 — LE CANAL EST POSÉ, ET IL NE DÉCIDE RIEN.
 * ============================================================================
 *
 * L'audit précédent avait établi le défaut : le produit possède un canal de
 * matériau — documents joints, stockés dans state.docs — et le plan profond, seule
 * autorité de readiness, ne le voyait pas. Ce lot pose le canal, en quatre couches,
 * et cette suite garde ce qui compte à chacune.
 *
 * DEUX DIMENSIONS, TROIS VALEURS. present et deep_content_available, chacune true,
 * false ou
 * "unknown". L'ABSENCE DU CHAMP VAUT "unknown" : les requêtes antérieures restent
 * valides, et rien n'est jamais rempli à true par défaut.
 *
 * LA PROPAGATION EST SÉLECTIVE, ET C'EST LE POINT DÉLICAT. `base` est diffusé aux
 * trois rôles : y ajouter le contexte l'aurait rendu visible à l'Arbitre par simple
 * effet de bord. L'Analyste interprète le fait, le Critique audite cette
 * interprétation, l'Arbitre arbitre ce que les deux ont soulevé — lui donner le
 * signal brut en ferait un troisième interprète du même fait.
 *
 * CE QUE LE CONTEXTE NE PEUT PAS FAIRE. Il ne dit jamais qu'un matériau est REQUIS —
 * `required` est délibérément absent —, ne rend jamais une demande prête, et
 * "unknown" ne vaut jamais false.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeMaterialContext, MATERIAL_CONTEXT_ABSENT, MATERIAL_CONTEXT_FIELDS,
  MATERIAL_CONTEXT_VALUES, MATERIAL_CONTEXT_UNKNOWN,
  validateAnalystInput, makeAnalystUserMessage, makeCriticUserMessage, makeArbiterUserMessage,
  ANALYST_SYSTEM_PROMPT, CRITIC_SYSTEM_PROMPT, ARBITER_SYSTEM_PROMPT
} from '../workers/shared/operational-request-core.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (r) => fs.readFileSync(path.join(racine, r), 'utf8');
const NOYAU = lire('workers/shared/operational-request-core.js');
const ORCH = lire('workers/shared/operational-request-orchestrator.js');
const HTML = lire('atelier-prompts-v11.5-lot10g-decision-provider.html');
const demande = { original_request: 'Résume ce texte en cinq idées clés.', clarification_history: [] };
const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* T-MCTX02-01 — le champ optionnel est accepté, et rien d'autre ne l'est. */
test('T-MCTX02-01 : le champ optionnel est accepté, le contrat reste strict', () => {
  /* L’invariant est indissociable : annoncer la disponibilité EXIGE de fournir le contenu. */
  const avec = validateAnalystInput({ ...demande, material_context: { present: true, deep_content_available: true }, material_content: ['texte'] });
  assert.deepEqual(avec.material_context, { present: true, deep_content_available: true });
  assert.deepEqual(avec.material_content, ['texte']);
  /* La rigueur n'a pas été relâchée : toute clé non énumérée reste refusée. */
  assert.throws(() => validateAnalystInput({ ...demande, autre_chose: 1 }), /champs inattendus/);
  assert.throws(() => validateAnalystInput({ ...demande, material_context: { present: true, deep_content_available: true }, material_content: ['x'], extra: 1 }), /champs inattendus/);
  /* Les clés requises le restent. */
  assert.throws(() => validateAnalystInput({ original_request: 'x' }), /champs inattendus/);
  /* Un contexte malformé est une erreur de l'appelant, jamais une valeur devinée. */
  assert.throws(() => validateAnalystInput({ ...demande, material_context: { present: true } }), /exactement present et deep_content_available/);
  assert.throws(() => validateAnalystInput({ ...demande, material_context: { present: 'oui', deep_content_available: true } }), /vaut true, false ou/);
  assert.throws(() => validateAnalystInput({ ...demande, material_context: [] }), /doit être un objet/);
});

/* T-MCTX02-02 — absence = unknown, jamais un défaut optimiste. */
test('T-MCTX02-02 : l’absence du champ vaut unknown', () => {
  assert.deepEqual(validateAnalystInput(demande).material_context, { present: 'unknown', deep_content_available: 'unknown' });
  assert.deepEqual(normalizeMaterialContext(undefined), MATERIAL_CONTEXT_ABSENT);
  assert.deepEqual(normalizeMaterialContext(null), MATERIAL_CONTEXT_ABSENT);
  assert.equal(MATERIAL_CONTEXT_ABSENT.present, MATERIAL_CONTEXT_UNKNOWN);
  assert.equal(MATERIAL_CONTEXT_ABSENT.deep_content_available, MATERIAL_CONTEXT_UNKNOWN);
  /* Et jamais true par défaut, nulle part. */
  assert.equal(/present:\s*true\s*[,}]/.test(sansProse(NOYAU).slice(sansProse(NOYAU).indexOf('normalizeMaterialContext'))), false);
});

/* T-MCTX02-03 / 04 — les deux dimensions atteignent l'Analyste, distinctement. */
test('T-MCTX02-03/04 : les deux dimensions parviennent à l’Analyste, séparément', () => {
  for (const contexte of [{ present: true, deep_content_available: false },
    { present: false, deep_content_available: false }, { present: 'unknown', deep_content_available: 'unknown' }]) {
    const message = JSON.parse(makeAnalystUserMessage({ ...demande, material_context: contexte }));
    assert.deepEqual(message.material_context, contexte);
  }
  /* Et le cas disponible, indissociable de son contenu. */
  const avecContenu = JSON.parse(makeAnalystUserMessage({ ...demande, material_context: { present: true, deep_content_available: true }, material_content: ['texte'] }));
  assert.deepEqual(avecContenu.material_context, { present: true, deep_content_available: true });
  assert.deepEqual(avecContenu.material_content, ['texte']);
  /* Les deux dimensions sont indépendantes : present=true n’impose rien du contenu. */
  const m = JSON.parse(makeAnalystUserMessage({ ...demande, material_context: { present: true, deep_content_available: false } }));
  assert.equal(m.material_context.present, true);
  assert.equal(m.material_context.deep_content_available, false);
  assert.deepEqual([...MATERIAL_CONTEXT_FIELDS], ['present', 'deep_content_available']);
  assert.deepEqual([...MATERIAL_CONTEXT_VALUES], [true, false, 'unknown']);
});

/* T-MCTX02-05 — le Critique le reçoit aussi : il ne peut auditer sans lui. */
test('T-MCTX02-05 : le Critique reçoit le contexte', () => {
  const message = JSON.parse(makeCriticUserMessage({
    ...demande, analyst_output: { issues: [] }, material_context: { present: true, deep_content_available: true }
  }));
  assert.deepEqual(message.material_context, { present: true, deep_content_available: true });
  assert.match(ORCH, /if \(role === "critic"\) return \{ \.\.\.base, analyst_output: outputs\.analyst, previous_vetoes: \[\], material_context \};/);
});

/* T-MCTX02-06 — L'ARBITRE NE LE REÇOIT PAS. Le piège de `base` a été évité. */
test('T-MCTX02-06 : l’Arbitre ne reçoit jamais le contexte', () => {
  const message = JSON.parse(makeArbiterUserMessage({
    ...demande, analyst_output: { issues: [] }, critic_output: { agreement: 'agree' },
    material_context: { present: true, deep_content_available: true }
  }));
  assert.equal(Object.prototype.hasOwnProperty.call(message, 'material_context'), false,
    'le message de l’Arbitre ne porte aucun contexte matériau');
  /* Et l’orchestrateur ne le lui transmet pas non plus. */
  assert.match(ORCH, /return \{ \.\.\.base, analyst_output: outputs\.analyst, critic_output: outputs\.critic \};/);
  /* La preuve structurelle : le contexte ne passe PAS par base. */
  assert.match(ORCH, /const material_context = input\.material_context;/);
  assert.equal(/base = Object\.freeze\(\{[^}]*material_context/.test(ORCH), false,
    'le contexte n’est pas dans base, sinon l’Arbitre le recevrait par effet de bord');
});

/* T-MCTX02-07 / 08 — la demande reste immuable, l'historique intact. */
test('T-MCTX02-07/08 : original_request immuable, clarification_history inchangé', () => {
  const entree = validateAnalystInput({ ...demande, material_context: { present: true, deep_content_available: true }, material_content: ['texte du document'] });
  assert.equal(entree.original_request, demande.original_request,
    'la demande n’est pas enrichie du contexte');
  assert.equal(entree.original_request.includes('material'), false);
  assert.deepEqual(entree.clarification_history, []);
  /* Aucun fait technique n’est injecté dans l’historique. */
  const message = JSON.parse(makeAnalystUserMessage({ ...demande, material_context: { present: true, deep_content_available: false } }));
  assert.equal(message.original_request, demande.original_request);
  assert.deepEqual(message.clarification_history, []);
  assert.notEqual(message.material_context, undefined, 'le contexte vit à part, jamais fondu ailleurs');
});

/* T-MCTX02-09 / 10 / 11 — aucune règle fournisseur, aucun domaine, aucun case_id. */
test('T-MCTX02-09/10/11 : ni fournisseur, ni domaine, ni identifiant de cas', () => {
  const debut = NOYAU.indexOf('export const MATERIAL_CONTEXT_UNKNOWN');
  const zone = sansProse(NOYAU.slice(debut, NOYAU.indexOf('function validateOriginalRequestAndHistory')));
  for (const interdit of ['groq', 'anthropic', 'openai', 'document', 'image', 'pdf', 'docx', 'csv',
    'fichier', 'filename', 'mime']) {
    assert.equal(new RegExp(interdit, 'i').test(zone), false, `le contrat ne nomme pas ${interdit}`);
  }
  /* Côté navigateur, le calcul ne lit ni extension, ni type MIME, ni nom. */
  const envelope = HTML.slice(HTML.indexOf('function oprieBuildBody'), HTML.indexOf('async function oprieRequestTurn'));
  for (const interdit of ['\\.name', 'file\\.type', 'split', 'endsWith', 'includes\\(ext', 'pdf', 'docx']) {
    assert.equal(new RegExp(interdit).test(envelope), false, `l’enveloppe ne lit pas ${interdit}`);
  }
  /* Aucun identifiant de fixture ne pilote quoi que ce soit. */
  const runtime = NOYAU + ORCH + HTML + lire('workers/groq/src/index.js');
  for (const id of ['R08', 'R09', 'R10', 'R11', 'R12', 'R13', 'A01', 'A02', 'A03']) {
    assert.equal(new RegExp(`["'\`]${id}["'\`]`).test(runtime), false, `CASE_ID_RUNTIME_LOGIC_COUNT = 0 : ${id}`);
  }
});

/* T-MCTX02-12 / 13 — ni la présence ni la disponibilité ne suffisent JAMAIS à un READY. */
test('T-MCTX02-12/13 : ni present ni deep_content_available ne produisent un état', () => {
  /* Le contrat ne connaît aucun état OPRIE. */
  const debut = NOYAU.indexOf('export const MATERIAL_CONTEXT_UNKNOWN');
  const zone = NOYAU.slice(debut, NOYAU.indexOf('function validateOriginalRequestAndHistory'));
  assert.ok(zone.length > 500, 'la zone du contrat est bien delimitee');
  for (const etat of ['operational_request_ready', 'clarification_required', 'confirmation_required',
    'blocked', 'degraded_state']) {
    assert.equal(zone.includes(etat), false, `le contrat ne mentionne pas ${etat}`);
  }
  /* Et le prompt l’interdit explicitement à l’Analyste comme au Critique. */
  assert.match(ANALYST_SYSTEM_PROMPT, /ne rendent jamais une demande prête/);
  assert.match(ANALYST_SYSTEM_PROMPT, /décider si ce matériau est requis, et s'il suffit, reste votre raisonnement/);
  assert.match(CRITIC_SYSTEM_PROMPT, /jamais une readiness/);
  assert.match(CRITIC_SYSTEM_PROMPT, /N’en tirez aucune conclusion d’état/);
  /* required reste une déduction de l’Analyste : le champ n’existe pas. */
  assert.equal(MATERIAL_CONTEXT_FIELDS.includes('required'), false);
  assert.match(ANALYST_SYSTEM_PROMPT, /décrivent la disponibilité technique d'un matériau, jamais une exigence/);
  /* L’Arbitre, lui, n’a même pas été informé de l’existence du champ. */
  assert.equal(/material_context/.test(ARBITER_SYSTEM_PROMPT), false);
});

/* T-MCTX02-14 — une absence réelle de matériau reste clarifiable. */
test('T-MCTX02-14 : present=false laisse toute latitude de clarifier', () => {
  const message = JSON.parse(makeAnalystUserMessage({ ...demande, material_context: { present: false, deep_content_available: false } }));
  assert.deepEqual(message.material_context, { present: false, deep_content_available: false });
  /* Rien dans le contrat ne restreint la conduite de l’Analyste : il ne reçoit
     qu’un fait, et le prompt lui rappelle que la déclaration de la personne prime. */
  assert.match(ANALYST_SYSTEM_PROMPT, /cette déclaration l'emporte sur le contexte/);
  assert.equal(/if\s*\(.*material_context.*\)\s*return/.test(sansProse(NOYAU)), false,
    'aucune branche du code ne décide à partir du contexte');
});

/* T-MCTX02-15 / 17 — fraîcheur par construction, et aucun délai inventé. */
test('T-MCTX02-15/17 : le signal est lu à l’envoi, sans durée de validité inventée', () => {
  /* Le contexte est construit DANS le corps de la requête, à l’instant de l’envoi. */
  assert.match(HTML, /const body=oprieBuildBody\(\);/);
  assert.match(HTML, /material_context:\{present,deep_content_available:true\},material_content:textes/);
  /* Il n’est ni mémorisé, ni recopié : une seule définition, un seul appel. */
  assert.equal((HTML.match(/function oprieBuildBody/g) || []).length, 1);
  /* Un seul site d’appel — la définition contient elle aussi la chaîne, on compte
     donc l’usage réel, celui qui construit le corps de la requête. */
  assert.equal((HTML.match(/const body=oprieBuildBody\(\);/g) || []).length, 1,
    'un seul site d’appel : celui qui construit le corps de la requête');
  /* Si la source est hors de portée, on rend unknown — jamais un défaut optimiste. */
  assert.match(HTML, /if\(!docs\)return\{\.\.\.base,material_context:\{present:'unknown',deep_content_available:'unknown'\}\}/);
  /* INVENTED_MATERIAL_TTL_COUNT = 0 : aucune constante de temps dans le mécanisme. */
  const envelope = HTML.slice(HTML.indexOf('function oprieBuildBody'), HTML.indexOf('async function oprieRequestTurn'));
  for (const motif of [/\bDate\b/, /\bsetTimeout\b/, /\bttl\b/i, /\b\d{3,}\b/, /expire/i, /stale/i]) {
    assert.equal(motif.test(envelope), false, `aucune notion de durée : ${motif}`);
  }
});

/* T-MCTX02-16 — le conflit entre canaux est gouverné, et par le bon rôle. */
test('T-MCTX02-16 : un conflit entre la demande et le contexte est tranché par l’Analyste', () => {
  /* La règle de précédence est écrite dans le contrat, pas devinée par du code. */
  assert.match(ANALYST_SYSTEM_PROMPT,
    /Si la demande ou l'historique déclare explicitement qu'un intrant manque, cette déclaration l'emporte sur le contexte/);
  /* Aucune comparaison mécanique de textes n’existe — ce serait de l’appariement flou. */
  const zone = sansProse(NOYAU);
  for (const interdit of ['similarity', 'levenshtein', 'distance', 'fuzzy', 'includes(original_request']) {
    assert.equal(zone.includes(interdit), false, `aucun rapprochement textuel : ${interdit}`);
  }
  /* Le contexte n’est jamais réconcilié automatiquement avec la demande. */
  assert.equal(/material_context[\s\S]{0,200}original_request[\s\S]{0,80}(match|compare|test)\(/.test(zone), false);
});

/* T-MCTX02-18 — rétrocompatibilité stricte. */
test('T-MCTX02-18 : une requête antérieure au contrat reste valide', () => {
  const ancienne = { original_request: 'Explique la photosynthèse.', clarification_history: [] };
  const entree = validateAnalystInput(ancienne);
  assert.equal(entree.original_request, ancienne.original_request);
  assert.deepEqual(entree.material_context, { present: 'unknown', deep_content_available: 'unknown' });
  /* Et le message produit reste lisible, avec le contexte à unknown. */
  const message = JSON.parse(makeAnalystUserMessage(ancienne));
  assert.deepEqual(message.material_context, { present: 'unknown', deep_content_available: 'unknown' });
  /* L’observation du tour signale l’absence sans la transformer en fait. */
  assert.match(ORCH, /material_context_absent: !material_context/);
});
