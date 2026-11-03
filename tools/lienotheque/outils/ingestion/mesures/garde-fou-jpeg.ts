/** Le garde-fou `jpegFatal` du rendu est-il opérant sur les documents réels ?
 *
 *  `ouvrirRenduPdf` décide d'écarter le décodeur WebAssembly — qui fait quitter le processus sur
 *  trois PDF réels — en parcourant `pagesPdf(objetsPdf(octets))`. Si cette fonction ne rend aucune
 *  page sur les vrais fichiers, la décision est toujours « garder le WebAssembly » et le garde-fou
 *  ne garde rien. Mesuré ici sur les originaux, et non sur des extraits.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { causeJpegFatalAvantDecodage, objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";
import { ouvrirRenduPdf } from "@lienotheque/lecteur-texte";

const racine = process.argv[2]!;
const combienVoulu = Number(process.argv[3] ?? 30);
const tous: string[] = [];
for (const palier of readdirSync(racine)) {
  const dossier = join(racine, palier);
  if (!statSync(dossier).isDirectory()) continue;
  for (const nom of readdirSync(dossier)) if (nom.toLowerCase().endsWith(".pdf")) tous.push(join(dossier, nom));
}
tous.sort();
// Répartis sur l'ensemble, et non les premiers : les paliers d'empreinte n'ont aucun ordre utile,
// mais prendre un bloc contigu reviendrait à mesurer un coin du corpus.
const pas = Math.max(1, Math.floor(tous.length / combienVoulu));
const choisis = tous.filter((_, place) => place % pas === 0).slice(0, combienVoulu);

console.log(`${tous.length} document(s) originaux, ${choisis.length} mesuré(s)\n`);
let sansPage = 0;
let fatals = 0;
for (const chemin of choisis) {
  const octets = readFileSync(chemin);
  let structurelles = -1;
  let images = 0;
  let fatal = false;
  let souci = "";
  try {
    const objets = objetsPdf(octets);
    const pages = pagesPdf(objets);
    structurelles = pages.length;
    for (const page of pages)
      for (const image of page.images) {
        images += 1;
        const extrait = octetsImage(objets, image.numero);
        if (extrait?.extension === "jpg" && causeJpegFatalAvantDecodage(extrait.octets) !== undefined) fatal = true;
      }
  } catch (echec) {
    souci = echec instanceof Error ? echec.message : String(echec);
  }
  let parPdfJs = -1;
  try {
    const rendu = await ouvrirRenduPdf(chemin);
    parPdfJs = rendu.nombreDePages;
    await rendu.fermer();
  } catch {
    parPdfJs = -1;
  }
  if (structurelles === 0) sansPage += 1;
  if (fatal) fatals += 1;
  console.log(
    `${(octets.length / 1e6).toFixed(1).padStart(6)} Mo  structure ${String(structurelles).padStart(4)} page(s)  ` +
      `pdf.js ${String(parPdfJs).padStart(4)}  images ${String(images).padStart(4)}  ` +
      `${fatal ? "JPEG FATAL" : "          "}  ${souci.slice(0, 40)}`,
  );
}
console.log(`\n${sansPage} document(s) sur ${choisis.length} pour lesquels la structure ne rend AUCUNE page`);
console.log(`${fatals} document(s) où le garde-fou se déclencherait`);
