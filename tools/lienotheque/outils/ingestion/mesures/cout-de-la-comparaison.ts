/** Ce que coûte **comparer** une couche texte à l'OCR de la même page (BAS-02, étape 0)
 *
 *     pnpm --filter @lienotheque/ingestion exec tsx \
 *       mesures/cout-de-la-comparaison.ts <document.pdf> [pages] [langue]
 *
 *  ## Pourquoi cette mesure vient avant l'échantillon
 *
 *  Deux chiffres du dépôt se contredisent d'un facteur cinquante. `couche-saine.ts` dit que
 *  « comparer à l'OCR coûtait **une minute par page** » ; `lot-e2-texte-plan.md` estime 3 650
 *  pages d'OCR en **une à deux heures**, soit une à deux secondes. L'un des deux est faux, ou
 *  ils ne mesurent pas la même chose — et dimensionner un échantillon de 240 pages sur le
 *  mauvais vaudrait soit quatre heures d'attente, soit une mesure qu'on n'ose pas lancer.
 *
 *  C'est la leçon de F4 : l'extrapolation annonçait onze minutes, la mesure en a donné
 *  cinquante-sept.
 *
 *  ## Trois coûts, et non un
 *
 *  Un « coût par page » n'existe pas ici, parce que la lecture n'est pas linéaire :
 *
 *  | coût | ce qui le paie | payé combien de fois |
 *  |---|---|---|
 *  | **ouvrir** | `readFile` puis `objetsPdf`, qui monte la table de tous les objets | une fois par document |
 *  | **la couche** | `lireCoucheTexte`, qui parcourt **toutes** les pages, même si l'on n'en veut que dix | une fois par document |
 *  | **l'OCR** | Tesseract sur l'image d'une page | une fois par page tirée |
 *
 *  Les deux premiers sont fixes : tirer dix pages d'un document les paie entiers. Sur vingt-quatre
 *  documents, ils peuvent dominer l'OCR — ou être négligeables. On ne le sait pas avant.
 *
 *  **Il ne fait que lire.** Rien n'est écrit, renommé ni déplacé dans le dossier des ouvrages.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { objetsPdf, pagesPdf } from "@lienotheque/formats";
import { lireCoucheTexte } from "@lienotheque/lecteur-texte";
import { lireLeTexte } from "../src/texte.js";

const [chemin, combien = "5", langue = "fra"] = process.argv.slice(2);
if (chemin === undefined) {
  console.error("Attendu : <document.pdf> [pages] [langue]");
  process.exit(2);
}
const pages = Number.parseInt(combien, 10);

/** Chronomètre une promesse, et rend les deux : la valeur et le temps. */
async function chronometrer<T>(travail: () => Promise<T>): Promise<{ valeur: T; secondes: number }> {
  const debut = performance.now();
  const valeur = await travail();
  return { valeur, secondes: (performance.now() - debut) / 1000 };
}

const memoire = (): number => Math.round(process.memoryUsage().rss / (1024 * 1024));

console.log(`Document : ${basename(chemin)}`);
console.log(`Pages tirées : ${pages}, langue de l'OCR : ${langue}\n`);

// 1. Ouvrir : lire les octets, puis monter la table des objets.
const lecture = await chronometrer(async () => Buffer.from(await readFile(chemin)));
const poids = lecture.valeur.length / (1024 * 1024);
const analyse = await chronometrer(async () => objetsPdf(lecture.valeur));
const nombreDePages = pagesPdf(analyse.valeur).length;
const ouvrir = lecture.secondes + analyse.secondes;

console.log(`poids                     ${poids.toFixed(1)} Mo, ${nombreDePages} pages`);
console.log(`ouvrir (octets + objets)  ${ouvrir.toFixed(2)} s   — fixe par document`);
console.log(`  mémoire après           ${memoire()} Mo`);

// 2. La couche, document entier : c'est ce que `lireLeTexte` paie, quel que soit le nombre de
//    pages demandé.
const couche = await chronometrer(async () => lireCoucheTexte(chemin));
const pagesDeLaCouche = couche.valeur.pages.length;
console.log(`couche (document entier)  ${couche.secondes.toFixed(2)} s   — fixe par document, ${pagesDeLaCouche} pages`);
console.log(`  mémoire après           ${memoire()} Mo`);

// 3. L'OCR des pages tirées, seul. `forcerOcr` saute la couche : ce temps-ci ne paie que
//    l'ouverture plus l'OCR, et l'on retranche l'ouverture déjà mesurée.
const forceOcr = await chronometrer(async () => lireLeTexte(chemin, { pages, forcerOcr: true, langue }));
const ocrSeul = Math.max(0, forceOcr.secondes - ouvrir);
console.log(`\nOCR de ${pages} pages           ${forceOcr.secondes.toFixed(2)} s dont ${ocrSeul.toFixed(2)} s d'OCR`);
console.log(`  soit par page           ${(ocrSeul / pages).toFixed(2)} s`);
console.log(`  pages rendues par l'OCR ${forceOcr.valeur.parOcr}, sans texte ${forceOcr.valeur.sansTexte}`);
console.log(`  mémoire après           ${memoire()} Mo`);

// 4. Ce que la chaîne fait vraiment, pour situer : couche d'abord, OCR seulement si elle cède.
const normal = await chronometrer(async () => lireLeTexte(chemin, { pages, langue }));
console.log(`\nla chaîne, telle quelle   ${normal.secondes.toFixed(2)} s`);
console.log(`  par la couche           ${normal.valeur.parLaCouche}`);
console.log(`  par l'OCR               ${normal.valeur.parOcr}`);
console.log(`  sans texte              ${normal.valeur.sansTexte}`);

// 5. Ce que coûterait l'échantillon proposé, sur ce document-ci.
const parDocument = ouvrir + couche.secondes;
const dixPages = parDocument + (ocrSeul / pages) * 10;
console.log(`\nSi ce document était représentatif :`);
console.log(`  fixe par document       ${parDocument.toFixed(1)} s`);
console.log(`  dix pages comparées     ${dixPages.toFixed(1)} s`);
console.log(`  vingt-quatre documents  ${((dixPages * 24) / 60).toFixed(0)} min`);
