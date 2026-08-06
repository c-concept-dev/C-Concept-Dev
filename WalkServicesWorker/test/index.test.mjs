import assert from "node:assert/strict";
import test from "node:test";
import worker, {
  buildMapillaryBoxes,
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

test("ORS round trips use GeoJSON and stop after the first six successful candidates", async (t) => {
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
  assert.equal(data.routes.length, 6);
  assert.equal(data.requestCount, 6);
  assert.equal(upstreamCalls, 6);
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
  assert.equal(data.routes.length, 6);
});

test("ORS no-route is a successful empty search and stops after one batch", async (t) => {
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
  assert.equal(data.outcome, "no-result");
  assert.equal(data.error.code, "ors-no-route");
  assert.equal(data.requestCount, 6);
  assert.equal(upstreamCalls, 6);
});
