import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Préparation des tests de rendu (B6).
 *
 *  Les écrans lisent un instantané de bibliothèque. Sur cette machine, il vient du traitement du
 *  lot réel ; là où les fixtures sous droits sont absentes — l'intégration continue, une autre
 *  machine — on écrit celui de démonstration, pour que les trois moteurs aient quelque chose à
 *  montrer.
 *
 *  Ni l'un ni l'autre ne passe par `public/` : ce dossier est publiable et recopié tel quel dans
 *  la construction, et un instantané est produit depuis des fichiers sous droits. Les deux vont au
 *  cache de travail, hors du dépôt, et le greffon de Vite les sert de là (correction 8). */
export default async function preparer(): Promise<void> {
  const cache = process.env["LIENOTHEQUE_CACHE"] ?? "/Volumes/Macbook Pro/lienotheque-cache";
  const cible = process.env["LIENOTHEQUE_INSTANTANE"] ?? join(cache, "instantane", "bibliotheque.json");

  if (existsSync(cible)) {
    console.log(`Instantané réel : ${cible}`);
    return;
  }

  const { VUE_DEMONSTRATION } = await import("../src/donnees/vue-demonstration.js");
  mkdirSync(dirname(cible), { recursive: true });
  writeFileSync(cible, JSON.stringify(VUE_DEMONSTRATION));
  console.log(`Pas d'instantané réel : jeu de démonstration écrit dans ${cible}`);
}
