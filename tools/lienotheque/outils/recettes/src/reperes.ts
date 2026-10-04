import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CotePage, ElementRepere, LectureRepere, MotLu, Recette, ZoneRelative } from "@lienotheque/contrats";
import {
  agrandir,
  boiteSombre,
  border,
  formesSombres,
  inverser,
  recadrer,
  remplissage,
  seuiller,
  versPgm,
  type Boite,
  type FormeSombre,
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

/** Un seul dossier de travail par exécution, et chaque image effacée dès qu'elle a été lue.
 *
 *  Un lot de trois cents pages demande des dizaines de milliers de lectures ; en garder les
 *  images remplirait le disque, et c'est arrivé. Le dossier se crée à la première lecture et pas
 *  avant : un programme qui ne lit rien ne laisse rien. */
let dossierDeTravail: string | undefined;
let compteur = 0;

function ocr(image: ImageGrise, segmentation: number, options: OptionsReperes, alphabet?: string): readonly MotLu[] {
  if (image.largeur === 0 || image.hauteur === 0) return [];
  dossierDeTravail ??= mkdtempSync(join(tmpdir(), "lienotheque-reperes-"));
  const chemin = join(options.dossier ?? dossierDeTravail, `repere-${(compteur += 1)}.pgm`);
  writeFileSync(chemin, versPgm(image));
  try {
    // L'index de page ne veut rien dire sur un recadrage : 1 suffit au contrat.
    return lireParOcr(chemin, image.largeur, image.hauteur, 1, {
      segmentation,
      ...(options.binaire === undefined ? {} : { binaire: options.binaire }),
      ...(options.tessdata === undefined ? {} : { tessdata: options.tessdata }),
      ...(options.langue === undefined ? {} : { langue: options.langue }),
      ...(alphabet === undefined ? {} : { alphabet }),
    }).mots;
  } finally {
    rmSync(chemin, { force: true });
  }
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
      // La recette décrit la page telle que le document la présente — pour un livre photographié
      // en doubles pages, c'est le cliché entier. Une page coupée en est la moitié : la même
      // marge y occupe donc deux fois la part de largeur.
      const large = image.largeur * zone.largeur_rel * (cote === undefined ? 1 : 2);
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
    // Sous le numéro, la fenêtre s'aligne sur son **bord droit** et s'étend vers la gauche : les
    // numéros sont composés fer à droite dans leur marge, et le repère suit leur alignement.
    case "dessous":
      return { x: boite.x + boite.l - h * 2.6, y: boite.y + h * 1.05, l: h * 2.9, h: h * 1.65 };
    case "dessus":
      return { x: boite.x + boite.l - h * 2.6, y: boite.y - marge - h * 1.65, l: h * 2.9, h: h * 1.65 };
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
 *  On ne mesure pas la fenêtre de recherche — sa taille est arbitraire et varie d'une recette à
 *  l'autre — mais **la forme sombre qu'on y trouve**. Deux choses la caractérisent : elle est
 *  pleine, et elle est à la taille du numéro qu'elle accompagne.
 *
 *  Un losange est à demi plein de son cadre, un bloc presque entièrement ; des portées et des
 *  notes donnent au contraire une boîte très large et presque vide. C'est ce qui les sépare, et
 *  cela ne dépend pas de la largeur qu'on a bien voulu regarder. */
export function presenceDeForme(zone: ImageGrise, forme: Boite | undefined, hauteurNumero: number): number {
  if (forme === undefined || forme.l === 0 || forme.h === 0) return 0;
  // Une forme démesurée par rapport au numéro n'est pas un repère, c'est le document.
  if (forme.h > hauteurNumero * 3.5 || forme.l > hauteurNumero * 7) return 0;

  const clair = Math.max(1, tonClair(zone));
  const sombre = clair * 0.55;
  let pleins = 0;
  for (let y = forme.y; y < forme.y + forme.h; y += 1)
    for (let x = forme.x; x < forme.x + forme.l; x += 1)
      if (zone.pixels[y * zone.largeur + x]! < sombre) pleins += 1;

  const remplissage = pleins / (forme.l * forme.h);
  const taille = Math.min(1, forme.h / (hauteurNumero * 1.1));
  return Math.round(Math.min(1, remplissage * taille) * 100) / 100;
}

/** Vote majoritaire sur des lectures de chiffres.
 *
 *  À égalité de voix, la valeur la plus longue l'emporte quand l'autre en est la fin : « 13 » lu
 *  « 3 » est l'échec courant d'un moteur d'OCR — il perd le chiffre de tête, collé au bord du
 *  pavé —, tandis qu'inventer un chiffre est rare. Hors de ce cas, la plus petite, pour que deux
 *  exécutions s'accordent toujours. */
export function vote(valeurs: readonly number[]): { valeur: number; accord: number } | undefined {
  if (valeurs.length === 0) return undefined;
  const comptes = new Map<number, number>();
  for (const valeur of valeurs) comptes.set(valeur, (comptes.get(valeur) ?? 0) + 1);

  const tries = [...comptes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const voix = tries[0]![1];
  const exaequo = tries.filter(([, nombre]) => nombre === voix).map(([valeur]) => valeur);

  let retenue = exaequo[0]!;
  for (const valeur of exaequo)
    if (valeur !== retenue && String(valeur).endsWith(String(retenue))) retenue = valeur;

  return { valeur: retenue, accord: voix / valeurs.length };
}

export type BlocPiste = { readonly presence: number; readonly votes: readonly number[] };

/** Seuils tentés sur le bloc, en part du ton clair local. Plusieurs seuils, plusieurs lectures :
 *  un chiffre clair sur fond sombre ne se détache pas au même endroit selon la lumière. */
const SEUILS = [0.45, 0.6, 0.75] as const;
/** En deçà, une forme est un trait ou une lettre, pas un pavé. Un losange occupe la moitié de sa
 *  boîte, un bloc les trois quarts ; un « C », un « D » ou une ligne de portée, bien moins. */
const REMPLISSAGE_MINIMAL = 0.45;

/** Parts du repère, prises depuis la droite, quand une étiquette l'accompagne.
 *
 *  Le pavé entier d'abord : l'étiquette est une forme à part, et le choix de forme l'a déjà
 *  écartée. Les parts qui suivent ne servent que si elle s'est collée au pavé malgré tout. */
const PARTS_ETIQUETTE = [1, 0.75, 0.6] as const;

/** En deçà, il n'y a pas de repère à lire : inutile de faire travailler l'OCR sur du papier.
 *
 *  Relevé sur les deux corpus : là où un repère existe, la mesure donne 0,33 à 0,48 selon qu'il
 *  est losange ou bloc ; là où il n'y en a pas, elle donne 0. La séparation est franche, et ce
 *  seuil se tient au milieu. C'est aussi lui qui rend un lot de 286 pages abordable : la plupart
 *  des éléments n'ouvrent aucune piste. */
export const PRESENCE_MINIMALE = 0.25;

/** Les formes qui peuvent porter le chiffre, de la plus probable à la moins.
 *
 *  On ne parie pas sur une seule. À côté du chiffre il y a souvent une étiquette — « CD1 Piste »
 *  — imprimée en sombre sur clair, et des portées qui traversent la fenêtre ; selon la page, le
 *  chiffre est une forme à part, ou collé à son voisinage. On propose donc, dans l'ordre :
 *
 *  1. la plus **pleine** des formes à la taille du numéro — un pavé occupe sa boîte, une lettre
 *     ou un trait non ;
 *  2. la plus **grande** d'un seul tenant ;
 *  3. la boîte de tout ce qui est sombre, en dernier ressort.
 *
 *  Chacune est lue, et c'est le vote qui tranche. Mieux vaut trois lectures dont deux fausses
 *  qu'une seule qui manque. */
export function formesCandidates(binaire: ImageGrise, hauteurNumero: number): Boite[] {
  const formes = formesSombres(binaire);
  const candidates: Boite[] = [];
  const ajouter = (boite: Boite | undefined): void => {
    if (boite === undefined || boite.l === 0 || boite.h === 0) return;
    if (candidates.some((vue) => vue.x === boite.x && vue.y === boite.y && vue.l === boite.l && vue.h === boite.h)) return;
    candidates.push(boite);
  };

  let laPlusPleine: { forme: FormeSombre; plein: number } | undefined;
  let laPlusGrande: FormeSombre | undefined;
  for (const forme of formes) {
    if (laPlusGrande === undefined || forme.pixels > laPlusGrande.pixels) laPlusGrande = forme;
    const { h, l } = forme.boite;
    if (h < hauteurNumero * 0.5 || h > hauteurNumero * 3 || l > hauteurNumero * 7) continue;
    const plein = remplissage(forme);
    if (plein < REMPLISSAGE_MINIMAL) continue;
    if (
      laPlusPleine === undefined ||
      plein > laPlusPleine.plein + 0.05 ||
      (Math.abs(plein - laPlusPleine.plein) <= 0.05 && forme.pixels > laPlusPleine.forme.pixels)
    )
      laPlusPleine = { forme, plein };
  }

  ajouter(laPlusPleine?.forme.boite);
  ajouter(laPlusGrande?.boite);
  ajouter(boiteSombre(binaire));
  return candidates;
}

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

  const clair = Math.max(1, tonClair(zone));
  const binaire = seuiller(zone, Math.round(clair * 0.55));
  const candidates = formesCandidates(binaire, boite.h);
  const presence = presenceDeForme(zone, candidates[0], boite.h);
  if (presence < PRESENCE_MINIMALE) return { presence, votes: [] };

  const losange = motif === "losange_sombre_chiffres_clairs";
  const votes: number[] = [];

  for (const forme of candidates) {
    if (forme.l < boite.h * 0.6) continue;
    // Les coins d'un losange sont du fond : les garder mettrait des pointes noires autour des
    // chiffres. Un pavé se prend entier — le rogner fait perdre les chiffres qui touchent sa
    // bordure, et un chiffre de tête perdu reste un appui partiel pour la suite.
    const dx = losange ? Math.round(forme.l * 0.2) : 0;
    const dy = losange ? Math.round(forme.h * 0.22) : 0;
    const bloc = recadrer(zone, { x: forme.x + dx, y: forme.y + dy, l: forme.l - dx * 2, h: forme.h - dy * 2 });
    if (bloc.largeur === 0 || bloc.hauteur === 0) continue;

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
        // La boîte du numéro, ramenée en part de la page. Elle est mesurée sur l'image agrandie
        // de cette passe : ses pixels ne veulent rien dire ailleurs, sa part si. C'est elle que
        // le Lecteur cadre, et c'est de là que part le fil vers le segment.
        zone: {
          x: Math.min(1, Math.max(0, boite.x / agrandie.largeur)),
          y: Math.min(1, Math.max(0, boite.y / agrandie.hauteur)),
          l: Math.min(1, Math.max(Number.EPSILON, boite.l / agrandie.largeur)),
          h: Math.min(1, Math.max(Number.EPSILON, boite.h / agrandie.hauteur)),
        },
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

/** Ce que porte une lecture. À incrémenter dès qu'une lecture dit quelque chose de nouveau.
 *
 *  Le cache de lecture garde un lot lu pendant un quart d'heure d'OCR, et sa clef désignait le
 *  document et la recette — pas ce que le lecteur en tire. Ajouter la zone de chaque repère n'a
 *  donc rien changé : les lectures gardées, qui n'en portaient pas, continuaient d'être servies,
 *  et les zones n'arrivaient nulle part sans qu'une seule erreur ne le dise. Un cache qui ne
 *  connaît pas la forme de ce qu'il garde finit par servir le passé. */
export const VERSION_LECTURE = 2;

/** Hauteur en deçà de laquelle deux lectures parlent du même élément. */
const MEME_HAUTEUR = 0.03;

/** Regroupe les lectures par hauteur et vote. Deux votes séparés : le numéro d'élément et celui
 *  de la piste — l'un peut être sûr quand l'autre ne l'est pas. */
export function consolider(lectures: readonly LectureRepere[]): ElementRepere[] {
  const groupes: {
    y: number;
    numeros: number[];
    pistes: number[];
    presences: number[];
    suite: boolean;
    zones: { numero: number; zone: ZoneRelative }[];
  }[] = [];

  for (const lecture of [...lectures].sort((a, b) => a.y - b.y || a.numero - b.numero)) {
    const dernier = groupes[groupes.length - 1];
    if (dernier === undefined || Math.abs(dernier.y - lecture.y) >= MEME_HAUTEUR)
      groupes.push({ y: lecture.y, numeros: [], pistes: [], presences: [], suite: false, zones: [] });
    const groupe = groupes[groupes.length - 1]!;
    groupe.numeros.push(lecture.numero);
    groupe.suite ||= lecture.suite;
    groupe.presences.push(lecture.presencePiste);
    if (lecture.pisteLue !== undefined) groupe.pistes.push(lecture.pisteLue);
    if (lecture.zone !== undefined) groupe.zones.push({ numero: lecture.numero, zone: lecture.zone });
  }

  return groupes.flatMap((groupe) => {
    const numero = vote(groupe.numeros);
    if (numero === undefined) return [];
    const piste = vote(groupe.pistes);
    const presence = groupe.presences.length === 0 ? 0 : Math.max(...groupe.presences);
    // La zone de la lecture qui a emporté le vote, pas la moyenne des zones : deux passes qui
    // ne lisent pas le même numéro ne désignent pas le même endroit, et leur milieu ne désigne
    // rien du tout.
    const zone = groupe.zones.find((candidate) => candidate.numero === numero.valeur)?.zone;
    return [
      {
        y: Math.round(groupe.y * 1000) / 1000,
        ...(zone === undefined ? {} : { zone }),
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
