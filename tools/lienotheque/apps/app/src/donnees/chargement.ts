import { ACCUEIL_VIDE, type DonneesAccueil } from "./modele.js";

/** Paramètre d'adresse qui réclame le jeu de démonstration : `?demonstration`. */
export const PARAMETRE_DEMONSTRATION = "demonstration";

export const demonstrationDemandee = (recherche: string): boolean =>
  new URLSearchParams(recherche).has(PARAMETRE_DEMONSTRATION);

/** Données de l'accueil. Le jeu de démonstration n'existe qu'en développement et seulement
 *  si l'adresse le demande : la condition `import.meta.env.DEV` vaut `false` à la construction
 *  de production, l'import dynamique devient du code mort et le module n'est pas embarqué. */
export async function chargerDonnees(recherche: string): Promise<DonneesAccueil> {
  if (import.meta.env.DEV && demonstrationDemandee(recherche)) {
    const { DEMONSTRATION } = await import("./demonstration.js");
    return DEMONSTRATION;
  }
  return ACCUEIL_VIDE;
}
