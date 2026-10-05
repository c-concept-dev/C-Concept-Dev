/** Exporte les clichés d'un lot, tels quels, pour les prototypes de référence.
 *
 *  Sans réencodage ni réduction : les prototypes lisent des pastilles de quelques dizaines de
 *  pixels, et toute perte fausserait la comparaison. Les images vont à la zone tampon — elles
 *  viennent d'un original sous droits.
 *
 *     pnpm --filter @lienotheque/recettes exec tsx mesures/exporter-cliches.ts <premier> <dernier>
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";
import { objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";

const RACINE = join(import.meta.dirname, "../../..");
const F4 = join(RACINE, "fixtures/fichiers/F4/Paul westwood.pdf");
if (!existsSync(F4)) {
  console.log("Clichés absents : rien à exporter.");
  process.exit(0);
}

const premier = Number(process.argv[2] ?? 33);
const dernier = Number(process.argv[3] ?? 46);

const dossier = join(coin(ouvrirCache({ avertir: (message) => console.warn(message) }), "prototype"), "cliches");
mkdirSync(dossier, { recursive: true });

const objets = objetsPdf(await readFile(F4));
const pages = pagesPdf(objets);
let ecrits = 0;

for (const [index, page] of pages.entries()) {
  if (index < premier || index > dernier) continue;
  const image = page.images[0];
  if (image === undefined) continue;
  const octets = octetsImage(objets, image.numero);
  if (octets === undefined) continue;
  writeFileSync(join(dossier, `cliche-${String(index).padStart(4, "0")}.${octets.extension}`), octets.octets);
  ecrits += 1;
}

console.log(`${ecrits} clichés exportés dans ${dossier}`);
