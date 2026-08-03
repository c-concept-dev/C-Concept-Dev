(() => {
  "use strict";

  const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
  const CACHE_TTL_MS = 5 * 60 * 1000;

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function createOpenMeteoProvider({
    fetchImpl = fetch,
    nowImpl = Date.now,
    retryDelays = [800, 1600],
    cacheTtlMs = CACHE_TTL_MS,
  } = {}) {
    const cache = new Map();
    const pending = new Map();

    function cacheKey(latitude, longitude, hours) {
      return [
        Number(latitude).toFixed(4),
        Number(longitude).toFixed(4),
        Math.max(1, Math.ceil(Number(hours) || 1)),
      ].join(":");
    }

    async function request(url) {
      let lastError = null;

      for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
        try {
          const response = await fetchImpl(url, {
            headers: { Accept: "application/json" },
          });

          if (response.ok) return response;

          const error = new Error(
            `Open-Meteo indisponible (${response.status}).`,
          );
          error.status = response.status;
          lastError = error;

          if (
            !RETRYABLE_STATUSES.has(response.status) ||
            attempt >= retryDelays.length
          )
            throw error;
        } catch (error) {
          lastError = error;
          const status = Number(error?.status);
          const retryable =
            !Number.isFinite(status) || RETRYABLE_STATUSES.has(status);

          if (!retryable || attempt >= retryDelays.length) throw error;
        }

        await wait(retryDelays[attempt]);
      }

      throw lastError || new Error("Open-Meteo indisponible.");
    }

    async function fetchForecast({ latitude, longitude, hours, startAt }) {
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        timezone: "auto",
        forecast_days: "2",
        hourly: [
          "temperature_2m",
          "apparent_temperature",
          "precipitation_probability",
          "precipitation",
          "weather_code",
          "wind_gusts_10m",
          "visibility",
        ].join(","),
      });

      const response = await request(
        `https://api.open-meteo.com/v1/forecast?${params}`,
      );
      const data = await response.json();
      const times = data?.hourly?.time || [];
      const now = nowImpl();
      const requestedTimestamp = startAt
        ? Date.parse(startAt)
        : now - 30 * 60 * 1000;

      let startIndex = times.findIndex(
        (value) => Date.parse(value) >= requestedTimestamp,
      );
      if (startIndex < 0) startIndex = 0;

      return {
        hourly: data.hourly || {},
        startIndex,
        count: Math.max(1, Math.ceil(Number(hours) || 1)),
        timezone: data.timezone || null,
        fetchedAt: now,
        requestedStartAt: startAt || null,
      };
    }

    async function forecast({ latitude, longitude, hours = 3, startAt = null }) {
      if (
        !Number.isFinite(Number(latitude)) ||
        !Number.isFinite(Number(longitude))
      )
        throw new TypeError("Coordonnées météo invalides.");

      const key = `${cacheKey(latitude, longitude, hours)}:${startAt || "now"}`;
      const cached = cache.get(key);
      const now = nowImpl();

      if (cached && now - cached.savedAt < cacheTtlMs)
        return { ...cached.value, cache: "hit" };

      if (pending.has(key)) return pending.get(key);

      const operation = fetchForecast({
        latitude,
        longitude,
        hours,
        startAt,
      })
        .then((value) => {
          cache.set(key, { savedAt: nowImpl(), value });
          return { ...value, cache: "miss" };
        })
        .finally(() => pending.delete(key));

      pending.set(key, operation);
      return operation;
    }

    function clearCache() {
      cache.clear();
    }

    return Object.freeze({
      id: "open-meteo",
      kind: "weather",
      forecast,
      clearCache,
    });
  }

  globalThis.JMMJSOpenMeteoProvider = Object.freeze({
    RETRYABLE_STATUSES,
    CACHE_TTL_MS,
    createOpenMeteoProvider,
  });
})();
