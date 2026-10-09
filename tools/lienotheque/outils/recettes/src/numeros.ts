/** La forme d'un numéro d'élément, donnée par l'exemple (REC-01, REC-07).
 *
 *  Un administrateur sait dire « ici, un numéro ressemble à 2.46 ». Il n'a pas à savoir écrire
 *  une expression régulière, et on n'a pas à lui en demander une. L'exemple suffit, et deux
 *  règles le lisent :
 *
 *  1. **Chaque groupe de chiffres vaut un à trois chiffres.** La même générosité qu'avant, et
 *     c'est pourquoi l'absence d'exemple ne change rien à ce qui était déjà lu.
 *  2. **Tout le reste est repris tel quel.** Un point reste un point, un tiret un tiret.
 *
 *  L'ordre suit : un numéro à plusieurs groupes se compare groupe par groupe, chacun comptant
 *  pour trois chiffres. « 2.46 » passe avant « 3.3 », et « 12.108 » après les deux. Cela donne
 *  un rang entier, que les règles d'ordre et de saut emploient sans rien savoir de la forme.
 */

/** Combien de chiffres un groupe peut porter. Au-delà, ce n'est plus un numéro d'élément. */
const CHIFFRES_PAR_GROUPE = 3;

/** La base d'un groupe dans le rang : trois chiffres, donc mille. */
const BASE = 10 ** CHIFFRES_PAR_GROUPE;

export type FormeDeNumero = {
  /** Ce qu'un numéro doit être. */
  readonly motif: RegExp;
  /** Les caractères, hors chiffres, que l'exemple impose : le lecteur doit savoir les lire. */
  readonly separateurs: string;
  /** Combien de groupes de chiffres. Un seul, c'est un nombre ; davantage, c'est une suite. */
  readonly groupes: number;
};

/** Ce qu'on lit sans exemple : un nombre de un à trois chiffres, comme toujours. */
export const FORME_PAR_DEFAUT: FormeDeNumero = {
  motif: /^\d{1,3}$/,
  separateurs: "",
  groupes: 1,
};

const echapper = (texte: string): string => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Lit l'exemple et en tire la forme. Un exemple sans chiffre n'en est pas un. */
export function formeDepuisExemple(exemple: string): FormeDeNumero {
  const morceaux = exemple.match(/\d+|\D+/g) ?? [];
  if (!morceaux.some((morceau) => /^\d+$/.test(morceau))) return FORME_PAR_DEFAUT;

  let motif = "^";
  let separateurs = "";
  let groupes = 0;
  for (const morceau of morceaux) {
    if (/^\d+$/.test(morceau)) {
      motif += `\\d{1,${CHIFFRES_PAR_GROUPE}}`;
      groupes += 1;
    } else {
      motif += echapper(morceau);
      separateurs += morceau;
    }
  }
  return { motif: new RegExp(`${motif}$`), separateurs, groupes };
}

/** Le rang d'un numéro lu : un entier qui garde l'ordre, groupe par groupe.
 *
 *  Rien si le texte ne répond pas à la forme — ce n'est alors pas un numéro, et l'inventer
 *  vaudrait moins que de ne rien dire. */
export function rangDuNumero(texte: string, forme: FormeDeNumero): number | undefined {
  const propre = texte.trim();
  if (!forme.motif.test(propre)) return undefined;
  const groupes = propre.match(/\d+/g) ?? [];
  if (groupes.length === 0) return undefined;
  let rang = 0;
  for (const groupe of groupes) {
    const valeur = Number(groupe);
    if (!Number.isFinite(valeur) || valeur >= BASE) return undefined;
    rang = rang * BASE + valeur;
  }
  return rang > 0 ? rang : undefined;
}

/** Les caractères que le lecteur doit accepter pour cette forme et cet alphabet.
 *
 *  Les séparateurs de l'exemple s'ajoutent à l'alphabet déclaré : demander « 2.46 » sans
 *  autoriser le point reviendrait à demander un numéro qu'on s'interdit de lire. */
export function caracteresAcceptes(alphabet: "chiffres" | "latin" | "tous", forme: FormeDeNumero): string | undefined {
  const sans = [...new Set(forme.separateurs)].join("");
  switch (alphabet) {
    case "chiffres":
      return `0123456789${sans}`;
    case "latin":
      return `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz${sans}`;
    // « tous » : aucune liste, le lecteur prend ce qu'il trouve.
    case "tous":
      return undefined;
  }
}

/** Les chiffres d'un numéro, répartis en groupes par les écarts les plus larges (REC-07).
 *
 *  Un séparateur imprimé petit — un point entre deux chiffres — ne survit pas à la lecture : le
 *  texte revient collé, « 21 » pour « 2.1 ». Mais l'**espace** qu'il laisse, lui, survit : deux
 *  chiffres d'un même groupe se touchent presque, deux groupes se tiennent à distance.
 *
 *  On sait combien de groupes attendre — l'exemple le dit —, donc on coupe aux `groupes − 1`
 *  écarts les plus larges. Et on refuse quand la coupure n'est pas franche : si le plus étroit
 *  des écarts retenus ne dépasse pas nettement le plus large de ceux qu'on garde, le découpage
 *  serait arbitraire, et un numéro inventé vaut moins qu'un numéro absent.
 */
const ECART_FRANC = 1.6;

export function grouperParEcart<T extends { readonly x: number; readonly l: number }>(
  chiffres: readonly T[],
  groupes: number,
): readonly (readonly T[])[] | undefined {
  if (groupes <= 1) return chiffres.length === 0 ? undefined : [chiffres];
  if (chiffres.length < groupes) return undefined;

  const ordonnes = [...chiffres].sort((a, b) => a.x - b.x);
  const ecarts = ordonnes
    .slice(1)
    .map((chiffre, rang) => ({ rang: rang + 1, largeur: chiffre.x - (ordonnes[rang]!.x + ordonnes[rang]!.l) }));
  if (ecarts.length < groupes - 1) return undefined;

  const parLargeur = [...ecarts].sort((a, b) => b.largeur - a.largeur);
  const coupures = parLargeur.slice(0, groupes - 1);
  const gardes = parLargeur.slice(groupes - 1);

  const plusEtroiteCoupure = Math.min(...coupures.map((ecart) => ecart.largeur));
  const plusLargeGardee = gardes.length === 0 ? 0 : Math.max(...gardes.map((ecart) => ecart.largeur));
  // Une coupure franche, ou rien : on ne devine pas où un numéro se sépare.
  if (plusEtroiteCoupure <= 0) return undefined;
  if (gardes.length > 0 && plusEtroiteCoupure < Math.max(plusLargeGardee * ECART_FRANC, 1)) return undefined;

  const rangs = new Set(coupures.map((ecart) => ecart.rang));
  const paquets: T[][] = [[]];
  for (const [rang, chiffre] of ordonnes.entries()) {
    if (rangs.has(rang)) paquets.push([]);
    paquets[paquets.length - 1]!.push(chiffre);
  }
  return paquets.length === groupes ? paquets : undefined;
}

/** Recompose le texte d'un numéro à partir de ses groupes lus et des séparateurs de l'exemple. */
export function recomposer(groupes: readonly string[], forme: FormeDeNumero): string | undefined {
  if (groupes.length === 0 || groupes.some((groupe) => !/^\d+$/.test(groupe))) return undefined;
  const separateurs = [...forme.separateurs];
  if (separateurs.length !== groupes.length - 1) return undefined;
  return groupes.reduce((texte, groupe, rang) => (rang === 0 ? groupe : `${texte}${separateurs[rang - 1]}${groupe}`), "");
}
