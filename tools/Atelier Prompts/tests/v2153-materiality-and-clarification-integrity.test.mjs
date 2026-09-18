/* ATELIER PROMPTS V2.1.5.3 — UNE MAUVAISE QUESTION N'EST PAS UNE RAISON D'APPELER LE PLAN PROFOND.
 * ============================================================================
 *
 * BLOCAGE A, MESURÉ. Le plan rapide propose deux questions dans une phrase. Le garde refuse —
 * MULTIPLE_QUESTIONS, et il a raison : on ne pose qu'une question à la fois. La reprise bornée
 * repart une fois ; si elle échoue aussi, le tour rendait le silence. Or le silence porte le type
 * WAIT_FOR_DEEP_VALIDATION, et le client le lit pour ce qu'il dit. Un Core partait donc AVANT la
 * readiness — dix-huit à vingt-cinq secondes — pour réparer une question mal formée.
 *
 * Le défaut n'était ni le garde ni la reprise : c'était le TYPE du silence. « Je n'avais pas de
 * question présentable » et « la demande dépasse mes moyens » partageaient un mot. Ils ne le
 * partagent plus. Un silence venu du MODÈLE reste un WAIT : c'est lui qui a jugé.
 *
 * BLOCAGE B, MESURÉ AUSSI. Dans le parcours navigateur réel de l'audit — quatre appels rapides,
 * trois questions, puis READY — le plan rapide a demandé le budget, les dates et la durée, et
 * JAMAIS la ville de départ, alors que le budget annoncé incluait les vols. Le prompt final ne la
 * mentionne pas davantage. Une exigence de la personne dépendait donc d'une variable qu'on ne lui a
 * pas demandée, et la readiness a été prononcée sans elle.
 *
 * La consigne rapide savait déjà juger SI une question est matérielle. Elle ne savait pas choisir
 * LAQUELLE poser d'abord : rien n'y classait les manques entre eux. La règle ajoutée est générique —
 * on demande le manque dont les valeurs plausibles écarteraient le plus le résultat, et une exigence
 * dont le respect dépend d'une variable non donnée rend cette variable matérielle. Aucun mot de
 * domaine, aucune liste de variables, aucun ordre figé.
 *
 * CE QUE CES TESTS PROUVENT, ET CE QU'ILS NE PROUVENT PAS. Le blocage A est déterministe : il se
 * prouve en exécutant le chemin rapide complet, transport intercepté. Le blocage B est sémantique :
 * aucune assertion locale ne peut juger à la place du modèle si une variable est matérielle. Ces
 * tests prouvent donc que la RÈGLE est énoncée, générique et sans domaine ; la preuve qu'elle agit
 * est la mesure sur le runtime déployé, consignée dans le rapport du lot.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  runFastInteractionWithHaChain, FAST_CORRECTIONS,
  FAST_INTERACTION_SYSTEM_PROMPT, FAST_PROVIDER_ORDER, CORE_PROVIDER_ORDER, ROLE_PROVIDER_ORDER
} from '../workers/groq/src/index.js';
import { SILENT_INTERACTION, guardFastInteraction } from '../workers/shared/solicitation-policy.js';
import { CORE_SYSTEM_PROMPT, validateCoreOutput } from '../workers/shared/core-first-plane.js';
import { buildAdnState } from '../core/adn/adn-state.js';

const lire = (f) => fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const worker = lire('../workers/groq/src/index.js');
const html = lire('../atelier-prompts-v11.5-lot10g-decision-provider.html');

const DEMANDE = 'Je veux préparer un voyage à Lisbonne au printemps.';
/* FAST-SPURIOUS-CLARIFICATION-FIX-01 — une question du plan rapide cite le passage de la demande qui
   la fonde ; sans citation elle est refusée AVANT tout jugement de forme. Les fixtures de ce fichier
   éprouvent la forme et la reprise : elles citent donc la demande, mot pour mot. */
const CITATION = 'un voyage à Lisbonne au printemps';
const instantane = (historique = []) => ({
  turn_id: historique.length, original_request: DEMANDE,
  clarification_history: historique, current_answer: null,
  canonical_version: 0, material_present: false
});

/** Le transport rapide, intercepté : chaque appel rend la sortie brute qu'on lui dicte. */
function avecFournisseurRapide(t, sorties) {
  const vrai = globalThis.fetch;
  const appels = [];
  globalThis.fetch = async (url, init) => {
    const corps = JSON.parse(String(init.body));
    appels.push({ url: String(url), systeme: corps.messages[0].content });
    const sortie = sorties[Math.min(appels.length - 1, sorties.length - 1)];
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(sortie) } }],
      usage: { prompt_tokens: 900, completion_tokens: 60 }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = vrai; });
  return appels;
}
const ENV = { GROQ_API_KEY: 'gsk_test' };
const journal = () => { const vus = []; const log = (e) => vus.push(e); return { vus, log }; };
const decision = (vus) => vus.find((e) => e.event === 'fast_decision') || {};

/* ==========================================================================
 * V2153-01 à 04 — LA REPRISE RAPIDE, BORNÉE, ET CE QU'ELLE NE DÉCLENCHE PLUS
 * ======================================================================= */

/* TARGETED-FIX-POST-CODEX-01 — LE LIBELLÉ ÉPINGLÉ ICI ÉTAIT LE DÉFAUT.
 * « TEST DE MATÉRIALITÉ — c'est lui qui décide, et rien d'autre » faisait de la matérialité le
 * critère SUFFISANT, alors que l'échelle de substitution qui la précède la rend seulement
 * nécessaire. Mesuré en usage humain : six questions sur une demande courte, chacune matérielle,
 * toutes substituables. Le test gardait fidèlement une phrase qui contredisait sa propre doctrine.
 * CLASSIFICATION : HISTORICAL_IMPLEMENTATION_CONTRACT. */

test('V2153-01 : deux questions refusées, la reprise en produit une valide — aucun WAIT, aucun Core', async (t) => {
  /* Un catalogue irréductible au premier essai : aucune garde ne peut le présenter. C'est le cas
     qui ouvre réellement la reprise — une question simplement coordonnée, elle, est RÉDUITE sans
     second appel, et V2153-02 le vérifie. */
  const appels = avecFournisseurRapide(t, [
    { type: 'ASK_CLARIFICATION', text: 'Itinéraire, recommandations, liste de contrôle, ou autre chose ?', missing_determinant_evidence: CITATION },
    { type: 'ASK_CLARIFICATION', text: 'Depuis quelle ville partez-vous ?', missing_determinant_evidence: CITATION }
  ]);
  const { vus, log } = journal();
  const rendu = await runFastInteractionWithHaChain(instantane(), ENV, { log });
  assert.equal(rendu.type, 'ASK_CLARIFICATION', 'une question est posée');
  assert.equal(rendu.text, 'Depuis quelle ville partez-vous ?');
  assert.notEqual(rendu.type, SILENT_INTERACTION.type, 'aucun WAIT');
  const d = decision(vus);
  assert.equal(d.fast_replacement_attempted, true);
  assert.equal(d.fast_replacement_result, 'ACCEPTED');
  assert.equal(d.core_escalation_reason, null, 'aucune escalade vers le plan profond');
  assert.equal(appels.length, 2, 'exactement un essai et une reprise');
});

test('V2153-02 : la reprise demande la question la plus matérielle, pas la première venue', () => {
  /* La correction envoyée au second essai ne tronque pas, ne concatène pas, ne garde pas
     mécaniquement la première moitié : elle demande de CHOISIR celle qui réduit le plus
     l'incertitude. C'est le modèle qui choisit, parce que seul lui lit le sens des deux. */
  const correction = FAST_CORRECTIONS.MULTIPLE_QUESTIONS;
  assert.ok(correction, 'un refus MULTIPLE_QUESTIONS ouvre bien une reprise');
  assert.match(correction, /une seule/i);
  /* V2.2 : la reprise ne rechoisit plus le besoin — elle conserve celui qui a été énoncé et n'en
     répare que la phrase. Le choix du besoin appartient à la doctrine, pas à la réparation. */
  assert.match(correction, /Reprenez le PREMIER besoin que vous avez énoncé, sans en changer/);
  assert.equal(/change le plus ce qui sera produit/.test(correction), false,
    'aucun jugement de matérialité dans la couche de réparation');
  /* Et la garde qui refuse ne réécrit jamais : elle coupe ou elle se taît. Quand elle coupe, aucun
     second appel n'est dépensé — c'est la première préférence du contrat. */
  const deux = { type: 'ASK_CLARIFICATION', text: 'Quel est votre budget ? Et depuis quelle ville partez-vous ?', missing_determinant_evidence: CITATION };
  const garde = guardFastInteraction(deux, { original_request: DEMANDE, clarification_history: [] });
  if (garde.type !== SILENT_INTERACTION.type) {
    assert.ok(deux.text.includes(garde.text.replace(/\s*\?$/, '').trim())
      || deux.text.toLowerCase().includes(garde.text.toLowerCase().slice(0, 12)),
      'chaque mot rendu vient de la question d’origine');
    assert.equal((garde.text.match(/\?/g) || []).length, 1, 'une seule interrogation subsiste');
  }
});

test('V2153-03 : la reprise échoue — le motif est nommé, et le plan rapide ne conclut rien', async (t) => {
  /* CE QUE V2.2 A CHANGÉ ICI, ET POURQUOI. Ce lot-ci convertissait le silence en accusé de réception :
     la couche de fluidité décidait donc que la clarification était terminée — une décision qui
     appartient à OPRIE. V2.2 l'a SUPPRIMÉE. Un refus de forme irrécupérable rend la main à la même
     autorité, exécutée plus lentement : la doctrine appliquée est identique, et le motif du passage
     est relevé au lieu d'être maquillé en accusé de réception. */
  const catalogue = { type: 'ASK_CLARIFICATION', text: 'Itinéraire, recommandations, liste de contrôle, ou autre chose ?', missing_determinant_evidence: CITATION };
  const appels = avecFournisseurRapide(t, [catalogue, catalogue]);
  const { vus, log } = journal();
  const rendu = await runFastInteractionWithHaChain(instantane(), ENV, { log });
  const d = decision(vus);
  assert.equal(rendu.type, SILENT_INTERACTION.type, 'le plan rapide constate, il ne conclut pas');
  assert.equal(d.fast_rejection_reason, 'DISPLAY_FRONTIER');
  assert.equal(d.fast_replacement_result, 'REFUSED_AGAIN');
  assert.equal(d.deep_trigger_reason, 'FAST_FORM_UNRECOVERABLE', 'le motif du passage est explicable');
  assert.equal(d.semantic_authority, 'OPRIE');
  assert.equal(d.ready_decision_source, null, 'le plan rapide ne produit aucune readiness');
  assert.equal(appels.length, 2, 'un essai, une reprise, et rien de plus');
});


test('V2153-04 : jamais plus de deux appels rapides pour une clarification', async (t) => {
  const catalogue = { type: 'ASK_CLARIFICATION', text: 'Itinéraire, recommandations, liste de contrôle, ou autre chose ?', missing_determinant_evidence: CITATION };
  const appels = avecFournisseurRapide(t, [catalogue, catalogue, catalogue, catalogue]);
  await runFastInteractionWithHaChain(instantane(), ENV, { log: () => {} });
  assert.equal(appels.length, 2, 'un essai, une reprise, et rien de plus');
  /* La borne est structurelle, pas conventionnelle : la reprise ne s’appelle pas elle-même. */
  const debut = worker.indexOf('async function rattraperQuestionRefusee(');
  const bloc = worker.slice(debut, worker.indexOf('\n}', debut) + 2);
  assert.ok(bloc.length > 400 && bloc.length < 3000, 'le corps de la reprise est bien isolé');
  assert.equal((bloc.match(/rattraperQuestionRefusee\(/g) || []).length, 1, 'aucune récursion');
  assert.equal(/while\s*\(|for\s*\(/.test(bloc), false, 'aucune boucle');
  assert.equal((bloc.match(/FAST_INTERACTION_ADAPTERS\[name\]\(/g) || []).length, 1,
    'un seul appel fournisseur dans la reprise');
});

test('V2153-A : la conversion de silence est supprimée, pas déplacée', () => {
  /* V2.2 : une couche de fluidité qui conclut à la place du chef n'a pas de place dans
     l'orchestration. La fonction a été retirée, et aucun équivalent ne l'a remplacée. */
  assert.equal(/convertirSilenceDeForme/.test(worker), false);
  assert.equal(/Merci, je poursuis avec ce que vous m/.test(worker), false,
    'aucun accusé de réception fabriqué par la couche rapide');
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /WAIT_FOR_DEEP_VALIDATION est EXCEPTIONNEL/);
});

/* ==========================================================================
 * V2153-05 à 09 — LA MATÉRIALITÉ ET LA PRIORITÉ, ÉNONCÉES SANS DOMAINE
 * ======================================================================= */

test('V2153-05 / 06 / 07 / 08 : la règle nomme les dimensions qui rendent une inconnue non substituable', () => {
  /* Les cinq dimensions du contrat : coût, faisabilité, structure, validité, recommandation. */
  for (const dimension of ['coût', 'faisabilité', 'structure', 'validité', 'recommandation']) {
    assert.ok(FAST_INTERACTION_SYSTEM_PROMPT.includes(dimension),
      `la consigne rapide nomme ${dimension}`);
  }
  /* Et le test d'impact reste la seule autorité : une inconnue sans impact n'ouvre pas de question. */
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /TEST DE MATÉRIALITÉ — il OUVRE la question, il ne la justifie pas/);
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /Si non, ne la\s+posez pas, même si l'information manque/);
  /* Une inconnue de confort reste substituable : les voies de substitution sont intactes. */
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /décidée, estimée, traitée par scénario, conditionnée, ou laissée explicitement inconnue/);
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /Demander une précision est le dernier recours/);
  /* Non substituable ne veut pas dire « demander tout de suite » : le garde-fou tient. */
  assert.match(CORE_SYSTEM_PROMPT, /traitez-la par scénarios, conditionnez ce qui en dépend, ou laissez-la explicitement inconnue/);
});

test('V2153-09 : entre plusieurs manques, la consigne impose de classer par impact', () => {
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /PLUSIEURS MANQUES, UNE SEULE QUESTION/);
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /valeurs plausibles écarteraient\s+le plus le résultat/);
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /Jamais selon l'ordre d'apparition, ni selon l'habitude/);
  /* LA CLAUSE QUI MANQUAIT, et que le parcours owner a rendue visible : une exigence dont le respect
     dépend d'une variable non donnée rend cette variable matérielle. Générique — elle ne nomme ni
     budget, ni vol, ni ville. */
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT,
    /exigence dont le respect DÉPEND d'une variable qu'elle n'a pas donnée, cette variable est\s+matérielle/);
  /* Aucun dictionnaire de domaine nulle part dans les deux consignes. */
  /* Mots ENTIERS : « vol » ne doit pas se confondre avec « volume », qui est un mot de forme. */
  for (const mot of ['vol', 'vols', 'aéroport', 'ville de départ', 'hébergement', 'airbnb', 'nuit',
                     'nuits', 'hôtel']) {
    const re = new RegExp(`\\b${mot}\\b`, 'i');
    assert.equal(re.test(FAST_INTERACTION_SYSTEM_PROMPT), false, `« ${mot} » absent de la consigne rapide`);
    assert.equal(re.test(CORE_SYSTEM_PROMPT), false, `« ${mot} » absent de la consigne Core`);
  }
});

test('V2153-générique : la règle se lit sans domaine, et un cas hors voyage le montre', () => {
  /* Cas abstrait n° 1 — le coût dépend d'une quantité non donnée : la quantité est matérielle,
     parce qu'une exigence énoncée (le budget) dépend d'elle. La consigne le dit en ces termes,
     sans jamais parler de quantité précise ni de prix. */
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /son coût, sa faisabilité, sa structure, sa validité, ou la recommandation/);
  /* Cas abstrait n° 2 — une préférence esthétique laisse le résultat valide : elle est substituable,
     et la consigne interdit de la transformer en question. */
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /deux préférences de goût, elles, donnent la même chose autrement colorée/);
  /* Et le jugement reste par IMPACT, jamais par étiquette — l'acquis V2.1.2 est intact. */
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /c'est l'IMPACT qui tranche,\s+jamais l'étiquette/);
});

/* ==========================================================================
 * V2153-10 / 11 — LA DURÉE, LES NUITS, ET CE QU'UNE HYPOTHÈSE N'AUTORISE PAS
 * ======================================================================= */

test('V2153-10 / V2153-11 : une hypothèse matérielle ne devient pas un paramètre d’exécution', () => {
  assert.match(CORE_SYSTEM_PROMPT, /UNE HYPOTHÈSE MATÉRIELLE NE SE FIGE PAS/);
  assert.match(CORE_SYSTEM_PROMPT, /Étiqueter honnêtement une hypothèse ne suffit pas à en faire un paramètre d'exécution/);
  assert.match(CORE_SYSTEM_PROMPT, /Avant qu'une hypothèse serve de valeur à une recherche, une comparaison, un coût ou un calcul/);
  assert.match(CORE_SYSTEM_PROMPT, /une inconnue matérielle remplacée en silence par une valeur arbitraire, elle, fabrique une readiness que rien ne soutient/);
  /* Et l'acquis V2.1.5.2 tient : la dérivation reste une hypothèse, jamais une déclaration. */
  const etat = buildAdnState({
    demande: DEMANDE,
    decision: { etat_demande: 'exploitable', route: 'rapide', raison_interne: 'Contrat complet.', question: null },
    intent: { objective: 'Préparer un voyage.', deliverable: 'Un plan.',
      explicit_constraints: [{ text: 'Durée du séjour : 4 jours', source: 'oprie', confirmed: true, evidence_id: null }] },
    obligations: [{ id: 'a0', text: 'Le séjour couvre 4 nuits', source: 'arch_analysis', mandatory: true, check_ids: [] }],
    evidence: {}, executability: {}, assumptions: ['Le séjour est provisoirement traité comme 4 nuits'],
    output: {}, checks: [], quantities: [], discipline: {}
  });
  const parTexte = (t) => (etat.completeness.obligations.find((o) => o.text === t) || {}).source;
  assert.equal(parTexte('Durée du séjour : 4 jours'), 'user');
  assert.equal(parTexte('Le séjour couvre 4 nuits'), 'system');
  for (const h of Object.values(etat.assumptions)) {
    if (h && h.text) assert.equal(h.source, 'deduction');
  }
});

/* ==========================================================================
 * NON-RÉGRESSION DES LOTS PRÉCÉDENTS
 * ======================================================================= */

test('V2153-régression : V2.1.5.1, V2.1.5.2 et la haute disponibilité sont intacts', () => {
  /* V2.1.5.1 — ready exige concerns vide, et le validateur n'a pas bougé. */
  assert.match(CORE_SYSTEM_PROMPT,
    /operational_request_ready exige que les trois booléens soient vrais ET que concerns soit vide/);
  assert.throws(() => validateCoreOutput({
    state: 'operational_request_ready',
    operational_request_candidate: {
      objective: 'o', expected_deliverable: 'd', secondary_objectives: [], confirmed_constraints: [],
      confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [],
      external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [], available_inputs: []
    },
    issues: [], next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: ['Réserve.'] },
    reason: 'r', question_candidates: [], escalation: { needed: false, kind: null, reason: null }
  }), /operational_request_ready exige une liste concerns vide/);
  /* V2.1.5.2 — la provenance ne se promeut pas. */
  assert.match(lire('../core/adn/adn-state.js'), /function resolveItemSource\(source\)/);
  /* Haute disponibilité V2.1.4 et reprise « plan profond seul » V2.1.3-CORRECTION. */
  assert.deepEqual([...CORE_PROVIDER_ORDER], ['anthropic', 'openai']);
  assert.deepEqual([...ROLE_PROVIDER_ORDER], ['anthropic']);
  assert.deepEqual([...FAST_PROVIDER_ORDER], ['groq']);
  assert.match(html, /return oprieRunTurn\(adpState\.requestedMode\|\|'rapide',\{coreOnly:true\}\);/);
  /* V2.1.5 — le plan profond n'est toujours pas un moteur de clarification. */
  assert.match(CORE_SYSTEM_PROMPT, /VOTRE PLACE DANS LE PARCOURS/);
  /* V2.2 : le plan rapide ne revendique plus la fin de la clarification ; il annonce appliquer une
     doctrine qui n'est pas la sienne. La retenue mesurée par 03A/03B reste, elle, énoncée. */
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /La doctrine ci-dessous n'est pas la vôtre/);
});
