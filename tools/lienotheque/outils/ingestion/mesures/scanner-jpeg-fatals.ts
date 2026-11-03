/** Sur TOUT le corpus : quel critère du garde-fou se déclenche, et sur quels documents ?
 *
 *  Sans pdf.js : on ne veut que la lecture de structure, donc c'est rapide.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { causeJpegFatalAvantDecodage, objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";

const racine = process.argv[2]!;
const tous: string[] = [];
for (const palier of readdirSync(racine)) {
  const dossier = join(racine, palier);
  if (!statSync(dossier).isDirectory()) continue;
  for (const nom of readdirSync(dossier)) if (nom.toLowerCase().endsWith(".pdf")) tous.push(join(dossier, nom));
}
tous.sort();

const parCause = new Map<string, string[]>();
let sansPage = 0;
let lus = 0;
for (const chemin of tous) {
  let objets;
  try {
    objets = objetsPdf(readFileSync(chemin));
  } catch {
    continue;
  }
  lus += 1;
  const pages = pagesPdf(objets);
  if (pages.length === 0) sansPage += 1;
  for (const page of pages)
    for (const image of page.images) {
      const extrait = octetsImage(objets, image.numero);
      if (extrait?.extension !== "jpg") continue;
      const cause = causeJpegFatalAvantDecodage(extrait.octets);
      if (cause === undefined) continue;
      const famille = cause.startsWith("JPEG à") ? "composantes colorimétriques (CMJN)" : "flux minuscule et incomplet";
      const deja = parCause.get(famille) ?? [];
      if (!deja.includes(chemin)) deja.push(chemin);
      parCause.set(famille, deja);
    }
}

console.log(`${lus} document(s) lus sur ${tous.length} ; ${sansPage} sans page lue par la structure\n`);
if (parCause.size === 0) console.log("AUCUN document ne déclenche le garde-fou.");
for (const [cause, documents] of parCause) {
  console.log(`${documents.length} document(s) — ${cause}`);
  for (const chemin of documents.slice(0, 6)) console.log(`   ${basename(chemin).slice(0, 20)}…`);
}
