/** Retrouver, dans une bibliothèque, le document entier dont un dossier d'essai ne porte qu'un
 *  extrait.
 *
 *  Rien d'autre que des pixels : la première page de l'extrait, rendue à une largeur fixe, puis la
 *  même page de chaque document de la bibliothèque. Un extrait pris depuis la première page a la
 *  même première page que son original — c'est donc l'empreinte qui apparie, sans titre, sans nom
 *  de fichier, sans métadonnée.
 *
 *  Usage : retrouver-les-entiers.ts <racine du corpus> <racine de la bibliothèque>
 */
import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ouvrirRenduPdf } from "@lienotheque/lecteur-texte";

const corpus = process.argv[2]!;
const bibliotheque = process.argv[3]!;
const SERVICE = new Set(["applications", "base", "cache", "derives", "sources", "sauvegardes"]);
const LARGEUR = 600;

const empreinte = async (pdf: string): Promise<{ pages: number; page1: string } | undefined> => {
  try {
    const rendu = await ouvrirRenduPdf(pdf);
    try {
      const page = await rendu.page(1, LARGEUR);
      const octets = Buffer.from(page.data.buffer, page.data.byteOffset, page.data.byteLength);
      return { pages: rendu.nombreDePages, page1: createHash("sha256").update(octets).digest("hex") };
    } finally {
      await rendu.fermer();
    }
  } catch (erreur) {
    console.error(`  (illisible : ${pdf.split("/").pop()} — ${String(erreur).slice(0, 70)})`);
    return undefined;
  }
};

const fichiers = (dossier: string, suffixe: string): string[] => {
  const trouves: string[] = [];
  const parcourir = (ou: string): void => {
    for (const entree of readdirSync(ou)) {
      const chemin = join(ou, entree);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (entree.toLowerCase().endsWith(suffixe)) trouves.push(chemin);
    }
  };
  parcourir(dossier);
  return trouves.sort();
};

const dossiers = readdirSync(corpus).filter(
  (nom) => !nom.startsWith(".") && !SERVICE.has(nom) && statSync(join(corpus, nom)).isDirectory(),
);

const cherches = new Map<string, string>();
for (const nom of dossiers) {
  for (const pdf of readdirSync(join(corpus, nom)).filter((f) => f.toLowerCase().endsWith(".pdf"))) {
    const vu = await empreinte(join(corpus, nom, pdf));
    if (vu !== undefined) cherches.set(vu.page1, `${nom} (${vu.pages}p)`);
  }
}
console.log(`${cherches.size} première(s) page(s) à retrouver sur ${dossiers.length} dossier(s)\n`);

const candidats = fichiers(join(bibliotheque, "sources"), ".pdf");
console.log(`${candidats.length} document(s) à examiner\n`);
let trouves = 0;
for (const [place, candidat] of candidats.entries()) {
  const vu = await empreinte(candidat);
  if (vu === undefined) continue;
  const quel = cherches.get(vu.page1);
  if (quel === undefined) continue;
  trouves += 1;
  console.log(`TROUVÉ  ${quel.padEnd(42)} ← ${candidat.split("/").pop()}  ${vu.pages} page(s)`);
  cherches.delete(vu.page1);
  if (cherches.size === 0) {
    console.log(`\ntout apparié après ${place + 1} document(s) examiné(s)`);
    break;
  }
}
console.log(`\n${trouves} apparié(s) ; ${cherches.size} sans original : ${[...cherches.values()].join(", ")}`);
