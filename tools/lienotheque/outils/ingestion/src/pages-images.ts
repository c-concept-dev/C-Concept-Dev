import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { causeJpegNonDirect, empreinteDe, objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";
import { decoderJpeg, encoderWebp, enGris, redimensionner, tournerRvba, type ImageRvba } from "@lienotheque/images";
import { vignette } from "@lienotheque/optimiseur";
import { causeLisible } from "@lienotheque/noyau";
import { ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { couperDoublePage, rotationDePageFiable } from "@lienotheque/redresseur";

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

/** Pourquoi une page n'a pas donné d'image. Trois causes, et elles ne se disent pas pareil à
 *  l'écran : « rien à montrer » n'est pas « ce document n'est pas une numérisation ». */
export type CauseDeRefus =
  | "sans_image"
  | "plusieurs_images"
  | "image_tronquee"
  | "jpeg_non_rvb"
  | "rendu_impossible";

export type PageRefusee = { readonly index: number; readonly cause: CauseDeRefus };

/** Ce que l'export a produit, et ce qu'il a refusé de produire.
 *
 *  Les refus comptent autant que les pages : sans eux, un document dont aucune page ne sort est
 *  indiscernable d'un document qu'on n'a pas encore traité, et l'écran dit « pas encore
 *  préparées » à quelqu'un qui attendra pour rien. */
export type Export = { readonly pages: readonly PageExportee[]; readonly refusees: readonly PageRefusee[] };

/** L'export a terminé sans produire une seule page utilisable.
 *
 *  Ce n'est pas une dégradation de vignette : sans page, le Lecteur n'a rien de réel à montrer.
 *  Le type distinct permet à la chaîne de laisser vivre un texte lorsqu'une page isolée échoue,
 *  tout en refusant de transformer l'absence totale de pages en succès apparent. */
export class ErreurExportPagesVide extends Error {
  constructor(readonly pagesExaminees: number, readonly pagesRefusees: number) {
    super(
      `Aucune page exploitable produite (${pagesExaminees} page(s) examinée(s), ${pagesRefusees} refusée(s))`,
    );
    this.name = "ErreurExportPagesVide";
  }
}

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
  /** Qualification bornée : essayer les quatre sens et ne tourner que si une vraie lecture les
   * départage. Désactivé tant que l'échantillon privé complet n'est pas qualifié. */
  readonly redresser?: boolean;
  /** Une feuille du PDF porte deux pages du livre. Le rendu PDF est alors obligatoire : lui
   * seul applique la rotation déclarée par la page avant que la planche soit coupée. */
  readonly doublePage?: boolean;
  /** Les rotations **déjà décidées par la lecture**, par rang de feuille (à partir de 1).
   *
   *  ## Pourquoi reçues, et non redécidées
   *
   *  La lecture a redressé certaines pages avant de les lire : les positions de leurs mots sont
   *  donc dans le repère **tourné**. Si l'image exportée restait dans le repère d'origine, un mot
   *  surligné tomberait à côté, et une zone tracée désignerait autre chose que ce qu'on voit.
   *
   *  Décider une seconde fois ici serait pire que de ne rien faire : deux décisions prises
   *  séparément finissent par diverger, et le défaut ne se verrait que sur la page où elles se
   *  contredisent. **Une seule décision, prise à la lecture, et portée jusqu'à l'affichage.** */
  readonly rotations?: ReadonlyMap<number, number>;
};

function redresserSiProuve(image: ImageRvba, actif: boolean): ImageRvba {
  if (!actif) return image;
  const rotation = rotationDePageFiable(enGris(image));
  if (rotation === undefined) return image;
  return rotation === 0 ? image : tournerRvba(image, rotation);
}

/** Pourquoi la première image d'une page n'est pas la page, quand elle ne l'est pas.
 *
 *  **Cette fonction porte toute la prudence de l'export.** `exporterPages` prend la première
 *  image d'une page et la présente comme étant la page. C'est exact d'un document **numérisé**,
 *  où chaque page est une photographie unique — et faux partout ailleurs.
 *
 *  Le 22 octobre 2026, l'éditeur de manière de lire a ainsi montré, sur un document composé en
 *  texte, un extrait de figure en guise de page 8, et une autre figure en guise de page 13 : trois
 *  pages, trois dimensions sans rapport. Tracer une zone là-dessus aurait enregistré une
 *  géométrie qui ne désigne rien.
 *
 *  Deux refus, et chacun a sa raison d'être :
 *
 *  | refus | ce qu'il évite |
 *  |---|---|
 *  | la page porte **plusieurs** images | aucune d'elles n'est la page ; en choisir une serait tirer au sort |
 *  | le flux JPEG est **tronqué** | le décodeur rendrait un aplat gris de la bonne taille, indiscernable d'une vraie page grise |
 *
 *  Une page **sans** image n'est pas un refus : il n'y avait rien à montrer, et c'est déjà ce que
 *  l'ancien code faisait. Rendre `undefined` ici veut dire « cette image est la page ».
 */
function pourquoiPasLaPage(
  objets: ReturnType<typeof objetsPdf>,
  page: { readonly index: number; readonly images: readonly { readonly numero: number }[] },
): PageRefusee | undefined {
  if (page.images.length === 0) return { index: page.index, cause: "sans_image" };
  if (page.images.length > 1) return { index: page.index, cause: "plusieurs_images" };
  const octets = octetsImage(objets, page.images[0]!.numero);
  if (octets === undefined || octets.extension !== "jpg") return { index: page.index, cause: "sans_image" };
  const causeJpeg = causeJpegNonDirect(octets.octets);
  if (causeJpeg === "flux JPEG incomplet") return { index: page.index, cause: "image_tronquee" };
  if (causeJpeg !== undefined) return { index: page.index, cause: "jpeg_non_rvb" };
  return undefined;
}

/** Réduit une image à la largeur demandée, en gardant ses proportions. */
async function aLaLargeur(image: ImageRvba, largeur: number): Promise<ImageRvba> {
  if (image.width <= largeur) return image;
  return redimensionner(image, largeur, Math.max(1, Math.round((image.height * largeur) / image.width)));
}

/** Recadre l'image d'affichage aux mêmes bornes que le lecteur en niveaux de gris. */
function recadrerRvba(image: ImageRvba, x: number, largeur: number): ImageRvba {
  const gauche = Math.max(0, Math.min(image.width, Math.round(x)));
  const l = Math.max(1, Math.min(image.width - gauche, Math.round(largeur)));
  const data = new Uint8ClampedArray(l * image.height * 4);
  for (let y = 0; y < image.height; y += 1) {
    const debut = (y * image.width + gauche) * 4;
    data.set(image.data.subarray(debut, debut + l * 4), y * l * 4);
  }
  return { data, width: l, height: image.height, colorSpace: image.colorSpace };
}

/** Coupe une planche rendue dans son orientation PDF, sans inventer une seconde gouttière. */
function couperPlanche(image: ImageRvba): readonly [ImageRvba, ImageRvba] {
  const { x } = couperDoublePage(enGris(image));
  const retrait = Math.round(image.width * 0.005);
  const droite = Math.min(image.width - 1, x + retrait);
  return [
    recadrerRvba(image, 0, Math.max(1, x - retrait)),
    recadrerRvba(image, droite, image.width - droite),
  ];
}

/** Exporte les pages d'un document numérisé, une à la fois, et rend ce qui a été écrit. */
export async function exporterPages(pdf: string, dossier: string, options: OptionsExport = {}): Promise<Export> {
  const largeurVoulue = options.largeur ?? LARGEUR_PAR_DEFAUT;
  const avecVignettes = options.vignettes ?? true;
  mkdirSync(dossier, { recursive: true });

  const objets = objetsPdf(await readFile(pdf));
  let pages = pagesPdf(objets);
  let renduComplet: Awaited<ReturnType<typeof ouvrirRenduPdf>> | undefined;
  // Certains PDF réels portent une table de pages que le lecteur structurel minimal ne sait pas
  // traverser. Zéro ici ne signifie donc pas zéro dans le document : pdf.js est le second lecteur
  // indépendant qui donne le vrai nombre et rend chaque composition entière.
  if (pages.length === 0) {
    renduComplet = await ouvrirRenduPdf(pdf);
    pages = Array.from({ length: renduComplet.nombreDePages }, (_, index) => ({
      index,
      numero: index + 1,
      images: [],
      couchTexte: false,
    }));
  }
  const depuis = options.depuis ?? 0;
  const retenues = pages.slice(depuis, options.pages === undefined ? undefined : depuis + options.pages);

  // L'empreinte de la source, une fois : c'est elle qu'un dérivé déclare (OUT-04). La calculer
  // par page ferait relire le document à chaque tour.
  const source = avecVignettes ? await empreinteDe(pdf) : undefined;

  const exportees: PageExportee[] = [];
  const refusees: PageRefusee[] = [];
  try {
    for (const [rangDansLaTranche, page] of retenues.entries()) {
      // Le rang dans le document, et non dans la tranche : une page exportée seule doit porter le
      // même numéro que si tout le document l'avait été, sans quoi deux tranches se recouvrent.
      const index = depuis + rangDansLaTranche;
      const refusDirect = pourquoiPasLaPage(objets, page);
      let directe: ImageRvba | undefined;
      let causeDirecte: unknown;
      if (options.doublePage !== true && refusDirect === undefined) {
        const image = page.images[0]!;
        const octets = octetsImage(objets, image.numero)!;
        try {
          directe = await decoderJpeg(octets.octets);
        } catch (cause) {
          causeDirecte = cause;
        }
      }

      let preparee: ImageRvba;
      if (directe !== undefined) preparee = directe;
      else
        try {
          // Une page est une composition, pas nécessairement un JPEG. Le rendu complet couvre
          // Flate, JPX, plusieurs images, graphismes et JPEG que le codec direct refuse.
          renduComplet ??= await ouvrirRenduPdf(pdf);
          // La décision d'orientation demande davantage de matière que l'image d'écran. À
          // À 1 240 px, une page de l'échantillon hésite entre les deux quarts de tour ; à
          // 1 800 px, l'OSD et la lecture convergent sur le sens qui rend le texte lisible.
          const largeurDeRendu = options.doublePage === true ? largeurVoulue * 2 : largeurVoulue;
          preparee = await renduComplet.page(
            index + 1,
            options.redresser === true ? Math.max(1800, largeurDeRendu) : largeurDeRendu,
          );
        } catch (causeRendu) {
          const directeDite =
            causeDirecte === undefined
              ? refusDirect?.cause ?? "format d’image non directement exploitable"
              : causeLisible(causeDirecte);
          console.warn(
            `Page ${index + 1} non produite : chemin direct (${directeDite}) ; rendu complet (${causeLisible(causeRendu)})`,
          );
          refusees.push({ index, cause: "rendu_impossible" });
          continue;
        }

      // La rotation décidée par la lecture l'emporte : image et coordonnées des mots dans le
      // même repère. À défaut, l'ancienne qualification bornée, qui décide seule.
      const rotationDeLaLecture = options.rotations?.get(index + 1);
      preparee =
        rotationDeLaLecture === undefined || rotationDeLaLecture === 0
          ? redresserSiProuve(preparee, options.redresser === true)
          : tournerRvba(preparee, rotationDeLaLecture as 90 | 180 | 270);
      const logiques = options.doublePage === true ? couperPlanche(preparee) : [preparee];
      for (const [cote, logique] of logiques.entries()) {
        const indexLogique = options.doublePage === true ? index * 2 + cote : index;
        const reduite = await aLaLargeur(logique, largeurVoulue);
        const nom = `page-${String(indexLogique).padStart(4, "0")}.webp`;
        // Écrite tout de suite : la page suivante ne doit pas attendre que celle-ci soit retenue.
        writeFileSync(join(dossier, nom), await encoderWebp(reduite, { quality: options.qualite ?? 72 }));

        // La vignette sort de l'image déjà réduite, pendant qu'elle est encore là. Si le générateur
        // de dérivés refuse celle-ci — une page qui ne se comprime pas sous son plafond —, la page
        // garde son image et perd sa vignette : les écrans savent s'en passer.
        let nomVignette: string | undefined;
        if (source !== undefined)
          try {
            const derive = await vignette(reduite, source);
            nomVignette = `vignette-${String(indexLogique).padStart(4, "0")}.webp`;
            writeFileSync(join(dossier, nomVignette), derive.octets);
          } catch (cause) {
            nomVignette = undefined;
            console.warn(`Vignette de la page ${indexLogique} non produite : ${causeLisible(cause)}`);
          }

        exportees.push({
          index: indexLogique,
          fichier: nom,
          largeur: reduite.width,
          hauteur: reduite.height,
          ...(nomVignette === undefined ? {} : { vignette: nomVignette }),
        });
      }
    }
  } finally {
    await renduComplet?.fermer();
  }
  if (exportees.length === 0) throw new ErreurExportPagesVide(retenues.length, refusees.length);
  return { pages: exportees, refusees };
}
