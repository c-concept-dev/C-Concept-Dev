import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** La file des lots est **lue rendue**, et une rangée mal découpée y perd du texte **en silence**.
 *
 *  ## Ce que la mesure a trouvé, le 20 novembre 2026
 *
 *  L'entête du tableau de `docs/file-des-lots.md` porte cinq colonnes, soit **six** barres
 *  verticales non échappées par rangée. **Neuf** rangées ne portaient pas ce compte :
 *
 *  | lot | barres | ce qui manquait ou dépassait |
 *  |---|---|---|
 *  | `14bis` | 4 | la cellule « État », perdue en écrivant la mesure du 11 novembre |
 *  | `0w` | 5 | la barre de fin de rangée |
 *  | `14quater` | 5 | la barre de fin de rangée |
 *  | `1` | 7 | deux états séparés par une barre nue dans la même cellule |
 *  | `3a` | 7 | `source: "couche_texte" \| "ocr"`, une union citée dans du code |
 *  | `Ci3` | 7 | une barre de fin écrite deux fois |
 *  | `0c ter` | 7 | une barre de fin écrite deux fois |
 *  | `0t bis` | 8 | `&mut \|_\| {}`, une fermeture Rust citée dans du code |
 *  | `18` | 8 | `\| 37 \|`, une rangée de journal citée dans du code |
 *
 *  Les neuf étaient **antérieures au lot Ci2 bis** — vérifié contre `64bc0e4b`, qui porte les
 *  mêmes neuf rangées et les mêmes neuf comptes.
 *
 *  ## Pourquoi c'est grave, et pourquoi rien ne le disait
 *
 *  En Markdown GFM, une rangée qui porte **plus** de cellules que l'entête voit les cellules en
 *  trop **jetées sans avertissement** ; une rangée qui en porte **moins** voit ses colonnes
 *  complétées par du vide, et décalées si le manque est au milieu. Christophe lit ce fichier
 *  rendu : du contenu écrit, commité et relu ne lui **parvenait pas**. Rien ne pouvait le dire —
 *  le fichier est bien formé, le texte est là dans les octets, et seul le rendu le perd.
 *
 *  La cause ordinaire est une barre verticale dans du code en espacement fixe. Dans GFM, un `|`
 *  à l'intérieur d'un `` `code span` `` coupe **quand même** la cellule : il faut l'écrire `\|`,
 *  et l'échappement disparaît au rendu, y compris dans le code.
 *
 *  ## Pourquoi ce contrôle ne compte **pas** les barres échappées, et le registre si
 *
 *  Le garde-fou du registre des poussées (`journal-en-ajout-seul.ts`) compte **toutes** les
 *  barres, échappées comprises, et la note d'écriture du 17 novembre 2026 interdit même d'en
 *  écrire une dans une cellule du registre. Les deux règles ne se contredisent pas, parce que les
 *  lecteurs ne sont pas les mêmes : là-bas, c'est **le garde-fou lui-même** qui découpe les
 *  rangées, et il n'interprète pas le markdown — une barre échappée lui compte une colonne de
 *  plus. Ici, le seul lecteur est **le moteur de rendu**, qui, lui, comprend l'échappement. La
 *  file se corrige donc en échappant, et le registre en écrivant la barre en mots. */

/** `tools/lienotheque/` : trois niveaux au-dessus de `test/`, comme les autres contrôles du banc. */
const PROJET = new URL("../../../", import.meta.url);
const FILE = new URL("docs/file-des-lots.md", PROJET);

/** L'entête qui ouvre le tableau de la file. Le compte de colonnes attendu se lit **en elle**, et
 *  n'est écrit nulle part ici : le jour où la file prendra une sixième colonne, les rangées seront
 *  jugées contre la nouvelle, sans qu'on ait à y penser. */
const ENTETE_DE_LA_FILE = "| # | Étape | Lot | Nature | État |";

/** Une barre qui découpe vraiment une cellule : toute barre verticale **non** précédée d'une
 *  contre-oblique. C'est le découpage que GFM applique, et c'est le seul qui compte ici. */
const BARRE_NUE = /(?<!\\)\|/gu;

/** La ligne de séparation d'une table markdown, qui n'est pas une rangée de contenu. */
const SEPARATION = /^\|[-| :]+\|$/u;

/** Un plancher de rangées, pour qu'un lecteur devenu aveugle rougisse au lieu de se taire. Mesuré
 *  le 20 novembre 2026 : la file porte **75** rangées. Le plancher est posé bien plus bas, parce
 *  qu'il garde contre un lecteur cassé, non contre une file qui raccourcit. */
const RANGEES_AU_MOINS = 60;

interface Rangee {
  /** Le rang de la rangée dans le fichier, en partant de 1 : c'est ce qu'on va ouvrir. */
  readonly ligne: number;
  /** Le nom du lot, première cellule de la rangée — ce par quoi Christophe la désigne. */
  readonly lot: string;
  /** Le compte de barres non échappées de la rangée. */
  readonly barres: number;
}

const barresNues = (ligne: string): number => [...ligne.matchAll(BARRE_NUE)].length;

/** Les rangées du tableau de la file, de l'entête au titre suivant.
 *
 *  Les lignes vides **n'arrêtent pas** la lecture, et c'est voulu : la file en porte deux volées
 *  — des paragraphes de mesure posés entre des rangées —, et les rangées qui les suivent sont
 *  précisément parmi les neuf fautives. Les arrêter au premier blanc aurait laissé `Ci3`,
 *  `0c ter` et `18` hors de portée de ce contrôle. */
function rangeesDeLaFile(texte: string): readonly Rangee[] {
  const lignes = texte.split("\n");
  const entete = lignes.indexOf(ENTETE_DE_LA_FILE);
  if (entete === -1) return [];
  const rangees: Rangee[] = [];
  for (const [rang, ligne] of lignes.slice(entete + 1).entries()) {
    if (/^## /u.test(ligne)) break;
    if (!ligne.startsWith("|") || SEPARATION.test(ligne)) continue;
    rangees.push({
      ligne: entete + rang + 2,
      lot: ligne.split("|")[1]?.trim() ?? "",
      barres: barresNues(ligne),
    });
  }
  return rangees;
}

const siLaFileEstLa = existsSync(FILE) ? it : it.skip;
const lireLaFile = (): string => readFileSync(FILE, "utf8");

describe("une rangée de la file des lots ne perd aucune cellule au rendu", () => {
  /** Ce contrôle-ci ne se saute **jamais**. Il garde les autres de la faute du lot 0u : un `../`
   *  de moins dans le chemin, et tous se sautaient en silence. Un garde-fou qui ne tourne jamais
   *  ne dit pas « vert » — il ne dit rien, ce qui est plus dangereux. Le saut doit venir d'un fait
   *  (la file absente du lot récupéré), jamais d'un chemin qui ne désigne rien. */
  it("désigne vraiment le projet, pour qu'un saut ne puisse pas venir d'un chemin faux", () => {
    const manifeste = new URL("package.json", PROJET);
    expect(
      existsSync(manifeste),
      `${PROJET.pathname} n'est pas la racine du projet : les contrôles ci-dessous se sauteraient sans rien dire`,
    ).toBe(true);
    expect(
      (JSON.parse(readFileSync(manifeste, "utf8")) as { readonly name?: string }).name,
      "le chemin désigne un autre paquet que le projet",
    ).toBe("lienotheque");
  });

  /** L'anti-aveuglement, et il vient d'une faute connue de ce dépôt : un contrôle qui ne reconnaît
   *  rien ne juge rien et passe en vert. Si l'entête changeait d'un espace, `rangeesDeLaFile`
   *  rendrait la liste vide et le contrôle suivant serait vert sur zéro rangée. */
  siLaFileEstLa("lit vraiment le tableau : son entête, sa séparation et ses rangées (sauté si la file est absente)", () => {
    const texte = lireLaFile();
    const lignes = texte.split("\n");
    const entete = lignes.indexOf(ENTETE_DE_LA_FILE);
    expect(entete, `l'entête « ${ENTETE_DE_LA_FILE} » manque : plus rien ne serait jugé`).toBeGreaterThan(-1);

    const separation = lignes[entete + 1] ?? "";
    expect(SEPARATION.test(separation), `la ligne sous l'entête n'est pas une séparation de table : « ${separation} »`).toBe(true);
    expect(
      barresNues(separation),
      "la séparation ne porte pas le compte de colonnes de l'entête : le tableau ne se rendrait pas en tableau",
    ).toBe(barresNues(ENTETE_DE_LA_FILE));

    expect(
      rangeesDeLaFile(texte).length,
      "moins de rangées lues que la file n'en porte : le lecteur est cassé, et un contrôle qui ne lit rien ne garde rien",
    ).toBeGreaterThanOrEqual(RANGEES_AU_MOINS);
  });

  /** Le contrôle du lot. Il nomme **toutes** les rangées fautives d'un coup, avec leur ligne et
   *  leur compte : un rouge qui dit « `14bis` ligne 96 : 4 barres pour 6 » se répare en une
   *  minute, là où « le tableau est mal formé » se cherche. */
  siLaFileEstLa("chaque rangée porte le compte de barres non échappées de son entête (sauté si la file est absente)", () => {
    const attendu = barresNues(ENTETE_DE_LA_FILE);
    const fautives = rangeesDeLaFile(lireLaFile())
      .filter((une) => une.barres !== attendu)
      .map(
        (une) =>
          `ligne ${une.ligne}, lot « ${une.lot} » : ${une.barres} barre(s) pour ${attendu}` +
          (une.barres > attendu
            ? " — une cellule en trop est JETÉE au rendu ; échapper la barre de contenu en « \\| »"
            : " — une colonne manquante décale les suivantes ; ajouter la cellule, ou la barre de fin de rangée"),
      );
    expect(fautives, "des rangées de la file perdent du texte au rendu, et rien ne le dit à la lecture").toEqual([]);
  });
});
