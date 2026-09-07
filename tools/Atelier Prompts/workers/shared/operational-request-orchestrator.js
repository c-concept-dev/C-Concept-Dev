import { isLegalTransition } from "../../core/adn/operational-request-state.js";
import {
  OPRIE_ROLES,
  createDegradedRoleResult,
  validateAnalystInput,
  validateDegradedRoleResult
} from "./operational-request-core.js";
import {
  DecisionHttpError,
  TRANSPORT_LIMITS,
  corsHeaders,
  jsonResponse,
  readJsonBody
} from "./decision-core.js";
import { degradedResultFromProviderChainError } from "./role-degradation.js";

/**
 * ORCH-01 — ORCHESTRATEUR SERVEUR CANONIQUE DE LA DEMANDE OPÉRATIONNELLE.
 *
 * Ce module est la couche que le code appelait déjà de ses vœux : operational-request-core.js
 * documente explicitement que « degraded_state n'est jamais produit ici : c'est à la couche
 * d'orchestration appelante [...] de le construire (createDegradedRoleResult) ». C'est elle.
 *
 * Ce qu'il fait : enchaîner Analyste → Critique → Arbitre, valider chaque sortie avec le validateur
 * canonique du rôle, et rendre le résultat du tour.
 *
 * Ce qu'il n'est PAS — et ne doit jamais devenir :
 *   - une seconde autorité sémantique. Il ne lit jamais le CONTENU d'une sortie de rôle pour en
 *     tirer un jugement : il ne compare pas, ne pondère pas, ne corrige pas, n'arbitre pas. L'état
 *     final est celui que l'Arbitre a prononcé, mot pour mot.
 *   - une seconde machine d'état. La légalité de l'état produit est vérifiée par isLegalTransition
 *     (core/adn/operational-request-state.js, INCHANGÉ), jamais par une table recopiée ici.
 *   - une seconde shape de réponse. Le résultat d'un tour est TOUJOURS l'une des deux formes déjà
 *     contractuelles : ArbiterOutput (validateArbiterOutput) pour les quatre états sémantiques, ou
 *     DegradedRoleResult (validateDegradedRoleResult) pour degraded_state. Aucune troisième forme.
 *   - une couche de repli. Aucun résultat local n'est jamais fabriqué : voir FAIL-CLOSED ci-dessous.
 */

/**
 * État de travail neutre d'où part tout tour OPRIE. C'est le seul point d'entrée de la table de
 * transitions gelée (`understanding` -> les cinq états publics) : partir de là, plutôt que d'énumérer
 * les états acceptables, garantit que l'orchestrateur ne peut jamais élargir le contrat.
 */
export const OPERATIONAL_REQUEST_TURN_ORIGIN_STATE = "understanding";

/** Séquence gelée des rôles. Aucune étape n'est sautée, aucun ordre alternatif n'est possible. */
export const OPERATIONAL_REQUEST_ROLE_SEQUENCE = Object.freeze(["analyst", "critic", "arbiter"]);

/**
 * VALIDATION DES SORTIES DE RÔLE — où elle a lieu, et pourquoi pas ici.
 *
 * Chaque sortie de rôle EST validée par son validateur canonique (validateAnalystOutput,
 * validateCriticOutput, validateArbiterOutput), exactement une fois, à l'endroit où se trouve la
 * sortie BRUTE du modèle : dans l'adaptateur de rôle, via ROLE_DEFINITIONS[role].parseOutput. Une
 * sortie non conforme n'atteint donc jamais cet orchestrateur — elle est rejetée en amont, et
 * remonte ici comme un échec technique (cf. ORCH01-19).
 *
 * L'orchestrateur ne les rejoue PAS, pour une raison démontrée et non négociable : ces validateurs
 * sont des NORMALISATEURS, pas des prédicats idempotents. validateArbiterOutput réduit un
 * next_question entièrement vide à `null` (validateNullableQuestionCandidate), puis rejette ce même
 * `null` si on le lui repasse — « QuestionCandidate doit être un objet ». Les rejouer corromprait
 * donc des sorties parfaitement valides. Cette asymétrie est PRÉEXISTANTE et n'est pas corrigée ici :
 * toucher à un contrat gelé exige un arrêt explicite, pas une correction opportuniste au passage
 * (cf. rapport, section NON-BLOCKERS).
 *
 * Ce que l'orchestrateur vérifie lui-même se limite donc à ce qui relève de SA responsabilité :
 * la forme structurelle de ce qu'il reçoit, et la légalité de l'état final selon la machine d'état.
 */
function assertRoleOutputShape(role, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Sortie du rôle ${role} inexploitable : un objet est attendu.`);
  }
  return value;
}

/**
 * Motif de dégradation EXPOSÉ AU CLIENT. Volontairement neutre : il nomme le rôle indisponible et
 * rien d'autre. Le détail technique (fournisseurs tentés, classes d'échec) existe bel et bien, mais
 * part exclusivement dans l'observabilité serveur — cf. runOperationalRequestTurn. Un client n'a
 * aucun besoin de connaître la topologie des fournisseurs pour réagir correctement à une panne.
 */
function publicDegradationReason(role) {
  return `Le rôle ${role} n'a pu être exécuté par aucun fournisseur disponible ; aucune analyse n'a pu être produite pour ce tour.`;
}

/** Une chaîne de providers épuisée est le SEUL échec qui devient degraded_state. Voir FAIL-CLOSED. */
function isProviderChainExhausted(error) {
  return error?.all_providers_failed === true;
}

/**
 * Construit l'entrée d'un rôle à partir de la demande et des sorties déjà validées. Les entrées ne
 * sont jamais demandées au client : il fournit la demande, le serveur construit le reste. C'est ce
 * qui rend l'orchestration non contournable — un client ne peut pas injecter un analyst_output
 * fabriqué pour court-circuiter l'Analyste.
 */
/* OPRIE-MATERIAL-CONTEXT-02 — PROPAGATION SÉLECTIVE, ET LA RAISON DE L ÊTRE.
 *
 * `base` est diffusé aux trois rôles : y ajouter le contexte matériau l aurait rendu
 * visible à l Arbitre par simple effet de bord. Ce n est pas ce qu on veut.
 *
 * L Analyste interprète le fait — c est lui qui identifie les inconnues matérielles.
 * Le Critique audite cette interprétation — il ne peut juger si une question portant
 * sur un document était légitime sans savoir si ce document était joint.
 * L Arbitre arbitre ce que les deux précédents ont soulevé : lui donner le signal brut
 * en ferait un TROISIÈME interprète direct du même fait, avec le risque de trois
 * lectures divergentes d une seule donnée. Il ne le reçoit donc pas.
 */
function buildRoleInput(role, base, outputs, material_context, material_content) {
  /* OPRIE-MATERIAL-CONTENT-02 — LE CONTENU NE VA QU À L ANALYSTE, et le spread
     conditionnel garantit qu il n apparaît nulle part ailleurs, même vide. */
  if (role === "analyst") return { ...base, material_context, ...(material_content ? { material_content } : {}) };
  if (role === "critic") return { ...base, analyst_output: outputs.analyst, previous_vetoes: [], material_context };
  /* OPRIE-ARBITER-MATERIAL-CONTEXT-DELIVERY-01 — L'ARBITRE VOYAIT LA REVENDICATION, PAS LE FAIT.
     Depuis OPRIE-INPUT-AVAILABILITY-FIELD-01, le candidat porte available_inputs : « le numéro de
     dossier, présent dans le matériau transmis », avec la provenance user_provided_material.
     L'Arbitre recevait cette affirmation sans aucun moyen de savoir qu'un matériau avait été
     transmis, et l'écartait comme invérifiable — seize fois sur trente. Il reçoit désormais les
     deux booléens de disponibilité, et rien d'autre : material_content ne lui parvient pas, et
     ne lui parviendra pas. */
  return { ...base, analyst_output: outputs.analyst, critic_output: outputs.critic, material_context };
}

/**
 * OBSERVABILITY-COMPLETENESS-01 — POURQUOI CE BLOC EXISTE.
 *
 * Un 502 de cette route est resté DÉFINITIVEMENT inattribuable : le journal de l'invocation
 * concernée n'a pas été capté, et surtout AUCUN identifiant ne permettait de rattacher la réponse
 * observée par le client à un enregistrement serveur. La capture n'était que la moitié du problème ;
 * l'absence de clé de jointure en était l'autre, et elle aurait survécu à une capture parfaite.
 *
 * Ce bloc n'ajoute AUCUN comportement : ni décision, ni état, ni repli, ni changement de statut.
 * Il ne fait qu'observer. Trois pièces, et rien de plus :
 *   1. un identifiant d'invocation stable, rendu au client (en-tête) et présent dans chaque événement ;
 *   2. une trace MUTABLE qui survit à toute levée — étiquetée ou non, c'est précisément le cas qui
 *      avait mis l'enquête en échec : on ne peut pas se reposer sur l'étiquetage pour observer ce
 *      qui n'est pas étiqueté ;
 *   3. exactement UN enregistrement terminal par invocation, sur les trois chemins terminaux.
 */

/**
 * Identifiant d'invocation. `cf-ray` est préféré quand il existe : il est stable pour toute
 * l'invocation et déjà corrélable côté plateforme. Hors Cloudflare (tests, exécution locale), un
 * UUID est généré. Une seule valeur est produite par invocation, puis diffusée — jamais régénérée
 * dans un sous-appel, ce qui produirait des identifiants divergents pour un même tour.
 */
export function resolveInvocationId(request) {
  const ray = request && request.headers && typeof request.headers.get === "function" ? request.headers.get("cf-ray") : null;
  if (typeof ray === "string" && ray.trim()) return ray.trim();
  return crypto.randomUUID();
}

/**
 * Empreinte d'erreur SÛRE. `error.message` n'est JAMAIS émis : un message de validation peut citer
 * une valeur d'entrée, donc du contenu utilisateur. Ce qui sort ici est un nom de classe (vocabulaire
 * du langage), une empreinte SHA-256 du message (déterministe, non réversible, suffisante pour
 * regrouper des occurrences identiques) et le NOMBRE de cadres de pile — jamais le texte de la pile,
 * qui contient des chemins de source.
 */
export async function safeErrorFingerprint(error) {
  const name = error instanceof Error && typeof error.name === "string" ? error.name : "UnknownError";
  const message = error instanceof Error && typeof error.message === "string" ? error.message : String(error ?? "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  const message_sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const frame_count = error instanceof Error && typeof error.stack === "string"
    ? error.stack.split("\n").filter((line) => line.trim().startsWith("at ")).length : 0;
  return { error_name: name, message_sha256, frame_count };
}

/** Phases observables d'une invocation. Vocabulaire fermé, aligné sur la séquence réelle. */
export const OPERATIONAL_REQUEST_PHASES = Object.freeze(["validate", "analyst", "critic", "arbiter", "state_check"]);

/**
 * Trace d'exécution MUTABLE. Elle est écrite au fil de l'invocation et lue dans le `catch` du
 * gestionnaire HTTP : elle survit donc à n'importe quelle levée, étiquetée ou non. C'est la
 * propriété qui manquait — une exception non étiquetée ne dit rien d'elle-même, mais la trace, elle,
 * sait toujours où l'on était.
 *
 * `observe(event)` absorbe les événements provider_ha_* DÉJÀ ÉMIS par la chaîne de fournisseurs :
 * aucune instrumentation n'est ajoutée dans provider-ha.js, qui reste inchangé. Le fournisseur,
 * l'index de tentative et le chemin de repli sont donc corrélés sans toucher à ce module.
 */
export function createExecutionTrace({ resolveModel } = {}) {
  const started_at = Date.now();
  const phases = [];
  const trace = {
    started_at,
    phase: null,
    role: null,
    provider: null,
    model: null,
    provider_attempt_index: null,
    fallback_path: [],
    phases,
    enterPhase(phase, role = null) {
      const now = Date.now();
      const previous = phases[phases.length - 1];
      if (previous && previous.duration_ms === null) previous.duration_ms = now - previous.phase_started_at;
      trace.phase = phase;
      trace.role = role;
      phases.push({ phase, role, phase_started_at: now, duration_ms: null });
    },
    closePhase() {
      const previous = phases[phases.length - 1];
      if (previous && previous.duration_ms === null) previous.duration_ms = Date.now() - previous.phase_started_at;
    },
    observe(event) {
      if (!event || typeof event !== "object") return;
      if (event.event === "provider_ha_attempt" || event.event === "provider_ha_failure" || event.event === "provider_ha_success") {
        trace.provider = event.provider ?? trace.provider;
        trace.provider_attempt_index = typeof event.attempt_index === "number" ? event.attempt_index : trace.provider_attempt_index;
        if (typeof resolveModel === "function" && trace.provider) trace.model = resolveModel(trace.provider) ?? trace.model;
      }
      if (event.event === "provider_ha_fallback" && event.fallback_to) {
        trace.fallback_path.push({ from: event.fallback_from ?? null, to: event.fallback_to, failure_class: event.failure_class ?? null });
      }
    }
  };
  return trace;
}

/** Champs OBLIGATOIRES de l'enregistrement terminal. `journal_complete` est CALCULÉ sur cette liste. */
export const TERMINAL_RECORD_REQUIRED_FIELDS = Object.freeze([
  "invocation_id", "terminal_event", "phase", "role", "provider", "model",
  "provider_attempt_index", "http_status", "semantic_state", "error_class",
  "untagged_exception", "fallback_path", "phases", "safe_error_fingerprint"
]);

/**
 * Construit l'UNIQUE enregistrement terminal d'une invocation. `journal_complete` n'est pas une
 * constante décorative : il vaut vrai seulement si chacun des champs obligatoires est réellement
 * présent. Un enregistrement incomplet se dénonce donc lui-même, au lieu de passer inaperçu.
 */
export function buildTerminalRecord(fields) {
  const record = { ...fields, terminal_event: true };
  record.journal_complete = TERMINAL_RECORD_REQUIRED_FIELDS.every((key) => record[key] !== undefined);
  return record;
}

function defaultLog(event) {
  console.log(JSON.stringify(event));
}

/**
 * Exécute UN tour OPRIE complet.
 *
 * FAIL-CLOSED — règle unique et sans exception : le seul échec traduit en résultat est l'épuisement
 * d'une chaîne de fournisseurs (ProviderChainError), et il ne produit QUE degraded_state. Tout autre
 * échec — sortie de rôle non conforme, contrat rompu, bug de notre code — remonte tel quel à
 * l'appelant HTTP, qui en fait une erreur technique explicite. Aucun résultat sémantique n'est
 * jamais fabriqué localement : ni READY, ni clarification de repli, ni route, ni candidat par défaut.
 *
 * @param {{original_request: string, clarification_history: Array}} input  déjà validé (validateAnalystInput)
 * @param {(role: string, roleInput: object) => Promise<object>} executeRole  chaîne HA du rôle
 * @returns {Promise<object>} ArbiterOutput validé, ou DegradedRoleResult validé
 */
export async function runOperationalRequestTurn(input, { executeRole, log = defaultLog, trace = null } = {}) {
  if (typeof executeRole !== "function") throw new TypeError("runOperationalRequestTurn: executeRole est obligatoire.");
  const base = Object.freeze({ original_request: input.original_request, clarification_history: input.clarification_history });
  /* Le contexte matériau vit à côté de `base`, jamais dedans : voir buildRoleInput. */
  const material_context = input.material_context;
  const material_content = input.material_content;
  log({
    event: "material_context_observation",
    material_context_present: material_context ? material_context.present : null,
    /* OPRIE-MATERIAL-INTERPRETATION-01 — la trace nommait encore `usable`, retiré du contrat
       par le lot precedent : elle journalisait donc undefined a chaque tour. Elle nomme
       desormais le champ qui existe, et dit si le contenu est reellement entre dans l'entree
       de l'Analyste — le fait qu'il fallait pouvoir prouver sans lire un octet de contenu. */
    material_context_deep_content_available: material_context ? material_context.deep_content_available : null,
    material_content_present_in_analyst_input: Array.isArray(material_content) && material_content.length > 0,
    material_context_absent: !material_context,
    /* Metadata SEULE : nombre de documents et volume, jamais un octet de contenu. Le volume est
       compte en OCTETS UTF-8, comme partout ailleurs dans ce canal : `.length` compterait des
       unites UTF-16 et sous-estimerait tout texte accentue. */
    material_document_count: Array.isArray(material_content) ? material_content.length : 0,
    material_content_bytes: Array.isArray(material_content)
      ? material_content.reduce((total, piece) => total + new TextEncoder().encode(piece).byteLength, 0) : 0
  });
  const outputs = {};

  for (const role of OPERATIONAL_REQUEST_ROLE_SEQUENCE) {
    if (trace) trace.enterPhase(role, role);
    log({ event: "operational_request_role_start", role, sequence: OPERATIONAL_REQUEST_ROLE_SEQUENCE });
    /* OPRIE-CRITIC-MATERIAL-CONTEXT-DELIVERY-01 — la preuve, tour par tour, que le Critique reçoit
       la disponibilité. Deux booléens, jamais un octet de matériau. Elle existe parce qu'un test
       vert sur un chemin mort avait laissé croire pendant deux lots que ce champ arrivait. */
    if (role === "arbiter") {
      /* Preuve tour par tour, metadata SEULE : ce que l'Arbitre reçoit pour juger une
         revendication de disponibilité. Deux booléens, et deux drapeaux de présence — jamais un
         octet de matériau, jamais une valeur du candidat. */
      const candidat = outputs.analyst && outputs.analyst.operational_request_candidate;
      const disponibles = candidat && Array.isArray(candidat.available_inputs) ? candidat.available_inputs : [];
      const provenances = outputs.analyst && Array.isArray(outputs.analyst.provenance_records)
        ? outputs.analyst.provenance_records : [];
      log({
        event: "arbiter_material_context_observation",
        arbiter_material_context_present: material_context ? material_context.present : null,
        arbiter_deep_content_available: material_context ? material_context.deep_content_available : null,
        arbiter_available_inputs_present: disponibles.length > 0,
        arbiter_material_provenance_present: provenances.some((record) => record.provenance === "user_provided_material")
      });
    }
    if (role === "critic") {
      log({
        event: "critic_global_material_context_observation",
        critic_global_material_context_present: material_context ? material_context.present : null,
        critic_global_deep_content_available: material_context ? material_context.deep_content_available : null
      });
    }
    let raw;
    try {
      /* OBSERVABILITY-COMPLETENESS-01 — le MÊME `log` est passé à l'adaptateur de rôle : les
         événements provider_ha_* portent donc le même invocation_id, sans toucher provider-ha.js. */
      raw = await executeRole(role, buildRoleInput(role, base, outputs, material_context, material_content), { log });
    } catch (error) {
      if (!isProviderChainExhausted(error)) throw error;
      // Le détail technique reste côté serveur ; le client reçoit un motif neutre.
      const internal = degradedResultFromProviderChainError(role, error);
      log({ event: "operational_request_degraded", role, attempts: error.attempts ?? [], internal_reason: internal.reason });
      return validateDegradedRoleResult(createDegradedRoleResult(role, publicDegradationReason(role)));
    }
    outputs[role] = assertRoleOutputShape(role, raw);
    /* OPRIE-MATERIAL-PROVENANCE-CONFORMANCE-01 — OBSERVATION, PAS COMPORTEMENT.
       Mesurer la conformité de l'écrivain exigeait de voir ce que l'Analyste DÉCLARE, et la
       réponse HTTP ne porte que la sortie de l'Arbitre. Cette trace n'émet que des ÉTIQUETTES :
       les valeurs de provenance, qui sont un vocabulaire fermé, et les noms de champs du
       candidat. Aucune valeur, donc aucun octet de matériau. Rien ici ne lit, ne décide, ni ne
       modifie quoi que ce soit. */
    if (role === "analyst") {
      const records = Array.isArray(outputs.analyst.provenance_records) ? outputs.analyst.provenance_records : [];
      log({
        event: "analyst_provenance_observation",
        provenance_record_count: records.length,
        provenance_values: [...new Set(records.map((record) => record.provenance))],
        provenance_fields: [...new Set(records.map((record) => record.field))]
      });
    }
    log({ event: "operational_request_role_ok", role });
  }

  const turn = outputs.arbiter;
  if (trace) trace.enterPhase("state_check", "arbiter");
  // La légalité de l'état vient de la machine d'état gelée, jamais d'une liste recopiée ici.
  if (!isLegalTransition(OPERATIONAL_REQUEST_TURN_ORIGIN_STATE, turn.state)) {
    throw new TypeError(`État de tour OPRIE illégal depuis "${OPERATIONAL_REQUEST_TURN_ORIGIN_STATE}" : ${turn.state}.`);
  }
  log({ event: "operational_request_turn_ok", state: turn.state });
  return turn;
}

/**
 * Point d'entrée HTTP canonique : POST /operational-request.
 *
 * Entrée : EXACTEMENT le contrat d'entrée de l'Analyste (validateAnalystInput — original_request +
 * clarification_history), parce que c'est exactement ce dont un tour a besoin. Aucun champ interne
 * n'est demandé au client : analyst_output et critic_output sont construits par le serveur.
 *
 * Sortie : le résultat du tour, tel quel. degraded_state est un état OPRIE public légitime
 * (OPERATIONAL_REQUEST_STATES) et atteignable depuis `understanding` : un tour qui s'y termine a
 * abouti, il est donc rendu en HTTP 200 comme les quatre autres. Cette convention ne change AUCUN
 * contrat existant — /decision, /analyst, /critic et /arbiter conservent le leur, y compris leur 502
 * sans champ d'état.
 */
export async function handleOperationalRequest(request, env, { executeRole, log, resolveModel } = {}) {
  const url = new URL(request.url);
  const cors = corsHeaders(request, env);
  if (request.method === "OPTIONS") {
    return cors ? new Response(null, { status: 204, headers: cors }) : jsonResponse({ error: "origin_not_allowed" }, 403, null);
  }
  if (url.pathname !== "/operational-request") return jsonResponse({ error: "not_found" }, 404, cors);
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, cors);
  if (!cors) return jsonResponse({ error: "origin_not_allowed" }, 403, null);

  /* OBSERVABILITY-COMPLETENESS-01 — un seul identifiant, minté ici, diffusé partout. */
  const invocation_id = resolveInvocationId(request);
  const trace = createExecutionTrace({ resolveModel });
  const sink = typeof log === "function" ? log : defaultLog;
  /* Le MÊME emballage est passé au tour ET, par lui, à la chaîne de fournisseurs : chaque événement
     porte l'identifiant, et la trace absorbe au passage provider/tentative/repli. */
  const stampedLog = (event) => { trace.observe(event); sink({ ...event, invocation_id }); };
  /* En-tête de jointure : présent sur TOUTES les réponses de cette route, y compris les succès.
     Additif — aucune forme de réponse existante n'est modifiée. */
  const join = { ...(cors || {}), "X-Invocation-Id": invocation_id, "Access-Control-Expose-Headers": "X-Invocation-Id" };

  const emitTerminal = (event, { http_status, semantic_state, error_class, untagged_exception, safe_error_fingerprint }) => {
    trace.closePhase();
    sink(buildTerminalRecord({
      event,
      invocation_id,
      phase: trace.phase,
      role: trace.role,
      provider: trace.provider,
      model: trace.model,
      provider_attempt_index: trace.provider_attempt_index,
      http_status,
      semantic_state,
      error_class,
      untagged_exception,
      fallback_path: trace.fallback_path,
      phases: trace.phases,
      total_duration_ms: Date.now() - trace.started_at,
      safe_error_fingerprint
    }));
  };

  try {
    // Un tour transporte la demande et son historique, jamais analyst_output ni critic_output :
    // la limite de l'Analyste est donc exactement la bonne, sans nouvelle constante de transport.
    trace.enterPhase("validate", null);
    const input = validateAnalystInput(await readJsonBody(request, TRANSPORT_LIMITS.analyst));
    const turn = await runOperationalRequestTurn(input, { executeRole, log: stampedLog, trace });
    emitTerminal("operational_request_terminal", {
      http_status: 200,
      semantic_state: turn && typeof turn.state === "string" ? turn.state : null,
      error_class: null,
      untagged_exception: false,
      safe_error_fingerprint: null
    });
    return jsonResponse(turn, 200, join);
  } catch (error) {
    /* L'empreinte est SÛRE par construction : jamais error.message, jamais le texte de la pile. */
    const safe_error_fingerprint = await safeErrorFingerprint(error);
    if (error instanceof DecisionHttpError) {
      emitTerminal("operational_request_terminal", {
        http_status: error.status, semantic_state: null, error_class: "http_error",
        untagged_exception: false, safe_error_fingerprint
      });
      return jsonResponse({ error: error.code, message: error.message, invocation_id }, error.status, join);
    }
    /* Une exception qui arrive ici sans classe connue est, par définition, NON ÉTIQUETÉE : c'est
       exactement le cas qui avait rendu un 502 inattribuable. Il est désormais nommé comme tel. */
    const tagged_class = typeof error?.failure_class === "string" ? error.failure_class : null;
    emitTerminal("operational_request_error", {
      http_status: 502,
      semantic_state: null,
      error_class: tagged_class ?? "untagged",
      untagged_exception: tagged_class === null,
      safe_error_fingerprint
    });
    // Aucun détail interne n'est exposé : ni message d'erreur brut, ni pile, ni fournisseur.
    return jsonResponse({ error: "operational_request_failure", message: "La demande opérationnelle n'a pas pu être traitée.", invocation_id }, 502, join);
  }
}

/** Rôles réellement orchestrés — doit rester exactement le registre OPRIE, jamais un sous-ensemble. */
export function assertOrchestratedRolesCoverOprie() {
  const orchestrated = [...OPERATIONAL_REQUEST_ROLE_SEQUENCE].sort();
  const declared = [...OPRIE_ROLES].sort();
  if (orchestrated.length !== declared.length || orchestrated.some((role, index) => role !== declared[index])) {
    throw new TypeError("La séquence orchestrée ne couvre pas exactement les rôles OPRIE.");
  }
}
