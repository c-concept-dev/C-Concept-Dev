import type { DescriptionBibliotheque, Travail, TypeDeContenu } from "@lienotheque/contrats";
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
      readonly file: readonly Travail[];
      readonly accompagnements: readonly { readonly nom: string; readonly contenu: TypeDeContenu }[];
      readonly pagesATracer: readonly { readonly rang: number; readonly image: string }[];
      readonly zonesTracees: readonly { readonly cle: string; readonly role: "element" | "page_imprimee"; readonly rectangle: { readonly x: number; readonly y: number; readonly l: number; readonly h: number } }[];
    }
  | undefined
> {
  if (!(import.meta.env.DEV && demonstrationDemandee(recherche))) return undefined;
  const { ACCOMPAGNEMENTS, BIBLIOTHEQUE, EXEMPLES_ORGANISATION, FILE, PAGES_A_TRACER, ZONES_TRACEES } =
    await import("./demonstration.js");
  return {
    ...BIBLIOTHEQUE,
    exemples: EXEMPLES_ORGANISATION,
    file: FILE,
    accompagnements: ACCOMPAGNEMENTS,
    pagesATracer: PAGES_A_TRACER,
    zonesTracees: ZONES_TRACEES,
  };
}

/** Ce que l'adresse demande de chercher, pour montrer la recherche ouverte.
 *
 *  Même porte que le jeu de démonstration : développement seulement, et seulement si l'adresse
 *  le demande. Elle sert aux captures, où personne ne peut taper au clavier. */
export function rechercheDemandee(recherche: string): string | undefined {
  if (!(import.meta.env.DEV && demonstrationDemandee(recherche))) return undefined;
  const demandee = new URLSearchParams(recherche).get("chercher");
  return demandee === null || demandee === "" ? undefined : demandee;
}
