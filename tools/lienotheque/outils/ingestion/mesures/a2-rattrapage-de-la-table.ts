/** A2 — ce que la relecture locale rattrape, table par table (A2, OUT-05, OUT-10).
 *
 *  **Sans toucher à la chaîne.** On mesure au niveau où le gain se décide : une rangée de table
 *  devient utilisable quand toutes ses cellules sont lues et qu'aucune n'est suspecte. Compter
 *  les rangées utilisables avant et après la relecture dit ce qu'A2 rattrape, sans rien changer
 *  à la voie oracle ni risquer d'attribuer à A2 un effet venu d'ailleurs.
 *
 *  Le relecteur est local : la même reconnaissance que la chaîne, sur la zone seule et en
 *  segmentation serrée. **Il ne rend une valeur que si au moins deux manières de regarder lisent
 *  le même nombre** — mesuré le 6 novembre 2026, une lecture isolée rend des nombres
 *  parfaitement formés et parfaitement faux (« 171 » pour un 13, « 327 » pour un 32).
 *
 *  Aucun appel en ligne. Le programme refuse de démarrer si un jeton traîne.
 *
 *  Usage : a2-rattrapage-de-la-table.ts <document.pdf> [première] [dernière]
 */
import { mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { lireLaTable } from "@lienotheque/noyau";
import { enGris, type ImageGrise } from "@lienotheque/images";
import { coucheSuffisante, lireCoucheTexte, lireParOcr, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { ocrDUnePageGrise, relireLesZones, type RelecteurDeZone } from "@lienotheque/ingestion";

if (process.env["LIENOTHEQUE_JETON"] !== undefined) {
  console.error("Un jeton est présent dans l'environnement : arrêt (règle du 4 novembre 2026).");
  process.exit(2);
}
const MOTEURS = realpathSync(join(import.meta.dirname, "../../../apps/app/src-tauri/moteurs"));
const OCR = { binaire: join(MOTEURS, "bin/tesseract"), tessdata: join(MOTEURS, "tessdata") };
const pdf = process.argv[2];
if (pdf === undefined) {
  console.error("usage : a2-rattrapage-de-la-table.ts <document.pdf> [première] [dernière]");
  process.exit(2);
}
const premiere = Number(process.argv[3] ?? 1);
const derniere = Number(process.argv[4] ?? 0);
/** Le vivier du document : les enregistrements posés à côté de lui. `lireLaTable` en a besoin
 *  pour dire si une colonne de nombres peut en désigner un (décision du 6 novembre 2026). */
const vivier = Number(
  process.env["LIENOTHEQUE_VIVIER"] ??
    readdirSync(dirname(pdf)).filter((n) => /\.(mp3|m4a|wav|flac|ogg|aac)$/i.test(n)).length,
);
const OFFRE = { enregistrements: vivier };


/** Les manières de regarder une case. Ce sont les segmentations que Tesseract nomme — une ligne,
 *  un mot, un bloc — et l'agrandissement est une duplication de pixels : rien n'est inventé. */
const MANIERES = [
  { segmentation: 7, grossir: 1 },
  { segmentation: 8, grossir: 1 },
  { segmentation: 8, grossir: 3 },
  { segmentation: 6, grossir: 3 },
] as const;
/** Combien de manières doivent lire le même nombre. Deux : le minimum qui fasse d'une lecture
 *  autre chose qu'une opinion, et le même seuil que le vote des marques. */
const ACCORD_MINIMAL = 2;

function decouper(image: ImageGrise, boite: { x: number; y: number; l: number; h: number }, grossir: number): ImageGrise {
  const x0 = Math.max(0, Math.floor(boite.x));
  const y0 = Math.max(0, Math.floor(boite.y));
  const x1 = Math.min(image.largeur, Math.ceil(boite.x + boite.l));
  const y1 = Math.min(image.hauteur, Math.ceil(boite.y + boite.h));
  const largeur = Math.max(1, x1 - x0) * grossir;
  const hauteur = Math.max(1, y1 - y0) * grossir;
  const pixels = new Uint8Array(largeur * hauteur);
  for (let y = 0; y < hauteur; y += 1)
    for (let x = 0; x < largeur; x += 1)
      pixels[y * largeur + x] = image.pixels[(y0 + Math.floor(y / grossir)) * image.largeur + (x0 + Math.floor(x / grossir))] ?? 255;
  return { largeur, hauteur, pixels };
}
const enPgm = (image: ImageGrise): Buffer =>
  Buffer.concat([Buffer.from(`P5\n${image.largeur} ${image.hauteur}\n255\n`), Buffer.from(image.pixels)]);

const rendu = await ouvrirRenduPdf(pdf);
const jusqua = derniere > 0 ? Math.min(derniere, rendu.nombreDePages) : rendu.nombreDePages;
const couche = await lireCoucheTexte(pdf);
const parRang = new Map(couche.pages.map((page) => [page.index, page]));
const bac = mkdtempSync(join(tmpdir(), "lienotheque-a2r-"));
console.log(`${pdf.split("/").pop()} — pages ${premiere} à ${jusqua} sur ${rendu.nombreDePages}\n`);

let appels = 0;
let secondesDeRelecture = 0;
let avantEnTout = 0;
let apresEnTout = 0;
let tables = 0;

try {
  for (let rang = premiere; rang <= jusqua; rang += 1) {
    const deLaCouche = parRang.get(rang);
    const grise = enGris(await rendu.page(rang, 1800));
    const page =
      deLaCouche !== undefined && coucheSuffisante(deLaCouche) ? deLaCouche : ocrDUnePageGrise(grise, rang, bac, OCR);
    if (page.source === "couche_texte") continue;
    const avant = lireLaTable(page.mots, OFFRE);
    if (!avant.estUneTable || avant.aRelire.length === 0) continue;
    tables += 1;

    const relire: RelecteurDeZone = async (demande) => {
      const parValeur = new Map<number, number>();
      for (const maniere of MANIERES) {
        const morceau = decouper(grise, demande, maniere.grossir);
        const chemin = join(bac, `z-${rang}-${Math.round(demande.x)}-${Math.round(demande.y)}-${maniere.segmentation}-${maniere.grossir}.pgm`);
        writeFileSync(chemin, enPgm(morceau));
        const debut = Date.now();
        const lue = lireParOcr(chemin, morceau.largeur, morceau.hauteur, 1, { ...OCR, segmentation: maniere.segmentation });
        secondesDeRelecture += (Date.now() - debut) / 1000;
        appels += 1;
        rmSync(chemin, { force: true });
        const texte = lue.mots.map((mot) => mot.texte).join(" ").trim();
        if (/^\d+[.,:;]?$/.test(texte)) {
          const valeur = Number.parseInt(texte, 10);
          parValeur.set(valeur, (parValeur.get(valeur) ?? 0) + 1);
        }
      }
      const accordees = [...parValeur.entries()].filter(([, combien]) => combien >= ACCORD_MINIMAL);
      // Une seule valeur peut l'emporter. Deux valeurs également soutenues, c'est une
      // contradiction — et une contradiction doit faire reculer, jamais choisir.
      return accordees.length === 1 ? String(accordees[0]![0]) : undefined;
    };

    const fait = await relireLesZones([{ page: rang, mots: page.mots }], relire, OFFRE);
    const apres = lireLaTable(fait.pages[0]!.mots!, OFFRE);
    avantEnTout += avant.utilisables.length;
    apresEnTout += apres.utilisables.length;
    const retenues = fait.traces.filter((trace) => trace.retenu !== undefined);
    console.log(
      `page ${String(rang).padStart(3)} : ${avant.rangees.length} rangées, ${avant.aRelire.length} case(s) en défaut · ` +
        `utilisables ${avant.utilisables.length} → ${apres.utilisables.length}` +
        `${apres.utilisables.length > avant.utilisables.length ? `  (+${apres.utilisables.length - avant.utilisables.length})` : ""}` +
        ` · ${retenues.length} valeur(s) retenue(s) sur ${fait.traces.length} case(s)`,
    );
    for (const trace of retenues)
      console.log(
        `     rangée ${String(trace.rangee + 1).padStart(2)} colonne ${trace.colonne + 1} ⇒ ${trace.retenu}` +
          `${trace.remplace === undefined ? " (trou comblé)" : ` (remplace ${trace.remplace})`}`,
      );
  }
} finally {
  rmSync(bac, { recursive: true, force: true });
  await rendu.fermer();
}

console.log(
  `\n${tables} table(s) à cases en défaut.\n` +
    `  rangées utilisables : ${avantEnTout} → ${apresEnTout} (${apresEnTout >= avantEnTout ? "+" : ""}${apresEnTout - avantEnTout})\n` +
    `  coût : ${appels} appel(s) de reconnaissance, ${secondesDeRelecture.toFixed(1)} s` +
    `${appels === 0 ? "" : ` (${((secondesDeRelecture / appels) * 1000).toFixed(0)} ms par appel, ${MANIERES.length} appels par case)`}`,
);
