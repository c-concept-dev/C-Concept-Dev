import { z } from "zod";
import { Empreinte, Identifiant } from "./commun.js";

/** Conventions (CDC v2.0, ANC) : pixels de l'image d'origine après redressement, origine en haut à gauche ;
 *  temps en secondes depuis le début du média (précision 0,01 s) ; texte en caractères Unicode. */
const Px = z.number().nonnegative();
const Secondes = z.number().nonnegative().multipleOf(0.01);

export const StatutPageImprimee = z.enum(["lu", "deduit", "absent"]);

export const SelecteurPage = z
  .object({
    type: z.literal("page"),
    index: z.number().int().min(1),
    pageImprimee: z.object({ valeur: z.string().min(1), statut: StatutPageImprimee }).strict().optional(),
  })
  .strict();

export const SelecteurZone = z
  .object({ type: z.literal("zone"), page: z.number().int().min(1), x: Px, y: Px, l: Px.positive(), h: Px.positive() })
  .strict();

export const SelecteurTemps = z
  .object({ type: z.literal("temps"), debut: Secondes, fin: Secondes })
  .strict()
  .refine((s) => s.fin > s.debut, { message: "La fin doit suivre le début", path: ["fin"] });

export const SelecteurTexte = z
  .object({ type: z.literal("texte"), debut: z.number().int().nonnegative(), fin: z.number().int().positive() })
  .strict()
  .refine((s) => s.fin > s.debut, { message: "La fin doit suivre le début", path: ["fin"] });

/** Élément numéroté. Le mot qui le désigne vient du schéma de la bibliothèque, jamais d'ici (CLA-01). */
export const SelecteurElement = z
  .object({ type: z.literal("element"), page: z.number().int().min(1), valeur: z.string().min(1) })
  .strict();

export const SelecteurChapitre = z.object({ type: z.literal("chapitre"), ref: z.string().min(1) }).strict();

export const Selecteur = z.discriminatedUnion("type", [
  SelecteurPage,
  SelecteurZone,
  SelecteurTemps,
  SelecteurTexte,
  SelecteurElement,
  SelecteurChapitre,
]);
export type Selecteur = z.infer<typeof Selecteur>;

/** Endroit précis dans une version de document (ANC-01). */
export const Ancre = z
  .object({ id: Identifiant, versionId: Identifiant, fichier: Empreinte, selecteur: Selecteur })
  .strict();
export type Ancre = z.infer<typeof Ancre>;

/** Fragment Media Fragments correspondant (ANC-04) : `#xywh=` pour les zones, `#t=` pour le temps. */
export function versFragment(s: Selecteur): string | null {
  switch (s.type) {
    case "zone":
      return `xywh=${s.x},${s.y},${s.l},${s.h}`;
    case "temps":
      return `t=${s.debut},${s.fin}`;
    default:
      return null;
  }
}
