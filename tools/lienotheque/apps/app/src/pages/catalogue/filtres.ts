import type { ElementAffiche, FiltreAffiche, VueBibliotheque } from "@lienotheque/contrats";

/** Les axes du Catalogue (B3, CLA-10) et le tri qu'ils produisent.
 *
 *  Correction 7 : le groupe « Validé / À vérifier » est toujours là. Il ne dépend pas du schéma
 *  de la bibliothèque — c'est l'état du travail, pas une propriété du domaine — donc on le
 *  calcule quand l'instantané ne le porte pas, au lieu de laisser l'écran sans lui. */

export const CLE_ETAT = "etat";
export const VALIDE = "valide";
export const A_VERIFIER = "a_verifier";

/** Le groupe d'état, tel qu'il se déduit des éléments de la vue. */
export function groupeEtat(elements: readonly ElementAffiche[]): FiltreAffiche {
  const aVerifier = elements.filter((element) => element.aVerifier).length;
  return {
    cle: CLE_ETAT,
    nom: "État",
    valeurs: [
      { cle: VALIDE, nom: "Validé", nombre: elements.length - aVerifier },
      { cle: A_VERIFIER, nom: "À vérifier", nombre: aVerifier },
    ],
  };
}

/** Les axes à afficher : celui de l'état d'abord — c'est par là qu'on entre dans une
 *  bibliothèque qu'on vient de déposer — puis ceux du schéma. */
export function axesDe(vue: VueBibliotheque): readonly FiltreAffiche[] {
  const elements = vue.pages.flatMap((page) => page.elements);
  const duSchema = vue.filtres.filter((filtre) => filtre.cle !== CLE_ETAT);
  const porte = vue.filtres.find((filtre) => filtre.cle === CLE_ETAT);
  return [porte ?? groupeEtat(elements), ...duSchema];
}

/** Choix en cours : par axe, l'ensemble des valeurs retenues. Un axe sans choix ne filtre rien. */
export type Choix = Readonly<Record<string, readonly string[]>>;

/** Valeur qu'un élément prend sur un axe. Les axes du schéma sont lus sur ce que l'élément
 *  porte déjà : aucun mot de métier n'entre ici (CLA-01). */
function valeurSur(element: ElementAffiche, axe: string): string | undefined {
  if (axe === CLE_ETAT) return element.aVerifier ? A_VERIFIER : VALIDE;
  if (axe === "preuve") return element.pourquoi?.preuve;
  if (axe === "media") return element.media === undefined ? "sans" : "avec";
  return undefined;
}

export const retenu = (element: ElementAffiche, choix: Choix): boolean =>
  Object.entries(choix).every(([axe, valeurs]) => {
    if (valeurs.length === 0) return true;
    const valeur = valeurSur(element, axe);
    return valeur !== undefined && valeurs.includes(valeur);
  });

/** Bascule une valeur dans les choix : on ajoute, on retire, on ne remplace pas. */
export function basculer(choix: Choix, axe: string, valeur: string): Choix {
  const actuelles = choix[axe] ?? [];
  const suivantes = actuelles.includes(valeur) ? actuelles.filter((v) => v !== valeur) : [...actuelles, valeur];
  return { ...choix, [axe]: suivantes };
}

/** Recherche simple sur ce que l'écran montre : le numéro et le titre. La recherche plein texte
 *  du CDC (RCH-01) arrive avec le lot D ; celle-ci ne prétend pas la remplacer. */
export const correspond = (element: ElementAffiche, texte: string): boolean => {
  if (texte.length === 0) return true;
  const quoi = texte.toLocaleLowerCase("fr-FR");
  return element.numero.toLocaleLowerCase("fr-FR").includes(quoi) || (element.titre ?? "").toLocaleLowerCase("fr-FR").includes(quoi);
};
