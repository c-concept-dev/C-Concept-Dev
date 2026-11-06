/** Lire au texte les pages gardées, pour en établir la vérité à l'œil (OUT-10).
 *
 *  Rendre quatre-vingts pages en image pour les regarder une à une coûte cher et se lit mal. Le
 *  texte, ligne par ligne dans l'ordre où il est imprimé, suffit à dire en un coup d'œil si une
 *  page est une liste, un sommaire ou une partition.
 *
 *  Usage : voir-le-texte-des-pages.ts <mots.json> [motif de jeu] [page]
 */
import { readFileSync } from "node:fs";
import { lignesDeMots, type MotLu } from "@lienotheque/noyau";

type PageGardee = { readonly page: number; readonly largeur: number; readonly mots: readonly MotLu[] };
type Jeu = { readonly jeu: string; readonly vivier: number; readonly pagesDuDocument: number; readonly pages: readonly PageGardee[] };

const jeux = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as readonly Jeu[];
const motif = process.argv[3];
const pageVoulue = process.argv[4] === undefined ? undefined : Number(process.argv[4]);

for (const jeu of jeux) {
  if (motif !== undefined && !jeu.jeu.toLowerCase().includes(motif.toLowerCase())) continue;
  for (const page of jeu.pages) {
    if (pageVoulue !== undefined && page.page !== pageVoulue) continue;
    console.log(`\n═══ ${jeu.jeu} — page ${page.page} (vivier ${jeu.vivier}, ${jeu.pagesDuDocument} feuille(s)) ═══`);
    for (const ligne of lignesDeMots(page.mots))
      console.log(`${String(Math.round(ligne.y)).padStart(5)} │ ${ligne.mots.map((mot) => mot.texte).join(" ")}`);
  }
}
