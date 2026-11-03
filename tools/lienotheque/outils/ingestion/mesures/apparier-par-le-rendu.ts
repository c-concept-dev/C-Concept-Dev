/** De quel original chaque extrait vient-il ? Comparé par l'image de sa première page.
 *
 *  La structure ne lit pas les extraits — c'est le défaut même qu'on répare. On passe donc par le
 *  rendu, qui les lit : deux pages identiques rendent des pixels identiques.
 */
import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { enGris } from "@lienotheque/images";
import { lireCoucheTexte, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";

const LARGEUR = 120;

/** Une empreinte grossière de la première page : assez pour distinguer deux documents. */
async function visageDePremierePage(chemin: string): Promise<string | undefined> {
  try {
    // La couche avant le rendu : la dette connue du 1er novembre 2026.
    await lireCoucheTexte(chemin);
    const rendu = await ouvrirRenduPdf(chemin);
    if (rendu.nombreDePages === 0) {
      await rendu.fermer();
      return undefined;
    }
    const gris = enGris(await rendu.page(1, LARGEUR));
    await rendu.fermer();
    // Un échantillon régulier des pixels, écrit en hexadécimal : comparable et compact.
    const pas = Math.max(1, Math.floor(gris.pixels.length / 256));
    let visage = "";
    for (let place = 0; place < gris.pixels.length; place += pas)
      visage += (gris.pixels[place]! >> 4).toString(16);
    return visage;
  } catch {
    return undefined;
  }
}

const racineOriginaux = process.argv[2]!;
const racineExtraits = process.argv[3]!;

const originaux: string[] = [];
for (const palier of readdirSync(racineOriginaux)) {
  const dossier = join(racineOriginaux, palier);
  if (!statSync(dossier).isDirectory()) continue;
  for (const nom of readdirSync(dossier)) if (nom.toLowerCase().endsWith(".pdf")) originaux.push(join(dossier, nom));
}
originaux.sort();

const visages: { chemin: string; visage: string }[] = [];
for (const chemin of originaux) {
  const visage = await visageDePremierePage(chemin);
  if (visage !== undefined) visages.push({ chemin, visage });
}
console.error(`${visages.length} visage(s) relevé(s) sur ${originaux.length} original(aux)`);

/** Combien de caractères diffèrent, en part du total. Deux rendus du même document par deux
 *  décodeurs différents ne sont pas identiques au pixel — c'est le défaut même qu'on répare —
 *  mais ils restent bien plus proches l'un de l'autre que de n'importe quel autre document. */
const distance = (un: string, autre: string): number => {
  const combien = Math.min(un.length, autre.length);
  if (combien === 0) return 1;
  let ecarts = 0;
  for (let place = 0; place < combien; place += 1) if (un[place] !== autre[place]) ecarts += 1;
  return ecarts / combien;
};

for (const famille of readdirSync(racineExtraits).filter((n) => /^\d/u.test(n)).sort()) {
  const dossier = join(racineExtraits, famille);
  if (!statSync(dossier).isDirectory()) continue;
  const nom = readdirSync(dossier).find((n) => n.toLowerCase().endsWith(".pdf"));
  if (nom === undefined) continue;
  const visage = await visageDePremierePage(join(dossier, nom));
  if (visage === undefined) {
    console.log(`${famille}\tILLISIBLE\t\t${nom}`);
    continue;
  }
  const classes = visages
    .map((candidat) => ({ ...candidat, ecart: distance(visage, candidat.visage) }))
    .sort((un, autre) => un.ecart - autre.ecart);
  const premier = classes[0]!;
  const second = classes[1];
  // L'écart au **second** dit si le premier est franc : deux documents différents se ressemblent
  // rarement autant que deux rendus du même.
  console.log(
    `${famille}\t${premier.chemin}\t${premier.ecart.toFixed(3)} vs ${second?.ecart.toFixed(3) ?? "—"}\t${nom}`,
  );
}
