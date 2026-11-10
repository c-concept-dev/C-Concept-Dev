/** L'instrument du garde-fou des marges : il chronomètre le **corps** de chaque contrôle.
 *
 *  C'est un coureur vitest, et non un rapporteur, pour une raison mesurée le 10 novembre 2026 : un
 *  rapporteur tourne dans le processus principal, où les événements de crochets arrivent par
 *  paquets. Chronométrer de là donnait **3 902 ms pour un crochet de 2 000 ms** et un corps
 *  négatif. Le coureur, lui, tourne là où le corps tourne.
 *
 *  ## Ce qu'il fait, et ce qu'il ne touche pas
 *
 *  `runTask` remplace exactement la branche que vitest emploie sans lui — `getFn(test)` puis
 *  `await fn()` — et l'entoure d'un chronomètre. Le délai du contrôle est posé **dans** cette
 *  fonction, au moment de la collecte : l'entourer ne le retire donc pas. Éprouvé, et c'est le
 *  contrôle le plus important de ce lot : sous l'instrument, un corps de 6 000 ms pour un délai de
 *  5 000 échoue toujours, « Test timed out in 5000ms ».
 *
 *  Il écrit une ligne par contrôle dans `.rapport-marges.jsonl`, à la racine du paquet, en
 *  **ajout** : deux ouvriers y écrivent à la fois, et des ajouts courts ne se mêlent pas. Le
 *  relevé est effacé avant chaque passage par le script qui juge — un relevé d'hier ferait juger
 *  un passage qui n'a pas eu lieu. */
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { VitestTestRunner } from "vitest/runners";
import { getFn } from "vitest/suite";
import { ligneDe, RELEVE_DES_MARGES, type TacheLue } from "./marges.js";

export default class CoureurDesMarges extends VitestTestRunner {
  /** Le relevé est écrit à la fin de **chaque** corps, et non à la fin du passage : un ouvrier
   *  qu'on abandonne — délai de ramassage dépassé, mémoire épuisée — n'écrit jamais sa fin de
   *  passage, et c'est précisément quand les corps sont longs que cela arrive. */
  async runTask(tache: unknown): Promise<void> {
    const fonction: (() => unknown) | undefined = getFn(tache);
    // Le message de vitest, mot pour mot : si l'instrument tombe, il doit tomber comme sans lui.
    if (fonction === undefined) throw new Error("Test function is not found. Did you add it using `setFn`?");
    const debut = performance.now();
    try {
      await fonction();
    } finally {
      const ligne = ligneDe(tache as TacheLue, performance.now() - debut);
      if (ligne !== undefined)
        appendFileSync(join(this.config.root, RELEVE_DES_MARGES), `${JSON.stringify(ligne)}\n`);
    }
  }
}
