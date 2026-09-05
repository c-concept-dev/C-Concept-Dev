/* OPRIE-REFERENCE-ORACLE-01 — UNE VÉRITÉ TERRAIN QUI NE DOIT RIEN À AUCUN MODÈLE.
 * ============================================================================
 *
 * Le lot précédent s'est arrêté sur une impasse : il comparait Anthropic à Groq, et
 * Groq n'a produit que 2 décisions sur 12. Il manquait une référence indépendante.
 *
 * CE QUE CET ORACLE ÉTABLIT, ET COMMENT. Trente cas, tous issus du corpus existant,
 * reçoivent un état OPRIE attendu dérivé du CONTRAT — définitions des quatre états,
 * échelle de substitution, contrat de transport du tour — et du contenu de la
 * fixture. Aucune sortie de modèle n'a été consultée pour fixer une attente.
 *
 * LE FAIT QUI CHANGE LA LECTURE DU LOT PRÉCÉDENT. Le tour profond ne reçoit que
 * original_request et clarification_history : il n'a AUCUN canal de matériau, là où
 * /decision reçoit materiau_present comme fait fiable. Une demande qui présuppose un
 * intrant a donc cet intrant structurellement absent — et demander cet intrant est
 * conforme au contrat. Quatre des cinq « fausses clarifications » attribuées à
 * Anthropic n'en étaient pas : l'oracle utilisé alors avait été écrit pour une autre
 * route.
 *
 * CE QUE CE FICHIER GARDE.
 *   1. L'oracle reste HORS RUNTIME — aucun code de production ne le lit, et aucun
 *      comportement ne dépend d'un case_id.
 *   2. Aucune autorité de fournisseur, aucun juge LLM, aucune similarité textuelle.
 *   3. Chaque cas résolu porte un état ET sa justification.
 *   4. Les cas non tranchables restent non tranchés.
 *   5. degraded_state n'est jamais une attente : le contrat l'interdit à l'Arbitre.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ARBITER_STATES } from '../workers/shared/operational-request-core.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (r) => fs.readFileSync(path.join(racine, r), 'utf8');
const O = JSON.parse(lire('evaluation/oprie-reference-oracle-01/oracle.json'));
const DOC = lire('docs/OPRIE-REFERENCE-ORACLE-01.md');
const CORPUS = JSON.parse(lire('evaluation/corpus-lot10g2a.json'));

/* T-OPORAC01-01 — L'ORACLE NE DOIT RIEN À AUCUN FOURNISSEUR. */
test('T-OPORAC01-01 : aucune autorité de fournisseur, aucun juge, aucune similarité', () => {
  assert.equal(O.autorite.provider_output_used_as_authority, false);
  assert.equal(O.autorite.provider_vote_used, false);
  assert.equal(O.autorite.llm_judge_used, false);
  assert.equal(O.autorite.text_similarity_used, false);
  /* Aucun nom de fournisseur ne figure dans une règle de l'oracle. */
  const regles = JSON.stringify({ motifs: O.motifs_de_decision, cas: O.cas });
  for (const nom of ['groq', 'anthropic', 'openai', 'claude', 'gpt']) {
    assert.equal(new RegExp(nom, 'i').test(regles), false,
      `PROVIDER_SPECIFIC_ORACLE_RULE_COUNT = 0 : ${nom} n’apparaît dans aucune règle`);
  }
  assert.equal(O.autorite.sources.length >= 3, true);
  assert.match(O.autorite.sources[0], /contrat OPRIE/);
});

/* T-OPORAC01-02 — L'ORACLE EST HORS RUNTIME. C'est le pare-feu de gouvernance. */
test('T-OPORAC01-02 : aucun code de production ne lit l’oracle', () => {
  const runtime = lire('workers/groq/src/index.js')
    + lire('workers/shared/operational-request-core.js')
    + lire('workers/shared/operational-request-orchestrator.js')
    + lire('workers/shared/fast-interactive-plane.js')
    + lire('workers/shared/decision-core.js')
    + lire('workers/shared/provider-ha.js')
    + lire('tools/build-adn-browser-runtime.mjs')
    + lire('atelier-prompts-v11.5-lot10g-decision-provider.html');
  for (const interdit of ['oprie-reference-oracle', 'oracle.json', 'expected_oprie_state',
    'oracle_status', 'decision_pattern', 'corpus-lot10g2a']) {
    assert.equal(runtime.includes(interdit), false, `le runtime ignore ${interdit}`);
  }
  /* CASE_ID_RUNTIME_LOGIC_COUNT = 0 : aucun identifiant de cas ne pilote un comportement. */
  for (const c of O.cas) {
    const motif = new RegExp(`["'\`]${c.case_id}["'\`]`);
    assert.equal(motif.test(runtime), false, `aucune logique de production ne cite ${c.case_id}`);
  }
  assert.match(O.perimetre.usage, /EVALUATION UNIQUEMENT/);
});

/* T-OPORAC01-03 — chaque cas résolu porte un état LÉGAL et une justification. */
test('T-OPORAC01-03 : tout cas résolu a un état contractuel et son rationale', () => {
  assert.equal(O.cas.length, 30);
  const resolus = O.cas.filter((c) => c.oracle_status === 'resolved');
  const nonResolus = O.cas.filter((c) => c.oracle_status === 'unresolved');
  assert.equal(resolus.length, 26);
  assert.equal(nonResolus.length, 4);
  for (const c of resolus) {
    assert.ok(ARBITER_STATES.includes(c.expected_oprie_state),
      `${c.case_id} : ${c.expected_oprie_state} est un état du contrat`);
    assert.ok(c.rationale && c.rationale.length > 120, `${c.case_id} : justification substantielle`);
    /* RATIONALE_COMPLETE : la justification dit pourquoi CET état et pourquoi pas les autres. */
    assert.match(c.rationale, /PAS /, `${c.case_id} : les états écartés sont nommés`);
    assert.ok(Array.isArray(c.forbidden_behavior) && c.forbidden_behavior.length > 0,
      `${c.case_id} : comportements interdits énoncés`);
    assert.ok(['high', 'medium', 'low'].includes(c.confidence));
  }
  for (const c of nonResolus) {
    assert.equal(c.expected_oprie_state, null, `${c.case_id} : aucun état inventé`);
    assert.equal(c.requires_product_owner_decision, true);
    assert.match(c.rationale, /NON TRANCHÉ/);
  }
});

/* T-OPORAC01-04 — DEGRADED_STATE N'EST JAMAIS UNE ATTENTE. Le contrat l'interdit à
 * l'Arbitre : il n'est déclaré que par le système, sur panne technique. */
test('T-OPORAC01-04 : degraded_state n’est pas un état d’évaluation sémantique', () => {
  const noyau = lire('workers/shared/operational-request-core.js');
  assert.match(noyau, /Vous ne produisez jamais l'état degraded_state/,
    'le contrat interdit explicitement cet état à l’Arbitre');
  assert.equal(ARBITER_STATES.includes('degraded_state'), false);
  for (const c of O.cas) assert.notEqual(c.expected_oprie_state, 'degraded_state');
  assert.match(O.perimetre.degraded_state, /ABSENT PAR CONSTRUCTION/);
  assert.match(DOC, /Une indisponibilité du plan rapide, un 429 Groq, l'absence de candidate rapide : rien de\s*\ncela n'est un état OPRIE/);
});

/* T-OPORAC01-05 — CLARIFICATION ET CONFIRMATION SONT DISTINGUÉES, et le
 * sur-questionnement devient évaluable. */
test('T-OPORAC01-05 : clarification, confirmation et sur-questionnement sont séparés', () => {
  /* Les trois classes exigées par le lot existent sur chaque cas. */
  const classes = new Set(O.cas.map((c) => c.clarification_class));
  assert.ok(classes.has('required'), 'REQUIRED_CLARIFICATION représentée');
  assert.ok(classes.has('unnecessary'), 'UNNECESSARY_CLARIFICATION représentée');
  assert.ok(classes.has('undetermined'), 'les cas non tranchés ne sont ni l’un ni l’autre');
  /* Un cas READY est un cas où toute clarification serait inutile : c'est ce qui rend
     le sur-questionnement mesurable. */
  for (const c of O.cas.filter((x) => x.expected_oprie_state === 'operational_request_ready')) {
    assert.equal(c.clarification_class, 'unnecessary', `${c.case_id} : questionner serait de trop`);
    assert.ok(c.ready_reason, `${c.case_id} : READY est motivé`);
  }
  for (const c of O.cas.filter((x) => x.expected_oprie_state === 'clarification_required')) {
    assert.equal(c.clarification_class, 'required');
    assert.ok(c.required_information_missing.length > 0, `${c.case_id} : ce qui manque est nommé`);
  }
  /* La distinction contractuelle clarification / confirmation est citée dans le document. */
  assert.match(DOC, /N'utilisez jamais cet état comme échappatoire à un problème matériel non résolu/);
  assert.equal(O.cas.every((c) => c.confirmation_needed === false), true,
    'aucun cas du corpus ne déclenche confirmation_required');
});

/* T-OPORAC01-06 — LE FAIT STRUCTURANT : le tour profond n'a aucun canal de matériau. */
test('T-OPORAC01-06 : l’absence de canal de matériau est établie sur le contrat', () => {
  const noyau = lire('workers/shared/operational-request-core.js');
  /* OPRIE-MATERIAL-CONTEXT-02 : une troisième clé, OPTIONNELLE, a été ajoutée depuis.
     Ce que cet oracle établissait reste vrai — il a été construit contre le contrat
     d’alors, et ses attentes n’ont pas été retouchées. */
  assert.match(noyau, /requireKeysWithOptional\(value, \["original_request", "clarification_history"\],/,
    'le tour accepte deux clés requises et des optionnelles, nommées');
  /* Alors que /decision, lui, reçoit materiau_present comme fait fiable. */
  assert.match(lire('workers/shared/decision-core.js'), /materiau_present est un fait fiable/);
  /* D’où le motif appliqué aux demandes qui présupposent un intrant. */
  const materiau = O.cas.filter((c) => c.decision_pattern === 'MATERIAU_ABSENT');
  assert.equal(materiau.length, 14);
  for (const c of materiau) {
    assert.equal(c.expected_oprie_state, 'clarification_required');
    assert.equal(c.confidence, 'high');
  }
  /* Et le corpus mélangeait les deux étiquettes, indistinguables pour OPRIE. */
  const categories = new Set(materiau.map((c) => c.corpus_category));
  assert.ok(categories.size > 1,
    'des cas « matériau présent » et « matériau absent » reçoivent le même état : ils sont indistinguables du point de vue d’OPRIE');
});

/* T-OPORAC01-07 — les motifs sont UNIFORMES : aucune règle propre à un cas, aucun
 * domaine, aucun scénario codé en dur. */
test('T-OPORAC01-07 : les motifs de décision ne nomment aucun domaine', () => {
  const motifs = JSON.stringify(O.motifs_de_decision);
  for (const domaine of ['voyage', 'italie', 'python', 'boulangerie', 'newsletter', 'entreprise',
    'photosynthese', 'photosynthèse', 'sql', 'csv', 'javascript']) {
    assert.equal(new RegExp(domaine, 'i').test(motifs), false,
      `DOMAIN_HARDCODING_COUNT = 0 : ${domaine} n’apparaît dans aucun motif`);
  }
  /* Chaque cas est rattaché à l’un des quatre motifs, et les cas d’un même motif
     partagent exactement la même justification. */
  const parMotif = {};
  for (const c of O.cas) (parMotif[c.decision_pattern] = parMotif[c.decision_pattern] || []).push(c);
  assert.equal(Object.keys(parMotif).length, 4);
  for (const [nom, liste] of Object.entries(parMotif)) {
    const premiere = liste[0].rationale;
    for (const c of liste) {
      assert.equal(c.rationale, premiere, `${nom} : ${c.case_id} suit la règle commune, sans exception`);
    }
  }
});

/* T-OPORAC01-08 — la couverture est exacte, et ses lacunes sont déclarées. */
test('T-OPORAC01-08 : la matrice de couverture se recalcule, les lacunes sont dites', () => {
  const compte = (etat) => O.cas.filter((c) => c.expected_oprie_state === etat).length;
  assert.equal(O.couverture.operational_request_ready.cases, compte('operational_request_ready'));
  assert.equal(O.couverture.clarification_required.cases, compte('clarification_required'));
  assert.equal(compte('operational_request_ready'), 8);
  assert.equal(compte('clarification_required'), 18);
  assert.equal(compte('confirmation_required'), 0);
  assert.equal(compte('blocked'), 0);
  assert.equal(O.couverture.non_resolus.cases, 4);
  assert.equal(8 + 18 + 4, O.cas.length);
  /* CORPUS_COVERAGE_GAP = YES, et il est motivé par le contrat, pas constaté sèchement. */
  assert.match(O.lacunes_de_couverture.confirmation_required, /AUCUN CAS/);
  assert.match(O.lacunes_de_couverture.blocked, /AUCUN CAS/);
  assert.match(O.lacunes_de_couverture.consequence, /CORPUS_COVERAGE_GAP = YES/);
  assert.match(O.lacunes_de_couverture.consequence, /Aucun cas n a ete fabrique/);
});

/* T-OPORAC01-09 — le corpus est celui qui existait, intégralement, sans ajout. */
test('T-OPORAC01-09 : trente cas du corpus existant, aucun inventé', () => {
  assert.equal(CORPUS.cases.length, 30);
  const idsCorpus = CORPUS.cases.map((c) => c.id).sort();
  const idsOracle = O.cas.map((c) => c.case_id).sort();
  assert.deepEqual(idsOracle, idsCorpus, 'exactement les cas du corpus, ni plus ni moins');
  for (const c of O.cas) {
    const source = CORPUS.cases.find((x) => x.id === c.case_id);
    assert.equal(c.request_summary, source.demande, `${c.case_id} : la demande est celle du corpus`);
    assert.equal(c.corpus_category, source.category);
  }
});

/* T-OPORAC01-10 — les cinq cas du lot précédent, traités par la règle commune. */
test('T-OPORAC01-10 : les cinq cas signalés suivent la règle uniforme', () => {
  const attendu = {
    R08: 'clarification_required', R09: 'clarification_required',
    A01: null, A02: 'clarification_required', A03: 'clarification_required'
  };
  for (const [id, etat] of Object.entries(attendu)) {
    const c = O.cas.find((x) => x.case_id === id);
    assert.equal(c.expected_oprie_state, etat, `${id}`);
    /* Ils partagent la justification de leur motif : aucun traitement particulier. */
    const memeMotif = O.cas.filter((x) => x.decision_pattern === c.decision_pattern);
    assert.ok(memeMotif.length > 1, `${id} n’est pas seul sous son motif`);
    assert.equal(c.rationale, memeMotif[0].rationale);
  }
  assert.match(DOC, /Quatre des cinq « fausses clarifications » attribuées à Anthropic n'en étaient pas/);
});

/* T-OPORAC01-11 — l'artefact canonique est intact et la dette reste ouverte. */
test('T-OPORAC01-11 : HTML canonique inchangé, dette ouverte', () => {
  const octets = fs.readFileSync(path.join(racine, 'atelier-prompts-v11.5-lot10g-decision-provider.html'));
  /* OPRIE-MATERIAL-CONTEXT-02 — L'EMPREINTE A CHANGÉ, ET C'EST DÉLIBÉRÉ. Le noyau
     OPRIE est embarqué verbatim dans le bundle navigateur : ajouter le champ optionnel
     material_context au contrat d'entrée le répercute mécaniquement dans l'artefact.
     Le changement se limite à l'enveloppe et au contrat — aucune modification visuelle,
     aucun redesign, aucun comportement d'interface touché. */
  assert.equal(crypto.createHash('sha256').update(octets).digest('hex'),
    '6be95369eaf3611bc72b7d5d7972ffbb6a1f19c8901355c58da171b4274eccde', 'CANONICAL_HTML_CHANGED = NO');
  const registre = lire('docs/OPEN-DEBTS.md');
  const ouvertes = registre.slice(registre.indexOf('## Ouvertes'), registre.indexOf('## Fermées'));
  assert.deepEqual([...ouvertes.matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]), ['PERF-REAL-01']);
  assert.ok(ouvertes.includes('OPRIE-REFERENCE-ORACLE-01'));
});
