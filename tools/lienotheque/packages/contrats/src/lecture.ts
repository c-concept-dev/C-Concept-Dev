import { z } from "zod";
import { Confiance, Empreinte } from "./commun.js";

/** Sortie du lecteur de texte (OUT-05).
 *
 *  Conventions d'ancrage (ANC) : origine en haut à gauche, unités dans l'image d'origine pour
 *  une page numérisée, en points typographiques pour une page native. Le lecteur dit laquelle. */

export const UniteLecture = z.enum(["pixel", "point"]);
export type UniteLecture = z.infer<typeof UniteLecture>;

export const MotLu = z
  .object({
    texte: z.string().min(1),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    l: z.number().positive(),
    h: z.number().positive(),
    confiance: Confiance.optional(),
  })
  .strict();
export type MotLu = z.infer<typeof MotLu>;

export const SourceLecture = z.enum(["couche_texte", "ocr"]);
export type SourceLecture = z.infer<typeof SourceLecture>;

export const PageLue = z
  .object({
    index: z.number().int().min(1),
    source: SourceLecture,
    unite: UniteLecture,
    largeur: z.number().positive(),
    hauteur: z.number().positive(),
    mots: z.array(MotLu),
  })
  .strict();
export type PageLue = z.infer<typeof PageLue>;

export const TexteLu = z
  .object({ empreinte: Empreinte, outil: z.string().min(1), pages: z.array(PageLue) })
  .strict();
export type TexteLu = z.infer<typeof TexteLu>;

/** Texte d'une page, mots séparés par une espace, dans l'ordre de lecture. */
export const texteDePage = (page: PageLue): string => page.mots.map((mot) => mot.texte).join(" ");
