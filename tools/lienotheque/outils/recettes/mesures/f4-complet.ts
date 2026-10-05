/** Mesure complète de F4 : le critère d'A5 (OUT-03, A5).
 *
 *  83 premiers éléments sur 92 et 89 pages sur 92. L'oracle est
 *  `docs/prototypes/Westwood_Vol1_CD1_pistes.csv`, qui dit pour chaque piste quel élément la
 *  commence et sur quelle page. On lit le lot entier, on interprète, et on compare.
 *
 *     pnpm --filter @lienotheque/recettes exec tsx mesures/f4-complet.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";
import { chargerRecette, interpreter, lireLot } from "../src/index.js";

const RACINE = join(import.meta.dirname, "../../..");
const F4 = join(RACINE, "fixtures/fichiers/F4/Paul westwood.pdf");
const ORACLE = join(RACINE, "docs/prototypes/Westwood_Vol1_CD1_pistes.csv");
const RECETTE = chargerRecette(JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-pastilles-cd.v4.json"), "utf8")));

if (!existsSync(F4) || !existsSync(ORACLE)) {
  console.log("Clichés ou oracle absents : rien à mesurer ici.");
  process.exit(0);
}

type Attendu = { piste: number; premier: number; page: number };
const attendus: Attendu[] = [];
for (const ligne of readFileSync(ORACLE, "utf8").split("\n").slice(1)) {
  const champs = ligne.split(",");
  if (champs.length < 7) continue;
  const piste = Number(champs[0]);
  const premier = Number(champs[4]);
  const page = Number(champs[6]);
  if (!Number.isFinite(piste) || !Number.isFinite(premier) || !Number.isFinite(page)) continue;
  attendus.push({ piste, premier, page });
}
console.log(`Oracle : ${attendus.length} pistes`);

const cache = coin(ouvrirCache({ avertir: (message) => console.warn(message) }), "lectures");
const debut = Date.now();
const lues = await lireLot(F4, RECETTE, { cache });
console.log(`Lecture : ${lues.length} pages en ${Math.round((Date.now() - debut) / 1000)} s`);

const resultat = interpreter(lues, RECETTE, { nombreDePistes: attendus.length });
console.log(`Interprétation : ${resultat.lignes.length} lignes`);

const parPiste = new Map<number, { premier: number; page: number }>();
for (const ligne of resultat.lignes) {
  if (ligne.piste === undefined) continue;
  const vu = parPiste.get(ligne.piste);
  if (vu === undefined || ligne.numero < vu.premier) parPiste.set(ligne.piste, { premier: ligne.numero, page: ligne.pageImprimee });
}

let premiersJustes = 0;
let pagesJustes = 0;
const ecarts: string[] = [];
for (const attendu of attendus) {
  const trouve = parPiste.get(attendu.piste);
  if (trouve === undefined) {
    ecarts.push(`piste ${attendu.piste} : rien attribué (attendu élément ${attendu.premier}, page ${attendu.page})`);
    continue;
  }
  if (trouve.premier === attendu.premier) premiersJustes += 1;
  if (trouve.page === attendu.page) pagesJustes += 1;
  if (trouve.premier !== attendu.premier || trouve.page !== attendu.page)
    ecarts.push(`piste ${attendu.piste} : élément ${trouve.premier} page ${trouve.page} — attendu ${attendu.premier} page ${attendu.page}`);
}

const total = attendus.length;
console.log(`\nPremiers éléments justes : ${premiersJustes} / ${total}  (critère : 83)`);
console.log(`Pages justes            : ${pagesJustes} / ${total}  (critère : 89)`);
console.log(`Critère tenu : ${premiersJustes >= 83 && pagesJustes >= 89 ? "OUI" : "NON"}`);

console.log(`\n${ecarts.length} écarts :`);
for (const ecart of ecarts.slice(0, 40)) console.log(`  ${ecart}`);
if (ecarts.length > 40) console.log(`  … et ${ecarts.length - 40} autres`);

const sortie = join(coin(ouvrirCache({ avertir: () => {} }), "vision"), "f4-complet.json");
writeFileSync(sortie, JSON.stringify({ premiersJustes, pagesJustes, total, ecarts }, null, 1));
console.log(`\nDétail : ${sortie}`);
