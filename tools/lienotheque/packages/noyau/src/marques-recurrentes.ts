import type { Observation } from "@lienotheque/contrats";

/** Trouver où sont les marques, sans qu'une manière de lire le dise (OUT-10).
 *
 *  ## Le dernier trou du socle
 *
 *  Le moteur savait assembler des observations ; il ne savait pas les **obtenir**. Les lecteurs
 *  de marques existants demandent qu'on leur donne la zone où chercher — et cette zone vient
 *  d'une manière de lire écrite à la main. Tant que c'est le cas, « le moteur retrouve les liens
 *  tout seul » reste à moitié vrai : il les assemble seul, il ne les voit pas seul.
 *
 *  ## Ce qu'on cherche, et comment
 *
 *  Une marque de repère est une forme sombre **qui revient**, et qui revient *la même*. Elle
 *  revient soit toujours au même endroit d'une page à l'autre — un cartouche d'en-tête, un folio
 *  de coin —, soit à la même abscisse mais à des hauteurs différentes, une fois par élément.
 *
 *  On ne cherche donc ni un losange, ni un rectangle, ni rien qui ressemble à une forme connue :
 *  **on cherche une régularité**. C'est ce qui permet à ce détecteur de rencontrer une marque
 *  qu'il n'a jamais vue, et c'est aussi ce qui le rend aveugle à une marque qui ne se répète
 *  pas — limite assumée, et dite.
 *
 *  ## La taille d'abord, l'abscisse ensuite
 *
 *  Première version, et sa faute, mesurée sur les vraies pages de F3 le 29 octobre 2026 : les
 *  formes étaient groupées par abscisse, en enchaînant les voisines. Sur une page dense, cela
 *  soude tout. Dans la marge gauche de F3 il y a, par élément, **une marque de 4,3 % × 3,2 % de
 *  la page** et, un centième de page plus bas, **les neuf ou dix lettres de son libellé, de
 *  0,5 % à 1,1 % de large**, étalées de 7,6 % à 16,8 % de la largeur. Deux abscisses voisines ne
 *  sont jamais écartées de plus de 3 % : la chaîne a donc fondu le libellé et la marque en une
 *  seule bande de 24 % de large, dont les tailles allaient du simple au septuple — et la bande a
 *  été écartée comme instable. **Le signe était là, trouvé, et jeté avec le reste.**
 *
 *  D'où l'ordre retenu : « le même signe répété » se juge d'abord **sur la taille**. Une forme de
 *  4,3 % et une forme de 0,6 % ne sont pas le même signe, quelle que soit leur abscisse. On part
 *  donc de la forme qui a le plus de semblables — même taille *et* même abscisse —, on en fait un
 *  groupe, on le retire, et on recommence. Pas d'enchaînement, donc pas de soudure.
 *
 *  ## Ce qu'il ne fait pas
 *
 *  Il ne lit rien. Il désigne des endroits où regarder, à charge pour une reconnaissance d'y
 *  lire ce qui s'y trouve, et au calibrateur de refuser ce que les pixels ne confirment pas.
 *  Une zone proposée n'est pas une zone validée. */

/** Une forme sombre vue sur une page, en parts de la page (0 à 1). */
export type FormeObservee = {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly l: number;
  readonly h: number;
};

/** Quel côté une marque peut avoir, au plus et au moins, en part de la page.
 *
 *  En deçà, c'est du grain de numérisation ou un point de ponctuation : il y en a des milliers et
 *  aucun ne désigne quoi que ce soit. Au-delà, c'est un bloc de texte ou une illustration — cela
 *  ne se lit pas comme un repère.
 *
 *  Bornes sur **le côté** et non sur l'aire : une marque occupant 1,2 % d'un côté n'est que
 *  0,014 % de l'aire, et un plancher posé sur l'aire la refusait. Mesuré en écrivant les épreuves
 *  de ce module : six sur douze échouaient pour cette seule raison.
 *
 *  Les bornes sont larges exprès : resserrer sur ce qu'on connaît déjà serait refaire une manière
 *  de lire écrite à la main, sous un autre nom. */
export const COTE_MINIMAL = 0.004;
export const COTE_MAXIMAL = 0.15;

/** De combien deux tailles peuvent différer et désigner le même signe.
 *
 *  Mesuré sur F3 : la marque fait 4,3 à 4,4 % de large d'une page à l'autre — un rapport de 1,02.
 *  Les lettres de son libellé font 0,5 à 1,1 % — face à la marque, un rapport de sept. Un et
 *  demi sépare les deux sans trancher dans ni l'un ni l'autre. */
const RAPPORT_DE_TAILLE = 1.5;

/** De combien deux abscisses peuvent différer et désigner la même colonne de marques. */
const MEME_ABSCISSE = 0.03;
/** De combien deux ordonnées peuvent différer et désigner le même endroit. */
const MEME_ORDONNEE = 0.03;

/** Sur quelle part des pages une marque doit revenir pour qu'on la tienne pour régulière.
 *
 *  La moitié, et pas davantage : un recueil porte des pages de garde, des intercalaires, des
 *  planches. Exiger la quasi-totalité écarterait les marques des documents les plus ordinaires. */
export const PART_DES_PAGES = 0.5;

export type ZoneRecurrente = {
  /** La boîte englobant toutes les apparitions, en parts de la page. */
  readonly x: number;
  readonly y: number;
  readonly l: number;
  readonly h: number;
  readonly pages: readonly number[];
  /** `fixe` : toujours au même endroit. `verticale` : même abscisse, hauteurs différentes. */
  readonly repetition: "fixe" | "verticale";
  /** Chaque apparition, avec sa page et sa boîte.
   *
   *  Pas seulement leur nombre : une reconnaissance doit aller lire **là**, dans la boîte d'une
   *  apparition, et non dans la bande qui les englobe toutes — sur F3 cette bande est dix fois
   *  plus large qu'une marque, et tout ce qui la traverse y entrerait avec. */
  readonly apparitions: readonly FormeObservee[];
  /** La taille typique du signe, en parts de la page : ce qu'une reconnaissance doit y attendre. */
  readonly taille: { readonly l: number; readonly h: number };
};

const memeTaille = (un: FormeObservee, autre: FormeObservee): boolean =>
  Math.max(un.l, autre.l) <= Math.min(un.l, autre.l) * RAPPORT_DE_TAILLE &&
  Math.max(un.h, autre.h) <= Math.min(un.h, autre.h) * RAPPORT_DE_TAILLE;

const memeSigne = (un: FormeObservee, autre: FormeObservee): boolean =>
  memeTaille(un, autre) && Math.abs(un.x - autre.x) <= MEME_ABSCISSE;

/** Combien d'endroits distincts, en hauteur, un groupe occupe. */
const endroits = (groupe: readonly FormeObservee[]): number => {
  let combien = 0;
  let precedente: number | undefined;
  for (const forme of [...groupe].sort((un, autre) => un.y - autre.y)) {
    if (precedente === undefined || forme.y - precedente > MEME_ORDONNEE) combien += 1;
    precedente = forme.y;
  }
  return combien;
};

const mediane = (valeurs: readonly number[]): number => {
  const triees = [...valeurs].sort((un, autre) => un - autre);
  return triees[Math.floor(triees.length / 2)] ?? 0;
};

/** Les endroits où un même signe revient, page après page.
 *
 *  `pagesRegardees` est demandé séparément : une marque présente sur quatre pages sur six n'a pas
 *  le même sens qu'une marque présente sur quatre pages sur deux cents, et compter les pages où
 *  l'on a trouvé quelque chose plutôt que celles qu'on a regardées fausserait la mesure dans le
 *  sens rassurant. */
export function zonesRecurrentes(
  formes: readonly FormeObservee[],
  pagesRegardees: number,
): readonly ZoneRecurrente[] {
  if (pagesRegardees <= 0) return [];
  let restantes = formes.filter(
    (forme) =>
      forme.l >= COTE_MINIMAL && forme.h >= COTE_MINIMAL && forme.l <= COTE_MAXIMAL && forme.h <= COTE_MAXIMAL,
  );
  const minimum = Math.max(2, Math.ceil(pagesRegardees * PART_DES_PAGES));
  const zones: ZoneRecurrente[] = [];

  // On part à chaque tour de la forme qui a le plus de semblables, on en fait un groupe, on le
  // retire, et on recommence. Dès que la meilleure n'a plus assez de semblables pour couvrir le
  // minimum de pages, aucune des suivantes ne pourra : on s'arrête là.
  while (restantes.length >= minimum) {
    let graine: FormeObservee | undefined;
    let meilleur: FormeObservee[] = [];
    for (const candidate of restantes) {
      const semblables = restantes.filter((forme) => memeSigne(candidate, forme));
      if (semblables.length > meilleur.length) {
        graine = candidate;
        meilleur = semblables;
      }
    }
    if (graine === undefined || meilleur.length < minimum) break;

    const sesPages = [...new Set(meilleur.map((forme) => forme.page))].sort((un, autre) => un - autre);
    const retire = new Set(meilleur);
    restantes = restantes.filter((forme) => !retire.has(forme));
    if (sesPages.length < minimum) continue;

    const x = Math.min(...meilleur.map((forme) => forme.x));
    const y = Math.min(...meilleur.map((forme) => forme.y));
    zones.push({
      x,
      y,
      l: Math.max(...meilleur.map((forme) => forme.x + forme.l)) - x,
      h: Math.max(...meilleur.map((forme) => forme.y + forme.h)) - y,
      pages: sesPages,
      repetition: endroits(meilleur) >= 3 ? "verticale" : "fixe",
      apparitions: meilleur,
      taille: { l: mediane(meilleur.map((forme) => forme.l)), h: mediane(meilleur.map((forme) => forme.h)) },
    });
  }

  return zones.sort((un, autre) => autre.apparitions.length - un.apparitions.length || un.x - autre.x);
}

/** Les zones où il vaut la peine d'envoyer une reconnaissance.
 *
 *  **Toutes, par défaut, et ce n'est pas un aveu de paresse.** Le tri de `zonesRecurrentes` range
 *  par nombre d'apparitions, et ce nombre ne dit rien de la probabilité qu'une zone porte la
 *  marque : mesuré sur les 29 pages d'un recueil, la marque arrive **cinquième** sur six, avec 95
 *  apparitions contre 593 pour les lettres d'un libellé. Un plafond à quatre zones — celui que
 *  cette fonction portait jusqu'au 29 octobre 2026 — écartait donc précisément la bonne, et le
 *  garde-fou passait de 21 lectures justes à zéro.
 *
 *  Ce que le détecteur fait gagner n'est pas un classement, c'est un **tri** : de 1532 formes à six
 *  endroits, deux cent cinquante fois moins à lire. Laisser la reconnaissance passer dans les six
 *  est le prix de ce gain, et c'est celui qu'il faut payer — c'est la part des apparitions qui se
 *  lisent, mesurée après coup, qui désigne la marque, jamais leur nombre vu d'avance.
 *
 *  `combien` reste là pour un appelant qui n'a pas le budget de tout lire. Il choisit alors en
 *  sachant ce qu'il renonce à voir.
 *
 *  Il n'y a pas de filtre sur la stabilité des tailles : la taille est devenue la clef du
 *  regroupement, donc un groupe dont les formes vont du simple au triple n'est plus un groupe
 *  instable — il est deux groupes. */
export function zonesAExaminer(zones: readonly ZoneRecurrente[], combien?: number): readonly ZoneRecurrente[] {
  return combien === undefined ? zones : zones.slice(0, Math.max(1, combien));
}

/** Ce que le détecteur a vu, en clair, avec de quoi le revérifier. */
export function observationsDesMarques(
  zones: readonly ZoneRecurrente[],
  pagesRegardees: number,
): readonly Observation[] {
  if (zones.length === 0)
    return [
      {
        detecteur: "marques-recurrentes",
        source: "contenu",
        constat: `Aucune forme sombre ne revient régulièrement sur les ${pagesRegardees} pages regardées.`,
        ou: `${pagesRegardees} pages`,
        confiance: 1,
      },
    ];
  return zones.slice(0, 6).map((zone) => ({
    detecteur: "marques-recurrentes",
    source: "contenu" as const,
    constat:
      `Une forme de ${(zone.taille.l * 100).toFixed(1)} × ${(zone.taille.h * 100).toFixed(1)} % de la page revient ` +
      `${zone.repetition === "verticale" ? "le long de la page" : "au même endroit"} ` +
      `sur ${zone.pages.length} des ${pagesRegardees} pages, ${zone.apparitions.length} fois en tout.`,
    ou: `vers ${(zone.x * 100).toFixed(0)} % de la largeur, ${(zone.y * 100).toFixed(0)} % de la hauteur`,
    confiance: zone.pages.length / pagesRegardees,
  }));
}
