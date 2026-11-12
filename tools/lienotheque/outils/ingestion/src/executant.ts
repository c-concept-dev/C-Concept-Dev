import { z } from "zod";
import {
  AcquisDeLecture,
  Demande,
  Echec,
  Resultat,
  VERSION_PROTOCOLE,
  desaccordDeProtocole,
  type MessageVersHote,
} from "@lienotheque/contrats";
import {
  cacheDansDossier,
  jetonDacces,
  relectureCiblee,
  transportValidationCiblesVersWorker,
  transportVersWorker,
  validationStructurelleCiblee,
  type Transport,
} from "@lienotheque/vision";
import { sousDossier } from "@lienotheque/cache";
import type { ImageGrise } from "@lienotheque/images";
import { causeLisible } from "@lienotheque/noyau";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FormatNonLu, lecteurDeMorceauChiffre } from "./texte.js";
import { instantaneDeLot, type LotTraite } from "./lot.js";
import { relecteurEnChaine } from "./relecteur-en-chaine.js";
import { relecteurParVision } from "./relecteur-par-vision.js";
import { relecteurSurPlace } from "./relire-sur-place.js";

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
/** Ce que la relecture des cases d'un document a droit de dépenser quand l'hôte ne dit rien.
 *
 *  **Un plafond qu'on n'a pas est une dépense qu'on ne borne pas.** Le chiffre vient d'une
 *  mesure, pas d'un sentiment : sur un document réel de 116 pages, la table a rendu **71** cases
 *  en défaut, soit une borne haute de **0,22 €** au tarif relevé le 5 novembre 2026. Un euro
 *  laisse donc la place à un document quatre fois plus troué, et arrête net celui qui le serait
 *  vingt fois.
 *
 *  Il n'est pas une politique de produit : c'est une borne de sécurité, et l'hôte la remplace en
 *  donnant `coutMaxEur`. */
export const PLAFOND_DES_CASES_PAR_DEFAUT_EUR = 1;

export const ChargeTraitement = z
  .object({
    document: z.string().min(1),
    medias: z.string().min(1),
    /** Inventaire établi au dépôt : le nom d'origine porte les indices et l'empreinte désigne la
     *  copie rangée. Absent pour les anciens appelants qui donnent un dossier. */
    inventaireMedias: z
      .array(
        z
          .object({
            nom: z.string().min(1),
            empreinte: z.string().regex(/^[a-f0-9]{64}$/),
            /** Groupes de dépôt du média. Absents chez un hôte antérieur au bornage : le vivier
             *  ne pourra alors rien prouver, et rien ne sera publié. */
            provenances: z.array(z.string().min(1)).optional(),
          })
          .strict(),
      )
      .optional(),
    /** Groupes de dépôt dont le document provient. Sans eux, le vivier ne peut rien prouver et la
     *  chaîne ne publie aucune association : c'est voulu. */
    provenancesMedias: z.array(z.string().min(1)).optional(),
    /** La manière de lire, **ou son absence**.
     *
     *  `null` n'est pas une charge mal formée : c'est ce que l'hôte envoie pour un document
     *  qu'aucune manière de lire ne couvre, et la chaîne prend alors sa seconde voie. Exiger ici
     *  une chaîne de caractères a tué tous ces travaux à la porte, en échec **définitif**, sans
     *  qu'une page soit lue — 248 documents sur 250 de la bibliothèque réelle. */
    recette: z.string().min(1).nullable().optional(),
    /** Ce qu'une lecture antérieure de ce document a appris, si l'hôte en garde un.
     *
     *  Validé ici par son propre contrat, et non cru sur parole : la voie recalculera en plus
     *  l'empreinte du document pour vérifier qu'il s'agit bien du même. Absent, la lecture repart
     *  de zéro — ce qui est correct, seulement plus long.
     *
     *  **`null` est accepté, comme pour `recette`.** Un hôte qui n'a rien appris de ce document
     *  l'annonce ainsi, et un contrat strict qui ne l'accepterait pas refuserait toute la charge :
     *  c'est très exactement ce qui a tué 248 travaux à la porte le 30 octobre 2026, sans qu'une
     *  page soit lue. Le refus n'aurait pas protégé la lecture, il l'aurait empêchée. */
    acquis: AcquisDeLecture.nullable().optional(),
    /** Ce que l'hôte sait d'une vérification humaine. **Accepté ici, et jeté ici.**
     *
     *  Accepté, parce qu'un hôte qui tait ce qu'il sait est pire qu'un champ inutile, et parce
     *  qu'un contrat strict qui l'ignore refuse toute la charge. Jeté, parce qu'une vérification
     *  enregistrée porte sur les liens que quelqu'un a vus, jamais sur une lecture neuve : le
     *  30 octobre 2026, le transmettre a publié quarante liens sur le document témoin au lieu de
     *  s'abstenir. Le jour où un œil humain confirmera des liens un par un, c'est
     *  `appariements[].statut` qui le portera.
     *
     *  Il est retiré **au contrat**, et non plus loin : ainsi rien en aval ne peut le recevoir,
     *  et personne n'a à se souvenir de ne pas le passer. */
    verifieParUnHumain: z.boolean().optional(),
    description: z.string().min(1),
    /** Racine du cache de travail. L'exécutant y prend ses coins ; l'hôte n'a qu'à dire où. */
    cache: z.string().min(1).optional(),
    images: z.string().min(1).optional(),
    adresseImages: z.string().min(1).optional(),
    adresseMedias: z.string().min(1).optional(),
    /** Adresse du service de relecture ciblée. Absente, la chaîne est la même, elle ne relit rien. */
    relecture: z.url().optional(),
    /** Ce que la relecture des cases de table a droit de dépenser, en euros, pour CE document.
     *
     *  **La seconde voie n'a pas de manière de lire, donc pas de plafond à en tirer** — la voie
     *  recette tient le sien de `recette.vision.cout_max_eur`. Sans ce champ, la porte applique
     *  {@link PLAFOND_DES_CASES_PAR_DEFAUT_EUR}, qui borne les dégâts plutôt que de laisser la
     *  dépense libre. Un hôte qui sait ce qu'il veut dépenser le dit ici. */
    coutMaxEur: z.number().positive().optional(),
    /** N'en lire que quelques pages, pour essayer une manière de lire sans tout relire. */
    pages: z.number().int().positive().optional(),
    /** Rang de la première page lue : les dix premières d'un document n'ont souvent rien à lire. */
    depuis: z.number().int().nonnegative().optional(),
  })
  .strict()
  .transform(({ verifieParUnHumain: _jete, ...reste }) => reste);
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
export type OptionsExecution = {
  readonly emettre?: Emission;
  /** Ce qui porte une relecture jusqu'au modèle. **Un port, pour que la porte s'éprouve.**
   *
   *  Absent — le cas de l'application —, il est construit depuis l'adresse que l'hôte donne et
   *  le jeton du trousseau, lu dans ce processus et jamais transporté. Fourni, c'est lui qui
   *  part : un contrôle met une fonction, aucun réseau n'est touché et aucun jeton n'est lu.
   *  C'est la seule façon d'éprouver **par la porte** ce que la porte branche — et le garde-fou
   *  de `packages/banc` le dit : une épreuve qui appelle la fonction prouve la fonction. */
  readonly transport?: Transport | undefined;
};

export async function executerTravail(brut: unknown, options: OptionsExecution = {}): Promise<MessageVersHote> {
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
      dire("Aucun jeton dans l'environnement ni dans le trousseau : validations distantes inactives.", "avertissement");

    // Ce qui porte une relecture : le port du contrôle s'il y en a un, sinon l'appel au Worker.
    // L'hôte doit avoir demandé une relecture dans les deux cas — sans adresse, il n'en veut pas.
    const transport: Transport | undefined =
      charge.relecture === undefined
        ? undefined
        : (options.transport ?? (jeton === undefined ? undefined : transportVersWorker(charge.relecture, jeton)));

    // ── La relecture des cases de table, deux étages (A2, exigence 0) ─────────────────────
    //
    // **L'ordre est une affaire d'argent, et c'est pourquoi il se décide ici.** La reconnaissance
    // locale d'abord : quatre façons de regarder la même case, rien de rendu sans l'accord de
    // deux d'entre elles. Mesuré le 6 novembre 2026 sur vingt-deux cases réelles — trois valeurs
    // retenues, zéro contradiction, dix-neuf abstentions. **Ce sont ces dix-neuf, et elles
    // seules, qu'un appel en ligne mérite** : sur les autres, il paierait ce qui est déjà acquis.
    //
    // Les pixels, eux, appartiennent à la voie : elle passe de quoi voir, on rend de quoi lire.
    const bacDesCases = transport === undefined ? undefined : mkdtempSync(join(tmpdir(), "lienotheque-cases-"));
    const lireUnMorceau = bacDesCases === undefined ? undefined : lecteurDeMorceauChiffre(bacDesCases);
    // L'intervalle que le vivier autorise, et il vient du **document** : de 1 au nombre
    // d'enregistrements que l'hôte a inventoriés (REC-05). Un nombre qui le déborde ne désigne
    // rien, et sera refusé par l'interprète plutôt que discuté.
    const combienDEnregistrements = charge.inventaireMedias?.length;
    /** Ce que la relecture a coûté, dit après coup. Vide tant qu'aucun étage n'a été composé. */
    let etatDeLaRelecture: (() => string) | undefined;
    const relectureDesCases =
      transport === undefined || lireUnMorceau === undefined
        ? undefined
        : (imageDeLaPage: (page: number) => ImageGrise | undefined) => {
            const surPlace = relecteurSurPlace(imageDeLaPage, lireUnMorceau);
            const distant = relecteurParVision({
              transport,
              imageDeLaPage,
              plafondEnEuros: charge.coutMaxEur ?? PLAFOND_DES_CASES_PAR_DEFAUT_EUR,
              ...(combienDEnregistrements === undefined || combienDEnregistrements === 0
                ? {}
                : { attendu: { min: 1, max: combienDEnregistrements } }),
              ...(charge.cache === undefined ? {} : { cache: cacheDansDossier(sousDossier(charge.cache, "vision-cases")) }),
            });
            const chaine = relecteurEnChaine([
              { nom: "sur place", relire: surPlace.relire },
              { nom: "regard distant", relire: distant.relire },
            ]);
            // Ce que chaque étage a coûté part au journal, et de là à l'écran de traitement :
            // une dépense qu'on ne voit pas est une dépense qu'on ne surveille pas.
            etatDeLaRelecture = () => {
              const parEtage = chaine
                .releve()
                .map((etage) => `${etage.nom} ${etage.demandes}/${etage.rendus}/${etage.pannes}`)
                .join(" · ");
              const vision = distant.releve();
              return (
                `relecture des cases, par étage (demandé/rendu/panne) : ${parEtage} ; ` +
                `regard distant : ${vision.appels} appel(s), ${vision.depuisLeCache} depuis le cache, ` +
                `${vision.illisibles} relue(s) sans rien de lisible, ` +
                `${vision.refusees} refusée(s) hors vivier, ${vision.cout.toFixed(4)} €` +
                `${vision.plafondAtteint ? " — plafond de dépense atteint" : ""}`
              );
            };
            return {
              relire: chaine.relire,
              // **Les pannes que la chaîne a avalées.** Elle compte et passe la main, ce qui est
              // ce qu'il faut faire d'une coupure au milieu d'un document de cent pages — mais
              // alors rien ne lève, et la voie ne peut rien voir par elle-même. Sans cette ligne,
              // le relevé porté à Vérifier dit « aucune panne » quoi qu'il arrive : mesuré le
              // 12 novembre 2026, 40 pannes à l'étage distant et 0 à l'écran.
              pannes: () => chaine.releve().reduce((total, etage) => total + etage.pannes, 0),
            };
          };

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
      ...(charge.inventaireMedias === undefined ? {} : { inventaireMedias: charge.inventaireMedias }),
      ...(charge.provenancesMedias === undefined ? {} : { provenancesMedias: charge.provenancesMedias }),
      ...(charge.recette == null ? {} : { recette: charge.recette }),
      ...(charge.acquis == null ? {} : { acquis: charge.acquis }),
      description: charge.description,
      ...(charge.cache === undefined ? {} : { cache: sousDossier(charge.cache, "lectures") }),
      ...(charge.images === undefined ? {} : { images: charge.images }),
      ...(charge.adresseImages === undefined ? {} : { adresseImages: charge.adresseImages }),
      ...(charge.adresseMedias === undefined ? {} : { adresseMedias: charge.adresseMedias }),
      ...(charge.pages === undefined ? {} : { pages: charge.pages }),
      ...(charge.depuis === undefined ? {} : { depuis: charge.depuis }),
      ...(relectureDesCases === undefined ? {} : { relectureDesCases }),
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
            validationStructurelle: validationStructurelleCiblee(
              transportValidationCiblesVersWorker(charge.relecture, jeton),
              charge.cache === undefined ? {} : { cache: sousDossier(charge.cache, "vision-structurelle") },
            ),
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
    if (etatDeLaRelecture !== undefined) dire(etatDeLaRelecture());
    if (bacDesCases !== undefined) rmSync(bacDesCases, { recursive: true, force: true });
    dire(`${traite.vue.pages.length} pages, ${traite.vue.aVerifier} cas à vérifier`);
    emettre?.({ type: "progression", protocole: VERSION_PROTOCOLE, travailId: demande.travailId, progression: 1 });

    return Resultat.parse({ type: "resultat", protocole: VERSION_PROTOCOLE, travailId: demande.travailId, charge: traite });
  } catch (cause) {
    // Reprenable : ce qui a déjà été lu l'est pour de bon, et une relance repartira de là.
    //
    // **Sauf un format que la chaîne ne sait pas lire.** Celui-là ne se lira pas davantage au
    // deuxième essai : l'annoncer reprenable fait payer trois tentatives pour obtenir, par
    // épuisement des essais, un échec définitif que le premier avait déjà établi. Mesuré le
    // 1er novembre 2026 sur le dépôt réel d'un `.txt` : trois tentatives, soixante-cinq secondes,
    // et deux relances dont personne n'attendait rien. Le constat vaut mieux que l'épuisement.
    const texte = causeLisible(cause);
    dire(texte, "erreur");
    return echec(demande.travailId, texte, !(cause instanceof FormatNonLu));
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
    const exporte = await exporterPages(charge.document, charge.images, {
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
        pages: exporte.pages.map((page) => ({
          rang: page.index,
          image: `${adresse}/${page.fichier}`,
          fichier: page.fichier,
          largeur: page.largeur,
          hauteur: page.hauteur,
        })),
        // Les refus voyagent avec les pages : sans eux, un document dont rien ne sort est
        // indiscernable d'un document qu'on n'a pas encore traité, et l'écran fait attendre
        // pour rien quelqu'un qui n'a rien à attendre.
        refusees: exporte.refusees.map((refus) => ({ rang: refus.index, cause: refus.cause })),
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
