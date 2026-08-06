const ALLOWED_ORIGINS = new Set([
  "https://htmlpreview.github.io",
  "https://c-concept-dev.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const GEOAPIFY_CATEGORIES = ["amenity", "catering.cafe", "heritage"].join(",");

const ORS_SEEDS = [
  17, 41, 83, 121, 167, 211, 257, 301, 347, 389, 433, 479, 523, 569, 613,
];
const ORS_BATCH_SIZE = 4;
const MAPILLARY_FIELDS = "id,geometry,captured_at,thumb_1024_url,sequence";
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const IGN_ELEVATION_URL =
  "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json";
const IGN_ELEVATION_RESOURCE = "ign_rge_alti_wld";
const DEFAULT_ORS_BASE_URL = "https://api.openrouteservice.org";
const TIMEOUT_MS = {
  ors: 10_000,
  ign: 7_000,
  geoapify: 7_000,
  mapillary: 7_000,
};

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const FALLBACK_START_TAGS = [
  ["amenity", "parking"],
  ["highway", "trailhead"],
  ["tourism", "information"],
  ["leisure", "park"],
  ["public_transport", "station"],
  ["railway", "station"],
  ["amenity", "bus_station"],
];
const FALLBACK_MAX_CANDIDATES = 6;
const FALLBACK_MAX_TESTED = 3;
const FALLBACK_MAX_ORS_ATTEMPTS_PER_START = 2;
const FALLBACK_TARGET_SUCCESSES = 3;

class HTTPError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    Object.assign(this, details);
  }
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function requireOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  if (!ALLOWED_ORIGINS.has(origin))
    throw new HTTPError(403, "Origine non autorisée.");
  return origin;
}

async function readJson(request) {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > 750_000)
    throw new HTTPError(413, "Requête trop volumineuse.");
  let text;
  try {
    text = await request.text();
  } catch {
    throw new HTTPError(400, "Corps de requête illisible.");
  }
  if (new TextEncoder().encode(text).length > 750_000)
    throw new HTTPError(413, "Requête trop volumineuse.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HTTPError(400, "JSON invalide.");
  }
}

async function providerJson(response) {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new HTTPError(
      502,
      `Réponse fournisseur illisible (${response.status}).`,
      { code: "provider-error", upstreamStatus: response.status },
    );
  }
  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      data?.error ||
      `Réponse fournisseur ${response.status}`;
    throw new HTTPError(502, String(message), {
      code: "provider-error",
      upstreamStatus: response.status,
    });
  }
  return data;
}

function classifyORSError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (
    message.includes("cannot find point") ||
    message.includes("could not find routable point")
  )
    return "no-routable-start";
  if (
    message.includes("unable to find a route") ||
    message.includes("couldn't find a route") ||
    message.includes("no route found") ||
    message.includes("no path found")
  )
    return "no-route";
  return "provider-unavailable";
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new HTTPError(400, `${label} invalide.`);
  return number;
}

export function validateBBox(value) {
  if (!Array.isArray(value) || value.length !== 4)
    throw new HTTPError(400, "Rectangle géographique invalide.");
  const [west, south, east, north] = value.map((x, index) =>
    finiteNumber(x, `Coordonnée ${index + 1}`),
  );
  if (
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    west >= east ||
    south >= north
  ) {
    throw new HTTPError(400, "Rectangle géographique hors limites.");
  }
  if (east - west > 0.3 || north - south > 0.3)
    throw new HTTPError(400, "Zone Geoapify trop étendue.");
  return [west, south, east, north];
}

function haversineMeters(a, b) {
  const p1 = (a[1] * Math.PI) / 180;
  const p2 = (b[1] * Math.PI) / 180;
  const dp = ((b[1] - a[1]) * Math.PI) / 180;
  const dl = ((b[0] - a[0]) * Math.PI) / 180;
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function validateCoordinates(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 5000) {
    throw new HTTPError(400, "Trace Mapillary invalide ou trop volumineuse.");
  }
  return value.map((point) => {
    if (!Array.isArray(point) || point.length < 2)
      throw new HTTPError(400, "Point de trace invalide.");
    const lon = finiteNumber(point[0], "Longitude");
    const lat = finiteNumber(point[1], "Latitude");
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90)
      throw new HTTPError(400, "Point de trace hors limites.");
    return [lon, lat];
  });
}

function validateRouteCoordinates(value, maximum, label) {
  if (!Array.isArray(value) || value.length < 2 || value.length > maximum) {
    throw new HTTPError(400, `${label} invalide ou trop volumineuse.`);
  }
  return value.map((point) => {
    if (!Array.isArray(point) || point.length < 2)
      throw new HTTPError(400, `Point ${label.toLowerCase()} invalide.`);
    const lon = finiteNumber(point[0], "Longitude");
    const lat = finiteNumber(point[1], "Latitude");
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90)
      throw new HTTPError(400, `Point ${label.toLowerCase()} hors limites.`);
    return [lon, lat];
  });
}

function pointSegmentDistanceMeters(point, start, end) {
  const latitude = ((point[1] + start[1] + end[1]) / 3) * (Math.PI / 180);
  const scaleX = 111320 * Math.max(0.2, Math.cos(latitude));
  const scaleY = 111320;
  const px = (point[0] - start[0]) * scaleX;
  const py = (point[1] - start[1]) * scaleY;
  const ex = (end[0] - start[0]) * scaleX;
  const ey = (end[1] - start[1]) * scaleY;
  const denominator = ex * ex + ey * ey;
  const ratio = denominator
    ? Math.max(0, Math.min(1, (px * ex + py * ey) / denominator))
    : 0;
  return Math.hypot(px - ratio * ex, py - ratio * ey);
}

function distanceToWayMeters(point, geometry = []) {
  let minimum = Infinity;
  for (let index = 1; index < geometry.length; index += 1) {
    const start = [Number(geometry[index - 1]?.lon), Number(geometry[index - 1]?.lat)];
    const end = [Number(geometry[index]?.lon), Number(geometry[index]?.lat)];
    if (![...start, ...end].every(Number.isFinite)) continue;
    minimum = Math.min(minimum, pointSegmentDistanceMeters(point, start, end));
  }
  return minimum;
}

export function matchTerrainSegments(route, elements, bufferMeters) {
  const ways = (Array.isArray(elements) ? elements : []).filter(
    (item) =>
      item?.type === "way" &&
      Array.isArray(item.geometry) &&
      item.geometry.length >= 2,
  );
  const segments = [];
  for (let index = 1; index < route.length; index += 1) {
    const start = route[index - 1];
    const end = route[index];
    const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    let best = null;
    let bestDistance = Infinity;
    for (const way of ways) {
      const distance = distanceToWayMeters(midpoint, way.geometry);
      if (distance < bestDistance) {
        best = way;
        bestDistance = distance;
      }
    }
    if (!best || bestDistance > bufferMeters) continue;
    segments.push({
      id: best.id ?? null,
      lengthMeters: haversineMeters(start, end),
      tags: best.tags || {},
      matchDistanceMeters: Math.round(bestDistance * 10) / 10,
    });
  }
  return segments;
}

export function sampleRoute(coordinates, maximum = 30) {
  if (coordinates.length <= maximum) return coordinates;
  const cumulative = [0];
  for (let i = 1; i < coordinates.length; i += 1) {
    cumulative.push(
      cumulative[i - 1] + haversineMeters(coordinates[i - 1], coordinates[i]),
    );
  }
  const total = cumulative.at(-1);
  if (!total) return [coordinates[0]];
  const sampled = [];
  let index = 0;
  for (let i = 0; i < maximum; i += 1) {
    const target = (total * i) / (maximum - 1);
    while (index < cumulative.length - 1 && cumulative[index] < target)
      index += 1;
    const previous = Math.max(0, index - 1);
    const chosen =
      Math.abs(cumulative[index] - target) <
      Math.abs(cumulative[previous] - target)
        ? index
        : previous;
    const point = coordinates[chosen];
    if (
      !sampled.length ||
      point[0] !== sampled.at(-1)[0] ||
      point[1] !== sampled.at(-1)[1]
    )
      sampled.push(point);
  }
  return sampled;
}

export function buildMapillaryBoxes(coordinates, radiusMeters = 125) {
  const boxes = sampleRoute(coordinates, 30).map(([lon, lat]) => {
    const padLat = radiusMeters / 111320;
    const padLon =
      radiusMeters / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
    return [lon - padLon, lat - padLat, lon + padLon, lat + padLat];
  });
  const unique = new Map();
  for (const box of boxes) {
    const key = box.map((value) => value.toFixed(4)).join(",");
    if (!unique.has(key)) unique.set(key, box);
  }
  return [...unique.values()];
}

async function testGeoapify(env) {
  if (!env.GEOAPIFY_API_KEY)
    throw new HTTPError(503, "Secret Geoapify non configuré.");
  const query = new URLSearchParams({
    text: "Paris",
    limit: "1",
    apiKey: env.GEOAPIFY_API_KEY,
  });
  const data = await providerJson(
    await fetchWithTimeout(`https://api.geoapify.com/v1/geocode/search?${query}`, {
      headers: { Accept: "application/json" },
    }, TIMEOUT_MS.geoapify),
  );
  return { resultCount: data?.features?.length || 0 };
}

async function testMapillary(env) {
  if (!env.MAPILLARY_ACCESS_TOKEN)
    throw new HTTPError(503, "Secret Mapillary non configuré.");
  const query = new URLSearchParams({
    fields: "id",
    bbox: "2.2940,48.8580,2.2950,48.8590",
    limit: "1",
  });
  const data = await providerJson(
    await fetchWithTimeout(`https://graph.mapillary.com/images?${query}`, {
      headers: {
        Accept: "application/json",
        Authorization: `OAuth ${env.MAPILLARY_ACCESS_TOKEN}`,
      },
    }, TIMEOUT_MS.mapillary),
  );
  return { resultCount: data?.data?.length || 0 };
}

async function testORS(env) {
  if (!env.ORS_API_KEY)
    throw new HTTPError(503, "Secret OpenRouteService non configuré.");
  const data = await fetchORSRoundTrip({
    lon: 2.3522,
    lat: 48.8566,
    target: 1000,
    seed: ORS_SEEDS[0],
    index: 0,
    apiKey: env.ORS_API_KEY,
    points: 3,
    baseUrl: env.ORS_BASE_URL || DEFAULT_ORS_BASE_URL,
  });
  const feature = data?.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new HTTPError(
      502,
      "Le test ORS n’a pas renvoyé de boucle GeoJSON exploitable.",
    );
  }
  return {
    resultCount: 1,
    routeDistanceMeters: Number(feature?.properties?.summary?.distance) || null,
    routeDurationSeconds:
      Number(feature?.properties?.summary?.duration) || null,
  };
}

async function handleTest(request, env, origin) {
  const { service } = await readJson(request);
  if (service === "geo")
    return json(
      { ok: true, service, ...(await testGeoapify(env)) },
      200,
      origin,
    );
  if (service === "mapillary")
    return json(
      { ok: true, service, ...(await testMapillary(env)) },
      200,
      origin,
    );
  if (service === "ors")
    return json({ ok: true, service, ...(await testORS(env)) }, 200, origin);
  throw new HTTPError(400, "Service inconnu.");
}

async function handleGeoapifyPlaces(request, env, origin) {
  if (!env.GEOAPIFY_API_KEY)
    throw new HTTPError(503, "Secret Geoapify non configuré.");
  const { bbox } = await readJson(request);
  const query = new URLSearchParams({
    categories: GEOAPIFY_CATEGORIES,
    filter: `rect:${validateBBox(bbox).join(",")}`,
    limit: "200",
    lang: "fr",
    apiKey: env.GEOAPIFY_API_KEY,
  });
  const data = await providerJson(
    await fetchWithTimeout(`https://api.geoapify.com/v2/places?${query}`, {
      headers: { Accept: "application/geo+json" },
    }, TIMEOUT_MS.geoapify),
  );
  return json(data, 200, origin);
}

async function fetchMapillaryBox(box, env) {
  const query = new URLSearchParams({
    fields: MAPILLARY_FIELDS,
    bbox: box.join(","),
    limit: "30",
  });
  const response = await fetchWithTimeout(`https://graph.mapillary.com/images?${query}`, {
    headers: {
      Accept: "application/json",
      Authorization: `OAuth ${env.MAPILLARY_ACCESS_TOKEN}`,
    },
  }, TIMEOUT_MS.mapillary);
  return providerJson(response);
}

async function handleMapillaryImages(request, env, origin) {
  if (!env.MAPILLARY_ACCESS_TOKEN)
    throw new HTTPError(503, "Secret Mapillary non configuré.");
  const body = await readJson(request);
  const coordinates = validateCoordinates(body.coordinates);
  const boxes = buildMapillaryBoxes(coordinates);
  const unique = new Map();
  const errors = [];
  for (let offset = 0; offset < boxes.length; offset += 6) {
    const settled = await Promise.allSettled(
      boxes.slice(offset, offset + 6).map((box) => fetchMapillaryBox(box, env)),
    );
    for (const result of settled) {
      if (result.status === "rejected") {
        errors.push(
          result.reason?.message || "Recherche Mapillary impossible.",
        );
        continue;
      }
      for (const photo of result.value?.data || []) {
        if (photo?.id && !unique.has(String(photo.id)))
          unique.set(String(photo.id), photo);
        if (unique.size >= 400) break;
      }
    }
    if (unique.size >= 400) break;
  }
  if (!unique.size && errors.length === boxes.length)
    throw new HTTPError(502, errors[0]);
  return json(
    {
      data: [...unique.values()].slice(0, 400),
      requestCount: boxes.length,
      partialErrors: errors.length,
    },
    200,
    origin,
  );
}

async function fetchOverpassWithFallback(query) {
  let lastError = null;
  for (const url of OVERPASS_URLS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "Je-marche-comme-je-suis/1.0",
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) {
        lastError = new Error(`Overpass ${response.status} (${url}).`);
        continue;
      }
      return await response.json();
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
    }
  }
  throw lastError || new Error("Aucune instance Overpass disponible.");
}

async function handleOverpassTerrain(request, origin) {
  const body = await readJson(request);
  const route = validateRouteCoordinates(body.route, 80, "Trace Overpass");
  const bufferMeters = Math.max(
    10,
    Math.min(50, finiteNumber(body.bufferMeters ?? 25, "Tampon Overpass")),
  );
  const line = route.map(([lon, lat]) => `${lat},${lon}`).join(",");
  const query = `[out:json][timeout:20];way["highway"](around:${bufferMeters},${line});out tags geom;`;
  const routeLengthMeters = Math.max(
    0,
    Number(body.routeLengthMeters) ||
      route.slice(1).reduce(
        (total, point, index) => total + haversineMeters(route[index], point),
        0,
      ),
  );
  let data;
  try {
    data = await fetchOverpassWithFallback(query);
  } catch {
    return json(
      {
        segments: [],
        routeLengthMeters,
        retrievedAt: new Date().toISOString(),
        source: "Overpass / OpenStreetMap",
        status: "terrain-unavailable",
      },
      200,
      origin,
    );
  }
  const segments = matchTerrainSegments(route, data?.elements, bufferMeters);
  return json(
    {
      segments,
      routeLengthMeters,
      retrievedAt: new Date().toISOString(),
      source: "Overpass / OpenStreetMap",
      status: "ok",
    },
    200,
    origin,
  );
}

async function handleIgnElevation(request, origin) {
  const body = await readJson(request);
  const route = validateRouteCoordinates(body.route, 120, "Trace IGN");
  const response = await fetchWithTimeout(IGN_ELEVATION_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      lon: route.map((point) => point[0]).join("|"),
      lat: route.map((point) => point[1]).join("|"),
      resource: IGN_ELEVATION_RESOURCE,
      delimiter: "|",
      indent: "false",
      measures: "false",
      zonly: "false",
      profile_mode: "simple",
      sampling: String(route.length),
    }),
  }, TIMEOUT_MS.ign);
  const data = await providerJson(response);
  const elevations = (Array.isArray(data?.elevations) ? data.elevations : [])
    .map((item) => ({
      lon: Number(item?.lon),
      lat: Number(item?.lat),
      z: Number(item?.z),
    }))
    .filter(
      (item) =>
        Number.isFinite(item.lon) &&
        Number.isFinite(item.lat) &&
        Number.isFinite(item.z) &&
        item.z > -99990,
    );
  if (!elevations.length)
    throw new HTTPError(502, "IGN ne couvre pas cette trace altimétrique.");
  return json(
    {
      elevations,
      ascentMeters: Number.isFinite(Number(data?.height_differences?.positive))
        ? Number(data.height_differences.positive)
        : null,
      descentMeters: Number.isFinite(Number(data?.height_differences?.negative))
        ? Math.abs(Number(data.height_differences.negative))
        : null,
      coveragePercent: Math.round((elevations.length / route.length) * 100),
      source: "IGN Géoplateforme · RGE ALTI",
      retrievedAt: new Date().toISOString(),
    },
    200,
    origin,
  );
}

function orsEnvelope(outcome, status, extra = {}) {
  return {
    outcome,
    provider: "ors",
    routes: [],
    requestCount: 0,
    retryable: false,
    ...extra,
  };
}

async function handleORSRoundTrips(request, env, origin) {
  if (!env.ORS_API_KEY)
    return json(
      orsEnvelope("provider-unavailable", 502, { retryable: true }),
      502,
      origin,
    );
  let body;
  try {
    body = await readJson(request);
  } catch {
    return json(orsEnvelope("invalid-request", 400), 400, origin);
  }
  if (!Array.isArray(body.coordinate) || body.coordinate.length !== 2)
    return json(orsEnvelope("invalid-request", 400), 400, origin);
  let lon, lat, target;
  try {
    lon = finiteNumber(body.coordinate[0], "Longitude");
    lat = finiteNumber(body.coordinate[1], "Latitude");
    target = finiteNumber(body.targetMeters, "Distance cible");
  } catch {
    return json(orsEnvelope("invalid-request", 400), 400, origin);
  }
  if (
    Math.abs(lon) > 180 ||
    Math.abs(lat) > 90 ||
    target < 500 ||
    target > 30000
  ) {
    return json(orsEnvelope("invalid-request", 400), 400, origin);
  }
  const routing = sanitizeORSRouting(body);
  const routes = [];
  const failureTypes = [];
  let requestCount = 0;
  let providerFailure = null;
  batches: for (
    let offset = 0;
    offset < ORS_SEEDS.length && routes.length < ORS_BATCH_SIZE;
    offset += ORS_BATCH_SIZE
  ) {
    const seeds = ORS_SEEDS.slice(offset, offset + ORS_BATCH_SIZE);
    const settled = await Promise.allSettled(
      seeds.map((seed, batchIndex) =>
        fetchORSRoundTrip({
          lon,
          lat,
          target,
          seed,
          index: offset + batchIndex,
          apiKey: env.ORS_API_KEY,
          profile: routing.profile,
          routingOptions: routing.options,
          baseUrl: env.ORS_BASE_URL || DEFAULT_ORS_BASE_URL,
        }),
      ),
    );
    requestCount += seeds.length;
    for (const result of settled) {
      if (result.status === "rejected") {
        const type = classifyORSError(result.reason);
        failureTypes.push(type);
        if (type === "provider-unavailable") {
          providerFailure = result.reason;
          break batches;
        }
        continue;
      }
      const feature = result.value?.features?.[0];
      if (
        feature?.geometry?.type === "LineString" &&
        Array.isArray(feature.geometry.coordinates) &&
        feature.geometry.coordinates.length >= 2
      ) {
        routes.push(feature);
      } else {
        failureTypes.push("no-route");
      }
    }
    if (
      !routes.length &&
      failureTypes.length &&
      failureTypes.every((type) => type === "no-routable-start")
    ) {
      break;
    }
  }
  if (providerFailure) {
    const upstreamStatus = providerFailure?.upstreamStatus;
    return json(
      orsEnvelope("provider-unavailable", 502, {
        requestCount,
        retryable: !upstreamStatus || upstreamStatus >= 500,
        providerStatus: upstreamStatus || null,
      }),
      502,
      origin,
    );
  }
  if (routes.length) {
    return json(
      {
        outcome: "success",
        provider: "ors",
        routes,
        requestCount,
        partialErrors: failureTypes.length,
        imperativesPreserved: routing.imperativesPreserved,
        preferencesApplied: routing.preferencesApplied,
        retryable: false,
      },
      200,
      origin,
    );
  }
  const hasNoRoute = failureTypes.includes("no-route");
  if (!hasNoRoute) {
    return json(
      orsEnvelope("no-routable-start", 200, { requestCount }),
      200,
      origin,
    );
  }
  const outcome = routing.preferencesApplied.length
    ? "preferences-too-restrictive"
    : "no-route";
  return json(orsEnvelope(outcome, 200, { requestCount }), 200, origin);
}

function sanitizeORSRouting(body) {
  const profile = body.profile === "wheelchair" ? "wheelchair" : "foot-walking";
  const avoidFeatures =
    Array.isArray(body.avoidFeatures) && body.avoidFeatures.includes("steps")
      ? ["steps"]
      : [];
  const weightings = {};
  for (const key of ["green", "quiet"]) {
    const factor = Number(body.weightings?.[key]?.factor);
    if (Number.isFinite(factor))
      weightings[key] = { factor: Math.max(0, Math.min(1, factor)) };
  }
  const options = {};
  if (avoidFeatures.length) options.avoid_features = avoidFeatures;
  const profileParams = {};
  const preferencesApplied = Object.keys(weightings);
  if (preferencesApplied.length && profile === "foot-walking")
    profileParams.weightings = weightings;
  let imperativesPreserved = true;
  if (profile === "wheelchair") {
    const source = body.restrictions || {};
    const allowedKerb = [0.03, 0.06, 0.1];
    const allowedIncline = [3, 6, 10, 15];
    const requestedKerb = source.maximum_sloped_kerb;
    const requestedIncline = source.maximum_incline;
    if (
      requestedKerb !== undefined &&
      !allowedKerb.includes(Number(requestedKerb))
    )
      imperativesPreserved = false;
    if (
      requestedIncline !== undefined &&
      !allowedIncline.includes(Number(requestedIncline))
    )
      imperativesPreserved = false;
    const restrictions = {
      surface_type: "cobblestone:flattened",
      track_type: "grade1",
      smoothness_type: "good",
      maximum_sloped_kerb: allowedKerb.includes(Number(requestedKerb))
        ? Number(requestedKerb)
        : 0.06,
      maximum_incline: allowedIncline.includes(Number(requestedIncline))
        ? Number(requestedIncline)
        : 6,
    };
    const width = Number(source.minimum_width);
    if (Number.isFinite(width) && width >= 0.5 && width <= 3)
      restrictions.minimum_width = width;
    else if (source.minimum_width !== undefined) imperativesPreserved = false;
    profileParams.restrictions = restrictions;
  }
  if (Object.keys(profileParams).length) options.profile_params = profileParams;
  return { profile, options, preferencesApplied, imperativesPreserved };
}

async function fetchORSRoundTrip({
  lon,
  lat,
  target,
  seed,
  index,
  apiKey,
  points,
  profile = "foot-walking",
  routingOptions = {},
  baseUrl = DEFAULT_ORS_BASE_URL,
}) {
  return providerJson(
    await fetchWithTimeout(
      `${baseUrl}/v2/directions/${profile}/geojson`,
      {
        method: "POST",
        headers: {
          Accept: "application/geo+json",
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coordinates: [[lon, lat]],
          elevation: true,
          instructions: true,
          instructions_format: "text",
          language: "fr",
          extra_info:
            profile === "wheelchair"
              ? [
                  "steepness",
                  "surface",
                  "waytype",
                  "suitability",
                  "waycategory",
                  "roadaccessrestrictions",
                ]
              : [
                  "steepness",
                  "surface",
                  "waytype",
                  "suitability",
                  "green",
                  "noise",
                ],
          options: {
            ...routingOptions,
            round_trip: {
              length: Math.round(target * (0.86 + (index % 5) * 0.07)),
              points: points ?? 5 + (index % 3),
              seed,
            },
          },
        }),
      },
      TIMEOUT_MS.ors,
    ),
  );
}

function buildFallbackStartsQuery(lat, lon, radiusMeters) {
  const clauses = FALLBACK_START_TAGS.map(
    ([key, value]) =>
      `node["${key}"="${value}"](around:${radiusMeters},${lat},${lon});` +
      `way["${key}"="${value}"](around:${radiusMeters},${lat},${lon});`,
  ).join("");
  return `[out:json][timeout:20];(${clauses});out center tags 60;`;
}

function candidateAccess(tags = {}) {
  return {
    parking: tags.amenity === "parking" ? "documented" : "unknown",
    publicTransport:
      tags.public_transport === "station" ||
      tags.railway === "station" ||
      tags.amenity === "bus_station"
        ? "documented"
        : "unknown",
  };
}

function extractFallbackCandidates(elements, origin) {
  const candidates = [];
  for (const element of Array.isArray(elements) ? elements : []) {
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const distanceFromOriginMeters = Math.round(
      haversineMeters([origin.lon, origin.lat], [lon, lat]),
    );
    candidates.push({
      id: `${element.type}/${element.id}`,
      coordinates: [lon, lat],
      distanceFromOriginMeters,
      access: candidateAccess(element.tags),
      tags: element.tags || {},
    });
  }
  candidates.sort(
    (a, b) => a.distanceFromOriginMeters - b.distanceFromOriginMeters,
  );
  return candidates;
}

async function handleFallbackStarts(request, env, origin) {
  if (!env.ORS_API_KEY)
    return json(
      orsEnvelope("provider-unavailable", 502, { retryable: true }),
      502,
      origin,
    );
  let body;
  try {
    body = await readJson(request);
  } catch {
    return json({ outcome: "invalid-request", starts: [] }, 400, origin);
  }
  const originLat = Number(body?.origin?.lat);
  const originLon = Number(body?.origin?.lon);
  const target = Number(body?.targetMeters);
  if (
    !Number.isFinite(originLat) ||
    !Number.isFinite(originLon) ||
    Math.abs(originLat) > 90 ||
    Math.abs(originLon) > 180 ||
    !Number.isFinite(target) ||
    target < 500 ||
    target > 30000
  ) {
    return json({ outcome: "invalid-request", starts: [] }, 400, origin);
  }
  const radiusMeters = Math.max(
    1000,
    Math.min(10000, Number(body.radiusMeters) || 10000),
  );
  const maximumCandidates = Math.max(
    1,
    Math.min(FALLBACK_MAX_CANDIDATES, Number(body.maximumCandidates) || FALLBACK_MAX_CANDIDATES),
  );
  const routing = sanitizeORSRouting(body);

  let elements;
  try {
    const data = await fetchOverpassWithFallback(
      buildFallbackStartsQuery(originLat, originLon, radiusMeters),
    );
    elements = data?.elements;
  } catch {
    return json(
      { outcome: "provider-unavailable", starts: [], retryable: true },
      502,
      origin,
    );
  }
  const candidates = extractFallbackCandidates(elements, {
    lat: originLat,
    lon: originLon,
  }).slice(0, maximumCandidates);
  if (!candidates.length)
    return json(
      { outcome: "no-fallback-starts", starts: [], candidatesConsidered: 0 },
      200,
      origin,
    );

  const starts = [];
  let orsRequestCount = 0;
  let providerFailure = null;
  candidates: for (const candidate of candidates.slice(0, FALLBACK_MAX_TESTED)) {
    if (starts.length >= FALLBACK_TARGET_SUCCESSES) break;
    let routesFound = 0;
    for (
      let attempt = 0;
      attempt < FALLBACK_MAX_ORS_ATTEMPTS_PER_START;
      attempt += 1
    ) {
      orsRequestCount += 1;
      try {
        const data = await fetchORSRoundTrip({
          lon: candidate.coordinates[0],
          lat: candidate.coordinates[1],
          target,
          seed: ORS_SEEDS[attempt],
          index: attempt,
          apiKey: env.ORS_API_KEY,
          profile: routing.profile,
          routingOptions: routing.options,
          baseUrl: env.ORS_BASE_URL || DEFAULT_ORS_BASE_URL,
        });
        const feature = data?.features?.[0];
        if (
          feature?.geometry?.type === "LineString" &&
          Array.isArray(feature.geometry.coordinates) &&
          feature.geometry.coordinates.length >= 2
        ) {
          routesFound += 1;
          break;
        }
      } catch (error) {
        const type = classifyORSError(error);
        if (type === "provider-unavailable") {
          providerFailure = error;
          break candidates;
        }
        // no-routable-start / no-route : ce candidat n'est pas routable, on passe au suivant sans fabriquer de géométrie.
      }
    }
    if (routesFound > 0) {
      starts.push({
        id: candidate.id,
        coordinates: candidate.coordinates,
        distanceFromOriginMeters: candidate.distanceFromOriginMeters,
        access: candidate.access,
        routesFound,
        tags: candidate.tags,
      });
    }
  }
  if (providerFailure) {
    const upstreamStatus = providerFailure?.upstreamStatus;
    return json(
      {
        outcome: "provider-unavailable",
        starts: [],
        candidatesConsidered: candidates.length,
        orsRequestCount,
        retryable: !upstreamStatus || upstreamStatus >= 500,
        providerStatus: upstreamStatus || null,
      },
      502,
      origin,
    );
  }
  return json(
    {
      outcome: starts.length ? "fallback-starts-found" : "no-fallback-starts",
      starts,
      candidatesConsidered: candidates.length,
      candidatesTested: Math.min(candidates.length, FALLBACK_MAX_TESTED),
      orsRequestCount,
      imperativesPreserved: routing.imperativesPreserved,
    },
    200,
    origin,
  );
}

async function routeRequest(request, env, origin) {
  const pathname = new URL(request.url).pathname;
  if (request.method !== "POST")
    throw new HTTPError(405, "Méthode non autorisée.");
  if (pathname === "/v1/test") return handleTest(request, env, origin);
  if (pathname === "/v1/geoapify/places")
    return handleGeoapifyPlaces(request, env, origin);
  if (pathname === "/v1/mapillary/images")
    return handleMapillaryImages(request, env, origin);
  if (pathname === "/v1/overpass/terrain")
    return handleOverpassTerrain(request, origin);
  if (pathname === "/v1/ign/elevation")
    return handleIgnElevation(request, origin);
  if (pathname === "/v1/ors/round-trips")
    return handleORSRoundTrips(request, env, origin);
  if (pathname === "/v1/fallback-starts")
    return handleFallbackStarts(request, env, origin);
  throw new HTTPError(404, "Route inconnue.");
}

export default {
  async fetch(request, env, ctx) {
    const startedAt = Date.now();
    let origin = request.headers.get("Origin") || "";
    try {
      origin = requireOrigin(request);
      if (request.method === "OPTIONS")
        return new Response(null, {
          status: 204,
          headers: corsHeaders(origin),
        });
      const pathname = new URL(request.url).pathname;
      if (!env.SERVICE_RATE_LIMITER)
        throw new HTTPError(503, "Limiteur de débit non configuré.");
      const visitor = request.headers.get("CF-Connecting-IP") || "visiteur-inconnu";
      const { success } = await env.SERVICE_RATE_LIMITER.limit({
        key: `${origin}:${pathname}:${visitor}`,
      });
      if (!success)
        throw new HTTPError(
          429,
          "Trop de requêtes. Réessayez dans une minute.",
        );
      const response = await routeRequest(request, env, origin);
      console.log(
        JSON.stringify({
          event: "map-service",
          path: pathname,
          status: response.status,
          durationMs: Date.now() - startedAt,
        }),
      );
      return response;
    } catch (error) {
      const status = error instanceof HTTPError ? error.status : 500;
      const message =
        error instanceof Error ? error.message : "Erreur interne.";
      console.error(
        JSON.stringify({
          event: "map-service-error",
          status,
          durationMs: Date.now() - startedAt,
        }),
      );
      return json(
        { error: { message } },
        status,
        ALLOWED_ORIGINS.has(origin) ? origin : "null",
      );
    }
  },
};
