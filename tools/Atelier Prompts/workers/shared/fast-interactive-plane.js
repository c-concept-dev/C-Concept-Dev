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
import { QUESTION_FOCUS_VALUES } from "../../core/adn/operational-request-state.js";

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
  /* FAST-FIRST-PASS — L'ORDRE DES CHAMPS EST L'ORDRE DU RAISONNEMENT.
   *
   * MESURÉ SUR DEUX SMOKES HUMAINS INDÉPENDANTS, dont un sur une demande parfaitement formulée :
   * la demande disait « je ne sais pas encore quel budget », et le premier tour rendait
   * `{ASK, missing_determinant_id: "budget", explicit_unknown_determinant_ids: []}`. La consigne
   * existait, au bon endroit, et n'était pas appliquée au premier passage.
   *
   * LA CAUSE N'ÉTAIT PAS LA CONSIGNE, C'ÉTAIT CE CONTRAT. En sortie structurée stricte, le modèle
   * émet les clés dans l'ordre où le schéma les déclare. `explicit_unknown_determinant_ids` venait
   * EN DERNIER : le type, le texte et l'inconnue visée étaient donc déjà écrits — la décision de
   * questionner était déjà prise — quand le registre était rempli. Il ne pouvait structurellement
   * pas participer à cette décision : c'était une annotation de fin, pas un fait.
   *
   * Il passe en tête. Le modèle établit d'abord ce que la personne a déclaré ignorer, et décide
   * ensuite. Aucun champ ajouté, aucune autorité nouvelle, aucun appel de plus : le même contrat,
   * dans l'ordre où il doit être pensé. */
  /* FAST-SPURIOUS-CLARIFICATION-FIX-01 — LA PREUVE AVANT LA DÉCISION, POUR LA MÊME RAISON.
   *
   * MESURÉ EN PRODUCTION SUR ZEVQ7C : la demande comparait plusieurs options ENSEMBLE, et le plan
   * rapide a rendu `{ASK_CLARIFICATION, missing_determinant_id: "lot_to_start"}` — une sous-structure
   * de travail (« laquelle en premier ? ») que la demande ne contenait pas, ne contraignait pas, et
   * dont rien ne dépendait. L'analyse profonde du même cas concluait « continuer », zéro question.
   *
   * POURQUOI RIEN NE L'ARRÊTAIT. Tous les gardes du plan rapide jugent la FORME d'une question —
   * atomique, non méta, non répétée, pas de matériau. Aucun ne pouvait juger son FONDEMENT : le
   * modèle nommait l'inconnue APRÈS avoir décidé de questionner, et l'identifiant était libre. Un
   * garde déterministe ne peut pas lire une phrase pour savoir si la demande la justifie — ce
   * serait le classifieur que l'architecture interdit. Il peut en revanche constater qu'une
   * citation figure, mot pour mot, dans les mots de la personne.
   *
   * CE CHAMP EST CETTE CITATION, et il vient AVANT `type` : le modèle doit d'abord trouver dans la
   * demande l'exigence dont le respect dépend d'une information non donnée, puis décider. S'il
   * n'en trouve aucune à citer, il n'y a pas de question à poser. Même mécanisme que le registre
   * ci-dessus, même raison : l'ordre du schéma est l'ordre du raisonnement. Ce champ ne repart
   * jamais vers le client — il sert au garde, et à lui seul. */
  required: ["explicit_unknown_determinant_ids", "missing_determinant_evidence", "type", "text", "question_focus", "missing_determinant_id"],
  properties: {
    /* OPTION D — CE QUE LA PERSONNE A ELLE-MÊME DÉCLARÉ NE PAS CONNAÎTRE.
     *
     * Mesuré en usage réel : une demande disait « pour cette donnée, je ne sais pas encore », et la
     * première question portait exactement dessus. Aucun mécanisme n'avait tort — le garde compare
     * l'historique, qui était vide, et la doctrine ne parle que d'une réponse OBTENUE. Une inconnue
     * déclarée AVANT toute question n'avait aucun porteur : pour tout composant déterministe, elle
     * était indiscernable d'une absence.
     *
     * Ce champ lui en donne un. Ce n'est pas une seconde autorité — c'est la MÊME décision qui lit
     * déjà la demande et nomme déjà ce qui manque, à qui l'on demande de nommer aussi ce que la
     * personne a dit ignorer. Rien n'est déduit de mots-clés, rien n'est fabriqué par l'interface,
     * et une liste vide reste la réponse normale.
     *
     * CE QU'IL NE FAIT PAS : il ne déclare aucune readiness, ne convertit rien en inconnue
     * résiduelle, et ne juge pas si l'inconnue est bloquante. Il NOMME un fait. */
    explicit_unknown_determinant_ids: {
      type: ["array", "null"], items: { type: "string" },
      /* FAST-INDEPENDENCE — LA DESCRIPTION VOYAGE AVEC LE SCHÉMA, DANS LE MÊME APPEL.
       *
       * MESURÉ : sur une demande déclarant une inconnue X ET portant une variable Y réellement
       * bloquante, l'autorité a correctement questionné Y, n'a pas redemandé X — et a laissé ce
       * registre VIDE. Le comportement était juste, la déclaration absente, donc la protection D2
       * non armée.
       *
       * L'audit du prompt a montré pourquoi : le registre y était défini PAR RÉFÉRENCE à
       * missing_determinant_id (« dans le même espace d'identifiants que… ») et justifié UNIQUEMENT
       * par son effet sur la décision du tour. Rien ne disait qu'il en est indépendant — dans une
       * consigne dont l'injonction dominante est « plusieurs manques, une seule question ».
       *
       * Cette description énonce l'indépendance là où le champ est écrit. Je n'affirme rien sur la
       * façon dont le fournisseur l'exploite : le seul fait vérifié est qu'elle part avec le schéma
       * dans `response_format`, le payload transportant l'objet sans filtrage. */
      description: "Identifiants des informations que la personne a explicitement déclaré ne pas connaître. Ce registre est indépendant du type d'interaction et de missing_determinant_id ; il reste renseigné lorsqu'une question porte sur une autre variable."
    },
    /* FAST-SPURIOUS-CLARIFICATION-FIX-01 — la citation qui FONDE une question. Voir `required`. */
    missing_determinant_evidence: {
      type: ["string", "null"],
      description: "Citation exacte, mot pour mot et sans coupure, du passage de la demande ou d'une réponse déjà donnée dont le respect dépend de l'information que la question demande. Ce passage est une exigence écrite par la personne, jamais une étape, un ordre ou un découpage du travail imaginé pour l'exécuter. null si aucun passage ne dépend d'une information non donnée : dans ce cas aucune question n'est possible. null sans question."
    },
    type: { type: "string", enum: [...FAST_INTERACTION_TYPES] },
    text: { type: "string" },
    /* V2.2.1-D2F1 — ce que la question INTERROGE, dit par celui qui l'écrit. null quand il n'y a
       pas de question : ce plan accuse aussi réception et se tait, et rien n'est alors interrogé. */
    question_focus: { type: ["string", "null"], enum: [...QUESTION_FOCUS_VALUES, null] },
    /* TARGETED-FIX-POST-CODEX-01 — CE QUI MANQUE, NOMMÉ PAR CELUI QUI CHOISIT LA QUESTION.
     *
     * Le plan profond déclarait cette identité ; ce plan-ci, non. Mesuré sur un usage réel : cinq
     * des six questions d'un tour venaient d'ici, et repartaient donc dans l'historique SANS
     * identité. Une reformulation ultérieure du même manque par le plan profond n'était alors plus
     * reconnue — la protection retombait sur l'égalité de texte, que la moindre reformulation
     * défait.
     *
     * Ce n'est pas une seconde autorité : c'est la MÊME décision qui choisit la question, à qui
     * l'on demande de nommer ce qu'elle cherche. Aucun identifiant n'est dérivé de mots-clés, aucun
     * n'est fabriqué par l'interface, et null reste une réponse légitime. */
    missing_determinant_id: {
      type: ["string", "null"],
      description: "Identifiant de l'information recherchée par la question de ce tour. Il est distinct de explicit_unknown_determinant_ids, qui décrit en parallèle les inconnues explicitement déclarées par la personne."
    }

  }
});

/* FAST-SPURIOUS-CLARIFICATION-FIX-01 — CE QUI REPART VERS LE CLIENT : le contrat déclaré, MOINS la
 * citation. Elle a servi au garde, elle porte les mots de la personne, et le client n'en a aucun
 * usage — ni pour afficher, ni pour l'historique, ni pour l'anti-répétition. Déclaré ici pour que
 * la porte réseau et les tests lisent la même liste, et pour qu'un client déjà déployé continue
 * de recevoir exactement les clés qu'il connaît. */
export const FAST_INTERACTION_TRANSPORT_FIELDS = Object.freeze(
  FAST_INTERACTION_JSON_SCHEMA.required.filter((k) => k !== "missing_determinant_evidence")
);

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
/* BETA-04 — LE PLAN RAPIDE DOIT SAVOIR QU'UN MATÉRIAU EXISTE, SANS JAMAIS LE LIRE.
 *
 * Mesuré : sur « Corrige ce texte en conservant le sens » avec le texte réellement collé, le plan
 * rapide demandait « Quel texte souhaitez-vous que je corrige ? ». Il ne pouvait pas faire mieux :
 * l'instantané ne disait rien de la présence d'un matériau. Un booléen suffit, et il ne porte
 * aucune autorité — c'est exactement ce que `material_context.present` dit déjà au plan profond.
 * Le CONTENU, lui, n'entre pas : le plan rapide n'a pas à le lire pour savoir qu'il existe. */
export function createTurnSnapshot({ turn_id, original_request, clarification_history = [], current_answer = null, canonical_version = 0, material_present = false } = {}) {
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
    canonical_version,
    material_present: material_present === true
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
  /* Deux clés historiques, plus le fait de D2F1 quand il est là — et rien d'autre. La tolérance
     porte sur la seule clé ajoutée : un champ d'autorité glissé dans la réponse échoue toujours
     ici, avant d'avoir pu être lu par qui que ce soit. */
  /* Lecture tolérante, écriture stricte : les deux faits ajoutés après coup — ce que la question
     interroge, et ce qu'il lui manque — sont exigés du modèle et tolérés absents du validateur. */
  const cles = Object.keys(candidate).sort();
  const attendues = ["text", "type"];
  if (cles.includes("question_focus")) attendues.push("question_focus");
  if (cles.includes("missing_determinant_id")) attendues.push("missing_determinant_id");
  if (cles.includes("explicit_unknown_determinant_ids")) attendues.push("explicit_unknown_determinant_ids");
  /* FAST-SPURIOUS-CLARIFICATION-FIX-01 — la citation est tolérée à l'entrée, jamais recopiée à la
     sortie : elle a déjà servi au garde, et elle porte les mots de la personne. */
  if (cles.includes("missing_determinant_evidence")) attendues.push("missing_determinant_evidence");
  attendues.sort();
  if (cles.length !== attendues.length || cles.some((c, i) => c !== attendues[i])) {
    return { ok: false, reason: "FAST_SCHEMA_ERROR", detail: `clés inattendues : ${cles.join(", ") || "aucune"}` };
  }
  const focus = candidate.question_focus === undefined || candidate.question_focus === null
    ? null : candidate.question_focus;
  if (focus !== null && !QUESTION_FOCUS_VALUES.includes(focus)) {
    return { ok: false, reason: "FAST_SCHEMA_ERROR", detail: `question_focus inconnu : ${String(focus)}` };
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
      question_focus: focus,
      /* L'identité du manque, telle que le plan rapide l'a nommée. Jamais dérivée ici. */
      missing_determinant_id: typeof candidate.missing_determinant_id === "string" && candidate.missing_determinant_id.trim()
        ? candidate.missing_determinant_id.trim() : null,
      /* OPTION D — des IDENTITÉS, jamais des phrases. Ce qui n'est pas une identité non vide est
         écarté sans être réparé ; une liste absente vaut une liste vide, et ne se devine pas. */
      explicit_unknown_determinant_ids: Object.freeze((Array.isArray(candidate.explicit_unknown_determinant_ids)
        ? candidate.explicit_unknown_determinant_ids : [])
        .filter((id) => typeof id === "string" && id.trim())
        .map((id) => id.trim())),
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
/* ATELIER-RAPIDE-CONVERSATIONAL-FIX-01 — « RAPIDE NE CONVERSE PAS » ÉTAIT UNE RÈGLE, PAS UN FAIT.
 *
 * L'invariant R1 faisait d'une clarification une ORIENTATION dès que le mode n'était pas
 * Architecte : on disait à la personne où poursuivre au lieu de lui poser la question. Le
 * diagnostic du chemin réel a mesuré ce que cette règle coûte — en Rapide, le plan rapide répond
 * en 503 ms, sa question est convertie en orientation, et l'utilisateur attend le plan profond,
 * soit ~92 s sur le cas de référence. La règle était le défaut, pas le plan rapide.
 *
 * CE QUI NE CHANGE PAS : le plan rapide ne gagne AUCUNE autorité. Sa sortie reste
 * authority="candidate", son schéma continue d'interdire tout champ d'état, et le plan profond
 * tranche toujours. Poser une question n'a jamais été une autorité — c'est le contraire d'une
 * décision.
 *
 * Atelier reste hors de cette liste : ce mode compose à la main et ne tient pas de tour gouverné.
 */
export const CONVERSATIONAL_MODES = Object.freeze(["architecte", "rapide"]);

export function projectInteractionForMode(interaction, mode) {
  if (!isObject(interaction)) return null;
  if (CONVERSATIONAL_MODES.includes(String(mode))) {
    /* 01D-G — UN ACCUSÉ DE RÉCEPTION N'EST PLUS UNE RÉPONSE UTILE.
     *
     * Le bandeau d'analyse est déjà affiché quand le tour commence, avant même que le
     * plan rapide existe. Un ACKNOWLEDGE ne pouvait donc rien apporter de plus : il
     * remplaçait une phrase générique par une phrase écrite par le modèle, sous le
     * même titre. La mesure a dit ce que coûtait cet échange — la phrase générique ne
     * promet rien, celle du modèle peut promettre un travail sur un matériau qui
     * n'existe pas.
     *
     * On retire donc la capacité, pas la sortie : le fournisseur continue de produire
     * son ACKNOWLEDGE, la validation continue de le contrôler, la télémétrie continue
     * de le voir. Il cesse seulement d'être montré, et retombe sur la primitive de
     * silence qui existait déjà. Ce n'est pas un jugement sur CE qu'il dit — aucune
     * analyse n'est faite ici, aucun mot n'est lu : c'est une projection de type à
     * type, de la même nature que celle qui suit. */
    if (interaction.type === "ACKNOWLEDGE") {
      return deepFreeze({ ...interaction, type: "WAIT_FOR_DEEP_VALIDATION", projected_from: interaction.type });
    }
    return interaction;
  }
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
