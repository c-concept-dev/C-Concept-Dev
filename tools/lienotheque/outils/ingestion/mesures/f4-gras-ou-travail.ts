/** La lecture lente de F4 trouve-t-elle plus que la rapide ? (réserve 9.1, la mesure qui tranche)
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx mesures/f4-gras-ou-travail.ts [court] [long] [depuis]
 *
 *  ## La question, et pourquoi c'est la seule qui compte ici
 *
 *  F4 lit deux secondes par page quand on lui demande moins de neuf feuilles, et quinze secondes
 *  au-delà. Le seuil est celui du vote d'orientation : un cliché sur huit est échantillonné, donc
 *  un seul en deçà de neuf feuilles, et un seul vote rend **0°** là où deux rendent **270°**.
 *
 *  Il était tentant d'en conclure qu'on a trouvé du gras à retirer. **Mesuré, c'est faux pour la
 *  cause avancée** : tourner une image de 4,3 mégapixels coûte 0,04 s, et tout `redresser` pèse
 *  un sixième de seconde, à 0° comme à 270°. Le coût est en aval, dans la lecture des repères,
 *  qui reçoit des pages d'une autre forme.
 *
 *  D'où la vraie question, et elle ne se répond pas en chronométrant : **si 270° est la bonne
 *  orientation, la lecture lente est celle qui travaille**, et la rapide cherchait des repères
 *  sur des pages couchées, où il n'y a rien à trouver. Il n'y aurait alors rien à économiser.
 *
 *  ## Ce que ce banc compare
 *
 *  Les **mêmes feuilles**, lues deux fois : une fois dans un lot court, une fois dans un lot
 *  long. On ne compare que la partie commune — les premières feuilles — et l'on compte ce qui est
 *  **trouvé**, pas ce qui est dépensé :
 *
 *  | relevé | ce qu'il dit |
 *  |---|---|
 *  | éléments repérés par page | si la lecture rapide trouve autant |
 *  | numéros de page lus | si elle sait seulement où elle est |
 *  | pages muettes | si elle rend des pages vides |
 *
 *  **Il ne corrige rien.** Il départage « il y a du gras » de « la lecture lente fait le travail
 *  nécessaire », et c'est tout ce qu'on lui demande.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import type { PageLueBrute } from "@lienotheque/contrats";
import { chargerRecette, lireLot } from "@lienotheque/recettes";

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
const F4 = join(RACINE, "fixtures/fichiers/F4/Paul westwood.pdf");
const RECETTE = join(RACINE, "fixtures/recettes/methode-pastilles-cd.v4.json");
const COURT = Number(process.argv[2] ?? 4);
const LONG = Number(process.argv[3] ?? 12);
const DEPUIS = Number(process.argv[4] ?? 100);

if (!existsSync(F4)) {
  console.log("Clichés absents : rien à mesurer.");
  process.exit(0);
}

const recette = chargerRecette(JSON.parse(await readFile(RECETTE, "utf8")));

/** Une lecture, et ce qu'elle a trouvé. Le temps est relevé, mais il ne décide de rien ici. */
async function lire(feuilles: number): Promise<{ pages: readonly PageLueBrute[]; secondes: number }> {
  const depart = Date.now();
  const pages = (await lireLot(F4, recette, { depuis: DEPUIS, pages: feuilles })) as unknown as readonly PageLueBrute[];
  return { pages, secondes: (Date.now() - depart) / 1000 };
}

process.stderr.write(`lot court : ${COURT} feuilles depuis la ${DEPUIS}e…\n`);
const court = await lire(COURT);
process.stderr.write(`lot long : ${LONG} feuilles depuis la ${DEPUIS}e…\n`);
const long = await lire(LONG);

/** La partie commune : les pages que les deux lectures ont vues. Comparer au-delà serait
 *  comparer des feuilles différentes, ce qui est exactement le piège de la mesure précédente. */
const communes = Math.min(court.pages.length, long.pages.length);

const compter = (pages: readonly PageLueBrute[]) => {
  const retenues = pages.slice(0, communes);
  return {
    elements: retenues.reduce((somme, page) => somme + page.elements.length, 0),
    muettes: retenues.filter((page) => page.elements.length === 0).length,
    numeros: retenues.filter((page) => page.pageLue !== undefined).length,
  };
};

const a = compter(court.pages);
const b = compter(long.pages);

console.log(`\n  ${communes} pages comparées, lues deux fois.\n`);
console.log("| lecture | feuilles | durée | éléments trouvés | pages muettes | numéros lus |");
console.log("|---|---:|---:|---:|---:|---:|");
console.log(`| courte | ${COURT} | ${court.secondes.toFixed(0)} s | **${a.elements}** | ${a.muettes} | ${a.numeros} |`);
console.log(`| longue | ${LONG} | ${long.secondes.toFixed(0)} s | **${b.elements}** | ${b.muettes} | ${b.numeros} |`);

console.log("\n  page │ courte │ longue");
console.log("  ─────┼────────┼───────");
for (let rang = 0; rang < communes; rang += 1)
  console.log(
    `  ${String(rang + 1).padStart(4)} │ ${String(court.pages[rang]?.elements.length ?? 0).padStart(6)} │ ` +
      `${String(long.pages[rang]?.elements.length ?? 0).padStart(6)}`,
  );

const verdict =
  a.elements === 0 && b.elements > 0
    ? "La lecture rapide ne trouve RIEN : elle était rapide parce qu'elle ne travaillait pas. Aucun gras à retirer."
    : a.elements >= b.elements
      ? "La lecture rapide trouve autant : le surcoût de la lecture longue est du gras."
      : `La lecture rapide trouve ${((a.elements / Math.max(1, b.elements)) * 100).toFixed(0)} % de ce que trouve la longue : le surcoût achète quelque chose, et il reste à dire si le prix est juste.`;
console.log(`\n  ${verdict}`);
