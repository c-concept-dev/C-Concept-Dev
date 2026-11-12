/** Un folio est-il mieux reconnu si le nombre est **seul sur sa ligne** ?
 *
 *  ## Le défaut mesuré
 *
 *  `numeroImprime` (`outils/lecteur-texte/src/passages.ts`) balaie les 12 % du haut et du bas de
 *  la page, retient tout nombre de 1 à 9 999, et le garde s'il est le seul. Relu au papier le
 *  3 novembre 2026 sur vingt-sept pages : il ramasse des années de copyright, des adresses
 *  postales et du texte courant — « les temps 1 / 4 », « ne contient que 5 notes ».
 *
 *  La variante éprouvée ici ne change pas la bande ni les bornes : elle exige seulement que le
 *  nombre soit **seul sur sa ligne**. Un folio l'est presque toujours ; un nombre pris dans une
 *  phrase ne l'est jamais.
 *
 *  Ce banc ne modifie rien. Il lit, compare les deux règles, et compte.
 *
 *  Usage : nombre-seul-sur-sa-ligne.ts <document.pdf> [<document.pdf> …]
 */
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enGris } from "@lienotheque/images";
import { coucheSuffisante, lireCoucheTexte, ouvrirRenduPdf, numeroImprime, BANDE_MARGE } from "@lienotheque/lecteur-texte";
import { ocrDUnePageGrise } from "@lienotheque/ingestion";

const MOTEURS = realpathSync(join(import.meta.dirname, "../../../apps/app/src-tauri/moteurs"));
const LARGEUR_DE_RENDU = 1800;
/** Deux mots sont sur la même ligne si leurs ordonnées se tiennent à cette part de la hauteur. */
const MEME_LIGNE = 0.01;

type Mot = { readonly texte: string; readonly y: number };

/** La variante : le nombre doit être seul sur sa ligne, dans la même bande et les mêmes bornes. */
function numeroSeulSurSaLigne(page: { hauteur: number; mots: readonly Mot[] }): number | undefined {
  const haut = page.hauteur * BANDE_MARGE;
  const bas = page.hauteur * (1 - BANDE_MARGE);
  const dansLaBande = page.mots.filter((mot) => mot.y <= haut || mot.y >= bas);

  const lignes = new Map<number, Mot[]>();
  for (const mot of dansLaBande) {
    const clef = Math.round(mot.y / (page.hauteur * MEME_LIGNE));
    lignes.set(clef, [...(lignes.get(clef) ?? []), mot]);
  }

  const candidats = new Set<number>();
  for (const ligne of lignes.values()) {
    if (ligne.length !== 1) continue;
    const seul = ligne[0]!.texte;
    if (!/^\d+$/.test(seul)) continue;
    const valeur = Number.parseInt(seul, 10);
    if (valeur >= 1 && valeur <= 9_999) candidats.add(valeur);
  }
  return candidats.size === 1 ? [...candidats][0] : undefined;
}

for (const pdf of process.argv.slice(2)) {
  const couche = await lireCoucheTexte(pdf);
  const rendu = await ouvrirRenduPdf(pdf);
  const parRang = new Map(couche.pages.map((page) => [page.index, page]));
  const bac = mkdtempSync(join(tmpdir(), "lienotheque-folio-"));
  let actuelle = 0;
  let variante = 0;
  let communes = 0;
  const perdues: string[] = [];
  const gagnees: string[] = [];
  try {
    for (let rang = 1; rang <= rendu.nombreDePages; rang += 1) {
      const deLaCouche = parRang.get(rang);
      const page =
        deLaCouche !== undefined && coucheSuffisante(deLaCouche)
          ? deLaCouche
          : ocrDUnePageGrise(enGris(await rendu.page(rang, LARGEUR_DE_RENDU)), rang, bac, {
              binaire: join(MOTEURS, "bin/tesseract"),
              tessdata: join(MOTEURS, "tessdata"),
            });
      const a = numeroImprime(page);
      const b = numeroSeulSurSaLigne(page);
      if (a !== undefined) actuelle += 1;
      if (b !== undefined) variante += 1;
      if (a !== undefined && b !== undefined && a === b) communes += 1;
      if (a !== undefined && b === undefined) perdues.push(`f.${rang}→${a}`);
      if (a === undefined && b !== undefined) gagnees.push(`f.${rang}→${b}`);
    }
  } finally {
    rmSync(bac, { recursive: true, force: true });
    await rendu.fermer();
  }
  console.log(`\n══ ${pdf.split("/").pop()} — ${rendu.nombreDePages} feuillet(s)`);
  console.log(`  règle actuelle : ${actuelle} folio(s)`);
  console.log(`  nombre seul    : ${variante} folio(s)`);
  console.log(`  identiques     : ${communes}`);
  console.log(`  écartés par la variante : ${perdues.length}${perdues.length ? " — " + perdues.slice(0, 12).join(" ") : ""}`);
  console.log(`  gagnés par la variante  : ${gagnees.length}${gagnees.length ? " — " + gagnees.slice(0, 12).join(" ") : ""}`);
}
