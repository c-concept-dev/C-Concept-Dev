"use strict";
// EF-01C1-v0.2 — lib/parser.js
// Parsing JSON strict de la reponse planner. AUCUNE correction silencieuse
// (meme principe que EF-01B-v0.2/lib/parser.js). Contrairement a EF-01B (ou
// aucun validateur du contenu causal n'existe cote R6), la validation du
// contenu substantiel du plannerOutput est DELEGUEE a la fonction FIGEE R6
// `validateRealPlannerOutputFields(output, disciplineIds)`
// (MONO-08/v0.6/lib/eforch-artifacts.js) — jamais une seconde logique de
// validation ecrite ici qui pourrait diverger du contrat reel utilise par
// buildSearchProtocolForMission()/le mission-gate.

const { ef01c1Error } = require("./errors.js");

// =========================================================================
// F-C1-R2-01 — TOLERANCE D'ENVELOPPE DE TRANSPORT, ET RIEN D'AUTRE.
//
// Incident reel a l'origine : 2 appels planner reels sur 2 ont renvoye le
// JSON attendu encapsule dans une UNIQUE fence Markdown ```json ... ```.
// JSON.parse() echouait sur le premier caractere "`" (LLM_RESPONSE_INVALID),
// alors que le contenu JSON lui-meme etait exploitable.
//
// CE QUI EST TOLERE, exhaustivement : une enveloppe de TRANSPORT TEXTUELLE,
// c'est-a-dire une unique fence Markdown entourant l'INTEGRALITE du JSON.
//
// CE QUI N'EST JAMAIS TOLERE : la moindre reparation du JSON. Le contrat
// scientifique reste strictement inchange. Cette fonction ne cherche jamais
// une accolade, n'extrait jamais du JSON depuis de la prose, ne supprime
// aucun texte explicatif, ne corrige ni virgule ni guillemet, n'accepte ni
// fence multiple ni fence non fermee, et ne modifie aucune valeur. Si le
// contenu interieur n'est pas du JSON valide, le parsing echoue exactement
// comme avant ce lot.
//
// INVARIANT DE PROVENANCE : cette normalisation intervient APRES le calcul
// de rawResponseHash et APRES la persistance de l'evidence brute. Le hash
// porte toujours sur le texte assistant ORIGINAL, fence comprise
// (rawResponseHashScope = "assistant_text", F-05 inchange).
// =========================================================================

// Langages de fence acceptes. "json" est accepte SANS SENSIBILITE A LA CASSE
// (choix explicite, teste : voir T09b du banc r2). Toute autre valeur est
// refusee — une fence ```python autour de JSON n'est pas une enveloppe de
// transport reconnue par ce lot.
const FENCE_OPEN_RE = /^```([A-Za-z0-9_+-]*)[ \t]*\r?\n/;
const FENCE_MARK = "```";

function isAllowedFenceLanguage(lang) {
  return lang === "" || /^json$/i.test(lang);
}

/**
 * normalizeStrictJsonEnvelope(rawText) — retire UNE enveloppe de transport,
 * jamais autre chose.
 *
 * Accepte exactement deux familles :
 *   A. JSON brut          -> le texte est retourne INCHANGE (aucun nettoyage,
 *                            pas meme un trim : JSON.parse tolere deja les
 *                            blancs de bordure).
 *   B. une UNIQUE fence Markdown contenant uniquement le JSON
 *                         -> le contenu interieur est retourne tel quel.
 *
 * Leve LLM_RESPONSE_INVALID si le texte COMMENCE comme une fence mais ne
 * constitue pas une enveloppe valide (fence non fermee, langage non
 * autorise, fences multiples, texte hors fence). Ne leve jamais pour du
 * JSON brut : ce cas est laisse au JSON.parse strict en aval.
 *
 * Retourne { text, envelopeRemoved }.
 */
function normalizeStrictJsonEnvelope(rawText) {
  if (typeof rawText !== "string") {
    return { text: rawText, envelopeRemoved: false };
  }
  const trimmed = rawText.trim();
  if (trimmed.slice(0, FENCE_MARK.length) !== FENCE_MARK) {
    // Famille A — aucune enveloppe detectee. Rien n'est touche : si le texte
    // contient de la prose, JSON.parse echouera, et c'est le comportement
    // voulu (regle 5/6 : rien hors enveloppe n'est jamais retire).
    return { text: rawText, envelopeRemoved: false };
  }

  const open = FENCE_OPEN_RE.exec(trimmed);
  if (!open) {
    throw ef01c1Error(
      "LLM_RESPONSE_INVALID",
      "enveloppe de transport invalide : la reponse commence par une fence Markdown dont l'ouverture est malformee (attendu \"```\" ou \"```json\" suivi d'un retour a la ligne) — aucune extraction heuristique n'est tentee.",
      { envelope: "malformed_open" }
    );
  }
  if (!isAllowedFenceLanguage(open[1])) {
    throw ef01c1Error(
      "LLM_RESPONSE_INVALID",
      "enveloppe de transport invalide : langage de fence \"" + open[1] + "\" non autorise (seuls \"\" et \"json\" le sont) — jamais un contenu extrait d'une fence d'un autre langage.",
      { envelope: "disallowed_language", language: open[1] }
    );
  }

  const afterOpen = trimmed.slice(open[0].length);
  if (afterOpen.slice(-FENCE_MARK.length) !== FENCE_MARK) {
    throw ef01c1Error(
      "LLM_RESPONSE_INVALID",
      "enveloppe de transport invalide : fence ouverte mais jamais refermee en fin de reponse, ou texte present apres la fence fermante — jamais tronquee ni completee ici.",
      { envelope: "unterminated_or_trailing_text" }
    );
  }

  const inner = afterOpen.slice(0, afterOpen.length - FENCE_MARK.length);
  if (inner.indexOf(FENCE_MARK) !== -1) {
    throw ef01c1Error(
      "LLM_RESPONSE_INVALID",
      "enveloppe de transport invalide : plusieurs fences detectees — une reponse ne peut porter qu'une seule enveloppe, et aucun bloc n'est jamais concatene.",
      { envelope: "multiple_fences" }
    );
  }

  return { text: inner, envelopeRemoved: true };
}

const ALLOWED_KEYS = [
  "sources", "queries", "retrieval",
  "criteresInclusion", "criteresExclusion",
  "regleDedoublonnage", "methodeQualification",
  "fenetreTemporelle", "langues", "typesDocumentsAdmis",
];

const SUPPORTED_CONNECTOR_IDS = ["openalex"];

/**
 * parsePlannerResponse(rawResponseText, disciplineIds, validateRealPlannerOutputFields)
 *   rawResponseText              - texte brut REEL retourne par le LLM
 *   disciplineIds                - [string] disciplines retenues de la mission (ordre = celui du RunContract)
 *   validateRealPlannerOutputFields - fonction FIGEE R6, injectee par l'appelant (jamais importee ici directement,
 *                                     pour que ce module reste testable sans dependre implicitement d'un bundleRoot)
 *
 * Retourne le plannerOutput valide (objet JSON tel quel, jamais reconstruit
 * partiellement) ou leve une erreur typee — jamais de valeur partielle en
 * cas d'echec.
 */
function parsePlannerResponse(rawResponseText, disciplineIds, validateRealPlannerOutputFields) {
  if (typeof validateRealPlannerOutputFields !== "function") {
    throw new Error("parsePlannerResponse: validateRealPlannerOutputFields requis (fonction figee R6, jamais une logique de validation dupliquee ici).");
  }
  // F-C1-R2-01 : l'enveloppe de transport est retiree AVANT le parsing
  // strict. Le JSON lui-meme n'est jamais repare — normalizeStrictJson
  // Envelope() ne fait que retirer une fence entourant l'integralite du
  // contenu, ou echouer.
  const normalized = normalizeStrictJsonEnvelope(rawResponseText);
  let parsed;
  try {
    parsed = JSON.parse(normalized.text);
  } catch (e) {
    throw ef01c1Error("LLM_RESPONSE_INVALID", "reponse planner non-JSON ou JSON malformee : " + e.message, { rawResponseTextLength: (rawResponseText || "").length });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw ef01c1Error("LLM_OUTPUT_SCHEMA_INVALID", "reponse planner n'est pas un objet JSON.", {});
  }

  const extraKeys = Object.keys(parsed).filter(function (k) { return ALLOWED_KEYS.indexOf(k) === -1; });
  if (extraKeys.indexOf("humanValidation") !== -1) {
    throw ef01c1Error(
      "PLANNER_OUTPUT_INVALID",
      "reponse planner contient une cle \"humanValidation\" — jamais generee ni acceptee ici : la validation humaine du SearchProtocol reste un acte humain reel, hors de ce module (CDC section 7 : \"Aucune humanValidation automatique\").",
      {}
    );
  }
  if (extraKeys.length) {
    throw ef01c1Error("PLANNER_OUTPUT_INVALID", "cle(s) inattendue(s) dans la reponse planner : " + extraKeys.join(", "), { extraKeys: extraKeys });
  }

  // Contrainte additive EF-01C1-v0.2 (au-dela du schema fige R6, jamais
  // confondue avec lui) : seul connectorId="openalex" est reellement cable
  // a une implementation de recuperation (voir prompts/ef01c1-planner-
  // prompt-v0.2.js, entete). Un plannerOutput structurellement valide mais
  // referencant un autre connecteur serait operationnellement inutilisable
  // — rejete explicitement plutot que silencieusement accepte.
  const badConnectors = [];
  function collectBad(list, field) {
    (Array.isArray(list) ? list : []).forEach(function (item) {
      const cid = item && item[field];
      if (cid && SUPPORTED_CONNECTOR_IDS.indexOf(cid) === -1 && badConnectors.indexOf(cid) === -1) {
        badConnectors.push(cid);
      }
    });
  }
  collectBad(parsed.sources, "connectorId");
  collectBad(parsed.queries, "connectorId");
  collectBad(parsed.retrieval, "connectorId");
  if (badConnectors.length) {
    throw ef01c1Error(
      "PLANNER_OUTPUT_INVALID",
      "connectorId(s) non supporte(s) par ce lot (seul \"" + SUPPORTED_CONNECTOR_IDS.join(", ") + "\" est reellement cable) : " + badConnectors.join(", "),
      { badConnectors: badConnectors }
    );
  }

  const check = validateRealPlannerOutputFields(parsed, disciplineIds);
  if (!check.valid) {
    throw ef01c1Error(
      "PLANNER_OUTPUT_INVALID",
      "reponse planner ne respecte pas le contrat plannerOutput reel (validateRealPlannerOutputFields, R6) : " + check.problems.join("; "),
      { problems: check.problems }
    );
  }
  return parsed;
}

module.exports = {
  parsePlannerResponse: parsePlannerResponse,
  normalizeStrictJsonEnvelope: normalizeStrictJsonEnvelope,
};
