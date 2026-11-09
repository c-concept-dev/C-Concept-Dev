import { readFileSync } from "node:fs";
import { objetsPdf, pagesPdf } from "@lienotheque/formats";
const SOURCE = "/Volumes/Macbook Pro/Bibliotheque Musique/sources/ca/" +
  "ca36cf9859691679fcc7c0065461275a18d32d318e82ccb89fb2404a786be90a.pdf";
const pages = pagesPdf(objetsPdf(readFileSync(SOURCE)));
for (const rang1 of (process.argv[2] ?? "").split(",").map(Number).filter(Boolean)) {
  const p = pages[rang1 - 1];
  console.log(`  feuille ${rang1} (rang ${rang1 - 1}) : ${p ? `${p.images.length} image(s), couche texte ${p.couchTexte}` : "ABSENTE"}`);
}
console.log(`  total : ${pages.length} feuilles`);
