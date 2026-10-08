/** Tire les cinq maquettes en PNG 1600 x 1000 (OUT-00, charte v3).
 *
 *     pnpm build                                              # produit la feuille des jetons
 *     pnpm --filter @lienotheque/app exec node ../../docs/maquettes/tirer.mjs
 *
 *  Playwright n'est installé que dans `apps/app` : on le résout depuis le dossier d'exécution,
 *  et non depuis celui de ce fichier, qui n'a pas de `node_modules` au-dessus de lui.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ICI, "png");
const JETONS = join(ICI, "../../packages/jetons/dist/lienotheque.css");

if (!existsSync(JETONS)) {
  console.error("Feuille des jetons absente : lancez `pnpm build` d'abord.");
  process.exit(2);
}
mkdirSync(SORTIE, { recursive: true });

const exiger = createRequire(join(process.cwd(), "resolution.cjs"));
const { chromium } = exiger("@playwright/test");

/** Un écran, un fichier. Le nom dit l'ordre et le sujet, jamais le numéro seul. */
const NOMS = {
  "ecran-1": "1-creer-une-bibliotheque",
  "ecran-2": "2-organisation",
  "ecran-3": "3-depot-et-traitement",
  "ecran-4": "4-maniere-de-lire",
  "ecran-5": "5-recherche",
};

const navigateur = await chromium.launch();
// Tiré au double pour que le texte de 13 px reste net une fois la maquette agrandie à l'écran.
const page = await navigateur.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(`file://${join(ICI, "maquettes.html")}`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);

for (const [id, nom] of Object.entries(NOMS)) {
  const section = page.locator(`#${id}`);
  const boite = await section.boundingBox();
  if (boite === null) throw new Error(`section ${id} introuvable`);
  // Une maquette qui ne fait pas sa taille n'est pas une maquette : on refuse plutôt que de
  // livrer une image hors format.
  if (Math.round(boite.width) !== 1600 || Math.round(boite.height) !== 1000)
    throw new Error(`${nom} : ${Math.round(boite.width)} x ${Math.round(boite.height)}, attendu 1600 x 1000`);
  await section.screenshot({ path: join(SORTIE, `${nom}.png`) });
  console.log(`${nom}.png — 1600 x 1000, tiré au double`);
}

await navigateur.close();
