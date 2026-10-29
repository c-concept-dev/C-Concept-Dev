import { z } from "zod";
import { Confiance, Empreinte } from "./commun.js";

/** Le moteur oracle : relier un conteneur à ses pièces, sans jamais rien supposer.
 *
 *  ## Ce que ce vocabulaire remplace, et pourquoi
 *
 *  Une manière de lire écrite à la main mêle trois choses de natures différentes : **ce qu'on
 *  observe**, **ce qu'on en conclut**, et **ce qui autorise à publier**. C'est ce mélange qui a
 *  permis à un recueil de la bibliothèque de publier 52 liens à pleine confiance parce que sa
 *  manière de lire posait en règle que le rang de la pièce valait le numéro du repère — une
 *  conclusion — sans qu'aucune observation ne l'appuie.
 *
 *  Ces contrats séparent les trois, et c'est tout leur objet :
 *
 *  - un **détecteur** rend des `Observation` : ce qu'il a vu, et où le revoir. Jamais un lien.
 *  - un **oracle** rassemble des `Proposition` et porte avec lui de quoi le réfuter : son
 *    échantillon, ses témoins, ses trous, ses désaccords.
 *  - un **verdict** dit « publié » ou « abstention », et dans le second cas il dit pourquoi.
 *
 *  ## Ce que le vocabulaire ne nomme plus
 *
 *  Ni page, ni piste, ni folio. Un **repère** est une position adressable — une page, un
 *  feuillet, un minutage, un paragraphe ; une **pièce** est un fichier à relier, quel que soit
 *  son genre. Le socle doit servir le jour où un conteneur portera autre chose que du son, et
 *  un vocabulaire qui nomme un genre interdit d'avance cet usage-là.
 */

/** Une position adressable dans un conteneur.
 *
 *  `rang` est toujours connu : c'est l'ordre, et il existe pour tout conteneur. `adresse` est ce
 *  que le contenu **porte lui-même** — un numéro imprimé, un minutage, un numéro de section —
 *  et il est absent quand rien ne le porte.
 *
 *  **Ne jamais remplir `adresse` par calcul.** Une adresse déduite du rang n'est pas une adresse
 *  lue : c'est le rang sous un autre nom, et le confondre a produit 114 pages « numérotées » sur
 *  un document où pas une n'avait été lue. */
export const Repere = z
  .object({
    rang: z.number().int().min(1),
    adresse: z.string().trim().min(1).max(40).optional(),
  })
  .strict();
export type Repere = z.infer<typeof Repere>;

/** Un fichier à relier au conteneur.
 *
 *  `groupe` dit de quel dépôt la pièce vient. Sans lui, rien ne prouve qu'elle appartient à ce
 *  conteneur, et un vivier qui déborde ne produit pas des liens douteux : il produit des liens
 *  faux et réguliers. */
export const Piece = z
  .object({
    empreinte: Empreinte,
    nom: z.string().min(1),
    rang: z.number().int().min(1).optional(),
    groupe: z.string().min(1).optional(),
  })
  .strict();
export type Piece = z.infer<typeof Piece>;

/** D'où un détecteur tient ce qu'il avance.
 *
 *  La distinction porte la règle de corroboration : deux observations de même source ne sont pas
 *  indépendantes. Deux façons de lire un nom de fichier ne font pas deux témoins ; un nom et une
 *  page, si. */
export const SourceObservation = z.enum(["nom", "arborescence", "contenu", "croisement"]);
export type SourceObservation = z.infer<typeof SourceObservation>;

/** Ce qu'un détecteur a vu, avec de quoi aller le revoir.
 *
 *  `ou` n'est pas un confort : c'est ce qui rend l'observation réfutable. Une observation qu'on
 *  ne peut pas aller revérifier est une affirmation, et une affirmation ne se corrobore pas. */
export const Observation = z
  .object({
    detecteur: z.string().regex(/^[a-z0-9-]+$/, "Un détecteur se nomme en minuscules et traits d'union"),
    source: SourceObservation,
    /** Ce qui a été vu, en clair, lisible par qui n'a pas écrit le détecteur. */
    constat: z.string().trim().min(1).max(240),
    /** Où aller le revoir : un rang, une zone, un nom de fichier. */
    ou: z.string().trim().min(1).max(240),
    confiance: Confiance,
  })
  .strict();
export type Observation = z.infer<typeof Observation>;

/** Un lien proposé, et ce qui l'appuie.
 *
 *  Au moins une observation, toujours. Une proposition sans observation est exactement ce que le
 *  moteur oracle existe pour empêcher. */
export const Proposition = z
  .object({
    repere: Repere,
    piece: Empreinte,
    observations: z.array(Observation).min(1).max(8),
  })
  .strict();
export type Proposition = z.infer<typeof Proposition>;

/** Ce qui remplace une manière de lire écrite à la main.
 *
 *  Un oracle n'est pas une règle : c'est une hypothèse **accompagnée de quoi la réfuter**. Il
 *  porte l'échantillon qui l'a formée, les témoins sur lesquels il a été éprouvé, ce qu'il ne
 *  couvre pas, et les désaccords qu'il a rencontrés.
 *
 *  ## Les témoins sont hors de l'échantillon, et le contrat l'exige
 *
 *  Éprouver une hypothèse sur les pages qui l'ont formée ne prouve rien : cela mesure la mémoire,
 *  pas la justesse. La règle existait déjà pour le diagnostic structurel et n'était appliquée
 *  nulle part ; ici elle est dans le contrat, donc un oracle qui s'en affranchit ne se construit
 *  pas.
 *
 *  ## L'empreinte invalide l'oracle
 *
 *  Un oracle vaut pour **un** conteneur, celui dont il porte l'empreinte. Le document change,
 *  l'oracle tombe. C'est ce qui évite qu'une hypothèse apprise un jour serve à un contenu qu'elle
 *  n'a jamais vu. */
export const Oracle = z
  .object({
    /** Comment cet oracle se nomme, pour qu'on puisse dire lequel a dit quoi.
     *
     *  Il en faut un : la confrontation compare des oracles, et un verdict nomme ceux qui
     *  l'autorisent. Les désigner par leur liste de détecteurs marchait tant qu'ils n'en avaient
     *  qu'un, et devenait ambigu dès le second. */
    id: z.string().regex(/^[a-z0-9-]+$/, "Un oracle se nomme en minuscules et traits d'union"),
    conteneur: Empreinte,
    /** Les détecteurs qui l'ont produit. Au moins un, nommés, pour qu'on sache quoi rejouer. */
    detecteurs: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1).max(12),
    /** Les rangs regardés pour former l'hypothèse. */
    echantillon: z.array(z.number().int().min(1)).max(32),
    /** Les rangs sur lesquels elle a été éprouvée, jamais ceux de l'échantillon. */
    temoins: z.array(z.number().int().min(1)).max(32),
    propositions: z.array(Proposition),
    /** Les rangs que l'oracle ne couvre pas. Dits, jamais tus : un trou qu'on ne nomme pas se
     *  découvre à l'usage, quand quelqu'un cherche ce qui manque sans savoir qu'il manque. */
    sansProposition: z.array(z.number().int().min(1)),
    /** Ce que l'oracle a rencontré et n'a pas su trancher, en clair. */
    desaccords: z.array(z.string().trim().min(1).max(240)).max(64),
    etabliLe: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((oracle, contexte) => {
    const vus = new Set(oracle.echantillon);
    for (const [rang, temoin] of oracle.temoins.entries())
      if (vus.has(temoin))
        contexte.addIssue({
          code: "custom",
          path: ["temoins", rang],
          message: "Un témoin doit rester hors de l'échantillon : s'éprouver sur ce qui a formé l'hypothèse ne prouve rien",
        });
    const reperes = new Set<number>();
    for (const [rang, proposition] of oracle.propositions.entries()) {
      if (reperes.has(proposition.repere.rang))
        contexte.addIssue({
          code: "custom",
          path: ["propositions", rang, "repere", "rang"],
          message: "Deux propositions visent le même repère : l'oracle doit trancher ou s'abstenir, pas proposer deux fois",
        });
      reperes.add(proposition.repere.rang);
    }
    for (const [rang, sans] of oracle.sansProposition.entries())
      if (reperes.has(sans))
        contexte.addIssue({
          code: "custom",
          path: ["sansProposition", rang],
          message: "Un rang déclaré sans proposition en porte pourtant une",
        });
  });
export type Oracle = z.infer<typeof Oracle>;

/** Ce qu'une lecture a décidé pour un repère, tel que le coordinateur le rend.
 *
 *  **C'est la soudure entre deux pièces qui ne se connaissaient pas.** Le coordinateur impose
 *  depuis longtemps l'ordre sûr — local d'abord, Vision seulement sur ce qui résiste,
 *  corroboration avant de retenir — et il n'était appelé nulle part. Le moteur oracle a besoin
 *  exactement de cela et de rien de plus : pour chaque repère, une valeur retenue avec sa
 *  provenance, ou un refus avec ses raisons.
 *
 *  La forme vit au contrat plutôt que dans l'une des deux pièces : c'est le seul endroit que les
 *  deux voient déjà, et l'y poser évite de faire dépendre une pièce de logique pure d'une pièce
 *  qui lit des pixels.
 *
 *  `a_verifier` porte ses raisons au pluriel, parce qu'il y en a souvent plusieurs et que les
 *  résumer en une seule ferait perdre celle qui aurait permis d'agir. */
export const DecisionDeLecture = z.discriminatedUnion("etat", [
  z
    .object({
      etat: z.literal("retenue"),
      repere: z.number().int().min(1),
      /** La pièce retenue pour ce repère. */
      piece: Empreinte,
      /** D'où vient la valeur : lue sur place, ou relue puis corroborée. Jamais « Vision seule ». */
      venue: z.enum(["locale", "vision_corroboree"]),
      confiance: Confiance,
      observations: z.array(Observation).min(1).max(8),
    })
    .strict(),
  z
    .object({
      etat: z.literal("a_verifier"),
      repere: z.number().int().min(1),
      raisons: z.array(z.string().trim().min(1).max(240)).min(1).max(8),
    })
    .strict(),
]);
export type DecisionDeLecture = z.infer<typeof DecisionDeLecture>;

/** Pourquoi le moteur n'a rien publié.
 *
 *  Cinq motifs, et ils ne se confondent pas : ce qu'on fait pour y remédier n'est pas le même.
 *
 *  - `aucun_oracle` : aucun détecteur n'a rien vu. Il n'y a pas d'hypothèse à éprouver.
 *  - `oracle_unique_sans_verification` : une seule façon de savoir, et personne n'a vérifié ce
 *    conteneur. C'est la deuxième voie de publication, et elle attend un œil.
 *  - `oracles_en_desaccord` : deux façons de savoir se contredisent. Trancher à l'aveugle ici
 *    serait choisir la plus bavarde, pas la plus juste.
 *  - `temoins_non_eprouves` : l'hypothèse n'a jamais été confrontée à des repères qu'elle n'a pas
 *    vus. Elle n'est pas fausse, elle n'est pas prouvée.
 *  - `temoins_en_echec` : elle l'a été, et elle n'a pas tenu. */
export const MotifAbstention = z.enum([
  "aucun_oracle",
  "oracle_unique_sans_verification",
  "oracles_en_desaccord",
  "temoins_non_eprouves",
  "temoins_en_echec",
]);
export type MotifAbstention = z.infer<typeof MotifAbstention>;

/** Ce que le moteur conclut, et qui engage l'affichage.
 *
 *  Une abstention porte toujours sa cause en clair : c'est ce que quelqu'un lira à l'écran, et
 *  « on n'est pas sûr » n'a jamais aidé personne à décider quoi faire. */
export const Verdict = z.discriminatedUnion("etat", [
  z
    .object({
      etat: z.literal("publie"),
      /** Les oracles concordants qui l'autorisent, ou l'oracle unique et son œil. */
      oracles: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1),
      verifieParUnHumain: z.boolean(),
      pourquoi: z.string().trim().min(1).max(240),
    })
    .strict(),
  z
    .object({
      etat: z.literal("abstention"),
      motif: MotifAbstention,
      pourquoi: z.string().trim().min(1).max(240),
      /** Ce qu'il faudrait pour lever l'abstention, quand on le sait. */
      pourLever: z.string().trim().min(1).max(240).optional(),
    })
    .strict(),
]);
export type Verdict = z.infer<typeof Verdict>;
