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
        if (mot.x < premiere) avant.push(mot.texte);
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
      else if (mot.x < premiere) avant.push(mot.texte);
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

    // Second signe : un creux. Une valeur plus petite que ses deux voisines, dans une colonne
    // qui monte dès qu'on retire ces creux-là. Le détour par le retrait est nécessaire : deux
    // fautes suffisent à faire perdre sa monotonie à une colonne courte, et le signe le plus
    // utile s'éteindrait justement quand il y a le plus à trouver.
    //
    // Les valeurs déjà reconnues aberrantes sont mises de côté avant ce second examen : une
    // valeur dont on sait qu'elle est fausse ne doit pas servir à juger si la colonne est
    // ordonnée. Mesuré sur la table réelle — un 248 isolé au milieu d'une colonne de rangs
    // suffisait à la déclarer désordonnée, et les deux creux voisins passaient alors inaperçus.
    const creux = new Set<number>();
    for (let rang = 1; rang < presentes.length - 1; rang += 1) {
      if (aberrantes.has(rang)) continue;
      const avantCe = presentes.slice(0, rang).filter((_, place) => !aberrantes.has(place)).pop();
      const apresCe = presentes.slice(rang + 1).find((_, place) => !aberrantes.has(rang + 1 + place));
      if (avantCe === undefined || apresCe === undefined) continue;
      if (presentes[rang]!.valeur < avantCe.valeur && presentes[rang]!.valeur < apresCe.valeur) creux.add(rang);
    }
    if (creux.size > 0 && creux.size <= presentes.length / 3) {
      const sansCreux = presentes
        .filter((_, rang) => !creux.has(rang) && !aberrantes.has(rang))
        .map((entree) => entree.valeur);
      const monte = sansCreux.every((valeur, rang) => rang === 0 || valeur > sansCreux[rang - 1]!);
      if (monte)
        for (const rang of creux) {
          const entree = presentes[rang]!;
          if (suspectes.some((suspecte) => suspecte.rangee === entree.rang && suspecte.colonne === rangColonne)) continue;
          const avantCe = presentes.slice(0, rang).filter((_, place) => !aberrantes.has(place)).pop();
          const apresCe = presentes.slice(rang + 1).find((_, place) => !aberrantes.has(rang + 1 + place));
          suspectes.push({
            rangee: entree.rang,
            colonne: rangColonne,
            valeur: entree.valeur,
            pourquoi: `rompt la montée de la colonne, entre ${avantCe?.valeur} et ${apresCe?.valeur}`,
          });
        }
    }
  }
  return suspectes;
}

export type TableLue = {
  readonly colonnes: readonly Colonne[];
  readonly rangees: readonly RangeeDeTable[];
  /** Les rangées dont toutes les cellules ont été lues et dont aucune n'est suspecte. */
  readonly utilisables: readonly number[];
  /** Les rangées à trou, nommées plutôt que comblées. */
  readonly incompletes: readonly number[];
  readonly suspectes: readonly CelluleSuspecte[];
  /** Une table demande au moins deux colonnes et assez de rangées pour que ce ne soit pas un
   *  hasard. En deçà, ce qu'on a trouvé n'est pas une table. */
  readonly estUneTable: boolean;
};

export const RANGEES_POUR_UNE_TABLE = 4;

export function lireLaTable(mots: readonly MotLu[]): TableLue {
  const lignes = lignesDeMots(mots);
  const colonnes = colonnesDeNombres(lignes);
  const rangees = rangeesDeTable(lignes, colonnes);
  const suspectes = cellulesSuspectes(rangees, colonnes);
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

  return {
    colonnes,
    rangees,
    utilisables,
    incompletes,
    suspectes,
    estUneTable: colonnes.length >= 2 && utilisables.length + incompletes.length >= RANGEES_POUR_UNE_TABLE,
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
