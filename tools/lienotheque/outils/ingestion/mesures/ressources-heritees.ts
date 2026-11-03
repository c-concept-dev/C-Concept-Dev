/** Combien de documents ont des pages qui **héritent** leurs ressources d'un nœud parent ? */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { objetsPdf, pagesPdf } from "@lienotheque/formats";

const racine = process.argv[2]!;
const tous: string[] = [];
for (const palier of readdirSync(racine)) {
  const dossier = join(racine, palier);
  if (!statSync(dossier).isDirectory()) continue;
  for (const nom of readdirSync(dossier)) if (nom.toLowerCase().endsWith(".pdf")) tous.push(join(dossier, nom));
}
let touches = 0;
let pagesTouchees = 0;
let pagesEnTout = 0;
for (const chemin of tous.sort()) {
  let objets;
  try {
    objets = objetsPdf(readFileSync(chemin));
  } catch {
    continue;
  }
  const pages = pagesPdf(objets);
  let sansLesSiennes = 0;
  for (const page of pages) {
    pagesEnTout += 1;
    const dico = objets.get(page.numero)?.dictionnaire ?? "";
    if (!/\/Resources/.test(dico)) sansLesSiennes += 1;
  }
  if (sansLesSiennes > 0) touches += 1;
  pagesTouchees += sansLesSiennes;
}
console.log(`${touches} document(s) sur ${tous.length} ont au moins une page sans /Resources propre`);
console.log(`${pagesTouchees} page(s) concernée(s) sur ${pagesEnTout}`);
