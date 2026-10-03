import { z } from "zod";
import { Horodatage, Identifiant, RefOutil } from "./commun.js";

export const EtatTravail = z.enum([
  "en_file", "verrouille", "en_cours", "termine", "partiel", "en_echec_recuperable", "en_echec_definitif", "annule",
]);
export type EtatTravail = z.infer<typeof EtatTravail>;

/** Travail persisté avant de commencer (JOB-01), verrou avec expiration (JOB-02), point de reprise (JOB-03). */
export const Travail = z
  .object({
    id: Identifiant,
    outil: RefOutil,
    versionCible: Identifiant,
    etat: EtatTravail,
    tentative: z.number().int().min(1),
    verrou: z.object({ appareilId: Identifiant, expireLe: Horodatage }).strict().optional(),
    pointReprise: z.object({ unite: z.enum(["page", "lot", "fichier"]), valeur: z.number().int().nonnegative() }).strict().optional(),
    progression: z.number().min(0).max(1),
    erreur: z
      .object({ cause: z.string().min(1), elements: z.array(z.string()), reprisePossible: z.boolean() })
      .strict()
      .optional(),
    creeLe: Horodatage,
    majLe: Horodatage,
  })
  .strict()
  .superRefine((t, ctx) => {
    const enEchec = t.etat === "en_echec_recuperable" || t.etat === "en_echec_definitif";
    if (enEchec && !t.erreur) ctx.addIssue({ code: "custom", path: ["erreur"], message: "Un échec enregistre sa cause (JOB-05)" });
    if (t.etat === "verrouille" && !t.verrou) ctx.addIssue({ code: "custom", path: ["verrou"], message: "Un travail verrouillé porte son verrou (JOB-02)" });
    if (t.etat === "termine" && t.progression !== 1) ctx.addIssue({ code: "custom", path: ["progression"], message: "Un travail terminé est à 100 %" });
  });
export type Travail = z.infer<typeof Travail>;
