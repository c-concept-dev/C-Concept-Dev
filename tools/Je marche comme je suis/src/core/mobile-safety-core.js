(() => {
  "use strict";

  function minutes(route = {}) {
    const value = Number(route.total ?? route.walking);
    return Number.isFinite(value) ? value : 0;
  }

  function assessRouteSet(routes = [], requestedMinutes = 0, options = {}) {
    const list = Array.isArray(routes) ? routes : [];
    const requested = Math.max(0, Number(requestedMinutes) || 0);
    const minimumRatio = Number(options.minimumRatio) || 0.7;
    const expectedCount = Number(options.expectedCount) || 3;
    const minimum = requested * minimumRatio;
    const credible = list.filter((route) => minutes(route) >= minimum);
    const bestMinutes = list.reduce((best, route) => Math.max(best, minutes(route)), 0);
    const allNonRecommended =
      list.length > 0 &&
      list.every(
        (route) =>
          route.canNavigate === false ||
          ["verify", "adaptation"].includes(route.proposalStatus),
      );

    const reasons = [];
    if (requested > 0 && credible.length === 0)
      reasons.push(
        `La meilleure tentative dure ${Math.round(bestMinutes)} min pour environ ${Math.round(requested)} min demandées.`,
      );
    if (list.length < expectedCount)
      reasons.push(`${list.length} proposition(s) seulement au lieu de ${expectedCount}.`);
    if (allNonRecommended)
      reasons.push("Toutes les tentatives nécessitent une vérification ou une adaptation.");

    return {
      insufficient: list.length === 0 || credible.length === 0 || allNonRecommended,
      bestMinutes: Math.round(bestMinutes),
      credibleCount: credible.length,
      routeCount: list.length,
      reasons,
    };
  }

  function buildReturnLinks(route = {}, travelMode = "walking") {
    const first = Array.isArray(route.coords) ? route.coords[0] : null;
    if (
      !Array.isArray(first) ||
      !Number.isFinite(Number(first[0])) ||
      !Number.isFinite(Number(first[1]))
    )
      return { google: null, apple: null, coordinates: null };

    const destination = `${Number(first[1]).toFixed(6)},${Number(first[0]).toFixed(6)}`;
    const googleMode = travelMode === "bicycling" ? "bicycling" : "walking";
    const appleFlag = travelMode === "bicycling" ? "b" : "w";

    return {
      google:
        "https://www.google.com/maps/dir/?api=1&destination=" +
        encodeURIComponent(destination) +
        "&travelmode=" +
        googleMode +
        "&dir_action=navigate",
      apple:
        "https://maps.apple.com/?daddr=" +
        encodeURIComponent(destination) +
        "&dirflg=" +
        appleFlag,
      coordinates: destination,
    };
  }

  globalThis.JMMJSMobileSafetyCore = Object.freeze({
    assessRouteSet,
    buildReturnLinks,
  });
})();
