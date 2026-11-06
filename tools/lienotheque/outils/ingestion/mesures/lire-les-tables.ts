/** Ce que le détecteur de table rend sur les vraies pages, page par page.
 *
 *  La couche AVANT le rendu : voir l'avis du 1er novembre 2026 sur le piège de pdf.js.
 */
import { mkdtempSync, readdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lireLaTable } from "@lienotheque/noyau";
import { enGris } from "@lienotheque/images";
import { coucheSuffisante, lireCoucheTexte, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { ocrDUnePageGrise } from "@lienotheque/ingestion";

const MOTEURS = realpathSync(
  "/Users/christophebonnet/Documents/GitHub/C-Concept-Dev-main-fusion-wt/tools/lienotheque/apps/app/src-tauri/moteurs",
);
const dossier = process.argv[2]!;
const pdf = join(dossier, readdirSync(dossier).find((n) => n.toLowerCase().endsWith(".pdf"))!);
const pistes = readdirSync(dossier).filter((n) => n.toLowerCase().endsWith(".mp3")).length;
console.log(`${dossier.split("/").pop()} — ${pistes} piste(s)\n`);

const couche = await lireCoucheTexte(pdf);
const parRang = new Map(couche.pages.map((page) => [page.index, page]));
const rendu = await ouvrirRenduPdf(pdf);
const bac = mkdtempSync(join(tmpdir(), "lienotheque-tables-"));
try {
  for (let rang = 1; rang <= rendu.nombreDePages; rang += 1) {
    const deLaCouche = parRang.get(rang);
    const page =
      deLaCouche !== undefined && coucheSuffisante(deLaCouche)
        ? deLaCouche
        : ocrDUnePageGrise(enGris(await rendu.page(rang, 1800)), rang, bac, {
            binaire: join(MOTEURS, "bin/tesseract"),
            tessdata: join(MOTEURS, "tessdata"),
          });
    const table = lireLaTable(page.mots, { enregistrements: pistes });
    if (!table.estUneTable) {
      console.log(`page ${String(rang).padStart(2)} : pas une table (${table.colonnes.length} colonne(s), ${table.rangees.length} rangée(s))`);
      continue;
    }
    console.log(
      `page ${String(rang).padStart(2)} : TABLE — ${table.panneaux} panneau(x), ${table.colonnes.length} colonnes/rangée, ${table.rangees.length} rangées, ` +
        `${table.utilisables.length} utilisable(s), ${table.incompletes.length} incomplète(s), ${table.suspectes.length} suspecte(s)`,
    );
    for (const place of table.utilisables.slice(0, 24)) {
      const rangee = table.rangees[place]!;
      console.log(`     ${rangee.cellules.map((c) => String(c ?? "—").padStart(4)).join("")}   « ${rangee.intitule.slice(0, 48)} »`);
    }
    for (const suspecte of table.suspectes.slice(0, 6))
      console.log(`     SUSPECTE rangée ${suspecte.rangee} colonne ${suspecte.colonne} = ${suspecte.valeur} : ${suspecte.pourquoi}`);
  }
} finally {
  rmSync(bac, { recursive: true, force: true });
  await rendu.fermer();
}
