/** La couche et le rendu comptent-ils les mêmes pages ? Sans quoi inverser leur ordre glisserait. */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { lireCoucheTexte, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";

const racine = process.argv[2]!;
let ecarts = 0;
for (const famille of readdirSync(racine).filter((n) => /^\d/u.test(n)).sort()) {
  const dossier = join(racine, famille);
  const nom = readdirSync(dossier).find((n) => n.toLowerCase().endsWith(".pdf"));
  if (nom === undefined) continue;
  // La couche d'abord : c'est l'ordre que l'on veut adopter, autant l'éprouver tel quel.
  const couche = await lireCoucheTexte(join(dossier, nom));
  const rendu = await ouvrirRenduPdf(join(dossier, nom));
  const memeCompte = couche.pages.length === rendu.nombreDePages;
  if (!memeCompte) ecarts += 1;
  // Les index de la couche sont-ils bien 1..n, sans trou ?
  const index = couche.pages.map((page) => page.index);
  const suite = index.every((valeur, place) => valeur === place + 1);
  console.log(
    `${famille.slice(0, 38).padEnd(38)} couche ${String(couche.pages.length).padStart(3)}  rendu ${String(rendu.nombreDePages).padStart(3)}  ` +
      `${memeCompte ? "égal" : "ÉCART"}  index 1..n ${suite ? "oui" : "NON"}`,
  );
  await rendu.fermer();
}
console.log(`\n${ecarts} écart(s)`);
