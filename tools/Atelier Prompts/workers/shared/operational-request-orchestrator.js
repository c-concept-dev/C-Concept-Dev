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
  return { ...base, analyst_output: outputs.analyst, critic_output: outputs.critic };
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
export async function runOperationalRequestTurn(input, { executeRole, log = defaultLog } = {}) {
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
    log({ event: "operational_request_role_start", role, sequence: OPERATIONAL_REQUEST_ROLE_SEQUENCE });
    let raw;
    try {
      raw = await executeRole(role, buildRoleInput(role, base, outputs, material_context, material_content));
    } catch (error) {
      if (!isProviderChainExhausted(error)) throw error;
      // Le détail technique reste côté serveur ; le client reçoit un motif neutre.
      const internal = degradedResultFromProviderChainError(role, error);
      log({ event: "operational_request_degraded", role, attempts: error.attempts ?? [], internal_reason: internal.reason });
      return validateDegradedRoleResult(createDegradedRoleResult(role, publicDegradationReason(role)));
    }
    outputs[role] = assertRoleOutputShape(role, raw);
    log({ event: "operational_request_role_ok", role });
  }

  const turn = outputs.arbiter;
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
export async function handleOperationalRequest(request, env, { executeRole, log } = {}) {
  const url = new URL(request.url);
  const cors = corsHeaders(request, env);
  if (request.method === "OPTIONS") {
    return cors ? new Response(null, { status: 204, headers: cors }) : jsonResponse({ error: "origin_not_allowed" }, 403, null);
  }
  if (url.pathname !== "/operational-request") return jsonResponse({ error: "not_found" }, 404, cors);
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, cors);
  if (!cors) return jsonResponse({ error: "origin_not_allowed" }, 403, null);
  try {
    // Un tour transporte la demande et son historique, jamais analyst_output ni critic_output :
    // la limite de l'Analyste est donc exactement la bonne, sans nouvelle constante de transport.
    const input = validateAnalystInput(await readJsonBody(request, TRANSPORT_LIMITS.analyst));
    return jsonResponse(await runOperationalRequestTurn(input, { executeRole, ...(log ? { log } : {}) }), 200, cors);
  } catch (error) {
    if (error instanceof DecisionHttpError) return jsonResponse({ error: error.code, message: error.message }, error.status, cors);
    // Aucun détail interne n'est exposé : ni message d'erreur brut, ni pile, ni fournisseur.
    console.error(JSON.stringify({ event: "operational_request_error", message: error instanceof Error ? error.message : "unknown" }));
    return jsonResponse({ error: "operational_request_failure", message: "La demande opérationnelle n'a pas pu être traitée." }, 502, cors);
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
