import { z } from "zod";
import {
  Demande,
  Echec,
  Resultat,
  VERSION_PROTOCOLE,
  desaccordDeProtocole,
  type MessageVersHote,
} from "@lienotheque/contrats";
import { jetonDacces, relectureCiblee, transportVersWorker } from "@lienotheque/vision";
import { sousDossier } from "@lienotheque/cache";
import { instantaneDeLot, type LotTraite } from "./lot.js";

/** La porte de la chaîne : une demande entre, un message sort (JOB-01 à JOB-09, PLT-02).
 *
 *  Tout ce qui traite un lot passe par ici — l'application, le banc de mesure, le script de
 *  traitement. C'est la condition pour que ce qu'on mesure soit ce que l'application fait : une
 *  porte plus bas, et le critère cesserait de prouver le produit pour ne plus prouver qu'un
 *  script. C'est la même règle qui a fait appeler `rejouer` à l'instantané, après qu'un second
 *  chemin de code eut divergé en silence.
 *
 *  Rien n'entre sans contrat : l'enveloppe est validée par `Demande`, la charge par le contrat de
 *  cet outil, ci-dessous. Un désaccord de version est refusé avant tout travail. */

/** Ce que ce travail demande. C'est le contrat de l'outil, celui que l'enveloppe générique laisse
 *  volontairement indéterminé — un contrat générique qui nommerait ces champs écrirait du domaine
 *  dans du code qui n'en connaît aucun (CLA-01).
 *
 *  Que des chemins et une adresse : aucun secret ne voyage. Le jeton d'accès au service de
 *  relecture est lu dans le processus au moment de l'appel, et n'apparaît ni dans la demande, ni
 *  dans le journal, ni dans le résultat. */
export const ChargeTraitement = z
  .object({
    document: z.string().min(1),
    medias: z.string().min(1),
    recette: z.string().min(1),
    description: z.string().min(1),
    /** Racine du cache de travail. L'exécutant y prend ses coins ; l'hôte n'a qu'à dire où. */
    cache: z.string().min(1).optional(),
    images: z.string().min(1).optional(),
    adresseImages: z.string().min(1).optional(),
    adresseMedias: z.string().min(1).optional(),
    /** Adresse du service de relecture ciblée. Absente, la chaîne est la même, elle ne relit rien. */
    relecture: z.url().optional(),
  })
  .strict();
export type ChargeTraitement = z.infer<typeof ChargeTraitement>;

/** Ce que le travail rend. L'hôte en est le seul écrivain : c'est une proposition, jamais une
 *  écriture (JOB-06). */
export type ChargeResultat = LotTraite;

export type Emission = (message: MessageVersHote) => void;

const echec = (travailId: string, cause: string, reprisePossible: boolean): Echec =>
  Echec.parse({ type: "echec", protocole: VERSION_PROTOCOLE, travailId, cause, reprisePossible });

/** Exécute une demande et rend le message qui la clôt : un résultat, ou un échec qui dit sa cause.
 *
 *  Jamais d'exception vers l'appelant pour une demande qu'on a su lire : une erreur avalée est
 *  interdite (JOB-05), et une erreur qui remonte en exception se perd dans un tuyau entre deux
 *  processus. Une demande qu'on n'a pas su lire est le seul cas qui lève — il n'y a alors pas
 *  même d'identifiant de travail auquel rattacher l'échec. */
export async function executerTravail(brut: unknown, options: { readonly emettre?: Emission } = {}): Promise<MessageVersHote> {
  const demande = Demande.parse(brut);

  const ecart = desaccordDeProtocole(demande.protocole);
  if (ecart !== undefined) return echec(demande.travailId, ecart.message, false);

  const lue = ChargeTraitement.safeParse(demande.charge);
  if (!lue.success) {
    const champ = lue.error.issues[0]?.path.join(".") ?? "charge";
    return echec(demande.travailId, `La demande ne décrit pas ce qu'il faut traiter : « ${champ} » est en cause.`, false);
  }
  const charge = lue.data;

  const emettre = options.emettre;
  const dire = (texte: string, niveau: "information" | "avertissement" | "erreur" = "information"): void =>
    emettre?.({ type: "journal", protocole: VERSION_PROTOCOLE, travailId: demande.travailId, niveau, texte, le: new Date().toISOString() });

  try {
    // Le jeton est lu ici, dans le processus, et jamais transporté. Sans lui, la chaîne est la
    // même : elle ne relit simplement rien.
    const jeton = charge.relecture === undefined ? undefined : jetonDacces();
    if (charge.relecture !== undefined && jeton === undefined)
      return echec(demande.travailId, "Relecture demandée mais aucun jeton : ni dans l'environnement, ni dans le trousseau.", false);

    dire("Lecture du document");

    const traite = await instantaneDeLot({
      pdf: charge.document,
      medias: charge.medias,
      recette: charge.recette,
      description: charge.description,
      ...(charge.cache === undefined ? {} : { cache: sousDossier(charge.cache, "lectures") }),
      ...(charge.images === undefined ? {} : { images: charge.images }),
      ...(charge.adresseImages === undefined ? {} : { adresseImages: charge.adresseImages }),
      ...(charge.adresseMedias === undefined ? {} : { adresseMedias: charge.adresseMedias }),
      ...(charge.relecture === undefined || jeton === undefined
        ? {}
        : {
            relecture: relectureCiblee(transportVersWorker(charge.relecture, jeton), {
              ...(charge.cache === undefined ? {} : { cacheDuLot: sousDossier(charge.cache, "vision-reponses") }),
              // Ce qu'une passe a coûté part au journal, et de là à l'écran de traitement : une
              // dépense qu'on ne voit pas est une dépense qu'on ne surveille pas.
              compter: (passe, bilan) =>
                dire(
                  `Relecture, passe ${passe} : ${bilan.zones} zones, ${bilan.appels} appel(s), ` +
                    `${bilan.depuisLeCache} depuis le cache, ${bilan.cout.toFixed(4)} €`,
                ),
            }),
          }),
      // Le point de reprise part à l'hôte, qui le persiste (JOB-03). La reprise effective tient
      // aujourd'hui au cache de lecture : relancer un lot déjà lu ne relit pas ses pages.
      avancement: (faits, total) =>
        emettre?.({
          type: "progression",
          protocole: VERSION_PROTOCOLE,
          travailId: demande.travailId,
          progression: total === 0 ? 0 : faits / total,
          pointReprise: { unite: "page", valeur: faits },
          ...(total === 0 ? {} : { total }),
        }),
    });

    dire(`${traite.vue.pages.length} pages, ${traite.vue.aVerifier} cas à vérifier`);
    emettre?.({ type: "progression", protocole: VERSION_PROTOCOLE, travailId: demande.travailId, progression: 1 });

    return Resultat.parse({ type: "resultat", protocole: VERSION_PROTOCOLE, travailId: demande.travailId, charge: traite });
  } catch (cause) {
    // Reprenable : ce qui a déjà été lu l'est pour de bon, et une relance repartira de là.
    const texte = cause instanceof Error ? cause.message : String(cause);
    dire(texte, "erreur");
    return echec(demande.travailId, texte, true);
  }
}

/** Monte une demande à partir d'une charge, pour les appelants qui n'en reçoivent pas d'un hôte —
 *  le banc de mesure et le script de traitement. Ils franchissent la même porte que l'application,
 *  avec la même enveloppe. */
export function demandeDeTraitement(travailId: string, versionCible: string, charge: ChargeTraitement): Demande {
  return Demande.parse({
    type: "demande",
    protocole: VERSION_PROTOCOLE,
    travailId,
    outil: { nom: "traitement-de-lot", version: "1.0.0" },
    versionCible,
    charge,
  });
}

/** Le résultat d'un travail, ou l'échec expliqué. Rend la charge quand tout s'est bien passé, et
 *  lève sinon : un appelant qui ne sait pas quoi faire d'un échec vaut mieux arrêté. */
export function chargeOuEchec(message: MessageVersHote): ChargeResultat {
  if (message.type === "resultat") return message.charge as ChargeResultat;
  if (message.type === "echec") throw new Error(message.cause);
  throw new Error(`Message inattendu en fin de travail : ${message.type}`);
}
