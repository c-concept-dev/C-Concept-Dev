// EvidenceForge — EF-ORCH — Contrat ScreeningArtifact EF-01D — v0.1
//
// Le screening réel est un processus 100% humain, traçable, jamais un moteur
// de règles (vérifié dans le vrai EF-01D : aucune exclusion automatique,
// detectDuplicateCandidates() ne fait QUE suggérer). Cette brique ne décide
// donc jamais rien — elle vérifie qu'un artefact de screening déjà produit
// (par l'interface humaine EF-01D, hors de ce stage orchestré) est complet
// et traçable, exactement comme EF-01C1PlannerTrace vérifie un SearchProtocol
// déjà figé sans jamais le reconstruire.
//
// Format vérifié contre le vrai code source :
//   sourcesScreening[] — via ensureSourceShape() :
//     id, titre, auteurOuOrganisme, date, reference, discipline, theme,
//     provenance{connectorId, connectorType, retrievalMethod, originalReference},
//     qualification (toujours null à ce stade), dependancesConnues[],
//     extraitUtilise, dateConsultation, statutScreening
//     ∈ {trouve, examine, inclus, exclu, doublon}, motifExclusion,
//     screeningDecisionRef.
//   auditDecisions[] — via addDecision() :
//     decisionId, typeDecision, date, acteur ("human" dans le vrai module),
//     modelProvider, modelId, promptVersion, protocolRef (= protocolHash),
//     inputSourceRef (= id de la source), decision, justification,
//     confidenceQualitative, humanOverride.
"use strict";

function str(v) {
  return String(v == null ? "" : v).trim();
}
function isArr(v) {
  return Array.isArray(v);
}
function isStr(v) {
  return typeof v === "string" && v.trim().length > 0;
}

const TERMINAL_STATUTS = Object.freeze(["inclus", "exclu", "doublon"]);
const PENDING_STATUTS = Object.freeze(["trouve", "examine"]);
const VALID_STATUTS = Object.freeze([...PENDING_STATUTS, ...TERMINAL_STATUTS]);

// ---------------------------------------------------------------------------
// assertScreeningArtifactComplete({ sourcesScreening, auditDecisions, protocolHash, expectedSourceIds })
//
// expectedSourceIds : ensemble des identifiants de sources attendues (issues
// d'EF-01C2 + suppliedEvidence) — pour détecter une source disparue ou
// inventée silencieusement. Optionnel : si non fourni, ce contrôle précis est
// sauté (utile pour tester ce contrat isolément), mais l'exécuteur EF-01D
// devra toujours le fournir.
// ---------------------------------------------------------------------------
function assertScreeningArtifactComplete({ sourcesScreening, auditDecisions, protocolHash, expectedSourceIds }) {
  if (!isArr(sourcesScreening)) {
    throw new Error("assertScreeningArtifactComplete: sourcesScreening manquant ou n'est pas un tableau.");
  }
  if (!isArr(auditDecisions)) {
    throw new Error("assertScreeningArtifactComplete: auditDecisions manquant ou n'est pas un tableau.");
  }

  // Aucune source disparue ou inventée silencieusement.
  if (isArr(expectedSourceIds)) {
    const expectedRaw = expectedSourceIds.map(str);
    const actualRaw = sourcesScreening.map((s) => str(s && s.id));

    // Unicité stricte AVANT toute comparaison par ensemble — un Set masquerait
    // un doublon d'id (ex. ["s1","s2","s2"] aurait le même ensemble que
    // ["s1","s2"]). Un doublon d'id de source est une incohérence en soi,
    // détectée explicitement, jamais absorbée par la comparaison qui suit.
    const dupSourceIds = actualRaw.filter((id, i) => actualRaw.indexOf(id) !== i);
    if (dupSourceIds.length) {
      throw new Error("assertScreeningArtifactComplete: sourcesScreening contient des id dupliqués : [" + [...new Set(dupSourceIds)].join(", ") + "].");
    }

    const expected = [...new Set(expectedRaw)].sort();
    const actual = [...new Set(actualRaw)].sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      const missing = expected.filter((id) => !actual.includes(id));
      const extra = actual.filter((id) => !expected.includes(id));
      throw new Error(
        "assertScreeningArtifactComplete: sourcesScreening ne correspond pas exactement aux sources attendues d'EF-01C2/suppliedEvidence" +
        (missing.length ? " — manquantes: [" + missing.join(", ") + "]" : "") +
        (extra.length ? " — en trop/inventées: [" + extra.join(", ") + "]" : "") + "."
      );
    }
  }

  // Unicité stricte des decisionId, indépendamment du contrôle ci-dessus —
  // deux AuditDecision partageant un decisionId seraient silencieusement
  // écrasées par un Map, masquant potentiellement une décision distincte.
  {
    const allDecisionIds = auditDecisions.map((d) => str(d && d.decisionId));
    const dupDecisionIds = allDecisionIds.filter((id, i) => allDecisionIds.indexOf(id) !== i);
    if (dupDecisionIds.length) {
      throw new Error("assertScreeningArtifactComplete: auditDecisions contient des decisionId dupliqués : [" + [...new Set(dupDecisionIds)].join(", ") + "].");
    }
  }

  const decisionsById = new Map(auditDecisions.map((d) => [str(d && d.decisionId), d]));

  sourcesScreening.forEach((s, i) => {
    const sid = str(s && s.id);
    if (!sid) throw new Error("assertScreeningArtifactComplete: sourcesScreening[" + i + "] sans id.");
    const statut = s.statutScreening;
    if (!VALID_STATUTS.includes(statut)) {
      throw new Error("assertScreeningArtifactComplete: sourcesScreening[" + i + "] (" + sid + ") a un statutScreening invalide (\"" + statut + "\").");
    }
    if (PENDING_STATUTS.includes(statut)) {
      throw new Error(
        "assertScreeningArtifactComplete: sourcesScreening[" + i + "] (" + sid + ") reste \"" + statut +
        "\" — screening incomplet, aucune source ne doit rester en attente dans un artefact figé."
      );
    }
    // statut terminal : screeningDecisionRef obligatoire et doit pointer vers un vrai AuditDecision.
    const ref = str(s.screeningDecisionRef);
    if (!ref) {
      throw new Error("assertScreeningArtifactComplete: sourcesScreening[" + i + "] (" + sid + ", statut \"" + statut + "\") sans screeningDecisionRef.");
    }
    const decision = decisionsById.get(ref);
    if (!decision) {
      throw new Error("assertScreeningArtifactComplete: sourcesScreening[" + i + "] (" + sid + ") référence un AuditDecision inexistant (\"" + ref + "\").");
    }
    if (str(decision.inputSourceRef) !== sid) {
      throw new Error(
        "assertScreeningArtifactComplete: AuditDecision \"" + ref + "\" référencé par la source \"" + sid +
        "\" concerne en réalité la source \"" + decision.inputSourceRef + "\" — décision mal attribuée."
      );
    }
    if (str(decision.decision) !== statut) {
      throw new Error(
        "assertScreeningArtifactComplete: AuditDecision \"" + ref + "\" porte decision=\"" + decision.decision +
        "\" mais la source \"" + sid + "\" a statutScreening=\"" + statut + "\" — incohérence entre la décision et le statut qu'elle est censée justifier."
      );
    }
    // justification jamais vide dans le vrai module, quel que soit le
    // statut (texte de repli employé pour "inclus" si l'utilisateur
    // n'écrit rien — cf. addDecision(..., reason || "Décision humaine
    // d'inclusion...")).
    if (!isStr(decision.justification)) {
      throw new Error("assertScreeningArtifactComplete: AuditDecision \"" + ref + "\" a une justification vide — jamais le cas dans le vrai module (repli non vide systématique).");
    }
    // Pour exclu/doublon, le vrai $("#modalConfirm").onclick assigne LA MÊME
    // chaîne "reason" à source.motifExclusion ET à AuditDecision.justification
    // dans le même geste (justification obligatoire, non contournable côté
    // UI) — les deux doivent donc être IDENTIQUES, pas seulement non vides
    // indépendamment.
    if (statut === "exclu" || statut === "doublon") {
      if (!isStr(s.motifExclusion)) {
        throw new Error("assertScreeningArtifactComplete: sourcesScreening[" + i + "] (" + sid + ", statut \"" + statut + "\") a motifExclusion vide — obligatoire pour exclu/doublon dans le vrai module.");
      }
      if (str(s.motifExclusion) !== str(decision.justification)) {
        throw new Error(
          "assertScreeningArtifactComplete: sourcesScreening[" + i + "] (" + sid + ") a motifExclusion=\"" + s.motifExclusion +
          "\" différent de AuditDecision.justification=\"" + decision.justification + "\" — le vrai module assigne la même valeur aux deux dans le même geste, jamais deux textes distincts."
        );
      }
    }
    if (decision.acteur !== "human") {
      throw new Error(
        "assertScreeningArtifactComplete: AuditDecision \"" + ref + "\" a acteur=\"" + decision.acteur +
        "\" — le vrai EF-01D exige acteur=\"human\" pour toute décision de screening."
      );
    }
    if (protocolHash && str(decision.protocolRef) !== str(protocolHash)) {
      throw new Error(
        "assertScreeningArtifactComplete: AuditDecision \"" + ref + "\" référence protocolRef=\"" + decision.protocolRef +
        "\", incohérent avec le protocolHash du run (\"" + protocolHash + "\")."
      );
    }
  });

  return true;
}

// ---------------------------------------------------------------------------
// computeDisciplineStats(disciplinesRetenues, sourcesScreening) — pur,
// déterministe, algorithme copié fidèlement de l'export réel d'EF-01D.
// ---------------------------------------------------------------------------
function normalizeTextLike(v) {
  return str(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function computeDisciplineStats(disciplinesRetenues, sourcesScreening) {
  const disciplines = isArr(disciplinesRetenues) ? disciplinesRetenues : [];
  return disciplines.map((d) => {
    const norm = normalizeTextLike(d);
    const relevant = sourcesScreening.filter((s) => normalizeTextLike(s.discipline) === norm);
    const included = relevant.filter((s) => s.statutScreening === "inclus");
    const statutDiscipline = relevant.length > 0 && included.length === 0
      ? "desert_de_preuves"
      : (relevant.length === 0 ? "non_attribuable_depuis_metadonnees" : "preuves_incluses");
    return { discipline: d, trouvees: relevant.length, incluses: included.length, statutDiscipline };
  });
}

const EFOrchEF01DScreeningArtifact = { assertScreeningArtifactComplete, computeDisciplineStats, TERMINAL_STATUTS, PENDING_STATUTS, VALID_STATUTS };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchEF01DScreeningArtifact;
}
if (typeof window !== "undefined") {
  window.EFOrchEF01DScreeningArtifact = EFOrchEF01DScreeningArtifact;
}
