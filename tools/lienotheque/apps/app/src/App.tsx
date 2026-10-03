import type { JSX } from "react";
import { EnTete } from "./EnTete.js";
import { useTheme } from "./theme/useTheme.js";

export function App(): JSX.Element {
  const [theme, changerTheme] = useTheme();
  return (
    <>
      <a className="ln-skip" href="#contenu">
        Aller au contenu
      </a>
      <EnTete theme={theme} onThemeChange={changerTheme} />
      <main id="contenu" className="ln-layout" tabIndex={-1}>
        <h1 className="ln-bonjour">Bonjour</h1>
        <p className="ln-muted">Squelette du lot 0 : jetons, polices et bascule de thème en place.</p>
      </main>
    </>
  );
}
