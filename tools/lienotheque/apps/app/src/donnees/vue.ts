import { VueBibliotheque } from "@lienotheque/contrats";

/** D'où les écrans tirent leurs données (B5).
 *
 *  Le traitement local de F3 et F4 écrit un instantané du dépôt dans un dossier ignoré par Git —
 *  les fixtures sont sous droits et n'entrent jamais au dépôt. L'application le lit ici.
 *
 *  Ce n'est pas un second modèle : l'instantané est produit depuis le dépôt réel, par le même
 *  port. Au lot E, SQLite en WebAssembly lira la base directement et ce fichier disparaîtra. */

export const CHEMIN_INSTANTANE = "/donnees/bibliotheque.json";

/** Paramètre d'adresse qui réclame le jeu de démonstration, en développement seulement. */
export const PARAMETRE_DEMONSTRATION = "demonstration";

export const demonstrationDemandee = (recherche: string): boolean =>
  new URLSearchParams(recherche).has(PARAMETRE_DEMONSTRATION);

/** Variante du jeu de démonstration : un document composé en texte, donc sans aucune image de
 *  page. Elle n'existe que pour qu'on puisse atteindre l'écran de lecture du texte à la main,
 *  en développement, comme on atteint tous les autres. */
export const PARAMETRE_SANS_IMAGE = "sansImage";

export const sansImageDemandee = (recherche: string): boolean =>
  demonstrationDemandee(recherche) && new URLSearchParams(recherche).has(PARAMETRE_SANS_IMAGE);

/** Les passages du jeu de démonstration, et rien d'autre.
 *
 *  Hors démonstration, les passages viennent du dépôt par le pont : cette fonction rend un
 *  tableau vide plutôt que d'en inventer. */
export async function chargerPassages(recherche = globalThis.location?.search ?? ""): Promise<readonly import("@lienotheque/contrats").Passage[]> {
  if (!(import.meta.env.DEV && sansImageDemandee(recherche))) return [];
  const { PASSAGES_SANS_IMAGE } = await import("./vue-demonstration.js");
  return PASSAGES_SANS_IMAGE;
}

export async function chargerVue(chemin = CHEMIN_INSTANTANE, recherche = globalThis.location?.search ?? ""): Promise<VueBibliotheque | undefined> {
  if (import.meta.env.DEV && demonstrationDemandee(recherche)) {
    const { VUE_DEMONSTRATION, VUE_SANS_IMAGE } = await import("./vue-demonstration.js");
    return sansImageDemandee(recherche) ? VUE_SANS_IMAGE : VUE_DEMONSTRATION;
  }
  try {
    const reponse = await fetch(chemin);
    if (!reponse.ok) return undefined;
    const lu = VueBibliotheque.safeParse(await reponse.json());
    if (!lu.success) {
      console.warn("Instantané de bibliothèque illisible : il ne suit pas le contrat.", lu.error.issues);
      return undefined;
    }
    return lu.data;
  } catch {
    // Pas d'instantané : l'application montre l'accueil. Ce n'est pas une erreur, c'est un dépôt
    // vide — et c'est l'état de quiconque n'a encore rien importé.
    return undefined;
  }
}
