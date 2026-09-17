"use strict";
// EF-01B-v0.2-r1 — lib/parser.js
// Parsing JSON strict de la reponse resolver. AUCUNE correction silencieuse.
// F-01 : valide un schema de PROPOSITIONS DE DISCIPLINES (jamais de
// professionnels) — rejette explicitement toute reponse qui contiendrait
// des champs typiques d'un resolver de professionnels (displayName,
// affiliation, orcid, sourceHint, ou les cles top-level candidates/
// professionals/authors/experts), meme si le reste de la reponse est
// structurellement plausible : une regression vers l'ancien objet resolu
// (professionnels) ne doit jamais passer silencieusement.

const { ef01bError } = require("./errors.js");

function isNonEmptyStr(v) { return typeof v === "string" && v.trim().length > 0; }

const FORBIDDEN_TOP_LEVEL_KEYS = ["candidates", "professionals", "authors", "experts"];
const FORBIDDEN_PROPOSAL_KEYS = ["displayName", "affiliation", "orcid", "sourceHint", "professional", "author", "person", "candidate", "expert"];

/**
 * parseResolverResponse(rawResponseText) — parse strict + validation de
 * forme. Retourne { proposals, targetContextReport } (jamais une valeur
 * partielle en cas d'echec — leve toujours).
 */
function parseResolverResponse(rawResponseText) {
  let parsed;
  try {
    parsed = JSON.parse(rawResponseText);
  } catch (e) {
    throw ef01bError("LLM_RESPONSE_INVALID", "reponse resolver non-JSON ou JSON malforme : " + e.message, { rawResponseTextLength: (rawResponseText || "").length });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw ef01bError("LLM_OUTPUT_SCHEMA_INVALID", "reponse resolver n'est pas un objet JSON.", {});
  }

  const problems = [];
  const forbiddenTopLevel = Object.keys(parsed).filter(function (k) { return FORBIDDEN_TOP_LEVEL_KEYS.indexOf(k) !== -1; });
  if (forbiddenTopLevel.length) {
    problems.push("cle(s) interdite(s) de resolution de professionnels detectee(s) au niveau racine (F-01, jamais accepte) : " + forbiddenTopLevel.join(", "));
  }

  if (!Array.isArray(parsed.proposals)) {
    problems.push("proposals manquant ou n'est pas un tableau");
  } else if (parsed.proposals.length === 0) {
    problems.push("proposals est vide — au moins une proposition de discipline est requise");
  } else {
    parsed.proposals.forEach(function (p, i) {
      if (!p || typeof p !== "object") { problems.push("proposals[" + i + "] n'est pas un objet"); return; }
      if (!isNonEmptyStr(p.disciplineId)) problems.push("proposals[" + i + "].disciplineId manquant");
      if (!isNonEmptyStr(p.label)) problems.push("proposals[" + i + "].label manquant");
      if (!isNonEmptyStr(p.rationale)) problems.push("proposals[" + i + "].rationale manquant");
      if (p.evidenceContextRefs !== undefined && !Array.isArray(p.evidenceContextRefs)) problems.push("proposals[" + i + "].evidenceContextRefs doit etre un tableau si present");
      const forbiddenFields = Object.keys(p).filter(function (k) { return FORBIDDEN_PROPOSAL_KEYS.indexOf(k) !== -1; });
      if (forbiddenFields.length) problems.push("proposals[" + i + "] contient (des) champ(s) de resolution de professionnels interdit(s) (F-01) : " + forbiddenFields.join(", "));
    });
  }

  if (!Array.isArray(parsed.targetContextReport)) {
    problems.push("targetContextReport manquant ou n'est pas un tableau");
  } else {
    parsed.targetContextReport.forEach(function (r, i) {
      if (!r || typeof r !== "object" || !isNonEmptyStr(r.documentId) || ["considered_full", "considered_partial", "not_applicable"].indexOf(r.contextStatus) === -1) {
        problems.push("targetContextReport[" + i + "] invalide (documentId non vide + contextStatus parmi considered_full/considered_partial/not_applicable requis)");
      }
    });
  }

  const extraKeys = Object.keys(parsed).filter(function (k) { return ["proposals", "targetContextReport"].indexOf(k) === -1; });
  if (extraKeys.length) problems.push("cle(s) inattendue(s) dans la reponse resolver : " + extraKeys.join(", "));

  if (problems.length) {
    throw ef01bError("RESOLVER_OUTPUT_INVALID", "reponse resolver ne respecte pas le schema de propositions de disciplines : " + problems.join("; "), { problems: problems });
  }
  return { proposals: parsed.proposals, targetContextReport: parsed.targetContextReport };
}

module.exports = { parseResolverResponse: parseResolverResponse };
