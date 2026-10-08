import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import type { CasDouteux, DescriptionBibliotheque, SchemaBibliotheque, VueBibliotheque } from "@lienotheque/contrats";
import { EnTete } from "./EnTete.js";
import { chargerBibliothequeDemonstration, chargerDonnees } from "./donnees/chargement.js";
import { chargerVue } from "./donnees/vue.js";
import { ACCUEIL, ecrireRoute, lireRoute, type Route } from "./navigation.js";
import { ACCUEIL_VIDE, type DonneesAccueil } from "./donnees/modele.js";
import { Accueil } from "./pages/Accueil.js";
import { Catalogue } from "./pages/Catalogue.js";
import { Lecteur } from "./pages/Lecteur.js";
import { PremierLancement } from "./pages/PremierLancement.js";
import { Reglages } from "./pages/Reglages.js";
import { Verifier, type Decision } from "./pages/Verifier.js";
import { Creer } from "./pages/Creer.js";
import { Organisation } from "./pages/Organisation.js";
import { Prototype } from "./pages/Prototype.js";
import { chargerModeles } from "./donnees/modeles.js";
import { choisirDossier, creerBibliotheque, ecrireBibliotheque, estBureau } from "./pont/bureau.js";
import { useTheme } from "./theme/useTheme.js";

/** Les écrans qui tiennent dans la fenêtre au lieu de la faire défiler (correction 3). */
const PLEINE_HAUTEUR: ReadonlySet<Route["ecran"]> = new Set(["lecteur"]);

/** Navigation entre les écrans du lot C (B4). Chaque écran a son adresse : on y revient, on la
 *  partage, et le clavier y arrive comme la souris puisque ce sont des liens.
 *
 *  La coque `.ln-application` est une colonne de la hauteur de la fenêtre ; un écran qui doit y
 *  tenir — le Lecteur — le demande par `.ln-application--pleine` et fait défiler son contenu à
 *  l'intérieur (correction 3). */
export function App(): JSX.Element {
  const [theme, changerTheme] = useTheme();
  const [donnees, setDonnees] = useState<DonneesAccueil>(ACCUEIL_VIDE);
  const [vue, setVue] = useState<VueBibliotheque | undefined>(undefined);
  const [, setDepots] = useState<readonly string[]>([]);
  const [route, setRoute] = useState<Route>(() => lireRoute(globalThis.location?.hash ?? ""));
  const [decisions, setDecisions] = useState<readonly { cas: CasDouteux; decision: Decision }[]>([]);
  /** Les bibliothèques que cette session a créées, avec le dossier qui les porte. */
  const [creees, setCreees] = useState<readonly { racine: string; description: DescriptionBibliotheque }[]>([]);
  /** Trois éléments à montrer sous l'organisation. Vides tant que la bibliothèque n'a rien :
   *  on ne montre pas ce qu'elle donnera en l'inventant. */
  const [exemples, setExemples] = useState<Parameters<typeof Organisation>[0]["exemples"]>(undefined);
  const modeles = useMemo(() => chargerModeles(), []);

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
    void chargerBibliothequeDemonstration(globalThis.location?.search ?? "").then((bibliotheque) => {
      if (!vivant || bibliotheque === undefined) return;
      setCreees([{ racine: bibliotheque.racine, description: bibliotheque.description }]);
      setExemples(bibliotheque.exemples);
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

  /** Créer une bibliothèque : l'hôte écrit, jamais la page. Sans hôte — sur le web — on le dit
   *  plutôt que de faire semblant d'avoir créé quelque chose. */
  const creer = async (description: DescriptionBibliotheque, dossier: string): Promise<void> => {
    if (!estBureau())
      throw new Error("La création d’une bibliothèque demande l’application de bureau : elle seule écrit sur votre disque.");
    await creerBibliotheque(dossier, description);
    setCreees((anciennes) => [...anciennes, { racine: dossier, description }]);
    aller({ ecran: "organisation" });
  };

  /** La dernière bibliothèque créée : celle qu'on organise au sortir de l'assistant. */
  const derniere = creees[creees.length - 1];

  /** Une version de plus du schéma. L'hôte réécrit la description : la page n'écrit jamais. */
  const organiser = async (schema: SchemaBibliotheque): Promise<void> => {
    if (derniere === undefined) return;
    const description = { ...derniere.description, schema };
    if (estBureau()) await ecrireBibliotheque(derniere.racine, description);
    setCreees((anciennes) => anciennes.map((creee) => (creee === derniere ? { ...creee, description } : creee)));
  };

  const ecran = ((): JSX.Element | null => {
    if (route.ecran === "reglages") return <Reglages theme={theme} onThemeChange={changerTheme} />;
    if (route.ecran === "organisation")
      return derniere === undefined ? (
        <PremierLancement theme={theme} onCreer={() => aller({ ecran: "creer" })} onFichiers={deposer} />
      ) : (
        <Organisation
          description={derniere.description}
          onSchema={organiser}
          onValider={() => aller(ACCUEIL)}
          exemples={exemples}
        />
      );
    if (route.ecran === "creer")
      return (
        <Creer
          modeles={modeles}
          prises={creees.map((creee) => creee.description.id)}
          onCreer={creer}
          onAnnuler={() => aller(ACCUEIL)}
          onChoisirDossier={estBureau() ? () => choisirDossier("Où vivra cette bibliothèque ?") : undefined}
        />
      );
    if (vue === undefined || restants === undefined) {
      return donnees.bibliotheques.length === 0 ? (
        <PremierLancement theme={theme} onCreer={() => aller({ ecran: "creer" })} onFichiers={deposer} />
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
      <PremierLancement theme={theme} onCreer={() => aller({ ecran: "creer" })} onFichiers={deposer} />
    ) : (
      <Accueil donnees={donnees} onFichiers={deposer} />
    );
  })();

  return (
    <div className={`ln-application${PLEINE_HAUTEUR.has(route.ecran) ? " ln-application--pleine" : ""}`}>
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
      <div className="ln-application__vue">{ecran}</div>
      {estBureau() ? (
        <div className="ln-layout">
          <Prototype />
        </div>
      ) : null}
    </div>
  );
}
