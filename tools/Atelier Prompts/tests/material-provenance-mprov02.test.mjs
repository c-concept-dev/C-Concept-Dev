/* OPRIE-MATERIAL-PROVENANCE-02 — LE VOCABULAIRE AVAIT UN TROU, PAS LE CONTRÔLE.
 * ============================================================================
 *
 * L'Analyste portait ce qu'il lit dans un matériau avec `explicit_user_statement`, et le Critique
 * refusait. L'audit précédent a montré pourquoi personne n'avait tort : aucune des huit valeurs du
 * CDC §6 ne désignait un fait porté par `material_content`, troisième source du plan profond
 * depuis OPRIE-MATERIAL-CONTENT-02. Faute de valeur juste, l'Analyste en employait une fausse ;
 * le Critique la sanctionnait, à raison.
 *
 * CE LOT AJOUTE LA VALEUR QUI MANQUAIT, ET RIEN D'AUTRE. Une seule, générique — ni format, ni
 * domaine, ni fournisseur, ni protocole dans le nom. Les huit historiques sont intactes, dans leur
 * ordre, avec exactement leur sens.
 *
 * ET IL NE DÉSARME PAS LE CRITIQUE. La règle d'ancrage passe de deux sources à trois parce que le
 * contrat en compte trois — ce n'est pas une exemption accordée à une provenance, c'est une
 * énumération remise à jour. Le Critique continue de contrôler la COHÉRENCE : une provenance
 * matériau annoncée quand aucun contenu n'a été transmis reste un défaut, et il doit le dire.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVENANCE_VALUES, PROVENANCE_DEFINITIONS, validateProvenanceRecord } from '../core/adn/operational-request-state.js';
import {
  ANALYST_SYSTEM_PROMPT, CRITIC_SYSTEM_PROMPT, CRITIC_GLOBAL_SYSTEM_PROMPT, ARBITER_SYSTEM_PROMPT,
  ANALYST_JSON_SCHEMA, makeCriticUserMessage, makeArbiterUserMessage
} from '../workers/shared/operational-request-core.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (r) => fs.readFileSync(path.join(racine, r), 'utf8');
const HUIT = Object.freeze(['explicit_user_statement', 'clarification_answer', 'confirmed_preference',
  'safe_deduction', 'delegated_decision', 'external_fact_to_research', 'labeled_estimate', 'conditional_scenario']);

/* T-MPROV02-01 — UNE SEULE VALEUR AJOUTÉE, ET LES HUIT AUTRES INTACTES. */
test('T-MPROV02-01 : extension additive, minimale, dans l’ordre', () => {
  assert.deepEqual([...PROVENANCE_VALUES].slice(0, 8), [...HUIT], 'les huit du CDC, inchangées et dans leur ordre');
  assert.deepEqual([...PROVENANCE_VALUES].slice(8), ['user_provided_material'], 'une seule valeur nouvelle');
  assert.equal(PROVENANCE_VALUES.length, 9);
});

/* T-MPROV02-02 — LE NOM N'ENCODE NI FORMAT, NI DOMAINE, NI FOURNISSEUR, NI PROTOCOLE. */
test('T-MPROV02-02 : la provenance reste générique', () => {
  const nouvelle = 'user_provided_material';
  for (const interdit of ['pdf', 'csv', 'docx', 'image', 'json', 'html', 'file', 'attachment', 'upload',
    'groq', 'anthropic', 'openai', 'http', 'field', 'content_field']) {
    assert.equal(nouvelle.includes(interdit), false, `le nom ne dit rien de « ${interdit} »`);
  }
  /* Et aucune taxonomie parallèle n'a été créée en même temps. */
  for (const jamais of ['document_fact', 'attachment_fact', 'pdf_fact', 'csv_fact', 'image_fact', 'material_fact']) {
    assert.equal(PROVENANCE_VALUES.includes(jamais), false, `${jamais} n’existe pas`);
  }
});

/* T-MPROV02-03 — LES DEUX VALEURS EN JEU SONT DÉFINIES, LES AUTRES NE SONT PAS TOUCHÉES. */
test('T-MPROV02-03 : une définition normative existe là où le silence bloquait', () => {
  assert.match(PROVENANCE_DEFINITIONS.explicit_user_statement,
    /explicitement déclaré par la personne dans original_request ou dans clarification_history/);
  assert.match(PROVENANCE_DEFINITIONS.user_provided_material,
    /explicitement présent dans le contenu d'un matériau fourni par la personne et transmis à l'Analyste pendant le tour courant/);
  /* Provenance = origine. Jamais vérité, suffisance ou pertinence. */
  assert.match(PROVENANCE_DEFINITIONS.user_provided_material,
    /jamais sa véracité, sa suffisance ni sa pertinence/);
  /* Aucun chantier encyclopédique : les six autres restent définies par leurs usages. */
  assert.deepEqual(Object.keys(PROVENANCE_DEFINITIONS).sort(), ['explicit_user_statement', 'user_provided_material']);
});

/* T-MPROV02-04 — LE SCHÉMA ENVOYÉ AUX FOURNISSEURS PORTE LA VALEUR, ET RESTE STRICT. */
test('T-MPROV02-04 : l’enum du schéma suit le contrat, la validation reste stricte', () => {
  const rec = ANALYST_JSON_SCHEMA.properties.provenance_records.items;
  assert.deepEqual([...rec.properties.provenance.enum], [...PROVENANCE_VALUES]);
  assert.equal(rec.additionalProperties, false);
  assert.deepEqual([...rec.required], ['field', 'value', 'provenance']);
  assert.equal(rec.properties.value.minLength, 1);
  /* Le validateur accepte la nouvelle valeur et refuse toujours l'inconnu. */
  const ok = validateProvenanceRecord({ field: 'objective', value: 'ZX-4821', provenance: 'user_provided_material' });
  assert.equal(ok.provenance, 'user_provided_material');
  assert.throws(() => validateProvenanceRecord({ field: 'objective', value: 'x', provenance: 'document_fact' }),
    /Valeur de provenance invalide/);
});

/* T-MPROV02-05 — RÉTROCOMPATIBILITÉ : LES HUIT GARDENT LEUR SENS. */
test('T-MPROV02-05 : aucune valeur historique ne change de signification', () => {
  for (const v of HUIT) {
    assert.equal(validateProvenanceRecord({ field: 'objective', value: 'v', provenance: v }).provenance, v);
  }
  /* explicit_user_statement garde exactement son emploi historique : la personne l'a écrit. */
  assert.match(ANALYST_SYSTEM_PROMPT,
    /explicit_user_statement \(fait explicitement déclaré par la personne dans original_request ou clarification_history\)/);
});

/* T-MPROV02-06 — L'ANALYSTE ÉCRIT LA BONNE PROVENANCE, ET NE LA CONFOND AVEC RIEN. */
test('T-MPROV02-06 : le contrat de l’Analyste distingue lire, entendre et déduire', () => {
  assert.match(ANALYST_SYSTEM_PROMPT, /Un fait lu dans material_content a sa propre provenance, et c'est user_provided_material/);
  assert.match(ANALYST_SYSTEM_PROMPT, /Ne lui donnez pas explicit_user_statement/);
  assert.match(ANALYST_SYSTEM_PROMPT, /lire un fait dans un document fourni et l'entendre énoncé par la personne sont deux origines distinctes/);
  /* Une déduction reste une déduction — pas un fait lu. */
  assert.match(ANALYST_SYSTEM_PROMPT, /ni pour une déduction que vous en tirez, qui relève de safe_deduction/);
  /* Et rien n'autorise à l'employer quand aucun contenu n'est arrivé. */
  assert.match(ANALYST_SYSTEM_PROMPT, /ni pour un fait dont vous supposeriez la présence alors qu'aucun contenu ne vous est parvenu/);
  assert.match(ANALYST_SYSTEM_PROMPT, /que si le fait figure réellement dans le material_content de CE tour/);
});

/* T-MPROV02-07 — LA RÈGLE D'ANCRAGE COMPTE TROIS SOURCES, DANS LES DEUX PROMPTS CRITIQUE. */
test('T-MPROV02-07 : le Critique connaît la troisième source, partout', () => {
  for (const [nom, prompt] of [['simple', CRITIC_SYSTEM_PROMPT], ['batché', CRITIC_GLOBAL_SYSTEM_PROMPT]]) {
    assert.match(prompt, /l'une des trois sources contractuelles du tour : original_request, clarification_history, ou le matériau transmis à l'Analyste/,
      `prompt ${nom}`);
    assert.match(prompt, /Un élément portant la provenance user_provided_material est ancré dans ce matériau/, `prompt ${nom}`);
    /* L'ancienne énumération à deux sources a disparu des deux. */
    assert.equal(/ancré dans original_request ou clarification_history via sa provenance déclarée/.test(prompt), false,
      `prompt ${nom} : plus d’énumération périmée`);
  }
});

/* T-MPROV02-08 — PAS D'EXEMPTION AVEUGLE : LE CONTRÔLE DE COHÉRENCE RESTE, DANS LES DEUX SENS. */
test('T-MPROV02-08 : le Critique contrôle toujours, il ne fait pas confiance', () => {
  for (const prompt of [CRITIC_SYSTEM_PROMPT, CRITIC_GLOBAL_SYSTEM_PROMPT]) {
    assert.match(prompt, /Cela ne vous demande aucune confiance aveugle et ne rend la valeur ni vraie, ni suffisante, ni pertinente/);
    assert.match(prompt, /vous contrôlez la COHÉRENCE de la provenance déclarée, jamais un contenu que vous ne recevez pas/);
    /* Incohérence dans un sens : provenance matériau sans contenu transmis. */
    assert.match(prompt, /Une provenance user_provided_material alors que material_context indique deep_content_available false ou "unknown" est incohérente et doit être signalée/);
    /* Incohérence dans l'autre : valeur attribuée à la personne mais introuvable chez elle. */
    assert.match(prompt, /une provenance explicit_user_statement ou clarification_answer portant une valeur introuvable dans la demande ou l'historique l'est tout autant/);
    /* Et la sanction reste celle qui existait. */
    assert.match(prompt, /Listez dans unsupported_additions_found/);
  }
});

/* T-MPROV02-09 — AUCUN RACCOURCI SÉMANTIQUE, NI DANS LE PROMPT NI DANS LE CODE. */
test('T-MPROV02-09 : une provenance ne décide jamais d’un état', () => {
  for (const etat of ['operational_request_ready', 'clarification_required', 'confirmation_required', 'blocked']) {
    assert.equal(ANALYST_SYSTEM_PROMPT.includes(etat), false, `${etat} absent du prompt Analyste`);
  }
  /* Aucun branchement runtime ne lit la valeur pour en tirer une conclusion. */
  for (const f of ['core/adn/intent-preservation.js', 'workers/shared/operational-request-orchestrator.js']) {
    const src = lire(f);
    assert.equal(src.includes('user_provided_material'), false, `${f} ne connaît aucune valeur de provenance`);
  }
  /* assessProvenance reste indifférent à l'étiquette : ce lot ne le transforme pas en juge. */
  const ip = lire('core/adn/intent-preservation.js');
  assert.match(ip, /records\.some\(\(record\) => record\.field === field && sameValue\(record\.value, value\)\)/);
  assert.equal(/record\.provenance\s*===/.test(ip), false, 'aucune comparaison de provenance introduite');
});

/* T-MPROV02-10 — NI LE CRITIQUE NI L'ARBITRE NE REÇOIVENT LE CONTENU. */
test('T-MPROV02-10 : la provenance voyage, le matériau non', () => {
  const commun = { original_request: 'Extrais le numéro du matériau.', clarification_history: [],
    material_context: { present: true, deep_content_available: true }, material_content: ['NUMERO_DOSSIER = ZX-4821'] };
  const analyste = { operational_request_candidate: { objective: 'o' },
    provenance_records: [{ field: 'objective', value: 'ZX-4821', provenance: 'user_provided_material' }],
    issues: [], question_candidates: [], confirmation_signals: {} };
  const critique = JSON.parse(makeCriticUserMessage({ ...commun, analyst_output: analyste }));
  assert.equal(JSON.stringify(critique).includes('NUMERO_DOSSIER'), false, 'aucun contenu brut au Critique');
  assert.equal(critique.material_context.deep_content_available, true, 'mais il sait que le contenu a été transmis');
  assert.equal(JSON.stringify(critique.analyst_output.provenance_records).includes('user_provided_material'), true);
  const arbitre = JSON.parse(makeArbiterUserMessage({ ...commun, analyst_output: analyste, critic_output: { agreement: 'agree' } }));
  assert.equal(JSON.stringify(arbitre).includes('NUMERO_DOSSIER'), false, 'aucun contenu brut à l’Arbitre');
  assert.equal(Object.prototype.hasOwnProperty.call(arbitre, 'material_context'), false, 'l’Arbitre reste inchangé');
  /* Et l'Arbitre voit la provenance, puisqu'elle voyage dans analyst_output. */
  assert.match(JSON.stringify(arbitre.analyst_output.provenance_records), /user_provided_material/);
  assert.equal(/material_/.test(ARBITER_SYSTEM_PROMPT), false, 'son contrat n’a pas été touché');
});
