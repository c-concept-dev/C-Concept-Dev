/** Les index de `lireLeTexte` sont-ils ceux du rendu, ou ceux de demi-pages ? */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { lireLeTexte } from "../src/texte.js";

const racine = process.argv[2]!;
for (const famille of readdirSync(racine).filter((n) => /^\d/u.test(n)).sort()) {
  const dossier = join(racine, famille);
  const nom = readdirSync(dossier).find((n) => n.toLowerCase().endsWith(".pdf"));
  if (nom === undefined) continue;
  const chemin = join(dossier, nom);
  // Sans option, exactement comme la voie générique l'appellerait : la détection est automatique.
  const lu = await lireLeTexte(chemin, {});
  const rendu = await ouvrirRenduPdf(chemin);
  const feuilles = rendu.nombreDePages;
  await rendu.fermer();
  const index = lu.pages.map((page) => page.index);
  const glisse = lu.pages.length !== feuilles;
  console.log(
    `${famille.slice(0, 38).padEnd(38)} rendu ${String(feuilles).padStart(3)} feuille(s)  ` +
      `texte ${String(lu.pages.length).padStart(3)} page(s)  ` +
      `${glisse ? "GLISSEMENT" : "aligné   "}  index ${index[0]}..${index[index.length - 1]}`,
  );
}
