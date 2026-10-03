import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ElementRepere, LectureRepere, Recette } from "@lienotheque/contrats";
import { agrandir, boiteSombre, border, inverser, recadrer, seuiller, versPgm, type Boite, type ImageGrise } from "@lienotheque/images";
import { lireParOcr } from "@lienotheque/lecteur-texte";

/** Lecteur de repères (OUT-07) : numéros de page, numéros d'élément, pastilles, séquence.
 *
 *  Porté du prototype `docs/prototypes/ocr_methode.py`, qui reste l'oracle. Le principe ne
 *  change pas : plusieurs lectures indépendantes de la même page — échelles et modes de
 *  segmentation différents — puis un vote. Une page scannée se lit mal une fois et bien trois
 *  fois. Tout ce qui est propre au document vient de la recette, jamais du code. */

export type OptionsReperes = {
  readonly binaire?: string;
  readonly tessdata?: string | undefined;
  readonly langue?: string;
  /** Où déposer les images intermédiaires. Un dossier temporaire par défaut. */
  readonly dossier?: string;
};

/** Les trois passes du prototype : échelle et mode de segmentation. */
const PASSES: readonly (readonly [facteur: number, segmentation: number])[] = [
  [1, 3],
  [1, 11],
  [2, 3],
];

const CHIFFRES = "0123456789";
/** Au-delà, ce n'est plus un numéro de page mais une mesure ou un tempo mal lus. */
const PAGE_MAX = 400;

/** Motif tolérant tiré du libellé de la recette.
 *
 *  Un moteur d'OCR mange volontiers l'une des deux lettres d'un doublement : « Pattern » revient
 *  en « Patern ». On rend donc chaque doublement facultatif — et rien d'autre, pour ne pas
 *  reconnaître n'importe quoi. */
export function motifLibelle(libelle: string): RegExp {
  let motif = "";
  for (let rang = 0; rang < libelle.length; ) {
    const lettre = libelle[rang]!;
    let longueur = 1;
    while (rang + longueur < libelle.length && libelle[rang + longueur] === lettre) longueur += 1;
    const echappee = lettre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    motif += longueur > 1 ? `${echappee}{1,${longueur}}` : echappee;
    rang += longueur;
  }
  return new RegExp(`^${motif}$`, "i");
}

/** Ce qui annonce une suite, réduit à ses lettres de tête : une apostrophe ne survit pas à l'OCR. */
export const amorceDeSuite = (mention: string): string => (/^[\p{L}]+/u.exec(mention)?.[0] ?? mention).toLowerCase();

let compteur = 0;
function ocr(image: ImageGrise, segmentation: number, options: OptionsReperes, alphabet?: string): ReturnType<typeof lireParOcr> {
  const dossier = options.dossier ?? mkdtempSync(join(tmpdir(), "lienotheque-reperes-"));
  const chemin = join(dossier, `repere-${(compteur += 1)}.pgm`);
  writeFileSync(chemin, versPgm(image));
  // L'index de page ne veut rien dire sur un recadrage : 1 suffit au contrat.
  return lireParOcr(chemin, image.largeur, image.hauteur, 1, {
    segmentation,
    ...(options.binaire === undefined ? {} : { binaire: options.binaire }),
    ...(options.tessdata === undefined ? {} : { tessdata: options.tessdata }),
    ...(options.langue === undefined ? {} : { langue: options.langue }),
    ...(alphabet === undefined ? {} : { alphabet }),
  });
}

const premierEntier = (texte: string): number | undefined => {
  const trouve = /^(\d+)/.exec(texte.trim());
  return trouve === null ? undefined : Number(trouve[1]);
};

/** Les deux coins du bord indiqué par la recette : c'est là que se met un numéro de page. */
export function coinsDePage(image: ImageGrise, bord: "haut" | "bas"): readonly Boite[] {
  const bande = Math.round(image.hauteur * 0.07);
  const y = bord === "bas" ? image.hauteur - bande : 0;
  const l = Math.round(image.largeur * 0.2);
  return [
    { x: 0, y, l, h: bande },
    { x: image.largeur - l, y, l, h: bande },
  ];
}

export function lireNumeroPage(image: ImageGrise, bord: "haut" | "bas", options: OptionsReperes = {}): number | undefined {
  for (const coin of coinsDePage(image, bord)) {
    const lue = ocr(recadrer(image, coin), 7, options, CHIFFRES);
    const numero = premierEntier(lue.mots.map((mot) => mot.texte).join(" "));
    if (numero !== undefined && numero > 0 && numero < PAGE_MAX) return numero;
  }
  return undefined;
}

/** Où chercher la pastille, selon ce que la recette dit de sa position par rapport à l'élément.
 *  `boite` est celle du numéro d'élément ; `h` sa hauteur, qui donne l'échelle. */
export function zonePastille(boite: Boite, position: "dessous" | "dessus" | "gauche" | "droite", marge: number): Boite {
  const h = boite.h;
  switch (position) {
    case "droite":
      return { x: boite.x + boite.l + marge, y: boite.y - h * 1.5, l: h * 5, h: h * 4 };
    case "gauche":
      return { x: boite.x - marge - h * 5, y: boite.y - h * 1.5, l: h * 5, h: h * 4 };
    case "dessous":
      return { x: boite.x - h, y: boite.y + boite.h + marge, l: h * 5, h: h * 4 };
    case "dessus":
      return { x: boite.x - h, y: boite.y - marge - h * 4, l: h * 5, h: h * 4 };
  }
}

/** Lit la pastille : une forme sombre, des chiffres clairs dedans.
 *
 *  On binarise, on cherche la boîte de ce qui est sombre, on rogne les bords de la forme pour ne
 *  garder que son cœur, on inverse — et les chiffres clairs sur fond sombre deviennent des
 *  chiffres sombres sur fond clair, que l'OCR sait lire. */
export function lirePastille(
  image: ImageGrise,
  boite: Boite,
  position: "dessous" | "dessus" | "gauche" | "droite",
  marge: number,
  options: OptionsReperes = {},
): number | undefined {
  const zone = seuiller(recadrer(image, zonePastille(boite, position, marge)), 110);
  if (zone.largeur === 0 || zone.hauteur === 0) return undefined;

  const forme = boiteSombre(zone);
  if (forme === undefined) return undefined;
  // Une forme plus étroite que la hauteur du numéro n'est pas une pastille, c'est une bavure.
  if (forme.l < boite.h) return undefined;

  const dx = Math.round(forme.l * 0.2);
  const dy = Math.round(forme.h * 0.22);
  const coeur = recadrer(zone, { x: forme.x + dx, y: forme.y + dy, l: forme.l - dx * 2, h: forme.h - dy * 2 });
  if (coeur.largeur === 0 || coeur.hauteur === 0) return undefined;

  const lisible = border(agrandir(inverser(coeur), 4), 25);
  const lue = ocr(lisible, 7, options, CHIFFRES);
  const numero = premierEntier(lue.mots.map((mot) => mot.texte).join(" "));
  return numero !== undefined && numero > 0 ? numero : undefined;
}

/** Toutes les lectures d'une page : plusieurs passes, aucune consolidation encore. */
export function lecturesDePage(image: ImageGrise, recette: Recette, options: OptionsReperes = {}): LectureRepere[] {
  const lectureElement = recette.lectures.find((lecture) => lecture.ancre === "element");
  const lecturePiste = recette.lectures.find((lecture) => lecture.ancre === "piste");
  if (lectureElement === undefined) return [];

  const motif = lectureElement.libelle === undefined ? undefined : motifLibelle(lectureElement.libelle);
  const amorce = recette.regles.mention_suite === undefined ? undefined : amorceDeSuite(recette.regles.mention_suite);
  const lectures: LectureRepere[] = [];

  for (const [facteur, segmentation] of PASSES) {
    const agrandie = agrandir(image, facteur);
    const mots = ocr(agrandie, segmentation, options).mots;

    for (let rang = 0; rang < mots.length - 1; rang += 1) {
      const mot = mots[rang]!;
      if (motif !== undefined && !motif.test(mot.texte.trim())) continue;

      const suivant = mots[rang + 1]!;
      const numero = premierEntier(suivant.texte);
      if (numero === undefined) continue;

      const pisteLue =
        lecturePiste === undefined
          ? undefined
          : lirePastille(agrandie, { x: suivant.x, y: suivant.y, l: suivant.l, h: suivant.h }, lecturePiste.position, 6 * facteur, options);

      const apres = mots
        .slice(rang + 2, rang + 5)
        .map((autre) => autre.texte.toLowerCase())
        .join(" ");

      lectures.push({
        y: mot.y / agrandie.hauteur,
        numero,
        ...(pisteLue === undefined ? {} : { pisteLue }),
        suite: amorce !== undefined && apres.includes(amorce),
      });
    }
  }
  return lectures;
}

/** Hauteur en deçà de laquelle deux lectures parlent du même élément. */
const MEME_HAUTEUR = 0.03;

const plusFrequent = (valeurs: readonly number[]): { valeur: number; accord: number } | undefined => {
  if (valeurs.length === 0) return undefined;
  const comptes = new Map<number, number>();
  for (const valeur of valeurs) comptes.set(valeur, (comptes.get(valeur) ?? 0) + 1);
  // Tri stable et total : à égalité de voix, le plus petit numéro l'emporte, pour que deux
  // exécutions ne rendent jamais deux résultats différents (REC-02).
  const [valeur, voix] = [...comptes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]!;
  return { valeur, accord: voix / valeurs.length };
};

/** Regroupe les lectures par hauteur et vote. Deux votes séparés : le numéro d'élément et celui
 *  de la piste — l'un peut être sûr quand l'autre ne l'est pas. */
export function consolider(lectures: readonly LectureRepere[]): ElementRepere[] {
  const groupes: { y: number; numeros: number[]; pistes: number[]; suite: boolean }[] = [];

  for (const lecture of [...lectures].sort((a, b) => a.y - b.y || a.numero - b.numero)) {
    const dernier = groupes[groupes.length - 1];
    if (dernier === undefined || Math.abs(dernier.y - lecture.y) >= MEME_HAUTEUR)
      groupes.push({ y: lecture.y, numeros: [], pistes: [], suite: false });
    const groupe = groupes[groupes.length - 1]!;
    groupe.numeros.push(lecture.numero);
    groupe.suite ||= lecture.suite;
    if (lecture.pisteLue !== undefined) groupe.pistes.push(lecture.pisteLue);
  }

  return groupes.flatMap((groupe) => {
    const numero = plusFrequent(groupe.numeros);
    if (numero === undefined) return [];
    const piste = plusFrequent(groupe.pistes);
    return [
      {
        y: Math.round(groupe.y * 1000) / 1000,
        numero: numero.valeur,
        ...(piste === undefined ? {} : { pisteLue: piste.valeur }),
        suite: groupe.suite,
        accordNumero: Math.round(numero.accord * 100) / 100,
        accordPiste: piste === undefined ? 0 : Math.round(piste.accord * 100) / 100,
      },
    ];
  });
}
