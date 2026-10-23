/** Qu'est-ce qui est montré comme « la page », et le décodage le rend-il fidèlement ?
 *
 *     pnpm --filter @lienotheque/ingestion exec tsx mesures/image-de-page.ts <doc.pdf> [page]
 *
 *  ## Les deux questions, et pourquoi elles tiennent ensemble
 *
 *  Le 22 octobre 2026, l'éditeur de manière de lire a montré, sur un document composé en texte,
 *  un aplat gris de 96 % en guise de page. Deux causes possibles, et elles ne se corrigent pas
 *  au même endroit :
 *
 *  | | ce qu'on verrait |
 *  |---|---|
 *  | **le choix** — `exporterPages` prend `page.images[0]`, qui n'est pas la page | une illustration, de dimensions sans rapport d'une page à l'autre |
 *  | **le décodage** — `decoderJpeg` ou `redimensionner` abîment les pixels | un aplat, là où un décodeur de référence rend du blanc |
 *
 *  Ce banc les sépare. Il dit, page par page, ce que le document porte réellement ; puis il
 *  décode l'image d'une page **en trois temps** — brut, décodé, réduit — et compte à chaque fois
 *  la part de la couleur dominante. Un aplat qui apparaît entre deux temps désigne le coupable.
 *
 *  Il ne juge rien. Il compte, et il écrit les comptes.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";
import { decoderJpeg, redimensionner, type ImageRvba } from "@lienotheque/images";

/** La couleur la plus présente, et sa part. Quatre octets par pixel, l'alpha compris. */
function dominante(image: ImageRvba): { readonly couleur: string; readonly part: number; readonly couleurs: number } {
  const comptes = new Map<number, number>();
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    // Une clé par couleur opaque : l'alpha ne distingue rien sur une page.
    const clef = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
    comptes.set(clef, (comptes.get(clef) ?? 0) + 1);
  }
  let meilleure = 0;
  let combien = 0;
  for (const [clef, n] of comptes) if (n > combien) [meilleure, combien] = [clef, n];
  const pixels = data.length / 4;
  return {
    couleur: `(${(meilleure >> 16) & 255}, ${(meilleure >> 8) & 255}, ${meilleure & 255})`,
    part: combien / pixels,
    couleurs: comptes.size,
  };
}

const pourcent = (part: number): string => `${(part * 100).toFixed(1)} %`;

const [, , chemin, pageDemandee] = process.argv;
if (chemin === undefined) {
  console.error("Donnez le chemin d'un PDF, ou d'un dossier de sources.");
  process.exit(2);
}

/** Sur un dossier : une ligne par document, pour voir d'un coup quelles familles il contient.
 *
 *  C'est ce qui permet de répondre à « le réimport a-t-il souffert ? » : un document numérisé
 *  porte une image par page et aucune couche ; un document composé en porte peu, et une couche
 *  partout. Les deux ne se lisent pas par le même chemin, donc un défaut de l'un n'atteint pas
 *  forcément l'autre. */
if ((await stat(chemin)).isDirectory()) {
  const fichiers = (await readdir(chemin, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf"))
    .slice(0, Number(pageDemandee ?? 20));
  console.log("pages  couche  1 image  plusieurs  aucune  tronquées  document");
  for (const entree of fichiers) {
    const complet = join(entree.parentPath, entree.name);
    try {
      const lus = objetsPdf(await readFile(complet));
      const pages = pagesPdf(lus);
      const avecCouche = pages.filter((p) => p.couchTexte).length;
      const une = pages.filter((p) => p.images.length === 1).length;
      const plusieurs = pages.filter((p) => p.images.length > 1).length;
      const aucune = pages.filter((p) => p.images.length === 0).length;
      // Tronquée : le flux extrait ne porte pas la marque de fin d'un JPEG.
      let tronquees = 0;
      for (const page of pages.slice(0, 12)) {
        const premiere = page.images[0];
        if (premiere === undefined) continue;
        const octets = octetsImage(lus, premiere.numero);
        if (octets === undefined || octets.extension !== "jpg") continue;
        const fin = octets.octets.subarray(Math.max(0, octets.octets.length - 2));
        if (!(fin[0] === 0xff && fin[1] === 0xd9)) tronquees += 1;
      }
      console.log(
        `${String(pages.length).padStart(5)}  ${String(avecCouche).padStart(6)}  ${String(une).padStart(7)}  ${String(plusieurs).padStart(9)}  ${String(aucune).padStart(6)}  ${String(tronquees).padStart(9)}  ${entree.name.slice(0, 48)}`,
      );
    } catch (cause) {
      console.log(`    —       —        —          —       —          —  ${entree.name.slice(0, 48)} (${cause instanceof Error ? cause.message.slice(0, 40) : "illisible"})`);
    }
  }
  process.exit(0);
}

const objets = objetsPdf(await readFile(chemin));
const pages = pagesPdf(objets);

console.log(`${pages.length} pages\n`);
console.log("rang  couche   images  dimensions des JPEG");
console.log("────  ──────   ──────  ───────────────────");

let avecPlusieurs = 0;
let avecUne = 0;
let sansImage = 0;
for (const page of pages) {
  const formes: string[] = [];
  for (const image of page.images) {
    const octets = octetsImage(objets, image.numero);
    formes.push(octets === undefined ? "?" : octets.extension === "jpg" ? `${image.largeur}×${image.hauteur}` : octets.extension);
  }
  if (page.images.length === 0) sansImage += 1;
  else if (page.images.length === 1) avecUne += 1;
  else avecPlusieurs += 1;
  if (page.index < 20)
    console.log(
      `${String(page.index + 1).padStart(4)}  ${page.couchTexte ? "oui  " : "non  "}  ${String(page.images.length).padStart(6)}  ${formes.join(" | ")}`,
    );
}

console.log(`\naucune image : ${sansImage}   une seule : ${avecUne}   plusieurs : ${avecPlusieurs}`);

// ── Le décodage, en trois temps ───────────────────────────────────────────────
const rang = pageDemandee === undefined ? undefined : Number(pageDemandee) - 1;
if (rang === undefined) {
  console.log("\n(donnez un numéro de page pour mesurer son décodage)");
  process.exit(0);
}

const page = pages[rang];
const premiere = page?.images[0];
if (page === undefined || premiere === undefined) {
  console.error(`La page ${rang + 1} ne porte aucune image.`);
  process.exit(1);
}
const octets = octetsImage(objets, premiere.numero);
if (octets === undefined || octets.extension !== "jpg") {
  console.error(`La première image de la page ${rang + 1} n'est pas un JPEG.`);
  process.exit(1);
}

console.log(`\n── page ${rang + 1}, première image : ${octets.octets.length} octets ──`);

const decodee = await decoderJpeg(octets.octets);
const apresDecodage = dominante(decodee);
console.log(`décodée   ${decodee.width}×${decodee.height}  dominante ${apresDecodage.couleur} sur ${pourcent(apresDecodage.part)}  (${apresDecodage.couleurs} couleurs)`);

const LARGEUR = 1240;
if (decodee.width <= LARGEUR) {
  console.log("réduite   (pas de réduction : l'image est déjà plus étroite que la largeur d'affichage)");
} else {
  const reduite = await redimensionner(decodee, LARGEUR, Math.max(1, Math.round((decodee.height * LARGEUR) / decodee.width)));
  const apresReduction = dominante(reduite);
  console.log(`réduite   ${reduite.width}×${reduite.height}  dominante ${apresReduction.couleur} sur ${pourcent(apresReduction.part)}  (${apresReduction.couleurs} couleurs)`);
}
