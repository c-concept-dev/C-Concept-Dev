import { readFile } from "node:fs/promises";
import { PageLue, TexteLu, type MotLu } from "@lienotheque/contrats";
import { empreinteDe } from "@lienotheque/formats";
import { poserDOMMatrixSiAbsent } from "./dommatrix.js";

/** Couche texte d'un PDF natif, avec la position de chaque mot (OUT-05).
 *
 *  Le PDF place des suites de caractères, pas des mots : on découpe chaque suite aux espaces et
 *  on répartit sa largeur au prorata des caractères. Les coordonnées sortent en points, origine
 *  en haut à gauche, comme le veulent les conventions d'ancrage. */

type Element = { str: string; transform: number[]; width: number; height: number };

export async function lireCoucheTexte(chemin: string): Promise<TexteLu> {
  // Avant le premier import, jamais après : un module ESM dont l'évaluation échoue garde son
  // erreur en cache, et pdfjs construit un DOMMatrix au chargement de son module de rendu.
  poserDOMMatrixSiAbsent();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Le module de travail de pdfjs, importé explicitement.
  //
  // Sans cela, pdfjs le cherche par un chemin **calculé à l'exécution** — ce qu'un empaqueteur
  // ne peut pas suivre, et ce qu'un paquet d'un seul fichier n'a pas sur son disque. Le moteur
  // embarqué échouait dessus : « Setting up fake worker failed ». L'import le pose dans
  // `globalThis.pdfjsWorker`, où pdfjs le trouve sans chercher aucun fichier.
  // Le module de travail de pdfjs n'est **pas** inliné dans la chaîne.
  //
  // Mesuré sur un livre numérisé de vingt-neuf pages : inliné, il fait passer la pointe mémoire
  // du moteur de 656 Mo à 1 661 Mo et le fait tuer par le système — pour un module qui n'est pas
  // même exécuté. esbuild l'inline dans le fichier unique, et V8 paie l'analyse de trois
  // mégaoctets et demi de code en plus.
  //
  // pdfjs le cherche de lui-même à côté de son propre module, et `preparer-moteur-node.py` le
  // pose là. Rien à faire ici : c'est l'absence de code qui est la correction.
  const donnees = new Uint8Array(await readFile(chemin));
  const document = await pdfjs.getDocument({ data: donnees, useSystemFonts: false }).promise;

  const pages: PageLue[] = [];
  for (let numero = 1; numero <= document.numPages; numero += 1) {
    const page = await document.getPage(numero);
    const [, , largeur, hauteur] = page.view as [number, number, number, number];
    const contenu = await page.getTextContent();

    const mots: MotLu[] = [];
    for (const brut of contenu.items as Element[]) {
      if (typeof brut.str !== "string" || brut.str.trim() === "") continue;
      mots.push(...decouperEnMots(brut, hauteur));
    }
    pages.push(PageLue.parse({ index: numero, source: "couche_texte", unite: "point", largeur, hauteur, mots }));
  }
  await document.destroy();

  return TexteLu.parse({ empreinte: await empreinteDe(chemin), outil: `pdfjs-dist ${pdfjs.version}`, pages });
}

/** Découpe une suite de caractères en mots, largeur répartie au prorata. */
export function decouperEnMots(element: Element, hauteurPage: number): MotLu[] {
  const gauche = element.transform[4] ?? 0;
  const bas = element.transform[5] ?? 0;
  const hauteur = Math.max(element.height || Math.abs(element.transform[3] ?? 1), 1);
  const haut = Math.max(0, hauteurPage - bas - hauteur);

  const total = element.str.length;
  const parCaractere = total > 0 ? element.width / total : 0;

  const mots: MotLu[] = [];
  let position = 0;
  for (const morceau of element.str.split(/(\s+)/)) {
    if (morceau.trim() !== "") {
      mots.push({
        texte: morceau,
        x: Math.max(0, gauche + position * parCaractere),
        y: haut,
        l: Math.max(parCaractere * morceau.length, 0.01),
        h: hauteur,
      });
    }
    position += morceau.length;
  }
  return mots;
}
