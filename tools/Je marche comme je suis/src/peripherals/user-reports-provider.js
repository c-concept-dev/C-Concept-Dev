(function (global) {
  "use strict";
  function createUserReportsProvider({ client }) {
    if (!client) throw new Error("Client de services requis.");
    return {
      id: "user-reports",
      async nearby({ route, radiusMeters = 300 }) {
        const response = await client.post("/reports/nearby", { coordinates: route?.coords || [], radiusMeters });
        return response?.data || [];
      },
      async submit(report) {
        const response = await client.post("/reports", report);
        return response?.data || response;
      },
    };
  }
  global.JMMJSUserReportsProvider = { createUserReportsProvider };
})(globalThis);
