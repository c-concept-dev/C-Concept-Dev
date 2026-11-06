import type { MotLu, Observation } from "@lienotheque/contrats";

/** Lire une table à colonnes, et dire ce qu'on n'a pas su lire (OUT-10).
 *
 *  ## Pourquoi ce détecteur est le plus fragile du socle
 *
 *  Les autres lisent des noms de fichiers : rien n'y est flou. Celui-ci lit des pixels passés
 *  par une reconnaissance, et il doit en tirer des nombres sur lesquels des liens seront posés.
 *  Le 29 octobre 2026, la meilleure lecture d'une table réelle de 52 lignes en a rendu 39 —
 *  **dont quatre fausses**, et rien ne les distinguait des trente-cinq justes. C'est ce quatre
 *  qui a motivé tout ce module : trouver les lignes ne suffit pas, il faut savoir lesquelles ne
 *  méritent pas confiance.
 *
 *  ## Ce qui est ici, et ce qui est ailleurs
 *
 *  Ici : la **géométrie**. Des mots avec leurs boîtes deviennent des lignes, les lignes révèlent
 *  des colonnes, les colonnes donnent des rangées. Aucun pixel, aucune reconnaissance — donc
 *  éprouvable sans image, et c'est précisément ce qu'on veut d'une pièce fragile.
 *
 *  Ailleurs : rendre la page, l'océriser, effacer ses conduites de points. Ce module reçoit le
 *  résultat et n'a pas à savoir d'où il vient.
 *
 *  ## Ce qu'il ne fait jamais
 *
 *  Combler. Une cellule illisible reste illisible et sa rangée est nommée. Une table dont on a
 *  lu les trois quarts est une table dont on a lu les trois quarts — la présenter autrement est
 *  exactement la faute qui a coûté la journée. */

/** Une suite de mots qui partagent une même hauteur. */
export type LigneDeTable = {
  readonly y: number;
  readonly mots: readonly MotLu[];
};

/** Deux mots sont sur la même ligne quand leurs boîtes se recouvrent verticalement de plus de la
 *  moitié de la plus petite des deux. Le recouvrement, et non la distance entre centres : une
 *  majuscule et une minuscule n'ont pas le même centre et sont pourtant sur la même ligne. */
export function lignesDeMots(mots: readonly MotLu[], recouvrementMinimal = 0.5): readonly LigneDeTable[] {
  const lignes: { y: number; mots: MotLu[] }[] = [];
  for (const mot of [...mots].sort((un, autre) => un.y - autre.y)) {
    const ligne = lignes.find((candidate) => {
      const premier = candidate.mots[0]!;
      const hauteur = Math.min(premier.h, mot.h);
      if (hauteur <= 0) return false;
      const recouvrement = Math.min(premier.y + premier.h, mot.y + mot.h) - Math.max(premier.y, mot.y);
      return recouvrement > hauteur * recouvrementMinimal;
    });
    if (ligne === undefined) lignes.push({ y: mot.y, mots: [mot] });
    else ligne.mots.push(mot);
  }
  return lignes
    .map((ligne) => ({ y: ligne.y, mots: [...ligne.mots].sort((un, autre) => un.x - autre.x) }))
    .sort((un, autre) => un.y - autre.y);
}

/** Un nombre seul, sans rien d'autre que d'éventuels signes de ponctuation en bordure. */
const EST_UN_NOMBRE = /^\d+[.,:;]?$/;
const valeurDe = (texte: string): number | undefined => {
  if (!EST_UN_NOMBRE.test(texte)) return undefined;
  const valeur = Number.parseInt(texte, 10);
  return Number.isFinite(valeur) ? valeur : undefined;
};

/** Une colonne : une abscisse où des nombres reviennent, ligne après ligne. */
export type Colonne = {
  /** Le centre du groupe, en unités des boîtes reçues. */
  readonly x: number;
  readonly etendue: number;
  /** Sur combien de lignes cette colonne porte un nombre. */
  readonly presentDans: number;
};

/** En deçà de combien de lignes une colonne n'en est pas une. Trois nombres alignés par hasard
 *  arrivent ; huit, non. */
export const LIGNES_POUR_UNE_COLONNE = 4;

/** Les colonnes de nombres, trouvées en groupant les abscisses.
 *
 *  Le pas de groupement vient des données : on trie les abscisses et on coupe là où l'écart
 *  dépasse nettement l'écart courant. Un pas fixe en pixels marcherait sur une image et pas sur
 *  la suivante. */
export function colonnesDeNombres(lignes: readonly LigneDeTable[]): readonly Colonne[] {
  const abscisses: number[] = [];
  const largeurs: number[] = [];
  for (const ligne of lignes)
    for (const mot of ligne.mots)
      if (valeurDe(mot.texte) !== undefined) {
        abscisses.push(mot.x);
        largeurs.push(mot.l);
      }
  if (abscisses.length < LIGNES_POUR_UNE_COLONNE) return [];

  const triees = [...abscisses].sort((un, autre) => un - autre);
  // L'échelle vient de ce qu'un nombre occupe, et de rien d'autre.
  //
  // Une première version la tirait de l'écart médian entre abscisses triées. Sur une table où
  // trente valeurs partagent la même abscisse, cet écart médian vaut zéro : le seuil tombait à
  // son plancher, et deux valeurs d'une même colonne distantes de vingt-six pixels se
  // retrouvaient dans deux colonnes. Mesuré sur une table réelle — la colonne du milieu coupée
  // en deux, trente-trois rangées à trou, aucune utilisable.
  //
  // Un nombre ne s'écarte pas de sa colonne de plus que sa propre largeur : c'est une propriété
  // de la composition, pas un réglage à ajuster document par document.
  const largeursTriees = [...largeurs].sort((un, autre) => un - autre);
  const largeurTypique = largeursTriees[Math.floor(largeursTriees.length / 2)] ?? 8;
  const coupure = Math.max(largeurTypique * 1.5, 8);

  const groupes: number[][] = [];
  let courant: number[] = [];
  for (const [rang, abscisse] of triees.entries()) {
    if (rang > 0 && abscisse - triees[rang - 1]! > coupure) {
      groupes.push(courant);
      courant = [];
    }
    courant.push(abscisse);
  }
  groupes.push(courant);

  return groupes
    .filter((groupe) => groupe.length >= LIGNES_POUR_UNE_COLONNE)
    .map((groupe) => ({
      x: Math.round(groupe.reduce((somme, valeur) => somme + valeur, 0) / groupe.length),
      etendue: (groupe[groupe.length - 1] ?? 0) - (groupe[0] ?? 0),
      presentDans: groupe.length,
    }))
    .sort((un, autre) => un.x - autre.x);
}

/** Une rangée : ce qui précède la première colonne, puis une cellule par colonne. */
/** De combien deux écarts peuvent différer et rester le même écart.
 *
 *  Mesuré sur la table réelle imprimée en deux panneaux : ses écarts intra-panneau valent 398 et
 *  112 à gauche, 393 et 114 à droite — soit 1,3 % et 1,8 % de différence. Un dixième laisse
 *  passer cela largement sans confondre pour autant un écart intra-panneau (112) avec celui qui
 *  sépare les panneaux (315). */
const ECART_RELATIF_TOLERE = 0.1;

/** Les panneaux d'une table imprimée en colonnes répétées (OUT-10).
 *
 *  ## Le défaut que cette fonction existe pour empêcher
 *
 *  Une table peut être imprimée en deux blocs côte à côte pour tenir sur une page. Les colonnes
 *  trouvées sont alors celles des deux blocs à la fois, et les rangées — groupées par leur hauteur,
 *  ce qui est juste — portent **deux enregistrements chacune**. Géométriquement exact, et faux dès
 *  qu'on lit une rangée comme un enregistrement.
 *
 *  Mesuré le 1er novembre 2026 sur une table réelle : six colonnes, dont une rangée donne
 *  « 2, 2, 8 » à gauche et « 32, 82, 68 » à droite. Qui lit les six comme un tout n'obtient rien
 *  de ce que la page dit.
 *
 *  ## Deux lectures indépendantes, et pas une
 *
 *  **La géométrie** d'abord : les écarts entre colonnes se répètent avec une période. Sur la table
 *  réelle, 398 et 112, puis 393 et 114. Attention, la frontière entre panneaux n'est **pas** le
 *  plus grand écart — elle vaut 315 là où deux écarts intra-panneau valent près de 400. Couper au
 *  plus grand trou aurait donné un découpage faux.
 *
 *  **Ce que le document déclare** ensuite : une table en panneaux répète son en-tête, et c'est son
 *  auteur qui l'écrit. Sur la table réelle, une ligne porte « Description Track Page Description
 *  Track Page » — la séquence de libellés se répète deux fois, et dit donc elle-même qu'il y a
 *  deux panneaux de trois colonnes.
 *
 *  Le découpage n'est adopté que si **les deux s'accordent sur le même compte**. Une périodicité
 *  des écarts peut arriver par hasard sur une table ordinaire ; couper alors inventerait des
 *  enregistrements, ce qui est exactement ce qu'il ne faut jamais faire. Exiger que le document
 *  l'ait écrit coûte peu et ferme cette porte. */
export function panneauxDeColonnes(
  lignes: readonly LigneDeTable[],
  colonnes: readonly Colonne[],
): readonly (readonly Colonne[])[] {
  const entier = [colonnes];
  if (colonnes.length < 4) return entier;
  const ecarts = colonnes.slice(1).map((colonne, rang) => colonne.x - colonnes[rang]!.x);
  const memeEcart = (un: number, autre: number): boolean =>
    Math.abs(un - autre) <= Math.max(un, autre) * ECART_RELATIF_TOLERE;

  // Du découpage le plus fin au plus grossier : deux panneaux de trois valent mieux que trois de
  // deux si les deux tiennent, parce que le plus fin décrit mieux ce qui se répète.
  for (let large = 2; large <= colonnes.length / 2; large += 1) {
    if (colonnes.length % large !== 0) continue;
    const combien = colonnes.length / large;
    // La géométrie : chaque panneau doit porter la même suite d'écarts internes.
    const interne = (place: number): readonly number[] =>
      ecarts.slice(place * large, place * large + large - 1);
    const premier = interne(0);
    const geometrie = Array.from({ length: combien - 1 }, (_, place) => interne(place + 1)).every(
      (suite) => suite.length === premier.length && suite.every((ecart, rang) => memeEcart(ecart, premier[rang]!)),
    );
    if (!geometrie) continue;
    // Ce que le document déclare : une ligne dont les libellés répètent `combien` fois la même
    // séquence de `large` mots.
    if (!uneLigneRepeteSesLibelles(lignes, large, combien)) continue;
    return Array.from({ length: combien }, (_, place) => colonnes.slice(place * large, place * large + large));
  }
  return entier;
}

/** Une ligne de la table répète-t-elle `combien` fois une séquence de `large` libellés ?
 *
 *  Les libellés sont les mots qui ne sont pas des nombres : un en-tête de colonne se nomme, il ne
 *  se chiffre pas. La comparaison ignore la casse et les signes, parce qu'une reconnaissance rend
 *  « Page » et « Page. » pour le même mot. */
function uneLigneRepeteSesLibelles(lignes: readonly LigneDeTable[], large: number, combien: number): boolean {
  for (const ligne of lignes) {
    const libelles = ligne.mots
      .filter((mot) => valeurDe(mot.texte) === undefined)
      .map((mot) => mot.texte.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""))
      .filter((mot) => mot.length > 0);
    if (libelles.length !== large * combien) continue;
    const motif = libelles.slice(0, large);
    const repete = Array.from({ length: combien - 1 }, (_, place) =>
      libelles.slice((place + 1) * large, (place + 2) * large),
    ).every((suite) => suite.every((libelle, rang) => libelle === motif[rang]));
    if (repete) return true;
  }
  return false;
}

export type RangeeDeTable = {
  readonly y: number;
  readonly intitule: string;
  /** Une entrée par colonne, dans l'ordre. `undefined` quand la cellule n'a pas été lue. */
  readonly cellules: readonly (number | undefined)[];
};

/** Range les mots d'une ligne dans les colonnes trouvées.
 *
 *  Un nombre va dans la colonne dont il est le plus proche, à condition d'en être plus proche
 *  que de la moitié de l'écart entre deux colonnes. Au-delà, il n'appartient à aucune — et le
 *  dire vaut mieux que de le ranger de force dans la plus proche. */
export function rangeesDeTable(
  lignes: readonly LigneDeTable[],
  colonnes: readonly Colonne[],
  /** À partir d'où les mots appartiennent à ces colonnes.
   *
   *  Sans cette borne, l'intitulé d'un panneau ramasse tout ce qui est à gauche de sa première
   *  colonne — donc le panneau précédent en entier. Les cellules, elles, étaient déjà protégées
   *  par la distance tolérée. */
  depuisX = Number.NEGATIVE_INFINITY,
): readonly RangeeDeTable[] {
  if (colonnes.length === 0) return [];
  const premiere = colonnes[0]!.x;
  const ecarts = colonnes.slice(1).map((colonne, rang) => colonne.x - colonnes[rang]!.x);
  const tolerance = ecarts.length > 0 ? Math.min(...ecarts) / 2 : Number.POSITIVE_INFINITY;

  return lignes.map((ligne) => {
    const cellules: (number | undefined)[] = colonnes.map(() => undefined);
    const avant: string[] = [];
    for (const mot of ligne.mots) {
      const valeur = valeurDe(mot.texte);
      if (valeur === undefined) {
        if (mot.x >= depuisX && mot.x < premiere) avant.push(mot.texte);
        continue;
      }
      let meilleure = -1;
      let distance = Number.POSITIVE_INFINITY;
      for (const [rang, colonne] of colonnes.entries()) {
        const ecart = Math.abs(mot.x - colonne.x);
        if (ecart < distance) {
          distance = ecart;
          meilleure = rang;
        }
      }
      if (meilleure >= 0 && distance <= tolerance && cellules[meilleure] === undefined) cellules[meilleure] = valeur;
      else if (mot.x >= depuisX && mot.x < premiere) avant.push(mot.texte);
    }
    return { y: ligne.y, intitule: avant.join(" ").trim(), cellules };
  });
}

/** Une cellule qui jure avec sa colonne.
 *
 *  Deux signes, et ils se complètent — mesurés le 29 octobre 2026 sur les quatre erreurs réelles
 *  d'une lecture de table :
 *
 *  - **l'écart aberrant** : une valeur très loin du reste de sa colonne, mesurée à la dispersion
 *    de cette colonne et non à son nombre de chiffres. Deux des quatre erreurs étaient de ce
 *    genre (382 et 248 parmi des rangs de 1 à 52).
 *  - **le creux** : une valeur plus petite que ses deux voisines, dans une colonne qui monte une
 *    fois ces creux retirés. Les deux autres erreurs étaient de ce genre (20 entre 24 et 26, 21
 *    entre 26 et 28).
 *
 *  Une première version jugeait sur le **nombre de chiffres**, et elle était fausse en principe :
 *  toute colonne ordonnée franchit une dizaine. Elle accusait le « 10 » d'une colonne allant de
 *  1 à 10, et le « 6 » d'une colonne allant de 6 à 24. Attrapé par les contrôles de ce module.
 *
 *  On signale, on ne corrige jamais. Une cellule suspecte reste écrite telle qu'elle a été lue,
 *  et c'est sa rangée qui cesse d'être utilisable. */
export type CelluleSuspecte = {
  readonly rangee: number;
  readonly colonne: number;
  readonly valeur: number;
  readonly pourquoi: string;
};

const mediane = (valeurs: readonly number[]): number => {
  const triees = [...valeurs].sort((un, autre) => un - autre);
  return triees[Math.floor(triees.length / 2)] ?? 0;
};

/** De combien d'écarts habituels une valeur doit s'éloigner pour être tenue pour aberrante.
 *
 *  Large à dessein. Ce signe n'est pas là pour trier le douteux du sûr, mais pour attraper ce
 *  qui ne peut pas appartenir à la colonne : une suite de rangs de 1 à 52 où se glisse un 382.
 *  Un seuil serré accuserait des valeurs justes, et une accusation à tort coûte autant qu'un
 *  silence — elle met en abstention un document qui n'avait rien. */
const ECARTS_TOLERES = 8;

/** Les places qui tiennent dans la plus longue montée stricte de la suite.
 *
 *  C'est ce qui permet de nommer une faute **sans la comparer à une autre faute**. Comparer
 *  chaque valeur à ses voisines immédiates se mord la queue : un creux fait passer ses deux
 *  voisines pour des bosses, et sur la vraie table quatre accusations sur huit refermaient le
 *  garde-fou du tiers — plus rien n'était signalé. Mesuré le 1er novembre 2026.
 *
 *  La plus longue montée, elle, ne suppose rien : elle est ce que la colonne dit d'elle-même.
 *  Ce qui en sort est ce qui ne peut pas y tenir. */
function placesDeLaPlusLongueMontee(valeurs: readonly number[]): ReadonlySet<number> {
  if (valeurs.length === 0) return new Set();
  const longueur = valeurs.map(() => 1);
  const precedente = valeurs.map(() => -1);
  for (const [place, valeur] of valeurs.entries())
    for (let avant = 0; avant < place; avant += 1)
      if (valeurs[avant]! < valeur && longueur[avant]! + 1 > longueur[place]!) {
        longueur[place] = longueur[avant]! + 1;
        precedente[place] = avant;
      }
  let fin = 0;
  for (const [place, combien] of longueur.entries()) if (combien > longueur[fin]!) fin = place;
  const gardees = new Set<number>();
  for (let place = fin; place !== -1; place = precedente[place]!) gardees.add(place);
  return gardees;
}

export function cellulesSuspectes(rangees: readonly RangeeDeTable[], colonnes: readonly Colonne[]): readonly CelluleSuspecte[] {
  const suspectes: CelluleSuspecte[] = [];
  for (const [rangColonne] of colonnes.entries()) {
    const presentes = rangees
      .map((rangee, rang) => ({ rang, valeur: rangee.cellules[rangColonne] }))
      .filter((entree): entree is { rang: number; valeur: number } => entree.valeur !== undefined);
    if (presentes.length < LIGNES_POUR_UNE_COLONNE) continue;
    const valeurs = presentes.map((entree) => entree.valeur);

    // Premier signe : une valeur qui n'a rien à faire dans cette colonne.
    //
    // On la mesure à la dispersion de la colonne elle-même — l'écart médian à la médiane — et
    // non à son nombre de chiffres. Une colonne ordonnée franchit presque toujours une dizaine :
    // juger sur la largeur revenait à accuser le « 10 » d'une colonne qui va de 1 à 10.
    const centre = mediane(valeurs);
    const dispersion = mediane(valeurs.map((valeur) => Math.abs(valeur - centre)));
    const aberrantes = new Set<number>();
    if (dispersion > 0) {
      const limite = dispersion * ECARTS_TOLERES;
      for (const [rang, entree] of presentes.entries())
        if (Math.abs(entree.valeur - centre) > limite) {
          aberrantes.add(rang);
          suspectes.push({
            rangee: entree.rang,
            colonne: rangColonne,
            valeur: entree.valeur,
            pourquoi: `très loin du reste de la colonne, qui tourne autour de ${centre}`,
          });
        }
    }

    // Second signe : une rupture de la montée, **dans les deux sens**. Dans une colonne qui monte,
    // une valeur juste se tient entre ses deux voisines ; elle peut donc faillir par le dessous
    // — un creux — comme par le dessus — une bosse.
    //
    // Seul le creux était cherché, et c'était une asymétrie sans raison : une reconnaissance qui
    // lit trop haut (un chiffre de plus, 3 pris pour 8, 1 pour 7) est aussi fréquente qu'une qui
    // lit trop bas. Mesuré le 1er novembre 2026 sur la vraie table « CD Track Listing » : la
    // colonne des pistes du panneau droit lit 31, **82**, 33, 34… — et cette rangée était rendue
    // **utilisable**, donc digne de confiance. Le premier signe ne la voyait pas non plus : la
    // colonne allant de 31 à 52, sa dispersion médiane d'environ 6 laisse passer un écart de 41
    // sous une limite de 48. C'est précisément le « quatre fausses indiscernables des
    // trente-cinq justes » que ce module existe pour empêcher.
    //
    // Le détour par le retrait est nécessaire : deux fautes suffisent à faire perdre sa monotonie
    // à une colonne courte, et le signe le plus utile s'éteindrait justement quand il y a le plus
    // à trouver.
    //
    // Les valeurs déjà reconnues aberrantes sont mises de côté avant ce second examen : une
    // valeur dont on sait qu'elle est fausse ne doit pas servir à juger si la colonne est
    // ordonnée. Mesuré sur la table réelle — un 248 isolé au milieu d'une colonne de rangs
    // suffisait à la déclarer désordonnée, et les deux creux voisins passaient alors inaperçus.
    // Une valeur déjà reconnue aberrante ne doit pas servir à juger si la colonne est ordonnée :
    // on la met de côté avant cet examen. Mesuré sur la table réelle — un 248 isolé au milieu
    // d'une colonne de rangs suffisait à la déclarer désordonnée, et les creux voisins passaient
    // alors inaperçus.
    const examinees = presentes.filter((_, rang) => !aberrantes.has(rang));
    const dansLaMontee = placesDeLaPlusLongueMontee(examinees.map((entree) => entree.valeur));
    const ruptures = examinees.map((entree, place) => ({ entree, place })).filter(({ place }) => !dansLaMontee.has(place));
    // Au-delà d'un tiers hors de la montée, ce n'est plus une colonne ordonnée avec quelques
    // fautes : c'est une colonne qui n'est pas ordonnée, et l'accuser n'apprendrait rien.
    if (ruptures.length > 0 && ruptures.length <= examinees.length / 3)
      for (const { entree, place } of ruptures) {
        if (suspectes.some((suspecte) => suspecte.rangee === entree.rang && suspecte.colonne === rangColonne)) continue;
        // Les bornes sont prises **dans la montée**, et non chez les voisins immédiats : dire
        // « entre 24 et 26 » quand le voisin de gauche est lui-même fautif désignerait mal.
        const avantCe = examinees.filter((_, autre) => autre < place && dansLaMontee.has(autre)).pop();
        const apresCe = examinees.find((_, autre) => autre > place && dansLaMontee.has(autre));
        suspectes.push({
          rangee: entree.rang,
          colonne: rangColonne,
          valeur: entree.valeur,
          pourquoi: `rompt la montée de la colonne, entre ${avantCe?.valeur} et ${apresCe?.valeur}`,
        });
      }
  }
  return suspectes;
}

/** Où relire, quand une case demande une seconde lecture (A2).
 *
 *  **La zone, et non la page.** La table se disait déjà en défaut — ses rangées à trou, ses
 *  cellules suspectes — mais sans dire *où* elles sont : relire voulait donc dire relire la page
 *  entière, au prix d'une page pour rattraper une case. Mesuré le 5 novembre 2026 : quatre cases
 *  manquées sur une table de cinquante-deux rangées.
 *
 *  Tout sort **des mots déjà lus** : la bande verticale des boîtes de la rangée, la bande
 *  horizontale de la colonne visée élargie de ce qu'un nombre occupe ici. Aucune constante, donc
 *  rien à calibrer document par document — un nombre ne s'écarte pas de sa colonne de plus que sa
 *  propre largeur, et c'est une propriété de la composition.
 *
 *  Les unités sont celles des boîtes reçues, jamais des parts de page : c'est à qui relit de les
 *  rapporter à l'image dont il les tient. */
export type ZoneARelire = {
  readonly rangee: number;
  readonly colonne: number;
  readonly x: number;
  readonly y: number;
  readonly l: number;
  readonly h: number;
  /** Pourquoi cette case est à relire, dans les mots de la table elle-même. */
  readonly pourquoi: string;
};

export type TableLue = {
  /** Les colonnes **d'une rangée**. Quand la table est imprimée en panneaux, ce sont celles d'un
   *  panneau : chaque rangée rendue porte un enregistrement, pas deux. Voir `panneaux`. */
  readonly colonnes: readonly Colonne[];
  /** Combien de panneaux ont été lus. Un, pour une table ordinaire.
   *
   *  Il est dit plutôt que tu : qui lit cette table doit pouvoir savoir que ses rangées viennent
   *  de deux blocs d'une même page, et non d'une page deux fois plus longue. */
  readonly panneaux: number;
  readonly rangees: readonly RangeeDeTable[];
  /** Les rangées dont toutes les cellules ont été lues et dont aucune n'est suspecte. */
  readonly utilisables: readonly number[];
  /** Les rangées à trou, nommées plutôt que comblées. */
  readonly incompletes: readonly number[];
  readonly suspectes: readonly CelluleSuspecte[];
  /** Les cases à relire, une par case et jamais une par page : les cellules non lues des rangées
   *  à trou, et les cellules suspectes. Vide quand ce n'est pas une table. */
  readonly aRelire: readonly ZoneARelire[];
  /** Une table demande au moins deux colonnes et assez de rangées pour que ce ne soit pas un
   *  hasard. En deçà, ce qu'on a trouvé n'est pas une table. */
  readonly estUneTable: boolean;
};

/** Ce qu'un nombre occupe ici, en largeur : la médiane des nombres réellement lus dans ce
 *  panneau. Tirée des données, parce qu'une largeur en pixels n'a pas de sens d'une image à
 *  l'autre. */
function largeurDUnNombre(ligne: readonly LigneDeTable[], panneau: readonly Colonne[]): number {
  const premiere = panneau[0]?.x ?? Number.NEGATIVE_INFINITY;
  const derniere = (panneau.at(-1)?.x ?? Number.POSITIVE_INFINITY) + (panneau.at(-1)?.etendue ?? 0);
  const largeurs = ligne
    .flatMap((une) => une.mots)
    .filter((mot) => valeurDe(mot.texte) !== undefined && mot.x >= premiere - 1 && mot.x <= derniere + 1)
    .map((mot) => mot.l)
    .sort((un, autre) => un - autre);
  // Sans un seul nombre dans ce panneau il n'y aurait pas de panneau : le repli ne sert qu'à
  // garder la fonction totale.
  return largeurs[Math.floor(largeurs.length / 2)] ?? 0;
}

export const RANGEES_POUR_UNE_TABLE = 4;

export function lireLaTable(mots: readonly MotLu[]): TableLue {
  const lignes = lignesDeMots(mots);
  const toutes = colonnesDeNombres(lignes);
  // Chaque panneau est lu **comme sa propre table** : ses rangées, ses colonnes, ses cellules
  // suspectes. Les coudre après coup serait plus court et faux — une valeur n'est aberrante que
  // par rapport à la colonne dont elle vient, et les colonnes d'un panneau ne sont pas celles de
  // l'autre. Les rangées des panneaux se suivent ensuite dans une seule liste, parce que ce sont
  // tous des enregistrements de même forme.
  const panneaux = panneauxDeColonnes(lignes, toutes);
  const rangees: RangeeDeTable[] = [];
  const suspectes: CelluleSuspecte[] = [];
  /** D'où vient chaque rangée : sa ligne de mots, et les colonnes de son panneau. */
  const ou = new Map<number, { ligne: LigneDeTable; panneau: readonly Colonne[] }>();
  for (const [place, panneau] of panneaux.entries()) {
    // La borne est le **milieu** entre deux panneaux, et non le centre de la dernière colonne du
    // précédent : les valeurs d'une colonne s'impriment un peu à droite de son centre, et prendre
    // ce centre pour borne faisait entrer le dernier nombre du panneau précédent dans l'intitulé
    // du suivant — « 6 Workout » au lieu de « Workout ».
    const precedent = panneaux[place - 1]?.at(-1)?.x;
    const depuis = precedent === undefined ? Number.NEGATIVE_INFINITY : (precedent + panneau[0]!.x) / 2;
    const siennes = rangeesDeTable(lignes, panneau, depuis);
    const decalage = rangees.length;
    for (const suspecte of cellulesSuspectes(siennes, panneau))
      suspectes.push({ ...suspecte, rangee: suspecte.rangee + decalage });
    // De quoi relire une case plus tard : sa ligne d'origine et les colonnes de **son** panneau.
    // `rangeesDeTable` rend une rangée par ligne, dans l'ordre des lignes : la place suffit.
    siennes.forEach((_, rang) => {
      ou.set(decalage + rang, { ligne: lignes[rang]!, panneau });
    });
    rangees.push(...siennes);
  }
  const colonnes = panneaux[0] ?? [];
  const douteuses = new Set(suspectes.map((suspecte) => suspecte.rangee));

  const utilisables: number[] = [];
  const incompletes: number[] = [];
  for (const [rang, rangee] of rangees.entries()) {
    const pleine = rangee.cellules.every((cellule) => cellule !== undefined);
    if (!pleine) {
      if (rangee.cellules.some((cellule) => cellule !== undefined)) incompletes.push(rang);
      continue;
    }
    if (!douteuses.has(rang)) utilisables.push(rang);
  }

  const estUneTable = colonnes.length >= 2 && utilisables.length + incompletes.length >= RANGEES_POUR_UNE_TABLE;

  // Les cases à relire : une par case. Les cellules non lues des rangées à trou d'abord, les
  // cellules suspectes ensuite — et jamais deux fois la même case, car une rangée peut être à la
  // fois à trou et suspecte.
  const aRelire: ZoneARelire[] = [];
  if (estUneTable) {
    const largeurs = new Map<readonly Colonne[], number>();
    // Pas de dédoublonnage : une case non lue n'a pas de valeur, donc ne peut pas être suspecte,
    // et `cellulesSuspectes` ne nomme jamais deux fois la même case. Une garde ici n'aurait
    // protégé de rien — aucun contrôle ne mourait de son retrait, et c'est ce qui l'a condamnée.
    const poser = (rangee: number, colonne: number, pourquoi: string): void => {
      const source = ou.get(rangee);
      const visee = source?.panneau[colonne];
      if (source === undefined || visee === undefined) return;
      const mots = source.ligne.mots;
      if (mots.length === 0) return;
      const haut = Math.min(...mots.map((mot) => mot.y));
      const bas = Math.max(...mots.map((mot) => mot.y + mot.h));
      let largeur = largeurs.get(source.panneau);
      if (largeur === undefined) {
        largeur = largeurDUnNombre(lignes, source.panneau);
        largeurs.set(source.panneau, largeur);
      }
      // Un nombre ne s'écarte pas de sa colonne de plus que sa propre largeur : la bande part
      // d'une demi-largeur avant le centre du groupe et court jusqu'au bout de son étendue, plus
      // une largeur et demie pour contenir le nombre lui-même.
      aRelire.push({
        rangee,
        colonne,
        x: visee.x - largeur / 2,
        y: haut,
        l: visee.etendue + largeur * 2,
        h: bas - haut,
        pourquoi,
      });
    };
    for (const rang of incompletes)
      rangees[rang]!.cellules.forEach((cellule, colonne) => {
        if (cellule === undefined) poser(rang, colonne, "cellule non lue");
      });
    for (const suspecte of suspectes) poser(suspecte.rangee, suspecte.colonne, `cellule suspecte : ${suspecte.pourquoi}`);
    // Pas de tri : l'ordre est déjà déterminé — les trous dans l'ordre des rangées, puis les
    // suspectes dans le leur — et personne ne lit cette liste dans l'ordre des positions. Un tri
    // ajouté « pour la propreté » ne faisait mourir aucun contrôle ; il est parti avec eux.
  }

  return {
    colonnes,
    panneaux: panneaux.length,
    rangees,
    utilisables,
    incompletes,
    suspectes,
    aRelire,
    estUneTable,
  };
}

/** Ce que le détecteur de table a vu, en clair. */
export function observationsDeLaTable(table: TableLue, ou: string): readonly Observation[] {
  if (!table.estUneTable)
    return [
      {
        detecteur: "table",
        source: "contenu",
        constat: `Pas de table ici : ${table.colonnes.length} colonne(s) de nombres alignées.`,
        ou,
        confiance: 1,
      },
    ];
  const observations: Observation[] = [
    {
      detecteur: "table",
      source: "contenu",
      constat:
        `Table de ${table.colonnes.length} colonnes : ${table.utilisables.length} rangée(s) complètes et nettes, ` +
        `${table.incompletes.length} à trou, ${table.suspectes.length} cellule(s) suspecte(s).`,
      ou,
      confiance: table.rangees.length === 0 ? 0 : table.utilisables.length / table.rangees.length,
    },
  ];
  for (const suspecte of table.suspectes.slice(0, 8))
    observations.push({
      detecteur: "table",
      source: "contenu",
      constat: `La valeur ${suspecte.valeur} ${suspecte.pourquoi}.`,
      ou: `${ou}, rangée ${suspecte.rangee + 1}, colonne ${suspecte.colonne + 1}`,
      confiance: 1,
    });
  return observations;
}
