import { z } from "zod";
import { NumeroVersion } from "./commun.js";

/** Recette typée (REC-01) : aucun texte libre interprété, tout paramètre inconnu est refusé (`.strict()`). */
const Rel = z.number().gt(0).lt(1);

const Zone = z.discriminatedUnion("type", [
  z.object({ type: z.literal("coins"), bord: z.enum(["haut", "bas"]) }).strict(),
  z.object({ type: z.literal("marges_exterieures"), largeur_rel: Rel }).strict(),
  z.object({ type: z.literal("rectangle_rel"), x: z.number().min(0).max(1), y: z.number().min(0).max(1), l: Rel, h: Rel }).strict(),
]);

const Alphabet = z.enum(["chiffres", "latin", "tous"]);

const LecturePage = z.object({ ancre: z.literal("page_imprimee"), zone: Zone, alphabet: Alphabet }).strict();

const LectureElement = z
  .object({
    ancre: z.literal("element"),
    zone: Zone,
    hauteur_rel: z.object({ min: Rel, max: Rel }).strict().refine((h) => h.max > h.min, "max doit dépasser min"),
    alphabet: Alphabet,
    libelle: z.string().min(1).optional(),
  })
  .strict();

const LecturePiste = z
  .object({
    ancre: z.literal("piste"),
    outil: z.enum(["pastilles"]),
    relatif_a: z.literal("element"),
    position: z.enum(["dessous", "dessus", "gauche", "droite"]),
    motif: z.enum(["bloc_sombre_chiffres_clairs", "losange_sombre_chiffres_clairs"]),
    etiquette_disque: z.boolean(),
  })
  .strict();

export const Lecture = z.discriminatedUnion("ancre", [LecturePage, LectureElement, LecturePiste]);

export const Recette = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    version: NumeroVersion,
    derivee_de: z.object({ id: z.string(), version: NumeroVersion }).strict().nullable(),
    preparation: z
      .object({ redressement: z.enum(["auto", "aucun"]), double_page: z.boolean(), page_gauche: z.enum(["paire", "impaire"]).optional() })
      .strict(),
    lectures: z.array(Lecture).min(1),
    regles: z
      .object({
        elements: z.object({ ordre: z.enum(["strictement_croissant", "croissant"]), saut_max: z.number().int().positive() }).strict(),
        pistes: z
          .object({
            ordre: z.enum(["croissant"]),
            pas_autorises: z.array(z.number().int().nonnegative()).min(1),
            penalite_pas_2: z.number().nonnegative().optional(),
            egale_numero_element: z.boolean().optional(),
          })
          .strict()
          .optional(),
        changement_disque: z.object({ lectures_sures_consecutives: z.number().int().positive(), valeur_max: z.number().int().positive() }).strict().optional(),
        plusieurs_elements_par_piste: z.boolean(),
        mention_suite: z.string().min(1).optional(),
      })
      .strict(),
    audio: z.object({ motif_nom: z.string().min(1), usage: z.literal("indice") }).strict().optional(),
    validation: z.object({ seuil_confiance: z.number().min(0).max(1) }).strict(),
  })
  .strict();
export type Recette = z.infer<typeof Recette>;
