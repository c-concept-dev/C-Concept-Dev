(() => {
  "use strict";
  function createOpenMeteoProvider({ fetchImpl = fetch } = {}) {
    async function forecast({ latitude, longitude, hours = 3 }) {
      if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude)))
        throw new TypeError("Coordonnées météo invalides.");
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
      const response = await fetchImpl(`https://api.open-meteo.com/v1/forecast?${params}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Open-Meteo indisponible (${response.status}).`);
      const data = await response.json();
      const times = data?.hourly?.time || [];
      const now = Date.now();
      let startIndex = times.findIndex((value) => Date.parse(value) >= now - 30 * 60 * 1000);
      if (startIndex < 0) startIndex = 0;
      return {
        hourly: data.hourly || {},
        startIndex,
        count: Math.max(1, Math.ceil(Number(hours) || 1)),
        timezone: data.timezone || null,
      };
    }
    return Object.freeze({ id: "open-meteo", kind: "weather", forecast });
  }
  globalThis.JMMJSOpenMeteoProvider = Object.freeze({ createOpenMeteoProvider });
})();