import { z } from "zod";
import { Empreinte, Horodatage, Identifiant } from "./commun.js";

/** Un fichier = une suite d'octets identifiée par son empreinte ; le nom n'est qu'une étiquette (ID-01). */
export const Fichier = z
  .object({
    empreinte: Empreinte,
    taille: z.number().int().nonnegative(),
    typeMime: z.string().min(1),
    nomOrigine: z.string().min(1),
    ajouteLe: Horodatage,
    appareilId: Identifiant,
  })
  .strict();
export type Fichier = z.infer<typeof Fichier>;
