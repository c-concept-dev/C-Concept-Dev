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

/** Cette construction est-elle celle de la version en ligne ?
 *
 *  **Un drapeau, et non une adresse.** Le service vit à la même origine que la page — c'est le
 *  Worker qui sert les deux —, donc il n'y a aucune adresse à régler : les appels sont relatifs.
 *
 *  Mais le drapeau ne disparaît pas pour autant, et j'avais annoncé le contraire. Une
 *  construction servie par `vite preview` **sans Worker derrière** est exactement ce que les
 *  épreuves de rendu emploient : elles lisent l'instantané que le greffon de Vite sert, et elles
 *  reposent sur l'absence de pont. Un pont présent en permanence appellerait un service qui
 *  n'est pas là.
 *
 *  Le drapeau dit donc « cette construction parle à un service », et rien de plus. */
const enLigne = (): boolean => import.meta.env?.VITE_LIENOTHEQUE_EN_LIGNE === "1";

/** Lire ce qui existe. Le bureau le sait ; la version en ligne le sait aussi.
 *
 *  Le pont en ligne est construit à la demande, et non une fois pour toutes : il ne garde aucun
 *  état, et rien ne gagnerait à le figer au chargement du module. */
export function pontDeLecture(): PortDeLecture | undefined {
  if (estBureau()) return lectureDuBureau;
  // Base vide : les appels sont relatifs, donc adressés à l'origine de la page — celle du Worker
  // qui la sert. C'est aussi ce qui fait que le témoin de session voyage : un témoin `SameSite=Lax`
  // ne part pas vers un autre site.
  return enLigne() ? pontEnLigne({ base: "" }) : undefined;
}

/** Construire et administrer. **Le bureau seul**, et c'est définitif : désigner un dossier n'a
 *  pas de sens dans un navigateur, et la file vit là où le traitement tourne. */
export function pontDAdministration(): PortAdministration | undefined {
  return estBureau() ? administrationDuBureau : undefined;
}
