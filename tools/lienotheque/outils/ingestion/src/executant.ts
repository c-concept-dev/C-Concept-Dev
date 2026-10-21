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
import { causeLisible } from "@lienotheque/noyau";
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
    /** N'en lire que quelques pages, pour essayer une manière de lire sans tout relire. */
    pages: z.number().int().positive().optional(),
    /** Rang de la première page lue : les dix premières d'un document n'ont souvent rien à lire. */
    depuis: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ChargeTraitement = z.infer<typeof ChargeTraitement>;

/** Ce que le travail rend. L'hôte en est le seul écrivain : c'est une proposition, jamais une
 *  écriture (JOB-06). */
export type ChargeResultat = LotTraite;

/** Ce qu'un aperçu demande : des images de pages, sans rien lire.
 *
 *  L'éditeur de manière de lire en a besoin **avant** qu'une recette existe — on ne peut pas
 *  montrer où regarder sur une page qu'on ne voit pas. C'est donc un outil à part, avec sa charge
 *  à lui : lui faire emprunter la charge du traitement l'obligerait à inventer une recette. */
export const ChargeApercu = z
  .object({
    document: z.string().min(1),
    images: z.string().min(1),
    /** Rang de la première page, à partir de zéro. */
    depuis: z.number().int().nonnegative().default(0),
    /** Combien de pages. Borné : un aperçu de trois cents pages n'est plus un aperçu, et le
     *  temps qu'il prendrait ferait croire l'éditeur bloqué. */
    combien: z.number().int().positive().max(40).default(8),
    adresseImages: z.string().min(1).optional(),
  })
  .strict();
export type ChargeApercu = z.infer<typeof ChargeApercu>;

/** Les outils que cette porte sait servir, et le nom par lequel on les demande. */
export const OUTILS = { traitement: "traitement-de-lot", apercu: "apercu-de-pages" } as const;

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

  if (demande.outil.nom === OUTILS.apercu) return apercuDePages(demande, options.emettre);
  if (demande.outil.nom !== OUTILS.traitement)
    return echec(demande.travailId, `Aucun outil ne répond à ce nom : « ${demande.outil.nom} ».`, false);

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

    // Combien de pages le document porte, su avant d'en lire une. On le garde pour pouvoir dire
    // à la fin si ce qui est revenu correspond à ce qu'il y avait à lire.
    let pagesDuDocument: number | undefined;

    const traite = await instantaneDeLot({
      surTotal: (total) => {
        pagesDuDocument = total;
        dire(`${total} pages dans le document`);
      },
      // Chaque phase au journal : un moteur devenu muet doit laisser derrière lui où il en
      // était, sinon la recherche porte sur tout le traitement à la fois (JOB-07).
      surPhase: (phase) => dire(phase),
      pdf: charge.document,
      medias: charge.medias,
      recette: charge.recette,
      description: charge.description,
      ...(charge.cache === undefined ? {} : { cache: sousDossier(charge.cache, "lectures") }),
      ...(charge.images === undefined ? {} : { images: charge.images }),
      ...(charge.adresseImages === undefined ? {} : { adresseImages: charge.adresseImages }),
      ...(charge.adresseMedias === undefined ? {} : { adresseMedias: charge.adresseMedias }),
      ...(charge.pages === undefined ? {} : { pages: charge.pages }),
      ...(charge.depuis === undefined ? {} : { depuis: charge.depuis }),
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

    // Un document qui porte des pages et dont la chaîne n'en a lu **aucune** n'est pas traité :
    // il est illisible par ce chemin. Le dire franchement, et laisser le document à vérifier,
    // vaut mieux qu'un « terminé » sur un résultat vide — un succès qui ne produit rien passe
    // les contrôles, part dans la bibliothèque, et ne se découvre qu'à la recherche.
    //
    // La question ne se pose que si l'on sait combien de pages il y avait : un format sans
    // pages fixes n'émet aucun total, et zéro page y est la vérité, non une panne.
    // Deux chemins mènent à un document lu, et il suffit qu'un seul aboutisse.
    //
    // Les **pages** viennent de la chaîne d'images : elle ne voit que les pages portant une
    // image, donc aucune sur un document natif. Les **passages** viennent de la lecture du
    // texte, qui sert un natif entièrement. Exiger les premières condamnerait tout document
    // natif ; n'exiger ni l'une ni l'autre laisserait passer le résultat vide.
    const lues = traite.resultat.pages.length;
    const passages = traite.passages.length;
    if (pagesDuDocument !== undefined && pagesDuDocument > 0 && lues === 0 && passages === 0)
      return echec(
        demande.travailId,
        `Aucune des ${pagesDuDocument} pages de ce document n’a pu être lue, ni par sa couche texte ni par reconnaissance : cette manière de lire ne lui convient pas.`,
        false,
      );

    // Deux unités dans une phrase : on les nomme toutes les deux, et le total des trois
    // nombres de pages se vérifie contre le nombre de pages du document.
    const parPage = traite.lecture.parLaCouche + traite.lecture.parOcr + traite.lecture.sansTexte;
    dire(
      `${passages} passage(s), tirés de ${parPage} page(s) : ${traite.lecture.parLaCouche} par la ` +
        `couche texte, ${traite.lecture.parOcr} par reconnaissance, ${traite.lecture.sansTexte} sans texte`,
    );
    const illisibles = traite.passages.filter((p) => !p.lisible).length;
    if (illisibles > 0) dire(`${illisibles} passage(s) de qualité basse, indexés et marqués`, "avertissement");
    // Avant l'indexation, et en avertissement : c'est une décision à prendre, pas une panne.
    for (const filigrane of traite.filigranes)
      dire(
        `« ${filigrane.adresse} » revient sur ${filigrane.pages} page(s) sur ${traite.passages.length} ` +
          `(${(filigrane.part * 100).toFixed(0)} %) : vraisemblablement un tampon de numérisation.`,
        "avertissement",
      );
    dire(`${traite.vue.pages.length} pages, ${traite.vue.aVerifier} cas à vérifier`);
    emettre?.({ type: "progression", protocole: VERSION_PROTOCOLE, travailId: demande.travailId, progression: 1 });

    return Resultat.parse({ type: "resultat", protocole: VERSION_PROTOCOLE, travailId: demande.travailId, charge: traite });
  } catch (cause) {
    // Reprenable : ce qui a déjà été lu l'est pour de bon, et une relance repartira de là.
    const texte = causeLisible(cause);
    dire(texte, "erreur");
    return echec(demande.travailId, texte, true);
  }
}

/** Exporte quelques pages en images, et rien de plus : aucune lecture, aucune recette.
 *
 *  Le même contrat d'échange que le traitement, la même porte, les mêmes refus. Ce qui change est
 *  la charge, et c'est tout ce qui doit changer. */
async function apercuDePages(demande: Demande, emettre?: Emission): Promise<MessageVersHote> {
  const lue = ChargeApercu.safeParse(demande.charge);
  if (!lue.success) {
    const champ = lue.error.issues[0]?.path.join(".") ?? "charge";
    return echec(demande.travailId, `La demande d’aperçu est incomplète : « ${champ} » est en cause.`, false);
  }
  const charge = lue.data;

  try {
    const { exporterPages } = await import("./pages-images.js");
    const pages = await exporterPages(charge.document, charge.images, {
      depuis: charge.depuis,
      pages: charge.combien,
      // Pas de vignettes : l'éditeur montre une page en grand, et produire trois cents vignettes
      // pour en montrer huit coûterait plus que l'aperçu lui-même.
      vignettes: false,
    });
    const adresse = charge.adresseImages ?? "/donnees/pages";
    emettre?.({ type: "progression", protocole: VERSION_PROTOCOLE, travailId: demande.travailId, progression: 1 });
    return Resultat.parse({
      type: "resultat",
      protocole: VERSION_PROTOCOLE,
      travailId: demande.travailId,
      charge: {
        pages: pages.map((page) => ({
          rang: page.index,
          image: `${adresse}/${page.fichier}`,
          fichier: page.fichier,
          largeur: page.largeur,
          hauteur: page.hauteur,
        })),
      },
    });
  } catch (cause) {
    const texte = causeLisible(cause);
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
    outil: { nom: OUTILS.traitement, version: "1.0.0" },
    versionCible,
    charge,
  });
}

/** Monte une demande d'aperçu. Même enveloppe, même porte : seule la charge diffère. */
export function demandeDApercu(travailId: string, versionCible: string, charge: ChargeApercu): Demande {
  return Demande.parse({
    type: "demande",
    protocole: VERSION_PROTOCOLE,
    travailId,
    outil: { nom: OUTILS.apercu, version: "1.0.0" },
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
