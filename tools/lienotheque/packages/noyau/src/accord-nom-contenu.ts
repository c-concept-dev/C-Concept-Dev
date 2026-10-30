import { corpsDuNom } from "./detecteurs-de-noms.js";

/** Le second signal : ce que le nom d'un enregistrement a de distinctif, retrouvé imprimé sur une
 *  page (REC-02, OUT-10, CDC §0 bis).
 *
 *  ## Pourquoi ce signal est indépendant du premier
 *
 *  La marque imprimée désigne un enregistrement **par son rang**, et elle le fait depuis des
 *  pixels passés à la reconnaissance. Le nom le désigne **par son nom**, et il le fait depuis la
 *  couche texte du document. Autres pixels, autre méthode, autre façon de nommer la même chose :
 *  quand les deux tombent sur le même enregistrement, deux lectures indépendantes s'accordent, et
 *  quand elles tombent sur deux enregistrements différents, elles se contredisent — ce qui vaut
 *  autant, car une contradiction doit faire reculer.
 *
 *  ## Ce qui n'est pas un signal
 *
 *  Le **rang** écrit dans le nom n'en est pas un. Un nom qui commence par « 07 » ne confirme rien
 *  d'une marque lue « 7 » : dans un vivier de N enregistrements, tout nombre de 1 à N trouve un
 *  fichier, et l'accord est alors une tautologie, pas une preuve. Les suites de chiffres seules
 *  sont donc écartées.
 *
 *  **Un nombre composé n'y échappe pas davantage, et c'était l'erreur.** « Deux groupes séparés
 *  par un point ou un tiret ne se confondent pas avec un rang » : relevé le 30 octobre 2026, deux
 *  lots de 92 et 73 enregistrements nomment chacun des leurs « 1-01 », « 1-02 », « 2-01 » — un
 *  support et une place, c'est-à-dire un rang écrit en deux groupes. Cent soixante-cinq noms
 *  passaient ainsi pour distinctifs alors qu'ils ne portaient que leur propre position, et il
 *  suffisait qu'une page imprime « 1.01 » quelque part pour fabriquer une confirmation.
 *
 *  Ce qui les sépare n'est pas leur forme mais **leur place dans le nom** : une numérotation est
 *  en tête, et le contenu suit. On ne lit donc un nom qu'à partir de sa première lettre. Sur les
 *  mêmes lots, « 1-01 12_8 … Pg.67 » n'a plus aucun jeton — c'est la bonne réponse, son signal
 *  est ailleurs — tandis que « 02-… #5.1 » garde « 5.1 », qui est bien ce que ce nom désigne.
 *
 *  ## Ce qui rend un jeton recevable
 *
 *  Seul ce qui n'appartient qu'à **un** enregistrement du vivier. Un mot qui revient dans
 *  plusieurs noms ne les distingue pas, et une page où plusieurs noms se retrouvent ne désigne
 *  aucun d'eux — c'est le cas d'une page de sommaire, qui les porte tous. */

/** Au moins autant de caractères, sinon un mot trop court tombe par hasard. */
export const CARACTERES_DU_JETON = 4;

/** Ce qu'un nom a de distinctif dans son vivier. */
export type MarqueDeNom = {
  /** La place du média dans le vivier présenté, à partir de zéro. */
  readonly rang: number;
  readonly jetons: readonly string[];
};

/** Un accord entre un nom et le contenu d'une page : le nom d'un seul média s'y retrouve. */
export type AccordNomContenu = {
  readonly page: number;
  readonly rang: number;
  /** Ce qui a été retrouvé, pour pouvoir le revérifier à l'œil. */
  readonly jetons: readonly string[];
};

/** Tout ce qui n'est ni lettre ni chiffre devient une coupure : « Le Freak - Play-Along » donne
 *  les mêmes jetons que « le freak, play along » imprimé sur la page. */
const normaliser = (texte: string): string =>
  texte
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, " ")
    .trim();

const NOMBRE_COMPOSE = /\b\d{1,3}[.-]\d{1,3}\b/gu;

/** Ce qu'un nom dit de son contenu : ce qui suit sa première lettre.
 *
 *  Tout ce qui précède est une adresse — un rang, un support, les deux. Un nom sans aucune lettre
 *  n'est qu'une adresse, et ne rend donc rien. */
export const apresLAdresse = (corps: string): string => {
  const lettre = corps.search(/\p{L}/u);
  return lettre === -1 ? "" : corps.slice(lettre);
};

/** Les jetons d'un nom, avant qu'on éprouve s'ils n'appartiennent qu'à lui. */
function jetonsDuNom(nom: string): readonly string[] {
  const corps = apresLAdresse(corpsDuNom(nom));
  const composes = (corps.match(NOMBRE_COMPOSE) ?? []).map((brut) => brut.replace("-", "."));
  const mots = normaliser(corps)
    .split(" ")
    .filter((mot) => mot.length >= CARACTERES_DU_JETON && /[a-z]/u.test(mot));
  return [...new Set([...composes, ...mots])];
}

/** Ce que chaque nom du vivier a de distinctif : ses jetons que nul autre nom ne porte. */
export function marquesDesNoms(noms: readonly string[]): readonly MarqueDeNom[] {
  const tous = noms.map((nom) => jetonsDuNom(nom));
  const combien = new Map<string, number>();
  for (const jetons of tous) for (const jeton of jetons) combien.set(jeton, (combien.get(jeton) ?? 0) + 1);
  return tous.map((jetons, rang) => ({ rang, jetons: jetons.filter((jeton) => combien.get(jeton) === 1) }));
}

/** Le texte d'une page, tel que le document le porte. */
export type ContenuDePage = { readonly page: number; readonly texte: string };

/** Les accords entre les noms du vivier et le contenu des pages.
 *
 *  Une page ne rend un accord que si **un seul** nom s'y retrouve. Plusieurs noms sur une même
 *  page — un sommaire — ne désignent aucun enregistrement pour cette page, et rendre le plus
 *  fourni des deux serait une devinette. */
export function accordsNomContenu(
  marques: readonly MarqueDeNom[],
  contenus: readonly ContenuDePage[],
): readonly AccordNomContenu[] {
  const accords: AccordNomContenu[] = [];
  for (const { page, texte } of contenus) {
    const normalise = ` ${normaliser(texte)} `;
    const composes = new Set((texte.match(NOMBRE_COMPOSE) ?? []).map((brut) => brut.replace("-", ".")));
    const trouves = marques
      .map(({ rang, jetons }) => ({
        rang,
        jetons: jetons.filter((jeton) => (composes.has(jeton) ? true : normalise.includes(` ${jeton} `))),
      }))
      .filter(({ jetons }) => jetons.length > 0);
    if (trouves.length !== 1) continue;
    const seul = trouves[0]!;
    accords.push({ page, rang: seul.rang, jetons: seul.jetons });
  }
  return accords;
}
