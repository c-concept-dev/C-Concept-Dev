(() => {
  "use strict";

  const SERVICE_ROLES = Object.freeze({
    ors: Object.freeze({ level: "A", label: "Calcul des itinéraires", blocksGeometry: true }),
    geo: Object.freeze({ level: "C", label: "Points d’intérêt et services", blocksGeometry: false }),
    mapillary: Object.freeze({ level: "C", label: "Photographies du terrain", blocksGeometry: false }),
    weather: Object.freeze({ level: "D", label: "Météo", blocksGeometry: false }),
    ign: Object.freeze({ level: "C", label: "Comparaison cartographique", blocksGeometry: false }),
  });

  const DIAGNOSTIC_COPY = Object.freeze({
    timeout: Object.freeze({
      title: "La recherche a pris trop de temps",
      body: "Le service n’a pas répondu dans le délai prévu. Aucun résultat incomplet n’a été présenté comme une promenade validée.",
      state: "timeout",
    }),
    quota: Object.freeze({
      title: "Le service de calcul est temporairement limité",
      body: "La recherche n’a pas pu être terminée en raison d’une limitation temporaire du service. Vos informations sont conservées.",
      state: "limited",
    }),
    "no-result": Object.freeze({
      title: "Aucun itinéraire pédestre n’a été trouvé depuis ce point",
      body: "Le moteur cartographique n’a pas trouvé de réseau pédestre exploitable pour construire une boucle depuis le départ choisi.",
      state: "no-result",
    }),
    "invalid-response": Object.freeze({
      title: "La réponse cartographique est inexploitable",
      body: "Le service a répondu, mais les données reçues ne permettent pas de présenter une boucle valide.",
      state: "invalid",
    }),
    authentication: Object.freeze({
      title: "La connexion sécurisée au service a échoué",
      body: "La connexion sécurisée au service n’a pas pu être établie. Aucune clé ni information technique sensible n’est affichée.",
      state: "authorization",
    }),
    network: Object.freeze({
      title: "La recherche d’itinéraires n’a pas abouti",
      body: "Le service nécessaire au calcul des promenades n’a pas pu être joint. Aucune boucle n’a été créée et vos critères ont été conservés.",
      state: "unavailable",
    }),
    temporary: Object.freeze({
      title: "La recherche d’itinéraires n’a pas abouti",
      body: "Le service nécessaire au calcul des promenades est temporairement indisponible. Aucune boucle n’a été créée et vos critères ont été conservés.",
      state: "unavailable",
    }),
    unknown: Object.freeze({
      title: "La recherche d’itinéraires n’a pas abouti",
      body: "Le service nécessaire au calcul des promenades n’a pas terminé l’opération. Aucune boucle de remplacement n’a été fabriquée.",
      state: "unavailable",
    }),
  });

  function roleFor(service) {
    return SERVICE_ROLES[service] || Object.freeze({
      level: "C",
      label: "Service complémentaire",
      blocksGeometry: false,
    });
  }

  function buildBlockingFailure({ service = "ors", diagnostic = null } = {}) {
    const code = diagnostic?.code || "unknown";
    const copy = DIAGNOSTIC_COPY[code] || DIAGNOSTIC_COPY.unknown;
    const retryable = Boolean(diagnostic?.retryable);
    const actions = [];
    if (retryable) actions.push({ id: "retry", label: "Réessayer" });
    if (code === "no-result") {
      actions.push(
        { id: "change-start", label: "Déplacer le point de départ" },
        { id: "edit-request", label: "Modifier la durée ou la distance" },
      );
    } else {
      actions.push(
        { id: "edit-request", label: "Modifier ma demande" },
        { id: "change-start", label: "Changer le point de départ" },
      );
    }
    actions.push({ id: "home", label: "Revenir à l’accueil" });
    return Object.freeze({
      kind: "blocking-service-failure",
      service,
      role: roleFor(service),
      code,
      state: copy.state,
      title: copy.title,
      body: copy.body,
      retryable,
      attempts: Number(diagnostic?.attempts) || null,
      actions: Object.freeze(actions),
      assurance: "Vos critères sont conservés. Aucun parcours de remplacement n’a été inventé.",
    });
  }

  function buildSecondaryState({
    service,
    diagnostic = null,
    imperative = false,
    staleAt = null,
  } = {}) {
    const role = roleFor(service);
    if (staleAt) {
      return Object.freeze({
        service,
        role,
        status: imperative ? "unknown" : "stale",
        label: "Non actualisé",
        message: `Dernière mise à jour disponible : ${staleAt}. Ces informations peuvent ne plus représenter les conditions actuelles.`,
        blocksValidation: imperative,
      });
    }
    return Object.freeze({
      service,
      role,
      status: imperative ? "unknown" : "unavailable",
      label: imperative ? "Inconnu — vérification indisponible" : "Indisponible",
      message: imperative
        ? "Une exigence impérative dépend de cette information. Elle ne peut pas être déclarée respectée tant que la vérification est indisponible."
        : "Cette information complémentaire n’a pas pu être obtenue. La géométrie et les autres données déjà auditées ne sont pas modifiées.",
      diagnosticCode: diagnostic?.code || "unknown",
      blocksValidation: imperative,
    });
  }

  function summarizeServiceStates(states = []) {
    const normalized = (Array.isArray(states) ? states : []).filter(Boolean);
    const blocking = normalized.filter((item) => item.blocksValidation);
    return Object.freeze({
      title: "Certaines informations n’ont pas pu être obtenues",
      states: Object.freeze(normalized),
      blocksValidation: blocking.length > 0,
      conclusion: blocking.length
        ? "La promenade ne peut pas être validée en mode strict, car une exigence impérative n’a pas pu être vérifiée."
        : "La promenade reste consultable, mais certaines informations complémentaires manquent.",
    });
  }

  globalThis.JMMJSServiceContinuityCore = Object.freeze({
    SERVICE_ROLES,
    DIAGNOSTIC_COPY,
    roleFor,
    buildBlockingFailure,
    buildSecondaryState,
    summarizeServiceStates,
  });
})();
