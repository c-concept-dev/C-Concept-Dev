import { z } from "zod";
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import {
  PageLueBrute,
  ReglagesRedressement,
  ResultatRecette,
  type CotePage,
  type Recette,
  type Rotation,
  type ZoneRelative,
} from "@lienotheque/contrats";
import { noterLesQuatreSens, orientationDuLot, redresser, type OptionsRedressement, type RotationTrouvee } from "@lienotheque/redresseur";
import { objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";
import { decoderJpeg, enGris, type ImageGrise } from "@lienotheque/images";
import { lireNomMedia, qualifierAssociation, type Association, type Media } from "./associateur.js";
import { interpreter, type LectureParVision, type PageLue, type SupportsPresents, supportsPresents } from "./interprete.js";
import { lireCoucheTexte, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { texteDePage } from "@lienotheque/contrats";
import { VERSION_LECTURE, consolider, lecturesDePage, lireNumeroPage, type OptionsReperes } from "./reperes.js";

/** Banc d'essai (OUT-15) : rejoue les fixtures après chaque changement d'outil ou de recette.
 *
 *  Il ne juge pas — il produit, et c'est la comparaison à la référence qui juge. Deux lots
 *  rejoués différemment ne se comparent pas : le banc fixe donc l'ordre des pages et celui des
 *  médias, et ne laisse rien au hasard. */

/** Cache de lecture : un lot déjà lu ne se relit pas.
 *
 *  Lire trois cents pages prend un quart d'heure. Rejouer un lot pour éprouver un réglage de
 *  l'interpréteur ne doit pas le repayer : la lecture dépend du document et de la recette, pas de
 *  ce qu'on en fait ensuite. La clef les désigne tous les deux — et la date du fichier, pour
 *  qu'un document remplacé soit relu.
 *
 *  Et la version de la lecture : sans elle, un lecteur qui apprend à rapporter quelque chose de
 *  neuf se fait resservir des lectures qui l'ignorent, sans que rien ne le signale. */
export function clefDeLecture(chemin: string, recette: Recette, limite?: number): string {
  const etat = statSync(chemin, { throwIfNoEntry: false });
  return createHash("sha256")
    .update(chemin)
    .update(String(etat?.size ?? 0))
    .update(String(etat?.mtimeMs ?? 0))
    .update(`${recette.id}@${recette.version}`)
    .update(String(limite ?? "tout"))
    .update(`lecture@${VERSION_LECTURE}`)
    .digest("hex")
    .slice(0, 32);
}

/** Une relecture ciblée branchée sur la chaîne (OUT-08).
 *
 *  Un port, pas un appel : la relecture vit dans un paquet qui dépend de celui-ci, et c'est donc
 *  l'appelant qui la branche. Une chaîne sans relecture est la même chaîne — c'est tout l'intérêt
 *  d'un port, et c'est ce qui permet à l'application et au banc d'essai de parcourir le même
 *  chemin de code. */
export type Relecture = (contexte: {
  readonly chemin: string;
  readonly recette: Recette;
  readonly lues: readonly PageLue[];
  readonly nombreDePistes: number;
  readonly supports: SupportsPresents;
  readonly options: OptionsBanc;
}) => Promise<ReadonlyMap<string, LectureParVision>>;

export type OptionsBanc = OptionsReperes & {
  /** Médias déjà inventoriés par l'hôte. Leur nom d'origine sert à lire leur rang ; leur
   *  empreinte évite de relire chaque gros fichier uniquement pour la recalculer. */
  readonly inventaireMedias?: readonly MediaInventorie[];
  /** Appelé après chaque cliché lu, pour que l'appelant dise où il en est (JOB-03).
   *
   *  Après la lecture, pas après le décodage : c'est la lecture qui coûte, et annoncer cent pour
   *  cent pendant que les dernières pages passent encore à l'OCR serait un mensonge poli. Un lot
   *  servi par le cache ne passe pas par ici — il n'y a rien à suivre. */
  readonly avancement?: (faits: number, total: number) => void;
  /** Combien de pages logiques la recette livrera, dit une fois, **avant** la première lecture.
   *
   *  `avancement` ne parle qu'après une page lue : un document dont aucune page n'est lisible par
   *  la chaîne n'émettait donc aucun nombre, et un résultat vide ne se distinguait pas d'un
   *  document vide. C'est ainsi qu'un ouvrage de neuf cent quatre-vingt-onze pages a été annoncé
   *  « terminé » avec zéro page. Pour une recette de doubles pages, ce total vaut deux fois le
   *  nombre de feuilles du PDF : l'unité annoncée reste ainsi la même que l'unité parcourue. */
  readonly surTotal?: (total: number) => void;
  /** Rang de la première page lue, à partir de zéro. Avec `pages`, cela fait une tranche : ce
   *  qu'il faut pour essayer une manière de lire là où le document a quelque chose à lire. */
  readonly depuis?: number;
  /** De quoi relire les repères difficiles. Absente, la chaîne ne relit rien et ne change pas. */
  readonly relecture?: Relecture;
  /** Identifiants que le repli structurel a réellement localisés. Ils ne deviennent des
   * éléments que si un média unique et indépendant porte exactement le même identifiant. */
  readonly ciblesValidees?: readonly CibleStructurelleValidee[];
  /** Dossier où garder les lectures. Absent, rien n'est gardé. */
  readonly cache?: string | undefined;
  /** Rend les pages redressées et coupées, mais sans binarisation.
   *
   *  La lecture veut du noir et blanc : un moteur d'OCR y lit mieux. Une relecture ciblée veut
   *  l'inverse — un chiffre que le seuil a mangé ne se retrouve pas dans ce qu'il en reste, et
   *  envoyer une image déjà dégradée, c'est perdre ce qu'on venait chercher (OUT-08).
   *  La géométrie ne bouge pas : même rotation, même coupe, mêmes coordonnées. */
  readonly sansBinarisation?: boolean;
  /** Ne traiter que les premières pages : pour un essai rapide pendant la mise au point. */
  readonly pages?: number;
  readonly redressement?: OptionsRedressement;
};

export type CibleStructurelleValidee = {
  readonly numero: number;
  readonly numeroLu: string;
  /** Numéro physique du PDF, à partir de 1. */
  readonly pagePdf: number;
  readonly zone: ZoneRelative;
  readonly confiance: number;
};

/** Intègre les seules lectures de repli prouvées par deux sources indépendantes : la cible
 * visible sur la page et un média unique qui porte le même identifiant. Rien n'est ajouté si la
 * page, le média ou la confiance manque. Le cache brut reste intact. */
export function integrerCiblesValidees(
  pages: readonly PageLue[],
  cibles: readonly CibleStructurelleValidee[],
  mediasParElement: ReadonlyMap<number, { readonly piste: number; readonly disque: number }>,
  seuil: number,
): PageLue[] {
  const deja = new Set(pages.flatMap((page) => page.elements.map((element) => element.numero)));
  const parPage = new Map<number, CibleStructurelleValidee[]>();
  for (const cible of cibles) {
    if (cible.confiance < seuil || deja.has(cible.numero) || !mediasParElement.has(cible.numero)) continue;
    const index = cible.pagePdf - 1;
    if (!pages.some((page) => page.index === index)) continue;
    parPage.set(index, [...(parPage.get(index) ?? []), cible]);
    deja.add(cible.numero);
  }
  return pages.map((page) => {
    const ajouts = parPage.get(page.index) ?? [];
    if (ajouts.length === 0) return { ...page, elements: [...page.elements] };
    const elements = [
      ...page.elements,
      ...ajouts.map((cible) => ({
        y: Math.min(1, cible.zone.y + cible.zone.h / 2),
        zone: cible.zone,
        numero: cible.numero,
        numeroLu: cible.numeroLu,
        presencePiste: 0,
        suite: false,
        accordNumero: cible.confiance,
        accordPiste: 0,
      })),
    ].sort((a, b) => a.y - b.y || a.numero - b.numero);
    return { ...page, elements };
  });
}

/** Une cible peut avoir été réellement lue puis écartée par la remise en suite, précisément parce
 * que cette remise en suite préfère perdre un élément plutôt qu'en inventer un. Deux preuves
 * indépendantes lèvent alors le doute : localisation exacte par Vision et média unique du même
 * identifiant. Ce complément ne dérive aucune piste et ne s'applique jamais à une cible absente. */
export function completerResultatParCiblesValidees(
  resultat: ResultatRecette,
  cibles: readonly CibleStructurelleValidee[],
  mediasParElement: ReadonlyMap<number, { readonly piste: number; readonly disque: number }>,
  seuil: number,
): ResultatRecette {
  const presentes = new Set(resultat.lignes.map((ligne) => ligne.numero));
  const ajouts = cibles.flatMap((cible) => {
    if (cible.confiance < seuil || presentes.has(cible.numero)) return [];
    const media = mediasParElement.get(cible.numero);
    const page = resultat.pages.find((candidate) => candidate.index === cible.pagePdf - 1);
    if (media === undefined || page?.pageImprimee === undefined) return [];
    // Si la lecture locale avait vu l'identifiant mais que la remise en suite l'a écarté, sa
    // boîte mesurée sur les pixels est plus précise que la boîte grossière du repli Vision.
    const zoneLocale = page.elements.find((element) => element.numero === cible.numero)?.zone;
    presentes.add(cible.numero);
    return [
      {
        numero: cible.numero,
        numeroLu: cible.numeroLu,
        pageImprimee: page.pageImprimee,
        piste: media.piste,
        disque: media.disque,
        sourcePiste: "corroboration_media" as const,
        zone: zoneLocale ?? cible.zone,
        confiance: Math.round(cible.confiance * 100) / 100,
      },
    ];
  });
  return ResultatRecette.parse({
    ...resultat,
    lignes: [...resultat.lignes, ...ajouts].sort(
      (a, b) => a.pageImprimee - b.pageImprimee || (a.zone?.y ?? 0) - (b.zone?.y ?? 0) || a.numero - b.numero,
    ),
  });
}

/** Un cliché sur combien, et combien au plus, pour voter l'orientation du lot.
 *
 *  Seize clichés suffisent : l'orientation est une propriété de la séance de photographie, pas
 *  une qualité de chaque page. Les sonder tous coûterait quatre lectures par cliché pour une
 *  réponse qu'on a déjà au seizième. */
const PAS_ECHANTILLON = 8;
const ECHANTILLON_MAX = 16;

/** Vote l'orientation du lot sur un échantillon de ses clichés. */
async function voterOrientation(chemin: string, options: OptionsBanc): Promise<RotationTrouvee | undefined> {
  const notes: (readonly { rotation: Rotation; note: number }[])[] = [];
  let index = -1;
  for await (const image of pagesEnGris(chemin, options.pages)) {
    index += 1;
    if (index % PAS_ECHANTILLON !== 0) continue;
    notes.push(noterLesQuatreSens(image, options.redressement ?? {}));
    if (notes.length >= ECHANTILLON_MAX) break;
  }
  return orientationDuLot(notes);
}

/** Prépare les pages d'un lot selon ce que la recette déclare (OUT-03).
 *
 *  Un document d'une page par image passe tel quel. Un livre photographié en doubles pages est
 *  remis d'aplomb et coupé : chaque cliché donne deux pages, qui savent de quel côté elles
 *  viennent et quel rang elles occupent dans la numérotation imprimée.
 *
 *  En flux, une image à la fois : c'est la seule façon de traiter trois cents pages sans que la
 *  mémoire suive le nombre de pages. Chaque page sort dès qu'elle est prête, et l'image d'où elle
 *  vient n'est plus retenue par personne. */
export async function* preparerLot(chemin: string, recette: Recette, options: OptionsBanc = {}): AsyncGenerator<PageAlire> {
  const preparation = recette.preparation;
  const telle = preparation.double_page !== true && preparation.redressement === "aucun";

  const reglages = telle
    ? undefined
    : ReglagesRedressement.parse({
        rotation: preparation.redressement,
        doublePage: preparation.double_page === true,
        ...(preparation.page_gauche === undefined ? {} : { pageGauche: preparation.page_gauche }),
        effacerVerso: true,
        binarisation: options.sansBinarisation === true ? "aucune" : "adaptative",
      });

  // L'orientation du lot, votée une fois sur un échantillon.
  //
  // Elle vaut pour tous les clichés : un livre est photographié dans un sens. La chercher cliché
  // par cliché, c'est laisser décider les pages muettes — et sur F4 elles se trompaient une fois
  // sur trois, rendant deux pages à l'envers et deux couchées. Une page mal tournée ne donne
  // plus rien à lire : zéro élément là où il y en avait six.
  const rotationDuLot = reglages === undefined || reglages.rotation !== "auto" ? undefined : await voterOrientation(chemin, options);

  // Le rang dans le document, et non dans la tranche : essayer une manière de lire sur dix
  // pages du milieu doit les numéroter comme elles le sont, sinon ce qu'on lit ne se retrouve
  // nulle part.
  let index = options.depuis ?? 0;
  let total = 0;
  // `pagesEnGris` compte les feuilles du PDF. La progression, elle, compte ce que la recette
  // livre réellement au lecteur : deux pages logiques par feuille quand elle déclare une double
  // page. Sans cette conversion, F4 annonçait 143 au départ puis avançait jusqu'à 286, et la
  // barre atteignait donc 100 % à mi-parcours.
  const pagesParFeuille = preparation.double_page === true ? 2 : 1;
  for await (const image of pagesEnGris(
    chemin,
    options.pages,
    (compte) => {
      total = compte * pagesParFeuille;
      options.surTotal?.(total);
    },
    options.depuis ?? 0,
  )) {
    if (reglages === undefined) yield { image, index, total };
    else
      for (const produite of redresser(image, index, reglages, {
        ...(options.redressement ?? {}),
        ...(rotationDuLot === undefined ? {} : { rotationImposee: rotationDuLot.rotation }),
        // Le gris n'est gardé que si quelqu'un en a l'usage : une relecture ciblée déclarée par
        // la recette. Sans cela, une page de plus en mémoire pour personne.
        garderGris: recette.vision !== undefined,
      })) {
        const cote = produite.descripteur.cote;
        yield {
          image: produite.image,
          ...(produite.grise === undefined ? {} : { grise: produite.grise }),
          index,
          total,
          rang: preparation.double_page === true ? index * 2 + (cote === "droite" ? 1 : 0) : index,
          ...(cote === undefined ? {} : { cote }),
        };
      }
    index += 1;
  }
}

/** Pages d'un PDF numérisé, en gris, dans l'ordre du document et à leur résolution d'origine.
 *
 *  Un flux, pas un tableau : le tableau gardait les trois cents pages décodées en mémoire en même
 *  temps — deux mégaoctets et demi la page, et la mémoire croissait avec le document. */
export async function* pagesEnGris(
  chemin: string,
  limite?: number,
  surTotal?: (total: number) => void,
  depuis = 0,
): AsyncGenerator<ImageGrise> {
  const objets = objetsPdf(await readFile(chemin));
  const pages = pagesPdf(objets);
  const retenues = pages.slice(depuis, limite === undefined ? undefined : depuis + limite);

  // Combien de pages il y a, dit une fois, avant la première. C'est ici — et seulement ici —
  // qu'on le sait sans reparser le document, et une file qui annonce un pourcentage et un temps
  // restant ne peut pas s'en passer.
  surTotal?.(retenues.length);

  let renduComplet: Awaited<ReturnType<typeof ouvrirRenduPdf>> | undefined;
  try {
    for (const page of retenues) {
      // Le chemin direct n'est fidèle que pour une page faite d'un unique JPEG. La garde du
      // décodeur refuse avant WebAssembly les flux tronqués ou CMJN ; toute autre composition
      // passe par le rendu PDF complet, comme l'export des pages et la lecture de texte.
      let causeDirecte: unknown;
      if (page.images.length === 1) {
        const octets = octetsImage(objets, page.images[0]!.numero);
        if (octets?.extension === "jpg")
          try {
            yield enGris(await decoderJpeg(octets.octets));
            continue;
          } catch (cause) {
            causeDirecte = cause;
            // La cause exacte remontera seulement si le rendu complet échoue lui aussi. Ici, le
            // repli est précisément la manière de continuer sans perdre la page.
          }
      }

      // Une page native sans aucune image n'a pas de repère photographié à lire. La couche texte
      // suit son propre chemin ; la rasteriser ici ferait payer tout un livre sans rien ajouter.
      if (page.images.length === 0) continue;
      try {
        renduComplet ??= await ouvrirRenduPdf(chemin);
        yield enGris(await renduComplet.page(page.index + 1, 1800));
      } catch (causeRendu) {
        const dire = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));
        throw new Error(
          `Page ${page.index + 1} illisible par rendu complet (${dire(causeRendu)})` +
            (causeDirecte === undefined ? "" : ` après refus du JPEG direct (${dire(causeDirecte)})`),
        );
      }
    }
  } finally {
    await renduComplet?.fermer();
  }
}

/** Lit les repères de chaque page, puis interprète selon la recette. */
export function lireEtInterpreter(pages: readonly ImageGrise[], recette: Recette, options: OptionsBanc = {}): ResultatRecette {
  return interpreter(reperer(pages.map((image, index) => ({ image, index, total: pages.length })), recette, options), recette);
}

/** Une page à lire, avec ce que le redresseur en sait déjà. */
export type PageAlire = {
  readonly image: ImageGrise;
  /** Combien de pages le document en compte, connu dès la première. */
  readonly total: number;
  /** La même page en gris, quand la recette déclare une relecture ciblée : c'est de là que les
   *  recadrages sont pris, et non de la page binarisée que l'OCR préfère. */
  readonly grise?: ImageGrise;
  readonly index: number;
  readonly rang?: number;
  readonly cote?: CotePage;
};

/** Lit les repères de chaque page. Le côté, quand il est connu, dit où est la marge extérieure. */
export function reperer(pages: readonly PageAlire[], recette: Recette, options: OptionsBanc = {}): PageLue[] {
  // Où la recette dit de lire le numéro de page. Une zone tracée vaut comme un bord : c'est la
  // recette qui décide d'où il se lit, et non le lecteur qui suppose les coins.
  const ouLirePage = recette.lectures.find((lecture) => lecture.ancre === "page_imprimee")?.zone;
  return pages.map((page) => {
    const avecCote = { ...options, ...(page.cote === undefined ? {} : { cote: page.cote }) };
    const pageLue =
      ouLirePage === undefined || ouLirePage.type === "marges_exterieures"
        ? undefined
        : lireNumeroPage(page.image, ouLirePage, avecCote);
    return {
      index: page.index,
      ...(page.rang === undefined ? {} : { rang: page.rang }),
      ...(page.cote === undefined ? {} : { cote: page.cote }),
      ...(pageLue === undefined ? {} : { pageLue }),
      elements: consolider(lecturesDePage(page.image, recette, avecCote)),
    };
  });
}

/** Médias d'un dossier, pris récursivement, repérés par leur empreinte et numérotés par leur nom.
 *
 *  Le nom ne sert qu'à ça — retrouver quel numéro un média porte (REC-05). Rien ici ne renomme
 *  quoi que ce soit : les noms d'origine, espaces et apostrophes compris, restent intacts. */
export async function mediasDuDossier(dossier: string, recette?: Recette, extension = ".mp3"): Promise<Media[]> {
  const entrees = await readdir(dossier, { recursive: true, withFileTypes: true });
  const motif = recette?.audio?.motif_nom;
  const exempleElement = recette?.lectures.find((lecture) => lecture.ancre === "element")?.numero?.exemple;
  const medias: Media[] = [];

  for (const entree of entrees) {
    if (!entree.isFile() || !entree.name.toLowerCase().endsWith(extension) || entree.name.startsWith(".")) continue;
    const chemin = join(entree.parentPath, entree.name);
    const indices = lireNomMedia(basename(entree.name, extension), motif, exempleElement);
    if (indices.piste === undefined) continue;
    medias.push({
      piste: indices.piste,
      ...(indices.disque === undefined ? {} : { disque: indices.disque }),
      ...(indices.element === undefined ? {} : { element: indices.element }),
      ...(indices.page === undefined ? {} : { page: indices.page }),
      nom: entree.name,
      empreinte: createHash("sha256").update(await readFile(chemin)).digest("hex"),
    });
  }
  return medias.sort((a, b) => (a.disque ?? 1) - (b.disque ?? 1) || a.piste - b.piste || a.nom.localeCompare(b.nom, "fr"));
}

export type MediaInventorie = {
  readonly nom: string;
  readonly empreinte: string;
};

/** Support porté par un dossier CD1, CD 2, Disque3… dans une archive. Le chemin reste une donnée
 *  d'origine ; le rangement par empreinte ne doit pas effacer cette distinction. */
function disqueDuChemin(nom: string): number | undefined {
  for (const partie of nom.replaceAll("\\", "/").split("/").slice(0, -1)) {
    const trouve = /^(?:cd|disque)\s*[-_ ]?\s*(\d+)$/i.exec(partie.trim());
    if (trouve?.[1] !== undefined) return Number.parseInt(trouve[1], 10);
  }
  return undefined;
}

/** Relit un inventaire portable sans déduire quoi que ce soit du nom de rangement.
 *
 *  Dans une bibliothèque, le fichier s'appelle par son empreinte. Le numéro, lui, ne peut venir
 *  que du nom d'origine conservé au dépôt (REC-05). */
export function mediasDeLInventaire(inventaire: readonly MediaInventorie[], recette?: Recette): Media[] {
  const motif = recette?.audio?.motif_nom;
  const exempleElement = recette?.lectures.find((lecture) => lecture.ancre === "element")?.numero?.exemple;
  const medias: Media[] = [];
  for (const entree of inventaire) {
    const extension = entree.nom.toLowerCase().endsWith(".mp3") ? ".mp3" : undefined;
    if (extension === undefined) continue;
    const indices = lireNomMedia(basename(entree.nom, extension), motif, exempleElement);
    if (indices.piste === undefined) continue;
    const disque = disqueDuChemin(entree.nom) ?? indices.disque;
    medias.push({
      piste: indices.piste,
      ...(disque === undefined ? {} : { disque }),
      ...(indices.element === undefined ? {} : { element: indices.element }),
      ...(indices.page === undefined ? {} : { page: indices.page }),
      nom: entree.nom,
      empreinte: entree.empreinte,
    });
  }
  return medias.sort((a, b) => (a.disque ?? 1) - (b.disque ?? 1) || a.piste - b.piste || a.nom.localeCompare(b.nom, "fr"));
}

export type Rejeu = {
  readonly resultat: ResultatRecette;
  readonly association: Association;
  /** Les médias rangés, rendus avec le reste : les empreindre coûte une lecture de chaque fichier,
   *  et deux appelants qui les recalculent chacun de leur côté paient deux fois la même chose. */
  readonly medias: readonly Media[];
};

/** Lit un lot, en passant par le cache quand il est offert.
 *
 *  Le cache ne garde que des lectures : des numéros, des positions, des confiances. Aucun pixel,
 *  aucun extrait du document — ce qui est sous droits reste là où il est. */
/** Ce qu'une entrée de cache contient, relu par son contrat.
 *
 *  Un fichier de cache est une frontière comme une autre : il a été écrit par une autre
 *  exécution, parfois par une autre version. `JSON.parse` dit seulement que c'est du JSON — pas
 *  que ce sont des pages lues. Rendre le résultat tel quel, c'était promettre un type qu'on
 *  n'avait pas vérifié, et laisser une entrée tronquée se faire passer pour une lecture. */
export function lireCache(fichier: string): PageLue[] | undefined {
  if (!existsSync(fichier)) return undefined;
  try {
    return z.array(PageLueBrute).parse(JSON.parse(readFileSync(fichier, "utf8"))) as PageLue[];
  } catch {
    // Illisible, tronquée, ou d'une autre forme : on la retire plutôt que de buter dessus à
    // chaque exécution, et on relit. Un cache n'est jamais une raison d'échouer.
    rmSync(fichier, { force: true });
    return undefined;
  }
}

/** Écrit une entrée de cache sans jamais en laisser une à moitié.
 *
 *  Un fichier temporaire puis un renommage : sur un même système de fichiers, le renommage est
 *  atomique. Une exécution interrompue — et il y en a, un lot de F4 se lit en cinquante minutes —
 *  laisse alors le temporaire, jamais une entrée tronquée que la suivante relirait comme valide.
 *  Le temporaire porte le numéro du processus : deux exécutions côte à côte ne s'écrasent pas. */
export function ecrireCache(fichier: string, lues: readonly PageLue[]): void {
  const temporaire = `${fichier}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaire, JSON.stringify(lues));
    renameSync(temporaire, fichier);
  } catch {
    // Cache non inscriptible : tant pis, on a la lecture.
    rmSync(temporaire, { force: true });
  }
}

export async function lireLot(pdf: string, recette: Recette, options: OptionsBanc = {}): Promise<PageLue[]> {
  const fichier = options.cache === undefined ? undefined : join(options.cache, `${clefDeLecture(pdf, recette, options.pages)}.json`);

  if (fichier !== undefined) {
    const gardees = lireCache(fichier);
    if (gardees !== undefined) return gardees;
  }

  // Page par page : ce qui s'accumule, ce sont des numéros et des positions, pas des pixels.
  const lues: PageLue[] = [];
  let faits = 0;
  for await (const page of preparerLot(pdf, recette, options)) {
    lues.push(...reperer([page], recette, options));
    faits += 1;
    options.avancement?.(faits, page.total);
  }
  // Une lecture vide ne se garde pas. Il n'y a rien à économiser, et la garder rendrait le
  // défaut permanent : le document reviendrait vide à chaque reprise, sans jamais relire.
  if (fichier !== undefined && lues.length > 0) ecrireCache(fichier, lues);
  return lues;
}

export async function rejouer(pdf: string, dossierMedias: string, recette: Recette, options: OptionsBanc = {}): Promise<Rejeu> {
  const medias =
    options.inventaireMedias === undefined
      ? await mediasDuDossier(dossierMedias, recette)
      : mediasDeLInventaire(options.inventaireMedias, recette);
  // Combien de pistes le support compte est un fait sur le média, pas sur son nom (REC-05). Et
  // quels supports sont là : un livre qui couvre deux disques dont on n'a que le premier ne doit
  // pas voir ses derniers éléments forcés dans celui-là.
  const supports = supportsPresents(medias);
  const mediasParElement = new Map<number, { piste: number; disque: number }>();
  if (recette.audio?.usage === "corroboration_exacte") {
    const groupes = new Map<number, Media[]>();
    for (const media of medias) {
      if (media.element === undefined) continue;
      groupes.set(media.element, [...(groupes.get(media.element) ?? []), media]);
    }
    for (const [element, candidats] of groupes)
      if (candidats.length === 1) {
        const media = candidats[0]!;
        mediasParElement.set(element, { piste: media.piste, disque: media.disque ?? 1 });
      }
  }
  const luesBrutes = await lireLot(pdf, recette, options);
  const lues =
    recette.audio?.usage === "corroboration_exacte" && options.ciblesValidees !== undefined
      ? integrerCiblesValidees(luesBrutes, options.ciblesValidees, mediasParElement, recette.validation.seuil_confiance)
      : luesBrutes;

  // La relecture ciblée, quand une est branchée. Elle vient après la lecture et avant
  // l'interprétation : elle ne lit pas à la place du lecteur, elle revient sur ce dont il doute.
  const vision =
    options.relecture === undefined
      ? undefined
      : await options.relecture({ chemin: pdf, recette, lues, nombreDePistes: medias.length, supports, options });

  const interprete = interpreter(lues, recette, {
    nombreDePistes: medias.length,
    supports,
    ...(recette.audio?.usage === "corroboration_exacte" ? { mediasParElement } : {}),
    ...(vision === undefined ? {} : { vision }),
  });
  const resultat =
    recette.audio?.usage === "corroboration_exacte" && options.ciblesValidees !== undefined
      ? completerResultatParCiblesValidees(
          interprete,
          options.ciblesValidees,
          mediasParElement,
          recette.validation.seuil_confiance,
        )
      : interprete;
  const mediasDisponibles = options.inventaireMedias?.filter((media) => media.nom.toLowerCase().endsWith(".mp3")).length;
  return {
    resultat,
    association: qualifierAssociation(resultat.lignes, medias, recette, {
      ...(mediasDisponibles === undefined ? {} : { mediasDisponibles }),
    }),
    medias,
  };
}

/** Ce qu'un rejeu vaut face à une référence : combien d'éléments tombent sur la bonne piste. */
export type Score = {
  readonly attendus: number;
  readonly justes: number;
  readonly manquants: readonly number[];
  readonly fautifs: readonly { numero: number; attendu: number; obtenu: number }[];
  readonly supplementaires: readonly { numero: number; piste: number }[];
};

/** Compare piste à piste, par numéro d'élément. Un élément absent du rejeu compte comme manquant,
 *  jamais comme juste. Une association qui n'existe pas dans la référence compte comme
 *  supplémentaire : couvrir tout l'oracle ne suffit pas si le moteur invente aussi des liens. */
export function comparer(
  lignes: readonly { numero: number; piste?: number | undefined }[],
  reference: readonly { numero: number; piste: number }[],
): Score {
  const obtenus = lignes.flatMap((ligne) =>
    ligne.piste === undefined ? [] : [{ numero: ligne.numero, piste: ligne.piste }],
  );
  const utilises = new Set<number>();
  const manquants: number[] = [];
  const fautifs: { numero: number; attendu: number; obtenu: number }[] = [];
  let justes = 0;

  for (const attendu of reference) {
    const exact = obtenus.findIndex(
      (ligne, index) => !utilises.has(index) && ligne.numero === attendu.numero && ligne.piste === attendu.piste,
    );
    if (exact >= 0) {
      utilises.add(exact);
      justes += 1;
      continue;
    }
    const memeNumero = obtenus.findIndex(
      (ligne, index) => !utilises.has(index) && ligne.numero === attendu.numero,
    );
    if (memeNumero < 0) manquants.push(attendu.numero);
    else {
      utilises.add(memeNumero);
      fautifs.push({ numero: attendu.numero, attendu: attendu.piste, obtenu: obtenus[memeNumero]!.piste });
    }
  }
  const supplementaires = obtenus.filter((_, index) => !utilises.has(index));
  return { attendus: reference.length, justes, manquants, fautifs, supplementaires };
}

/** Relevé de la couche texte d'un PDF natif, dans la forme exacte des fichiers de référence.
 *
 *  C'est l'autre moitié du banc : un document natif n'a ni repères ni pastilles, mais sa couche
 *  texte doit ressortir identique après n'importe quel changement d'outil. On relève des comptes
 *  et des empreintes, jamais le texte lui-même — les fixtures sont sous droits. */
export type ReleveCoucheTexte = {
  readonly empreinte: string;
  readonly pages: number;
  readonly pagesAvecTexte: number;
  readonly caracteres: number;
  readonly detail: readonly { index: number; caracteres: number; mots: number; empreinteTexte: string }[];
};

/** Texte d'une page, espaces normalisés : deux lectures ne doivent pas différer par un blanc. */
const normaliser = (texte: string): string => texte.replace(/\s+/g, " ").trim();

export async function releverCoucheTexte(chemin: string): Promise<ReleveCoucheTexte> {
  const lu = await lireCoucheTexte(chemin);
  const detail = lu.pages.map((page) => {
    const texte = normaliser(texteDePage(page));
    return {
      index: page.index,
      caracteres: texte.length,
      mots: page.mots.length,
      empreinteTexte: createHash("sha256").update(texte).digest("hex").slice(0, 16),
    };
  });
  return {
    empreinte: lu.empreinte,
    pages: lu.pages.length,
    pagesAvecTexte: lu.pages.filter((page) => page.mots.length > 0).length,
    caracteres: detail.reduce((somme, page) => somme + page.caracteres, 0),
    detail,
  };
}
