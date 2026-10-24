/** Combien de documents portent deux pages par feuille, et sur combien la détection est aveugle
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx \
 *        mesures/doubles-pages-du-corpus.ts <dossier>
 *
 *  ## La question
 *
 *  `deuxPagesParFeuille` lit **la couche texte** : une feuille qui porte deux pages porte deux
 *  folios consécutifs dans sa bande de marge. C'est juste et cela ne coûte rien — mais cela
 *  suppose une couche. Un document purement numérisé n'en a pas, et la chaîne s'en remet alors à
 *  ce que la manière de lire déclare, c'est-à-dire, par défaut, **une page par feuille**.
 *
 *  Lu ainsi, un livre à deux pages par feuille mêle deux pages dans un même passage et perd ses
 *  numéros imprimés. Une citation en sort invérifiable (RCH-09) — et rien ne le signale.
 *
 *  ## Les deux signes, et pourquoi il en faut deux
 *
 *  | | |
 *  |---|---|
 *  | **les folios** | deux nombres consécutifs dans la même bande de marge — ce que la chaîne regarde déjà |
 *  | **la forme** | une feuille qui porte deux pages portrait est **plus large que haute** |
 *
 *  Le second ne demande aucun texte : il se lit sur les dimensions de la feuille. Là où la couche
 *  est muette, c'est le seul qui parle encore. Ce banc les relève tous les deux et compte les
 *  désaccords — c'est-à-dire les documents que la chaîne lit aujourd'hui sans savoir qu'ils sont
 *  doubles.
 *
 *  **Il ne fait que lire**, et ne lit que la couche : aucune reconnaissance, aucune écriture.
 */

import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { join } from "node:path";
import { deuxPagesParFeuille, lireCoucheTexte } from "@lienotheque/lecteur-texte";

const [dossier] = process.argv.slice(2);
if (dossier === undefined || !existsSync(dossier)) {
  console.error("Attendu : <dossier du corpus>");
  process.exit(2);
}

/** Au-delà, on passe : ces documents se comptent sur une main et se regardent à part. */
const PLAFOND_OCTETS = 150 * 1024 * 1024;
/** Une feuille plus large que haute d'un dixième porte vraisemblablement deux pages portrait. */
const PAYSAGE = 1.1;
/** En deçà, la couche n'a pas de quoi voir un folio : la détection y est aveugle. */
const MOTS_POUR_VOIR = 20;

async function tousLesPdf(racine: string): Promise<string[]> {
  const trouves: string[] = [];
  for (const entree of await readdir(racine, { withFileTypes: true })) {
    const chemin = join(racine, entree.name);
    if (entree.isDirectory()) trouves.push(...(await tousLesPdf(chemin)));
    else if (entree.name.toLowerCase().endsWith(".pdf")) trouves.push(chemin);
  }
  return trouves;
}

const milieu = (nombres: readonly number[]): number => {
  if (nombres.length === 0) return 0;
  const tries = [...nombres].sort((a, b) => a - b);
  return tries[Math.floor(tries.length / 2)]!;
};

const chemins = (await tousLesPdf(dossier)).sort();
console.log(`${chemins.length} PDF à relever…\n`);

let vus = 0;
let doubles = 0;
const aveugles: string[] = [];
const desaccords: string[] = [];
const ecartes: string[] = [];

for (const chemin of chemins) {
  const nom = basename(chemin).slice(0, 56);
  if ((await stat(chemin)).size > PLAFOND_OCTETS) {
    ecartes.push(`${nom} — trop lourd pour ce relevé`);
    continue;
  }
  try {
    const pages = (await lireCoucheTexte(chemin)).pages;
    if (pages.length === 0) {
      ecartes.push(`${nom} — aucune page lue`);
      continue;
    }
    vus += 1;

    const parLesFolios = deuxPagesParFeuille(pages);
    const forme = milieu(pages.map((page) => (page.hauteur === 0 ? 0 : page.largeur / page.hauteur)));
    const paysage = forme >= PAYSAGE;
    const mots = milieu(pages.map((page) => page.mots.length));
    const aveugle = mots < MOTS_POUR_VOIR;

    if (parLesFolios) {
      doubles += 1;
      // Nommés, et pas seulement comptés : un détecteur qui se déclenche sur un tiers du corpus
      // doit pouvoir être vérifié document par document, sinon on ne sait pas s'il voit juste ou
      // s'il voit partout.
      console.log(`  ⇶ ${nom} — deux folios qui se suivent · forme ${forme.toFixed(2)} · ${mots} mot(s) par page`);
    }
    // Ce que la chaîne lit aujourd'hui sans le savoir : une feuille en paysage qu'aucun folio ne
    // dénonce. Soit la couche est muette, soit elle parle et ne dit pas deux pages.
    if (paysage && !parLesFolios) {
      const ligne = `${nom} — forme ${forme.toFixed(2)} (paysage), folios : non · ${mots} mot(s) par page`;
      desaccords.push(ligne);
      console.log(`  ⚠ ${ligne}`);
    }
    if (aveugle && paysage) aveugles.push(nom);
  } catch (cause) {
    ecartes.push(`${nom} — ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

console.log(`\n  Relevés : ${vus}/${chemins.length}`);
console.log(`  Double page vue par les folios : ${doubles}`);
console.log(`  Feuilles en paysage qu'aucun folio ne dénonce : ${desaccords.length}`);
console.log(`  …dont la couche est trop maigre pour voir quoi que ce soit : ${aveugles.length}`);
if (ecartes.length > 0) {
  console.log(`\n  Écartés (${ecartes.length}) :`);
  for (const un of ecartes) console.log(`   - ${un}`);
}
