/** Y a-t-il du signal dans les noms du vivier, sur TOUTES les pages — marquées ou non ?
 *
 *  La voie ne consulte aujourd'hui les noms que sur les pages portant une marque, et seulement si
 *  une marque a été retenue. Cette mesure retire les deux conditions et ne fait rien d'autre : le
 *  même détecteur, le même texte, toutes les pages.
 */
import { mkdtempSync, readdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accordsNomContenu, designationsDesNoms } from "@lienotheque/noyau";
import { enGris } from "@lienotheque/images";
import { coucheSuffisante, lireCoucheTexte, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { ocrDUnePageGrise } from "@lienotheque/ingestion";

const MOTEURS = realpathSync(
  "/Users/christophebonnet/Documents/GitHub/C-Concept-Dev-main-fusion-wt/tools/lienotheque/apps/app/src-tauri/moteurs",
);
const LARGEUR_DE_RENDU = 1800;
const dossier = process.argv[2]!;
const pdf = join(dossier, readdirSync(dossier).find((nom) => nom.toLowerCase().endsWith(".pdf"))!);
const noms = readdirSync(dossier)
  .filter((nom) => nom.toLowerCase().endsWith(".mp3"))
  .sort();

console.log(`document : ${pdf.split("/").pop()}`);
console.log(`vivier   : ${noms.length} enregistrement(s)\n`);

const marques = designationsDesNoms(noms);
let sansJeton = 0;
console.log("══ ce que chaque nom a de distinctif ══");
for (const { rang, jetons } of marques) {
  if (jetons.length === 0) sansJeton += 1;
  if (rang < 12 || jetons.length === 0)
    console.log(`  ${String(rang + 1).padStart(3)} ${noms[rang]!.slice(0, 54).padEnd(54)} → ${jetons.join(", ") || "AUCUN"}`);
}
if (noms.length > 12) console.log(`  … ${noms.length - 12} autre(s)`);
console.log(`  ${sansJeton} nom(s) sans aucun jeton distinctif sur ${noms.length}\n`);

// Le texte de toutes les pages : la couche quand elle suffit, la reconnaissance sinon.
// La couche AVANT le rendu : voir la dette connue du 1er novembre 2026.
const couche = await lireCoucheTexte(pdf);
const rendu = await ouvrirRenduPdf(pdf);
const combien = rendu.nombreDePages;
const parRang = new Map(couche.pages.map((page) => [page.index, page]));
const bac = mkdtempSync(join(tmpdir(), "lienotheque-noms-"));
const contenus: { page: number; texte: string }[] = [];
let ocerisees = 0;
try {
  for (let rang = 1; rang <= combien; rang += 1) {
    const deLaCouche = parRang.get(rang);
    let page = deLaCouche !== undefined && coucheSuffisante(deLaCouche) ? deLaCouche : undefined;
    if (page === undefined) {
      page = ocrDUnePageGrise(enGris(await rendu.page(rang, LARGEUR_DE_RENDU)), rang, bac, {
        binaire: join(MOTEURS, "bin/tesseract"),
        tessdata: join(MOTEURS, "tessdata"),
      });
      ocerisees += 1;
    }
    contenus.push({ page: rang, texte: page.mots.map((mot) => mot.texte).join(" ") });
  }
} finally {
  rmSync(bac, { recursive: true, force: true });
  await rendu.fermer();
}
console.log(`══ texte : ${combien} page(s), dont ${ocerisees} relue(s) par reconnaissance ══`);

const accords = accordsNomContenu(marques, contenus);
console.log(`\n══ accords nom ↔ contenu, sur TOUTES les pages : ${accords.length} ══`);
for (const accord of accords)
  console.log(
    `  page ${String(accord.page).padStart(3)} → ${accord.rangs.map((rang) => noms[rang]!).join(" | ").slice(0, 50).padEnd(50)} (${accord.jetons.join(", ")})`,
  );

// Ce que la voie, elle, aurait vu : rien, faute de marque retenue, ou seulement les pages marquées.
const parPiste = new Map<number, number[]>();
for (const accord of accords)
  for (const rang of accord.rangs) parPiste.set(rang, [...(parPiste.get(rang) ?? []), accord.page]);
const uniques = [...parPiste].filter(([, pages]) => pages.length === 1);
console.log(`\n══ de quoi tirer des liens ? ══`);
console.log(`  ${parPiste.size} enregistrement(s) retrouvé(s) sur au moins une page`);
console.log(`  ${uniques.length} retrouvé(s) sur une seule page — un lien candidat chacun`);
const suite = [...parPiste].sort((un, autre) => un[0] - autre[0]).map(([rang, pages]) => `${rang + 1}→p${pages.join("/")}`);
console.log(`  suite : ${suite.join("  ")}`);
const croissante = uniques
  .sort((un, autre) => un[0] - autre[0])
  .every(([, pages], place, tous) => place === 0 || pages[0]! >= tous[place - 1]![1][0]!);
console.log(`  l'ordre des pages suit-il l'ordre des enregistrements ? ${croissante ? "OUI" : "NON"}`);
