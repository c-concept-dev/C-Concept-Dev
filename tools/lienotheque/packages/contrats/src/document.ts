import { z } from "zod";
import { Horodatage, Identifiant } from "./commun.js";

/** Unité logique de lecture, identifiant stable distinct de toute empreinte (ID-02). */
export const Document = z
  .object({
    id: Identifiant,
    bibliothequeId: Identifiant,
    titre: z.string().min(1),
    /** Identifiants hérités (ancienne base) conservés comme alias (ID-08). */
    alias: z.array(z.string().min(1)).default([]),
    creeLe: Horodatage,
  })
  .strict();
export type Document = z.infer<typeof Document>;

/** Ce que l'on cherche indépendamment des documents (ID-03). Attributs libres, typés par le schéma de la bibliothèque. */
export const Oeuvre = z
  .object({
    id: Identifiant,
    bibliothequeId: Identifiant,
    titre: z.string().min(1),
    attributs: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type Oeuvre = z.infer<typeof Oeuvre>;
