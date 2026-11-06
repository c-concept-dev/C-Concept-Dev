/** Image et coordonnées dans le même repère : la preuve par le découpage (OUT-03, OUT-04).
 *
 *  Demandée par Christophe le 6 novembre 2026, et c'est la seule preuve qui ne puisse pas mentir.
 *  Toutes les autres vérifient que la rotation est **décidée** ; celle-ci vérifie qu'elle est
 *  **portée** — de la lecture jusqu'au fichier que le Lecteur affichera.
 *
 *  On prend un mot lu sur la page redressée, on découpe **l'image réellement exportée** à sa
 *  boîte, et on relit le découpage. Il doit rendre ce mot. Si les deux repères divergeaient, le
 *  découpage tomberait ailleurs et rendrait autre chose — ou rien.
 *
 *  Sur le fichier exporté, et non sur un rendu refait : un rendu refait ne prouverait rien de
 *  l'export.
 *
 *  Usage : le-meme-repere.ts <document.pdf> <page> <mot attendu>
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lireLeTexte, exporterPages } from "@lienotheque/ingestion";
import { lireParOcr } from "@lienotheque/lecteur-texte";
import { decoderWebp, enGris, type ImageGrise } from "@lienotheque/images";

if (process.env["LIENOTHEQUE_JETON"] !== undefined) {
  console.error("Un jeton est présent dans l'environnement : arrêt (règle du 4 novembre 2026).");
  process.exit(2);
}
const MOTEURS = realpathSync(join(import.meta.dirname, "../../../apps/app/src-tauri/moteurs"));
const OCR = { binaire: join(MOTEURS, "bin/tesseract"), tessdata: join(MOTEURS, "tessdata") };
const [pdf, pageBrute, motVoulu] = process.argv.slice(2);
if (pdf === undefined || pageBrute === undefined || motVoulu === undefined) {
  console.error("usage : le-meme-repere.ts <document.pdf> <page> <mot attendu>");
  process.exit(2);
}
const rang = Number(pageBrute);

const bac = mkdtempSync(join(tmpdir(), "lienotheque-repere-"));
try {
  // 1. La chaîne lit, et redresse si elle le décide.
  const lu = await lireLeTexte(pdf);
  console.log(`redressements : ${lu.redressements.map((r) => `p${r.rang} ${r.rotation}°`).join(" · ") || "aucun"}`);
  const page = lu.pages.find((une) => une.index === rang);
  const mots = page?.mots ?? [];
  console.log(`page ${rang} : ${mots.length} mot(s)`);
  const mot = mots.find((candidat) => candidat.texte.toUpperCase().includes(motVoulu.toUpperCase()));
  if (mot === undefined) {
    console.error(`le mot « ${motVoulu} » n'a pas été lu sur cette page`);
    process.exit(1);
  }
  console.log(`mot lu : « ${mot.texte} » en x=${Math.round(mot.x)} y=${Math.round(mot.y)} l=${Math.round(mot.l)} h=${Math.round(mot.h)}`);

  // 2. L'export applique les rotations que la lecture a décidées.
  const sortie = join(bac, "pages");
  mkdtempSync(sortie);
  const exporte = await exporterPages(pdf, sortie, {
    vignettes: false,
    rotations: new Map(lu.redressements.map((r) => [r.rang, r.rotation])),
  });
  const exportee = exporte.pages.find((une) => une.index === rang - 1);
  if (exportee === undefined) {
    console.error("la page n'a pas été exportée");
    process.exit(1);
  }
  console.log(`image exportée : ${exportee.fichier} ${exportee.largeur}×${exportee.hauteur}`);

  // 3. Le fichier exporté, décodé.
  const image = await decoderWebp(readFileSync(join(sortie, exportee.fichier)));
  console.log(`décodée : ${image.width}×${image.height}`);

  // 4. La boîte du mot, ramenée à l'échelle de l'image exportée.
  // Le repère que la page déclare, et non une largeur supposée. Une page tournée d'un quart de
  // tour a pour largeur la hauteur du rendu : prendre 1800 faisait tomber le découpage ailleurs.
  const repere = page?.largeur;
  if (repere === undefined) {
    console.error("la page ne déclare pas son repère");
    process.exit(1);
  }
  const echelle = image.width / repere;
  console.log(`repère des mots : ${repere} px de large`);
  const marge = Math.round(mot.h * echelle * 0.15);
  const boite = {
    x: Math.max(0, Math.round(mot.x * echelle) - marge),
    y: Math.max(0, Math.round(mot.y * echelle) - marge),
    l: Math.round(mot.l * echelle) + 2 * marge,
    h: Math.round(mot.h * echelle) + 2 * marge,
  };
  console.log(`échelle ${echelle.toFixed(3)} · découpe x=${boite.x} y=${boite.y} ${boite.l}×${boite.h}`);

  // 5. Le découpage, relu.
  const grise = enGris(image as never);
  const x1 = Math.min(grise.largeur, boite.x + boite.l);
  const y1 = Math.min(grise.hauteur, boite.y + boite.h);
  const largeur = Math.max(1, x1 - boite.x);
  const hauteur = Math.max(1, y1 - boite.y);
  // Agrandi par duplication de pixels : rien n'est inventé, et un pavé de quelques dizaines de
  // pixels est trop petit pour l'outil tel quel.
  const grossir = 4;
  const pixels = new Uint8Array(largeur * grossir * hauteur * grossir);
  for (let y = 0; y < hauteur * grossir; y += 1)
    for (let x = 0; x < largeur * grossir; x += 1)
      pixels[y * largeur * grossir + x] =
        grise.pixels[(boite.y + Math.floor(y / grossir)) * grise.largeur + boite.x + Math.floor(x / grossir)] ?? 255;
  const decoupe: ImageGrise = { largeur: largeur * grossir, hauteur: hauteur * grossir, pixels };
  // Segmentation « une ligne » : un découpage à la boîte d'un mot n'est pas une page, et la
  // segmentation par blocs n'y voit rien. C'est la même leçon que pour la relecture d'une case.
  const chemin = join(bac, "decoupe.pgm");
  writeFileSync(
    chemin,
    Buffer.concat([Buffer.from(`P5\n${decoupe.largeur} ${decoupe.hauteur}\n255\n`), Buffer.from(decoupe.pixels)]),
  );
  const relu = lireParOcr(chemin, decoupe.largeur, decoupe.hauteur, 1, { ...OCR, segmentation: 7 });
  const texte = relu.mots.map((un) => un.texte).join(" ").trim();
  console.log(`\nLE DÉCOUPAGE REND : « ${texte} »`);
  const juste = texte.toUpperCase().includes(motVoulu.toUpperCase());
  console.log(juste ? `\n✔ image et coordonnées partagent le même repère.` : `\n✘ le découpage ne rend pas « ${motVoulu} ».`);
  process.exitCode = juste ? 0 : 1;
} finally {
  rmSync(bac, { recursive: true, force: true });
}
