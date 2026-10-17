/** Où passent les quarante minutes de F4 : la cadence de lecture, page par page.
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx mesures/f4-cadence.ts [pages]
 *
 *  F4 — `Paul westwood.pdf`, 143 pages, 165 Mo — n'aboutit pas dans les quarante minutes que
 *  l'essai complet lui accorde. Son journal s'arrête après « 143 pages dans le document », donc
 *  **pendant la lecture des repères** et non pendant la lecture du texte.
 *
 *  On ne refait pas quarante minutes pour le savoir : `depuis` et `pages` découpent une tranche,
 *  et `avancement` parle après chaque page lue. Une poignée de pages suffit à établir la cadence,
 *  et la cadence suffit à décider.
 *
 *  **Sans cache et sans relecture** : le cache rendrait des pages déjà lues — « un lot servi par
 *  le cache ne passe pas par ici » — et la relecture ciblée est un service payant qu'une mesure
 *  de cadence n'a aucune raison d'appeler (règle du 9 octobre 2026).
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { chargerRecette, lireLot } from "@lienotheque/recettes";

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
const F4 = join(RACINE, "fixtures/fichiers/F4/Paul westwood.pdf");
const RECETTE = join(RACINE, "fixtures/recettes/methode-pastilles-cd.v4.json");
const COMBIEN = Number(process.argv[2] ?? 8);
const DEPUIS = Number(process.argv[3] ?? 0);
// Le document porte 143 feuilles ; la recette les coupe en deux, donc 286 pages.
const PAGES_DU_DOCUMENT = 286;

if (!existsSync(F4)) {
  console.log("Clichés absents : rien à mesurer.");
  process.exit(0);
}

const recette = chargerRecette(JSON.parse(await readFile(RECETTE, "utf8")));

const parPage: number[] = [];
let precedent = Date.now();
let total = 0;

const depart = Date.now();
const lues = await lireLot(F4, recette, {
  depuis: DEPUIS,
  pages: COMBIEN,
  surTotal: (combien) => {
    total = combien;
    // Le temps d'avant la première page : ouvrir un PDF de 165 Mo n'est pas gratuit, et ce coût
    // ne se répète pas. Le confondre avec la cadence fausserait toute extrapolation.
    console.log(`  ouverture du document : ${((Date.now() - depart) / 1000).toFixed(1)} s · ${combien} pages`);
    precedent = Date.now();
  },
  avancement: (faits) => {
    const maintenant = Date.now();
    parPage.push(maintenant - precedent);
    precedent = maintenant;
    // La mémoire au même instant : la cadence seule ne distingue pas un coût de contenu d'une
    // pression qui s'installe. Mesuré sur F4, les mêmes pages mettent 2 s lues seules et 10 s
    // au bout de cent quarante — ce n'est donc pas la page qui coûte.
    const rss = Math.round(process.memoryUsage().rss / 1048576);
    console.log(
      `  page ${String(faits).padStart(3)} : ${((parPage.at(-1) ?? 0) / 1000).toFixed(2)} s · ${rss} Mo`,
    );
  },
});

const trie = [...parPage].sort((un, autre) => un - autre);
const mediane = trie[Math.floor(trie.length / 2)] ?? 0;
const moyenne = parPage.reduce((somme, un) => somme + un, 0) / Math.max(1, parPage.length);

console.log(`\n  pages lues     : ${lues.length} sur ${total}`);
console.log(`  cadence        : médiane ${(mediane / 1000).toFixed(2)} s · moyenne ${(moyenne / 1000).toFixed(2)} s`);
console.log(`  extrémités     : ${((trie[0] ?? 0) / 1000).toFixed(2)} s à ${((trie.at(-1) ?? 0) / 1000).toFixed(2)} s`);
console.log(
  `  à ce rythme    : ${PAGES_DU_DOCUMENT} pages en ${((moyenne * PAGES_DU_DOCUMENT) / 60000).toFixed(0)} min ` +
    `(le garde-fou de l'essai en accorde 40)`,
);
