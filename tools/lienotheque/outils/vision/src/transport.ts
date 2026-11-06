import { execFileSync } from "node:child_process";
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
    if (!reponse.ok) {
      // Le message de notre propre route est à nous : il ne porte aucun secret — la route s'en
      // assure — et sans lui un 502 ne dit pas s'il vient du modèle, du contrat ou du
      // recoupement. Ne pas le relayer rendait la panne indiagnosticable.
      let dit: string | undefined;
      try {
        const corps = (await reponse.json()) as { erreur?: unknown; ecarts?: unknown };
        if (typeof corps.erreur === "string") dit = corps.erreur;
        if (Array.isArray(corps.ecarts) && corps.ecarts.length > 0) dit = `${dit ?? "refus"} — ${corps.ecarts.slice(0, 3).join(" ; ")}`;
      } catch {
        // Un corps illisible ne doit pas masquer le statut, qui reste la seule chose sûre.
      }
      throw new RelectureInjoignable(reponse.status, `La relecture a été refusée (statut ${reponse.status})${dit === undefined ? "" : ` : ${dit}`}`);
    }

    const valide = ReponseVision.safeParse(await reponse.json());
    if (!valide.success) throw new RelectureInjoignable(reponse.status, "La relecture a rendu une réponse non conforme");
    return valide.data;
  };
}

/** Le jeton d'accès, pris dans l'environnement et nulle part ailleurs.
 *
 *  Rendu `undefined` plutôt que levé : une application sans jeton n'est pas en panne, elle n'a
 *  simplement pas de relecture ciblée — et doit le dire plutôt que de s'arrêter. */
/** Service sous lequel le trousseau du système garde le jeton. */
export const SERVICE_TROUSSEAU = "lienotheque-jeton";

/** Le jeton depuis le trousseau du système, au moment de l'appel.
 *
 *  Il ne passe ni par un fichier, ni par une variable d'environnement, ni par un journal : il est
 *  lu, gardé en mémoire le temps de l'appel, et c'est tout. La sortie d'erreur du programme est
 *  jetée plutôt que rapportée — un message d'erreur de trousseau peut citer ce qu'il a trouvé.
 *
 *  Rendu `undefined` quand le trousseau ne le connaît pas, pour la même raison que ci-dessus :
 *  l'absence de jeton n'est pas une panne. */
export function jetonDuTrousseau(service = SERVICE_TROUSSEAU, lire = lireParSecurity): string | undefined {
  try {
    const valeur = lire(service).replace(/\n$/, "");
    return valeur.length === 0 ? undefined : valeur;
  } catch {
    return undefined;
  }
}

const lireParSecurity = (service: string): string =>
  execFileSync("security", ["find-generic-password", "-s", service, "-w"], {
    encoding: "utf8",
    // La sortie d'erreur est jetée : on ne veut pas d'un message qui citerait quoi que ce soit.
    stdio: ["ignore", "pipe", "ignore"],
  });

/** Le jeton, et il n'a qu'une source : **le trousseau du système**.
 *
 *  Il a existé un second chemin, par la variable `LIENOTHEQUE_JETON`, passant devant le
 *  trousseau. Il est retiré (décision de Christophe du 6 novembre 2026), pour trois raisons
 *  mesurées le même jour :
 *
 *  - **aucun appelant ne s'en gardait.** Les quinze appelants de cette fonction n'avaient pas la
 *    garde, et les douze programmes qui portaient la garde ne l'appelaient pas : deux ensembles
 *    disjoints. Le chemin n'était donc protégé nulle part.
 *  - **aucune intégration continue n'en dépendait.** Les deux ateliers ne posent pas la variable,
 *    et le seul contrôle en ligne se saute sur l'absence d'adresse du Worker.
 *  - **il était silencieux.** Un jeton qui traîne dans l'environnement l'emportait sur le
 *    trousseau sans que rien ne le dise, et un jeton silencieux est un jeton qu'on ne sait pas
 *    avoir utilisé.
 *
 *  `LIENOTHEQUE_JETON` garde un rôle, et **un seul** : un signal de refus pour les programmes de
 *  mesure hors ligne, qui s'arrêtent quand ils le voient. Un signal de refus ne doit pas pouvoir
 *  servir d'accès — c'était exactement le cumul des deux rôles dans une même variable.
 *
 *  `lire` est injectable pour que cette fonction s'éprouve **sans interroger le vrai trousseau**.
 *  Sans cela, un contrôle qui échoue affiche le vrai jeton dans son message d'écart : c'est
 *  arrivé en écrivant le contrôle rouge de cette décision. */
export const jetonDacces = (lire = lireParSecurity): string | undefined =>
  jetonDuTrousseau(SERVICE_TROUSSEAU, lire);
