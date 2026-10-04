import { z } from "zod";
import { Confiance, Empreinte, Identifiant } from "./commun.js";
import { Preuve } from "./lien.js";
import { PositionDansPiste } from "./segment.js";

/** Ce que les écrans lisent (B1 à B5).
 *
 *  Une vue, pas un second modèle : tout vient du dépôt, rassemblé pour un écran. Elle ne porte
 *  aucun mot de métier — « élément », « piste », « page » sont fournis par le schéma de la
 *  bibliothèque, qui voyage avec elle (CLA-01). Un autre domaine remplacera ces mots sans qu'une
 *  ligne de code change. */

/** Les mots d'une bibliothèque, tirés de son schéma. Au singulier et au pluriel : une interface
 *  qui écrit « 1 éléments » n'a pas été écrite pour des gens. */
export const MotsBibliotheque = z
  .object({
    element: z.object({ un: z.string().min(1), plusieurs: z.string().min(1) }).strict(),
    piste: z.object({ un: z.string().min(1), plusieurs: z.string().min(1) }).strict(),
    page: z.object({ un: z.string().min(1), plusieurs: z.string().min(1) }).strict(),
  })
  .strict();
export type MotsBibliotheque = z.infer<typeof MotsBibliotheque>;

/** Une zone de la page, en part de ses dimensions : l'affichage ne dépend pas du zoom. */
export const ZoneRelative = z
  .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), l: z.number().gt(0).max(1), h: z.number().gt(0).max(1) })
  .strict();
export type ZoneRelative = z.infer<typeof ZoneRelative>;

/** Pourquoi un élément est relié à ce qu'il est relié (ANC-02). L'interface doit pouvoir le dire
 *  partout, et en français — d'où la phrase, construite une fois, pas dans la vue. */
export const Pourquoi = z
  .object({ preuve: Preuve, confiance: Confiance, phrase: z.string().min(1) })
  .strict();
export type Pourquoi = z.infer<typeof Pourquoi>;

export const ElementAffiche = z
  .object({
    ancreId: Identifiant,
    numero: z.string().min(1),
    titre: z.string().min(1).optional(),
    page: z.number().int().positive(),
    zone: ZoneRelative.optional(),
    /** Le média relié, quand il y en a un. Beaucoup d'éléments n'en ont pas. */
    media: z
      .object({
        empreinte: Empreinte,
        nom: z.string().min(1),
        piste: z.number().int().positive(),
        position: PositionDansPiste,
        /** Durée de la piste, en secondes, quand le dépôt la connaît : sans elle, un segment ne
         *  peut pas se situer sur une forme d'onde. */
        duree: z.number().positive().optional(),
      })
      .strict()
      .optional(),
    pourquoi: Pourquoi.optional(),
    /** Vrai quand l'élément attend un œil : confiance basse, conflit, recalcul (UX-03). */
    aVerifier: z.boolean().default(false),
  })
  .strict()
  .superRefine((element, ctx) => {
    if ((element.media === undefined) !== (element.pourquoi === undefined))
      ctx.addIssue({ code: "custom", path: ["pourquoi"], message: "Un lien dit toujours pourquoi ; sans lien, il n'y a rien à dire" });
  });
export type ElementAffiche = z.infer<typeof ElementAffiche>;

export const PageAffichee = z
  .object({
    numero: z.number().int().positive(),
    titre: z.string().min(1).optional(),
    /** Image de la page, telle que le dépôt la sert. */
    image: z.string().min(1).optional(),
    largeur: z.number().int().positive().optional(),
    hauteur: z.number().int().positive().optional(),
    /** Vignette de la page, dérivé produit à l'ingestion (OUT-04).
     *
     *  Séparée de l'image : une bande de vingt-huit vignettes qui charge vingt-huit pages à
     *  pleine largeur, c'est trente mégaoctets pour une colonne de cent pixels de large. Elle
     *  manque quand le lot n'a pas produit de dérivés — les écrans retombent alors sur le
     *  numéro seul, qui reste une cible cliquable. */
    vignette: z.string().min(1).optional(),
    elements: z.array(ElementAffiche),
    /** Lignes du texte reconnu, pour le panneau repliable (B1). */
    texte: z.array(z.string()).default([]),
    traduction: z.array(z.string()).default([]),
  })
  .strict();
export type PageAffichee = z.infer<typeof PageAffichee>;

/** Ce qu'un cas douteux attend de l'utilisateur (UX-03, SYN-04, SYN-05, SYN-07). */
export const NatureDoute = z.enum(["lien", "page", "information"]);
export type NatureDoute = z.infer<typeof NatureDoute>;

/** Pourquoi un cas est en attente. Un conflit entre deux appareils et un recalcul en cours ne se
 *  traitent pas comme une lecture incertaine. */
export const EtatDoute = z.enum(["confiance", "conflit_appareils", "a_rattacher", "segment_inconnu"]);
export type EtatDoute = z.infer<typeof EtatDoute>;

export const CasDouteux = z
  .object({
    id: Identifiant,
    nature: NatureDoute,
    etat: EtatDoute,
    element: ElementAffiche,
    /** Ce que le système propose, en toutes lettres. */
    proposition: z.string().min(1),
    motif: z.string().min(1),
  })
  .strict();
export type CasDouteux = z.infer<typeof CasDouteux>;

/** Un axe du schéma, prêt à filtrer, avec ses compteurs (CLA-10). */
export const FiltreAffiche = z
  .object({
    cle: z.string().min(1),
    nom: z.string().min(1),
    valeurs: z.array(z.object({ cle: z.string().min(1), nom: z.string().min(1), nombre: z.number().int().nonnegative() }).strict()),
  })
  .strict();
export type FiltreAffiche = z.infer<typeof FiltreAffiche>;

export const VueBibliotheque = z
  .object({
    id: Identifiant,
    nom: z.string().min(1),
    mots: MotsBibliotheque,
    compteurs: z.array(z.object({ nombre: z.number().int().nonnegative(), mot: z.string().min(1) }).strict()),
    aVerifier: z.number().int().nonnegative().default(0),
    filtres: z.array(FiltreAffiche).default([]),
    pages: z.array(PageAffichee),
    douteux: z.array(CasDouteux).default([]),
  })
  .strict();
export type VueBibliotheque = z.infer<typeof VueBibliotheque>;

/** Accord du mot au nombre. « 1 élément », « 2 éléments » : l'interface compte en français. */
export const accorder = (nombre: number, mot: { un: string; plusieurs: string }): string =>
  `${nombre} ${nombre <= 1 ? mot.un : mot.plusieurs}`;

/** Majuscule en tête.
 *
 *  Les mots du schéma arrivent en minuscule — c'est ainsi qu'on les écrit au milieu d'une phrase.
 *  En tête de titre ou de phrase, ils prennent la majuscule comme n'importe quel mot français.
 *  Une seule fonction pour tous les écrans : sans quoi l'un écrit « Page 127 » et l'autre
 *  « page 127 », et c'est le genre d'écart qu'on ne voit qu'une fois livré. */
export const enTete = (texte: string): string =>
  texte.length === 0 ? texte : texte.charAt(0).toLocaleUpperCase("fr-FR") + texte.slice(1);

/** « Page 127 », « Élément 405 », « Piste 45 » : le mot du schéma et le numéro qu'il désigne.
 *
 *  Un numéro, jamais un compte : c'est `accorder` qui compte. Et aucune tournure qui demande le
 *  genre — le schéma ne le donne pas. */
export const nommer = (mot: { un: string }, numero: string | number): string => `${enTete(mot.un)} ${numero}`;
