/* READINESS-00 — HARNAIS DU VALIDATEUR POST-OPRIE
 *
 * Ce fichier n'est PAS une suite de tests : c'est un helper d'espace de test.
 * Il charge, dans un contexte vm isolé, le seul fragment du HTML de production
 * qui porte la validation post-OPRIE — sans DOM applicatif, sans réseau.
 *
 * Les bornes du fragment sont vérifiées à l'exécution par assertFragmentBounds() :
 * si le HTML bouge, le harnais échoue bruyamment au lieu de charger autre chose.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { mapOprieToCanonicalContract } from '../core/adn/oprie-canonical-mapping.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html');
const html = fs.readFileSync(HTML, 'utf8');

const FRAGMENT_START = 'const ADN_POST_OPRIE_SIGNALS=';
const FRAGMENT_END = 'function adnReadinessInstruction(';

export function assertFragmentBounds() {
  const problems = [];
  const a = html.indexOf(FRAGMENT_START);
  const b = html.indexOf(FRAGMENT_END, a);
  if (a === -1) problems.push('ADN_POST_OPRIE_SIGNALS introuvable');
  if (b === -1) problems.push('borne de fin introuvable');
  if (a !== -1 && b !== -1) {
    const fragment = html.slice(a, b);
    for (const name of ['adnPostOprieSignal', 'adnValidatePostOprie', 'adnShowPostOprieStop']) {
      if (!fragment.includes(`function ${name}(`)) problems.push(`${name} absent du fragment`);
    }
  }
  return problems;
}

/** Charge le validateur ; `ui` collecte les appels d'affichage fail-closed. */
export function loadPostOprieValidator() {
  const a = html.indexOf(FRAGMENT_START);
  const b = html.indexOf(FRAGMENT_END, a);
  if (a === -1 || b === -1) throw new Error('READINESS-00 : fragment de validation introuvable.');

  const ui = { gate: [], shown: [] };
  const network = [];
  const refuse = (kind) => (...args) => {
    network.push({ kind, arg: String(args[0] ?? '') });
    throw new Error(`READINESS-00 : appel réseau interdit (${kind}).`);
  };

  const context = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Math, Date, Intl,
    setTimeout, clearTimeout,
    /* Dépendances ambiantes du fragment, réduites au strict nécessaire. */
    adpState: { pendingQuestion: true, requestedMode: 'architecte' },
    show: (...args) => { ui.shown.push(args); },
    v11ShowRapidGate: (decision) => { ui.gate.push(decision); },
    fetch: refuse('fetch'),
    XMLHttpRequest: function () { throw new Error('READINESS-00 : XMLHttpRequest interdit.'); },
    WebSocket: function () { throw new Error('READINESS-00 : WebSocket interdit.'); },
    EventSource: function () { throw new Error('READINESS-00 : EventSource interdit.'); }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(html.slice(a, b), context, { filename: 'atelier:post-oprie-validation' });

  const ev = (expr) => vm.runInContext(expr, context);
  const validate = (analysis, canonicalContract) => JSON.parse(JSON.stringify(ev('adnValidatePostOprie')(analysis, canonicalContract)));
  return {
    context, ui, network,
    SIGNALS: [...ev('ADN_POST_OPRIE_SIGNALS')],
    /* ADN-CANON-01 : le validateur reçoit désormais le CONTRAT CANONIQUE. */
    validate,
    /* Chemin de production reproduit : tour OPRIE -> mapping -> validation.
     * Un tour illisible ne produit aucun contrat, exactement comme
     * oprieBuildCanonicalContract() qui renvoie null en cas d'échec. */
    validateFromTurn: (analysis, oprieTurn) => validate(analysis, canonicalFrom(oprieTurn)),
    showStop: (signals) => ev('adnShowPostOprieStop')(signals),
    stopUi: JSON.parse(JSON.stringify(ev('ADN_POST_OPRIE_STOP_UI')))
  };
}

/** Extrait le corps d'une fonction du HTML, entre deux ancres stables. */
export function productionSlice(startAnchor, endAnchor) {
  const a = html.indexOf(startAnchor);
  const b = html.indexOf(endAnchor, a);
  if (a === -1 || b === -1) throw new Error(`READINESS-00 : tranche introuvable (${startAnchor}).`);
  return html.slice(a, b);
}

/** Tour OPRIE READY minimal et valide, volontairement neutre. */
export function oprieReadyTurn(overrides = {}) {
  const candidate = {
    objective: 'Objectif validé par l’Arbitre.',
    expected_deliverable: 'Un livrable explicitement nommé.',
    secondary_objectives: [],
    confirmed_constraints: [],
    confirmed_priorities: [],
    confirmed_preferences: [],
    delegated_decisions: [],
    external_facts_to_research: [],
    assumptions_allowed: [],
    remaining_unknowns: [],
    ...(overrides.operational_request_candidate || {})
  };
  return {
    state: 'operational_request_ready',
    operational_request_candidate: candidate,
    issues: [],
    next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null,
    blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: 'Accord complet.',
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'operational_request_candidate'))
  };
}

/** Analyse 3.4 cohérente avec le tour READY ci-dessus. */
export function coherentAnalysis(overrides = {}) {
  const base = {
    version: '3.4',
    comprehension: {
      intention_principale: 'Produire le livrable demandé.',
      intentions_secondaires: [], declarations: [], contraintes: [],
      ambiguites: [], informations_manquantes: []
    },
    evaluation: {
      niveau_risque: 'faible', justification_risque: '…',
      connaissance_externe_necessaire: false, actualite_requise: false,
      justification_connaissance: '…', calcul_requis: false,
      livrable_complet_possible: true, reponse_partielle_possible: false,
      action_recommandee: 'continuer', questions_a_poser: [], parties_realisables_immediatement: []
    },
    strategie: {
      capacites_necessaires: [], hypotheses_autorisees: [], hypotheses_interdites: [],
      role_adaptatif: { intitule: 'spécialiste du livrable', mission: 'Produire un livrable conforme.', competences: ['structuration'], limites: ['rester dans le périmètre'] },
      niveau_architecture: 'standard', justification_niveau: '…',
      pilotage_incertitude: { decisions_autonomes: [], estimations_a_etiqueter: [], inconnues_non_devineables: [] }
    },
    livrable: { nature: 'un livrable structuré', format_technique: 'texte', quantites: null, ton: 'neutre', longueur_indicative: 'proportionnée' },
    compilation: { composants_retenus: [], composants_ecartes: [] },
    verification: { criteres_bloquants: [], criteres_qualitatifs: [], elements_non_verifiables: [], controle_provenance: [] },
    apprentissage: { preferences_applicables: [], preference_proposable: null }
  };
  const out = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])
      ? { ...base[k], ...v }
      : v;
  }
  return out;
}

/* Construit le contrat canonique réel à partir d'un tour OPRIE, par le mapper de
 * production. Renvoie null si le tour n'est pas mappable — comportement identique
 * à oprieBuildCanonicalContract() côté frontend. */
export function canonicalFrom(oprieTurn, { request_id = 'test-1', original_request = 'Demande de contrôle.' } = {}) {
  try {
    return mapOprieToCanonicalContract(oprieTurn, { request_id, original_request });
  } catch {
    return null;
  }
}
