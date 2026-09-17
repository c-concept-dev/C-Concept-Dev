"use strict";
/**
 * MONO-10 v0.11 — core/operator-llm-capability-boundary.js   (§45, §46, §47, §48)
 *
 * FERMETURE v0.5 B13.
 *
 * En v0.5, `runActiveProbe(config, transport, ctx)` recevait le transport EN
 * PARAMETRE. Un transport fabrique localement, sous un run de production
 * authentifie, produisait `AVAILABLE` et `usable = true` sans toucher le reseau :
 * la fonction qui prouvait le succes etait fournie par celui qu'elle devait
 * convaincre.
 *
 * v0.6 : le transport de PRODUCTION est une CAPACITE PROVISIONNEE par
 * l'exploitant. L'appelant declare son INTENTION (fournisseur, modele, worker
 * attendus) ; il ne fournit pas le transport.
 *
 * §47 — en TEST, un transport local reste autorise, mais l'artefact porte
 * `executionMode = TEST` et ne peut jamais valoir preuve de production.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const AD = require("./authority-descriptor.js");

const LLM_BRAND = new WeakSet();
const DESCRIPTORS = new WeakMap();
/** §4/§11 (v0.10) — registre des sondes REELLEMENT executees. */
/**
 * §3/§4/§5/§8 (v0.11) — FERMETURE B10-01.
 *
 * v0.10 inscrivait la decision de sonde AVANT que l'artefact de capacite
 * n'existe : le sujet ne portait donc aucun `artifactHash`, et `verifyDecision`
 * ne comparait que `requestId` et le run. L'audit A a montre qu'une seule sonde
 * legitime certifiait quatre artefacts differents, y compris avec un
 * fournisseur, un modele et un worker HORS LISTE BLANCHE.
 *
 * v0.11 inscrit en DEUX TEMPS :
 *
 *   1. `recordProbe(subject, result)` conserve le sujet REELLEMENT sonde dans
 *      un registre de sondes prive, et rend une `probeRef`. Ce n'est pas encore
 *      une decision certifiante : rien n'a encore ete certifie.
 *   2. `certifyProbedArtifact({probeRef, artifactId, artifactHash, subject})`
 *      compare champ par champ le sujet RECONSTRUIT DEPUIS L'ARTEFACT au sujet
 *      reellement sonde, re-applique la liste blanche de l'exploitant, puis
 *      inscrit la DECISION — celle-ci portant `artifactId`, `artifactHash` et
 *      `decisionSubjectHash`.
 *
 * Une decision reelle ne suffit pas si elle ne lie pas le sujet exact certifie.
 */
const SUBJECT_FIELDS = ["providerId", "modelId", "workerBindingId", "requestId", "runId", "missionHash"];

function canonicalSubject(x) {
  x = x || {};
  const out = {};
  SUBJECT_FIELDS.forEach(function (f) { out[f] = isNonEmptyStr(x[f]) ? x[f] : null; });
  return Object.freeze(out);
}

function attachProbeLedger(b, descriptor) {
  const probes = new Map();      // probeRef  -> sujet REELLEMENT sonde
  const ledger = new Map();      // derivationRef -> decision certifiante
  const extra = {
    /**
     * Appele par le deroulement REEL de la sonde, jamais par l'appelant.
     * N'emet AUCUNE capacite : consigne seulement ce qui a ete sonde.
     */
    recordProbe(subject, result) {
      const canon = canonicalSubject(subject);
      const record = Object.freeze({ subject: canon, result: Object.freeze(Object.assign({}, result)),
        probeTimestamp: (subject && subject.probeTimestamp) || null,
        executionMode: descriptor.executionMode, probedAt: new Date().toISOString() });
      const ref = "probe:" + sha256Of(record).slice(0, 40);
      /** §8 — `consumedBy` : une sonde ne certifie qu'UN artefact. */
      probes.set(ref, { record: record, consumedBy: null });
      return { probeRef: ref, record: record };
    },

    /**
     * §6 — le sujet ATTENDU est reconstruit depuis l'artefact a certifier, et
     * doit correspondre EXACTEMENT au sujet sonde. Toute reetiquette de
     * fournisseur, modele, worker, run ou mission fait echouer la comparaison.
     */
    /**
     * §9 (v0.11) — controle LECTURE SEULE du sujet, disponible dans TOUS les
     * espaces. Il n'inscrit aucune decision et n'emet aucune capacite : il
     * repond seulement "cet artefact decrit-il ce qui a ete reellement sonde ?".
     * `assertCapabilityUsable` s'en sert meme hors PRODUCTION, ou aucune
     * capacite n'est emise mais ou une capacite fabriquee ne doit pas passer.
     */
    verifyProbedSubject(input) {
      input = input || {};
      const slot = probes.get(input.probeRef);
      const rec = slot && slot.record;
      if (!rec) return { matches: false, problems: ["reference de sonde absente du registre de l'emetteur"] };
      if (slot.consumedBy && (slot.consumedBy.artifactId !== input.artifactId
          || slot.consumedBy.artifactHash !== input.artifactHash)) {
        return { matches: false, problems: ["LLM_PROBE_ALREADY_CONSUMED : cette sonde a deja certifie l'artefact \""
          + slot.consumedBy.artifactId + "\" ; une sonde ne vaut que pour UN artefact"] };
      }
      if (!rec.result || rec.result.status !== "AVAILABLE") {
        return { matches: false, problems: ["la sonde enregistree n'a pas abouti"] };
      }
      const asked = canonicalSubject(input.subject);
      const diffs = [];
      SUBJECT_FIELDS.forEach(function (f) {
        if (asked[f] !== rec.subject[f]) {
          diffs.push(f + " : l'artefact declare " + JSON.stringify(asked[f])
            + " alors que la sonde a porte sur " + JSON.stringify(rec.subject[f]));
        }
      });
      if (diffs.length) return { matches: false, problems: ["LLM_SUBJECT_MISMATCH : " + diffs.join(" ; ")] };
      const deny = (typeof b.allowlistDenials === "function") ? b.allowlistDenials(asked) : [];
      if (deny.length) return { matches: false, problems: ["LLM_SUBJECT_OUT_OF_ALLOWLIST : " + deny.join(" ; ")] };
      return { matches: true, problems: [], subject: rec.subject };
    },

    certifyProbedArtifact(input) {
      input = input || {};
      const slot = probes.get(input.probeRef);
      const rec = slot && slot.record;
      if (!rec) {
        return { certified: false, derivationRef: null,
          problems: ["reference de sonde absente du registre de l'emetteur : une capacite non sondee n'existe pas"] };
      }
      /**
       * §4/§8 (v0.11) — UNICITE. Une decision portant sur l'artefact A ne peut
       * jamais certifier l'artefact B. v0.11 sans cette regle laissait une
       * sonde unique certifier plusieurs artefacts distincts partageant le meme
       * sujet sonde (B10-01-D). La re-certification du MEME artefact, a contenu
       * identique, reste idempotente.
       */
      if (slot.consumedBy && (slot.consumedBy.artifactId !== input.artifactId
          || slot.consumedBy.artifactHash !== input.artifactHash)) {
        return { certified: false, derivationRef: null,
          problems: ["LLM_PROBE_ALREADY_CONSUMED : cette sonde a deja certifie l'artefact \""
            + slot.consumedBy.artifactId + "\" (empreinte " + String(slot.consumedBy.artifactHash).slice(0, 12)
            + ") ; une sonde ne vaut que pour UN artefact"] };
      }
      if (!rec.result || rec.result.status !== "AVAILABLE") {
        return { certified: false, derivationRef: null, problems: ["la sonde enregistree n'a pas abouti"] };
      }
      const asked = canonicalSubject(input.subject);
      const diffs = [];
      SUBJECT_FIELDS.forEach(function (f) {
        if (asked[f] !== rec.subject[f]) {
          diffs.push(f + " : l'artefact declare " + JSON.stringify(asked[f])
            + " alors que la sonde a porte sur " + JSON.stringify(rec.subject[f]));
        }
      });
      if (diffs.length) {
        return { certified: false, derivationRef: null,
          problems: ["LLM_SUBJECT_MISMATCH : une decision reelle ne certifie que le sujet reellement sonde — "
            + diffs.join(" ; ")] };
      }
      if (!isNonEmptyStr(input.artifactId) || !isNonEmptyStr(input.artifactHash)) {
        return { certified: false, derivationRef: null,
          problems: ["artefact non identifie : une decision LLM engage artifactId et artifactHash"] };
      }
      /** §7 — la liste blanche est RE-APPLIQUEE a la certification. */
      const deny = (typeof b.allowlistDenials === "function") ? b.allowlistDenials(asked) : [];
      if (deny.length) {
        return { certified: false, derivationRef: null,
          problems: ["LLM_SUBJECT_OUT_OF_ALLOWLIST : " + deny.join(" ; ")] };
      }
      const subject = Object.freeze(Object.assign({}, rec.subject,
        { artifactId: input.artifactId, artifactHash: input.artifactHash }));
      const decisionSubjectHash = sha256Of({ subject: subject, executionMode: descriptor.executionMode,
        operatorBoundaryId: descriptor.operatorBoundaryId, configBindingHash: descriptor.configBindingHash });
      const decision = Object.freeze({
        schema: "EvidenceForge.IssuerDecision", schemaVersion: "MONO-10-v11",
        decisionKind: "LLM_PROBE_EXECUTION",
        issuerAuthorityId: descriptor.authorityId, issuerAuthorityKind: descriptor.authorityKind,
        operatorBoundaryId: descriptor.operatorBoundaryId, configBindingHash: descriptor.configBindingHash,
        executionMode: descriptor.executionMode, issuerGeneration: descriptor.issuerGeneration,
        subject: subject, decisionSubjectHash: decisionSubjectHash,
        result: Object.freeze(Object.assign({}, rec.result)),
        probeRef: input.probeRef, decidedAt: new Date().toISOString(),
      });
      const ref = "decision:llm_probe_execution:" + sha256Of(decision).slice(0, 40);
      ledger.set(ref, decision);
      slot.consumedBy = { artifactId: input.artifactId, artifactHash: input.artifactHash, derivationRef: ref };
      return { certified: true, derivationRef: ref, decision: decision, problems: [] };
    },

    /**
     * §5 — comparaison du SUJET COMPLET. Aucune dimension autoritaire n'est
     * facultative : une attente absente est un refus, pas une dispense.
     */
    verifyDecision(derivationRef, expectations) {
      const e = expectations || {};
      const d = ledger.get(derivationRef);
      if (!d) return { valid: false, problems: ["derivation absente du registre de decisions — "
        + "une capacite LLM non sondee, ou sondee sur un autre sujet, n'existe pas"] };
      const problems = [];
      if (isNonEmptyStr(e.decisionKind) && d.decisionKind !== e.decisionKind) problems.push("genre de decision different");
      const REQUIRED = ["providerId", "modelId", "workerBindingId", "artifactId", "artifactHash", "runId", "missionHash"];
      REQUIRED.forEach(function (f) {
        if (!isNonEmptyStr(e[f])) { problems.push("attente \"" + f + "\" absente — comparaison impossible, refus"); return; }
        if (d.subject[f] !== e[f]) problems.push(f + " different (" + String(e[f]).slice(0, 40) + ")");
      });
      if (isNonEmptyStr(e.requestId) && d.subject.requestId !== e.requestId) problems.push("sonde differente");
      if (!isNonEmptyStr(e.executionMode)) problems.push("attente \"executionMode\" absente — refus");
      else if (d.executionMode !== e.executionMode) problems.push("mode d'execution different");
      if (isNonEmptyStr(e.decisionSubjectHash) && d.decisionSubjectHash !== e.decisionSubjectHash) problems.push("empreinte de sujet differente");
      if (d.result.status !== "AVAILABLE") problems.push("la sonde enregistree n'a pas abouti");
      return { valid: problems.length === 0, problems: problems, decision: d };
    },
  };
  return Object.freeze(Object.assign({}, b, extra));
}
/**
 * FERMETURE B04 (v0.8). `createOperatorLlmCapabilityBoundary({ transportModuleRef })`
 * etait public et rendait un objet de namespace PRODUCTION : l'appelant
 * obtenait donc PRODUCTION_LLM_CAPABILITY depuis un fichier a lui.
 */
function isProvisionedLlmBoundary(b, expected) {
  if (!b || !LLM_BRAND.has(b)) return false;
  const d = DESCRIPTORS.get(b);
  if (!d) return false;
  // §4 (v0.9) — l'identite est COMPOSITE : identifiant declare + liaison de
  // configuration + espace d'execution. Un identifiant seul est declaratif.
  if (expected && (isNonEmptyStr(expected.operatorBoundaryId) || isNonEmptyStr(expected.configBindingHash))) {
    if (!isNonEmptyStr(expected.configBindingHash)) return false;   // fail closed
    if (!AD.sameBoundary(d, expected)) return false;
  }
  if (expected && expected.requireProduction === true && d.executionMode !== "PRODUCTION") return false;
  return true;
}
function descriptorOf(b) { return DESCRIPTORS.get(b) || null; }
function brand(b) { LLM_BRAND.add(b); return Object.freeze(b); }

/**
 * createTestLlmCapabilityBoundary({ transport, boundaryId })
 * Reserve a l'espace TEST. Le transport local est accepte ICI, et l'artefact
 * produit portera executionMode = TEST.
 */
function buildTestBoundary(input) {
  input = input || {};
  if (typeof input.transport !== "function") throw fail("LLM_BOUNDARY_INVALID", "transport de test requis.");
  const transport = input.transport;
  return brand({
    boundaryKind: "EvidenceForge.OperatorLlmCapabilityBoundary", schemaVersion: "MONO-10-v6",
    namespace: "TEST", provisionedFrom: "IN_PROCESS_TEST",
    llmBoundaryId: "olb-test-" + sha256Of({ id: input.boundaryId || "test" }).slice(0, 16),
    async probe(intent) { return transport(intent); },
  });
}

/**
 * createOperatorLlmCapabilityBoundary(cfg)
 * cfg.transportModuleRef : chemin d'un module de transport PROVISIONNE par
 *   l'exploitant, hors de l'espace d'appel. Il est charge ICI, jamais reçu.
 * cfg.allowedProviders / allowedModels / allowedWorkers : ce que l'exploitant
 *   autorise. Une intention hors de ces listes est refusee.
 */
function buildOperatorBoundary(cfg) {
  cfg = cfg || {};
  if (!isNonEmptyStr(cfg.transportModuleRef)) {
    throw fail("LLM_BOUNDARY_NOT_PROVISIONED",
      "aucun transport de production provisionne : EvidenceForge ne fabrique pas la preuve de sa propre capacite — fail closed.");
  }
  let mod;
  try { mod = require(cfg.transportModuleRef); }
  catch (e) { throw fail("LLM_BOUNDARY_UNLOADABLE", "transport de production illisible (" + cfg.transportModuleRef + ") : " + ((e && e.message) || e)); }
  if (!mod || typeof mod.probe !== "function") throw fail("LLM_BOUNDARY_INVALID", "le module de transport doit exposer probe().");
  const allowed = {
    providers: Array.isArray(cfg.allowedProviders) ? cfg.allowedProviders.slice() : null,
    models: Array.isArray(cfg.allowedModels) ? cfg.allowedModels.slice() : null,
    workers: Array.isArray(cfg.allowedWorkers) ? cfg.allowedWorkers.slice() : null,
  };
  return brand({
    boundaryKind: "EvidenceForge.OperatorLlmCapabilityBoundary", schemaVersion: "MONO-10-v6",
    namespace: "PRODUCTION", provisionedFrom: "ENVIRONMENT",
    llmBoundaryId: "olb-prod-" + sha256Of({ m: cfg.transportModuleRef, a: allowed }).slice(0, 16),
    transportRefHash: sha256Of({ m: cfg.transportModuleRef }),
    /**
     * §7 (v0.11) — la liste blanche est INTERROGEABLE par l'emetteur au moment
     * de certifier, pas seulement au moment de sonder. Une sonde legitime sur
     * un sujet autorise ne doit jamais servir a certifier un sujet interdit.
     */
    allowlistDenials(intent) {
      intent = intent || {};
      const deny = [];
      if (allowed.providers && allowed.providers.indexOf(intent.providerId) === -1) deny.push("fournisseur \"" + intent.providerId + "\" non autorise par l'exploitant");
      if (allowed.models && allowed.models.indexOf(intent.modelId) === -1) deny.push("modele \"" + intent.modelId + "\" non autorise par l'exploitant");
      if (allowed.workers && allowed.workers.indexOf(intent.workerBindingId) === -1) deny.push("worker \"" + intent.workerBindingId + "\" non autorise par l'exploitant");
      return deny;
    },
    async probe(intent) {
      intent = intent || {};
      const deny = [];
      if (allowed.providers && allowed.providers.indexOf(intent.providerId) === -1) deny.push("fournisseur \"" + intent.providerId + "\" non autorise par l'exploitant");
      if (allowed.models && allowed.models.indexOf(intent.modelId) === -1) deny.push("modele \"" + intent.modelId + "\" non autorise par l'exploitant");
      if (allowed.workers && allowed.workers.indexOf(intent.workerBindingId) === -1) deny.push("worker \"" + intent.workerBindingId + "\" non autorise par l'exploitant");
      if (deny.length) return { httpStatus: 0, denied: true, denyReasons: deny };
      return mod.probe(intent);
    },
  });
}

/** createFromBoundary(issuance, cfg) — le seul chemin ; la reference de
 * transport vient de la configuration DEJA CHARGEE par la frontiere. */
function createFromBoundary(issuance, cfg) {
  const OTB = require("./operator-trust-boundary.js");
  if (!OTB.isBoundaryIssuanceHandle(issuance)) {
    throw fail("AUTHORITY_ISSUER_NOT_BOUNDARY",
      "une frontiere de capacite LLM ne se construit que depuis une OperatorTrustBoundary provisionnee.");
  }
  cfg = cfg || {};
  const ref = issuance.operatorConfigPaths.llmTransportModuleRef;
  if (!isNonEmptyStr(ref)) throw fail("LLM_BOUNDARY_CONFIG_INVALID", "la configuration de l'exploitant ne declare aucun transportModuleRef.");
  let b;
  if (cfg.kind === "OPERATOR_TRANSPORT") {
    b = buildOperatorBoundary({ transportModuleRef: ref, allowedProviders: cfg.allowedProviders,
      allowedModels: cfg.allowedModels, allowedWorkers: cfg.allowedWorkers });
  } else if (cfg.kind === "TEST_TRANSPORT") {
    if (issuance.namespace !== "TEST") throw fail("LLM_BOUNDARY_INSUFFICIENT", "un transport de test ne prouve aucune capacite hors TEST.");
    b = buildTestBoundary({ transportModuleRef: null, transport: require(ref).probe,
      boundaryId: issuance.operatorBoundaryId, allowedProviders: cfg.allowedProviders,
      allowedModels: cfg.allowedModels, allowedWorkers: cfg.allowedWorkers });
  } else {
    throw fail("LLM_BOUNDARY_CONFIG_INVALID", "genre de frontiere de capacite LLM inconnu.");
  }
  const descriptor = AD.makeAuthorityDescriptor(issuance, AD.KIND.LLM_CAPABILITY, { kind: cfg.kind });
  const withLedger = attachProbeLedger(b, descriptor);
  LLM_BRAND.add(withLedger);
  DESCRIPTORS.set(withLedger, descriptor);
  return withLedger;
}

/** §14 — fabrique de TEST explicite. */
function createTestLlmCapabilityAuthority(input) {
  input = input || {};
  const pseudo = Object.freeze({ operatorBoundaryId: "otb-test-inprocess:" + sha256Of({ b: input.boundaryId || "test" }).slice(0, 12),
    namespace: "TEST", provisionedFrom: "IN_PROCESS_TEST",
    configBindingHash: sha256Of({ inProcess: true }), issuerGeneration: "test", operatorConfigPaths: {} });
  const b = buildTestBoundary(input);
  const descriptor = AD.makeAuthorityDescriptor(pseudo, AD.KIND.LLM_CAPABILITY, { kind: "TEST_TRANSPORT" });
  const withLedger = attachProbeLedger(b, descriptor);
  LLM_BRAND.add(withLedger);
  DESCRIPTORS.set(withLedger, descriptor);
  return withLedger;
}

module.exports = { createFromBoundary, createTestLlmCapabilityAuthority, isProvisionedLlmBoundary, descriptorOf };
