/** Le sens d'une page se lit dans la forme de ses mots (OUT-03).
 *
 *  Vu par Christophe le 6 novembre 2026, après que la confiance eut échoué à départager 90° de
 *  180° : l'outil lit aussi bien une page couchée qu'une page droite (0,953 contre 0,951), parce
 *  que son analyse de mise en page gère le texte vertical.
 *
 *  Mais une ligne de texte est **horizontale**, et un mot y est donc **plus large que haut**.
 *  C'est un fait de la composition, pas une confiance — et il ne se trompe pas de la même façon.
 *
 *  Ce programme mesure, pour chaque sens d'une page : la part des boîtes plus larges que hautes,
 *  la part des mots fiables, et la confiance médiane. Il ne décide rien.
 *
 *  Usage : la-geometrie-tranche-le-sens.ts <document.pdf> <page>
 */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qualiteDeLecture } from "@lienotheque/noyau";
import { enGris, tournerRvba } from "@lienotheque/images";
import { ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { ocrDUnePageGrise } from "@lienotheque/ingestion";

if (process.env["LIENOTHEQUE_JETON"] !== undefined) {
  console.error("Un jeton est présent dans l'environnement : arrêt (règle du 4 novembre 2026).");
  process.exit(2);
}
const MOTEURS = realpathSync(join(import.meta.dirname, "../../../apps/app/src-tauri/moteurs"));
const OCR = { binaire: join(MOTEURS, "bin/tesseract"), tessdata: join(MOTEURS, "tessdata") };
const [pdf, pageBrute] = process.argv.slice(2);
if (pdf === undefined || pageBrute === undefined) {
  console.error("usage : la-geometrie-tranche-le-sens.ts <document.pdf> <page>");
  process.exit(2);
}
const rang = Number(pageBrute);

const rendu = await ouvrirRenduPdf(pdf);
const bac = mkdtempSync(join(tmpdir(), "lienotheque-geo-"));
try {
  const pixels = await rendu.page(rang, 1800);
  console.log(`page ${rang} de ${pdf.split("/").pop()}\n`);
  console.log(
    `${"sens".padStart(5)} ${"mots".padStart(6)} ${"conf. méd.".padStart(10)} ${"fiables ≥0,6".padStart(12)} ${"plus larges que hauts".padStart(21)}`,
  );
  for (const [place, rotation] of ([0, 90, 180, 270] as const).entries()) {
    const grise = enGris(rotation === 0 ? pixels : tournerRvba(pixels, rotation));
    const lue = ocrDUnePageGrise(grise, 7000 + place, bac, OCR);
    const mots = lue.mots;
    const fiables = mots.filter((mot) => (mot.confiance ?? 1) >= 0.6);
    const horizontaux = mots.filter((mot) => mot.l > mot.h);
    const horizontauxFiables = fiables.filter((mot) => mot.l > mot.h);
    console.log(
      `${String(rotation).padStart(4)}° ${String(mots.length).padStart(6)} ${qualiteDeLecture(mots).toFixed(3).padStart(10)} ` +
        `${`${fiables.length} (${((100 * fiables.length) / Math.max(1, mots.length)).toFixed(0)} %)`.padStart(12)} ` +
        `${`${((100 * horizontaux.length) / Math.max(1, mots.length)).toFixed(0)} % · fiables ${((100 * horizontauxFiables.length) / Math.max(1, fiables.length)).toFixed(0)} %`.padStart(21)}`,
    );
  }
} finally {
  await rendu.fermer();
  rmSync(bac, { recursive: true, force: true });
}
