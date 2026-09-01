"use strict";
/**
 * MONO-08 — lib/real-openalex-fetch.js
 *
 * REMEDIATION R2 (B-01) : extrait de bin/run-real-smoke.js pour être
 * réutilisé À L'IDENTIQUE par lib/cross-process-restart-worker.js (jamais
 * une seconde implémentation dupliquée dans le worker).
 *
 * EF-01C2 (MONO-01/dependencies/ef-orch-ef01c2-runner-openalex-v0.1.js)
 * est un sous-système HTTP gelé autonome, conçu par son propre commentaire
 * d'en-tête pour recevoir un `fetch` réel en production ("la production
 * utilise fetch réel") — DÉCOUPLÉ de MONO-04 par conception. Utiliser le
 * `fetch` global de Node ici respecte donc le contrat gelé tel qu'écrit,
 * ce n'est jamais un contournement de MONO-04.
 */
function realOpenAlexFetchImpl(timeoutMs) {
  return async function (url) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, timeoutMs || 8000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      return { ok: res.ok, status: res.status, json: async function () { return res.json(); } };
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = { realOpenAlexFetchImpl };
