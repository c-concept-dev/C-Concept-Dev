import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";
import { decoderJpeg, encoderWebp, redimensionner, type ImageRvba } from "@lienotheque/images";

/** Images de page pour les écrans, écrites au fil de l'eau (correction 8).
 *
 *  Une par une : on décode, on réduit, on encode, on écrit, et on passe à la suivante. Rien ne
 *  s'accumule — c'est la seule façon d'exporter cinq cents pages sans que la mémoire suive le
 *  document. Les images vont au cache de travail : elles viennent d'un original sous droits et
 *  n'ont rien à faire dans le dépôt ni dans `public/`. */

/** Largeur d'affichage : le Lecteur montre une page dans une colonne, pas une planche contact. */
export const LARGEUR_PAR_DEFAUT = 1240;

export type PageExportee = {
  /** Rang de la page dans le document, à partir de 0. */
  readonly index: number;
  readonly fichier: string;
  readonly largeur: number;
  readonly hauteur: number;
};

export type OptionsExport = {
  readonly largeur?: number;
  /** Ne traiter que les premières pages : pour un essai rapide. */
  readonly pages?: number;
  readonly qualite?: number;
};

/** Réduit une image à la largeur demandée, en gardant ses proportions. */
async function aLaLargeur(image: ImageRvba, largeur: number): Promise<ImageRvba> {
  if (image.width <= largeur) return image;
  return redimensionner(image, largeur, Math.max(1, Math.round((image.height * largeur) / image.width)));
}

/** Exporte les pages d'un document numérisé, une à la fois, et rend ce qui a été écrit. */
export async function exporterPages(pdf: string, dossier: string, options: OptionsExport = {}): Promise<PageExportee[]> {
  const largeurVoulue = options.largeur ?? LARGEUR_PAR_DEFAUT;
  mkdirSync(dossier, { recursive: true });

  const objets = objetsPdf(await readFile(pdf));
  const pages = pagesPdf(objets);
  const retenues = options.pages === undefined ? pages : pages.slice(0, options.pages);

  const exportees: PageExportee[] = [];
  for (const [index, page] of retenues.entries()) {
    const image = page.images[0];
    if (image === undefined) continue;
    const octets = octetsImage(objets, image.numero);
    if (octets === undefined || octets.extension !== "jpg") continue;

    const reduite = await aLaLargeur(await decoderJpeg(octets.octets), largeurVoulue);
    const nom = `page-${String(index).padStart(4, "0")}.webp`;
    // Écrite tout de suite : la page suivante ne doit pas attendre que celle-ci soit retenue.
    writeFileSync(join(dossier, nom), await encoderWebp(reduite, { quality: options.qualite ?? 72 }));
    exportees.push({ index, fichier: nom, largeur: reduite.width, hauteur: reduite.height });
  }
  return exportees;
}
