/** Garder les mots des pages que le détecteur prend pour des tables (OUT-10).
 *
 *  La reconnaissance d'un livre de 116 pages coûte vingt minutes. Éprouver un critère ne doit
 *  pas les coûter à nouveau : ce programme lit une fois, et écrit les mots des pages retenues.
 *  Le reste du travail se fait ensuite sur ce fichier, en une seconde.
 *
 *  Usage : garder-les-mots-des-tables.ts <sortie.json> <dossier> [<dossier>…]
 */
import { mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { lireLaTable } from "@lienotheque/noyau";
import { enGris } from "@lienotheque/images";
import { coucheSuffisante, lireCoucheTexte, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { ocrDUnePageGrise } from "@lienotheque/ingestion";

if (process.env["LIENOTHEQUE_JETON"] !== undefined) {
  console.error("Un jeton est présent dans l'environnement : arrêt (règle du 4 novembre 2026).");
  process.exit(2);
}
const MOTEURS = realpathSync(join(import.meta.dirname, "../../../apps/app/src-tauri/moteurs"));
const OCR = { binaire: join(MOTEURS, "bin/tesseract"), tessdata: join(MOTEURS, "tessdata") };
const sortie = process.argv[2];
const dossiers = process.argv.slice(3);
if (sortie === undefined || dossiers.length === 0) {
  console.error("usage : garder-les-mots-des-tables.ts <sortie.json> <dossier> [<dossier>…]");
  process.exit(2);
}

/** Garder toutes les pages, et non les seules que le détecteur signale. */
const toutes = process.env["LIENOTHEQUE_TOUTES_LES_PAGES"] === "1";

const compterMedias = (noms: readonly string[]): number =>
  noms.filter((n) => /\.(mp3|m4a|wav|flac|ogg|aac)$/i.test(n)).length;

const jeux: unknown[] = [];
const bac = mkdtempSync(join(tmpdir(), "lienotheque-mots-"));
try {
  for (const dossier of dossiers) {
   // Un volume externe peut décrocher en cours de route — c'est arrivé le 6 novembre 2026, et la
   // reconnaissance de cinquante-sept pages déjà faite est partie avec. On écrit après chaque
   // document, et un dossier qui manque ne tue pas le reste.
   try {
    const noms = readdirSync(dossier);
    const nomPdf = noms.find((n) => n.toLowerCase().endsWith(".pdf"));
    if (nomPdf === undefined) continue;
    const pdf = join(dossier, nomPdf);
    let vivier = compterMedias(noms);
    if (vivier === 0)
      try {
        vivier = compterMedias(readdirSync(join(dossier, "medias")));
      } catch {
        vivier = 0;
      }
    const couche = await lireCoucheTexte(pdf);
    const parRang = new Map(couche.pages.map((page) => [page.index, page]));
    const rendu = await ouvrirRenduPdf(pdf);
    const pages: unknown[] = [];
    try {
      for (let rang = 1; rang <= rendu.nombreDePages; rang += 1) {
        const deLaCouche = parRang.get(rang);
        const lue =
          deLaCouche !== undefined && coucheSuffisante(deLaCouche)
            ? deLaCouche
            : ocrDUnePageGrise(enGris(await rendu.page(rang, 1800)), rang, bac, OCR);
        // Pour mesurer ce que le détecteur **manque**, il faut les mots des pages qu'il ne
        // signale pas : une vraie table qu'il ne voit pas ne se compte pas autrement.
        if (!toutes && !lireLaTable(lue.mots).estUneTable) continue;
        pages.push({ page: rang, largeur: lue.largeur, mots: lue.mots });
      }
    } finally {
      await rendu.fermer();
    }
    jeux.push({ jeu: basename(dossier), vivier, pagesDuDocument: couche.pages.length, pages });
    writeFileSync(sortie, `${JSON.stringify(jeux)}\n`);
    console.log(`${basename(dossier)} — ${pages.length} page(s) gardée(s), vivier ${vivier}`);
   } catch (souci) {
    console.log(`${basename(dossier)} — ÉCHEC : ${String((souci as Error).message)}`);
   }
  }
} finally {
  rmSync(bac, { recursive: true, force: true });
}
writeFileSync(sortie, `${JSON.stringify(jeux)}\n`);
console.log(`\nécrit : ${sortie}`);
