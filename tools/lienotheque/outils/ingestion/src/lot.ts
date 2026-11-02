import { readFile } from "node:fs/promises";
import { ErreurExportPagesVide, exporterPages } from "./pages-images.js";
import {
  type AcquisDeLecture,
  DescriptionBibliotheque,
  type Passage,
  type ResultatRecette,
  VueBibliotheque,
} from "@lienotheque/contrats";
import {
  chargerRecette,
  rejouer,
  type Rejeu,
  type Association,
  type Media,
  type MediaInventorie,
  type Relecture,
  type ValidationStructurelle,
} from "@lienotheque/recettes";
import { type AdresseRecurrente, adressesRecurrentes, enPassages, langueOcr } from "@lienotheque/lecteur-texte";
import { construireVue } from "./instantane.js";
import { lireLeTexte } from "./texte.js";
import { rejouerParOracle, SEUIL_SANS_MANIERE_DE_LIRE, type RejeuParOracle } from "./voie-oracle.js";
import { causeLisible } from "@lienotheque/noyau";

/** D'un lot réel à l'instantané que lisent les écrans (correction 8).
 *
 *  La lecture passe par le flux du banc : une page à la fois, et ce qui s'accumule tient en
 *  numéros et en positions. Un livre de cinq cents pages ne demande pas plus de mémoire qu'un de
 *  trente — c'est la condition pour traiter un dépôt réel sur une machine ordinaire.
 *
 *  Rien de ce qui est produit ici n'entre au dépôt : l'instantané va au cache de travail, et le
 *  document comme les médias restent où ils sont. */

/** Lit la description d'une bibliothèque, validée par son contrat.
 *
 *  Elle était lue ici par un analyseur écrit à la main, qui prenait `String(...)` de ce qu'il
 *  trouvait : un identifiant absent devenait « undefined », un nom vide passait. Le contrat
 *  refuse les deux, et au bon endroit — à la lecture, pas trois écrans plus loin. */
export function lireDescription(brut: unknown): DescriptionBibliotheque {
  return DescriptionBibliotheque.parse(brut);
}

export type Lot = {
  /** Document numérisé du lot. */
  readonly pdf: string;
  /** Dossier des médias, pris récursivement. */
  readonly medias: string;
  /** Inventaire de l'hôte, quand les sources sont rangées par empreinte. */
  readonly inventaireMedias?: readonly MediaInventorie[] | undefined;
  /** Groupes de dépôt du document, qui bornent son vivier. */
  readonly provenancesMedias?: readonly string[] | undefined;
  /** Manière de lire qui dit comment lire ce document.
   *
   *  **Absente, la chaîne prend la seconde voie** : elle cherche elle-même une régularité dans les
   *  pages plutôt que de se faire dire où regarder. C'est ce qui permet à un document qu'aucune
   *  manière de lire ne couvre de rendre quelque chose — un lien prouvé, ou une abstention qui
   *  dit pourquoi — au lieu de rester en pause indéfiniment. Sur la base réelle, 248 documents
   *  sur 250 sont dans ce cas. */
  readonly recette?: string | undefined;
  /** Ce qu'une lecture antérieure de ce document a appris, quand l'hôte en garde un.
   *
   *  Il n'a de sens que pour la seconde voie : une manière de lire écrite à la main sait déjà où
   *  regarder, et n'a rien à retrouver. La voie générique, elle, cherche — et sans mémoire elle
   *  recherche chaque fois ce qu'elle a déjà trouvé. */
  readonly acquis?: AcquisDeLecture | undefined;
  readonly description: string;
  /** Dossier où garder les lectures, pour ne pas repayer l'OCR. */
  readonly cache?: string | undefined;
  /** Dossier où écrire les images de page. Absent, l'instantané n'en porte aucune. */
  readonly images?: string | undefined;
  /** Adresse à laquelle ces images seront servies. */
  readonly adresseImages?: string | undefined;
  /** Adresse à laquelle les médias seront servis. Absente, l'instantané n'en porte aucune, et
   *  les écrans disent « média non disponible ici » plutôt que de faire semblant (ANC-05). */
  readonly adresseMedias?: string | undefined;
  /** De quoi relire les repères difficiles, quand la recette en déclare une. Passée telle quelle
   *  à la chaîne : l'instantané des écrans vient du même traitement que la mesure. */
  readonly relecture?: Relecture | undefined;
  /** Validation des rares ruptures structurelles corroborées par les noms de médias. */
  readonly validationStructurelle?: ValidationStructurelle | undefined;
  /** Appelé après chaque cliché lu, pour dire où en est le traitement (JOB-03). */
  readonly avancement?: ((faits: number, total: number) => void) | undefined;
  /** Combien de pages le document porte, dit une fois avant la première lecture. Sans lui, un
   *  document dont la chaîne ne lit aucune page ne se distingue pas d'un document vide. */
  readonly surTotal?: ((total: number) => void) | undefined;
  /** Dans quelle phase la chaîne se trouve, dit au fil de l'eau (JOB-07).
   *
   *  Un traitement qui s'arrête sans rien dire laisse chercher partout. Une journée a été
   *  perdue à deviner si un moteur devenu muet était mort dans la lecture des repères, dans
   *  l'export des images ou dans la lecture du texte : le journal portait « 29 pages dans le
   *  document » puis rien, et les trois phases suivantes étaient indistinguables. */
  readonly surPhase?: ((phase: string) => void) | undefined;
  /** N'en lire que les premières pages. C'est ce que demande l'essai d'une manière de lire :
   *  dix pages suffisent pour voir si elle tient, et trois cents feraient attendre pour rien. */
  readonly pages?: number | undefined;
  /** Rang de la première page lue. Essayer une manière de lire sur dix pages du milieu demande
   *  de dire lesquelles : les dix premières d'un document n'ont souvent rien à lire. */
  readonly depuis?: number | undefined;
};

/** Quel numéro imprimé porte chaque rang du document, d'après l'interprète.
 *
 *  On ne refait pas la numérotation ici : l'interprète l'a déjà établie, et il corrige ce qu'une
 *  page seule ne peut pas corriger — un numéro mal lu, un décalage qui change au milieu du livre
 *  parce que le scan saute deux pages. Deux numérotations pour un même document finiraient par
 *  diverger, et c'est l'image d'une autre page qu'on afficherait.
 *
 *  Le lien se fait par les éléments : une page porte des numéros d'élément, et l'interprète dit
 *  sur quelle page imprimée chacun tombe. */
/** Le décalage entre le rang **interne** d'une page et celui qu'on montre.
 *
 *  Deux conventions coexistent dans le projet, et ce n'est pas une coquette : la chaîne d'images
 *  compte ses pages **à partir de zéro** (`PageReperee.index`, et les fichiers `page-0000.webp`),
 *  tandis que le texte compte **à partir de un** (`Passage.page`). La vue est faite pour une
 *  personne et cite ses pages : elle s'aligne donc sur le texte, et la conversion se fait ici,
 *  une seule fois, plutôt que d'être refaite — ou oubliée — à chaque écran.
 *
 *  Sans elle, la vue et les passages d'un même document se décalent d'une page, et toute
 *  citation tombe à côté. */
const PREMIER_RANG = 1;

export function numerosImprimes(
  lues: readonly { index: number; elements: readonly { numero: number }[] }[],
  lignes: readonly { numero: number; pageImprimee: number }[],
): Map<number, number> {
  const pageDeLElement = new Map(lignes.map((ligne) => [ligne.numero, ligne.pageImprimee]));
  const parIndex = new Map<number, number>();

  for (const page of lues) {
    const votes = new Map<number, number>();
    for (const element of page.elements) {
      const imprimee = pageDeLElement.get(element.numero);
      if (imprimee !== undefined) votes.set(imprimee, (votes.get(imprimee) ?? 0) + 1);
    }
    let retenue: number | undefined;
    let meilleur = 0;
    for (const [imprimee, nombre] of votes) if (nombre > meilleur) [retenue, meilleur] = [imprimee, nombre];
    if (retenue !== undefined) parIndex.set(page.index, retenue);
  }
  return parIndex;
}

/** Ce qu'un lot traité a produit : la vue que les écrans liront, et ce dont elle est tirée.
 *
 *  La vue ne suffit pas à tout : elle est faite pour être lue, et le banc note des lignes. Rendre
 *  les deux n'est pas calculer deux fois le même fait — la vue est tirée du résultat, ici et une
 *  seule fois. C'est l'appelant qui choisit ce dont il a besoin. */
export type LotTraite = {
  readonly vue: VueBibliotheque;
  readonly resultat: ResultatRecette;
  readonly association: Association;
  readonly medias: readonly Media[];
  /** Le texte cherchable du document, un passage par page (RCH-07).
   *
   *  Produit par la même passe que le reste : un instantané doit venir du même traitement que la
   *  mesure, sans quoi ce qu'on mesure n'est pas ce qu'on montre. */
  readonly passages: readonly Passage[];
  /** D'où le texte est venu, page par page. Dit, et non tu : c'est ce qui permet d'annoncer
   *  « aucune des 991 pages n'a pu être lue » plutôt qu'un succès sur un résultat vide. */
  readonly lecture: { readonly parLaCouche: number; readonly parOcr: number; readonly sansTexte: number };
  /** Les adresses qui reviennent sur assez de pages pour être des tampons de numérisation.
   *
   *  Signalées, jamais retirées : retirer du texte changerait l'extrait exact que RCH-07 promet,
   *  et un pied de page portant l'adresse de l'auteur est un tampon qu'on veut peut-être garder
   *  (FMT-04). */
  readonly filigranes: readonly AdresseRecurrente[];
  /** Ce que cette lecture a appris du document, quand il y a quelque chose à retenir.
   *
   *  Rendu à l'hôte, qui le rangera avec la version : c'est lui qui a le document et son
   *  empreinte, et c'est donc lui qui peut le rendre à la lecture suivante. */
  readonly acquis?: AcquisDeLecture | undefined;
};

/** Ce que la lecture a appris, quand elle en est capable.
 *
 *  Seule la voie générique apprend quelque chose : une manière de lire écrite à la main sait
 *  d'avance où regarder, et n'a donc rien à retrouver. Les deux voies rendant la même forme à un
 *  champ près, c'est ce champ qui les distingue — et le distinguer ici évite que tout ce qui suit
 *  ait à savoir laquelle a tourné. */
const acquisRendu = (issu: Rejeu | RejeuParOracle): AcquisDeLecture | undefined =>
  "acquis" in issu ? issu.acquis : undefined;

/** Traite un lot et rend l'instantané que les écrans liront. */
export async function instantaneDeLot(lot: Lot): Promise<LotTraite> {
  const description = lireDescription(JSON.parse(await readFile(lot.description, "utf8")));
  const recette =
    lot.recette === undefined ? undefined : chargerRecette(JSON.parse(await readFile(lot.recette, "utf8")));

  // Le texte se lit avant toute manière de relier. Il sert à la recherche, mais aussi au second
  // signal de la voie générique : le relire dans l'oracle réocérisait les mêmes pages une seconde
  // fois. Une seule lecture produit désormais les passages et nourrit la confrontation.
  lot.surPhase?.("lecture du texte");

  // La langue de la reconnaissance vient de la **bibliothèque**, qui la déclare déjà :
  // `SchemaBibliotheque.langue` est obligatoire au contrat. Une langue inconnue se dit au lieu
  // d'être remplacée en silence.
  const langue = langueOcr(description.schema.langue);
  if (langue === undefined)
    lot.surPhase?.(
      `langue « ${description.schema.langue} » inconnue de la reconnaissance : elle lira avec son modèle par défaut`,
    );

  // La double page seulement si la manière de lire l'a déclarée. Sans déclaration, le document
  // répond lui-même ; c'est le comportement éprouvé par la porte réelle.
  const lu = await lireLeTexte(lot.pdf, {
    ...(recette?.preparation.double_page === undefined ? {} : { doublePage: recette.preparation.double_page }),
    ...(langue === undefined ? {} : { langue }),
    ...(lot.pages === undefined ? {} : { pages: lot.pages }),
    ...(lot.surPhase === undefined ? {} : { surAvertissement: lot.surPhase }),
  });
  const passages = enPassages(lu.pages);
  lot.surPhase?.(`texte lu : ${passages.length} passage(s)`);

  // La chaîne, et rien d'autre. Elle réimplémentait ici lecture, interprétation et association —
  // un second chemin de code qui avait déjà divergé : l'inventaire des supports présents, ajouté à
  // la chaîne, n'arrivait jamais aux écrans. Un instantané doit venir du même traitement que la
  // mesure, sans quoi ce qu'on mesure n'est pas ce qu'on montre.
  // Sans manière de lire, la seconde voie : elle cherche la régularité elle-même. Les deux
  // rendent la même forme — c'est ce qui permet à tout ce qui suit de ne pas savoir laquelle a
  // tourné, et aux écrans de n'avoir rien à apprendre.
  const issu =
    recette === undefined
      ? await rejouerParOracle(lot.pdf, lot.medias, {
          ...(lot.inventaireMedias === undefined ? {} : { inventaireMedias: lot.inventaireMedias }),
          ...(lot.provenancesMedias === undefined ? {} : { provenancesMedias: lot.provenancesMedias }),
          ...(lot.avancement === undefined ? {} : { avancement: lot.avancement }),
          ...(lot.surPhase === undefined ? {} : { surPhase: lot.surPhase }),
          ...(lot.pages === undefined ? {} : { pages: lot.pages }),
          ...(lot.acquis === undefined ? {} : { acquis: lot.acquis }),
          doublePage: lu.doublePage,
          foliosEtablis: lu.foliosEtablis,
          texteDesPages: lu.pages.map((page) => ({
            page: page.index,
            ...(page.pageImprimee === undefined ? {} : { pageImprimee: page.pageImprimee }),
            texte: page.texte,
          })),
        })
      : await rejouer(lot.pdf, lot.medias, recette, {
          ...(lot.inventaireMedias === undefined ? {} : { inventaireMedias: lot.inventaireMedias }),
          ...(lot.provenancesMedias === undefined ? {} : { provenancesMedias: lot.provenancesMedias }),
          ...(lot.cache === undefined ? {} : { cache: lot.cache }),
          ...(lot.relecture === undefined ? {} : { relecture: lot.relecture }),
          ...(lot.validationStructurelle === undefined ? {} : { validationStructurelle: lot.validationStructurelle }),
          ...(lot.avancement === undefined ? {} : { avancement: lot.avancement }),
          ...(lot.surTotal === undefined ? {} : { surTotal: lot.surTotal }),
          ...(lot.pages === undefined ? {} : { pages: lot.pages }),
          ...(lot.depuis === undefined ? {} : { depuis: lot.depuis }),
        });
  const { resultat, association, medias } = issu;
  const acquis = acquisRendu(issu);

  lot.surPhase?.(`repères lus : ${resultat.pages.length} page(s), ${resultat.lignes.length} élément(s)`);
  if (association.abstention !== undefined)
    lot.surPhase?.(
      association.abstention.pourquoi ??
        `association abandonnée : ${association.abstention.combien} média(s) présent(s), aucun interprété par cette manière de lire`,
    );

  // Les images, une par une, écrites au passage. Le numéro imprimé d'une page n'est pas son rang
  // dans le document : c'est le décalage lu qui fait le lien entre les deux.
  const imprimes = numerosImprimes(resultat.pages, resultat.lignes);
  // Les images se rangent par **rang de page**, qu'on connaît toujours.
  //
  // Elles l'étaient par numéro imprimé, et toute page qui n'en avait pas tombait sous une même
  // clé de repli : elles s'y écrasaient l'une l'autre, et la survivante était ensuite rejetée
  // par le contrat. Mesuré sur un ouvrage de quatre-vingt-seize pages — quatorze images écrites
  // sur le disque, une seule dans la table, zéro dans la vue.
  const parRang = new Map<number, { image: string; largeur: number; hauteur: number; vignette?: string }>();
  if (lot.images !== undefined) {
    const adresse = lot.adresseImages ?? "/donnees/pages";
    try {
      for (const page of (await exporterPages(lot.pdf, lot.images, { doublePage: lu.doublePage })).pages)
        parRang.set(page.index + PREMIER_RANG, {
          image: `${adresse}/${page.fichier}`,
          largeur: page.largeur,
          hauteur: page.hauteur,
          ...(page.vignette === undefined ? {} : { vignette: `${adresse}/${page.vignette}` }),
        });
    } catch (cause) {
      if (cause instanceof ErreurExportPagesVide) throw cause;
      // Une image et sa vignette sont des dérivés : leur absence ne retire jamais le texte du
      // document. C'était pourtant ce qui arrivait au réimport réel — 242 368 mots déjà présents
      // dans la couche disparaissaient parce qu'un codec de vignette refusait une page.
      lot.surPhase?.(`images de pages non produites : ${causeLisible(cause)} ; lecture du texte maintenue`);
    }
  }

  lot.surPhase?.(`images de pages : ${parRang.size} écrite(s)`);

  // Les recettes de méthodes savent relever des repères métier ; un livre ordinaire n'en porte
  // souvent aucun. Ses pages existent pourtant : l'export d'images les a rendues, et la lecture
  // de texte les a parcourues. Limiter la vue à `resultat.pages` produisait donc des centaines de
  // dérivés inatteignables et rabattait à tort un PDF natif vers le lecteur de texte seul.
  const pagesParRang = new Map<number, { index: number; numero?: number }>();
  for (const page of resultat.pages) {
    const index = page.index + PREMIER_RANG;
    const numero = imprimes.get(page.index);
    pagesParRang.set(index, { index, ...(numero === undefined ? {} : { numero }) });
  }
  for (const rang of parRang.keys())
    if (!pagesParRang.has(rang)) pagesParRang.set(rang, { index: rang });
  for (const page of lu.pages)
    if (!pagesParRang.has(page.index)) pagesParRang.set(page.index, { index: page.index });

  const vue = construireVue({
    id: description.id,
    nom: description.nom,
    schema: description.schema,
    mots: description.mots,
    lignes: resultat.lignes,
    pagesAbsentes: resultat.pagesAbsentes,
    association,
    medias,
    // Le seuil vient de la recette, qui l'a fixé en même temps que ses règles de lecture. Le
    // redéclarer ailleurs, c'est se donner deux seuils et finir par en oublier un.
    // Sans manière de lire, le seuil est celui que la seconde voie a réellement fait franchir
    // à chaque lecture : se donner un autre chiffre ici reviendrait à juger sur une barre que
    // personne n'a eu à passer.
    seuil: recette?.validation.seuil_confiance ?? SEUIL_SANS_MANIERE_DE_LIRE,
    pages: [...pagesParRang.values()].sort((a, b) => a.index - b.index),
    imageDePage: (rang) => parRang.get(rang),
    // L'emplacement se résout à la lecture, pas à l'ingestion : la carte ne dit pas où le
    // fichier habite, elle dit lequel c'est (ANC-05).
    sourceDuMedia: (media) =>
      lot.adresseMedias === undefined || media.nom === undefined ? undefined : `${lot.adresseMedias}/${encodeURIComponent(media.nom)}`,
  });
  lot.surPhase?.("vue assemblée");

  return {
    vue,
    resultat,
    association,
    medias,
    passages,
    lecture: { parLaCouche: lu.parLaCouche, parOcr: lu.parOcr, sansTexte: lu.sansTexte },
    filigranes: adressesRecurrentes(passages),
    ...(acquis === undefined ? {} : { acquis }),
  };
}
