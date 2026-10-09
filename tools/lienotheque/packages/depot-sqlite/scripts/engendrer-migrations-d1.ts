import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASES_D1, fichiersDe, type BaseD1 } from "../src/d1.js";

/** Écrit les migrations D1 depuis les tableaux de `migrations.ts`.
 *
 *      pnpm --filter @lienotheque/depot-sqlite build
 *
 *  Les fichiers partent dans `apps/worker/migrations/<base>/`, là où Wrangler les cherchera. Un
 *  fichier qui traîne et ne correspond plus à aucune migration est retiré : un dossier engendré
 *  qui garde des restes finit par appliquer une migration que personne n'a écrite. */

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
export const DOSSIER_MIGRATIONS = join(RACINE, "apps/worker/migrations");

let ecrits = 0;
for (const base of Object.keys(BASES_D1) as BaseD1[]) {
  const dossier = join(DOSSIER_MIGRATIONS, base);
  mkdirSync(dossier, { recursive: true });

  const fichiers = fichiersDe(base);
  const attendus = new Set(fichiers.map((fichier) => fichier.nom));
  for (const present of readdirSync(dossier)) {
    if (!attendus.has(present)) {
      rmSync(join(dossier, present));
      console.log(`  retiré  ${base}/${present}`);
    }
  }

  for (const fichier of fichiers) {
    writeFileSync(join(dossier, fichier.nom), fichier.contenu);
    ecrits += 1;
  }
  console.log(`  ${base} : ${fichiers.length} migration(s)`);
}

console.log(`${ecrits} fichier(s) de migration engendré(s) dans apps/worker/migrations/`);
