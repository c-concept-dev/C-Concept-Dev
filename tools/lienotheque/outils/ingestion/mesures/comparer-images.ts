/** L'image d'une page survit-elle à la copie, octet pour octet ? */
import { readFileSync } from "node:fs";
import { causeJpegFatalAvantDecodage, objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";

for (const chemin of process.argv.slice(2)) {
  const octets = readFileSync(chemin);
  const objets = objetsPdf(octets);
  const pages = pagesPdf(objets);
  const page = pages[0];
  console.log(`\n══ ${chemin.split("/").pop()!.slice(0, 48)}  (${pages.length} page(s))`);
  if (page === undefined) {
    console.log("   aucune page lue par la structure");
    continue;
  }
  for (const image of page.images) {
    const extrait = octetsImage(objets, image.numero);
    const tete = extrait === undefined ? "" : Buffer.from(extrait.octets.subarray(0, 12)).toString("hex");
    const cause = extrait?.extension === "jpg" ? causeJpegFatalAvantDecodage(extrait.octets) : undefined;
    const dico = objets.get(image.numero)?.dictionnaire.replace(/\s+/g, " ").slice(0, 150) ?? "";
    console.log(
      `   image n°${image.numero}  ${(extrait?.extension ?? "—").padEnd(5)} ` +
        `${String(extrait?.octets.length ?? 0).padStart(9)} octets  tête ${tete}  ${cause ?? "non fatale"}`,
    );
    console.log(`      dict : ${dico}`);
  }
}
