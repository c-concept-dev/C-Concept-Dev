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
const ORS_BATCH_SIZE = 3;
const MAPILLARY_FIELDS = "id,geometry,captured_at,thumb_1024_url,sequence";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const IGN_ELEVATION_URL =
  "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json";
const IGN_ELEVATION_RESOURCE = "ign_rge_alti_wld";

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
  let bytes;
  try {
    bytes = await request.arrayBuffer();
  } catch {
    throw new HTTPError(400, "Corps de requête illisible.");
  }
  if (bytes.byteLength > 750_000)
    throw new HTTPError(413, "Requête trop volumineuse.");
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
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

function isORSNoRouteError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "ors-no-route" ||
    message.includes("cannot find point") ||
    message.includes("could not find routable point") ||
    message.includes("unable to find a route") ||
    message.includes("couldn't find a route") ||
    message.includes("no route found") ||
    message.includes("no path found")
  );
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
    await fetch(`https://api.geoapify.com/v1/geocode/search?${query}`, {
      headers: { Accept: "application/json" },
    }),
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
    await fetch(`https://graph.mapillary.com/images?${query}`, {
      headers: {
        Accept: "application/json",
        Authorization: `OAuth ${env.MAPILLARY_ACCESS_TOKEN}`,
      },
    }),
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
    await fetch(`https://api.geoapify.com/v2/places?${query}`, {
      headers: { Accept: "application/geo+json" },
    }),
  );
  return json(data, 200, origin);
}

async function fetchMapillaryBox(box, env) {
  const query = new URLSearchParams({
    fields: MAPILLARY_FIELDS,
    bbox: box.join(","),
    limit: "30",
  });
  const response = await fetch(`https://graph.mapillary.com/images?${query}`, {
    headers: {
      Accept: "application/json",
      Authorization: `OAuth ${env.MAPILLARY_ACCESS_TOKEN}`,
    },
  });
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

async function handleOverpassTerrain(request, origin) {
  const body = await readJson(request);
  const route = validateRouteCoordinates(body.route, 80, "Trace Overpass");
  const bufferMeters = Math.max(
    10,
    Math.min(50, finiteNumber(body.bufferMeters ?? 25, "Tampon Overpass")),
  );
  const line = route.map(([lon, lat]) => `${lat},${lon}`).join(",");
  const query = `[out:json][timeout:20];way["highway"](around:${bufferMeters},${line});out tags geom;`;
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "Je-marche-comme-je-suis/1.0",
    },
    body: new URLSearchParams({ data: query }).toString(),
  });
  const data = await providerJson(response);
  const segments = matchTerrainSegments(route, data?.elements, bufferMeters);
  return json(
    {
      segments,
      routeLengthMeters: Math.max(
        0,
        Number(body.routeLengthMeters) ||
          route.slice(1).reduce(
            (total, point, index) =>
              total + haversineMeters(route[index], point),
            0,
          ),
      ),
      retrievedAt: new Date().toISOString(),
      source: "Overpass / OpenStreetMap",
    },
    200,
    origin,
  );
}

async function handleIgnElevation(request, origin) {
  const body = await readJson(request);
  const route = validateRouteCoordinates(body.route, 120, "Trace IGN");
  const response = await fetch(IGN_ELEVATION_URL, {
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
  });
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

function orsErrorRecord(error) {
  return {
    message: String(error?.message || "Erreur ORS"),
    code: error?.code || "ors-error",
    upstreamStatus: Number(error?.upstreamStatus) || null,
  };
}

function isORSProviderUnavailable(error) {
  const status = Number(error?.upstreamStatus);
  return status === 429 || status >= 500 || error?.code === "provider-unreadable";
}

function isORSClientRejection(error) {
  const status = Number(error?.upstreamStatus);
  return status === 400 || status === 404 || status === 422;
}

async function runORSFamily({
  lon,
  lat,
  target,
  apiKey,
  profile,
  routingOptions,
  seedOffset = 0,
  desiredCount = 3,
}) {
  const seeds = ORS_SEEDS.slice(seedOffset, seedOffset + ORS_BATCH_SIZE);
  const settled = await Promise.allSettled(
    seeds.map((seed, batchIndex) =>
      fetchORSRoundTrip({
        lon,
        lat,
        target,
        seed,
        index: seedOffset + batchIndex,
        apiKey,
        profile,
        routingOptions,
      }),
    ),
  );
  const routes = [];
  const errors = [];
  for (const result of settled) {
    if (result.status === "rejected") {
      errors.push(result.reason);
      continue;
    }
    const feature = result.value?.features?.[0];
    if (
      feature?.geometry?.type === "LineString" &&
      Array.isArray(feature.geometry.coordinates) &&
      feature.geometry.coordinates.length >= 2
    ) {
      routes.push(feature);
      if (routes.length >= desiredCount) break;
    } else {
      errors.push(
        new HTTPError(502, "Boucle ORS sans géométrie GeoJSON exploitable.", {
          code: "ors-invalid-geometry",
        }),
      );
    }
  }
  return { routes, errors, requestCount: seeds.length };
}

async function handleORSRoundTrips(request, env, origin) {
  if (!env.ORS_API_KEY)
    throw new HTTPError(503, "Secret OpenRouteService non configuré.");
  const body = await readJson(request);
  if (!Array.isArray(body.coordinate) || body.coordinate.length !== 2)
    throw new HTTPError(400, "Départ ORS invalide.");
  const lon = finiteNumber(body.coordinate[0], "Longitude");
  const lat = finiteNumber(body.coordinate[1], "Latitude");
  const target = finiteNumber(body.targetMeters, "Distance cible");
  if (
    Math.abs(lon) > 180 ||
    Math.abs(lat) > 90 ||
    target < 500 ||
    target > 30000
  ) {
    throw new HTTPError(400, "Paramètres ORS hors limites.");
  }

  const routing = sanitizeORSRouting(body);
  const desiredCount = Math.max(1, Math.min(3, Math.round(Number(body.count) || 3)));
  const preferred = await runORSFamily({
    lon,
    lat,
    target,
    apiKey: env.ORS_API_KEY,
    profile: routing.profile,
    routingOptions: routing.options,
    desiredCount,
  });

  if (preferred.routes.length) {
    return json(
      {
        routes: preferred.routes,
        requestCount: preferred.requestCount,
        partialErrors: preferred.errors.length,
        outcome: "success",
        preferencesApplied: routing.preferencesApplied,
        preferencesRelaxed: [],
      },
      200,
      origin,
    );
  }

  if (preferred.errors.some(isORSProviderUnavailable)) {
    const error = preferred.errors.find(isORSProviderUnavailable);
    throw new HTTPError(502, error?.message || "OpenRouteService indisponible.", {
      code: error?.code || "provider-error",
      upstreamStatus: error?.upstreamStatus,
    });
  }

  let totalRequests = preferred.requestCount;
  let allErrors = [...preferred.errors];
  if (routing.preferencesApplied.length) {
    const neutral = await runORSFamily({
      lon,
      lat,
      target,
      apiKey: env.ORS_API_KEY,
      profile: routing.profile,
      routingOptions: routing.hardOptions,
      seedOffset: ORS_BATCH_SIZE,
      desiredCount,
    });
    totalRequests += neutral.requestCount;
    allErrors = allErrors.concat(neutral.errors);
    if (neutral.routes.length) {
      return json(
        {
          routes: neutral.routes,
          requestCount: totalRequests,
          partialErrors: allErrors.length,
          outcome: "success-with-relaxed-preferences",
          preferencesApplied: [],
          preferencesRelaxed: routing.preferencesApplied,
          notice:
            "Aucune boucle n’a été obtenue avec les préférences facultatives. Les contraintes impératives ont été conservées et les préférences ont seulement servi au classement après calcul.",
        },
        200,
        origin,
      );
    }
    if (neutral.errors.some(isORSProviderUnavailable)) {
      const error = neutral.errors.find(isORSProviderUnavailable);
      throw new HTTPError(502, error?.message || "OpenRouteService indisponible.", {
        code: error?.code || "provider-error",
        upstreamStatus: error?.upstreamStatus,
      });
    }
  }

  const onlyNoRouteOrRejected =
    allErrors.length > 0 &&
    allErrors.every((error) => isORSNoRouteError(error) || isORSClientRejection(error));
  return json(
    {
      routes: [],
      requestCount: totalRequests,
      partialErrors: allErrors.length,
      outcome: "no-result",
      preferencesApplied: routing.preferencesApplied,
      preferencesRelaxed: [],
      error: {
        code: routing.preferencesApplied.length
          ? "ors-preferences-no-result"
          : "ors-no-route",
        reason: routing.preferencesApplied.length
          ? "preferences-and-network-incompatible"
          : "no-compatible-loop",
        message: routing.preferencesApplied.length
          ? "OpenRouteService fonctionne, mais aucune boucle compatible n’a été trouvée autour de ce départ, même après un essai sans les préférences facultatives."
          : "OpenRouteService fonctionne, mais aucune boucle pédestre compatible n’a été trouvée autour de ce départ.",
        details: onlyNoRouteOrRejected
          ? allErrors.slice(0, 3).map(orsErrorRecord)
          : [],
      },
    },
    200,
    origin,
  );
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
  if (Object.keys(weightings).length && profile === "foot-walking")
    profileParams.weightings = weightings;
  if (profile === "wheelchair") {
    const source = body.restrictions || {};
    const restrictions = {
      surface_type: "cobblestone:flattened",
      track_type: "grade1",
      smoothness_type: "good",
      maximum_sloped_kerb: [0.03, 0.06, 0.1].includes(
        Number(source.maximum_sloped_kerb),
      )
        ? Number(source.maximum_sloped_kerb)
        : 0.06,
      maximum_incline: [3, 6, 10, 15].includes(Number(source.maximum_incline))
        ? Number(source.maximum_incline)
        : 6,
    };
    const width = Number(source.minimum_width);
    if (Number.isFinite(width) && width >= 0.5 && width <= 3)
      restrictions.minimum_width = width;
    profileParams.restrictions = restrictions;
  }
  if (Object.keys(profileParams).length) options.profile_params = profileParams;
  const hardOptions = { ...options };
  if (hardOptions.profile_params?.weightings) {
    hardOptions.profile_params = { ...hardOptions.profile_params };
    delete hardOptions.profile_params.weightings;
    if (!Object.keys(hardOptions.profile_params).length)
      delete hardOptions.profile_params;
  }
  return {
    profile,
    options,
    hardOptions,
    preferencesApplied: Object.keys(weightings),
  };
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
}) {
  return providerJson(
    await fetch(
      `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
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
    ),
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
      if (env.ENVIRONMENT === "production" && !env.SERVICE_RATE_LIMITER)
        throw new HTTPError(503, "Limitation de débit non configurée en production.");
      if (env.SERVICE_RATE_LIMITER) {
        const clientHint = request.headers.get("CF-Connecting-IP") || "anonymous";
        const ephemeralKey = `${origin}:${pathname}:${clientHint}`;
        const { success } = await env.SERVICE_RATE_LIMITER.limit({
          key: ephemeralKey,
        });
        if (!success)
          throw new HTTPError(
            429,
            "Trop de requêtes. Réessayez dans une minute.",
          );
      }
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
