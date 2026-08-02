(() => {
  "use strict";

  const SERVICE_LABELS = Object.freeze([
    "Toilettes",
    "Eau potable",
    "Banc",
    "Pharmacie",
    "Parking",
    "Transport public",
    "Réseau téléphonique",
  ]);

  function normalizeServices(values = []) {
    return [...new Set((Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter((value) => SERVICE_LABELS.includes(value)))];
  }

  function assessRequiredServices(required = [], pois = [], options = {}) {
    const requested = normalizeServices(required);
    const providerAvailable = options.providerAvailable !== false;
    const searched = options.searched === true;
    const radiusMeters = Number.isFinite(Number(options.radiusMeters))
      ? Number(options.radiusMeters)
      : 300;
    const foundTypes = new Set(
      (Array.isArray(pois) ? pois : []).map((poi) => String(poi?.type || "")),
    );

    const checks = requested.map((service) => {
      if (!providerAvailable || !searched) {
        return {
          service,
          status: "unknown",
          evidence: `${service} requis : recherche cartographique non disponible.`,
        };
      }
      if (service === "Réseau téléphonique") {
        return {
          service,
          status: "unknown",
          evidence:
            "Réseau téléphonique requis : Geoapify et OpenStreetMap ne prouvent pas la couverture mobile.",
        };
      }
      const found = foundTypes.has(service);
      return {
        service,
        status: found ? "respected" : "violated",
        evidence: found
          ? `${service} documenté à moins de ${radiusMeters} m de la trace.`
          : `${service} non trouvé à moins de ${radiusMeters} m de la trace lors de la recherche.`,
      };
    });

    return {
      requested,
      checks,
      respected: checks.filter((check) => check.status === "respected"),
      violated: checks.filter((check) => check.status === "violated"),
      unknown: checks.filter((check) => check.status === "unknown"),
      admissible: checks.every((check) => check.status === "respected"),
      status:
        checks.some((check) => check.status === "violated")
          ? "violated"
          : checks.some((check) => check.status === "unknown")
            ? "unknown"
            : "respected",
    };
  }

  function applyServiceAssessment(route, assessment) {
    const next = { ...route };
    const existing = Array.isArray(next.checks) ? next.checks : [];
    next.checks = [
      ...existing.filter((check) => !String(check.constraint || "").startsWith("Service requis :")),
      ...assessment.checks.map((check) => ({
        constraint: `Service requis : ${check.service}`,
        status: check.status,
        evidence: check.evidence,
        severity: "hard",
      })),
    ];
    next.requiredServiceAssessment = assessment;
    next.pois = Array.isArray(next.pois) ? next.pois : [];

    if (assessment.violated.length) {
      next.proposalStatus = "adaptation";
      next.canNavigate = false;
      next.violations = [
        ...new Set([
          ...(next.violations || []),
          ...assessment.violated.map((check) => `Service requis : ${check.service}`),
        ]),
      ];
    } else if (assessment.unknown.length && next.proposalStatus === "compatible") {
      next.proposalStatus = "verify";
      next.canNavigate = false;
      next.unknowns = [
        ...new Set([
          ...(next.unknowns || []),
          ...assessment.unknown.map((check) => `Service requis : ${check.service}`),
        ]),
      ];
    }
    return next;
  }

  globalThis.JMMJSServicesCore = Object.freeze({
    SERVICE_LABELS,
    normalizeServices,
    assessRequiredServices,
    applyServiceAssessment,
  });
})();
