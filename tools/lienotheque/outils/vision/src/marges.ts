import type { CotePage, Recette } from "@lienotheque/contrats";
import { formesSombres, recadrer, seuiller, type Boite, type ImageGrise } from "@lienotheque/images";
import type { Candidat } from "./candidats.js";

/** Les numéros d'élément que la lecture locale n'a pas rendus (OUT-08).
 *
 *  Ce détecteur vient du premier plan de relecture ciblée, où il visait **tout** le manque de F4.
 *  Trois mesures l'ont écarté de ce rôle : ce qui résistait était le second chiffre d'un repère,
 *  pas un numéro de marge. Il est repris ici dans un rôle bien plus étroit, celui qui lui revient
 *  — les éléments dont **aucun** numéro n'a été lu, et qui n'ont donc ni repère ni place connue.
 *  Il y en a quatre sur le corpus de référence, et sans eux quatre pistes restent orphelines.
 *
 *  Le principe n'a pas changé : une marge est presque blanche, un numéro y est une petite tache
 *  sombre, et cela se mesure sans moteur d'OCR. Tout est local et déterministe. */

/** Ce que la lecture a déjà rendu sur une page : on ne redemande pas ce qu'on sait. */
/** Deux hauteurs plus proches que cela parlent du même élément. Reprise de l'interpréteur, qui
 *  groupe ses lectures de la même façon : deux mesures du même endroit doivent se reconnaître. */
const MEME_HAUTEUR = 0.03;

export type DejaLu = {
  /** Hauteur sur la page, de 0 en haut à 1 en bas. */
  readonly y: number;
  readonly numero: number;
};


/** Ce qu'on garde autour de l'encre, en multiples de sa hauteur. Un chiffre collé au bord se lit
 *  mal — par un moteur d'OCR comme par un modèle. */
const MARGE_RECADRAGE = 1;

/** Part de la page qu'occupe la bande des numéros de page, en haut : on ne la sonde pas, ses
 *  chiffres ne sont pas des numéros d'élément. Même valeur que le lecteur de repères. */
const BANDE_NUMERO = 0.06;

/** Largeur maximale d'un numéro, en multiples de sa hauteur. « 189 » est large, une portée l'est
 *  beaucoup plus : c'est ce qui sépare un nombre d'un trait qui traverse la marge. */
const LARGEUR_MAX_RELATIVE = 3.5;

/** Largeur minimale, même mesure. Une barre de mesure a exactement la hauteur d'un chiffre et
 *  deux pixels de large : c'est le faux positif le plus courant d'une marge de partition, et
 *  c'est sa finesse qui le trahit. Un « 1 » seul reste au-dessus. */
const LARGEUR_MIN_RELATIVE = 0.18;

/** Part de la boîte qu'un chiffre noircit, au minimum.
 *
 *  Un chiffre remplit sa boîte ; un fragment de portée ou une queue de note la traverse en
 *  laissant presque tout blanc. La mesure est grossière exprès — on écarte le vide, on ne juge
 *  pas une forme. */
const ENCRE_MINIMALE = 0.12;

/** La bande de marge extérieure, en pixels.
 *
 *  `largeur_rel` vaut pour le cliché entier, pas pour la demi-page : c'est la correction déjà
 *  consignée après Westwood, et la refaire ici serait la refaire à moitié. Sur une page coupée,
 *  la même part de largeur occupe donc deux fois plus de la page qu'on regarde.
 *
 *  Sans côté connu, on prend les deux bords : on ne devine pas de quel côté était la reliure. */
export function bandesDeMarge(image: ImageGrise, largeurRel: number, cote?: CotePage | undefined): Boite[] {
  const haut = Math.round(image.hauteur * BANDE_NUMERO);
  const hauteur = image.hauteur - haut;
  const largeur = Math.max(1, Math.round(image.largeur * largeurRel * (cote === undefined ? 1 : 2)));

  if (cote === "gauche") return [{ x: 0, y: haut, l: largeur, h: hauteur }];
  if (cote === "droite") return [{ x: image.largeur - largeur, y: haut, l: largeur, h: hauteur }];
  return [
    { x: 0, y: haut, l: largeur, h: hauteur },
    { x: image.largeur - largeur, y: haut, l: largeur, h: hauteur },
  ];
}

/** Ton du fond d'une bande : la médiane approchée, pour ne pas se laisser mener par une tache. */
function tonDuFond(image: ImageGrise): number {
  if (image.pixels.length === 0) return 255;
  const paliers = new Uint32Array(256);
  for (const ton of image.pixels) paliers[ton] = (paliers[ton] ?? 0) + 1;
  let vus = 0;
  const milieu = image.pixels.length / 2;
  for (let ton = 0; ton < 256; ton += 1) {
    vus += paliers[ton]!;
    if (vus >= milieu) return ton;
  }
  return 255;
}

/** Les chiffres d'un même nombre sont des formes séparées : « 189 » en fait trois.
 *
 *  On les réunit quand ils se chevauchent en hauteur et se touchent presque en largeur. Sans
 *  cela, on enverrait trois recadrages pour un seul numéro — et chacun ne montrerait qu'un
 *  chiffre, ce qui ne se lit pas. */
type Ligne = { boite: Boite; pixels: number };

function reunirParLigne(formes: readonly { boite: Boite; pixels: number }[], ecartMax: number): Ligne[] {
  const lignes: Ligne[] = [];
  for (const forme of [...formes].sort((a, b) => a.boite.y - b.boite.y || a.boite.x - b.boite.x)) {
    const { boite } = forme;
    const ligne = lignes.find(({ boite: candidate }) => {
      const chevauche = boite.y < candidate.y + candidate.h && candidate.y < boite.y + boite.h;
      const proche = boite.x <= candidate.x + candidate.l + ecartMax && candidate.x <= boite.x + boite.l + ecartMax;
      return chevauche && proche;
    });
    if (ligne === undefined) {
      lignes.push({ boite: { ...boite }, pixels: forme.pixels });
      continue;
    }
    const x = Math.min(ligne.boite.x, boite.x);
    const y = Math.min(ligne.boite.y, boite.y);
    const droite = Math.max(ligne.boite.x + ligne.boite.l, boite.x + boite.l);
    const bas = Math.max(ligne.boite.y + ligne.boite.h, boite.y + boite.h);
    lignes[lignes.indexOf(ligne)] = { boite: { x, y, l: droite - x, h: bas - y }, pixels: ligne.pixels + forme.pixels };
  }
  return lignes;
}

export type OptionsMarges = {
  /** Plafond par page, pris dans la recette. */
  readonly maxParPage?: number;
};

/** Les endroits d'une marge qui portent de l'encre là où rien n'a été lu.
 *
 *  Chaque candidat demande un **nombre**, pas un verdict de repère : on ne cherche pas ici si un
 *  cartouche est là, mais quel numéro un élément porte. */
export function margesSansLecture(page: PageAmarges, recette: Recette, options: OptionsMarges = {}): Candidat[] {
  const lecture = recette.lectures.find((entree) => entree.ancre === "element");
  if (lecture === undefined || lecture.zone.type !== "marges_exterieures") return [];

  const hauteurMin = page.image.hauteur * lecture.hauteur_rel.min;
  const hauteurMax = page.image.hauteur * lecture.hauteur_rel.max;
  const trouves: Candidat[] = [];

  for (const bande of bandesDeMarge(page.image, lecture.zone.largeur_rel, page.cote)) {
    const vue = recadrer(page.image, bande);
    if (vue.largeur === 0 || vue.hauteur === 0) continue;

    // Le seuil suit le fond de la bande : un cliché sombre et un cliché clair ne se seuillent pas
    // pareil, et une valeur fixe ne vaudrait que pour le lot qui l'a vue naître.
    const binaire = seuiller(vue, Math.max(1, Math.round(tonDuFond(vue) * 0.72)));
    const retenues = formesSombres(binaire).filter((forme) => forme.boite.h >= hauteurMin * 0.6 && forme.boite.h <= hauteurMax * 1.4);

    for (const { boite: ligne, pixels } of reunirParLigne(retenues, hauteurMax)) {
      if (ligne.h < hauteurMin || ligne.h > hauteurMax) continue;
      if (ligne.l > ligne.h * LARGEUR_MAX_RELATIVE) continue;
      if (ligne.l < ligne.h * LARGEUR_MIN_RELATIVE) continue;
      if (pixels < ligne.l * ligne.h * ENCRE_MINIMALE) continue;

      const encre: Boite = { x: bande.x + ligne.x, y: bande.y + ligne.y, l: ligne.l, h: ligne.h };
      const yRelatif = (encre.y + encre.h / 2) / page.image.hauteur;
      if (page.dejaLus.some((lu) => Math.abs(lu.y - yRelatif) < MEME_HAUTEUR)) continue;

      const marge = Math.round(encre.h * MARGE_RECADRAGE);
      const haut = Math.max(0, encre.y - marge);
      trouves.push({
        page: page.index,
        ...(page.cote === undefined ? {} : { cote: page.cote }),
        // Le numéro n'est pas connu — c'est ce qu'on vient demander. On le désigne par sa place,
        // en millièmes de la hauteur de page : stable d'un rejeu à l'autre, et unique sur la page.
        numero: Math.round(yRelatif * 1000),
        motif: "sans_lecture",
        cherche: "numero",
        repere: encre,
        // Toute la largeur de la bande : le numéro est fer à droite dans sa marge, et le montrer
        // seul priverait le modèle de ce qui dit que c'est bien une marge.
        recadrage: { x: bande.x, y: haut, l: bande.l, h: Math.min(page.image.hauteur - haut, encre.h + marge * 2) },
      });
    }
  }

  const max = options.maxParPage;
  if (max === undefined || trouves.length <= max) return trouves;
  // Les plus hautes d'abord : un numéro bien formé occupe toute la hauteur permise, une bavure
  // non. Puis par position, pour qu'un rejeu rende le même ordre.
  return [...trouves]
    .sort((a, b) => b.repere.h - a.repere.h || a.repere.y - b.repere.y)
    .slice(0, max)
    .sort((a, b) => a.repere.y - b.repere.y || a.repere.x - b.repere.x);
}

/** Une page dont on sonde les marges, et ce qu'on y a déjà lu. */
export type PageAmarges = {
  readonly index: number;
  readonly image: ImageGrise;
  readonly cote?: CotePage | undefined;
  readonly dejaLus: readonly DejaLu[];
};
