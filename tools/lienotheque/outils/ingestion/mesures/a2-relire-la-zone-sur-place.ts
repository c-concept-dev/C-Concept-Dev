/** A2 — une relecture locale de la zone suffit-elle, ou faut-il Vision ? (A2, OUT-05, OUT-10)
 *
 *  **Mesurer avant de bâtir.** Avant de dépenser une clé, on demande à l'outil déjà présent de
 *  relire les cases que la table dit en défaut — la même reconnaissance, mais sur la zone seule
 *  et en segmentation serrée au lieu de la page entière en blocs. Si cela rattrape, Vision n'a
 *  rien à faire là. Si cela ne rattrape pas, on saura ce que Vision doit rattraper, et le dire
 *  coûtera moins qu'un appel.
 *
 *  Aucun appel en ligne. Le programme refuse de démarrer si un jeton traîne.
 *
 *  Usage : a2-relire-la-zone-sur-place.ts <document.pdf> [première] [dernière]
 */
import { mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { lireLaTable } from "@lienotheque/noyau";
import { enGris, type ImageGrise } from "@lienotheque/images";
import { coucheSuffisante, lireCoucheTexte, lireParOcr, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { ocrDUnePageGrise } from "@lienotheque/ingestion";

if (process.env["LIENOTHEQUE_JETON"] !== undefined) {
  console.error("Un jeton est présent dans l'environnement : arrêt (règle du 4 novembre 2026).");
  process.exit(2);
}
const MOTEURS = realpathSync(join(import.meta.dirname, "../../../apps/app/src-tauri/moteurs"));
const OCR = { binaire: join(MOTEURS, "bin/tesseract"), tessdata: join(MOTEURS, "tessdata") };
const pdf = process.argv[2];
if (pdf === undefined) {
  console.error("usage : a2-relire-la-zone-sur-place.ts <document.pdf> [première] [dernière]");
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


/** Les façons de regarder une case, de la plus proche de la lecture d'origine à la plus insistante.
 *
 *  Rien n'est calibré ici : ce sont les segmentations que Tesseract nomme — une ligne, un mot, un
 *  bloc — et l'agrandissement est un entier, pas un réglage trouvé sur un document. Chacune est
 *  mesurée séparément pour qu'on sache laquelle paie, et ce qu'elle paie. */
const MANIERES = [
  { nom: "ligne (7)", segmentation: 7, grossir: 1 },
  { nom: "mot (8)", segmentation: 8, grossir: 1 },
  { nom: "mot (8) ×3", segmentation: 8, grossir: 3 },
  { nom: "bloc (6) ×3", segmentation: 6, grossir: 3 },
] as const;

/** Recadre une image grise sur une boîte, et l'agrandit d'un facteur entier par duplication.
 *  Pas d'interpolation : on n'invente aucun pixel qui n'était pas là. */
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
const bac = mkdtempSync(join(tmpdir(), "lienotheque-a2-"));
console.log(`${pdf.split("/").pop()} — pages ${premiere} à ${jusqua} sur ${rendu.nombreDePages}\n`);

let zonesEnTout = 0;
const gains = new Map<string, { retenues: number; secondes: number; appels: number }>();
for (const maniere of MANIERES) gains.set(maniere.nom, { retenues: 0, secondes: 0, appels: 0 });
/** Combien de manières doivent lire le même nombre pour qu'on le retienne. Deux : c'est le
 *  minimum qui fasse d'une lecture autre chose qu'une opinion, et le même seuil que le vote des
 *  marques. */
const ACCORD_MINIMAL = 2;
const accord = { retenues: 0, contradictions: 0, sansAccord: 0 };
/** Les cases en défaut qui tombent sur une rangée probablement fantôme. */
let fantomes = 0;

try {
  for (let rang = premiere; rang <= jusqua; rang += 1) {
    const deLaCouche = parRang.get(rang);
    const grise = enGris(await rendu.page(rang, 1800));
    const page =
      deLaCouche !== undefined && coucheSuffisante(deLaCouche)
        ? deLaCouche
        : ocrDUnePageGrise(grise, rang, bac, OCR);
    const table = lireLaTable(page.mots, OFFRE);
    if (table.aRelire.length === 0) continue;
    const parLaCouche = page.source === "couche_texte";
    console.log(
      `page ${String(rang).padStart(3)} : table de ${table.colonnes.length} colonnes, ` +
        `${table.rangees.length} rangées — ${table.incompletes.length} à trou, ` +
        `${table.suspectes.length} suspecte(s), ${table.aRelire.length} case(s) à relire` +
        `${parLaCouche ? " (lue par la couche : la zone n'est pas en pixels, sautée)" : ""}`,
    );
    if (parLaCouche) continue;
    zonesEnTout += table.aRelire.length;
    for (const zone of table.aRelire) {
      // Une rangée fantôme : `rangeesDeTable` construit une rangée par ligne de la page pour
      // **chaque** panneau. Sur une page dont les panneaux n'ont pas la même longueur, le
      // panneau court reçoit des rangées là où il ne porte rien. Une rangée dont une seule
      // cellule est remplie, sans intitulé, en est très probablement une — et la relire coûte
      // un appel sur du vide. On compte, on ne corrige pas encore.
      const sienne = table.rangees[zone.rangee]!;
      const remplies = sienne.cellules.filter((cellule) => cellule !== undefined).length;
      if (remplies <= 1 && sienne.intitule === "") fantomes += 1;
      const actuelle = table.rangees[zone.rangee]?.cellules[zone.colonne];
      const lectures: string[] = [];
      const nombres: (number | undefined)[] = [];
      for (const maniere of MANIERES) {
        const morceau = decouper(grise, zone, maniere.grossir);
        const chemin = join(bac, `zone-${rang}-${zone.rangee}-${zone.colonne}-${maniere.segmentation}-${maniere.grossir}.pgm`);
        writeFileSync(chemin, enPgm(morceau));
        const debut = Date.now();
        const lue = lireParOcr(chemin, morceau.largeur, morceau.hauteur, 1, { ...OCR, segmentation: maniere.segmentation });
        const secondes = (Date.now() - debut) / 1000;
        rmSync(chemin, { force: true });
        const texte = lue.mots.map((mot) => mot.texte).join(" ").trim();
        const nombre = /^\d+[.,:;]?$/.test(texte) ? Number.parseInt(texte, 10) : undefined;
        const compte = gains.get(maniere.nom)!;
        compte.appels += 1;
        compte.secondes += secondes;
        if (nombre !== undefined && nombre !== actuelle) compte.retenues += 1;
        nombres.push(nombre);
        lectures.push(`${maniere.nom} → ${texte === "" ? "rien" : `« ${texte} »`}`);
      }
      // L'accord entre manières, et rien d'autre. Une seule lecture rend des nombres
      // parfaitement formés et parfaitement faux — « 171 » pour un 13, « 327 » pour un 32,
      // « 710 » pour un 110 — et rien dans le texte ne les distingue d'une bonne lecture. Deux
      // manières qui lisent le même nombre, elles, ne se trompent pas de la même façon : c'est
      // le même principe que le vote déjà employé sur les marques.
      const parValeur = new Map<number, string[]>();
      for (const [place, nombre] of nombres.entries())
        if (nombre !== undefined) parValeur.set(nombre, [...(parValeur.get(nombre) ?? []), MANIERES[place]!.nom]);
      const accordees = [...parValeur.entries()].filter(([, qui]) => qui.length >= ACCORD_MINIMAL);
      const retenue = accordees.length === 1 ? accordees[0] : undefined;
      if (retenue !== undefined && retenue[0] !== actuelle) accord.retenues += 1;
      else if (accordees.length > 1) accord.contradictions += 1;
      else accord.sansAccord += 1;
      console.log(
        `   rangée ${String(zone.rangee + 1).padStart(2)} colonne ${zone.colonne + 1} ` +
          `(${actuelle === undefined ? "trou" : `lu ${actuelle}`}) · ${zone.pourquoi}` +
          `${retenue === undefined ? "" : `  ⇒ ${retenue[0]} (${retenue[1].join(" + ")})`}`,
      );
      for (const ligne of lectures) console.log(`      ${ligne}`);
    }
  }
} finally {
  rmSync(bac, { recursive: true, force: true });
}

console.log(
  `\n${zonesEnTout} case(s) en défaut sur des pages reconnues, ` +
    `dont ${fantomes} sur une rangée sans intitulé et à cellule unique — probablement fantôme.\n`,
);
console.log(
  `  par accord d'au moins ${ACCORD_MINIMAL} manières : ${accord.retenues} valeur(s) retenue(s), ` +
    `${accord.contradictions} contradiction(s), ${accord.sansAccord} sans accord\n`,
);
for (const [nom, compte] of gains)
  console.log(
    `  ${nom.padEnd(12)} ${String(compte.retenues).padStart(3)} nouvelle(s) valeur(s) sur ${compte.appels} appel(s), ` +
      `${compte.secondes.toFixed(1)} s au total` +
      `${compte.appels === 0 ? "" : ` (${((compte.secondes / compte.appels) * 1000).toFixed(0)} ms par case)`}`,
  );
