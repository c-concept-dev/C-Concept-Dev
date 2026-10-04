import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import type { CasDouteux, VueBibliotheque } from "@lienotheque/contrats";
import { EnTete } from "./EnTete.js";
import { chargerDonnees } from "./donnees/chargement.js";
import { chargerVue } from "./donnees/vue.js";
import { ACCUEIL, ecrireRoute, lireRoute, type Route } from "./navigation.js";
import { ACCUEIL_VIDE, type DonneesAccueil } from "./donnees/modele.js";
import { Accueil } from "./pages/Accueil.js";
import { Catalogue } from "./pages/Catalogue.js";
import { Lecteur } from "./pages/Lecteur.js";
import { PremierLancement } from "./pages/PremierLancement.js";
import { Reglages } from "./pages/Reglages.js";
import { Verifier, type Decision } from "./pages/Verifier.js";
import { Prototype, estBureau } from "./pages/Prototype.js";
import { useTheme } from "./theme/useTheme.js";

/** Navigation entre les écrans du lot C (B4). Chaque écran a son adresse : on y revient, on la
 *  partage, et le clavier y arrive comme la souris puisque ce sont des liens. */
export function App(): JSX.Element {
  const [theme, changerTheme] = useTheme();
  const [donnees, setDonnees] = useState<DonneesAccueil>(ACCUEIL_VIDE);
  const [vue, setVue] = useState<VueBibliotheque | undefined>(undefined);
  const [, setDepots] = useState<readonly string[]>([]);
  const [route, setRoute] = useState<Route>(() => lireRoute(globalThis.location?.hash ?? ""));
  const [decisions, setDecisions] = useState<readonly { cas: CasDouteux; decision: Decision }[]>([]);

  useEffect(() => {
    const suivre = (): void => setRoute(lireRoute(globalThis.location?.hash ?? ""));
    globalThis.addEventListener?.("hashchange", suivre);
    return () => globalThis.removeEventListener?.("hashchange", suivre);
  }, []);

  const aller = useCallback((suivante: Route): void => {
    if (globalThis.location !== undefined) globalThis.location.hash = ecrireRoute(suivante);
    setRoute(suivante);
  }, []);

  // L'accueil part toujours vide ; seul le développement peut y verser un jeu de démonstration.
  useEffect(() => {
    let vivant = true;
    void chargerDonnees(globalThis.location?.search ?? "").then((chargees) => {
      if (vivant) setDonnees(chargees);
    });
    void chargerVue().then((chargee) => {
      if (vivant) setVue(chargee);
    });
    return () => {
      vivant = false;
    };
  }, []);

  const deposer = (fichiers: readonly File[]): void => setDepots(fichiers.map((fichier) => fichier.name));

  /** Les cas restants : ceux sur lesquels aucune décision n'a encore été prise. */
  const restants = useMemo(() => {
    if (vue === undefined) return undefined;
    const decides = new Set(decisions.map((prise) => prise.cas.id));
    return { ...vue, douteux: vue.douteux.filter((cas) => !decides.has(cas.id)) };
  }, [vue, decisions]);

  const ecran = ((): JSX.Element | null => {
    if (route.ecran === "reglages") return <Reglages theme={theme} onThemeChange={changerTheme} />;
    if (vue === undefined || restants === undefined) {
      return donnees.bibliotheques.length === 0 ? (
        <PremierLancement theme={theme} onCreer={() => aller(ACCUEIL)} onFichiers={deposer} />
      ) : (
        <Accueil donnees={donnees} onFichiers={deposer} />
      );
    }
    if (route.ecran === "verifier")
      return (
        <Verifier
          vue={restants}
          onDecision={(cas, decision) => setDecisions([...decisions, { cas, decision }])}
          onAnnuler={() => setDecisions(decisions.slice(0, -1))}
          {...(decisions.length === 0 ? {} : { derniere: decisions[decisions.length - 1]! })}
        />
      );
    if (route.ecran === "lecteur")
      return (
        <Lecteur
          vue={vue}
          page={route.page}
          element={route.element ?? ""}
          onPage={(page) => aller({ ecran: "lecteur", page })}
          onElement={(element) => aller({ ecran: "lecteur", page: route.page, element })}
        />
      );
    if (route.ecran === "catalogue")
      return (
        <Catalogue
          vue={vue}
          {...(route.page === undefined ? {} : { page: route.page })}
          onPage={(page) => aller({ ecran: "catalogue", page })}
          onLecteur={(page, element) => aller({ ecran: "lecteur", page, element })}
          onAjouter={() => aller(ACCUEIL)}
        />
      );
    return donnees.bibliotheques.length === 0 ? (
      <PremierLancement theme={theme} onCreer={() => aller({ ecran: "catalogue" })} onFichiers={deposer} />
    ) : (
      <Accueil donnees={donnees} onFichiers={deposer} />
    );
  })();

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
      {ecran}
      {estBureau() ? (
        <div className="ln-layout">
          <Prototype />
        </div>
      ) : null}
    </>
  );
}
