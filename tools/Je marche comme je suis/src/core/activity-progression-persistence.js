/* JMMJS_ACTIVITY_PROGRESSION_PERSISTENCE_START */
(() => {
  "use strict";

  // D103A2 — adaptateur de persistance longitudinal.
  // Les règles métier restent dans JMMJSActivityProgressionCore (D103A).
  // Cette couche porte uniquement les effets de bord liés au stockage local.

  const STORAGE_PREFIX = "jmmjs-activity-progression-";
  const STATE_KEY = `${STORAGE_PREFIX}state-v1`;
  const SESSION_INDEX_KEY = `${STORAGE_PREFIX}session-index-v1`;
  const SESSION_KEY_PREFIX = `${STORAGE_PREFIX}session-v1:`;

  function safeMessage(error) {
    return error && typeof error.message === "string" ? error.message : "storage-error";
  }

  function listKeys(storage) {
    const keys = [];
    if (!storage) return keys;
    if (typeof storage.length === "number" && typeof storage.key === "function") {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (typeof key === "string") keys.push(key);
      }
      return keys;
    }
    // Fallback utile pour les adaptateurs de tests qui exposent _keys().
    if (typeof storage._keys === "function") {
      return storage._keys().filter((key) => typeof key === "string");
    }
    return keys;
  }

  function createPersistenceController({
    storage = globalThis.localStorage,
    core = globalThis.JMMJSActivityProgressionCore,
  } = {}) {
    if (!core) throw new TypeError("JMMJSActivityProgressionCore is required");

    let privateMode = false;

    function sessionKey(id) {
      return `${SESSION_KEY_PREFIX}${encodeURIComponent(String(id))}`;
    }

    function readJson(key) {
      try {
        const raw = storage?.getItem?.(key);
        if (raw === null || raw === undefined || raw === "") {
          return { ok: true, present: false, value: null };
        }
        return { ok: true, present: true, value: JSON.parse(raw) };
      } catch (error) {
        return { ok: false, present: true, reason: "corrupt-or-unreadable", error: safeMessage(error) };
      }
    }

    function writeJson(key, value) {
      try {
        storage?.setItem?.(key, JSON.stringify(value));
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: "storage-error", error: safeMessage(error) };
      }
    }

    function removeKey(key) {
      try {
        storage?.removeItem?.(key);
        return true;
      } catch {
        return false;
      }
    }

    function purge() {
      let success = true;
      const keys = new Set([
        STATE_KEY,
        SESSION_INDEX_KEY,
        ...listKeys(storage).filter((key) => key.startsWith(STORAGE_PREFIX)),
      ]);
      for (const key of keys) success = removeKey(key) && success;
      return { purged: success, removedKeys: [...keys] };
    }

    function setPrivateMode(enabled) {
      privateMode = Boolean(enabled);
      if (privateMode) purge();
      return privateMode;
    }

    function storageStatus() {
      const keys = listKeys(storage).filter((key) => key.startsWith(STORAGE_PREFIX));
      return {
        privateMode,
        hasLongitudinalData: keys.length > 0,
        keys,
      };
    }

    function saveDocument(document) {
      if (privateMode) {
        purge();
        return { persisted: false, reason: "private-mode" };
      }

      let normalized;
      try {
        normalized = core.migrateLongitudinalDocument(document);
      } catch (error) {
        const reason = error instanceof RangeError ? "incompatible-version" : "invalid-document";
        return { persisted: false, reason, error: safeMessage(error) };
      }

      const validation = core.validateLongitudinalDocument(normalized);
      if (!validation.valid) {
        return { persisted: false, reason: "invalid-document", errors: [...validation.errors] };
      }

      const sessions = Array.isArray(normalized.data.sessionRecords)
        ? normalized.data.sessionRecords
        : [];
      const ids = [];
      const seen = new Set();
      for (const session of sessions) {
        const id = session && session.id;
        if (id === null || id === undefined || String(id) === "") {
          return { persisted: false, reason: "invalid-session-id" };
        }
        const sid = String(id);
        if (seen.has(sid)) return { persisted: false, reason: "duplicate-session-id", sessionId: sid };
        seen.add(sid);
        ids.push(sid);
      }

      // Le state ne contient pas le tableau de sessions : chaque session a sa propre clé.
      const stateDocument = core.createLongitudinalDocument(normalized);
      stateDocument.data.sessionRecords = [];

      const existingIndex = readJson(SESSION_INDEX_KEY);
      const previousIds = existingIndex.ok && Array.isArray(existingIndex.value)
        ? existingIndex.value.map(String)
        : [];

      const stateWrite = writeJson(STATE_KEY, stateDocument);
      if (!stateWrite.ok) return { persisted: false, reason: stateWrite.reason, error: stateWrite.error };

      for (const session of sessions) {
        const result = writeJson(sessionKey(session.id), core.normalizeSessionRecord(session));
        if (!result.ok) return { persisted: false, reason: result.reason, error: result.error };
      }

      const indexWrite = writeJson(SESSION_INDEX_KEY, ids);
      if (!indexWrite.ok) return { persisted: false, reason: indexWrite.reason, error: indexWrite.error };

      for (const previousId of previousIds) {
        if (!seen.has(previousId)) removeKey(sessionKey(previousId));
      }

      return { persisted: true, reason: "saved", sessionCount: ids.length };
    }

    function loadDocument() {
      if (privateMode) {
        purge();
        return { loaded: false, reason: "private-mode", document: null };
      }

      const state = readJson(STATE_KEY);
      if (!state.ok) return { loaded: false, reason: state.reason, document: null, error: state.error };
      if (!state.present) return { loaded: false, reason: "absent", document: null };

      const index = readJson(SESSION_INDEX_KEY);
      if (!index.ok) return { loaded: false, reason: index.reason, document: null, error: index.error };
      if (index.present && !Array.isArray(index.value)) {
        return { loaded: false, reason: "corrupt-session-index", document: null };
      }

      const sessionIds = index.present ? index.value.map(String) : [];
      const sessions = [];
      for (const id of sessionIds) {
        const stored = readJson(sessionKey(id));
        if (!stored.ok || !stored.present) {
          return {
            loaded: false,
            reason: stored.ok ? "missing-session" : stored.reason,
            document: null,
            sessionId: id,
            error: stored.error,
          };
        }
        sessions.push(stored.value);
      }

      let candidate;
      try {
        candidate = {
          ...state.value,
          data: {
            ...(state.value && state.value.data),
            sessionRecords: sessions,
          },
        };
        const migrated = core.migrateLongitudinalDocument(candidate);
        const validation = core.validateLongitudinalDocument(migrated);
        if (!validation.valid) {
          return { loaded: false, reason: "invalid-document", document: null, errors: [...validation.errors] };
        }
        return { loaded: true, reason: "loaded", document: migrated };
      } catch (error) {
        const reason = error instanceof RangeError ? "incompatible-version" : "invalid-document";
        return { loaded: false, reason, document: null, error: safeMessage(error) };
      }
    }

    return Object.freeze({
      saveDocument,
      loadDocument,
      purge,
      setPrivateMode,
      storageStatus,
    });
  }

  globalThis.JMMJSActivityProgressionPersistence = Object.freeze({
    STORAGE_PREFIX,
    STATE_KEY,
    SESSION_INDEX_KEY,
    SESSION_KEY_PREFIX,
    createPersistenceController,
  });
})();
/* JMMJS_ACTIVITY_PROGRESSION_PERSISTENCE_END */
