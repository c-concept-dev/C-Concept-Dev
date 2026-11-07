/** Une promesse est toujours vraie : elle n'a rien à faire dans une condition.
 *
 *  `if (faireQuelqueChose())` sur une fonction asynchrone **passe toujours**, quelle que soit la
 *  valeur rendue, et le compilateur ne le dit pas : tout objet est vrai, donc `Promise<boolean>`
 *  est accepté là où un `boolean` est attendu. La branche semble gardée ; elle ne l'est pas.
 *
 *  Ce dépôt n'a aucun outil de vérification. Ce garde-fou en tient la part qui compte, dans
 *  l'idiome des autres : une fonction pure, sa mesure, et **la liste des fonctions asynchrones
 *  lue dans le code** plutôt qu'écrite ici — une liste écrite à la main vieillirait en silence.
 *
 *  ## Ce qu'il ne prétend pas faire
 *
 *  Il ne remplace pas une analyse de types. Il ne voit ni les promesses rangées dans une
 *  variable puis mal employées plus loin, ni les méthodes d'objets. Il tient **une** forme, celle
 *  qui ment sans bruit : un appel asynchrone directement dans une condition. Mieux vaut un
 *  garde-fou étroit qui ne se trompe pas qu'un large qu'on désarme. */

export type Source = { readonly chemin: string; readonly contenu: string };
export type PromesseMalPlacee = { readonly chemin: string; readonly ligne: number; readonly nom: string };

/** Les fonctions et ports asynchrones **déclarés dans le code donné**.
 *
 *  Trois formes : la fonction asynchrone nommée, la constante qui porte une flèche asynchrone, et
 *  le champ de type `(…) => Promise<…>` — un port. Le port compte autant que la fonction : c'est
 *  précisément ce qu'on branche, et donc ce qu'on risque d'appeler sans attendre. */
export function fonctionsAsynchrones(sources: readonly Source[]): ReadonlySet<string> {
  const noms = new Set<string>();
  for (const source of sources) {
    for (const trouve of source.contenu.matchAll(/async function (\w+)/gu)) noms.add(trouve[1]!);
    for (const trouve of source.contenu.matchAll(/(?:const|let)\s+(\w+)\s*[:=][^=\n]*async\s*\(/gu))
      noms.add(trouve[1]!);
    for (const trouve of source.contenu.matchAll(/^\s*(?:readonly\s+)?(\w+)\??:\s*\([^)]*\)\s*=>\s*Promise</gmu))
      noms.add(trouve[1]!);
  }
  return noms;
}

/** Le contenu des chaînes, remplacé par des blancs — les sauts de ligne gardés.
 *
 *  **Un garde-fou qui lit du code ne doit pas lire les chaînes comme du code.** Trouvé par ce
 *  garde-fou sur lui-même, une fois son propre contrôle suivi par Git : les fixtures y portent
 *  `if (…)` dans des littéraux, et il les accusait. Ce n'est pas un cas tordu — tout fichier qui
 *  cite du code, contrôle, documentation ou message d'erreur, a la même forme. L'exempter aurait
 *  désarmé le garde-fou là où il devait apprendre à lire.
 *
 *  Les blancs remplacent caractère par caractère, et les sauts de ligne survivent : les numéros de
 *  ligne restent ceux du fichier réel. Un relevé juste qui désigne la mauvaise ligne ne vaut pas
 *  beaucoup mieux qu'un relevé faux. */
export function sansLitteraux(contenu: string): string {
  const sortie: string[] = [];
  let delimiteur: string | undefined;
  let place = 0;
  while (place < contenu.length) {
    const caractere = contenu[place]!;
    if (delimiteur === undefined) {
      if (caractere === '"' || caractere === "'" || caractere === "`") {
        delimiteur = caractere;
        sortie.push(caractere);
      } else sortie.push(caractere);
      place += 1;
      continue;
    }
    // Dans une chaîne : l'échappement emporte le caractère suivant, sinon le délimiteur ferme.
    if (caractere === "\\") {
      sortie.push(" ", " ");
      place += 2;
      continue;
    }
    if (caractere === delimiteur) {
      delimiteur = undefined;
      sortie.push(caractere);
      place += 1;
      continue;
    }
    sortie.push(caractere === "\n" ? "\n" : " ");
    place += 1;
  }
  return sortie.join("");
}

/** La condition d'un `if` ou d'un `while`, parenthèse par parenthèse.
 *
 *  Compter les parenthèses au lieu de s'arrêter à la première fermante : une condition porte des
 *  appels, donc des parenthèses imbriquées, et une condition s'écrit souvent sur plusieurs lignes.
 *  Un relevé qui s'arrêterait à la première fermante manquerait exactement les conditions longues,
 *  celles où une promesse passe le plus facilement inaperçue. */
function conditions(contenu: string): readonly { readonly texte: string; readonly debutDuTexte: number }[] {
  const trouvees: { texte: string; debutDuTexte: number }[] = [];
  for (const ouverture of contenu.matchAll(/\b(?:if|while)\s*\(/gu)) {
    // Le décalage porté est celui du TEXTE de la condition, pas celui du mot-clé : `while (` est
    // plus long que `if (`, et recalculer la longueur de l'en-tête à l'arrivée donnait une ligne
    // fausse d'une unité. Mesuré par son contrôle.
    const debutDuTexte = ouverture.index + ouverture[0].length;
    let profondeur = 1;
    let place = debutDuTexte;
    while (place < contenu.length && profondeur > 0) {
      if (contenu[place] === "(") profondeur += 1;
      else if (contenu[place] === ")") profondeur -= 1;
      place += 1;
    }
    trouvees.push({ texte: contenu.slice(debutDuTexte, place - 1), debutDuTexte });
  }
  return trouvees;
}

export function promessesDansUneCondition(sources: readonly Source[]): readonly PromesseMalPlacee[] {
  const asynchrones = fonctionsAsynchrones(sources);
  const mal: PromesseMalPlacee[] = [];
  for (const source of sources) {
    const code = sansLitteraux(source.contenu);
    for (const condition of conditions(code)) {
      for (const nom of asynchrones) {
        // `(?<!await )` : l'appel attendu est correct. `(?<![.\w])` : une méthode de même nom
        // appartient à un objet, et ce garde-fou ne sait rien de son type — il se taira plutôt
        // que d'accuser.
        const appel = new RegExp(`(?<!await )(?<![.\\w])\\b${nom}\\s*\\(`, "u");
        const trouve = appel.exec(condition.texte);
        if (trouve === null) continue;
        const avant = code.slice(0, condition.debutDuTexte + trouve.index);
        mal.push({ chemin: source.chemin, ligne: avant.split("\n").length, nom });
      }
    }
  }
  return mal;
}
