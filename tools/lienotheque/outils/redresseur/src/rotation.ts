import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MotLu, Rotation, SourceRotation } from "@lienotheque/contrats";
import { lireParOcr } from "@lienotheque/lecteur-texte";
import { reduire, tourner, versPgm, type ImageGrise } from "@lienotheque/images";

/** Trouver dans quel sens une photo de page a été prise (OUT-03).
 *
 *  On a d'abord demandé à Tesseract, en mode orientation. Il répond toujours, et c'est là le
 *  piège : sur les 14 clichés de référence de F4 il s'est trompé 4 fois — deux pages rendues à
 *  l'envers, deux laissées couchées. Comme il se prononçait, on ne regardait pas plus loin, et
 *  ces pages ne donnaient plus rien à lire : zéro élément sur une page qui en portait six.
 *
 *  Une page de musique porte peu de texte, et l'orientation d'un texte rare se devine mal. Ce
 *  qu'on sait faire, en revanche, c'est lire : on essaie donc les quatre sens et l'on garde celui
 *  qui donne le plus à lire. C'est plus cher — quatre lectures au lieu d'une —, mais la lecture
 *  se fait sur une image réduite, et une page mal tournée ne coûte pas quatre lectures, elle
 *  coûte tout le reste.
 *
 *  L'avis de Tesseract reste, en second : quand les quatre sens se valent, il vaut mieux que
 *  rien. Et la forme en dernier, quand il se tait. */

export type OptionsRotation = {
  readonly binaire?: string;
  readonly tessdata?: string | undefined;
  readonly dossier?: string;
  /** Facteur de réduction avant de sonder. Le détail ne sert pas à juger d'une orientation. */
  readonly reduction?: number;
  /** Mettre à faux pour s'en tenir à l'avis de Tesseract et à la forme : les contrôles qui ne
   *  mesurent pas l'orientation n'ont pas à payer quatre lectures. */
  readonly parLecture?: boolean;
};

export type RotationTrouvee = { readonly rotation: Rotation; readonly source: SourceRotation };

const QUARTS = new Set([0, 90, 180, 270]);
const SENS: readonly Rotation[] = [0, 90, 180, 270];

/** Réduction par défaut : une page de deux mille pixels de haut en fait mille, et cela suffit
 *  largement à voir si le texte est à l'endroit. */
const REDUCTION_PAR_DEFAUT = 2;

/** Écart relatif en deçà duquel deux sens se valent. Sous ce seuil, la lecture ne tranche pas,
 *  et l'on préfère le dire que de choisir à pile ou face. */
const ECART_DECISIF = 0.25;

/** Lit la réponse de Tesseract en mode orientation. `undefined` s'il ne se prononce pas. */
export function rotationDansOsd(sortie: string): Rotation | undefined {
  const trouve = /^Rotate:\s*(\d+)/m.exec(sortie);
  if (trouve === null) return undefined;
  const degres = Number(trouve[1]);
  return QUARTS.has(degres) ? (degres as Rotation) : undefined;
}

/** Déduction de dernier recours : une double page est plus large que haute. */
export const rotationDeForme = (image: ImageGrise): Rotation => (image.hauteur > image.largeur ? 90 : 0);

/** Ce qu'une image donne à lire, en un nombre.
 *
 *  La somme des confiances, et non le compte des mots : dix bribes douteuses ne valent pas trois
 *  mots nets. Les fragments d'un caractère sont écartés — une page couchée en produit autant
 *  qu'une page droite, et ils ne disent rien du sens. */
export function noteDeLecture(mots: readonly MotLu[]): number {
  let note = 0;
  for (const mot of mots) {
    const texte = mot.texte.trim();
    if (texte.length < 2) continue;
    if (!/[\p{L}\p{N}]{2}/u.test(texte)) continue;
    note += mot.confiance ?? 0.5;
  }
  return note;
}

/** Un seul dossier par exécution, et l'image effacée dès qu'elle a servi : un lot de trois cents
 *  clichés ne doit rien laisser derrière lui. */
let dossierDeTravail: string | undefined;
let compteur = 0;

function surDisque<T>(image: ImageGrise, options: OptionsRotation, faire: (chemin: string) => T): T | undefined {
  dossierDeTravail ??= mkdtempSync(join(tmpdir(), "lienotheque-rotation-"));
  const chemin = join(options.dossier ?? dossierDeTravail, `orientation-${(compteur += 1)}.pgm`);
  writeFileSync(chemin, versPgm(image));
  try {
    return faire(realpathSync(chemin));
  } catch {
    return undefined;
  } finally {
    rmSync(chemin, { force: true });
  }
}

/** Note les quatre sens, du meilleur au pire. */
export function noterLesQuatreSens(image: ImageGrise, options: OptionsRotation = {}): { rotation: Rotation; note: number }[] {
  const reduite = reduire(image, options.reduction ?? REDUCTION_PAR_DEFAUT);
  const notes = SENS.map((rotation) => {
    const tournee = tourner(reduite, rotation);
    const note = surDisque(tournee, options, (chemin) => {
      // L'index part de 1 : c'est ce que le contrat d'une page lue demande. Passer 0 le faisait
      // refuser, et le refus se perdait dans le repli — les quatre sens notaient alors zéro, et
      // la détection retombait sur l'avis de Tesseract sans que rien ne le dise.
      const lue = lireParOcr(chemin, tournee.largeur, tournee.hauteur, 1, {
        ...(options.binaire === undefined ? {} : { binaire: options.binaire }),
        ...(options.tessdata === undefined ? {} : { tessdata: options.tessdata }),
        segmentation: 3,
      });
      return noteDeLecture(lue.mots);
    });
    return { rotation, note: note ?? 0 };
  });
  // À note égale, le sens le plus petit d'abord : un rejeu doit rendre le même résultat.
  return notes.sort((a, b) => b.note - a.note || a.rotation - b.rotation);
}

/** Vrai quand la meilleure note se détache assez pour qu'on la suive. */
export function lectureTranche(notes: readonly { note: number }[]): boolean {
  const [meilleure, seconde] = notes;
  if (meilleure === undefined || meilleure.note <= 0) return false;
  if (seconde === undefined) return true;
  return (meilleure.note - seconde.note) / meilleure.note >= ECART_DECISIF;
}

/** L'avis de Tesseract, quand il se prononce. */
export function rotationParOsd(image: ImageGrise, options: OptionsRotation = {}): Rotation | undefined {
  return surDisque(image, options, (chemin) => {
    const arguments_ = [chemin, "stdout", "--psm", "0"];
    if (options.tessdata !== undefined) arguments_.push("--tessdata-dir", options.tessdata);
    const sortie = execFileSync(options.binaire ?? "tesseract", arguments_, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return rotationDansOsd(sortie);
  });
}

/** Ce qu'un cliché pèse dans le vote du lot : l'écart entre le meilleur sens et le suivant.
 *
 *  Un cliché qui porte du texte tranche largement et pèse lourd ; un cliché de musique pure ne
 *  départage rien et ne pèse presque pas. C'est exactement ce qu'on veut : les pages bavardes
 *  décident pour les muettes. */
export const poidsDuVote = (notes: readonly { note: number }[]): number =>
  Math.max(0, (notes[0]?.note ?? 0) - (notes[1]?.note ?? 0));

/** L'orientation d'un lot, votée sur un échantillon (OUT-03).
 *
 *  Un livre est photographié en une séance, dans un sens. L'orientation est donc une propriété du
 *  lot, pas du cliché — et c'est le même raisonnement que pour le décalage des numéros de page,
 *  qui vaut 0 sur 112 pages de ce livre et se vote d'abord sur l'ensemble.
 *
 *  Pourquoi le vote et pas la lecture cliché par cliché : mesuré sur les quatorze clichés de
 *  référence de F4, la lecture tranche nettement sur quatre d'entre eux — ceux qui portent du
 *  texte — et hésite sur les dix autres, où quelques points d'écart séparent les quatre sens. Le
 *  vote pondéré donne 270° par 460 contre 13 : les clichés bavards décident, les muets suivent.
 *  Pris isolément, les muets se seraient trompés une fois sur trois. */
export function orientationDuLot(parCliche: readonly (readonly { rotation: Rotation; note: number }[])[]): RotationTrouvee | undefined {
  const poids = new Map<Rotation, number>();
  for (const notes of parCliche) {
    const meilleur = notes[0];
    if (meilleur === undefined) continue;
    poids.set(meilleur.rotation, (poids.get(meilleur.rotation) ?? 0) + poidsDuVote(notes));
  }

  let retenue: Rotation | undefined;
  let meilleur = 0;
  // À poids égal, le sens le plus petit : un rejeu doit rendre le même lot.
  for (const sens of SENS) {
    const valeur = poids.get(sens) ?? 0;
    if (valeur > meilleur) [retenue, meilleur] = [sens, valeur];
  }
  return retenue === undefined || meilleur <= 0 ? undefined : { rotation: retenue, source: "reconnue" };
}

export function detecterRotation(image: ImageGrise, options: OptionsRotation = {}): RotationTrouvee {
  if (options.parLecture !== false) {
    const notes = noterLesQuatreSens(image, options);
    if (lectureTranche(notes)) return { rotation: notes[0]!.rotation, source: "reconnue" };
  }

  const osd = rotationParOsd(image, options);
  if (osd !== undefined) return { rotation: osd, source: "reconnue" };

  return { rotation: rotationDeForme(image), source: "deduite" };
}
