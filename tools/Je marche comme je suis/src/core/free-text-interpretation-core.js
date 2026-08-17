/* JMMJS_FREE_TEXT_INTERPRETATION_CORE_START */
(() => {
  "use strict";

  // D102A — socle de données pour l'interprétation contrôlée du champ texte
  // libre "Où et quand survient la gêne ?" (#painDetail). Ce module ne
  // contient aucune analyse de texte (D102B), aucune UX de confirmation
  // (D102C) et n'est raccordé nulle part au modèle de requête existant
  // (D102D). Il fixe uniquement les contrats, pour que les lots suivants
  // s'appuient sur une forme de données stable plutôt que d'improviser.

  const STATUSES = Object.freeze([
    "idle",
    "pending",
    "candidate",
    "confirmed",
    "rejected",
    "ambiguous",
    "conflict",
    "error",
  ]);

  // Champs structurés existants que D102 est autorisé à confronter au texte
  // libre (plan D102 v1.1, §4). Liste fermée et explicite : un champ n'entre
  // dans la confrontation qu'en étant ajouté ici — jamais implicitement.
  // "painIntensity" correspond au curseur #pain (0–10, effet métier réel).
  // Les autres entrées sont des ancrages pour D102D/D102E ; aucune logique
  // de confrontation réelle n'existe encore en D102A.
  const COHERENCE_FIELDS = Object.freeze([
    "painIntensity",
    "limits",
    "terrain",
    "pauseNeeds",
    "standing",
  ]);

  function clone(value) {
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function emptyCandidateInterpretation() {
    return {
      bodyAreas: [],
      side: null,
      triggers: [],
      temporal: {},
      needs: [],
      negations: [],
      uncertain: [],
      confidence: {},
      coherenceIssues: [],
    };
  }

  function normalizeCandidateInterpretation(value = {}) {
    const arr = (x) => (Array.isArray(x) ? x.slice() : []);
    const obj = (x) =>
      x && typeof x === "object" && !Array.isArray(x) ? { ...x } : {};
    return {
      bodyAreas: arr(value.bodyAreas),
      side: typeof value.side === "string" ? value.side : null,
      triggers: arr(value.triggers),
      temporal: obj(value.temporal),
      needs: arr(value.needs),
      negations: arr(value.negations),
      uncertain: arr(value.uncertain),
      confidence: obj(value.confidence),
      coherenceIssues: arr(value.coherenceIssues),
    };
  }

  function createInterpretationState(rawText = "") {
    const text = typeof rawText === "string" ? rawText : "";
    return {
      rawText: text,
      status: text.trim() ? "pending" : "idle",
      candidateInterpretation: emptyCandidateInterpretation(),
      confirmedInterpretation: null,
      coherenceIssues: [],
    };
  }

  function isConfirmed(state = {}) {
    return state.status === "confirmed" && state.confirmedInterpretation !== null;
  }

  // Squelette de détection de cohérence. La forme du retour est fixée dès
  // D102A pour que D102C (affichage) et D102E (règles réelles) s'accordent
  // sur un même contrat, mais aucune règle n'est implémentée ici : ce
  // module ne doit jamais inventer un problème de cohérence à partir de
  // rien. Tant qu'aucune règle n'existe, le retour est toujours vide.
  function detectCoherenceIssues(candidateInterpretation = {}, structuredFields = {}) {
    void candidateInterpretation;
    void structuredFields;
    return [];
  }

  // Point de raccordement unique vers le modèle de requête existant. Ce
  // module ne l'appelle nulle part (aucun changement de comportement en
  // D102A) : il est défini et testé ici pour que D102D ait un point
  // d'entrée déjà éprouvé pour l'inertie, plutôt que d'écrire directement
  // dans app.js. Tant que l'état n'est pas explicitement "confirmed", ou
  // que confirmedInterpretation est vide, la requête ressort inchangée.
  function mergeConfirmedInterpretationIntoRequest(request = {}, state = {}) {
    const next = clone(request);
    if (!isConfirmed(state)) return next;
    // Volontairement vide en D102A : le raccordement réel (montée,
    // descente, terrain, durée, pauses, cohérence avec painIntensity) est
    // le périmètre de D102D, pas de ce lot.
    return next;
  }

  globalThis.JMMJSFreeTextInterpretationCore = Object.freeze({
    STATUSES,
    COHERENCE_FIELDS,
    emptyCandidateInterpretation,
    normalizeCandidateInterpretation,
    createInterpretationState,
    isConfirmed,
    detectCoherenceIssues,
    mergeConfirmedInterpretationIntoRequest,
  });
})();
/* JMMJS_FREE_TEXT_INTERPRETATION_CORE_END */
