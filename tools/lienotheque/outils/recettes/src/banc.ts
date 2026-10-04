import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { ReglagesRedressement, type CotePage, type Recette, type ResultatRecette } from "@lienotheque/contrats";
import { redresser, type OptionsRedressement } from "@lienotheque/redresseur";
import { objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";
import { decoderJpeg, enGris, type ImageGrise } from "@lienotheque/images";
import { associer, lireNomMedia, type Association, type Media } from "./associateur.js";
import { interpreter, type PageLue } from "./interprete.js";
import { lireCoucheTexte } from "@lienotheque/lecteur-texte";
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

export type OptionsBanc = OptionsReperes & {
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
  const telle = !preparation.double_page && preparation.redressement === "aucun";

  const reglages = telle
    ? undefined
    : ReglagesRedressement.parse({
        rotation: preparation.redressement,
        doublePage: preparation.double_page,
        ...(preparation.page_gauche === undefined ? {} : { pageGauche: preparation.page_gauche }),
        effacerVerso: true,
        binarisation: options.sansBinarisation === true ? "aucune" : "adaptative",
      });

  let index = 0;
  for await (const image of pagesEnGris(chemin, options.pages)) {
    if (reglages === undefined) yield { image, index };
    else
      for (const produite of redresser(image, index, reglages, options.redressement ?? {})) {
        const cote = produite.descripteur.cote;
        yield {
          image: produite.image,
          index,
          rang: preparation.double_page ? index * 2 + (cote === "droite" ? 1 : 0) : index,
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
export async function* pagesEnGris(chemin: string, limite?: number): AsyncGenerator<ImageGrise> {
  const objets = objetsPdf(await readFile(chemin));
  const pages = pagesPdf(objets);
  const retenues = limite === undefined ? pages : pages.slice(0, limite);

  for (const page of retenues) {
    const image = page.images[0];
    if (image === undefined) continue;
    const octets = octetsImage(objets, image.numero);
    if (octets === undefined || octets.extension !== "jpg") continue;
    yield enGris(await decoderJpeg(octets.octets));
  }
}

/** Lit les repères de chaque page, puis interprète selon la recette. */
export function lireEtInterpreter(pages: readonly ImageGrise[], recette: Recette, options: OptionsBanc = {}): ResultatRecette {
  return interpreter(reperer(pages.map((image, index) => ({ image, index })), recette, options), recette);
}

/** Une page à lire, avec ce que le redresseur en sait déjà. */
export type PageAlire = { readonly image: ImageGrise; readonly index: number; readonly rang?: number; readonly cote?: CotePage };

/** Lit les repères de chaque page. Le côté, quand il est connu, dit où est la marge extérieure. */
export function reperer(pages: readonly PageAlire[], recette: Recette, options: OptionsBanc = {}): PageLue[] {
  const bord = recette.lectures.find((lecture) => lecture.ancre === "page_imprimee")?.zone;
  return pages.map((page) => {
    const avecCote = { ...options, ...(page.cote === undefined ? {} : { cote: page.cote }) };
    const pageLue = bord !== undefined && bord.type === "coins" ? lireNumeroPage(page.image, bord.bord, avecCote) : undefined;
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
  const medias: Media[] = [];

  for (const entree of entrees) {
    if (!entree.isFile() || !entree.name.toLowerCase().endsWith(extension) || entree.name.startsWith(".")) continue;
    const chemin = join(entree.parentPath, entree.name);
    const indices = lireNomMedia(basename(entree.name, extension), motif);
    if (indices.piste === undefined) continue;
    medias.push({
      piste: indices.piste,
      ...(indices.disque === undefined ? {} : { disque: indices.disque }),
      nom: entree.name,
      empreinte: createHash("sha256").update(await readFile(chemin)).digest("hex"),
    });
  }
  return medias.sort((a, b) => (a.disque ?? 1) - (b.disque ?? 1) || a.piste - b.piste || a.nom.localeCompare(b.nom, "fr"));
}

export type Rejeu = { readonly resultat: ResultatRecette; readonly association: Association };

/** Lit un lot, en passant par le cache quand il est offert.
 *
 *  Le cache ne garde que des lectures : des numéros, des positions, des confiances. Aucun pixel,
 *  aucun extrait du document — ce qui est sous droits reste là où il est. */
export async function lireLot(pdf: string, recette: Recette, options: OptionsBanc = {}): Promise<PageLue[]> {
  const fichier = options.cache === undefined ? undefined : join(options.cache, `${clefDeLecture(pdf, recette, options.pages)}.json`);

  if (fichier !== undefined && existsSync(fichier))
    try {
      return JSON.parse(readFileSync(fichier, "utf8")) as PageLue[];
    } catch {
      // Cache illisible : on relit. Un cache n'est jamais une raison d'échouer.
    }

  // Page par page : ce qui s'accumule, ce sont des numéros et des positions, pas des pixels.
  const lues: PageLue[] = [];
  for await (const page of preparerLot(pdf, recette, options)) lues.push(...reperer([page], recette, options));
  if (fichier !== undefined)
    try {
      writeFileSync(fichier, JSON.stringify(lues));
    } catch {
      // Cache non inscriptible : tant pis, on a la lecture.
    }
  return lues;
}

export async function rejouer(pdf: string, dossierMedias: string, recette: Recette, options: OptionsBanc = {}): Promise<Rejeu> {
  const medias = await mediasDuDossier(dossierMedias, recette);
  // Combien de pistes le support compte est un fait sur le média, pas sur son nom (REC-05).
  const resultat = interpreter(await lireLot(pdf, recette, options), recette, { nombreDePistes: medias.length });
  return { resultat, association: associer(resultat.lignes, medias, recette) };
}

/** Ce qu'un rejeu vaut face à une référence : combien d'éléments tombent sur la bonne piste. */
export type Score = {
  readonly attendus: number;
  readonly justes: number;
  readonly manquants: readonly number[];
  readonly fautifs: readonly { numero: number; attendu: number; obtenu: number }[];
};

/** Compare piste à piste, par numéro d'élément. Un élément absent du rejeu compte comme manquant,
 *  jamais comme juste. */
export function comparer(
  lignes: readonly { numero: number; piste?: number | undefined }[],
  reference: readonly { numero: number; piste: number }[],
): Score {
  const obtenu = new Map(lignes.flatMap((ligne) => (ligne.piste === undefined ? [] : [[ligne.numero, ligne.piste] as const])));
  const manquants: number[] = [];
  const fautifs: { numero: number; attendu: number; obtenu: number }[] = [];
  let justes = 0;

  for (const attendu of reference) {
    const piste = obtenu.get(attendu.numero);
    if (piste === undefined) manquants.push(attendu.numero);
    else if (piste === attendu.piste) justes += 1;
    else fautifs.push({ numero: attendu.numero, attendu: attendu.piste, obtenu: piste });
  }
  return { attendus: reference.length, justes, manquants, fautifs };
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
