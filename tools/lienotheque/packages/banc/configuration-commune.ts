/** La configuration que chaque paquet de ce dépôt reprend.
 *
 *  Elle ne porte qu'une chose : l'instrument du garde-fou des marges (dette D7). Un paquet qui ne
 *  la reprend pas ne rend aucun relevé, et le garde-fou refuse alors le passage en le nommant —
 *  c'est ainsi qu'un paquet neuf ne reste pas non mesuré en silence.
 *
 *  Les délais, eux, restent chez chaque paquet : `outils/recettes` et `outils/optimiseur` en
 *  posent de très longs pour de bonnes raisons, écrites chez eux. Les rassembler ici donnerait un
 *  délai unique, donc faux pour presque tout le monde. */
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Le chemin de l'instrument, calculé depuis ce fichier : un chemin écrit en dur dans chacun des
 *  dix-sept paquets serait dix-sept choses à corriger le jour où il bouge. */
export const coureurQuiChronometreLeCorps = fileURLToPath(
  new URL("./src/coureur-des-marges.ts", import.meta.url),
);

export const configurationCommune = defineConfig({
  test: { runner: coureurQuiChronometreLeCorps },
});

export default configurationCommune;
