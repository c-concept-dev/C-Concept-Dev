import { z } from "zod";
import { TypeDeContenu } from "./bibliotheque.js";
import { Horodatage, Identifiant, RefOutil } from "./commun.js";
import limites from "../limites.json" with { type: "json" };

export const EtatTravail = z.enum([
  "en_file", "verrouille", "en_cours", "en_pause", "termine", "partiel", "en_echec_recuperable", "en_echec_definitif", "annule",
]);
export type EtatTravail = z.infer<typeof EtatTravail>;

/** Le verrou est un bail renouvelé : le travail bat toutes les `BATTEMENT_VERROU_S` secondes et
 *  le bail expire `EXPIRATION_VERROU_S` secondes après le dernier battement. Un processus tué
 *  cesse de battre, son bail expire, le travail redevient reprenable (JOB-02). */
export const BATTEMENT_VERROU_S = limites.battementVerrouS;
export const EXPIRATION_VERROU_S = limites.expirationVerrouS;

/** Combien de fois on réessaie un travail qui a échoué de façon récupérable (JOB-05).
 *
 *  Au-delà, l'échec devient définitif : réessayer sans fin une opération qui échoue toujours ne la
 *  fait pas réussir, cela cache seulement la panne derrière une file qui a l'air de tourner. */
export const TENTATIVES_MAX = limites.tentativesMax;

/** Le temps qu'on laisse passer avant de réessayer.
 *
 *  Sans délai, trois tentatives se consomment en une seconde sur une panne passagère — un volume
 *  démonté, un fichier encore en cours d'écriture — et l'échec devient définitif avant que la
 *  cause ait eu le temps de disparaître. */
export const DELAI_ENTRE_TENTATIVES_S = limites.delaiEntreTentativesS;

export const Verrou = z
  .object({ appareilId: Identifiant, battuLe: Horodatage, expireLe: Horodatage })
  .strict()
  .refine((v) => Date.parse(v.expireLe) > Date.parse(v.battuLe), {
    message: "Un bail expire après son dernier battement",
    path: ["expireLe"],
  });
export type Verrou = z.infer<typeof Verrou>;

/** Ce qu'un travail coûte à la machine.
 *
 *  « lourd » occupe une des places limitées : lire trois cents pages tient un processus entier et
 *  son gigaoctet. « léger » n'en occupe aucune — renommer un axe ou recalculer un compte n'a pas
 *  à attendre qu'une lecture finisse. Lourd par défaut : se tromper dans ce sens fait attendre,
 *  se tromper dans l'autre fait rendre la main à la machine. */
export const PoidsTravail = z.enum(["lourd", "leger"]);
export type PoidsTravail = z.infer<typeof PoidsTravail>;

/** Où le travail s'exécute (PLT-04). Le navigateur traite les petits ajouts ; au-delà d'un seuil,
 *  le travail attend l'application de bureau, qui le reprend à sa prochaine ouverture. */
export const LieuExecution = z.enum(["application", "navigateur"]);
export type LieuExecution = z.infer<typeof LieuExecution>;

/** États depuis lesquels un travail ne repartira plus de lui-même. */
export const ETATS_TERMINAUX: readonly z.infer<typeof EtatTravail>[] = ["termine", "annule", "en_echec_definitif"];

/** Où un travail long en est : l'unité comptée et le rang atteint (JOB-03).
 *
 *  Décrit ici, et nulle part ailleurs : le travail persisté et les messages échangés avec le
 *  processus qui l'exécute parlent du même point, et deux descriptions du même fait finissent
 *  toujours par en donner deux. */
export const PointReprise = z
  .object({ unite: z.enum(["page", "piste", "image", "lot", "fichier"]), valeur: z.number().int().nonnegative() })
  .strict();
export type PointReprise = z.infer<typeof PointReprise>;

/** De quoi ce travail s'occupe, tel que l'écran le nomme (JOB-03, UX-03).
 *
 *  Une file qui n'affiche que des identifiants ne se surveille pas : on y voit que quelque chose
 *  tourne, jamais quoi. Le sujet porte donc le nom du fichier déposé, ce qu'il contient, et
 *  combien d'unités il compte — ce dernier d'abord inconnu, puisqu'il faut avoir ouvert le
 *  fichier pour le savoir. Il est rempli par l'hôte à la première progression qui le dit.
 *
 *  Le nom du fichier et rien de plus : ce que le fichier *représente* vient du schéma de la
 *  bibliothèque, jamais d'ici (CLA-01). */
export const SujetTravail = z
  .object({
    nom: z.string().min(1),
    contenu: TypeDeContenu,
    total: z.number().int().positive().optional(),
  })
  .strict();
export type SujetTravail = z.infer<typeof SujetTravail>;

/** Travail persisté avant de commencer (JOB-01), bail renouvelé (JOB-02), point de reprise (JOB-03). */
export const Travail = z
  .object({
    id: Identifiant,
    outil: RefOutil,
    versionCible: Identifiant,
    etat: EtatTravail,
    lieu: LieuExecution.default("application"),
    poids: PoidsTravail.default("lourd"),
    /** Absent pour un travail qui ne porte sur aucun fichier — un recalcul, une réindexation. */
    sujet: SujetTravail.optional(),
    /** Empreinte de ce qui est demandé : rejouer le même travail retrouve celui-ci (JOB-04). */
    empreinteEntree: z.string().min(1).optional(),
    tentative: z.number().int().min(1),
    verrou: Verrou.optional(),
    pointReprise: PointReprise.optional(),
    progression: z.number().min(0).max(1),
    erreur: z
      .object({ cause: z.string().min(1), elements: z.array(z.string()), reprisePossible: z.boolean() })
      .strict()
      .optional(),
    creeLe: Horodatage,
    majLe: Horodatage,
  })
  .strict()
  .superRefine((t, ctx) => {
    const enEchec = t.etat === "en_echec_recuperable" || t.etat === "en_echec_definitif";
    if (enEchec && !t.erreur) ctx.addIssue({ code: "custom", path: ["erreur"], message: "Un échec enregistre sa cause (JOB-05)" });
    if (t.etat === "verrouille" && !t.verrou) ctx.addIssue({ code: "custom", path: ["verrou"], message: "Un travail verrouillé porte son bail (JOB-02)" });
    if (t.etat === "termine" && t.progression !== 1) ctx.addIssue({ code: "custom", path: ["progression"], message: "Un travail terminé est à 100 %" });
    if (ETATS_TERMINAUX.includes(t.etat) && t.verrou !== undefined)
      ctx.addIssue({ code: "custom", path: ["verrou"], message: "Un travail arrêté ne garde pas son bail" });
  });
export type Travail = z.infer<typeof Travail>;

/** Journal d'indexation par identifiant (JOB-07) : ce qui est prévu, envoyé, confirmé.
 *  La réconciliation ne doit jamais laisser d'écart inexpliqué. */
export const EtapeIndexation = z.enum(["prevu", "envoye", "confirme"]);
export type EtapeIndexation = z.infer<typeof EtapeIndexation>;

export const LigneJournalIndexation = z
  .object({ index: z.string().min(1), objetId: z.string().min(1), etape: EtapeIndexation, majLe: Horodatage })
  .strict();
export type LigneJournalIndexation = z.infer<typeof LigneJournalIndexation>;

/** Objets prévus ou envoyés mais jamais confirmés : l'écart à expliquer (JOB-07). */
export function ecartsDIndexation(journal: readonly LigneJournalIndexation[]): readonly string[] {
  const derniere = new Map<string, LigneJournalIndexation>();
  for (const ligne of journal) {
    const cle = `${ligne.index}/${ligne.objetId}`;
    const vue = derniere.get(cle);
    if (vue === undefined || vue.majLe <= ligne.majLe) derniere.set(cle, ligne);
  }
  return [...derniere.entries()].filter(([, ligne]) => ligne.etape !== "confirme").map(([cle]) => cle);
}
