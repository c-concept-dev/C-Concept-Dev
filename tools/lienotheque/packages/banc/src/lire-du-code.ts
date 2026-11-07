/** Lire du code sans lire ce qu'il cite.
 *
 *  ## Le défaut que ce module existe pour empêcher, DEUX FOIS
 *
 *  Un garde-fou qui parcourt le dépôt finit par se lire lui-même : son fichier de contrôle porte
 *  des exemples de code, écrits entre guillemets, et il les prend pour du vrai code.
 *
 *  C'est arrivé le 6 novembre au garde-fou des promesses — il accusait ses propres fixtures — puis
 *  **le 7 novembre au garde-fou des fichiers non suivis**, un lot plus tard, alors que la leçon
 *  était écrite au registre. Six fantômes annoncés, tous des chaînes de son propre contrôle.
 *
 *  Les deux fois, le piège s'est refermé à retardement : le garde-fou était **vert tant que son
 *  fichier de contrôle n'était pas suivi par Git**, et rouge à la course suivante. Un contrôle
 *  local lancé avant le commit ne peut pas le voir ; seule la CI, qui part d'un clone, le voit.
 *
 *  ## La règle qui en découle
 *
 *  **Tout garde-fou qui parcourt les sources du dépôt blanchit les chaînes avant de lire.** Ce
 *  n'est pas une précaution contre un cas tordu : tout fichier qui cite du code — un contrôle, une
 *  documentation, un message d'erreur — a cette forme. */

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

/** Les chaînes ET les commentaires blanchis : un `// if (f())` n'est pas plus du code qu'un
 *  `"if (f())"`. Les sauts de ligne survivent, pour que les numéros de ligne restent justes. */
export function sansCommentaires(contenu: string): string {
  const sortie: string[] = [];
  let place = 0;
  while (place < contenu.length) {
    const deux = contenu.slice(place, place + 2);
    if (deux === "//") {
      while (place < contenu.length && contenu[place] !== "\n") {
        sortie.push(" ");
        place += 1;
      }
      continue;
    }
    if (deux === "/*") {
      const fin = contenu.indexOf("*/", place + 2);
      const borne = fin === -1 ? contenu.length : fin + 2;
      for (let p = place; p < borne; p += 1) sortie.push(contenu[p] === "\n" ? "\n" : " ");
      place = borne;
      continue;
    }
    sortie.push(contenu[place]!);
    place += 1;
  }
  return sortie.join("");
}

/** Le masque de code : chaînes et commentaires blanchis, longueurs et lignes préservées.
 *
 *  Il sert à **situer** un motif, pas à le lire. Un chemin d'import EST une chaîne : le blanchir
 *  détruirait ce qu'on cherche. On cherche donc le motif dans le texte brut, et on demande au
 *  masque si son **mot-clé** est du code. C'est l'erreur que ce module a d'abord faite, le
 *  7 novembre 2026 : appliquer aux imports le remède des promesses. */
export const masqueDeCode = (contenu: string): string => sansLitteraux(sansCommentaires(contenu));

/** Vrai si ce qui commence à cette place est du code, et non une citation. */
export function estDuCode(masque: string, place: number, motif: string): boolean {
  return masque.slice(place, place + motif.length) === motif;
}
