import { createHash } from "node:crypto";

export const EXECUTION_CONTRACT_VERSION = "1.0";

export const EXECUTION_LOCK_IDS = Object.freeze([
  "role", "recipient", "data", "provenance", "scope", "plan", "format",
  "volume", "opening_closing", "forbidden", "assumptions", "length", "final_check"
]);

const LOCK_IDS = new Set(EXECUTION_LOCK_IDS);
const CONFIDENCE = Object.freeze({ haute: "high", moyenne: "medium", high: "high", medium: "medium" });
const ENGINES = new Set(["rapide", "architecte", null]);
const STATES = new Set(["exploitable", "clarification_necessaire"]);
const ETHICS_KEYS = Object.freeze([
  "user_autonomy_preserved",
  "factual_integrity_required",
  "critical_invention_forbidden",
  "proportionality_required",
  "functional_transparency_required",
  "safety_overrides_execution",
  "material_rights_respected",
  "reversibility_preserved",
  "human_efficiency_required"
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

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function numbered(prefix, index) {
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function normalizeConstraint(item, index) {
  const value = typeof item === "string" ? { text: item } : item || {};
  return { id: numbered("REQ", index), text: text(value.text || value.contenu), source: "user" };
}

function normalizeFact(item, index, status, source) {
  const value = typeof item === "string" ? { text: item } : item || {};
  return {
    id: text(value.id) || numbered(source === "material" ? "MAT" : source === "deduction" ? "DED" : "FACT", index),
    text: text(value.text || value.contenu),
    source,
    status
  };
}

function architectEvidence(architect = {}) {
  const declarations = list(architect.comprehension?.declarations);
  const constraints = list(architect.comprehension?.contraintes);
  const all = [...declarations, ...constraints];
  const user = all.filter((item) => item?.statut === "declaration_utilisateur");
  const material = all.filter((item) => item?.statut === "affirmation_du_materiau");
  const deductions = all.filter((item) => ["deduction_llm", "connaissance_externe_non_verifiee"].includes(item?.statut));
  return { user, material, deductions };
}

function normalizeAssumptions(items) {
  return list(items).map((item, index) => {
    const value = typeof item === "string" ? { text: item } : item || {};
    return {
      id: text(value.id) || numbered("ASM", index),
      text: text(value.text || value.contenu),
      source: ["user", "material", "deduction"].includes(value.source) ? value.source : "deduction",
      status: "assumption"
    };
  }).filter((item) => item.text);
}

function resolveObligationIds(ids, obligations) {
  return uniqueBy(list(ids).map((id) => obligations.find((obligation) => obligation.id === id || obligation.constraint_id === id)?.id).filter(Boolean), (id) => id);
}

function normalizeQuantities(items, architect, obligations) {
  const raw = [...list(items)];
  const aq = architect?.livrable?.quantites;
  if (!raw.length && aq) raw.push({ min: aq.min, max: aq.max, unit: aq.unite, target: architect.livrable.nature });
  return raw.map((item, index) => {
    const value = item || {};
    const min = Number.isInteger(value.min) ? value.min : null;
    const max = Number.isInteger(value.max) ? value.max : null;
    const exact = Number.isInteger(value.exact) ? value.exact : min !== null && min === max ? min : null;
    return {
      id: text(value.id) || numbered("Q", index),
      target: text(value.target) || null,
      unit: text(value.unit || value.unite) || null,
      exact,
      min: exact === null ? min : null,
      max: exact === null ? max : null,
      obligation_ids: resolveObligationIds(value.obligation_ids, obligations)
    };
  });
}

function normalizeLock(item, index) {
  const value = typeof item === "string" ? { id: item } : item || {};
  return {
    id: value.id,
    reason: text(value.reason) || "Verrou actif dans l’état runtime projeté.",
    priority: value.priority === "useful" ? "useful" : "mandatory",
    source: ["user", "material", "system", "runtime"].includes(value.source) ? value.source : "runtime",
    source_ids: list(value.source_ids).filter((id) => typeof id === "string"),
    associated_checks: list(value.associated_checks).filter((id) => typeof id === "string"),
    active: value.active !== false
  };
}

function normalizeCheck(item, index, obligations) {
  const value = typeof item === "string" ? { rule: item } : item || {};
  const type = ["deterministic", "heuristic", "semantic", "manual"].includes(value.type) ? value.type : "manual";
  return {
    id: text(value.id) || numbered("CHK", index),
    type,
    target: text(value.target) || "deliverable",
    rule: text(value.rule || value.text || value.nom),
    blocking: value.blocking === true,
    obligation_ids: resolveObligationIds(value.obligation_ids, obligations)
  };
}

function runtimeConstraints(snapshot, architect) {
  const explicit = snapshot.intent?.explicit_constraints;
  if (Array.isArray(explicit)) return explicit;
  return list(architect?.comprehension?.contraintes)
    .filter((item) => item?.statut === "declaration_utilisateur")
    .map((item) => item.contenu);
}

function runtimeLocks(snapshot) {
  return list(snapshot.locks?.length ? snapshot.locks : snapshot.rapid?.locks || snapshot.prompt_contract?.locks);
}

function runtimeChecks(snapshot, architect) {
  if (snapshot.checks?.length) return snapshot.checks;
  if (snapshot.prompt_contract?.checks?.length) return snapshot.prompt_contract.checks;
  return [
    ...list(architect?.verification?.criteres_bloquants).map((rule) => ({ rule, type: "semantic", blocking: true })),
    ...list(architect?.verification?.criteres_qualitatifs).map((rule) => ({ rule, type: "semantic", blocking: false }))
  ];
}

export function buildExecutionContractShadow(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new TypeError("Un état runtime est requis.");
  const originalRequest = text(snapshot.original_request || snapshot.demande);
  const decision = snapshot.decision || {};
  const architect = snapshot.architect || snapshot.analysis || {};
  const evidenceFromArchitect = architectEvidence(architect);
  const state = decision.etat_demande || snapshot.executability?.state;
  const confidence = CONFIDENCE[decision.confiance || snapshot.executability?.confidence] || "medium";
  const route = decision.route ?? snapshot.routing?.engine ?? null;
  const explicitConstraints = runtimeConstraints(snapshot, architect).map(normalizeConstraint).filter((item) => item.text);

  const obligationCandidates = [
    ...explicitConstraints.map((constraint) => ({
      id: constraint.id, text: constraint.text, source: "user", mandatory: true,
      verifiable: true, constraint_id: constraint.id
    })),
    ...list(snapshot.obligations).map((item) => ({ ...item }))
  ];
  const obligations = uniqueBy(obligationCandidates.map((item, index) => ({
    id: numbered("OBL", index),
    text: text(item.text || item.contenu),
    source: ["user", "material", "system"].includes(item.source) ? item.source : "user",
    mandatory: item.mandatory !== false,
    verifiable: item.verifiable !== false,
    constraint_id: text(item.constraint_id) || null
  })).filter((item) => item.text), (item) => `${item.source}|${item.text}`);

  const userFacts = [...list(snapshot.evidence?.user_facts), ...evidenceFromArchitect.user]
    .map((item, index) => normalizeFact(item, index, "fact", "user")).filter((item) => item.text);
  const materialFacts = [...list(snapshot.evidence?.material_facts), ...evidenceFromArchitect.material]
    .map((item, index) => normalizeFact(item, index, "fact", "material")).filter((item) => item.text);
  const deductions = [...list(snapshot.evidence?.deductions), ...evidenceFromArchitect.deductions]
    .map((item, index) => normalizeFact(item, index, "deduction", "deduction")).filter((item) => item.text);
  const assumptions = normalizeAssumptions([
    ...list(snapshot.assumptions),
    ...list(architect?.strategie?.hypotheses_autorisees)
  ]);

  const missing = list(architect?.comprehension?.informations_manquantes);
  const criticalMissing = list(snapshot.executability?.critical_missing).length
    ? list(snapshot.executability.critical_missing)
    : [
        ...missing.filter((item) => item?.bloquant === true).map((item) => item.information),
        ...(state === "clarification_necessaire" && text(decision.question) ? [decision.question] : [])
      ];
  const substitutableMissing = list(snapshot.executability?.substitutable_missing);
  const exploitable = state === "exploitable";

  const output = snapshot.output || {};
  const promptContract = snapshot.prompt_contract || {};
  const rapid = snapshot.rapid || {};
  const quantities = normalizeQuantities(snapshot.quantities || promptContract.quantities, architect, obligations);
  const locks = runtimeLocks(snapshot).map(normalizeLock);
  const checks = runtimeChecks(snapshot, architect).map((item, index) => normalizeCheck(item, index, obligations)).filter((item) => item.rule);

  const contract = {
    version: EXECUTION_CONTRACT_VERSION,
    request_id: text(snapshot.request_id || snapshot.exchange_id) || createHash("sha256").update(originalRequest).digest("hex").slice(0, 16),
    original_request: originalRequest,
    intent: {
      objective: text(snapshot.intent?.objective || architect?.comprehension?.intention_principale) || originalRequest,
      deliverable: text(snapshot.intent?.deliverable || architect?.livrable?.nature || rapid.deliverable) || null,
      recipient: text(snapshot.intent?.recipient || architect?.reglages_manuels?.destinataire) || null,
      explicit_constraints: explicitConstraints
    },
    evidence: {
      user_facts: userFacts,
      material_facts: materialFacts,
      deductions,
      external_knowledge_needed: snapshot.evidence?.external_knowledge_needed === true || architect?.evaluation?.connaissance_externe_necessaire === true,
      freshness_needed: snapshot.evidence?.freshness_needed === true || architect?.evaluation?.actualite_requise === true
    },
    executability: {
      state,
      confidence,
      critical_missing: criticalMissing.map((item, index) => ({ id: numbered("MISS", index), text: text(item?.text || item?.information || item), status: "missing" })).filter((item) => item.text),
      substitutable_missing: substitutableMissing.map((item, index) => ({ id: numbered("SUB", index), text: text(item?.text || item), status: "substitutable" })).filter((item) => item.text)
    },
    assumptions,
    obligations,
    quantities,
    output: {
      format: text(output.format || promptContract.format || architect?.livrable?.format_technique || rapid.format) || null,
      structure: list(output.structure || promptContract.structure).map(text).filter(Boolean),
      opening: text(output.opening || promptContract.opening || promptContract.amorce) || null,
      closing: text(output.closing || promptContract.closing || promptContract.cloture) || null,
      length_policy: text(output.length_policy || promptContract.length_policy || architect?.livrable?.longueur_indicative) || null
    },
    locks,
    execution_policy: {
      execute_now: exploitable,
      comfort_questions_forbidden: exploitable,
      meta_discussion_forbidden: exploitable,
      complete_delivery_required: exploitable,
      evasion_blocked: exploitable,
      final_injunction_active: exploitable
    },
    checks,
    routing: {
      engine: route,
      reason: text(decision.raison_interne || snapshot.routing?.reason) || (exploitable ? "Route projetée depuis le runtime existant." : "Clarification projetée depuis le runtime existant."),
      confidence
    },
    ethics: Object.fromEntries(ETHICS_KEYS.map((key) => [key, true])),
    adn_summary: null
  };

  contract.adn_summary = deriveAdnSummary(contract);

  validateExecutionContract(contract);
  return clone(contract);
}

function assert(condition, message) {
  if (!condition) throw new TypeError(message);
}

function assertExactKeys(value, keys, path) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${path} doit être un objet.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]), `${path} contient des champs absents ou inattendus.`);
}

function assertIds(items, pattern, path) {
  const seen = new Set();
  for (const item of items) {
    assert(pattern.test(item.id), `${path}: identifiant invalide ${item.id}.`);
    assert(!seen.has(item.id), `${path}: identifiant dupliqué ${item.id}.`);
    seen.add(item.id);
  }
}

export function validateExecutionContract(contract) {
  assertExactKeys(contract, ["version","request_id","original_request","intent","evidence","executability","assumptions","obligations","quantities","output","locks","execution_policy","checks","routing","ethics","adn_summary"], "ExecutionContract");
  assert(contract.version === EXECUTION_CONTRACT_VERSION, "Version ExecutionContract incompatible.");
  assert(text(contract.request_id), "request_id est obligatoire.");
  assert(text(contract.original_request), "La demande originale doit toujours être conservée.");
  assertExactKeys(contract.intent, ["objective","deliverable","recipient","explicit_constraints"], "intent");
  assert(text(contract.intent.objective), "intent.objective est obligatoire.");
  assert(Array.isArray(contract.intent.explicit_constraints), "intent.explicit_constraints doit être un tableau.");
  assertIds(contract.intent.explicit_constraints, /^REQ-\d{3,}$/, "explicit_constraints");

  assertExactKeys(contract.evidence, ["user_facts","material_facts","deductions","external_knowledge_needed","freshness_needed"], "evidence");
  for (const fact of [...contract.evidence.user_facts, ...contract.evidence.material_facts]) assert(fact.status === "fact", "Une hypothèse ou déduction ne peut pas être stockée comme fait.");
  for (const deduction of contract.evidence.deductions) assert(deduction.status === "deduction" && deduction.source === "deduction", "Une déduction doit rester étiquetée comme telle.");
  assert(contract.evidence.freshness_needed !== true || contract.evidence.external_knowledge_needed === true, "Une actualité requise implique une connaissance externe.");

  assertExactKeys(contract.executability, ["state","confidence","critical_missing","substitutable_missing"], "executability");
  assert(STATES.has(contract.executability.state), "État d’exécutabilité invalide.");
  assert(["high", "medium"].includes(contract.executability.confidence), "Confiance invalide.");
  for (const missing of contract.executability.critical_missing) assert(missing.status === "missing", "Une donnée critique absente ne peut pas devenir connue.");
  for (const assumption of contract.assumptions) assert(assumption.status === "assumption", "Une hypothèse doit rester étiquetée comme hypothèse.");

  assertIds(contract.obligations, /^OBL-\d{3,}$/, "obligations");
  for (const obligation of contract.obligations) {
    assertExactKeys(obligation, ["id","text","source","mandatory","verifiable","constraint_id"], `obligation ${obligation.id}`);
    assert(["user","material","system"].includes(obligation.source), "Toute obligation doit avoir une source.");
  }
  for (const constraint of contract.intent.explicit_constraints) {
    assert(contract.obligations.some((obligation) => obligation.constraint_id === constraint.id && obligation.text === constraint.text && obligation.source === "user"), `La contrainte ${constraint.id} a disparu de la chaîne d’obligations.`);
  }

  assertIds(contract.quantities, /^Q-\d{3,}$/, "quantities");
  for (const quantity of contract.quantities) {
    assert(text(quantity.unit) || text(quantity.target), `${quantity.id}: toute quantité doit avoir une unité ou une cible.`);
    assert([quantity.exact, quantity.min, quantity.max].some(Number.isInteger), `${quantity.id}: aucune borne numérique.`);
  }

  const lockIds = new Set();
  for (const lock of contract.locks) {
    assertExactKeys(lock, ["id","reason","priority","source","source_ids","associated_checks","active"], `lock ${lock.id}`);
    assert(LOCK_IDS.has(lock.id), `Verrou inconnu : ${lock.id}.`);
    assert(text(lock.reason), `Le verrou ${lock.id} doit avoir une raison.`);
    assert(["user", "material", "system", "runtime"].includes(lock.source), `Le verrou ${lock.id} doit avoir une source.`);
    assert(Array.isArray(lock.associated_checks), `Le verrou ${lock.id} doit exposer associated_checks.`);
    assert(lock.associated_checks.every((id) => contract.checks.some((check) => check.id === id)), `Le verrou ${lock.id} référence un contrôle absent.`);
    assert(typeof lock.active === "boolean", `Le verrou ${lock.id} doit exposer son état actif/inactif.`);
    assert(!lockIds.has(lock.id), `Verrou dupliqué : ${lock.id}.`);
    lockIds.add(lock.id);
  }

  assertExactKeys(contract.execution_policy, ["execute_now","comfort_questions_forbidden","meta_discussion_forbidden","complete_delivery_required","evasion_blocked","final_injunction_active"], "execution_policy");
  const exploitable = contract.executability.state === "exploitable";
  assert(contract.execution_policy.execute_now === exploitable, "execute_now doit être vrai uniquement après exploitabilité.");
  assert(contract.execution_policy.final_injunction_active === exploitable, "La technique 9 doit suivre exactement l’exploitabilité.");
  if (!exploitable) assert(contract.routing.engine === null, "Une clarification nécessaire interdit une route moteur.");
  if (exploitable) assert(ENGINES.has(contract.routing.engine) && contract.routing.engine !== null, "Une demande exploitable exige une route historique.");
  assert(contract.routing.confidence === contract.executability.confidence, "Les confiances d’exécutabilité et de route doivent rester cohérentes.");

  assertExactKeys(contract.ethics, ETHICS_KEYS, "ethics");
  for (const key of ETHICS_KEYS) assert(contract.ethics[key] === true, `L’invariant éthique ${key} ne peut pas être désactivé.`);
  assertExactKeys(contract.adn_summary, ["intentionality","executability","discipline","completeness","compliance"], "adn_summary");
  assert(JSON.stringify(contract.adn_summary) === JSON.stringify(deriveAdnSummary(contract)), "adn_summary doit être purement dérivé du contrat.");
  for (const value of Object.values(contract.adn_summary)) assert(value === "represented", "Les cinq propriétés doivent être représentées.");
  return contract;
}

export function deriveAdnSummary(contract) {
  const represented = (condition) => condition ? "represented" : "missing";
  return {
    intentionality: represented(!!text(contract?.original_request) && !!text(contract?.intent?.objective) && Array.isArray(contract?.intent?.explicit_constraints)),
    executability: represented(STATES.has(contract?.executability?.state) && ["high", "medium"].includes(contract?.executability?.confidence)),
    discipline: represented(typeof contract?.execution_policy?.execute_now === "boolean" && typeof contract?.execution_policy?.final_injunction_active === "boolean"),
    completeness: represented(Array.isArray(contract?.obligations) && Array.isArray(contract?.quantities)),
    compliance: represented(!!contract?.output && Array.isArray(contract?.checks))
  };
}

export function buildExecutionContractAuditView(contract) {
  validateExecutionContract(contract);
  return {
    request_id: contract.request_id,
    contract_version: contract.version,
    executability: clone(contract.executability),
    routing: clone(contract.routing),
    obligations: contract.obligations.map(({ id, source, constraint_id, mandatory, verifiable }) => ({ id, source, constraint_id, mandatory, verifiable })),
    locks: contract.locks.map(({ id, reason, priority, source, source_ids, associated_checks, active }) => ({ id, reason, priority, source, source_ids: clone(source_ids), associated_checks: clone(associated_checks), active })),
    checks: contract.checks.map(({ id, type, target, blocking, obligation_ids }) => ({ id, type, target, blocking, obligation_ids: clone(obligation_ids) })),
    adn_summary: clone(contract.adn_summary),
    ethics: clone(contract.ethics)
  };
}

export function serializeExecutionContract(contract) {
  validateExecutionContract(contract);
  return JSON.stringify(contract);
}

export function parseExecutionContract(serialized) {
  const contract = JSON.parse(serialized);
  validateExecutionContract(contract);
  return contract;
}

export function canonicalizeExecutionContract(value) {
  if (Array.isArray(value)) return value.map(canonicalizeExecutionContract);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeExecutionContract(value[key])]));
  return value;
}

export function hashExecutionContract(contract) {
  validateExecutionContract(contract);
  return createHash("sha256").update(JSON.stringify(canonicalizeExecutionContract(contract))).digest("hex");
}
