/* M-02 — EXÉCUTEUR À CONCURRENCE BORNÉE
 * ============================================================================
 *
 * Une brique unique, générique et pure : exécuter N tâches indépendantes avec
 * au plus L en vol, et rendre leurs résultats DANS L'ORDRE D'ENTRÉE.
 *
 * Ce qu'elle garantit — et pourquoi chacun compte :
 *
 *   ORDRE D'ENTRÉE PRÉSERVÉ. L'ordre d'arrivée réseau ne doit jamais devenir
 *   l'ordre sémantique d'un résultat. Chaque tâche écrit à SON index, jamais
 *   par `push` : c'est ce qui rend impossible qu'une réponse rapide double une
 *   réponse lente dans l'agrégat final.
 *
 *   TOUTES LES TÂCHES SONT TENTÉES. On rend un tableau de verdicts, jamais une
 *   promesse qui rejette à la première erreur. La raison n'est pas stylistique :
 *   le pipeline appelant, aujourd'hui, exécute TOUS ses appels puis échoue si
 *   l'un a échoué. Rejeter tôt annulerait des appels qui ont lieu actuellement,
 *   donc changerait la politique d'échec — ce que ce lot s'interdit.
 *
 *   BORNE RESPECTÉE. La limite est une contrainte TECHNIQUE — capacité d'un
 *   fournisseur, budget de débit — jamais une propriété du contenu traité.
 *   Elle est donc toujours INJECTÉE par l'appelant, jamais décidée ici.
 *
 *   AUCUNE STARVATION. Chaque tâche admissible finit ou échoue explicitement.
 *
 * Ce module n'a aucune dépendance, ne connaît aucun fournisseur, aucun rôle,
 * aucun schéma. Il ne sait pas ce qu'il exécute — et c'est précisément ce qui
 * lui permet d'être utilisé sans introduire d'autorité nouvelle.
 * ========================================================================= */

/**
 * Valeur par défaut DÉLIBÉRÉMENT séquentielle.
 *
 * Un défaut supérieur à 1 changerait le comportement de tout appelant qui n'a
 * pas explicitement demandé la concurrence — y compris ceux dont le fournisseur
 * protège son débit par un stimulateur partagé. Le défaut ne peut donc pas être
 * un réglage de performance : il doit être le comportement d'avant.
 */
export const DEFAULT_CONCURRENCY = 1;

/** Une limite est un entier ≥ 1. Rien d'autre n'est une limite. */
export function normalizeConcurrency(value) {
  if (value === undefined || value === null) return DEFAULT_CONCURRENCY;
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`M-02 : la limite de concurrence doit être un entier ≥ 1 (reçu : ${String(value)}).`);
  }
  return value;
}

/**
 * Exécute `tasks` avec au plus `concurrency` tâches en vol.
 *
 * @param {ReadonlyArray<() => Promise<unknown>>} tasks fonctions sans argument.
 * @param {{concurrency?: number, signal?: {aborted: boolean, reason?: unknown}}} [options]
 * @returns {Promise<Array<{status: "fulfilled", value: unknown} | {status: "rejected", reason: unknown}>>}
 *          un verdict PAR TÂCHE, au MÊME index que dans `tasks`.
 */
export async function runBounded(tasks, { concurrency, signal } = {}) {
  if (!Array.isArray(tasks)) throw new TypeError("M-02 : runBounded attend une liste de tâches.");
  const limit = normalizeConcurrency(concurrency);
  for (const task of tasks) {
    if (typeof task !== "function") throw new TypeError("M-02 : chaque tâche doit être une fonction sans argument.");
  }
  if (tasks.length === 0) return [];

  /* Tableau pré-dimensionné : chaque tâche écrit à SON index. Aucune écriture
     concurrente ne peut se retrouver à la place d'une autre, et le dernier à
     répondre n'écrase jamais le premier. */
  const results = new Array(tasks.length);
  let next = 0;

  /* Un ouvrier consomme les indices restants un par un. Le nombre d'ouvriers EST
     la borne : il n'existe aucun autre endroit où une tâche pourrait démarrer. */
  async function worker() {
    for (;;) {
      const index = next;
      if (index >= tasks.length) return;
      next += 1;
      if (signal && signal.aborted) {
        /* L'annulation du parent arrête la PRISE de nouvelles tâches. Elle
           n'invente aucune politique : les tâches déjà lancées suivent celle de
           leur propre appel, et celles jamais lancées portent la raison. */
        results[index] = { status: "rejected", reason: signal.reason ?? new Error("M-02 : exécution annulée.") };
        continue;
      }
      try {
        results[index] = { status: "fulfilled", value: await tasks[index]() };
      } catch (reason) {
        /* Une tâche qui échoue n'annule pas ses voisines : ce serait décider à
           la place de l'appelant, dont la politique d'échec lui appartient. */
        results[index] = { status: "rejected", reason };
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(limit, tasks.length); i += 1) workers.push(worker());
  await Promise.all(workers);
  return results;
}
