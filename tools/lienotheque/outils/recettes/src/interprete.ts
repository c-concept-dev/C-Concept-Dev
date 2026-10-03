import {
  PageReperee,
  ResultatRecette,
  type ElementRepere,
  type LigneInterpretee,
  type Recette,
  type SourcePiste,
} from "@lienotheque/contrats";

/** Interpréteur de recettes (REC-02) : des repères lus à des éléments numérotés et reliés.
 *
 *  Déterministe de bout en bout — aucune horloge, aucun tirage, et toute égalité tranchée par
 *  une règle écrite plutôt que par l'ordre où les choses sont arrivées. Rejouer le même lot avec
 *  la même recette rend exactement le même résultat, ce qui est la seule façon de comparer deux
 *  recettes.
 *
 *  Tous les seuils viennent de la recette. Le code ne sait pas de quel document il s'agit. */

/** Ce qu'une page a donné à lire, avant toute numérotation. */
export type PageLue = { readonly index: number; readonly pageLue?: number | undefined; readonly elements: readonly ElementRepere[] };

/** Fenêtre de pages sur laquelle le décalage est voté : une lecture isolée fausse ne doit pas
 *  emporter la suite du livre. */
const FENETRE = 2;

/** Décalage le plus fréquent dans la fenêtre. À égalité, aucun ne l'emporte : `undefined`, et
 *  l'appelant garde le précédent — une égalité n'est pas une décision. */
function decalageVote(decalages: readonly number[]): number | undefined {
  if (decalages.length === 0) return undefined;
  const comptes = new Map<number, number>();
  for (const decalage of decalages) comptes.set(decalage, (comptes.get(decalage) ?? 0) + 1);
  const tries = [...comptes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const premier = tries[0]!;
  const second = tries[1];
  return second !== undefined && second[1] === premier[1] ? undefined : premier[0];
}

export type PageNumerotee = PageReperee;

/** Numérote les pages et relève les absentes.
 *
 *  Le décalage entre le numéro imprimé et le rang de l'image est voté sur une fenêtre. Un
 *  décalage qui augmente durablement veut dire que des pages manquent au lot : on dit lesquelles
 *  plutôt que de renuméroter en silence. */
export function numeroterPages(pages: readonly PageLue[]): { pages: PageNumerotee[]; absentes: number[] } {
  const lus = new Map<number, number>();
  for (const page of pages)
    if (page.pageLue !== undefined && page.elements.length > 0) lus.set(page.index, page.pageLue - page.index);

  const numerotees: PageNumerotee[] = [];
  const absentes: number[] = [];
  let precedent: number | undefined;

  for (const page of pages) {
    // Une première page sans aucun élément est une couverture : elle ne porte pas de numéro.
    if (page.elements.length === 0 && page.index === 0) {
      numerotees.push({ index: page.index, statut: "couverture", elements: [...page.elements], ...(page.pageLue === undefined ? {} : { pageLue: page.pageLue }) });
      continue;
    }

    const fenetre: number[] = [];
    for (let voisin = page.index - FENETRE; voisin <= page.index + FENETRE; voisin += 1) {
      const decalage = lus.get(voisin);
      if (decalage !== undefined) fenetre.push(decalage);
    }
    let decalage = decalageVote(fenetre) ?? precedent ?? fenetre[0] ?? 0;

    // Lecture isolée mais corroborée : si ce numéro saute en avant et que les éléments sautent
    // aussi, c'est que des pages manquent — deux indices valent mieux qu'un.
    if (page.pageLue !== undefined && precedent !== undefined && page.pageLue - page.index > decalage) {
      const avant = numerotees[numerotees.length - 1]?.elements ?? [];
      const dernierAvant = avant[avant.length - 1];
      const premierIci = page.elements[0];
      if (dernierAvant !== undefined && premierIci !== undefined && premierIci.numero > dernierAvant.numero + 1)
        decalage = page.pageLue - page.index;
    }

    if (precedent !== undefined && decalage > precedent)
      for (let manquante = page.index + precedent; manquante < page.index + decalage; manquante += 1) absentes.push(manquante);

    const pageImprimee = page.index + decalage;
    numerotees.push({
      index: page.index,
      pageImprimee,
      statut: page.pageLue === pageImprimee ? "lue" : "deduite",
      elements: [...page.elements],
      ...(page.pageLue === undefined ? {} : { pageLue: page.pageLue }),
    });
    precedent = decalage;
  }

  return { pages: numerotees, absentes };
}

export type Ecart = { readonly numero: number; readonly page: number; readonly motif: string };

/** Enchaîne les éléments et leurs pistes, selon les règles de la recette.
 *
 *  Un élément dont le numéro rompt l'ordre est écarté et nommé : une lecture fautive ne doit pas
 *  décaler tout ce qui suit. La piste vient de la pastille quand elle est lisible et que son pas
 *  est permis ; d'une mention de suite quand la recette en déclare une ; du numéro d'élément
 *  quand la recette dit qu'ils coïncident. Jamais du nom d'un fichier (REC-05). */
export function sequencer(
  pages: readonly PageNumerotee[],
  recette: Recette,
): { lignes: LigneInterpretee[]; ecartes: Ecart[] } {
  const lignes: LigneInterpretee[] = [];
  const ecartes: Ecart[] = [];
  const sautMax = recette.regles.elements.saut_max;
  const strict = recette.regles.elements.ordre === "strictement_croissant";
  const pas = recette.regles.pistes?.pas_autorises ?? [0, 1];
  const pisteSuitElement = recette.regles.pistes?.egale_numero_element === true;

  let dernierNumero = 0;
  let dernierePiste = 0;
  let dernierePage: number | undefined;

  for (const page of pages) {
    if (page.pageImprimee === undefined) continue;
    for (const element of page.elements) {
      const numero = element.numero;
      const enOrdre = strict ? numero > dernierNumero : numero >= dernierNumero;

      // `saut_max` vaut pour un pas de page. Quand des pages manquent au lot, les éléments
      // qu'elles portaient manquent aussi : le saut permis compte donc les pages traversées
      // depuis le dernier élément retenu. Sans cela, un trou connu ferait écarter la page qui
      // le suit — et l'écart se propagerait à tout ce qui vient après.
      const traversee = Math.max(1, page.pageImprimee - (dernierePage ?? page.pageImprimee));
      const sautPermis = sautMax * traversee;

      if (!enOrdre || numero > dernierNumero + sautPermis) {
        ecartes.push({
          numero,
          page: page.index,
          motif: enOrdre
            ? `saut de ${numero - dernierNumero}, au-delà du maximum de ${sautPermis}`
            : `ne suit pas ${dernierNumero}`,
        });
        continue;
      }

      let piste: number;
      let sourcePiste: SourcePiste;
      if (element.suite && recette.regles.mention_suite !== undefined && dernierePiste > 0) {
        piste = dernierePiste;
        sourcePiste = "suite";
      } else if (element.pisteLue !== undefined && pas.includes(element.pisteLue - dernierePiste)) {
        piste = element.pisteLue;
        sourcePiste = "pastille";
      } else if (pisteSuitElement) {
        piste = numero;
        sourcePiste = "numero_element";
      } else {
        piste = Math.max(1, dernierePiste);
        sourcePiste = "suite";
      }

      const confiance =
        sourcePiste === "pastille"
          ? Math.min(1, (element.accordNumero + element.accordPiste) / 2 + (element.pisteLue === numero ? 0.25 : 0))
          : element.accordNumero;

      lignes.push({
        numero,
        pageImprimee: page.pageImprimee,
        piste,
        sourcePiste,
        confiance: Math.round(confiance * 100) / 100,
      });
      dernierNumero = numero;
      dernierePiste = piste;
      dernierePage = page.pageImprimee;
    }
  }

  return { lignes, ecartes };
}

/** Le résultat complet, qui porte la recette l'ayant produit (REC-03). */
export function interpreter(pages: readonly PageLue[], recette: Recette): ResultatRecette {
  const numerotees = numeroterPages(pages);
  const { lignes, ecartes } = sequencer(numerotees.pages, recette);
  return ResultatRecette.parse({
    recette: { id: recette.id, version: recette.version },
    pages: numerotees.pages,
    lignes,
    pagesAbsentes: numerotees.absentes,
    ecartes,
  });
}
