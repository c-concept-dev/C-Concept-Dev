import { readFile } from "node:fs/promises";
import { PageLue, TexteLu, type MotLu } from "@lienotheque/contrats";
import { empreinteDe } from "@lienotheque/formats";

/** Couche texte d'un PDF natif, avec la position de chaque mot (OUT-05).
 *
 *  Le PDF place des suites de caractères, pas des mots : on découpe chaque suite aux espaces et
 *  on répartit sa largeur au prorata des caractères. Les coordonnées sortent en points, origine
 *  en haut à gauche, comme le veulent les conventions d'ancrage. */

type Element = { str: string; transform: number[]; width: number; height: number };

export async function lireCoucheTexte(chemin: string): Promise<TexteLu> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
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
