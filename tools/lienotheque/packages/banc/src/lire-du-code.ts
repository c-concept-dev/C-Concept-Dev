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

/** Le masque : commentaires et contenus de littéraux remplacés par des blancs, en UNE passe.
 *
 *  **Celui des deux qui commence gagne.** Un `//` dans une chaîne n'ouvre pas un commentaire, une
 *  apostrophe dans un commentaire n'ouvre pas une chaîne. C'est tout ce que ce module a à savoir,
 *  et deux passes ne pouvaient pas le savoir : la première ignorait les chaînes.
 *
 *  Le défaut, trouvé le 7 novembre 2026 : un contrôle suivi portait `"// une approche…"`. La passe
 *  des commentaires blanchissait jusqu'au bout de la ligne, **guillemet fermant compris**, et la
 *  passe des littéraux voyait ensuite une chaîne ouverte qui ne se refermait jamais. À partir de
 *  là tout s'inversait : le code masqué, les chaînes lues comme du code — et un fantôme accusé qui
 *  n'était qu'une faute factice de fixture.
 *
 *  Les blancs remplacent **caractère par caractère** et les sauts de ligne survivent : les numéros
 *  de ligne et les décalages restent ceux du fichier réel. Un relevé juste qui désigne la mauvaise
 *  ligne ne vaut pas beaucoup mieux qu'un relevé faux — et ici le décalage est ce qui dit si un
 *  motif est du code.
 *
 *  Ce que le masque ne sait pas : les littéraux d'expression régulière. `/don't/` y ouvre une
 *  apostrophe. Aucun fichier du dépôt n'en porte, et deviner une barre oblique sans analyser
 *  l'expression entière demanderait de savoir si l'on attend une valeur ou un opérateur. Un filet,
 *  pas un mur — et c'est écrit pour que la prochaine inversion ait un suspect. */
export function masqueDeCode(contenu: string): string {
  const sortie: string[] = [];
  let etat: "code" | "chaine" | "ligne" | "bloc" = "code";
  let delimiteur = "";
  let place = 0;
  const blanchir = (caractere: string): string => (caractere === "\n" ? "\n" : " ");

  while (place < contenu.length) {
    const caractere = contenu[place]!;
    const deux = contenu.slice(place, place + 2);

    if (etat === "code") {
      if (deux === "//" || deux === "/*") {
        etat = deux === "//" ? "ligne" : "bloc";
        sortie.push(" ", " ");
        place += 2;
        continue;
      }
      if (caractere === '"' || caractere === "'" || caractere === "`") {
        etat = "chaine";
        delimiteur = caractere;
      }
      sortie.push(caractere);
      place += 1;
      continue;
    }

    if (etat === "ligne") {
      if (caractere === "\n") etat = "code";
      sortie.push(blanchir(caractere));
      place += 1;
      continue;
    }

    if (etat === "bloc") {
      if (deux === "*/") {
        etat = "code";
        sortie.push(" ", " ");
        place += 2;
        continue;
      }
      sortie.push(blanchir(caractere));
      place += 1;
      continue;
    }

    // Dans un littéral : l'échappement emporte le caractère suivant, sinon le délimiteur ferme.
    if (caractere === "\\") {
      // Un échappement en dernier caractère n'emporte rien : pousser deux blancs allongerait le
      // masque, et tous les décalages d'après seraient faux.
      sortie.push(" ");
      if (place + 1 < contenu.length) sortie.push(" ");
      place += 2;
      continue;
    }
    if (caractere === delimiteur) {
      etat = "code";
      sortie.push(caractere);
      place += 1;
      continue;
    }
    sortie.push(blanchir(caractere));
    place += 1;
  }

  return sortie.join("");
}

/** Le motif trouvé à cette place est-il du code, et non une citation ? */
export function estDuCode(masque: string, place: number, motif: string): boolean {
  return masque.slice(place, place + motif.length) === motif;
}
