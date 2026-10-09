import { z } from "zod";
import { NumeroVersion } from "./commun.js";

/** Recette typée (REC-01) : aucun texte libre interprété, tout paramètre inconnu est refusé (`.strict()`). */
const Rel = z.number().gt(0).lt(1);

const Zone = z.discriminatedUnion("type", [
  z.object({ type: z.literal("coins"), bord: z.enum(["haut", "bas"]) }).strict(),
  z.object({ type: z.literal("marges_exterieures"), largeur_rel: Rel }).strict(),
  // Une zone tracée peut couvrir toute la largeur ou toute la hauteur — une bande en pied de
  // page, par exemple. `Rel` l'interdit, et à juste titre là où il sert : une marge ne peut pas
  // être la page entière, ni un chiffre la hauteur entière. Ici, si.
  z
    .object({
      type: z.literal("rectangle_rel"),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      l: z.number().gt(0).max(1),
      h: z.number().gt(0).max(1),
    })
    .strict(),
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
    /** Relecture ciblée des zones que la lecture locale n'a pas rendues (OUT-08).
     *
     *  Facultative — un lot qui se lit entièrement n'en a pas besoin, et la plupart n'en auront
     *  jamais. Mais déclarée, elle porte son budget : une recette qui demande d'envoyer des
     *  images sans dire combien est refusée ici, pas découverte à la centième zone.
     *
     *  Le budget est une donnée de la recette, comme le reste. Un autre domaine, un autre lot,
     *  un autre plafond, et rien à recompiler. */
    vision: z
      .object({
        /** Plafond ferme pour un lot entier. Atteint, on s'arrête net. */
        zones_max_par_lot: z.number().int().positive(),
        /** Plafond par page : il borne les dégâts d'une page qui ne se lit pas du tout. */
        zones_max_par_page: z.number().int().positive(),
        /** Plafond de dépense, quand il a été mesuré. On ne pose pas un plafond sur une
         *  estimation : il s'écrit après le comptage des jetons sur de vrais recadrages. */
        cout_max_eur: z.number().positive().optional(),
        /** De combien agrandir un recadrage avant de l'envoyer.
         *
         *  Agrandir n'ajoute aucune information, et la première version de ce plan disait donc de
         *  ne jamais le faire. La mesure a tranché autrement : un repère de ce document fait
         *  80 × 80 pixels, ce qu'un modèle découpe en deux tuiles sur deux, et à cette taille il
         *  perd des chiffres — 15 pavés justes sur 18 à l'échelle d'origine, 18 sur 18 au double.
         *  Un document photographié de plus près n'en aurait pas besoin : c'est donc une donnée de
         *  la recette, pas une constante du code. */
        agrandissement: z.number().int().min(1).max(8).optional(),
      })
      .strict()
      .optional(),
    validation: z.object({ seuil_confiance: z.number().min(0).max(1) }).strict(),
  })
  .strict();
export type Recette = z.infer<typeof Recette>;
