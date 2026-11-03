/** La même mesure que `mesurer-noms.ts`, mais sur un document **entier** et un vivier donné à part.
 *
 *  Pourquoi séparer les deux : un extrait de douze pages et le document dont il sort ne donnent pas
 *  le même chiffre, et c'est le document entier qui fait preuve. Le vivier, lui, reste celui du
 *  dossier d'essai — une seule chose change d'une mesure à l'autre.
 *
 *  Usage : mesurer-noms-entier.ts <document.pdf> <dossier des enregistrements>
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
const pdf = process.argv[2]!;
const dossier = process.argv[3]!;
const noms = readdirSync(dossier)
  .filter((nom) => nom.toLowerCase().endsWith(".mp3"))
  .sort();

console.log(`document : ${pdf.split("/").pop()}`);
console.log(`vivier   : ${noms.length} enregistrement(s) depuis ${dossier.split("/").pop()}\n`);

const marques = designationsDesNoms(noms);
const sansJeton = marques.filter(({ jetons }) => jetons.length === 0).length;
console.log(`${sansJeton} nom(s) sans aucun jeton distinctif sur ${noms.length}`);
for (const { rang, jetons } of marques)
  if (jetons.length > 0)
    console.log(`  ${String(rang + 1).padStart(3)} ${noms[rang]!.slice(0, 56).padEnd(56)} → ${jetons.join(", ")}`);

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
console.log(`\n══ texte : ${combien} page(s), dont ${ocerisees} relue(s) par reconnaissance ══`);

const accords = accordsNomContenu(marques, contenus);
console.log(`\n══ accords nom ↔ contenu, sur TOUTES les pages : ${accords.length} ══`);
for (const accord of accords)
  console.log(
    `  page ${String(accord.page).padStart(3)} → ${accord.rangs.map((rang) => noms[rang]!).join(" | ").slice(0, 52).padEnd(52)} (${accord.jetons.join(", ")})`,
  );

const parPiste = new Map<number, number[]>();
for (const accord of accords)
  for (const rang of accord.rangs) parPiste.set(rang, [...(parPiste.get(rang) ?? []), accord.page]);
const uniques = [...parPiste].filter(([, pages]) => pages.length === 1);
console.log(`\n══ de quoi tirer des liens ? ══`);
console.log(`  ${parPiste.size} enregistrement(s) retrouvé(s) sur au moins une page sur ${noms.length}`);
console.log(`  ${uniques.length} retrouvé(s) sur une seule page — un lien candidat chacun`);
const suite = [...parPiste].sort((un, autre) => un[0] - autre[0]).map(([rang, pages]) => `${rang + 1}→p${pages.join("/")}`);
console.log(`  suite : ${suite.join("  ")}`);
const croissante = uniques
  .sort((un, autre) => un[0] - autre[0])
  .every(([, pages], place, tous) => place === 0 || pages[0]! >= tous[place - 1]![1][0]!);
console.log(`  l'ordre des pages suit-il l'ordre des enregistrements ? ${croissante ? "OUI" : "NON"}`);
