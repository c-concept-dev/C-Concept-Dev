/** Où sont les colonnes, et les mots d'une rangée : deux panneaux, ou une table ? */
import { mkdtempSync, readdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { colonnesDeNombres, lignesDeMots } from "@lienotheque/noyau";
import { enGris } from "@lienotheque/images";
import { coucheSuffisante, lireCoucheTexte, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { ocrDUnePageGrise } from "@lienotheque/ingestion";

const MOTEURS = realpathSync(
  "/Users/christophebonnet/Documents/GitHub/C-Concept-Dev-main-fusion-wt/tools/lienotheque/apps/app/src-tauri/moteurs",
);
const dossier = process.argv[2]!;
const rangVoulu = Number(process.argv[3]);
const pdf = join(dossier, readdirSync(dossier).find((n) => n.toLowerCase().endsWith(".pdf"))!);

const couche = await lireCoucheTexte(pdf);
const deLaCouche = couche.pages.find((page) => page.index === rangVoulu);
const rendu = await ouvrirRenduPdf(pdf);
const bac = mkdtempSync(join(tmpdir(), "lienotheque-struct-"));
try {
  const page =
    deLaCouche !== undefined && coucheSuffisante(deLaCouche)
      ? deLaCouche
      : ocrDUnePageGrise(enGris(await rendu.page(rangVoulu, 1800)), rangVoulu, bac, {
          binaire: join(MOTEURS, "bin/tesseract"),
          tessdata: join(MOTEURS, "tessdata"),
        });
  console.log(`page ${rangVoulu} : ${page.mots.length} mot(s), largeur ${page.largeur}\n`);
  const lignes = lignesDeMots(page.mots);
  const colonnes = colonnesDeNombres(lignes);
  console.log(`${colonnes.length} colonne(s) de nombres, par abscisse :`);
  for (const [place, colonne] of colonnes.entries())
    console.log(
      `  colonne ${place} : x ≈ ${Math.round(colonne.x)}  (${(colonne.x / page.largeur * 100).toFixed(1)} % de la largeur)`,
    );
  // Les écarts entre colonnes voisines : un panneau se sépare par un écart bien plus grand.
  const ecarts = colonnes.slice(1).map((colonne, place) => Math.round(colonne.x - colonnes[place]!.x));
  console.log(`\nécarts entre colonnes voisines : ${ecarts.join("  ")}`);
  console.log(`\nquelques lignes, mots dans l'ordre :`);
  for (const ligne of lignes.slice(0, 26)) {
    const mots = ligne.mots.map((mot) => `${mot.texte}@${Math.round(mot.x)}`).join(" ");
    if (mots.length > 10) console.log(`  y=${String(Math.round(ligne.y)).padStart(4)}  ${mots.slice(0, 150)}`);
  }
} finally {
  rmSync(bac, { recursive: true, force: true });
  await rendu.fermer();
}
