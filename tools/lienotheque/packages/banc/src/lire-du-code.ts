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
 *  ## Les littéraux d'expression régulière, et la troisième inversion
 *
 *  Ce module disait ne pas les connaître, et avouait le risque : « `/don't/` y ouvre une
 *  apostrophe. Aucun fichier du dépôt n'en porte. » **Le 20 novembre 2026, le dépôt en portait**,
 *  et le suspect annoncé était le bon : `outils/ingestion/mesures/une-page-a-l-envers.ts:39` écrit
 *  `/^[\p{L}'’-]{3,}$/u`. L'apostrophe de la classe ouvrait une chaîne qui ne se refermait jamais,
 *  et **tout le fichier d'après était blanchi** — donc invisible aux garde-fous qui lisent à
 *  travers ce masque. Ce n'est pas une accusation fausse comme les deux premières fois : c'est une
 *  **cécité**, et un garde-fou aveugle ne dit pas « vert », il ne dit rien.
 *
 *  La barre oblique est donc décidée comme un analyseur le fait : **par ce qui précède**. Après une
 *  valeur — un nom, un nombre, `)`, `]` — une barre divise ; partout ailleurs — début de fichier,
 *  après `( , = : [ ! & | ? { } ; + - * % ~ ^ < >` ou un mot-clé qui attend une valeur — elle ouvre
 *  une expression. Dans l'expression, une classe `[…]` protège la barre, et l'échappement emporte
 *  le caractère suivant.
 *
 *  Ce que le masque ne sait toujours pas : `a = b / c / d`, où la décision « après une valeur »
 *  rend la bonne réponse, et `return /re/` contre `return x / y`, où elle rend la bonne aussi — mais
 *  `(x) / y` serait lu comme une expression régulière. Aucun fichier du dépôt n'écrit cela, et le
 *  prix d'une erreur ici est le même qu'avant : du code blanchi, donc un garde-fou qui se taît. Un
 *  filet, pas un mur — et c'est encore écrit pour que la prochaine inversion ait un suspect. */
export interface CommentDeLire {
  /** Blanchir aussi les commentaires `#` jusqu'à la fin de la ligne : Python et les scripts de
   *  coquille.
   *
   *  **Hors de ces langages, ce serait faux** : `#` ouvre un champ privé en JavaScript
   *  (`this.#place`) et une directive en Rust (`#[test]`). Un garde-fou qui blanchirait la fin de
   *  ces lignes deviendrait aveugle au code qui suit, et ce serait l'inversion du 7 novembre à
   *  l'envers — non plus accuser une citation, mais ne plus voir le vrai code. L'appelant dit donc
   *  le langage ; ce module ne le devine pas depuis l'extension, qu'il ne connaît pas. */
  readonly diese?: boolean;

  /** Traiter l'apostrophe comme pouvant ouvrir une **durée de vie** ou une **étiquette** de Rust,
   *  et non seulement un littéral de caractère.
   *
   *  **Hors de Rust, ce serait faux** : en JavaScript et en TypeScript `'abc'` est une chaîne, et
   *  la règle ci-dessous y verrait une durée de vie — le masque cesserait de blanchir les chaînes,
   *  et le garde-fou de CLA-01 accuserait les mots de domaine cités dans un message. L'appelant dit
   *  donc le langage, comme pour `diese`.
   *
   *  **Ce que cela a coûté avant d'être écrit (lot `0z quinquies`, 21 novembre 2026)** : dans
   *  `apps/app/src-tauri/src/roulement.rs`, `fn fmt(&self, f: &mut std::fmt::Formatter<'_>)`
   *  ouvrait un littéral qui ne se refermait qu'à l'apostrophe suivante, blanchissant 21 octets
   *  aux lignes 734 à 738 — dont la déclaration `#[cfg(test)] mod tests {`. Le garde-fou des
   *  effacements n'y jugeait plus rien, et il disait vert. */
  readonly apostropheDeDureeDeVie?: boolean;
}

/** Un littéral de caractère de Rust, tel que le lexique l'écrit : un seul caractère, ou une
 *  séquence d'échappement, puis l'apostrophe fermante. Le préfixe `b` d'un littéral d'octet
 *  précède l'apostrophe, donc `b'a'` tombe ici par sa seconde moitié.
 *
 *  Tout le reste — `'_`, `'a`, `'static`, `'boucle:` — est une durée de vie ou une étiquette. */
const LITTERAL_DE_CARACTERE =
  /^'(?:[^\\']|\\(?:[nrt0\\'"]|x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]{1,6}\}))'/u;

/** Les mots-clés après lesquels une barre oblique ouvre une expression régulière, et ne divise
 *  pas : ils attendent tous une valeur. */
const ATTENDENT_UNE_VALEUR = new Set([
  "return", "typeof", "case", "in", "of", "new", "delete", "void", "instanceof", "do", "else",
  "yield", "await", "throw",
]);

/** Après ce dernier caractère de code, une barre oblique **divise**. Partout ailleurs, elle ouvre
 *  une expression régulière. */
function laBarreDivise(dernier: string, motAvant: string): boolean {
  if (dernier === "") return false;
  if (/[\w$)\]]/u.test(dernier)) return !ATTENDENT_UNE_VALEUR.has(motAvant);
  return false;
}

export function masqueDeCode(contenu: string, comment: CommentDeLire = {}): string {
  const { diese = false, apostropheDeDureeDeVie = false } = comment;
  const sortie: string[] = [];
  let etat: "code" | "chaine" | "ligne" | "bloc" | "expression" = "code";
  let delimiteur = "";
  let place = 0;
  /** Le dernier caractère de code non blanc, et le mot qu'il termine : de quoi décider d'une barre. */
  let dernierCode = "";
  let motAvant = "";
  const blanchir = (caractere: string): string => (caractere === "\n" ? "\n" : " ");
  /** Dans une expression régulière, une classe `[…]` protège la barre oblique. */
  let dansUneClasse = false;

  while (place < contenu.length) {
    const caractere = contenu[place]!;
    const deux = contenu.slice(place, place + 2);

    if (etat === "code") {
      if (diese && caractere === "#") {
        etat = "ligne";
        sortie.push(" ");
        place += 1;
        continue;
      }
      if (deux === "//" || deux === "/*") {
        etat = deux === "//" ? "ligne" : "bloc";
        sortie.push(" ", " ");
        place += 2;
        continue;
      }
      if (caractere === "/" && !laBarreDivise(dernierCode, motAvant)) {
        etat = "expression";
        dansUneClasse = false;
        // La barre ouvrante reste du code : elle borne l'expression, et un relevé qui la perdrait
        // décalerait tout ce qui suit.
        sortie.push(caractere);
        dernierCode = caractere;
        motAvant = "";
        place += 1;
        continue;
      }
      // Une apostrophe de Rust n'ouvre un littéral que si elle se referme juste après un seul
      // caractère ou une séquence d'échappement. Sinon elle nomme une durée de vie ou une
      // étiquette, et c'est du CODE : la prendre pour une chaîne blanchit tout ce qui suit
      // jusqu'à l'apostrophe suivante.
      const ouvreUnLitteral =
        caractere !== "'" ||
        !apostropheDeDureeDeVie ||
        LITTERAL_DE_CARACTERE.test(contenu.slice(place));
      if ((caractere === '"' || caractere === "`" || caractere === "'") && ouvreUnLitteral) {
        etat = "chaine";
        delimiteur = caractere;
      }
      sortie.push(caractere);
      if (!/\s/u.test(caractere)) {
        dernierCode = caractere;
        motAvant = /[\w$]/u.test(caractere) ? motAvant + caractere : "";
      }
      place += 1;
      continue;
    }

    // Dans une expression régulière : la barre ferme, sauf dans une classe `[…]`, et l'échappement
    // emporte le caractère suivant. Son contenu est blanchi comme celui d'une chaîne — c'est de la
    // donnée, et c'est pour cela que ce module existe.
    if (etat === "expression") {
      if (caractere === "\\") {
        sortie.push(" ");
        if (place + 1 < contenu.length) sortie.push(" ");
        place += 2;
        continue;
      }
      if (caractere === "[") dansUneClasse = true;
      else if (caractere === "]") dansUneClasse = false;
      else if (caractere === "/" && !dansUneClasse) {
        etat = "code";
        sortie.push(caractere);
        dernierCode = caractere;
        motAvant = "";
        place += 1;
        continue;
      } else if (caractere === "\n") {
        // Une expression régulière ne franchit pas la ligne : si on y arrive, la barre n'en
        // ouvrait pas une. Revenir au code plutôt que blanchir le reste du fichier — la cécité du
        // 20 novembre est exactement ce qu'il ne faut pas reproduire.
        etat = "code";
        dernierCode = "";
        motAvant = "";
        sortie.push("\n");
        place += 1;
        continue;
      }
      sortie.push(blanchir(caractere));
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
