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
  /* Deux champs définis, pas dix : ce lot ne rouvre pas les huit autres. */
  assert.deepEqual(Object.keys(CANDIDATE_FIELD_DEFINITIONS).sort(), ['expected_deliverable', 'objective']);
});

/* T-EDS01-02 — LE CONTRAT DE STRUCTURE N'A PAS BOUGÉ. */
test('T-EDS01-02 : aucun champ ajouté, retiré ni renommé', () => {
  assert.deepEqual([...CANDIDATE_SCALAR_FIELDS], ['objective', 'expected_deliverable']);
  assert.equal(CANDIDATE_FIELDS.length, 10);
  assert.deepEqual(Object.keys(ANALYST_JSON_SCHEMA.properties.operational_request_candidate.properties), [...CANDIDATE_FIELDS]);
  /* Le type reste une chaîne : définir n'est pas contraindre la forme technique. */
  assert.deepEqual(ANALYST_JSON_SCHEMA.properties.operational_request_candidate.properties.expected_deliverable, { type: 'string' });
});

/* T-EDS01-03 — LE CORRECTIF DE PROMPT A ÉTÉ MESURÉ, PUIS RETIRÉ.
 *
 * La définition (T-EDS01-01) est établie par l'usage unanime des fixtures, et elle reste. Le
 * correctif qu'on en a tiré — dire à l'Analyste que le fait « n'a sa place dans aucun champ » —
 * a été déployé et mesuré sur trente tours : il supprime bien les quatre vetos de phase, mais en
 * supprimant la valeur elle-même. L'Analyste a cessé d'émettre user_provided_material (16/30 → 0),
 * plus rien n'enregistrait que le matériau avait été lu, et blocked est passé de 10 à 23.
 *
 * LA CAUSE EST UN TROU DE CONTRAT, PAS UNE PHRASE MAL ÉCRITE. Aucun champ du candidat ne permet
 * de consigner « l'intrant requis existe et il est disponible » : remaining_unknowns porte les
 * inconnues, assumptions_allowed les hypothèses, confirmed_constraints les exigences. Le prompt
 * est donc revenu à son état antérieur, et le manque est documenté plutôt que contourné. */
test('T-EDS01-03 : le prompt de l’Analyste est revenu à son état mesuré', () => {
  assert.equal(ANALYST_SYSTEM_PROMPT.includes("Le candidat PRÉPARE la demande, il ne l'exécute pas"), false);
  assert.equal(ANALYST_SYSTEM_PROMPT.includes("il n'a sa place dans aucun champ"), false);
  /* MISSION 1 reste exactement celle des lots précédents. */
  const mission1 = ANALYST_SYSTEM_PROMPT.split('\n').filter((x) => x.trim())[5];
  assert.match(mission1, /^1\. Reconstruisez entièrement operational_request_candidate à partir de la totalité des sources reçues à ce tour/);
  assert.match(mission1, /material_content lorsqu'il vous est fourni — jamais comme un correctif du tour précédent\./);
});

/* T-EDS01-04 — LE TROU DE CONTRAT, NOMMÉ. */
test('T-EDS01-04 : aucun champ ne consigne la disponibilité d’un intrant', () => {
  /* Les dix champs existent ; aucun ne dit « l'intrant requis est disponible ». */
  assert.deepEqual([...CANDIDATE_FIELDS], ['objective', 'expected_deliverable', 'secondary_objectives',
    'confirmed_constraints', 'confirmed_priorities', 'confirmed_preferences', 'delegated_decisions',
    'external_facts_to_research', 'assumptions_allowed', 'remaining_unknowns']);
  /* Et aucun champ n'a été ajouté pour combler le manque : le §14 l'interdit sans arrêt préalable. */
  assert.equal(CANDIDATE_FIELDS.length, 10);
  assert.equal(Object.keys(CANDIDATE_FIELD_DEFINITIONS).length, 2, 'seuls les deux champs tranchés sont définis');
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
