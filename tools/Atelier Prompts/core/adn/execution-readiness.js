export const EXECUTION_READINESS_VERSION = "1.0";

export const EXECUTION_READINESS_STATES = Object.freeze([
  "contractualization",
  "clarification_required",
  "execution_ready",
  "blocked"
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function words(value) {
  const stop = new Set([
    "avec","avez","cette","dans","des","elle","est","etes","les","pour","que",
    "quel","quelle","quelles","quels","qui","souhaitez","une","vous","votre","vos"
  ]);
  return new Set(
    text(value)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[’']/g, " ").replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/).filter((item) => item.length > 2 && !stop.has(item))
  );
}

function questionsSimilar(left, right) {
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return text(left).toLowerCase() === text(right).toLowerCase();
  let common = 0;
  for (const item of a) if (b.has(item)) common += 1;
  return common / Math.min(a.size, b.size) >= 0.7;
}

function novelQuestions(questions, previousQuestions) {
  const previous = list(previousQuestions).map(text).filter(Boolean);
  return list(questions)
    .map(text)
    .filter(Boolean)
    .filter((question) => !previous.some((old) => questionsSimilar(question, old)));
}

function assertAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) {
    throw new TypeError("Une analyse Architecte est requise pour évaluer l'état d'exécution.");
  }
  if (!analysis.evaluation || !analysis.comprehension) {
    throw new TypeError("Analyse Architecte incomplète pour l'Execution Readiness Gate.");
  }
}

/**
 * Pendant la contractualisation, la technique 9 n'est pas encore activée.
 * Le système a le droit — et le devoir — de poser une clarification réellement
 * non substituable. Les invariants de sécurité et de non-invention restent actifs.
 */
export function contractForContractualization(contract) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    throw new TypeError("ExecutionContract requis.");
  }
  const result = clone(contract);
  result.readiness = {
    version: EXECUTION_READINESS_VERSION,
    state: "contractualization",
    can_analyze: true,
    can_execute: false
  };
  result.execution_policy = {
    ...(result.execution_policy || {}),
    execute_now: false,
    comfort_questions_forbidden: false,
    meta_discussion_forbidden: true,
    complete_delivery_required: true,
    final_injunction_active: false
  };
  return result;
}

/**
 * Évalue uniquement des primitives universelles déjà produites par Architecte.
 * Aucun domaine, mot-clé métier ni quantité arbitraire n'est utilisé.
 */
export function assessAnalysisReadiness(analysis, { previous_questions = [] } = {}) {
  assertAnalysis(analysis);
  const ev = analysis.evaluation || {};
  const missing = list(analysis.comprehension?.informations_manquantes);
  const blockingMissing = missing.filter((item) => item && item.bloquant === true);
  const candidates = novelQuestions(ev.questions_a_poser, previous_questions);
  const complete = ev.livrable_complet_possible === true;
  const action = text(ev.action_recommandee);

  if ((action === "questionner" || !complete || blockingMissing.length > 0) && candidates.length > 0) {
    return clone({
      version: EXECUTION_READINESS_VERSION,
      state: "clarification_required",
      execution_ready: false,
      question: candidates[0],
      remaining_candidate_questions: candidates.slice(1),
      blocking_missing_count: blockingMissing.length,
      reason: "Une information non substituable susceptible de modifier matériellement le livrable reste à obtenir."
    });
  }

  if (complete && action === "continuer" && blockingMissing.length === 0) {
    return clone({
      version: EXECUTION_READINESS_VERSION,
      state: "execution_ready",
      execution_ready: true,
      question: null,
      remaining_candidate_questions: [],
      blocking_missing_count: 0,
      reason: "Aucune information non substituable bloquante ne reste avant exécution."
    });
  }

  return clone({
    version: EXECUTION_READINESS_VERSION,
    state: "blocked",
    execution_ready: false,
    question: null,
    remaining_candidate_questions: candidates,
    blocking_missing_count: blockingMissing.length,
    reason: candidates.length === 0 && list(ev.questions_a_poser).length > 0
      ? "L'analyse réclame une clarification déjà posée ; elle ne doit pas provoquer une boucle."
      : "Le livrable complet n'est pas encore déclaré possible et aucune clarification exploitable nouvelle n'est disponible."
  });
}

/**
 * Instruction sémantique universelle injectée APRÈS le système Architecte historique.
 * Elle précise la notion d'exploitabilité sans modifier le moteur gelé.
 */
export function buildExecutionReadinessInstruction() {
  return `## EXECUTION READINESS GATE — RÈGLE TRANSVERSALE PRIORITAIRE

Cette étape ne cherche pas simplement à savoir s'il est possible de produire "quelque chose d'utile". Elle doit déterminer si la DEMANDE PRÉPARÉE est suffisamment complète et opérationnelle pour que le livrable final puisse ensuite être exécuté sans décider silencieusement à la place de l'utilisateur sur un paramètre qui lui appartient et qui modifierait matériellement le résultat.

Distinguez strictement :
- CONTRACTUALISABLE : assez d'information pour analyser et poursuivre le cadrage ;
- EXECUTION_READY : assez d'information pour exécuter le livrable complet sans inconnue non substituable restante.

Pour CHAQUE information absente qui pourrait modifier matériellement le résultat, choisissez le traitement le plus approprié :
1. rechercher, si c'est un fait externe vérifiable ;
2. décider raisonnablement, si l'utilisateur a délégué ce choix ou si plusieurs choix sont équivalents pour son objectif ;
3. estimer et étiqueter l'estimation, si une précision exacte n'est pas nécessaire ;
4. scénariser ou conditionner, si plusieurs valeurs peuvent être traitées proprement ;
5. laisser inconnue localement, si elle n'empêche pas le livrable complet ;
6. QUESTIONNER uniquement si l'information est réellement non substituable : elle appartient à l'utilisateur ou à son contexte, son absence change matériellement le livrable, et aucune des cinq stratégies précédentes ne préserve honnêtement le résultat.

Il n'existe AUCUN nombre cible de questions. Posez autant de cycles de clarification que nécessaire pour atteindre EXECUTION_READY, et zéro question de confort. À chaque analyse, placez dans questions_a_poser la question la plus déterminante en premier ; l'application n'en posera qu'une avant de réanalyser avec la réponse.

Une réponse antérieure "À vous de choisir" est une délégation explicite : prenez alors une décision raisonnable et étiquetez-la comme décision, sans redemander le même choix. Une réponse "Je ne sais pas" interdit de répéter mécaniquement la même question : recherchez, estimez, décidez si cela a été délégué, scénarisez ou conservez l'inconnue ; ne posez une autre question que si elle permet réellement d'avancer.

Ne considérez jamais comme suffisant le seul fait qu'une réponse générale soit possible. Si la demande vise une préparation personnalisée ou opérationnelle et qu'une information non substituable changerait substantiellement ce qui sera produit, marquez livrable_complet_possible=false et action_recommandee="questionner".

Inversement, ne questionnez jamais sur une information que l'IA peut raisonnablement rechercher, décider, estimer, scénariser ou laisser à confirmer sans dégrader matériellement le livrable complet.

Cette règle est universelle : n'utilisez aucun questionnaire métier, aucune liste de champs par domaine et aucun mot-clé sectoriel. Raisonnez uniquement en termes d'objectif, de livrable, de dépendance, d'impact, de substituabilité, d'autorité de décision et de risque d'invention.`;
}

export function buildFinalExecutionDirective() {
  return `## EXÉCUTION IMMÉDIATE
La demande est maintenant déclarée EXECUTION_READY. Ne proposez plus de préparer, planifier ou discuter le travail : produisez maintenant le livrable complet demandé. Ne posez aucune question de confort. Respectez toutes les contraintes, décisions, hypothèses étiquetées, quantités, formats et contrôles définis ci-dessus. Avant l'envoi, vérifiez silencieusement la complétude et la conformité, corrigez les écarts détectés, puis livrez uniquement le résultat utile.`;
}

export function createReadinessAuditView(readiness) {
  if (!readiness || !EXECUTION_READINESS_STATES.includes(readiness.state)) {
    throw new TypeError("État Execution Readiness invalide.");
  }
  return {
    version: readiness.version,
    state: readiness.state,
    execution_ready: readiness.execution_ready === true,
    has_question: Boolean(readiness.question),
    blocking_missing_count: Number(readiness.blocking_missing_count || 0)
  };
}
