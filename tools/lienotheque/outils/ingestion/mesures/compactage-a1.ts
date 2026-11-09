/** Mesure A1 du 5 novembre : où le rang remplace la feuille. LECTURE SEULE.
 *
 *  `pagesEnGris` (outils/recettes/src/banc.ts) saute toute feuille sans image :
 *      if (page.images.length === 0) continue;
 *  et `preparerLot` n'incrémente son `index` que pour les feuilles ÉMISES.
 *  Une feuille sautée décale donc toutes les suivantes. */
import { readFileSync } from "node:fs";
import { objetsPdf, pagesPdf } from "@lienotheque/formats";

const SOURCE = "/Volumes/Macbook Pro/Bibliotheque Musique/sources/ca/" +
  "ca36cf9859691679fcc7c0065461275a18d32d318e82ccb89fb2404a786be90a.pdf";
const pages = pagesPdf(objetsPdf(readFileSync(SOURCE)));
const sansImage = pages.map((p, i) => ({ i, p })).filter(({ p }) => p.images.length === 0);

console.log(`  feuilles du PDF                    : ${pages.length}`);
console.log(`  feuilles SANS image (sautées)      : ${sansImage.length}`);
for (const { i, p } of sansImage)
  console.log(`     rang 0-based ${i} (feuille ${i + 1}) · ${p.images.length} image · couche texte ${p.couchTexte}`);
console.log(`  feuilles ÉMISES par pagesEnGris    : ${pages.length - sansImage.length}`);
console.log(`  → index attribués                  : 0 à ${pages.length - sansImage.length - 1}, CONTIGUS`);
console.log();
console.log("  ── correspondance index → feuille réelle ──");
let index = 0;
const table: { index: number; feuille: number }[] = [];
pages.forEach((p, rang) => {
  if (p.images.length === 0) return;      // le `continue` de pagesEnGris
  table.push({ index, feuille: rang + 1 });
  index += 1;
});
for (const cible of [0, 1, 2, 13, 114]) {
  const e = table[cible];
  if (e) console.log(`     index ${String(e.index).padStart(3)} → feuille ${String(e.feuille).padStart(3)}` +
    `   (un consommateur qui lit page-${String(e.index).padStart(4, "0")}.webp ouvre la feuille ${e.index + 1})` +
    `${e.feuille !== e.index + 1 ? `   ÉCART ${e.feuille - e.index - 1}` : ""}`);
}
