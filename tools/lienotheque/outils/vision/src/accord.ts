/** Trancher entre des témoins qui ne disent pas la même chose (OUT-08, ANC-02).
 *
 *  Deux témoins qui se contredisent ne se départagent pas : il faut un troisième. La lecture locale
 *  et une première relecture donnent deux voix ; une seconde relecture, sur une **autre image** de
 *  la même zone, en donne une troisième. Deux voix sur trois l'emportent ; sans majorité, rien
 *  n'est retenu et l'élément part se faire vérifier.
 *
 *  Pourquoi une autre image, et pas la même : redemander la même rendrait la même réponse, ou une
 *  réponse dont rien ne dit qu'elle est plus fondée. Le même pavé rééchantillonné au double change
 *  ce que le modèle voit, et c'est à cette condition que la troisième voix en est une.
 *
 *  Deux nombres dont l'un contient l'autre ne se contredisent pas : « 4 » et « 14 » sont la même
 *  lecture, l'une tronquée. C'est `appui` qui le dit, et c'est pourquoi on ne convoque un troisième
 *  témoin que sur une vraie contradiction. */

/** Les deux nombres se contredisent-ils vraiment ? */
export const seContredisent = (un: number | undefined, autre: number | undefined, contient: (a: number, b: number) => number): boolean =>
  un !== undefined && autre !== undefined && un !== autre && contient(un, autre) === 0 && contient(autre, un) === 0;

export type Verdict = {
  /** La valeur que deux témoins au moins soutiennent. Absente quand aucune majorité ne se dégage. */
  readonly valeur?: number | undefined;
  /** Combien de voix la valeur retenue a reçues, de 0 à 3. */
  readonly voix: number;
  /** Combien de témoins se sont exprimés. */
  readonly temoins: number;
};

/** Ce que trois témoins décident. Une voix absente ne compte pas ; deux voix identiques suffisent.
 *
 *  Déterministe : à égalité — trois voix toutes différentes — rien n'est retenu, et l'on ne se
 *  rabat pas sur « la première » ou « la plus confiante », qui seraient des préférences déguisées
 *  en règles. */
export function troisTemoins(voix: readonly (number | undefined)[]): Verdict {
  const dites = voix.filter((valeur): valeur is number => valeur !== undefined);
  const comptes = new Map<number, number>();
  for (const valeur of dites) comptes.set(valeur, (comptes.get(valeur) ?? 0) + 1);

  const tries = [...comptes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const meilleur = tries[0];
  if (meilleur === undefined || meilleur[1] < 2) return { voix: 0, temoins: dites.length };
  // Deux valeurs à deux voix sont impossibles à trois témoins ; à plus de trois, on s'abstient.
  if (tries.length > 1 && tries[1]![1] === meilleur[1]) return { voix: 0, temoins: dites.length };
  return { valeur: meilleur[0], voix: meilleur[1], temoins: dites.length };
}
