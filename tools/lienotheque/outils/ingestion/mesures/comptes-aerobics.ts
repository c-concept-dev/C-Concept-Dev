/** Mesure A1 du 4 novembre : pourquoi quatre producteurs comptent différemment les pages
 *  de Bass Aerobics (116 / 115 / 114 / 113). Lecture seule de la vraie bibliothèque. */
import { readFileSync } from "node:fs";
import { objetsPdf, pagesPdf } from "@lienotheque/formats";
import { ouvrirRenduPdf } from "@lienotheque/lecteur-texte";

const SOURCE = "/Volumes/Macbook Pro/Bibliotheque Musique/sources/ca/" +
  "ca36cf9859691679fcc7c0065461275a18d32d318e82ccb89fb2404a786be90a.pdf";

const donnees = readFileSync(SOURCE);
const objets = objetsPdf(donnees);
const pages = pagesPdf(objets);
console.log(`  [pagesPdf, lecture des octets bruts] ${pages.length} feuille(s)`);

const avecImage = pages.filter((p) => p.images.length > 0).length;
const avecCouche = pages.filter((p) => p.couchTexte).length;
console.log(`     dont portant au moins une image : ${avecImage}`);
console.log(`     dont déclarant une couche texte : ${avecCouche}`);
console.log(`     sans image NI couche            : ${pages.filter((p) => p.images.length === 0 && !p.couchTexte).length}`);

const vides = pages.map((p, i) => ({ i, p })).filter(({ p }) => p.images.length === 0);
if (vides.length) {
  console.log(`\n  feuilles SANS image (rang 0-based) :`);
  for (const { i, p } of vides.slice(0, 10))
    console.log(`     rang ${i}  numéro ${p.numero}  couche texte : ${p.couchTexte}`);
}

const rendu = await ouvrirRenduPdf(SOURCE);
console.log(`\n  [pdf.js, le rendu] ${rendu.pages} page(s)`);
await rendu.fermer?.();
