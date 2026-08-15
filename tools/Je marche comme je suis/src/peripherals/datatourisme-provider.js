(() => {
  "use strict";

  // Classification best-effort : les valeurs exactes de l'ontologie DATAtourisme
  // (thésaurus PointOfInterestClass) n'ont pas pu être vérifiées sans appel réel
  // authentifié. Le champ `type` renvoyé par l'API est un tableau d'URI
  // d'ontologie (ex. ".../ontology/core#PointOfInterest") ; on cherche des
  // motifs plausibles dans l'ensemble du tableau plutôt que sur une seule
  // valeur. À AFFINER après le premier appel réel — voir le test de connexion
  // "tourism" côté Worker pour observer une réponse authentique.
  function type(typeValue) {
    const values = (Array.isArray(typeValue) ? typeValue : [typeValue])
      .map((value) => String(value || "").toLowerCase());
    const has = (needle) => values.some((value) => value.includes(needle));
    if (has("toilet")) return "Toilettes";
    if (has("water") && !has("waterscape")) return "Eau potable";
    if (has("bench") || has("restarea")) return "Banc";
    if (has("shelter")) return "Abri";
    if (has("pharmacy")) return "Pharmacie";
    if (has("cafe")) return "Café";
    if (has("restaurant")) return "Restaurant";
    if (has("bakery")) return "Boulangerie";
    if (has("picnic")) return "Pique-nique";
    if (has("shop") || has("commercial")) return "Commerce";
    if (has("parking")) return "Parking";
    if (has("viewpoint") || has("panorama")) return "Point de vue";
    if (has("heritage") || has("museum") || has("castle") || has("religioussite") || has("culturalsite"))
      return "Patrimoine";
    return "Curiosité locale";
  }

  // Le champ `label` (et potentiellement d'autres champs multilingues) peut
  // arriver soit déjà filtré en une seule langue (chaîne simple), soit sous
  // forme d'objet par langue (`{fr: "...", en: "..."}`) selon la manière dont
  // l'API applique le paramètre `lang`. On gère les deux cas défensivement.
  function localizedText(value, fallback) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      if (typeof value.fr === "string" && value.fr.trim()) return value.fr.trim();
      const first = Object.values(value).find(
        (entry) => typeof entry === "string" && entry.trim(),
      );
      if (first) return first;
    }
    return fallback;
  }

  // Position : `isLocatedAt.geo` — le nom exact des sous-champs de latitude et
  // longitude n'a pas pu être confirmé sans appel réel. On tente plusieurs
  // conventions plausibles (schema.org préfixé, ou noms directs).
  function coordinatesFromGeo(geo) {
    if (!geo || typeof geo !== "object") return [NaN, NaN];
    const lat = geo["schema:latitude"] ?? geo.latitude ?? geo.lat;
    const lon = geo["schema:longitude"] ?? geo.longitude ?? geo.lon ?? geo.lng;
    return [Number(lon), Number(lat)];
  }

  function createDatatourismeProvider({ client, nearestRouteDistance }) {
    return {
      id: "datatourisme",
      kind: "enrichment",
      label: "DATAtourisme",
      async enrich({ route, radiusMeters = 300, limit = 40 }) {
        if (!Array.isArray(route?.coords) || route.coords.length < 2) {
          throw new TypeError("Trace invalide pour DATAtourisme.");
        }
        const data = await client.post("tourism", "/datatourisme/places", {
          route: route.coords.map((point) => point.slice(0, 2)),
          radiusMeters,
          limit,
        });
        const items = Array.isArray(data?.items) ? data.items : [];
        return items
          .map((item, index) => {
            const [lon, lat] = coordinatesFromGeo(item.isLocatedAt?.geo);
            const distance = Number.isFinite(lon) && Number.isFinite(lat)
              ? nearestRouteDistance([lon, lat], route.coords)
              : Infinity;
            return {
              id: item.uuid || `dt-${index}`,
              type: type(item.type),
              name: localizedText(item.label, "Lieu touristique"),
              distance: Math.round(distance),
              detourMeters: Math.round(distance * 2),
              lon,
              lat,
              source: "DATAtourisme",
              sources: ["DATAtourisme"],
              hours: null,
              accessibility: "unknown",
            };
          })
          .filter(
            (place) =>
              Number.isFinite(place.lon) &&
              Number.isFinite(place.lat) &&
              place.distance <= radiusMeters,
          )
          .slice(0, limit);
      },
    };
  }

  globalThis.JMMJSDatatourismeProvider = Object.freeze({ createDatatourismeProvider });
})();
