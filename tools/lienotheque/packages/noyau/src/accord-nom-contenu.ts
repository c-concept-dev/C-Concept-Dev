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
 *  ## Ce qu'un jeton désigne, et pourquoi ce n'est pas un seuil
 *
 *  Première version, et sa faute : un jeton n'était reçu que s'il n'appartenait qu'à **un** nom.
 *  La règle avait été écrite contre les pages de sommaire, qui portent tous les noms et n'en
 *  désignent aucun, et elle a raison sur ce point. Mais elle jugeait la distinction au niveau du
 *  **nom**, alors que ce qu'une page désigne n'est pas toujours un enregistrement : un même
 *  morceau peut en avoir deux, une démonstration et un accompagnement, qui portent exactement le
 *  même titre. La règle les éliminait l'un par l'autre, et le titre imprimé en gros sur la page —
 *  la seule chose qui relie ce document à son audio — ne servait à rien.
 *
 *  Ce qui change ici n'est pas un seuil, c'est l'**unité**. Un jeton désigne l'ensemble des noms
 *  qui le portent, et cet ensemble est ce que la page retrouve :
 *
 *  | ensemble désigné | ce qu'on en fait |
 *  |---|---|
 *  | un seul nom | un lien candidat, comme avant |
 *  | quelques noms | autant de candidats, et l'ambiguïté est **dite**, pas cachée |
 *  | tout le vivier | rien : désigner tout, c'est ne désigner personne |
 *
 *  Toutes les garanties de la première version tiennent, par un chemin qui dit pourquoi. Sur
 *  quatre noms dont deux commencent par « Blue », une page qui imprime « Blue Seven » porte trois
 *  jetons : « blue » désigne deux noms, « seven » et « blue seven » n'en désignent qu'un. Les
 *  ensembles sont **emboîtés** — le plus petit est inclus dans tous les autres — et la page
 *  désigne le plus petit. Une page de sommaire, elle, porte des ensembles disjoints : elle ne
 *  désigne rien, exactement comme avant.
 *
 *  ## Les suites de mots
 *
 *  Un nom ne se distingue pas toujours par un mot. « Two-Part Invention 4 » n'a que des mots que
 *  d'autres noms portent aussi, et pourtant la page qui l'imprime ne parle que de lui. Les
 *  **suites** de deux à six mots sont donc des jetons au même titre, reçues telles quelles :
 *  « invention 4 » n'est pas le nombre quatre, c'est le nom de la pièce, et c'est ainsi qu'il est
 *  imprimé. Un mot isolé garde en revanche la règle d'avant — quatre caractères et une lettre —,
 *  puisque seul, il tombe par hasard.
 *
 *  Mesuré le 2 novembre 2026 sur six documents entiers du corpus : **11 enregistrements situés
 *  deviennent 117**, et l'un des six passe de zéro à cinquante-deux sur cinquante-deux, dans
 *  l'ordre exact des pages. */

/** Au moins autant de caractères, sinon un mot trop court tombe par hasard. */
export const CARACTERES_DU_JETON = 4;

/** Au plus combien de mots dans une suite. Assez pour « two part invention 4 », pas assez pour
 *  qu'un nom de quarante mots en engendre mille. */
export const MOTS_DE_LA_SUITE = 6;

/** Ce que chaque jeton désigne : les rangs des noms qui le portent, dans le vivier présenté. */
export type DesignationsDeNoms = ReadonlyMap<string, readonly number[]>;

/** Un accord entre les noms et le contenu d'une page.
 *
 *  `rangs` porte l'ensemble désigné. Un seul rang est le cas ordinaire ; plusieurs disent que la
 *  page ne départage pas ces enregistrements-là, et c'est une information, non un échec. */
export type AccordNomContenu = {
  readonly page: number;
  readonly rangs: readonly number[];
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

/** Les jetons d'un nom : ses mots assez longs, ses suites de mots, ses nombres composés. */
export function jetonsDuNom(nom: string): readonly string[] {
  const corps = apresLAdresse(corpsDuNom(nom));
  const composes = (corps.match(NOMBRE_COMPOSE) ?? []).map((brut) => brut.replace("-", "."));
  const mots = normaliser(corps)
    .split(" ")
    .filter((mot) => mot !== "");
  const jetons = mots.filter((mot) => mot.length >= CARACTERES_DU_JETON && /[a-z]/u.test(mot));
  for (let depart = 0; depart < mots.length; depart += 1)
    for (let combien = 2; combien <= MOTS_DE_LA_SUITE && depart + combien <= mots.length; combien += 1)
      jetons.push(mots.slice(depart, depart + combien).join(" "));
  return [...new Set([...composes, ...jetons])];
}

/** Ce que chaque jeton du vivier désigne.
 *
 *  Un jeton porté par tous les noms ne désigne personne, et il est écarté ici plutôt que page par
 *  page : c'est une propriété du vivier, pas de ce qui est imprimé. */
export function designationsDesNoms(noms: readonly string[]): DesignationsDeNoms {
  const porteurs = new Map<string, number[]>();
  noms.forEach((nom, rang) => {
    for (const jeton of jetonsDuNom(nom)) porteurs.set(jeton, [...(porteurs.get(jeton) ?? []), rang]);
  });
  return new Map([...porteurs].filter(([, ensemble]) => ensemble.length < noms.length));
}

/** Le texte d'une page, tel que le document le porte. */
export type ContenuDePage = { readonly page: number; readonly texte: string };

const clef = (ensemble: readonly number[]): string => [...ensemble].sort((un, autre) => un - autre).join(",");
const inclus = (petit: readonly number[], grand: readonly number[]): boolean => {
  const dedans = new Set(grand);
  return petit.every((rang) => dedans.has(rang));
};

/** Les accords entre les noms du vivier et le contenu des pages.
 *
 *  Une page ne tranche que si les ensembles qu'elle porte sont **emboîtés**. Deux ensembles
 *  disjoints sur une même page, c'est un sommaire : elle désigne alors des choses sans rapport,
 *  donc rien.
 *
 *  Puis, à l'échelle du document, une désignation large qui en contient strictement une autre ne
 *  dit rien de plus qu'elle : elle est **dominée** et sort. Le critère n'est pas un seuil sur la
 *  taille, c'est l'inclusion — rien à régler, c'est le document qui décide. Relevé sur un
 *  recueil où deux fichiers servent chaque morceau : une page portant le mot « play » désignait
 *  les neuf accompagnements à la fois, désignation vraie mais large, et elle pesait autant qu'une
 *  désignation d'un seul fichier. */
export function accordsNomContenu(
  designations: DesignationsDeNoms,
  contenus: readonly ContenuDePage[],
): readonly AccordNomContenu[] {
  const trouves: AccordNomContenu[] = [];
  for (const { page, texte } of contenus) {
    // C'est la **page** qui va chercher dans les désignations, et non l'inverse. Un vivier de
    // deux mille noms engendre des dizaines de milliers de jetons ; les balayer tous contre le
    // texte de chaque page coûterait des millions de parcours de chaîne par document, là où les
    // quelques centaines de suites qu'une page porte se consultent une à une. Les jetons étant
    // des suites de mots entiers, les deux façons retrouvent exactement les mêmes.
    const mots = normaliser(texte)
      .split(" ")
      .filter((mot) => mot !== "");
    const presents = new Set<string>((texte.match(NOMBRE_COMPOSE) ?? []).map((brut) => brut.replace("-", ".")));
    for (let depart = 0; depart < mots.length; depart += 1)
      for (let combien = 1; combien <= MOTS_DE_LA_SUITE && depart + combien <= mots.length; combien += 1)
        presents.add(mots.slice(depart, depart + combien).join(" "));
    const vus = [...presents]
      .map((jeton) => [jeton, designations.get(jeton)] as const)
      .filter((paire): paire is readonly [string, readonly number[]] => paire[1] !== undefined);
    if (vus.length === 0) continue;
    const ensembles = vus.map(([, ensemble]) => ensemble).sort((un, autre) => un.length - autre.length);
    const plusPetit = ensembles[0]!;
    if (!ensembles.every((ensemble) => inclus(plusPetit, ensemble))) continue;
    trouves.push({
      page,
      rangs: [...plusPetit].sort((un, autre) => un - autre),
      jetons: vus.filter(([, ensemble]) => clef(ensemble) === clef(plusPetit)).map(([jeton]) => jeton),
    });
  }

  const tous = [...new Map(trouves.map(({ rangs }) => [clef(rangs), rangs])).values()];
  const domine = (ensemble: readonly number[]): boolean =>
    tous.some((autre) => autre.length < ensemble.length && inclus(autre, ensemble));
  return trouves.filter(({ rangs }) => !domine(rangs));
}
