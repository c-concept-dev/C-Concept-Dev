/** De quoi les pages d'un corpus sont faites, et combien n'ont rien de lisible (BAS-02)
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx mesures/images-du-corpus.ts <dossier>
 *
 *  ## La question
 *
 *  Un document du corpus a été refusé en entier : « aucune de ses 6 pages n'a pu être lue, ni par
 *  sa couche texte ni par reconnaissance ». Le refus est honnête, mais il laisse une question qui
 *  décide d'un réimport de dix heures : **est-ce un cas isolé, ou une famille ?**
 *
 *  ## Ce qu'une page doit porter pour être lue
 *
 *  Deux chemins, et il en faut un :
 *
 *  | | |
 *  |---|---|
 *  | une **police** déclarée | il y a une couche texte à lire |
 *  | une **image exploitable** | `DCTDecode` qu'`octetsImage` rend en JPEG, ou des bandes à 1 bit que `rasterBilevel` empile |
 *
 *  Une page sans police **et** sans image d'une de ces deux formes n'a rien à offrir à la chaîne.
 *  C'est le cas de celle qui a été refusée : ses images sont des rasters `FlateDecode` à 8 bits,
 *  que ni l'un ni l'autre ne sait prendre.
 *
 *  ## Ce que ce banc ne fait pas
 *
 *  Il ne lit pas le texte : il regarde **de quoi les pages sont faites**, ce qui est cent fois
 *  plus rapide et suffit à poser la question. Une page qui porte une police peut tout de même
 *  avoir une couche illisible — cela, seul le traitement le dit. Le chiffre rendu ici est donc
 *  un **plancher du risque**, jamais un pronostic.
 *
 *  Il ne lit que des documents sous un plafond de poids : un PDF converti en chaîne de caractères
 *  pèse le double de ses octets, et les plafonds du projet existent pour que personne n'y laisse
 *  sa machine. Les documents écartés sont nommés.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { objetsPdf, pagesPdf } from "@lienotheque/formats";

const [dossier] = process.argv.slice(2);
if (dossier === undefined || !existsSync(dossier)) {
  console.error("Attendu : <dossier du corpus>");
  process.exit(2);
}

/** Au-delà, on ne sonde pas : la conversion en chaîne doublerait déjà ces octets en mémoire. */
const PLAFOND_OCTETS = 150 * 1024 * 1024;

async function tousLesPdf(racine: string): Promise<string[]> {
  const trouves: string[] = [];
  for (const entree of await readdir(racine, { withFileTypes: true })) {
    const chemin = join(racine, entree.name);
    if (entree.isDirectory()) trouves.push(...(await tousLesPdf(chemin)));
    else if (entree.name.toLowerCase().endsWith(".pdf")) trouves.push(chemin);
  }
  return trouves;
}

const chemins = (await tousLesPdf(dossier)).sort();
console.log(`${chemins.length} PDF à sonder…\n`);

let documentsSains = 0;
const aRisque: { nom: string; pages: number; muettes: number; formes: string }[] = [];
const ecartes: string[] = [];
let pagesVues = 0;
let pagesMuettes = 0;

for (const chemin of chemins) {
  const nom = basename(chemin).slice(0, 56);
  const taille = (await stat(chemin)).size;
  if (taille > PLAFOND_OCTETS) {
    ecartes.push(`${nom} (${(taille / 1048576).toFixed(0)} Mo)`);
    continue;
  }
  try {
    const objets = objetsPdf(await readFile(chemin));
    const pages = pagesPdf(objets);
    if (pages.length === 0) {
      ecartes.push(`${nom} — aucune page reconnue par ce lecteur`);
      continue;
    }

    const formes = new Map<string, number>();
    let muettes = 0;
    for (const page of pages) {
      // Ce que la chaîne saurait en tirer, et rien d'autre.
      const exploitable = page.images.some((image) => image.filtre === "DCTDecode" || image.bits === 1);
      for (const image of page.images) formes.set(`${image.filtre}/${image.bits}b`, (formes.get(`${image.filtre}/${image.bits}b`) ?? 0) + 1);
      if (!page.couchTexte && !exploitable) muettes += 1;
    }

    pagesVues += pages.length;
    pagesMuettes += muettes;
    if (muettes === 0) documentsSains += 1;
    else {
      const resume = [...formes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([forme, combien]) => `${forme}×${combien}`);
      aRisque.push({ nom, pages: pages.length, muettes, formes: resume.join(" ") || "aucune image" });
      console.log(`  ⚠ ${nom} — ${muettes}/${pages.length} page(s) sans police ni image exploitable · ${resume.join(" ") || "aucune image"}`);
    }
  } catch (cause) {
    ecartes.push(`${nom} — ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

const sondes = documentsSains + aRisque.length;
console.log(`\n  Sondés : ${sondes}/${chemins.length} · sains : ${documentsSains} · à risque : ${aRisque.length}`);
console.log(`  Pages vues : ${pagesVues} · pages sans rien à lire : ${pagesMuettes}`);
const toutes = aRisque.filter((un) => un.muettes === un.pages);
console.log(`  Documents dont **toutes** les pages sont muettes : ${toutes.length}`);
if (ecartes.length > 0) {
  console.log(`\n  Écartés (${ecartes.length}) :`);
  for (const un of ecartes) console.log(`   - ${un}`);
}
