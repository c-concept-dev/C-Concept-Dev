import { z } from "zod";
import { Horodatage, Identifiant } from "./commun.js";

export const TypeObjet = z.enum(["fichier", "version", "ancre", "lien", "carte", "recette", "schema", "droits", "hebergement"]);

/** Toute modification est une opération journalisée et idempotente (SYN-01, SYN-02). */
export const Operation = z
  .object({
    operationId: Identifiant,
    deviceId: Identifiant,
    objet: z.object({ type: TypeObjet, id: z.string().min(1) }).strict(),
    action: z.enum(["creer", "modifier", "supprimer"]),
    /** Révision attendue de l'objet ; un écart = conflit explicite (SYN-03). */
    revisionAttendue: z.number().int().nonnegative(),
    auteur: z.discriminatedUnion("type", [
      z.object({ type: z.literal("personne"), personneId: Identifiant }).strict(),
      z.object({ type: z.literal("travail"), travailId: Identifiant }).strict(),
    ]),
    contenu: z.unknown(),
    horodatage: Horodatage,
  })
  .strict();
export type Operation = z.infer<typeof Operation>;

export type IssueConflit = "appliquer" | "proposition" | "conflit_a_presenter" | "deja_applique";

/** Règles SYN-02, SYN-04, SYN-05 : décision pure, sans effet de bord. */
export function arbitrer(
  op: Pick<Operation, "operationId" | "revisionAttendue" | "auteur">,
  etat: { revisionActuelle: number; operationsAppliquees: ReadonlySet<string>; derniereDecisionHumaine: boolean },
): IssueConflit {
  if (etat.operationsAppliquees.has(op.operationId)) return "deja_applique";
  if (op.revisionAttendue === etat.revisionActuelle) return "appliquer";
  if (op.auteur.type === "travail") return "proposition"; // l'automatique ne remplace jamais l'humain
  return etat.derniereDecisionHumaine ? "conflit_a_presenter" : "appliquer";
}
