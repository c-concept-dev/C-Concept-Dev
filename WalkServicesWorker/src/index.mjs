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
const ORS_BATCH_SIZE = 6;
const MAPILLARY_FIELDS = "id,geometry,captured_at,thumb_1024_url,sequence";

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
  const routes = [];
  const errors = [];
  let requestCount = 0;
  for (
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
        }),
      ),
    );
    requestCount += seeds.length;
    for (const result of settled) {
      if (result.status === "rejected") {
        errors.push(result.reason?.message || "Erreur ORS");
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
        errors.push("Boucle ORS sans géométrie GeoJSON exploitable.");
      }
    }
    if (!routes.length && settled.every(
      (result) => result.status === "rejected" && isORSNoRouteError(result.reason),
    )) {
      return json(
        {
          routes: [],
          requestCount,
          partialErrors: errors.length,
          outcome: "no-result",
          error: {
            code: "ors-no-route",
            message:
              "OpenRouteService n’a trouvé aucun départ pédestre routable à proximité de ce point.",
          },
        },
        200,
        origin,
      );
    }
  }
  if (!routes.length)
    throw new HTTPError(
      502,
      errors[0] || "Aucune boucle OpenRouteService renvoyée.",
    );
  return json(
    { routes, requestCount, partialErrors: errors.length },
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
  return { profile, options };
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
      if (env.SERVICE_RATE_LIMITER) {
        const { success } = await env.SERVICE_RATE_LIMITER.limit({
          key: `${origin}:${pathname}`,
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
