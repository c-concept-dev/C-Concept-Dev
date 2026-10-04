import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { emplacementInstantane } from "../emplacement-instantane.js";

/** Préparation des tests de rendu (B6).
 *
 *  Les écrans lisent un instantané de bibliothèque. Sur une machine de développement, il vient du
 *  traitement du lot réel ; là où les fixtures sous droits sont absentes — l'intégration continue,
 *  une autre machine — on écrit celui de démonstration, pour que les trois moteurs aient quelque
 *  chose à montrer.
 *
 *  Ni l'un ni l'autre ne passe par `public/` : ce dossier est publiable et recopié tel quel dans
 *  la construction, et un instantané est produit depuis des fichiers sous droits. Les deux vont au
 *  cache de travail (correction 8).
 *
 *  Où est ce cache n'est pas écrit ici : `ouvrirCache` connaît le volume prévu, et se replie sur
 *  un dossier local quand il n'est pas monté. Écrire le chemin en dur, c'était supposer un disque
 *  externe sur une machine d'intégration continue — et y échouer. */
export default async function preparer(): Promise<void> {
  const { instantane: cible } = emplacementInstantane();

  if (existsSync(cible)) {
    console.log(`Instantané réel : ${cible}`);
    return;
  }

  const { VUE_DEMONSTRATION } = await import("../src/donnees/vue-demonstration.js");
  mkdirSync(dirname(cible), { recursive: true });
  writeFileSync(cible, JSON.stringify(VUE_DEMONSTRATION));
  console.log(`Pas d'instantané réel : jeu de démonstration écrit dans ${cible}`);
}
