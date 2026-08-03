(() => {
  "use strict";
  const {
    ConstraintRegistry: ConstraintRegistry,
    compileConstraints: compileConstraints,
    auditRoute: auditRoute,
  } = globalThis.JMMJSRouteEngineCore;
  const { parseGPXText, summarizePoints } = globalThis.JMMJSGPXCore;
  const { assessTerrainEvidence, absentTerrainEvidence } = globalThis.JMMJSTerrainEvidenceCore;
  const { assessRequiredServices, applyServiceAssessment } = globalThis.JMMJSServicesCore;
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
  const { safePlanPauses, applyPausePlan } = globalThis.JMMJSPausePlannerCore;
  const { safeAnalyzeFallbacks, applyFallbackAnalysis } = globalThis.JMMJSFallbackCore;
  const privacyController = globalThis.JMMJSPrivacyCore.createPrivacyController({
    storage: globalThis.localStorage,
  });
  const { analyzeElevationProfile } = globalThis.JMMJSElevationProfileCore;
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
  function countRequest(name, n = 1) {
    S.requestCounts[name] = (S.requestCounts[name] || 0) + n;
    const x = $('[data-count="' + name + '"]');
    if (x) x.textContent = S.requestCounts[name];
  }
  const serviceClient = globalThis.JMMJSServiceClient.createServiceClient({
    baseUrl: SERVICE_PROXY,
    fetchImpl: fetch,
    onRequest: countRequest,
  });
  const peripherals =
    globalThis.JMMJSPeripheralRegistry.createPeripheralRegistry();
  peripherals.register(
    globalThis.JMMJSORSProvider.createORSProvider({ client: serviceClient }),
  );
  const orsProvider = peripherals.require("ors");
  async function proxyFetch(name, path, body, count = 1) {
    return serviceClient.post(name, path, body, count);
  }
  async function testService(name) {
    const button = $('[data-test="' + name + '"]');
    button.disabled = true;
    serviceState(name, "Test…");
    try {
      await proxyFetch(name, "/test", { service: name });
      serviceState(name, "Connecté", "ok");
      say("Connexion sécurisée vérifiée.");
    } catch (e) {
      serviceState(name, "Échec", "error");
      say(e.message);
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
    const r = await fetch(
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" +
          encodeURIComponent(q),
        { headers: { "Accept-Language": "fr" } },
      ),
      a = await r.json();
    if (!r.ok || !a.length) throw Error("Lieu introuvable.");
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

  async function render() {
    S.routes = S.routes.map(ensurePauseMarkers);
    E.placeholder.style.display = "none";
    E.map.classList.add("show");
    E.results.classList.add("show");
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
      const assessment = assessForecast(summary);
      S.weather = {
        summary,
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
        results.push({
          point,
          summary,
          assessment: assessForecast(summary),
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

    return (
      detailRows +
      '<div class="weather-detail-meta">' +
      [apparent, coverage, precipitation, visibilityLabel, source]
        .filter(Boolean)
        .map((item) => '<span>' + esc(item) + '</span>')
        .join("") +
      '</div>'
    );
  }

  function bindWeatherDetails(scope) {
    if (!scope) return;
    scope.querySelectorAll(".weather-details-toggle").forEach((detailsToggle) => {
      if (detailsToggle.dataset.bound === "true") return;
      const container = detailsToggle.closest(".weather-compact");
      const detailsPanel = container?.querySelector(".weather-details-panel");
      if (!detailsPanel) return;

      detailsToggle.dataset.bound = "true";
      detailsToggle.onclick = () => {
        const expanded = detailsToggle.getAttribute("aria-expanded") === "true";
        detailsToggle.setAttribute("aria-expanded", String(!expanded));
        detailsToggle.setAttribute(
          "aria-label",
          expanded ? "Afficher le détail météo" : "Masquer le détail météo",
        );
        detailsPanel.hidden = expanded;
      };
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
      const pois = await geoapifyProvider.enrich({ route: r });
      r.pois = pois;
      E.poiContent.innerHTML = pois.length
        ? '<div class="poi-list">' +
          pois
            .map(
              (p) =>
                '<article class="poi-item"><strong>' +
                esc(p.name) +
                "</strong><span>" +
                esc(p.type) +
                " · " +
                p.distance +
                " m de la trace</span><span>Accessibilité : inconnue</span></article>",
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
      serviceState("geo", "Connecté", "ok");
      say(pois.length + " point(s) utile(s) trouvé(s).");
    } catch (e) {
      serviceState("geo", "Échec", "error");
      E.poiContent.innerHTML =
        '<p class="empty-data">Recherche Geoapify impossible : ' +
        esc(e.message) +
        "</p>";
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
      const data = await proxyFetch("mapillary", "/mapillary/images", {
          coordinates: r.coords,
        }),
        extra = Math.max(0, Number(data.requestCount || 1) - 1);
      if (extra) countRequest("mapillary", extra);
      const unique = new Map();
      (data.data || []).forEach((photo) => {
        const c = photo.geometry?.coordinates;
        if (
          !photo.id ||
          !photo.thumb_1024_url ||
          !c ||
          unique.has(String(photo.id))
        )
          return;
        const d = Math.round(nearestRouteDistance(c, r.coords));
        if (d <= 120)
          unique.set(String(photo.id), {
            id: String(photo.id),
            sequence: String(photo.sequence?.id || photo.sequence || ""),
            capturedAt: Number(photo.captured_at),
            date: captureDate(Number(photo.captured_at)),
            thumb: photo.thumb_1024_url,
            lon: c[0],
            lat: c[1],
            distance: d,
          });
      });
      const candidates = [...unique.values()].sort(
          (a, b) =>
            (b.capturedAt || 0) - (a.capturedAt || 0) ||
            a.distance - b.distance,
        ),
        photos = [];
      for (const p of candidates) {
        if (
          photos.some(
            (x) =>
              distanceBetween([p.lon, p.lat], [x.lon, x.lat]) < 60 ||
              (p.sequence &&
                p.sequence === x.sequence &&
                Math.abs((p.capturedAt || 0) - (x.capturedAt || 0)) < 6e4),
          )
        )
          continue;
        photos.push(p);
        if (photos.length === 12) break;
      }
      E.photoContent.innerHTML = photos.length
        ? '<div class="photo-list">' +
          photos
            .map(
              (p) =>
                '<article class="photo-item"><button type="button" data-photo="' +
                esc(p.id) +
                '"><img src="' +
                esc(p.thumb) +
                '" alt="Photographie Mapillary près du parcours" loading="lazy"><span class="photo-meta"><strong>' +
                esc(p.date) +
                "</strong><br>" +
                p.distance +
                " m de la trace</span></button></article>",
            )
            .join("") +
          "</div>"
        : '<p class="empty-data">Aucune photographie à moins de 120 m. Cela ne renseigne pas l’état du terrain.</p>';
      S.photoLayers.forEach((x) => x.remove());
      S.photoLayers = [];
      S.photoMarkers = new Map();
      photos.forEach((p) => {
        const html =
            '<div class="mapillary-popup"><strong>Photo Mapillary</strong><img src="' +
            esc(p.thumb) +
            '" alt="Photo Mapillary"><small>' +
            esc(p.date) +
            " · " +
            p.distance +
            ' m</small><small>Photographie indicative, potentiellement ancienne. Elle ne garantit pas l’état actuel du passage.</small><a href="https://www.mapillary.com/app/?pKey=' +
            encodeURIComponent(p.id) +
            '&focus=photo" target="_blank" rel="noopener">Voir dans Mapillary ↗</a></div>',
          marker = L.circleMarker([p.lat, p.lon], {
            radius: 6,
            color: "#54777a",
            fillColor: "#fff",
            fillOpacity: 1,
            weight: 3,
          })
            .addTo(S.map)
            .bindPopup(html, { maxWidth: 260 });
        S.photoLayers.push(marker);
        S.photoMarkers.set(p.id, marker);
      });
      $$("[data-photo]").forEach(
        (b) =>
          (b.onclick = () => {
            const p = photos.find((x) => x.id === b.dataset.photo),
              m = S.photoMarkers.get(b.dataset.photo);
            if (p) {
              S.map.setView([p.lat, p.lon], Math.max(17, S.map.getZoom()));
              m?.openPopup();
            }
          }),
      );
      r.terrainProof = summarizeTerrainProof(r.terrainEvidence || {}, {
        photos,
      });
      renderDetail();
      serviceState("mapillary", "Connecté", "ok");
      say(photos.length + " photographie(s) indicative(s).");
    } catch (e) {
      serviceState("mapillary", "Échec", "error");
      E.photoContent.innerHTML =
        '<p class="empty-data">Recherche Mapillary impossible : ' +
        esc(e.message) +
        "</p>";
    } finally {
      button.disabled = false;
      button.textContent = "Rechercher";
    }
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
      '</div><div class="detail-top"><div><span class="kicker">Profil d’altitude</span>' +
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
      "</details><details><summary>Sources</summary>" +
      list(r.sources) +
      '</details><div class="exports">' +
      (r.canNavigate
        ? '<button class="small start-nav" id="startNavBtn">▶ Phase 2 · Suivre ce trajet</button>'
        : '<button class="small" disabled title="Validez d’abord l’adaptation ou vérifiez les données manquantes">Trajet non recommandé tel quel</button>') +
      '<div class="export-certification" id="exportCertification"></div><button class="small" id="gpxBtn">↓ GPX exact</button><button class="small" id="jsonBtn">↓ JSON</button><a class="small" id="googleBtn" target="_blank" rel="noopener">Google Maps simplifié ↗</a><a class="small" id="appleBtn" target="_blank" rel="noopener">Plans simplifié ↗</a><button class="small" id="printBtn">Imprimer</button></div>';
    bindWeatherDetails(E.detail);
    if ($("#startNavBtn")) $("#startNavBtn").onclick = startNavigation;
    const exportAudit = auditRouteExport(r);
    const certification = $("#exportCertification");
    if (certification) {
      certification.dataset.status = exportAudit.exactEligible
        ? "exact"
        : "unavailable";
      certification.textContent = exportAudit.exactEligible
        ? `Géométrie exacte certifiée · ${exportAudit.coordinateCount} points · boucle fermée à ${exportAudit.closureMeters} m`
        : `Export exact indisponible · ${exportAudit.reasons.join(" ")}`;
    }

    const gpxButton = $("#gpxBtn");
    gpxButton.disabled = !exportAudit.exactEligible;
    gpxButton.title = exportAudit.exactEligible
      ? `GPX exact certifié · ${exportAudit.coordinateCount} points · fermeture ${exportAudit.closureMeters} m`
      : `GPX exact indisponible : ${exportAudit.reasons.join(" ")}`;
    gpxButton.textContent = exportAudit.exactEligible
      ? "↓ GPX exact"
      : "GPX exact indisponible";
    gpxButton.onclick = gpx;

    $("#jsonBtn").onclick = () =>
      download(
        JSON.stringify(buildJsonExport(r), null, 2),
        slug(r.name) + ".json",
      );
    $("#printBtn").onclick = () => print();

    const links = mapLinks(r);
    $("#googleBtn").href = links.google || "#";
    $("#appleBtn").href = links.apple || "#";
    $("#googleBtn").title =
      "Itinéraire simplifié : Google Maps ne reprend pas tous les points de la trace.";
    $("#appleBtn").title =
      "Itinéraire simplifié : Plans ne reprend pas tous les points de la trace.";
    E.poiPanel.hidden = false;
    E.photoPanel.hidden = false;
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
    S.nav.lastAlong = 0;
    S.nav.positions = [];
    S.nav.startedAt = Date.now();
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
    const limit = Math.max(30, c.accuracy * 1.5),
      alerts = [];
    if (c.accuracy > 50)
      alerts.push("GPS imprécis : fiez-vous aussi au terrain.");
    if (p.off > limit)
      alerts.push(
        "Vous êtes à environ " + Math.round(p.off) + " m de la trace.",
      );
    const a = $("#navAlert");
    a.textContent = alerts.join(" ");
    a.classList.toggle("show", !!alerts.length);
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
    [S.nav.marker, S.nav.accuracy, S.nav.trail, S.nav.remaining].forEach((x) =>
      x?.remove(),
    );
    S.nav.marker = S.nav.accuracy = S.nav.trail = S.nav.remaining = null;
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
    const fs = await orsProvider.createRoundTrips({
      coordinate: [c.lon, c.lat],
      targetMeters: target,
      compiled: S.compiled,
      count: 3,
    });
    serviceState("ors", "Connecté", "ok");
    return fs.map((f, i) => analyzeORSWithCore(f, req, i));
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
      if (!unique.size)
        throw Error(
          "OpenRouteService est indisponible : aucun repli non vérifié n’a été utilisé. " +
            e.message,
        );
    }
    let all = [...unique.values()];
    const requiredServices = S.compiled?.hard?.requiredServices || [];
    const pauseNeedsPoi = ["Avec un banc", "Dans un café", "Près de toilettes"].includes(
      req.pausePlan,
    );
    if (requiredServices.length || pauseNeedsPoi) {
      status("Vérification des services impératifs avant sélection…");
      const verified = [];
      for (const route of all) {
        try {
          const pois = await geoapifyProvider.enrich({ route, radiusMeters: 300, limit: 50 });
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
            checked.warnings = [
              ...(checked.warnings || []),
              "Services impératifs invérifiables : " + error.message,
            ];
            verified.push(checked);
          } else {
            route.warnings = [
              ...(route.warnings || []),
              "Point de pause invérifiable : " + error.message,
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
  async function parseGPX(file) {
    if (!file) throw Error("Choisissez un GPX.");
    const text = await file.text();
    const compiled = S.compiled || compileConstraints(S.request);
    const parsed = parseGPXText(text, file.name.replace(/\.gpx$/i, ""));
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
      status("");
      S.step = 3;
      document.querySelectorAll(".step").forEach((step, index) =>
        step.classList.toggle("active", index === 3),
      );
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

  $("#loadPois").onclick = loadPois;
  $("#loadPhotos").onclick = loadPhotos;
  $("#helpBtn").onclick = () => $("#helpModal").classList.add("show");
  $("#closeHelp").onclick = () => $("#helpModal").classList.remove("show");
  $("#clearBtn").onclick = () => {
    if (confirm("Effacer le profil mémorisé ?")) {
      privacyController.purge();
      location.reload();
    }
  };
  mode("api");
  $("#duration").dispatchEvent(new Event("input"));
})();
