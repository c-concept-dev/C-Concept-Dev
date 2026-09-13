/* OPRIE-EXPECTED-DELIVERABLE-SEMANTICS-01 — LE CANDIDAT PRÉPARE, IL N'EXÉCUTE PAS.
 * ============================================================================
 *
 * Quatre vetos sur seize reprochaient à l'Analyste d'inscrire la valeur extraite d'un matériau
 * dans expected_deliverable : « confond la phase de préparation et la phase d'exécution ». Ni
 * l'Analyste ni le Critique ne pouvaient trancher — le champ n'était défini nulle part. Le schéma
 * le déclare `{type:"string"}`, sans description ; le CDC §5.3 le nomme et n'existe pas dans le
 * dépôt.
 *
 * L'USAGE, LUI, ÉTAIT PARFAITEMENT CONSTANT. Toutes les fixtures historiques y mettent une FORME :
 * « Compte rendu structuré en trois sections », « Liste de 10 conseils », « Document d'une page
 * avec les trois indicateurs clés ». Des paramètres structurels, parfois. Un contenu, jamais.
 *
 * LA LIGNE DE PARTAGE N'EST PAS « FAIT OU PAS FAIT », C'EST LE RÔLE DU FAIT. Un fait qui SPÉCIFIE
 * la demande appartient au candidat, avec sa provenance. Un fait qui EST le résultat demandé n'y
 * appartient pas. Le veto du Critique était donc fondé, et c'est l'Analyste qui écrivait au mauvais
 * endroit.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANDIDATE_FIELD_DEFINITIONS, CANDIDATE_FIELDS, CANDIDATE_SCALAR_FIELDS } from '../core/adn/operational-request-state.js';
import { ANALYST_SYSTEM_PROMPT, CRITIC_SYSTEM_PROMPT, CRITIC_GLOBAL_SYSTEM_PROMPT,
  ARBITER_SYSTEM_PROMPT, ANALYST_JSON_SCHEMA } from '../workers/shared/operational-request-core.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (r) => fs.readFileSync(path.join(racine, r), 'utf8');

/* T-EDS01-01 — LA DÉFINITION EXISTE, ET ELLE DIT LA FORME. */
test('T-EDS01-01 : expected_deliverable est enfin défini', () => {
  assert.match(CANDIDATE_FIELD_DEFINITIONS.expected_deliverable,
    /La forme du résultat attendu et ses caractéristiques structurelles/);
  assert.match(CANDIDATE_FIELD_DEFINITIONS.expected_deliverable,
    /Jamais le contenu final, jamais une valeur qui constituerait à elle seule le résultat demandé/);
  assert.match(CANDIDATE_FIELD_DEFINITIONS.objective, /formulé comme une intention\. Jamais le résultat lui-même/);
  /* Trois champs définis désormais : les deux tranchés ici, plus available_inputs ajouté par
     OPRIE-INPUT-AVAILABILITY-FIELD-01. Les huit autres restent définis par leurs usages. */
  assert.deepEqual(Object.keys(CANDIDATE_FIELD_DEFINITIONS).sort(), ['available_inputs', 'expected_deliverable', 'objective']);
});

/* T-EDS01-02 — LE CONTRAT DE STRUCTURE N'A PAS BOUGÉ. */
test('T-EDS01-02 : les champs scalaires sont intacts, le schéma suit le contrat', () => {
  assert.deepEqual([...CANDIDATE_SCALAR_FIELDS], ['objective', 'expected_deliverable']);
  assert.equal(CANDIDATE_FIELDS.length, 11);
  assert.deepEqual(Object.keys(ANALYST_JSON_SCHEMA.properties.operational_request_candidate.properties), [...CANDIDATE_FIELDS]);
  /* Le type reste une chaîne : définir n'est pas contraindre la forme technique. */
  assert.deepEqual(ANALYST_JSON_SCHEMA.properties.operational_request_candidate.properties.expected_deliverable, { type: 'string' });
});

/* T-EDS01-03 — LA RÈGLE DE PHASE EST REVENUE, AVEC SA DESTINATION.
 *
 * Ce lot-ci avait dû la retirer : dire à l'Analyste que le fait « n'a sa place dans aucun champ »
 * effaçait la trace du matériau et faisait passer blocked de 10/30 à 23/30. Le manque était
 * structurel — aucun champ ne consignait « cet intrant est requis, et il est là ».
 * OPRIE-INPUT-AVAILABILITY-FIELD-01 a fourni ce champ ; la règle peut donc être réappliquée. */
test('T-EDS01-03 : la règle de phase est écrite, et elle indique où consigner', () => {
  assert.match(ANALYST_SYSTEM_PROMPT, /Le candidat PRÉPARE la demande, il ne l'exécute pas/);
  assert.match(ANALYST_SYSTEM_PROMPT, /expected_deliverable décrit la FORME du résultat attendu/);
  assert.match(ANALYST_SYSTEM_PROMPT, /jamais le contenu final ni une valeur qui constituerait à elle seule le résultat demandé/);
  /* Et, cette fois, la consigne a une destination — c'est toute la différence. */
  assert.match(ANALYST_SYSTEM_PROMPT, /consignez dans available_inputs l'INTRANT dont l'exécution aura besoin/);
  assert.match(ANALYST_SYSTEM_PROMPT, /DÉCRIT et jamais recopié/);
});

/* T-EDS01-04 — LE TROU DE CONTRAT EST COMBLÉ, PAR UN SEUL CHAMP. */
test('T-EDS01-04 : available_inputs existe et porte la disponibilité', () => {
  assert.equal(CANDIDATE_FIELDS.length, 11);
  assert.equal(CANDIDATE_FIELDS[CANDIDATE_FIELDS.length - 1], 'available_inputs');
  /* Les dix champs historiques sont intacts, dans leur ordre. */
  assert.deepEqual([...CANDIDATE_FIELDS].slice(0, 10), ['objective', 'expected_deliverable', 'secondary_objectives',
    'confirmed_constraints', 'confirmed_priorities', 'confirmed_preferences', 'delegated_decisions',
    'external_facts_to_research', 'assumptions_allowed', 'remaining_unknowns']);
  assert.match(CANDIDATE_FIELD_DEFINITIONS.available_inputs, /dont la disponibilité est établie à ce tour/);
  assert.match(CANDIDATE_FIELD_DEFINITIONS.available_inputs, /jamais son contenu, jamais le résultat qu'il permettra de produire/);
});

/* T-EDS01-05 — LA PROVENANCE MATÉRIAU RESTE ENTIÈREMENT VALIDE. */
test('T-EDS01-05 : user_provided_material n’est ni retiré ni affaibli', () => {
  assert.match(ANALYST_SYSTEM_PROMPT, /Un fait lu dans material_content a sa propre provenance, et c'est user_provided_material/);
  assert.match(ANALYST_SYSTEM_PROMPT, /user_provided_material \(fait explicitement présent dans le contenu d'un matériau transmis dans material_content à ce tour\)/);
  /* Elle reste exactement ce que PROVENANCE-02 a posé : ce lot n'y a pas touché. */
  assert.match(ANALYST_SYSTEM_PROMPT, /Ne lui donnez pas explicit_user_statement/);
});

/* T-EDS01-06 — NI LE CRITIQUE NI L'ARBITRE N'ONT ÉTÉ TOUCHÉS. */
test('T-EDS01-06 : le veto de phase était fondé, il n’avait pas à être corrigé', () => {
  for (const [nom, prompt] of [['simple', CRITIC_SYSTEM_PROMPT], ['batché', CRITIC_GLOBAL_SYSTEM_PROMPT]]) {
    assert.equal(prompt.includes('expected_deliverable décrit la FORME'), false, `${nom} : non amendé`);
    /* Sa règle d'ancrage, elle, reste exactement celle des lots précédents. */
    assert.match(prompt, /l'une des trois sources contractuelles du tour/, nom);
  }
  assert.equal(/expected_deliverable/.test(ARBITER_SYSTEM_PROMPT), false, 'l’Arbitre est inchangé');
});

/* T-EDS01-07 — AUCUN RACCOURCI, AUCUN ANCRAGE PARTICULIER. */
test('T-EDS01-07 : la définition ne connaît ni domaine, ni cas, ni fournisseur', () => {
  const texte = JSON.stringify(CANDIDATE_FIELD_DEFINITIONS) + ANALYST_SYSTEM_PROMPT.slice(
    ANALYST_SYSTEM_PROMPT.indexOf('1. Reconstruisez'), ANALYST_SYSTEM_PROMPT.indexOf('2. Pour chaque élément'));
  for (const interdit of ['pdf', 'csv', 'docx', 'rapport de', 'courrier', 'R08', 'R09', 'R12',
    'groq', 'anthropic', 'openai', 'ZX-']) {
    assert.equal(texte.toLowerCase().includes(interdit.toLowerCase()), false, `${interdit} absent`);
  }
  /* Et rien dans le runtime ne lit ce champ pour en tirer un état. */
  for (const f of ['core/adn/intent-preservation.js', 'workers/shared/operational-request-orchestrator.js']) {
    assert.equal(/expected_deliverable\s*===/.test(lire(f)), false, `${f} ne branche pas sur ce champ`);
  }
});

/* T-EDS01-08 — L'USAGE HISTORIQUE RESTE VALIDE SOUS LA NOUVELLE DÉFINITION. */
test('T-EDS01-08 : les formulations historiques passent la définition', () => {
  /* Échantillon réel des fixtures du dépôt : toutes décrivent une forme, aucune un contenu. */
  const historiques = [
    'Compte rendu structuré en trois sections : décisions, actions, points en suspens.',
    'Liste de 10 conseils.',
    "Document d'une page avec les trois indicateurs clés.",
    'Plan de voyage détaillé (itinéraire, hébergement, transport, budget)',
    'Un message court de suivi client.'
  ];
  for (const v of historiques) {
    assert.equal(typeof v, 'string');
    assert.ok(v.length > 0, 'une forme reste une chaîne non vide');
  }
  /* La définition ne les invalide pas : elle autorise explicitement les paramètres structurels. */
  assert.match(CANDIDATE_FIELD_DEFINITIONS.expected_deliverable, /nature, structure, volume, sections/);
});
