import {
  ResultatRecette,
  type CotePage,
  type ElementRepere,
  type LigneInterpretee,
  type PageReperee,
  type Recette,
  type SourcePiste,
} from "@lienotheque/contrats";
import { PRESENCE_MINIMALE } from "./reperes.js";
import { appui, attribuerPistes, changementDeSupport, reglesDePistes } from "./pistes.js";
import { numeroterElements, type ElementPlace, type Ecart } from "./sequence.js";

/** Interpréteur de recettes (REC-02) : des repères lus à des éléments numérotés et reliés.
 *
 *  Déterministe de bout en bout — aucune horloge, aucun tirage, et toute égalité tranchée par
 *  une règle écrite plutôt que par l'ordre où les choses sont arrivées. Rejouer le même lot avec
 *  la même recette rend exactement le même résultat, ce qui est la seule façon de comparer deux
 *  recettes.
 *
 *  Tous les seuils viennent de la recette. Le code ne sait pas de quel document il s'agit. */

/** Ce qu'une page a donné à lire, avant toute numérotation. */
export type PageLue = {
  readonly index: number;
  /** Rang attendu dans la numérotation imprimée, avant décalage. L'index par défaut ; pour un
   *  livre photographié en doubles pages, deux pages par cliché. */
  readonly rang?: number;
  readonly cote?: CotePage;
  readonly pageLue?: number | undefined;
  readonly elements: readonly ElementRepere[];
};

/** Fenêtre de pages sur laquelle le décalage est voté : une lecture isolée fausse ne doit pas
 *  emporter la suite du livre. */
const FENETRE = 2;

const rangDe = (page: PageLue): number => page.rang ?? page.index;

/** Décalage le plus fréquent de tout le lot. À égalité, le plus petit : il faut une réponse, et
 *  elle doit être la même à chaque exécution. Sert de point d'appui, pas de verdict. */
export function decalageDominant(decalages: readonly number[]): number | undefined {
  if (decalages.length === 0) return undefined;
  const comptes = new Map<number, number>();
  for (const decalage of decalages) comptes.set(decalage, (comptes.get(decalage) ?? 0) + 1);
  return [...comptes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
}

/** Décalage le plus fréquent dans la fenêtre. À égalité, aucun ne l'emporte : `undefined`, et
 *  l'appelant garde le précédent — une égalité n'est pas une décision locale. */
function decalageVote(decalages: readonly number[]): number | undefined {
  if (decalages.length === 0) return undefined;
  const comptes = new Map<number, number>();
  for (const decalage of decalages) comptes.set(decalage, (comptes.get(decalage) ?? 0) + 1);
  const tries = [...comptes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const premier = tries[0]!;
  const second = tries[1];
  return second !== undefined && second[1] === premier[1] ? undefined : premier[0];
}

/** Parité imposée au décalage par la convention des doubles pages.
 *
 *  Si la page de gauche porte le pair, alors pour un rang pair à gauche le décalage est pair ;
 *  si elle porte l'impair, il est impair. Un décalage de l'autre parité mettrait les deux pages
 *  d'un cliché dans le désordre, ce qui n'arrive pas dans un livre relié. */
export const pariteDuDecalage = (pageGauche: "paire" | "impaire" | undefined): 0 | 1 | undefined =>
  pageGauche === undefined ? undefined : pageGauche === "paire" ? 0 : 1;

export type PageNumerotee = PageReperee;

/** Écart toléré entre le décalage d'une page et celui du lot. Au-delà, c'est une lecture fausse,
 *  pas un livre mal paginé : un numéro de page ne saute pas de cinquante d'un feuillet à l'autre. */
const ECART_TOLERE = 4;

/** Numérote les pages et relève les absentes.
 *
 *  Le décalage entre le numéro imprimé et le rang attendu est d'abord voté sur tout le lot : un
 *  livre n'en a qu'un, ou presque. Il est ensuite affiné page par page sur une fenêtre, mais
 *  seulement dans un voisinage du décalage général — une lecture isolée et aberrante ne doit pas
 *  renuméroter un chapitre. Un décalage qui augmente durablement veut dire que des pages manquent
 *  au lot : on dit lesquelles plutôt que de renuméroter en silence. */
export function numeroterPages(
  pages: readonly PageLue[],
  parite?: 0 | 1,
): { pages: PageNumerotee[]; absentes: number[] } {
  const lus = new Map<number, number>();
  for (const page of pages) {
    if (page.pageLue === undefined || page.elements.length === 0) continue;
    const decalage = page.pageLue - rangDe(page);
    // Un décalage de la mauvaise parité contredit la reliure : la lecture est fausse, pas le livre.
    if (parite !== undefined && ((decalage % 2) + 2) % 2 !== parite) continue;
    lus.set(rangDe(page), decalage);
  }

  const general = decalageDominant([...lus.values()]) ?? 0;
  const plausible = (decalage: number): boolean => Math.abs(decalage - general) <= ECART_TOLERE;

  const numerotees: PageNumerotee[] = [];
  const absentes: number[] = [];
  let precedent: number | undefined;

  for (const page of pages) {
    const rang = rangDe(page);
    const commun = {
      index: page.index,
      rang,
      elements: [...page.elements],
      ...(page.cote === undefined ? {} : { cote: page.cote }),
      ...(page.pageLue === undefined ? {} : { pageLue: page.pageLue }),
    };

    // Une première page sans aucun élément est une couverture : elle ne porte pas de numéro.
    if (page.elements.length === 0 && rang === 0) {
      numerotees.push({ ...commun, statut: "couverture" });
      continue;
    }

    const fenetre: number[] = [];
    for (let voisin = rang - FENETRE; voisin <= rang + FENETRE; voisin += 1) {
      const decalage = lus.get(voisin);
      if (decalage !== undefined && plausible(decalage)) fenetre.push(decalage);
    }
    let decalage = decalageVote(fenetre) ?? precedent ?? general;

    // Lecture isolée mais corroborée : si ce numéro saute en avant et que les éléments sautent
    // aussi, c'est que des pages manquent — deux indices valent mieux qu'un.
    const lu = page.pageLue;
    if (lu !== undefined && precedent !== undefined && plausible(lu - rang) && lu - rang > decalage) {
      const avant = numerotees[numerotees.length - 1]?.elements ?? [];
      const dernierAvant = avant[avant.length - 1];
      const premierIci = page.elements[0];
      if (dernierAvant !== undefined && premierIci !== undefined && premierIci.numero > dernierAvant.numero + 1)
        decalage = lu - rang;
    }

    if (precedent !== undefined && decalage > precedent)
      for (let manquante = rang + precedent; manquante < rang + decalage; manquante += 1)
        if (manquante > 0) absentes.push(manquante);

    const pageImprimee = Math.max(1, rang + decalage);
    numerotees.push({
      ...commun,
      pageImprimee,
      statut: page.pageLue === pageImprimee ? "lue" : "deduite",
    });
    precedent = decalage;
  }

  return { pages: numerotees, absentes };
}

export type { Ecart };

export type OptionsSequence = {
  /** Combien de pistes le support compte, su du média et non de son nom (REC-05). */
  readonly nombreDePistes?: number;
};

/** Enchaîne les éléments et leurs pistes, selon les règles de la recette.
 *
 *  Les numéros sont d'abord mis en suite par ancrage (voir `sequence.ts`) : une lecture fautive
 *  est écartée ou réparée, jamais propagée. Les pistes viennent ensuite, et pas une par une : les
 *  éléments qui portent un repère sont attribués tous ensemble, par la suite qui explique le
 *  mieux l'ensemble des lectures (voir `pistes.ts`). Les autres héritent, ou prennent leur propre
 *  numéro quand la recette dit que les deux coïncident. Jamais le nom d'un fichier (REC-05). */
export function sequencer(
  pages: readonly PageNumerotee[],
  recette: Recette,
  options: OptionsSequence = {},
): { lignes: LigneInterpretee[]; ecartes: Ecart[] } {
  const places: ElementPlace[] = [];
  for (const page of pages) {
    if (page.pageImprimee === undefined) continue;
    for (const element of page.elements) places.push({ ...element, pageImprimee: page.pageImprimee, cliche: page.index });
  }

  const { numerotes, ecartes } = numeroterElements(places, recette.regles.elements.saut_max);

  // Les porteurs de repère, dans l'ordre : ce sont eux qui commandent la suite des pistes.
  // Un repère vu mais illisible ne suffit pas — la présence seule donne des faux positifs, et
  // chacun d'eux consommerait une piste au détriment de toutes les suivantes.
  const porteurs: number[] = [];
  numerotes.forEach((element, rang) => {
    if (element.pisteLue !== undefined) porteurs.push(rang);
  });
  const lectures = porteurs.map((rang) => ({ ...numerotes[rang]!, numero: numerotes[rang]!.numeroRetenu }));

  const estimation = Math.max(1, lectures.length, ...lectures.map((lecture) => lecture.pisteLue ?? 0));
  const regles = reglesDePistes(recette, options.nombreDePistes ?? estimation);

  // Un support qui change renumérote ses pistes à partir de 1 : on attribue tranche par tranche.
  const coupure = changementDeSupport(lectures, regles);
  const tranches = coupure === undefined ? [lectures] : [lectures.slice(0, coupure), lectures.slice(coupure)];
  const attributions: { piste: number; disque: number }[] = [];
  tranches.forEach((tranche, support) => {
    for (const piste of attribuerPistes(tranche, regles)) attributions.push({ piste, disque: support + 1 });
  });
  const parRang = new Map(porteurs.map((rang, position) => [rang, attributions[position]!]));

  const pisteSuitElement = recette.regles.pistes?.egale_numero_element === true;
  const heritage = recette.regles.plusieurs_elements_par_piste;
  const lignes: LigneInterpretee[] = [];
  let dernierePiste = 0;
  let dernierDisque = 1;

  numerotes.forEach((element, rang) => {
    const attribution = parRang.get(rang);
    let piste: number | undefined;
    let disque = dernierDisque;
    let sourcePiste: SourcePiste | undefined;

    if (element.suite && recette.regles.mention_suite !== undefined && dernierePiste > 0) {
      piste = dernierePiste;
      sourcePiste = "suite";
    } else if (attribution !== undefined) {
      piste = attribution.piste;
      disque = attribution.disque;
      // La pastille fait foi quand elle appuie la piste retenue ; sinon c'est la suite qui décide.
      sourcePiste = element.pisteLue !== undefined && appui(element.pisteLue, piste) >= 1 ? "pastille" : "sequence";
    } else if (pisteSuitElement) {
      piste = element.numeroRetenu;
      sourcePiste = "numero_element";
    } else if (heritage && dernierePiste > 0) {
      piste = dernierePiste;
      sourcePiste = "suite";
    }
    // Sinon : aucun repère n'a encore été vu. L'élément n'a pas de piste, et on n'en invente pas.

    const brute =
      sourcePiste === "pastille"
        ? Math.min(1, (element.accordNumero + element.accordPiste) / 2 + (element.pisteLue === element.numeroRetenu ? 0.25 : 0))
        : sourcePiste === "sequence"
          ? // Tenue par la suite, pas lue sur la page : la confiance le dit.
            element.accordNumero * 0.8
          : element.accordNumero;
    // Un numéro réparé est tenu, pas lu : la confiance le dit aussi.
    const confiance = element.repare === undefined ? brute : brute * 0.7;

    lignes.push({
      numero: element.numeroRetenu,
      pageImprimee: element.pageImprimee,
      ...(piste === undefined ? {} : { piste }),
      disque,
      ...(sourcePiste === undefined ? {} : { sourcePiste }),
      // Où l'élément a été lu sur sa page. L'interprétation ne la touche pas : elle vient de la
      // lecture, et c'est elle que le Lecteur cadre. Un numéro réparé n'en a pas — il n'a été lu
      // nulle part, et cadrer un endroit où rien n'a été vu désignerait n'importe quoi.
      ...(element.zone === undefined || element.repare !== undefined ? {} : { zone: element.zone }),
      ...(element.zoneRepere === undefined || element.repare !== undefined ? {} : { zoneRepere: element.zoneRepere }),
      confiance: Math.round(confiance * 100) / 100,
    });
    if (piste !== undefined) {
      dernierePiste = piste;
      dernierDisque = disque;
    }
  });

  return { lignes, ecartes };
}

/** Le résultat complet, qui porte la recette l'ayant produit (REC-03). */
export function interpreter(pages: readonly PageLue[], recette: Recette, options: OptionsSequence = {}): ResultatRecette {
  const numerotees = numeroterPages(pages, pariteDuDecalage(recette.preparation.page_gauche));
  const { lignes, ecartes } = sequencer(numerotees.pages, recette, options);
  return ResultatRecette.parse({
    recette: { id: recette.id, version: recette.version },
    pages: numerotees.pages,
    lignes,
    pagesAbsentes: numerotees.absentes,
    ecartes,
  });
}
