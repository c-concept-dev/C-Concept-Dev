#!/usr/bin/env node
/** Le moteur de traitement, tel que l'hôte le lance (PLT-02, JOB-09).
 *
 *  Point d'entrée du binaire annexe, et rien de plus : il branche la boucle de messages sur les
 *  flux du processus. Tout ce qu'il sait faire est dans `processus.ts`, pour être éprouvé sans
 *  lancer de processus.
 *
 *  L'hôte le lance avec le plafond de mémoire du contrat :
 *
 *      node --max-old-space-size=<MEMOIRE_MAX_MO> moteur.js
 */
import { brancherSurLesFlux } from "./processus.js";

await brancherSurLesFlux();
