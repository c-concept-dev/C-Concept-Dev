import type { JSX } from "react";
import { SelecteurTheme } from "../theme/SelecteurTheme.js";
import type { Theme } from "../theme/theme.js";
import "./Reglages.css";

type Props = {
  readonly theme: Theme;
  readonly onThemeChange: (theme: Theme) => void;
};

/** Réglages. Le CDC en fait un écran à part entière (« Réglages et Atelier », lot C) :
 *  pour l'instant il n'accueille que l'apparence, et s'ouvre par l'adresse `#reglages`. */
export function Reglages({ theme, onThemeChange }: Props): JSX.Element {
  return (
    <main id="contenu" className="ln-layout ln-reglages" tabIndex={-1}>
      <div className="ln-panneau-titre">
        <h1 className="ln-reglages__titre">Réglages</h1>
      </div>

      <section className="ln-panneau" aria-labelledby="titre-apparence">
        <h2 id="titre-apparence" className="ln-reglages__section">
          Apparence
        </h2>
        <p className="ln-muted">
          Le thème s'applique tout de suite et reste choisi au prochain démarrage.
        </p>
        <SelecteurTheme theme={theme} onChange={onThemeChange} />
      </section>
    </main>
  );
}
