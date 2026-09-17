/* ATELIER PROMPTS V2.1.5.2 — CE QUI EST ATTRIBUÉ À LA PERSONNE DOIT VENIR D'ELLE.
 * ============================================================================
 *
 * LE DÉFAUT OWNER. La personne a dit « 4 jours ». L'ADN a présenté « Durée du séjour : 4 jours
 * (4 nuits) » avec `source = user` et `mandatory = true`. Personne n'avait prononcé « 4 nuits ».
 *
 * MESURE RAPPORTÉE PAR LE LOT INITIAL, NON PREUVE D'ABSENCE DE DÉFAUT : huit
 * exécutions du dialogue exact du propriétaire sur le runtime déployé donnent quatre contraintes
 * fidèles — « Durée du séjour : 4 jours », « Budget total de 1 200 € pour 2 personnes, vols
 * inclus », « Départ depuis Marseille », « Période : fin mars » — et rangent la dérivation là où
 * elle doit être : `assumptions_allowed` porte « Les 4 jours s'entendent comme 4 jours pleins ou
 * 3 nuits selon la configuration des vols ». Inflation dans les contraintes : 0 sur 8.
 *
 * AUDIT INDÉPENDANT : la trace owner du 2026-09-13T15:36:29.593Z contient déjà « 4 jours (4 nuits) »
 * dans confirmed_constraints du Core. L'exclusion historique du Core était donc fausse.
 * Les tests ci-dessous couvrent un autre chemin réel : l'enrichissement Architecte émet
 * ses obligations avec `source: 'arch_analysis'`, l'enrichissement Rapide avec
 * `source: 'derived_deterministic'`. L'étiquette était perdue plus loin, dans
 * `core/adn/adn-state.js` : le repli d'une source inconnue y était « user ». Une valeur dérivée
 * devenait une déclaration de la personne PAR DÉFAUT, sans qu'aucune décision ne soit prise.
 *
 * LA CORRECTION. On ne peut revendiquer `user` que si le producteur l'a réellement dit. Le repli
 * devient « system ». Une obligation promue depuis une contrainte hérite de la source de cette
 * contrainte au lieu d'être requalifiée. Aucun texte n'est réécrit, aucun nettoyage final n'est
 * ajouté, aucun vocabulaire nouveau n'est créé : les trois valeurs de l'énumération existante
 * suffisent.
 *
 * ET EN AMONT, la consigne Core énonce désormais la séparation que le contrat supposait déjà —
 * même geste qu'en V2.1.5.1 : rendre explicite un invariant qu'on exigeait en silence.
 *
 * CE QUE CE LOT NE FAIT PAS, ET C'EST UN CHOIX. Il ne juge pas la fidélité sémantique d'une
 * reformulation à la place du Core. Seul le Core voit le dialogue ; l'ADN, lui, ne reçoit que du
 * texte déjà normalisé, sans `clarification_history`. Un contrôle d'implication au niveau ADN
 * n'aurait donc rien à comparer, et un contrôle lexical y refuserait les paraphrases légitimes que
 * le propriétaire veut conserver — « 1200 euros pour 2 avec vols compris » devient « Budget total
 * de 1 200 € pour 2 personnes, vols inclus », et c'est correct. La garantie est donc répartie : le
 * Core décide de la fidélité, l'ADN ne promeut plus rien.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildAdnState } from '../core/adn/adn-state.js';
import { mapOprieToCanonicalContract } from '../core/adn/oprie-canonical-mapping.js';
import { canonicalToArchProjectionInput, ARCH_ENRICHABLE_PATHS } from '../core/adn/arch-canonical-enrichment.js';
import { CORE_SYSTEM_PROMPT, validateCoreOutput } from '../workers/shared/core-first-plane.js';
import { PROVENANCE_VALUES } from '../core/adn/operational-request-state.js';
import {
  CORE_PROVIDER_ORDER, ROLE_PROVIDER_ORDER, FAST_INTERACTION_SYSTEM_PROMPT, FAST_PROVIDER_ORDER
} from '../workers/groq/src/index.js';

const lire = (f) => fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const etatAdn = lire('../core/adn/adn-state.js');
const html = lire('../atelier-prompts-v11.5-lot10g-decision-provider.html');

/* Le dialogue RÉEL du propriétaire, mot pour mot. */
const DEMANDE = 'Je veux préparer un voyage à Lisbonne au printemps.';
const DIT_PAR_LA_PERSONNE = Object.freeze([
  'Durée du séjour : 4 jours',
  'Budget total de 1 200 € pour 2 personnes, vols inclus',
  'Départ depuis Marseille',
  'Période : fin mars'
]);
/* Ce que personne n'a dit, et qui circule pourtant dans le système comme dérivation légitime. */
const NON_DIT = Object.freeze([
  'Durée du séjour : 4 jours (4 nuits)',
  'Période : du 22 au 31 mars',
  'Le budget couvre les vols, l’hébergement, les repas et les activités',
  'Airbnb dans le centre historique',
  '600 € par personne'
]);

const decisionExploitable = {
  etat_demande: 'exploitable', route: 'rapide',
  raison_interne: 'Contrat complet.', question: null
};

/** L'ADN construit depuis des contraintes utilisateur et des obligations dérivées. */
function adn({ contraintes = DIT_PAR_LA_PERSONNE, sourceContraintes = 'oprie',
               obligationsDerivees = [], sourceDerivee = 'arch_analysis', assumptions = [] } = {}) {
  return buildAdnState({
    demande: DEMANDE,
    decision: decisionExploitable,
    intent: {
      objective: 'Préparer un voyage.', deliverable: 'Un plan de voyage structuré.',
      explicit_constraints: contraintes.map((texte) => (sourceContraintes === null
        ? texte
        : { text: texte, source: sourceContraintes, confirmed: true, evidence_id: null }))
    },
    obligations: obligationsDerivees.map((texte, i) => ({
      id: `arch-obl-${i}`, text: texte, source: sourceDerivee, mandatory: true, check_ids: []
    })),
    evidence: {}, executability: {}, assumptions,
    output: {}, checks: [], quantities: [], discipline: {}
  });
}
const obligations = (etat) => etat.completeness.obligations;
const sourceDe = (etat, texte) => (obligations(etat).find((o) => o.text === texte) || {}).source;
const contrainteSourceDe = (etat, texte) =>
  (etat.intent.explicit_constraints.find((c) => c.text === texte) || {}).source;

/* ==========================================================================
 * V2152-01 à 05 — LA DURÉE ET LA PÉRIODE
 * ======================================================================= */

test('V2152-01 / V2152-02 / V2152-03 : « 4 jours » reste à la personne, « 4 nuits » ne le devient jamais', () => {
  const etat = adn({ obligationsDerivees: ['Durée du séjour : 4 jours (4 nuits)'] });
  /* Ce que la personne a dit garde sa provenance. */
  assert.equal(contrainteSourceDe(etat, 'Durée du séjour : 4 jours'), 'user');
  assert.equal(sourceDe(etat, 'Durée du séjour : 4 jours'), 'user');
  /* Ce qu'elle n'a pas dit ne la lui attribue plus. C'était précisément le défaut owner. */
  assert.equal(sourceDe(etat, 'Durée du séjour : 4 jours (4 nuits)'), 'system');
  assert.notEqual(sourceDe(etat, 'Durée du séjour : 4 jours (4 nuits)'), 'user');
  /* La dérivation continue d'EXISTER : elle n'est pas supprimée, elle est nommée. */
  assert.ok(obligations(etat).some((o) => o.text.includes('4 nuits')),
    'la dérivation reste disponible pour la planification');
});

test('V2152-04 / V2152-05 : « fin mars » reste à la personne, « du 22 au 31 mars » non', () => {
  const etat = adn({ obligationsDerivees: ['Période : du 22 au 31 mars'] });
  assert.equal(sourceDe(etat, 'Période : fin mars'), 'user');
  assert.equal(sourceDe(etat, 'Période : du 22 au 31 mars'), 'system');
});

/* ==========================================================================
 * V2152-06 à 09 — LE BUDGET, L'ORIGINE, LA PRÉFÉRENCE
 * ======================================================================= */

test('V2152-06 / V2152-07 : le budget reste fidèle, et son périmètre supposé n’est pas de la personne', () => {
  const etat = adn({ obligationsDerivees: ['Le budget couvre les vols, l’hébergement, les repas et les activités'] });
  assert.equal(sourceDe(etat, 'Budget total de 1 200 € pour 2 personnes, vols inclus'), 'user');
  assert.equal(sourceDe(etat, 'Le budget couvre les vols, l’hébergement, les repas et les activités'), 'system');
});

test('V2152-08 / V2152-09 : Marseille n’est pas enrichi, Airbnb ne reçoit pas de quartier inventé', () => {
  const etat = adn({ obligationsDerivees: ['Airbnb dans le centre historique'] });
  assert.equal(sourceDe(etat, 'Départ depuis Marseille'), 'user');
  assert.equal(sourceDe(etat, 'Airbnb dans le centre historique'), 'system');
  /* Et rien n'a été ajouté au texte de la personne : la correction n'écrit pas, elle étiquette. */
  for (const dit of DIT_PAR_LA_PERSONNE) {
    assert.ok(etat.intent.explicit_constraints.some((c) => c.text === dit), `« ${dit} » intact`);
  }
});

/* ==========================================================================
 * V2152-10 / 11 — CE QUI RESTE PERMIS, ET C'EST AUSSI IMPORTANT
 * ======================================================================= */

test('V2152-10 / V2152-11 : paraphrase fidèle et normalisation typographique restent à la personne', () => {
  /* « 1200 euros pour 2 avec vols compris » est devenu « Budget total de 1 200 € pour 2 personnes,
     vols inclus » : espace insécable, symbole monétaire, « inclus » pour « compris ». Le mécanisme
     ne refuse pas cette reformulation — sinon il détruirait le travail utile du Core. La fidélité
     est jugée là où le dialogue est visible, jamais ici. */
  const etat = adn({ contraintes: ['Budget total : 1 200 € pour 2 personnes, vols inclus'] });
  assert.equal(contrainteSourceDe(etat, 'Budget total : 1 200 € pour 2 personnes, vols inclus'), 'user');
  /* Et une contrainte reçue SANS source vient du formulaire, où c'est la personne qui écrit. */
  const legacy = adn({ contraintes: ['exactement 20 éléments'], sourceContraintes: null });
  assert.equal(contrainteSourceDe(legacy, 'exactement 20 éléments'), 'user',
    'le chemin historique n’est pas cassé : sans source, la contrainte vient du formulaire');
});

/* ==========================================================================
 * V2152-12 à 15 — LES QUATRE FAMILLES D'AJOUT, INTERDITES EN PROVENANCE USER
 * ======================================================================= */

test('V2152-12 / 13 / 14 / 15 : quantité, temporalité, portée et obligation ajoutées ne sont jamais « user »', () => {
  /* Une seule règle les couvre toutes, et c'est le point : aucune famille n'est traitée à part. */
  const ajouts = ['600 € par personne', 'Départ le 22 mars à 7 h',
    'Le budget inclut les transports locaux', 'Le plan doit être validé avant réservation'];
  const etat = adn({ obligationsDerivees: ajouts });
  for (const ajout of ajouts) {
    assert.equal(sourceDe(etat, ajout), 'system', `« ${ajout} » n’est pas une déclaration de la personne`);
  }
  /* Et la consigne Core nomme ces familles, pour que le Core ne les place pas là au départ. */
  for (const famille of ['quantité', 'date', 'durée', 'portée', 'inclusion', 'exclusion',
                         'obligation', 'fréquence', 'relation']) {
    assert.ok(CORE_SYSTEM_PROMPT.includes(famille), `la consigne nomme l’ajout de ${famille}`);
  }
  assert.match(CORE_SYSTEM_PROMPT, /ne porte JAMAIS plus d'information que ce que la personne a dit/);
  assert.match(CORE_SYSTEM_PROMPT, /Une dérivation ne devient pas une déclaration de la personne parce qu'elle est probable, utile ou conventionnelle/);
  /* Aucun dictionnaire métier : le CODE ne nomme ni voyage, ni nuit, ni mars. Les commentaires, eux,
     citent la mesure d'origine — c'est la convention du dépôt, et V211-11 la suit déjà. */
  const codeAdn = etatAdn.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');
  for (const mot of ['nuit', 'voyage', 'Lisbonne', 'mars', 'hôtel', 'airbnb']) {
    assert.equal(new RegExp(`\\b${mot}`, 'i').test(codeAdn), false, `« ${mot} » absent du code ADN`);
  }
});

/* ==========================================================================
 * V2152-16 / 17 — L'ADN : OBLIGATIONS ET HYPOTHÈSES
 * ======================================================================= */

test('V2152-16 / V2152-17 : les obligations ne gonflent pas, les hypothèses accueillent les dérivations', () => {
  const etat = adn({
    obligationsDerivees: NON_DIT,
    assumptions: ['Le séjour est provisoirement traité comme 4 nuits pour la planification',
                  'Fin mars est provisoirement interprété comme les derniers jours du mois']
  });
  /* Exactement les quatre déclarations de la personne portent `user`, et rien d'autre. */
  const utilisateur = obligations(etat).filter((o) => o.source === 'user').map((o) => o.text).sort();
  assert.deepEqual(utilisateur, [...DIT_PAR_LA_PERSONNE].sort(),
    'aucune obligation « user » qui ne soit une déclaration de la personne');
  /* Les hypothèses portent leur propre provenance, et elle n'est pas « user ». */
  for (const hypothese of etat.assumptions.explicit || []) {
    assert.notEqual(hypothese.source, 'user');
  }
  const hyp = Object.values(etat.assumptions).filter((x) => x && typeof x === 'object' && x.text);
  for (const h of hyp) {
    assert.equal(h.source, 'deduction', 'une hypothèse est une déduction, jamais une déclaration');
    assert.equal(h.status, 'assumption');
  }
  assert.ok(hyp.some((h) => h.text.includes('4 nuits')), 'la dérivation utile est conservée, à sa place');
});

/* ==========================================================================
 * V2152-18 / 19 — L'ANALYSE 3.4 ET LE COMPILATEUR
 * ======================================================================= */

test('V2152-18 / V2152-19 : la projection vers l’analyse ne promeut rien, le compilateur non plus', () => {
  /* `intent.explicit_constraints` n'est pas enrichissable : l'Architecte ne peut pas y écrire. */
  assert.equal(ARCH_ENRICHABLE_PATHS.includes('intent.explicit_constraints'), false);
  assert.equal(ARCH_ENRICHABLE_PATHS.some((p) => p.startsWith('intent.')), false,
    'aucun champ d’intention n’est ouvert à l’enrichissement');
  /* La projection transporte les obligations avec leur source, sans requalification. */
  const base = mapOprieToCanonicalContract({
    state: 'operational_request_ready',
    operational_request_candidate: {
      objective: 'Préparer un voyage.', expected_deliverable: 'Un plan.',
      secondary_objectives: [], confirmed_constraints: [...DIT_PAR_LA_PERSONNE],
      confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [],
      external_facts_to_research: [], assumptions_allowed: ['Le séjour est traité comme 4 nuits.'],
      remaining_unknowns: [], available_inputs: []
    },
    issues: [], next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: 'Contrat complet.'
  }, { request_id: 'req-1', original_request: DEMANDE });
  /* Le mapper ne revendique jamais `user` : il dit `oprie`, c'est-à-dire « lu et validé par OPRIE ». */
  for (const c of base.intent.explicit_constraints) assert.equal(c.source, 'oprie');
  assert.deepEqual(base.obligations, [], 'OPRIE ne produit aucune obligation');
  /* Et l'hypothèse du Core reste une hypothèse dans le contrat canonique. */
  assert.ok(base.assumptions.allowed.some((a) => String(a.text || a).includes('4 nuits')));
  const projection = canonicalToArchProjectionInput(base);
  assert.deepEqual(projection.explicit_constraints, [...DIT_PAR_LA_PERSONNE]);
  assert.ok(projection.assumptions.allowed.some((a) => a.includes('4 nuits')),
    'l’analyse reçoit la dérivation comme hypothèse, pas comme contrainte');
});

/* ==========================================================================
 * V2152-20 — LA FIXTURE OWNER, BOUT EN BOUT
 * ======================================================================= */

test('V2152-20 : la fixture owner Lisbonne passe, et ce qui n’a pas été dit n’est jamais « user »', () => {
  const etat = adn({
    obligationsDerivees: NON_DIT,
    assumptions: ['Le séjour est provisoirement traité comme 4 nuits pour la planification']
  });
  const userTexts = obligations(etat).filter((o) => o.source === 'user').map((o) => o.text);
  assert.ok(userTexts.includes('Durée du séjour : 4 jours'), 'USER_CONSTRAINTS contient « 4 jours »');
  assert.equal(userTexts.some((t) => t.includes('4 nuits')), false, 'et jamais « 4 nuits »');
  for (const jamais of NON_DIT) {
    assert.equal(userTexts.includes(jamais), false, `« ${jamais} » n’est pas attribué à la personne`);
  }
  /* Le vocabulaire de provenance existant n'a pas été élargi par ce lot. */
  assert.deepEqual([...PROVENANCE_VALUES], ['explicit_user_statement', 'clarification_answer',
    'confirmed_preference', 'safe_deduction', 'delegated_decision', 'external_fact_to_research',
    'labeled_estimate', 'conditional_scenario', 'user_provided_material']);
});

/* ==========================================================================
 * V2152-21 à 25 — CE QUI N'A PAS ÉTÉ TOUCHÉ
 * ======================================================================= */

test('V2152-21 / V2152-22 : JSON 3.4 et schéma ADN inchangés', () => {
  assert.match(html, /"\$id":"analyse-llm-v3-4"/);
  assert.match(html, /"version":\{"type":"string","const":"3\.4"\}/);
  for (const marqueur of ['const FORMATS = {', 'const VERROUS = [', 'let ARCH_SYSTEM=', 'const ARCH_SCHEMA=']) {
    assert.ok(html.includes(marqueur), `${marqueur} toujours présent`);
  }
  /* La forme de l'état ADN est inchangée : mêmes familles, aucun champ ajouté. */
  const etat = adn();
  assert.deepEqual(Object.keys(etat), ['version', 'request_id', 'original_request', 'intent',
    'evidence', 'executability', 'assumptions', 'discipline', 'completeness', 'compliance',
    'routing', 'ethics', 'properties', 'techniques']);
  /* Et la forme d'une obligation n'a pas changé non plus : seule la VALEUR de source est corrigée. */
  assert.deepEqual(Object.keys(obligations(etat)[0]),
    ['id', 'text', 'source', 'mandatory', 'verifiable', 'constraint_id']);
});

test('V2152-23 / V2152-24 / V2152-25 : Fast, haute disponibilité et acquis V2.1.5.1 intacts', () => {
  /* V2.1.5.3 a délibérément allongé cette consigne : le registre de coût PERFREAL01E-15 en porte
     la mesure et la justification. L'épinglage suit la taille réelle, il ne la tolère pas. */
  /* V2.2.1-D2F1 — la consigne rapide a été allongée pour porter question_focus (+478 car.,
     coût inscrit dans T-PERFREAL01E-15). Ce contrôle vérifie qu'elle n'a pas été RACCOURCIE. */
  /* TARGETED-FIX-POST-CODEX-01 — la consigne s'allonge : le plan rapide doit désormais nommer
     CE QUI MANQUE, comme le plan profond le fait pour ses propres questions. Cette mesure est une
     caractérisation de taille, pas un invariant : elle dit qu'aucune consigne n'a grossi sans
     décision. */
  /* OPTION D — la consigne s'allonge de 613 caractères : le plan rapide doit désormais nommer les
     inconnues que la PERSONNE a déclarées. Le coût est réel et il est mesuré ici, pas supposé —
     environ 150 jetons par appel rapide, sur une réserve dont le plancher B3 est connu. Cette
     mesure reste une caractérisation de taille, pas un invariant : elle dit qu'aucune consigne n'a
     grossi sans décision. */
  /* FAST-FIRST-PASS — +610 caractères, et ce n'est pas un ajout : c'est un DÉPLACEMENT augmenté.
     L'obligation de déclarer les inconnues passe de 92 % à 7 % du prompt, devient une étape plutôt
     qu'une formalité, et dit ce qu'elle change pour la décision. Deux smokes humains ont montré que
     la version courte, en fin de consigne, n'était pas appliquée au premier passage. Le coût — de
     l'ordre de 150 jetons par appel rapide, sur une réserve dont le plancher B3 est connu — est
     mesuré ici, jamais supposé. */
  assert.equal(FAST_INTERACTION_SYSTEM_PROMPT.length, 9850);
  /* V2.2 a retiré cette revendication d'autorité du plan rapide : la doctrine qu'il applique est
     celle d'OPRIE, et il le dit. La retenue mesurée, elle, est intacte. */
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /La doctrine ci-dessous n'est pas la vôtre/);
  assert.deepEqual([...FAST_PROVIDER_ORDER], ['groq']);
  assert.deepEqual([...CORE_PROVIDER_ORDER], ['anthropic', 'openai']);
  assert.deepEqual([...ROLE_PROVIDER_ORDER], ['anthropic']);
  /* V2.1.5.1 : la règle ready ⇒ concerns vide est toujours énoncée, et toujours appliquée. */
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
});

/* ==========================================================================
 * LE CHOIX D'AGRÉGATION, DOCUMENTÉ PARCE QU'IL SE DISCUTE (§19)
 * ======================================================================= */

test('V2152-agrégation : réunir deux déclarations est permis, en dériver une troisième ne l’est pas', () => {
  /* « Nous sommes deux » + « budget 1200 » → « Budget : 1 200 € pour deux » : aucune information
     nouvelle, seulement deux déclarations réunies. Permis, et la consigne Core le dit. */
  assert.match(CORE_SYSTEM_PROMPT, /le regroupement de plusieurs de ses déclarations sans rien y ajouter/);
  const reunion = adn({ contraintes: ['Budget : 1 200 € pour deux'] });
  assert.equal(contrainteSourceDe(reunion, 'Budget : 1 200 € pour deux'), 'user');
  /* « 600 € par personne » est une division : le nombre est nouveau, et la répartition aussi —
     rien ne dit que le budget se partage à parts égales. Donc jamais `user`. C'est le choix de ce
     lot, et il est strict à dessein : une arithmétique juste reste une affirmation du système. */
  const division = adn({ obligationsDerivees: ['600 € par personne'] });
  assert.equal(sourceDe(division, '600 € par personne'), 'system');
});
