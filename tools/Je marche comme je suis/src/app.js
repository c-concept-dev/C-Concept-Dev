(() => {
  "use strict";
  const {
    ConstraintRegistry: ConstraintRegistry,
    compileConstraints: compileConstraints,
    auditRoute: auditRoute,
  } = globalThis.JMMJSRouteEngineCore;
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
      m === "api" ? "Calculer les boucles réelles" : "Analyser le GPX";
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
        weather: val("#weather"),
      },
      footwear: val("#footwear"),
      equipment: chosen("equipment"),
      limitations: chosen("limits"),
      effort: {
        profile: val("#effort"),
        maxContinuousAscentMinutes: val("#ascentMinutes") || null,
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
  function save(r) {
    if (!$("#private").checked)
      localStorage.setItem("jmmjs-profile", JSON.stringify(r));
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
      maxUp: metric(m.maxAscentSlopePercent),
      maxDown: metric(m.maxDescentSlopePercent),
      terrain: r.terrainTypes || [],
      surfaces: r.surfaces || [],
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
      sources: r.sources || [],
      mode: r.mode || "api",
      violations: r.violations || [],
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
    });
    if (b.length && !S.nav.active) S.map.fitBounds(b, { padding: [24, 24] });
  }
  async function render() {
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
          esc(r.orientation || "option " + (i + 1)) +
          '</span><span class="route-name">' +
          esc(r.name) +
          '</span><span class="metrics"><span class="metric"><b>' +
          (r.distance / 1e3).toFixed(1) +
          '</b><span>km</span></span><span class="metric"><b>' +
          metricLabel(r.total ?? r.walking) +
          '</b><span>min total</span></span><span class="metric"><b>' +
          metricLabel(r.ascent) +
          '</b><span>m D+</span></span></span><span class="scores"><span class="score">Compat. ' +
          metricLabel(r.compatibility) +
          ' %</span><span class="score">Plaisir ' +
          metricLabel(r.pleasure) +
          ' %</span><span class="score">Confiance ' +
          metricLabel(r.confidence) +
          " %</span></span></button>",
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
      ? "<ul>" + a.map((x) => "<li>" + f(x) + "</li>").join("") + "</ul>"
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
  function renderDetail() {
    const r = S.routes[S.selected],
      surfaces = r.surfaces.map(
        (x) => x.type + (x.percent != null ? " " + x.percent + " %" : ""),
      );
    E.detail.innerHTML =
      '<div class="detail-top"><div><span class="kicker">Profil d’altitude</span>' +
      profile(r.coords) +
      '</div><div class="why"><strong>Pourquoi ce parcours ?</strong><br>' +
      esc(r.why || "Non fourni.") +
      '</div></div><div class="data-grid"><div class="data"><b>' +
      metricLabel(r.walking ?? r.total) +
      ' min</b><span>marche</span></div><div class="data"><b>' +
      metricLabel(r.breaks) +
      ' min</b><span>pauses</span></div><div class="data"><b>' +
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
      r.pois.length +
      '</b><span>points d’intérêt</span></div><div class="data"><b>' +
      r.shortcuts.length +
      '</b><span>raccourcis</span></div></div><div class="tags">' +
      [...r.terrain, ...surfaces]
        .map((x) => '<span class="tag">' + esc(x) + "</span>")
        .join("") +
      r.warnings
        .map((x) => '<span class="tag warn">⚠ ' + esc(x) + "</span>")
        .join("") +
      "</div><details open><summary>Contrôles (" +
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
      "</details><details><summary>Carnet étape par étape (" +
      r.steps.length +
      ")</summary>" +
      list(
        r.steps,
        (s) =>
          "<strong>" +
          esc(s.title) +
          "</strong> · " +
          (s.durationMinutes ?? "?") +
          " min — " +
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
      "</details><details><summary>Raccourcis (" +
      r.shortcuts.length +
      ")</summary>" +
      list(
        r.shortcuts,
        (s) => "km " + (s.atKm ?? "?") + " · " + esc(s.description),
      ) +
      "</details><details><summary>Réserves et inconnues</summary>" +
      list([...r.warnings, ...r.unknowns]) +
      "</details><details><summary>Sources</summary>" +
      list(r.sources) +
      '</details><div class="exports"><button class="small start-nav" id="startNavBtn">▶ Phase 2 · Suivre ce trajet</button><button class="small" id="gpxBtn">↓ GPX exact</button><button class="small" id="jsonBtn">↓ JSON</button><a class="small" id="googleBtn" target="_blank">Google Maps simplifié ↗</a><a class="small" id="appleBtn" target="_blank">Plans simplifié ↗</a><button class="small" id="printBtn">Imprimer</button></div>';
    $("#startNavBtn").onclick = startNavigation;
    $("#gpxBtn").onclick = gpx;
    $("#jsonBtn").onclick = () =>
      download(JSON.stringify(r, null, 2), slug(r.name) + ".json");
    $("#printBtn").onclick = () => print();
    const l = mapLinks(r);
    $("#googleBtn").href = l.google;
    $("#appleBtn").href = l.apple;
    E.poiPanel.hidden = false;
    E.photoPanel.hidden = false;
  }
  function select(i) {
    S.selected = i;
    clearEnrichment();
    render();
  }
  function mapLinks(r) {
    const s = [
        r.coords[0],
        ...r.coords
          .slice(1, -1)
          .filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 6)) === 0)
          .slice(0, 6),
        r.coords.at(-1),
      ],
      f = (c) => c[1] + "," + c[0];
    return {
      google:
        "https://www.google.com/maps/dir/?api=1&origin=" +
        encodeURIComponent(f(s[0])) +
        "&destination=" +
        encodeURIComponent(f(s.at(-1))) +
        "&travelmode=walking&waypoints=" +
        encodeURIComponent(s.slice(1, -1).map(f).join("|")),
      apple:
        "https://maps.apple.com/?saddr=" +
        encodeURIComponent(f(s[0])) +
        "&daddr=" +
        encodeURIComponent(s.slice(1).map(f).join("+to:")) +
        "&dirflg=w",
    };
  }
  function gpx() {
    const r = S.routes[S.selected],
      pts = r.coords
        .map(
          (c) =>
            '<trkpt lat="' +
            c[1] +
            '" lon="' +
            c[0] +
            '">' +
            (Number.isFinite(+c[2]) ? "<ele>" + c[2] + "</ele>" : "") +
            "</trkpt>",
        )
        .join(""),
      d = esc([r.why, ...r.warnings].join(" | "));
    download(
      '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Je marche comme je suis" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>' +
        esc(r.name) +
        "</name><desc>" +
        d +
        "</desc></metadata><trk><name>" +
        esc(r.name) +
        "</name><trkseg>" +
        pts +
        "</trkseg></trk></gpx>",
      slug(r.name) + ".gpx",
      "application/gpx+xml",
    );
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
  function elevationEvidence(coords, paceKmh) {
    let maxUpPercent = 0,
      maxDownPercent = 0,
      currentAscentMinutes = 0,
      maxContinuousAscentMinutes = 0,
      recoveryEasyMinutes = 0,
      currentRecoveryMinutes = 0,
      afterAscent = false,
      knownSegments = 0;
    for (let index = 1; index < coords.length; index += 1) {
      const previous = coords[index - 1],
        current = coords[index];
      if (
        !Number.isFinite(Number(previous[2])) ||
        !Number.isFinite(Number(current[2]))
      )
        continue;
      const meters = distance([previous, current]);
      if (meters < 1) continue;
      knownSegments += 1;
      const slope = ((Number(current[2]) - Number(previous[2])) / meters) * 100,
        minutes = meters / Math.max(1, (paceKmh * 1e3) / 60);
      if (slope > 1) {
        maxUpPercent = Math.max(maxUpPercent, slope);
        currentAscentMinutes += minutes;
        maxContinuousAscentMinutes = Math.max(
          maxContinuousAscentMinutes,
          currentAscentMinutes,
        );
        currentRecoveryMinutes = 0;
        afterAscent = true;
      } else {
        if (slope < -1)
          maxDownPercent = Math.max(maxDownPercent, Math.abs(slope));
        if (afterAscent && Math.abs(slope) <= 3) {
          currentRecoveryMinutes += minutes;
          recoveryEasyMinutes = Math.max(
            recoveryEasyMinutes,
            currentRecoveryMinutes,
          );
        } else if (Math.abs(slope) > 3) {
          currentRecoveryMinutes = 0;
        }
        currentAscentMinutes = 0;
      }
    }
    return {
      known: knownSegments > 0,
      maxUpPercent: Math.round(maxUpPercent * 10) / 10,
      maxDownPercent: Math.round(maxDownPercent * 10) / 10,
      maxContinuousAscentMinutes:
        Math.round(maxContinuousAscentMinutes * 10) / 10,
      recoveryEasyMinutes: Math.round(recoveryEasyMinutes * 10) / 10,
    };
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
        ascentMeters: elevationDetails.known ? elevation.up : null,
        maxContinuousAscentMinutes: elevationDetails.known
          ? elevationDetails.maxContinuousAscentMinutes
          : null,
        recoverySatisfied:
          req.effort?.recovery === "5 min faciles"
            ? elevationDetails.known &&
              elevationDetails.recoveryEasyMinutes >= 5
            : req.effort?.recovery === "10 min faciles"
              ? elevationDetails.known &&
                elevationDetails.recoveryEasyMinutes >= 10
              : undefined,
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
      compatibility = audit.admissible
        ? Math.max(1, 100 - audit.unknowns.length * 8)
        : 0,
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
          maxContinuousAscentMinutes: elevationDetails.known
            ? elevationDetails.maxContinuousAscentMinutes
            : 0,
          maxAscentSlopePercent: maxUp,
          maxDescentSlopePercent: maxDown,
        },
        surfaces: surfaces,
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
        warnings: audit.blocking.map(
          (x) =>
            `${x.label} : ${x.status === "unknown" ? "invérifiable" : "violée"}.`,
        ),
        unknowns: audit.unknowns.map((x) => x.label),
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
        violations: audit.blocking.map((x) => x.label),
        audit: audit,
      },
      i,
    );
  }
  async function directORS(c, target, req) {
    status(
      "OpenRouteService sécurisé : calcul et analyse de 6 boucles candidates…",
    );
    const fs = await orsProvider.createRoundTrips({
      coordinate: [c.lon, c.lat],
      targetMeters: target,
      compiled: S.compiled,
      count: 6,
    });
    serviceState("ors", "Connecté", "ok");
    return fs.map((f, i) => analyzeORSWithCore(f, req, i));
  }
  async function direct(req) {
    const c = await geocode(),
      target = S.compiled.targetMeters;
    let all;
    const engine = "OpenRouteService sécurisé";
    if (target < 500)
      throw Error(
        "Le temps restant après les pauses et la marge est insuffisant pour calculer une boucle de 500 m.",
      );
    try {
      all = await directORS(c, target, req);
    } catch (e) {
      serviceState("ors", "Indisponible", "error");
      throw Error(
        "OpenRouteService est indisponible : aucun repli non vérifié n’a été utilisé. " +
          e.message,
      );
    }
    const exact = req.hardConstraints.noSilentCompromise
      ? all.filter((x) => !x.violations?.length)
      : all;
    if (!exact.length)
      throw Error(
        "Aucun parcours exact ne respecte toutes les contraintes impératives. Modifiez une limite explicitement : aucun assouplissement n’a été appliqué.",
      );
    const byComfort = [...exact].sort(
        (a, b) => b.compatibility - a.compatibility || a.ascent - b.ascent,
      ),
      byPleasure = [...exact].sort(
        (a, b) => b.pleasure - a.pleasure || b.confidence - a.confidence,
      ),
      byTonic = [...exact].sort(
        (a, b) => b.ascent - a.ascent || b.distance - a.distance,
      ),
      picks = [];
    [
      byComfort[0],
      byPleasure.find((x) => !picks.includes(x)),
      byTonic.find((x) => !picks.includes(x)),
      ...exact,
    ].forEach((x) => {
      if (x && !picks.includes(x) && picks.length < 3) picks.push(x);
    });
    picks.forEach((x, i) => {
      x.name = ["La plus confortable", "L’agréable", "La plus tonique"][i];
      x.orientation = ["confortable", "agréable", "tonique"][i];
    });
    status(
      picks.length +
        " boucle(s) réelle(s) compatible(s) parmi " +
        all.length +
        " candidate(s) · " +
        engine,
    );
    setTimeout(() => status(""), 4500);
    return picks;
  }
  async function parseGPX(file) {
    if (!file) throw Error("Choisissez un GPX.");
    const d = new DOMParser().parseFromString(
      await file.text(),
      "application/xml",
    );
    if (d.querySelector("parsererror")) throw Error("GPX invalide.");
    const n = [...d.querySelectorAll("trkpt,rtept")];
    if (n.length < 2) throw Error("Trace trop courte.");
    const c = n.map((x) => [
        +x.getAttribute("lon"),
        +x.getAttribute("lat"),
        x.querySelector("ele") ? +x.querySelector("ele").textContent : null,
      ]),
      e = elev(c),
      dist = distance(c),
      compiled = S.compiled || compileConstraints(S.request),
      walkingMinutes = dist / Math.max(1, (compiled.paceKmh * 1e3) / 60),
      elevationDetails = elevationEvidence(c, compiled.paceKmh),
      raw = {
        walkingMinutes: walkingMinutes,
        totalMinutes: walkingMinutes + compiled.time.pauseMinutes,
        startEndDistanceMeters: distance([c[0], c.at(-1)]),
        surfaces: [],
        ascentMeters: elevationDetails.known ? e.up : null,
        maxUpPercent: elevationDetails.known
          ? elevationDetails.maxUpPercent
          : null,
        maxDownPercent: elevationDetails.known
          ? elevationDetails.maxDownPercent
          : null,
        maxContinuousAscentMinutes: elevationDetails.known
          ? elevationDetails.maxContinuousAscentMinutes
          : null,
        recoverySatisfied:
          S.request.effort?.recovery === "5 min faciles"
            ? elevationDetails.known &&
              elevationDetails.recoveryEasyMinutes >= 5
            : S.request.effort?.recovery === "10 min faciles"
              ? elevationDetails.known &&
                elevationDetails.recoveryEasyMinutes >= 10
              : undefined,
        directionsCompared: Boolean(compiled.hard.compareDirections),
      },
      audit = auditRoute(raw, compiled);
    return [
      normalize(
        {
          name: d.querySelector("trk>name,rte>name")?.textContent || file.name,
          orientation: "GPX importé",
          why: "Trace GPX contrôlée par le même noyau que les parcours ORS. Les données de terrain absentes restent invérifiables.",
          metrics: {
            distanceMeters: dist,
            walkingMinutes: walkingMinutes,
            breakMinutes: compiled.time.pauseMinutes,
            totalMinutes: walkingMinutes + compiled.time.pauseMinutes,
            ascentMeters: elevationDetails.known ? e.up : null,
            descentMeters: elevationDetails.known ? e.down : null,
            maxContinuousAscentMinutes: elevationDetails.known
              ? elevationDetails.maxContinuousAscentMinutes
              : 0,
            maxAscentSlopePercent: elevationDetails.known
              ? elevationDetails.maxUpPercent
              : 0,
            maxDescentSlopePercent: elevationDetails.known
              ? elevationDetails.maxDownPercent
              : 0,
          },
          compatibilityScore: audit.admissible
            ? Math.max(1, 100 - audit.unknowns.length * 10)
            : 0,
          confidenceScore: Math.max(1, 80 - audit.unknowns.length * 12),
          constraintChecks: audit.checks.map((item) => ({
            constraint: item.label,
            status: item.status,
            evidence: item.evidence,
            severity: item.severity,
          })),
          warnings: audit.blocking.map(
            (item) =>
              `${item.label} : ${item.status === "unknown" ? "invérifiable" : "violée"}.`,
          ),
          unknowns: audit.unknowns.map((item) => item.label),
          geometry: { coordinates: c },
          sources: ["GPX importé"],
          mode: "gpx",
          violations: audit.blocking.map((item) => item.label),
        },
        0,
      ),
    ];
  }
  $("#form").onsubmit = async (e) => {
    e.preventDefault();
    S.request = buildRequest();
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
      say(x.message);
    } finally {
      $("#create").disabled = false;
    }
  };
  $("#loadPois").onclick = loadPois;
  $("#loadPhotos").onclick = loadPhotos;
  $("#helpBtn").onclick = () => $("#helpModal").classList.add("show");
  $("#closeHelp").onclick = () => $("#helpModal").classList.remove("show");
  $("#clearBtn").onclick = () => {
    if (confirm("Effacer le profil mémorisé ?")) {
      localStorage.removeItem("jmmjs-profile");
      location.reload();
    }
  };
  mode("api");
  $("#duration").dispatchEvent(new Event("input"));
})();
