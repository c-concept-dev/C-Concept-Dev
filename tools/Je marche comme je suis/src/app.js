(() => {
  "use strict";
  const {
    ConstraintRegistry: ConstraintRegistry,
    compileConstraints: compileConstraints,
    auditRoute: auditRoute,
  } = globalThis.JMMJSRouteEngineCore;
  const { parseGPXText, summarizePoints } = globalThis.JMMJSGPXCore;
  const { assessTerrainEvidence, absentTerrainEvidence } = globalThis.JMMJSTerrainEvidenceCore;
  const { summarizeOverpassTerrain, applyOverpassTerrain, markOverpassUnavailable } = globalThis.JMMJSOverpassTerrainCore;
  const { applyIgnElevationControl, markIgnUnavailable } = globalThis.JMMJSIgnElevationCore;
  const { assessRequiredServices, applyServiceAssessment } = globalThis.JMMJSServicesCore;
  const { mergeTourismPois, describePoi } = globalThis.JMMJSTourismServicesCore;
  const { summarizeForecast, assessForecast, applyWeatherAssessment } = globalThis.JMMJSWeatherCore;
  const {
    chooseWeatherPoints,
    aggregateWeatherResults,
  } = globalThis.JMMJSMultiPointWeatherCore;
  const {
    synthesizeRoutePresentation,
  } = globalThis.JMMJSAlertSynthesisCore;
  const {
    auditRouteExport,
    buildExactGpx,
    buildMapLinks,
    buildJsonExport,
  } = globalThis.JMMJSExportCore;
  const {
    summarizeTerrainProof,
  } = globalThis.JMMJSTerrainProofCore;
  const {
    auditGPXInput,
    auditParsedGPX,
    formatGPXAudit,
  } = globalThis.JMMJSGPXSafetyCore;
  const serviceResilience =
    globalThis.JMMJSServiceResilienceCore.createServiceResilience({
      timeoutMs: 12000,
      retryDelays: [700, 1500],
      cacheTtlMs: 120000,
    });
  const {
    buildBlockingFailure,
    buildSecondaryState,
    summarizeServiceStates,
  } = globalThis.JMMJSServiceContinuityCore;
  const {
    assessRouteSet,
    buildReturnLinks,
  } = globalThis.JMMJSMobileSafetyCore;
  const { safePlanPauses, applyPausePlan } = globalThis.JMMJSPausePlannerCore;
  const { safeAnalyzeFallbacks, applyFallbackAnalysis } = globalThis.JMMJSFallbackCore;
  const privacyController = globalThis.JMMJSPrivacyCore.createPrivacyController({
    storage: globalThis.localStorage,
  });
  const sessionPrivacyController =
    globalThis.JMMJSSessionPrivacyCore.createSessionPrivacyController({
      storage: globalThis.sessionStorage,
    });
  const requestGovernor =
    globalThis.JMMJSRequestGovernorCore.createRequestGovernor({
      limits: { ors: 12, geo: 24, mapillary: 24, weather: 12, geocode: 12, session: 80 },
    });
  const serviceObservability =
    globalThis.JMMJSServiceObservabilityCore.createServiceObservability({
      storage: globalThis.sessionStorage,
    });
  const { analyzeElevationProfile } = globalThis.JMMJSElevationProfileCore;
  const offRouteMonitor = globalThis.JMMJSOffRouteCore.createOffRouteMonitor();
  const { MODES: RECOVERY_MODES, createRecoveryRequest } = globalThis.JMMJSRecoveryRouteCore;
  const { prepareOfflineSnapshot, saveOfflineSnapshot, clearOfflineSnapshot } = globalThis.JMMJSOfflinePreparationCore;
  const { buildSafetySharePackage, markReturned, readReturned, clearReturned } = globalThis.JMMJSSafetySharingCore;
  const {
    describeFunctionalLimitation,
    mergeStructuredLimitationIntoRequest,
  } = globalThis.JMMJSLimitationsCore;
  const formElement = document.querySelector("#form");
  if (formElement)
    formElement.addEventListener("submit", (event) => event.preventDefault());

  const $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)],
    S = {
      mode: "api",
      step: 0,
      map: null,
      layers: [],
      poiLayers: [],
      photoLayers: [],
      photoMarkers: new Map(),
      routes: [],
      selected: 0,
      request: null,
      compiled: null,
      bases: null,
      weather: null,
      layerControl: null,
      requestCounts: { ors: 0, geo: 0, mapillary: 0 },
      nav: {
        active: false,
        watch: null,
        wake: null,
        marker: null,
        accuracy: null,
        trail: null,
        remaining: null,
        positions: [],
        follow: true,
        lastAlong: 0,
        lastPosition: null,
        startedAt: 0,
        offRoute: null,
        recoveryLayer: null,
        recoveryLink: null,
      },
    },
    E = {
      placeholder: $("#placeholder"),
      map: $("#map"),
      results: $("#results"),
      grid: $("#routeGrid"),
      detail: $("#detail"),
      status: $("#status"),
      toast: $("#toast"),
      poiPanel: $("#poiPanel"),
      poiContent: $("#poiContent"),
      photoPanel: $("#photoPanel"),
      photoContent: $("#photoContent"),
    };
  const SERVICE_PROXY = "https://jmmjs-map-services.11drumboy11.workers.dev/v1";
  const leafletReady = window.L
    ? Promise.resolve()
    : Promise.reject(Error("Leaflet indisponible"));
  const esc = (s) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      ),
    val = (id) => $(id)?.value ?? "",
    num = (id) =>
      val(id) === "" ? null : Number(String(val(id)).replace(",", ".")),
    chosen = (g) =>
      $$('[data-group="' + g + '"] .chip.active').map((b) =>
        b.textContent.trim(),
      ),
    slug = (s) =>
      String(s || "parcours")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
  function say(m) {
    E.toast.textContent = m;
    E.toast.classList.add("show");
    setTimeout(() => E.toast.classList.remove("show"), 2600);
  }
  function status(m) {
    E.status.hidden = !m;
    E.status.innerHTML = m || "";
  }
  function blockingFailureHtml(view) {
    const actions = view.actions
      .map(
        (action, index) =>
          `<button type="button" class="${index === 0 ? "primary" : "secondary"} service-failure-action" data-service-action="${esc(action.id)}">${esc(action.label)}</button>`,
      )
      .join("");
    return (
      `<section class="service-failure" data-state="${esc(view.state)}" role="alert" aria-live="assertive">` +
      `<p class="service-failure-kicker">Recherche interrompue · données conservées</p>` +
      `<h2>${esc(view.title)}</h2>` +
      `<p>${esc(view.body)}</p>` +
      `<p class="service-failure-assurance">${esc(view.assurance)}</p>` +
      `<div class="service-failure-actions">${actions}</div>` +
      `</section>`
    );
  }

  function showBlockingServiceFailure(result, service = "ors") {
    const view = buildBlockingFailure({
      service,
      diagnostic: {
        ...(result?.diagnostic || {}),
        attempts: result?.attempts,
      },
    });
    status(blockingFailureHtml(view));
    E.status.dataset.kind = "blocking-service-failure";
    E.status.dataset.state = view.state;
    return view;
  }

  function secondaryServiceWarning(service, diagnostic, imperative = false) {
    return buildSecondaryState({ service, diagnostic, imperative });
  }
  function go(n) {
    S.step = Math.max(0, Math.min(3, n));
    $$(".step").forEach((x, i) => x.classList.toggle("active", i === S.step));
    $$("[data-go]").forEach((x, i) =>
      x.classList.toggle("active", i === S.step),
    );
    if (S.step === 3) {
      renderConstraintSummary();
      void refreshWeatherPreview();
    }
    $(".form-body").scrollTop = 0;
  }
  function serviceState(name, label, state = "idle") {
    const x = $('[data-status="' + name + '"]');
    if (x) {
      x.textContent = label;
      x.dataset.state = state;
    }
  }
  const SERVICE_LABELS = Object.freeze({
    ors: "OpenRouteService",
    geo: "Geoapify",
    mapillary: "Mapillary",
    overpass: "Overpass / OpenStreetMap",
    weather: "Open-Meteo",
    geocode: "Recherche du lieu",
  });

  function serviceDiagnosticHtml(name, result, retryAction = null) {
    const diagnostic = result?.diagnostic;
    const label = SERVICE_LABELS[name] || name;
    if (!diagnostic)
      return `<strong>${esc(label)}</strong> · opération terminée`;

    const retry =
      diagnostic.retryable && retryAction
        ? `<button type="button" class="service-retry" data-retry="${esc(
            retryAction,
          )}">Réessayer</button>`
        : "";

    return (
      `<strong>${esc(label)}</strong> · ${esc(diagnostic.userMessage)} ` +
      `<span class="service-diagnostic-code">${esc(
        diagnostic.code,
      )}${diagnostic.status ? ` · ${diagnostic.status}` : ""}</span>` +
      retry +
      `<small>Aucun résultat de remplacement n’a été inventé.</small>`
    );
  }

  function showServiceDiagnostic(name, result, {
    target = null,
    retryAction = null,
  } = {}) {
    const element =
      typeof target === "string" ? document.querySelector(target) : target;
    if (element) {
      element.innerHTML = serviceDiagnosticHtml(
        name,
        result,
        retryAction,
      );
      element.dataset.diagnostic = result?.ok ? "ok" : "error";
    }
    const diagnostic = result?.diagnostic;
    serviceState(
      name,
      result?.ok ? "Test réussi" : diagnostic?.retryable ? "Temporaire" : "Échec",
      result?.ok ? "ok" : "error",
    );
    if (diagnostic) say(diagnostic.userMessage);
  }

  async function resilientService({
    name,
    key,
    operation,
    allowRetry = true,
    allowCache = false,
    timeoutMs = 12000,
  }) {
    const result = await serviceResilience.execute({
      service: SERVICE_LABELS[name] || name,
      key,
      operation,
      allowRetry,
      allowCache,
      customTimeoutMs: timeoutMs,
    });
    serviceObservability.record({
      service: SERVICE_LABELS[name] || name,
      operation: key || "operation",
      ok: result.ok,
      diagnostic: result.diagnostic,
      attempts: result.attempts,
    });
    return result;
  }

  function countRequest(name, n = 1) {
    S.requestCounts[name] = (S.requestCounts[name] || 0) + n;
    const x = $('[data-count="' + name + '"]');
    if (x) x.textContent = S.requestCounts[name];
  }
  const serviceClient = globalThis.JMMJSServiceClient.createServiceClient({
    baseUrl: SERVICE_PROXY,
    fetchImpl: fetch,
    onRequest: countRequest,
    prepareRequest: (service, path, body) =>
      sessionPrivacyController.prepareProviderPayload(service, path, body),
    requestGovernor,
  });
  const peripherals =
    globalThis.JMMJSPeripheralRegistry.createPeripheralRegistry();
  peripherals.register(
    globalThis.JMMJSORSProvider.createORSProvider({ client: serviceClient }),
  );
  peripherals.register(
    globalThis.JMMJSOverpassProvider.createOverpassProvider({ client: serviceClient }),
  );
  peripherals.register(
    globalThis.JMMJSIgnElevationProvider.createIgnElevationProvider({ client: serviceClient }),
  );
  peripherals.register(
    globalThis.JMMJSRecoveryRouteProvider.createRecoveryRouteProvider({ client: serviceClient }),
  );
  const orsProvider = peripherals.require("ors");
  const overpassProvider = peripherals.require("overpass");
  const ignElevationProvider = peripherals.require("ign-elevation");
  const recoveryRouteProvider = peripherals.require("recovery-route");
  async function proxyFetch(name, path, body, count = 1) {
    return serviceClient.post(name, path, body, count);
  }
  async function testService(name) {
    const button = $('[data-test="' + name + '"]');
    button.disabled = true;
    serviceState(name, "Test…");
    try {
      const result = await resilientService({
        name,
        key: "test",
        allowRetry: true,
        operation: () => proxyFetch(name, "/test", { service: name }),
      });
      if (!result.ok) {
        showServiceDiagnostic(name, result);
        return;
      }
      serviceState(name, "Test réussi", "ok");
      say("Connexion sécurisée vérifiée.");
    } finally {
      button.disabled = false;
    }
  }
  $$(".next").forEach((b) => (b.onclick = () => go(S.step + 1)));
  $$(".prev").forEach((b) => (b.onclick = () => go(S.step - 1)));
  $$("[data-go]").forEach((b) => (b.onclick = () => go(+b.dataset.go)));
  $$(".group .chip").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.preventDefault();
        b.classList.toggle("active");
      }),
  );
  $$(".range input").forEach(
    (x) => (x.oninput = () => (x.nextElementSibling.textContent = x.value)),
  );
  $("#duration").oninput = () => {
    const n = +val("#duration");
    $("#durationLabel").textContent =
      n >= 60
        ? (Math.floor(n / 60) + " h " + (n % 60 || "")).trim()
        : n + " minutes";
  };
  function mode(m) {
    S.mode = m;
    $$(".mode").forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === m),
    );
    $("#apiBox").hidden = m !== "api";
    $("#gpxBox").hidden = m !== "gpx";
    $("#create").textContent =
      m === "api" ? "Confirmer et calculer" : "Confirmer et analyser le GPX";
    $("#modeHelp").textContent =
      m === "api"
        ? "OpenRouteService est protégé par Cloudflare. Si le moteur est indisponible, aucun parcours non vérifié ne le remplace silencieusement."
        : "Le fichier est lu localement puis contrôlé par le même noyau.";
  }
  $$(".mode").forEach((b) => (b.onclick = () => mode(b.dataset.mode)));
  $$("[data-test]").forEach(
    (b) => (b.onclick = () => testService(b.dataset.test)),
  );
  $("#locate").onclick = () => {
    if (!navigator.geolocation) return say("Géolocalisation indisponible.");
    const b = $("#locate"),
      old = b.textContent;
    b.disabled = true;
    b.textContent = "Localisation…";
    status("Le téléphone affine votre position GPS…");
    let best = null,
      watch = null,
      done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (watch !== null) navigator.geolocation.clearWatch(watch);
      b.disabled = false;
      b.textContent = old;
      if (best) {
        $("#lat").value = best.coords.latitude.toFixed(6);
        $("#lon").value = best.coords.longitude.toFixed(6);
        $("#place").value = "Ma position actuelle";
        status(
          "Position retenue · précision ± " +
            Math.round(best.coords.accuracy) +
            " m",
        );
        setTimeout(() => status(""), 3500);
      } else {
        status("");
        say("Position introuvable. Vérifiez l’autorisation GPS.");
      }
    };
    watch = navigator.geolocation.watchPosition(
      (p) => {
        if (!best || p.coords.accuracy < best.coords.accuracy) best = p;
        status(
          "Précision GPS actuelle : ± " +
            Math.round(best.coords.accuracy) +
            " m",
        );
        if (best.coords.accuracy <= 15) finish();
      },
      () => finish(),
      { enableHighAccuracy: true, timeout: 15e3, maximumAge: 0 },
    );
    setTimeout(finish, 15e3);
  };
  function coords() {
    const lat = num("#lat"),
      lon = num("#lon");
    return Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
      ? { lat: lat, lon: lon }
      : null;
  }
  async function geocode() {
    if (coords()) return coords();
    const q = val("#place").trim();
    if (!q) throw Error("Indiquez un départ.");
    status("Recherche du lieu…");
    const result = await resilientService({
      name: "geocode",
      key: q.toLowerCase(),
      allowRetry: true,
      allowCache: true,
      operation: async () => {
        const response = await fetch(
          "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" +
            encodeURIComponent(q),
          { headers: { "Accept-Language": "fr" } },
        );
        if (!response.ok) {
          const error = new Error(`Recherche du lieu : ${response.status}`);
          error.status = response.status;
          throw error;
        }
        return response.json();
      },
    });
    if (!result.ok)
      throw result.error || new Error(result.diagnostic.userMessage);
    const a = result.value;
    if (!a.length) throw Error("Lieu introuvable.");
    $("#lat").value = (+a[0].lat).toFixed(6);
    $("#lon").value = (+a[0].lon).toFixed(6);
    $("#place").value = a[0].display_name.split(",").slice(0, 3).join(",");
    return { lat: +a[0].lat, lon: +a[0].lon };
  }
  function buildRequest() {
    return {
      schemaVersion: "1.2",
      createdAt: new Date().toISOString(),
      start: {
        label: val("#place"),
        latitude: num("#lat"),
        longitude: num("#lon"),
        returnRadius: val("#returnRadius"),
      },
      time: {
        availableMinutes: num("#duration"),
        includes: val("#timeIncludes"),
        returnTime: val("#returnTime") || null,
        safetyMarginMinutes: num("#margin"),
      },
      person: {
        age: num("#age"),
        usualLevel: val("#level"),
        paceKmh: num("#pace"),
        company: val("#company"),
      },
      dailyState: {
        fitness: num("#fitness"),
        fatigue: num("#fatigue"),
        painIntensity: num("#pain"),
        painDetail: val("#painDetail"),
        balanceConfidence: num("#balance"),
        weather: "",
      },
      footwear: val("#footwear"),
      equipment: chosen("equipment"),
      limitations: chosen("limits"),
      functionalLimitation: {
        side: val("#limitationSide"),
        trigger: val("#limitationTrigger"),
        consequence: val("#limitationConsequence"),
        temporality: val("#limitationTemporality"),
        maxWithoutPauseMinutes: num("#maxWithoutPause"),
        maxStandingMinutes: num("#maxStanding"),
        helperAvailable:
          val("#helperAvailable") === "yes"
            ? true
            : val("#helperAvailable") === "no"
              ? false
              : null,
      },
      effort: {
        profile: val("#effort"),
        maxContinuousAscentMinutes: val("#ascentMinutes") || null,
        maxContinuousDescentMinutes: val("#descentMinutes") || null,
        maxAscentSlopePercent: num("#upSlope"),
        maxDescentSlopePercent: num("#downSlope"),
        recovery: val("#recovery"),
      },
      terrain: chosen("terrain"),
      preferences: chosen("wishes"),
      pausePlan: val("#pauses"),
      requiredServices: chosen("services"),
      hardConstraints: {
        avoidStairs: $("#noStairs").checked,
        avoidExposure: $("#noExposure").checked,
        noSilentCompromise: $("#strict").checked,
      },
      options: {
        shortcuts: $("#shortcuts").checked,
        compareDirections: $("#bothWays").checked,
      },
      freeText: val("#freeText"),
    };
  }
  function summaryItem(label, value, origin, severity, step, note = "") {
    return { label, value, origin, severity, step, note };
  }
  function constraintSummaryModel(request, compiled) {
    const imperative = [];
    const preferences = [];
    const preparation = [];
    const verification = [];
    const returnLabel = {
      0: "retour exactement au départ",
      50: "retour dans un rayon de 50 m",
      100: "retour dans un rayon de 100 m",
      vehicle: "retour près du véhicule",
      lodging: "retour près du logement",
    }[String(request.start?.returnRadius)] || "retour dans un rayon de 50 m";
    imperative.push(
      summaryItem(
        "Temps utilisable",
        `${Math.round(compiled.time.walkingBudgetMinutes)} min de marche, ${Math.round(compiled.time.pauseMinutes)} min de pauses et ${Math.round(compiled.time.marginMinutes)} min de marge`,
        "Durée, pauses, marge et heure limite",
        "Impératif",
        0,
        "Aucun parcours dépassant ce budget ne sera déclaré compatible.",
      ),
      summaryItem(
        "Retour",
        returnLabel,
        "Choix du départ",
        "Impératif",
        0,
      ),
    );
    if (compiled.hard.maxUp !== null)
      imperative.push(summaryItem("Pente montante maximale", `${compiled.hard.maxUp} %`, "Réglage d’effort", "Impératif", 2));
    if (compiled.hard.maxDown !== null)
      imperative.push(summaryItem("Pente descendante maximale", `${compiled.hard.maxDown} %`, "Réglage d’effort", "Impératif", 2));
    if (request.effort?.maxContinuousAscentMinutes)
      imperative.push(summaryItem("Montée continue maximale", request.effort.maxContinuousAscentMinutes === "none" ? "aucune montée" : `${request.effort.maxContinuousAscentMinutes} min`, "Choix direct ou règle D-024 confirmée", "Impératif", 2));
    if (request.effort?.maxContinuousDescentMinutes)
      imperative.push(summaryItem("Descente continue maximale", request.effort.maxContinuousDescentMinutes === "none" ? "aucune descente" : `${request.effort.maxContinuousDescentMinutes} min`, "Choix direct ou règle D-024 confirmée", "Impératif", 2));
    if (request.effort?.recovery)
      imperative.push(summaryItem("Récupération après effort", request.effort.recovery, "Choix direct", "Impératif", 2, "Une récupération non prouvée restera invérifiable."));
    if (compiled.hard.avoidStairs)
      imperative.push(summaryItem("Escaliers", "à éviter dès la génération puis à contrôler", request.hardConstraints?.avoidStairs ? "Interdiction explicite" : "Limitation ou équipement", "Impératif", request.hardConstraints?.avoidStairs ? 3 : 1, "Une donnée absente restera invérifiable."));
    if (compiled.hard.avoidExposure)
      imperative.push(summaryItem("Passages exposés", "à éviter", request.hardConstraints?.avoidExposure ? "Interdiction explicite" : "Limitation déclarée", "Impératif", request.hardConstraints?.avoidExposure ? 3 : 1, "Une preuve insuffisante conduira à « À vérifier »."));
    if (compiled.hard.requireRegular)
      imperative.push(summaryItem("Terrain régulier", "obligatoire", request.terrain?.includes("Terrain régulier") ? "Choix de terrain" : "Équipement de mobilité", "Impératif", request.terrain?.includes("Terrain régulier") ? 2 : 1, "Si la régularité n’est pas documentée, le parcours ne sera pas déclaré compatible."));
    if (compiled.hard.requireWide)
      imperative.push(summaryItem("Chemin large", "obligatoire", request.terrain?.includes("Chemin large") ? "Choix de terrain" : "Équipement de mobilité", "Impératif", request.terrain?.includes("Chemin large") ? 2 : 1, "La largeur absente restera invérifiable."));
    if (compiled.hard.requiredServices.length)
      imperative.push(summaryItem("Services requis", compiled.hard.requiredServices.join(", "), "Services ou pauses", "Impératif", 2, "Ils devront être documentés avant une qualification compatible."));

    if (compiled.advisory.maxUp !== null)
      preferences.push(summaryItem("Montée prudente", `privilégier une pente autour de ${compiled.advisory.maxUp} % ou moins`, "Limitation fonctionnelle", "Préférence prudente", 1));
    if (compiled.advisory.maxDown !== null)
      preferences.push(summaryItem("Descente prudente", `privilégier une pente autour de ${compiled.advisory.maxDown} % ou moins`, "Limitation fonctionnelle", "Préférence prudente", 1));
    if (compiled.advisory.preferRegular && !compiled.hard.requireRegular)
      preferences.push(summaryItem("Régularité", "terrain régulier privilégié", "Limitation fonctionnelle", "Préférence prudente", 1, "L’absence de donnée sera signalée sans bloquer automatiquement."));
    if (compiled.advisory.preferShortcuts)
      preferences.push(summaryItem("Proximité et repli", "parcours courts ou proches du départ privilégiés", "Fatigue ou besoin de repli", "Préférence prudente", 1));
    if (request.terrain?.length)
      preferences.push(summaryItem("Terrain souhaité", request.terrain.join(", "), "Choix de terrain", "Préférence", 2));
    if (request.preferences?.length)
      preferences.push(summaryItem("Envies", request.preferences.join(", "), "Envies du jour", "Préférence", 2));
    if (request.effort?.profile)
      preferences.push(summaryItem("Profil de sortie", request.effort.profile, "Effort recherché", "Classement", 2));

    preparation.push(summaryItem("Chaussures", request.footwear || "non renseignées", "Équipement porté", "Préparation et audit", 1, "Elles peuvent restreindre les surfaces mais ne compensent jamais une limitation."));
    if (request.equipment?.length)
      preparation.push(summaryItem("Équipement", request.equipment.join(", "), "Équipement emporté", "Préparation et audit", 1));
    if (request.functionalLimitation?.trigger && request.functionalLimitation?.consequence)
      preparation.push(
        summaryItem(
          "Conséquence fonctionnelle",
          describeFunctionalLimitation(request.functionalLimitation),
          "Réglage confirmé par l’utilisateur",
          request.derivedFunctionalRules?.some((rule) => rule.severity === "imperative")
            ? "Impératif"
            : "Préférence prudente",
          1,
          "Le moteur utilise les conséquences déclarées, sans poser de diagnostic.",
        ),
      );
    if (request.pausePlan)
      preparation.push(summaryItem("Pauses", request.pausePlan, "Plan de pauses", "Budget et préparation", 2));
    preparation.push(summaryItem("Comparaison des sens", compiled.hard.compareDirections ? "activée" : "désactivée", "Prudence et repli", compiled.hard.compareDirections ? "Contrôle" : "Information", 3));
    preparation.push(summaryItem("Compromis silencieux", request.hardConstraints?.noSilentCompromise ? "interdit" : "non activé", "Prudence et repli", "Règle système", 3));

    for (const item of imperative) {
      if (item.note && /invérifiable|À vérifier/.test(item.note)) verification.push(item);
    }
    return { imperative, preferences, preparation, verification };
  }
  function renderSummaryGroup(title, items, className) {
    if (!items.length) return "";
    return (
      '<section class="constraint-summary-group ' + className + '"><h4>' +
      esc(title) +
      "</h4>" +
      items
        .map(
          (item) =>
            '<article class="constraint-summary-item"><div><strong>' +
            esc(item.label) +
            "</strong><span>" +
            esc(item.value) +
            '</span><small>Origine : ' +
            esc(item.origin) +
            " · " +
            esc(item.severity) +
            (item.note ? "<br>" + esc(item.note) : "") +
            '</small></div><button type="button" class="summary-edit" data-edit-step="' +
            item.step +
            '">Modifier</button></article>',
        )
        .join("") +
      "</section>"
    );
  }
  function renderConstraintSummary() {
    const host = $("#constraintSummary");
    if (!host) return;
    const rawRequest = buildRequest();
    const request = mergeStructuredLimitationIntoRequest(rawRequest);
    const compiled = compileConstraints(request);
    const model = constraintSummaryModel(request, compiled);
    host.innerHTML =
      '<div class="constraint-summary-head"><div><h3>Le moteur appliquera</h3><p>Vérifiez les règles avant tout appel cartographique. Cliquer sur « Modifier » ramène au réglage d’origine.</p></div><span class="summary-ready">Aucun calcul lancé</span></div>' +
      renderSummaryGroup("Contraintes impératives", model.imperative, "imperative") +
      renderSummaryGroup("Préférences prudentes et envies", model.preferences, "preference") +
      renderSummaryGroup("Préparation et contrôles", model.preparation, "preparation");
    host.querySelectorAll("[data-edit-step]").forEach(
      (button) => (button.onclick = () => go(Number(button.dataset.editStep))),
    );
    S.request = request;
    S.compiled = compiled;
  }
  function save(r) {
    privacyController.setPrivateMode(Boolean($("#private")?.checked));
    const result = privacyController.persistProfile(r);
    if (!result.persisted && result.reason === "storage-error")
      say("Le profil n’a pas pu être mémorisé, mais le calcul continue.");
    return result;
  }

  function updatePrivacyStatus() {
    const checkbox = $("#private");
    if (!checkbox) return;
    const enabled = privacyController.setPrivateMode(checkbox.checked);
    const status = $("#privacyStatus");
    if (status)
      status.textContent = enabled
        ? "Mode privé actif · aucune persistance locale"
        : "Mode normal · mémorisation locale autorisée";
  }
  function download(c, n, t = "application/json") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([c], { type: t }));
    a.download = n;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
  }
  function distance(c) {
    let d = 0;
    for (let i = 1; i < c.length; i++) {
      const a = c[i - 1],
        b = c[i],
        p1 = (a[1] * Math.PI) / 180,
        p2 = (b[1] * Math.PI) / 180,
        dp = ((b[1] - a[1]) * Math.PI) / 180,
        dl = ((b[0] - a[0]) * Math.PI) / 180,
        h =
          Math.sin(dp / 2) ** 2 +
          Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
      d += 6371e3 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }
    return d;
  }
  function elev(c) {
    let up = 0,
      down = 0;
    for (let i = 1; i < c.length; i++)
      if (Number.isFinite(+c[i][2]) && Number.isFinite(+c[i - 1][2])) {
        const x = +c[i][2] - +c[i - 1][2];
        x > 0 ? (up += x) : (down -= x);
      }
    return { up: Math.round(up), down: Math.round(down) };
  }
  function normalize(r, i) {
    const g = r.geometry || r.geojson?.geometry || r.geojson || {},
      c = Array.isArray(g.coordinates) ? g.coordinates : [],
      m = r.metrics || {},
      e = elev(c),
      hasElevation =
        c.length >= 2 && c.every((point) => Number.isFinite(Number(point[2]))),
      metric = (value, fallback = null) =>
        value === null || value === undefined || value === ""
          ? fallback
          : Number.isFinite(Number(value))
            ? Number(value)
            : fallback;
    return {
      name:
        r.name ||
        ["La confortable", "L’agréable", "La tonique"][i] ||
        "Parcours",
      orientation: r.orientation || "",
      why: r.why || "",
      coords: c,
      distance: metric(m.distanceMeters, distance(c)),
      walking: metric(m.walkingMinutes),
      breaks: metric(m.breakMinutes),
      total: metric(m.totalMinutes),
      ascent: metric(m.ascentMeters, hasElevation ? e.up : null),
      descent: metric(m.descentMeters, hasElevation ? e.down : null),
      maxAscent: metric(m.maxContinuousAscentMinutes),
      maxDescent: metric(m.maxContinuousDescentMinutes),
      elevationCoverage: metric(m.elevationCoveragePercent),
      elevationQuality: m.elevationQuality || null,
      recoveryMinutesFound: metric(m.recoveryMinutesFound),
      maxUp: metric(m.maxAscentSlopePercent),
      maxDown: metric(m.maxDescentSlopePercent),
      terrain: r.terrainTypes || [],
      surfaces: r.surfaces || [],
      terrainEvidence: r.terrainEvidence || null,
      terrainProof:
        r.terrainProof ||
        summarizeTerrainProof(r.terrainEvidence || {}),
      compatibility: metric(r.compatibilityScore),
      pleasure: metric(r.pleasureScore),
      confidence: metric(r.confidenceScore),
      checks: r.constraintChecks || [],
      warnings: r.warnings || [],
      unknowns: r.unknowns || [],
      pois: r.pointsOfInterest || [],
      shortcuts: r.shortcuts || [],
      steps: r.steps || [],
      waypoints: r.waypoints || [],
      pausePlan: r.pausePlan || null,
      shortcuts: Array.isArray(r.shortcuts) ? r.shortcuts : [],
      fallbacks: Array.isArray(r.fallbacks) ? r.fallbacks : [],
      pauseMarkers: r.pauseMarkers || [],
      sources: r.sources || [],
      mode: r.mode || "api",
      violations: r.violations || [],
      proposalStatus: r.proposalStatus || "compatible",
      canNavigate: r.canNavigate !== false,
    };
  }
  function initMap(c) {
    if (!window.L) return say("Carte indisponible.");
    if (!S.map) {
      S.map = L.map("map", { zoomControl: true }).setView([c.lat, c.lon], 14);
      const wmts =
          "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
        ign = L.tileLayer(
          wmts + "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&FORMAT=image/png",
          { maxZoom: 19, attribution: "© IGN · Géoplateforme" },
        ),
        ortho = L.tileLayer(
          wmts + "&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&FORMAT=image/jpeg",
          { maxZoom: 19, attribution: "© IGN · Géoplateforme" },
        ),
        osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }),
        topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
          maxZoom: 17,
          attribution: "© OpenTopoMap · © OpenStreetMap",
        });
      S.bases = {
        "Plan IGN": ign,
        "Photo aérienne IGN": ortho,
        OpenStreetMap: osm,
        OpenTopoMap: topo,
      };
      ign.addTo(S.map);
      S.layerControl = L.control
        .layers(S.bases, null, { collapsed: true, position: "topright" })
        .addTo(S.map);
    }
    S.layers.forEach((l) => l.remove());
    S.layers = [];
    setTimeout(() => S.map.invalidateSize(), 80);
  }
  function draw() {
    if (!window.L || !S.routes.length) return;
    const p = S.routes[0].coords[0];
    initMap({ lat: +p[1], lon: +p[0] });
    const b = [];
    S.routes.forEach((r, i) => {
      if (S.nav.active && i !== S.selected) return;
      const pts = r.coords.map((c) => [+c[1], +c[0]]);
      b.push(...pts);
      const l = L.polyline(pts, {
        color:
          i === S.selected ? "#333" : ["#54777a", "#9b6c4d", "#6d7b52"][i % 3],
        weight: i === S.selected ? 7 : 5,
        opacity: i === S.selected ? 1 : 0.68,
        dashArray: i === 1 ? "10 6" : i === 2 ? "3 7" : null,
      }).addTo(S.map);
      l.on("click", () => select(i));
      S.layers.push(l);
      if (i === S.selected)
        (r.pauseMarkers || [])
          .filter(
            (pause) =>
              Number.isFinite(Number(pause?.lat)) &&
              Number.isFinite(Number(pause?.lon)),
          )
          .forEach((pause, pauseIndex) => {
          const marker = L.circleMarker([Number(pause.lat), Number(pause.lon)], {
            radius: 7,
            color: "#5b4d3e",
            weight: 2,
            fillColor: "#f3df9b",
            fillOpacity: 1,
          })
            .bindTooltip(`Pause ${pauseIndex + 1} — ${pause.label}`)
            .addTo(S.map);
          S.layers.push(marker);
        });
    });
    if (b.length && !S.nav.active) S.map.fitBounds(b, { padding: [24, 24] });
  }
  function routeAuditFacts(route) {
    const checks = Array.isArray(route.checks) ? route.checks : [];
    const respected = checks.filter((check) => check.status === "respected").length;
    const violated = checks.filter((check) => check.status === "violated").length;
    const unknown = checks.filter((check) =>
      ["unknown", "uncertain"].includes(check.status),
    ).length;
    return { respected, violated, unknown };
  }
  function routeFactBadges(route) {
    const facts = routeAuditFacts(route);
    const badges = [
      `<span class="fact ok">${facts.respected} contrôle${facts.respected > 1 ? "s" : ""} respecté${facts.respected > 1 ? "s" : ""}</span>`,
    ];
    if (facts.unknown)
      badges.push(
        `<span class="fact verify">${facts.unknown} élément${facts.unknown > 1 ? "s" : ""} à vérifier</span>`,
      );
    if (facts.violated)
      badges.push(
        `<span class="fact blocked">${facts.violated} limite${facts.violated > 1 ? "s" : ""} dépassée${facts.violated > 1 ? "s" : ""}</span>`,
      );
    return badges.join("");
  }
  function whyThisRoute(route) {
    const facts = routeAuditFacts(route);
    const parts = [];
    if (route.orientation === "Confortable")
      parts.push("Durée et effort contenus pour préserver une marge confortable");
    else if (route.orientation === "Agréable")
      parts.push("Meilleur équilibre trouvé entre durée disponible et critères de plaisir");
    else if (route.orientation === "Tonique")
      parts.push("Effort plus soutenu, tout en restant dans les limites confirmées");
    else if (route.orientation === "Très courte")
      parts.push("Option courte pour sortir un peu et revenir rapidement");
    else if (route.why) parts.push(route.why);
    if (Number.isFinite(Number(route.total)))
      parts.push(`${metricLabel(route.total)} min au total`);
    if (Number.isFinite(Number(route.ascent)))
      parts.push(`${metricLabel(route.ascent)} m de dénivelé positif`);
    if (facts.unknown)
      parts.push(`${facts.unknown} donnée${facts.unknown > 1 ? "s" : ""} reste${facts.unknown > 1 ? "nt" : ""} à vérifier`);
    if (route.proposalStatus === "adaptation")
      parts.push("Cette option nécessite votre accord explicite avant départ");
    return parts.join(" · ") || "Boucle réelle contrôlée par le moteur commun.";
  }
  function ensurePauseMarkers(route) {
    if (!route) return route;
    const existing = Array.isArray(route.pauseMarkers)
      ? route.pauseMarkers.filter(
          (pause) =>
            Number.isFinite(Number(pause?.lat)) &&
            Number.isFinite(Number(pause?.lon)),
        )
      : [];
    if (existing.length) {
      route.pauseMarkers = existing.map((pause) => ({
        ...pause,
        lat: Number(pause.lat),
        lon: Number(pause.lon),
      }));
      return route;
    }

    const requestedPlan =
      typeof route.pausePlan === "string"
        ? route.pausePlan
        : route.pausePlan?.plan || S.request?.pausePlan;
    if (!requestedPlan || requestedPlan === "Aucune pause programmée") {
      route.pauseMarkers = [];
      return route;
    }

    const planned = safePlanPauses({
      coords: route.coords,
      walkingMinutes: route.walking ?? route.total,
      pausePlan: requestedPlan,
      pois: route.pois,
    });
    route.pausePlan = planned;
    route.pauseMarkers = (planned.markers || [])
      .filter(
        (pause) =>
          Number.isFinite(Number(pause?.lat)) &&
          Number.isFinite(Number(pause?.lon)),
      )
      .map((pause) => ({
        ...pause,
        lat: Number(pause.lat),
        lon: Number(pause.lon),
      }));
    return route;
  }

  function renderResultQualityBanner() {
    let banner = document.querySelector("#resultQualityBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "resultQualityBanner";
      banner.className = "result-quality-banner";
      E.grid.parentElement.insertBefore(banner, E.grid);
    }
    const requested =
      Number(S.compiled?.time?.walkingBudgetMinutes) ||
      Number(S.request?.durationMinutes) ||
      0;
    const assessment = assessRouteSet(S.routes, requested);
    banner.hidden = !assessment.insufficient;
    banner.innerHTML = assessment.insufficient
      ? '<strong>Aucune balade suffisamment proche de votre demande n’a été trouvée.</strong><span>' +
        esc(assessment.reasons.join(" ")) +
        '</span><small>Aucune contrainte n’a été retirée silencieusement. Les tentatives restent visibles pour comprendre le résultat.</small>'
      : "";
  }

  async function render() {
    S.routes = S.routes.map(ensurePauseMarkers);
    E.placeholder.style.display = "none";
    E.map.classList.add("show");
    E.results.classList.add("show");
    document.body.classList.add("has-results");
    renderResultQualityBanner();
    $("#resultMode").textContent =
      S.routes[0].mode === "api"
        ? "Calcul direct"
        : S.routes[0].mode === "gpx"
          ? "GPX importé"
          : "Analyse contrôlée";
    E.grid.innerHTML = S.routes
      .map(
        (r, i) =>
          '<button class="route-card ' +
          (i === S.selected ? "selected" : "") +
          '" data-route="' +
          i +
          '"><span class="kicker">' +
          esc(r.proposalStatus === "verify" ? "à vérifier" : r.proposalStatus === "adaptation" ? "adaptation à valider" : r.orientation || "option " + (i + 1)) +
          '</span><span class="route-name">' +
          esc(r.name) +
          '</span><span class="metrics"><span class="metric"><b>' +
          (r.distance / 1e3).toFixed(1) +
          '</b><span>km</span></span><span class="metric"><b>' +
          metricLabel(r.total ?? r.walking) +
          '</b><span>min total</span></span><span class="metric"><b>' +
          metricLabel(r.ascent) +
          '</b><span>m D+</span></span></span><span class="route-facts">' +
          routeFactBadges(r) +
          "</span></button>",
      )
      .join("");
    $$("[data-route]").forEach(
      (b) => (b.onclick = () => select(+b.dataset.route)),
    );
    renderDetail();
    try {
      await leafletReady;
      if (!window.L) throw Error("Leaflet indisponible");
      draw();
      setTimeout(() => {
        S.map?.invalidateSize();
        draw();
      }, 100);
    } catch {
      say("Carte indisponible : rechargez la page puis réessayez.");
    }
  }
  function metricLabel(value, digits = 0) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
  }
  function profile(c) {
    const e = c
      .map((x) => (Number.isFinite(+x[2]) ? +x[2] : null))
      .filter((x) => x !== null);
    if (e.length < 2) return '<p class="kicker">Profil non disponible</p>';
    const min = Math.min(...e),
      max = Math.max(...e),
      rg = max - min || 1,
      pts = e
        .map(
          (v, i) =>
            ((i / (e.length - 1)) * 360).toFixed(1) +
            "," +
            (61 - ((v - min) / rg) * 51).toFixed(1),
        )
        .join(" ");
    return (
      '<svg class="profile" viewBox="0 0 360 70" preserveAspectRatio="none"><path d="M0,62 L' +
      pts.replaceAll(" ", " L") +
      ' L360,62 Z"/><polyline points="' +
      pts +
      '"/></svg>'
    );
  }
  function list(
    a,
    f = (x) => esc(typeof x === "string" ? x : JSON.stringify(x)),
  ) {
    return a?.length
      ? "<ul>" +
          a.map((x, index) => "<li>" + f(x, index) + "</li>").join("") +
          "</ul>"
      : '<p class="kicker">Aucune donnée</p>';
  }
  function distanceBetween(a, b) {
    return distance([a, b]);
  }
  function nearestRouteDistance(point, coords) {
    const step = Math.max(1, Math.floor(coords.length / 250));
    let best = Infinity;
    for (let i = 0; i < coords.length; i += step)
      best = Math.min(best, distanceBetween(point, coords[i]));
    return Math.min(best, distanceBetween(point, coords.at(-1)));
  }
  peripherals.register(
    globalThis.JMMJSGeoapifyProvider.createGeoapifyProvider({
      client: serviceClient,
      nearestRouteDistance,
    }),
  );
  const geoapifyProvider = peripherals.require("geoapify");
  peripherals.register(globalThis.JMMJSDatatourismeProvider.createDatatourismeProvider({ client: serviceClient, nearestRouteDistance }));
  const datatourismeProvider = peripherals.require("datatourisme");
  const photoReconProvider = globalThis.JMMJSPhotoReconProvider.createPhotoReconProvider({ client: serviceClient });
  const userReportsProvider = globalThis.JMMJSUserReportsProvider.createUserReportsProvider({ client: serviceClient });
  const officialClosuresProvider = globalThis.JMMJSOfficialClosuresProvider.createOfficialClosuresProvider({ client: serviceClient });
  peripherals.register(
    globalThis.JMMJSOpenMeteoProvider.createOpenMeteoProvider({ fetchImpl: fetch }),
  );
  const weatherProvider = peripherals.require("open-meteo");
  function localDateValue(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function localTimeValue(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function scheduledDeparture() {
    const mode = $("#departureMode")?.value || "now";
    if (mode === "now")
      return { mode, date: new Date(), iso: null, label: "Maintenant" };

    const dateValue = $("#departureDate")?.value;
    const timeValue = $("#departureTime")?.value;
    if (!dateValue || !timeValue)
      return {
        mode,
        date: null,
        iso: null,
        label: "Date et heure à préciser",
      };

    const date = new Date(`${dateValue}T${timeValue}:00`);
    return {
      mode,
      date,
      iso: `${dateValue}T${timeValue}`,
      label: new Intl.DateTimeFormat("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date),
    };
  }

  function validateDepartureSchedule() {
    const schedule = scheduledDeparture();
    if (!schedule.date)
      return {
        valid: false,
        schedule,
        message: "Choisissez une date et une heure de départ.",
      };
    if (schedule.mode !== "now" && schedule.date.getTime() < Date.now() - 60_000)
      return {
        valid: false,
        schedule,
        message: "La date de départ ne peut pas être dans le passé.",
      };
    return { valid: true, schedule, message: "" };
  }

  function updateDepartureControls() {
    const custom = ($("#departureMode")?.value || "now") === "scheduled";
    if ($("#departureDate")) $("#departureDate").disabled = !custom;
    if ($("#departureTime")) $("#departureTime").disabled = !custom;
    if ($("#departureStatus"))
      $("#departureStatus").textContent = custom
        ? "La météo sera analysée pour la date et l’heure choisies."
        : "La météo sera analysée à partir de maintenant.";
  }

  async function loadWeatherFor(latitude, longitude, minutes) {
    try {
      const departure = validateDepartureSchedule();
      if (!departure.valid) throw new Error(departure.message);
      const raw = await weatherProvider.forecast({
        latitude,
        longitude,
        hours: Math.max(1, Number(minutes || 60) / 60 + 1),
        startAt: departure.schedule.iso,
      });
      const summary = summarizeForecast(raw.hourly, {
        startIndex: raw.startIndex,
        count: raw.count,
      });
      const enrichedSummary = globalThis.JMMJSEnrichedWeatherCore.enrichWeatherSummary(summary, raw, departure.schedule, minutes);
      const assessment = assessForecast(enrichedSummary);
      S.weather = {
        summary: enrichedSummary,
        assessment,
        timezone: raw.timezone,
        departure: departure.schedule,
      };
    } catch (error) {
      S.weather = {
        summary: null,
        assessment: assessForecast(null),
        error: error.message,
        temporary:
          /\((429|502|503|504)\)/.test(error.message) ||
          /network|fetch/i.test(error.message),
      };
    }
    renderWeatherCompact("#weatherCompact");
    return S.weather;
  }

  async function loadWeatherForRoute(route, minutes) {
    const points = chooseWeatherPoints(route);
    if (!points.length) return S.weather;

    const departure = validateDepartureSchedule();
    if (!departure.valid)
      return {
        summary: null,
        assessment: assessForecast(null),
        error: departure.message,
        partial: true,
        points: [],
      };

    const results = [];
    for (const point of points) {
      try {
        const raw = await weatherProvider.forecast({
          latitude: point.lat,
          longitude: point.lon,
          hours: Math.max(1, Number(minutes || 60) / 60 + 1),
          startAt: departure.schedule.iso,
        });
        const summary = summarizeForecast(raw.hourly, {
          startIndex: raw.startIndex,
          count: raw.count,
        });
        const enrichedSummary = globalThis.JMMJSEnrichedWeatherCore.enrichWeatherSummary(
          summary,
          raw,
          departure.schedule,
          minutes,
        );
        results.push({
          point,
          summary: enrichedSummary,
          assessment: assessForecast(enrichedSummary),
          timezone: raw.timezone,
        });
      } catch (error) {
        results.push({
          point,
          summary: null,
          assessment: assessForecast(null),
          error: error.message,
        });
      }
    }

    const aggregated = aggregateWeatherResults(results);
    return {
      ...aggregated,
      departure: departure.schedule,
      timezone: results.find((result) => result.timezone)?.timezone || null,
    };
  }

  function weatherIcon(assessment, summary) {
    if (!assessment || assessment.level === "unknown") return "◌";
    if (assessment.level === "critical") return "⚠";
    if (
      Number(summary?.precipitationProbabilityMax || 0) >= 40 ||
      Number(summary?.precipitationMm || 0) > 0
    )
      return "☂";
    return "☀";
  }

  function weatherCompactHtml(weather = S.weather) {
    const summary = weather?.summary;
    const assessment = weather?.assessment;
    if (!summary || !assessment)
      return (
        '<span class="weather-compact-icon">◌</span><strong>' +
        (weather?.temporary
          ? "Météo temporairement indisponible"
          : "Météo automatique indisponible") +
        '</strong><button type="button" class="weather-retry" title="Réessayer la météo">↻</button>'
      );

    const min = Number.isFinite(Number(summary.temperatureMinC))
      ? Math.round(summary.temperatureMinC)
      : "—";
    const max = Number.isFinite(Number(summary.temperatureMaxC))
      ? Math.round(summary.temperatureMaxC)
      : "—";
    const rain = Number.isFinite(Number(summary.precipitationProbabilityMax))
      ? Math.round(summary.precipitationProbabilityMax)
      : "—";
    const gust = Number.isFinite(Number(summary.windGustMaxKmh))
      ? Math.round(summary.windGustMaxKmh)
      : "—";
    return (
      '<span class="weather-compact-icon">' +
      weatherIcon(assessment, summary) +
      '</span><span><strong>' +
      esc(min + "–" + max + " °C") +
      '</strong></span><span>☂ ' +
      esc(rain + " %") +
      '</span><span>↗ ' +
      esc(gust + " km/h") +
      '</span><span class="weather-compact-zone">' +
      esc(weather?.representativePoint?.label || "Départ") +
      '</span><span class="weather-compact-departure">' +
      esc(weather?.departure?.label || "Maintenant") +
      '</span><span class="weather-compact-verdict">' +
      esc(assessment.label) +
      '</span><button type="button" class="weather-details-toggle" aria-expanded="false" aria-label="Afficher le détail météo">ⓘ</button>' +
      '<div class="weather-details-panel" hidden>' +
      weatherDetailsHtml(weather) +
      '</div>'
    );
  }

  function formatWeatherTime(value) {
    if (!value || value === "—") return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(date)
      .replace(":", " h ");
  }

  function formatWeatherPeriod(start, end) {
    const formattedStart = formatWeatherTime(start);
    const formattedEnd = formatWeatherTime(end);
    if (formattedStart === "—" && formattedEnd === "—") return "Horaire inconnu";
    if (formattedStart === formattedEnd) return formattedStart;
    return `${formattedStart} → ${formattedEnd}`;
  }

  function formatWeatherDistance(value) {
    const meters = Number(value);
    if (!Number.isFinite(meters)) return null;
    if (meters >= 10000)
      return `${Math.round(meters / 1000)} km`;
    if (meters >= 1000)
      return `${(meters / 1000).toLocaleString("fr-FR", {
        maximumFractionDigits: 1,
      })} km`;
    return `${Math.round(meters)} m`;
  }

  function weatherHourlyRows(weather) {
    const rows = [];
    const points = Array.isArray(weather?.points) && weather.points.length
      ? weather.points
      : weather?.summary
        ? [{ point: weather.representativePoint || { label: "Départ" }, summary: weather.summary }]
        : [];

    for (const result of points) {
      const summary = result?.summary;
      if (!summary) continue;
      rows.push({
        label: result.point?.label || "Parcours",
        period: formatWeatherPeriod(summary.startTime, summary.endTime),
        temperature:
          Number.isFinite(Number(summary.temperatureMinC)) &&
          Number.isFinite(Number(summary.temperatureMaxC))
            ? `${Math.round(summary.temperatureMinC)}–${Math.round(summary.temperatureMaxC)} °C`
            : "—",
        rain: Number.isFinite(Number(summary.precipitationProbabilityMax))
          ? `${Math.round(summary.precipitationProbabilityMax)} %`
          : "—",
        gust: Number.isFinite(Number(summary.windGustMaxKmh))
          ? `${Math.round(summary.windGustMaxKmh)} km/h`
          : "—",
      });
    }
    return rows.slice(0, 4);
  }

  function weatherDetailsHtml(weather) {
    const rows = weatherHourlyRows(weather);
    const detailRows = rows.length
      ? rows
          .map(
            (row) =>
              '<div class="weather-detail-row"><strong>' +
              esc(row.label) +
              '</strong><span>' +
              esc(row.period) +
              '</span><span>' +
              esc(row.temperature) +
              '</span><span>Pluie ' +
              esc(row.rain) +
              '</span><span>Rafales ' +
              esc(row.gust) +
              '</span></div>',
          )
          .join("")
      : '<div class="weather-detail-empty">Aucun détail météo disponible.</div>';

    const summary = weather?.summary;
    const apparent =
      summary &&
      Number.isFinite(Number(summary.apparentMaxC))
        ? `Ressenti maximal : ${Math.round(summary.apparentMaxC)} °C`
        : null;
    const coverage =
      summary &&
      Number.isFinite(Number(summary.coverageHours))
        ? `Prévision analysée : ${summary.coverageHours} h`
        : null;
    const precipitation =
      summary &&
      Number.isFinite(Number(summary.precipitationMm))
        ? `Précipitations prévues : ${Number(summary.precipitationMm).toLocaleString(
            "fr-FR",
            { maximumFractionDigits: 1 },
          )} mm`
        : null;
    const visibility = formatWeatherDistance(summary?.visibilityMinM);
    const visibilityLabel = visibility
      ? `Visibilité minimale : ${visibility}`
      : null;
    const source = `Source : ${summary?.source || "Open-Meteo"}`;
    const retrievedAt = summary?.retrievedAt
      ? `Prévision récupérée à ${new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(summary.retrievedAt))}`
      : null;
    const model = summary?.model ? `Modèle ou sélection : ${summary.model}` : null;
    const returnAt = summary?.estimatedReturnAt
      ? `Retour estimé : ${new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(summary.estimatedReturnAt))}`
      : null;
    const sunset = summary?.sunset
      ? `Coucher du soleil : ${new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(summary.sunset))}`
      : null;
    const margin = Number.isFinite(Number(summary?.daylightMarginMinutes))
      ? `Marge avant la nuit : ${Math.round(Number(summary.daylightMarginMinutes))} min`
      : null;

    return (
      detailRows +
      '<div class="weather-detail-meta">' +
      [apparent, coverage, precipitation, visibilityLabel, retrievedAt, model, returnAt, sunset, margin, source]
        .filter(Boolean)
        .map((item) => '<span>' + esc(item) + '</span>')
        .join("") +
      '</div>'
    );
  }

  function toggleWeatherDetails(container) {
    const toggle = container?.querySelector(".weather-details-toggle");
    const panel = container?.querySelector(".weather-details-panel");
    if (!toggle || !panel) return;
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    toggle.setAttribute(
      "aria-label",
      expanded ? "Afficher le détail météo" : "Masquer le détail météo",
    );
    panel.hidden = expanded;
    container.dataset.expanded = String(!expanded);
  }

  function bindWeatherDetails(scope) {
    if (!scope) return;
    scope.querySelectorAll(".weather-compact").forEach((container) => {
      if (container.dataset.weatherBound === "true") return;
      const toggle = container.querySelector(".weather-details-toggle");
      const panel = container.querySelector(".weather-details-panel");
      if (!toggle || !panel) return;

      container.dataset.weatherBound = "true";
      container.setAttribute("role", "button");
      container.setAttribute("tabindex", "0");
      container.setAttribute("aria-label", "Afficher ou masquer le détail météo");

      const activate = (event) => {
        if (event.target.closest(".weather-retry")) return;
        if (event.target.closest(".weather-details-panel")) return;
        toggleWeatherDetails(container);
      };

      container.addEventListener("pointerup", (event) => {
        if (!["touch", "pen"].includes(event.pointerType)) return;
        event.preventDefault();
        container.dataset.ignoreClickUntil = String(Date.now() + 700);
        activate(event);
      });
      container.addEventListener("click", (event) => {
        if (Date.now() < Number(container.dataset.ignoreClickUntil || 0)) return;
        activate(event);
      });
      container.addEventListener("keydown", (event) => {
        if (!["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        toggleWeatherDetails(container);
      });
    });
  }

  function renderWeatherCompact(target, weather = S.weather) {
    const element =
      typeof target === "string" ? document.querySelector(target) : target;
    if (!element) return;
    element.innerHTML = weatherCompactHtml(weather);
    element.dataset.level = weather?.assessment?.level || "unknown";
    bindWeatherDetails(element);

    const retry = element.querySelector(".weather-retry");
    if (retry)
      retry.onclick = () => {
        retry.disabled = true;
        void refreshWeatherPreview();
      };
  }

  async function refreshWeatherPreview() {
    const banner = $("#weatherCompact");
    if (!banner) return;
    banner.innerHTML =
      '<span class="weather-compact-icon">◌</span><strong>Recherche météo…</strong>';
    try {
      const point = await geocode();
      await loadWeatherFor(point.lat, point.lon, num("#duration"));
      renderWeatherCompact(banner);
    } catch (error) {
      banner.innerHTML =
        '<span class="weather-compact-icon">◌</span><strong>Météo disponible après localisation</strong>';
      banner.title = error.message;
    }
  }
  function clearEnrichment() {
    S.poiLayers.forEach((x) => x.remove());
    S.photoLayers.forEach((x) => x.remove());
    S.poiLayers = [];
    S.photoLayers = [];
    S.photoMarkers = new Map();
    E.poiContent.innerHTML =
      '<p class="empty-data">Lancez la recherche pour ce parcours.</p>';
    E.photoContent.innerHTML =
      '<p class="empty-data">Lancez la recherche pour ce parcours.</p>';
  }
  async function loadPois() {
    const r = S.routes[S.selected];
    if (!r) return say("Choisissez un parcours.");
    const button = $("#loadPois");
    button.disabled = true;
    button.textContent = "Recherche…";
    try {
      const [geoResult, tourismResult] = await Promise.all([
        resilientService({ name: "geo", key: `pois:${r.name}:${r.coords.length}`, allowRetry: true, allowCache: true, operation: () => geoapifyProvider.enrich({ route: r, radiusMeters: 300, limit: 50 }) }),
        resilientService({ name: "tourism", key: `tourism:${r.name}:${r.coords.length}`, allowRetry: true, allowCache: true, operation: () => datatourismeProvider.enrich({ route: r, radiusMeters: 300, limit: 50 }) }),
      ]);
      if (!geoResult.ok && !tourismResult.ok) { showServiceDiagnostic("geo", geoResult, { target: E.poiContent, retryAction: "pois" }); return; }
      const pois = mergeTourismPois([geoResult.ok ? geoResult.value : [], tourismResult.ok ? tourismResult.value : []], { maxDistanceMeters: 300, maxDetourMeters: 600 });
      r.pois = pois;
      r.poiEvidenceLoaded = true;
      E.poiContent.innerHTML = pois.length
        ? '<div class="poi-list">' +
          pois
            .map(
              (p) => { const view = describePoi(p); return '<article class="poi-item"><strong>' + esc(view.name) + "</strong><span>" + esc(view.type) + " · " + view.distance + " m de la trace · détour estimé " + view.detourMeters + " m</span><span>Source : " + esc(view.source || "Source non précisée") + "</span><span>" + esc(view.hoursLabel) + " · " + esc(view.presenceLabel) + "</span><span>" + esc(view.accessibilityLabel) + "</span></article>"; },
            )
            .join("") +
          "</div>"
        : '<p class="empty-data">Aucun point documenté à moins de 300 m. Cela ne prouve pas son absence.</p>';
      S.poiLayers.forEach((x) => x.remove());
      S.poiLayers = pois.map((p) =>
        L.circleMarker([p.lat, p.lon], {
          radius: 6,
          color: "#333",
          fillColor: "#C8D0C3",
          fillOpacity: 0.95,
          weight: 2,
        })
          .addTo(S.map)
          .bindPopup(
            "<strong>" +
              esc(p.name) +
              "</strong><br>" +
              esc(p.type) +
              " · " +
              p.distance +
              " m",
          ),
      );
      serviceState("geo", "Requête réussie", "ok");
      say(pois.length + " point(s) utile(s) trouvé(s).");
    } catch (e) {
      const result = {
        ok: false,
        diagnostic:
          globalThis.JMMJSServiceResilienceCore.classifyServiceError(
            e,
            "Geoapify",
          ),
      };
      showServiceDiagnostic("geo", result, {
        target: E.poiContent,
        retryAction: "pois",
      });
    } finally {
      button.disabled = false;
      button.textContent = "Rechercher";
    }
  }
  function captureDate(t) {
    return Number.isFinite(t)
      ? new Intl.DateTimeFormat("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date(t))
      : "Date inconnue";
  }
  async function loadPhotos() {
    const r = S.routes[S.selected];
    if (!r) return say("Choisissez un parcours.");
    const button = $("#loadPhotos");
    button.disabled = true;
    button.textContent = "Recherche…";
    try {
      const result = await resilientService({
        name: "mapillary",
        key: `photos:${r.name}:${r.coords.length}`,
        allowRetry: true,
        allowCache: true,
        operation: () => photoReconProvider.enrich({ route: r }),
      });
      if (!result.ok) {
        showServiceDiagnostic("mapillary", result, { target: E.photoContent, retryAction: "photos" });
        return;
      }
      const photos = globalThis.JMMJSPhotoReconCore.chooseReconPhotos({
        streetView: result.value.streetView,
        mapillary: result.value.mapillary,
        nearestRouteDistance,
        routeCoords: r.coords,
        limit: 12,
      }).map((p) => ({ ...p, date: p.date || captureDate(p.capturedAt) }));
      const warning = globalThis.JMMJSPhotoReconCore.warningText();
      E.photoContent.innerHTML = photos.length
        ? '<div class="photo-list">' + photos.map((p) => '<article class="photo-item"><strong>' + esc(p.source) + '</strong><br><span class="photo-meta">' + esc(p.date || "Date inconnue") + ' · ' + p.distance + ' m de la trace</span>' + (p.thumb ? '<img src="' + esc(p.thumb) + '" alt="Image de repérage ' + esc(p.source) + '" loading="lazy">' : '') + (p.externalUrl ? '<a href="' + esc(p.externalUrl) + '" target="_blank" rel="noopener noreferrer">Voir dans ' + esc(p.source) + ' ↗</a>' : '') + '<small>' + esc(warning) + '</small></article>').join('') + '</div>'
        : '<p class="empty-data">Aucune image localisée à moins de 120 m. Cela ne renseigne pas l’état du terrain.</p>';
      r.terrainProof = summarizeTerrainProof(r.terrainEvidence || {}, { photos });
      renderDetail();
      serviceState("mapillary", "Requête réussie", "ok");
      say(photos.length + " image(s) indicative(s) de repérage.");
    } catch (e) {
      const result = { ok: false, diagnostic: globalThis.JMMJSServiceResilienceCore.classifyServiceError(e, "Photos de repérage") };
      showServiceDiagnostic("mapillary", result, { target: E.photoContent, retryAction: "photos" });
    } finally {
      button.disabled = false;
      button.textContent = "Rechercher";
    }
  }

  function ensureReportsPanel() {
    let panel = $("#reportsPanel");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.className = "enrichment";
    panel.id = "reportsPanel";
    panel.hidden = true;
    panel.innerHTML = '<div class="enrichment-head"><div><h3>Signalements récents</h3><p>Informations datées d’utilisateurs · non vérifiées par une autorité</p></div><button class="small" id="loadReports" type="button">Consulter</button></div><div id="reportsContent"><p class="empty-data">Consultez les signalements récents à proximité du parcours.</p></div>';
    const anchor = $("#photoPanel");
    anchor?.insertAdjacentElement("afterend", panel);
    $("#loadReports").onclick = loadUserReports;
    return panel;
  }
  async function loadUserReports() {
    const route = S.routes[S.selected];
    if (!route) return say("Choisissez un parcours.");
    const panel = ensureReportsPanel();
    const target = panel.querySelector("#reportsContent");
    const button = panel.querySelector("#loadReports");
    button.disabled = true; button.textContent = "Recherche…";
    try {
      const result = await resilientService({ name: "reports", key: `reports:${route.name}:${route.coords.length}`, allowRetry: true, allowCache: false, operation: () => userReportsProvider.nearby({ route, radiusMeters: 300 }) });
      if (!result.ok) { target.innerHTML = '<p class="empty-data">Signalements indisponibles. La promenade reste utilisable.</p>'; return; }
      const reports = globalThis.JMMJSUserReportsCore.normalizeReports(result.value, { nearestRouteDistance, routeCoords: route.coords });
      const warning = globalThis.JMMJSUserReportsCore.warningText();
      target.innerHTML = reports.length ? '<div class="poi-list">' + reports.map((report) => { const status=globalThis.JMMJSUserReportsCore.displayStatus(report); return '<article class="poi-item"><strong>' + esc(report.label) + '</strong><span>' + (report.distance == null ? "Distance non calculée" : report.distance + " m de la trace") + '</span><span>' + esc(status.age) + ' · ' + esc(status.confirmation) + '</span><span>' + esc(status.authority) + '</span><small>' + esc(warning) + '</small></article>'; }).join("") + '</div>' : '<p class="empty-data">Aucun signalement récent à moins de 300 m. Cela ne garantit pas l’absence d’obstacle.</p>';
      say(reports.length + " signalement(s) récent(s) affiché(s).");
    } catch (error) { target.innerHTML = '<p class="empty-data">Signalements indisponibles. La promenade reste utilisable.</p>'; }
    finally { button.disabled = false; button.textContent = "Consulter"; }
  }


  function ensureOfficialClosuresPanel() {
    let panel = $("#officialClosuresPanel");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.className = "enrichment";
    panel.id = "officialClosuresPanel";
    panel.hidden = true;
    panel.innerHTML = '<div class="enrichment-head"><div><h3>Réseaux officiels et fermetures</h3><p>Avis publiés par des sources identifiées · couverture non exhaustive</p></div><button class="small" id="loadOfficialClosures" type="button">Consulter</button></div><div id="officialClosuresContent"><p class="empty-data">Consultez les informations officielles disponibles à proximité du parcours.</p></div>';
    const anchor = ensureReportsPanel();
    anchor?.insertAdjacentElement("afterend", panel);
    $("#loadOfficialClosures").onclick = loadOfficialClosures;
    return panel;
  }

  async function loadOfficialClosures() {
    const route = S.routes[S.selected];
    if (!route) return say("Choisissez un parcours.");
    const panel = ensureOfficialClosuresPanel();
    const target = panel.querySelector("#officialClosuresContent");
    const button = panel.querySelector("#loadOfficialClosures");
    button.disabled = true; button.textContent = "Recherche…";
    try {
      const result = await resilientService({ name: "official-closures", key: `official:${route.name}:${route.coords.length}`, allowRetry: true, allowCache: true, operation: () => officialClosuresProvider.nearby({ route, radiusMeters: 300 }) });
      if (!result.ok) { target.innerHTML = '<p class="empty-data">' + esc(globalThis.JMMJSOfficialClosuresCore.unavailableText()) + '</p>'; return; }
      const items = globalThis.JMMJSOfficialClosuresCore.normalizeOfficialItems(result.value, { nearestRouteDistance, routeCoords: route.coords });
      target.innerHTML = items.length ? '<div class="poi-list">' + items.map((item) => { const status=globalThis.JMMJSOfficialClosuresCore.displayStatus(item); return '<article class="poi-item"><strong>' + esc(item.label) + '</strong><span>' + (item.distance == null ? "Distance non calculée" : item.distance + " m de la trace") + '</span><span>' + esc(status.activity) + ' · ' + esc(status.validity) + '</span><span>' + esc(status.authority) + '</span>' + (item.sourceUrl ? '<a href="' + esc(item.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Consulter la source officielle ↗</a>' : '') + '</article>'; }).join("") + '</div>' : '<p class="empty-data">' + esc(globalThis.JMMJSOfficialClosuresCore.absenceText()) + '</p>';
      say(items.length + " information(s) officielle(s) affichée(s).");
    } catch (error) { target.innerHTML = '<p class="empty-data">' + esc(globalThis.JMMJSOfficialClosuresCore.unavailableText()) + '</p>'; }
    finally { button.disabled = false; button.textContent = "Consulter"; }
  }


  function ensureTranquilityPanel() {
    let panel = $("#tranquilityPanel");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.className = "enrichment";
    panel.id = "tranquilityPanel";
    panel.hidden = true;
    panel.innerHTML = '<div class="enrichment-head"><div><h3>Potentiel de tranquillité</h3><p>Estimation cartographique · jamais une mesure de fréquentation réelle</p></div><button class="small" id="assessTranquility" type="button">Estimer</button></div><div id="tranquilityContent"><p class="empty-data">Chargez d’abord les points d’intérêt pour documenter une partie des indices.</p></div>';
    const anchor = ensureOfficialClosuresPanel();
    anchor?.insertAdjacentElement("afterend", panel);
    $("#assessTranquility").onclick = assessTranquilityForSelectedRoute;
    return panel;
  }

  function tranquilityIndicatorsFromRoute(route) {
    if (!route?.poiEvidenceLoaded) return {};
    const pois = Array.isArray(route.pois) ? route.pois : [];
    const category = (poi) => String(poi.category || poi.type || "").toLowerCase();
    const count = (terms) => pois.filter((poi) => terms.some((term) => category(poi).includes(term))).length;
    return {
      parkingCount: count(["parking"]),
      commerceCount: count(["shop", "commerce", "cafe", "restaurant", "pharmacy"]),
      touristPoiCount: count(["tourism", "heritage", "viewpoint", "museum", "attraction"]),
      officialRouteCount: Number.isFinite(Number(route.officialRouteCount)) ? Number(route.officialRouteCount) : null,
      distanceToMajorRoadMeters: Number.isFinite(Number(route.distanceToMajorRoadMeters)) ? Number(route.distanceToMajorRoadMeters) : null,
      buildingDensityPerKm2: Number.isFinite(Number(route.buildingDensityPerKm2)) ? Number(route.buildingDensityPerKm2) : null,
      environment: route.environment || null,
    };
  }

  function assessTranquilityForSelectedRoute() {
    const route = S.routes[S.selected];
    if (!route) return say("Choisissez un parcours.");
    const panel = ensureTranquilityPanel();
    const target = panel.querySelector("#tranquilityContent");
    const assessment = globalThis.JMMJSTranquilityPotentialCore.assessTranquilityPotential(tranquilityIndicatorsFromRoute(route));
    route.tranquilityPotential = assessment;
    if (assessment.status === "unknown") {
      target.innerHTML = '<p class="empty-data">' + esc(assessment.warning) + '</p>';
      return;
    }
    target.innerHTML = '<article class="poi-item"><strong>Potentiel de tranquillité : ' + esc(assessment.label) + '</strong><span>Indices documentés :</span><ul>' + assessment.indicators.map((item) => '<li>' + esc(item.label) + '</li>').join("") + '</ul><small>' + esc(assessment.warning) + '</small></article>';
    say("Potentiel de tranquillité estimé : " + assessment.label + ".");
  }

  function formatStepDuration(minutes) {
    const value = Number(minutes);
    if (!Number.isFinite(value) || value <= 0) return "moins d’une minute";
    const rounded = Math.max(1, Math.round(value));
    return rounded === 1 ? "environ 1 min" : `environ ${rounded} min`;
  }
  function checkStatusLabel(status) {
    return (
      {
        respected: "Respectée",
        violated: "Violée",
        unknown: "Invérifiable",
        uncertain: "Invérifiable",
      }[status] || status
    );
  }
  function controlSummaryHtml(route) {
    const summary =
      route.controlSummary ||
      (() => {
        const checks = Array.isArray(route.checks) ? route.checks : [];
        return {
          respected: checks.filter((item) => item.status === "respected").length,
          violated: checks.filter((item) => item.status === "violated").length,
          unknown: checks.filter(
            (item) => !["respected", "violated"].includes(item.status),
          ).length,
          total: checks.length,
        };
      })();

    const parts = [];
    if (summary.respected)
      parts.push(`${summary.respected} respecté${summary.respected > 1 ? "s" : ""}`);
    if (summary.unknown)
      parts.push(`${summary.unknown} à vérifier`);
    if (summary.violated)
      parts.push(`${summary.violated} dépassé${summary.violated > 1 ? "s" : ""}`);
    return parts.join(" · ") || "Aucun contrôle";
  }

  function terrainProofLevelClass(level) {
    return `terrain-proof-level terrain-proof-${level || "undocumented"}`;
  }

  function terrainProofDetailsHtml(route) {
    const proof =
      route.terrainProof ||
      summarizeTerrainProof(route.terrainEvidence || {});
    const items = proof.items
      .map(
        (item) =>
          '<li><span class="' +
          terrainProofLevelClass(item.level) +
          '">' +
          esc(item.levelLabel) +
          '</span><strong>' +
          esc(item.label) +
          "</strong> — " +
          esc(item.statement) +
          '<small>Source : ' +
          esc(item.source) +
          " · " +
          esc(item.reason) +
          "</small></li>",
      )
      .join("");

    const photo = proof.photoSummary || {};
    const photoMeta = photo.count
      ? '<p class="terrain-proof-meta">Photographies : ' +
        photo.count +
        (Number.isFinite(Number(photo.latestAgeDays))
          ? " · plus récente : il y a " +
            Math.round(photo.latestAgeDays) +
            " jour(s)"
          : "") +
        (Number.isFinite(Number(photo.nearestDistanceMeters))
          ? " · plus proche : " +
            Math.round(photo.nearestDistanceMeters) +
            " m de la trace"
          : "") +
        "</p>"
      : "";

    return (
      '<div class="terrain-proof-summary"><span class="' +
      terrainProofLevelClass(proof.overallLevel) +
      '">' +
      esc(proof.overallLabel) +
      "</span><strong>Niveau global de preuve terrain</strong></div>" +
      "<ul class=\"terrain-proof-list\">" +
      items +
      "</ul>" +
      photoMeta +
      '<p class="terrain-proof-rule">' +
      esc(proof.rule) +
      "</p>"
    );
  }

  function daylightReturnHtml(route) {
    const core = globalThis.JMMJSDaylightReturnCore;
    const coords = Array.isArray(route?.coords) ? route.coords[0] : null;
    if (!core || !Array.isArray(coords)) return "";
    const departure = scheduledDeparture();
    const durationMinutes = Math.max(0, Number(route?.walking ?? route?.total ?? 0) + Number(route?.breaks ?? 0));
    const assessment = core.assessDaylight({
      latitude: coords[1],
      longitude: coords[0],
      departureAt: departure.date,
      durationMinutes,
    });
    route.daylightReturn = assessment;
    if (assessment.status !== "calculated") {
      return '<section class="daylight-return" data-level="unknown"><h3>Lumière du jour</h3><p>Lumière du jour non déterminée.</p><small>' + esc(assessment.reason || "Données insuffisantes.") + '</small></section>';
    }
    const time = (value) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
    const margin = assessment.marginMinutes >= 0
      ? assessment.marginMinutes + " min"
      : Math.abs(assessment.marginMinutes) + " min après le coucher du soleil";
    return '<section class="daylight-return" data-level="' + esc(assessment.level) + '"><h3>Lumière du jour</h3><p><strong>' + esc(assessment.label) + '</strong></p><div class="daylight-return-grid"><span>Retour estimé : ' + esc(time(assessment.returnAt)) + '</span><span>Coucher du soleil : ' + esc(time(assessment.sunset)) + '</span><span>Marge : ' + esc(margin) + '</span></div><small>Calcul local astronomique. Cette marge est une règle UX, pas une garantie de sécurité ni de visibilité réelle.</small></section>';
  }

  function renderDetail() {
    const r = ensurePauseMarkers(S.routes[S.selected]),
      pauseMarkers = r.pauseMarkers,
      surfaces = r.surfaces.map(
        (x) => x.type + (x.percent != null ? " " + x.percent + " %" : ""),
      );
    E.detail.innerHTML =
      '<div class="weather-compact weather-result" data-level="' +
      esc(r.weather?.assessment?.level || "unknown") +
      '">' +
      weatherCompactHtml(r.weather) +
      '</div>' + daylightReturnHtml(r) + '<div class="detail-top"><div><span class="kicker">Profil d’altitude</span>' +
      profile(r.coords) +
      '</div><div class="why"><strong>Pourquoi ce parcours ?</strong><br>' +
      esc(whyThisRoute(r)) +
      '</div></div><div class="data-grid"><div class="data"><b>' +
      metricLabel(r.walking ?? r.total) +
      ' min</b><span>marche</span></div><div class="data"><b>' +
      metricLabel(r.breaks) +
      ' min</b><span>budget pauses</span></div><div class="data"><b>' +
      pauseMarkers.length +
      '</b><span>pauses positionnées</span></div><div class="data"><b>' +
      metricLabel(r.ascent) +
      " / " +
      metricLabel(r.descent) +
      ' m</b><span>D+ / D−</span></div><div class="data"><b>' +
      metricLabel(r.maxAscent, 1) +
      " / " +
      metricLabel(r.maxDescent, 1) +
      ' min</b><span>montée / descente</span></div><div class="data"><b>' +
      metricLabel(r.maxUp, 1) +
      ' %</b><span>pente montée</span></div><div class="data"><b>' +
      metricLabel(r.maxDown, 1) +
      ' %</b><span>pente descente</span></div><div class="data"><b>' +
      metricLabel(r.recoveryMinutesFound, 1) +
      ' min</b><span>récupération facile</span></div><div class="data"><b>' +
      metricLabel(r.elevationCoverage, 0) +
      ' %</b><span>couverture altitude</span></div><div class="data"><b>' +
      esc(r.elevationQuality || "—") +
      '</b><span>qualité altitude</span></div><div class="data"><b>' +
      esc(r.ignElevation?.comparison?.label || r.ignElevation?.label || "Non contrôlé") +
      '</b><span>contrôle IGN</span></div><div class="data"><b>' +
      r.pois.length +
      '</b><span>points d’intérêt</span></div><div class="data"><b>' +
      r.shortcuts.length +
      '</b><span>raccourcis</span></div><div class="data"><b>' +
      esc(
        (r.terrainProof ||
          summarizeTerrainProof(r.terrainEvidence || {})).overallLabel,
      ) +
      '</b><span>preuve terrain</span></div><div class="data"><b>' +
      metricLabel(r.terrainEvidence?.surfaceCoveragePercent) +
      ' %</b><span>surface documentée</span></div></div><div class="tags">' +
      [...r.terrain, ...surfaces]
        .map((x) => '<span class="tag">' + esc(x) + "</span>")
        .join("") +
      r.warnings
        .map((x) => '<span class="tag warn">⚠ ' + esc(x) + "</span>")
        .join("") +
      '</div><div class="control-synthesis"><strong>Contrôles</strong><span>' +
      esc(controlSummaryHtml(r)) +
      '</span></div><details><summary>Détail des contrôles (' +
      r.checks.length +
      ")</summary>" +
      list(
        r.checks,
        (c) =>
          "<strong>" +
          esc(checkStatusLabel(c.status)) +
          "</strong> — " +
          esc(c.constraint) +
          (c.evidence ? " : " + esc(c.evidence) : ""),
      ) +
      "</details><details><summary>Pauses positionnées (" +
      pauseMarkers.length +
      ")</summary>" +
      list(
        pauseMarkers,
        (pause, index) =>
          "<strong>Pause " +
          (index + 1) +
          "</strong> — " +
          esc(pause.label) +
          (Number.isFinite(Number(pause.routeMeters))
            ? " à " + Math.round(pause.routeMeters) + " m du départ"
            : "") +
          (Number.isFinite(Number(pause.offRouteMeters))
            ? " · " + Math.round(pause.offRouteMeters) + " m hors trace"
            : ""),
      ) +
      "</details><details><summary>Carnet étape par étape (" +
      r.steps.length +
      ")</summary>" +
      list(
        r.steps,
        (s) =>
          "<strong>" +
          esc(s.title) +
          "</strong> · " +
          formatStepDuration(s.durationMinutes) +
          " — " +
          esc(s.instruction || "") +
          (s.warning ? " ⚠ " + esc(s.warning) : ""),
      ) +
      "</details><details><summary>Points d’intérêt (" +
      r.pois.length +
      ")</summary>" +
      list(
        r.pois,
        (p) => "<strong>" + esc(p.name) + "</strong> · " + esc(p.type || ""),
      ) +
      "</details><details><summary>Raccourcis réels (" + r.shortcuts.length + ")</summary>" +
      list(r.shortcuts,(shortcut,index)=>"<strong>Raccourci "+(index+1)+"</strong> — "+Math.round(shortcut.savedMeters)+" m économisés"+(Number.isFinite(Number(shortcut.savedMinutes))?" · environ "+shortcut.savedMinutes.toFixed(1)+" min":"")+" · "+esc(shortcut.evidence)) +
      "</details><details><summary>Replis sur ses pas (" + r.fallbacks.length + ")</summary>" +
      list(r.fallbacks,(fallback,index)=>"<strong>Repli "+(index+1)+"</strong> — demi-tour à "+Math.round(fallback.outboundMeters)+" m du départ"+(Number.isFinite(Number(fallback.totalMinutes))?" · retour total environ "+fallback.totalMinutes.toFixed(1)+" min":"")+" · "+esc(fallback.evidence)) +
      "</details><details><summary>Réserves et inconnues</summary>" +
      list([...r.warnings, ...r.unknowns]) +
      "</details><details><summary>Niveau de preuve terrain</summary>" +
      terrainProofDetailsHtml(r) +
      "</details><details><summary>Contrôle altimétrique IGN</summary>" +
      (r.ignElevation?.comparison
        ? "<p>D+ ORS : <strong>" + esc(metricLabel(r.ascent)) + " m</strong><br>D+ IGN : <strong>" + esc(metricLabel(r.ignElevation.ascentMeters)) + " m</strong><br>Écart : <strong>" + esc(metricLabel(r.ignElevation.comparison.differenceMeters)) + " m</strong></p><p>Le profil IGN est un contrôle complémentaire et ne remplace pas la géométrie ORS.</p>"
        : "<p>" + esc(r.ignElevation?.message || "Contrôle IGN non documenté.") + "</p>") +
      "</details><details><summary>Sources</summary>" +
      list(r.sources) +
      '</details><div class="exports">' +
      (r.canNavigate
        ? '<button class="small start-nav" id="startNavBtn">▶ Phase 2 · Suivre ce trajet</button><button class="small" id="prepareOfflineBtn">Préparer hors connexion</button>'
        : '<button class="small" disabled title="Validez d’abord l’adaptation ou vérifiez les données manquantes">Trajet non recommandé tel quel</button>') +
      '<div class="export-certification" id="exportCertification"></div><button class="small" id="gpxBtn">↓ GPX exact</button><a class="small" id="googleMapsExportBtn" target="_blank" rel="noopener">Google Maps approximatif ↗</a><span class="map-export-warning" id="googleMapsExportWarning">Google Maps recalcule l’itinéraire : le tracé peut différer de la géométrie ORS et du GPX.</span><button class="small" id="jsonBtn">↓ JSON</button><button class="small" id="printBtn">Imprimer</button><div class="return-safety"><strong>Prudence et repli</strong><span>Partage facultatif. Aucun suivi en direct, aucune alerte automatique et aucun contact conservé.</span><button class="small" id="shareRouteBtn" type="button">Partager le parcours</button><button class="small" id="shareReturnBtn" type="button">Partager l’heure de retour</button><button class="small" id="copySafetyMessageBtn" type="button">Copier un message préparé</button><button class="small" id="copyCurrentPositionBtn" type="button">Copier ma position actuelle</button><button class="small" id="safetyReturnedBtn" type="button">Je suis revenu</button><a class="small" href="tel:112">Appeler le 112</a><span>Retour simple vers le départ :</span><a class="small" id="returnGoogleBtn" target="_blank" rel="noopener">Google Maps ↗</a><a class="small" id="returnAppleBtn" target="_blank" rel="noopener">Plans ↗</a><button class="small" id="copyStartBtn" type="button">Copier le départ</button></div></div>';
    bindWeatherDetails(E.detail);
    if ($("#startNavBtn")) $("#startNavBtn").onclick = startNavigation;
    if ($("#prepareOfflineBtn")) $("#prepareOfflineBtn").onclick = prepareOffline;
    const exportAudit = auditRouteExport(r);
    const certification = $("#exportCertification");
    if (certification) {
      certification.dataset.status = exportAudit.exactEligible
        ? "exact"
        : "unavailable";
      certification.textContent = exportAudit.exactEligible
        ? `Géométrie de référence disponible · ${exportAudit.coordinateCount} points · arrivée à ${exportAudit.closureMeters} m du départ`
        : `Export exact indisponible · ${exportAudit.reasons.join(" ")}`;
    }

    const gpxButton = $("#gpxBtn");
    gpxButton.disabled = !exportAudit.exactEligible;
    gpxButton.title = exportAudit.exactEligible
      ? `GPX de référence · ${exportAudit.coordinateCount} points · arrivée à ${exportAudit.closureMeters} m du départ`
      : `GPX exact indisponible : ${exportAudit.reasons.join(" ")}`;
    gpxButton.textContent = exportAudit.exactEligible
      ? "↓ GPX exact"
      : "GPX exact indisponible";
    gpxButton.onclick = gpx;

    const externalMapLinks = mapLinks(r);
    const googleMapsExportButton = $("#googleMapsExportBtn");
    if (googleMapsExportButton) {
      googleMapsExportButton.href = externalMapLinks.google || "#";
      googleMapsExportButton.setAttribute(
        "aria-label",
        "Ouvrir un itinéraire pédestre recalculé et approximatif dans Google Maps",
      );
      googleMapsExportButton.title = externalMapLinks.google
        ? `Google Maps recalculera cette boucle à partir de ${externalMapLinks.waypointCount || 0} points simplifiés. Le GPX reste la géométrie de référence.`
        : "Export Google Maps indisponible : géométrie insuffisante.";
      googleMapsExportButton.setAttribute(
        "aria-disabled",
        externalMapLinks.google ? "false" : "true",
      );
      if (!externalMapLinks.google)
        googleMapsExportButton.removeAttribute("href");
    }

    $("#jsonBtn").onclick = () =>
      download(
        JSON.stringify(buildJsonExport(r), null, 2),
        slug(r.name) + ".json",
      );
    $("#printBtn").onclick = () => print();

    const returnLinks = buildReturnLinks(r, "walking");
    $("#returnGoogleBtn").href = returnLinks.google || "#";
    $("#returnAppleBtn").href = returnLinks.apple || "#";
    $("#copyStartBtn").onclick = async () => {
      try {
        await navigator.clipboard.writeText(returnLinks.coordinates);
        say("Coordonnées du départ copiées.");
      } catch {
        say("Coordonnées du départ : " + returnLinks.coordinates);
      }
    };
    bindSafetySharing(r);
    E.poiPanel.hidden = false;
    E.photoPanel.hidden = false;
    ensureReportsPanel().hidden = false;
    ensureOfficialClosuresPanel().hidden = false;
    ensureTranquilityPanel().hidden = false;
  }
  async function copyOrShare(title, text) {
    if (navigator.share) { try { await navigator.share({ title, text }); return true; } catch (error) { if (error?.name === "AbortError") return false; } }
    try { await navigator.clipboard.writeText(text); say("Message copié."); return true; } catch { say(text); return false; }
  }
  function bindSafetySharing(route) {
    const pack = buildSafetySharePackage(route);
    const returned = readReturned(sessionStorage);
    const returnedBtn = $("#safetyReturnedBtn");
    if (returnedBtn && returned?.routeId === String(route.id || route.name || "promenade")) { returnedBtn.textContent = "Retour confirmé sur cet appareil"; returnedBtn.disabled = true; }
    if ($("#shareRouteBtn")) $("#shareRouteBtn").onclick = () => copyOrShare("Ma promenade", pack.routeText + " " + pack.returnText);
    if ($("#shareReturnBtn")) $("#shareReturnBtn").onclick = () => copyOrShare("Mon heure de retour", pack.returnText + " " + pack.warning);
    if ($("#copySafetyMessageBtn")) $("#copySafetyMessageBtn").onclick = async () => { try { await navigator.clipboard.writeText(pack.preparedMessage); say("Message préparé copié."); } catch { say(pack.preparedMessage); } };
    if ($("#copyCurrentPositionBtn")) $("#copyCurrentPositionBtn").onclick = () => {
      if (!navigator.geolocation) return say("Géolocalisation indisponible.");
      navigator.geolocation.getCurrentPosition(async (position) => { const text = globalThis.JMMJSSafetySharingCore.formatPoint([position.coords.longitude, position.coords.latitude]); try { await navigator.clipboard.writeText(text); say("Position actuelle copiée."); } catch { say("Position actuelle : " + text); } }, () => say("Position actuelle non obtenue. Aucune donnée n’a été transmise."), { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 });
    };
    if (returnedBtn) returnedBtn.onclick = () => { markReturned(sessionStorage, { routeId: String(route.id || route.name || "promenade") }); returnedBtn.textContent = "Retour confirmé sur cet appareil"; returnedBtn.disabled = true; say("Retour enregistré uniquement sur cet appareil. Aucun message n’a été envoyé automatiquement."); };
  }
  function select(i) {
    S.selected = i;
    clearEnrichment();
    render();
  }
  function mapLinks(r) {
    return buildMapLinks(r);
  }
  function gpx() {
    const route = S.routes[S.selected];
    const audit = auditRouteExport(route);
    if (!audit.exactEligible)
      return say(
        "GPX exact indisponible : " + audit.reasons.join(" "),
      );
    try {
      download(
        buildExactGpx(route),
        slug(route.name) + ".gpx",
        "application/gpx+xml",
      );
    } catch (error) {
      say("Export GPX impossible : " + error.message);
    }
  }
  function meters(a, b) {
    return distance([
      [a.lon, a.lat],
      [b.lon, b.lat],
    ]);
  }
  function bearing(a, b) {
    const p1 = (a.lat * Math.PI) / 180,
      p2 = (b.lat * Math.PI) / 180,
      dl = ((b.lon - a.lon) * Math.PI) / 180,
      y = Math.sin(dl) * Math.cos(p2),
      x =
        Math.cos(p1) * Math.sin(p2) -
        Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }
  function compass(n) {
    return [
      "nord",
      "nord-est",
      "est",
      "sud-est",
      "sud",
      "sud-ouest",
      "ouest",
      "nord-ouest",
    ][Math.round(n / 45) % 8];
  }
  function fmtDistance(m) {
    return m >= 1e3
      ? (m / 1e3).toFixed(m < 1e4 ? 1 : 0) + " km"
      : Math.round(m) + " m";
  }
  function nearestProgress(pos, r) {
    const cs = r.coords,
      total = r.distance || distance(cs),
      lat0 = (pos.lat * Math.PI) / 180,
      kx = 111320 * Math.cos(lat0),
      ky = 110540;
    let cum = 0,
      best = null;
    for (let i = 0; i < cs.length - 1; i++) {
      const a = cs[i],
        b = cs[i + 1],
        ax = (+a[0] - pos.lon) * kx,
        ay = (+a[1] - pos.lat) * ky,
        bx = (+b[0] - pos.lon) * kx,
        by = (+b[1] - pos.lat) * ky,
        dx = bx - ax,
        dy = by - ay,
        l2 = dx * dx + dy * dy,
        t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0,
        x = ax + t * dx,
        y = ay + t * dy,
        off = Math.hypot(x, y),
        seg = Math.sqrt(l2),
        along = cum + t * seg;
      let score = off;
      if (S.nav.lastAlong < 25 && along > total * 0.75) score += 150;
      if (along < S.nav.lastAlong - 60) score += (S.nav.lastAlong - along) * 2;
      if (along > S.nav.lastAlong + 700)
        score += (along - S.nav.lastAlong - 700) * 0.5;
      if (!best || score < best.score)
        best = {
          score: score,
          off: off,
          along: along,
          i: i,
          t: t,
          nearest: { lat: pos.lat + y / ky, lon: pos.lon + x / kx },
          remaining: Math.max(0, total - along),
          total: total,
        };
      cum += seg;
    }
    if (best && best.along >= S.nav.lastAlong - 30)
      S.nav.lastAlong = Math.max(S.nav.lastAlong, best.along);
    return best;
  }
  function stepText(r, p) {
    const km = p.along / 1e3,
      s = r.steps?.find(
        (x) => Number(x.fromKm ?? 0) <= km && Number(x.toKm ?? Infinity) >= km,
      );
    if (s?.instruction) return s.instruction;
    const look = r.coords[Math.min(r.coords.length - 1, p.i + 3)],
      cap = bearing(p.nearest, { lat: +look[1], lon: +look[0] });
    return (
      "Continuez sur la trace vers le " +
      compass(cap) +
      " · cap " +
      Math.round(cap) +
      "°"
    );
  }

  function offlineStatusRows(snapshot) {
    const rows = [
      ["✓", "Application", "disponible"],
      ["✓", "Trace exacte", "disponible"],
      ["✓", "Consignes et étapes", "disponibles"],
      ["✓", "Coordonnées de départ", "disponibles"],
      ["✓", "GPX", "disponible depuis le résultat"],
      [snapshot.availability.weather === "dated" ? "△" : "—", "Météo", snapshot.availability.weather === "dated" ? "enregistrée mais datée" : "non disponible"],
      ["△", "Nouveau calcul et actualisations", "non garantis sans réseau"],
      ["△", "Fond cartographique complet", "non garanti hors connexion"],
    ];
    return rows.map(([icon, label, state]) => `<li><strong>${icon} ${esc(label)}</strong> — ${esc(state)}</li>`).join("");
  }

  async function prepareOffline() {
    const route = S.routes[S.selected];
    if (!route) return say("Aucune promenade sélectionnée.");
    try {
      const snapshot = prepareOfflineSnapshot(route);
      saveOfflineSnapshot(globalThis.localStorage, snapshot);
      let modal = $("#offlinePreparationModal");
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "offlinePreparationModal";
        modal.className = "modal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        document.body.appendChild(modal);
      }
      modal.innerHTML = `<div class="modal-card"><h2>Préparation hors connexion</h2><p>La trace sélectionnée et ses consignes sont enregistrées sur cet appareil.</p><ul>${offlineStatusRows(snapshot)}</ul><p><strong>Important :</strong> hors connexion, aucun nouveau parcours, aucune météo actualisée, aucune nouvelle photo et aucune fermeture récente ne sont garantis.</p><div class="modal-actions"><button type="button" id="clearOfflinePreparation">Effacer la préparation</button><button type="button" id="closeOfflinePreparation">Fermer</button></div></div>`;
      modal.classList.add("show");
      $("#closeOfflinePreparation").onclick = () => modal.classList.remove("show");
      $("#clearOfflinePreparation").onclick = () => { clearOfflineSnapshot(globalThis.localStorage); modal.classList.remove("show"); say("Préparation hors connexion effacée."); };
      if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
        navigator.serviceWorker.register("./service-worker.js").catch(() => {});
      }
    } catch (error) {
      say(error?.message || "Préparation hors connexion impossible.");
    }
  }

  async function keepAwake() {
    try {
      if ("wakeLock" in navigator)
        S.nav.wake = await navigator.wakeLock.request("screen");
    } catch {}
  }
  async function startNavigation() {
    if (!navigator.geolocation)
      return say("Ce navigateur ne fournit pas la géolocalisation.");
    const r = S.routes[S.selected];
    if (!r || r.coords.length < 2) return say("Aucune trace réelle à suivre.");
    try {
      await leafletReady;
      if (!window.L) throw Error("Leaflet indisponible");
    } catch {
      return say("Carte indisponible : rechargez la page puis réessayez.");
    }
    S.nav.active = true;
    S.nav.follow = true;
    const returnLinks = buildReturnLinks(r, "walking");
    const navigationMapLinks = mapLinks(r);
    if ($("#navGoogleRoute")) {
      $("#navGoogleRoute").href = navigationMapLinks.google || "#";
      $("#navGoogleRoute").title =
        "Itinéraire pédestre recalculé par Google Maps. Le tracé peut différer de la trace ORS et du GPX.";
    }
    if ($("#navReturnGoogle")) $("#navReturnGoogle").href = returnLinks.google || "#";
    if ($("#navReturnApple")) $("#navReturnApple").href = returnLinks.apple || "#";
    S.nav.lastAlong = 0;
    S.nav.positions = [];
    S.nav.startedAt = Date.now();
    offRouteMonitor.reset();
    S.nav.offRoute = null;
    S.nav.recoveryLayer?.remove?.();
    S.nav.recoveryLayer = null;
    S.nav.recoveryLink = null;
    document.body.classList.add("navigating");
    draw();
    setTimeout(() => {
      S.map.invalidateSize();
      S.map.fitBounds(
        r.coords.map((c) => [+c[1], +c[0]]),
        { padding: [70, 70] },
      );
    }, 120);
    await keepAwake();
    try {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } catch {}
    $("#navInstruction").textContent =
      "Autorisez la position précise du téléphone…";
    S.nav.watch = navigator.geolocation.watchPosition(
      updateNavigation,
      navigationError,
      { enableHighAccuracy: true, maximumAge: 1e3, timeout: 2e4 },
    );
  }
  function updateNavigation(g) {
    if (!S.nav.active) return;
    const c = g.coords,
      pos = { lat: c.latitude, lon: c.longitude },
      r = S.routes[S.selected],
      p = nearestProgress(pos, r);
    if (!p) return;
    let speed = Number.isFinite(c.speed) ? Math.max(0, c.speed * 3.6) : null,
      head = Number.isFinite(c.heading) ? c.heading : null;
    if (S.nav.lastPosition) {
      const dt = (g.timestamp - S.nav.lastPosition.time) / 1e3,
        d = meters(pos, S.nav.lastPosition);
      if (speed === null && dt > 0 && dt < 30) speed = (d / dt) * 3.6;
      if (head === null && d > 3) head = bearing(S.nav.lastPosition, pos);
    }
    S.nav.lastPosition = { ...pos, time: g.timestamp };
    S.nav.positions.push([pos.lat, pos.lon]);
    if (S.nav.positions.length > 600) S.nav.positions.shift();
    const icon = L.divIcon({
      className: "",
      html:
        '<div class="gps-dot"><div class="gps-arrow" style="transform:rotate(' +
        (head || 0) +
        'deg)"></div></div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    if (!S.nav.marker)
      S.nav.marker = L.marker([pos.lat, pos.lon], {
        icon: icon,
        zIndexOffset: 1e3,
      }).addTo(S.map);
    else {
      S.nav.marker.setLatLng([pos.lat, pos.lon]);
      S.nav.marker.setIcon(icon);
    }
    if (!S.nav.accuracy)
      S.nav.accuracy = L.circle([pos.lat, pos.lon], {
        radius: c.accuracy,
        color: "#2673e8",
        weight: 1,
        fillOpacity: 0.1,
      }).addTo(S.map);
    else S.nav.accuracy.setLatLng([pos.lat, pos.lon]).setRadius(c.accuracy);
    if (!S.nav.trail)
      S.nav.trail = L.polyline(S.nav.positions, {
        color: "#2673e8",
        weight: 3,
        opacity: 0.55,
      }).addTo(S.map);
    else S.nav.trail.setLatLngs(S.nav.positions);
    const rest = [
      [p.nearest.lat, p.nearest.lon],
      ...r.coords.slice(p.i + 1).map((x) => [+x[1], +x[0]]),
    ];
    if (!S.nav.remaining)
      S.nav.remaining = L.polyline(rest, {
        color: "#1264d8",
        weight: 8,
        opacity: 0.9,
      }).addTo(S.map);
    else S.nav.remaining.setLatLngs(rest);
    $("#navRemaining").textContent = fmtDistance(p.remaining);
    $("#navDeviation").textContent = fmtDistance(p.off);
    $("#navAccuracy").textContent = "± " + Math.round(c.accuracy) + " m";
    $("#navSpeed").textContent =
      speed === null ? "—" : speed.toFixed(1) + " km/h";
    const elapsed = Date.now() - S.nav.startedAt;
    $("#navInstruction").textContent =
      p.remaining < 35 && elapsed > 12e4
        ? "Vous êtes revenu au point d’arrivée."
        : stepText(r, p);
    const offRoute = offRouteMonitor.update({
      deviationMeters: p.off,
      accuracyMeters: c.accuracy,
      timestamp: g.timestamp || Date.now(),
    });
    S.nav.offRoute = offRoute;
    const a = $("#navAlert"), actions = $("#navOffRouteActions");
    if (offRoute.status === "gps_uncertain") {
      a.textContent = "GPS imprécis : l’écart à la trace ne peut pas être confirmé.";
      a.classList.add("show");
      actions?.setAttribute("hidden", "");
    } else if (offRoute.status === "confirming") {
      a.textContent = "Écart détecté, confirmation en cours…";
      a.classList.add("show");
      actions?.setAttribute("hidden", "");
    } else if (offRoute.alert) {
      a.textContent = "Vous êtes à environ " + Math.round(p.off) + " m de la trace depuis au moins 20 secondes.";
      a.classList.add("show");
      actions?.removeAttribute("hidden");
    } else if (offRoute.status === "ignored") {
      a.textContent = "Alerte de sortie de trace ignorée temporairement.";
      a.classList.add("show");
      actions?.setAttribute("hidden", "");
    } else {
      a.textContent = "";
      a.classList.remove("show");
      actions?.setAttribute("hidden", "");
    }
    if (S.nav.follow)
      S.map.setView([pos.lat, pos.lon], Math.max(17, S.map.getZoom()), {
        animate: true,
      });
  }
  function navigationError(e) {
    const m =
      e.code === 1
        ? "Position refusée : autorisez la localisation précise dans le navigateur."
        : e.code === 2
          ? "Signal GPS indisponible. Sortez à ciel ouvert ou réessayez."
          : "Le GPS ne répond pas encore.";
    $("#navInstruction").textContent = m;
    const a = $("#navAlert");
    a.textContent =
      "Le tracé reste visible, mais le guidage ne peut pas connaître votre position.";
    a.classList.add("show");
  }
  function stopNavigation() {
    if (S.nav.watch !== null) navigator.geolocation.clearWatch(S.nav.watch);
    S.nav.watch = null;
    S.nav.active = false;
    S.nav.wake?.release?.().catch(() => {});
    S.nav.wake = null;
    [S.nav.marker, S.nav.accuracy, S.nav.trail, S.nav.remaining, S.nav.recoveryLayer].forEach((x) =>
      x?.remove(),
    );
    S.nav.marker = S.nav.accuracy = S.nav.trail = S.nav.remaining = S.nav.recoveryLayer = null;
    S.nav.recoveryLink = null;
    document.body.classList.remove("navigating");
    try {
      document.exitFullscreen?.();
    } catch {}
    draw();
    setTimeout(() => S.map?.invalidateSize(), 100);
    say("Guidage arrêté. Votre parcours reste prêt.");
  }
  $("#navFollow").onclick = () => {
    S.nav.follow = true;
    $("#navFollow").textContent = "◎ Suivi actif";
    if (S.nav.lastPosition)
      S.map.setView([S.nav.lastPosition.lat, S.nav.lastPosition.lon], 17);
  };
  $("#navOverview").onclick = () => {
    S.nav.follow = false;
    const r = S.routes[S.selected];
    S.map.fitBounds(
      r.coords.map((c) => [+c[1], +c[0]]),
      { padding: [70, 70] },
    );
    $("#navFollow").textContent = "◎ Me suivre";
  };
  $("#navIgnore10").onclick = () => {
    offRouteMonitor.ignore(Date.now());
    $("#navOffRouteActions")?.setAttribute("hidden", "");
    say("Alerte ignorée pendant 10 minutes. La trace reste visible.");
  };
  $("#navContinueNoRecalc").onclick = () => {
    offRouteMonitor.continueWithoutRecalculation();
    $("#navOffRouteActions")?.setAttribute("hidden", "");
    say("Vous continuez sans recalcul. La boucle initiale reste la référence.");
  };
  async function requestRecoveryLink(mode) {
    const route = S.routes[S.selected];
    const current = S.nav.lastPosition;
    if (!route || !current) {
      say("Votre position actuelle n’est pas disponible. La boucle initiale reste affichée.");
      return;
    }
    const nearest = nearestProgress(current, route);
    const start = route.coords?.[0];
    const target = mode === RECOVERY_MODES.START
      ? start
      : nearest ? [nearest.nearest.lon, nearest.nearest.lat] : null;
    if (!Array.isArray(target)) {
      say("La destination de récupération ne peut pas être déterminée.");
      return;
    }
    let request;
    try {
      request = createRecoveryRequest({
        current: [current.lon, current.lat],
        target: [Number(target[0]), Number(target[1])],
        mode,
        profile: S.compiled?.routing?.profile || "foot-walking",
      });
    } catch (error) {
      say(error.message || "Demande de récupération invalide.");
      return;
    }
    const label = mode === RECOVERY_MODES.START ? "retour au départ" : "retour à la trace";
    say("Calcul d’une liaison ORS de " + label + "…");
    const result = await resilientService({
      name: "ors",
      key: `recovery:${mode}:${current.lat.toFixed(5)}:${current.lon.toFixed(5)}:${target[1]}:${target[0]}`,
      allowRetry: true,
      operation: () => recoveryRouteProvider.createLink(request),
    });
    if (!result.ok) {
      showServiceDiagnostic("ors", result);
      say("La liaison de récupération n’a pas pu être calculée. La boucle initiale reste la référence.");
      return;
    }
    const link = result.value;
    S.nav.recoveryLayer?.remove?.();
    S.nav.recoveryLink = link;
    S.nav.recoveryLayer = L.polyline(
      link.coordinates.map((point) => [point[1], point[0]]),
      { color: "#d66a00", weight: 7, opacity: 0.9, dashArray: "10 8" },
    ).addTo(S.map);
    S.map.fitBounds(S.nav.recoveryLayer.getBounds(), { padding: [70, 70] });
    const distance = link.distanceMeters == null ? "" : " · " + fmtDistance(link.distanceMeters);
    say("Liaison ORS de " + label + " affichée" + distance + ". Elle reste distincte de la boucle initiale.");
  }
  $("#navBackToTrace").onclick = () => requestRecoveryLink(RECOVERY_MODES.TRACE);
  $("#navJoinStart").onclick = () => requestRecoveryLink(RECOVERY_MODES.START);
  $("#navStop").onclick = stopNavigation;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && S.nav.active && !S.nav.wake)
      keepAwake();
  });
  window.addEventListener("beforeunload", () => {
    if (S.nav.watch !== null) navigator.geolocation.clearWatch(S.nav.watch);
  });
  const surfaceNames = {
    0: "Surface inconnue",
    1: "Revêtu",
    2: "Non revêtu",
    3: "Asphalte",
    4: "Béton",
    6: "Métal",
    7: "Bois",
    8: "Gravier compacté",
    10: "Gravier",
    11: "Terre",
    12: "Sol / boue",
    13: "Neige / glace",
    14: "Pavés",
    15: "Sable",
    17: "Herbe",
    18: "Dalles engazonnées",
  };
  function extraSummary(extras, key) {
    return extras?.[key]?.summary || [];
  }
  function slopePercent(id) {
    return (
      {
        0: 0,
        1: 1,
        2: 4,
        3: 7,
        4: 10,
        5: 16,
        "-1": 1,
        "-2": 4,
        "-3": 7,
        "-4": 10,
        "-5": 16,
      }[id] || 0
    );
  }
  function surfaceConflict(footwear, id) {
    const fragile = /Pieds nus|Tongs|claquettes|Chaussures de ville/i.test(
        footwear,
      ),
      ordinary = /Sneakers|Baskets classiques|Running|Sandales/i.test(footwear);
    return fragile
      ? [2, 8, 10, 11, 12, 13, 15, 17].includes(id)
      : ordinary
        ? [12, 13, 15].includes(id)
        : false;
  }
  function recoveryMinutesRequested(value) {
    if (value === "5 min faciles") return 5;
    if (value === "10 min faciles") return 10;
    return 0;
  }
  function elevationEvidence(coords, paceKmh, recovery = "") {
    return analyzeElevationProfile(
      coords,
      paceKmh,
      recoveryMinutesRequested(recovery),
    );
  }

  function analyzeORS(f, req, i) {
    const p = f.properties || {},
      sum = p.summary || {},
      extras = p.extras || {},
      coords = f.geometry.coordinates,
      e = elev(coords),
      surfaces = extraSummary(extras, "surface").map((x) => ({
        type: surfaceNames[x.value] || "Surface " + x.value,
        percent: Math.round(x.amount),
        id: +x.value,
      })),
      steep = extraSummary(extras, "steepness"),
      ways = extraSummary(extras, "waytypes").length
        ? extraSummary(extras, "waytypes")
        : extraSummary(extras, "waytype"),
      maxUp = Math.max(
        0,
        ...steep.filter((x) => +x.value > 0).map((x) => slopePercent(+x.value)),
      ),
      maxDown = Math.max(
        0,
        ...steep.filter((x) => +x.value < 0).map((x) => slopePercent(+x.value)),
      ),
      stairs = ways
        .filter((x) => +x.value === 8)
        .reduce((n, x) => n + Number(x.distance || 0), 0),
      walking = sum.duration / 60,
      budget = Math.max(
        1,
        req.time.availableMinutes - (req.time.safetyMarginMinutes || 0),
      ),
      checks = [],
      violations = [];
    const check = (constraint, ok, evidence, unknown = false) => {
      const status = unknown ? "uncertain" : ok ? "respected" : "violated";
      checks.push({
        constraint: constraint,
        status: status,
        evidence: evidence,
      });
      if (status === "violated") violations.push(constraint);
    };
    check(
      "Durée et marge de sécurité",
      walking <= budget,
      Math.round(walking) +
        " min de marche pour " +
        budget +
        " min disponibles",
    );
    if (req.hardConstraints.avoidStairs)
      check(
        "Aucun escalier",
        stairs === 0,
        stairs
          ? Math.round(stairs) + " m de marches détectés"
          : "aucune marche détectée dans les données",
      );
    if (req.effort.maxAscentSlopePercent != null)
      check(
        "Pente montante maximale",
        maxUp <= req.effort.maxAscentSlopePercent,
        maxUp +
          " % détectés pour " +
          req.effort.maxAscentSlopePercent +
          " % demandés",
      );
    if (req.effort.maxDescentSlopePercent != null)
      check(
        "Pente descendante maximale",
        maxDown <= req.effort.maxDescentSlopePercent,
        maxDown +
          " % détectés pour " +
          req.effort.maxDescentSlopePercent +
          " % demandés",
      );
    if (req.effort.maxContinuousAscentMinutes === "none")
      check("Aucune montée", e.up < 5, Math.round(e.up) + " m D+");
    const incompatible = surfaces.filter(
      (x) => surfaceConflict(req.footwear, x.id) && x.percent > 0,
    );
    check(
      "Chaussures et surfaces documentées",
      !incompatible.length,
      incompatible.length
        ? incompatible.map((x) => x.type + " " + x.percent + " %").join(", ")
        : surfaces.length
          ? "aucune incompatibilité détectée"
          : "surface non renseignée",
      !surfaces.length,
    );
    const unknownSurface = surfaces.find((x) => x.id === 0)?.percent || 0,
      confidence = Math.max(35, 85 - unknownSurface / 2),
      diff = Math.abs(walking - req.time.availableMinutes);
    return normalize(
      {
        name: "Candidate " + (i + 1),
        why: "Trace réelle analysée selon le temps, les pentes, les marches, les surfaces documentées et les chaussures portées.",
        metrics: {
          distanceMeters: sum.distance,
          walkingMinutes: walking,
          totalMinutes: walking,
          ascentMeters: e.up,
          descentMeters: e.down,
          maxAscentSlopePercent: maxUp,
          maxDescentSlopePercent: maxDown,
        },
        surfaces: surfaces.map(({ type: type, percent: percent }) => ({
          type: type,
          percent: percent,
        })),
        compatibilityScore: Math.max(
          0,
          Math.round(100 - diff - violations.length * 35 - unknownSurface / 3),
        ),
        pleasureScore: Math.max(20, Math.round(65 - diff / 3)),
        confidenceScore: Math.round(confidence),
        constraintChecks: checks,
        warnings: [
          "L’état actuel, la boue, les obstacles temporaires et les fermetures restent à vérifier.",
        ],
        unknowns: [
          ...(!surfaces.length ? ["surfaces"] : []),
          "état actuel du chemin",
          "obstacles temporaires",
          "fréquentation",
        ],
        geometry: f.geometry,
        steps: (p.segments || [])
          .flatMap((x) => x.steps || [])
          .map((x) => ({
            title: x.instruction,
            instruction: x.instruction,
            durationMinutes: Number(x.duration || 0) / 60,
          })),
        sources: ["OpenRouteService / OpenStreetMap"],
        mode: "api",
        violations: violations,
      },
      i,
    );
  }
  function analyzeORSWithCore(f, req, i) {
    const p = f.properties || {},
      sum = p.summary || {},
      extras = p.extras || {},
      originalCoords = f.geometry.coordinates,
      elevation = elev(originalCoords),
      elevationDetails = elevationEvidence(
        originalCoords,
        req.person?.paceKmh || 3.2,
      ),
      surfaces = extraSummary(extras, "surface").map((x) => ({
        type: surfaceNames[x.value] || "Surface " + x.value,
        percent: Math.round(x.amount),
        id: Number(x.value),
      })),
      terrainEvidence = assessTerrainEvidence({ surfaces, source: "OpenRouteService / OpenStreetMap" }),
      steepness = extraSummary(extras, "steepness"),
      ways = extraSummary(extras, "waytypes").length
        ? extraSummary(extras, "waytypes")
        : extraSummary(extras, "waytype"),
      forwardUp = Math.max(
        0,
        ...steepness
          .filter((x) => Number(x.value) > 0)
          .map((x) => slopePercent(Number(x.value))),
      ),
      forwardDown = Math.max(
        0,
        ...steepness
          .filter((x) => Number(x.value) < 0)
          .map((x) => slopePercent(Number(x.value))),
      ),
      stairsMeters = ways.length
        ? ways
            .filter((x) => Number(x.value) === 8)
            .reduce((total, x) => total + Number(x.distance || 0), 0)
        : null,
      walkingMinutes = Number(sum.duration) / 60,
      compiled = S.compiled || compileConstraints(req),
      base = {
        walkingMinutes: walkingMinutes,
        totalMinutes: walkingMinutes + compiled.time.pauseMinutes,
        startEndDistanceMeters: distance([
          originalCoords[0],
          originalCoords.at(-1),
        ]),
        stairsMeters: stairsMeters,
        surfaces: surfaces,
        regularitySafe: terrainEvidence.regularitySafe,
        minimumWidthMeters: terrainEvidence.minimumWidthMeters,
        exposureSafe: terrainEvidence.exposureSafe,
        ascentMeters: elevationDetails.known ? elevation.up : null,
        maxContinuousAscentMinutes: elevationDetails.completeEnough
          ? elevationDetails.maxContinuousAscentMinutes
          : null,
        maxContinuousDescentMinutes: elevationDetails.completeEnough
          ? elevationDetails.maxContinuousDescentMinutes
          : null,
        elevationCoveragePercent: elevationDetails.coverage,
        elevationQuality: elevationDetails.quality,
        recoverySatisfied: req.effort?.recovery
          ? elevationDetails.recoverySatisfied
          : undefined,
        recoveryMinutesFound: elevationDetails.recoveryMinutesFound,
        shortcuts: compiled.hard.requireShortcuts ? undefined : [],
        directionsCompared: Boolean(compiled.hard.compareDirections),
      },
      forwardAudit = auditRoute(
        { ...base, maxUpPercent: forwardUp, maxDownPercent: forwardDown },
        compiled,
      ),
      reverseAudit = compiled.hard.compareDirections
        ? auditRoute(
            { ...base, maxUpPercent: forwardDown, maxDownPercent: forwardUp },
            compiled,
          )
        : null,
      useReverse =
        reverseAudit &&
        (reverseAudit.blocking.length < forwardAudit.blocking.length ||
          (reverseAudit.blocking.length === forwardAudit.blocking.length &&
            reverseAudit.unknowns.length < forwardAudit.unknowns.length)),
      audit = useReverse ? reverseAudit : forwardAudit,
      coords = useReverse ? [...originalCoords].reverse() : originalCoords,
      maxUp = useReverse ? forwardDown : forwardUp,
      maxDown = useReverse ? forwardUp : forwardDown,
      unknownSurface = surfaces.find((x) => x.id === 0)?.percent || 0,
      hardViolations = audit.violations.filter((x) => x.severity === "hard"),
      hardUnknowns = audit.unknowns.filter((x) => x.severity === "hard"),
      advisoryMisses = audit.checks.filter(
        (x) => x.severity === "advisory" && x.status !== "respected",
      ),
      proposalStatus = audit.admissible
        ? "compatible"
        : hardViolations.length
          ? "adaptation"
          : "verify",
      compatibility = audit.admissible
        ? Math.max(1, 100 - advisoryMisses.length * 6)
        : hardViolations.length
          ? 0
          : Math.max(1, 65 - hardUnknowns.length * 10),
      checks = audit.checks.map((x) => ({
        constraint: x.label,
        status: x.status,
        evidence: x.evidence,
        severity: x.severity,
      }));
    return normalize(
      {
        name: "Candidate " + (i + 1),
        why: `Boucle ORS contrôlée par le noyau commun${useReverse ? " et retenue dans le sens inverse" : ""}.`,
        metrics: {
          distanceMeters: Number(sum.distance) || distance(coords),
          walkingMinutes: walkingMinutes,
          breakMinutes: compiled.time.pauseMinutes,
          totalMinutes: walkingMinutes + compiled.time.pauseMinutes,
          ascentMeters: elevationDetails.known ? elevation.up : null,
          descentMeters: elevationDetails.known ? elevation.down : null,
          maxContinuousAscentMinutes: elevationDetails.completeEnough
            ? elevationDetails.maxContinuousAscentMinutes
            : null,
          maxContinuousDescentMinutes: elevationDetails.completeEnough
            ? elevationDetails.maxContinuousDescentMinutes
            : null,
          elevationCoveragePercent: elevationDetails.coverage,
          recoveryMinutesFound: elevationDetails.recoveryMinutesFound,
          maxAscentSlopePercent: maxUp,
          maxDescentSlopePercent: maxDown,
        },
        surfaces: surfaces,
        terrainEvidence: terrainEvidence,
        compatibilityScore: compatibility,
        pleasureScore: Math.max(
          1,
          Math.round(
            70 -
              Math.abs(walkingMinutes - compiled.time.walkingBudgetMinutes) / 2,
          ),
        ),
        confidenceScore: Math.max(
          1,
          Math.round(90 - audit.unknowns.length * 10 - unknownSurface / 2),
        ),
        constraintChecks: checks,
        warnings: [
          ...hardViolations.map((x) => `${x.label} : violée ; adaptation explicite nécessaire.`),
          ...advisoryMisses.map((x) =>
            `${x.label} : ${x.status === "unknown" ? "à vérifier" : "préférence prudente non satisfaite"}.`,
          ),
        ],
        unknowns: hardUnknowns.map((x) => x.label),
        geometry: { type: "LineString", coordinates: coords },
        steps: (p.segments || [])
          .flatMap((x) => x.steps || [])
          .map((x) => ({
            title: x.instruction,
            instruction: x.instruction,
            durationMinutes: Number(x.duration || 0) / 60,
          })),
        sources: ["OpenRouteService / OpenStreetMap"],
        mode: "api",
        violations: hardViolations.map((x) => x.label),
        proposalStatus,
        canNavigate: proposalStatus === "compatible",
        audit: audit,
      },
      i,
    );
  }
  async function directORS(c, target, req) {
    status(
      "OpenRouteService sécurisé : calcul et analyse de 3 boucles candidates…",
    );
    const result = await resilientService({
      name: "ors",
      key: `${c.lat.toFixed(5)}:${c.lon.toFixed(5)}:${Math.round(target)}`,
      allowRetry: true,
      operation: () =>
        orsProvider.createRoundTrips({
          coordinate: [c.lon, c.lat],
          targetMeters: target,
          compiled: S.compiled,
          count: 3,
        }),
    });
    if (!result.ok) {
      showServiceDiagnostic("ors", result);
      const error = result.error || new Error(result.diagnostic.userMessage);
      error.serviceResult = result;
      error.serviceName = "ors";
      throw error;
    }
    serviceState("ors", "Requête réussie", "ok");
    return result.value.map((f, i) => analyzeORSWithCore(f, req, i));
  }
  function routeFingerprint(route) {
    const coords = route.coords || [];
    if (!coords.length) return `${Math.round(route.distance || 0)}:${Math.round(route.walking || 0)}`;
    const sample = [coords[0], coords[Math.floor(coords.length / 2)], coords.at(-1)]
      .filter(Boolean)
      .map((point) => point.slice(0, 2).map((value) => Number(value).toFixed(4)).join(","))
      .join("|");
    return `${Math.round(route.distance || 0)}:${sample}`;
  }
  function routeSamples(route, maximum = 36) {
    const coords = Array.isArray(route?.coords) ? route.coords : [];
    if (coords.length <= maximum) return coords;
    const sampled = [];
    for (let index = 0; index < maximum; index += 1) {
      sampled.push(coords[Math.round((coords.length - 1) * index / (maximum - 1))]);
    }
    return sampled;
  }
  function pointDistanceMeters(a, b) {
    if (!a || !b) return Infinity;
    const p1 = (Number(a[1]) * Math.PI) / 180;
    const p2 = (Number(b[1]) * Math.PI) / 180;
    const dp = ((Number(b[1]) - Number(a[1])) * Math.PI) / 180;
    const dl = ((Number(b[0]) - Number(a[0])) * Math.PI) / 180;
    const h =
      Math.sin(dp / 2) ** 2 +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  function directedRouteCoverage(source, target, toleranceMeters = 45) {
    const sourcePoints = routeSamples(source);
    const targetPoints = routeSamples(target);
    if (!sourcePoints.length || !targetPoints.length) return 0;
    const covered = sourcePoints.filter((point) =>
      targetPoints.some((candidate) => pointDistanceMeters(point, candidate) <= toleranceMeters),
    ).length;
    return covered / sourcePoints.length;
  }
  function routeGeometricOverlap(a, b) {
    return Math.min(directedRouteCoverage(a, b), directedRouteCoverage(b, a));
  }
  function routesAreDistinct(a, b, maximumOverlap = 0.72) {
    return routeGeometricOverlap(a, b) < maximumOverlap;
  }
  function diverseRoutes(routes, maximum = 3) {
    const selected = [];
    for (const route of routes) {
      if (selected.every((existing) => routesAreDistinct(route, existing))) {
        selected.push(route);
        if (selected.length >= maximum) break;
      }
    }
    return selected;
  }
  function respectsTime(route) {
    return route.audit?.checks?.some(
      (check) => check.id === "time" && check.status === "respected",
    );
  }
  const wait = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));
  function retryDelay(error) {
    const seconds = Number(error?.retryAfterSeconds);
    return Number.isFinite(seconds) && seconds > 0 ? Math.min(60, seconds) : null;
  }
  async function direct(req) {
    const c = await geocode();
    await loadWeatherFor(c.lat, c.lon, req.time?.availableMinutes);
    const requestedTarget = Math.max(500, S.compiled.targetMeters),
      targetFactors = [1, 0.78, 0.58, 0.4],
      unique = new Map();
    const engine = "OpenRouteService sécurisé";
    let completedBatches = 0;
    try {
      for (let batchIndex = 0; batchIndex < targetFactors.length; batchIndex += 1) {
        const factor = targetFactors[batchIndex];
        const target = Math.max(500, Math.round(requestedTarget * factor));
        status(
          completedBatches
            ? `Aucune proposition ne respecte encore votre temps : nouvelle recherche plus courte (${Math.round(factor * 100)} % de la cible initiale)…`
            : "OpenRouteService sécurisé : calcul et analyse de 3 boucles candidates…",
        );
        if (batchIndex > 0) await wait(1200);
        let batch;
        try {
          batch = await directORS(c, target, req);
        } catch (error) {
          const delay = retryDelay(error);
          if (delay == null) throw error;
          status(
            `OpenRouteService demande une pause. Nouvelle tentative dans ${delay} seconde${delay > 1 ? "s" : ""}…`,
          );
          await wait(delay * 1000);
          batch = await directORS(c, target, req);
        }
        completedBatches += 1;
        for (const route of batch) {
          const key = routeFingerprint(route);
          const previous = unique.get(key);
          if (!previous || (route.compatibility || 0) > (previous.compatibility || 0))
            unique.set(key, route);
        }
        const current = [...unique.values()];
        const acceptable = current.filter(
          (route) => route.proposalStatus !== "adaptation" && respectsTime(route),
        );
        if (diverseRoutes(acceptable, 3).length >= 3) break;
      }
    } catch (e) {
      serviceState("ors", "Indisponible", "error");
      if (!unique.size) {
        if (e?.serviceResult) throw e;
        const wrapped = Error(
          "OpenRouteService est indisponible : aucun repli non vérifié n’a été utilisé. " +
            e.message,
        );
        wrapped.serviceName = "ors";
        wrapped.serviceResult = {
          ok: false,
          attempts: 1,
          diagnostic: globalThis.JMMJSServiceResilienceCore.classifyServiceError(
            e,
            "OpenRouteService",
          ),
        };
        throw wrapped;
      }
    }
    let all = [...unique.values()];
    status("Documentation du terrain avec OpenStreetMap…");
    const terrainChecked = [];
    for (const route of all) {
      try {
        const rawTerrain = await resilientService({
          name: "overpass",
          key: "terrain",
          allowRetry: true,
          allowCache: true,
          operation: () => overpassProvider.inspect({ route }),
        });
        if (!rawTerrain.ok) {
          terrainChecked.push(markOverpassUnavailable(route, rawTerrain.diagnostic?.message));
          continue;
        }
        const proof = summarizeOverpassTerrain(rawTerrain.value, {
          routeLengthMeters: route.distance,
          retrievedAt: Date.now(),
        });
        const enriched = applyOverpassTerrain(route, proof);
        enriched.terrainProof = summarizeTerrainProof(enriched.terrainEvidence || {});
        terrainChecked.push(enriched);
      } catch (error) {
        const diagnostic = globalThis.JMMJSServiceResilienceCore.classifyServiceError(
          error,
          "Overpass",
        );
        const retained = markOverpassUnavailable(route, diagnostic.message);
        retained.serviceStates = [
          ...(retained.serviceStates || []),
          secondaryServiceWarning("overpass", diagnostic, false),
        ];
        retained.serviceSummary = summarizeServiceStates(retained.serviceStates);
        terrainChecked.push(retained);
      }
    }
    all = terrainChecked;
    status("Contrôle altimétrique complémentaire IGN…");
    const ignChecked = [];
    for (const route of all) {
      try {
        const rawIgn = await resilientService({
          name: "ign",
          key: "elevation",
          allowRetry: true,
          allowCache: true,
          operation: () => ignElevationProvider.inspect({ route }),
        });
        if (!rawIgn.ok) {
          ignChecked.push(markIgnUnavailable(route, rawIgn.diagnostic?.message));
          continue;
        }
        ignChecked.push(applyIgnElevationControl(route, rawIgn.value));
      } catch (error) {
        const diagnostic = globalThis.JMMJSServiceResilienceCore.classifyServiceError(error, "IGN");
        const retained = markIgnUnavailable(route, diagnostic.message);
        retained.serviceStates = [
          ...(retained.serviceStates || []),
          secondaryServiceWarning("ign", diagnostic, false),
        ];
        retained.serviceSummary = summarizeServiceStates(retained.serviceStates);
        ignChecked.push(retained);
      }
    }
    all = ignChecked;
    const requiredServices = S.compiled?.hard?.requiredServices || [];
    const pauseNeedsPoi = ["Avec un banc", "Dans un café", "Près de toilettes"].includes(
      req.pausePlan,
    );
    if (requiredServices.length || pauseNeedsPoi) {
      status("Vérification des services impératifs avant sélection…");
      const verified = [];
      for (const route of all) {
        try {
          const [geoPois, tourismPois] = await Promise.all([geoapifyProvider.enrich({ route, radiusMeters: 300, limit: 50 }).catch(() => []), datatourismeProvider.enrich({ route, radiusMeters: 300, limit: 50 }).catch(() => [])]);
          const pois = mergeTourismPois([geoPois, tourismPois], { maxDistanceMeters: 300, maxDetourMeters: 600 });
          route.pois = pois;
          if (requiredServices.length) {
            const assessment = assessRequiredServices(requiredServices, pois, {
              searched: true,
              providerAvailable: true,
              radiusMeters: 300,
            });
            verified.push(applyServiceAssessment(route, assessment));
          } else verified.push(route);
        } catch (error) {
          if (requiredServices.length) {
            const assessment = assessRequiredServices(requiredServices, [], {
              searched: false,
              providerAvailable: false,
              radiusMeters: 300,
            });
            const checked = applyServiceAssessment(route, assessment);
            const diagnostic =
              globalThis.JMMJSServiceResilienceCore.classifyServiceError(
                error,
                "Geoapify",
              );
            const serviceState = secondaryServiceWarning("geo", diagnostic, true);
            checked.serviceStates = [
              ...(checked.serviceStates || []),
              serviceState,
            ];
            checked.serviceSummary = summarizeServiceStates(checked.serviceStates);
            checked.warnings = [
              ...(checked.warnings || []),
              serviceState.label + " : " + serviceState.message,
            ];
            verified.push(checked);
          } else {
            const diagnostic =
              globalThis.JMMJSServiceResilienceCore.classifyServiceError(
                error,
                "Geoapify",
              );
            const serviceState = secondaryServiceWarning("geo", diagnostic, false);
            route.serviceStates = [
              ...(route.serviceStates || []),
              serviceState,
            ];
            route.serviceSummary = summarizeServiceStates(route.serviceStates);
            route.warnings = [
              ...(route.warnings || []),
              "Point de pause non vérifié : " + serviceState.message,
            ];
            verified.push(route);
          }
        }
      }
      all = verified;
    }
    const weatherChecked = [];
    for (const route of all) {
      const routeWeather = await loadWeatherForRoute(
        route,
        route.walking ?? route.total ?? req.time?.availableMinutes,
      );
      const checked = applyWeatherAssessment(
        route,
        routeWeather.summary,
        routeWeather.assessment,
      );
      checked.weather = routeWeather;
      weatherChecked.push(checked);
    }
    all = weatherChecked;
    all = all.map((route) => {
      const planned = safePlanPauses({
        coords: route.coords,
        walkingMinutes: route.walking ?? route.total,
        pausePlan: req.pausePlan,
        pois: route.pois,
      });
      const paused = applyPausePlan(route, req.pausePlan, planned);
      return synthesizeRoutePresentation(
        applyFallbackAnalysis(
          paused,
          safeAnalyzeFallbacks({
            coords: paused.coords,
            walkingMinutes: paused.walking ?? paused.total,
            shortcutsRequested: Boolean(req.shortcuts),
          }),
        ),
      );
    });
    const compatible = all.filter((x) => x.proposalStatus === "compatible"),
      toVerify = all.filter((x) => x.proposalStatus === "verify"),
      adaptations = all.filter((x) => x.proposalStatus === "adaptation"),
      pool = compatible.length
        ? compatible
        : toVerify.length
          ? toVerify
          : adaptations.length
            ? adaptations
            : all.map((route) => ({
                ...route,
                proposalStatus: "adaptation",
                canNavigate: false,
                why: "Cette géométrie réelle est présentée uniquement comme base d’adaptation explicite. Elle ne doit pas être suivie tant que les limites signalées ne sont pas résolues.",
              }));
    const walkingBudget = Math.max(1, Number(S.compiled?.time?.walkingBudgetMinutes) || 1);
    const ratio = (route) => (Number(route.walking ?? route.total) || 0) / walkingBudget;
    const inRange = (route, minimum, maximum) => {
      const value = ratio(route);
      return value >= minimum && value <= maximum;
    };
    const rangeDistance = (route, minimum, maximum, target) => {
      const value = ratio(route);
      if (value < minimum) return minimum - value + Math.abs(target - minimum);
      if (value > maximum) return value - maximum + Math.abs(maximum - target);
      return Math.abs(value - target);
    };
    const numeric = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
    const comfortScore = (route) =>
      rangeDistance(route, 0.45, 0.7, 0.58) * 180 +
      numeric(route.ascent) * 0.08 +
      numeric(route.maxUp) * 2 +
      (100 - numeric(route.confidence)) * 0.35 -
      numeric(route.compatibility) * 0.12;
    const pleasureScore = (route) =>
      rangeDistance(route, 0.75, 1, 0.9) * 150 -
      numeric(route.pleasure) * 0.75 -
      numeric(route.confidence) * 0.2 +
      numeric(route.ascent) * 0.015;
    const tonicScore = (route) =>
      rangeDistance(route, 0.6, 0.95, 0.78) * 130 -
      numeric(route.ascent) * 0.22 -
      numeric(route.distance) * 0.0008 -
      numeric(route.maxUp) * 1.2;
    const micro = [...pool]
      .filter((route) => ratio(route) < 0.4)
      .sort((a, b) => b.compatibility - a.compatibility || b.walking - a.walking);
    const substantial = pool.filter((route) => ratio(route) >= 0.4);
    const selectionPool = substantial.length ? substantial : pool;
    const picks = [];
    const selectProfile = (orientation, name, minimum, maximum, scorer) => {
      const available = selectionPool.filter(
        (route) =>
          !picks.some((pick) => pick.route === route) &&
          picks.every((pick) => routesAreDistinct(route, pick.route)),
      );
      const preferred = available.filter((route) => inRange(route, minimum, maximum));
      const candidates = preferred.length ? preferred : available;
      const route = [...candidates].sort((a, b) => scorer(a) - scorer(b))[0];
      if (route) picks.push({ route, orientation, name });
    };
    selectProfile("confortable", "La plus confortable", 0.45, 0.7, comfortScore);
    selectProfile("agréable", "L’agréable", 0.75, 1, pleasureScore);
    selectProfile("tonique", "La plus tonique", 0.6, 0.95, tonicScore);
    if (picks.length < 3 && micro.length) {
      const route = micro.find(
        (candidate) =>
          !picks.some((pick) => pick.route === candidate) &&
          picks.every((pick) => routesAreDistinct(candidate, pick.route)),
      );
      if (route) picks.push({ route, orientation: "très courte", name: "La très courte" });
    }
    for (const route of selectionPool) {
      if (picks.length >= 3) break;
      if (
        !picks.some((pick) => pick.route === route) &&
        picks.every((pick) => routesAreDistinct(route, pick.route))
      )
        picks.push({ route, orientation: "alternative", name: "Une autre possibilité" });
    }
    const selectedRoutes = picks.map(({ route, orientation, name }) => {
      route.name = name;
      route.orientation = orientation;
      return route;
    });
    selectedRoutes.forEach((x) => {
      if (x.proposalStatus === "verify")
        x.why = "Aucune incompatibilité impérative n’est mesurée, mais une ou plusieurs données essentielles doivent être vérifiées avant de partir.";
      if (x.proposalStatus === "adaptation")
        x.why = "Cette géométrie réelle n’est pas recommandée telle quelle : elle montre l’adaptation minimale à discuter, sans modifier silencieusement vos limites.";
    });
    const resultLabel = compatible.length
      ? "compatible(s)"
      : toVerify.length
        ? "à vérifier avant de partir"
        : "présentée(s) comme adaptation explicite, non recommandée(s) telle(s) quelle(s)";
    status(
      selectedRoutes.length +
        " proposition(s) réelle(s) " +
        resultLabel +
        " parmi " +
        all.length +
        " candidate(s), dont " +
        selectedRoutes.length +
        " géométrie(s) suffisamment différente(s), " +
        completedBatches +
        " palier(s) de distance exploré(s) · " +
        engine,
    );
    setTimeout(() => status(""), 4500);
    return selectedRoutes;
  }
  function auditedGPXCandidate(source, compiled, index) {
    const originalCoords = source.points.map((point) => point.slice(0, 3));
    const summary = summarizePoints(source.points);
    const walkingMinutes =
      summary.distanceMeters / Math.max(1, (compiled.paceKmh * 1e3) / 60);
    const forwardElevation = elevationEvidence(originalCoords, compiled.paceKmh, compiled.request.effort?.recovery || "");
    const reverseCoords = [...originalCoords].reverse();
    const reverseElevation = elevationEvidence(reverseCoords, compiled.paceKmh, compiled.request.effort?.recovery || "");
    const elevationComplete = summary.elevationCoverage >= 0.999;
    const common = {
      walkingMinutes,
      totalMinutes: walkingMinutes + compiled.time.pauseMinutes,
      startEndDistanceMeters: distance([originalCoords[0], originalCoords.at(-1)]),
      surfaces: [],
      terrainEvidence: absentTerrainEvidence("Fichier GPX"),
      ascentMeters: elevationComplete ? summary.ascentMeters : null,
      stairsMeters: null,
      exposureSafe: undefined,
      regularitySafe: undefined,
      minimumWidthMeters: null,
      shortcuts: compiled.hard.requireShortcuts ? undefined : [],
      directionsCompared: Boolean(compiled.hard.compareDirections),
    };
    const recoveryTarget = compiled.request.effort?.recovery;
    const auditFor = (details, ascentMeters) =>
      auditRoute(
        {
          ...common,
          ascentMeters: elevationComplete ? ascentMeters : null,
          maxUpPercent: elevationComplete ? details.maxUpPercent : null,
          maxDownPercent: elevationComplete ? details.maxDownPercent : null,
          maxContinuousAscentMinutes: elevationComplete
            ? details.maxContinuousAscentMinutes
            : null,
          maxContinuousDescentMinutes: elevationComplete
            ? details.maxContinuousDescentMinutes
            : null,
          elevationCoveragePercent: Math.round(summary.elevationCoverage * 100),
          elevationQuality: elevationComplete ? "complete" : "partial-insufficient",
          recoverySatisfied: !recoveryTarget
            ? undefined
            : !elevationComplete
              ? undefined
              : details.recoverySatisfied,
          recoveryMinutesFound: details.recoveryMinutesFound,
        },
        compiled,
      );
    const forwardAudit = auditFor(forwardElevation, summary.ascentMeters);
    const reverseAudit = compiled.hard.compareDirections
      ? auditFor(reverseElevation, summary.descentMeters)
      : null;
    const useReverse =
      reverseAudit &&
      (reverseAudit.blocking.length < forwardAudit.blocking.length ||
        (reverseAudit.blocking.length === forwardAudit.blocking.length &&
          reverseAudit.unknowns.length < forwardAudit.unknowns.length));
    const audit = useReverse ? reverseAudit : forwardAudit;
    const coords = useReverse ? reverseCoords : originalCoords;
    const details = useReverse ? reverseElevation : forwardElevation;
    const hardViolations = audit.violations.filter((item) => item.severity === "hard");
    const hardUnknowns = audit.unknowns.filter((item) => item.severity === "hard");
    let proposalStatus = audit.admissible
      ? "compatible"
      : hardViolations.length
        ? "adaptation"
        : "verify";
    const serviceAssessment = assessRequiredServices(
      compiled.hard.requiredServices || [],
      [],
      { searched: false, providerAvailable: false, radiusMeters: 300 },
    );
    if (serviceAssessment.unknown.length && proposalStatus === "compatible")
      proposalStatus = "verify";
    const coveragePercent = Math.round(summary.elevationCoverage * 100);
    const evidenceNotes = [
      `distance recalculée depuis ${source.points.length} points GPX`,
      elevationComplete
        ? "altitude complète et métriques de relief recalculées"
        : `altitude incomplète (${coveragePercent} % de la distance couverte) : relief invérifiable`,
      summary.recordedDurationMinutes !== null
        ? `durée enregistrée disponible (${Math.round(summary.recordedDurationMinutes)} min), non utilisée pour remplacer l’allure choisie`
        : "horodatage absent ou incomplet",
      "surfaces, marches, largeur et exposition non fournies par le GPX restent invérifiables",
    ];
    const warnings = audit.blocking.map(
      (item) =>
        `${item.label} : ${item.status === "unknown" ? "invérifiable" : "violée"}.`,
    );
    if (!elevationComplete)
      warnings.push(`Altitude GPX incomplète : ${coveragePercent} % de couverture.`);
    return normalize(
      {
        name: source.name,
        orientation: useReverse ? "GPX importé · sens inverse retenu" : "GPX importé",
        why:
          "Trace GPX contrôlée par compileConstraints() et auditRoute(), comme une route ORS. " +
          evidenceNotes.join(" · "),
        metrics: {
          distanceMeters: summary.distanceMeters,
          walkingMinutes,
          breakMinutes: compiled.time.pauseMinutes,
          totalMinutes: walkingMinutes + compiled.time.pauseMinutes,
          ascentMeters: elevationComplete
            ? useReverse
              ? summary.descentMeters
              : summary.ascentMeters
            : null,
          descentMeters: elevationComplete
            ? useReverse
              ? summary.ascentMeters
              : summary.descentMeters
            : null,
          maxContinuousAscentMinutes: elevationComplete
            ? details.maxContinuousAscentMinutes
            : null,
          maxContinuousDescentMinutes: elevationComplete
            ? details.maxContinuousDescentMinutes
            : null,
          elevationCoveragePercent: Math.round(summary.elevationCoverage * 100),
          elevationQuality: elevationComplete ? "complete" : "partial-insufficient",
          maxAscentSlopePercent: elevationComplete ? details.maxUpPercent : null,
          maxDescentSlopePercent: elevationComplete ? details.maxDownPercent : null,
        },
        terrainEvidence: common.terrainEvidence,
        constraintChecks: [
          ...audit.checks.map((item) => ({
            constraint: item.label,
            status: item.status,
            evidence: item.evidence,
            severity: item.severity,
          })),
          ...serviceAssessment.checks.map((item) => ({
            constraint: `Service requis : ${item.service}`,
            status: item.status,
            evidence: item.evidence,
            severity: "hard",
          })),
        ],
        warnings,
        unknowns: audit.unknowns.map((item) => item.label),
        geometry: { coordinates: coords },
        sources: [
          "Fichier GPX importé localement",
          `Distance recalculée (${Math.round(summary.distanceMeters)} m)`,
          `Couverture altitude ${coveragePercent} %`,
        ],
        mode: "gpx",
        violations: hardViolations.map((item) => item.label),
        proposalStatus,
        canNavigate: proposalStatus !== "adaptation",
      },
      index,
    );
  }
  function renderGPXAudit(audit) {
    const target = $("#gpxAuditStatus");
    if (!target) return;
    target.dataset.status = audit?.accepted ? "accepted" : "rejected";
    target.textContent = formatGPXAudit(audit);
    const warnings = Array.isArray(audit?.warnings) ? audit.warnings : [];
    target.title = warnings.join(" ");
  }

  async function parseGPX(file) {
    if (!file) throw Error("Choisissez un GPX.");

    const text = await file.text();
    const inputAudit = auditGPXInput({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      text,
    });
    renderGPXAudit(inputAudit);
    if (!inputAudit.accepted)
      throw Error(inputAudit.errors.join(" "));

    const compiled = S.compiled || compileConstraints(S.request);
    const parsed = parseGPXText(text, file.name.replace(/\.gpx$/i, ""));
    const parsedAudit = auditParsedGPX(parsed);
    renderGPXAudit({
      ...parsedAudit,
      stats: {
        ...inputAudit.stats,
        ...parsedAudit.stats,
      },
      warnings: [
        ...(inputAudit.warnings || []),
        ...(parsedAudit.warnings || []),
      ],
    });
    if (!parsedAudit.accepted)
      throw Error(parsedAudit.errors.join(" "));
    if (parsed[0]?.points?.[0])
      await loadWeatherFor(
        Number(parsed[0].points[0][1]),
        Number(parsed[0].points[0][0]),
        S.request?.time?.availableMinutes,
      );
    const audited = parsed.map((source, index) =>
      auditedGPXCandidate(source, compiled, index),
    );
    const weatherAudited = [];
    for (const route of audited) {
      const routeWeather = await loadWeatherForRoute(
        route,
        route.walking ?? route.total ?? S.request?.time?.availableMinutes,
      );
      const checked = applyWeatherAssessment(
        route,
        routeWeather.summary,
        routeWeather.assessment,
      );
      checked.weather = routeWeather;
      weatherAudited.push(checked);
    }
    const pauseAudited = weatherAudited.map((route) => {
      const planned = safePlanPauses({
        coords: route.coords,
        walkingMinutes: route.walking ?? route.total,
        pausePlan: S.request?.pausePlan,
        pois: route.pois,
      });
      const paused = applyPausePlan(route, S.request?.pausePlan, planned);
      return synthesizeRoutePresentation(
        applyFallbackAnalysis(
          paused,
          safeAnalyzeFallbacks({
            coords: paused.coords,
            walkingMinutes: paused.walking ?? paused.total,
            shortcutsRequested: Boolean(S.request?.shortcuts),
          }),
        ),
      );
    });
    const compatible = pauseAudited.filter((route) => route.proposalStatus === "compatible");
    const toVerify = pauseAudited.filter((route) => route.proposalStatus === "verify");
    const adaptations = pauseAudited.filter((route) => route.proposalStatus === "adaptation");
    const pool = compatible.length
      ? compatible
      : toVerify.length
        ? toVerify
        : adaptations;
    const selected = diverseRoutes(pool, 3);
    const label = compatible.length
      ? "compatible(s)"
      : toVerify.length
        ? "à vérifier avant de partir"
        : "présentée(s) comme adaptation explicite";
    status(
      `${selected.length} trace(s) GPX ${label} parmi ${audited.length} trace(s) ou segment(s) analysé(s) · audit universel`,
    );
    setTimeout(() => status(""), 4500);
    return selected;
  }
  $("#form").addEventListener("input", () => {
    if (S.step === 3) renderConstraintSummary();
  });
  $("#form").addEventListener("change", () => {
    if (S.step === 3) renderConstraintSummary();
  });
  $("#form").onsubmit = async (e) => {
    e.preventDefault();
    const departureValidation = validateDepartureSchedule();
    if (!departureValidation.valid)
      return say(departureValidation.message);
    requestGovernor.beginSearch();
    S.requestCounts = { ors: 0, geo: 0, mapillary: 0, weather: 0, geocode: 0 };
    S.request = mergeStructuredLimitationIntoRequest(buildRequest());
    S.compiled = compileConstraints(S.request);
    const miss = [];
    if (!S.request.start.label && !Number.isFinite(S.request.start.latitude))
      miss.push("départ");
    if (!S.request.footwear) miss.push("chaussures");
    if (S.compiled.time.walkingBudgetMinutes <= 0)
      miss.push("temps disponible après marge et pauses");
    if (miss.length) return say("À compléter : " + miss.join(", "));
    save(S.request);
    $("#create").disabled = true;
    try {
      if (S.mode === "api") {
        S.routes = await direct(S.request);
        S.selected = 0;
        render();
      } else {
        S.routes = await parseGPX($("#gpxFile").files[0]);
        S.selected = 0;
        render();
      }
    } catch (x) {
      const blockingServiceFailure = x?.serviceResult
        ? showBlockingServiceFailure(x.serviceResult, x.serviceName || "ors")
        : null;
      if (!blockingServiceFailure) status("");
      S.step = 3;
      document.querySelectorAll(".step").forEach((step, index) =>
        step.classList.toggle("active", index === 3),
      );
      if (!blockingServiceFailure)
        say(
          "Le calcul n’a pas été réinitialisé. Erreur : " +
            (x?.message || "erreur inconnue"),
        );
      renderConstraintSummary();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      $("#create").disabled = false;
    }
  };
  const departureMode = $("#departureMode");
  const departureDate = $("#departureDate");
  const departureTime = $("#departureTime");
  if (departureDate) departureDate.min = localDateValue(new Date());
  if (departureTime && !departureTime.value)
    departureTime.value = localTimeValue(new Date());
  if (departureMode) {
    departureMode.addEventListener("change", updateDepartureControls);
    departureDate?.addEventListener("change", () => {
      if ($("#departureMode")?.value === "scheduled")
        void refreshWeatherPreview();
    });
    departureTime?.addEventListener("change", () => {
      if ($("#departureMode")?.value === "scheduled")
        void refreshWeatherPreview();
    });
    updateDepartureControls();
  }

  function ensurePrivacyDetailsDialog() {
    let modal = $("#privacyDetailsModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "privacyDetailsModal";
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "privacyDetailsTitle");
    modal.innerHTML =
      '<div class="modal-card clear-data-card"><h2 id="privacyDetailsTitle">Données et services externes</h2><p>Vos limitations, douleurs, fatigue, âge, texte libre, chaussures et équipements ne sont pas envoyés aux fournisseurs cartographiques.</p><p>Lors d’un calcul ou d’un enrichissement, seules les données techniques nécessaires sont transmises : coordonnées de départ, géométrie ou zone de recherche, paramètres de routage et moment utile pour la météo.</p><p id="privacyTransmissionStatus">Aucune transmission effectuée dans cette session.</p><h3>Incidents techniques de la session</h3><div id="serviceIncidentSummary"><p>Aucun incident technique enregistré.</p></div><div class="modal-actions"><button type="button" id="clearServiceIncidents">Effacer l’historique technique</button><button type="button" id="closePrivacyDetails">Fermer</button></div></div>';
    document.body.appendChild(modal);
    $("#closePrivacyDetails").onclick = () => modal.classList.remove("show");
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.classList.remove("show");
    });
    return modal;
  }

  const privacyDetailsButton = $("#privacyDetailsBtn");
  if (privacyDetailsButton)
    privacyDetailsButton.onclick = () => {
      const modal = ensurePrivacyDetailsDialog();
      const summary = sessionPrivacyController.summary();
      const status = $("#privacyTransmissionStatus");
      if (status)
        status.textContent = summary.transmissionCount
          ? `${summary.transmissionCount} transmission${summary.transmissionCount > 1 ? "s" : ""} technique${summary.transmissionCount > 1 ? "s" : ""} dans cette session. Données de santé transmises : aucune.`
          : "Aucune transmission effectuée dans cette session.";
      const incidents = serviceObservability.list({ failuresOnly: true });
      const incidentSummary = $("#serviceIncidentSummary");
      if (incidentSummary)
        incidentSummary.innerHTML = incidents.length
          ? `<ul>${incidents.slice(-5).reverse().map((item) => `<li><strong>${esc(item.service)}</strong> · ${esc(item.message)} <small>${esc(new Date(item.at).toLocaleString("fr-FR"))} · code ${esc(item.code)} · ${item.attempts} tentative${item.attempts > 1 ? "s" : ""}</small></li>`).join("")}</ul><p>${incidents.length} incident${incidents.length > 1 ? "s" : ""} conservé${incidents.length > 1 ? "s" : ""} dans cette session, sans coordonnées ni données de santé.</p>`
          : "<p>Aucun incident technique enregistré.</p>";
      const clearIncidents = $("#clearServiceIncidents");
      if (clearIncidents) clearIncidents.onclick = () => {
        serviceObservability.clear();
      clearOfflineSnapshot(globalThis.localStorage);
        if (incidentSummary) incidentSummary.innerHTML = "<p>Aucun incident technique enregistré.</p>";
      };
      modal.classList.add("show");
      $("#closePrivacyDetails")?.focus();
    };

  const privateCheckbox = $("#private");
  if (privateCheckbox) {
    const privacyStatus = document.createElement("small");
    privacyStatus.id = "privacyStatus";
    privacyStatus.className = "privacy-status";
    privateCheckbox.closest("label")?.insertAdjacentElement(
      "afterend",
      privacyStatus,
    );
    privateCheckbox.addEventListener("change", updatePrivacyStatus);
    updatePrivacyStatus();
  }

  document.addEventListener("click", (event) => {
    const failureAction = event.target.closest(".service-failure-action");
    if (failureAction) {
      const action = failureAction.dataset.serviceAction;
      if (action === "retry") {
        status("");
        $("#create")?.click();
      }
      if (action === "edit-request") {
        status("");
        go(1);
      }
      if (action === "change-start") {
        status("");
        go(0);
        $("#place")?.focus();
      }
      if (action === "home") {
        status("");
        go(0);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
    const button = event.target.closest(".service-retry");
    if (!button) return;
    const action = button.dataset.retry;
    if (action === "pois") void loadPois();
    if (action === "photos") void loadPhotos();
  });

  $("#loadPois").onclick = loadPois;
  $("#loadPhotos").onclick = loadPhotos;
  $("#helpBtn").onclick = () => $("#helpModal").classList.add("show");
  $("#closeHelp").onclick = () => $("#helpModal").classList.remove("show");
  function ensureClearDataDialog() {
    let modal = $("#clearDataModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "clearDataModal";
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML =
      '<div class="modal-card clear-data-card"><h2>Effacer mes données ?</h2><p>Le profil local, les préférences et les résultats mémorisés seront supprimés de cet appareil.</p><div class="modal-actions"><button type="button" id="cancelClearData">Annuler</button><button type="button" class="danger" id="confirmClearData">Effacer</button></div></div>';
    document.body.appendChild(modal);
    $("#cancelClearData").onclick = () => modal.classList.remove("show");
    $("#confirmClearData").onclick = () => {
      privacyController.purge();
      sessionPrivacyController.clearSession();
      serviceObservability.clear();
      clearOfflineSnapshot(globalThis.localStorage);
      modal.classList.remove("show");
      location.reload();
    };
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.classList.remove("show");
    });
    return modal;
  }

  $("#clearBtn").onclick = () => {
    const modal = ensureClearDataDialog();
    modal.classList.add("show");
    $("#confirmClearData")?.focus();
  };
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  mode("api");
  $("#duration").dispatchEvent(new Event("input"));
})();
