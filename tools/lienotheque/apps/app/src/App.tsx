import { useState, type JSX } from "react";
import { EnTete } from "./EnTete.js";
import { Accueil } from "./pages/Accueil.js";
import { Prototype, estBureau } from "./pages/Prototype.js";
import { useTheme } from "./theme/useTheme.js";

export function App(): JSX.Element {
  const [theme, changerTheme] = useTheme();
  const [, setDepots] = useState<readonly string[]>([]);

  return (
    <>
      <a className="ln-skip" href="#contenu">
        Aller au contenu
      </a>
      <EnTete
        theme={theme}
        onThemeChange={changerTheme}
        onRecherche={() => {
          // Lot 0 : l'accueil est statique, la recherche arrive avec le lot C (UX-02).
        }}
        traitements={1}
      />
      <Accueil onFichiers={(fichiers) => setDepots(fichiers.map((fichier) => fichier.name))} />
      {estBureau() ? (
        <div className="ln-layout">
          <Prototype />
        </div>
      ) : null}
    </>
  );
}
