const ALLOWED_ORIGINS = new Set([
  "https://htmlpreview.github.io",
  "https://c-concept-dev.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);

const GEOAPIFY_CATEGORIES = [
  "amenity",
  "catering.cafe",
  "heritage"
].join(",");

const ORS_SEEDS = [17, 41, 83, 121, 167, 211, 257, 301, 347, 389, 433, 479, 523, 569, 613];
const MAPILLARY_FIELDS = "id,geometry,captured_at,thumb_1024_url,sequence";

class HTTPError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff"
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" }
  });
}

function requireOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  if (!ALLOWED_ORIGINS.has(origin)) throw new HTTPError(403, "Origine non autorisée.");
  return origin;
}

async function readJson(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 750_000) throw new HTTPError(413, "Requête trop volumineuse.");
  try {
    return await request.json();
  } catch {
    throw new HTTPError(400, "JSON invalide.");
  }
}

async function providerJson(response) {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new HTTPError(502, `Réponse fournisseur illisible (${response.status}).`);
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || data?.error || `Réponse fournisseur ${response.status}`;
    throw new HTTPError(502, String(message));
  }
  return data;
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new HTTPError(400, `${label} invalide.`);
  return number;
}

export function validateBBox(value) {
  if (!Array.isArray(value) || value.length !== 4) throw new HTTPError(400, "Rectangle géographique invalide.");
  const [west, south, east, north] = value.map((x, index) => finiteNumber(x, `Coordonnée ${index + 1}`));
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new HTTPError(400, "Rectangle géographique hors limites.");
  }
  if (east - west > 0.3 || north - south > 0.3) throw new HTTPError(400, "Zone Geoapify trop étendue.");
  return [west, south, east, north];
}

function haversineMeters(a, b) {
  const p1 = a[1] * Math.PI / 180;
  const p2 = b[1] * Math.PI / 180;
  const dp = (b[1] - a[1]) * Math.PI / 180;
  const dl = (b[0] - a[0]) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function validateCoordinates(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 5000) {
    throw new HTTPError(400, "Trace Mapillary invalide ou trop volumineuse.");
  }
  return value.map((point) => {
    if (!Array.isArray(point) || point.length < 2) throw new HTTPError(400, "Point de trace invalide.");
    const lon = finiteNumber(point[0], "Longitude");
    const lat = finiteNumber(point[1], "Latitude");
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) throw new HTTPError(400, "Point de trace hors limites.");
    return [lon, lat];
  });
}

export function sampleRoute(coordinates, maximum = 30) {
  if (coordinates.length <= maximum) return coordinates;
  const cumulative = [0];
  for (let i = 1; i < coordinates.length; i += 1) {
    cumulative.push(cumulative[i - 1] + haversineMeters(coordinates[i - 1], coordinates[i]));
  }
  const total = cumulative.at(-1);
  if (!total) return [coordinates[0]];
  const sampled = [];
  let index = 0;
  for (let i = 0; i < maximum; i += 1) {
    const target = total * i / (maximum - 1);
    while (index < cumulative.length - 1 && cumulative[index] < target) index += 1;
    const previous = Math.max(0, index - 1);
    const chosen = Math.abs(cumulative[index] - target) < Math.abs(cumulative[previous] - target) ? index : previous;
    const point = coordinates[chosen];
    if (!sampled.length || point[0] !== sampled.at(-1)[0] || point[1] !== sampled.at(-1)[1]) sampled.push(point);
  }
  return sampled;
}

export function buildMapillaryBoxes(coordinates, radiusMeters = 125) {
  const boxes = sampleRoute(coordinates, 30).map(([lon, lat]) => {
    const padLat = radiusMeters / 111320;
    const padLon = radiusMeters / (111320 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
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
  if (!env.GEOAPIFY_API_KEY) throw new HTTPError(503, "Secret Geoapify non configuré.");
  const query = new URLSearchParams({ text: "Paris", limit: "1", apiKey: env.GEOAPIFY_API_KEY });
  const data = await providerJson(await fetch(`https://api.geoapify.com/v1/geocode/search?${query}`, {
    headers: { Accept: "application/json" }
  }));
  return { resultCount: data?.features?.length || 0 };
}

async function testMapillary(env) {
  if (!env.MAPILLARY_ACCESS_TOKEN) throw new HTTPError(503, "Secret Mapillary non configuré.");
  const query = new URLSearchParams({
    fields: "id",
    bbox: "2.2940,48.8580,2.2950,48.8590",
    limit: "1"
  });
  const data = await providerJson(await fetch(`https://graph.mapillary.com/images?${query}`, {
    headers: { Accept: "application/json", Authorization: `OAuth ${env.MAPILLARY_ACCESS_TOKEN}` }
  }));
  return { resultCount: data?.data?.length || 0 };
}

async function testORS(env) {
  if (!env.ORS_API_KEY) throw new HTTPError(503, "Secret OpenRouteService non configuré.");
  const query = new URLSearchParams({ api_key: env.ORS_API_KEY, text: "Paris", size: "1" });
  const data = await providerJson(await fetch(`https://api.openrouteservice.org/geocode/search?${query}`, {
    headers: { Accept: "application/json" }
  }));
  return { resultCount: data?.features?.length || 0 };
}

async function handleTest(request, env, origin) {
  const { service } = await readJson(request);
  if (service === "geo") return json({ ok: true, service, ...(await testGeoapify(env)) }, 200, origin);
  if (service === "mapillary") return json({ ok: true, service, ...(await testMapillary(env)) }, 200, origin);
  if (service === "ors") return json({ ok: true, service, ...(await testORS(env)) }, 200, origin);
  throw new HTTPError(400, "Service inconnu.");
}

async function handleGeoapifyPlaces(request, env, origin) {
  if (!env.GEOAPIFY_API_KEY) throw new HTTPError(503, "Secret Geoapify non configuré.");
  const { bbox } = await readJson(request);
  const query = new URLSearchParams({
    categories: GEOAPIFY_CATEGORIES,
    filter: `rect:${validateBBox(bbox).join(",")}`,
    limit: "200",
    lang: "fr",
    apiKey: env.GEOAPIFY_API_KEY
  });
  const data = await providerJson(await fetch(`https://api.geoapify.com/v2/places?${query}`, {
    headers: { Accept: "application/geo+json" }
  }));
  return json(data, 200, origin);
}

async function fetchMapillaryBox(box, env) {
  const query = new URLSearchParams({
    fields: MAPILLARY_FIELDS,
    bbox: box.join(","),
    limit: "30"
  });
  const response = await fetch(`https://graph.mapillary.com/images?${query}`, {
    headers: { Accept: "application/json", Authorization: `OAuth ${env.MAPILLARY_ACCESS_TOKEN}` }
  });
  return providerJson(response);
}

async function handleMapillaryImages(request, env, origin) {
  if (!env.MAPILLARY_ACCESS_TOKEN) throw new HTTPError(503, "Secret Mapillary non configuré.");
  const body = await readJson(request);
  const coordinates = validateCoordinates(body.coordinates);
  const boxes = buildMapillaryBoxes(coordinates);
  const unique = new Map();
  const errors = [];
  for (let offset = 0; offset < boxes.length; offset += 6) {
    const settled = await Promise.allSettled(boxes.slice(offset, offset + 6).map((box) => fetchMapillaryBox(box, env)));
    for (const result of settled) {
      if (result.status === "rejected") {
        errors.push(result.reason?.message || "Recherche Mapillary impossible.");
        continue;
      }
      for (const photo of result.value?.data || []) {
        if (photo?.id && !unique.has(String(photo.id))) unique.set(String(photo.id), photo);
        if (unique.size >= 400) break;
      }
    }
    if (unique.size >= 400) break;
  }
  if (!unique.size && errors.length === boxes.length) throw new HTTPError(502, errors[0]);
  return json({ data: [...unique.values()].slice(0, 400), requestCount: boxes.length, partialErrors: errors.length }, 200, origin);
}

async function handleORSRoundTrips(request, env, origin) {
  if (!env.ORS_API_KEY) throw new HTTPError(503, "Secret OpenRouteService non configuré.");
  const body = await readJson(request);
  if (!Array.isArray(body.coordinate) || body.coordinate.length !== 2) throw new HTTPError(400, "Départ ORS invalide.");
  const lon = finiteNumber(body.coordinate[0], "Longitude");
  const lat = finiteNumber(body.coordinate[1], "Latitude");
  const target = finiteNumber(body.targetMeters, "Distance cible");
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90 || target < 500 || target > 30000) {
    throw new HTTPError(400, "Paramètres ORS hors limites.");
  }
  const jobs = ORS_SEEDS.map((seed, index) => fetch("https://api.openrouteservice.org/v2/directions/foot-walking/geojson", {
    method: "POST",
    headers: { Accept: "application/json", Authorization: env.ORS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      coordinates: [[lon, lat]],
      elevation: true,
      instructions: true,
      instructions_format: "text",
      language: "fr",
      extra_info: ["steepness", "surface", "waytype", "suitability", "green", "noise"],
      options: {
        round_trip: {
          length: Math.round(target * (0.86 + (index % 5) * 0.07)),
          points: 5 + (index % 3),
          seed
        }
      }
    })
  }).then(providerJson));
  const settled = await Promise.allSettled(jobs);
  const routes = settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value?.features?.[0])
    .filter(Boolean);
  const errors = settled.filter((result) => result.status === "rejected").map((result) => result.reason?.message || "Erreur ORS");
  if (!routes.length) throw new HTTPError(502, errors[0] || "Aucune boucle OpenRouteService renvoyée.");
  return json({ routes, requestCount: ORS_SEEDS.length, partialErrors: errors.length }, 200, origin);
}

async function routeRequest(request, env, origin) {
  const pathname = new URL(request.url).pathname;
  if (request.method !== "POST") throw new HTTPError(405, "Méthode non autorisée.");
  if (pathname === "/v1/test") return handleTest(request, env, origin);
  if (pathname === "/v1/geoapify/places") return handleGeoapifyPlaces(request, env, origin);
  if (pathname === "/v1/mapillary/images") return handleMapillaryImages(request, env, origin);
  if (pathname === "/v1/ors/round-trips") return handleORSRoundTrips(request, env, origin);
  throw new HTTPError(404, "Route inconnue.");
}

export default {
  async fetch(request, env, ctx) {
    const startedAt = Date.now();
    let origin = request.headers.get("Origin") || "";
    try {
      origin = requireOrigin(request);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
      const pathname = new URL(request.url).pathname;
      if (env.SERVICE_RATE_LIMITER) {
        const { success } = await env.SERVICE_RATE_LIMITER.limit({ key: `${origin}:${pathname}` });
        if (!success) throw new HTTPError(429, "Trop de requêtes. Réessayez dans une minute.");
      }
      const response = await routeRequest(request, env, origin);
      console.log(JSON.stringify({ event: "map-service", path: pathname, status: response.status, durationMs: Date.now() - startedAt }));
      return response;
    } catch (error) {
      const status = error instanceof HTTPError ? error.status : 500;
      const message = error instanceof Error ? error.message : "Erreur interne.";
      console.error(JSON.stringify({ event: "map-service-error", status, durationMs: Date.now() - startedAt }));
      return json({ error: { message } }, status, ALLOWED_ORIGINS.has(origin) ? origin : "null");
    }
  }
};
