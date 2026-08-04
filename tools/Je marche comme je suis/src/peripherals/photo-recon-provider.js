(function (global) {
  "use strict";
  function createPhotoReconProvider({ client }) {
    if (!client) throw new Error("Client de services requis.");
    return {
      id: "photo-recon",
      async enrich({ route }) {
        const coordinates = route?.coords || [];
        const [streetView, mapillary] = await Promise.allSettled([
          client.post("/streetview/metadata", { coordinates }),
          client.post("/mapillary/images", { coordinates }),
        ]);
        return {
          streetView: streetView.status === "fulfilled" ? (streetView.value?.data || []) : [],
          mapillary: mapillary.status === "fulfilled" ? (mapillary.value?.data || []) : [],
          warnings: [streetView, mapillary].filter((x) => x.status === "rejected").map((x) => String(x.reason?.message || "Service photo indisponible")),
        };
      },
    };
  }
  global.JMMJSPhotoReconProvider = { createPhotoReconProvider };
})(globalThis);
