/** De quel document, et de quelles pages, chaque extrait a-t-il été tiré ?
 *
 *  Identifié par le **contenu** et non par le nom : les flux d'une page copiée sont octet pour
 *  octet ceux de l'original. Un appariement par le nom aurait donné deux originaux différents
 *  à deux familles qui portent le même PDF, et rien du tout à une troisième.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";

/** L'empreinte du contenu d'une page : ses images, ou son flux de contenu à défaut. */
function signatureDePage(octets: Buffer, rang: number): string | undefined {
  const objets = objetsPdf(octets);
  const pages = pagesPdf(objets);
  const page = pages[rang];
  if (page === undefined) return undefined;
  const condensat = createHash("sha256");
  let quelqueChose = false;
  for (const image of page.images) {
    const extrait = octetsImage(objets, image.numero);
    if (extrait === undefined) continue;
    condensat.update(extrait.octets);
    quelqueChose = true;
  }
  if (!quelqueChose) {
    // Une page sans image : on prend son flux de contenu, qui voyage aussi tel quel.
    const contenu = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(objets.get(page.numero)?.dictionnaire ?? "");
    const flux = contenu === null ? undefined : objets.get(Number(contenu[1]))?.flux;
    if (flux === undefined) return undefined;
    condensat.update(flux);
  }
  return condensat.digest("hex");
}

const racineOriginaux = process.argv[2]!;
const racineExtraits = process.argv[3]!;

const originaux: string[] = [];
for (const palier of readdirSync(racineOriginaux)) {
  const dossier = join(racineOriginaux, palier);
  if (!statSync(dossier).isDirectory()) continue;
  for (const nom of readdirSync(dossier)) if (nom.toLowerCase().endsWith(".pdf")) originaux.push(join(dossier, nom));
}

/** Toutes les signatures de page des originaux : signature → (document, rang). */
const table = new Map<string, { document: string; rang: number }>();
for (const chemin of originaux.sort()) {
  let octets;
  try {
    octets = readFileSync(chemin);
  } catch {
    continue;
  }
  const combien = pagesPdf(objetsPdf(octets)).length;
  for (let rang = 0; rang < combien; rang += 1) {
    const signature = signatureDePage(octets, rang);
    if (signature !== undefined && !table.has(signature)) table.set(signature, { document: chemin, rang });
  }
}
console.log(`${table.size} signature(s) de page relevées sur ${originaux.length} original(aux)\n`);

for (const famille of readdirSync(racineExtraits).filter((n) => /^\d/u.test(n)).sort()) {
  const dossier = join(racineExtraits, famille);
  if (!statSync(dossier).isDirectory()) continue;
  const nom = readdirSync(dossier).find((n) => n.toLowerCase().endsWith(".pdf"));
  if (nom === undefined) continue;
  const octets = readFileSync(join(dossier, nom));
  const pages = pagesPdf(objetsPdf(octets));
  // Un extrait d'avant ne rend aucune page à la structure : on passe alors par pdf.js ? Non —
  // on lit sa première page autrement, par le flux de contenu que la structure voit quand même.
  const signature = signatureDePage(octets, 0);
  const trouve = signature === undefined ? undefined : table.get(signature);
  console.log(
    `${famille.slice(0, 34).padEnd(34)} ${String(pages.length).padStart(3)}p lues  → ` +
      (trouve === undefined
        ? `INTROUVABLE${signature === undefined ? " (aucune signature lisible)" : ""}`
        : `${basename(trouve.document).slice(0, 12)}… page ${trouve.rang + 1}`),
  );
}
