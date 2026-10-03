import { useCallback, useState } from "react";
import { appliquerTheme, themeInitial, type Theme } from "./theme.js";

const stockage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Thème courant et moyen d'en changer. L'état vit sur `document.documentElement`,
 *  comme dans le catalogue du kit : une seule source pour les trois variantes. */
export function useTheme(): readonly [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() =>
    themeInitial(document.documentElement, stockage(), globalThis.window ?? null),
  );

  const changer = useCallback((suivant: Theme) => {
    appliquerTheme(suivant, document.documentElement, stockage());
    setTheme(suivant);
  }, []);

  return [theme, changer] as const;
}
