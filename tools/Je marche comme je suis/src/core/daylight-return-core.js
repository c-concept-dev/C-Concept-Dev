(() => {
  "use strict";

  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;

  function normalizeDegrees(value) {
    return ((value % 360) + 360) % 360;
  }

  function validCoordinate(value, min, max) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
  }

  function validDate(value) {
    if (value === null || value === undefined || value === "") return null;
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function dayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    return Math.floor((date - start) / 86_400_000);
  }

  function sunEventUtc(date, latitude, longitude, sunrise) {
    const n = dayOfYear(date);
    const lngHour = longitude / 15;
    const t = n + ((sunrise ? 6 : 18) - lngHour) / 24;
    const meanAnomaly = 0.9856 * t - 3.289;
    let trueLongitude = meanAnomaly + 1.916 * Math.sin(meanAnomaly * RAD) + 0.02 * Math.sin(2 * meanAnomaly * RAD) + 282.634;
    trueLongitude = normalizeDegrees(trueLongitude);
    let rightAscension = DEG * Math.atan(0.91764 * Math.tan(trueLongitude * RAD));
    rightAscension = normalizeDegrees(rightAscension);
    rightAscension += Math.floor(trueLongitude / 90) * 90 - Math.floor(rightAscension / 90) * 90;
    rightAscension /= 15;
    const sinDeclination = 0.39782 * Math.sin(trueLongitude * RAD);
    const cosDeclination = Math.cos(Math.asin(sinDeclination));
    const cosHour = (Math.cos(90.833 * RAD) - sinDeclination * Math.sin(latitude * RAD)) / (cosDeclination * Math.cos(latitude * RAD));
    if (cosHour > 1 || cosHour < -1) return null;
    let hourAngle = sunrise ? 360 - DEG * Math.acos(cosHour) : DEG * Math.acos(cosHour);
    hourAngle /= 15;
    const localMeanTime = hourAngle + rightAscension - 0.06571 * t - 6.622;
    const utcHour = ((localMeanTime - lngHour) % 24 + 24) % 24;
    const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return new Date(utcMidnight + utcHour * 3_600_000);
  }

  function assessDaylight({ latitude, longitude, departureAt, durationMinutes }) {
    const lat = validCoordinate(latitude, -90, 90);
    const lon = validCoordinate(longitude, -180, 180);
    const departure = validDate(departureAt);
    const duration = Number(durationMinutes);
    if (lat === null || lon === null || !departure || !Number.isFinite(duration) || duration < 0) {
      return { status: "unknown", level: "unknown", label: "Lumière du jour non déterminée", reason: "Coordonnées, départ ou durée insuffisants." };
    }
    const returnAt = new Date(departure.getTime() + duration * 60_000);
    const sunrise = sunEventUtc(departure, lat, lon, true);
    const sunset = sunEventUtc(departure, lat, lon, false);
    if (!sunset) {
      return { status: "unknown", level: "unknown", label: "Lumière du jour non déterminée", departureAt: departure.toISOString(), returnAt: returnAt.toISOString(), reason: "Le coucher du soleil ne peut pas être calculé pour cette date et ce lieu." };
    }
    const marginMinutes = Math.round((sunset.getTime() - returnAt.getTime()) / 60_000);
    let level = "comfortable";
    let label = "Marge avant la nuit confortable";
    if (marginMinutes < 0) { level = "critical"; label = "Retour estimé après le coucher du soleil"; }
    else if (marginMinutes < 15) { level = "critical"; label = "Marge avant la nuit très faible"; }
    else if (marginMinutes < 30) { level = "caution"; label = "Marge avant la nuit faible"; }
    else if (marginMinutes < 60) { level = "acceptable"; label = "Marge avant la nuit correcte"; }
    return {
      status: "calculated",
      level,
      label,
      departureAt: departure.toISOString(),
      returnAt: returnAt.toISOString(),
      sunrise: sunrise ? sunrise.toISOString() : null,
      sunset: sunset.toISOString(),
      marginMinutes,
      source: "Calcul local astronomique",
      warning: "Cette marge est une règle UX, pas une garantie de sécurité ni de visibilité réelle."
    };
  }

  globalThis.JMMJSDaylightReturnCore = Object.freeze({ assessDaylight });
})();
