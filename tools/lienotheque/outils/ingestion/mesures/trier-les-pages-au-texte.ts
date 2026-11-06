/** Trier les pages au texte, une ligne par page (OUT-10).
 *
 *  Première passe de la vérité de terrain : le texte dit en un coup d'œil ce qu'une page est.
 *  L'image tranchera ensuite sur un échantillon — c'est elle qui fait foi.
 *
 *  Usage : trier-les-pages-au-texte.ts <mots.json>
 */
import { readFileSync } from "node:fs";
import { lignesDeMots, valeurDeCellule, type MotLu } from "@lienotheque/noyau";

type PageGardee = { readonly page: number; readonly largeur: number; readonly mots: readonly MotLu[] };
type Jeu = { readonly jeu: string; readonly vivier: number; readonly pagesDuDocument: number; readonly pages: readonly PageGardee[] };

const jeux = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as readonly Jeu[];
for (const jeu of jeux) {
  console.log(`\n── ${jeu.jeu} (vivier ${jeu.vivier}) ──`);
  for (const page of jeu.pages) {
    const lignes = lignesDeMots(page.mots);
    const mots = page.mots.length;
    const nombres = page.mots.filter((mot) => valeurDeCellule(mot.texte) !== undefined).length;
    const texte = page.mots.filter((mot) => valeurDeCellule(mot.texte) === undefined).length;
    const tete = lignes
      .slice(0, 3)
      .map((ligne) => ligne.mots.map((mot) => mot.texte).join(" "))
      .join(" ⏐ ")
      .slice(0, 96);
    console.log(
      `p${String(page.page).padStart(3)} ${String(lignes.length).padStart(3)}l ` +
        `${String(mots).padStart(4)}m ${String(nombres).padStart(4)}n ${String(texte).padStart(4)}t │ ${tete}`,
    );
  }
}
