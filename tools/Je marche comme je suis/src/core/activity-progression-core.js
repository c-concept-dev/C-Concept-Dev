/* JMMJS_ACTIVITY_PROGRESSION_CORE_START */
(() => {
  "use strict";

  // D103A — socle de données pur pour l'évolution "reprise et progression
  // d'activité" (cahier D103, document directeur du 17 août 2026). Ce
  // module ne contient aucune UX, aucune logique de décision (D103G),
  // aucun raccordement au moteur de génération de balade (D103H). Il
  // fixe uniquement les contrats de données et les fonctions de stockage
  // local, pour que les lots suivants s'appuient sur une forme stable
  // plutôt que d'improviser.
  //
  // Rappels de gouvernance directement applicables à ce socle :
  // - aucune règle fondée sur l'âge seul (cahier §6, §16) ;
  // - aucun coefficient chiffré de progression/réduction inventé
  //   (cahier §2.3, §12) ;
  // - mémoire locale à l'appareil uniquement, jamais synchronisée
  //   (cahier §4.2) ;
  // - une balade en mode "plaisir" ne rejoint l'historique que sur choix
  //   explicite de l'utilisateur (cahier §5.1, arbitrage du 17/08/2026).

  const MODES = Object.freeze(["plaisir", "reprise", "maintien", "progression"]);

  const DECISION_STATES = Object.freeze([
    "augmenter",
    "maintenir",
    "reduire",
    "preciser",
  ]);

  const REACTION_MOMENTS = Object.freeze(["pendant", "apres", "lendemain"]);

  function clone(value) {
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  // ---------------------------------------------------------------------
  // Baseline (état habituel) — cahier §7.1. Renseignée une seule fois via
  // l'onboarding (D103C), jamais redemandée en entier à chaque sortie.
  // ---------------------------------------------------------------------

  function emptyBaseline() {
    return {
      painOrGeneUsuelle: null,
      fatigueHabituelle: null,
      dureeHabituelleMinutes: null,
      frequenceHabituelle: null,
      besoinHabituelDePauses: null,
      toleranceMontee: null,
      toleranceDescente: null,
      toleranceTerrainIrregulier: null,
      stationDeboutHabituelle: null,
      equilibreHabituel: null,
      aideTechnique: null,
      niveauHabituelActivite: null,
      renseigneeLe: null,
    };
  }

  function normalizeBaseline(value = {}) {
    const base = emptyBaseline();
    const keys = Object.keys(base);
    const out = {};
    for (const key of keys) {
      out[key] = key in value ? value[key] : base[key];
    }
    return out;
  }

  function isBaselineKnown(baseline = {}) {
    const normalized = normalizeBaseline(baseline);
    return Object.keys(emptyBaseline()).some(
      (key) => normalized[key] !== null && normalized[key] !== undefined,
    );
  }

  // ---------------------------------------------------------------------
  // Séance — charge prévue vs réellement effectuée (cahier §10).
  // ---------------------------------------------------------------------

  function emptySessionRecord() {
    return {
      id: null,
      date: null,
      mode: null,
      includeInHistory: false,
      prevu: {
        dureeMinutes: null,
        terrain: null,
        denivele: null,
      },
      reel: {
        dureeMinutes: null,
        distanceMetres: null,
        deniveleMetres: null,
        expositionMontee: null,
        expositionDescente: null,
        surfaceRegularite: null,
        allurePercue: null,
        nombrePauses: null,
        dureePauses: null,
        motifPauses: null,
        interrompue: null,
        difficultePercue: null,
      },
      reactions: {
        pendant: null,
        apres: null,
        lendemain: null,
      },
      decision: null,
    };
  }

  function normalizeSessionRecord(value = {}) {
    const base = emptySessionRecord();
    return {
      id: value.id ?? base.id,
      date: value.date ?? base.date,
      mode: MODES.includes(value.mode) ? value.mode : base.mode,
      includeInHistory: value.includeInHistory === true,
      prevu: { ...base.prevu, ...(value.prevu || {}) },
      reel: { ...base.reel, ...(value.reel || {}) },
      reactions: { ...base.reactions, ...(value.reactions || {}) },
      decision: value.decision ?? base.decision,
    };
  }

  // Une séance en mode "plaisir" ne rejoint l'historique longitudinal
  // QUE si l'utilisateur l'a explicitement demandé (includeInHistory).
  // Les trois autres modes rejoignent toujours l'historique : c'est leur
  // raison d'être (cahier §5.2-§5.4).
  function shouldRecordSession(record = {}) {
    const normalized = normalizeSessionRecord(record);
    if (normalized.mode === "plaisir") return normalized.includeInHistory === true;
    return MODES.includes(normalized.mode);
  }

  // ---------------------------------------------------------------------
  // Réaction — un seul format partagé pour les trois moments (pendant,
  // après, lendemain), même si les champs pertinents diffèrent selon le
  // moment (cahier §11). Ce module ne valide pas la pertinence des champs
  // par moment : c'est à la charge de l'UI (D103E/D103F).
  // ---------------------------------------------------------------------

  function emptyReaction() {
    return {
      moment: null,
      ecartHabituel: null, // "mieux" | "comme_dhabitude" | "un_peu_moins_bien" | "nettement_moins_bien" | "je_ne_sais_pas"
      signalements: [],
      commentaireLibre: null,
    };
  }

  function normalizeReaction(value = {}) {
    const base = emptyReaction();
    return {
      moment: REACTION_MOMENTS.includes(value.moment) ? value.moment : base.moment,
      ecartHabituel: value.ecartHabituel ?? base.ecartHabituel,
      signalements: Array.isArray(value.signalements) ? value.signalements.slice() : base.signalements,
      commentaireLibre: value.commentaireLibre ?? base.commentaireLibre,
    };
  }

  // ---------------------------------------------------------------------
  // Décision pour la séance N+1 — cahier §12. Ce module ne calcule
  // JAMAIS la décision (c'est le périmètre de D103G) : il ne fait que
  // constituer et valider l'objet, pour que D103G ait un contrat stable
  // à remplir plutôt qu'une forme à inventer.
  // ---------------------------------------------------------------------

  function createDecision({ state, reason = null, dimension = null } = {}) {
    if (!DECISION_STATES.includes(state)) {
      throw new TypeError(
        `État de décision invalide : "${state}". Attendu l'un de : ${DECISION_STATES.join(", ")}.`,
      );
    }
    return {
      state,
      reason: typeof reason === "string" ? reason : null,
      dimension: typeof dimension === "string" ? dimension : null,
      // Jamais d'amplitude chiffrée : aucune clé "percent", "amount" ou
      // équivalente n'existe dans ce contrat, volontairement.
    };
  }

  // ---------------------------------------------------------------------
  // Stockage local (cahier §4.2 : mémoire locale à l'appareil, jamais
  // synchronisée). Fonctions pures, défensives contre un contenu corrompu
  // ou absent — ne lèvent jamais d'exception sur une lecture invalide.
  // ---------------------------------------------------------------------

  const STORAGE_KEYS = Object.freeze({
    baseline: "jmjs.activityProgression.baseline.v1",
    history: "jmjs.activityProgression.history.v1",
  });

  const HISTORY_MAX_ENTRIES = 200;

  function safeParse(raw) {
    if (typeof raw !== "string" || !raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function loadBaseline(storage) {
    if (!storage || typeof storage.getItem !== "function") return emptyBaseline();
    const parsed = safeParse(storage.getItem(STORAGE_KEYS.baseline));
    return normalizeBaseline(parsed || {});
  }

  function saveBaseline(storage, baseline) {
    if (!storage || typeof storage.setItem !== "function") return false;
    const normalized = normalizeBaseline(baseline || {});
    normalized.renseigneeLe = new Date().toISOString();
    storage.setItem(STORAGE_KEYS.baseline, JSON.stringify(normalized));
    return true;
  }

  function loadHistory(storage) {
    if (!storage || typeof storage.getItem !== "function") return [];
    const parsed = safeParse(storage.getItem(STORAGE_KEYS.history));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => normalizeSessionRecord(entry));
  }

  // N'ajoute une séance à l'historique que si shouldRecordSession()
  // l'autorise — jamais d'écriture silencieuse d'une balade plaisir non
  // demandée. Renvoie l'historique résultant (utile pour les tests et
  // pour l'UI), plafonné à HISTORY_MAX_ENTRIES (les plus anciennes sont
  // retirées en premier).
  function appendSessionRecord(storage, record) {
    const normalized = normalizeSessionRecord(record);
    const current = loadHistory(storage);
    if (!shouldRecordSession(normalized)) return current;
    const next = [...current, normalized].slice(-HISTORY_MAX_ENTRIES);
    if (storage && typeof storage.setItem === "function") {
      storage.setItem(STORAGE_KEYS.history, JSON.stringify(next));
    }
    return next;
  }

  function previousToleratedSession(storage) {
    const history = loadHistory(storage);
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const entry = history[i];
      const decisionState = entry.decision && entry.decision.state;
      if (decisionState !== "reduire") return entry;
    }
    return history.length ? history[history.length - 1] : null;
  }

  globalThis.JMMJSActivityProgressionCore = Object.freeze({
    MODES,
    DECISION_STATES,
    REACTION_MOMENTS,
    STORAGE_KEYS,
    emptyBaseline,
    normalizeBaseline,
    isBaselineKnown,
    emptySessionRecord,
    normalizeSessionRecord,
    shouldRecordSession,
    emptyReaction,
    normalizeReaction,
    createDecision,
    loadBaseline,
    saveBaseline,
    loadHistory,
    appendSessionRecord,
    previousToleratedSession,
  });
})();
/* JMMJS_ACTIVITY_PROGRESSION_CORE_END */
