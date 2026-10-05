import { DemandeVision, ReponseVision } from "@lienotheque/contrats";
import type { Transport } from "./relecture.js";

/** Le chemin entre l'application et le Worker (OUT-08, règle 6).
 *
 *  **L'application n'a jamais la clé du modèle.** Elle a un jeton d'accès, qui n'ouvre que cette
 *  route, et le Worker détient la clé côté hébergeur. C'est tout l'intérêt du détour : une clé
 *  dans une application de bureau est une clé distribuée.
 *
 *  Le jeton lui-même ne vient pas du dépôt. Il est fourni par l'environnement — trousseau du
 *  système ou variable locale — et ce module ne fait que le porter dans un en-tête. */

export class RelectureInjoignable extends Error {
  constructor(
    readonly statut: number,
    message: string,
  ) {
    super(message);
    this.name = "RelectureInjoignable";
  }
}

/** Ce que l'application met derrière une relecture.
 *
 *  La demande est validée avant de partir : on ne met pas sur le réseau ce qu'on n'a pas vérifié,
 *  même quand c'est soi-même qui l'a construit. La réponse est validée en revenant. Et le jeton
 *  n'apparaît dans aucun message d'erreur — ce qu'on rapporte est un statut. */
export function transportVersWorker(base: string, jeton: string, appeler: typeof fetch = fetch): Transport {
  const adresse = `${base.replace(/\/$/, "")}/vision`;
  return async (demande) => {
    const reponse = await appeler(adresse, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${jeton}` },
      body: JSON.stringify(DemandeVision.parse(demande)),
    });
    if (!reponse.ok) throw new RelectureInjoignable(reponse.status, `La relecture a été refusée (statut ${reponse.status})`);

    const valide = ReponseVision.safeParse(await reponse.json());
    if (!valide.success) throw new RelectureInjoignable(reponse.status, "La relecture a rendu une réponse non conforme");
    return valide.data;
  };
}

/** Le jeton d'accès, pris dans l'environnement et nulle part ailleurs.
 *
 *  Rendu `undefined` plutôt que levé : une application sans jeton n'est pas en panne, elle n'a
 *  simplement pas de relecture ciblée — et doit le dire plutôt que de s'arrêter. */
export const jetonDeLEnvironnement = (env: Record<string, string | undefined> = process.env): string | undefined => {
  const valeur = env.LIENOTHEQUE_JETON;
  return valeur === undefined || valeur.length === 0 ? undefined : valeur;
};
