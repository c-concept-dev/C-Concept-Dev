/** Une page scannée à l'envers : la chaîne la redresse-t-elle avant de la lire ? (OUT-03, OUT-05)
 *
 *  Relevé le 6 novembre 2026 sur Aebersold 017 : la page 13 du PDF est un Scale Syllabus numérisé
 *  retourné. La reconnaissance en tire 1 391 « mots » dont aucun n'est un mot.
 *
 *  Le redresseur existe et il est bon — `rotationDePageFiable` croise l'avis d'orientation de
 *  l'outil avec un **gain de lecture** mesuré, et ne tranche que si les deux convergent. Mais
 *  `redresser` n'est passé nulle part dans le produit : une seule occurrence dans tout le dépôt,
 *  et c'est un contrôle sauté.
 *
 *  Ce programme mesure ce que le redressement rendrait, et rien d'autre.
 *
 *  Usage : une-page-a-l-envers.ts <document.pdf> <page>
 */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enGris, tournerRvba } from "@lienotheque/images";
import { ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { rotationDePageFiable, rotationParOsd } from "@lienotheque/redresseur";
import { ocrDUnePageGrise } from "@lienotheque/ingestion";

if (process.env["LIENOTHEQUE_JETON"] !== undefined) {
  console.error("Un jeton est présent dans l'environnement : arrêt (règle du 4 novembre 2026).");
  process.exit(2);
}
const MOTEURS = realpathSync(join(import.meta.dirname, "../../../apps/app/src-tauri/moteurs"));
const OCR = { binaire: join(MOTEURS, "bin/tesseract"), tessdata: join(MOTEURS, "tessdata") };
const [pdf, pageBrute] = process.argv.slice(2);
if (pdf === undefined || pageBrute === undefined) {
  console.error("usage : une-page-a-l-envers.ts <document.pdf> <page>");
  process.exit(2);
}
const rang = Number(pageBrute);

/** Ce qu'une lecture vaut : la part de ses mots qui sont des mots — des lettres, trois au moins. */
const partDeVraisMots = (mots: readonly { texte: string }[]): number => {
  if (mots.length === 0) return 0;
  const vrais = mots.filter((mot) => /^[\p{L}'’-]{3,}$/u.test(mot.texte)).length;
  return vrais / mots.length;
};

const rendu = await ouvrirRenduPdf(pdf);
const bac = mkdtempSync(join(tmpdir(), "lienotheque-envers-"));
try {
  const image = await rendu.page(rang, 1800);
  const grise = enGris(image);

  const avis = rotationParOsd(grise, OCR);
  const fiable = rotationDePageFiable(grise, OCR);
  console.log(`page ${rang} de ${pdf.split("/").pop()}`);
  console.log(`  avis d'orientation de l'outil : ${avis ?? "aucun"}`);
  console.log(`  rotation que la chaîne tiendrait pour fiable : ${fiable ?? "aucune"}`);

  const telleQuelle = ocrDUnePageGrise(grise, rang, bac, OCR);
  console.log(
    `\n  TELLE QUELLE  : ${telleQuelle.mots.length} mot(s), dont ${(partDeVraisMots(telleQuelle.mots) * 100).toFixed(0)} % de vrais mots`,
  );
  console.log(`     « ${telleQuelle.mots.slice(0, 12).map((mot) => mot.texte).join(" ")} »`);

  // Un rang distinct par rotation : `ocrDUnePageGrise` écrit « page-<rang>.pgm », et la lecture
  // est mise en cache par chemin, taille et horodatage. Quatre lectures sous le même rang
  // peuvent donc rendre la même chose — et c'est arrivé, ce qui a failli me faire conclure que
  // 90° et 180° se lisaient pareil.
  for (const [place, rotation] of ([90, 180, 270] as const).entries()) {
    const tournee = enGris(tournerRvba(image, rotation));
    const lue = ocrDUnePageGrise(tournee, 1000 + place, bac, OCR);
    console.log(
      `  TOURNÉE ${String(rotation).padStart(3)}° : ${lue.mots.length} mot(s), dont ${(partDeVraisMots(lue.mots) * 100).toFixed(0)} % de vrais mots`,
    );
    console.log(`     « ${lue.mots.slice(0, 12).map((mot) => mot.texte).join(" ")} »`);
  }
} finally {
  await rendu.fermer();
  rmSync(bac, { recursive: true, force: true });
}
