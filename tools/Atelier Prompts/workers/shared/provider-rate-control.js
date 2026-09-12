/* M-03 — CAPACITÉ TECHNIQUE DES FOURNISSEURS ET CONTRÔLE DE DÉBIT
 * ============================================================================
 *
 * M-02 a construit un exécuteur borné et prouvé qu'un groupe d'appels était
 * réellement indépendant, mais a refusé de l'activer : les protections de débit
 * n'étaient pas conscientes de la concurrence. Ce module est la condition
 * manquante, et rien de plus.
 *
 * CE QU'IL DÉCIDE : quand une requête technique peut commencer.
 * CE QU'IL NE DÉCIDE PAS : quel fournisseur, quel modèle, quelle tâche est
 * prioritaire, quel résultat vaut mieux. Aucune de ces questions n'est une
 * question de débit.
 *
 * CE QU'IL N'INVENTE PAS — et c'est l'essentiel :
 *
 *   Aucun quota commercial. Le dépôt ne contient AUCUNE limite de requêtes par
 *   minute opposable : `rpm_budget` y est explicitement `null`, « non contraint
 *   empiriquement à ce jour ». Écrire ici un RPM, un RPS ou une rafale
 *   reviendrait à inventer le contrat commercial d'une API qu'on n'a pas lu.
 *
 *   Aucun espacement temporel fictif. Rendre une protection consciente de la
 *   concurrence ne veut pas dire ralentir : cela veut dire BORNER le nombre
 *   d'appels simultanés, ce qui est mesurable et vérifiable, plutôt qu'imposer
 *   un délai qu'aucune donnée ne justifie.
 *
 * LA VALEUR RETENUE, ET POURQUOI ELLE EST CE QU'ELLE EST : aucune preuve ne
 * justifie une valeur particulière supérieure à 1. Le pas minimal au-dessus du
 * séquentiel est donc retenu — 2. Ce n'est pas un réglage de performance : c'est
 * le plus petit écart possible par rapport au comportement éprouvé, choisi
 * précisément parce qu'on ne sait pas ce qu'un écart plus grand ferait. Le
 * benchmark de M-02 était meilleur à 4 ; ce n'est pas une raison, et cette
 * valeur n'a donc pas été retenue.
 * ========================================================================= */

/** Défaut SÛR : en l'absence de capacité connue, on reste séquentiel. */
export const DEFAULT_PROVIDER_MAX_INFLIGHT = 1;

/**
 * Borne haute absolue. Elle n'exprime aucune connaissance d'un quota : elle
 * garantit seulement qu'aucune configuration, même erronée, ne puisse produire
 * une concurrence non bornée.
 */
export const PROVIDER_MAX_INFLIGHT_CEILING = 8;

/**
 * CAPACITÉS TECHNIQUES — jamais sémantiques.
 *
 * Un fournisseur n'y déclare pas ce qu'il « sait faire » : uniquement combien
 * d'appels on accepte de lui adresser en même temps. Aucune de ces entrées ne
 * peut influencer un choix de modèle, de route ou de résultat.
 */
export const PROVIDER_TECHNICAL_CAPABILITIES = Object.freeze({
  groq: Object.freeze({
    max_inflight: 2,
    /* Le débit de Groq est protégé PAR REQUÊTE : fetchGroqWithRetry honore
       429/Retry-After pour l'appel qui le reçoit, sans état partagé. Cette
       protection reste donc entière sous concurrence. */
    rate_protection: "per_request_retry_after"
  }),
  anthropic: Object.freeze({
    max_inflight: 2,
    /* Aucune reprise, aucun stimulateur : choix documenté, faute de preuve
       empirique. Borner le nombre d'appels simultanés est alors la seule
       protection honnête — et la seule qui n'invente rien. */
    rate_protection: "bounded_inflight_only"
  }),
  openai: Object.freeze({
    max_inflight: 2,
    rate_protection: "bounded_inflight_only"
  })
});

/** Une capacité est un entier entre 1 et le plafond. Rien d'autre. */
export function normalizeMaxInflight(value) {
  if (!Number.isInteger(value) || value < 1 || value > PROVIDER_MAX_INFLIGHT_CEILING) {
    return DEFAULT_PROVIDER_MAX_INFLIGHT;
  }
  return value;
}

/**
 * LA source unique d'un nombre d'appels simultanés.
 *
 * Toute limite de concurrence du système passe par ici. Un fournisseur inconnu,
 * une capacité absente ou une valeur aberrante retombent sur le défaut sûr —
 * jamais sur une valeur permissive, jamais sur le nombre de tâches.
 */
export function resolveProviderConcurrency(provider) {
  const capability = PROVIDER_TECHNICAL_CAPABILITIES[String(provider)];
  if (!capability) return DEFAULT_PROVIDER_MAX_INFLIGHT;
  return normalizeMaxInflight(capability.max_inflight);
}

/**
 * FENÊTRE DE DÉBIT PARTAGÉE, RENDUE SÛRE SOUS CONCURRENCE.
 *
 * Le défaut que M-02 avait identifié : N appels simultanés lisent le MÊME
 * `nextAvailableAt`, attendent le même instant, puis partent tous ensemble. La
 * protection devient alors un point de rafale, exactement à l'instant où elle
 * était censée protéger.
 *
 * La correction sérialise la RÉSERVATION, jamais le vol réseau. Un seul appel à
 * la fois franchit la fenêtre ; les autres attendent leur tour dans l'ordre
 * d'arrivée. Aucun délai n'est ajouté au-delà de celui que le fournisseur a
 * lui-même demandé : à un seul appelant, le comportement est identique.
 */
export function createRateWindow({ sleepFn, now = () => Date.now() } = {}) {
  if (typeof sleepFn !== "function") throw new TypeError("M-03 : createRateWindow exige une fonction d'attente.");
  let nextAvailableAt = 0;
  /* Chaîne de réservation : chaque appel attend le précédent, et libère le
     suivant. C'est une section critique MINIMALE — elle ne couvre que l'attente
     de la fenêtre, jamais la requête elle-même. */
  let tail = Promise.resolve();

  return {
    /** Réserve le droit de partir. Ne retourne rien : le vol réseau est libre. */
    async reserve() {
      const previous = tail;
      let release;
      tail = new Promise((resolve) => { release = resolve; });
      await previous;
      try {
        const waitMs = nextAvailableAt - now();
        if (waitMs > 0) await sleepFn(waitMs);
      } finally {
        release();
      }
    },
    /** Repousse la fenêtre. Une valeur non finie ou passée ne la touche pas. */
    recordWaitMs(waitMs) {
      if (Number.isFinite(waitMs) && waitMs > 0) nextAvailableAt = now() + waitMs;
    },
    /** Lecture d'audit uniquement. */
    get nextAvailableAt() { return nextAvailableAt; }
  };
}
