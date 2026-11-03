import { readFileSync } from "node:fs";
import { objetsPdf, pagesPdf } from "@lienotheque/formats";
const pages = pagesPdf(objetsPdf(readFileSync(process.argv[2]!)));
const douze = pages.slice(0, 12).reduce((t, p) => t + p.images.length, 0);
console.log(`${pages.length} page(s) ; images sur les 12 premières : ${douze} ; total : ${pages.reduce((t, p) => t + p.images.length, 0)}`);
console.log("images par page, 1 à 16 :", pages.slice(0, 16).map((p) => p.images.length).join(" "));
