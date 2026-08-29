import test from "node:test";
import assert from "node:assert/strict";

import { ANALYST_SYSTEM_PROMPT, CRITIC_SYSTEM_PROMPT, ARBITER_SYSTEM_PROMPT } from "../workers/shared/operational-request-core.js";

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

test("le prompt Critique peut légitimement conclure à l'absence d'objection", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /agreement="agree"/);
  assert.match(CRITIC_SYSTEM_PROMPT, /légitime et attendue/);
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

test("C6 : le prompt Critique lie explicitement détection matérielle et cohérence du verdict", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /agreement doit être "disagree"/);
  assert.match(CRITIC_SYSTEM_PROMPT, /Ni rubber-stamping/);
});

test("C7 : le prompt Arbitre interdit toute justification par intention implicite et l'invention pour atteindre READY", () => {
  assert.match(ARBITER_SYSTEM_PROMPT, /intention implicite/);
  assert.match(ARBITER_SYSTEM_PROMPT, /n'inventez jamais pour atteindre operational_request_ready/);
});
