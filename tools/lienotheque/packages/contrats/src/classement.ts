import { z } from "zod";
import { Identifiant, NumeroVersion } from "./commun.js";

/** Classement universel (CLA-01 à CLA-12).
 *
 *  Le code ne connaît aucun domaine : il connaît des axes génériques. Chaque domaine se décrit
 *  entièrement en données, dans un modèle de bibliothèque. Aucun nom d'axe, aucune valeur et
 *  aucun vocabulaire de domaine ne doit apparaître ici — le banc d'universalité le vérifie. */

/** Identifiant stable d'un axe ou d'une valeur : il ne change jamais, même après renommage. */
export const Cle = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "Clé en minuscules, chiffres, tiret ou souligné");
export type Cle = z.infer<typeof Cle>;

export const NatureAxe = z.enum(["referentiel", "liste_semi_ouverte", "etiquettes", "nombre", "date"]);
export type NatureAxe = z.infer<typeof NatureAxe>;

export const CardinaliteAxe = z.enum(["une", "plusieurs", "principale_et_secondaires"]);
export type CardinaliteAxe = z.infer<typeof CardinaliteAxe>;

export const StructureAxe = z.enum(["plat", "hierarchique"]);
export type StructureAxe = z.infer<typeof StructureAxe>;

/** Rôle commun facultatif : c'est par lui que deux bibliothèques de domaines différents se
 *  recoupent (CLA-11). La liste est volontairement abstraite. */
export const RoleCommun = z.enum(["categorie", "createur", "date", "sujet", "niveau", "duree", "identifiant", "etat"]);
export type RoleCommun = z.infer<typeof RoleCommun>;

export const Provenance = z
  .object({ nom: z.string().min(1), url: z.string().url().optional(), licence: z.string().min(1).optional() })
  .strict();

/** Fiche d'une valeur de référentiel (CLA-02). `alias` garde les clés héritées d'un renommage
 *  ou d'une fusion : un document classé avec l'ancienne clé ne perd jamais sa valeur (CLA-08). */
export const ValeurReferentiel = z
  .object({
    cle: Cle,
    nom: z.string().min(1),
    synonymes: z.array(z.string().min(1)).default([]),
    definition: z.string().min(1).optional(),
    langue: z.string().min(2).optional(),
    source: Provenance.optional(),
    parent: Cle.optional(),
    alias: z.array(Cle).default([]),
    /** Une valeur utilisée n'est jamais supprimée : elle est retirée et redirige (CLA-03). */
    retiree: z.boolean().default(false),
    redirigeVers: Cle.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.parent === v.cle) ctx.addIssue({ code: "custom", path: ["parent"], message: "Une valeur n'est pas son propre parent" });
    if (v.redirigeVers === v.cle) ctx.addIssue({ code: "custom", path: ["redirigeVers"], message: "Une valeur ne redirige pas vers elle-même" });
    if (v.retiree && v.redirigeVers === undefined)
      ctx.addIssue({ code: "custom", path: ["redirigeVers"], message: "Une valeur retirée redirige vers celle qui la remplace (CLA-03)" });
    if (v.alias.includes(v.cle)) ctx.addIssue({ code: "custom", path: ["alias"], message: "Une clé n'est pas son propre alias" });
  });
export type ValeurReferentiel = z.infer<typeof ValeurReferentiel>;

export const Axe = z
  .object({
    cle: Cle,
    nom: z.string().min(1),
    nature: NatureAxe,
    cardinalite: CardinaliteAxe,
    structure: StructureAxe.default("plat"),
    roleCommun: RoleCommun.optional(),
    obligatoire: z.boolean().default(false),
    valeurs: z.array(ValeurReferentiel).default([]),
    alias: z.array(Cle).default([]),
  })
  .strict()
  .superRefine((a, ctx) => {
    const avecValeurs = a.nature === "referentiel" || a.nature === "liste_semi_ouverte";
    if (avecValeurs && a.valeurs.length === 0)
      ctx.addIssue({ code: "custom", path: ["valeurs"], message: `Un axe « ${a.nature} » porte ses valeurs` });
    if (!avecValeurs && a.valeurs.length > 0)
      ctx.addIssue({ code: "custom", path: ["valeurs"], message: `Un axe « ${a.nature} » ne porte pas de référentiel` });

    const cles = new Set<string>();
    for (const [rang, valeur] of a.valeurs.entries()) {
      for (const clef of [valeur.cle, ...valeur.alias]) {
        if (cles.has(clef)) ctx.addIssue({ code: "custom", path: ["valeurs", rang], message: `Clé en double : ${clef}` });
        cles.add(clef);
      }
    }
    for (const [rang, valeur] of a.valeurs.entries()) {
      if (valeur.parent !== undefined && a.structure === "plat")
        ctx.addIssue({ code: "custom", path: ["valeurs", rang, "parent"], message: "Un axe à plat n'a pas de hiérarchie" });
      if (valeur.parent !== undefined && !cles.has(valeur.parent))
        ctx.addIssue({ code: "custom", path: ["valeurs", rang, "parent"], message: `Parent inconnu : ${valeur.parent}` });
      if (valeur.redirigeVers !== undefined && !cles.has(valeur.redirigeVers))
        ctx.addIssue({ code: "custom", path: ["valeurs", rang, "redirigeVers"], message: `Cible inconnue : ${valeur.redirigeVers}` });
    }
  });
export type Axe = z.infer<typeof Axe>;

export const SchemaBibliotheque = z
  .object({
    cle: Cle,
    nom: z.string().min(1),
    langue: z.string().min(2),
    description: z.string().min(1).optional(),
    version: NumeroVersion,
    axes: z.array(Axe).min(1),
  })
  .strict()
  .superRefine((s, ctx) => {
    const cles = new Set<string>();
    for (const [rang, axe] of s.axes.entries()) {
      for (const clef of [axe.cle, ...axe.alias]) {
        if (cles.has(clef)) ctx.addIssue({ code: "custom", path: ["axes", rang], message: `Clé d'axe en double : ${clef}` });
        cles.add(clef);
      }
    }
  });
export type SchemaBibliotheque = z.infer<typeof SchemaBibliotheque>;

/** Ce qu'un document porte sur un axe. La forme suit la nature de l'axe ; `principale` n'a de
 *  sens que pour la cardinalité « principale et secondaires ». */
export const ValeursAxe = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("reference"), valeurs: z.array(Cle).min(1), principale: Cle.optional() })
    .strict()
    .superRefine((v, ctx) => {
      if (new Set(v.valeurs).size !== v.valeurs.length)
        ctx.addIssue({ code: "custom", path: ["valeurs"], message: "Valeur répétée" });
      if (v.principale !== undefined && !v.valeurs.includes(v.principale))
        ctx.addIssue({ code: "custom", path: ["principale"], message: "La principale figure parmi les valeurs" });
    }),
  z.object({ type: z.literal("etiquettes"), valeurs: z.array(z.string().min(1)).min(1) }).strict(),
  z.object({ type: z.literal("nombre"), valeur: z.number() }).strict(),
  z.object({ type: z.literal("date"), valeur: z.string().min(4) }).strict(),
]);
export type ValeursAxe = z.infer<typeof ValeursAxe>;

export const ClassementDocument = z
  .object({
    documentId: Identifiant,
    schema: Cle,
    schemaVersion: NumeroVersion,
    axes: z.record(Cle, ValeursAxe),
  })
  .strict();
export type ClassementDocument = z.infer<typeof ClassementDocument>;

/** Un modèle est une donnée versionnée, exportable et importable : jamais du code (CLA-09). */
export const ModeleBibliotheque = z
  .object({
    cle: Cle,
    nom: z.string().min(1),
    langue: z.string().min(2),
    description: z.string().min(1).optional(),
    version: NumeroVersion,
    axes: z.array(Axe).min(1),
  })
  .strict();
export type ModeleBibliotheque = z.infer<typeof ModeleBibliotheque>;
