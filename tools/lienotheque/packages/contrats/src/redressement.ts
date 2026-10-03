import { z } from "zod";

/** Redressement d'une page photographiée (OUT-03).
 *
 *  Un livre photographié arrive tourné, deux pages par cliché, avec le verso qui transparaît.
 *  Le redresseur produit des dérivés : l'image d'origine n'est jamais modifiée (OPT-04), et ce
 *  contrat décrit ce qui a été fait, pour qu'on puisse le refaire ou le défaire. */

/** Les quatre quarts de tour. Rien d'autre : une photo de livre n'est pas de travers de 3°, elle
 *  est posée dans un sens ou dans un autre. Le redressement fin viendra s'il se révèle utile. */
export const Rotation = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
export type Rotation = z.infer<typeof Rotation>;

export const CotePage = z.enum(["gauche", "droite"]);
export type CotePage = z.infer<typeof CotePage>;

/** D'où vient la rotation retenue : l'outil l'a reconnue, ou elle a été déduite de la forme. */
export const SourceRotation = z.enum(["reconnue", "deduite", "imposee"]);
export type SourceRotation = z.infer<typeof SourceRotation>;

export const PageRedressee = z
  .object({
    /** Rang de l'image d'origine dont cette page est tirée. */
    source: z.number().int().nonnegative(),
    rotation: Rotation,
    sourceRotation: SourceRotation,
    cote: CotePage.optional(),
    /** Abscisse de la coupe dans l'image tournée, quand il y a eu coupe. */
    gouttiere: z.number().int().nonnegative().optional(),
    largeur: z.number().int().positive(),
    hauteur: z.number().int().positive(),
    versoEfface: z.boolean(),
    binarisee: z.boolean(),
  })
  .strict()
  .superRefine((page, ctx) => {
    if ((page.cote === undefined) !== (page.gouttiere === undefined))
      ctx.addIssue({
        code: "custom",
        path: ["cote"],
        message: "Une page coupée porte son côté et l'abscisse de la coupe ; une page entière n'a ni l'un ni l'autre",
      });
  });
export type PageRedressee = z.infer<typeof PageRedressee>;

/** Ce qu'on demande au redresseur. Vient de la préparation déclarée par la recette. */
export const ReglagesRedressement = z
  .object({
    rotation: z.enum(["auto", "aucun"]),
    doublePage: z.boolean(),
    /** Quelle page d'un cliché porte le numéro pair. Sans double page, sans objet. */
    pageGauche: z.enum(["paire", "impaire"]).optional(),
    effacerVerso: z.boolean().default(false),
    binarisation: z.enum(["aucune", "adaptative"]).default("aucune"),
  })
  .strict()
  .superRefine((reglages, ctx) => {
    if (!reglages.doublePage && reglages.pageGauche !== undefined)
      ctx.addIssue({ code: "custom", path: ["pageGauche"], message: "Sans double page, aucune page n'est « à gauche »" });
  });
export type ReglagesRedressement = z.infer<typeof ReglagesRedressement>;

/** Numéro imprimé attendu pour une page coupée, selon la convention déclarée.
 *
 *  Les deux pages d'un cliché se suivent : la gauche porte le pair ou l'impair selon le livre,
 *  et la droite porte le suivant. Le code ne suppose rien, la recette le dit. */
export function numeroAttendu(base: number, cote: CotePage | undefined, pageGauche: "paire" | "impaire" | undefined): number {
  if (cote === undefined) return base;
  const gauche = pageGauche === "impaire" ? (base % 2 === 0 ? base + 1 : base) : base % 2 === 0 ? base : base + 1;
  return cote === "gauche" ? gauche : gauche + 1;
}
