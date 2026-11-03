/** Un extrait peut-il être structurellement fidèle ? L'expérience décisive.
 *
 *  On prend un original, on en copie N pages de deux façons — avec et sans flux d'objets — et on
 *  mesure chaque résultat avec la lecture structurelle du projet, celle-là même qui rend zéro
 *  page sur les extraits actuels.
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { causeJpegFatalAvantDecodage, objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";
import { ouvrirRenduPdf } from "@lienotheque/lecteur-texte";

const exiger = createRequire(import.meta.url);
const PDFLib = exiger(
  "/private/tmp/claude-501/-Users-christophebonnet-Documents-GitHub-C-Concept-Dev-tools-lienotheque/621be8ea-22d7-41cc-9ff6-cd506ee5d35f/scratchpad/pdf-lib.min.js",
) as { PDFDocument: { load: (o: Uint8Array) => Promise<Doc>; create: () => Promise<Doc> } };

type Doc = {
  getPageCount: () => number;
  copyPages: (de: Doc, places: readonly number[]) => Promise<readonly unknown[]>;
  addPage: (p: unknown) => void;
  save: (o?: { useObjectStreams?: boolean }) => Promise<Uint8Array>;
};

/** Ce que la lecture structurelle du projet voit d'un fichier, et ce que le rendu en voit. */
async function mesurer(etiquette: string, chemin: string): Promise<void> {
  const octets = readFileSync(chemin);
  const objets = objetsPdf(octets);
  const pages = pagesPdf(objets);
  let images = 0;
  let fatal = false;
  for (const page of pages)
    for (const image of page.images) {
      images += 1;
      const extrait = octetsImage(objets, image.numero);
      if (extrait?.extension === "jpg" && causeJpegFatalAvantDecodage(extrait.octets) !== undefined) fatal = true;
    }
  let parLeRendu = -1;
  try {
    const rendu = await ouvrirRenduPdf(chemin);
    parLeRendu = rendu.nombreDePages;
    await rendu.fermer();
  } catch {
    parLeRendu = -1;
  }
  console.log(
    `${etiquette.padEnd(34)} ${(octets.length / 1e6).toFixed(1).padStart(6)} Mo  ` +
      `structure ${String(pages.length).padStart(3)} page(s)  rendu ${String(parLeRendu).padStart(3)}  ` +
      `images ${String(images).padStart(4)}  ${fatal ? "JPEG FATAL" : "—         "}`,
  );
}

const original = process.argv[2]!;
const combien = Number(process.argv[3] ?? 12);
const bac = mkdtempSync(join(tmpdir(), "lienotheque-extrait-"));

await mesurer("original entier", original);

const source = await PDFLib.PDFDocument.load(readFileSync(original));
const places = Array.from({ length: Math.min(combien, source.getPageCount()) }, (_, rang) => rang);

for (const [nom, options] of [
  ["avec flux d'objets (aujourd'hui)", undefined],
  ["sans flux d'objets", { useObjectStreams: false }],
] as const) {
  const neuf = await PDFLib.PDFDocument.create();
  for (const page of await neuf.copyPages(source, places)) neuf.addPage(page);
  const chemin = join(bac, `${nom.replace(/[^a-z]/gi, "-")}.pdf`);
  writeFileSync(chemin, await neuf.save(options));
  await mesurer(nom, chemin);
}
console.log(`\n(${combien} page(s) demandées ; les fichiers sont dans ${bac})`);
