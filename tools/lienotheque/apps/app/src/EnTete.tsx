import type { JSX } from "react";
import emblemeClair from "@kit/assets/emblem-light.svg";
import emblemeSombre from "@kit/assets/emblem-dark.svg";
import { SelecteurTheme } from "./theme/SelecteurTheme.js";
import type { Theme } from "./theme/theme.js";

type Props = { readonly theme: Theme; readonly onThemeChange: (theme: Theme) => void };

/** Barre permanente : l'emplacement des commandes principales ne change jamais (UX-09).
 *  Le logo est le vectoriel validé du kit ; l'hybride garde la barre graphite, donc l'emblème sombre. */
export function EnTete({ theme, onThemeChange }: Props): JSX.Element {
  const embleme = theme === "light" ? emblemeClair : emblemeSombre;
  return (
    <header className="ln-shell">
      <div className="ln-brand">
        <img src={embleme} alt="" width={28} height={28} />
        Liénothèque
      </div>
      <SelecteurTheme theme={theme} onChange={onThemeChange} />
    </header>
  );
}
