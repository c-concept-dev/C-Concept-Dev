import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import type { Recette, ResultatRecette } from "@lienotheque/contrats";
import { objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";
import { decoderJpeg, enGris, type ImageGrise } from "@lienotheque/images";
import { associer, pisteDuNom, type Association, type Media } from "./associateur.js";
import { interpreter, type PageLue } from "./interprete.js";
import { lireCoucheTexte } from "@lienotheque/lecteur-texte";
import { texteDePage } from "@lienotheque/contrats";
import { consolider, lecturesDePage, lireNumeroPage, type OptionsReperes } from "./reperes.js";

/** Banc d'essai (OUT-15) : rejoue les fixtures après chaque changement d'outil ou de recette.
 *
 *  Il ne juge pas — il produit, et c'est la comparaison à la référence qui juge. Deux lots
 *  rejoués différemment ne se comparent pas : le banc fixe donc l'ordre des pages et celui des
 *  médias, et ne laisse rien au hasard. */

export type OptionsBanc = OptionsReperes & {
  /** Ne traiter que les premières pages : pour un essai rapide pendant la mise au point. */
  readonly pages?: number;
};

/** Pages d'un PDF numérisé, en gris, dans l'ordre du document et à leur résolution d'origine. */
export async function pagesEnGris(chemin: string, limite?: number): Promise<ImageGrise[]> {
  const objets = objetsPdf(await readFile(chemin));
  const pages = pagesPdf(objets);
  const retenues = limite === undefined ? pages : pages.slice(0, limite);

  const grises: ImageGrise[] = [];
  for (const page of retenues) {
    const image = page.images[0];
    if (image === undefined) continue;
    const octets = octetsImage(objets, image.numero);
    if (octets === undefined || octets.extension !== "jpg") continue;
    grises.push(enGris(await decoderJpeg(octets.octets)));
  }
  return grises;
}

/** Lit les repères de chaque page, puis interprète selon la recette. */
export function lireEtInterpreter(pages: readonly ImageGrise[], recette: Recette, options: OptionsBanc = {}): ResultatRecette {
  const bord = recette.lectures.find((lecture) => lecture.ancre === "page_imprimee")?.zone;
  const lues: PageLue[] = pages.map((image, index) => {
    const pageLue = bord !== undefined && bord.type === "coins" ? lireNumeroPage(image, bord.bord, options) : undefined;
    return {
      index,
      ...(pageLue === undefined ? {} : { pageLue }),
      elements: consolider(lecturesDePage(image, recette, options)),
    };
  });
  return interpreter(lues, recette);
}

/** Médias d'un dossier, pris récursivement, repérés par leur empreinte et numérotés par leur nom.
 *
 *  Le nom ne sert qu'à ça — retrouver quel numéro un média porte (REC-05). Rien ici ne renomme
 *  quoi que ce soit : les noms d'origine, espaces et apostrophes compris, restent intacts. */
export async function mediasDuDossier(dossier: string, extension = ".mp3"): Promise<Media[]> {
  const entrees = await readdir(dossier, { recursive: true, withFileTypes: true });
  const medias: Media[] = [];

  for (const entree of entrees) {
    if (!entree.isFile() || !entree.name.toLowerCase().endsWith(extension) || entree.name.startsWith(".")) continue;
    const chemin = join(entree.parentPath, entree.name);
    const piste = pisteDuNom(basename(entree.name, extension));
    if (piste === undefined) continue;
    medias.push({
      piste,
      nom: entree.name,
      empreinte: createHash("sha256").update(await readFile(chemin)).digest("hex"),
    });
  }
  return medias.sort((a, b) => a.piste - b.piste || a.nom.localeCompare(b.nom, "fr"));
}

export type Rejeu = { readonly resultat: ResultatRecette; readonly association: Association };

export async function rejouer(pdf: string, dossierMedias: string, recette: Recette, options: OptionsBanc = {}): Promise<Rejeu> {
  const pages = await pagesEnGris(pdf, options.pages);
  const resultat = lireEtInterpreter(pages, recette, options);
  return { resultat, association: associer(resultat.lignes, await mediasDuDossier(dossierMedias), recette) };
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
export function comparer(lignes: readonly { numero: number; piste: number }[], reference: readonly { numero: number; piste: number }[]): Score {
  const obtenu = new Map(lignes.map((ligne) => [ligne.numero, ligne.piste]));
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
