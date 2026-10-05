import type { CotePage, Recette, ZoneRelative } from "@lienotheque/contrats";
import { COTE_MAX_RECADRAGE } from "@lienotheque/contrats";
import type { Boite, ImageGrise } from "@lienotheque/images";

/** Quels repères méritent une relecture ciblée, et quel rectangle en part (OUT-08).
 *
 *  Le constat qui commande tout, et il a coûté trois hypothèses réfutées : ce qui résiste n'est
 *  ni la détection du repère, ni les numéros de marge, mais **le second chiffre d'un repère qui
 *  en porte deux**. Les repères à un chiffre se lisent treize fois sur treize ; ceux à deux
 *  chiffres, neuf fois sur dix-neuf, et chaque échec est un chiffre perdu.
 *
 *  La sélection n'a donc rien à chercher. Le lecteur a déjà localisé le repère — `zoneRepere` —
 *  et compté les formes de la taille d'un chiffre qu'il montrait. Deux faits suffisent à décider,
 *  et aucun ne demande de regarder l'image à nouveau :
 *
 *  - **rien n'a été lu** alors qu'un repère est bien là ;
 *  - **le repère montre plus de chiffres que la lecture n'en rend**.
 *
 *  Tout le reste ne part pas. Un repère à un chiffre, lu, dont le compte répond à la lecture, est
 *  tenu pour juste et ne coûte rien.
 *
 *  Rien ici ne connaît de domaine : un candidat est un rectangle dans une page, et ce qu'il porte
 *  est un nombre. */

/** Un élément tel que la lecture l'a rendu, réduit à ce qui décide d'une relecture. */
export type ElementAsonder = {
  readonly numero: number;
  /** Hauteur sur la page, de 0 en haut à 1 en bas. */
  readonly y: number;
  /** Où le repère a été trouvé, en parts de la page. Absent, aucun repère n'a été vu assez
   *  franchement pour qu'on sache quoi recadrer — et il n'y a donc rien à envoyer. */
  readonly zoneRepere?: ZoneRelative | undefined;
  readonly pisteLue?: number | undefined;
  /** Combien de formes de la taille d'un chiffre le repère montrait. Absent quand la lecture n'a
   *  pas compté : on ne devine alors pas qu'elle est incomplète. */
  readonly chiffresComptes?: number | undefined;
};

export type PageAsonder = {
  readonly index: number;
  /** La page en gris, à sa résolution d'origine : c'est de là que le recadrage est pris. */
  readonly image: ImageGrise;
  /** Côté du cliché, quand il y a eu coupe. Reporté sur le candidat pour qu'on sache d'où il
   *  vient, sans quoi deux demi-pages d'un même cliché ne se distinguent pas. */
  readonly cote?: CotePage | undefined;
  readonly elements: readonly ElementAsonder[];
};

/** Pourquoi ce repère part. Deux motifs, et ils ne se valent pas : l'un dit qu'il manque tout,
 *  l'autre qu'il manque un chiffre. « Pourquoi ce lien » saura le dire en français. */
export type MotifDeRelecture = "sans_lecture" | "lecture_incomplete";

export type Candidat = {
  readonly page: number;
  readonly cote?: CotePage | undefined;
  readonly numero: number;
  readonly motif: MotifDeRelecture;
  /** Le repère lui-même, en pixels de la page. */
  readonly repere: Boite;
  /** Ce qui partira : le repère et une marge claire autour. */
  readonly recadrage: Boite;
};

/** Marge gardée autour du repère, en parts de sa hauteur.
 *
 *  Un chiffre collé au bord de l'image se lit mal, par un moteur comme par un modèle, et le pavé
 *  d'un repère est précisément bordé de sombre. On lui laisse donc de l'air — assez pour que la
 *  bordure du pavé ne soit plus le bord de l'image, pas assez pour y faire entrer le voisin. */
const MARGE_RELATIVE = 0.4;

const chiffresDe = (valeur: number | undefined): number => (valeur === undefined ? 0 : String(valeur).length);

/** Ce repère mérite-t-il une relecture, et pourquoi ?
 *
 *  `undefined` veut dire non, et c'est le cas de la plupart. Noter qu'aucun seuil de présence
 *  n'apparaît ici : `zoneRepere` n'est rendu par le lecteur que lorsqu'il a vu une forme franche,
 *  si bien que son existence porte déjà ce jugement. Le redoubler ici le ferait diverger. */
export function motifDeRelecture(element: ElementAsonder): MotifDeRelecture | undefined {
  if (element.zoneRepere === undefined) return undefined;
  if (element.pisteLue === undefined) return "sans_lecture";
  if ((element.chiffresComptes ?? 0) > chiffresDe(element.pisteLue)) return "lecture_incomplete";
  return undefined;
}

/** Le rectangle à envoyer pour un repère, ou `undefined` s'il ne peut pas tenir.
 *
 *  La marge est rognée jusqu'à ce que le résultat tienne dans ce que le contrat accepte, plutôt
 *  que d'abandonner le candidat : mieux vaut un pavé à l'étroit qu'un pavé qui ne part pas. Mais
 *  si le repère lui-même dépasse, on renonce — ce qui part d'ici est un repère, pas une page. */
export function recadrageDuRepere(zone: ZoneRelative, image: ImageGrise): Boite | undefined {
  const repere: Boite = {
    x: Math.round(zone.x * image.largeur),
    y: Math.round(zone.y * image.hauteur),
    l: Math.max(1, Math.round(zone.l * image.largeur)),
    h: Math.max(1, Math.round(zone.h * image.hauteur)),
  };
  if (repere.l > COTE_MAX_RECADRAGE || repere.h > COTE_MAX_RECADRAGE) return undefined;

  const souhaitee = Math.round(repere.h * MARGE_RELATIVE);
  const tenable = Math.min(
    souhaitee,
    Math.floor((COTE_MAX_RECADRAGE - repere.l) / 2),
    Math.floor((COTE_MAX_RECADRAGE - repere.h) / 2),
  );
  const marge = Math.max(0, tenable);

  const gauche = Math.max(0, repere.x - marge);
  const haut = Math.max(0, repere.y - marge);
  const droite = Math.min(image.largeur, repere.x + repere.l + marge);
  const bas = Math.min(image.hauteur, repere.y + repere.h + marge);
  return { x: gauche, y: haut, l: droite - gauche, h: bas - haut };
}

/** Les repères d'une page qui méritent une relecture, dans l'ordre de la page.
 *
 *  Le plafond par page vient de la recette, jamais du code : une page qui donne vingt candidats
 *  n'est pas une page dont on a mal lu deux repères, c'est une page qui ne se lit pas — et payer
 *  pour elle serait payer pour rien. On garde alors les premiers de la page, parce qu'un ordre
 *  arbitraire mais stable valait mieux qu'un classement qui prétendrait juger. */
export function candidatsDePage(page: PageAsonder, recette: Recette): Candidat[] {
  if (recette.vision === undefined) return [];

  const trouves: Candidat[] = [];
  for (const element of [...page.elements].sort((a, b) => a.y - b.y || a.numero - b.numero)) {
    const motif = motifDeRelecture(element);
    if (motif === undefined) continue;

    const recadrage = recadrageDuRepere(element.zoneRepere!, page.image);
    if (recadrage === undefined || recadrage.l <= 0 || recadrage.h <= 0) continue;

    trouves.push({
      page: page.index,
      ...(page.cote === undefined ? {} : { cote: page.cote }),
      numero: element.numero,
      motif,
      repere: {
        x: Math.round(element.zoneRepere!.x * page.image.largeur),
        y: Math.round(element.zoneRepere!.y * page.image.hauteur),
        l: Math.max(1, Math.round(element.zoneRepere!.l * page.image.largeur)),
        h: Math.max(1, Math.round(element.zoneRepere!.h * page.image.hauteur)),
      },
      recadrage,
    });
  }
  return trouves.slice(0, recette.vision.zones_max_par_page);
}
