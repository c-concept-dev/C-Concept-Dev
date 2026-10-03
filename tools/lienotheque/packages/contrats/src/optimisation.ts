import { z } from "zod";
import { Empreinte } from "./commun.js";

/** Optimisation et dérivés (OPT-01 à OPT-07, OUT-02, OUT-04).
 *
 *  L'optimiseur ne décide rien tout seul : il produit un plan, page par page, que l'on peut lire
 *  avant de l'appliquer. Deux règles le tiennent — on ne descend jamais une résolution, et on ne
 *  détruit jamais une couche texte. Le reste n'est que choix de format. */

/** Ce qu'une page est, du point de vue de l'encodage (OPT-01). */
export const ClassePage = z.enum(["noir_et_blanc", "gris", "couleur", "native"]);
export type ClassePage = z.infer<typeof ClassePage>;

/** Où une page va. `pdf_origine` veut dire : on n'y touche pas. */
export const FormatCible = z.enum(["bilevel_g4", "avif", "webp", "pdf_origine"]);
export type FormatCible = z.infer<typeof FormatCible>;

/** La correspondance d'OPT-01, écrite une fois : une classe, les formats qu'elle admet. */
export const FORMATS_ADMIS: Readonly<Record<ClassePage, readonly FormatCible[]>> = {
  noir_et_blanc: ["bilevel_g4"],
  gris: ["avif"],
  couleur: ["avif", "webp"],
  native: ["pdf_origine"],
};

/** Ce qu'une page pèse après encodage, rapporté à ce qu'elle pesait — relevé sur l'échantillon
 *  F7 (voir docs/decisions.md). Une estimation, pour afficher un poids et un coût avant envoi
 *  (OPT-06) ; l'Optimiseur, lui, mesure.
 *
 *  Volontairement prudents : l'écart entre les fixtures tient à ce que les sources gaspillent,
 *  pas à l'encodeur, et mieux vaut annoncer un poids trop lourd qu'une facture trop légère. */
export const RAPPORTS_ESTIMES: Readonly<Record<ClassePage, number>> = {
  noir_et_blanc: 0.39,
  gris: 0.54,
  couleur: 0.54,
  native: 1,
};

export const PlanPage = z
  .object({
    index: z.number().int().nonnegative(),
    classe: ClassePage,
    formatCible: FormatCible,
    largeur: z.number().int().positive(),
    hauteur: z.number().int().positive(),
    /** Dimensions retenues pour la sortie : jamais inférieures à celles de la source (OPT-04). */
    largeurCible: z.number().int().positive(),
    hauteurCible: z.number().int().positive(),
    octetsOrigine: z.number().int().nonnegative(),
    octetsEstimes: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((page, ctx) => {
    if (!FORMATS_ADMIS[page.classe].includes(page.formatCible))
      ctx.addIssue({
        code: "custom",
        path: ["formatCible"],
        message: `Une page « ${page.classe} » ne se range pas en ${page.formatCible} (OPT-01)`,
      });
    if (page.largeurCible < page.largeur || page.hauteurCible < page.hauteur)
      ctx.addIssue({
        code: "custom",
        path: ["largeurCible"],
        message: "Une image n'est jamais re-rendue plus bas que sa résolution d'origine (OPT-04)",
      });
  });
export type PlanPage = z.infer<typeof PlanPage>;

/** Ce qu'il advient de la couche texte d'un document (OPT-02). Il n'y a pas de troisième cas :
 *  un document qui en porte une la garde, un document qui n'en a pas n'en gagne pas ici. */
export const SortCoucheTexte = z.enum(["aucune", "preservee"]);
export type SortCoucheTexte = z.infer<typeof SortCoucheTexte>;

/** L'état d'un échantillon soumis à l'œil avant d'appliquer au lot (OPT-03). */
export const EtatEchantillon = z.enum(["en_attente", "valide", "refuse"]);
export type EtatEchantillon = z.infer<typeof EtatEchantillon>;

export const Echantillon = z
  .object({
    pages: z.array(z.number().int().nonnegative()).min(1),
    etat: EtatEchantillon,
    valideLe: z.string().datetime().optional(),
    motif: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((echantillon, ctx) => {
    if (echantillon.etat === "valide" && echantillon.valideLe === undefined)
      ctx.addIssue({ code: "custom", path: ["valideLe"], message: "Un échantillon validé porte sa date" });
    if (echantillon.etat === "refuse" && echantillon.motif === undefined)
      ctx.addIssue({ code: "custom", path: ["motif"], message: "Un refus dit pourquoi" });
  });
export type Echantillon = z.infer<typeof Echantillon>;

export const PlanOptimisation = z
  .object({
    document: Empreinte,
    pages: z.array(PlanPage).min(1),
    coucheTexte: SortCoucheTexte,
    echantillon: Echantillon,
  })
  .strict()
  .superRefine((plan, ctx) => {
    const index = plan.pages.map((page) => page.index);
    if (new Set(index).size !== index.length)
      ctx.addIssue({ code: "custom", path: ["pages"], message: "Deux plans pour une même page" });

    const connues = new Set(index);
    for (const page of plan.echantillon.pages)
      if (!connues.has(page))
        ctx.addIssue({
          code: "custom",
          path: ["echantillon", "pages"],
          message: `L'échantillon cite la page ${page}, que le plan ne couvre pas`,
        });
  });
export type PlanOptimisation = z.infer<typeof PlanOptimisation>;

/** Appliquer au lot demande un échantillon validé (OPT-03) : la règle, pas une politesse. */
export const applicable = (plan: PlanOptimisation): boolean => plan.echantillon.etat === "valide";

export const octetsOrigine = (plan: PlanOptimisation): number =>
  plan.pages.reduce((total, page) => total + page.octetsOrigine, 0);

export const octetsEstimes = (plan: PlanOptimisation): number =>
  plan.pages.reduce((total, page) => total + page.octetsEstimes, 0);

/** Le gain d'OPT-01, tel qu'il se mesure : combien de fois plus léger. 0 si rien à peser. */
export function gain(plan: PlanOptimisation): number {
  const apres = octetsEstimes(plan);
  return apres === 0 ? 0 : octetsOrigine(plan) / apres;
}

/** Les trois dérivés produits à l'ingestion (OPT-05). La loupe n'en est pas : elle est recadrée
 *  à la volée et jamais stockée — aucun nom ne lui est donné ici, exprès. */
export const EspeceDerive = z.enum(["vignette", "apercu", "forme_onde"]);
export type EspeceDerive = z.infer<typeof EspeceDerive>;

/** Les plafonds d'OPT-05, en octets. L'aperçu n'en a pas : c'est sa largeur qui le borne. */
export const PLAFONDS_DERIVE: Readonly<Partial<Record<EspeceDerive, number>>> = {
  vignette: 25 * 1024,
  forme_onde: 10 * 1024,
};

/** Largeurs visées, en pixels (OPT-05). */
export const LARGEURS_DERIVE = { vignette: 320, apercu: 1200 } as const;

export const Derive = z
  .object({
    espece: EspeceDerive,
    source: Empreinte,
    octets: z.number().int().positive(),
    largeur: z.number().int().positive().optional(),
    hauteur: z.number().int().positive().optional(),
    typeMime: z.string().min(1),
  })
  .strict()
  .superRefine((derive, ctx) => {
    const plafond = PLAFONDS_DERIVE[derive.espece];
    if (plafond !== undefined && derive.octets > plafond)
      ctx.addIssue({
        code: "custom",
        path: ["octets"],
        message: `Un dérivé « ${derive.espece} » tient sous ${plafond} octets (OPT-05), pas ${derive.octets}`,
      });
    if (derive.espece !== "forme_onde" && (derive.largeur === undefined || derive.hauteur === undefined))
      ctx.addIssue({ code: "custom", path: ["largeur"], message: "Une image dérivée porte ses dimensions" });
  });
export type Derive = z.infer<typeof Derive>;

/** Ce que devient l'original non optimisé (OPT-07). Choix explicite, enregistré par bibliothèque. */
export const ArchiveOriginaux = z.enum(["aucune", "disque_local", "r2_classe_rare"]);
export type ArchiveOriginaux = z.infer<typeof ArchiveOriginaux>;

/** Ce qui doit s'afficher avant tout envoi (OPT-06). */
export const EstimationEnvoi = z
  .object({
    octets: z.number().int().nonnegative(),
    /** En euros. Rendu par l'hébergeur, jamais deviné ici. */
    cout: z.number().nonnegative(),
    archive: ArchiveOriginaux,
  })
  .strict();
export type EstimationEnvoi = z.infer<typeof EstimationEnvoi>;
