import { z } from "zod";
import { Confiance, NumeroVersion, ZoneRelative } from "./commun.js";
import { CotePage } from "./redressement.js";

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
    /** Où le numéro a été lu sur la page, en part de ses dimensions.
     *
     *  La lecture a toujours su où elle regardait ; c'est le transport qui manquait, et les
     *  écrans montraient donc la vraie page sans ses zones. Facultatif parce qu'une passe peut
     *  travailler sur une image dont les dimensions ne sont pas celles de la page. */
    zone: ZoneRelative.optional(),
    /** Où le repère lui-même a été trouvé, quand il l'a été (B1).
     *
     *  Distinct de `zone`, qui est celle du numéro : un repère se pose à côté, et la bande que le
     *  Lecteur rend cliquable doit les contenir tous les deux — sans quoi elle le coupe en deux. */
    zoneRepere: ZoneRelative.optional(),
    numero: z.number().int().positive(),
    pisteLue: z.number().int().positive().optional(),
    /** À quel point une pastille semble présente, qu'on ait su lire son chiffre ou non. Une
     *  pastille présente et illisible est une information : elle dit qu'une piste commence là. */
    /** Combien de formes de la taille d'un chiffre le repère montrait.
     *
     *  C'est ce qui dit qu'une lecture est incomplète : plus de formes que de chiffres rendus, et
     *  un chiffre a été perdu. Un moteur d'OCR ne le signale jamais — « 4 » est pour lui une
     *  réponse complète, même quand le repère porte 14.
     *
     *  Absent quand personne ne l'a demandé : le comptage ne tourne que si la recette déclare une
     *  relecture ciblée, et une lecture ordinaire ne le paie pas. */
    chiffresComptes: z.number().int().nonnegative().optional(),
    presencePiste: Confiance.default(0),
    suite: z.boolean(),
  })
  .strict();
export type LectureRepere = z.infer<typeof LectureRepere>;

/** Ce que plusieurs passes disent d'un même élément, une fois le vote fait. */
export const ElementRepere = z
  .object({
    y: z.number().min(0).max(1),
    /** Zone retenue pour cet élément : celle de la lecture qui a emporté le vote. On ne moyenne
     *  pas deux rectangles — la moyenne de deux lectures qui se contredisent ne désigne rien. */
    zone: ZoneRelative.optional(),
    /** Où son repère a été trouvé, quand il l'a été. */
    zoneRepere: ZoneRelative.optional(),
    numero: z.number().int().positive(),
    pisteLue: z.number().int().positive().optional(),
    /** Voir `LectureRepere.chiffresComptes` : le compte le plus fin obtenu sur ce repère. */
    chiffresComptes: z.number().int().nonnegative().optional(),
    presencePiste: Confiance.default(0),
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
    /** Rang attendu de la page dans la numérotation imprimée, avant tout décalage. Vaut l'index
     *  pour un document d'une page par image ; pour un livre photographié en doubles pages, il
     *  compte deux pages par cliché. */
    rang: z.number().int().nonnegative(),
    /** Côté du cliché dont la page est tirée, quand il y a eu coupe (OUT-03). */
    cote: CotePage.optional(),
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

/** Ce qu'une page a donné à lire, avant toute numérotation — et ce que le cache de lecture garde.
 *
 *  Un fichier de cache est une frontière comme une autre : il a été écrit par une autre
 *  exécution, parfois par une autre version, parfois à moitié. `JSON.parse` dit seulement que
 *  c'est du JSON ; ce contrat dit que ce sont des pages lues (CLAUDE.md, règle 2).
 *
 *  Distinct de `PageReperee` : celle-ci porte en plus le numéro imprimé et son statut, que
 *  l'interprète établit ensuite en votant sur le lot. Ce qui sort de la lecture ne les a pas
 *  encore. */
export const PageLueBrute = z
  .object({
    index: z.number().int().nonnegative(),
    rang: z.number().int().nonnegative().optional(),
    cote: CotePage.optional(),
    pageLue: z.number().int().positive().optional(),
    elements: z.array(ElementRepere),
  })
  .strict();
export type PageLueBrute = z.infer<typeof PageLueBrute>;

/** Comment le numéro de piste a été obtenu. Jamais « d'après le nom du fichier » : un nom de
 *  fichier ne vaut qu'indice de recoupement (REC-05).
 *
 *  `sequence` : aucune pastille lisible ici, mais la suite des pistes alentour impose celle-ci. */
/** D'où vient la piste retenue. `vision` est une relecture ciblée du repère, corroborée par la
 *  suite — jamais appliquée sans elle (ANC-02, OUT-08). */
export const SourcePiste = z.enum(["pastille", "suite", "numero_element", "sequence", "vision"]);
export type SourcePiste = z.infer<typeof SourcePiste>;

export const LigneInterpretee = z
  .object({
    numero: z.number().int().positive(),
    pageImprimee: z.number().int().positive(),
    /** Piste du média, quand l'élément en a une. Tout un livre peut n'avoir aucun enregistrement,
     *  et dans un livre qui en a, les pages antérieures au premier repère n'en ont pas non plus :
     *  leur attribuer la piste 1 par défaut inventerait un lien. */
    piste: z.number().int().positive().optional(),
    /** Support dont la piste est tirée. Une méthode à plusieurs disques renumérote ses pistes à
     *  partir de 1 sur chaque support : la piste 3 du disque 2 n'est pas la piste 3 du disque 1. */
    disque: z.number().int().positive().default(1),
    sourcePiste: SourcePiste.optional(),
    /** Où l'élément se trouve sur sa page, quand la lecture l'a su (B1). */
    zone: ZoneRelative.optional(),
    /** Où son repère a été trouvé : la bande du Lecteur les contient tous deux. */
    zoneRepere: ZoneRelative.optional(),
    confiance: Confiance,
  })
  .strict()
  .superRefine((ligne, ctx) => {
    if ((ligne.piste === undefined) !== (ligne.sourcePiste === undefined))
      ctx.addIssue({
        code: "custom",
        path: ["sourcePiste"],
        message: "Une piste dit toujours d'où elle vient ; sans piste, il n'y a rien à dire",
      });
  });
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
