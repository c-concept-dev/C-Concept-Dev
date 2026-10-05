import type { CotePage, ElementRepere } from "@lienotheque/contrats";

/** Mise en séquence des éléments lus (REC-02).
 *
 *  Une page scannée rend des numéros dont certains sont faux : un 183 lu 163, un 7 lu 1. Les
 *  reprendre dans l'ordre d'arrivée propagerait chaque faute. On cherche donc d'abord la plus
 *  longue suite croissante compatible — ce sont les ancres, ce qu'on tient pour sûr —, puis on
 *  répare ce qui est entre deux ancres, quand la réparation est forcée.
 *
 *  Porté de `docs/prototypes/westwood_apparier.py`, qui reste l'oracle. */

export type ElementPlace = ElementRepere & {
  readonly pageImprimee: number;
  readonly cliche: number;
  /** Côté du cliché, quand il a été coupé : deux demi-pages portent le même index, et il faut
   *  pouvoir les distinguer pour retrouver une relecture ciblée. */
  readonly cote?: CotePage | undefined;
};

/** Combien d'éléments en arrière on cherche une ancre. Au-delà, une page entière manquerait. */
const PORTEE = 40;

export type Chaine = { readonly ancres: readonly number[] };

/** Saut permis entre deux éléments : `saut_max` vaut pour un pas de page, et compte donc les
 *  pages traversées. Quand des pages manquent au lot, les éléments qu'elles portaient manquent
 *  aussi, et le saut qui les enjambe est légitime. */
export const sautPermis = (depuis: ElementPlace, vers: ElementPlace, sautMax: number): number =>
  sautMax * Math.max(1, vers.pageImprimee - depuis.pageImprimee);

/** La plus longue suite croissante compatible avec les règles de la recette.
 *
 *  Déterministe : à égale longueur, c'est la chaîne qui finit le plus tôt qui l'emporte, et le
 *  prédécesseur le plus proche. Deux exécutions rendent les mêmes ancres. */
export function ancrer(elements: readonly ElementPlace[], sautMax: number): number[] {
  const longueur = elements.length;
  if (longueur === 0) return [];

  const meilleur = new Array<number>(longueur).fill(1);
  const avant = new Array<number>(longueur).fill(-1);

  for (let i = 0; i < longueur; i += 1)
    for (let j = Math.max(0, i - PORTEE); j < i; j += 1) {
      const ecart = elements[i]!.numero - elements[j]!.numero;
      if (ecart <= 0 || ecart > sautPermis(elements[j]!, elements[i]!, sautMax)) continue;
      if (meilleur[j]! + 1 > meilleur[i]!) {
        meilleur[i] = meilleur[j]! + 1;
        avant[i] = j;
      }
    }

  let fin = 0;
  for (let i = 1; i < longueur; i += 1) if (meilleur[i]! > meilleur[fin]!) fin = i;

  const ancres: number[] = [];
  for (let i = fin; i !== -1; i = avant[i]!) ancres.push(i);
  return ancres.reverse();
}

export type NumeroRepare = { readonly numero: number; readonly repare?: "interpolation" | "suffixe" };

/** Répare les numéros entre deux ancres, quand la réparation est forcée.
 *
 *  Deux cas seulement, et jamais de choix arbitraire. S'il reste exactement autant de places que
 *  de numéros libres, l'ordre impose la correspondance. Sinon, un numéro mal lu garde souvent sa
 *  fin — « 183 » lu « 83 », « 191 » lu « 91 » — et si un seul numéro libre finit ainsi, c'est
 *  lui. Dans tous les autres cas on ne répare pas : un élément sans numéro vaut mieux qu'un
 *  élément mal numéroté. */
export function reparer(elements: readonly ElementPlace[], ancres: readonly number[]): (NumeroRepare | undefined)[] {
  const numeros = new Array<NumeroRepare | undefined>(elements.length).fill(undefined);
  for (const ancre of ancres) numeros[ancre] = { numero: elements[ancre]!.numero };

  for (let rang = 0; rang + 1 < ancres.length; rang += 1) {
    const debut = ancres[rang]!;
    const fin = ancres[rang + 1]!;
    const places: number[] = [];
    for (let i = debut + 1; i < fin; i += 1) places.push(i);
    if (places.length === 0) continue;

    const libres: number[] = [];
    for (let numero = elements[debut]!.numero + 1; numero < elements[fin]!.numero; numero += 1) libres.push(numero);

    if (places.length === libres.length) {
      places.forEach((place, position) => {
        numeros[place] = { numero: libres[position]!, repare: "interpolation" };
      });
      continue;
    }

    for (const place of places) {
      const lu = String(elements[place]!.numero);
      const candidats = libres.filter((libre) => {
        const texte = String(libre);
        return texte.endsWith(lu) || texte.endsWith(lu.slice(-2));
      });
      if (candidats.length === 1) numeros[place] = { numero: candidats[0]!, repare: "suffixe" };
    }
  }
  return numeros;
}

export type ElementNumerote = ElementPlace & { readonly numeroRetenu: number; readonly repare?: "interpolation" | "suffixe" };
export type Ecart = { readonly numero: number; readonly page: number; readonly motif: string };

/** Numérote les éléments d'un lot : ancres, réparations, et ce qu'on renonce à numéroter. */
export function numeroterElements(
  elements: readonly ElementPlace[],
  sautMax: number,
): { numerotes: ElementNumerote[]; ecartes: Ecart[] } {
  const ancres = ancrer(elements, sautMax);
  const numeros = reparer(elements, ancres);

  const numerotes: ElementNumerote[] = [];
  const ecartes: Ecart[] = [];

  elements.forEach((element, rang) => {
    const retenu = numeros[rang];
    if (retenu === undefined) {
      ecartes.push({
        numero: element.numero,
        page: element.cliche,
        motif: `hors de la suite croissante, et rien ne force sa place`,
      });
      return;
    }
    numerotes.push({
      ...element,
      numeroRetenu: retenu.numero,
      ...(retenu.repare === undefined ? {} : { repare: retenu.repare }),
    });
  });

  return { numerotes, ecartes };
}
