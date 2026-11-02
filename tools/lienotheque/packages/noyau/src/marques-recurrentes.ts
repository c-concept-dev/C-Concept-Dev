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
 *  donc de la forme qui a le plus de semblables — même taille *et* même abscisse —, on cherche
 *  autour d'elle le groupe le plus fourni, on le retire, et on recommence. Pas d'enchaînement,
 *  donc pas de soudure.
 *
 *  Deuxième version, et la faute qu'elle corrige, mesurée le 2 novembre 2026 : ce groupe était la
 *  **boule** de cette forme-là, et une boule est à la fois trop large — d'un bord à l'autre, le
 *  carré du rapport admis — et mal placée, puisque son centre est imposé par la forme au lieu
 *  d'être cherché. Le groupe est désormais ce que trois fenêtres retiennent, chacune posée là où
 *  elle contient le plus : `groupeAutour` dit ce que cela change, et sur quoi c'est mesuré.
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

/** Combien de pages une marque doit toucher, selon ce qu'elle peut désigner (OUT-10).
 *
 *  ## Deux repères, et un seul plancher pour les deux
 *
 *  Ce plancher a été écrit pour un repère de **page** — un folio, un cartouche d'en-tête. Ceux-là
 *  sont sur toutes les pages, et leur demander d'être sur la moitié ne coûte rien.
 *
 *  Un repère d'**élément** n'est pas de cette espèce. Il paraît une fois par chose désignée, et
 *  un ouvrage a plus de pages que de choses à désigner. Lui demander la moitié des pages revient
 *  à lui demander d'être plus nombreux que ce qu'il désigne — une exigence qu'aucune marque de ce
 *  genre ne peut satisfaire, quelle que soit sa forme ou sa netteté.
 *
 *  Mesuré le 2 novembre 2026, sur quatre documents réels passés par la chaîne entière :
 *
 *  | document | choses à désigner | pages | plancher d'alors | atteignable ? |
 *  |---|---|---|---|---|
 *  | premier | 22 | 55 | 28 | **non** |
 *  | deuxième | 52 | 116 | 58 | **non** |
 *  | troisième | 9 | 41 | 21 | **non** |
 *  | quatrième | 17 | 61 | 31 | **non** |
 *
 *  Les quatre se sont abstenus. Sur le premier, en abaissant ce seul plancher, la marque qui
 *  désigne vraiment les enregistrements **sort première sur soixante-et-onze endroits** : elle
 *  était écartée avant toute lecture.
 *
 *  Ce n'est donc pas un second seuil à deviner. C'est le même, borné par ce que le document a à
 *  désigner : **on ne demande jamais à une marque d'être plus nombreuse que ce qu'elle désigne.**
 *  Sans ce compte, rien ne change — le plancher reste celui des pages. */
export function pagesPourUneMarque(pagesRegardees: number, aDesigner?: number): number {
  const parLesPages = Math.ceil(pagesRegardees * PART_DES_PAGES);
  const borne = aDesigner === undefined || aDesigner <= 0 ? parLesPages : Math.min(parLesPages, aDesigner);
  return Math.max(2, borne);
}

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

/** Les formes rangées par colonne d'abscisse, pour ne comparer que ce qui peut se ressembler.
 *
 *  Deux formes séparées de plus d'une colonne ne sont jamais le même signe : parcourir le
 *  document entier pour chaque forme coûterait, sur un recueil de trente-cinq mille formes, mille
 *  deux cents millions de comparaisons dont une sur douze seulement a une chance d'aboutir. */
const parColonnes = (formes: readonly FormeObservee[]): Map<number, FormeObservee[]> => {
  const colonnes = new Map<number, FormeObservee[]>();
  for (const forme of formes) {
    const clef = Math.floor(forme.x / MEME_ABSCISSE);
    const colonne = colonnes.get(clef);
    if (colonne === undefined) colonnes.set(clef, [forme]);
    else colonne.push(forme);
  }
  return colonnes;
};
const voisines = (colonnes: Map<number, FormeObservee[]>, forme: FormeObservee): readonly FormeObservee[] => {
  const clef = Math.floor(forme.x / MEME_ABSCISSE);
  return [...(colonnes.get(clef - 1) ?? []), ...(colonnes.get(clef) ?? []), ...(colonnes.get(clef + 1) ?? [])];
};

/** Où poser une fenêtre de largeur donnée pour qu'elle contienne le plus de valeurs possible.
 *
 *  `bout` dit comment la fenêtre s'étend depuis son début : par un rapport quand il s'agit d'une
 *  taille, par une addition quand il s'agit d'une abscisse. Les valeurs sont triées, puis la
 *  fenêtre les parcourt d'un bout à l'autre — l'optimum est forcément atteint quand son bord bas
 *  touche une valeur, puisqu'on peut toujours l'y pousser sans rien perdre. */
function fenetreLaPlusFournie(valeurs: readonly number[], bout: (debut: number) => number): number {
  const triees = [...valeurs].sort((un, autre) => un - autre);
  let depart = triees[0] ?? 0;
  let combien = 0;
  let debut = 0;
  for (let fin = 0; fin < triees.length; fin += 1) {
    while (triees[fin]! > bout(triees[debut]!)) debut += 1;
    if (fin - debut + 1 > combien) {
      depart = triees[debut]!;
      combien = fin - debut + 1;
    }
  }
  return depart;
}

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

/** De combien de départs la recherche du groupe est tentée, de la fenêtre centrée sur l'ancre à
 *  celle qui la prend pour bord haut.
 *
 *  Le glissement s'arrête au premier endroit où plus aucune fenêtre ne bouge, et cet endroit
 *  dépend d'où l'on part : mesuré le 2 novembre 2026 sur deux recueils, un départ centré réunit
 *  les quatre-vingt-quinze apparitions du premier et **aucune** des vingt-deux du second, tandis
 *  qu'un départ par le bord haut les réunit toutes deux. Aucun des deux n'a de raison d'être le
 *  bon. On les essaie donc tous, et c'est le groupe le plus fourni qui est retenu — ce qui ôte du
 *  résultat un choix qui n'avait rien pour le justifier. */
const DEPARTS = [1, Math.sqrt(RAPPORT_DE_TAILLE), RAPPORT_DE_TAILLE] as const;

/** Combien de fois chaque fenêtre est repassée avant qu'on tienne le groupe pour établi.
 *
 *  Un tour qui ne déplace aucune des trois arrête la boucle de lui-même : ce plafond ne sert qu'à
 *  borner le cas où deux fenêtres se repousseraient sans fin, et non à régler quoi que ce soit. */
const TOURS_DE_GLISSEMENT = 10;

/** Le groupe le plus fourni autour d'une forme : trois fenêtres cherchées chacune pour elle-même.
 *
 *  ## Pourquoi « autour d'une forme » ne suffit pas
 *
 *  « Même signe » pose trois fenêtres — une sur la largeur, une sur la hauteur, une sur
 *  l'abscisse — et la première version les accrochait toutes les trois à une forme particulière :
 *  le groupe était sa boule. Deux défauts en découlent, et tous deux sont mesurés.
 *
 *  La boule est **trop large** : d'un bord à l'autre, elle admet le carré du rapport, 2,25 au
 *  lieu de 1,5. Sur un recueil, le groupe qui porte la marque comptait ainsi 63 apparitions dont
 *  **47 étrangères** — et la reconnaissance, envoyée sur ces 63 endroits, lisait surtout autre
 *  chose.
 *
 *  Et son centre est **imposé** par la forme choisie, non cherché. Sur le même recueil, la marque
 *  paraît entre 13,1 et 16,0 % de la largeur ; la boule retenue allait de 15,1 à 20,8 %, et six
 *  des vingt-deux apparitions tombaient hors d'elle. Elles n'étaient pas mal lues : elles
 *  n'étaient pas regardées.
 *
 *  ## Ce qui est fait à la place
 *
 *  Aucune fenêtre n'est accrochée à une forme. On part de l'ancre, puis on fait glisser chaque
 *  fenêtre à son tour — sur ce que les **deux autres** retiennent, et non sur la sélection
 *  courante, sinon elle ne pourrait jamais atteindre une forme qu'elle-même exclut. Chaque
 *  glissement ne peut qu'augmenter le compte, donc cela s'arrête.
 *
 *  ## Ce que cela change, mesuré
 *
 *  | recueil | apparitions du signe réunies, avant | après |
 *  |---|---|---|
 *  | celui qui sert de référence depuis le 29 octobre | 95 sur 95 | 95 sur 95 |
 *  | celui dont la marque était diluée | 16 sur 22, dans un groupe de 63 | **21 sur 22**, dans un groupe de 51 |
 *
 *  Le premier ne bouge pas d'une apparition — c'est ce qu'on lui demandait. Le second gagne cinq
 *  apparitions et perd seize formes étrangères.
 *
 *  Il en coûte des endroits à examiner : de 6 à 11 sur l'un, de 24 à 39 sur l'autre. Les groupes
 *  étant plus serrés, il en faut davantage pour couvrir les mêmes formes — et c'est le prix d'un
 *  groupe qui porte un signe plutôt qu'un voisinage. */
function groupeAutour(ancre: FormeObservee, restantes: readonly FormeObservee[]): readonly FormeObservee[] {
  let meilleur: readonly FormeObservee[] = [];
  for (const depart of DEPARTS) {
    let basL = ancre.l / depart;
    let basH = ancre.h / depart;
    let basX = ancre.x - MEME_ABSCISSE;
    const tientEnL = (forme: FormeObservee): boolean => forme.l >= basL && forme.l <= basL * RAPPORT_DE_TAILLE;
    const tientEnH = (forme: FormeObservee): boolean => forme.h >= basH && forme.h <= basH * RAPPORT_DE_TAILLE;
    const tientEnX = (forme: FormeObservee): boolean => forme.x >= basX && forme.x <= basX + MEME_ABSCISSE * 2;

    for (let tour = 0; tour < TOURS_DE_GLISSEMENT; tour += 1) {
      const avant = `${basL} ${basH} ${basX}`;
      const parRapport = (debut: number): number => debut * RAPPORT_DE_TAILLE;
      basL = fenetreLaPlusFournie(
        restantes.filter((forme) => tientEnH(forme) && tientEnX(forme)).map((forme) => forme.l),
        parRapport,
      );
      basH = fenetreLaPlusFournie(
        restantes.filter((forme) => tientEnL(forme) && tientEnX(forme)).map((forme) => forme.h),
        parRapport,
      );
      basX = fenetreLaPlusFournie(
        restantes.filter((forme) => tientEnL(forme) && tientEnH(forme)).map((forme) => forme.x),
        (debut) => debut + MEME_ABSCISSE * 2,
      );
      if (`${basL} ${basH} ${basX}` === avant) break;
    }

    const abouti = restantes.filter((forme) => tientEnL(forme) && tientEnH(forme) && tientEnX(forme));
    if (abouti.length > meilleur.length) meilleur = abouti;
  }
  return meilleur;
}

/** Les endroits où un même signe revient, page après page.
 *
 *  `pagesRegardees` est demandé séparément : une marque présente sur quatre pages sur six n'a pas
 *  le même sens qu'une marque présente sur quatre pages sur deux cents, et compter les pages où
 *  l'on a trouvé quelque chose plutôt que celles qu'on a regardées fausserait la mesure dans le
 *  sens rassurant. */
export function zonesRecurrentes(
  formes: readonly FormeObservee[],
  pagesRegardees: number,
  aDesigner?: number,
): readonly ZoneRecurrente[] {
  if (pagesRegardees <= 0) return [];
  let restantes = formes.filter(
    (forme) =>
      forme.l >= COTE_MINIMAL && forme.h >= COTE_MINIMAL && forme.l <= COTE_MAXIMAL && forme.h <= COTE_MAXIMAL,
  );
  const minimum = pagesPourUneMarque(pagesRegardees, aDesigner);
  const zones: ZoneRecurrente[] = [];

  // On part à chaque tour de la forme qui a le plus de semblables, on cherche autour d'elle le
  // groupe le plus fourni, on le retire, et on recommence. Dès que la meilleure n'a plus assez de
  // semblables pour couvrir le minimum de pages, aucune des suivantes ne pourra : on s'arrête là.
  while (restantes.length >= minimum) {
    const colonnes = parColonnes(restantes);
    let ancre: FormeObservee | undefined;
    let entourage = 0;
    for (const candidate of restantes) {
      const semblables = voisines(colonnes, candidate).filter((forme) => memeSigne(candidate, forme)).length;
      if (semblables > entourage) {
        ancre = candidate;
        entourage = semblables;
      }
    }
    if (ancre === undefined || entourage < minimum) break;

    const meilleur = groupeAutour(ancre, restantes);
    if (meilleur.length < minimum) break;

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

/** Ce qu'une suite de lectures dit de l'endroit d'où elle vient (REC-02, OUT-10).
 *
 *  `variete` : combien de valeurs différentes, sur le nombre de lectures. Une numérotation
 *  désigne une chose différente à chaque fois ; elle vaut 1 quand aucune valeur ne se répète.
 *  `avance` : la part des couples de lectures voisines qui ne reculent pas. Une numérotation
 *  monte, dans l'ordre où les pages se présentent ; un même numéro qui court sur deux pages ne
 *  recule pas non plus, et c'est pourquoi on compte les égalités avec les montées. */
export type Allure = {
  readonly lues: number;
  readonly distinctes: number;
  readonly variete: number;
  readonly avance: number;
};

/** Mesure l'allure d'une suite de lectures, les absences comprises comme des trous.
 *
 *  Les trous ne coupent pas la suite : deux lectures séparées par une page illisible restent
 *  voisines. Couper reviendrait à juger un endroit sur ses seuls passages faciles. */
export function allureDeLaSuite(lectures: readonly (number | undefined)[]): Allure {
  const lues = lectures.filter((valeur): valeur is number => valeur !== undefined);
  if (lues.length === 0) return { lues: 0, distinctes: 0, variete: 0, avance: 0 };
  const distinctes = new Set(lues).size;
  let couples = 0;
  let sansRecul = 0;
  for (let rang = 1; rang < lues.length; rang += 1) {
    couples += 1;
    if (lues[rang]! >= lues[rang - 1]!) sansRecul += 1;
  }
  return {
    lues: lues.length,
    distinctes,
    variete: distinctes / lues.length,
    // L'avance est comptée sur ses couples **plus un**, et non sur ses couples.
    //
    // « Ne recule pas » est une preuve d'autant plus forte qu'il y avait d'occasions de reculer.
    // Un taux sur les seuls couples jette ce compte : avec deux lectures, un unique couple, « ne
    // recule pas » vaut 1,00 et ne montre rien — c'est un tirage à pile ou face. Le plancher de
    // la numérotation devenait alors atteignable par pure arithmétique, et une ligne plate du
    // bord d'une page, lue 3 fois sur 6, a été élue sur une famille de l'éventail d'essai.
    //
    // Le cas d'une lecture unique n'a plus besoin d'être écrit : zéro couple donne 0 / 1 = 0,
    // soit exactement « elle ne prouve rien, et vaut donc zéro ». Ce qui était une exception est
    // devenu une conséquence — et c'est ce qui dit que la forme est juste, non qu'elle est réglée.
    avance: sansRecul / (couples + 1),
  };
}

/** Ce qu'il faut atteindre, sur les trois mesures à la fois, pour tenir un endroit pour une
 *  numérotation. Plus souvent que pas, sur chacune — c'est tout ce que ce nombre dit.
 *
 *  Mesuré le 30 octobre 2026 sur **1 606 endroits** proposés par la régularité des formes, dix-huit
 *  documents de l'éventail d'essai :
 *
 *  | endroit | part lue | variété | avance | produit |
 *  |---|---|---|---|---|
 *  | la marque qui désigne vraiment les enregistrements | 1,00 | 1,00 | 0,83 | **0,83** |
 *  | une marque tenue sur un autre document | 1,00 | 1,00 | 0,64 | 0,64 |
 *  | une forme de notation lue « 7 » partout | 0,75 | 0,22 | 0,89 | 0,15 |
 *  | une autre, lue « 7 » presque partout | 0,92 | 0,27 | 0,64 | 0,16 |
 *  | une ligne plate du bord de la page, lue 3 fois sur 6 | 0,50 | 1,00 | 0,67 | 0,33 |
 *
 *  Sur ces 1 606 endroits, **quatre** atteignent le seuil. Le vide au-dessous de lui s'étend
 *  jusqu'à 0,43 ; au-dessus, un endroit s'y pose exactement — 0,500 sur un document dont les
 *  douze lectures sont toutes distinctes mais dont cinq couples sur onze reculent. Celui-là n'est
 *  pas tranché par ce nombre, et il ne faut pas faire croire qu'il l'est. */
export const NUMEROTATION_PROBABLE = 0.5;

/** Dans quelle mesure une suite de lectures se comporte comme une numérotation (REC-02, OUT-10).
 *
 *  ## Pourquoi les trois mesures, et pas une
 *
 *  Chacune se fait berner seule, et c'est mesuré, pas supposé.
 *
 *  - **La part qui se lit** était l'unique critère jusqu'au 30 octobre 2026. Elle ne juge pas *ce
 *    qui est lu*, seulement *que ça se lit* — et la reconnaissance, avec une liste blanche de
 *    chiffres, rend un chiffre de presque n'importe quelle forme sombre. Sur un document de
 *    l'éventail, elle a élu une tête de note avec 699 apparitions là où le vivier n'a que 99
 *    enregistrements.
 *  - **L'avance** ne sépare rien seule : une forme lue « 7 » partout ne recule jamais, et vaut
 *    donc presque son plafond — mieux que la vraie marque, qui perd un point parce que sa
 *    première apparition est sur une page de garde.
 *  - **La variété** sépare bien, mais un endroit qui ne se lit que trois fois sur douze rend
 *    trois valeurs différentes et vaut 1,00 sans rien désigner.
 *
 *  Ensemble, elles disent la seule chose qui compte : cet endroit porte-t-il une **numérotation**
 *  — quelque chose qui se lit, qui nomme une chose différente à chaque fois, et qui avance dans
 *  l'ordre où les pages se présentent ? Une forme de notation se lit ; elle ne numérote rien. */
export function partDeNumerotation(allure: Allure, apparitionsRegardees: number): number {
  if (apparitionsRegardees === 0 || allure.lues === 0) return 0;
  return (allure.lues / apparitionsRegardees) * allure.variete * allure.avance;
}

/** La note la plus haute qu'un endroit puisse encore atteindre, ses apparitions non encore lues
 *  étant supposées parfaites (REC-02, OUT-10).
 *
 *  ## À quoi sert une borne
 *
 *  Juger un endroit coûte une reconnaissance par apparition regardée, et l'immense majorité des
 *  endroits proposés ne portent aucune numérotation — mesuré sur cinq documents réels, 4 essais
 *  sur 376 atteignent le seuil. Lire douze apparitions pour conclure que le premier chiffre lu
 *  était du papier de musique est une dépense sans objet.
 *
 *  Cette borne permet de s'arrêter **sans rien parier**. Tant qu'elle reste au-dessus de ce qu'il
 *  faudrait atteindre, l'endroit garde sa chance et on continue de le lire. Dès qu'elle passe
 *  en dessous, il est *prouvé* que cet endroit ne peut plus qualifier, et le lire davantage ne
 *  changerait rien. Aucun seuil n'est à régler ici, et aucune lecture juste ne peut être perdue.
 *
 *  ## Pourquoi chacun de ses trois facteurs est bien une borne
 *
 *  - **Ce qui se lit.** Une apparition déjà lue et muette est un fait acquis, pas une inconnue :
 *    elle ne se mettra pas à parler. Seules les apparitions pas encore regardées sont comptées
 *    comme lisibles. C'est ce qui rend cette borne serrée là où un endroit troué ne mène nulle
 *    part — et c'est l'inverse d'un échantillon réduit, qui prend un trou pour une sentence.
 *  - **La variété.** Chaque apparition restante peut au mieux rendre une valeur encore inédite.
 *  - **L'avance.** Un recul entre deux lectures voisines est irréparable : quelles que soient les
 *    valeurs intercalées entre elles, il faudra bien redescendre quelque part. Ces reculs vivent
 *    dans des intervalles disjoints, donc ils s'additionnent sans se recouvrir.
 *
 *  Quand toutes les apparitions regardées ont été lues, la borne vaut exactement la note : c'est
 *  ce qui dit qu'elle n'est ni trop lâche à la fin, ni fausse au début. Une épreuve le vérifie. */
export function borneDeNumerotation(
  lectures: readonly (number | undefined)[],
  apparitionsRegardees: number,
): number {
  const lues = lectures.filter((valeur): valeur is number => valeur !== undefined);
  const restantes = Math.max(0, apparitionsRegardees - lectures.length);
  const luesAuPlus = lues.length + restantes;
  if (apparitionsRegardees === 0 || luesAuPlus === 0) return 0;
  const distinctesAuPlus = new Set(lues).size + restantes;
  let reculs = 0;
  for (let rang = 1; rang < lues.length; rang += 1) if (lues[rang]! < lues[rang - 1]!) reculs += 1;
  const couples = luesAuPlus - 1;
  return (
    (luesAuPlus / apparitionsRegardees) *
    Math.min(1, distinctesAuPlus / luesAuPlus) *
    (Math.max(0, couples - reculs) / (couples + 1))
  );
}
