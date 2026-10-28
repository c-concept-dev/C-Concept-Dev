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

/** À quoi ressemble un numéro d'élément, donné par l'exemple et non par une syntaxe.
 *
 *  Un administrateur sait dire « ici, un numéro ressemble à 2.46 ». Il n'a pas à savoir écrire
 *  une expression régulière, et nous n'avons pas à lui en demander une — ni à l'afficher.
 *
 *  Ce que l'exemple décide, et rien d'autre : **chaque groupe de chiffres vaut un à trois
 *  chiffres**, et **tout le reste est repris tel quel**. « 2.46 » accepte donc « 3.3 » et
 *  « 12.108 », et exige le point. Absent, c'est un nombre de un à trois chiffres — ce qui a
 *  toujours été le cas, et ce qui ne change donc rien aux documents déjà lus.
 *
 *  L'ordre se tient aussi : un numéro à plusieurs groupes se compare groupe par groupe, chacun
 *  comptant pour trois chiffres. « 2.46 » passe avant « 3.3 ». */
const FormeNumero = z
  .object({
    exemple: z.string().regex(/^\d/, "Un exemple commence par un chiffre").min(1),
    /** Certains ouvrages impriment le numéro dans un cadre. Déclarer cette forme permet de
     *  retirer le trait avant l'OCR ; elle n'est jamais supposée pour les autres recettes. */
    encadrement: z.literal("rectangle").optional(),
    /** Familles de numéros que cette manière de lire sait relier aux médias. Un préfixe déclaré
     *  écarte les autres chapitres avant qu'ils ne puissent consommer une piste. */
    prefixes: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();

const LectureElement = z
  .object({
    ancre: z.literal("element"),
    zone: Zone,
    hauteur_rel: z.object({ min: Rel, max: Rel }).strict().refine((h) => h.max > h.min, "max doit dépasser min"),
    alphabet: Alphabet,
    libelle: z.string().min(1).optional(),
    numero: FormeNumero.optional(),
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
    /** Mesure propre au repère imprimé ; absente, le seuil commun éprouvé reste inchangé. */
    remplissage_minimal: z.number().gt(0).lt(1).optional(),
  })
  .strict();

export const Lecture = z.discriminatedUnion("ancre", [LecturePage, LectureElement, LecturePiste]);

export const Recette = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    version: NumeroVersion,
    derivee_de: z.object({ id: z.string(), version: NumeroVersion }).strict().nullable(),
    preparation: z
      .object({
        redressement: z.enum(["auto", "aucun"]),
        /** Deux pages par feuille — **facultatif, et c'est tout l'enjeu**.
         *
         *  Obligatoire, il était toujours présent, donc toujours une déclaration. Comme rien dans
         *  l'éditeur ne le touche, toute manière de lire écrivait « une page par feuille » sans
         *  que personne l'ait dit, et la chaîne, qui obéit à ce qui est déclaré, ne regardait
         *  jamais le document. La détection automatique ne s'exécutait donc jamais par le chemin
         *  du produit (relevé le 21 octobre 2026).
         *
         *  Absent : personne n'a tranché, la chaîne regarde la feuille. Présent : c'est une
         *  décision, et elle l'emporte — y compris un `false`, qui vaut contre un détecteur
         *  qui se tromperait. */
        double_page: z.boolean().optional(),
        page_gauche: z.enum(["paire", "impaire"]).optional(),
      })
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
    audio: z
      .object({
        motif_nom: z.string().min(1),
        /** `indice` ne décide rien. `corroboration_exacte` exige que l'identifiant lu sur la page
         * désigne un unique média portant exactement le même identifiant ; sinon abstention. */
        usage: z.enum(["indice", "corroboration_exacte"]),
      })
      .strict()
      .optional(),
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
