import { administrationDuBureau, estBureau, lectureDuBureau } from "./bureau.js";
import type { PortAdministration, PortDeLecture } from "./port.js";

/** Qui répond, ici et maintenant — **et c'est le seul endroit qui le sache** (PLT-02, PLT-03).
 *
 *  Les écrans demandaient dix-sept fois « sommes-nous sur le bureau ? ». La question était la
 *  mauvaise : ce qui les intéresse n'est pas l'hôte, c'est de savoir si la capacité qu'ils
 *  veulent employer est là. Une garde `estBureau()` bloquait aussi bien une lecture qu'une
 *  écriture, alors que la version en ligne saura lire.
 *
 *  Ici, et nulle part ailleurs : le second pont se branchera dans ces deux fonctions, sans
 *  qu'aucun écran ne change.
 */

/** Lire ce qui existe. Le bureau le sait ; la version en ligne le saura. */
export function pontDeLecture(): PortDeLecture | undefined {
  return estBureau() ? lectureDuBureau : undefined;
}

/** Construire et administrer. **Le bureau seul**, et c'est définitif : désigner un dossier n'a
 *  pas de sens dans un navigateur, et la file vit là où le traitement tourne. */
export function pontDAdministration(): PortAdministration | undefined {
  return estBureau() ? administrationDuBureau : undefined;
}
