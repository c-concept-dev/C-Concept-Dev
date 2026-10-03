import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CotePage, ElementRepere, LectureRepere, MotLu, Recette } from "@lienotheque/contrats";
import {
  agrandir,
  boiteSombre,
  border,
  inverser,
  recadrer,
  seuiller,
  versPgm,
  type Boite,
  type ImageGrise,
} from "@lienotheque/images";
import { lireParOcr } from "@lienotheque/lecteur-texte";

/** Lecteur de repères (OUT-07) : numéros de page, numéros d'élément, pastilles, séquence.
 *
 *  Porté des prototypes `docs/prototypes/ocr_methode.py` et `westwood_*.py`, qui restent les
 *  oracles. Le principe ne change pas : plusieurs lectures indépendantes de la même page —
 *  échelles et modes de segmentation différents — puis un vote. Une page scannée se lit mal une
 *  fois et bien trois fois.
 *
 *  Tout ce qui est propre à un document vient de la recette. Le code ne sait pas quel livre il
 *  lit : il sait lire un numéro dans une marge et un chiffre clair sur un fond sombre. */

export type OptionsReperes = {
  readonly binaire?: string;
  readonly tessdata?: string | undefined;
  readonly langue?: string;
  /** Où déposer les images intermédiaires. Un dossier temporaire par défaut. */
  readonly dossier?: string;
  /** Côté du cliché dont la page est tirée : il dit où est la marge extérieure. */
  readonly cote?: CotePage;
};

/** Les trois passes : échelle et mode de segmentation. Trois lectures d'une même page valent
 *  mieux qu'une, et la troisième départage les deux premières. */
const PASSES: readonly (readonly [facteur: number, segmentation: number])[] = [
  [1, 3],
  [1, 11],
  [2, 3],
];

const CHIFFRES = "0123456789";
/** Au-delà, ce n'est plus un numéro de page mais une mesure ou un tempo mal lus. */
const PAGE_MAX = 400;
/** Part de la page, en haut ou en bas, où se met un numéro de page. */
const BANDE_NUMERO = 0.07;
/** Part de la largeur, depuis chaque bord, où le chercher. Un numéro de page est près du bord,
 *  mais pas collé : sur une photo de livre il se promène avec la marge. */
const COIN_LARGEUR = 0.3;
/** En deçà, une lecture d'OCR ne vaut pas qu'on s'y arrête. */
const CONFIANCE_MINIMALE = 0.6;

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
function ocr(image: ImageGrise, segmentation: number, options: OptionsReperes, alphabet?: string): readonly MotLu[] {
  if (image.largeur === 0 || image.hauteur === 0) return [];
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
  }).mots;
}

const premierEntier = (texte: string): number | undefined => {
  const trouve = /^(\d+)/.exec(texte.trim());
  return trouve === null ? undefined : Number(trouve[1]);
};

/** Les deux coins du bord indiqué par la recette : c'est là que se met un numéro de page. */
export function coinsDePage(image: ImageGrise, bord: "haut" | "bas"): readonly Boite[] {
  const bande = Math.round(image.hauteur * BANDE_NUMERO);
  const y = bord === "bas" ? image.hauteur - bande : 0;
  const l = Math.round(image.largeur * COIN_LARGEUR);
  return [
    { x: 0, y, l, h: bande },
    { x: image.largeur - l, y, l, h: bande },
  ];
}

/** Numéro de page lu dans un coin.
 *
 *  La bande est étroite — sept pour cent de la hauteur — et c'est elle qui protège la lecture :
 *  au-dessus commencent les chiffres du document, doigtés et cases de tablature, qu'une bande
 *  plus haute ramasserait. En largeur, en revanche, il faut de la marge : sur une photo de livre
 *  le numéro se promène avec la reliure.
 *
 *  D'abord en ligne unique : un chiffre isolé dans une grande image blanche se lit ainsi, et
 *  presque jamais en lecture éparse. Quand cela ne donne rien — un bord de livre sombre dans le
 *  coin suffit à faire échouer la ligne unique —, on reprend en lecture éparse et on retient le
 *  plus grand chiffre : un numéro de page est imprimé plus gros que ce qui l'entoure. */
export function lireNumeroPage(image: ImageGrise, bord: "haut" | "bas", options: OptionsReperes = {}): number | undefined {
  const coins = coinsDePage(image, bord).map((coin) => recadrer(image, coin));

  for (const crop of coins) {
    const numero = premierEntier(
      ocr(crop, 7, options, CHIFFRES)
        .map((mot) => mot.texte)
        .join(" "),
    );
    if (numero !== undefined && numero > 0 && numero < PAGE_MAX) return numero;
  }

  let recours: { numero: number; hauteur: number } | undefined;
  for (const crop of coins)
    for (const mot of ocr(crop, 11, options, CHIFFRES)) {
      const texte = mot.texte.trim();
      if (!/^\d{1,3}$/.test(texte)) continue;
      const numero = Number(texte);
      if (numero <= 0 || numero >= PAGE_MAX) continue;
      if (recours === undefined || mot.h > recours.hauteur) recours = { numero, hauteur: mot.h };
    }
  return recours?.numero;
}

type ZoneRecette = Extract<Recette["lectures"][number], { ancre: "element" }>["zone"];

/** Un mot tombe-t-il dans la zone que la recette désigne pour les éléments ?
 *
 *  « Marges extérieures » veut dire : loin de la reliure. Sur une page coupée on sait de quel
 *  côté est la reliure, donc il n'y a qu'une marge extérieure ; sur une page entière, il y en a
 *  deux. */
export function dansLaZone(mot: MotLu, zone: ZoneRecette, image: ImageGrise, cote?: CotePage): boolean {
  switch (zone.type) {
    case "marges_exterieures": {
      const large = image.largeur * zone.largeur_rel;
      const aGauche = mot.x < large;
      const aDroite = mot.x + mot.l > image.largeur - large;
      if (cote === "gauche") return aGauche;
      if (cote === "droite") return aDroite;
      return aGauche || aDroite;
    }
    case "rectangle_rel": {
      const x0 = image.largeur * zone.x;
      const y0 = image.hauteur * zone.y;
      return mot.x >= x0 && mot.y >= y0 && mot.x + mot.l <= x0 + image.largeur * zone.l && mot.y + mot.h <= y0 + image.hauteur * zone.h;
    }
    case "coins":
      return zone.bord === "haut" ? mot.y < image.hauteur * BANDE_NUMERO : mot.y > image.hauteur * (1 - BANDE_NUMERO);
  }
}

/** Où chercher la pastille, selon ce que la recette dit de sa position par rapport à l'élément.
 *  `boite` est celle du numéro d'élément ; sa hauteur donne l'échelle. */
export function zonePastille(boite: Boite, position: "dessous" | "dessus" | "gauche" | "droite", marge: number): Boite {
  const h = boite.h;
  switch (position) {
    case "droite":
      return { x: boite.x + boite.l + marge, y: boite.y - h * 1.5, l: h * 5, h: h * 4 };
    case "gauche":
      return { x: boite.x - marge - h * 5, y: boite.y - h * 1.5, l: h * 5, h: h * 4 };
    case "dessous":
      return { x: boite.x - h * 1.6, y: boite.y + boite.h + marge, l: h * 4.4, h: h * 2.2 };
    case "dessus":
      return { x: boite.x - h * 1.6, y: boite.y - marge - h * 2.2, l: h * 4.4, h: h * 2.2 };
  }
}

/** Un ton clair représentatif de la zone : le papier local. Sert de référence à tout le reste,
 *  pour ne dépendre d'aucune valeur absolue — une photo n'a pas la même lumière qu'un scan. */
export function tonClair(image: ImageGrise, part = 0.9): number {
  if (image.pixels.length === 0) return 255;
  const comptes = new Uint32Array(256);
  for (const ton of image.pixels) comptes[ton]! += 1;
  const cible = Math.floor(image.pixels.length * part);
  let cumul = 0;
  for (let ton = 0; ton < 256; ton += 1) {
    cumul += comptes[ton]!;
    if (cumul >= cible) return ton;
  }
  return 255;
}

/** À quel point une pastille semble présente sous le numéro, qu'on sache ou non lire son chiffre.
 *
 *  Une pastille est une **surface** sombre. Deux choses la distinguent donc : l'assombrissement
 *  moyen de la zone — une ligne de portée qui la traverse ne pèse presque rien dans la moyenne,
 *  un bloc beaucoup —, et l'étendue du sombre dans les deux sens. On prend le plus petit des
 *  deux étalements : une ligne couvre toute la largeur et une seule hauteur, un bloc couvre les
 *  deux. */
export function presenceDeBloc(zone: ImageGrise): number {
  if (zone.largeur === 0 || zone.hauteur === 0) return 0;
  const clair = Math.max(1, tonClair(zone));
  const sombre = clair * 0.45;

  let somme = 0;
  const colonnes = new Uint8Array(zone.largeur);
  const lignes = new Uint8Array(zone.hauteur);
  for (let y = 0; y < zone.hauteur; y += 1)
    for (let x = 0; x < zone.largeur; x += 1) {
      const ton = zone.pixels[y * zone.largeur + x]!;
      somme += ton;
      if (ton < sombre) {
        colonnes[x] = 1;
        lignes[y] = 1;
      }
    }

  const moyenne = somme / zone.pixels.length;
  const profondeur = Math.min(1, Math.max(0, (clair - moyenne) / (clair * 0.55)));
  const partColonnes = colonnes.reduce((total, marque) => total + marque, 0) / zone.largeur;
  const partLignes = lignes.reduce((total, marque) => total + marque, 0) / zone.hauteur;
  const etendue = Math.min(1, Math.min(partColonnes, partLignes) / 0.35);

  return Math.round((profondeur * 0.5 + etendue * 0.5) * 100) / 100;
}

/** Vote majoritaire ; à égalité, la plus petite valeur, pour que deux exécutions s'accordent. */
export function vote(valeurs: readonly number[]): { valeur: number; accord: number } | undefined {
  if (valeurs.length === 0) return undefined;
  const comptes = new Map<number, number>();
  for (const valeur of valeurs) comptes.set(valeur, (comptes.get(valeur) ?? 0) + 1);
  const [valeur, voix] = [...comptes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]!;
  return { valeur, accord: voix / valeurs.length };
}

export type BlocPiste = { readonly presence: number; readonly votes: readonly number[] };

/** Seuils tentés sur le bloc, en part du ton clair local. Plusieurs seuils, plusieurs lectures :
 *  un chiffre clair sur fond sombre ne se détache pas au même endroit selon la lumière. */
const SEUILS = [0.45, 0.6, 0.75] as const;
/** Parts du bloc, prises depuis la droite, quand une étiquette occupe sa gauche. */
const PARTS_ETIQUETTE = [0.6, 0.5, 0.42] as const;

/** En deçà, il n'y a pas de bloc à lire : inutile de faire travailler l'OCR sur du papier.
 *  La plupart des éléments n'ouvrent pas une piste, et c'est ce seuil qui rend le lot abordable. */
export const PRESENCE_MINIMALE = 0.5;

/** Lit le bloc de piste : une forme sombre, des chiffres clairs dedans.
 *
 *  On cherche la forme sombre, on la découpe — en n'en gardant que la droite quand une étiquette
 *  occupe sa gauche —, on inverse, on agrandit, et on fait lire plusieurs fois. Les lectures sont
 *  rendues telles quelles : c'est à l'interpréteur de les faire voter, lui seul connaît la suite
 *  des pistes déjà vues. */
export function lireBlocPiste(
  image: ImageGrise,
  boite: Boite,
  position: "dessous" | "dessus" | "gauche" | "droite",
  motif: "bloc_sombre_chiffres_clairs" | "losange_sombre_chiffres_clairs",
  marge: number,
  etiquette: boolean,
  options: OptionsReperes = {},
): BlocPiste {
  const zone = recadrer(image, zonePastille(boite, position, marge));
  if (zone.largeur === 0 || zone.hauteur === 0) return { presence: 0, votes: [] };

  const presence = presenceDeBloc(zone);
  if (presence < PRESENCE_MINIMALE) return { presence, votes: [] };

  const clair = Math.max(1, tonClair(zone));
  const forme = boiteSombre(seuiller(zone, Math.round(clair * 0.55)));
  if (forme === undefined || forme.l < boite.h * 0.6) return { presence, votes: [] };

  // La forme du repère commande le recadrage. Les coins d'un losange sont du fond : les garder
  // mettrait des pointes noires autour des chiffres. Un bloc rectangulaire se prend entier.
  const bloc =
    motif === "losange_sombre_chiffres_clairs"
      ? recadrer(zone, {
          x: forme.x + Math.round(forme.l * 0.2),
          y: forme.y + Math.round(forme.h * 0.22),
          l: forme.l - Math.round(forme.l * 0.2) * 2,
          h: forme.h - Math.round(forme.h * 0.22) * 2,
        })
      : recadrer(zone, forme);
  if (bloc.largeur === 0 || bloc.hauteur === 0) return { presence, votes: [] };

  const votes: number[] = [];
  for (const part of etiquette ? PARTS_ETIQUETTE : [1]) {
    const depart = Math.round(bloc.largeur * (1 - part));
    const morceau = recadrer(bloc, { x: depart, y: 0, l: bloc.largeur - depart, h: bloc.hauteur });
    if (morceau.largeur === 0 || morceau.hauteur === 0) continue;

    for (const seuil of SEUILS) {
      const net = border(agrandir(inverser(seuiller(morceau, Math.round(clair * seuil))), 5), 25);
      for (const segmentation of [7, 8]) {
        const lu = premierEntier(
          ocr(net, segmentation, options, CHIFFRES)
            .map((mot) => mot.texte)
            .join(""),
        );
        if (lu !== undefined && lu > 0 && lu < 100) votes.push(lu);
      }
    }
  }
  return { presence, votes };
}

/** Toutes les lectures d'une page : plusieurs passes, aucune consolidation encore.
 *
 *  Deux façons de repérer un élément, selon ce que la recette déclare. Avec un libellé, on
 *  cherche le mot puis le nombre qui le suit. Sans libellé, tout nombre posé dans la zone
 *  déclarée et de la bonne taille est un candidat — c'est la mise en page qui le désigne. */
export function lecturesDePage(image: ImageGrise, recette: Recette, options: OptionsReperes = {}): LectureRepere[] {
  const lectureElement = recette.lectures.find((lecture) => lecture.ancre === "element");
  const lecturePiste = recette.lectures.find((lecture) => lecture.ancre === "piste");
  if (lectureElement === undefined) return [];

  const motif = lectureElement.libelle === undefined ? undefined : motifLibelle(lectureElement.libelle);
  const amorce = recette.regles.mention_suite === undefined ? undefined : amorceDeSuite(recette.regles.mention_suite);
  const lectures: LectureRepere[] = [];

  for (const [facteur, segmentation] of PASSES) {
    const agrandie = agrandir(image, facteur);
    const mots = ocr(agrandie, segmentation, options);

    const retenir = (rang: number, numero: number, boite: Boite, y: number): void => {
      const bloc =
        lecturePiste === undefined
          ? undefined
          : lireBlocPiste(
              agrandie,
              boite,
              lecturePiste.position,
              lecturePiste.motif,
              6 * facteur,
              lecturePiste.etiquette_disque,
              options,
            );
      const piste = bloc === undefined ? undefined : vote(bloc.votes);
      const apres = mots
        .slice(rang + 1, rang + 4)
        .map((autre) => autre.texte.toLowerCase())
        .join(" ");

      lectures.push({
        y,
        numero,
        ...(piste === undefined ? {} : { pisteLue: piste.valeur }),
        presencePiste: bloc?.presence ?? 0,
        suite: amorce !== undefined && apres.includes(amorce),
      });
    };

    if (motif !== undefined) {
      // Le libellé désigne l'élément ; son numéro est le mot qui suit.
      for (let rang = 0; rang < mots.length - 1; rang += 1) {
        const mot = mots[rang]!;
        if (!motif.test(mot.texte.trim())) continue;
        const suivant = mots[rang + 1]!;
        const numero = premierEntier(suivant.texte);
        if (numero === undefined || numero <= 0) continue;
        retenir(rang + 1, numero, { x: suivant.x, y: suivant.y, l: suivant.l, h: suivant.h }, mot.y / agrandie.hauteur);
      }
      continue;
    }

    // Sans libellé : c'est la place et la taille du nombre qui le désignent.
    const hauteurMin = agrandie.hauteur * lectureElement.hauteur_rel.min;
    const hauteurMax = agrandie.hauteur * lectureElement.hauteur_rel.max;
    for (let rang = 0; rang < mots.length; rang += 1) {
      const mot = mots[rang]!;
      const texte = mot.texte.trim();
      // « 0 » n'est le numéro d'aucun élément : c'est un chiffre du document ou une bavure.
      if (!/^\d{1,3}$/.test(texte) || Number(texte) <= 0) continue;
      if ((mot.confiance ?? 1) < CONFIANCE_MINIMALE) continue;
      if (mot.h < hauteurMin || mot.h > hauteurMax) continue;
      // La bande des numéros de page n'est pas une marge d'éléments.
      if (mot.y < agrandie.hauteur * BANDE_NUMERO) continue;
      if (!dansLaZone(mot, lectureElement.zone, agrandie, options.cote)) continue;
      retenir(rang, Number(texte), { x: mot.x, y: mot.y, l: mot.l, h: mot.h }, mot.y / agrandie.hauteur);
    }
  }
  return lectures;
}

/** Hauteur en deçà de laquelle deux lectures parlent du même élément. */
const MEME_HAUTEUR = 0.03;

/** Regroupe les lectures par hauteur et vote. Deux votes séparés : le numéro d'élément et celui
 *  de la piste — l'un peut être sûr quand l'autre ne l'est pas. */
export function consolider(lectures: readonly LectureRepere[]): ElementRepere[] {
  const groupes: { y: number; numeros: number[]; pistes: number[]; presences: number[]; suite: boolean }[] = [];

  for (const lecture of [...lectures].sort((a, b) => a.y - b.y || a.numero - b.numero)) {
    const dernier = groupes[groupes.length - 1];
    if (dernier === undefined || Math.abs(dernier.y - lecture.y) >= MEME_HAUTEUR)
      groupes.push({ y: lecture.y, numeros: [], pistes: [], presences: [], suite: false });
    const groupe = groupes[groupes.length - 1]!;
    groupe.numeros.push(lecture.numero);
    groupe.suite ||= lecture.suite;
    groupe.presences.push(lecture.presencePiste);
    if (lecture.pisteLue !== undefined) groupe.pistes.push(lecture.pisteLue);
  }

  return groupes.flatMap((groupe) => {
    const numero = vote(groupe.numeros);
    if (numero === undefined) return [];
    const piste = vote(groupe.pistes);
    const presence = groupe.presences.length === 0 ? 0 : Math.max(...groupe.presences);
    return [
      {
        y: Math.round(groupe.y * 1000) / 1000,
        numero: numero.valeur,
        ...(piste === undefined ? {} : { pisteLue: piste.valeur }),
        presencePiste: Math.round(presence * 100) / 100,
        suite: groupe.suite,
        accordNumero: Math.round(numero.accord * 100) / 100,
        accordPiste: piste === undefined ? 0 : Math.round(piste.accord * 100) / 100,
      },
    ];
  });
}
