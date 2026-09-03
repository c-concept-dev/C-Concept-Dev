/* PERF-03A — PLAN INTERACTIF RAPIDE, DISTINCT DU PLAN DE VALIDATION PROFONDE
 * ============================================================================
 *
 * Le problème n'était pas la lenteur d'un appel : c'était une CAUSALITÉ. Rien
 * ne pouvait s'afficher avant qu'Analyst, Critic et Arbiter aient tous terminé,
 * alors que la plupart de ce travail ne sert pas à décider quoi montrer à
 * l'instant même. M-02 et M-03 ont réduit le coût interne ; ils n'ont pas
 * touché à cette dépendance. Ce lot la coupe.
 *
 * LA SÉPARATION, ET SA LIMITE EXACTE
 *
 *   Le plan RAPIDE répond à une seule question : « quelle interaction sûre
 *   peut-on afficher maintenant ? ». Il propose. Il ne décide pas.
 *
 *   Le plan PROFOND reste entier — Analyst → Critic → Arbiter → OPRIE — et
 *   demeure la seule autorité sur les états sémantiques, la readiness et le
 *   routage. Il n'est ni raccourci, ni sauté, ni conditionné au succès du plan
 *   rapide.
 *
 * POURQUOI CE N'EST PAS UN CONTOURNEMENT : ce que le plan rapide produit porte
 * `authority: "candidate"`. Son schéma ne comporte AUCUN champ d'autorité — pas
 * par convention, mais parce qu'ils n'existent pas : un fournisseur qui
 * renverrait `operational_request_ready` ferait échouer la validation, faute de
 * place où le mettre. On ne se repose pas sur la discipline d'un modèle ; on
 * lui retire la possibilité.
 *
 * L'AUTRE MOITIÉ DU PROBLÈME : deux plans qui avancent à des vitesses
 * différentes finissent dans le désordre. Un résultat profond du tour 10 peut
 * arriver après le tour 11. Sans garde, il écraserait une question à laquelle
 * l'utilisateur est déjà en train de répondre. D'où le tour immuable,
 * l'identifiant monotone, et le rejet explicite de tout résultat périmé.
 * ========================================================================= */

/** Ce que le plan rapide a le droit de proposer. Énumération fermée. */
export const FAST_INTERACTION_TYPES = Object.freeze([
  "ACKNOWLEDGE",
  "ASK_CLARIFICATION",
  "ASK_CONFIRMATION",
  "ORIENT_ARCHITECTE",
  "WAIT_FOR_DEEP_VALIDATION"
]);

/** Une seule interaction par tour. Jamais un questionnaire. */
export const ONE_NEXT_INTERACTION_MAX = 1;

/**
 * Champs d'autorité que le plan rapide ne peut pas porter.
 *
 * Cette liste sert de GARDE, pas de contrat : le schéma ci-dessous ne les
 * contient déjà pas. Elle existe pour qu'une extension future du schéma ne
 * puisse pas les réintroduire sans faire échouer un test.
 */
export const FAST_FORBIDDEN_AUTHORITY_FIELDS = Object.freeze([
  "operational_request_ready", "clarification_required", "confirmation_required",
  "blocked", "degraded_state", "state",
  "route", "routing", "execution_ready", "readiness", "can_execute_now"
]);

/**
 * Schéma MINIMAL, strict. Deux champs, et rien d'autre.
 *
 * Le réduire à ce point n'est pas de l'économie : c'est la garantie. Réutiliser
 * le schéma OPRIE aurait donné au plan rapide des champs qu'il n'a pas le droit
 * de décider, et la seule protection aurait été qu'il s'abstienne de les
 * remplir. Ici, il ne peut pas.
 */
export const FAST_INTERACTION_JSON_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["type", "text"],
  properties: {
    type: { type: "string", enum: [...FAST_INTERACTION_TYPES] },
    text: { type: "string" }
  }
});

const text = (v) => (typeof v === "string" ? v.trim() : "");
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/* ------------------------------------------------------------------------ *
 * LE TOUR — une photographie, consommée à l'identique par les deux plans.
 *
 * Les deux plans doivent partir du MÊME état. S'ils lisaient chacun l'état
 * courant au moment où ils démarrent, une réponse utilisateur arrivée entre les
 * deux les ferait diverger silencieusement — et la réconciliation comparerait
 * alors deux choses qui ne parlent pas du même tour.
 * ------------------------------------------------------------------------ */
export function createTurnSnapshot({ turn_id, original_request, clarification_history = [], current_answer = null, canonical_version = 0 } = {}) {
  if (!Number.isInteger(turn_id) || turn_id < 0) {
    throw new TypeError("PERF-03A : turn_id doit être un entier monotone (jamais un horodatage).");
  }
  if (!text(original_request)) throw new TypeError("PERF-03A : la demande originale est obligatoire.");
  if (!Array.isArray(clarification_history)) throw new TypeError("PERF-03A : clarification_history doit être une liste.");
  if (!Number.isInteger(canonical_version) || canonical_version < 0) {
    throw new TypeError("PERF-03A : canonical_version doit être un entier.");
  }
  return deepFreeze({
    turn_id,
    original_request: String(original_request),
    clarification_history: clarification_history.map((entry) => (isObject(entry) ? { ...entry } : entry)),
    current_answer: current_answer === null ? null : String(current_answer),
    canonical_version
  });
}

/* ------------------------------------------------------------------------ *
 * L'INTERACTION CANDIDATE — non autoritaire par construction.
 * ------------------------------------------------------------------------ */
export function validateFastInteraction(candidate, snapshot) {
  if (!isObject(snapshot)) throw new TypeError("PERF-03A : un instantané de tour est requis.");
  if (!isObject(candidate)) {
    return { ok: false, reason: "FAST_OUTPUT_INVALID", detail: "sortie rapide absente ou non structurée." };
  }
  /* Clés exactes : ni manquantes, ni surnuméraires. Un champ d'autorité glissé
     dans la réponse échoue ici, avant d'avoir pu être lu par qui que ce soit. */
  const cles = Object.keys(candidate).sort();
  if (cles.length !== 2 || cles[0] !== "text" || cles[1] !== "type") {
    return { ok: false, reason: "FAST_SCHEMA_ERROR", detail: `clés inattendues : ${cles.join(", ") || "aucune"}` };
  }
  if (!FAST_INTERACTION_TYPES.includes(candidate.type)) {
    return { ok: false, reason: "FAST_SCHEMA_ERROR", detail: `type d'interaction inconnu : ${String(candidate.type)}` };
  }
  if (typeof candidate.text !== "string" || !candidate.text.trim()) {
    return { ok: false, reason: "FAST_SCHEMA_ERROR", detail: "texte d'interaction vide." };
  }
  return {
    ok: true,
    interaction: deepFreeze({
      interaction_id: `fast-${snapshot.turn_id}`,
      type: candidate.type,
      text: candidate.text.trim(),
      source: "fast_plane",
      /* Le mot compte : ce résultat est un CANDIDAT. Rien dans le système ne
         doit le lire comme un état. */
      authority: "candidate",
      turn_id: snapshot.turn_id,
      canonical_version: snapshot.canonical_version,
      can_execute: false,
      can_route: false,
      can_mark_ready: false
    })
  };
}

/* ------------------------------------------------------------------------ *
 * LE MODE RAPIDE N'A PAS DE BOUCLE DE DIALOGUE.
 *
 * Invariant R1, antérieur à ce lot : Rapide ne converse pas. Une clarification
 * y devient donc une ORIENTATION — on dit à la personne où poursuivre, on ne
 * lui ouvre pas un échange que ce mode ne sait pas tenir.
 * ------------------------------------------------------------------------ */
export const CONVERSATIONAL_MODES = Object.freeze(["architecte"]);

export function projectInteractionForMode(interaction, mode) {
  if (!isObject(interaction)) return null;
  if (CONVERSATIONAL_MODES.includes(String(mode))) return interaction;
  if (interaction.type === "ASK_CLARIFICATION" || interaction.type === "ASK_CONFIRMATION") {
    return deepFreeze({ ...interaction, type: "ORIENT_ARCHITECTE", projected_from: interaction.type });
  }
  return interaction;
}

/* ------------------------------------------------------------------------ *
 * LE COORDINATEUR — ce qui empêche le passé d'écraser le présent.
 * ------------------------------------------------------------------------ */
export function createTurnCoordinator({ initialTurnId = -1 } = {}) {
  let currentTurnId = initialTurnId;
  const discarded = [];
  return {
    /** Ouvre un tour. L'identifiant ne recule jamais. */
    openTurn(turnId) {
      if (!Number.isInteger(turnId) || turnId <= currentTurnId) {
        throw new TypeError(`PERF-03A : turn_id non monotone (${turnId} après ${currentTurnId}).`);
      }
      currentTurnId = turnId;
      return currentTurnId;
    },
    /** Un résultat d'un tour révolu est écarté — jamais appliqué, jamais levé. */
    accept(result, { plane } = {}) {
      const turnId = isObject(result) ? result.turn_id : undefined;
      if (!Number.isInteger(turnId)) return { accepted: false, stale: false, reason: "TURN_ID_MISSING" };
      if (turnId < currentTurnId) {
        discarded.push({ plane: plane || "unknown", turn_id: turnId, current: currentTurnId });
        return { accepted: false, stale: true, reason: "TURN_STALE" };
      }
      return { accepted: true, stale: false, reason: null };
    },
    get currentTurnId() { return currentTurnId; },
    get discardedCount() { return discarded.length; },
    get discarded() { return discarded.map((d) => ({ ...d })); }
  };
}

/* ------------------------------------------------------------------------ *
 * LA RÉCONCILIATION — OPRIE gagne, toujours.
 *
 * Ce n'est pas une préférence d'arbitrage : le plan rapide n'a jamais eu
 * l'autorité. Quand le plan profond arrive, il ne « l'emporte » pas — il dit ce
 * qui est, là où le premier disait ce qu'on pouvait provisoirement montrer.
 * ------------------------------------------------------------------------ */
export const RECONCILIATION_OUTCOMES = Object.freeze([
  "DEEP_CONFIRMS_FAST",
  "DEEP_SUPERSEDES_FAST",
  "TURN_STALE"
]);

/** Correspondance STRUCTURELLE entre un état OPRIE et un type d'interaction. */
const OPRIE_STATE_TO_INTERACTION = Object.freeze({
  clarification_required: "ASK_CLARIFICATION",
  confirmation_required: "ASK_CONFIRMATION"
});

export function reconcileFastWithDeep(fastInteraction, deepTurn, { coordinator } = {}) {
  if (!isObject(deepTurn) || !text(deepTurn.state)) {
    throw new TypeError("PERF-03A : un tour OPRIE est requis pour la réconciliation.");
  }
  if (coordinator) {
    const verdict = coordinator.accept(deepTurn, { plane: "deep" });
    if (verdict.stale) {
      return deepFreeze({ outcome: "TURN_STALE", display: fastInteraction || null, authoritative_state: null, superseded: false });
    }
  }
  const attendu = OPRIE_STATE_TO_INTERACTION[deepTurn.state] || null;
  const confirme = !!fastInteraction && attendu !== null && fastInteraction.type === attendu;
  return deepFreeze({
    /* Confirmé ou non, l'état qui fait foi est celui d'OPRIE : `display` cesse
       d'être une interaction candidate dès que le plan profond a parlé. */
    outcome: confirme ? "DEEP_CONFIRMS_FAST" : "DEEP_SUPERSEDES_FAST",
    display: confirme ? fastInteraction : null,
    authoritative_state: deepTurn.state,
    superseded: !confirme
  });
}

/* ------------------------------------------------------------------------ *
 * LE TOUR INTERACTIF — les deux plans, un seul instantané.
 *
 * Le plan profond démarre en même temps que le rapide et n'attend pas son
 * résultat : c'est ce qui retire le plan profond du chemin critique de
 * l'affichage, sans jamais le retirer du chemin de la décision.
 * ------------------------------------------------------------------------ */
export async function runInteractiveTurn({ snapshot, mode = "architecte", executeFast, executeDeep, onFastInteraction, coordinator } = {}) {
  if (!isObject(snapshot)) throw new TypeError("PERF-03A : un instantané de tour est requis.");
  if (typeof executeFast !== "function") throw new TypeError("PERF-03A : executeFast est obligatoire.");
  if (typeof executeDeep !== "function") throw new TypeError("PERF-03A : executeDeep est obligatoire.");

  /* Les deux partent d'ici, du même objet gelé, à la même milliseconde. */
  const deepPromise = executeDeep(snapshot);

  let fastInteraction = null;
  let fastFailure = null;
  try {
    const brut = await executeFast(snapshot);
    const verdict = validateFastInteraction(brut, snapshot);
    if (verdict.ok) {
      const projetee = projectInteractionForMode(verdict.interaction, mode);
      const accepte = coordinator ? coordinator.accept(projetee, { plane: "fast" }) : { accepted: true, stale: false };
      if (accepte.accepted) {
        fastInteraction = projetee;
        if (typeof onFastInteraction === "function") onFastInteraction(projetee);
      }
    } else {
      /* Un échec rapide ne fabrique JAMAIS d'interaction : on n'invente pas une
         question pour avoir quelque chose à montrer. On attend le plan profond. */
      fastFailure = { reason: verdict.reason, detail: verdict.detail };
    }
  } catch (error) {
    fastFailure = { reason: "FAST_PROVIDER_ERROR", detail: String((error && error.message) || error) };
  }

  /* Le plan profond n'est jamais sauté, quel qu'ait été le sort du rapide. */
  const deepTurn = await deepPromise;
  const reconciliation = reconcileFastWithDeep(fastInteraction, deepTurn, { coordinator });

  return deepFreeze({
    turn_id: snapshot.turn_id,
    fast_interaction: fastInteraction,
    fast_failure: fastFailure,
    deep_turn: deepTurn,
    reconciliation,
    deep_executed: true
  });
}
