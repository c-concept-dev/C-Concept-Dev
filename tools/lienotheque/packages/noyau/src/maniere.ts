import { Recette, type Recette as RecetteLue } from "@lienotheque/contrats";

/** Une manière de lire, telle qu'on la montre et telle qu'on l'écrit (REC-01, REC-03, REC-07).
 *
 *  On ne tape pas une recette : on montre à Liénothèque où regarder. L'écran trace des zones sur
 *  une page ; ce module les transforme en recette typée, et sait refaire le chemin inverse pour
 *  qu'une recette existante se rouvre et se corrige.
 *
 *  Le va-et-vient est la seule garantie qui vaille : si `depuisRecette(enRecette(b))` ne rend pas
 *  `b`, alors ouvrir puis enregistrer sans rien toucher abîme la manière de lire — et personne ne
 *  s'en apercevra avant le prochain traitement.
 *
 *  Rien ici ne connaît de domaine : des zones, des rangs, des hauteurs. */

/** Ce qu'une zone tracée désigne. Deux seulement, parce que le contrat ne sait situer que
 *  celles-là : le numéro imprimé de la page, et le numéro d'un élément. Le repère de piste, lui,
 *  ne se trace pas — il se cherche à côté de l'élément, et c'est `RepereDePiste` qui le dit. */
export type RoleZone = "page_imprimee" | "element";

/** La zone telle que la recette la décrit. Le contrat ne l'exporte pas sous ce nom : on la
 *  retrouve par les lectures qui en portent une — celle de la piste n'en a pas. */
type ZoneDeRecette = Extract<RecetteLue["lectures"][number], { zone: unknown }>["zone"];

export type Rectangle = { readonly x: number; readonly y: number; readonly l: number; readonly h: number };

export type ZoneTracee = {
  readonly cle: string;
  readonly role: RoleZone;
  readonly rectangle: Rectangle;
  /** Nom donné à ce qu'on lit là, quand l'administrateur en donne un. */
  readonly libelle?: string;
};

/** Le repère de piste, quand le document en porte un. Beaucoup n'en ont pas : il est alors
 *  absent, et rien n'est cherché — on ne devine pas une piste qui n'est pas écrite. */
export type RepereDePiste = {
  readonly position: "dessous" | "dessus" | "gauche" | "droite";
  readonly motif: "bloc_sombre_chiffres_clairs" | "losange_sombre_chiffres_clairs";
  readonly etiquetteDisque: boolean;
};

/** Ce que l'écran tient pendant qu'on trace. */
export type Brouillon = {
  readonly id: string;
  readonly version: number;
  /** La recette dont celle-ci dérive, quand on est parti d'une autre (REC-06). */
  readonly derivee?: { readonly id: string; readonly version: number };
  readonly zones: readonly ZoneTracee[];
  readonly piste?: RepereDePiste;
  /** La part de la hauteur de page qu'occupe un numéro d'élément, du plus petit au plus grand. */
  readonly hauteurElement: { readonly min: number; readonly max: number };
  readonly pageDouble: boolean;
  readonly redressement: "auto" | "aucun";
  readonly ordreElements: "strictement_croissant" | "croissant";
  readonly sautMax: number;
  readonly plusieursElementsParPiste: boolean;
  readonly seuil: number;
};

/** Ce qu'on propose avant que l'administrateur n'ait rien dit.
 *
 *  Les hauteurs viennent de ce qui a été mesuré sur les documents déjà lus ; ce sont des points
 *  de départ qu'on déplace, pas des constantes. */
export const BROUILLON_NEUF: Brouillon = {
  id: "ma-maniere-de-lire",
  version: 1,
  zones: [],
  hauteurElement: { min: 0.012, max: 0.04 },
  pageDouble: false,
  redressement: "auto",
  ordreElements: "strictement_croissant",
  sautMax: 6,
  plusieursElementsParPiste: true,
  seuil: 0.6,
};

/** Ce qui manque pour essayer, dit à qui le lit — ou rien si l'on peut lancer l'essai. */
export function manqueALaManiere(brouillon: Brouillon): string | undefined {
  const parRole = (role: RoleZone): number => brouillon.zones.filter((zone) => zone.role === role).length;
  if (parRole("element") === 0) return "Tracez d’abord la zone où se trouve le numéro d’un élément.";
  if (parRole("element") > 1) return "Une seule zone pour les numéros d’éléments : ils sont tous au même endroit.";
  if (parRole("page_imprimee") > 1) return "Une seule zone pour le numéro de page.";
  if (brouillon.hauteurElement.max <= brouillon.hauteurElement.min)
    return "La plus grande hauteur doit dépasser la plus petite.";
  for (const zone of brouillon.zones)
    if (zone.rectangle.l <= 0 || zone.rectangle.h <= 0) return "Une zone sans surface ne cherche nulle part.";
  return undefined;
}

/** Les zones deviennent une recette, validée par son contrat.
 *
 *  Elle lève si le brouillon est incomplet : l'écran le sait avant, par `manque`, et deux règles
 *  qui disent presque la même chose finissent par ne plus dire la même. */
export function enRecette(brouillon: Brouillon): RecetteLue {
  const premier = manqueALaManiere(brouillon);
  if (premier !== undefined) throw new Error(premier);

  const zoneDe = (zone: ZoneTracee): { type: "rectangle_rel"; x: number; y: number; l: number; h: number } => ({
    type: "rectangle_rel",
    x: zone.rectangle.x,
    y: zone.rectangle.y,
    l: zone.rectangle.l,
    h: zone.rectangle.h,
  });

  const lectures: unknown[] = [];
  for (const zone of brouillon.zones)
    if (zone.role === "page_imprimee") lectures.push({ ancre: "page_imprimee", zone: zoneDe(zone), alphabet: "chiffres" });

  for (const zone of brouillon.zones)
    if (zone.role === "element")
      lectures.push({
        ancre: "element",
        zone: zoneDe(zone),
        hauteur_rel: { min: brouillon.hauteurElement.min, max: brouillon.hauteurElement.max },
        alphabet: "chiffres",
        ...(zone.libelle === undefined || zone.libelle.trim() === "" ? {} : { libelle: zone.libelle.trim() }),
      });

  if (brouillon.piste !== undefined)
    lectures.push({
      ancre: "piste",
      outil: "pastilles",
      relatif_a: "element",
      position: brouillon.piste.position,
      motif: brouillon.piste.motif,
      etiquette_disque: brouillon.piste.etiquetteDisque,
    });

  return Recette.parse({
    id: brouillon.id,
    version: brouillon.version,
    derivee_de: brouillon.derivee === undefined ? null : { id: brouillon.derivee.id, version: brouillon.derivee.version },
    preparation: { redressement: brouillon.redressement, double_page: brouillon.pageDouble },
    lectures,
    regles: {
      elements: { ordre: brouillon.ordreElements, saut_max: brouillon.sautMax },
      ...(brouillon.piste === undefined ? {} : { pistes: { ordre: "croissant", pas_autorises: [0, 1] } }),
      plusieurs_elements_par_piste: brouillon.plusieursElementsParPiste,
    },
    validation: { seuil_confiance: brouillon.seuil },
  });
}

/** Une recette se rouvre dans l'éditeur, et s'y corrige.
 *
 *  Les zones que l'éditeur ne sait pas tracer — celles qu'une recette écrite à la main décrit par
 *  un bord ou une marge — reviennent en rectangles équivalents : mieux vaut une zone qu'on peut
 *  déplacer qu'une zone qu'on ne peut pas voir. */
export function depuisRecette(recette: RecetteLue): Brouillon {
  const zones: ZoneTracee[] = [];
  let piste: RepereDePiste | undefined;
  let hauteurElement = BROUILLON_NEUF.hauteurElement;

  for (const [rang, lecture] of recette.lectures.entries()) {
    if (lecture.ancre === "piste") {
      piste = { position: lecture.position, motif: lecture.motif, etiquetteDisque: lecture.etiquette_disque };
      continue;
    }
    if (lecture.ancre === "element") hauteurElement = lecture.hauteur_rel;
    zones.push({
      cle: `zone-${rang}`,
      role: lecture.ancre,
      rectangle: enRectangle(lecture.zone),
      ...(lecture.ancre === "element" && lecture.libelle !== undefined ? { libelle: lecture.libelle } : {}),
    });
  }

  return {
    id: recette.id,
    version: recette.version,
    ...(recette.derivee_de === null ? {} : { derivee: recette.derivee_de }),
    zones,
    ...(piste === undefined ? {} : { piste }),
    hauteurElement,
    pageDouble: recette.preparation.double_page,
    redressement: recette.preparation.redressement,
    ordreElements: recette.regles.elements.ordre,
    sautMax: recette.regles.elements.saut_max,
    plusieursElementsParPiste: recette.regles.plusieurs_elements_par_piste,
    seuil: recette.validation.seuil_confiance,
  };
}

/** Une zone de recette, ramenée au rectangle que l'éditeur sait montrer et déplacer.
 *
 *  Les deux formes anciennes décrivent une bande : les coins d'un bord, et les marges extérieures.
 *  On les rend telles qu'elles cherchent, pour qu'on voie où elles regardent. */
function enRectangle(zone: ZoneDeRecette): Rectangle {
  switch (zone.type) {
    case "rectangle_rel":
      return { x: zone.x, y: zone.y, l: zone.l, h: zone.h };
    case "coins":
      // Une bande sur toute la largeur, en haut ou en bas.
      return { x: 0, y: zone.bord === "haut" ? 0 : 0.9, l: 1, h: 0.1 };
    case "marges_exterieures":
      // Les deux marges, qu'un seul rectangle ne peut pas rendre : on montre celle de gauche,
      // et c'est elle qu'on déplace. Dire « une des deux » vaut mieux que ne rien montrer.
      return { x: 0, y: 0, l: zone.largeur_rel, h: 1 };
  }
}

/** Une version de plus, à chaque enregistrement (REC-03).
 *
 *  Une manière de lire qu'on corrige ne remplace pas la précédente : les lots déjà traités ont été
 *  lus avec celle d'avant, et il faut pouvoir dire laquelle. */
export function versionSuivante(brouillon: Brouillon): Brouillon {
  return {
    ...brouillon,
    version: brouillon.version + 1,
    derivee: { id: brouillon.id, version: brouillon.version },
  };
}
