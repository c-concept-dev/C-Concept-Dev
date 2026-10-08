import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import type {
  CasDouteux,
  DescriptionBibliotheque,
  SchemaBibliotheque,
  Travail,
  TypeDeContenu,
  VueBibliotheque,
} from "@lienotheque/contrats";
import { EnTete } from "./EnTete.js";
import { chargerBibliothequeDemonstration, chargerDonnees, rechercheDemandee } from "./donnees/chargement.js";
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
import { Depot, type ActionTravail } from "./pages/Depot.js";
import { Recherche } from "./pages/Recherche.js";
import { Prototype } from "./pages/Prototype.js";
import { chargerModeles } from "./donnees/modeles.js";
import {
  bibliothequesRetenues,
  choisirDossier,
  creerBibliotheque,
  ecrireBibliotheque,
  estBureau,
  lireBibliotheque,
  retenirBibliotheque,
  agirSurTravail,
  choisirFichiers,
  deposer as deposerChezLHote,
  faireTourner,
  travauxDe,
} from "./pont/bureau.js";
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
  /** Ce qui s'est passé à la dernière tentative d'ouverture, quand elle n'a mené à rien. */
  const [echecOuverture, setEchecOuverture] = useState<string | undefined>(undefined);
  /** La file de la bibliothèque ouverte, relue régulièrement : c'est l'hôte qui la tient. */
  const [file, setFile] = useState<readonly Travail[]>([]);
  const [accompagnements, setAccompagnements] = useState<readonly { nom: string; contenu: TypeDeContenu }[]>([]);
  const [refuses, setRefuses] = useState<readonly { nom: string; raison: string }[]>([]);
  /** La recherche est un voile par-dessus l'écran courant, pas un écran de plus : on revient
   *  exactement là où l'on était en la fermant. */
  const requeteDeLAdresse = useMemo(() => rechercheDemandee(globalThis.location?.search ?? ""), []);
  const [cherche, setCherche] = useState(requeteDeLAdresse !== undefined);

  // ⌘K ouvre la recherche depuis n'importe quel écran (UX-02). Ctrl+K pour les claviers qui
  // n'ont pas de touche Commande.
  useEffect(() => {
    const auClavier = (evenement: KeyboardEvent): void => {
      if ((evenement.metaKey || evenement.ctrlKey) && evenement.key.toLowerCase() === "k") {
        evenement.preventDefault();
        setCherche(true);
      }
    };
    globalThis.addEventListener?.("keydown", auClavier);
    return () => globalThis.removeEventListener?.("keydown", auClavier);
  }, []);

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
    // Les bibliothèques que l'hôte a retenues : sans elles, il faudrait repointer l'application
    // vers son dossier à chaque lancement.
    if (estBureau())
      void bibliothequesRetenues().then((retenues) => {
        if (vivant && retenues.length > 0) setCreees(retenues);
      });
    void chargerBibliothequeDemonstration(globalThis.location?.search ?? "").then((bibliotheque) => {
      if (!vivant || bibliotheque === undefined) return;
      setCreees([{ racine: bibliotheque.racine, description: bibliotheque.description }]);
      setExemples(bibliotheque.exemples);
      setFile(bibliotheque.file);
      setAccompagnements(bibliotheque.accompagnements);
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
    await retenirBibliotheque(dossier);
    setCreees((anciennes) => [...anciennes, { racine: dossier, description }]);
    aller({ ecran: "organisation" });
  };

  /** La bibliothèque ouverte. C'est elle dont on montre la file. */
  const courante = creees[creees.length - 1];

  // La file est à l'hôte : on la relit, on ne la devine pas. Toutes les deux secondes suffisent —
  // un traitement se compte en minutes, et un écran qui se redessine sans cesse fatigue.
  useEffect(() => {
    if (courante === undefined || !estBureau()) return undefined;
    let vivant = true;
    void faireTourner(courante.racine).catch((erreur: unknown) => {
      setEchecOuverture(erreur instanceof Error ? erreur.message : String(erreur));
    });
    const relire = (): void => {
      void travauxDe(courante.racine).then((travaux) => {
        if (vivant) setFile(travaux);
      });
    };
    relire();
    const battement = globalThis.setInterval(relire, 2000);
    return () => {
      vivant = false;
      globalThis.clearInterval(battement);
    };
  }, [courante]);

  /** Ouvre une bibliothèque qui existe déjà. L'hôte la retient, pour la retrouver au prochain
   *  lancement ; un dossier qui n'en porte pas le dit, au lieu d'ouvrir un écran vide. */
  const ouvrir = async (): Promise<void> => {
    setEchecOuverture(undefined);
    const racine = await choisirDossier("Quelle bibliothèque ouvrir ?");
    if (racine === undefined) return;
    try {
      const description = await lireBibliotheque(racine);
      if (description === undefined) {
        setEchecOuverture("Ce dossier ne porte pas de bibliothèque. Choisissez celui que Liénothèque a créé.");
        return;
      }
      await retenirBibliotheque(racine);
      setCreees((anciennes) => [{ racine, description }, ...anciennes.filter((autre) => autre.racine !== racine)]);
      aller({ ecran: "organisation" });
    } catch (erreur) {
      setEchecOuverture(erreur instanceof Error ? erreur.message : String(erreur));
    }
  };

  /** La dernière bibliothèque créée : celle qu'on organise au sortir de l'assistant. */
  const derniere = courante;

  /** Dépose des fichiers : l'hôte copie les originaux et met la file à jour. */
  const deposerDesFichiers = async (racine: string): Promise<void> => {
    const chemins = await choisirFichiers("Quels fichiers ajouter ?");
    if (chemins.length === 0) return;
    const arrivee = await deposerChezLHote(racine, chemins);
    setFile(arrivee.travaux);
    setAccompagnements((anciens) => [...anciens, ...arrivee.accompagnements]);
    setRefuses(arrivee.refuses);
  };

  /** Met un travail en pause, le reprend, ou l'annule. L'hôte décide, l'écran demande. */
  const agir = async (racine: string, id: string, action: ActionTravail): Promise<void> => {
    const apres = await agirSurTravail(racine, id, action);
    setFile((anciens) => anciens.map((travail) => (travail.id === apres.id ? apres : travail)));
  };

  /** Une version de plus du schéma. L'hôte réécrit la description : la page n'écrit jamais. */
  const organiser = async (schema: SchemaBibliotheque): Promise<void> => {
    if (derniere === undefined) return;
    const description = { ...derniere.description, schema };
    if (estBureau()) await ecrireBibliotheque(derniere.racine, description);
    setCreees((anciennes) => anciennes.map((creee) => (creee === derniere ? { ...creee, description } : creee)));
  };

  const ecran = ((): JSX.Element | null => {
    if (route.ecran === "reglages") return <Reglages theme={theme} onThemeChange={changerTheme} />;
    if (route.ecran === "depot")
      return derniere === undefined ? (
        <PremierLancement
          theme={theme}
          onCreer={() => aller({ ecran: "creer" })}
          onFichiers={deposer}
          onOuvrir={estBureau() ? () => void ouvrir() : undefined}
          echec={echecOuverture}
        />
      ) : (
        <Depot
          description={derniere.description}
          travaux={file}
          accompagnements={accompagnements}
          refuses={refuses}
          onParcourir={estBureau() ? () => void deposerDesFichiers(derniere.racine) : undefined}
          onFichiers={deposer}
          onAction={(id, action) => void agir(derniere.racine, id, action)}
          onVerifier={() => aller({ ecran: "verifier" })}
        />
      );
    if (route.ecran === "organisation")
      return derniere === undefined ? (
        <PremierLancement
          theme={theme}
          onCreer={() => aller({ ecran: "creer" })}
          onFichiers={deposer}
          onOuvrir={estBureau() ? () => void ouvrir() : undefined}
          echec={echecOuverture}
        />
      ) : (
        <Organisation
          description={derniere.description}
          onSchema={organiser}
          onValider={() => aller({ ecran: "depot" })}
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
        <PremierLancement
          theme={theme}
          onCreer={() => aller({ ecran: "creer" })}
          onFichiers={deposer}
          onOuvrir={estBureau() ? () => void ouvrir() : undefined}
          echec={echecOuverture}
        />
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
      <PremierLancement
          theme={theme}
          onCreer={() => aller({ ecran: "creer" })}
          onFichiers={deposer}
          onOuvrir={estBureau() ? () => void ouvrir() : undefined}
          echec={echecOuverture}
        />
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
        onRecherche={() => setCherche(true)}
        donnees={donnees}
      />
      <div className="ln-application__vue">{ecran}</div>
      {cherche && vue !== undefined ? (
        <Recherche
          vue={vue}
          actions={
            derniere === undefined
              ? undefined
              : [
                  { cle: "organisation", titre: "Revoir l’organisation", source: derniere.description.nom, aussi: ["axes", "valeurs", "ranger"] },
                  { cle: "depot", titre: "Ajouter des fichiers", source: derniere.description.nom, aussi: ["déposer", "traitement", "file"] },
                  { cle: "verifier", titre: "Vérifier ce qui attend un œil", source: derniere.description.nom, aussi: ["doutes", "cas"] },
                ]
          }
          {...(requeteDeLAdresse === undefined ? {} : { requeteInitiale: requeteDeLAdresse })}
          onFermer={() => setCherche(false)}
          onOuvrir={(resultat) => {
            setCherche(false);
            if (resultat.page !== undefined)
              aller(
                resultat.element === undefined
                  ? { ecran: "lecteur", page: resultat.page }
                  : { ecran: "lecteur", page: resultat.page, element: resultat.element },
              );
          }}
          onEcouter={(resultat) => {
            setCherche(false);
            if (resultat.page !== undefined && resultat.element !== undefined)
              aller({ ecran: "lecteur", page: resultat.page, element: resultat.element });
          }}
          onAction={(cle) => {
            setCherche(false);
            if (cle === "organisation") aller({ ecran: "organisation" });
            else if (cle === "depot") aller({ ecran: "depot" });
            else if (cle === "verifier") aller({ ecran: "verifier" });
          }}
        />
      ) : null}
      {estBureau() ? (
        <div className="ln-layout">
          <Prototype />
        </div>
      ) : null}
    </div>
  );
}
