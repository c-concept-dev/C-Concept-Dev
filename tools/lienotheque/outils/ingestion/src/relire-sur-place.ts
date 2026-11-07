import type { ImageGrise } from "@lienotheque/images";
import type { DemandeDeRelecture, RelecteurDeZone } from "./relire-les-zones.js";

/** A2 — relire une case sur place, sans quitter la machine (OUT-05, OUT-10).
 *
 *  ## Le défaut que ce module existe pour empêcher
 *
 *  Mesuré le 6 novembre 2026 sur les cases abîmées d'une vraie table : **une lecture isolée rend
 *  des nombres parfaitement formés et parfaitement faux** — « 171 » pour un 13, « 327 » pour un
 *  32, « 710 » pour un 110. Rien dans le nombre rendu ne dit qu'il est faux, et le poser dans
 *  une table produirait un lien juste d'apparence.
 *
 *  ## Ce qui le remplace
 *
 *  Quatre façons de regarder la même case, et **rien n'est rendu sans l'accord de deux d'entre
 *  elles**. Deux manières ne se trompent pas de la même façon ; leur accord est un fait, là où
 *  une lecture seule n'est qu'une opinion. C'est le seuil du vote des marques, et pour la même
 *  raison.
 *
 *  Sur vingt-deux cases réelles : trois valeurs retenues, **zéro contradiction**, dix-neuf
 *  abstentions — et les trois retenues étaient exactes, vérifiées sur la page imprimée. Les
 *  dix-neuf qui restent sans accord sont **la seule dépense qu'un appel en ligne mérite**.
 *
 *  ## Ce qui n'est pas calibré ici
 *
 *  Les segmentations sont celles que l'outil nomme — une ligne, un mot, un bloc —, pas des
 *  réglages trouvés sur un document. L'agrandissement est une **duplication de pixels** : il
 *  n'invente rien, il donne seulement plus de surface à qui découpe en tuiles. */

/** Une façon de regarder une case : comment l'outil doit segmenter, et de combien agrandir. */
export type ManiereDeRegarder = { readonly segmentation: number; readonly grossir: number };

/** Les quatre manières, de la plus proche de la lecture d'origine à la plus insistante. */
export const MANIERES_DE_REGARDER: readonly ManiereDeRegarder[] = [
  { segmentation: 7, grossir: 1 },
  { segmentation: 8, grossir: 1 },
  { segmentation: 8, grossir: 3 },
  { segmentation: 6, grossir: 3 },
];

/** Combien de manières doivent lire le même nombre pour qu'il soit rendu. */
export const ACCORD_MINIMAL = 2;

/** Lire un morceau d'image. C'est un port : la chaîne y met sa reconnaissance, les contrôles y
 *  mettent ce qu'ils veulent éprouver. Sans cela, rien de ce module ne serait éprouvable là où
 *  l'outil de reconnaissance manque — c'est-à-dire sur l'intégration continue. */
export type LecteurDeMorceau = (morceau: ImageGrise, segmentation: number) => string;

export type ReleveDeRelectureLocale = {
  readonly appels: number;
  readonly secondes: number;
  /** Les cases qu'aucune paire de manières n'a su lire. **Ce sont elles, et elles seules, qu'un
   *  appel en ligne mérite** : sur les autres, il paierait ce qui est déjà acquis. */
  readonly sansAccord: number;
};

/** Découpe une boîte de l'image et l'agrandit par duplication de pixels.
 *
 *  Aucune valeur neuve n'apparaît : agrandir ne crée pas d'information, il donne de la surface.
 *  La boîte est ramenée dans l'image — une zone qui déborde est tronquée, jamais complétée. */
export function decouperEtGrossir(
  image: ImageGrise,
  boite: { readonly x: number; readonly y: number; readonly l: number; readonly h: number },
  grossir: number,
): ImageGrise {
  const x0 = Math.max(0, Math.floor(boite.x));
  const y0 = Math.max(0, Math.floor(boite.y));
  const x1 = Math.min(image.largeur, Math.ceil(boite.x + boite.l));
  const y1 = Math.min(image.hauteur, Math.ceil(boite.y + boite.h));
  const largeur = Math.max(1, x1 - x0) * grossir;
  const hauteur = Math.max(1, y1 - y0) * grossir;
  const pixels = new Uint8Array(largeur * hauteur);
  for (let y = 0; y < hauteur; y += 1)
    for (let x = 0; x < largeur; x += 1)
      pixels[y * largeur + x] =
        image.pixels[(y0 + Math.floor(y / grossir)) * image.largeur + (x0 + Math.floor(x / grossir))] ?? 255;
  return { largeur, hauteur, pixels };
}

/** Un nombre seul, et rien d'autre. Un texte qui porte autre chose n'a pas été lu : il a été
 *  deviné, et deviner est ce que ce module refuse. */
const UN_NOMBRE_SEUL = /^\d+[.,:;]?$/;

/** Un relecteur qui ne quitte pas la machine, et son relevé.
 *
 *  `imageDeLaPage` rend la page en gris, à la résolution où les zones ont été mesurées — une
 *  autre résolution déplacerait les boîtes. `undefined` quand la page n'est pas disponible :
 *  alors rien n'est lu, et aucun appel n'est fait. */
export function relecteurSurPlace(
  imageDeLaPage: (page: number) => ImageGrise | undefined,
  lire: LecteurDeMorceau,
  manieres: readonly ManiereDeRegarder[] = MANIERES_DE_REGARDER,
): { readonly relire: RelecteurDeZone; readonly releve: () => ReleveDeRelectureLocale } {
  let appels = 0;
  let millisecondes = 0;
  let sansAccord = 0;

  const relire: RelecteurDeZone = async (demande: DemandeDeRelecture) => {
    const image = imageDeLaPage(demande.page);
    if (image === undefined) {
      sansAccord += 1;
      return undefined;
    }
    const parValeur = new Map<number, number>();
    for (const maniere of manieres) {
      const morceau = decouperEtGrossir(image, demande, maniere.grossir);
      const debut = Date.now();
      const texte = lire(morceau, maniere.segmentation).trim();
      millisecondes += Date.now() - debut;
      appels += 1;
      if (!UN_NOMBRE_SEUL.test(texte)) continue;
      const valeur = Number.parseInt(texte, 10);
      parValeur.set(valeur, (parValeur.get(valeur) ?? 0) + 1);
    }
    const accordees = [...parValeur.entries()].filter(([, combien]) => combien >= ACCORD_MINIMAL);
    // Une seule valeur peut l'emporter. Deux valeurs également soutenues, c'est une
    // contradiction — et une contradiction doit faire reculer, jamais choisir.
    if (accordees.length !== 1) {
      sansAccord += 1;
      return undefined;
    }
    return String(accordees[0]![0]);
  };

  return {
    relire,
    releve: () => ({ appels, secondes: Number((millisecondes / 1000).toFixed(3)), sansAccord }),
  };
}
