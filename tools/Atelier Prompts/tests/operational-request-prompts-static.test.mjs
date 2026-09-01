import test from "node:test";
import assert from "node:assert/strict";

import { ANALYST_SYSTEM_PROMPT, CRITIC_SYSTEM_PROMPT, ARBITER_SYSTEM_PROMPT, deriveCriticConsequences } from "../workers/shared/operational-request-core.js";

const PROMPTS = {
  Analyste: ANALYST_SYSTEM_PROMPT,
  Critique: CRITIC_SYSTEM_PROMPT,
  Arbitre: ARBITER_SYSTEM_PROMPT
};

function normalize(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function sentences(prompt) {
  return prompt.split(/[.?!]\s|\n/).map((s) => s.trim()).filter(Boolean);
}

test("aucun mot-clé métier ou sectoriel n'apparaît dans les prompts runtime (filet secondaire)", () => {
  const forbiddenDomains = [
    "voyage", "italie", "vacances", "cv", "curriculum", "candidature", "medical", "symptome",
    "diagnostic", "code source", "programmation", "recette de cuisine", "juridique", "immobilier",
    "budget vacances", "destination", "ordinateur", "restaurant"
  ];
  for (const [role, prompt] of Object.entries(PROMPTS)) {
    const normalized = normalize(prompt);
    for (const term of forbiddenDomains) {
      assert.equal(normalized.includes(term), false, `${role} contient un terme métier interdit : "${term}".`);
    }
  }
});

test("aucun prompt n'impose de nombre de questions (statique, hors 'une seule à la fois')", () => {
  const quotaPattern = /\b([2-9]|[1-9]\d+)\s+questions?\b/i;
  const minMaxPattern = /\b(?:minimum|maximum|plafond|au moins|au plus)\s+(?:de\s+)?\d+\s+questions?\b/i;
  for (const [role, prompt] of Object.entries(PROMPTS)) {
    assert.equal(quotaPattern.test(prompt), false, `${role} impose un nombre de questions chiffré.`);
    assert.equal(minMaxPattern.test(prompt), false, `${role} impose un minimum/maximum de questions.`);
  }
});

test("aucun prompt n'utilise 'réponse générale possible' comme critère positif de readiness", () => {
  const negationMarkers = ["jamais", "n'est pas", "ne suffit pas", "insuffisant", "pas un critere"];
  for (const [role, prompt] of Object.entries(PROMPTS)) {
    const matches = sentences(prompt).filter((sentence) => normalize(sentence).includes("reponse generale"));
    for (const sentence of matches) {
      const normalized = normalize(sentence);
      const negated = negationMarkers.some((marker) => normalized.includes(marker));
      assert.equal(negated, true, `${role} : la phrase "${sentence}" utilise "réponse générale" sans la rejeter explicitement.`);
    }
  }
});

test("aucun prompt ne réintroduit le vocabulaire legacy 'exploitable' comme critère de readiness", () => {
  for (const [role, prompt] of Object.entries(PROMPTS)) {
    assert.equal(/\bexploitable\b/i.test(prompt), false, `${role} contient le vocabulaire legacy "exploitable".`);
    assert.equal(/\betat_demande\b/i.test(prompt), false, `${role} contient le champ legacy "etat_demande".`);
  }
});

test("les trois prompts sont distincts et n'importent aucune logique de provider", () => {
  assert.notEqual(ANALYST_SYSTEM_PROMPT, CRITIC_SYSTEM_PROMPT);
  assert.notEqual(CRITIC_SYSTEM_PROMPT, ARBITER_SYSTEM_PROMPT);
  assert.notEqual(ANALYST_SYSTEM_PROMPT, ARBITER_SYSTEM_PROMPT);
  for (const [role, prompt] of Object.entries(PROMPTS)) {
    assert.equal(/workers ai|groq/i.test(prompt), false, `${role} référence un provider — les rôles doivent rester provider-agnostiques.`);
  }
});

test("chaque prompt affirme explicitement la primitive conflict unifiée", () => {
  for (const [role, prompt] of Object.entries(PROMPTS)) {
    if (role === "Critique") continue; // le Critique challenge les conflits déjà posés par l'Analyste, il ne les recrée pas.
    assert.match(prompt, /logical_contradiction/);
    assert.match(prompt, /constraint_tension/);
    assert.match(prompt, /priority_conflict/);
  }
});

test("le prompt Analyste rappelle les 7 stratégies universelles de traitement des inconnues", () => {
  const normalized = normalize(ANALYST_SYSTEM_PROMPT);
  for (const term of ["rechercher", "decider", "estimer", "scenariser", "conditionner", "laisser inconnue", "questionner"]) {
    assert.ok(normalized.includes(term), `Le prompt Analyste doit citer la stratégie "${term}".`);
  }
});

// 3F.3.3-X2-B : le Critic ne conclut plus lui-même agreement="agree" (texte retiré, agreement est
// dérivé) — une revue sans aucune objection réelle dérive légitimement "agree", sans texte de prompt
// dédié à cette conclusion.
test("le Critic peut légitimement dériver l'absence d'objection (agreement=agree) sans qu'aucune règle textuelle ne l'y force", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /pleinement légitime et attendue/);
  const derived = deriveCriticConsequences({
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    question_substitution_review: {}
  });
  assert.equal(derived.agreement, "agree");
});

test("le prompt Arbitre énonce sa nature conditionnelle, jamais systématique", () => {
  assert.match(ARBITER_SYSTEM_PROMPT, /n'êtes appelé que lorsque/);
  assert.match(ARBITER_SYSTEM_PROMPT, /ne produisez jamais l'état degraded_state/i);
});

// --- 3F.3.3-C, C1-C7 : durcissements de prompt ---------------------------------------------------

test("C4 : la même taxonomie des issues (générale, sans exemple du corpus) est partagée par les 3 prompts", () => {
  for (const [role, prompt] of Object.entries(PROMPTS)) {
    assert.match(prompt, /TAXONOMIE DES ISSUES/, `${role} doit inclure la taxonomie partagée des issues.`);
  }
  const corpusSpecificTerms = ["italie", "voyage", "compte rendu", "reunion", "lettre de motivation", "sommeil", "cv"];
  const taxonomySection = ANALYST_SYSTEM_PROMPT.slice(ANALYST_SYSTEM_PROMPT.indexOf("TAXONOMIE DES ISSUES"));
  const normalizedTaxonomy = normalize(taxonomySection);
  for (const term of corpusSpecificTerms) {
    assert.equal(normalizedTaxonomy.includes(term), false, `La taxonomie ne doit citer aucun exemple métier du corpus ("${term}").`);
  }
});

test("C1 : le prompt Analyste restreint explicitement RECHERCHER aux faits externes vérifiables (jamais une arbitration utilisateur)", () => {
  assert.match(ANALYST_SYSTEM_PROMPT, /RECHERCHER s'applique exclusivement à un fait externe vérifiable/);
  assert.match(ANALYST_SYSTEM_PROMPT, /n'est jamais "recherchable" au seul motif qu'elle manque/);
});

test("C2 : le prompt Analyste interdit de reposer mécaniquement la même question après délégation ou 'je ne sais pas'", () => {
  assert.match(ANALYST_SYSTEM_PROMPT, /il est interdit de reposer mécaniquement la même question/);
});

test("C3 : le prompt Analyste distingue les candidats internes de la sélection d'UNE seule prochaine question, sans plafond global", () => {
  assert.match(ANALYST_SYSTEM_PROMPT, /ne retient toujours qu'UNE seule prochaine question effectivement posée à l'utilisateur/);
  assert.match(ANALYST_SYSTEM_PROMPT, /ce n'est pas un maximum global de questions/);
});

// 3F.3.3-X2-B : "Ni rubber-stamping" (texte adressé au LLM pour DÉCIDER agreement) est retiré — le
// lien détection matérielle <-> verdict est désormais garanti mécaniquement par
// deriveCriticConsequences, jamais par une instruction textuelle.
test("C6 : la détection matérielle (vetoes/drift/missed/illegitimate) et la cohérence du verdict restent liées, désormais mécaniquement plutôt que par instruction textuelle", () => {
  const withVeto = deriveCriticConsequences({
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [{ issue_id: "i1", new_information_trigger: "x", why_material: "y", why_not_substitutable: "z" }],
    semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    question_substitution_review: {}
  });
  assert.equal(withVeto.agreement, "disagree", "un veto qualifié détecté doit toujours dériver disagree.");
});

test("C7 : le prompt Arbitre interdit toute justification par intention implicite et l'invention pour atteindre READY", () => {
  assert.match(ARBITER_SYSTEM_PROMPT, /intention implicite/);
  assert.match(ARBITER_SYSTEM_PROMPT, /n'inventez jamais pour atteindre operational_request_ready/);
});
