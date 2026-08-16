var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.mjs
var ALLOWED_ORIGINS = /* @__PURE__ */ new Set([
  "https://htmlpreview.github.io",
  "https://c-concept-dev.github.io",
  "https://beta-gate.11drumboy11.workers.dev",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);
var GEOAPIFY_CATEGORIES = ["amenity", "catering.cafe", "heritage", "healthcare.pharmacy", "parking", "public_transport", "commercial.food_and_drink.bakery", "catering.restaurant", "tourism.attraction", "leisure.picnic", "tourism.sights", "natural.forest", "natural.water.river_system", "waterway.river_system"].join(",");
var ORS_SEEDS = [
  17,
  41,
  83,
  121,
  167,
  211,
  257,
  301,
  347,
  389,
  433,
  479,
  523,
  569,
  613
];
var ORS_BATCH_SIZE = 4;
var MAPILLARY_FIELDS = "id,geometry,captured_at,thumb_1024_url,sequence";
var OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
var IGN_ELEVATION_URL = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json";
var IGN_ELEVATION_RESOURCE = "ign_rge_alti_wld";
var DEFAULT_ORS_BASE_URL = "https://api.openrouteservice.org";
var BATCH_MAX_ROUTES = 8;
var DATATOURISME_BASE_URL = "https://api.datatourisme.fr/v1";
var DATATOURISME_FIELDS = "uuid,label,type,isLocatedAt.geo,isLocatedAt.address";
var DATATOURISME_EXCLUDED_TYPES = [
  "Hotel",
  "HotelTrade",
  "HotelRestaurant",
  "Accommodation",
  "LodgingBusiness",
  "RentalAccommodation",
  "SelfCateringAccommodation",
  "CollectiveAccommodation",
  "HolidayResort",
  "Guesthouse",
  "BedAndBreakfast",
  "Restaurant",
  "FoodEstablishment"
].join(",");
var TIMEOUT_MS = {
  ors: 1e4,
  ign: 7e3,
  geoapify: 7e3,
  mapillary: 7e3,
  datatourisme: 7e3
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
__name(fetchWithTimeout, "fetchWithTimeout");
var FALLBACK_START_TAGS = [
  ["amenity", "parking"],
  ["highway", "trailhead"],
  ["tourism", "information"],
  ["leisure", "park"],
  ["public_transport", "station"],
  ["railway", "station"],
  ["amenity", "bus_station"]
];
var FALLBACK_MAX_CANDIDATES = 6;
var FALLBACK_MAX_TESTED = 3;
var FALLBACK_MAX_ORS_ATTEMPTS_PER_START = 2;
var FALLBACK_TARGET_SUCCESSES = 3;
var HTTPError = class extends Error {
  static {
    __name(this, "HTTPError");
  }
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    Object.assign(this, details);
  }
};
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff"
  };
}
__name(corsHeaders, "corsHeaders");
function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
__name(json, "json");
function requireOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  if (!ALLOWED_ORIGINS.has(origin))
    throw new HTTPError(403, "Origine non autoris\xE9e.");
  return origin;
}
__name(requireOrigin, "requireOrigin");
async function readJson(request) {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > 75e4)
    throw new HTTPError(413, "Requ\xEAte trop volumineuse.");
  let text;
  try {
    text = await request.text();
  } catch {
    throw new HTTPError(400, "Corps de requ\xEAte illisible.");
  }
  if (new TextEncoder().encode(text).length > 75e4)
    throw new HTTPError(413, "Requ\xEAte trop volumineuse.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HTTPError(400, "JSON invalide.");
  }
}
__name(readJson, "readJson");
function redactedProviderUrl(requestUrl) {
  try {
    const parsed = new URL(requestUrl);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}
__name(redactedProviderUrl, "redactedProviderUrl");
async function providerJson(response, requestUrl) {
  if (!response.ok) {
    const clone = response.clone();
    let body;
    try {
      body = await response.json();
    } catch {
      body = await clone.text();
    }
    console.error(
      JSON.stringify({
        event: "provider-error-body",
        url: redactedProviderUrl(requestUrl),
        status: response.status,
        body
      })
    );
    const message = body?.error?.message || body?.message || body?.error || `R\xE9ponse fournisseur ${response.status}`;
    throw new HTTPError(502, String(message), {
      code: "provider-error",
      upstreamStatus: response.status
    });
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new HTTPError(
      502,
      `R\xE9ponse fournisseur illisible (${response.status}).`,
      { code: "provider-error", upstreamStatus: response.status }
    );
  }
  return data;
}
__name(providerJson, "providerJson");
function classifyORSError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("cannot find point") || message.includes("could not find routable point"))
    return "no-routable-start";
  if (message.includes("unable to find a route") || message.includes("couldn't find a route") || message.includes("no route found") || message.includes("no path found"))
    return "no-route";
  return "provider-unavailable";
}
__name(classifyORSError, "classifyORSError");
function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new HTTPError(400, `${label} invalide.`);
  return number;
}
__name(finiteNumber, "finiteNumber");
function validateBBox(value) {
  if (!Array.isArray(value) || value.length !== 4)
    throw new HTTPError(400, "Rectangle g\xE9ographique invalide.");
  const [west, south, east, north] = value.map(
    (x, index) => finiteNumber(x, `Coordonn\xE9e ${index + 1}`)
  );
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new HTTPError(400, "Rectangle g\xE9ographique hors limites.");
  }
  if (east - west > 0.3 || north - south > 0.3)
    throw new HTTPError(400, "Zone Geoapify trop \xE9tendue.");
  return [west, south, east, north];
}
__name(validateBBox, "validateBBox");
function haversineMeters(a, b) {
  const p1 = a[1] * Math.PI / 180;
  const p2 = b[1] * Math.PI / 180;
  const dp = (b[1] - a[1]) * Math.PI / 180;
  const dl = (b[0] - a[0]) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 6371e3 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
__name(haversineMeters, "haversineMeters");
function validateCoordinates(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 5e3) {
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
__name(validateCoordinates, "validateCoordinates");
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
__name(validateRouteCoordinates, "validateRouteCoordinates");
function validateRouteBatch(value, maximum) {
  if (!Array.isArray(value) || !value.length)
    throw new HTTPError(400, "Liste de traces invalide ou vide.");
  if (value.length > BATCH_MAX_ROUTES)
    throw new HTTPError(400, "Trop de traces demand\xE9es en un seul appel group\xE9.");
  return value.map((item, index) => {
    if (!item || typeof item !== "object")
      throw new HTTPError(400, `\xC9l\xE9ment ${index + 1} du lot invalide.`);
    return item;
  });
}
__name(validateRouteBatch, "validateRouteBatch");
function pointSegmentDistanceMeters(point, start, end) {
  const latitude = (point[1] + start[1] + end[1]) / 3 * (Math.PI / 180);
  const scaleX = 111320 * Math.max(0.2, Math.cos(latitude));
  const scaleY = 111320;
  const px = (point[0] - start[0]) * scaleX;
  const py = (point[1] - start[1]) * scaleY;
  const ex = (end[0] - start[0]) * scaleX;
  const ey = (end[1] - start[1]) * scaleY;
  const denominator = ex * ex + ey * ey;
  const ratio = denominator ? Math.max(0, Math.min(1, (px * ex + py * ey) / denominator)) : 0;
  return Math.hypot(px - ratio * ex, py - ratio * ey);
}
__name(pointSegmentDistanceMeters, "pointSegmentDistanceMeters");
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
__name(distanceToWayMeters, "distanceToWayMeters");
function matchTerrainSegments(route, elements, bufferMeters) {
  const ways = (Array.isArray(elements) ? elements : []).filter(
    (item) => item?.type === "way" && Array.isArray(item.geometry) && item.geometry.length >= 2
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
      matchDistanceMeters: Math.round(bestDistance * 10) / 10
    });
  }
  return segments;
}
__name(matchTerrainSegments, "matchTerrainSegments");
function sampleRoute(coordinates, maximum = 30) {
  if (coordinates.length <= maximum) return coordinates;
  const cumulative = [0];
  for (let i = 1; i < coordinates.length; i += 1) {
    cumulative.push(
      cumulative[i - 1] + haversineMeters(coordinates[i - 1], coordinates[i])
    );
  }
  const total = cumulative.at(-1);
  if (!total) return [coordinates[0]];
  const sampled = [];
  let index = 0;
  for (let i = 0; i < maximum; i += 1) {
    const target = total * i / (maximum - 1);
    while (index < cumulative.length - 1 && cumulative[index] < target)
      index += 1;
    const previous = Math.max(0, index - 1);
    const chosen = Math.abs(cumulative[index] - target) < Math.abs(cumulative[previous] - target) ? index : previous;
    const point = coordinates[chosen];
    if (!sampled.length || point[0] !== sampled.at(-1)[0] || point[1] !== sampled.at(-1)[1])
      sampled.push(point);
  }
  return sampled;
}
__name(sampleRoute, "sampleRoute");
function buildMapillaryBoxes(coordinates, radiusMeters = 125) {
  const boxes = sampleRoute(coordinates, 30).map(([lon, lat]) => {
    const padLat = radiusMeters / 111320;
    const padLon = radiusMeters / (111320 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    return [lon - padLon, lat - padLat, lon + padLon, lat + padLat];
  });
  const unique = /* @__PURE__ */ new Map();
  for (const box of boxes) {
    const key = box.map((value) => value.toFixed(4)).join(",");
    if (!unique.has(key)) unique.set(key, box);
  }
  return [...unique.values()];
}
__name(buildMapillaryBoxes, "buildMapillaryBoxes");
async function testGeoapify(env) {
  if (!env.GEOAPIFY_API_KEY)
    throw new HTTPError(503, "Secret Geoapify non configur\xE9.");
  const query = new URLSearchParams({
    text: "Paris",
    limit: "1",
    apiKey: env.GEOAPIFY_API_KEY
  });
  const url = `https://api.geoapify.com/v1/geocode/search?${query}`;
  const data = await providerJson(
    await fetchWithTimeout(url, {
      headers: { Accept: "application/json" }
    }, TIMEOUT_MS.geoapify),
    url
  );
  return { resultCount: data?.features?.length || 0 };
}
__name(testGeoapify, "testGeoapify");
async function testMapillary(env) {
  if (!env.MAPILLARY_ACCESS_TOKEN)
    throw new HTTPError(503, "Secret Mapillary non configur\xE9.");
  const query = new URLSearchParams({
    fields: "id",
    bbox: "2.2940,48.8580,2.2950,48.8590",
    limit: "1"
  });
  const url = `https://graph.mapillary.com/images?${query}`;
  const data = await providerJson(
    await fetchWithTimeout(url, {
      headers: {
        Accept: "application/json",
        Authorization: `OAuth ${env.MAPILLARY_ACCESS_TOKEN}`
      }
    }, TIMEOUT_MS.mapillary),
    url
  );
  return { resultCount: data?.data?.length || 0 };
}
__name(testMapillary, "testMapillary");
async function testORS(env) {
  if (!env.ORS_API_KEY)
    throw new HTTPError(503, "Secret OpenRouteService non configur\xE9.");
  const data = await fetchORSRoundTrip({
    lon: 2.3522,
    lat: 48.8566,
    target: 1e3,
    seed: ORS_SEEDS[0],
    index: 0,
    apiKey: env.ORS_API_KEY,
    points: 3,
    baseUrl: env.ORS_BASE_URL || DEFAULT_ORS_BASE_URL
  });
  const feature = data?.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new HTTPError(
      502,
      "Le test ORS n\u2019a pas renvoy\xE9 de boucle GeoJSON exploitable."
    );
  }
  return {
    resultCount: 1,
    routeDistanceMeters: Number(feature?.properties?.summary?.distance) || null,
    routeDurationSeconds: Number(feature?.properties?.summary?.duration) || null
  };
}
__name(testORS, "testORS");
async function testDatatourisme(env) {
  if (!env.DATATOURISME_API_KEY)
    throw new HTTPError(503, "Secret DATAtourisme non configur\xE9.");
  const query = new URLSearchParams({
    geo_bounding: "48.9,2.2,48.8,2.4",
    fields: "uuid,label",
    page_size: "1"
  });
  const url = `${DATATOURISME_BASE_URL}/placeOfInterest?${query}`;
  const data = await providerJson(
    await fetchWithTimeout(url, {
      headers: { Accept: "application/json", "X-API-Key": env.DATATOURISME_API_KEY }
    }, TIMEOUT_MS.datatourisme),
    url
  );
  return { resultCount: Array.isArray(data?.objects) ? data.objects.length : 0 };
}
__name(testDatatourisme, "testDatatourisme");
async function handleTest(request, env, origin) {
  const { service } = await readJson(request);
  if (service === "geo")
    return json(
      { ok: true, service, ...await testGeoapify(env) },
      200,
      origin
    );
  if (service === "mapillary")
    return json(
      { ok: true, service, ...await testMapillary(env) },
      200,
      origin
    );
  if (service === "ors")
    return json({ ok: true, service, ...await testORS(env) }, 200, origin);
  if (service === "tourism")
    return json({ ok: true, service, ...await testDatatourisme(env) }, 200, origin);
  throw new HTTPError(400, "Service inconnu.");
}
__name(handleTest, "handleTest");
async function handleGeoapifyPlaces(request, env, origin) {
  if (!env.GEOAPIFY_API_KEY)
    throw new HTTPError(503, "Secret Geoapify non configur\xE9.");
  const { bbox } = await readJson(request);
  const query = new URLSearchParams({
    categories: GEOAPIFY_CATEGORIES,
    filter: `rect:${validateBBox(bbox).join(",")}`,
    limit: "200",
    lang: "fr",
    apiKey: env.GEOAPIFY_API_KEY
  });
  const url = `https://api.geoapify.com/v2/places?${query}`;
  const data = await providerJson(
    await fetchWithTimeout(url, {
      headers: { Accept: "application/geo+json" }
    }, TIMEOUT_MS.geoapify),
    url
  );
  return json(data, 200, origin);
}
__name(handleGeoapifyPlaces, "handleGeoapifyPlaces");
function boundingBoxFromRoute(route, radiusMeters) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [lon, lat] of route) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  const centerLat = (north + south) / 2;
  const padLat = radiusMeters / 111320;
  const padLon = radiusMeters / (111320 * Math.max(0.2, Math.cos(centerLat * Math.PI / 180)));
  return validateBBox([west - padLon, south - padLat, east + padLon, north + padLat]);
}
__name(boundingBoxFromRoute, "boundingBoxFromRoute");
async function handleDatatourismePlaces(request, env, origin) {
  if (!env.DATATOURISME_API_KEY)
    throw new HTTPError(503, "Secret DATAtourisme non configur\xE9.");
  const body = await readJson(request);
  const route = validateRouteCoordinates(body.route, 200, "Trace DATAtourisme");
  const radiusMeters = Math.max(
    50,
    Math.min(2000, finiteNumber(body.radiusMeters ?? 300, "Rayon DATAtourisme"))
  );
  const limit = Math.max(1, Math.min(50, Number(body.limit) || 40));
  const [west, south, east, north] = boundingBoxFromRoute(route, radiusMeters);
  const query = new URLSearchParams({
    geo_bounding: `${north},${west},${south},${east}`,
    filters: `type[nin]=${DATATOURISME_EXCLUDED_TYPES}`,
    fields: DATATOURISME_FIELDS,
    page_size: String(limit),
    lang: "fr"
  });
  const url = `${DATATOURISME_BASE_URL}/placeOfInterest?${query}`;
  const data = await providerJson(
    await fetchWithTimeout(url, {
      headers: { Accept: "application/json", "X-API-Key": env.DATATOURISME_API_KEY }
    }, TIMEOUT_MS.datatourisme),
    url
  );
  return json(
    { items: Array.isArray(data?.objects) ? data.objects : [] },
    200,
    origin
  );
}
__name(handleDatatourismePlaces, "handleDatatourismePlaces");
async function fetchMapillaryBox(box, env) {
  const query = new URLSearchParams({
    fields: MAPILLARY_FIELDS,
    bbox: box.join(","),
    limit: "30"
  });
  const url = `https://graph.mapillary.com/images?${query}`;
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json",
      Authorization: `OAuth ${env.MAPILLARY_ACCESS_TOKEN}`
    }
  }, TIMEOUT_MS.mapillary);
  return providerJson(response, url);
}
__name(fetchMapillaryBox, "fetchMapillaryBox");
async function handleMapillaryImages(request, env, origin) {
  if (!env.MAPILLARY_ACCESS_TOKEN)
    throw new HTTPError(503, "Secret Mapillary non configur\xE9.");
  const body = await readJson(request);
  const coordinates = validateCoordinates(body.coordinates);
  const boxes = buildMapillaryBoxes(coordinates);
  const unique = /* @__PURE__ */ new Map();
  const errors = [];
  for (let offset = 0; offset < boxes.length; offset += 6) {
    const settled = await Promise.allSettled(
      boxes.slice(offset, offset + 6).map((box) => fetchMapillaryBox(box, env))
    );
    for (const result of settled) {
      if (result.status === "rejected") {
        errors.push(
          result.reason?.message || "Recherche Mapillary impossible."
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
      partialErrors: errors.length
    },
    200,
    origin
  );
}
__name(handleMapillaryImages, "handleMapillaryImages");
async function fetchOverpassOne(url, query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6e3);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "Je-marche-comme-je-suis/1.0"
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Overpass ${response.status} (${url}).`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
__name(fetchOverpassOne, "fetchOverpassOne");
async function fetchOverpassWithFallback(query) {
  const attempts = OVERPASS_URLS.map((url) => fetchOverpassOne(url, query));
  const settled = await Promise.allSettled(attempts);
  const success = settled.find((entry) => entry.status === "fulfilled");
  if (success) return success.value;
  throw settled[0]?.reason || new Error("Aucune instance Overpass disponible.");
}
__name(fetchOverpassWithFallback, "fetchOverpassWithFallback");
async function overpassTerrainForRoute(item) {
  const route = validateRouteCoordinates(item.route, 80, "Trace Overpass");
  const bufferMeters = Math.max(
    10,
    Math.min(50, finiteNumber(item.bufferMeters ?? 25, "Tampon Overpass"))
  );
  const line = route.map(([lon, lat]) => `${lat},${lon}`).join(",");
  const query = `[out:json][timeout:20];way["highway"](around:${bufferMeters},${line});out tags geom;`;
  const routeLengthMeters = Math.max(
    0,
    Number(item.routeLengthMeters) || route.slice(1).reduce(
      (total, point, index) => total + haversineMeters(route[index], point),
      0
    )
  );
  let data;
  try {
    data = await fetchOverpassWithFallback(query);
  } catch {
    return {
      segments: [],
      routeLengthMeters,
      retrievedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: "Overpass / OpenStreetMap",
      status: "terrain-unavailable"
    };
  }
  const segments = matchTerrainSegments(route, data?.elements, bufferMeters);
  return {
    segments,
    routeLengthMeters,
    retrievedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "Overpass / OpenStreetMap",
    status: "ok"
  };
}
__name(overpassTerrainForRoute, "overpassTerrainForRoute");
async function handleOverpassTerrain(request, origin) {
  const body = await readJson(request);
  const result = await overpassTerrainForRoute(body);
  return json(result, 200, origin);
}
__name(handleOverpassTerrain, "handleOverpassTerrain");
async function handleOverpassTerrainBatch(request, origin) {
  const body = await readJson(request);
  const items = validateRouteBatch(body.routes, BATCH_MAX_ROUTES);
  const results = await Promise.all(
    items.map((item) => overpassTerrainForRoute(item))
  );
  return json({ results }, 200, origin);
}
__name(handleOverpassTerrainBatch, "handleOverpassTerrainBatch");

// ---------- Bancs et tables de pique-nique (fiche D100C "Banc") ----------
async function overpassBenchesForRoute(item) {
  const route = validateRouteCoordinates(item.route, 80, "Trace Overpass");
  const bufferMeters = Math.max(
    15,
    Math.min(150, finiteNumber(item.bufferMeters ?? 50, "Tampon bancs"))
  );
  const line = route.map(([lon, lat]) => `${lat},${lon}`).join(",");
  const query = `[out:json][timeout:20];(node["amenity"="bench"](around:${bufferMeters},${line});node["leisure"="picnic_table"](around:${bufferMeters},${line}););out body;`;
  let data;
  try {
    data = await fetchOverpassWithFallback(query);
  } catch {
    return {
      benches: [],
      picnicTables: [],
      count: 0,
      retrievedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: "Overpass / OpenStreetMap",
      status: "benches-unavailable"
    };
  }
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  const benches = elements
    .filter((el) => el.tags?.amenity === "bench")
    .map((el) => ({
      lat: el.lat,
      lon: el.lon,
      backrest: el.tags?.backrest === "yes",
      armrest: el.tags?.armrest === "yes",
      seats: Number.isFinite(Number(el.tags?.seats)) ? Number(el.tags.seats) : null
    }));
  const picnicTables = elements
    .filter((el) => el.tags?.leisure === "picnic_table")
    .map((el) => ({
      lat: el.lat,
      lon: el.lon,
      covered: el.tags?.covered === "yes"
    }));
  return {
    benches,
    picnicTables,
    count: benches.length + picnicTables.length,
    retrievedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "Overpass / OpenStreetMap",
    status: "ok"
  };
}
__name(overpassBenchesForRoute, "overpassBenchesForRoute");
async function handleOverpassBenches(request, origin) {
  const body = await readJson(request);
  const result = await overpassBenchesForRoute(body);
  return json(result, 200, origin);
}
__name(handleOverpassBenches, "handleOverpassBenches");
async function handleOverpassBenchesBatch(request, origin) {
  const body = await readJson(request);
  const items = validateRouteBatch(body.routes, BATCH_MAX_ROUTES);
  const results = await Promise.all(
    items.map((item) => overpassBenchesForRoute(item))
  );
  return json({ results }, 200, origin);
}
__name(handleOverpassBenchesBatch, "handleOverpassBenchesBatch");

// ---------- Envies vérifiables D100C1 (nouvelles familles Overpass) ----------
// Une seule requête Overpass unioniste par trace, pour ne pas augmenter le
// budget d'appels au-delà de ce que benches/terrain font déjà (même
// discipline que D093-D095 : un aller-retour groupé plutôt qu'un par envie).
function classifyWishPoiTags(tags = {}) {
  if (tags.landuse === "orchard" || tags.landuse === "vineyard")
    return "Verger ou vignoble";
  if (tags.natural === "tree" && tags.denotation === "natural_monument")
    return "Arbre remarquable";
  if (tags.waterway === "waterfall") return "Cascade";
  if (tags.natural === "cave_entrance") return "Grotte";
  if (tags.tourism === "artwork") return "Œuvre d'art";
  if (
    tags.man_made === "watermill" ||
    tags.historic === "wash_house" ||
    (tags.amenity === "fountain" && tags.historic)
  )
    return "Petit patrimoine";
  if (tags.shop === "ice_cream") return "Glacier";
  return null;
}
__name(classifyWishPoiTags, "classifyWishPoiTags");
async function overpassWishPoiForRoute(item) {
  const route = validateRouteCoordinates(item.route, 80, "Trace Overpass");
  const bufferMeters = Math.max(
    50,
    Math.min(800, finiteNumber(item.bufferMeters ?? 300, "Tampon envies"))
  );
  const line = route.map(([lon, lat]) => `${lat},${lon}`).join(",");
  const around = `around:${bufferMeters},${line}`;
  const query = `[out:json][timeout:25];(way["landuse"~"^(orchard|vineyard)$"](${around});node["natural"="tree"]["denotation"="natural_monument"](${around});way["waterway"="waterfall"](${around});node["waterway"="waterfall"](${around});node["natural"="cave_entrance"](${around});node["tourism"="artwork"](${around});node["man_made"="watermill"](${around});node["historic"="wash_house"](${around});node["amenity"="fountain"]["historic"](${around});node["shop"="ice_cream"](${around}););out center tags;`;
  let data;
  try {
    data = await fetchOverpassWithFallback(query);
  } catch {
    return {
      pois: [],
      retrievedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: "Overpass / OpenStreetMap",
      status: "wish-poi-unavailable"
    };
  }
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  const pois = elements
    .map((el) => {
      const type = classifyWishPoiTags(el.tags || {});
      if (!type) return null;
      const lat = Number.isFinite(el.lat) ? el.lat : el.center?.lat;
      const lon = Number.isFinite(el.lon) ? el.lon : el.center?.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return {
        id: `osm:${el.type}/${el.id}`,
        type,
        name: el.tags?.name || type,
        lat,
        lon
      };
    })
    .filter(Boolean);
  return {
    pois,
    retrievedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "Overpass / OpenStreetMap",
    status: "ok"
  };
}
__name(overpassWishPoiForRoute, "overpassWishPoiForRoute");
async function handleOverpassWishPoi(request, origin) {
  const body = await readJson(request);
  const result = await overpassWishPoiForRoute(body);
  return json(result, 200, origin);
}
__name(handleOverpassWishPoi, "handleOverpassWishPoi");
async function handleOverpassWishPoiBatch(request, origin) {
  const body = await readJson(request);
  const items = validateRouteBatch(body.routes, BATCH_MAX_ROUTES);
  const results = await Promise.all(
    items.map((item) => overpassWishPoiForRoute(item))
  );
  return json({ results }, 200, origin);
}
__name(handleOverpassWishPoiBatch, "handleOverpassWishPoiBatch");

async function ignElevationForRoute(item) {
  const route = validateRouteCoordinates(item.route, 120, "Trace IGN");
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
      sampling: String(route.length)
    })
  }, TIMEOUT_MS.ign);
  const data = await providerJson(response, IGN_ELEVATION_URL);
  const elevations = (Array.isArray(data?.elevations) ? data.elevations : []).map((elevationItem) => ({
    lon: Number(elevationItem?.lon),
    lat: Number(elevationItem?.lat),
    z: Number(elevationItem?.z)
  })).filter(
    (elevationItem) => Number.isFinite(elevationItem.lon) && Number.isFinite(elevationItem.lat) && Number.isFinite(elevationItem.z) && elevationItem.z > -99990
  );
  if (!elevations.length)
    throw new HTTPError(502, "IGN ne couvre pas cette trace altim\xE9trique.");
  return {
    ok: true,
    elevations,
    ascentMeters: Number.isFinite(Number(data?.height_differences?.positive)) ? Number(data.height_differences.positive) : null,
    descentMeters: Number.isFinite(Number(data?.height_differences?.negative)) ? Math.abs(Number(data.height_differences.negative)) : null,
    coveragePercent: Math.round(elevations.length / route.length * 100),
    source: "IGN G\xE9oplateforme \xB7 RGE ALTI",
    retrievedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
__name(ignElevationForRoute, "ignElevationForRoute");
async function handleIgnElevation(request, origin) {
  const body = await readJson(request);
  const result = await ignElevationForRoute(body);
  const { ok, ...payload } = result;
  return json(payload, 200, origin);
}
__name(handleIgnElevation, "handleIgnElevation");
async function handleIgnElevationBatch(request, origin) {
  const body = await readJson(request);
  const items = validateRouteBatch(body.routes, BATCH_MAX_ROUTES);
  const results = new Array(items.length);
  for (let offset = 0; offset < items.length; offset += 4) {
    const chunk = items.slice(offset, offset + 4);
    const settled = await Promise.allSettled(
      chunk.map((item) => ignElevationForRoute(item))
    );
    settled.forEach((entry, chunkIndex) => {
      results[offset + chunkIndex] = entry.status === "fulfilled"
        ? entry.value
        : {
            ok: false,
            status: "elevation-unavailable",
            message: entry.reason?.message || "IGN indisponible pour cette trace.",
            retrievedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
    });
  }
  return json({ results }, 200, origin);
}
__name(handleIgnElevationBatch, "handleIgnElevationBatch");
function orsEnvelope(outcome, status, extra = {}) {
  return {
    outcome,
    provider: "ors",
    routes: [],
    requestCount: 0,
    retryable: false,
    ...extra
  };
}
__name(orsEnvelope, "orsEnvelope");
function validatePoiTargets(value) {
  if (value === void 0 || value === null) return [];
  if (!Array.isArray(value)) throw new HTTPError(400, "Cibles POI invalides.");
  if (value.length > 15) throw new HTTPError(400, "Trop de cibles POI demand\xE9es.");
  return value.map((point, index) => {
    if (!Array.isArray(point) || point.length < 2)
      throw new HTTPError(400, `Cible POI ${index + 1} invalide.`);
    const lon = finiteNumber(point[0], "Longitude POI");
    const lat = finiteNumber(point[1], "Latitude POI");
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90)
      throw new HTTPError(400, `Cible POI ${index + 1} hors limites.`);
    return [lon, lat];
  });
}
__name(validatePoiTargets, "validatePoiTargets");
function routeMatchesPoi(coordinates, poiTargets, radiusMeters) {
  if (!poiTargets.length) return false;
  return poiTargets.some((poi) => {
    let best = Infinity;
    for (let index = 1; index < coordinates.length; index += 1) {
      const start = coordinates[index - 1];
      const end = coordinates[index];
      if (![...start, ...end].every(Number.isFinite)) continue;
      best = Math.min(best, pointSegmentDistanceMeters(poi, start, end));
      if (best <= radiusMeters) return true;
    }
    return false;
  });
}
__name(routeMatchesPoi, "routeMatchesPoi");
async function handleORSRoundTrips(request, env, origin) {
  if (!env.ORS_API_KEY)
    return json(
      orsEnvelope("provider-unavailable", 502, { retryable: true }),
      502,
      origin
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
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90 || target < 500 || target > 3e4) {
    return json(orsEnvelope("invalid-request", 400), 400, origin);
  }
  let poiTargets;
  try {
    poiTargets = validatePoiTargets(body.poiTargets);
  } catch {
    poiTargets = [];
  }
  const poiRadiusMeters = Math.max(
    20,
    Math.min(150, Number(body.poiRadiusMeters) || 60)
  );
  const seekingPoi = poiTargets.length > 0;
  const routing = sanitizeORSRouting(body);
  const routes = [];
  const failureTypes = [];
  let requestCount = 0;
  let providerFailure = null;
  let poiMatchFound = false;
  // Sans cible POI : comportement inchangé, on s'arrête dès qu'on a assez de
  // boucles. Avec des cibles POI : on continue d'essayer les graines
  // restantes tant qu'aucune boucle trouvée ne passe réellement à proximité
  // — jamais de détour ni de géométrie modifiée, seulement plus de tentatives
  // parmi les graines déjà prévues. On s'arrête dès qu'une correspondance
  // réelle est trouvée, ou faute de mieux, une fois toutes les graines
  // épuisées — le repli se fait alors silencieusement sur les meilleures
  // boucles obtenues, sans jamais échouer ni forcer quoi que ce soit.
  batches: for (
    let offset = 0;
    offset < ORS_SEEDS.length &&
    (seekingPoi ? !poiMatchFound : routes.length < ORS_BATCH_SIZE);
    offset += ORS_BATCH_SIZE
  ) {
    const seeds = ORS_SEEDS.slice(offset, offset + ORS_BATCH_SIZE);
    const settled = await Promise.allSettled(
      seeds.map(
        (seed, batchIndex) => fetchORSRoundTrip({
          lon,
          lat,
          target,
          seed,
          index: offset + batchIndex,
          apiKey: env.ORS_API_KEY,
          profile: routing.profile,
          routingOptions: routing.options,
          baseUrl: env.ORS_BASE_URL || DEFAULT_ORS_BASE_URL
        })
      )
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
      if (feature?.geometry?.type === "LineString" && Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length >= 2) {
        routes.push(feature);
        if (seekingPoi && routeMatchesPoi(feature.geometry.coordinates, poiTargets, poiRadiusMeters)) {
          poiMatchFound = true;
        }
      } else {
        failureTypes.push("no-route");
      }
    }
    if (!routes.length && failureTypes.length && failureTypes.every((type) => type === "no-routable-start")) {
      break;
    }
    if (seekingPoi && poiMatchFound) break;
    if (seekingPoi && routes.length >= ORS_SEEDS.length) break;
  }
  if (seekingPoi && routes.length) {
    routes.sort((a, b) => {
      const aMatch = routeMatchesPoi(a.geometry.coordinates, poiTargets, poiRadiusMeters) ? 1 : 0;
      const bMatch = routeMatchesPoi(b.geometry.coordinates, poiTargets, poiRadiusMeters) ? 1 : 0;
      return bMatch - aMatch;
    });
  }
  if (providerFailure) {
    const upstreamStatus = providerFailure?.upstreamStatus;
    return json(
      orsEnvelope("provider-unavailable", 502, {
        requestCount,
        retryable: !upstreamStatus || upstreamStatus >= 500,
        providerStatus: upstreamStatus || null
      }),
      502,
      origin
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
        preferencesIgnored: routing.preferencesIgnored,
        poiTargeted: seekingPoi,
        poiMatchFound: seekingPoi ? poiMatchFound : null,
        retryable: false
      },
      200,
      origin
    );
  }
  const hasNoRoute = failureTypes.includes("no-route");
  if (!hasNoRoute) {
    return json(
      orsEnvelope("no-routable-start", 200, {
        requestCount,
        preferencesIgnored: routing.preferencesIgnored
      }),
      200,
      origin
    );
  }
  const outcome = routing.preferencesApplied.length ? "preferences-too-restrictive" : "no-route";
  return json(
    orsEnvelope(outcome, 200, {
      requestCount,
      preferencesIgnored: routing.preferencesIgnored
    }),
    200,
    origin
  );
}
__name(handleORSRoundTrips, "handleORSRoundTrips");
function sanitizeORSRouting(body) {
  const profile = body.profile === "wheelchair" ? "wheelchair" : "foot-walking";
  const avoidFeatures = Array.isArray(body.avoidFeatures) && body.avoidFeatures.includes("steps") ? ["steps"] : [];
  const weightings = {};
  for (const key of ["green", "quiet"]) {
    const factor = Number(body.weightings?.[key]?.factor);
    if (Number.isFinite(factor))
      weightings[key] = { factor: Math.max(0, Math.min(1, factor)) };
  }
  const options = {};
  if (avoidFeatures.length) options.avoid_features = avoidFeatures;
  const profileParams = {};
  const preferencesIgnored = Object.keys(weightings);
  const preferencesApplied = [];
  let imperativesPreserved = true;
  if (profile === "wheelchair") {
    const source = body.restrictions || {};
    const allowedKerb = [0.03, 0.06, 0.1];
    const allowedIncline = [3, 6, 10, 15];
    const requestedKerb = source.maximum_sloped_kerb;
    const requestedIncline = source.maximum_incline;
    if (requestedKerb !== void 0 && !allowedKerb.includes(Number(requestedKerb)))
      imperativesPreserved = false;
    if (requestedIncline !== void 0 && !allowedIncline.includes(Number(requestedIncline)))
      imperativesPreserved = false;
    const restrictions = {
      surface_type: "cobblestone:flattened",
      track_type: "grade1",
      smoothness_type: "good",
      maximum_sloped_kerb: allowedKerb.includes(Number(requestedKerb)) ? Number(requestedKerb) : 0.06,
      maximum_incline: allowedIncline.includes(Number(requestedIncline)) ? Number(requestedIncline) : 6
    };
    const width = Number(source.minimum_width);
    if (Number.isFinite(width) && width >= 0.5 && width <= 3)
      restrictions.minimum_width = width;
    else if (source.minimum_width !== void 0) imperativesPreserved = false;
    profileParams.restrictions = restrictions;
  }
  if (Object.keys(profileParams).length) options.profile_params = profileParams;
  return { profile, options, preferencesApplied, preferencesIgnored, imperativesPreserved };
}
__name(sanitizeORSRouting, "sanitizeORSRouting");
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
  baseUrl = DEFAULT_ORS_BASE_URL
}) {
  const url = `${baseUrl}/v2/directions/${profile}/geojson`;
  return providerJson(
    await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          Accept: "application/geo+json",
          Authorization: apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          coordinates: [[lon, lat]],
          elevation: true,
          instructions: true,
          instructions_format: "text",
          language: "fr",
          extra_info: profile === "wheelchair" ? [
            "steepness",
            "surface",
            "waytype",
            "suitability",
            "waycategory",
            "roadaccessrestrictions"
          ] : [
            "steepness",
            "surface",
            "waytype",
            "suitability",
            "green",
            "noise"
          ],
          options: {
            ...routingOptions,
            round_trip: {
              length: Math.round(target * (0.86 + index % 5 * 0.07)),
              points: points ?? 5 + index % 3,
              seed
            }
          }
        })
      },
      TIMEOUT_MS.ors
    ),
    url
  );
}
__name(fetchORSRoundTrip, "fetchORSRoundTrip");
function buildFallbackStartsQuery(lat, lon, radiusMeters) {
  const clauses = FALLBACK_START_TAGS.map(
    ([key, value]) => `node["${key}"="${value}"](around:${radiusMeters},${lat},${lon});way["${key}"="${value}"](around:${radiusMeters},${lat},${lon});`
  ).join("");
  return `[out:json][timeout:20];(${clauses});out center tags 60;`;
}
__name(buildFallbackStartsQuery, "buildFallbackStartsQuery");
function candidateAccess(tags = {}) {
  return {
    parking: tags.amenity === "parking" ? "documented" : "unknown",
    publicTransport: tags.public_transport === "station" || tags.railway === "station" || tags.amenity === "bus_station" ? "documented" : "unknown"
  };
}
__name(candidateAccess, "candidateAccess");
function extractFallbackCandidates(elements, origin) {
  const candidates = [];
  for (const element of Array.isArray(elements) ? elements : []) {
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const distanceFromOriginMeters = Math.round(
      haversineMeters([origin.lon, origin.lat], [lon, lat])
    );
    candidates.push({
      id: `${element.type}/${element.id}`,
      coordinates: [lon, lat],
      distanceFromOriginMeters,
      access: candidateAccess(element.tags),
      tags: element.tags || {}
    });
  }
  candidates.sort(
    (a, b) => a.distanceFromOriginMeters - b.distanceFromOriginMeters
  );
  return candidates;
}
__name(extractFallbackCandidates, "extractFallbackCandidates");
async function handleFallbackStarts(request, env, origin) {
  if (!env.ORS_API_KEY)
    return json(
      orsEnvelope("provider-unavailable", 502, { retryable: true }),
      502,
      origin
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
  if (!Number.isFinite(originLat) || !Number.isFinite(originLon) || Math.abs(originLat) > 90 || Math.abs(originLon) > 180 || !Number.isFinite(target) || target < 500 || target > 3e4) {
    return json({ outcome: "invalid-request", starts: [] }, 400, origin);
  }
  const radiusMeters = Math.max(
    1e3,
    Math.min(1e4, Number(body.radiusMeters) || 1e4)
  );
  const maximumCandidates = Math.max(
    1,
    Math.min(FALLBACK_MAX_CANDIDATES, Number(body.maximumCandidates) || FALLBACK_MAX_CANDIDATES)
  );
  const routing = sanitizeORSRouting(body);
  let elements;
  try {
    const data = await fetchOverpassWithFallback(
      buildFallbackStartsQuery(originLat, originLon, radiusMeters)
    );
    elements = data?.elements;
  } catch {
    return json(
      { outcome: "provider-unavailable", starts: [], retryable: true },
      502,
      origin
    );
  }
  const candidates = extractFallbackCandidates(elements, {
    lat: originLat,
    lon: originLon
  }).slice(0, maximumCandidates);
  if (!candidates.length)
    return json(
      { outcome: "no-fallback-starts", starts: [], candidatesConsidered: 0 },
      200,
      origin
    );
  const starts = [];
  let orsRequestCount = 0;
  let providerFailure = null;
  candidates: for (const candidate of candidates.slice(0, FALLBACK_MAX_TESTED)) {
    if (starts.length >= FALLBACK_TARGET_SUCCESSES) break;
    let routesFound = 0;
    for (let attempt = 0; attempt < FALLBACK_MAX_ORS_ATTEMPTS_PER_START; attempt += 1) {
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
          baseUrl: env.ORS_BASE_URL || DEFAULT_ORS_BASE_URL
        });
        const feature = data?.features?.[0];
        if (feature?.geometry?.type === "LineString" && Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length >= 2) {
          routesFound += 1;
          break;
        }
      } catch (error) {
        const type = classifyORSError(error);
        if (type === "provider-unavailable") {
          providerFailure = error;
          break candidates;
        }
      }
    }
    if (routesFound > 0) {
      starts.push({
        id: candidate.id,
        coordinates: candidate.coordinates,
        distanceFromOriginMeters: candidate.distanceFromOriginMeters,
        access: candidate.access,
        routesFound,
        tags: candidate.tags
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
        providerStatus: upstreamStatus || null
      },
      502,
      origin
    );
  }
  return json(
    {
      outcome: starts.length ? "fallback-starts-found" : "no-fallback-starts",
      starts,
      candidatesConsidered: candidates.length,
      candidatesTested: Math.min(candidates.length, FALLBACK_MAX_TESTED),
      orsRequestCount,
      imperativesPreserved: routing.imperativesPreserved
    },
    200,
    origin
  );
}
__name(handleFallbackStarts, "handleFallbackStarts");
async function routeRequest(request, env, origin) {
  const pathname = new URL(request.url).pathname;
  if (request.method !== "POST")
    throw new HTTPError(405, "M\xE9thode non autoris\xE9e.");
  if (pathname === "/v1/test") return handleTest(request, env, origin);
  if (pathname === "/v1/geoapify/places")
    return handleGeoapifyPlaces(request, env, origin);
  if (pathname === "/v1/datatourisme/places")
    return handleDatatourismePlaces(request, env, origin);
  if (pathname === "/v1/mapillary/images")
    return handleMapillaryImages(request, env, origin);
  if (pathname === "/v1/overpass/terrain")
    return handleOverpassTerrain(request, origin);
  if (pathname === "/v1/overpass/terrain-batch")
    return handleOverpassTerrainBatch(request, origin);
  if (pathname === "/v1/overpass/benches")
    return handleOverpassBenches(request, origin);
  if (pathname === "/v1/overpass/benches-batch")
    return handleOverpassBenchesBatch(request, origin);
  if (pathname === "/v1/overpass/wish-poi")
    return handleOverpassWishPoi(request, origin);
  if (pathname === "/v1/overpass/wish-poi-batch")
    return handleOverpassWishPoiBatch(request, origin);
  if (pathname === "/v1/ign/elevation")
    return handleIgnElevation(request, origin);
  if (pathname === "/v1/ign/elevation-batch")
    return handleIgnElevationBatch(request, origin);
  if (pathname === "/v1/ors/round-trips")
    return handleORSRoundTrips(request, env, origin);
  if (pathname === "/v1/fallback-starts")
    return handleFallbackStarts(request, env, origin);
  throw new HTTPError(404, "Route inconnue.");
}
__name(routeRequest, "routeRequest");
var index_default = {
  async fetch(request, env, ctx) {
    const startedAt = Date.now();
    let origin = request.headers.get("Origin") || "";
    try {
      origin = requireOrigin(request);
      if (request.method === "OPTIONS")
        return new Response(null, {
          status: 204,
          headers: corsHeaders(origin)
        });
      const pathname = new URL(request.url).pathname;
      if (!env.SERVICE_RATE_LIMITER)
        throw new HTTPError(503, "Limiteur de d\xE9bit non configur\xE9.");
      const visitor = request.headers.get("CF-Connecting-IP") || "visiteur-inconnu";
      const { success } = await env.SERVICE_RATE_LIMITER.limit({
        key: `${origin}:${pathname}:${visitor}`
      });
      if (!success)
        throw new HTTPError(
          429,
          "Trop de requ\xEAtes. R\xE9essayez dans une minute."
        );
      const response = await routeRequest(request, env, origin);
      console.log(
        JSON.stringify({
          event: "map-service",
          path: pathname,
          status: response.status,
          durationMs: Date.now() - startedAt
        })
      );
      return response;
    } catch (error) {
      const status = error instanceof HTTPError ? error.status : 500;
      const message = error instanceof Error ? error.message : "Erreur interne.";
      console.error(
        JSON.stringify({
          event: "map-service-error",
          status,
          durationMs: Date.now() - startedAt
        })
      );
      return json(
        { error: { message } },
        status,
        ALLOWED_ORIGINS.has(origin) ? origin : "null"
      );
    }
  }
};
export {
  buildMapillaryBoxes,
  index_default as default,
  matchTerrainSegments,
  sampleRoute,
  validateBBox
};
