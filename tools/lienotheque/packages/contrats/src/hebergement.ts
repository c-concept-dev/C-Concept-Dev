import { z } from "zod";
import { Cle } from "./classement.js";
import { Horodatage, Identifiant, NumeroVersion } from "./commun.js";

/** Où une bibliothèque est servie, et dans quel état (HEB-01 à HEB-06, PLT-06).
 *
 *  Ces données vivent dans le registre, une base à part qui ne contient aucun contenu de
 *  bibliothèque. Elles traversent une frontière — l'hôte les écrit, le Worker les lit, l'écran
 *  les montre — donc elles ont un contrat. */

/** Les trois manières d'héberger une bibliothèque (PLT-06).
 *
 *  `locale` : elle ne vit que sur l'ordinateur. `publiee` : tout est chez l'hébergeur, elle se
 *  lit ordinateur éteint. `mixte` : les métadonnées et les dérivés légers sont chez l'hébergeur,
 *  les médias lourds restent sur l'ordinateur et passent par un tunnel — et quand l'ordinateur
 *  est éteint, l'interface l'annonce plutôt que de faire attendre. */
export const EtatHebergement = z.enum(["locale", "mixte", "publiee"]);
export type EtatHebergement = z.infer<typeof EtatHebergement>;

/** Une place de la réserve de liaisons.
 *
 *  Une liaison vers une base se déclare dans la configuration au déploiement. Plutôt que de
 *  donner au Worker un jeton de compte capable de créer et de supprimer des bases — ce que
 *  SEC-08 interdit —, on déclare des places nommées et le registre dit laquelle est occupée par
 *  qui. Le prix est assumé : publier une bibliothèque de plus est un déploiement, pas un clic. */
export const Liaison = z.string().regex(/^BIB_[1-9][0-9]*$/, "Place de la réserve, de la forme BIB_1");
export type Liaison = z.infer<typeof Liaison>;

/** Les régions qu'on sait nommer. Le choix est explicite à la création (HEB-05) : une base qui
 *  atterrit « quelque part » est une base qu'on ne saura pas défendre le jour où on demandera où
 *  vivent les données. */
export const Region = z.enum(["weur", "eeur", "wnam", "enam", "apac", "oc"]);
export type Region = z.infer<typeof Region>;

/** Ce que le registre sait d'une bibliothèque. */
export const BibliothequePubliee = z
  .object({
    cle: Cle,
    nom: z.string().min(1),
    etat: EtatHebergement,
    /** Nulle tant que la bibliothèque n'est servie par personne. */
    liaison: Liaison.optional(),
    /** Le préfixe de ses objets dans le compartiment. Dérivé de la clé, et unique. */
    prefixe: z.string().regex(/^[a-z0-9][a-z0-9_-]*\/$/, "Préfixe terminé par une barre oblique"),
    region: Region,
    schemaVersion: NumeroVersion,
    publieeLe: Horodatage.optional(),
    majLe: Horodatage,
  })
  .strict()
  // Une bibliothèque servie a forcément une place : sans liaison, le Worker n'a aucune base à
  // lire, et annoncer « publiée » serait une promesse que rien ne tient (HEB-01).
  .refine((b) => b.etat === "locale" || b.liaison !== undefined, {
    message: "Une bibliothèque servie doit occuper une place de la réserve",
    path: ["liaison"],
  })
  .refine((b) => b.etat === "locale" || b.publieeLe !== undefined, {
    message: "Une bibliothèque servie doit porter sa date de publication",
    path: ["publieeLe"],
  });
export type BibliothequePubliee = z.infer<typeof BibliothequePubliee>;

/** Ce qu'on inscrit au journal d'audit (SEC-07).
 *
 *  Suppression, droits, activation de version, changement d'hébergement : chaque opération
 *  sensible doit se retrouver avec son auteur. Le journal n'est pas une trace de mise au point —
 *  c'est une pièce, et rien ne l'efface. */
export const OperationSensible = z.enum([
  "publication",
  "depublication",
  "changement_hebergement",
  "revocation",
  "suppression",
]);
export type OperationSensible = z.infer<typeof OperationSensible>;

export const LigneAudit = z
  .object({
    id: Identifiant,
    /** Ce sur quoi on a agi : une clé de bibliothèque, un identifiant de jeton. */
    objet: z.string().min(1),
    operation: OperationSensible,
    auteur: z.string().min(1),
    detail: z.string().optional(),
    faitLe: Horodatage,
  })
  .strict();
export type LigneAudit = z.infer<typeof LigneAudit>;
