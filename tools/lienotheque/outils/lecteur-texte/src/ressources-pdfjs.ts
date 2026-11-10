import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";

/** Ressources distribuées avec la même version de pdf.js que le moteur chargé.
 *
 * Sans ces adresses explicites, Node tente un import nommé `nullopenjpeg…` pour les images JPX
 * et rend une page blanche tout en considérant l'opération réussie. Partir de l'URL réellement
 * résolue du module garde ces chemins justes sous pnpm comme dans l'application empaquetée.
 *
 * **Elles valent pour toute lecture, pas seulement pour le rendu** (dette D24). La couche texte
 * les demande aussi : `useSystemFonts: false` oblige pdf.js à charger les polices standard du
 * document au lieu de leur substituer celles du système, et sans `standardFontDataUrl` ce
 * chargement échoue en avertissant plutôt qu'en levant.
 *
 * Ce module n'existe que pour cela : `couche-texte.ts` l'appelle sans avoir à importer
 * `rendu-page.ts`, qui charge `@napi-rs/canvas` au passage. */
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
