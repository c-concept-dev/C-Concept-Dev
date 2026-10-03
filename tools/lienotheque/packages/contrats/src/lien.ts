import { z } from "zod";
import { Confiance, Empreinte, Identifiant, RefOutil } from "./commun.js";

/** Natures connues ; un schéma de bibliothèque peut en déclarer d'autres (préfixe `x-`). */
export const NatureLien = z.union([
  z.enum(["piste_de", "suite_de", "meme_oeuvre", "transcrit_par", "cite_dans", "traduction_de"]),
  z.string().regex(/^x-[a-z0-9_]+$/, "Nature personnalisée : préfixe x-"),
]);

export const Preuve = z.enum(["lu", "sequence", "nom_de_fichier", "manuel"]);
export type Preuve = z.infer<typeof Preuve>;

export const Auteur = z.discriminatedUnion("type", [
  z.object({ type: z.literal("outil"), outil: RefOutil }).strict(),
  z.object({ type: z.literal("personne"), personneId: Identifiant }).strict(),
]);

/** Relation typée entre deux ancres (ANC-02). */
export const Lien = z
  .object({
    id: Identifiant,
    de: Identifiant,
    vers: Identifiant,
    nature: NatureLien,
    preuve: Preuve,
    confiance: Confiance,
    auteur: Auteur,
  })
  .strict()
  .superRefine((l, ctx) => {
    if (l.de === l.vers) ctx.addIssue({ code: "custom", path: ["vers"], message: "Un lien relie deux ancres différentes" });
    if (l.preuve === "manuel" && l.auteur.type !== "personne")
      ctx.addIssue({ code: "custom", path: ["auteur"], message: "Une preuve manuelle a une personne pour auteur" });
  });
export type Lien = z.infer<typeof Lien>;

/** Paire d'une carte de synchronisation. Sans segment vérifié : `segment: "inconnu"`,
 *  lecture au début de la piste, jamais de position inventée (ANC-03). */
export const PaireSynchro = z.discriminatedUnion("segment", [
  z
    .object({ segment: z.literal("connu"), ancre: Identifiant, debut: z.number().nonnegative(), fin: z.number().positive() })
    .strict()
    .refine((p) => p.fin > p.debut, { message: "La fin doit suivre le début", path: ["fin"] }),
  z.object({ segment: z.literal("inconnu"), ancre: Identifiant }).strict(),
]);

/** Carte indépendante de l'emplacement des fichiers : elle cite des empreintes (ANC-05). */
export const CarteSynchro = z
  .object({
    id: Identifiant,
    versionId: Identifiant,
    media: Empreinte,
    paires: z.array(PaireSynchro).min(1),
  })
  .strict();
export type CarteSynchro = z.infer<typeof CarteSynchro>;
