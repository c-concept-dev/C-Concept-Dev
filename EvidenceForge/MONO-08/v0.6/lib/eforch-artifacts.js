"use strict";
/**
 * MONO-08 — lib/eforch-artifacts.js
 *
 * Construit chaque artefact prerequis du sous-pipeline EF-ORCH-SUBSYSTEM
 * (EF-01A a EF-01F) EXCLUSIVEMENT via les builders/factories geles deja
 * identifies par inspection directe de :
 *   MONO-01/test/fixtures-eforch.js (preuve de constructibilite),
 *   MONO-01/dependencies/ef-orch-runcontract-v0.1.js,
 *   MONO-01/dependencies/ef-orch-ef01b-resolver-trace-v0.1.js,
 *   MONO-01/dependencies/ef-orch-ef01c2-runner-openalex-v0.1.js,
 *   MONO-01/dependencies/ef-orch-ef01-output-contracts-v0.1.js,
 *   MONO-01/dependencies/ef-orch-ef01e-test-qualification-generator-v0.1.js,
 *   MONO-01/dependencies/ef-orch-hash-v0.1.js.
 *
 * Jamais un objet ad hoc devine pour un artefact qui a un builder gele —
 * seuls ScreeningArtifact et les objets "injected" EF-01A/EF-01F sont
 * construits directement (fixtures-eforch.js fait de meme : aucun builder
 * dedie n'existe pour eux au-dela de la validation inline de l'executeur).
 *
 * REMEDIATION F-02/F-03 (integrite epistemique) : ResolverTrace (EF-01B),
 * SearchProtocol.plannerRuns (EF-01C1) et ScreeningArtifact.auditDecisions
 * (EF-01D) portent une provenance epistemique (appel LLM reel, decision
 * humaine reelle) qui ne doit JAMAIS etre fabriquee et presentee comme
 * reelle. Chaque builder concerne accepte donc un parametre `provenance`
 * optionnel `{ mode: "REAL" | "LOCAL_CONTROLLED", ... }` :
 *   - mode absent ou "LOCAL_CONTROLLED" (defaut, jamais implicite en REAL) :
 *     construit un fixture SYNTHETIQUE explicitement marque
 *     evidenceProvenance="SYNTHETIC_FIXTURE" — comportement fonctionnel
 *     identique a l'existant (RÈGLE CARDINALE : aucune valeur fixture
 *     changee), seule l'etiquette honnete est ajoutee.
 *   - mode "REAL" : exige que l'appelant fournisse les donnees REELLES
 *     (appel LLM reellement effectue, decision humaine reellement prise) ;
 *     si elles sont absentes ou incompletes, leve une exception
 *     "OPERATOR_INPUT_REQUIRED: ..." (err.code = "OPERATOR_INPUT_REQUIRED")
 *     plutot que d'inventer un acteur="human" ou un provider/model/hash —
 *     fail-closed explicite, jamais une fabrication silencieuse.
 * Note EF-01D : le contrat gele MONO-01 (ef-orch-ef01d-screening-artifact-
 * v0.1.js::assertScreeningArtifactComplete) exige litteralement
 * acteur==="human" pour toute AuditDecision de screening (vocabulaire de
 * stage, jamais "system_test" contrairement a EF-01E) — ce champ reste
 * donc "human" dans les deux modes, mais n'est plus jamais fabrique SANS
 * qu'une decision reelle (REAL) ou explicitement synthetique (LOCAL_
 * CONTROLLED, etiquetee evidenceProvenance) ne l'accompagne.
 */

function loadEForchDeps(mono01Path) {
  const path = require("path");
  function dep(name) { return require(path.join(mono01Path, "dependencies", name)); }
  return {
    EFOrchRunContract: dep("ef-orch-runcontract-v0.1.js"),
    ResolverTraceSchema: dep("ef-orch-ef01b-resolver-trace-v0.1.js"),
    createOpenAlexRunner: dep("ef-orch-ef01c2-runner-openalex-v0.1.js").createOpenAlexRunner,
    sha256LikeRealSearchProtocol: dep("ef-orch-ef01-output-contracts-v0.1.js").sha256LikeRealSearchProtocol,
    generateQualificationTestArtifact: dep("ef-orch-ef01e-test-qualification-generator-v0.1.js").generateQualificationTestArtifact,
    sha256Bytes: dep("ef-orch-hash-v0.1.js").sha256Bytes,
    // REMEDIATION R3 (M-02) : sha256CanonicalJson (deja exportee par le
    // module gele ef-orch-hash-v0.1.js, jamais reimplementee ici) sert a
    // hasher provenance.plannerOutput (contenu causal du planificateur,
    // objet arbitraire fourni par l'operateur) de facon stable a l'ordre
    // d'insertion des cles — jamais sha256LikeRealSearchProtocol, reservee
    // au seul algorithme historique de protocolHash.
    sha256CanonicalJson: dep("ef-orch-hash-v0.1.js").sha256CanonicalJson,
  };
}

async function buildConfirmedRunContractForMission(deps, mission, missionQuestion, documentBytesByUrl) {
  const EFOrchRunContract = deps.EFOrchRunContract;
  const sha256Bytes = deps.sha256Bytes;
  const documentsDetectes = [];
  for (const doc of mission.targetDocuments) {
    const bytes = documentBytesByUrl[doc.url];
    if (!bytes) throw new Error("buildConfirmedRunContractForMission: octets manquants pour \"" + doc.url + "\".");
    const hash = await sha256Bytes(bytes);
    documentsDetectes.push({ nom: doc.title || doc.documentId, type: "document_public", hashSha256: hash });
  }
  const disciplinesProposees = mission.dimensions.map(function (d) { return { discipline: d.id, justification: d.label || d.id }; });
  const draft = EFOrchRunContract.buildRunContractDraft({
    demandeBrute: missionQuestion,
    missionReformulee: missionQuestion,
    documentsDetectes: documentsDetectes,
    sourcesFournies: [],
    disciplinesProposees: disciplinesProposees,
    connecteursDisponibles: ["openalex"],
    niveauRevue: "standard",
    webPublicActive: false,
    governanceRef: { usageStatus: "research_internal" },
  });
  return EFOrchRunContract.confirmRunContract(draft, { confirmedAt: new Date().toISOString() });
}

function operatorInputRequired(message) {
  const err = new Error("OPERATOR_INPUT_REQUIRED: " + message);
  err.code = "OPERATOR_INPUT_REQUIRED";
  return err;
}

function isSha256Hex(v) {
  return typeof v === "string" && /^[0-9a-f]{64}$/i.test(v);
}

function resolveMode(provenance) {
  return provenance && provenance.mode === "REAL" ? "REAL" : "LOCAL_CONTROLLED";
}

/**
 * REMEDIATION R2 (B-03) : validateRealResolverRunFields()/
 * validateRealPlannerRunFields() (identique en forme — un appel LLM
 * REEL, resolver ou planner, porte les memes champs de provenance) et
 * validateRealAuditDecisionFields() sont la SEULE UNE SEULE source de
 * verite pour ce qui constitue une provenance REELLE structurellement
 * valide. Utilisees ICI par les builders (fail-closed a la construction)
 * ET par bin/run-real-smoke.js::missionGateStatus() (fail-closed AVANT
 * toute construction/appel provider — voir mandat R2 section 12) via
 * validateRealEForchProvenance() ci-dessous, exportee. Jamais une
 * deuxieme logique de validation dupliquee entre le gate et les
 * builders.
 */
function validateRealResolverRunFields(run) {
  const missing = [];
  ["provider", "model", "promptVersion", "date"].forEach(function (f) { if (!run || typeof run[f] !== "string" || !run[f].trim()) missing.push(f); });
  if (!run || !isSha256Hex(run.inputHash)) missing.push("inputHash");
  if (!run || !isSha256Hex(run.rawResponseHash)) missing.push("rawResponseHash");
  // REMEDIATION R2 (M-02) : proposalCountRaw/proposalCountStored/
  // technicalProposalLimit/targetContextReport ne se replient plus
  // silencieusement sur des valeurs par defaut en mode REAL (voir
  // header du fichier) — verifies ici, dans la MEME fonction que le
  // gate (validateRealEForchProvenance) et le builder utilisent tous
  // les deux, jamais deux listes de champs requis divergentes.
  if (!run || typeof run.proposalCountRaw !== "number") missing.push("proposalCountRaw");
  if (!run || typeof run.proposalCountStored !== "number") missing.push("proposalCountStored");
  if (!run || typeof run.technicalProposalLimit !== "number") missing.push("technicalProposalLimit");
  if (!run || !Array.isArray(run.targetContextReport)) missing.push("targetContextReport");
  return missing;
}
/**
 * validateRealPlannerRunFields(run) — le plannerRun REEL ne porte QUE la
 * provenance de l'appel LLM (provider/model/promptVersion/date/hash),
 * jamais les champs de comptage propres a ResolverTrace (proposalCountRaw
 * etc., qui n'existent pas pour SearchProtocol.plannerRuns) — fonction
 * DISTINCTE de validateRealResolverRunFields (jamais un simple alias,
 * pour ne pas exiger des champs qui n'ont pas de sens ici).
 */
function validateRealPlannerRunFields(run) {
  const missing = [];
  ["provider", "model", "promptVersion", "date"].forEach(function (f) { if (!run || typeof run[f] !== "string" || !run[f].trim()) missing.push(f); });
  if (!run || !isSha256Hex(run.inputHash)) missing.push("inputHash");
  if (!run || !isSha256Hex(run.rawResponseHash)) missing.push("rawResponseHash");
  return missing;
}

function validateRealAuditDecisionFields(d) {
  return !d || d.acteur !== "human" || typeof d.justification !== "string" || !d.justification.trim() ||
    typeof d.date !== "string" || !d.date.trim() || ["inclus", "exclu", "doublon"].indexOf(d.decision) === -1;
}

function validateRealHumanValidationFields(v) {
  return !v || typeof v.validatedAt !== "string" || !v.validatedAt.trim() || typeof v.commentaire !== "string" || !v.commentaire.trim();
}

/**
 * validatePostRetrievalAuditDecisions(snapshot, auditDecisionsInput) —
 * REMEDIATION R5 (A-01). POST_RETRIEVAL_GATE : la SEULE fonction
 * habilitee a exiger/valider `auditDecisions`, executee UNIQUEMENT apres
 * qu'un RetrievalSnapshot reel existe (jamais avant — voir
 * `validatePreRetrievalProvenance` ci-dessus, correction du defaut
 * BLOQUANT R4-A01 : la dependance cyclique temporelle mission-gate <->
 * auditDecisions <-> retrieval).
 *
 * `auditDecisionsInput` = {
 *   snapshotId, snapshotHash, missionId,   // liaison EXPLICITE au snapshot precis vise — jamais implicite
 *   decisions: [ { sourceId, acteur, date, decision, justification, ... }, ... ]  // TABLEAU, jamais une map (permet la detection de doublon contradictoire)
 * }
 *
 * Retourne { valid, problems, decisionsBySourceId } — `decisionsBySourceId`
 * (forme `{ [sourceId]: {...} }`, directement consommable par
 * `buildScreeningArtifactForMission()`) n'est JAMAIS renvoyee sur un echec
 * (jamais une construction partielle exploitable par erreur).
 */
function validatePostRetrievalAuditDecisions(snapshot, auditDecisionsInput) {
  const problems = [];
  if (!snapshot || typeof snapshot !== "object") {
    return { valid: false, problems: ["snapshot absent ou invalide — POST_RETRIEVAL_GATE ne peut jamais s'executer sans un RetrievalSnapshot reel"] };
  }
  if (!auditDecisionsInput || typeof auditDecisionsInput !== "object") {
    return { valid: false, problems: ["auditDecisionsInput absent ou invalide (OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS)"] };
  }
  if (auditDecisionsInput.snapshotId !== snapshot.snapshotId) {
    problems.push("snapshotId incoherent (decisions soumises pour \"" + auditDecisionsInput.snapshotId + "\", snapshot charge est \"" + snapshot.snapshotId + "\") — decision pour un snapshot different, jamais acceptee");
  }
  if (auditDecisionsInput.snapshotHash !== snapshot.snapshotHash) {
    problems.push("snapshotHash incoherent — ces decisions ont ete preparees contre une version differente (potentiellement obsolete/tamperee) du snapshot, jamais acceptees silencieusement");
  }
  if (auditDecisionsInput.missionId !== snapshot.missionId) {
    problems.push("missionId incoherent (decisions=\"" + auditDecisionsInput.missionId + "\", snapshot=\"" + snapshot.missionId + "\")");
  }
  const knownSourceIds = (snapshot.sources || []).map(function (s) { return s.sourceId; });
  const decisions = Array.isArray(auditDecisionsInput.decisions) ? auditDecisionsInput.decisions : null;
  const seenSourceIds = {};
  if (!decisions) {
    problems.push("decisions manquant ou n'est pas un tableau");
  } else {
    decisions.forEach(function (d, i) {
      const sid = d && d.sourceId;
      if (!isNonEmptyStr(sid)) { problems.push("decisions[" + i + "].sourceId manquant"); return; }
      if (knownSourceIds.indexOf(sid) === -1) {
        problems.push("decisions[" + i + "] cible un sourceId inconnu du snapshot (\"" + sid + "\") — jamais accepte");
        return;
      }
      if (Object.prototype.hasOwnProperty.call(seenSourceIds, sid)) {
        if (JSON.stringify(seenSourceIds[sid]) !== JSON.stringify(d)) {
          problems.push("decisions contient un DOUBLON CONTRADICTOIRE pour \"" + sid + "\" (deux decisions differentes pour la meme source) — jamais accepte");
        }
        return;
      }
      seenSourceIds[sid] = d;
      if (validateRealAuditDecisionFields(d)) {
        problems.push("decisions[" + i + "] (source \"" + sid + "\") invalide (acteur=\"human\"/justification/date/decision requis — jamais une decision synthetique en REAL)");
      }
    });
    // Exhaustivite : chaque source du snapshot doit avoir une decision.
    knownSourceIds.forEach(function (sid) {
      if (!Object.prototype.hasOwnProperty.call(seenSourceIds, sid)) {
        problems.push("aucune decision fournie pour la source \"" + sid + "\" du snapshot (decision exhaustive requise, jamais une source ignoree silencieusement)");
      }
    });
  }
  if (problems.length) {
    return { valid: false, problems: problems };
  }
  const decisionsBySourceId = {};
  Object.keys(seenSourceIds).forEach(function (sid) { decisionsBySourceId[sid] = seenSourceIds[sid]; });
  return { valid: true, problems: [], decisionsBySourceId: decisionsBySourceId };
}

function isNonEmptyStr(v) {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * validateRealPlannerOutputFields(output, disciplineIds) — REMEDIATION R3
 * (M-02, mandat sections 6-9). Contenu CAUSAL du planificateur : ce que le
 * planner a reellement decide (sources, requetes, criteres, politiques),
 * distinct de plannerRun (qui ne porte QUE la provenance de l'appel — voir
 * validateRealPlannerRunFields). En mode REAL, plannerRun seul ne suffit
 * plus : sans plannerOutput structurellement valide, echec fail-closed
 * explicite ("planner causal output missing"), jamais un repli sur les
 * anciens gabarits fixes MONO-08 (F-02/F-03/M-02 round 2 : meme discipline
 * partout, jamais une fabrication silencieuse d'un champ substantiel).
 * Utilisee a la fois par buildSearchProtocolForMission() (fail-closed a la
 * construction) et par validateRealEForchProvenance() (fail-closed au
 * mission-gate, AVANT tout appel provider — meme fonction, jamais une
 * deuxieme logique dupliquee, meme principe que B-03).
 */
function validateRealPlannerOutputFields(output, disciplineIds) {
  const problems = [];
  const disciplineList = Array.isArray(disciplineIds) ? disciplineIds : [];
  if (!output || typeof output !== "object") {
    return { valid: false, problems: ["plannerOutput absent ou invalide (planner causal output missing) — aucun contenu causal du planificateur fourni, seul plannerRun (metadonnees de provenance) ne suffit jamais a construire un SearchProtocol en mode REAL."] };
  }
  const sources = Array.isArray(output.sources) ? output.sources : null;
  if (!sources || sources.length === 0) {
    problems.push("plannerOutput.sources manquant ou vide (au moins une source active reellement decidee par le planner est requise)");
  } else {
    sources.forEach(function (s, i) {
      if (!s || !isNonEmptyStr(s.connectorId)) problems.push("plannerOutput.sources[" + i + "].connectorId manquant");
      if (!s || !isNonEmptyStr(s.justification)) problems.push("plannerOutput.sources[" + i + "].justification manquant");
    });
  }
  const connectorIds = sources ? sources.map(function (s) { return s && s.connectorId; }).filter(Boolean) : [];
  const queries = Array.isArray(output.queries) ? output.queries : null;
  if (!queries || queries.length !== disciplineList.length) {
    problems.push("plannerOutput.queries manquant ou de longueur incorrecte (attendu " + disciplineList.length + " — une requete reelle par discipline retenue de la mission, jamais devinee)");
  } else {
    disciplineList.forEach(function (discId) {
      const q = queries.find(function (qq) { return qq && qq.discipline === discId; });
      if (!q) { problems.push("plannerOutput.queries: aucune requete pour la discipline \"" + discId + "\""); return; }
      if (!isNonEmptyStr(q.requete)) problems.push("plannerOutput.queries[discipline=\"" + discId + "\"].requete manquant");
      if (!isNonEmptyStr(q.justification)) problems.push("plannerOutput.queries[discipline=\"" + discId + "\"].justification manquant");
      if (!isNonEmptyStr(q.connectorId) || connectorIds.indexOf(q.connectorId) === -1) problems.push("plannerOutput.queries[discipline=\"" + discId + "\"].connectorId absent ou ne correspond a aucune source active declaree");
    });
  }
  const retrieval = Array.isArray(output.retrieval) ? output.retrieval : null;
  if (!retrieval || retrieval.length !== connectorIds.length) {
    problems.push("plannerOutput.retrieval manquant ou de longueur incorrecte (attendu une politique reelle par source active, " + connectorIds.length + ")");
  } else {
    connectorIds.forEach(function (cid) {
      const rp = retrieval.find(function (r) { return r && r.connectorId === cid; });
      if (!rp) { problems.push("plannerOutput.retrieval: aucune politique pour le connecteur \"" + cid + "\""); return; }
      ["sortMode", "stopCondition", "retryPolicy", "rateLimitPolicy", "budgetMax"].forEach(function (f) {
        if (!isNonEmptyStr(rp[f])) problems.push("plannerOutput.retrieval[connectorId=\"" + cid + "\"]." + f + " manquant");
      });
      ["pageSize", "maxPages", "maxResults"].forEach(function (f) {
        if (typeof rp[f] !== "number") problems.push("plannerOutput.retrieval[connectorId=\"" + cid + "\"]." + f + " manquant ou non numerique");
      });
    });
  }
  if (!Array.isArray(output.criteresInclusion) || output.criteresInclusion.length === 0 || !output.criteresInclusion.every(isNonEmptyStr)) {
    problems.push("plannerOutput.criteresInclusion manquant, vide ou invalide (jamais repli sur [\"Pertinence a la mission.\"])");
  }
  if (!Array.isArray(output.criteresExclusion) || output.criteresExclusion.length === 0 || !output.criteresExclusion.every(isNonEmptyStr)) {
    problems.push("plannerOutput.criteresExclusion manquant, vide ou invalide (jamais repli sur [\"Hors sujet.\"])");
  }
  if (!isNonEmptyStr(output.regleDedoublonnage)) problems.push("plannerOutput.regleDedoublonnage manquant (jamais repli sur \"DOI.\")");
  if (!isNonEmptyStr(output.methodeQualification)) problems.push("plannerOutput.methodeQualification manquant (jamais repli sur \"Qualitative.\")");
  return { valid: problems.length === 0, problems: problems };
}

/**
 * buildSearchProtocolFromPlannerOutput(output, disciplineIds) —
 * transformation DETERMINISTE, jamais un gabarit MONO-08 : chaque champ
 * substantiel (sourcesActivees/requetesExactes/retrievalPolicies/
 * criteresInclusion/criteresExclusion/regleDedoublonnage/
 * methodeQualification) est copie ou reindexe DEPUIS `output` (deja
 * valide par validateRealPlannerOutputFields — jamais appelee sans cette
 * validation prealable). Seuls des defauts NON SUBSTANTIFS, jamais
 * verifies par le contrat gele assertSearchProtocolFrozenAndValid
 * (label/access/constraint de presentation, fenetreTemporelle/langues/
 * typesDocumentsAdmis vides), sont completes silencieusement — jamais un
 * critere d'inclusion/exclusion, une regle de dedoublonnage ou une
 * methode de qualification, qui restent TOUJOURS exiges explicitement de
 * `output` (fail-closed en amont sinon).
 */
function buildSearchProtocolFromPlannerOutput(output, disciplineIds) {
  const sourcesActivees = output.sources.map(function (s) {
    return {
      connectorId: s.connectorId,
      label: isNonEmptyStr(s.label) ? s.label : s.connectorId,
      access: isNonEmptyStr(s.access) ? s.access : "",
      constraint: isNonEmptyStr(s.constraint) ? s.constraint : "",
      active: true,
      justification: s.justification,
    };
  });
  const requetesExactes = disciplineIds.map(function (discId, i) {
    const q = output.queries.find(function (qq) { return qq.discipline === discId; });
    return { id: "q" + (i + 1), connectorId: q.connectorId, discipline: discId, requete: q.requete, justification: q.justification };
  });
  const retrievalPolicies = output.sources.map(function (s) {
    const rp = output.retrieval.find(function (r) { return r.connectorId === s.connectorId; });
    const requetesDuConnecteur = requetesExactes.filter(function (q) { return q.connectorId === s.connectorId; }).map(function (q) { return q.requete; });
    return {
      connectorId: s.connectorId, requete: requetesDuConnecteur.join(", "),
      sortMode: rp.sortMode, pageSize: rp.pageSize, maxPages: rp.maxPages, maxResults: rp.maxResults,
      stopCondition: rp.stopCondition, retryPolicy: rp.retryPolicy, rateLimitPolicy: rp.rateLimitPolicy, budgetMax: rp.budgetMax,
    };
  });
  const hasFenetre = output.fenetreTemporelle && (isNonEmptyStr(output.fenetreTemporelle.debut) || isNonEmptyStr(output.fenetreTemporelle.fin));
  return {
    sourcesActivees: sourcesActivees,
    requetesExactes: requetesExactes,
    retrievalPolicies: retrievalPolicies,
    criteresInclusion: output.criteresInclusion.slice(),
    criteresExclusion: output.criteresExclusion.slice(),
    regleDedoublonnage: output.regleDedoublonnage,
    methodeQualification: output.methodeQualification,
    fenetreTemporelle: hasFenetre ? { debut: output.fenetreTemporelle.debut || "", fin: output.fenetreTemporelle.fin || "" } : { debut: "", fin: "" },
    langues: Array.isArray(output.langues) ? output.langues.slice() : [],
    typesDocumentsAdmis: Array.isArray(output.typesDocumentsAdmis) ? output.typesDocumentsAdmis.slice() : [],
  };
}

/**
 * validatePreRetrievalProvenance(mission) — REMEDIATION R5 (A-01).
 *
 * Verification STRUCTURELLE (comptage/forme des champs) des SEULES
 * preconditions reellement disponibles AVANT tout retrieval EF-01C2 —
 * jamais `auditDecisions` (voir ci-dessous, raison architecturale).
 * C'est desormais LA fonction utilisee par le PRE_RETRIEVAL_GATE :
 * mission-gate historique (bin/run-real-smoke.js::describeMissionGateStatus)
 * ET prepareRealScreening() (lib/real-screening-workflow.js).
 *
 * Pourquoi `auditDecisions` en est exclu (correction du defaut R4-A01,
 * audit independant round 4) : `auditDecisions` est indexee par les
 * `sourceId` REELLEMENT retrouves par le retrieval EF-01C2 — des
 * identifiants qui n'existent structurellement PAS avant que ce
 * retrieval n'ait reellement eu lieu (generes dynamiquement par le
 * connecteur, jamais previsibles a l'avance). Exiger `auditDecisions`
 * ICI, AVANT tout retrieval, creait une dependance cyclique temporelle
 * impossible a satisfaire honnetement dans un seul chemin nominal sans
 * inventer a l'avance des decisions sur des sources encore inconnues —
 * c'est exactement le defaut BLOQUANT identifie par l'audit R4
 * independant (finding R4-A01). La validation d'`auditDecisions`
 * appartient desormais exclusivement a
 * `validatePostRetrievalAuditDecisions()` (lib/real-screening-workflow.js),
 * executee UNIQUEMENT apres qu'un `RetrievalSnapshot` reel existe.
 */
function validatePreRetrievalProvenance(mission) {
  const problems = [];
  const provenance = mission && mission.eForchProvenance;
  if (!provenance || typeof provenance !== "object") {
    return { valid: false, problems: ["eForchProvenance absent ou invalide"] };
  }
  const disciplineCount = Array.isArray(mission.dimensions) ? mission.dimensions.length : 0;
  if (!Array.isArray(provenance.resolverRuns) || provenance.resolverRuns.length !== disciplineCount) {
    problems.push("resolverRuns manquant ou de longueur incorrecte (attendu " + disciplineCount + ", disciplines de la mission)");
  } else {
    const gateDisciplineIds = Array.isArray(mission.dimensions) ? mission.dimensions.map(function (d) { return d.id; }) : [];
    provenance.resolverRuns.forEach(function (run, i) {
      const missing = validateRealResolverRunFields(run);
      if (missing.length) problems.push("resolverRuns[" + i + "] invalide: " + missing.join(","));
      // REMEDIATION R4 (F-02) : meme coherence discipline-vs-position que le
      // builder du ResolverTrace — jamais une seconde logique divergente.
      if (isNonEmptyStr(run && run.discipline) && run.discipline !== gateDisciplineIds[i]) {
        problems.push("resolverRuns[" + i + "].discipline (\"" + run.discipline + "\") incoherent avec la discipline de la mission a cette position (\"" + gateDisciplineIds[i] + "\")");
      }
    });
  }
  const plannerMissing = validateRealPlannerRunFields(provenance.plannerRun);
  if (plannerMissing.length) problems.push("plannerRun invalide: " + plannerMissing.join(","));
  // REMEDIATION R3 (M-02) : plannerRun (provenance de l'appel) ne suffit
  // plus a lui seul — le gate echoue desormais AUSSI, avant tout appel
  // provider, si provenance.plannerOutput (contenu causal reel du
  // planificateur) est absent ou structurellement incomplet. Memes
  // disciplines que celles que buildEForchArtifacts() calculera
  // (mission.dimensions[].id) — jamais une liste divergente entre le
  // gate et le builder.
  const disciplineIds = Array.isArray(mission.dimensions) ? mission.dimensions.map(function (d) { return d.id; }) : [];
  const plannerOutputCheck = validateRealPlannerOutputFields(provenance.plannerOutput, disciplineIds);
  if (!plannerOutputCheck.valid) {
    problems.push("plannerOutput invalide (planner causal output missing): " + plannerOutputCheck.problems.join("; "));
  }
  if (validateRealHumanValidationFields(provenance.humanValidation)) {
    problems.push("humanValidation invalide ou absent (validatedAt/commentaire requis, jamais invente)");
  }
  return { valid: problems.length === 0, problems: problems };
}

/**
 * validateRealEForchProvenance(mission) — CONSERVEE pour compatibilite
 * historique (r1->r4) et pour l'usage documentaire "provenance REELLE
 * COMPLETE" (pre- ET post-retrieval reunies) : identique a
 * `validatePreRetrievalProvenance()` PLUS la verification structurelle
 * d'`auditDecisions` (forme uniquement — jamais l'appariement exact par
 * sourceId reel, qui reste le role de `validatePostRetrievalAuditDecisions()`
 * une fois un `RetrievalSnapshot` reel disponible). N'est PLUS utilisee
 * par le mission-gate depuis R5 (voir `validatePreRetrievalProvenance`
 * ci-dessus, correction R4-A01) — reste exportee/testee pour eviter toute
 * regression sur son propre comportement historique.
 */
function validateRealEForchProvenance(mission) {
  const preCheck = validatePreRetrievalProvenance(mission);
  const problems = preCheck.problems.slice();
  const provenance = mission && mission.eForchProvenance;
  const auditDecisions = provenance && provenance.auditDecisions;
  if (!auditDecisions || typeof auditDecisions !== "object" || Object.keys(auditDecisions).length === 0) {
    problems.push("auditDecisions absent ou vide (au moins une decision humaine reelle requise)");
  } else {
    Object.keys(auditDecisions).forEach(function (key) {
      if (validateRealAuditDecisionFields(auditDecisions[key])) problems.push("auditDecisions[\"" + key + "\"] invalide (acteur=\"human\"/justification/date/decision requis)");
    });
  }
  return { valid: problems.length === 0, problems: problems };
}

function buildResolverTraceForMission(deps, missionId, confirmedRunContract, provenance) {
  const ResolverTraceSchema = deps.ResolverTraceSchema;
  const mode = resolveMode(provenance);
  const disciplines = confirmedRunContract.disciplinesProposees;
  const realRuns = provenance && provenance.resolverRuns;
  if (mode === "REAL") {
    if (!Array.isArray(realRuns) || realRuns.length !== disciplines.length) {
      throw operatorInputRequired(
        "ResolverTrace (EF-01B) requiert un resolverRuns[] REEL fourni par l'operateur (un par discipline proposee, " +
        disciplines.length + " attendu(s)) — aucune trace d'appel LLM synthetique n'est acceptee en mode REAL."
      );
    }
    realRuns.forEach(function (run, i) {
      // validateRealResolverRunFields() couvre desormais aussi
      // proposalCountRaw/proposalCountStored/technicalProposalLimit/
      // targetContextReport (REMEDIATION R2, M-02) — jamais un repli
      // implicite sur 1/1/20/[] en mode REAL.
      const missing = validateRealResolverRunFields(run);
      if (missing.length) {
        throw operatorInputRequired("ResolverTrace resolverRuns[" + i + "] (discipline \"" + (disciplines[i] && disciplines[i].discipline) + "\") — champ(s) reel(s) manquant(s) ou invalide(s) : " + missing.join(", ") + ".");
      }
      // REMEDIATION R4 (F-02, mandat section 9/16 R4-F02-04) : si l'operateur
      // fournit explicitement un champ `discipline` sur son resolverRun (pour
      // s'auto-verifier), il DOIT correspondre exactement a la discipline
      // reellement retenue par le RunContract confirme a cette position —
      // jamais silencieusement accepte si incoherent (une attestation pour
      // une discipline aurait alors ete mal attribuee a une autre). Champ
      // optionnel : son absence n'est jamais une erreur (compatibilite
      // ascendante r1/r2/r3 — l'alignement positionnel reste la source de
      // verite quand `discipline` n'est pas fourni).
      if (isNonEmptyStr(run.discipline) && run.discipline !== (disciplines[i] && disciplines[i].discipline)) {
        throw operatorInputRequired(
          "ResolverTrace resolverRuns[" + i + "].discipline (\"" + run.discipline + "\") ne correspond pas a la discipline reellement retenue par le RunContract a cette position (\"" +
          (disciplines[i] && disciplines[i].discipline) + "\") — attestation mal attribuee, jamais acceptee silencieusement."
        );
      }
    });
  }
  return {
    schema: ResolverTraceSchema.SCHEMA,
    schemaVersion: ResolverTraceSchema.SCHEMA_VERSION,
    runContractHash: confirmedRunContract.runContractHash,
    evidenceProvenance: mode === "REAL" ? "OPERATOR_ATTESTED_LLM_CALL" : "SYNTHETIC_FIXTURE",
    resolverRuns: disciplines.map(function (d, i) {
      if (mode === "REAL") {
        const run = realRuns[i];
        // Tous les champs presents et valides (verifie ci-dessus) - jamais
        // un repli implicite ici pour un champ cense refleter l'appel LLM
        // reel.
        return {
          runId: "r" + (i + 1), date: run.date, provider: run.provider, model: run.model,
          promptVersion: run.promptVersion, missionId: missionId, inputHash: run.inputHash, rawResponseHash: run.rawResponseHash,
          proposalCountRaw: run.proposalCountRaw, proposalCountStored: run.proposalCountStored,
          technicalProposalLimit: run.technicalProposalLimit, technicalLimitApplied: !!run.technicalLimitApplied,
          targetContextReport: run.targetContextReport,
          evidenceProvenance: "OPERATOR_ATTESTED_LLM_CALL",
        };
      }
      return {
        runId: "r" + (i + 1), date: new Date().toISOString(), provider: "anthropic", model: "claude-sonnet-4-6",
        promptVersion: "EF01B-discipline-resolver-v2", missionId: missionId, inputHash: "1".repeat(64), rawResponseHash: "2".repeat(64),
        proposalCountRaw: 1, proposalCountStored: 1, technicalProposalLimit: 20, technicalLimitApplied: false, targetContextReport: [],
        evidenceProvenance: "SYNTHETIC_FIXTURE",
      };
    }),
  };
}

async function buildSearchProtocolForMission(deps, missionId, idSuffix, disciplines, provenance) {
  const sha256LikeRealSearchProtocol = deps.sha256LikeRealSearchProtocol;
  const sha256CanonicalJson = deps.sha256CanonicalJson;
  const mode = resolveMode(provenance);
  const realPlanner = provenance && provenance.plannerRun;
  const realPlannerOutput = provenance && provenance.plannerOutput;
  const realHumanValidation = provenance && provenance.humanValidation;
  let derived = null;
  let plannerOutputHash = null;
  if (mode === "REAL") {
    const missing = validateRealPlannerRunFields(realPlanner);
    if (missing.length) {
      throw operatorInputRequired("SearchProtocol (EF-01C1) requiert un plannerRun REEL fourni par l'operateur — champ(s) manquant(s) ou invalide(s) : " + missing.join(", ") + ".");
    }
    // REMEDIATION R3 (M-02, mandat sections 5-9) : plannerRun seul
    // (metadonnees de provenance de l'appel LLM) ne suffisait a rien
    // demontrer sur le CONTENU du SearchProtocol — celui-ci restait
    // construit par gabarit MONO-08 fige, quel que soit le plannerRun
    // fourni (deux plannerRun distincts produisaient un SearchProtocol
    // substantiellement identique — voir 16-M02-CAUSAL-LINEAGE.md).
    // provenance.plannerOutput (contenu CAUSAL reellement decide par le
    // planificateur : sources/requetes/politiques/criteres) est desormais
    // exige et REELLEMENT transforme (buildSearchProtocolFromPlannerOutput,
    // deterministe, jamais un gabarit) — sinon fail-closed explicite,
    // jamais un repli silencieux sur l'ancien gabarit fixe.
    const outputCheck = validateRealPlannerOutputFields(realPlannerOutput, disciplines);
    if (!outputCheck.valid) {
      throw operatorInputRequired("SearchProtocol (EF-01C1) requiert provenance.plannerOutput (contenu causal reel du planificateur — planner causal output missing) : " + outputCheck.problems.join("; ") + ".");
    }
    derived = buildSearchProtocolFromPlannerOutput(realPlannerOutput, disciplines);
    plannerOutputHash = await sha256CanonicalJson(realPlannerOutput);
    // REMEDIATION R2 (M-02) : "humanValidation.commentaire" etait
    // fabrique INCONDITIONNELLEMENT ("Revu (MONO-08).") y compris en
    // mode REAL, sans jamais avoir ete detecte par F-02/F-03 (qui ne
    // couvraient que ScreeningArtifact/ResolverTrace/plannerRuns) — une
    // revue humaine du protocole de recherche etait donc presentee comme
    // reelle sans jamais l'avoir ete. Meme discipline que ScreeningArtifact
    // desormais : exige une validation humaine REELLE en mode REAL.
    // Comportement PRESERVE tel quel en R3 (mandat section 12 : ne
    // jamais reintroduire de faux acte humain).
    if (validateRealHumanValidationFields(realHumanValidation)) {
      throw operatorInputRequired("SearchProtocol (EF-01C1) requiert une validation humaine REELLE (provenance.humanValidation: {validatedAt, commentaire}) — jamais une validation humaine inventee en mode REAL.");
    }
  }
  // Mode LOCAL_CONTROLLED : gabarit synthetique INCHANGE depuis r1/r2
  // (RÈGLE CARDINALE — aucune valeur fixture modifiee), seul le mode REAL
  // (ci-dessus) construit desormais reellement depuis `derived`.
  const sourcesActivees = mode === "REAL" ? derived.sourcesActivees
    : [{ connectorId: "openalex", label: "OpenAlex", access: "", constraint: "", active: true, justification: "Justification." }];
  const requetesExactes = mode === "REAL" ? derived.requetesExactes
    : disciplines.map(function (d, i) { return { id: "q" + (i + 1), connectorId: "openalex", discipline: d, requete: d, justification: "Requete pour la dimension " + d + "." }; });
  // Cardinalite exigee par le validateur reel (validateEF01C1Output) :
  // retrievalPolicies.length === sourcesActivees.length (une politique par
  // SOURCE active, jamais par discipline) — preservee par construction
  // dans buildSearchProtocolFromPlannerOutput (une politique par source
  // decidee par le planner) et dans le gabarit LOCAL_CONTROLLED (un seul
  // connecteur openalex actif, donc une seule politique).
  const retrievalPolicies = mode === "REAL" ? derived.retrievalPolicies
    : [{ connectorId: "openalex", requete: disciplines.join(", "), sortMode: "relevance", pageSize: 25, maxPages: 1, maxResults: 5, stopCondition: "maxResults atteint", retryPolicy: "2 tentatives", rateLimitPolicy: "1000 req/s", budgetMax: "budget raisonnable" }];
  const criteresInclusion = mode === "REAL" ? derived.criteresInclusion : ["Pertinence a la mission."];
  const criteresExclusion = mode === "REAL" ? derived.criteresExclusion : ["Hors sujet."];
  const regleDedoublonnage = mode === "REAL" ? derived.regleDedoublonnage : "DOI.";
  const methodeQualification = mode === "REAL" ? derived.methodeQualification : "Qualitative.";
  const fenetreTemporelle = mode === "REAL" ? derived.fenetreTemporelle : { debut: "", fin: "" };
  const langues = mode === "REAL" ? derived.langues : [];
  const typesDocumentsAdmis = mode === "REAL" ? derived.typesDocumentsAdmis : [];
  const protoBase = {
    schema: "EvidenceForge.SearchProtocol", schemaVersion: "EF-01C1-v1", id: "protocol-" + idSuffix, missionId: missionId,
    disciplinesRetenues: disciplines, sourcesActivees: sourcesActivees, requetesExactes: requetesExactes,
    fenetreTemporelle: fenetreTemporelle, langues: langues, typesDocumentsAdmis: typesDocumentsAdmis,
    criteresInclusion: criteresInclusion, criteresExclusion: criteresExclusion,
    regleDedoublonnage: regleDedoublonnage, methodeQualification: methodeQualification,
    retrievalPolicies: retrievalPolicies,
    statut: "figé", createdAt: new Date().toISOString(), validatedAt: new Date().toISOString(), frozenAt: new Date().toISOString(),
    humanValidation: mode === "REAL"
      ? { validatedAt: realHumanValidation.validatedAt, commentaire: realHumanValidation.commentaire, evidenceProvenance: "OPERATOR_ATTESTED_HUMAN_ACTION" }
      : { validatedAt: new Date().toISOString(), commentaire: "Revu (MONO-08).", evidenceProvenance: "SYNTHETIC_FIXTURE" },
    evidenceProvenance: mode === "REAL" ? "OPERATOR_ATTESTED_LLM_CALL" : "SYNTHETIC_FIXTURE",
    // REMEDIATION R3 (M-02, mandat section 11) : provenanceClassification
    // est une classification ADDITIVE distincte de evidenceProvenance —
    // ATTESTED (l'appelant affirme) reste distinct de VERIFIED (MONO-08
    // verifierait causalement l'appel provider reel, ce qu'il ne fait
    // jamais). "OPERATOR_ATTESTED_LLM_DERIVED" signifie : le contenu
    // substantiel EST reellement calcule depuis un plannerOutput fourni
    // par l'operateur (jamais depuis un gabarit MONO-08), sans que cela
    // constitue une verification independante que l'appel LLM sous-jacent
    // a reellement eu lieu (cela resterait une attestation operateur).
    provenanceClassification: mode === "REAL" ? "OPERATOR_ATTESTED_LLM_DERIVED" : "SYNTHETIC_FIXTURE",
    plannerRuns: mode === "REAL"
      ? [{ runId: "planner-" + idSuffix, date: realPlanner.date, provider: realPlanner.provider, model: realPlanner.model, promptVersion: realPlanner.promptVersion, missionId: missionId, inputHash: realPlanner.inputHash, rawResponseHash: realPlanner.rawResponseHash, evidenceProvenance: "OPERATOR_ATTESTED_LLM_CALL" }]
      : [{ runId: "planner-" + idSuffix, date: new Date().toISOString(), provider: "anthropic", model: "claude-sonnet-4-6", promptVersion: "EF01C1-search-planner-v2-compact", missionId: missionId, inputHash: "3".repeat(64), rawResponseHash: "4".repeat(64), evidenceProvenance: "SYNTHETIC_FIXTURE" }],
    // REMEDIATION R3 (M-02, mandat section 10) : lineage explicite
    // planner -> protocole, verifiable sans se fier uniquement au fait
    // que plannerRuns[0] est stocke dans le meme objet. plannerOutputHash
    // fait partie du contenu hashe par protocolHash (ci-dessous) : toute
    // modification de plannerOutput change donc mecaniquement protocolHash
    // (M02-07/M02-08) — protocolHash joue ainsi le role du "searchProtocolHash"
    // du mandat, jamais duplique sous un second nom.
    causalLineage: mode === "REAL"
      ? { plannerRunRef: "planner-" + idSuffix, plannerInputHash: realPlanner.inputHash, plannerRawResponseHash: realPlanner.rawResponseHash, plannerOutputHash: plannerOutputHash, derivationMethod: "buildSearchProtocolFromPlannerOutput (MONO-08, deterministe, jamais un gabarit fige)" }
      : { plannerRunRef: "planner-" + idSuffix, plannerInputHash: null, plannerRawResponseHash: null, plannerOutputHash: null, derivationMethod: "SYNTHETIC_FIXTURE (aucune derivation causale revendiquee)" },
  };
  const protocolHash = await sha256LikeRealSearchProtocol(protoBase);
  return Object.assign({}, protoBase, { protocolHash: protocolHash });
}

/**
 * buildOpenAlexConnectorRunner(deps, sourceId, fetchImpl) — REMEDIATION R4
 * (F-03) :
 *   1. genId() genere desormais un id UNIQUE par source reellement
 *      retrouvee ("sourceId-1", "sourceId-2", ...), jamais le meme
 *      sourceId fixe repete pour chaque resultat (avant R4 : un seul id
 *      constant, qui aurait rendu plusieurs sources reelles indiscernables
 *      les unes des autres dans ScreeningArtifact).
 *   2. Le runner retourne est MEMOISE (Promise mise en cache des le
 *      premier appel) : MONO-08 execute desormais REELLEMENT la
 *      recuperation EF-01C2 en amont (voir executeActiveConnectorsRetrieval)
 *      pour construire un ScreeningArtifact honnetement derive du
 *      resultat reel — le noeud EF-01C2 du graphe (MONO-02, gele),
 *      execute plus tard dans le MEME processus avec cette MEME instance
 *      de connectorRunner, reutilise alors EXACTEMENT ce resultat deja
 *      obtenu : jamais un second appel reseau reel, jamais un second jeu
 *      de resultats (et donc d'ids) incoherent avec celui deja utilise
 *      pour construire ScreeningArtifact. Sur une reprise apres
 *      redemarrage (nouveau processus), rehydrateRealMissionRun
 *      reconstruit un connectorRunner FRAIS (jamais celui-ci, jamais
 *      persiste) — sans impact : un noeud EF-01C2 deja termine ne rappelle
 *      jamais son runner (idempotence du checkpoint EF-01C2, MONO-01, gele).
 */
function buildOpenAlexConnectorRunner(deps, sourceId, fetchImpl) {
  const createOpenAlexRunner = deps.createOpenAlexRunner;
  let counter = 0;
  const rawRunner = createOpenAlexRunner({
    fetchImpl: fetchImpl,
    genId: function () { counter += 1; return sourceId + "-" + counter; },
    nowIso: function () { return new Date().toISOString(); },
  });
  let cachedCall = null;
  return function memoizedOpenAlexRunner(connector, protocol) {
    if (!cachedCall) cachedCall = rawRunner(connector, protocol);
    return cachedCall;
  };
}

/**
 * executeActiveConnectorsRetrieval(connectorRunners, searchProtocol) —
 * REMEDIATION R4 (F-03) : execute REELLEMENT la recuperation EF-01C2 pour
 * chaque connecteur actif du SearchProtocol (meme logique d'agregation
 * que l'executeur EF-01C2 gele, jamais reimplementee differemment —
 * MONO-01/dependencies/ef-orch-ef01c2-executor-v0.1.js, Passe 2), AVANT
 * la construction de ScreeningArtifact. Fail-closed si un connecteur actif
 * n'a aucun runner disponible : jamais un ScreeningArtifact construit sans
 * resultat retrieval reel derriere.
 */
async function executeActiveConnectorsRetrieval(connectorRunners, searchProtocol) {
  const activeConnectors = (searchProtocol.sourcesActivees || []).filter(function (c) { return c && c.active !== false; });
  let allSources = [];
  const allLogs = [];
  // REMEDIATION R5 (F-03/RetrievalSnapshot) : conserve AUSSI le resultat
  // BRUT par connecteur (jamais seulement l'agregat) — necessaire pour
  // qu'un RetrievalSnapshot persiste puisse etre REJOUE plus tard
  // (buildReplayConnectorRunners(), lib/real-screening-workflow.js) sans
  // jamais reconstruire une forme approximee a partir de l'agregat.
  const byConnector = {};
  for (const c of activeConnectors) {
    const runner = connectorRunners && connectorRunners[c.connectorId];
    if (typeof runner !== "function") {
      throw operatorInputRequired("executeActiveConnectorsRetrieval: aucun connectorRunner disponible pour le connecteur actif \"" + c.connectorId + "\" — impossible de construire un ScreeningArtifact honnete sans resultat retrieval reel.");
    }
    const result = await runner(c, searchProtocol);
    const sourcesTrouvees = Array.isArray(result && result.sourcesTrouvees) ? result.sourcesTrouvees : [];
    const log = (result && result.log) || null;
    byConnector[c.connectorId] = { sourcesTrouvees: sourcesTrouvees, log: log };
    allSources = allSources.concat(sourcesTrouvees);
    if (log) allLogs.push(log);
  }
  return { sourcesTrouvees: allSources, executionLog: allLogs, byConnector: byConnector };
}

/**
 * buildReplayConnectorRunners(byConnector) — REMEDIATION R5 (no-refetch
 * guarantee). Reconstruit un objet `connectorRunners` dont chaque
 * fonction REJOUE exactement le resultat deja persiste dans un
 * RetrievalSnapshot (`byConnector`, produit par
 * executeActiveConnectorsRetrieval ci-dessus) — AUCUN `fetchImpl`
 * implique, AUCUN appel reseau possible par construction (la fonction
 * retournee n'accepte/n'utilise meme pas d'implementation fetch). Utilise
 * par resumeRealScreening() pour que le noeud EF-01C2 du graphe (execute
 * par le moteur MONO-02 gele lors de la reprise) obtienne le MEME
 * resultat que celui deja utilise pour construire le ScreeningArtifact
 * depuis le snapshot — jamais un second retrieval, meme dans un
 * processus different de celui qui a produit le snapshot.
 */
function buildReplayConnectorRunners(byConnector) {
  const runners = {};
  Object.keys(byConnector || {}).forEach(function (connectorId) {
    const recorded = byConnector[connectorId];
    runners[connectorId] = function replayConnectorRunner() {
      return Promise.resolve({ sourcesTrouvees: recorded.sourcesTrouvees, log: recorded.log });
    };
  });
  return runners;
}

function classifyRetrievalField(v) {
  return isNonEmptyStr(v) ? "RETRIEVAL_DERIVED" : "NOT_AVAILABLE";
}

/**
 * buildScreeningArtifactForMission(deps, retrievalRecords, protocolHash, provenance)
 * — REMEDIATION R4 (F-03). `retrievalRecords` = le tableau REEL
 * `sourcesTrouvees` retourne par executeActiveConnectorsRetrieval (chaque
 * entree porte exactement la forme produite par le runner EF-01C2 reel :
 * id/titre/auteurOuOrganisme/date/reference/discipline/theme/provenance/
 * dateConsultation — jamais une liste de sourceId synthetiques). Chaque
 * champ documentaire est copie TEL QUEL depuis le retrieval reel s'il est
 * present, jamais fabrique : absent => `null` + `fieldProvenance` =
 * "NOT_AVAILABLE" (jamais un placeholder du type "Source "+id). Le contrat
 * gele EF-01D (assertScreeningArtifactComplete) ne verifie JAMAIS le
 * contenu de ces champs documentaires (verifie par inspection directe du
 * contrat) — cette classification est donc une amelioration epistemique
 * additive, jamais une violation du contrat gele.
 */
async function buildScreeningArtifactForMission(deps, retrievalRecords, protocolHash, provenance) {
  const mode = resolveMode(provenance);
  const realDecisions = provenance && provenance.auditDecisions; // objet { [record.id]: { acteur:"human", date, decision, justification, ... } }
  const retrievalResultHash = (provenance && provenance.retrievalResultHash) || null;
  const records = Array.isArray(retrievalRecords) ? retrievalRecords : [];
  if (mode === "REAL") {
    const missing = records.filter(function (r) { return !realDecisions || !realDecisions[r.id]; }).map(function (r) { return r.id; });
    if (missing.length) {
      throw operatorInputRequired(
        "ScreeningArtifact (EF-01D) requiert une decision humaine REELLE pour chaque source RETROUVEE par EF-01C2 (manquante(s) : " + missing.join(", ") +
        ") — jamais d'acteur=\"human\" invente en mode REAL."
      );
    }
    records.forEach(function (r) {
      if (validateRealAuditDecisionFields(realDecisions[r.id])) {
        throw operatorInputRequired("ScreeningArtifact: decision reelle fournie pour \"" + r.id + "\" incomplete ou invalide (acteur=\"human\", justification, date, decision requis).");
      }
    });
  }
  const sources = [];
  for (const rec of records) {
    const real = mode === "REAL" ? realDecisions[rec.id] : null;
    const sourceRecordHash = await deps.sha256CanonicalJson(rec);
    sources.push({
      id: rec.id,
      titre: isNonEmptyStr(rec.titre) ? rec.titre : null,
      auteurOuOrganisme: isNonEmptyStr(rec.auteurOuOrganisme) ? rec.auteurOuOrganisme : null,
      date: isNonEmptyStr(rec.date) ? rec.date : null,
      reference: isNonEmptyStr(rec.reference) ? rec.reference : null,
      discipline: isNonEmptyStr(rec.discipline) ? rec.discipline : null,
      theme: isNonEmptyStr(rec.theme) ? rec.theme : null,
      provenance: {
        connectorId: (rec.provenance && rec.provenance.connectorId) || null,
        connectorType: (rec.provenance && rec.provenance.connectorType) || null,
        retrievalMethod: (rec.provenance && rec.provenance.retrievalMethod) || null,
        originalReference: (rec.provenance && rec.provenance.originalReference) || null,
      },
      qualification: null, dependancesConnues: [],
      extraitUtilise: isNonEmptyStr(rec.extraitUtilise) ? rec.extraitUtilise : "",
      dateConsultation: rec.dateConsultation || new Date().toISOString(),
      statutScreening: real ? real.decision : "inclus",
      motifExclusion: real && (real.decision === "exclu" || real.decision === "doublon") ? real.justification : "",
      screeningDecisionRef: "dec-" + rec.id,
      // REMEDIATION R4 (F-03, mandat section 11) : classification EXPLICITE
      // de la provenance de chaque champ documentaire — jamais un schema
      // rempli silencieusement par defaut.
      fieldProvenance: {
        titre: classifyRetrievalField(rec.titre), auteurOuOrganisme: classifyRetrievalField(rec.auteurOuOrganisme),
        date: classifyRetrievalField(rec.date), reference: classifyRetrievalField(rec.reference),
        discipline: classifyRetrievalField(rec.discipline), theme: classifyRetrievalField(rec.theme),
      },
      // REMEDIATION R4 (F-03, mandat section 13) : lineage R->S explicite —
      // de quel resultat retrieval precis (et de quel enregistrement exact
      // en son sein) provient cette source de screening, sans inference.
      lineage: { retrievalResultHash: retrievalResultHash, sourceRecordHash: sourceRecordHash },
    });
  }
  return {
    evidenceProvenance: mode === "REAL" ? "OPERATOR_ATTESTED_HUMAN_ACTION" : "SYNTHETIC_FIXTURE",
    sourcesScreening: sources,
    auditDecisions: sources.map(function (s) {
      const real = mode === "REAL" ? realDecisions[s.id] : null;
      return {
        decisionId: s.screeningDecisionRef, typeDecision: "screening_inclusion", date: real ? real.date : new Date().toISOString(), acteur: "human",
        modelProvider: null, modelId: null, promptVersion: null, protocolRef: protocolHash, inputSourceRef: s.id,
        decision: real ? real.decision : "inclus", justification: real ? real.justification : "Pertinent (MONO-08).",
        confidenceQualitative: real ? (real.confidenceQualitative || "humaine") : "humaine",
        humanOverride: real ? (real.humanOverride || null) : null,
        evidenceProvenance: mode === "REAL" ? "OPERATOR_ATTESTED_HUMAN_ACTION" : "SYNTHETIC_FIXTURE",
      };
    }),
    completedAt: new Date().toISOString(),
  };
}

function buildQualificationArtifactForMission(deps, screeningArtifact, searchProtocol) {
  const generateQualificationTestArtifact = deps.generateQualificationTestArtifact;
  const ef01dOutputApprox = Object.assign({}, screeningArtifact, { stage: "EF-01D", searchProtocol: searchProtocol });
  return Object.assign({}, generateQualificationTestArtifact(ef01dOutputApprox, { nowIso: function () { return new Date().toISOString(); } }), { completedAt: new Date().toISOString() });
}

function buildEF01AInjectedForMission(missionId, documentBytesByHash, mission) {
  const targetDocuments = mission.targetDocuments.map(function () {
    return { id: "doc-" + Math.random().toString(36).slice(2, 8), ajouteLe: new Date().toISOString() };
  });
  return { metadata: { missionId: missionId, dateCreation: new Date().toISOString(), documents: { targetDocuments: targetDocuments, suppliedEvidence: [] } }, documentBytes: documentBytesByHash };
}

function buildEF01FInjectedForMission(idSuffix) {
  return { corpusId: "corpus-" + idSuffix, dateGel: new Date().toISOString(), completedAt: new Date().toISOString() };
}

module.exports = {
  loadEForchDeps: loadEForchDeps,
  buildConfirmedRunContractForMission: buildConfirmedRunContractForMission,
  buildResolverTraceForMission: buildResolverTraceForMission,
  buildSearchProtocolForMission: buildSearchProtocolForMission,
  buildOpenAlexConnectorRunner: buildOpenAlexConnectorRunner,
  buildScreeningArtifactForMission: buildScreeningArtifactForMission,
  buildQualificationArtifactForMission: buildQualificationArtifactForMission,
  buildEF01AInjectedForMission: buildEF01AInjectedForMission,
  buildEF01FInjectedForMission: buildEF01FInjectedForMission,
  validateRealEForchProvenance: validateRealEForchProvenance,
  validatePreRetrievalProvenance: validatePreRetrievalProvenance,
  validateRealResolverRunFields: validateRealResolverRunFields,
  validateRealPlannerRunFields: validateRealPlannerRunFields,
  validateRealAuditDecisionFields: validateRealAuditDecisionFields,
  validateRealHumanValidationFields: validateRealHumanValidationFields,
  validatePostRetrievalAuditDecisions: validatePostRetrievalAuditDecisions,
  validateRealPlannerOutputFields: validateRealPlannerOutputFields,
  buildSearchProtocolFromPlannerOutput: buildSearchProtocolFromPlannerOutput,
  executeActiveConnectorsRetrieval: executeActiveConnectorsRetrieval,
  buildReplayConnectorRunners: buildReplayConnectorRunners,
};
