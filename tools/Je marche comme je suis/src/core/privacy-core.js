(() => {
  "use strict";
  const PROFILE_KEY = "jmmjs-profile";

  function createPrivacyController({
    storage = globalThis.localStorage,
    profileKey = PROFILE_KEY,
  } = {}) {
    let privateMode = false;

    function purge() {
      try {
        storage?.removeItem(profileKey);
        return true;
      } catch {
        return false;
      }
    }

    function setPrivateMode(enabled) {
      privateMode = Boolean(enabled);
      if (privateMode) purge();
      return privateMode;
    }

    function persistProfile(profile) {
      if (privateMode) {
        purge();
        return { persisted: false, reason: "private-mode" };
      }
      try {
        storage?.setItem(profileKey, JSON.stringify(profile));
        return { persisted: true, reason: "saved" };
      } catch (error) {
        return {
          persisted: false,
          reason: "storage-error",
          error: error.message,
        };
      }
    }

    function storageStatus() {
      let profilePresent = false;
      try {
        profilePresent = Boolean(storage?.getItem(profileKey));
      } catch {}
      return { privateMode, profilePresent, profileKey };
    }

    function loadProfile() {
      try {
        const raw = storage?.getItem(profileKey);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    return Object.freeze({
      setPrivateMode,
      persistProfile,
      loadProfile,
      purge,
      storageStatus,
    });
  }

  globalThis.JMMJSPrivacyCore = Object.freeze({
    PROFILE_KEY,
    createPrivacyController,
  });
})();
