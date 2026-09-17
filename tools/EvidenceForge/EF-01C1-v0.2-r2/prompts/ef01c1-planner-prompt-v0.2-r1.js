"use strict";
// EF-01C1-v0.2-r1 — prompts/ef01c1-planner-prompt-v0.2-r1.js
//
// F-07 (MAJOR, ferme) : le planner v0.2 precedent ne recevait qu'un
// resume {discipline, candidateCount} — deux sorties resolver
// substantiellement differentes avec le meme compte produisaient le meme
// prompt/inputHash. Ce prompt v0.2-r1 embarque desormais :
//  1. le CONTENU REEL de chaque discipline retenue (justification/
//     rationale reellement fournie par le resolver, jamais un simple
//     compteur) ;
//  2. resolverOutputHash (empreinte cryptographique de la sortie resolver
//     complete) explicitement, en texte, dans le prompt lui-meme.
// Consequence : deux sorties resolver differentes produisent A LA FOIS un
// texte de prompt different (1) ET un inputHash different (2, meme si par
// improbable coincidence (1) produisait un texte identique) — double
// garantie, jamais une seule.
//
// Contrainte connecteur (identique a v0.2, verifiee par lecture directe du
// code R6, lib/real-e2e-driver.js::buildPreRetrievalArtifacts) : seul
// connectorId="openalex" est reellement cable.

const crypto = require("crypto");

const PROMPT_ID = "EF01C1-PLANNER";
const PROMPT_VERSION = "EF01C1-planner-v0.2-r1.0";

const PROMPT_TEMPLATE = [
  "Tu es un assistant de planification de recherche documentaire rigoureux.",
  "Ta tache est de produire un plan de recherche reel pour une mission de",
  "revue documentaire, a partir des disciplines RETENUES et de LEUR",
  "JUSTIFICATION REELLE telle que fournie par le resolver de disciplines.",
  "",
  "Question de mission : {{missionQuestion}}",
  "",
  "Disciplines retenues, AVEC la justification reelle qui a motive leur",
  "retenue (utilise ce contenu pour orienter tes requetes, ne le re-decide",
  "jamais toi-meme) :",
  "{{resolvedDisciplinesDetail}}",
  "",
  "Empreinte cryptographique de la sortie resolver source (verification",
  "d'integrite, ne jamais l'ignorer ni la recalculer toi-meme) :",
  "resolverOutputHash = {{resolverOutputHash}}",
  "",
  "Contrainte technique IMPERATIVE : le seul connecteur de recuperation",
  "documentaire actuellement disponible est \"openalex\". N'utilise JAMAIS",
  "un autre identifiant de connecteur, meme si tu penses qu'une autre",
  "source serait plus pertinente scientifiquement.",
  "",
  "Reponds EXCLUSIVEMENT avec un objet JSON strict, sans texte avant ou",
  "apres, exactement de cette forme :",
  "",
  "{",
  '  "sources": [{"connectorId": "openalex", "label": "OpenAlex", "justification": "..."}],',
  '  "queries": [',
  '    {"discipline": "<id exact d\'une discipline retenue>", "connectorId": "openalex", "requete": "...", "justification": "..."}',
  "  ],",
  '  "retrieval": [',
  '    {"connectorId": "openalex", "sortMode": "relevance", "pageSize": <entier>, "maxPages": <entier>, "maxResults": <entier>, "stopCondition": "...", "retryPolicy": "...", "rateLimitPolicy": "...", "budgetMax": "..."}',
  "  ],",
  '  "criteresInclusion": ["..."],',
  '  "criteresExclusion": ["..."],',
  '  "regleDedoublonnage": "...",',
  '  "methodeQualification": "..."',
  "}",
  "",
  "Une entree \"queries\" par discipline retenue, EXACTEMENT. N'ajoute",
  "aucune cle supplementaire. Ne produis jamais de validation humaine ou de",
  "champ \"humanValidation\" : ce n'est jamais ta responsabilite.",
].join("\n");

function buildPlannerPrompt(input) {
  if (!input || typeof input !== "object") {
    throw new Error("buildPlannerPrompt: input requis.");
  }
  if (!input.missionQuestion || !Array.isArray(input.resolvedDisciplines) || input.resolvedDisciplines.length === 0) {
    throw new Error("buildPlannerPrompt: missionQuestion et resolvedDisciplines[] (non vide) requis.");
  }
  if (!input.resolverOutputHash || typeof input.resolverOutputHash !== "string" || !/^[0-9a-f]{64}$/i.test(input.resolverOutputHash)) {
    throw new Error("buildPlannerPrompt: resolverOutputHash (SHA-256 hex) requis — F-07, jamais un lien causal implicite ou absent.");
  }
  const resolvedDisciplinesDetail = input.resolvedDisciplines.map(function (d) {
    return "- " + d.id + " (" + (d.label || d.id) + ") : " + (d.rationale || "(rationale non fournie)");
  }).join("\n");

  return PROMPT_TEMPLATE
    .replace(/\{\{missionQuestion\}\}/g, String(input.missionQuestion))
    .replace(/\{\{resolvedDisciplinesDetail\}\}/g, resolvedDisciplinesDetail)
    .replace(/\{\{resolverOutputHash\}\}/g, input.resolverOutputHash);
}

const PROMPT_TEMPLATE_HASH = crypto.createHash("sha256").update(PROMPT_TEMPLATE, "utf8").digest("hex");

module.exports = {
  PROMPT_ID: PROMPT_ID,
  PROMPT_VERSION: PROMPT_VERSION,
  PROMPT_TEMPLATE: PROMPT_TEMPLATE,
  PROMPT_TEMPLATE_HASH: PROMPT_TEMPLATE_HASH,
  buildPlannerPrompt: buildPlannerPrompt,
};
