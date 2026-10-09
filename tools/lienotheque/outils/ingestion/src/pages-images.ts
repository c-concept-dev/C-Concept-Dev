import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { empreinteDe, objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";
import { decoderJpeg, encoderWebp, redimensionner, type ImageRvba } from "@lienotheque/images";
import { vignette } from "@lienotheque/optimiseur";

/** Images de page pour les écrans, écrites au fil de l'eau (correction 8).
 *
 *  Une par une : on décode, on réduit, on encode, on écrit, et on passe à la suivante. Rien ne
 *  s'accumule — c'est la seule façon d'exporter cinq cents pages sans que la mémoire suive le
 *  document. Les images vont au cache de travail : elles viennent d'un original sous droits et
 *  n'ont rien à faire dans le dépôt ni dans `public/`.
 *
 *  Deux tailles sortent du même décodage : la page et sa vignette (OUT-04). Les produire en deux
 *  passes demanderait de décoder le document deux fois ; les produire ici ne coûte qu'une
 *  réduction de plus par page, et la mémoire ne bouge pas. */

/** Largeur d'affichage : le Lecteur montre une page dans une colonne, pas une planche contact. */
export const LARGEUR_PAR_DEFAUT = 1240;

export type PageExportee = {
  /** Rang de la page dans le document, à partir de 0. */
  readonly index: number;
  readonly fichier: string;
  readonly largeur: number;
  readonly hauteur: number;
  /** Nom du dérivé de vignette, quand il a pu être produit (OUT-04). */
  readonly vignette?: string | undefined;
};

export type OptionsExport = {
  readonly largeur?: number;
  /** Ne traiter que les premières pages : pour un essai rapide. */
  readonly pages?: number;
  /** Rang de la première page exportée, à partir de zéro. Avec `pages`, cela fait une tranche —
   *  ce qu'il faut pour montrer une page précise sans exporter tout ce qui la précède. */
  readonly depuis?: number;
  readonly qualite?: number;
  /** Produire la vignette de chaque page. Vrai par défaut. */
  readonly vignettes?: boolean;
};

/** Réduit une image à la largeur demandée, en gardant ses proportions. */
async function aLaLargeur(image: ImageRvba, largeur: number): Promise<ImageRvba> {
  if (image.width <= largeur) return image;
  return redimensionner(image, largeur, Math.max(1, Math.round((image.height * largeur) / image.width)));
}

/** Exporte les pages d'un document numérisé, une à la fois, et rend ce qui a été écrit. */
export async function exporterPages(pdf: string, dossier: string, options: OptionsExport = {}): Promise<PageExportee[]> {
  const largeurVoulue = options.largeur ?? LARGEUR_PAR_DEFAUT;
  const avecVignettes = options.vignettes ?? true;
  mkdirSync(dossier, { recursive: true });

  const objets = objetsPdf(await readFile(pdf));
  const pages = pagesPdf(objets);
  const depuis = options.depuis ?? 0;
  const retenues = pages.slice(depuis, options.pages === undefined ? undefined : depuis + options.pages);

  // L'empreinte de la source, une fois : c'est elle qu'un dérivé déclare (OUT-04). La calculer
  // par page ferait relire le document à chaque tour.
  const source = avecVignettes ? await empreinteDe(pdf) : undefined;

  const exportees: PageExportee[] = [];
  for (const [rangDansLaTranche, page] of retenues.entries()) {
    // Le rang dans le document, et non dans la tranche : une page exportée seule doit porter le
    // même numéro que si tout le document l'avait été, sans quoi deux tranches se recouvrent.
    const index = depuis + rangDansLaTranche;
    const image = page.images[0];
    if (image === undefined) continue;
    const octets = octetsImage(objets, image.numero);
    if (octets === undefined || octets.extension !== "jpg") continue;

    const reduite = await aLaLargeur(await decoderJpeg(octets.octets), largeurVoulue);
    const nom = `page-${String(index).padStart(4, "0")}.webp`;
    // Écrite tout de suite : la page suivante ne doit pas attendre que celle-ci soit retenue.
    writeFileSync(join(dossier, nom), await encoderWebp(reduite, { quality: options.qualite ?? 72 }));

    // La vignette sort de l'image déjà réduite, pendant qu'elle est encore là. Si le générateur
    // de dérivés refuse celle-ci — une page qui ne se comprime pas sous son plafond —, la page
    // garde son image et perd sa vignette : les écrans savent s'en passer.
    let nomVignette: string | undefined;
    if (source !== undefined)
      try {
        const derive = await vignette(reduite, source);
        nomVignette = `vignette-${String(index).padStart(4, "0")}.webp`;
        writeFileSync(join(dossier, nomVignette), derive.octets);
      } catch (cause) {
        nomVignette = undefined;
        console.warn(`Vignette de la page ${index} non produite : ${cause instanceof Error ? cause.message : String(cause)}`);
      }

    exportees.push({
      index,
      fichier: nom,
      largeur: reduite.width,
      hauteur: reduite.height,
      ...(nomVignette === undefined ? {} : { vignette: nomVignette }),
    });
  }
  return exportees;
}
