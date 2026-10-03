import { useEffect, useState, type JSX } from "react";
import { EnTete } from "./EnTete.js";
import { chargerDonnees } from "./donnees/chargement.js";
import { ACCUEIL_VIDE, type DonneesAccueil } from "./donnees/modele.js";
import { Accueil } from "./pages/Accueil.js";
import { PremierLancement } from "./pages/PremierLancement.js";
import { Reglages } from "./pages/Reglages.js";
import { Prototype, estBureau } from "./pages/Prototype.js";
import { useTheme } from "./theme/useTheme.js";

export function App(): JSX.Element {
  const [theme, changerTheme] = useTheme();
  const [donnees, setDonnees] = useState<DonneesAccueil>(ACCUEIL_VIDE);
  const [, setDepots] = useState<readonly string[]>([]);
  const [fragment, setFragment] = useState<string>(() => globalThis.location?.hash ?? "");

  // Navigation du lot 0 : un fragment d'adresse. Les écrans du CDC arrivent au lot C.
  useEffect(() => {
    const suivre = (): void => setFragment(globalThis.location?.hash ?? "");
    globalThis.addEventListener?.("hashchange", suivre);
    return () => globalThis.removeEventListener?.("hashchange", suivre);
  }, []);

  // L'accueil part toujours vide ; seul le développement peut y verser un jeu de démonstration.
  useEffect(() => {
    let vivant = true;
    void chargerDonnees(globalThis.location?.search ?? "").then((chargees) => {
      if (vivant) setDonnees(chargees);
    });
    return () => {
      vivant = false;
    };
  }, []);

  const deposer = (fichiers: readonly File[]): void => setDepots(fichiers.map((fichier) => fichier.name));

  return (
    <>
      <a className="ln-skip" href="#contenu">
        Aller au contenu
      </a>
      <EnTete
        theme={theme}
        onThemeChange={changerTheme}
        onRecherche={() => {
          // Lot 0 : la recherche arrive avec le lot C (UX-02).
        }}
        donnees={donnees}
      />
      {fragment === "#reglages" ? (
        <Reglages theme={theme} onThemeChange={changerTheme} />
      ) : donnees.bibliotheques.length === 0 ? (
        <PremierLancement
          theme={theme}
          onCreer={() => {
            // Lot 0 : l'assistant de création arrive au lot C (UX-01).
          }}
          onFichiers={deposer}
        />
      ) : (
        <Accueil donnees={donnees} onFichiers={deposer} />
      )}
      {estBureau() ? (
        <div className="ln-layout">
          <Prototype />
        </div>
      ) : null}
    </>
  );
}
