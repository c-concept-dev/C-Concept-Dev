import assert from "node:assert/strict";
import test from "node:test";
import worker, { buildMapillaryBoxes, sampleRoute, validateBBox } from "../src/index.mjs";

const allowedOrigin = "https://htmlpreview.github.io";
const limiter = { limit: async () => ({ success: true }) };

test("Mapillary samples long routes and produces small boxes", () => {
  const route = Array.from({ length: 300 }, (_, index) => [2.29 + index * 0.0001, 48.85 + index * 0.00005]);
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
  const response = await worker.fetch(new Request("https://worker.example/v1/test", {
    method: "POST",
    headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
    body: JSON.stringify({ service: "geo" })
  }), { SERVICE_RATE_LIMITER: limiter, GEOAPIFY_API_KEY: "secret" }, {});
  assert.equal(response.status, 403);
});

test("Mapillary token stays in the upstream Authorization header", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith("https://graph.mapillary.com/images?"));
    assert.equal(options.headers.Authorization, "OAuth hidden-token");
    assert.ok(!String(url).includes("hidden-token"));
    return new Response(JSON.stringify({ data: [{ id: "1", geometry: { coordinates: [2.2945, 48.8584] } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const response = await worker.fetch(new Request("https://worker.example/v1/mapillary/images", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ coordinates: [[2.2945, 48.8584], [2.2946, 48.8585]] })
  }), { SERVICE_RATE_LIMITER: limiter, MAPILLARY_ACCESS_TOKEN: "hidden-token" }, {});
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.data.length, 1);
});
