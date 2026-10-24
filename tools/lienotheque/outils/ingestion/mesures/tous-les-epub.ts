/** Tous les EPUB d'un corpus, lus et vérifiés un par un (BAS-02)
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx mesures/tous-les-epub.ts <dossier>
 *
 *  Un seul EPUB avait été traversé de bout en bout. La composition annoncée des bibliothèques
 *  étant d'environ moitié EPUB, un sur dix-huit ne dit pas grand-chose : ce banc les prend tous.
 *
 *  Pour chacun : combien de feuillets, quelle langue l'archive **déclare** (c'est elle qui vaut,
 *  pas celle de la bibliothèque), si les chapitres sont nommés, et surtout — la vérification qui
 *  compte — une phrase prise au milieu est cherchée une seconde fois dans les chapitres relus
 *  depuis l'archive. Si les deux lectures s'accordent sur le feuillet, la citation est vérifiable.
 *
 *  **Il ne fait que lire.** Aucune œuvre n'entre au dépôt (règle 5), rien n'est écrit.
 */

import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { enPassages, lireEpub } from "@lienotheque/lecteur-texte";
import { lireLeTexte } from "../src/texte.js";

const [dossier] = process.argv.slice(2);
if (dossier === undefined || !existsSync(dossier)) {
  console.error("Attendu : <dossier du corpus>");
  process.exit(2);
}

async function tousLesEpub(racine: string): Promise<string[]> {
  const trouves: string[] = [];
  for (const entree of await readdir(racine, { withFileTypes: true })) {
    const chemin = join(racine, entree.name);
    if (entree.isDirectory()) trouves.push(...(await tousLesEpub(chemin)));
    else if (entree.name.toLowerCase().endsWith(".epub")) trouves.push(chemin);
  }
  return trouves;
}

const epubs = (await tousLesEpub(dossier)).sort();
console.log(`${epubs.length} EPUB à lire…\n`);

let lus = 0;
let verifies = 0;
const peines: string[] = [];

for (const chemin of epubs) {
  const nom = basename(chemin).slice(0, 52);
  try {
    const depart = Date.now();
    const lu = await lireLeTexte(chemin);
    const passages = enPassages(lu.pages);
    const livre = await lireEpub(chemin);
    const secondes = ((Date.now() - depart) / 1000).toFixed(1);
    if (passages.length === 0) {
      peines.push(`${nom} — aucun feuillet`);
      console.log(`  ✗ ${nom} — aucun feuillet`);
      continue;
    }
    lus += 1;

    const avecChapitre = passages.filter((p) => p.emplacement !== undefined).length;

    // Une phrase contiguë prise au milieu, cherchée dans les chapitres relus depuis l'archive.
    const auMilieu = passages[Math.floor(passages.length / 2)]!;
    const mots = auMilieu.texte.split(/\s+/).filter((mot) => mot !== "");
    const debut = mots.findIndex((mot, rang) => rang > mots.length / 3 && /^[\p{L}]{6,}$/u.test(mot));
    const phrase = debut < 0 ? "" : mots.slice(debut, debut + 5).join(" ");
    const porteurs = phrase === "" ? [] : livre.feuillets.filter((f) => f.texte.includes(phrase)).map((f) => f.rang);
    const juste = porteurs.includes(auMilieu.page);
    if (juste) verifies += 1;
    else peines.push(`${nom} — citation non vérifiée (feuillet ${auMilieu.page}, porteurs ${porteurs.join(", ") || "aucun"})`);

    console.log(
      `  ${juste ? "✓" : "✗"} ${nom}` +
        ` — ${passages.length} feuillets, langue « ${livre.langue ?? "non déclarée"} »,` +
        ` ${avecChapitre}/${passages.length} avec chapitre, ${secondes} s`,
    );
  } catch (cause) {
    const texte = cause instanceof Error ? cause.message : String(cause);
    peines.push(`${nom} — ${texte}`);
    console.log(`  ✗ ${nom} — ${texte}`);
  }
}

console.log(`\n  lus : ${lus}/${epubs.length} · citation vérifiée : ${verifies}/${epubs.length}`);
if (peines.length > 0) {
  console.log("\n  Ce qui a peiné :");
  for (const peine of peines) console.log(`   - ${peine}`);
  process.exitCode = 1;
}
