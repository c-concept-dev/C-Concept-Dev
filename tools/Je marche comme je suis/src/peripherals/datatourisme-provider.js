(() => {
  "use strict";

  // Classification confirmée le 15 août 2026 sur un vrai appel authentifié
  // (centre de Toulouse) : le champ `type` est un tableau de noms de classe
  // d'ontologie lisibles (ex. "CulturalSite", "Hotel"), pas des URI complètes
  // comme initialement supposé — la recherche de motif en sous-chaîne
  // fonctionne donc directement. Le même appel a aussi révélé qu'une requête
  // DATAtourisme non filtrée sur une zone urbaine dense renvoie presque
  // exclusivement de l'hébergement (Hotel, Accommodation, LodgingBusiness...)
  // — exclu côté Worker via le paramètre `filters`, voir DATATOURISME_EXCLUDED_TYPES.
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
    if (has("river") || has("stream")) return "Rivière";
    if (has("lake")) return "Lac";
    if (has("forest")) return "Forêt";
    if (has("naturalcuriosity")) return "Curiosité locale";
    if (has("heritage") || has("museum") || has("castle") || has("religioussite") || has("culturalsite"))
      return "Patrimoine";
    // Un type non reconnu ne doit jamais être présumé "Curiosité locale" —
    // ce libellé correspond à une envie cochable précise ; l'attribuer par
    // défaut créerait un faux "respecté" pour cette envie sur n'importe quel
    // lieu non classé (des hôtels l'ont confirmé lors du premier appel réel).
    return "Lieu touristique";
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

  // Le Worker plafonne la trace à 200 points ; un vrai tracé ORS peut
  // largement dépasser ce nombre. On simplifie avant envoi, même principe que
  // simplifyCoordinates() côté Overpass — seule la forme générale du tracé
  // compte ici, pas la précision point par point, puisque seul un rectangle
  // englobant est calculé à partir de ces coordonnées.
  function simplifyRouteCoordinates(coordinates = [], maxPoints = 80) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
    if (coordinates.length <= maxPoints)
      return coordinates.map((point) => [Number(point[0]), Number(point[1])]);
    const last = coordinates.length - 1;
    const output = [];
    for (let index = 0; index < maxPoints; index += 1) {
      const point = coordinates[Math.round((index * last) / (maxPoints - 1))];
      output.push([Number(point[0]), Number(point[1])]);
    }
    return output;
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
          route: simplifyRouteCoordinates(route.coords),
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
