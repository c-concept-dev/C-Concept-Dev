import { z } from "zod";
import { Horodatage } from "./commun.js";

/** Capacités réellement offertes par un service, telles qu'elles seront affichées
 *  avant toute confirmation (HEB-01). Vocabulaire fermé : aucun texte libre interprété.
 *
 *  `vision` est la relecture ciblée d'une zone difficile (OUT-08). Le mot est celui qu'emploient
 *  déjà la route et la preuve d'un lien ; l'écran qui l'affichera lui donnera son libellé
 *  français, comme pour les autres — ce sont des identifiants, pas du texte à montrer. */
export const Capacite = z.enum(["sante", "recherche", "synchronisation", "traduction", "vision"]);
export type Capacite = z.infer<typeof Capacite>;

/** Réponse de la route de santé. Elle traverse le réseau : elle a donc un contrat (règle 2).
 *  Elle ne dit rien de l'hébergement, ne cite aucun chemin et ne porte aucun secret (SEC-01). */
export const EtatService = z
  .object({
    service: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "Version sémantique attendue"),
    etat: z.enum(["pret", "degrade"]),
    horodatage: Horodatage,
    capacites: z.array(Capacite).min(1),
  })
  .strict();
export type EtatService = z.infer<typeof EtatService>;
