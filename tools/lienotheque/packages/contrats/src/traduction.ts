import { z } from "zod";
import { Identifiant } from "./commun.js";

/** Une demande de traduction désigne exclusivement du texte déjà conservé dans la bibliothèque.
 * Le navigateur ne peut donc jamais substituer un texte arbitraire à celui de la version. */
export const DemandeTraductionPage = z
  .object({
    version: Identifiant,
    page: z.number().int().positive(),
  })
  .strict();
export type DemandeTraductionPage = z.infer<typeof DemandeTraductionPage>;

const Traduite = z
  .object({
    etat: z.literal("traduite"),
    page: z.number().int().positive(),
    langueSource: z.string().min(2),
    langueCible: z.literal("fr"),
    traduction: z.array(z.string().min(1)).min(1),
    automatique: z.literal(true),
    cache: z.enum(["cree", "present"]),
    modele: z.literal("@cf/meta/m2m100-1.2b"),
  })
  .strict();

const DejaEnFrancais = z
  .object({
    etat: z.literal("deja_en_francais"),
    page: z.number().int().positive(),
    langueSource: z.literal("fr"),
    langueCible: z.literal("fr"),
    traduction: z.array(z.string()).max(0),
    automatique: z.literal(false),
    cache: z.literal("inutile"),
  })
  .strict();

export const TraductionDePage = z.discriminatedUnion("etat", [Traduite, DejaEnFrancais]);
export type TraductionDePage = z.infer<typeof TraductionDePage>;
