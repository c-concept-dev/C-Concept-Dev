import assert from "node:assert/strict";
import test from "node:test";
import worker, {
  buildMapillaryBoxes,
  matchTerrainSegments,
  sampleRoute,
  validateBBox,
} from "../src/index.mjs";

const allowedOrigin = "https://htmlpreview.github.io";
const limiter = { limit: async () => ({ success: true }) };

test("Mapillary samples long routes and produces small boxes", () => {
  const route = Array.from({ length: 300 }, (_, index) => [
    2.29 + index * 0.0001,
    48.85 + index * 0.00005,
  ]);
  assert.equal(sampleRoute(route, 30).length, 30);
  const boxes = buildMapillaryBoxes(route);
  assert.ok(boxes.length <= 30);
  for (const [west, south, east, north] of boxes) {
    assert.ok(east - west < 0.005);
    assert.ok(north - south < 0.003);
  }
});

test("Geoapify bounding boxes are constrained", () => {
  assert.deepEqual(validateBBox([2.2, 48.8, 2.4, 49]), [2.2, 48.8, 2.4, 49]);
  assert.throws(() => validateBBox([2, 48, 3, 49]), /trop étendue/);
});

test("rate limiting is keyed per visitor, not just per origin and path", async () => {
  const seenKeys = [];
  const trackingLimiter = {
    limit: async ({ key }) => {
      seenKeys.push(key);
      return { success: true };
    },
  };
  await worker.fetch(
    new Request("https://worker.example/v1/test", {
      method: "POST",
      headers: {
        Origin: allowedOrigin,
        "CF-Connecting-IP": "203.0.113.10",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ service: "geo" }),
    }),
    { SERVICE_RATE_LIMITER: trackingLimiter, GEOAPIFY_API_KEY: "secret" },
    {},
  );
  await worker.fetch(
    new Request("https://worker.example/v1/test", {
      method: "POST",
      headers: {
        Origin: allowedOrigin,
        "CF-Connecting-IP": "198.51.100.20",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ service: "geo" }),
    }),
    { SERVICE_RATE_LIMITER: trackingLimiter, GEOAPIFY_API_KEY: "secret" },
    {},
  );
  assert.equal(seenKeys.length, 2);
  assert.notEqual(seenKeys[0], seenKeys[1]);
  assert.ok(seenKeys[0].endsWith(":203.0.113.10"));
  assert.ok(seenKeys[1].endsWith(":198.51.100.20"));
});

test("requests fail closed when the rate limiter binding is missing", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/v1/test", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ service: "geo" }),
    }),
    { GEOAPIFY_API_KEY: "secret" },
    {},
  );
  assert.equal(response.status, 503);
});

test("unapproved origins are rejected before provider access", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/v1/test", {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ service: "geo" }),
    }),
    { SERVICE_RATE_LIMITER: limiter, GEOAPIFY_API_KEY: "secret" },
    {},
  );
  assert.equal(response.status, 403);
});

test("Mapillary token stays in the upstream Authorization header", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith("https://graph.mapillary.com/images?"));
    assert.equal(options.headers.Authorization, "OAuth hidden-token");
    assert.ok(!String(url).includes("hidden-token"));
    return new Response(
      JSON.stringify({
        data: [{ id: "1", geometry: { coordinates: [2.2945, 48.8584] } }],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };
  const response = await worker.fetch(
    new Request("https://worker.example/v1/mapillary/images", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinates: [
          [2.2945, 48.8584],
          [2.2946, 48.8585],
        ],
      }),
    }),
    { SERVICE_RATE_LIMITER: limiter, MAPILLARY_ACCESS_TOKEN: "hidden-token" },
    {},
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.data.length, 1);
});

test("ORS health check creates a real GeoJSON round trip", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let upstreamCalls = 0;
  globalThis.fetch = async (url, options) => {
    upstreamCalls += 1;
    assert.equal(
      String(url),
      "https://api.openrouteservice.org/v2/directions/foot-walking/geojson",
    );
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Accept, "application/geo+json");
    assert.equal(options.headers.Authorization, "hidden-ors-key");
    const body = JSON.parse(options.body);
    assert.deepEqual(body.coordinates, [[2.3522, 48.8566]]);
    assert.equal(body.options.round_trip.points, 3);
    return new Response(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [2.3522, 48.8566],
                [2.353, 48.857],
                [2.3522, 48.8566],
              ],
            },
            properties: { summary: { distance: 1024, duration: 780 } },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/geo+json" } },
    );
  };

  const response = await worker.fetch(
    new Request("https://worker.example/v1/test", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ service: "ors" }),
    }),
    { SERVICE_RATE_LIMITER: limiter, ORS_API_KEY: "hidden-ors-key" },
    {},
  );

  assert.equal(response.status, 200);
  assert.equal(upstreamCalls, 1);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.routeDistanceMeters, 1024);
  assert.equal(data.routeDurationSeconds, 780);
});

test("ORS round trips use GeoJSON and stop after the first four successful candidates", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let upstreamCalls = 0;
  globalThis.fetch = async (_url, options) => {
    upstreamCalls += 1;
    assert.equal(options.headers.Accept, "application/geo+json");
    const body = JSON.parse(options.body);
    const [lon, lat] = body.coordinates[0];
    return new Response(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [lon, lat],
                [lon + 0.001, lat + 0.001],
                [lon, lat],
              ],
            },
            properties: {
              summary: {
                distance: body.options.round_trip.length,
                duration: 1200,
              },
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/geo+json" } },
    );
  };

  const response = await worker.fetch(
    new Request("https://worker.example/v1/ors/round-trips", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinate: [1.444, 43.604], targetMeters: 5000 }),
    }),
    { SERVICE_RATE_LIMITER: limiter, ORS_API_KEY: "hidden-ors-key" },
    {},
  );

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.routes.length, 4);
  assert.equal(data.requestCount, 4);
  assert.equal(upstreamCalls, 4);
});

test("ORS round trips whitelist wheelchair restrictions and routing options", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(
      String(url),
      "https://api.openrouteservice.org/v2/directions/wheelchair/geojson",
    );
    const body = JSON.parse(options.body);
    assert.deepEqual(body.options.avoid_features, ["steps"]);
    assert.equal(body.options.profile_params.restrictions.maximum_incline, 6);
    assert.equal(body.options.profile_params.restrictions.minimum_width, 1.2);
    assert.equal(body.options.profile_params.weightings, undefined);
    assert.equal(body.options.untrusted, undefined);
    const [lon, lat] = body.coordinates[0];
    return new Response(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [lon, lat],
                [lon + 0.001, lat],
                [lon, lat],
              ],
            },
            properties: {
              summary: {
                distance: body.options.round_trip.length,
                duration: 1200,
              },
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/geo+json" } },
    );
  };

  const response = await worker.fetch(
    new Request("https://worker.example/v1/ors/round-trips", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinate: [1.444, 43.604],
        targetMeters: 5000,
        profile: "wheelchair",
        avoidFeatures: ["steps", "highways"],
        weightings: { green: { factor: 1 } },
        restrictions: { maximum_incline: 6, minimum_width: 1.2 },
        untrusted: "must-not-pass",
      }),
    }),
    { SERVICE_RATE_LIMITER: limiter, ORS_API_KEY: "hidden-ors-key" },
    {},
  );

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.routes.length, 4);
});

test("ORS no-routable-start stops after one batch and reports the new outcome envelope", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return new Response(
      JSON.stringify({ error: { message: "Cannot find point 0: 0.0,0.0" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  };

  const response = await worker.fetch(
    new Request("https://worker.example/v1/ors/round-trips", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinate: [0, 0], targetMeters: 2500 }),
    }),
    { SERVICE_RATE_LIMITER: limiter, ORS_API_KEY: "hidden-ors-key" },
    {},
  );

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.routes, []);
  assert.equal(data.outcome, "no-routable-start");
  assert.equal(data.provider, "ors");
  assert.equal(data.retryable, false);
  assert.equal(data.requestCount, 4);
  assert.equal(upstreamCalls, 4);
});

test("ORS no-route (routable start, no loop) tries every batch before giving up", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return new Response(
      JSON.stringify({ error: { message: "Unable to find a route" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  };

  const response = await worker.fetch(
    new Request("https://worker.example/v1/ors/round-trips", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinate: [0, 0], targetMeters: 2500 }),
    }),
    { SERVICE_RATE_LIMITER: limiter, ORS_API_KEY: "hidden-ors-key" },
    {},
  );

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.outcome, "no-route");
  assert.equal(data.requestCount, 15);
  assert.equal(upstreamCalls, 15);
});

test("ORS preferences-too-restrictive is reported instead of plain no-route when green/quiet were requested", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: { message: "No route found" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );

  const response = await worker.fetch(
    new Request("https://worker.example/v1/ors/round-trips", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinate: [0, 0],
        targetMeters: 2500,
        weightings: { green: { factor: 1 } },
      }),
    }),
    { SERVICE_RATE_LIMITER: limiter, ORS_API_KEY: "hidden-ors-key" },
    {},
  );

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.outcome, "preferences-too-restrictive");
});

test("ORS provider-unavailable stops immediately instead of burning through every seed", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return new Response("bad gateway", { status: 503 });
  };

  const response = await worker.fetch(
    new Request("https://worker.example/v1/ors/round-trips", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinate: [0, 0], targetMeters: 2500 }),
    }),
    { SERVICE_RATE_LIMITER: limiter, ORS_API_KEY: "hidden-ors-key" },
    {},
  );

  assert.equal(response.status, 502);
  const data = await response.json();
  assert.equal(data.outcome, "provider-unavailable");
  assert.equal(data.retryable, true);
  assert.equal(data.providerStatus, 503);
  assert.ok(upstreamCalls < 15, "should not exhaust every seed against a dead provider");
});

test("ORS provider error responses are logged with the real upstream message body", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  });
  const upstreamBody = {
    error: { code: 2010, message: "Route could not be found - Please check supplied parameters." },
  };
  globalThis.fetch = async () =>
    new Response(JSON.stringify(upstreamBody), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  const errorLogs = [];
  console.error = (line) => errorLogs.push(line);

  const response = await worker.fetch(
    new Request("https://worker.example/v1/ors/round-trips", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinate: [1.444, 43.604], targetMeters: 5000 }),
    }),
    { SERVICE_RATE_LIMITER: limiter, ORS_API_KEY: "hidden-ors-key" },
    {},
  );

  assert.equal(response.status, 502);
  const entry = errorLogs
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.event === "provider-error-body");
  assert.ok(entry, "expected a provider-error-body log entry");
  assert.equal(entry.status, 400);
  assert.deepEqual(entry.body, upstreamBody);
  assert.equal(entry.url, "https://api.openrouteservice.org/v2/directions/foot-walking/geojson");
});

test("ORS invalid-request is reported for malformed input without calling the provider", async (t) => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error("must not be called");
  };

  const response = await worker.fetch(
    new Request("https://worker.example/v1/ors/round-trips", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinate: [0], targetMeters: 2500 }),
    }),
    { SERVICE_RATE_LIMITER: limiter, ORS_API_KEY: "hidden-ors-key" },
    {},
  );

  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.outcome, "invalid-request");
  assert.equal(data.requestCount, 0);
  assert.equal(upstreamCalls, 0);
});

test("ORS success reports preferencesApplied and imperativesPreserved", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const [lon, lat] = body.coordinates[0];
    return new Response(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [lon, lat],
                [lon + 0.001, lat + 0.001],
                [lon, lat],
              ],
            },
            properties: { summary: { distance: body.options.round_trip.length, duration: 1200 } },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/geo+json" } },
    );
  };

  const response = await worker.fetch(
    new Request("https://worker.example/v1/ors/round-trips", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinate: [1.444, 43.604],
        targetMeters: 5000,
        weightings: { green: { factor: 1 } },
      }),
    }),
    { SERVICE_RATE_LIMITER: limiter, ORS_API_KEY: "hidden-ors-key" },
    {},
  );

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.outcome, "success");
  assert.deepEqual(data.preferencesApplied, ["green"]);
  assert.equal(data.imperativesPreserved, true);
});

test("ORS flags imperativesPreserved as false when a requested wheelchair restriction is silently substituted", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const [lon, lat] = body.coordinates[0];
    return new Response(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [lon, lat],
                [lon + 0.001, lat],
                [lon, lat],
              ],
            },
            properties: { summary: { distance: body.options.round_trip.length, duration: 1200 } },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/geo+json" } },
    );
  };

  const response = await worker.fetch(
    new Request("https://worker.example/v1/ors/round-trips", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinate: [1.444, 43.604],
        targetMeters: 5000,
        profile: "wheelchair",
        restrictions: { maximum_incline: 8 },
      }),
    }),
    { SERVICE_RATE_LIMITER: limiter, ORS_API_KEY: "hidden-ors-key" },
    {},
  );

  const data = await response.json();
  assert.equal(data.imperativesPreserved, false);
});

test("terrain matching keeps only route segments close to documented OSM ways", () => {
  const route = [
    [1.44, 43.6],
    [1.441, 43.6],
  ];
  const segments = matchTerrainSegments(
    route,
    [
      {
        type: "way",
        id: 42,
        tags: { highway: "footway", surface: "asphalt" },
        geometry: [
          { lon: 1.44, lat: 43.60001 },
          { lon: 1.441, lat: 43.60001 },
        ],
      },
      {
        type: "way",
        id: 99,
        tags: { highway: "steps" },
        geometry: [
          { lon: 1.44, lat: 43.61 },
          { lon: 1.441, lat: 43.61 },
        ],
      },
    ],
    25,
  );
  assert.equal(segments.length, 1);
  assert.equal(segments[0].id, 42);
  assert.equal(segments[0].tags.surface, "asphalt");
  assert.ok(segments[0].lengthMeters > 70);
  assert.ok(segments[0].matchDistanceMeters < 2);
});

test("Overpass terrain endpoint validates the trace and returns matched evidence", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://overpass-api.de/api/interpreter");
    assert.match(String(options.body), /way%5B%22highway%22%5D/);
    return new Response(
      JSON.stringify({
        elements: [
          {
            type: "way",
            id: 42,
            tags: { highway: "path", smoothness: "good" },
            geometry: [
              { lon: 1.44, lat: 43.6 },
              { lon: 1.441, lat: 43.6 },
            ],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const response = await worker.fetch(
    new Request("https://worker.example/v1/overpass/terrain", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({
        route: [
          [1.44, 43.6],
          [1.441, 43.6],
        ],
        bufferMeters: 25,
        routeLengthMeters: 81,
      }),
    }),
    { SERVICE_RATE_LIMITER: limiter },
    {},
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.segments.length, 1);
  assert.equal(data.routeLengthMeters, 81);
  assert.equal(data.source, "Overpass / OpenStreetMap");
  assert.equal(data.status, "ok");
});

test("Overpass terrain falls back to the second instance on failure", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const calledUrls = [];
  globalThis.fetch = async (url) => {
    calledUrls.push(String(url));
    if (String(url).includes("overpass-api.de"))
      return new Response("bad gateway", { status: 502 });
    return new Response(JSON.stringify({ elements: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const response = await worker.fetch(
    new Request("https://worker.example/v1/overpass/terrain", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({
        route: [
          [1.44, 43.6],
          [1.441, 43.6],
        ],
      }),
    }),
    { SERVICE_RATE_LIMITER: limiter },
    {},
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, "ok");
  assert.equal(calledUrls.length, 2);
  assert.ok(calledUrls[1].includes("overpass.kumi.systems"));
});

test("Overpass terrain returns terrain-unavailable without blocking the walk when every instance fails", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response("bad gateway", { status: 502 });
  const response = await worker.fetch(
    new Request("https://worker.example/v1/overpass/terrain", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({
        route: [
          [1.44, 43.6],
          [1.441, 43.6],
        ],
        routeLengthMeters: 81,
      }),
    }),
    { SERVICE_RATE_LIMITER: limiter },
    {},
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, "terrain-unavailable");
  assert.deepEqual(data.segments, []);
  assert.equal(data.routeLengthMeters, 81);
});

test("IGN elevation endpoint uses elevationLine and removes uncovered values", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(
      String(url),
      "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json",
    );
    const body = JSON.parse(options.body);
    assert.equal(body.resource, "ign_rge_alti_wld");
    assert.equal(body.sampling, "3");
    return new Response(
      JSON.stringify({
        elevations: [
          { lon: 1.44, lat: 43.6, z: 150 },
          { lon: 1.4405, lat: 43.6005, z: -99999 },
          { lon: 1.441, lat: 43.601, z: 162 },
        ],
        height_differences: { positive: 12, negative: 0 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const response = await worker.fetch(
    new Request("https://worker.example/v1/ign/elevation", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({
        route: [
          [1.44, 43.6],
          [1.4405, 43.6005],
          [1.441, 43.601],
        ],
      }),
    }),
    { SERVICE_RATE_LIMITER: limiter },
    {},
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.elevations.length, 2);
  assert.equal(data.ascentMeters, 12);
  assert.equal(data.coveragePercent, 67);
});

test("fallback-starts finds a plausible alternative departure and stops within budget", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let orsCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("overpass")) {
      return new Response(
        JSON.stringify({
          elements: [
            { type: "node", id: 1, lat: 43.62, lon: 1.41, tags: { amenity: "parking" } },
            { type: "node", id: 2, lat: 43.70, lon: 1.50, tags: { leisure: "park" } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    orsCalls += 1;
    const body = JSON.parse(options.body);
    const [lon, lat] = body.coordinates[0];
    return new Response(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "LineString", coordinates: [[lon, lat], [lon + 0.001, lat], [lon, lat]] },
            properties: { summary: { distance: body.options.round_trip.length, duration: 900 } },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/geo+json" } },
    );
  };

  const response = await worker.fetch(
    new Request("https://worker.example/v1/fallback-starts", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ origin: { lat: 43.60, lon: 1.44 }, targetMeters: 2500, radiusMeters: 10000 }),
    }),
    { SERVICE_RATE_LIMITER: limiter, ORS_API_KEY: "hidden-ors-key" },
    {},
  );

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.outcome, "fallback-starts-found");
  assert.equal(data.starts.length, 2);
  assert.equal(data.starts[0].access.parking, "documented");
  assert.equal(data.starts[0].distanceFromOriginMeters > 0, true);
  assert.ok(!("reason" in data.starts[0]), "no unverifiable qualitative claim should be fabricated");
  assert.equal(orsCalls, 2, "one successful attempt per candidate, no wasted second try");
});

test("fallback-starts never tests more than 3 candidates or 2 ORS attempts each", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let orsCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes("overpass")) {
      return new Response(
        JSON.stringify({
          elements: Array.from({ length: 6 }, (_, index) => ({
            type: "node",
            id: index,
            lat: 43.6 + index * 0.01,
            lon: 1.44 + index * 0.01,
            tags: { amenity: "parking" },
          })),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    orsCalls += 1;
    return new Response(
      JSON.stringify({ error: { message: "Unable to find a route" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  };

  const response = await worker.fetch(
    new Request("https://worker.example/v1/fallback-starts", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ origin: { lat: 43.60, lon: 1.44 }, targetMeters: 2500, maximumCandidates: 6 }),
    }),
    { SERVICE_RATE_LIMITER: limiter, ORS_API_KEY: "hidden-ors-key" },
    {},
  );

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.outcome, "no-fallback-starts");
  assert.equal(data.candidatesConsidered, 6);
  assert.equal(data.candidatesTested, 3);
  assert.equal(orsCalls, 6, "3 candidates x 2 attempts maximum");
});

test("fallback-starts reports invalid-request without calling any provider", async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("must not be called");
  };

  const response = await worker.fetch(
    new Request("https://worker.example/v1/fallback-starts", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ origin: { lat: 999, lon: 1.44 }, targetMeters: 2500 }),
    }),
    { SERVICE_RATE_LIMITER: limiter, ORS_API_KEY: "hidden-ors-key" },
    {},
  );

  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.outcome, "invalid-request");
  assert.equal(calls, 0);
});

test("fallback-starts reports provider-unavailable instead of no-fallback-starts on a real ORS outage (audit W-B02)", async (t) => {
  const originalFetch = globalThis.fetch;
  let orsCalls = 0;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url) => {
    if (String(url).includes("overpass")) {
      return new Response(
        JSON.stringify({
          elements: [
            { type: "node", id: 1, lat: 43.62, lon: 1.41, tags: { amenity: "parking" } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    orsCalls += 1;
    return new Response("bad gateway", { status: 503 });
  };

  const response = await worker.fetch(
    new Request("https://worker.example/v1/fallback-starts", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ origin: { lat: 43.60, lon: 1.44 }, targetMeters: 2500 }),
    }),
    { SERVICE_RATE_LIMITER: limiter, ORS_API_KEY: "hidden-ors-key" },
    {},
  );

  assert.equal(response.status, 502);
  const data = await response.json();
  assert.equal(data.outcome, "provider-unavailable");
  assert.notEqual(data.outcome, "no-fallback-starts");
  assert.equal(data.retryable, true);
  assert.equal(orsCalls, 1, "should stop at the first real provider failure instead of testing every candidate");
});

test("readJson enforces the real body size even without a Content-Length header (audit W-B03)", async (t) => {
  const oversized = "x".repeat(760_000);
  const response = await worker.fetch(
    new Request("https://worker.example/v1/test", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: `{"service":"geo","padding":"${oversized}"}`,
    }),
    { SERVICE_RATE_LIMITER: limiter, GEOAPIFY_API_KEY: "secret" },
    {},
  );
  assert.equal(response.status, 413);
});

test("the ORS base URL is configurable via env.ORS_BASE_URL (audit W-B04)", async (t) => {
  const originalFetch = globalThis.fetch;
  let calledUrl = null;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, options) => {
    calledUrl = String(url);
    const body = JSON.parse(options.body);
    const [lon, lat] = body.coordinates[0];
    return new Response(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "LineString", coordinates: [[lon, lat], [lon + 0.001, lat], [lon, lat]] },
            properties: { summary: { distance: body.options.round_trip.length, duration: 900 } },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/geo+json" } },
    );
  };

  await worker.fetch(
    new Request("https://worker.example/v1/ors/round-trips", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinate: [1.444, 43.604], targetMeters: 2500 }),
    }),
    {
      SERVICE_RATE_LIMITER: limiter,
      ORS_API_KEY: "hidden-ors-key",
      ORS_BASE_URL: "https://ors-mock.example.test",
    },
    {},
  );

  assert.ok(calledUrl.startsWith("https://ors-mock.example.test/"));
});

test("an ORS request that times out is classified as a retryable provider-unavailable outcome (audit W-B01)", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => {
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    throw error;
  };

  const response = await worker.fetch(
    new Request("https://worker.example/v1/ors/round-trips", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinate: [1.444, 43.604], targetMeters: 2500 }),
    }),
    { SERVICE_RATE_LIMITER: limiter, ORS_API_KEY: "hidden-ors-key" },
    {},
  );

  assert.equal(response.status, 502);
  const data = await response.json();
  assert.equal(data.outcome, "provider-unavailable");
  assert.equal(data.retryable, true);
});
