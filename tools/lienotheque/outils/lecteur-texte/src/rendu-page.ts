import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { causeJpegFatalAvantDecodage, objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";
import { poserDOMMatrixSiAbsent } from "./dommatrix.js";

/** Pixels RVBA d'une page entière, dans la même forme que les primitives d'image du projet. */
export type PageRendue = {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: "srgb";
};

export type RenduPdf = {
  readonly nombreDePages: number;
  /** `numero` commence à un, comme pdf.js et comme les pages montrées à l'écran. */
  readonly page: (numero: number, largeur: number) => Promise<PageRendue>;
  readonly fermer: () => Promise<void>;
};

/** Ressources distribuées avec la même version de pdf.js que le moteur chargé.
 *
 * Sans ces adresses explicites, Node tente un import nommé `nullopenjpeg…` pour les images JPX
 * et rend une page blanche tout en considérant l'opération réussie. Partir de l'URL réellement
 * résolue du module garde ces chemins justes sous pnpm comme dans l'application empaquetée. */
export function ressourcesPdfJs(): { readonly wasmUrl: string; readonly standardFontDataUrl: string } {
  const embarquees = process.env["LIENOTHEQUE_PDFJS"];
  if (embarquees !== undefined) {
    return {
      wasmUrl: `${resolve(embarquees, "wasm")}${sep}`,
      standardFontDataUrl: `${resolve(embarquees, "standard_fonts")}${sep}`,
    };
  }
  const modulePdfJs = createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.mjs");
  return {
    wasmUrl: `${resolve(dirname(modulePdfJs), "../../wasm")}${sep}`,
    standardFontDataUrl: `${resolve(dirname(modulePdfJs), "../../standard_fonts")}${sep}`,
  };
}

type PagePdf = {
  readonly getViewport: (options: { readonly scale: number }) => { readonly width: number; readonly height: number };
  readonly render: (options: unknown) => { readonly promise: Promise<unknown> };
  readonly cleanup: () => void;
};

/** Rend puis libère immédiatement les ressources propres à cette page.
 *
 * `PDFDocumentProxy.destroy()` à la fin du livre ne suffit pas : sur un livre JPX de 286 pages,
 * les images décodées restaient toutes retenues jusque-là et la mémoire native dépassait 2,6 Go. */
export async function rendrePagePdf(page: PagePdf, largeur: number): Promise<PageRendue> {
  try {
    const naturel = page.getViewport({ scale: 1 });
    const scale = largeur / naturel.width;
    const viewport = page.getViewport({ scale });
    const width = Math.max(1, Math.round(viewport.width));
    const height = Math.max(1, Math.round(viewport.height));
    const canvas = createCanvas(width, height);
    const contexte = canvas.getContext("2d");
    contexte.fillStyle = "white";
    contexte.fillRect(0, 0, width, height);
    await page.render({ canvasContext: contexte as never, viewport, canvas: canvas as never }).promise;
    const pixels = contexte.getImageData(0, 0, width, height).data;
    return { data: new Uint8ClampedArray(pixels), width, height, colorSpace: "srgb" };
  } finally {
    page.cleanup();
  }
}

/** Ouvre une fois le document et rend ses pages une par une.
 *
 * Ce chemin est le repli des PDF qui ne livrent pas leur page sous la forme d'un JPEG unique :
 * images Flate/JPX, texte et graphismes vectoriels, ou compositions de plusieurs images. Il ne
 * garde jamais plusieurs pages en pixels à la fois. */
export async function ouvrirRenduPdf(chemin: string): Promise<RenduPdf> {
  poserDOMMatrixSiAbsent();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const donnees = new Uint8Array(await readFile(chemin));
  // Le moteur WebAssembly rend mieux les compositions ordinaires, mais trois documents réels le
  // font quitter le processus. On ne le désactive que si le document porte précisément une des
  // signatures fatales mesurées ; les autres gardent le rendu le plus fidèle.
  const objets = objetsPdf(Buffer.from(donnees));
  const jpegFatal = pagesPdf(objets).some((page) =>
    page.images.some((image) => {
      const extrait = octetsImage(objets, image.numero);
      return extrait?.extension === "jpg" && causeJpegFatalAvantDecodage(extrait.octets) !== undefined;
    }),
  );
  const document = await pdfjs.getDocument({
    data: donnees,
    useSystemFonts: false,
    ...ressourcesPdfJs(),
    // Le chemin WebAssembly de pdf.js s'appuie sur libjpeg. Sur les trois vrais PDF qui ont
    // motivé ce repli, il termine le processus (`exit(1)`) devant un JPEG tronqué ou CMJN, donc
    // aucune exception ne peut être interceptée. Le décodeur JavaScript de pdf.js rend ces mêmes
    // pages sans quitter le moteur ; on le choisit explicitement pour que la panne reste locale.
    useWasm: !jpegFatal,
    isImageDecoderSupported: false,
  }).promise;

  return {
    nombreDePages: document.numPages,
    page: async (numero, largeur) => {
      const page = await document.getPage(numero);
      return rendrePagePdf(page as unknown as PagePdf, largeur);
    },
    fermer: async () => document.destroy(),
  };
}
