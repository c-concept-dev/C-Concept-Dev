import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Préparation des tests de rendu (B6).
 *
 *  Les écrans lisent un instantané de bibliothèque servi par l'application. En local, il vient du
 *  traitement de F3 et F4 ; là où les fixtures sous droits sont absentes — l'intégration continue,
 *  une autre machine — on écrit celui de démonstration, pour que les trois moteurs aient quelque
 *  chose à montrer.
 *
 *  Le fichier va dans `public/donnees/`, ignoré par Git : rien de ce qui est produit ici n'entre
 *  au dépôt. */
export default async function preparer(): Promise<void> {
  const ici = dirname(fileURLToPath(import.meta.url));
  const cible = join(ici, "../public/donnees/bibliotheque.json");
  const { VUE_DEMONSTRATION } = await import("../src/donnees/vue-demonstration.js");

  mkdirSync(dirname(cible), { recursive: true });
  writeFileSync(cible, JSON.stringify(VUE_DEMONSTRATION, null, 1));
  console.log(`Instantané de démonstration écrit : ${cible}`);
}
