import { type PageLue, type Passage, type SourceLecture, texteDePage } from "@lienotheque/contrats";

/** Du texte lu aux passages cherchables (RCH-07, RCH-09, ANC-01).
 *
 *  La chaîne d'ancres repérait des numéros d'éléments à un endroit fixe de la page et les
 *  appariait à des pistes ; elle ne produisait aucun texte. Rien ne pouvait donc être cherché
 *  par thème, par idée ni par phrase exacte, et la table `passage` bâtie pour cela n'avait aucun
 *  écrivain possible. Ce module est ce qui l'écrit.
 */

/** Le texte d'une page, avec sa provenance et son numéro imprimé quand il est connu.
 *
 *  Une étape intermédiaire assumée : elle sépare « d'où vient ce texte » — la couche, ou l'OCR —
 *  de « comment on le découpe », qui ne doit pas avoir à le savoir. */
export type PageDeTexte = {
  /** Rang de la page dans le document, tel que la lecture le porte. */
  readonly index: number;
  readonly texte: string;
  readonly source: SourceLecture;
  readonly pageImprimee?: number | undefined;
  readonly confiance?: number | undefined;
};

/** Part de la hauteur, en haut et en bas, où un numéro de page peut se trouver.
 *
 *  Une part, et non un nombre de points : un A5 et un A3 doivent se lire de la même façon.
 *
 *  Douze pour cent, et la raison est mesurable. Sur la fixture native, le numéro imprimé est à
 *  91,6 % de la hauteur, et le titre courant — « Lienotheque — page 3 sur 500 », qui contient
 *  deux nombres — à 14,0 %. Sans cette bande, « 500 » serait retenu comme numéro de page une
 *  fois sur deux, et chaque citation renverrait à la mauvaise page. */
export const BANDE_MARGE = 0.12;

/** En deçà de combien de mots une couche texte ne suffit pas pour cette page.
 *
 *  Le défaut est **par page**, jamais par document : mesuré sur le corpus, un même ouvrage rend
 *  3 % d'accord sur une page et 38 % sur une autre. Une page scannée sans passe d'OCR rend zéro
 *  mot ; une page qui n'en rend qu'une poignée ne porte qu'un folio ou un titre. Vingt mots
 *  séparent proprement les deux sur les seize documents mesurés. */
export const MOTS_MINIMUM = 20;

/** Un numéro de page plausible : au-delà, c'est une date, un prix ou une référence. */
const PAGE_MAXIMUM = 9_999;

/** Mots outils du français et de l'anglais : courts, très fréquents, absents d'un charabia.
 *
 *  C'est une donnée de **langue**, non de domaine : elle ne nomme rien de ce que la
 *  bibliothèque contient (CLA-01). Une bibliothèque dans une autre langue demandera la sienne,
 *  et ce sera une liste de plus, pas une branche de plus. */
const MOTS_OUTILS = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "et", "ou", "que", "qui", "dans", "pour", "pas", "ne",
  "est", "sont", "au", "aux", "ce", "cette", "il", "elle", "nous", "vous", "sur", "avec", "par", "plus",
  "the", "of", "and", "to", "in", "a", "is", "that", "for", "with", "as", "on", "it", "was", "are", "this",
]);

/** En deçà de quelle part de mots outils une couche texte n'est pas du langage.
 *
 *  Mesuré sur le document fautif du corpus, page par page : **0,2 à 2,8 %** pour la couche dont
 *  l'encodage de police est faux, **26 à 40 %** pour l'OCR de la même image. L'écart est d'un
 *  ordre de grandeur ; huit pour cent tombe largement entre, sans raser ni l'un ni l'autre. */
export const SEUIL_LISIBILITE = 0.08;

/** Part des mots d'un texte qui sont des mots outils.
 *
 *  Compter des mots « plausibles » ne marchait pas : un charabia régulier en produit autant. Un
 *  mot outil, lui, ne sort pas d'un encodage cassé — il faut que les bonnes lettres tombent dans
 *  le bon ordre sur un mot que tout le monde emploie. */
export function partDeMotsOutils(texte: string): number {
  const mots = texte
    .toLowerCase()
    .split(/[^\p{L}']+/u)
    .filter((mot) => mot.length > 0);
  if (mots.length === 0) return 0;
  return mots.filter((mot) => MOTS_OUTILS.has(mot)).length / mots.length;
}

/** Part des mots d'un texte qui sont **bien formés** : des suites de lettres, et rien d'autre.
 *
 *  Le second indice, et il existe parce que le premier se trompe seul. Une liste de noms et de
 *  titres ne contient aucun mot outil et se lit parfaitement :
 *
 *      « Conseillers et autres contributeurs du DSM-5 : David Brent, M.D. John Campo, M.D. »
 *
 *  Quinze passages de ce genre étaient comptés illisibles sur un seul document, vérifiés un par
 *  un. Ce qui les distingue d'un encodage cassé n'est pas la grammaire mais les **mots
 *  eux-mêmes** : une liste est faite de suites de lettres régulières, un encodage cassé rend des
 *  lettres isolées mêlées de signes. */
export function motsBienFormes(texte: string): number {
  const mots = texte.split(/\s+/).filter((mot) => /\p{L}/u.test(mot));
  if (mots.length === 0) return 0;
  // Un mot bien formé : au moins deux lettres, et rien que des lettres, apostrophes ou traits
  // d'union — ponctuation de bord retirée, car « (précoce), » est un mot bien formé.
  const bienFormes = mots.filter((mot) => /^\p{L}[\p{L}'’-]+$/u.test(mot.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")));
  return bienFormes.length / mots.length;
}

/** En deçà de quelle part de mots bien formés un texte n'est plus du texte.
 *
 *  Mesuré sur les deux cas réels : **73,9 %** pour la liste de noms, **42,9 %** pour la couche
 *  cassée. Soixante pour cent tombe entre, à quatorze points de chacun — une marge plus mince
 *  que l'ordre de grandeur qui sépare le premier critère, et c'est pourquoi celui-ci ne décide
 *  jamais seul. */
export const SEUIL_FORME = 0.6;

/** Ce texte est-il illisible ? Les **deux** indices doivent l'accuser (FMT-04).
 *
 *  Peu de mots outils *et* des mots mal formés. Une liste de noms échoue au premier et réussit
 *  le second ; un encodage cassé échoue aux deux. Accuser sur un seul indice, c'était condamner
 *  des pages parfaitement lisibles — et annoncer un chiffre faux dans le sens alarmant.
 *
 *  Un texte trop court n'est jamais accusé : sous vingt mots, aucune des deux parts ne veut
 *  rien dire.
 */
export function texteIllisible(texte: string): boolean {
  if (texte.split(/\s+/).filter((mot) => mot !== "").length < MOTS_MINIMUM) return false;
  return partDeMotsOutils(texte) < SEUIL_LISIBILITE && motsBienFormes(texte) < SEUIL_FORME;
}

/** Cette page est-elle écrite dans une langue, ou son encodage est-il cassé ?
 *
 *  On ne juge que ce dont on a de quoi juger : une page de titre de cinq mots peut n'en
 *  contenir aucun d'outil sans être cassée pour autant. En deçà du minimum, on la croit.
 */
export function lisible(page: PageLue): boolean {
  if (page.mots.length < MOTS_MINIMUM) return true;
  return partDeMotsOutils(page.mots.map((mot) => mot.texte).join(" ")) >= SEUIL_LISIBILITE;
}

/** La couche texte de cette page rend-elle assez, et de façon lisible, pour s'en contenter ?
 *
 *  **Compter les mots ne suffit pas, et c'était le défaut.** Un document du corpus rendait 295
 *  passages, tous servis par sa couche, et tous illisibles : « Xï Œè »· é }u} ï · w ». Sa couche
 *  existe, son encodage de police est faux, et elle rend *plus* de mots que l'OCR de la même
 *  image — 2 561 contre 837 sur une page. Un critère de quantité choisissait donc le charabia,
 *  et d'autant plus volontiers qu'il était abondant.
 */
export function coucheSuffisante(page: PageLue): boolean {
  return page.mots.length >= MOTS_MINIMUM && lisible(page);
}

/** Le numéro imprimé de la page, lu dans la couche texte.
 *
 *  On ne regarde que les bandes de marge, et l'on n'y retient qu'un mot **entièrement**
 *  numérique. S'il y en a plusieurs et qu'ils s'accordent — un folio répété en haut et en bas —
 *  on le retient ; s'ils se contredisent, on ne tranche pas.
 *
 *  Ne rien rendre est une réponse, et la bonne : une citation renvoyée à la mauvaise page est
 *  pire qu'une citation renvoyée à un rang de page assumé comme tel (RCH-09). Deviner ici, c'est
 *  fabriquer une référence que personne ne pourra vérifier.
 */
export function numeroImprime(page: PageLue): number | undefined {
  const haut = page.hauteur * BANDE_MARGE;
  const bas = page.hauteur * (1 - BANDE_MARGE);

  const candidats = new Set<number>();
  for (const mot of page.mots) {
    if (mot.y > haut && mot.y < bas) continue;
    if (!/^\d+$/.test(mot.texte)) continue;
    const valeur = Number.parseInt(mot.texte, 10);
    if (valeur >= 1 && valeur <= PAGE_MAXIMUM) candidats.add(valeur);
  }

  if (candidats.size !== 1) return undefined;
  return [...candidats][0];
}

/** Coupe en deux une feuille qui porte deux pages (OUT-03).
 *
 *  Les mots se répartissent de part et d'autre du milieu, et l'abscisse de ceux de droite est
 *  ramenée à l'origine de leur page : une ancre se lit dans sa page, pas dans la feuille qui
 *  l'a photographiée (ANC-01).
 *
 *  Sans cette coupe, les deux folios d'un même cliché se contredisent et aucun n'est retenu —
 *  le document entier perdrait ses numéros imprimés. Après elle, chaque moitié lit le sien.
 *
 *  La coupe tombe au milieu géométrique, et non sur une gouttière détectée. Pour du texte c'est
 *  suffisant : un mot est tout entier d'un côté ou de l'autre, et aucun n'enjambe le pli. La
 *  gouttière mesurée sert à décider **s'il y a** deux pages ; elle ne sert pas à les séparer.
 */
export function couperEnDeux(feuille: PageLue): readonly [PageLue, PageLue] {
  const milieu = feuille.largeur / 2;
  const moitie = (cote: "gauche" | "droite"): PageLue => ({
    index: feuille.index,
    source: feuille.source,
    unite: feuille.unite,
    largeur: milieu,
    hauteur: feuille.hauteur,
    mots: feuille.mots
      .filter((mot) => (cote === "gauche" ? mot.x < milieu : mot.x >= milieu))
      .map((mot) => (cote === "gauche" ? mot : { ...mot, x: mot.x - milieu })),
  });
  return [moitie("gauche"), moitie("droite")];
}

/** Ce qu'une page lue donne au découpage : son texte, sa provenance, son numéro imprimé. */
export function pageDeTexte(page: PageLue): PageDeTexte {
  const imprimee = numeroImprime(page);
  // Les mots restent dans l'ordre que la couche donne — l'ordre du contenu du PDF, qui est
  // l'ordre de lecture dans l'immense majorité des cas. Les retrier par position casserait le
  // texte en colonnes, qui se lit colonne par colonne et non ligne par ligne.
  return {
    index: page.index,
    texte: texteDePage(page),
    source: page.source,
    ...(imprimee === undefined ? {} : { pageImprimee: imprimee }),
  };
}

/** Un passage par page, dans l'ordre, sans trou ni doublon (RCH-07).
 *
 *  **Le rang n'est pas l'index de page.** Une page blanche, une planche, une page dont l'OCR
 *  n'a rien tiré n'a pas de passage ; faire porter au rang l'index de page y laisserait un trou,
 *  que le contrat refuse — et il le refuserait à l'écriture, une transaction plus loin, pour une
 *  raison illisible. Le rang compte les passages ; `page` garde la page d'où le texte vient.
 */
export function enPassages(pages: readonly PageDeTexte[]): Passage[] {
  const passages: Passage[] = [];
  for (const page of pages) {
    const texte = page.texte.trim();
    if (texte === "") continue;
    passages.push({
      rang: passages.length,
      page: page.index,
      texte,
      source: page.source,
      // Marqué, jamais écarté (FMT-04). L'écarter le ferait disparaître sans trace, et
      // décalerait en plus tous les rangs suivants.
      lisible: !texteIllisible(texte),
      ...(page.pageImprimee === undefined ? {} : { pageImprimee: page.pageImprimee }),
      ...(page.confiance === undefined ? {} : { confiance: page.confiance }),
    });
  }
  return passages;
}
