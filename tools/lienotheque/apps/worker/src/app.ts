import { EtatService, type Capacite } from "@lienotheque/contrats";
import { Hono } from "hono";

export const SERVICE = "lienotheque-worker";
export const VERSION = "0.1.0";

/** Ce que le service sait faire au lot 0. La liste grandira avec les routes (HEB-01). */
export const CAPACITES: readonly Capacite[] = ["sante"];

type Options = { readonly maintenant?: () => Date };

/** Application Hono du lot 0 : une route de santé, rien d'autre.
 *  La réponse est validée par son contrat avant l'envoi (CLAUDE.md, règle 2). */
export function creerApp({ maintenant = () => new Date() }: Options = {}): Hono {
  const app = new Hono();

  app.get("/sante", (contexte) => {
    const etat = EtatService.parse({
      service: SERVICE,
      version: VERSION,
      etat: "pret",
      horodatage: maintenant().toISOString().replace("Z", "+00:00"),
      capacites: [...CAPACITES],
    });
    return contexte.json(etat);
  });

  app.notFound((contexte) => contexte.json({ erreur: "Route inconnue" }, 404));

  return app;
}
