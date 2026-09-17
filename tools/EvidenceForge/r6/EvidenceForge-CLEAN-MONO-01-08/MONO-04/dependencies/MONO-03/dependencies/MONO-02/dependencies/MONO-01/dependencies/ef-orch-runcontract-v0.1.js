// EvidenceForge — EF-ORCH — RunContract generator — v0.1
// Périmètre volontairement étroit : transforme les entrées utilisateur + la
// pré-analyse (déjà faite en amont, hors de ce fichier) en un
// EvidenceForge.RunContract / EF-ORCH-RC-v2, le valide, calcule son
// runContractHash. Aucun appel réseau, aucun retrieval, aucune orchestration
// générale — cf. EF-ORCH v0.2 §2 et §7 (V1).
"use strict";

const { canonicalJson, computeRunContractHash } = require("./ef-orch-hash-v0.1.js");

const SCHEMA = "EvidenceForge.RunContract";
const SCHEMA_VERSION = "EF-ORCH-RC-v2";

// Connecteurs qu'EvidenceForge sait effectivement appeler en V1 (cohérent avec
// EXECUTABLE_CONNECTORS déjà présent dans le vrai code d'EF-01C2 : openalex,
// crossref, pubmed uniquement). web_public n'est pas un "connecteur documentaire"
// au même sens, il est traité séparément via webPublicActive.
const KNOWN_ACADEMIC_CONNECTORS = Object.freeze(["openalex", "crossref", "pubmed"]);

// Heuristique volontairement simple et documentée pour activer pubmed : présence
// d'un vocabulaire biomédical dans une discipline retenue. Ce n'est pas un
// classifieur, juste une règle explicite et révisable — cohérent avec le principe
// "règle déterministe" plutôt que "décision IA silencieuse" pour ce choix.
const BIOMEDICAL_PATTERN = /m[ée]d(?:ecine|ical)|biom[ée]dic|clinique|patholog|physiolog|pharmac|sant[ée] publique|[ée]pid[ée]miolog/i;

const RETRIEVAL_POLICIES_PAR_NIVEAU = Object.freeze({
  rapide: Object.freeze({ maxPages: 1, maxResultsParConnecteur: 15, secondPass: false }),
  standard: Object.freeze({ maxPages: 2, maxResultsParConnecteur: 30, secondPass: "si_couverture_faible" }),
  approfondie: Object.freeze({ maxPages: 3, maxResultsParConnecteur: 60, secondPass: true })
});

function genId(prefix) {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function str(v) {
  return String(v == null ? "" : v).trim();
}

function normalizeForDedup(text) {
  return str(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Disciplines — cf. EF-ORCH v0.1 §2 : retenue automatiquement ssi justification
// non vide et non-duplicate d'une autre discipline déjà retenue ; en cas de
// recouvrement (justifications quasi identiques pour deux disciplines
// distinctes), les deux passent en "conflit" et une ambiguïté est signalée
// plutôt que de trancher en silence.
// ---------------------------------------------------------------------------
function resolveDisciplines(disciplinesProposeesInput) {
  const input = Array.isArray(disciplinesProposeesInput) ? disciplinesProposeesInput : [];
  const items = input.map((d) => ({
    id: str(d && d.id) || genId("disc"),
    discipline: str(d && d.discipline),
    justification: str(d && d.justification),
    sourcesIndicatives: Array.isArray(d && d.sourcesIndicatives) ? d.sourcesIndicatives.map(str).filter(Boolean) : [],
    statut: null
  })).filter((d) => d.discipline);

  const ambiguites = [];

  // groupement par justification normalisée non vide
  const byJustif = new Map();
  for (const it of items) {
    if (!it.justification) {
      it.statut = "rejetee_justification_vide";
      continue;
    }
    const key = normalizeForDedup(it.justification);
    if (!byJustif.has(key)) byJustif.set(key, []);
    byJustif.get(key).push(it);
  }

  for (const [, group] of byJustif) {
    const distinctDisciplines = [...new Set(group.map((g) => normalizeForDedup(g.discipline)))];
    if (distinctDisciplines.length > 1) {
      // même justification, disciplines différentes -> conflit, pas de tri silencieux
      group.forEach((g) => { g.statut = "conflit"; });
      ambiguites.push({
        id: genId("ambig"),
        type: "disciplines_justification_ambigue",
        message: "Plusieurs disciplines partagent une justification quasi identique — impossible de les distinguer automatiquement.",
        affectedItems: group.map((g) => g.id),
        requiresResolution: true
      });
    } else {
      // même discipline répétée avec la même justification : on garde la première occurrence, silencieusement (hygiène de saisie, pas une ambiguïté)
      group.forEach((g, i) => { g.statut = i === 0 ? "retenue" : "rejetee_doublon_saisie"; });
    }
  }

  const retenues = items.filter((d) => d.statut === "retenue");
  // Ne pas signaler "aucune discipline retenue" si l'absence de retenue s'explique
  // déjà par un conflit détecté ci-dessus : les deux ambiguïtés seraient redondantes
  // et résoudre le conflit ne suffirait alors plus jamais à débloquer la confirmation.
  if (retenues.length === 0 && ambiguites.length === 0) {
    ambiguites.push({
      id: genId("ambig"),
      type: "aucune_discipline_retenue",
      message: "Aucune discipline proposée n'a pu être retenue automatiquement.",
      affectedItems: items.map((d) => d.id),
      requiresResolution: true
    });
  }

  return { disciplinesProposees: items, ambiguites };
}

// ---------------------------------------------------------------------------
// Stratégie de recherche — connecteurs demandés / disponibles / actifs, et
// policies de retrieval par niveau (table fixe, EF-ORCH v0.1 §3). Ne construit
// aucune requête exacte : ça reste le rôle d'EF-01C1, hors périmètre ici.
// ---------------------------------------------------------------------------
function buildStrategieRecherche(disciplinesRetenues, connecteursDisponibles, webPublicActive, niveauRevue) {
  const available = Array.isArray(connecteursDisponibles) ? connecteursDisponibles.map(str).filter(Boolean) : [];

  const hasBiomedical = disciplinesRetenues.some((d) => BIOMEDICAL_PATTERN.test(d.discipline) || BIOMEDICAL_PATTERN.test(d.justification));

  const requested = ["openalex", "crossref"];
  if (hasBiomedical) requested.push("pubmed");
  if (webPublicActive) requested.push("web_public");

  const active = requested.filter((c) => available.includes(c) || c === "web_public"); // web_public n'est pas un connecteur académique soumis à disponibilité serveur
  const unavailable = requested.filter((c) => KNOWN_ACADEMIC_CONNECTORS.includes(c) && !available.includes(c));

  if (!RETRIEVAL_POLICIES_PAR_NIVEAU[niveauRevue]) {
    throw new Error("buildRunContractDraft: niveauRevue inconnu (\"" + niveauRevue + "\") — attendu rapide | standard | approfondie.");
  }

  return {
    requestedConnectors: requested,
    availableConnectors: available,
    activeConnectors: active,
    unavailableConnectors: unavailable,
    retrievalPoliciesParNiveau: RETRIEVAL_POLICIES_PAR_NIVEAU[niveauRevue]
  };
}

// ---------------------------------------------------------------------------
// buildRunContractDraft(inputs) -> RunContract non confirmé, non hashé
// ---------------------------------------------------------------------------
function buildRunContractDraft(inputs) {
  const {
    demandeBrute,
    missionReformulee,
    documentsDetectes,
    sourcesFournies,
    disciplinesProposees,
    connecteursDisponibles,
    niveauRevue,
    webPublicActive,
    governanceRef,
    criteresExclusionObjectifs
  } = inputs || {};

  if (!str(demandeBrute)) throw new Error("buildRunContractDraft: demandeBrute manquante.");
  if (!str(missionReformulee)) throw new Error("buildRunContractDraft: missionReformulee manquante — la pré-analyse doit être faite avant cette brique.");

  const documentsAudites = (Array.isArray(documentsDetectes) ? documentsDetectes : []).map((d) => ({
    nom: str(d && d.nom),
    type: str(d && d.type) || "inconnu",
    hashSha256: str(d && d.hashSha256)
  })).filter((d) => d.nom);

  const sourcesFourniesOut = (Array.isArray(sourcesFournies) ? sourcesFournies : []).map((d) => ({
    nom: str(d && d.nom),
    type: str(d && d.type) || "inconnu",
    hashSha256: str(d && d.hashSha256)
  })).filter((d) => d.nom);

  const missingHash = [...documentsAudites, ...sourcesFourniesOut].filter((d) => !d.hashSha256);
  const { disciplinesProposees: disciplinesOut, ambiguites: disciplineAmbiguites } = resolveDisciplines(disciplinesProposees);

  const ambiguitesSignalees = [...disciplineAmbiguites];
  if (missingHash.length) {
    ambiguitesSignalees.push({
      id: genId("ambig"),
      type: "document_sans_empreinte",
      message: "Au moins un document ou une source fournie n'a pas d'empreinte SHA-256 — intégrité non vérifiable.",
      affectedItems: missingHash.map((d) => d.nom),
      requiresResolution: false // signalé, mais ne bloque pas la confirmation : traçabilité d'un fait, pas une ambiguïté de décision
    });
  }

  const disciplinesRetenues = disciplinesOut.filter((d) => d.statut === "retenue");
  const strategieRecherche = buildStrategieRecherche(disciplinesRetenues, connecteursDisponibles, !!webPublicActive, niveauRevue);

  const draft = {
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    runId: genId("run"),
    createdAt: new Date().toISOString(),
    missionReformulee: str(missionReformulee),
    perimetre: {
      documentsAudites,
      sourcesFournies: sourcesFourniesOut,
      ambiguitesSignalees
    },
    disciplinesProposees: disciplinesOut,
    strategieRecherche,
    politiqueScreening: {
      // criteresExclusionObjectifs : INFORMATION MÉTHODOLOGIQUE INDICATIVE
      // destinée au screener humain (EF-01D), jamais exécutée automatiquement
      // par EF-ORCH. Vérifié après audit du vrai EF-01D : le screening réel
      // est intégralement humain, source par source, chaque décision
      // produisant un AuditDecision — aucune règle d'exclusion automatique
      // n'existe dans le module historique. Ce champ ne doit JAMAIS piloter
      // un statutScreening automatique ; le conserver descriptif seulement.
      criteresExclusionObjectifs: Array.isArray(criteresExclusionObjectifs) ? criteresExclusionObjectifs.map(str).filter(Boolean) : [],
      ambiguousTitleDuplicateThreshold: { status: "experimental", value: 0.15, effect: "runtime_decision_gate" }
    },
    niveauRevue: str(niveauRevue),
    webPublicActive: !!webPublicActive,
    humanConfirmation: null,
    governanceRef: governanceRef || null
  };

  // Garde-fou : ce brouillon ne doit contenir aucune donnée qui ne peut être
  // connue qu'après retrieval (taux de doublons observé, sources trouvées...).
  // On le vérifie ici plutôt que de faire confiance à la discipline du code :
  // canonicalJson lèverait de toute façon sur un undefined, mais on veut être
  // explicite sur l'absence de champs post-retrieval par construction.
  if ("sourcesTrouvees" in draft || "tauxDoublonsObserve" in draft) {
    throw new Error("buildRunContractDraft: invariant violé — donnée post-retrieval détectée dans le brouillon.");
  }

  return draft;
}

// ---------------------------------------------------------------------------
// confirmRunContract(draft, confirmation) -> RunContract confirmé, figé, hashé
// confirmation: { commentaire?, resolutions?: { [ambiguityId]: { decision, justification? } }, confirmedAt? }
// ---------------------------------------------------------------------------
async function confirmRunContract(draft, confirmation) {
  if (!draft || draft.schema !== SCHEMA || draft.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("confirmRunContract: brouillon non reconnu comme " + SCHEMA + "/" + SCHEMA_VERSION + ".");
  }
  if (draft.humanConfirmation !== null) {
    throw new Error("confirmRunContract: ce RunContract est déjà confirmé — créer un nouveau brouillon plutôt que de le reconfirmer.");
  }
  if (Object.prototype.hasOwnProperty.call(draft, "runContractHash")) {
    throw new Error("confirmRunContract: brouillon invalide — runContractHash ne doit pas exister avant confirmation.");
  }

  const conf = confirmation || {};
  const resolutions = conf.resolutions || {};

  const blocking = (draft.perimetre.ambiguitesSignalees || []).filter((a) => a.requiresResolution);
  const unresolved = blocking.filter((a) => !resolutions[a.id]);
  if (unresolved.length) {
    throw new Error(
      "confirmRunContract: confirmation refusée — ambiguïté(s) non résolue(s) : " +
      unresolved.map((a) => a.id + " (" + a.type + ")").join(", ")
    );
  }

  // On copie plutôt que de muter le brouillon reçu — le brouillon d'origine
  // reste utilisable/inspectable par l'appelant après l'appel.
  //
  // Cas spécifique et critique : une ambiguïté de type
  // "disciplines_justification_ambigue" (conflit entre disciplines) exige une
  // résolution STRUCTURÉE — disciplineDecisions: { [disciplineId]: "retenue"|"rejetee" }
  // couvrant EXACTEMENT les disciplines en conflit — jamais un simple texte
  // libre archivé sans effet. Sans ça, un run pourrait matérialiser plus tard
  // l'inverse exact d'une décision humaine confirmée (statut resté "conflit"
  // interprété par erreur comme rejet). La décision humaine doit changer
  // l'état, pas seulement être racontée à côté de lui.
  const disciplineFinalStatutById = {};
  for (const a of draft.perimetre.ambiguitesSignalees || []) {
    if (a.type !== "disciplines_justification_ambigue" || !a.requiresResolution) continue;
    const r = resolutions[a.id];
    const dd = r && r.disciplineDecisions;
    if (!dd || typeof dd !== "object") {
      throw new Error(
        "confirmRunContract: résolution de conflit \"" + a.id + "\" invalide — disciplineDecisions manquant. " +
        "Une résolution de conflit doit fournir { [disciplineId]: \"retenue\"|\"rejetee\" } pour chaque discipline affectée, jamais un texte libre seul."
      );
    }
    const providedIds = Object.keys(dd).sort();
    const expectedIds = [...a.affectedItems].sort();
    if (JSON.stringify(providedIds) !== JSON.stringify(expectedIds)) {
      throw new Error(
        "confirmRunContract: résolution de conflit \"" + a.id + "\" incomplète ou incohérente — " +
        "attendu une décision pour exactement [" + expectedIds.join(", ") + "], reçu [" + providedIds.join(", ") + "]."
      );
    }
    for (const [disciplineId, statut] of Object.entries(dd)) {
      if (statut !== "retenue" && statut !== "rejetee") {
        throw new Error("confirmRunContract: résolution de conflit \"" + a.id + "\" — statut invalide pour \"" + disciplineId + "\" (\"" + statut + "\"), attendu \"retenue\" ou \"rejetee\".");
      }
      disciplineFinalStatutById[disciplineId] = statut;
    }
  }

  const disciplinesProposeesResolues = draft.disciplinesProposees.map((d) =>
    disciplineFinalStatutById[d.id] ? { ...d, statut: disciplineFinalStatutById[d.id] } : d
  );

  // Garde-fou défensif : après confirmation, aucune discipline ne doit
  // pouvoir rester "conflit" — si c'était le cas, ce serait un bug de cette
  // fonction elle-même (une ambiguïté bloquante mal traitée), jamais une
  // situation à laisser passer silencieusement en aval.
  const stillConflicted = disciplinesProposeesResolues.filter((d) => d.statut === "conflit");
  if (stillConflicted.length) {
    throw new Error(
      "confirmRunContract: invariant violé — discipline(s) encore en \"conflit\" après confirmation (" +
      stillConflicted.map((d) => d.id).join(", ") + "). Ceci ne doit jamais arriver ; résolution de conflit mal appliquée."
    );
  }

  // Recalcul obligatoire de tout ce qui dépend des disciplines finales.
  // strategieRecherche a été calculée dans buildRunContractDraft() sur les
  // statuts PRÉ-confirmation (avant résolution des conflits) — une décision
  // humaine qui retient une discipline biomédicale en conflit doit pouvoir
  // faire apparaître pubmed dans les connecteurs demandés, jamais rester sur
  // la stratégie calculée avant que cette décision n'existe. Recalcul
  // systématique (pas seulement si un conflit a été résolu) pour ne jamais
  // dépendre d'une condition qui pourrait un jour être mal posée.
  const disciplinesRetenuesFinal = disciplinesProposeesResolues.filter((d) => d.statut === "retenue");
  const strategieRechercheFinale = buildStrategieRecherche(
    disciplinesRetenuesFinal,
    draft.strategieRecherche.availableConnectors,
    draft.webPublicActive,
    draft.niveauRevue
  );

  const ambiguitesSignalees = (draft.perimetre.ambiguitesSignalees || []).map((a) => {
    if (!a.requiresResolution) return a;
    const r = resolutions[a.id];
    const resolutionOut = { decision: str(r.decision), justification: str(r.justification) };
    // La décision structurée par discipline fait partie de l'audit
    // méthodologique et doit survivre à la confirmation — on voit non
    // seulement le résultat final (statut de chaque discipline) mais aussi
    // la décision exacte qui l'a produit, couverte par le hash du contrat.
    if (a.type === "disciplines_justification_ambigue") {
      resolutionOut.disciplineDecisions = { ...r.disciplineDecisions };
    }
    return { ...a, resolution: resolutionOut };
  });

  const confirmedAt = str(conf.confirmedAt) || new Date().toISOString();

  const withoutHash = {
    ...draft,
    disciplinesProposees: disciplinesProposeesResolues,
    strategieRecherche: strategieRechercheFinale,
    perimetre: { ...draft.perimetre, ambiguitesSignalees },
    humanConfirmation: {
      confirmedAt,
      mode: "macro",
      commentaire: str(conf.commentaire)
    }
  };

  const runContractHash = await computeRunContractHash(withoutHash);
  const confirmed = { ...withoutHash, runContractHash };

  return deepFreeze(confirmed);
}

// ---------------------------------------------------------------------------
// verifyRunContractIntegrity(contract) -> bool
// Défense en profondeur en plus du deepFreeze : toute API d'orchestration doit
// appeler ceci avant d'utiliser un RunContract qui a pu transiter par un canal
// externe (fichier, storage) où le gel JS ne protège plus rien.
// ---------------------------------------------------------------------------
async function verifyRunContractIntegrity(contract) {
  if (!contract || !contract.runContractHash) return false;
  const recomputed = await computeRunContractHash(contract);
  return recomputed === contract.runContractHash;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

const EFOrchRunContract = {
  SCHEMA,
  SCHEMA_VERSION,
  buildRunContractDraft,
  confirmRunContract,
  verifyRunContractIntegrity
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchRunContract;
}
if (typeof window !== "undefined") {
  window.EFOrchRunContract = EFOrchRunContract;
}
