/** La couche texte de ce document est-elle **lisible**, et qui gagne page par page ? (étape 3)
 *
 *     pnpm --filter @lienotheque/ingestion exec tsx mesures/couche-lisible.ts <doc> [pages]
 *
 *  « Reconsolidation thérapeutique » rendait 295 passages tous illisibles : « Xï Œè »· é }u} ï ».
 *  Sa couche existe, elle est abondante, et son encodage de police est faux. Compter les mots ne
 *  pouvait pas le voir — et préférait cette couche **parce qu'**elle était abondante.
 *
 *  Après correction, 62 feuilles sur 149 passent par l'OCR et 87 restent sur la couche. Ce banc
 *  dit pourquoi : il montre les trois lectures côte à côte — la couche brute, l'OCR brut, et
 *  celle que la chaîne retient — avec la part de mots outils de chacune.
 */

import { lireCoucheTexte, partDeMotsOutils } from "@lienotheque/lecteur-texte";
import { lireLeTexte } from "../src/index.js";

const [chemin, combien = "8"] = process.argv.slice(2);
if (chemin === undefined) {
  console.error("Attendu : <document> [pages]");
  process.exit(2);
}
const pages = Number.parseInt(combien, 10);

const brute = (await lireCoucheTexte(chemin)).pages.slice(0, pages);
const parOcr = await lireLeTexte(chemin, { pages, forcerOcr: true });
const retenue = await lireLeTexte(chemin, { pages });

const mots = (texte: string): number => texte.split(/\s+/).filter((m) => m !== "").length;
const part = (texte: string): string => `${(partDeMotsOutils(texte) * 100).toFixed(1).padStart(5)}%`;

console.log(`\n  ${"page".padStart(4)} │ ${"couche brute".padStart(20)} │ ${"ocr brut".padStart(20)} │ retenu`);
console.log(`  ${"─".repeat(4)}─┼─${"─".repeat(20)}─┼─${"─".repeat(20)}─┼───────`);

let coucheGagne = 0;
let ocrGagne = 0;
const releve: unknown[] = [];

for (let rang = 1; rang <= pages; rang += 1) {
  const c = brute.find((p) => p.index === rang);
  const texteCouche = c === undefined ? "" : c.mots.map((m) => m.texte).join(" ");
  const o = parOcr.pages.find((p) => p.index === rang);
  const r = retenue.pages.find((p) => p.index === rang);
  const qui = r === undefined ? "—" : r.source === "couche_texte" ? "couche" : "ocr";
  if (qui === "couche") coucheGagne += 1;
  if (qui === "ocr") ocrGagne += 1;

  releve.push({
    page: rang,
    couche: { mots: mots(texteCouche), outils: partDeMotsOutils(texteCouche) },
    ocr: { mots: mots(o?.texte ?? ""), outils: partDeMotsOutils(o?.texte ?? "") },
    retenu: qui,
  });

  console.log(
    `  ${String(rang).padStart(4)} │ ${String(mots(texteCouche)).padStart(6)} mots ${part(texteCouche)} │ ` +
      `${String(mots(o?.texte ?? "")).padStart(6)} mots ${part(o?.texte ?? "")} │ ${qui}`,
  );
}

console.log(`\n  retenu : ${coucheGagne} fois la couche, ${ocrGagne} fois l'OCR`);
const illisiblesRetenus = releve.filter((l) => {
  const x = l as { retenu: string; couche: { outils: number }; ocr: { outils: number } };
  return (x.retenu === "couche" && x.couche.outils < 0.08) || (x.retenu === "ocr" && x.ocr.outils < 0.08);
}).length;
console.log(`  ${illisiblesRetenus} page(s) retenue(s) alors que ce qui a été retenu est illisible`);
