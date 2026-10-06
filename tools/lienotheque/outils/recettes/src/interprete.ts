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

/** Ce qu'une relecture ciblée a vu sur un repère (OUT-08, ANC-02).
 *
 *  Deux choses, et la seconde est celle qui manquait : le nombre lu, et si un repère est là. Une
 *  lecture seule ne dit pas si ce qu'elle a lu **en est** un, et sur le corpus de référence la
 *  détection tire environ trois fois trop souvent. */
export type LectureParVision = {
  readonly numero?: number | undefined;
  readonly confiance: number;
  /** « absent » : ce n'était pas un repère. « present » : c'en est un. « incertain » : le modèle
   *  a hésité, et le dire est une réponse. Absent du tout quand on n'a demandé qu'un nombre. */
  readonly repere?: "present" | "absent" | "incertain" | undefined;
  readonly outil: { readonly nom: string; readonly version: string };
};

/** Clef d'une relecture : le cliché, son côté, et le numéro que la lecture avait rendu. C'est ce
 *  triplet que la sélection des pavés connaît, et il doit se retrouver ici sans ambiguïté — deux
 *  demi-pages d'un même cliché portent le même index. */
export const clefDeVision = (cliche: number, cote: string | undefined, numero: number): string =>
  `${cliche}/${cote ?? "—"}:${numero}`;

/** Plafond de confiance d'une piste venue d'une relecture ciblée.
 *
 *  Une pastille lue sur place peut atteindre 1 : deux passes d'OCR qui s'accordent sur les mêmes
 *  chiffres, c'est deux témoins. Une relecture ciblée n'en a qu'un, et rien sur la page ne
 *  corrobore les chiffres eux-mêmes — c'est le résultat que la suite corrobore, pas la lecture.
 *  Elle reste donc sous une pastille, tout en passant largement un seuil de recette. */
const PLAFOND_VISION = 0.85;

/** Combien de pistes chaque support **présent** compte, par numéro de support.
 *
 *  Tiré de l'inventaire des médias : leur nombre et le motif de nom que la recette déclare en
 *  « indice » disent quels supports sont là et jusqu'où ils vont. C'est un fait sur les médias, pas
 *  sur leur nom (REC-05) — le nom ne sert qu'à les ranger.
 *
 *  Et cela reste un indice : un repère lu le contredit toujours. Si une pastille donne une piste
 *  au-delà de ce que l'inventaire connaît, c'est l'inventaire qui est incomplet, pas la page. */
export type SupportsPresents = ReadonlyMap<number, number>;

/** L'inventaire, à partir des médias rangés. */
export function supportsPresents(medias: readonly { readonly piste: number; readonly disque?: number | undefined }[]): SupportsPresents {
  const parSupport = new Map<number, number>();
  for (const media of medias) {
    const support = media.disque ?? 1;
    parSupport.set(support, Math.max(parSupport.get(support) ?? 0, media.piste));
  }
  return parSupport;
}

export type OptionsSequence = {
  /** Combien de pistes le support compte, su du média et non de son nom (REC-05). */
  readonly nombreDePistes?: number;
  /** Quels supports sont présents, et jusqu'où ils vont. Absent, rien ne change : on suppose un
   *  support unique dont on ne sait pas la taille. */
  readonly supports?: SupportsPresents;
  /** Ce qu'une relecture ciblée a lu, par clef d'élément. Absent, rien ne change. */
  readonly vision?: ReadonlyMap<string, LectureParVision>;
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
    for (const element of page.elements)
      places.push({ ...element, pageImprimee: page.pageImprimee, cliche: page.index, ...(page.cote === undefined ? {} : { cote: page.cote }) });
  }

  const { numerotes, ecartes } = numeroterElements(places, recette.regles.elements.saut_max);

  // Les porteurs de repère, dans l'ordre : ce sont eux qui commandent la suite des pistes.
  // Un repère vu mais illisible ne suffit pas — la présence seule donne des faux positifs, et
  // chacun d'eux consommerait une piste au détriment de toutes les suivantes.
  // Ce qu'une relecture ciblée a lu, retrouvé par élément. Elle ne remplace pas la lecture
  // locale : elle devient une lecture de plus, que l'attribution pèsera comme les autres.
  const relu = (element: (typeof places)[number]): LectureParVision | undefined =>
    options.vision?.get(clefDeVision(element.cliche, element.cote, element.numero));

  const porteurs: number[] = [];
  numerotes.forEach((element, rang) => {
    const vision = relu(element);
    // Un pavé déclaré « absent » n'est pas un repère : il ne peut pas ouvrir une piste, et la
    // lecture qu'on en avait tirée n'a plus de provenance. C'est le levier de ce lot — la
    // détection locale tire trois fois trop souvent, et rien dans la lecture ne le disait.
    if (vision?.repere === "absent") return;
    if (element.pisteLue !== undefined || vision?.numero !== undefined) porteurs.push(rang);
  });
  const lectures = porteurs.map((rang) => {
    const element = numerotes[rang]!;
    const vision = relu(element);

    // La relecture l'emporte comme lecture, même quand elle contredit la locale. C'est contre
    // l'intuition, et c'est mesuré.
    //
    // On a essayé de ne la laisser gagner que lorsqu'elle **complète** la locale — l'un des deux
    // nombres contenant l'autre, au sens d'`appui` —, parce que trois pistes de F4 se perdaient
    // sur une relecture fausse ayant effacé une lecture locale exacte : 8 contre 3, 24 contre 34,
    // 69 contre 88. La règle coûte quatre premiers éléments de plus qu'elle n'en rend, 81 à 77.
    //
    // Confrontées à l'oracle sur les pavés qu'il connaît : quand l'un contient l'autre, la
    // relecture a raison 56 fois et la locale 0 ; quand les deux se contredisent, la relecture a
    // raison 11 fois et la locale 3. Elle l'emporte donc dans les deux cas, et la confiance ne
    // sépare rien — à 0,90 et plus, 7 contre 2 ; en dessous, 4 contre 1. Les trois exceptions sont
    // la queue d'un témoin juste quatre-vingt-quinze fois sur cent, pas un défaut de règle.
    const accord = vision === undefined ? element.accordPiste : Math.max(element.accordPiste, vision.confiance);
    return {
      ...element,
      numero: element.numeroRetenu,
      ...(vision?.numero === undefined ? {} : { pisteLue: vision.numero }),
      ...(vision === undefined ? {} : { accordPiste: vision.repere === "present" ? accord : vision.confiance }),
    };
  });

  const estimation = Math.max(1, lectures.length, ...lectures.map((lecture) => lecture.pisteLue ?? 0));
  const base = reglesDePistes(recette, options.nombreDePistes ?? estimation);
  // Jusqu'où va le premier support, si l'inventaire le sait : une coupure avant sa dernière piste
  // connue est prématurée.
  const pistesDuPremier = options.supports?.get(1);
  const regles = pistesDuPremier === undefined ? base : { ...base, pistesDuSupport: pistesDuPremier };

  // Un support qui change renumérote ses pistes à partir de 1 : on attribue tranche par tranche.
  const coupure = changementDeSupport(lectures, regles);
  const tranches = coupure === undefined ? [lectures] : [lectures.slice(0, coupure), lectures.slice(coupure)];

  const attributions: ({ piste: number; disque: number } | undefined)[] = [];
  tranches.forEach((tranche, rangDuSupport) => {
    const support = rangDuSupport + 1;

    // Un support que l'inventaire ne connaît pas n'a aucun média : ses éléments restent sans piste
    // plutôt que d'être forcés dans le support précédent. Un livre qui couvre deux disques dont on
    // n'a que le premier doit dire « pas d'enregistrement ici », et non relier au hasard.
    if (options.supports !== undefined && !options.supports.has(support)) {
      for (const _ of tranche) attributions.push(undefined);
      return;
    }

    // Jusqu'où va ce support. L'inventaire le dit, mais une pastille lue le contredit : si elle
    // donne une piste plus loin, c'est l'inventaire qui est incomplet.
    const connues = options.supports?.get(support);
    const lues = Math.max(0, ...tranche.map((lecture) => lecture.pisteLue ?? 0));
    const combien = connues === undefined ? regles.nombreDePistes : Math.max(connues, lues);
    const reglesDuSupport = combien === regles.nombreDePistes ? regles : { ...regles, nombreDePistes: combien };

    for (const piste of attribuerPistes(tranche, reglesDuSupport)) attributions.push({ piste, disque: support });
  });

  // **Une règle essayée et réfutée, pour qu'on ne la refasse pas.**
  //
  // L'attribution optimise sur toute la suite : un élément qui lit « 3 » soutient partiellement la
  // piste 38, et si ses voisines le permettent elle l'y place — ce qui est juste, « 3 » est bien un
  // 38 tronqué. Mais il arrive qu'un élément **plus loin** porte une lecture franche de 38, et on a
  // donc essayé de faire de celui-là le début de la piste, en repoussant le précédent sur la piste
  // d'avant. C'est le sens d'un repère : il marque un début.
  //
  // Mesuré sur F4 : **5 pistes redressées, 12 abîmées.** Dans chaque cas abîmé, le bon premier
  // élément portait une lecture partielle et un élément plus loin lisait la piste franchement — le
  // signal est faux aussi souvent qu'il est juste, parce que plusieurs éléments partagent une piste
  // et que rien ne distingue, dans la lecture seule, un vrai repère d'une forme qui lui ressemble.
  // 73 premiers éléments sont tombés à 66.
  //
  // Ce qui manquerait pour trancher : savoir lequel des deux porte vraiment le repère, ce que ni la
  // présence (0,26 à 0,51 des deux côtés) ni l'accord ne disent.

  const parRang = new Map(porteurs.map((rang, position) => [rang, attributions[position]]));
  /** Les rangs qui relèvent d'un support absent : ils n'héritent de rien. */
  const sansSupport = new Set(porteurs.filter((_, position) => attributions[position] === undefined));

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

    // Un élément d'un support absent ne prend aucune piste, et n'en hérite pas non plus : il n'y
    // a pas d'enregistrement à relier, et en inventer un serait pire que de n'en relier aucun.
    if (sansSupport.has(rang)) {
      lignes.push({
        numero: element.numeroRetenu,
        pageImprimee: element.pageImprimee,
        disque: dernierDisque,
        ...(element.zone === undefined ? {} : { zone: element.zone }),
        ...(element.zoneRepere === undefined ? {} : { zoneRepere: element.zoneRepere }),
        confiance: element.accordNumero,
      });
      return;
    }

    if (element.suite && recette.regles.mention_suite !== undefined && dernierePiste > 0) {
      piste = dernierePiste;
      sourcePiste = "suite";
    } else if (attribution !== undefined) {
      piste = attribution.piste;
      disque = attribution.disque;
      // La pastille fait foi quand elle appuie la piste retenue ; sinon c'est la suite qui décide.
      sourcePiste = element.pisteLue !== undefined && appui(element.pisteLue, piste) >= 1 ? "pastille" : "sequence";
      // ANC-02 : un numéro relu n'est appliqué que si la suite le confirme. Elle l'a vu comme une
      // lecture de plus, et si elle a tranché ailleurs c'est qu'elle la contredit — on ne
      // l'applique pas, et l'élément ira se faire vérifier.
      const vision = relu(element);
      if (vision?.numero !== undefined) sourcePiste = vision.numero === piste ? "vision" : "sequence";
    } else if (pisteSuitElement) {
      piste = element.numeroRetenu;
      sourcePiste = "numero_element";
    } else if (heritage && dernierePiste > 0) {
      piste = dernierePiste;
      sourcePiste = "suite";
    }
    // Sinon : aucun repère n'a encore été vu. L'élément n'a pas de piste, et on n'en invente pas.

    const vision = relu(element);
    const brute =
      sourcePiste === "vision"
        ? Math.min(PLAFOND_VISION, vision!.confiance * element.accordNumero)
        : sourcePiste === "pastille"
          ? Math.min(1, (element.accordNumero + element.accordPiste) / 2 + (element.pisteLue === element.numeroRetenu ? 0.25 : 0))
          : sourcePiste === "sequence"
            ? // Tenue par la suite, pas lue sur la page : la confiance le dit.
              element.accordNumero * 0.8
            : element.accordNumero;
    // Un numéro réparé est tenu, pas lu : la confiance le dit aussi.
    const tenue = element.repare === undefined ? brute : brute * 0.7;
    // Et un numéro relu que la suite n'a pas confirmé passe sous le seuil de la recette, pour
    // que Vérifier le montre. Ce n'est pas un artifice d'affichage : une relecture contredite
    // par ses voisines est exactement un cas qu'un œil doit trancher (ANC-02, CLA-05).
    const confiance =
      vision?.numero !== undefined && sourcePiste !== "vision" ? Math.min(tenue, recette.validation.seuil_confiance * 0.9) : tenue;

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
