import { VueBibliotheque } from "@lienotheque/contrats";
import { demonstrationDemandee } from "./chargement.js";

/** Chargement d'une vue de bibliothèque (B5).
 *
 *  Les écrans lisent des données réelles, servies par le port de dépôt sous forme d'instantané :
 *  un fichier par bibliothèque, dans un dossier ignoré par Git — ce sont des œuvres. Le jeu de
 *  démonstration n'existe qu'en développement, et seulement si l'adresse le demande ; à la
 *  construction de production `import.meta.env.DEV` vaut faux, l'import devient du code mort et
 *  le module n'est pas embarqué. */

export const DOSSIER_VUES = "donnees";

export const cheminDeVue = (id: string): string => `${DOSSIER_VUES}/${encodeURIComponent(id)}.json`;

/** Ce que le chargement peut rendre. « absente » n'est pas une erreur : au premier lancement, il
 *  n'y a rien, et l'écran doit le dire plutôt que de tourner. */
export type Chargement =
  | { readonly etat: "chargee"; readonly vue: VueBibliotheque }
  | { readonly etat: "absente" }
  | { readonly etat: "illisible"; readonly motif: string };

export async function chargerVue(id: string, recherche: string): Promise<Chargement> {
  if (import.meta.env.DEV && demonstrationDemandee(recherche)) {
    const { VUE_DEMONSTRATION } = await import("./vue-demonstration.js");
    return { etat: "chargee", vue: VUE_DEMONSTRATION };
  }

  let brut: unknown;
  try {
    const reponse = await fetch(cheminDeVue(id));
    if (!reponse.ok) return { etat: "absente" };
    brut = await reponse.json();
  } catch {
    return { etat: "absente" };
  }

  // L'instantané est revalidé à la lecture : un fichier écrit par une version antérieure de
  // l'outil ne doit jamais passer pour une vue valide (ID-06).
  const lu = VueBibliotheque.safeParse(brut);
  return lu.success ? { etat: "chargee", vue: lu.data } : { etat: "illisible", motif: lu.error.issues[0]?.message ?? "format inattendu" };
}
