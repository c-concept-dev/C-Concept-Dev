import { z } from "zod";
import { Confiance, NumeroVersion } from "./commun.js";

/** Repères lus sur une page et ce que l'interpréteur en tire (OUT-07, REC-02, REC-03).
 *
 *  Le vocabulaire reste celui des recettes : un « élément » est ce que la page numérote, une
 *  « piste » ce que le média numérote. Comment l'un et l'autre s'appellent dans une bibliothèque
 *  donnée vient de son schéma, jamais d'ici (CLA-01). */

/** Une lecture brute : ce qu'une passe d'OCR a cru voir, à une hauteur donnée. */
export const LectureRepere = z
  .object({
    /** Hauteur sur la page, de 0 en haut à 1 en bas : la seule chose comparable entre passes. */
    y: z.number().min(0).max(1),
    numero: z.number().int().positive(),
    pisteLue: z.number().int().positive().optional(),
    suite: z.boolean(),
  })
  .strict();
export type LectureRepere = z.infer<typeof LectureRepere>;

/** Ce que plusieurs passes disent d'un même élément, une fois le vote fait. */
export const ElementRepere = z
  .object({
    y: z.number().min(0).max(1),
    numero: z.number().int().positive(),
    pisteLue: z.number().int().positive().optional(),
    suite: z.boolean(),
    accordNumero: Confiance,
    accordPiste: Confiance,
  })
  .strict();
export type ElementRepere = z.infer<typeof ElementRepere>;

/** D'où vient le numéro de page imprimée retenu. */
export const StatutPageReperee = z.enum(["couverture", "lue", "deduite"]);
export type StatutPageReperee = z.infer<typeof StatutPageReperee>;

export const PageReperee = z
  .object({
    index: z.number().int().nonnegative(),
    pageLue: z.number().int().positive().optional(),
    pageImprimee: z.number().int().positive().optional(),
    statut: StatutPageReperee,
    elements: z.array(ElementRepere),
  })
  .strict()
  .superRefine((page, ctx) => {
    if (page.statut === "couverture" && page.pageImprimee !== undefined)
      ctx.addIssue({ code: "custom", path: ["pageImprimee"], message: "Une couverture ne porte pas de numéro imprimé" });
    if (page.statut !== "couverture" && page.pageImprimee === undefined)
      ctx.addIssue({ code: "custom", path: ["pageImprimee"], message: "Une page numérotée porte son numéro" });
  });
export type PageReperee = z.infer<typeof PageReperee>;

/** Comment le numéro de piste a été obtenu. Jamais « d'après le nom du fichier » : un nom de
 *  fichier ne vaut qu'indice de recoupement (REC-05). */
export const SourcePiste = z.enum(["pastille", "suite", "numero_element"]);
export type SourcePiste = z.infer<typeof SourcePiste>;

export const LigneInterpretee = z
  .object({
    numero: z.number().int().positive(),
    pageImprimee: z.number().int().positive(),
    piste: z.number().int().positive(),
    sourcePiste: SourcePiste,
    confiance: Confiance,
  })
  .strict();
export type LigneInterpretee = z.infer<typeof LigneInterpretee>;

/** Le résultat porte la recette qui l'a produit : changer la recette ne réécrit pas le passé
 *  (REC-03). */
export const ResultatRecette = z
  .object({
    recette: z.object({ id: z.string().min(1), version: NumeroVersion }).strict(),
    pages: z.array(PageReperee),
    lignes: z.array(LigneInterpretee),
    /** Numéros de pages imprimées que la numérotation réclame et que le lot ne contient pas. */
    pagesAbsentes: z.array(z.number().int().positive()),
    /** Éléments lus puis écartés parce qu'ils rompaient l'ordre : on dit lesquels. */
    ecartes: z.array(z.object({ numero: z.number().int().positive(), page: z.number().int().nonnegative(), motif: z.string().min(1) }).strict()),
  })
  .strict();
export type ResultatRecette = z.infer<typeof ResultatRecette>;
