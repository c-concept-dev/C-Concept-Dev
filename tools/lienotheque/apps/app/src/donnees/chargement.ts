import type { DescriptionBibliotheque } from "@lienotheque/contrats";
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

/** La bibliothèque de démonstration, pour l'écran d'organisation et pour les captures.
 *
 *  Même condition que le jeu d'accueil : développement seulement, et seulement si l'adresse le
 *  demande. À la construction de production, `import.meta.env.DEV` vaut `false`, l'import
 *  dynamique devient du code mort, et rien de tout cela n'est embarqué. */
export async function chargerBibliothequeDemonstration(recherche: string): Promise<
  | {
      readonly racine: string;
      readonly description: DescriptionBibliotheque;
      readonly exemples: readonly { readonly titre: string; readonly situation: string; readonly valeurs: readonly string[] }[];
    }
  | undefined
> {
  if (!(import.meta.env.DEV && demonstrationDemandee(recherche))) return undefined;
  const { BIBLIOTHEQUE, EXEMPLES_ORGANISATION } = await import("./demonstration.js");
  return { ...BIBLIOTHEQUE, exemples: EXEMPLES_ORGANISATION };
}
