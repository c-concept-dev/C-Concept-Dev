/** Une table décrite par son nom et sa définition, telle que `sqlite_master` la rend. */
export type TableDecrite = { readonly nom: string; readonly sql: string };

/** L'ordre dans lequel on peut retirer des tables sans qu'une cascade cherche ce qui n'est plus
 *  là : **les filles avant leurs parents**.
 *
 *  Retirer une table parente déclenche sa suppression implicite, donc ses cascades, qui vont
 *  chercher les tables qui la référencent. Si l'une d'elles est déjà partie, SQLite répond
 *  « no such table » — et l'ordre alphabétique place justement `document` avant `version`, qui
 *  cascade vers `ancre`, retiré en premier. Les contraintes différées n'y changent rien : le
 *  problème n'est pas le moment de la vérification, c'est la table absente. */
export function ordreDeRetrait(tables: readonly TableDecrite[]): readonly string[] {
  const noms = new Set(tables.map((table) => table.nom));
  const reference = new Map(
    tables.map((table) => [
      table.nom,
      new Set(
        [...table.sql.matchAll(/REFERENCES\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi)]
          .map((trouve) => trouve[1]!)
          .filter((cible) => cible !== table.nom && noms.has(cible)),
      ),
    ]),
  );

  const ordre: string[] = [];
  const place = new Set<string>();
  // On pose d'abord celles qui référencent, et seulement ensuite celles qu'elles référencent.
  const poser = (nom: string, enCours: Set<string>): void => {
    if (place.has(nom) || enCours.has(nom)) return;
    enCours.add(nom);
    for (const autre of tables)
      if (autre.nom !== nom && reference.get(autre.nom)?.has(nom) === true) poser(autre.nom, enCours);
    enCours.delete(nom);
    if (!place.has(nom)) {
      place.add(nom);
      ordre.push(nom);
    }
  };
  for (const table of tables) poser(table.nom, new Set());
  return ordre;
}
