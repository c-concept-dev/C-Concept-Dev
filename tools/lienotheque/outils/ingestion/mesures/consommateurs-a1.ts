/** Mesure A1 du 5 novembre : un consommateur ouvre-t-il la bonne feuille ? LECTURE SEULE.
 *
 *  `instantane.ts:345` sert l'image par `page.index` — compacté par `pagesEnGris`
 *  (`banc.ts:464`, les feuilles sans image sont sautées). Les images, elles, sont nommées
 *  par la feuille. On compare donc, pour un document de Studio Clinique, l'index attribué
 *  à chaque page émise et la feuille réelle d'où elle vient. */
import { readFileSync } from "node:fs";
import { objetsPdf, pagesPdf } from "@lienotheque/formats";

const SOURCE = process.argv[2]!;
const pages = pagesPdf(objetsPdf(readFileSync(SOURCE)));
const avecImage = pages.map((p, rang) => ({ rang, p })).filter(({ p }) => p.images.length > 0);

console.log(`  feuilles du PDF            : ${pages.length}`);
console.log(`  feuilles AVEC image        : ${avecImage.length}   (émises par pagesEnGris)`);
console.log(`  feuilles SANS image        : ${pages.length - avecImage.length}   (sautées)`);
console.log();
console.log("  ── index attribué → feuille réelle ──");
console.log(`  ${"index".padStart(6)} ${"feuille".padStart(8)} ${"image ouverte".padStart(14)}  écart`);
avecImage.slice(0, 8).forEach(({ rang }, index) => {
  const ouverte = index + 1;            // page-{index}.webp = feuille index+1
  const reelle = rang + 1;
  console.log(`  ${String(index).padStart(6)} ${String(reelle).padStart(8)} ${String(ouverte).padStart(14)}  ` +
    (reelle === ouverte ? "—" : `DÉCALÉ de ${reelle - ouverte}`));
});
if (avecImage.length > 8) {
  const { rang } = avecImage[avecImage.length - 1]!;
  const index = avecImage.length - 1;
  console.log(`  ${"…".padStart(6)}`);
  console.log(`  ${String(index).padStart(6)} ${String(rang + 1).padStart(8)} ${String(index + 1).padStart(14)}  ` +
    (rang + 1 === index + 1 ? "—" : `DÉCALÉ de ${rang - index}`));
}
