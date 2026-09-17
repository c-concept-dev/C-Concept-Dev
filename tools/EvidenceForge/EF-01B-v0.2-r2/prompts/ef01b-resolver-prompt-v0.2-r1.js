"use strict";
// EF-01B-v0.2-r1 — prompts/ef01b-resolver-prompt-v0.2-r1.js
//
// F-01 (BLOCKER, ferme) : le contrat gele EF-01B v0.1
// (MONO-01/dependencies/ef-orch-ef01b-executor-v0.1.js, entete) dit
// explicitement : "la resolution LLM appartient a la pre-analyse
// anterieure a la confirmation du RunContract" et produit les
// DISCIPLINES (RunContract.disciplinesProposees), jamais des
// professionnels/experts. Le prompt v0.2 precedent demandait a tort au
// LLM de proposer des professionnels pour une discipline deja connue —
// inversion fonctionnelle. Ce prompt v0.2-r1 propose des DISCIPLINES a
// partir de la mission/du contexte, jamais un professionnel.
//
// F-02 (BLOCKER, ferme) : ce prompt ne reference JAMAIS un RunContract
// confirme (qui n'existe pas encore au moment de cet appel) — seule la
// sortie EF-01A (MissionDraft : question + documents cibles + preuves
// fournies) est utilisee, la SEULE structure pre-contractuelle reellement
// disponible avant confirmation du RunContract (verifie par lecture de
// ef-orch-ef01-output-contracts-v0.1.js::validateEF01AOutput).

const crypto = require("crypto");

const PROMPT_ID = "EF01B-RESOLVER";
const PROMPT_VERSION = "EF01B-resolver-v0.2-r1.0";

const PROMPT_TEMPLATE = [
  "Tu es un assistant d'analyse methodologique rigoureux pour une revue",
  "documentaire scientifique.",
  "",
  "Ta SEULE tache : analyser la question de mission et le contexte fourni",
  "ci-dessous, puis PROPOSER LES DISCIPLINES SCIENTIFIQUES pertinentes pour",
  "traiter cette question. Tu ne proposes JAMAIS de professionnel, expert,",
  "auteur, chercheur nomme, ni aucune personne — ce n'est pas ta tache et",
  "ne le sera jamais a ce stade du pipeline.",
  "",
  "Question de mission : {{missionQuestion}}",
  "",
  "Documents cibles fournis (contexte, ne pas re-proposer leur contenu) :",
  "{{targetDocumentsContext}}",
  "",
  "Preuves deja fournies par l'operateur (contexte) :",
  "{{suppliedEvidenceContext}}",
  "",
  "Regles strictes :",
  "1. Propose UNIQUEMENT des disciplines scientifiques (ex. \"epidemiologie\",",
  "   \"sciences cognitives\", \"droit compare\") — jamais un nom de personne,",
  "   un role professionnel, un titre (\"docteur\", \"professeur\"), ni un",
  "   candidat/auteur/expert quelconque.",
  "2. Chaque discipline proposee doit etre justifiee par une rationale",
  "   explicite reliee a la question de mission, jamais un prestige ou une",
  "   notoriete supposee, jamais un vote de popularite.",
  "3. Ne fabrique aucune donnee sur les documents cibles au-dela du",
  "   contexte fourni ci-dessus.",
  "4. Reponds EXCLUSIVEMENT avec un objet JSON strict, sans texte avant ou",
  "   apres, exactement de cette forme :",
  "",
  "{",
  '  "proposals": [',
  '    {"disciplineId": "...", "label": "...", "rationale": "...", "evidenceContextRefs": ["..."]}',
  "  ],",
  '  "targetContextReport": [',
  '    {"documentId": "...", "contextStatus": "considered_full|considered_partial|not_applicable"}',
  "  ]",
  "}",
  "",
  "N'ajoute aucune cle supplementaire. N'ajoute aucun commentaire hors JSON.",
  "N'utilise JAMAIS les champs/mots \"professional\", \"author\", \"person\",",
  "\"candidate\", \"expert\", \"displayName\", \"affiliation\" nulle part dans ta",
  "reponse : ce ne sont jamais des concepts que ce prompt te demande.",
].join("\n");

function summarizeTargetDocuments(targetDocuments) {
  const docs = Array.isArray(targetDocuments) ? targetDocuments : [];
  if (docs.length === 0) return "(aucun document cible fourni)";
  return docs.map(function (d) { return "- " + (d.documentId || d.id || "?") + " : " + (d.title || "(sans titre)"); }).join("\n");
}

function summarizeSuppliedEvidence(suppliedEvidence) {
  const items = Array.isArray(suppliedEvidence) ? suppliedEvidence : [];
  if (items.length === 0) return "(aucune preuve fournie)";
  return items.map(function (e, i) { return "- preuve " + (i + 1) + " : " + (e.summary || e.label || e.id || "(sans description)"); }).join("\n");
}

/**
 * buildResolverPrompt(input) :
 *   missionQuestion  - string reelle de la mission (EF-01A.question)
 *   targetDocuments  - EF-01A.targetDocuments[] (contexte uniquement)
 *   suppliedEvidence - EF-01A.suppliedEvidence[] (contexte uniquement)
 * AUCUNE reference a un RunContract ou a discipline/technicalProposalLimit
 * de professionnels — ce prompt n'en a jamais besoin (F-02).
 */
function buildResolverPrompt(input) {
  if (!input || typeof input !== "object") {
    throw new Error("buildResolverPrompt: input requis.");
  }
  if (!input.missionQuestion || typeof input.missionQuestion !== "string" || !input.missionQuestion.trim()) {
    throw new Error("buildResolverPrompt: missionQuestion (string non vide) requis.");
  }
  return PROMPT_TEMPLATE
    .replace(/\{\{missionQuestion\}\}/g, String(input.missionQuestion))
    .replace(/\{\{targetDocumentsContext\}\}/g, summarizeTargetDocuments(input.targetDocuments))
    .replace(/\{\{suppliedEvidenceContext\}\}/g, summarizeSuppliedEvidence(input.suppliedEvidence));
}

const PROMPT_TEMPLATE_HASH = crypto.createHash("sha256").update(PROMPT_TEMPLATE, "utf8").digest("hex");

module.exports = {
  PROMPT_ID: PROMPT_ID,
  PROMPT_VERSION: PROMPT_VERSION,
  PROMPT_TEMPLATE: PROMPT_TEMPLATE,
  PROMPT_TEMPLATE_HASH: PROMPT_TEMPLATE_HASH,
  buildResolverPrompt: buildResolverPrompt,
};
