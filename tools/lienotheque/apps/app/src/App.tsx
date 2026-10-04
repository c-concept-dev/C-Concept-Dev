import { useEffect, useState, type JSX } from "react";
import { EnTete } from "./EnTete.js";
import { chargerDonnees } from "./donnees/chargement.js";
import { ACCUEIL_VIDE, type DonneesAccueil } from "./donnees/modele.js";
import { chargerVue, type Chargement } from "./donnees/vue.js";
import { aller, destinationDe, type Destination } from "./navigation.js";
import { Accueil } from "./pages/Accueil.js";
import { Lecteur } from "./pages/Lecteur.js";
import { PremierLancement } from "./pages/PremierLancement.js";
import { Reglages } from "./pages/Reglages.js";
import { Prototype, estBureau } from "./pages/Prototype.js";
import { useTheme } from "./theme/useTheme.js";

/** Coque de l'application : l'en-tête, puis l'écran que dit l'adresse (B4).
 *
 *  La coque occupe la hauteur de la fenêtre ; un écran qui doit y tenir — le Lecteur — le demande
 *  par `.ln-application--pleine` et fait défiler son contenu à l'intérieur (correction 3). */

/** Les écrans qui tiennent dans la fenêtre au lieu de la faire défiler. */
const PLEINE_HAUTEUR: ReadonlySet<Destination["ecran"]> = new Set(["lecteur"]);

export function App(): JSX.Element {
  const [theme, changerTheme] = useTheme();
  const [donnees, setDonnees] = useState<DonneesAccueil>(ACCUEIL_VIDE);
  const [, setDepots] = useState<readonly string[]>([]);
  const [fragment, setFragment] = useState<string>(() => globalThis.location?.hash ?? "");
  const [vue, setVue] = useState<Chargement>({ etat: "absente" });

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

  const destination = destinationDe(fragment);
  const bibliothequeId = "bibliothequeId" in destination ? destination.bibliothequeId : undefined;

  // La vue ne se recharge que quand on change de bibliothèque : tourner les pages ne la relit pas.
  useEffect(() => {
    if (bibliothequeId === undefined) {
      setVue({ etat: "absente" });
      return;
    }
    let vivant = true;
    void chargerVue(bibliothequeId, globalThis.location?.search ?? "").then((chargee) => {
      if (vivant) setVue(chargee);
    });
    return () => {
      vivant = false;
    };
  }, [bibliothequeId]);

  const deposer = (fichiers: readonly File[]): void => setDepots(fichiers.map((fichier) => fichier.name));

  const ecran = (): JSX.Element => {
    if (destination.ecran === "reglages") return <Reglages theme={theme} onThemeChange={changerTheme} />;

    if (destination.ecran === "lecteur") {
      if (vue.etat === "chargee")
        return (
          <Lecteur
            vue={vue.vue}
            page={destination.page}
            {...(destination.ancreId === undefined ? {} : { ancreId: destination.ancreId })}
            onPage={(numero) => aller({ ecran: "lecteur", bibliothequeId: destination.bibliothequeId, page: numero })}
            onElement={(ancreId) =>
              aller({ ecran: "lecteur", bibliothequeId: destination.bibliothequeId, page: destination.page, ancreId })
            }
          />
        );
      return (
        <main className="ln-layout" id="contenu">
          <p className="ln-muted">
            {vue.etat === "illisible" ? `Cette bibliothèque n’a pas pu être lue : ${vue.motif}.` : "Cette bibliothèque n’est pas encore disponible sur cet appareil."}
          </p>
        </main>
      );
    }

    if (donnees.bibliotheques.length === 0)
      return (
        <PremierLancement
          theme={theme}
          onCreer={() => {
            // L'assistant de création arrive avec le lot D (UX-01).
          }}
          onFichiers={deposer}
        />
      );
    return <Accueil donnees={donnees} onFichiers={deposer} />;
  };

  return (
    <div className={`ln-application${PLEINE_HAUTEUR.has(destination.ecran) ? " ln-application--pleine" : ""}`}>
      <a className="ln-skip" href="#contenu">
        Aller au contenu
      </a>
      <EnTete
        theme={theme}
        onThemeChange={changerTheme}
        onRecherche={() => {
          // La recherche plein texte arrive avec le lot D (RCH-01).
        }}
        donnees={donnees}
      />
      <div className="ln-application__vue">{ecran()}</div>
      {estBureau() ? (
        <div className="ln-layout">
          <Prototype />
        </div>
      ) : null}
    </div>
  );
}
