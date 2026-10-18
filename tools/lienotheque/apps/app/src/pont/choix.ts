import { administrationDuBureau, estBureau, lectureDuBureau } from "./bureau.js";
import { pontEnLigne } from "./ligne.js";
import type { PortAdministration, PortDeLecture } from "./port.js";

/** Qui répond, ici et maintenant — **et c'est le seul endroit qui le sache** (PLT-02, PLT-03).
 *
 *  Les écrans demandaient dix-sept fois « sommes-nous sur le bureau ? ». La question était la
 *  mauvaise : ce qui les intéresse n'est pas l'hôte, c'est de savoir si la capacité qu'ils
 *  veulent employer est là. Une garde `estBureau()` bloquait aussi bien une lecture qu'une
 *  écriture, alors que la version en ligne saura lire.
 *
 *  Ici, et nulle part ailleurs : le second pont se branche dans ces deux fonctions, sans qu'aucun
 *  écran ne change.
 */

/** L'adresse du service, quand la version en ligne en a une.
 *
 *  Posée à la construction, et non devinée depuis l'adresse de la page : la page et le service ne
 *  vivent pas au même endroit. Absente, la version en ligne n'a pas de pont — et c'est mieux
 *  qu'un pont qui appellerait une adresse inventée. */
const adresseDuService = (): string | undefined => {
  const lue = import.meta.env?.VITE_LIENOTHEQUE_SERVICE;
  return typeof lue === "string" && lue.length > 0 ? lue : undefined;
};

/** Lire ce qui existe. Le bureau le sait ; la version en ligne le sait maintenant aussi.
 *
 *  Le pont en ligne est construit à la demande, et non une fois pour toutes : il ne garde aucun
 *  état, et un pont construit au chargement du module aurait figé l'adresse avant qu'elle soit
 *  connue. */
export function pontDeLecture(): PortDeLecture | undefined {
  if (estBureau()) return lectureDuBureau;
  const base = adresseDuService();
  return base === undefined ? undefined : pontEnLigne({ base });
}

/** Construire et administrer. **Le bureau seul**, et c'est définitif : désigner un dossier n'a
 *  pas de sens dans un navigateur, et la file vit là où le traitement tourne. */
export function pontDAdministration(): PortAdministration | undefined {
  return estBureau() ? administrationDuBureau : undefined;
}
