/** Pourquoi une vue n'a pas pu être lue, dit à qui regarde l'écran (lot 0x, § 3.5).
 *
 *  Ce qui l'a rendu nécessaire, mesuré le 14 novembre 2026. Une version écrite le 12 par la
 *  chaîne portait un état ajouté au contrat le 12 ; l'application installée datait du 10. Son
 *  contrat a refusé la vue entière, l'écran est retombé sur une vue vide, et il n'a **rien dit** :
 *  116 pages absentes sous un en-tête annonçant « 51 liens ».
 *
 *  Le § 3.5 du cahier interdit exactement cela — « l'abstention dit toujours sa vraie cause » —
 *  mais il le disait pour la lecture des pages. Le même silence s'était installé un étage plus
 *  haut, entre la bibliothèque et l'écran, là où personne ne l'avait cherché.
 *
 *  Ce module ne répare rien : il **nomme**. La réparation d'un écart de version est une
 *  réinstallation, et c'est à l'utilisateur de la faire — donc il faut qu'il sache quoi faire.
 */

/** Une panne de validation porte une liste de reproches. C'est à cela qu'on la reconnaît, sans
 *  dépendre du nom ni de la version de la bibliothèque qui l'a levée : un contrat refuse en
 *  disant *où*, une panne d'entrée-sortie refuse en disant *quoi*. */
const reproches = (erreur: unknown): readonly { readonly path?: readonly unknown[] }[] | undefined => {
  if (typeof erreur !== "object" || erreur === null) return undefined;
  const liste = (erreur as { issues?: unknown }).issues;
  return Array.isArray(liste) && liste.length > 0 ? (liste as readonly { readonly path?: readonly unknown[] }[]) : undefined;
};

/** Les endroits refusés, en clair, sans les index : « douteux.etat » plutôt que « douteux.1.etat ».
 *  Deux cas douteux illisibles pour la même raison donnent un seul endroit, pas deux. */
const endroits = (liste: readonly { readonly path?: readonly unknown[] }[]): readonly string[] => [
  ...new Set(
    liste.map((un) =>
      (un.path ?? [])
        .filter((pas) => typeof pas === "string")
        .join("."),
    ),
  ),
].filter((un) => un.length > 0);

/** La phrase montrée à l'écran. Jamais vide, jamais une pile d'appels, jamais un nom de code. */
export function causeDeLEchec(erreur: unknown): string {
  const liste = reproches(erreur);
  if (liste === undefined)
    return (
      "Ce document n'a pas pu être lu, et la cause n'est pas connue de cette application. " +
      "Rouvrez la bibliothèque ; si cela se reproduit, le journal de l'application porte le détail."
    );

  const ou = endroits(liste);
  const precision = ou.length === 0 ? "" : ` (${ou.join(", ")})`;
  return (
    "Cette version a été écrite par un code plus récent que cette application : elle contient " +
    `quelque chose que celle-ci ne sait pas lire${precision}. ` +
    "Réinstallez l'application pour la voir ; ses pages et ses liens ne sont pas perdus."
  );
}
