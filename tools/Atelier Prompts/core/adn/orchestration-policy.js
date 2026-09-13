/* IA-02A — POLITIQUE D'ORCHESTRATION
 * ============================================================================
 *
 * Une seule question, posée une seule fois : QUE FAIRE ENSUITE ?
 *
 * Elle n'y répond jamais par un état. Les états appartiennent à leurs
 * autorités — OPRIE dit si la demande est prête, Execution Readiness si elle
 * est exécutable, le gate de prompt si le prompt est conforme, le gate de
 * sortie si le livrable l'est. Cette politique ne fait que LIRE leurs verdicts
 * et nommer le pas suivant. Un pas suivant n'est pas une vérité : c'est une
 * conséquence.
 *
 * Ce que cela rend structurellement impossible :
 *
 *   FABRIQUER UNE READINESS. Le mot `operational_request_ready` n'apparaît ici
 *   que comme une valeur LUE dans le verdict d'OPRIE, jamais écrite. Aucune
 *   branche ne peut en produire une : il n'y a pas d'état en sortie.
 *
 *   COURT-CIRCUITER LA CHAÎNE. `EXECUTE` n'est atteignable que si les TROIS
 *   verdicts amont sont présents ET favorables, vérifiés ensemble et non l'un
 *   après l'autre. Un contexte qui porterait un verdict aval sans son amont est
 *   un contexte incohérent, donc un arrêt.
 *
 *   DÉCIDER SUR DU TEXTE. Aucune branche ne lit un texte utilisateur, un
 *   score, un seuil, une longueur ou un mot-clé. Toutes lisent des énumérations
 *   produites par une autorité. C'est ce qui rend la politique déterministe et
 *   vérifiable exhaustivement.
 *
 * PURETÉ : aucune entrée/sortie, aucun accès réseau, aucun fournisseur, aucun
 * DOM, aucune horloge, aucun aléa, aucun état conservé entre deux appels. Le
 * pilote (driver) applique l'action ; il n'en choisit aucune.
 *
 * UN SEUL PAS. La politique ne boucle jamais jusqu'à obtenir l'état voulu :
 * elle rend UNE action, et le tour suivant repartira d'un contexte réel.
 * ========================================================================= */

export const ORCHESTRATION_POLICY_VERSION = "1.0";

/**
 * Les actions possibles. Fermée : rien hors de cette liste n'est exécutable, et
 * le pilote refuse ce qu'il ne connaît pas.
 */
export const ORCHESTRATION_ACTIONS = Object.freeze([
  /* Attente — rien à montrer encore. */
  "WAIT_FOR_FAST",
  "WAIT_FOR_DEEP",
  "WAIT_FOR_USER",
  /* Interaction — une seule à la fois, jamais deux. */
  "SHOW_FAST_INTERACTION",
  "KEEP_CURRENT_INTERACTION",
  "ORIENT_TO_ARCHITECTE",
  /* Chaîne d'exécution — chaque pas exige le verdict du précédent. */
  "ENTER_READINESS",
  "RUN_PROMPT_QG",
  "EXECUTE",
  "RUN_OUTPUT_QG",
  "SHOW_EXECUTION_RESULT",
  "SHOW_OUTPUT_QG_FAILURE",
  /* Fins de tour non exécutables. */
  "SHOW_BLOCKED",
  "SHOW_DEGRADED",
  /* Gardes. */
  "IGNORE_STALE",
  "STOP_FAIL_CLOSED"
]);

/* Les énumérations des AUTORITÉS, en LECTURE SEULE. Le préfixe ACCEPTED_ n'est
   pas décoratif : ces listes disent ce que la politique accepte de LIRE, elles
   ne sont pas les taxonomies elles-mêmes, qui vivent chez leurs autorités. Leur
   donner le nom de l'original les ferait entrer en collision dans le runtime
   partagé, où un même nom peut en masquer un autre. Toute valeur hors
   énumération est une incohérence, jamais un cas par défaut. */
const ACCEPTED_OPRIE_STATES = Object.freeze([
  "clarification_required", "confirmation_required",
  "operational_request_ready", "blocked", "degraded_state"
]);
const ACCEPTED_READINESS_STATES = Object.freeze(["contractualization", "clarification_required", "execution_ready", "blocked"]);
const ACCEPTED_PROMPT_GATE_STATUSES = Object.freeze(["PASS", "PASS_WITH_WARNINGS", "FAIL"]);
const ACCEPTED_OUTPUT_GATE_STATUSES = Object.freeze(["PASS", "PASS_WITH_WARNINGS", "INCOMPLETE_VERIFICATION", "FAIL"]);
const ACCEPTED_EXECUTION_STATUSES = Object.freeze(["success", "technical_error"]);

/** Les modes qui tiennent un dialogue. Rapide n'en fait pas partie : invariant R1. */
export const DIALOG_MODES = Object.freeze(["architecte"]);

/** Les seuls états OPRIE qui SOLLICITENT la personne. */
const SOLICITING_OPRIE_STATES = Object.freeze(["clarification_required", "confirmation_required"]);

/** Correspondance STRUCTURELLE entre un état OPRIE et le type d'interaction rapide
 *  qui en serait la même catégorie. Aucune comparaison de texte, jamais. */
const OPRIE_STATE_TO_FAST_TYPE = Object.freeze({
  clarification_required: "ASK_CLARIFICATION",
  confirmation_required: "ASK_CONFIRMATION"
});

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);

/**
 * Le verdict de la politique. `action` est toujours l'une des ORCHESTRATION_ACTIONS —
 * jamais undefined, jamais une valeur libre. `reason` est un code technique, destiné
 * à l'audit : il ne sort jamais tel quel dans l'interface.
 */
function verdict(action, reason, extra) {
  return Object.freeze({
    version: ORCHESTRATION_POLICY_VERSION,
    action,
    reason,
    ...(extra || {})
  });
}

/**
 * Un contexte doit être STRUCTURELLEMENT lisible avant d'être interprété. Un
 * champ présent mais hors énumération n'est pas ignoré : il rend le contexte
 * incohérent. Ignorer silencieusement une valeur inconnue serait exactement le
 * fail-open que ce système s'interdit.
 */
function contextProblems(context) {
  const problems = [];
  if (!isObject(context)) return ["CONTEXT_NOT_AN_OBJECT"];
  const { mode, turn, fast, deep, readiness, promptQG, execution, outputQG } = context;

  if (typeof mode !== "string" || !mode) problems.push("MODE_MISSING");
  if (!isObject(turn)) problems.push("TURN_MISSING");
  else {
    if (!isInt(turn.turn_id) || turn.turn_id < 0) problems.push("TURN_ID_INVALID");
    if (!isInt(turn.current_turn_id) || turn.current_turn_id < 0) problems.push("CURRENT_TURN_ID_INVALID");
    if (turn.mode !== undefined && typeof turn.mode !== "string") problems.push("TURN_MODE_INVALID");
  }
  if (fast !== null && fast !== undefined) {
    if (!isObject(fast)) problems.push("FAST_INVALID");
    /* Une candidate qui se prétendrait autoritaire n'est pas dégradée en
       candidate : elle rend le contexte incohérent. */
    else if (fast.authority !== undefined && fast.authority !== "candidate") problems.push("FAST_CLAIMS_AUTHORITY");
    else if (fast.can_execute === true || fast.can_route === true || fast.can_mark_ready === true) problems.push("FAST_CLAIMS_PERMISSION");
  }
  if (deep !== null && deep !== undefined) {
    if (!isObject(deep) || !ACCEPTED_OPRIE_STATES.includes(deep.state)) problems.push("DEEP_STATE_INVALID");
  }
  if (readiness !== null && readiness !== undefined) {
    if (!isObject(readiness) || !ACCEPTED_READINESS_STATES.includes(readiness.state)) problems.push("READINESS_STATE_INVALID");
  }
  if (promptQG !== null && promptQG !== undefined) {
    if (!isObject(promptQG) || !ACCEPTED_PROMPT_GATE_STATUSES.includes(promptQG.status)) problems.push("PROMPT_QG_STATUS_INVALID");
  }
  if (execution !== null && execution !== undefined) {
    if (!isObject(execution) || !ACCEPTED_EXECUTION_STATUSES.includes(execution.status)) problems.push("EXECUTION_STATUS_INVALID");
  }
  if (outputQG !== null && outputQG !== undefined) {
    if (!isObject(outputQG) || !ACCEPTED_OUTPUT_GATE_STATUSES.includes(outputQG.status)) problems.push("OUTPUT_QG_STATUS_INVALID");
  }
  return problems;
}

/** La demande est-elle déclarée exécutable par OPRIE ? Lecture, jamais écriture. */
const oprieIsReady = (deep) => isObject(deep) && deep.state === "operational_request_ready";
const readinessPassed = (r) => isObject(r) && r.state === "execution_ready";
const promptGatePassed = (g) => isObject(g) && (g.status === "PASS" || g.status === "PASS_WITH_WARNINGS");

/**
 * ORDRE DE PRÉCÉDENCE DE LA CHAÎNE — et pourquoi il est vérifié d'un bloc.
 *
 * Un verdict aval ne peut exister que si tous ses amonts existent et sont
 * favorables. Vérifier « readiness present ? alors QG » puis « QG present ?
 * alors exécuter » laisserait passer un contexte portant un QG PASS sans
 * readiness : la chaîne serait contournée par simple omission. On exige donc la
 * chaîne ENTIÈRE à chaque étage.
 */
function chainBrokenAt(context) {
  const { deep, readiness, promptQG, execution, outputQG } = context;
  if ((outputQG !== null && outputQG !== undefined) && !(isObject(execution) && execution.status === "success")) return "OUTPUT_QG_WITHOUT_EXECUTION";
  if ((execution !== null && execution !== undefined) && !promptGatePassed(promptQG)) return "EXECUTION_WITHOUT_PROMPT_QG";
  if ((promptQG !== null && promptQG !== undefined) && !readinessPassed(readiness)) return "PROMPT_QG_WITHOUT_READINESS";
  if ((readiness !== null && readiness !== undefined) && !oprieIsReady(deep)) return "READINESS_WITHOUT_OPRIE_READY";
  return null;
}

/**
 * decideNextOrchestrationAction — LA politique.
 *
 * @param {object} context  {mode, turn, fast, deep, readiness, promptQG, execution, outputQG}
 * @returns {{version:string, action:string, reason:string}} une action, toujours connue.
 */
export function decideNextOrchestrationAction(context) {
  /* 1. LISIBILITÉ. Un contexte qu'on ne sait pas lire n'est jamais interprété au mieux. */
  const problems = contextProblems(context);
  if (problems.length) return verdict("STOP_FAIL_CLOSED", "CONTEXT_INVALID", { problems: Object.freeze([...problems]) });

  const { mode, turn, fast = null, deep = null } = context;

  /* 2. LE PASSÉ N'AGIT PAS. Un tour révolu — par son numéro ou par son mode — ne
     produit aucune action applicable. Le mode fait partie de l'identité du tour :
     une action calculée pour Architecte n'a aucun sens une fois passé en Rapide. */
  if (turn.turn_id < turn.current_turn_id) return verdict("IGNORE_STALE", "TURN_SUPERSEDED");
  if (turn.mode !== undefined && turn.mode !== mode) return verdict("IGNORE_STALE", "MODE_SWITCHED");

  /* 3. LA CHAÎNE NE SE CONTOURNE PAS. */
  const broken = chainBrokenAt(context);
  if (broken) return verdict("STOP_FAIL_CLOSED", broken);

  /* 4. LES ÉTAGES AVAL D'ABORD : leur présence prouve que l'amont a déjà conclu. */
  const { readiness = null, promptQG = null, execution = null, outputQG = null } = context;

  if (outputQG) {
    /* Le verdict de conformité n'est jamais réinterprété : il est rendu tel quel.
       Un échec ne peut donc pas devenir un succès en traversant l'orchestration. */
    if (outputQG.status === "FAIL") return verdict("SHOW_OUTPUT_QG_FAILURE", "OUTPUT_QG_FAIL");
    return verdict("SHOW_EXECUTION_RESULT", `OUTPUT_QG_${outputQG.status}`);
  }
  if (execution) {
    if (execution.status === "technical_error") return verdict("SHOW_EXECUTION_RESULT", "EXECUTION_TECHNICAL_ERROR");
    return verdict("RUN_OUTPUT_QG", "EXECUTION_SUCCEEDED");
  }
  if (promptQG) {
    if (promptGatePassed(promptQG)) return verdict("EXECUTE", `PROMPT_QG_${promptQG.status}`);
    return verdict("STOP_FAIL_CLOSED", "PROMPT_QG_FAIL");
  }
  if (readiness) {
    if (readinessPassed(readiness)) return verdict("RUN_PROMPT_QG", "READINESS_EXECUTION_READY");
    /* Readiness non concluante : la politique ne réinterprète pas son verdict et
       n'en déduit aucune question. Elle s'arrête. */
    return verdict("STOP_FAIL_CLOSED", `READINESS_${String(readiness.state).toUpperCase()}`);
  }

  /* 5. LE TOUR OPRIE — la première décision autoritaire du tour. */
  const dialogue = DIALOG_MODES.includes(mode);
  if (deep) {
    if (deep.state === "blocked") return verdict("SHOW_BLOCKED", "OPRIE_BLOCKED");
    if (deep.state === "degraded_state") return verdict("SHOW_DEGRADED", "OPRIE_DEGRADED");
    if (deep.state === "operational_request_ready") {
      /* READY n'est PAS « exécuter ». C'est l'entrée dans Execution Readiness,
         dans les deux modes, sans exception. */
      return verdict("ENTER_READINESS", "OPRIE_READY");
    }
    if (SOLICITING_OPRIE_STATES.includes(deep.state)) {
      /* LE DIALOGUE DE READINESS EST MODE-INDÉPENDANT — et ce n'est pas une
         tolérance, c'est le contrat FC-01b : OPRIE décide si la demande est
         PRÊTE, le mode décide seulement du MOTEUR D'EXÉCUTION. La question de
         readiness précède le routage ; la refuser en Rapide reviendrait à
         modifier la sémantique d'OPRIE selon le mode, ce que ce système
         interdit. L'invariant R1 « Rapide ne converse pas » porte sur le MOTEUR
         Rapide, en aval du routage — il est gardé plus bas, sur la candidate. */
      if (turn.pending_user_interaction === true && isObject(fast) && fast.type === OPRIE_STATE_TO_FAST_TYPE[deep.state]) {
        /* Une interaction rapide de la MÊME catégorie est déjà lue par la
           personne : la remplacer par une identique ne montrerait rien de neuf. */
        return verdict("KEEP_CURRENT_INTERACTION", `DEEP_CONFIRMS_FAST_${deep.state.toUpperCase()}`);
      }
      /* UNE SEULE ACTION POUR LES DEUX SOLLICITATIONS, et dans les deux modes.
         Distinguer ici « clarifier » de « confirmer » ferait de l'orchestration
         un second lieu où l'état d'OPRIE est interprété. Ce qui est montré à la
         personne découle de l'état OPRIE lui-même, rendu par son propre
         afficheur : le pilote restitue une autorité, il n'en dérive aucune. */
      return verdict("WAIT_FOR_USER", `OPRIE_${deep.state.toUpperCase()}`);
    }
    /* Défaut FAIL-CLOSED : un état hors énumération est déjà refusé plus haut ;
       laisser ici un cas par défaut permissif ferait de toute extension future
       de l'énumération OPRIE un fail-open silencieux. */
    return verdict("STOP_FAIL_CLOSED", "OPRIE_STATE_UNHANDLED");
  }

  /* 6. RIEN D'AUTORITAIRE ENCORE. On peut montrer une candidate, mais on attend. */
  if (isObject(fast)) {
    if (turn.pending_user_interaction === true) return verdict("KEEP_CURRENT_INTERACTION", "INTERACTION_ALREADY_PENDING");
    if (fast.type === "WAIT_FOR_DEEP_VALIDATION") return verdict("WAIT_FOR_DEEP", "FAST_HAS_NOTHING_TO_SHOW");
    /* INVARIANT R1, gardé ICI. Une candidate qui SOLLICITE la personne ne peut
       exister que dans un mode qui tient un dialogue. Le noyau du plan rapide
       projette déjà les sollicitations en orientation hors Architecte ; en
       recevoir une non projetée signifie que cette projection a été sautée.
       Ce n'est pas un cas à rattraper au mieux — c'est une incohérence. */
    if (!dialogue && (fast.type === "ASK_CLARIFICATION" || fast.type === "ASK_CONFIRMATION")) {
      return verdict("STOP_FAIL_CLOSED", "FAST_SOLICITATION_IN_NON_DIALOG_MODE");
    }
    if (fast.type === "ORIENT_ARCHITECTE") return verdict("ORIENT_TO_ARCHITECTE", "FAST_ORIENTS_TO_ARCHITECTE");
    return verdict("SHOW_FAST_INTERACTION", "FAST_CANDIDATE_AVAILABLE");
  }
  if (turn.pending_user_interaction === true) return verdict("WAIT_FOR_USER", "INTERACTION_PENDING_WITHOUT_FAST");
  if (context.fast_failed === true) return verdict("WAIT_FOR_DEEP", "FAST_UNAVAILABLE");
  return verdict("WAIT_FOR_FAST", "NOTHING_RECEIVED_YET");
}

/**
 * INVARIANT DÉCLARÉ : aucun état OPRIE n'est réinterprété selon le mode.
 *
 * OPRIE décide si la demande est PRÊTE ; le mode décide seulement du MOTEUR
 * D'EXÉCUTION, en aval du routage. Un même état OPRIE produit donc la même
 * action d'orchestration dans tous les modes — c'est vérifiable exhaustivement,
 * et c'est vérifié.
 */
export function oprieActionIsModeIndependent(state, modes = ["rapide", "architecte"]) {
  const base = { turn: { turn_id: 0, current_turn_id: 0 }, deep: { state } };
  const actions = modes.map((mode) => decideNextOrchestrationAction({ ...base, mode }).action);
  return actions.every((action) => action === actions[0]);
}

/** Une action est-elle connue ? Le pilote ne doit rien appliquer d'autre. */
export function isKnownOrchestrationAction(action) {
  return typeof action === "string" && ORCHESTRATION_ACTIONS.includes(action);
}

/** Les actions qui SOLLICITENT la personne. Au plus une peut être ouverte à la fois. */
export const USER_SOLICITING_ACTIONS = Object.freeze(["WAIT_FOR_USER", "SHOW_FAST_INTERACTION"]);

/** Vue d'audit : ce que la politique a lu et ce qu'elle en a conclu. Aucun texte. */
export function createOrchestrationAuditView(context, decision) {
  return Object.freeze({
    version: ORCHESTRATION_POLICY_VERSION,
    turn_id: isObject(context) && isObject(context.turn) ? context.turn.turn_id : null,
    mode: isObject(context) ? context.mode : null,
    oprie_state: isObject(context) && isObject(context.deep) ? context.deep.state : null,
    readiness_state: isObject(context) && isObject(context.readiness) ? context.readiness.state : null,
    prompt_qg_status: isObject(context) && isObject(context.promptQG) ? context.promptQG.status : null,
    output_qg_status: isObject(context) && isObject(context.outputQG) ? context.outputQG.status : null,
    fast_type: isObject(context) && isObject(context.fast) ? context.fast.type : null,
    action: isObject(decision) ? decision.action : null,
    reason: isObject(decision) ? decision.reason : null
  });
}
