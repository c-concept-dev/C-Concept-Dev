import { z } from "zod";
import { Horodatage, Identifiant, RefOutil } from "./commun.js";

export const EtatTravail = z.enum([
  "en_file", "verrouille", "en_cours", "en_pause", "termine", "partiel", "en_echec_recuperable", "en_echec_definitif", "annule",
]);
export type EtatTravail = z.infer<typeof EtatTravail>;

/** Le verrou est un bail renouvelé : le travail bat toutes les `BATTEMENT_VERROU_S` secondes et
 *  le bail expire `EXPIRATION_VERROU_S` secondes après le dernier battement. Un processus tué
 *  cesse de battre, son bail expire, le travail redevient reprenable (JOB-02). */
export const BATTEMENT_VERROU_S = 5;
export const EXPIRATION_VERROU_S = 15;

export const Verrou = z
  .object({ appareilId: Identifiant, battuLe: Horodatage, expireLe: Horodatage })
  .strict()
  .refine((v) => Date.parse(v.expireLe) > Date.parse(v.battuLe), {
    message: "Un bail expire après son dernier battement",
    path: ["expireLe"],
  });
export type Verrou = z.infer<typeof Verrou>;

/** Où le travail s'exécute (PLT-04). Le navigateur traite les petits ajouts ; au-delà d'un seuil,
 *  le travail attend l'application de bureau, qui le reprend à sa prochaine ouverture. */
export const LieuExecution = z.enum(["application", "navigateur"]);
export type LieuExecution = z.infer<typeof LieuExecution>;

/** États depuis lesquels un travail ne repartira plus de lui-même. */
export const ETATS_TERMINAUX: readonly z.infer<typeof EtatTravail>[] = ["termine", "annule", "en_echec_definitif"];

/** Travail persisté avant de commencer (JOB-01), bail renouvelé (JOB-02), point de reprise (JOB-03). */
export const Travail = z
  .object({
    id: Identifiant,
    outil: RefOutil,
    versionCible: Identifiant,
    etat: EtatTravail,
    lieu: LieuExecution.default("application"),
    /** Empreinte de ce qui est demandé : rejouer le même travail retrouve celui-ci (JOB-04). */
    empreinteEntree: z.string().min(1).optional(),
    tentative: z.number().int().min(1),
    verrou: Verrou.optional(),
    pointReprise: z.object({ unite: z.enum(["page", "lot", "fichier"]), valeur: z.number().int().nonnegative() }).strict().optional(),
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
