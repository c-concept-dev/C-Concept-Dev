/** A2 — ce que Tesseract dit de sa propre lecture, et combien de temps il met.
 *
 *  Deux questions, une seule passe, parce qu'elles demandent la même chose : lire des pages.
 *
 *  **Le délai.** `lireParOcr` appelle Tesseract sans aucun délai : s'il se bloque, la chaîne
 *  entière attend sans fin. Pour poser un délai qui ne coupe jamais une lecture normale, il faut
 *  savoir ce qu'une lecture normale coûte — sur ces pages-ci, pas en général.
 *
 *  **La difficulté.** Les quatre éléments perdus du document du jalon viennent de huit lignes de
 *  sommaire abîmées par l'OCR, sur une page parfaitement lisible à l'œil. Un repli n'a de sens
 *  que s'il se déclenche ; Tesseract rend une **confiance par mot** que la chaîne conserve déjà
 *  sans l'employer. La question est : cette page-là se distingue-t-elle des autres par sa
 *  confiance, ou pas du tout ?
 *
 *  Ce banc ne modifie rien et n'écrit que son relevé.
 *
 *  Usage : a2-ce-que-tesseract-dit-de-lui-meme.ts <document.pdf> <première> <dernière>
 */
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enGris } from "@lienotheque/images";
import { ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { ocrDUnePageGrise } from "@lienotheque/ingestion";

const MOTEURS = realpathSync(join(import.meta.dirname, "../../../apps/app/src-tauri/moteurs"));
const LARGEUR_DE_RENDU = 1800;

const [pdf, premiereBrute, derniereBrute] = process.argv.slice(2);
if (pdf === undefined) {
  console.error("usage : a2-ce-que-tesseract-dit-de-lui-meme.ts <document.pdf> [première] [dernière]");
  process.exit(2);
}
const rendu = await ouvrirRenduPdf(pdf);
const premiere = Number(premiereBrute ?? 1);
const derniere = Math.min(Number(derniereBrute ?? rendu.nombreDePages), rendu.nombreDePages);
const bac = mkdtempSync(join(tmpdir(), "lienotheque-a2-"));

/** Le quantile bas d'une suite : ce que les mots les moins sûrs valent. Une moyenne noie quatre
 *  lignes abîmées dans deux cents mots justes ; un quantile bas les voit. */
const quantile = (valeurs: readonly number[], part: number): number => {
  if (valeurs.length === 0) return Number.NaN;
  const triees = [...valeurs].sort((un, autre) => un - autre);
  return triees[Math.min(triees.length - 1, Math.floor(part * triees.length))]!;
};

console.log("feuille │ durée │  mots │ conf. médiane │ q10 │ mots sous 0,60 │ part");
console.log("────────┼───────┼───────┼───────────────┼─────┼────────────────┼──────");
const durees: number[] = [];
try {
  for (let rang = premiere; rang <= derniere; rang += 1) {
    const pixels = await rendu.page(rang, LARGEUR_DE_RENDU);
    const debut = Date.now();
    const page = ocrDUnePageGrise(enGris(pixels), rang, bac, {
      binaire: join(MOTEURS, "bin/tesseract"),
      tessdata: join(MOTEURS, "tessdata"),
    });
    const duree = (Date.now() - debut) / 1000;
    durees.push(duree);
    const confiances = page.mots.map((mot) => mot.confiance).filter((c): c is number => c !== undefined);
    const faibles = confiances.filter((c) => c < 0.6).length;
    const part = confiances.length === 0 ? 0 : faibles / confiances.length;
    console.log(
      `${String(rang).padStart(7)} │${duree.toFixed(1).padStart(6)}s │${String(page.mots.length).padStart(6)} │` +
        `${quantile(confiances, 0.5).toFixed(2).padStart(14)} │${quantile(confiances, 0.1).toFixed(2).padStart(4)} │` +
        `${String(faibles).padStart(15)} │${(part * 100).toFixed(0).padStart(5)}%`,
    );
  }
} finally {
  rmSync(bac, { recursive: true, force: true });
  await rendu.fermer();
}
const triees = [...durees].sort((un, autre) => un - autre);
console.log(
  `\ndurées : la plus courte ${triees[0]?.toFixed(1)}s · médiane ${quantile(durees, 0.5).toFixed(1)}s · ` +
    `la plus longue ${triees.at(-1)?.toFixed(1)}s`,
);
