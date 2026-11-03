/** Quel fichier ingéré correspond à quel dossier du corpus d'essai ?
 *
 *  Sans rien connaître des documents : on rend la première page de chacun à la même largeur et on
 *  compare les octets de pixels. Les extraits ayant été prouvés identiques à l'original sur cette
 *  page, l'empreinte suffit à les apparier.
 */
import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ouvrirRenduPdf } from "@lienotheque/lecteur-texte";

const racine = process.argv[2]!;
const SERVICE = new Set(["applications", "base", "cache", "derives", "sources", "sauvegardes"]);
const LARGEUR = 600;

const empreinteEtPages = async (pdf: string): Promise<{ pages: number; page1: string }> => {
  const rendu = await ouvrirRenduPdf(pdf);
  try {
    const page = await rendu.page(1, LARGEUR);
    const octets = Buffer.from(page.data.buffer, page.data.byteOffset, page.data.byteLength);
    return {
      pages: rendu.nombreDePages,
      page1: createHash("sha256").update(octets).digest("hex").slice(0, 16),
    };
  } finally {
    await rendu.fermer();
  }
};

const dossiers = readdirSync(racine).filter(
  (nom) => !nom.startsWith(".") && !SERVICE.has(nom) && statSync(join(racine, nom)).isDirectory(),
);

const parEmpreinte = new Map<string, string[]>();
for (const nom of dossiers) {
  const dossier = join(racine, nom);
  for (const fichier of readdirSync(dossier).filter((f) => f.toLowerCase().endsWith(".pdf"))) {
    const { pages, page1 } = await empreinteEtPages(join(dossier, fichier));
    parEmpreinte.set(page1, [...(parEmpreinte.get(page1) ?? []), `${nom} (${pages}p)`]);
  }
}

const ingerees: string[] = [];
const parcourir = (dossier: string): void => {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) parcourir(chemin);
    else if (entree.toLowerCase().endsWith(".pdf")) ingerees.push(chemin);
  }
};
parcourir(join(racine, "sources"));

console.log(`${dossiers.length} dossier(s), ${ingerees.length} fichier(s) ingéré(s)\n`);
for (const chemin of ingerees.sort()) {
  const { pages, page1 } = await empreinteEtPages(chemin);
  const nom = chemin.split("/").pop()!.slice(0, 12);
  const correspond = parEmpreinte.get(page1) ?? [];
  console.log(`${nom}  ${String(pages).padStart(4)}p  ${page1}  → ${correspond.join(" + ") || "AUCUN DOSSIER"}`);
}
