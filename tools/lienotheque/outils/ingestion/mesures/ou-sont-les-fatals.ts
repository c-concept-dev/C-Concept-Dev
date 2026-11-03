/** Quelles pages d'un document portent une image que le décodeur WebAssembly ne survit pas ? */
import { readFileSync } from "node:fs";
import { causeJpegFatalAvantDecodage, objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";

const chemin = process.argv[2]!;
const octets = readFileSync(chemin);
const objets = objetsPdf(octets);
const pages = pagesPdf(objets);
const fatales: number[] = [];
for (const page of pages) {
  let fatal = false;
  for (const image of page.images) {
    const extrait = octetsImage(objets, image.numero);
    if (extrait?.extension === "jpg" && causeJpegFatalAvantDecodage(extrait.octets) !== undefined) fatal = true;
  }
  if (fatal) fatales.push(page.index + 1);
}
console.log(`${pages.length} page(s) ; ${fatales.length} portent une image fatale au WebAssembly`);
console.log(`pages concernées : ${fatales.length === 0 ? "aucune" : fatales.join(", ")}`);
