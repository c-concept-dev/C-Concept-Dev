/* OPRIE-INPUT-AVAILABILITY-FIELD-01 — DIRE QU'UN INTRANT EST LÀ, SANS LE RECOPIER.
 * ============================================================================
 *
 * Le candidat savait dire ce qu'il ignore (remaining_unknowns), ce qu'il suppose
 * (assumptions_allowed), ce qu'il faut aller chercher (external_facts_to_research). Il ne savait
 * pas dire l'inverse : « cet intrant est nécessaire, et il est là ».
 *
 * Faute de cet emplacement, la disponibilité s'enregistrait par EFFET DE BORD — la valeur recopiée
 * dans expected_deliverable — ce que le Critique sanctionnait à raison. Et l'interdire sans fournir
 * le canal a fait passer blocked de 10/30 à 23/30 : l'information disparaissait au lieu de changer
 * de place. Ce lot fournit le canal.
 *
 * UN SEUL CHAMP, ET IL EST OPTIONNEL POUR UNE RAISON PRÉCISE. Le schéma du candidat a `required`
 * égal à `properties` : y ajouter un champ invaliderait d'un coup tout candidat écrit avant ce lot.
 * Il est donc exigé du MODÈLE — pour qu'il s'en serve — et toléré absent du VALIDATEUR.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANDIDATE_FIELDS, CANDIDATE_LIST_FIELDS, CANDIDATE_SCALAR_FIELDS, CANDIDATE_FIELD_DEFINITIONS,
  createEmptyCandidate, normalizeCandidate, validateProvenanceRecord, PROVENANCE_VALUES
} from '../core/adn/operational-request-state.js';
import { ANALYST_SYSTEM_PROMPT, ANALYST_JSON_SCHEMA, CRITIC_SYSTEM_PROMPT,
  CRITIC_GLOBAL_SYSTEM_PROMPT, ARBITER_SYSTEM_PROMPT } from '../workers/shared/operational-request-core.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (r) => fs.readFileSync(path.join(racine, r), 'utf8');
const DIX = Object.freeze(['objective', 'expected_deliverable', 'secondary_objectives', 'confirmed_constraints',
  'confirmed_priorities', 'confirmed_preferences', 'delegated_decisions', 'external_facts_to_research',
  'assumptions_allowed', 'remaining_unknowns']);

/* T-IAF01-01 — UN SEUL CHAMP AJOUTÉ, LES DIX AUTRES INTACTS. */
test('T-IAF01-01 : extension minimale du candidat', () => {
  assert.deepEqual([...CANDIDATE_FIELDS].slice(0, 10), [...DIX], 'les dix historiques, dans leur ordre');
  assert.deepEqual([...CANDIDATE_FIELDS].slice(10), ['available_inputs'], 'un seul champ nouveau');
  assert.equal(CANDIDATE_FIELDS.length, 11);
  /* C'est un champ de liste, comme ses voisins de même nature. */
  assert.ok(CANDIDATE_LIST_FIELDS.includes('available_inputs'));
  assert.deepEqual([...CANDIDATE_SCALAR_FIELDS], ['objective', 'expected_deliverable'], 'aucun scalaire ajouté');
});

/* T-IAF01-02 — LE NOM SUIT LES CONVENTIONS, ET N'ENCODE RIEN D'AUTRE. */
test('T-IAF01-02 : générique, sans domaine, sans fournisseur, sans protocole', () => {
  const nom = 'available_inputs';
  for (const interdit of ['pdf', 'csv', 'docx', 'image', 'mime', 'file', 'filename', 'upload',
    'material', 'groq', 'anthropic', 'openai', 'http']) {
    assert.equal(nom.includes(interdit), false, `le nom ne dit rien de « ${interdit} »`);
  }
  /* Il ne porte pas le préfixe confirmed_, réservé à ce que la personne confirme : la
     disponibilité, elle, est établie par le système. */
  assert.equal(nom.startsWith('confirmed_'), false);
});

/* T-IAF01-03 — LA DÉFINITION DIT L'INTRANT, PAS SON CONTENU. */
test('T-IAF01-03 : la définition normative existe et borne le champ', () => {
  const d = CANDIDATE_FIELD_DEFINITIONS.available_inputs;
  assert.match(d, /nécessaire à l'exécution et dont la disponibilité est établie à ce tour/);
  assert.match(d, /Décrit l'intrant — ce dont l'exécution aura besoin — jamais son contenu/);
  assert.match(d, /jamais le résultat qu'il permettra de produire/);
  /* Disponible n'est ni suffisant, ni une readiness. */
  assert.match(d, /ne signifie ni suffisant, ni correct, ni pertinent, et ne rend jamais une demande prête/);
});

/* T-IAF01-04 — EXIGÉ DU MODÈLE, TOLÉRÉ ABSENT DU VALIDATEUR. */
test('T-IAF01-04 : rétrocompatible, sans relâcher le contrat', () => {
  const schema = ANALYST_JSON_SCHEMA.properties.operational_request_candidate;
  assert.ok(schema.required.includes('available_inputs'), 'le modèle doit l’émettre');
  assert.deepEqual(schema.properties.available_inputs, { type: 'array', items: { type: 'string' } });
  assert.equal(schema.additionalProperties, false);
  /* Un candidat écrit avant ce lot reste valide, et son absence vaut liste vide. */
  const ancien = {};
  for (const f of DIX) ancien[f] = f === 'objective' || f === 'expected_deliverable' ? 'x' : [];
  const normalise = normalizeCandidate(ancien);
  assert.deepEqual(normalise.available_inputs, []);
  /* Les dix autres restent obligatoires : on nomme une exception, on n’ouvre pas le contrat. */
  const ampute = { ...ancien }; delete ampute.remaining_unknowns;
  assert.throws(() => normalizeCandidate(ampute), /champs inattendus ou manquants/);
  /* Et le candidat vide le porte, vide. */
  assert.deepEqual(createEmptyCandidate().available_inputs, []);
});

/* T-IAF01-05 — LA PROVENANCE S'Y APPLIQUE, SANS CHANGER DE VOCABULAIRE. */
test('T-IAF01-05 : une disponibilité se trace comme tout élément du candidat', () => {
  const rec = validateProvenanceRecord({ field: 'available_inputs',
    value: 'le numéro de dossier, présent dans le matériau transmis', provenance: 'user_provided_material' });
  assert.equal(rec.field, 'available_inputs');
  assert.equal(rec.provenance, 'user_provided_material');
  /* Aucune valeur de provenance n’a été ajoutée : le vocabulaire est celui de PROVENANCE-02. */
  assert.equal(PROVENANCE_VALUES.length, 9);
  assert.equal(PROVENANCE_VALUES[PROVENANCE_VALUES.length - 1], 'user_provided_material');
});

/* T-IAF01-06 — L'ANALYSTE SAIT OÙ CONSIGNER, ET QUOI NE PAS RECOPIER. */
test('T-IAF01-06 : la règle de phase a enfin une destination', () => {
  assert.match(ANALYST_SYSTEM_PROMPT, /Le candidat PRÉPARE la demande, il ne l'exécute pas/);
  assert.match(ANALYST_SYSTEM_PROMPT, /consignez dans available_inputs l'INTRANT dont l'exécution aura besoin/);
  assert.match(ANALYST_SYSTEM_PROMPT, /DÉCRIT et jamais recopié/);
  assert.match(ANALYST_SYSTEM_PROMPT, /available_inputs n'est ni une readiness, ni une garantie/);
  assert.match(ANALYST_SYSTEM_PROMPT, /laisser ce champ vide reste parfaitement valide/);
  /* Et expected_deliverable garde exactement la définition du lot précédent. */
  assert.match(ANALYST_SYSTEM_PROMPT, /expected_deliverable décrit la FORME du résultat attendu/);
  assert.match(CANDIDATE_FIELD_DEFINITIONS.expected_deliverable, /Jamais le contenu final/);
});

/* T-IAF01-07 — AUCUNE NOUVELLE AUTORITÉ, AUCUN RACCOURCI VERS READY. */
test('T-IAF01-07 : la disponibilité ne décide de rien', () => {
  for (const etat of ['operational_request_ready', 'clarification_required', 'confirmation_required', 'blocked']) {
    assert.equal(ANALYST_SYSTEM_PROMPT.includes(etat), false, `${etat} absent du prompt Analyste`);
  }
  /* Aucun branchement runtime ne lit ce champ pour en tirer un état. */
  /* L'orchestrateur NOMME available_inputs depuis OPRIE-ARBITER-MATERIAL-CONTEXT-DELIVERY-01,
     uniquement pour lever un drapeau de présence dans une trace metadata — jamais une valeur.
     Ce que la garde protège vraiment : aucun état n'en est dérivé. */
  assert.equal(lire('core/adn/intent-preservation.js').includes('available_inputs'), false);
  const orch = lire('workers/shared/operational-request-orchestrator.js');
  assert.match(orch, /arbiter_available_inputs_present: disponibles\.length > 0/);
  for (const etat of ['operational_request_ready', 'clarification_required', 'blocked']) {
    assert.equal(new RegExp(`available_inputs[^\\n]*${etat}`).test(orch), false, 'aucun état dérivé');
  }
});

/* T-IAF01-08 — NI LE CRITIQUE NI L'ARBITRE N'ONT ÉTÉ AMENDÉS. */
test('T-IAF01-08 : les consommateurs suivent le contrat sans règle spéciale', () => {
  for (const [nom, p] of [['simple', CRITIC_SYSTEM_PROMPT], ['batché', CRITIC_GLOBAL_SYSTEM_PROMPT]]) {
    assert.equal(p.includes('available_inputs'), false, `${nom} : aucune règle spéciale`);
    /* Leur règle d'ancrage suffit : une valeur d'available_inputs porte une provenance comme les autres. */
    assert.match(p, /l'une des trois sources contractuelles du tour/, nom);
  }
  assert.equal(ARBITER_SYSTEM_PROMPT.includes('available_inputs'), false, 'l’Arbitre est inchangé');
  /* Il le reçoit néanmoins, comme tout champ du candidat, sans logique dédiée. */
  assert.ok(CANDIDATE_FIELDS.includes('available_inputs'));
});
