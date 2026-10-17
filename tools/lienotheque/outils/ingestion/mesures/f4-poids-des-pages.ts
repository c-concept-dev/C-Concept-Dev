/** Le poids de l'image de chaque page de F4, pour croiser avec la cadence de lecture.
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx mesures/f4-poids-des-pages.ts
 *
 *  La lecture de F4 met cinquante-sept minutes, et sa moyenne par page — 11,83 s — vaut quatre
 *  fois sa médiane — 4,99 s. Une minorité de pages coûte donc l'essentiel du temps, l'une
 *  d'elles cent quatorze secondes à elle seule.
 *
 *  Reste à savoir **ce qui** les distingue. Le premier soupçon est le poids : une image deux
 *  fois plus large coûte quatre fois plus à redresser et à océriser. Ce relevé le dit, et se
 *  croise avec les temps page par page.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
const F4 = join(RACINE, "fixtures/fichiers/F4/Paul westwood.pdf");

if (!existsSync(F4)) {
  console.log("Clichés absents : rien à mesurer.");
  process.exit(0);
}

const objets = objetsPdf(Buffer.from(await readFile(F4)));
const pages = pagesPdf(objets);

const poids: { feuille: number; ko: number; extension: string }[] = [];
pages.forEach((page, rang) => {
  const premiere = page.images[0];
  if (premiere === undefined) return;
  const image = octetsImage(objets, premiere.numero);
  if (image === undefined) return;
  poids.push({ feuille: rang + 1, ko: Math.round(image.octets.length / 1024), extension: image.extension });
});

const tries = [...poids].sort((un, autre) => autre.ko - un.ko);
const total = poids.reduce((somme, un) => somme + un.ko, 0);
const median = [...poids].sort((un, autre) => un.ko - autre.ko)[Math.floor(poids.length / 2)]?.ko ?? 0;

console.log(`  feuilles avec image : ${poids.length} sur ${pages.length}`);
console.log(`  poids total         : ${(total / 1024).toFixed(0)} Mo`);
console.log(`  médiane             : ${median} Ko`);
console.log(`  formats             : ${[...new Set(poids.map((un) => un.extension))].join(", ")}`);
console.log(`\n  les quinze plus lourdes :`);
for (const un of tries.slice(0, 15))
  console.log(`    feuille ${String(un.feuille).padStart(3)} · ${String(un.ko).padStart(6)} Ko · ${un.extension}`);

// Les données à côté du tableau : un relevé tronqué relu de travers a déjà coûté une demi-journée
// à ce lot.
console.log(`\n__JSON__${JSON.stringify(poids)}`);
