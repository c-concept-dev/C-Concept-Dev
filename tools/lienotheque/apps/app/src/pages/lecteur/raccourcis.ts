/** Raccourcis du Lecteur (UX-01, B1).
 *
 *  Déclarés ici, en données, pour que la ligne qui les annonce en bas de l'écran et le gestionnaire
 *  qui les écoute ne puissent pas diverger. Un raccourci affiché mais inopérant est pire que pas de
 *  raccourci du tout. */

export type Action = "lecture" | "precedent" | "suivant" | "boucle" | "ralentir" | "accelerer" | "distance";

export type Raccourci = { readonly touches: readonly string[]; readonly libelle: string; readonly action: Action };

export const RACCOURCIS: readonly Raccourci[] = [
  { touches: [" "], libelle: "Espace", action: "lecture" },
  { touches: ["ArrowLeft"], libelle: "←", action: "precedent" },
  { touches: ["ArrowRight"], libelle: "→", action: "suivant" },
  { touches: ["l", "L"], libelle: "L", action: "boucle" },
  { touches: ["["], libelle: "[", action: "ralentir" },
  { touches: ["]"], libelle: "]", action: "accelerer" },
  { touches: ["d", "D"], libelle: "D", action: "distance" },
];

/** Ce que la ligne du bas annonce : les touches groupées par ce qu'elles font. */
export const LEGENDE: readonly { readonly touches: string; readonly quoi: string }[] = [
  { touches: "Espace", quoi: "lecture" },
  { touches: "← →", quoi: "élément" },
  { touches: "L", quoi: "boucle" },
  { touches: "[ ]", quoi: "tempo" },
  { touches: "D", quoi: "mode à distance" },
];

/** L'action d'une touche, ou rien. Les touches frappées dans un champ ne comptent pas : on
 *  n'interrompt pas quelqu'un qui écrit une note. */
export function actionDe(touche: string, cible: EventTarget | null): Action | undefined {
  if (cible instanceof HTMLElement && (cible.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName)))
    return undefined;
  return RACCOURCIS.find((raccourci) => raccourci.touches.includes(touche))?.action;
}

/** Tempo : de la moitié à la vitesse normale, par pas de cinq pour cent (UX-01). */
export const TEMPO_MIN = 50;
export const TEMPO_MAX = 100;
export const TEMPO_PAS = 5;

export const tempoSuivant = (tempo: number, sens: 1 | -1): number =>
  Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round((tempo + sens * TEMPO_PAS) / TEMPO_PAS) * TEMPO_PAS));
