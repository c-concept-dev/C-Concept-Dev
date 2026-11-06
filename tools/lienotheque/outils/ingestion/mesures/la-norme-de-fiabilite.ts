/** La norme de fiabilité : le minimum ou la médiane des pages normales ? (OUT-03)
 *
 *  Un mot est « fiable » quand sa confiance atteint la norme du document. Reste à dire laquelle,
 *  et c'est une décision, pas une évidence :
 *
 *  - le **minimum** suit la page normale la plus faible. Une seule page médiocre abaisse la norme
 *    et rend presque tout fiable : le critère perd sa force ;
 *  - la **médiane** suit le milieu. Elle résiste à une page aberrante, mais elle est plus dure —
 *    la moitié des mots des pages normales tombent sous elle.
 *
 *  Ce programme mesure les deux sur les pages réelles, et ne décide rien.
 *
 *  Usage : la-norme-de-fiabilite.ts <document.pdf> [<document.pdf>…]
 */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { motsFiables, pagesQuiLisentMal, partHorizontale, qualiteDeLecture, rotationQuiVaut } from "@lienotheque/noyau";
import { enGris, tournerRvba } from "@lienotheque/images";
import { coucheSuffisante, lireCoucheTexte, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { ocrDUnePageGrise } from "@lienotheque/ingestion";

if (process.env["LIENOTHEQUE_JETON"] !== undefined) {
  console.error("Un jeton est présent dans l'environnement : arrêt (règle du 4 novembre 2026).");
  process.exit(2);
}
const MOTEURS = realpathSync(join(import.meta.dirname, "../../../apps/app/src-tauri/moteurs"));
const OCR = { binaire: join(MOTEURS, "bin/tesseract"), tessdata: join(MOTEURS, "tessdata") };

const mediane = (xs: readonly number[]): number => {
  const t = [...xs].sort((un, autre) => un - autre);
  return t[Math.floor(t.length / 2)] ?? 0;
};

for (const pdf of process.argv.slice(2)) {
  const couche = await lireCoucheTexte(pdf);
  const parRang = new Map(couche.pages.map((page) => [page.index, page]));
  const rendu = await ouvrirRenduPdf(pdf);
  const bac = mkdtempSync(join(tmpdir(), "lienotheque-norme-"));
  try {
    const pages: { rang: number; mots: readonly { confiance?: number; l: number; h: number }[]; rendue: unknown }[] = [];
    for (let rang = 1; rang <= rendu.nombreDePages; rang += 1) {
      const deLaCouche = parRang.get(rang);
      if (deLaCouche !== undefined && coucheSuffisante(deLaCouche)) {
        pages.push({ rang, mots: deLaCouche.mots, rendue: undefined });
        continue;
      }
      const rendue = await rendu.page(rang, 1800);
      pages.push({ rang, mots: ocrDUnePageGrise(enGris(rendue), rang, bac, OCR).mots, rendue });
    }
    const qualites = pages.map((page) => qualiteDeLecture(page.mots));
    const suspectes = new Set(pagesQuiLisentMal(qualites));
    const voisines = qualites.filter((_, place) => !suspectes.has(place));
    const parMinimum = voisines.length > 0 ? Math.min(...voisines) : 0;
    const parMediane = mediane(voisines);

    console.log(`\n══ ${pdf.split("/").pop()} — ${pages.length} page(s) ══`);
    console.log(`   pages suspectes : ${suspectes.size === 0 ? "aucune" : [...suspectes].map((p) => `p${pages[p]!.rang}`).join(" · ")}`);
    console.log(`   norme par le minimum : ${parMinimum.toFixed(3)} · par la médiane : ${parMediane.toFixed(3)}`);

    // Ce que chaque norme donne sur les pages normales : combien de leurs mots sont fiables.
    const partFiable = (place: number, norme: number) =>
      (100 * motsFiables(pages[place]!.mots, norme)) / Math.max(1, pages[place]!.mots.length);
    const normales = qualites.map((_, place) => place).filter((place) => !suspectes.has(place));
    const moyenne = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    console.log(
      `   sur les pages normales, part de mots fiables : minimum ${moyenne(normales.map((p) => partFiable(p, parMinimum))).toFixed(0)} % · ` +
        `médiane ${moyenne(normales.map((p) => partFiable(p, parMediane))).toFixed(0)} %`,
    );

    // Et ce que chaque norme décide sur les pages suspectes.
    for (const place of suspectes) {
      const page = pages[place]!;
      if (page.rendue === undefined) continue;
      const essaisBruts = ([90, 180, 270] as const).map((rotation, rang) => {
        const lue = ocrDUnePageGrise(
          enGris(tournerRvba(page.rendue as Parameters<typeof tournerRvba>[0], rotation)),
          8000 + place * 10 + rang,
          bac,
          OCR,
        );
        return { rotation, mots: lue.mots };
      });
      for (const [nom, norme] of [["minimum", parMinimum], ["médiane", parMediane]] as const) {
        const essais = essaisBruts.map((essai) => ({
          rotation: essai.rotation,
          qualite: qualiteDeLecture(essai.mots),
          motsFiables: motsFiables(essai.mots, norme),
          partHorizontale: partHorizontale(essai.mots),
        }));
        const retenue = rotationQuiVaut(
          {
            qualite: qualites[place]!,
            motsFiables: motsFiables(page.mots, norme),
            partHorizontale: partHorizontale(page.mots),
          },
          essais,
          voisines,
        );
        console.log(
          `   p${page.rang} · norme ${nom} (${norme.toFixed(3)}) : telle quelle ${motsFiables(page.mots, norme)} fiables · ` +
            `${essais.map((e) => `${e.rotation}° ${e.motsFiables}`).join(" · ")} → ${retenue === undefined ? "rien" : `${retenue}°`}`,
        );
      }
    }
  } finally {
    await rendu.fermer();
    rmSync(bac, { recursive: true, force: true });
  }
}
