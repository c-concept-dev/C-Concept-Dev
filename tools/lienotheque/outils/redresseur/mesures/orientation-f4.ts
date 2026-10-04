/** Mesure : quelle orientation le redresseur retient, et d'où elle vient (OUT-03).
 *
 *     pnpm --filter @lienotheque/redresseur exec tsx mesures/orientation-f4.ts [premier] [dernier]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ReglagesRedressement } from "@lienotheque/contrats";
import { pagesEnGris, chargerRecette } from "@lienotheque/recettes";
import { detecterRotation, noterLesQuatreSens, rotationParOsd, redresser } from "../src/index.js";

const RACINE = join(import.meta.dirname, "../../..");
const F4 = join(RACINE, "fixtures/fichiers/F4/Paul westwood.pdf");
const RECETTE = chargerRecette(JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-pastilles-cd.v4.json"), "utf8")));

if (!existsSync(F4)) {
  console.log("Clichés absents : rien à mesurer ici.");
  process.exit(0);
}

const premier = Number(process.argv[2] ?? 33);
const dernier = Number(process.argv[3] ?? 46);

const reglages = ReglagesRedressement.parse({
  rotation: RECETTE.preparation.redressement,
  doublePage: RECETTE.preparation.double_page,
  ...(RECETTE.preparation.page_gauche === undefined ? {} : { pageGauche: RECETTE.preparation.page_gauche }),
  effacerVerso: true,
  binarisation: "aucune",
});

console.log("cliché   taille source      lecture   osd    retenue  source      notes des quatre sens");
let index = -1;
const comptes = new Map<string, number>();

for await (const image of pagesEnGris(F4, dernier + 1)) {
  index += 1;
  if (index < premier) continue;

  const notes = noterLesQuatreSens(image);
  const osd = rotationParOsd(image);
  const trouvee = detecterRotation(image);
  void redresser(image, index, reglages);
  const clef = `${trouvee.rotation}° (${trouvee.source})`;
  comptes.set(clef, (comptes.get(clef) ?? 0) + 1);

  console.log(
    `${String(index).padStart(6)}  ${String(image.largeur).padStart(4)}×${String(image.hauteur).padEnd(4)}  ` +
      `${String(notes[0]?.rotation ?? "—").padStart(5)}°  ${String(osd ?? "—").padStart(4)}°  ` +
      `${String(trouvee.rotation).padStart(6)}°  ${trouvee.source.padEnd(10)}  ` +
      notes.map((n) => `${n.rotation}°:${Math.round(n.note)}`).join("  "),
  );
}

console.log("\nRépartition :");
for (const [clef, nombre] of [...comptes].sort((a, b) => b[1] - a[1])) console.log(`  ${clef} : ${nombre}`);
