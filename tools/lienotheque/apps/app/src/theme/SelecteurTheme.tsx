import { useId, type JSX } from "react";
import { LIBELLE_THEME, THEMES, estTheme, type Theme } from "./theme.js";

type Props = { readonly theme: Theme; readonly onChange: (theme: Theme) => void };

/** Bascule clair / hybride / sombre intégral. Contrôle natif, étiquette permanente (UX-06). */
export function SelecteurTheme({ theme, onChange }: Props): JSX.Element {
  const id = useId();
  return (
    <div className="ln-row">
      <label htmlFor={id}>Thème</label>
      <select
        id={id}
        value={theme}
        onChange={(evenement) => {
          if (estTheme(evenement.target.value)) onChange(evenement.target.value);
        }}
      >
        {THEMES.map((valeur) => (
          <option key={valeur} value={valeur}>
            {LIBELLE_THEME[valeur]}
          </option>
        ))}
      </select>
    </div>
  );
}
