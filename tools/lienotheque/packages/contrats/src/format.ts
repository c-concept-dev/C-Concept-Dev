import { z } from "zod";
import { Empreinte } from "./commun.js";

/** Formats et lecteurs (FMT-01, FMT-02, FMT-04, FMT-08).
 *
 *  L'identification se fait sur le contenu, selon le registre PRONOM ; l'extension n'est qu'un
 *  indice. Aucun format n'est refusé : ce qu'aucun lecteur ne sait ouvrir devient une pièce
 *  jointe, gardée avec son empreinte et retrouvable par ses métadonnées. */

/** Identifiant PRONOM, par exemple « fmt/19 » ou « x-fmt/111 ». */
export const IdentifiantPronom = z.string().regex(/^(fmt|x-fmt)\/\d+$/, "Identifiant PRONOM attendu");
export type IdentifiantPronom = z.infer<typeof IdentifiantPronom>;

/** Comment le format a été reconnu. L'extension seule ne vaut jamais preuve (FMT-01). */
export const PreuveFormat = z.enum(["signature", "conteneur", "extension", "inconnu"]);
export type PreuveFormat = z.infer<typeof PreuveFormat>;

export const IdentificationFormat = z
  .object({
    empreinte: Empreinte,
    pronom: IdentifiantPronom.optional(),
    nom: z.string().min(1),
    typeMime: z.string().min(1),
    preuve: PreuveFormat,
    /** Vrai quand l'extension du fichier contredit son contenu : le contenu l'emporte. */
    extensionTrompeuse: z.boolean().default(false),
    outil: z.string().min(1),
  })
  .strict()
  .superRefine((identification, ctx) => {
    if (identification.preuve === "inconnu" && identification.pronom !== undefined)
      ctx.addIssue({ code: "custom", path: ["pronom"], message: "Un format inconnu ne porte pas d'identifiant PRONOM" });
  });
export type IdentificationFormat = z.infer<typeof IdentificationFormat>;

/** Ce qu'un lecteur de format sait faire (FMT-02). Il le déclare : le noyau ne devine rien. */
export const CapacitesLecteur = z
  .object({
    texte: z.boolean().default(false),
    positions: z.boolean().default(false),
    pages: z.boolean().default(false),
    images: z.boolean().default(false),
    duree: z.boolean().default(false),
    metadonnees: z.boolean().default(false),
  })
  .strict();
export type CapacitesLecteur = z.infer<typeof CapacitesLecteur>;

export const DescriptionLecteur = z
  .object({
    nom: z.string().min(1),
    version: z.string().min(1),
    /** Formats PRONOM que ce lecteur prend en charge. */
    pronoms: z.array(IdentifiantPronom).min(1),
    capacites: CapacitesLecteur,
  })
  .strict();
export type DescriptionLecteur = z.infer<typeof DescriptionLecteur>;

/** État d'un format dans une bibliothèque (FMT-10). */
export const PriseEnCharge = z.enum(["complete", "partielle", "piece_jointe"]);
export type PriseEnCharge = z.infer<typeof PriseEnCharge>;

/** Ce qu'un fichier devient à l'arrivée. Une pièce jointe n'est pas un échec : c'est un fichier
 *  conservé tel quel, cherchable par ses métadonnées, en attendant un lecteur (FMT-04). */
export const Arrivee = z
  .object({
    identification: IdentificationFormat,
    priseEnCharge: PriseEnCharge,
    lecteur: z.string().min(1).optional(),
    /** Empreinte relue après copie : l'original n'a pas bougé (FMT-08). */
    originalIntact: z.boolean(),
  })
  .strict()
  .superRefine((arrivee, ctx) => {
    if (arrivee.priseEnCharge !== "piece_jointe" && arrivee.lecteur === undefined)
      ctx.addIssue({ code: "custom", path: ["lecteur"], message: "Un format pris en charge nomme son lecteur" });
    if (arrivee.priseEnCharge === "piece_jointe" && arrivee.lecteur !== undefined)
      ctx.addIssue({ code: "custom", path: ["lecteur"], message: "Une pièce jointe n'a pas de lecteur" });
  });
export type Arrivee = z.infer<typeof Arrivee>;

/** Rapport de l'Inspecteur (OUT-01). */
export const PageInspectee = z
  .object({
    index: z.number().int().min(1),
    nature: z.enum(["native", "numerisee", "mixte", "vide"]),
    largeurPx: z.number().int().positive().optional(),
    hauteurPx: z.number().int().positive().optional(),
    resolutionPpp: z.number().positive().optional(),
    couleur: z.enum(["noir_et_blanc", "gris", "couleur"]).optional(),
    octets: z.number().int().nonnegative(),
  })
  .strict();
export type PageInspectee = z.infer<typeof PageInspectee>;

export const RapportInspecteur = z
  .object({
    empreinte: Empreinte,
    pages: z.array(PageInspectee),
    nature: z.enum(["natif", "numerise", "mixte"]),
    octets: z.number().int().nonnegative(),
    /** Pages imprimées annoncées par le document mais absentes (OUT-01). */
    pagesManquantes: z.array(z.string().min(1)).default([]),
    /** Empreintes vues plus d'une fois dans le lot. */
    doublons: z.array(Empreinte).default([]),
    octetsOptimisesEstimes: z.number().int().nonnegative().optional(),
  })
  .strict();
export type RapportInspecteur = z.infer<typeof RapportInspecteur>;
