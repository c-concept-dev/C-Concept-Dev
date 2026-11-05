/** Fabrique les deux extraits du test rouge A1 (OUT-15). LECTURE SEULE des bibliothèques.
 *
 *  La logique est celle d'`extracteur-pages.html` (`extraireSelection`, L1200-1215) :
 *  `copyPages` puis `save({ useObjectStreams: false })`. L'outil charge pdf-lib depuis un CDN ;
 *  on prend ici la **même version** (1.17.1) dans le magasin pnpm, pour rester hors ligne.
 *
 *  Les deux extraits portent des feuilles sans image ENTRE des feuilles qui en ont. C'est la
 *  seule chose qui compte : `pagesEnGris` les saute (`banc.ts` — `if (page.images.length === 0)
 *  continue;`) et `preparerLot` n'incrémente son `index` que pour les feuilles émises. La
 *  feuille désignée par l'index n'est donc plus la feuille physique.
 *
 *  (a) décalage de 1, constant   — une seule feuille sans image, au début
 *  (b) décalages multiples        — une majorité de feuilles sans image
 *
 *  Les œuvres ne sont jamais versionnées (CLAUDE.md, règle 5) : les extraits sont écrits sous
 *  `fixtures/fichiers/`, ignoré par Git, et seules leurs empreintes entrent au dépôt. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "../../../node_modules/.pnpm/pdf-lib@1.17.1/node_modules/pdf-lib/es/index.js";
import { objetsPdf, pagesPdf } from "@lienotheque/formats";

const RACINE = join(import.meta.dirname, "../../..");
const SORTIE = join(RACINE, "fixtures/fichiers/A1");

/** Exactement `extraireSelection()` de l'outil : feuilles données en numéros 1-based. */
async function extraire(source: string, feuilles: readonly number[]): Promise<Uint8Array> {
  const original = await PDFDocument.load(readFileSync(source));
  const nouveau = await PDFDocument.create();
  const copiees = await nouveau.copyPages(original, feuilles.map((f) => f - 1));
  copiees.forEach((page) => nouveau.addPage(page));
  return nouveau.save({ useObjectStreams: false });
}

type Extrait = {
  readonly nom: string;
  readonly source: string;
  /** Feuilles de l'original, dans l'ordre voulu dans l'extrait. */
  readonly feuilles: readonly number[];
  readonly pourquoi: string;
};

const EXTRAITS: readonly Extrait[] = [
  {
    nom: "a1-decalage-constant.pdf",
    source: "/Volumes/Macbook Pro/Bibliotheque Musique/sources/ca/ca36cf9859691679fcc7c0065461275a18d32d318e82ccb89fb2404a786be90a.pdf",
    feuilles: [1, 2, 3, 4, 5],
    pourquoi: "la feuille 2 ne porte aucune image : décalage de 1 à partir de la troisième",
  },
  {
    nom: "a1-decalages-multiples.pdf",
    source: "/Volumes/Macbook Pro/Lienotheque/sources/f5/f5bca72cac65006df82706e56bffad30a0372a30cea90b484143ec0a417f1755.pdf",
    feuilles: [1, 2, 3, 12, 13, 25],
    pourquoi: "trois feuilles portent une image (1, 4, 6 de l'extrait) : décalages 0, 2 puis 3",
  },
];

mkdirSync(SORTIE, { recursive: true });
const verites: Record<string, unknown> = {};

for (const extrait of EXTRAITS) {
  const octets = await extraire(extrait.source, extrait.feuilles);
  const chemin = join(SORTIE, extrait.nom);
  writeFileSync(chemin, octets);
  const empreinte = createHash("sha256").update(octets).digest("hex");

  const pages = pagesPdf(objetsPdf(readFileSync(chemin)));
  const avecImage = pages.map((p, rang) => ({ feuille: rang + 1, images: p.images.length })).filter((p) => p.images > 0);

  console.log(`\n══ ${extrait.nom}`);
  console.log(`   ${extrait.pourquoi}`);
  console.log(`   feuilles de l'original : ${extrait.feuilles.join(", ")}`);
  console.log(`   extrait                : ${pages.length} feuille(s), ${(octets.length / 1024).toFixed(0)} Kio`);
  console.log(`   feuilles AVEC image    : ${avecImage.map((p) => p.feuille).join(", ")}`);
  console.log(`   feuilles SANS image    : ${pages.map((_, r) => r + 1).filter((f) => !avecImage.some((p) => p.feuille === f)).join(", ")}`);
  console.log(`   index attendus (0-based, = feuille - 1) : ${avecImage.map((p) => p.feuille - 1).join(", ")}`);
  console.log(`   index rendus aujourd'hui                : ${avecImage.map((_, i) => i).join(", ")}`);
  console.log(`   SHA-256 : ${empreinte}`);

  verites[extrait.nom] = {
    sha256: empreinte,
    octets: octets.length,
    feuilles: pages.length,
    feuillesDeLOriginal: extrait.feuilles,
    feuillesAvecImage: avecImage.map((p) => p.feuille),
    indexAttendus: avecImage.map((p) => p.feuille - 1),
    pourquoi: extrait.pourquoi,
  };
}

const reference = join(RACINE, "fixtures/references/a1-feuille-contre-index.json");
writeFileSync(reference, `${JSON.stringify(verites, null, 2)}\n`);
console.log(`\n   vérités attendues : ${reference}`);
console.log(`   extraits (hors dépôt) : ${SORTIE}`);
