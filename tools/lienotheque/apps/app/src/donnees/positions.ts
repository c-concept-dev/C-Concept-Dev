import type { Selecteur } from "@lienotheque/contrats";

/** Un endroit dans un document, avec le mot que le schéma de la bibliothèque emploie
 *  pour ses éléments numérotés (« piste », « diapositive »…). Règle 1 de CLAUDE.md :
 *  ce mot n'est jamais écrit dans un composant. */
export type Position = { readonly selecteur: Selecteur; readonly mot?: string };

const deuxChiffres = (n: number): string => String(Math.floor(n)).padStart(2, "0");

/** Minutage lisible d'une position temporelle (ANC : secondes depuis le début du média). */
export function minutage(secondes: number): string {
  const heures = Math.floor(secondes / 3600);
  const minutes = Math.floor((secondes % 3600) / 60);
  const reste = Math.floor(secondes % 60);
  return heures > 0
    ? `${heures}:${deuxChiffres(minutes)}:${deuxChiffres(reste)}`
    : `${minutes}:${deuxChiffres(reste)}`;
}

/** Rend un sélecteur en français, sans jargon (CLAUDE.md, règle 8). */
export function decrirePosition({ selecteur, mot }: Position): string {
  switch (selecteur.type) {
    case "page":
      return `Page ${selecteur.pageImprimee?.valeur ?? selecteur.index}`;
    case "chapitre":
      return `${mot ?? "Chapitre"} ${selecteur.ref}`;
    case "element":
      return `${mot ?? "Élément"} ${selecteur.valeur}`;
    case "temps":
      return minutage(selecteur.debut);
    case "zone":
      return `Page ${selecteur.page}`;
    case "texte":
      return `Caractères ${selecteur.debut} à ${selecteur.fin}`;
  }
}

const minuscule = (texte: string): string => texte.charAt(0).toLocaleLowerCase("fr-FR") + texte.slice(1);

/** « Chapitre 4, page 88 » : la première position garde sa majuscule, les suivantes non. */
export function decrireParcours(positions: readonly Position[]): string {
  return positions.map((position, rang) => (rang === 0 ? decrirePosition(position) : minuscule(decrirePosition(position)))).join(", ");
}
