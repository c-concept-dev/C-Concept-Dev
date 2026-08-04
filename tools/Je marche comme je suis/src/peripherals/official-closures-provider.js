(function (global) {
  "use strict";
  function createOfficialClosuresProvider({ client }) {
    if (!client) throw new Error("Client de services requis.");
    return {
      id: "official-closures",
      async nearby({ route, radiusMeters = 300 }) {
        const response = await client.post("/official/closures", {
          coordinates: route?.coords || [],
          radiusMeters,
        });
        return response?.data || [];
      },
    };
  }
  global.JMMJSOfficialClosuresProvider = { createOfficialClosuresProvider };
})(globalThis);
