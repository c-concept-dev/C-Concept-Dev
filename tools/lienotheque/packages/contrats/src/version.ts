import { z } from "zod";
import { Empreinte, Horodatage, Identifiant, NumeroVersion, RefOutil, RefRecette } from "./commun.js";

/** États d'une version de document (CDC v2.0, « Définitions et états »). */
export const EtatVersion = z.enum(["recu", "prepare", "lu", "pret_a_lire", "indexe", "partiel", "en_echec", "remplacee"]);
export type EtatVersion = z.infer<typeof EtatVersion>;

/** Transitions autorisées. `partiel` et `en_echec` sont reprenables ; `remplacee` est terminal. */
export const TRANSITIONS_VERSION: Readonly<Record<EtatVersion, readonly EtatVersion[]>> = {
  recu: ["prepare", "partiel", "en_echec"],
  prepare: ["lu", "partiel", "en_echec"],
  lu: ["pret_a_lire", "partiel", "en_echec"],
  pret_a_lire: ["indexe", "partiel", "en_echec", "remplacee"],
  indexe: ["partiel", "remplacee"],
  partiel: ["prepare", "lu", "pret_a_lire", "indexe", "en_echec", "remplacee"],
  en_echec: ["recu", "prepare", "lu", "remplacee"],
  remplacee: [],
};

export function transitionVersionAutorisee(de: EtatVersion, vers: EtatVersion): boolean {
  return TRANSITIONS_VERSION[de].includes(vers);
}

/** Une version activable doit au moins être consultable (ID-04, ID-05). */
export const ETATS_ACTIVABLES: readonly EtatVersion[] = ["pret_a_lire", "indexe"];

export const VersionDocument = z
  .object({
    id: Identifiant,
    documentId: Identifiant,
    numero: NumeroVersion,
    etat: EtatVersion,
    active: z.boolean(),
    fichiers: z.array(Empreinte).min(1),
    recette: RefRecette,
    outils: z.array(RefOutil),
    precedenteId: Identifiant.optional(),
    manques: z.array(z.string()).default([]),
    creeLe: Horodatage,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.active && !ETATS_ACTIVABLES.includes(v.etat)) {
      ctx.addIssue({ code: "custom", path: ["active"], message: `Une version à l'état « ${v.etat} » ne peut pas être active` });
    }
    if (v.etat === "partiel" && v.manques.length === 0) {
      ctx.addIssue({ code: "custom", path: ["manques"], message: "Une version partielle doit lister ses manques" });
    }
    if (v.etat === "remplacee" && v.active) {
      ctx.addIssue({ code: "custom", path: ["active"], message: "Une version remplacée ne peut pas être active" });
    }
  });
export type VersionDocument = z.infer<typeof VersionDocument>;
