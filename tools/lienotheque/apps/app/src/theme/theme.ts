/** Les trois variantes de la charte v3. L'ordre est celui du sélecteur. */
export const THEMES = ["light", "hybrid", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** Libellés visibles, en français et sans jargon (CLAUDE.md, règle 8). */
export const LIBELLE_THEME: Readonly<Record<Theme, string>> = {
  light: "Clair",
  hybrid: "Hybride photographique",
  dark: "Sombre intégral",
};

export const THEME_PAR_DEFAUT: Theme = "light";
export const CLE_THEME = "lienotheque.theme";

export function estTheme(valeur: unknown): valeur is Theme {
  return typeof valeur === "string" && (THEMES as readonly string[]).includes(valeur);
}

/** Lecture tolérante : un stockage refusé (navigation privée) ne doit jamais casser l'interface. */
function lireMemoire(stockage: Storage | null): string | null {
  try {
    return stockage?.getItem(CLE_THEME) ?? null;
  } catch {
    return null;
  }
}

/** Thème du démarrage : ce que le script d'amorçage a déjà posé, sinon le choix mémorisé,
 *  sinon la préférence du système, sinon le clair. */
export function themeInitial(racine: HTMLElement, stockage: Storage | null, fenetre: Window | null): Theme {
  const pose = racine.dataset["theme"];
  if (estTheme(pose)) return pose;

  const memorise = lireMemoire(stockage);
  if (estTheme(memorise)) return memorise;

  const sombre = fenetre?.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return sombre === true ? "dark" : THEME_PAR_DEFAUT;
}

/** Pose le thème sur la racine du document et mémorise le choix. */
export function appliquerTheme(theme: Theme, racine: HTMLElement, stockage: Storage | null): void {
  racine.dataset["theme"] = theme;
  try {
    stockage?.setItem(CLE_THEME, theme);
  } catch {
    // Stockage indisponible : le thème reste appliqué pour la session en cours.
  }
}
