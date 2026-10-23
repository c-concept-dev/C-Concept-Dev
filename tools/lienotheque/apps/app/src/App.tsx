import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import type {
  CasDouteux,
  ApercuDocument,
  ClassementLocal,
  DescriptionBibliotheque,
  DocumentSuspect,
  Doublons as DoublonsTrouves,
  Passage,
  SchemaBibliotheque,
  Travail,
  TypeDeContenu,
  VueBibliotheque,
} from "@lienotheque/contrats";
import { BROUILLON_NEUF, bilanDEssai, depuisRecette, enRecette, memeFile, type Brouillon } from "@lienotheque/noyau";
import { EnTete } from "./EnTete.js";
import { chargerBibliothequeDemonstration, chargerDonnees, rechercheDemandee } from "./donnees/chargement.js";
import { chargerPassages, chargerVue } from "./donnees/vue.js";
import { ACCUEIL, ecrireRoute, lireRoute, type Route } from "./navigation.js";
import { journaliser } from "./pont/bureau.js";
import { ACCUEIL_VIDE, type DonneesAccueil } from "./donnees/modele.js";
import { pourLAccueil } from "./donnees/accueil.js";
import { Accueil } from "./pages/Accueil.js";
import { Catalogue } from "./pages/Catalogue.js";
import { Entrer } from "./pages/Entrer.js";
import { Lecteur } from "./pages/Lecteur.js";
import { LectureDuTexte } from "./pages/LectureDuTexte.js";
import { parOuLire, quelquesImagesSeulement } from "./lire-ou-montrer.js";
import { PremierLancement } from "./pages/PremierLancement.js";
import { RienAMontrer } from "./pages/RienAMontrer.js";
import { Reglages } from "./pages/Reglages.js";
import { Verifier, type Decision } from "./pages/Verifier.js";
import { Creer } from "./pages/Creer.js";
import { Retirer } from "./pages/Retirer.js";
import { Doublons } from "./pages/Doublons.js";
import { Organisation } from "./pages/Organisation.js";
import { Depot, type ActionTravail } from "./pages/Depot.js";
import { Recherche } from "./pages/Recherche.js";
import { ManiereDeLire, type Essai } from "./pages/ManiereDeLire.js";
import { Prototype } from "./pages/Prototype.js";
import { chargerModeles } from "./donnees/modeles.js";
import { pontDAdministration, pontDeLecture } from "./pont/choix.js";
import { PasIdentifie } from "./pont/ligne.js";
import { useTheme } from "./theme/useTheme.js";

/** La bibliothèque que le service sert, quand c'est lui qui répond.
 *
 *  Elle n'a pas de dossier, et ce n'est pas un trou à combler : le pont en ligne reçoit `racine`
 *  et ne s'en sert pas — il n'y a qu'une bibliothèque derrière la façade, celle que le Worker a
 *  en liaison. Une constante de module plutôt qu'un objet refait à chaque rendu : les effets de
 *  lecture ont `courante` en dépendance, et un nouvel objet à chaque passage les relancerait
 *  sans fin.
 *
 *  Sans elle, `creees` restait vide en ligne — rien n'y crée de bibliothèque, puisque créer est
 *  un geste de bureau — donc `courante` restait indéfinie, **rien n'était jamais demandé au
 *  service**, et tous les écrans retombaient sur le premier lancement. C'est exactement ce qu'on
 *  voyait le 20 octobre 2026 en ouvrant `#catalogue` en ligne. */
const SERVIE_EN_LIGNE = { racine: "" } as const;

/** Les écrans qui tiennent dans la fenêtre au lieu de la faire défiler (correction 3). */
const PLEINE_HAUTEUR: ReadonlySet<Route["ecran"]> = new Set(["lecteur"]);

/** Navigation entre les écrans du lot C (B4). Chaque écran a son adresse : on y revient, on la
 *  partage, et le clavier y arrive comme la souris puisque ce sont des liens.
 *
 *  La coque `.ln-application` est une colonne de la hauteur de la fenêtre ; un écran qui doit y
 *  tenir — le Lecteur — le demande par `.ln-application--pleine` et fait défiler son contenu à
 *  l'intérieur (correction 3). */
export function App(): JSX.Element {
  // Qui répond, ici. Les écrans demandaient dix-sept fois « sommes-nous sur le bureau ? » —
  // la mauvaise question : ce qui les intéresse est de savoir si la capacité qu'ils veulent
  // est là. Une lecture n'a pas à être bloquée parce qu'une écriture est impossible.
  const lecture = pontDeLecture();
  const administration = pontDAdministration();

  const [theme, changerTheme] = useTheme();
  const [donnees, setDonnees] = useState<DonneesAccueil>(ACCUEIL_VIDE);
  /** Le document dont les écrans montrent la version active. Un seul à la fois aujourd'hui. */
  const [regarde, setRegarde] = useState<string | undefined>(undefined);
  const [vue, setVue] = useState<VueBibliotheque | undefined>(undefined);
  // Le texte du document regardé, lu à part de sa vue et jamais recopié dedans.
  const [passages, setPassages] = useState<readonly Passage[]>([]);
  // Le classement de chaque document de la bibliothèque, lu d'un coup : les filtres
  // comptent dessus, et les demander un par un vaudrait autant d'allers-retours.
  const [classements, setClassements] = useState<ReadonlyMap<string, ClassementLocal>>(new Map());
  const [documents, setDocuments] = useState<readonly ApercuDocument[]>([]);
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
  /** Le service nous connaît-il ? **La page ne peut pas le savoir seule.**
   *
   *  Le témoin de session est `HttpOnly` par conception (LIV-04) : aucun script ne le lit, pas
   *  même le nôtre. On l'apprend donc de la seule façon possible — en demandant, et en voyant si
   *  l'on est reçu. Tant qu'on n'a pas demandé, on ne prétend ni l'un ni l'autre. */
  const [recuEnLigne, setRecuEnLigne] = useState<"on ne sait pas" | "oui" | "non">("on ne sait pas");
  /** La file de la bibliothèque ouverte, relue régulièrement : c'est l'hôte qui la tient. */
  const [file, setFile] = useState<readonly Travail[]>([]);
  const [accompagnements, setAccompagnements] = useState<readonly { nom: string; contenu: TypeDeContenu }[]>([]);
  const [refuses, setRefuses] = useState<readonly { nom: string; raison: string }[]>([]);
  /** La recherche est un voile par-dessus l'écran courant, pas un écran de plus : on revient
   *  exactement là où l'on était en la fermant. */
  const requeteDeLAdresse = useMemo(() => rechercheDemandee(globalThis.location?.search ?? ""), []);
  const [cherche, setCherche] = useState(requeteDeLAdresse !== undefined);
  /** L'éditeur de manière de lire : le document regardé, ses pages, le brouillon, l'essai. */
  const [maniere, setManiere] = useState<{
    document: string;
    /** L'empreinte du document montré : c'est par elle qu'on en demande d'autres pages, et c'est
     *  elle qui le range dans la bibliothèque. */
    empreinte: string;
    pages: readonly { rang: number; image: string }[];
    brouillon: Brouillon;
    essai?: Essai | undefined;
    occupe?: boolean | undefined;
    echec?: string | undefined;
  }>({ document: "", empreinte: "", pages: [], brouillon: BROUILLON_NEUF });

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

  // Ce que l'application montre, porté au journal de l'hôte à chaque changement d'écran. Sans
  // cela, un écran qui ne s'affiche pas dans le paquet ne laisse aucune trace.
  useEffect(() => {
    journaliser(`écran ${route.ecran} · adresse ${globalThis.location?.hash ?? "(aucune)"}`);
  }, [route]);

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
    // Hors démonstration, ceci rend un tableau vide : les passages viennent alors du pont, avec
    // le document qu'on ouvre.
    void chargerPassages().then((charges) => {
      if (vivant && charges.length > 0) setPassages(charges);
    });
    // Les bibliothèques que l'hôte a retenues : sans elles, il faudrait repointer l'application
    // vers son dossier à chaque lancement.
    if (administration !== undefined)
      void administration.bibliothequesRetenues().then((retenues) => {
        if (vivant && retenues.length > 0) setCreees(retenues);
      });
    void chargerBibliothequeDemonstration(globalThis.location?.search ?? "").then((bibliotheque) => {
      if (!vivant || bibliotheque === undefined) return;
      setCreees([{ racine: bibliotheque.racine, description: bibliotheque.description }]);
      setExemples(bibliotheque.exemples);
      setFile(bibliotheque.file);
      setAccompagnements(bibliotheque.accompagnements);
      setManiere((avant) => ({
        ...avant,
        document: "Funk Fusion Bass.pdf",
        pages: bibliotheque.pagesATracer,
        brouillon: { ...avant.brouillon, zones: bibliotheque.zonesTracees, exempleDeNumero: "2.1" },
      }));
    });
    return () => {
      vivant = false;
    };
  }, []);

  const deposer = (fichiers: readonly File[]): void => setDepots(fichiers.map((fichier) => fichier.name));

  const [retrait, setRetrait] = useState<{ readonly occupe: boolean; readonly echec?: string }>({ occupe: false });

  /** Ouvrir une bibliothèque donnée, et non « la dernière de la liste ».
   *
   *  `derniere` est le dernier élément de `creees` : c'est ainsi que l'application désigne celle
   *  où l'on est. Choisir une bibliothèque revient donc à la mettre en queue. Sans ce geste,
   *  toutes les cartes menaient au même écran, qui montrait toujours la même — on se croyait dans
   *  une bibliothèque en lisant les documents d'une autre. */
  const choisirBibliotheque = (id: string): void => {
    setCreees((anciennes) => {
      const choisie = anciennes.find((autre) => autre.description.id === id);
      return choisie === undefined ? anciennes : [...anciennes.filter((autre) => autre !== choisie), choisie];
    });
  };

  /** Ce que la recherche de doublons a trouvé, et où elle en est (HER-08).
   *
   *  `trouves` absent **n'est pas** « rien trouvé » : c'est « pas encore cherché ». L'écran dit
   *  l'un et l'autre, et les confondre lui ferait annoncer une bibliothèque propre avant de
   *  l'avoir lue. */
  const [doublons, setDoublons] = useState<{
    readonly trouves?: DoublonsTrouves;
    readonly occupe: boolean;
    readonly echec?: string;
    readonly retire?: string;
  }>({ occupe: false });

  /** Combien de fois on a demandé à relire la bibliothèque pour une raison qui n'est pas un
   *  traitement achevé — un retrait de document, par exemple. Un compteur, et non un drapeau :
   *  deux retraits de suite doivent faire deux relectures. */
  const [relectures, setRelectures] = useState(0);

  /** Retirer une bibliothèque, d'une des deux façons.
   *
   *  L'oubli ne touche à rien ; la suppression met le dossier à la corbeille, d'où il se ressort.
   *  Dans les deux cas la bibliothèque sort de la liste, et l'on revient à l'accueil : rester sur
   *  l'écran d'une bibliothèque qu'on vient de retirer n'aurait aucun sens. */
  const retirer = async (racine: string, comment: "oublier" | "supprimer"): Promise<void> => {
    if (administration === undefined) return;
    setRetrait({ occupe: true });
    try {
      if (comment === "supprimer") await administration.supprimerBibliotheque(racine);
      else await administration.oublierBibliotheque(racine);
      setCreees((anciennes) => anciennes.filter((autre) => autre.racine !== racine));
      setRetrait({ occupe: false });
      aller(ACCUEIL);
    } catch (souci) {
      setRetrait({ occupe: false, echec: souci instanceof Error ? souci.message : String(souci) });
    }
  };

  /** Chercher les documents qui disent la même chose. Elle ne retire rien (HER-08).
   *
   *  Mesuré à dix secondes sur deux cent quarante-trois documents : c'est long, donc on le dit
   *  pendant que ça dure, et le bouton ne se représente pas comme disponible. */
  const chercherLesDoublons = async (): Promise<void> => {
    if (administration === undefined || courante === undefined) return;
    setDoublons({ occupe: true });
    try {
      const trouves = await administration.doublonsDeBibliotheque(courante.racine);
      setDoublons({ occupe: false, trouves });
    } catch (souci) {
      setDoublons({ occupe: false, echec: souci instanceof Error ? souci.message : String(souci) });
    }
  };

  /** Retirer un document de la bibliothèque (HER-07).
   *
   *  On retire **de la liste affichée** ce qui vient de partir, et l'on redemande la bibliothèque :
   *  sans quoi l'écran garderait un document qui n'est plus là, et le catalogue aussi. */
  const retirerUnDocument = async (empreinte: string): Promise<void> => {
    if (administration === undefined || courante === undefined) return;
    setDoublons((avant) => ({ ...avant, occupe: true }));
    try {
      const compte = await administration.retirerDocument(courante.racine, empreinte);
      // Le contrat rend des tableaux mutables : les reconstruire en lecture seule les rendrait
      // inassignables à ce qu'on vient d'en lire, pour aucun gain.
      const sansLui = (documents: DocumentSuspect[]): DocumentSuspect[] =>
        documents.filter((document) => document.empreinte !== empreinte);
      setDoublons((avant) => ({
        occupe: false,
        retire:
          compte.source === undefined
            ? "Document retiré de la bibliothèque. Sa source n’y était plus."
            : "Document retiré. Sa source est à la corbeille, d’où vous pouvez la ressortir.",
        ...(avant.trouves === undefined
          ? {}
          : {
              trouves: {
                // Un groupe qui tombe à un seul membre n'est plus un groupe : il ne double plus rien.
                groupes: avant.trouves.groupes
                  .map((groupe) => ({ ...groupe, documents: sansLui(groupe.documents) }))
                  .filter((groupe) => groupe.documents.length > 1),
                tropPeuDeTexte: sansLui(avant.trouves.tropPeuDeTexte),
              },
            }),
      }));
      setRegarde((avant) => (avant === empreinte ? undefined : avant));
      setRelectures((avant) => avant + 1);
    } catch (souci) {
      setDoublons((avant) => ({
        ...avant,
        occupe: false,
        echec: souci instanceof Error ? souci.message : String(souci),
      }));
    }
  };

  /** Les cas restants : ceux sur lesquels aucune décision n'a encore été prise. */
  const restants = useMemo(() => {
    if (vue === undefined) return undefined;
    const decides = new Set(decisions.map((prise) => prise.cas.id));
    return { ...vue, douteux: vue.douteux.filter((cas) => !decides.has(cas.id)) };
  }, [vue, decisions]);

  const enregistrerDecision = (cas: CasDouteux, decision: Decision): void => {
    if (administration === undefined || courante === undefined || regarde === undefined) {
      setDecisions((avant) => [...avant, { cas, decision }]);
      return;
    }
    void administration
      .enregistrerDecision(courante.racine, regarde, cas.id, decision)
      .then(() => setDecisions((avant) => [...avant, { cas, decision }]))
      .catch((souci: unknown) => setEchecOuverture(souci instanceof Error ? souci.message : String(souci)));
  };

  const annulerDerniereDecision = (): void => {
    const derniere = decisions[decisions.length - 1];
    if (derniere === undefined) return;
    if (administration === undefined || courante === undefined || regarde === undefined) {
      setDecisions((avant) => avant.slice(0, -1));
      return;
    }
    void administration
      .annulerDecision(courante.racine, regarde, derniere.cas.id)
      .then(() => setDecisions((avant) => avant.slice(0, -1)))
      .catch((souci: unknown) => setEchecOuverture(souci instanceof Error ? souci.message : String(souci)));
  };

  /** Créer une bibliothèque : l'hôte écrit, jamais la page. Sans hôte — sur le web — on le dit
   *  plutôt que de faire semblant d'avoir créé quelque chose. */
  const creer = async (description: DescriptionBibliotheque, dossier: string): Promise<void> => {
    if (administration === undefined)
      throw new Error("La création d’une bibliothèque demande l’application de bureau : elle seule écrit sur votre disque.");
    await administration.creerBibliotheque(dossier, description);
    await administration.retenirBibliotheque(dossier);
    setCreees((anciennes) => [...anciennes, { racine: dossier, description }]);
    aller({ ecran: "organisation" });
  };

  /** La bibliothèque ouverte. C'est elle dont on montre la file, et dont les écrans lisent.
   *
   *  Sur le bureau, la dernière ouverte, avec son dossier. **En ligne, celle que le service
   *  sert** — il n'y en a qu'une, et elle n'a pas de dossier. La condition dit la capacité et
   *  non l'hôte, comme `pont/choix.ts` : on lit sans pouvoir administrer, donc c'est le service
   *  qui répond. */
  const courante: { readonly racine: string } | undefined =
    creees[creees.length - 1] ?? (lecture !== undefined && administration === undefined ? SERVIE_EN_LIGNE : undefined);

  // L'image de la page qu'on regarde, prise à la demande. Une par une : un livre de trois cents
  // pages pèse des centaines de mégaoctets, et le Lecteur n'en montre qu'une. Elle remplace
  // l'adresse que la vue porte, qui ne désigne rien sur le bureau.
  useEffect(() => {
    if (courante === undefined || lecture === undefined || route.ecran !== "lecteur" || vue === undefined)
      return undefined;
    // Par le **rang** : c'est lui que les écrans passent, et le numéro imprimé manque sur
    // tout ouvrage qui ne numérote rien.
    const page = vue.pages.find((candidate) => candidate.index === route.page);
    if (page?.image === undefined || page.image.startsWith("data:")) return undefined;
    const fichier = page.image.split("/").pop();
    if (fichier === undefined) return undefined;

    let vivant = true;
    if (regarde === undefined) return undefined;
    void lecture.versionActive(courante.racine, regarde)
      .then(async (version) => (version === undefined ? undefined : lecture.imageDePage(courante.racine, version, fichier)))
      .then((image) => {
        if (!vivant || image === undefined) return;
        setVue((avant) =>
          avant === undefined
            ? avant
            : {
                ...avant,
                // Par le rang, et jamais par le numéro imprimé : deux pages sans numéro le
                // portent toutes deux à `undefined`, et `undefined === undefined` est vrai —
                // l'image d'une page serait recopiée sur toutes les autres.
                pages: avant.pages.map((autre) => (autre.index === page.index ? { ...autre, image } : autre)),
              },
        );
      })
      .catch(() => {
        // Une image qui manque n'empêche pas de lire : l'écran le dit déjà à sa façon.
      });
    return () => {
      vivant = false;
    };
  }, [courante, route, vue]);

  /** Ce qui, dans la file, justifie de relire la bibliothèque.
   *
   *  **Un traitement qui s'achève, et lui seul** : c'est lui qui pose une nouvelle version active
   *  (JOB-06). Une progression qui avance, un bail qui se renouvelle, un travail qui échoue ne
   *  changent rien à ce que les écrans lisent.
   *
   *  Mesuré le 22 octobre 2026 sur la bibliothèque réimportée : l'effet dépendait de `file`
   *  entière, que la veille réécrit toutes les deux secondes. Il relisait donc **70,2 Mo de
   *  versions toutes les deux secondes**, soit 35 Mo/s en continu depuis un volume externe, pour
   *  n'en tirer aucune différence. Un nombre stable à la place d'un tableau neuf suffit à
   *  l'arrêter. */
  const travauxAcheves = file.filter((travail) => travail.etat === "termine").length;

  // Ce que les écrans lisent vient de la bibliothèque ouverte, et non d'un instantané de
  // développement : sur le bureau, c'est le dépôt qui fait foi. On la relit après chaque
  // traitement, puisque c'est lui qui pose une nouvelle version active (JOB-06).
  useEffect(() => {
    if (courante === undefined || lecture === undefined) return undefined;
    let vivant = true;
    void Promise.all([lecture.apercuDeBibliotheque(courante.racine), lecture.classementsDeBibliotheque(courante.racine)])
      .then(([apercus, ranges]) => {
        if (!vivant) return;
        setDocuments(apercus);
        setClassements(ranges);
        // Au premier chargement on ouvre le plus récemment activé. Ensuite c'est la personne
        // qui choisit, et l'on ne lui reprend pas son choix : cet effet se rejoue à chaque
        // relecture de la file, toutes les deux secondes.
        setRegarde((avant) => avant ?? [...apercus].sort((a, b) => b.activeeLe - a.activeeLe)[0]?.empreinte);
        setRecuEnLigne("oui");
      })
      .catch((erreur: unknown) => {
        if (!vivant) return;
        // Ne pas être entré n'est pas une panne, et ce n'est pas une bibliothèque vide : c'est
        // l'état de tout le monde avant la cérémonie. On y conduit au lieu de se taire — le
        // silence menait au premier lancement, qui ne propose que des gestes de bureau.
        if (erreur instanceof PasIdentifie) {
          setRecuEnLigne("non");
          return;
        }
        // Une bibliothèque qui n'a rien traité n'a rien à montrer : les écrans le disent déjà.
      });
    return () => {
      vivant = false;
    };
  }, [courante, travauxAcheves, relectures]);

  /** Ce qu'on regardait, le temps qu'on le regardait : lu sans le remettre dans les dépendances
   *  de l'effet qui suit, sans quoi il se rejouerait à chaque document ouvert. */
  const regardeAlors = useRef(regarde);
  regardeAlors.current = regarde;

  // Changer de bibliothèque repart de zéro : garder le document d'une autre ferait lire une vue
  // qui n'appartient pas à celle qu'on vient d'ouvrir.
  //
  // **Mais seulement si l'on regardait un document.** Cet effet effaçait la vue en toutes
  // circonstances, y compris au démarrage, quand `courante` passe d'absente à présente — et la
  // vue chargée à ce moment-là est celle du jeu de démonstration, la seule qu'il y ait. Le
  // Lecteur était donc inatteignable en démonstration : on y naviguait, et l'on retombait sur
  // l'accueil, faute de vue. Sans document ouvert, il n'y a de toute façon rien à oublier.
  //
  // **Les passages suivent la vue, et pour la même raison.** Ils appartiennent au document
  // regardé, pas à la bibliothèque : les effacer en toutes circonstances effaçait au démarrage
  // ceux du jeu de démonstration, et l'écran de lecture du texte retombait sur « rien à
  // montrer » alors que le texte était là. La vue avait exactement ce défaut la veille ; il
  // vivait deux fois, à deux lignes d'écart.
  useEffect(() => {
    setRegarde(undefined);
    if (regardeAlors.current !== undefined) {
      setVue(undefined);
      setPassages([]);
    }
    setDocuments([]);
    setClassements(new Map());
  }, [courante?.racine]);

  // Le document regardé : sa vue et son texte. À part de la bibliothèque, parce qu'ils changent
  // pour une autre raison — on change de document sans que la bibliothèque bouge.
  useEffect(() => {
    if (courante === undefined || regarde === undefined || lecture === undefined) return undefined;
    let vivant = true;
    setDecisions([]);
    // Les deux ensemble, mais pas mêlées : la vue porte les repères, les passages portent le
    // texte. La recherche les reçoit séparément et n'en recopie aucun dans l'autre.
    const decisionsLues = administration?.lireDecisions(courante.racine, regarde) ?? Promise.resolve(new Map());
    void Promise.all([
      lecture.vueDeDocument(courante.racine, regarde),
      lecture.passagesDeDocument(courante.racine, regarde),
      decisionsLues,
    ])
      .then(([lue, lus, dejaPrises]) => {
        if (!vivant) return;
        setPassages(lus);
        if (lue !== undefined) {
          setVue(lue);
          setDecisions(
            lue.douteux.flatMap((cas) => {
              const decision = dejaPrises.get(cas.id);
              return decision === undefined ? [] : [{ cas, decision }];
            }),
          );
        }
      })
      .catch(() => {
        // Un document sans version active n'a rien à montrer, et ce n'est pas une panne.
      });
    return () => {
      vivant = false;
    };
  }, [courante, regarde, lecture, administration]);

  // La file est à l'hôte : on la relit, on ne la devine pas. Toutes les deux secondes suffisent —
  // un traitement se compte en minutes, et un écran qui se redessine sans cesse fatigue.
  useEffect(() => {
    if (courante === undefined || administration === undefined) return undefined;
    let vivant = true;
    void administration.faireTourner(courante.racine).catch((erreur: unknown) => {
      setEchecOuverture(erreur instanceof Error ? erreur.message : String(erreur));
    });
    const relire = (): void => {
      void administration.travauxDe(courante.racine).then((travaux) => {
        if (!vivant) return;
        // **Ne republier que ce qui a changé.** Relire est peu coûteux — 249 travaux font 137 Ko
        // et se lisent en 6 ms —, mais republier un relevé identique rejoue tout ce qui en
        // dépend, et l'un de ces dépendants relit la bibliothèque entière. En gardant la
        // référence précédente quand rien n'a bougé, la cascade s'arrête à sa source, pour tous
        // les dépendants d'aujourd'hui et ceux qu'on écrira.
        setFile((avant) => (memeFile(avant, travaux) ? avant : travaux));
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
    if (administration === undefined) return;
    setEchecOuverture(undefined);
    const racine = await administration.choisirDossier("Quelle bibliothèque ouvrir ?");
    if (racine === undefined) return;
    try {
      const description = await administration.lireBibliotheque(racine);
      if (description === undefined) {
        setEchecOuverture("Ce dossier ne porte pas de bibliothèque. Choisissez celui que Liénothèque a créé.");
        return;
      }
      await administration.retenirBibliotheque(racine);
      // En queue, jamais en tête : `derniere` est le dernier élément, et une bibliothèque
      // qu'on vient d'ouvrir est celle où l'on veut être.
      setCreees((anciennes) => [...anciennes.filter((autre) => autre.racine !== racine), { racine, description }]);
      aller({ ecran: "organisation" });
    } catch (erreur) {
      setEchecOuverture(erreur instanceof Error ? erreur.message : String(erreur));
    }
  };

  /** La dernière bibliothèque créée : celle qu'on organise au sortir de l'assistant.
   *
   *  Elle n'est plus `courante`, qui peut désormais être la bibliothèque servie en ligne — et
   *  celle-là n'a pas de description à organiser. Les écrans de construction demandent la
   *  description ; ils ne s'ouvrent que sur ce que cette session a créé. */
  const derniere = creees[creees.length - 1];

  /** Dépose des fichiers : l'hôte copie les originaux et met la file à jour. */
  const deposerDesFichiers = async (racine: string): Promise<void> => {
    if (administration === undefined) return;
    const chemins = await administration.choisirFichiers("Quels fichiers ajouter ?");
    if (chemins.length === 0) return;
    const arrivee = await administration.deposer(racine, chemins);
    setFile(arrivee.travaux);
    setAccompagnements((anciens) => [...anciens, ...arrivee.accompagnements]);
    setRefuses(arrivee.refuses);
  };

  /** Met un travail en pause, le reprend, ou l'annule. L'hôte décide, l'écran demande. */
  const agir = async (racine: string, id: string, action: ActionTravail): Promise<void> => {
    if (administration === undefined) return;
    const apres = await administration.agirSurTravail(racine, id, action);
    setFile((anciens) => anciens.map((travail) => (travail.id === apres.id ? apres : travail)));
  };

  /** Montre quelques pages d'un document : c'est la première chose dont l'éditeur a besoin. */
  const montrerLesPages = async (racine: string, empreinte: string, nom: string, depuis: number): Promise<void> => {
    if (administration === undefined) return;
    setManiere((avant) => ({ ...avant, document: nom, empreinte, occupe: true, echec: undefined }));
    journaliser(`aperçu demandé · racine « ${racine} » · empreinte « ${empreinte} » · nom « ${nom} »`);
    try {
      const pages = await administration.apercuDePages(racine, empreinte, nom, depuis, 8);
      const connue = await administration.lireManiere(racine);
      setManiere((avant) => ({
        ...avant,
        document: nom,
        pages,
        // Une manière de lire déjà enregistrée se rouvre telle quelle : on la corrige, on ne la
        // retape pas (REC-06).
        brouillon: connue === undefined ? avant.brouillon : depuisRecette(connue),
        occupe: false,
      }));
    } catch (erreur) {
      journaliser(`aperçu refusé · ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      setManiere((avant) => ({ ...avant, occupe: false, echec: erreur instanceof Error ? erreur.message : String(erreur) }));
    }
  };

  /** Essaie la manière de lire sur dix pages, sans rien enregistrer (REC-07). */
  const essayer = async (racine: string): Promise<void> => {
    if (administration === undefined) return;
    setManiere((avant) => ({ ...avant, occupe: true, echec: undefined }));
    try {
      // On essaie là où l'on regarde : les dix premières pages d'un document n'ont souvent rien
      // à lire, et un essai qui ne lit rien ne dit rien.
      const vue = await administration.essayerManiere(
        racine,
        maniere.empreinte,
        maniere.document,
        enRecette(maniere.brouillon),
        maniere.pages[0]?.rang ?? 0,
        10,
      );
      const bilan = bilanDEssai(vue);
      setManiere((avant) => ({
        ...avant,
        occupe: false,
        essai: { pages: bilan.pages, lus: bilan.lus, attendus: bilan.pages.length },
      }));
    } catch (erreur) {
      setManiere((avant) => ({ ...avant, occupe: false, echec: erreur instanceof Error ? erreur.message : String(erreur) }));
    }
  };

  /** Enregistre la manière de lire. C'est elle que les traitements emploieront ensuite. */
  const enregistrer = async (racine: string, brouillon: Brouillon): Promise<void> => {
    if (administration === undefined) return;
    setManiere((avant) => ({ ...avant, occupe: true, echec: undefined }));
    try {
      await administration.enregistrerManiere(racine, enRecette(brouillon));
      setManiere((avant) => ({ ...avant, brouillon, occupe: false }));
      // On revient au traitement : c'est de là qu'on venait, et c'est là qu'on reprend les
      // travaux que l'absence de manière de lire avait arrêtés.
      aller({ ecran: "depot" });
    } catch (erreur) {
      setManiere((avant) => ({ ...avant, occupe: false, echec: erreur instanceof Error ? erreur.message : String(erreur) }));
    }
  };

  /** Ranger un document à la main, depuis le Catalogue.
   *
   *  La table de la bibliothèque fait foi ; celle que l'écran tient n'est que ce qu'on vient
   *  d'en lire. On l'avance tout de suite pour que le geste se voie, et si l'hôte refuse on
   *  relit plutôt que de garder à l'écran un classement qui n'existe pas sur le disque. */
  const classer = (classement: ClassementLocal): void => {
    if (courante === undefined) return;
    setClassements((avant) => new Map(avant).set(classement.empreinte, classement));
    if (lecture === undefined) return;
    void lecture.classerDocument(courante.racine, classement).catch(() => {
      void lecture.classementsDeBibliotheque(courante.racine)
        .then(setClassements)
        .catch(() => undefined);
    });
  };

  /** Une version de plus du schéma. L'hôte réécrit la description : la page n'écrit jamais. */
  const organiser = async (schema: SchemaBibliotheque): Promise<void> => {
    if (derniere === undefined) return;
    const description = { ...derniere.description, schema };
    if (administration !== undefined) await administration.ecrireBibliotheque(derniere.racine, description);
    setCreees((anciennes) => anciennes.map((creee) => (creee === derniere ? { ...creee, description } : creee)));
  };

  // L'accueil montre les bibliothèques ouvertes. Sans cela, l'administrateur qui vient d'en
  // créer une retombe sur le premier lancement, comme s'il n'avait rien fait.
  const aLAccueil: DonneesAccueil =
    creees.length === 0
      ? donnees
      : {
          ...donnees,
          bibliotheques: creees.map((creee) =>
            pourLAccueil(creee.description, creee === courante ? vue : undefined, "Sur cet ordinateur"),
          ),
        };

  /** Ce qu'on montre quand il n'y a rien à montrer — **et qui dépend de qui répond**.
   *
   *  Sur le bureau : le premier lancement, qui propose de créer ou d'ouvrir. En ligne, ces deux
   *  gestes n'existent pas — `creer` lève, `ouvrir` n'est même pas passé — et les proposer
   *  disait à quelqu'un d'identifié qu'il n'avait rien, alors que sa bibliothèque existait et
   *  était simplement vide. Deux écrans honnêtes à la place : la cérémonie quand le service
   *  nous a refusés, l'attente quand il nous a reçus et n'a rien.
   *
   *  Tant qu'on ne sait pas encore — la première demande n'est pas revenue — on montre
   *  l'attente plutôt que la cérémonie : proposer d'entrer à quelqu'un qui est déjà entré est
   *  plus trompeur que de le faire patienter le temps d'un aller-retour. */
  const sansRienAMontrer = (): JSX.Element => {
    if (administration === undefined && lecture !== undefined)
      return recuEnLigne === "non" ? (
        <Entrer onEntre={() => aller({ ecran: "catalogue" })} />
      ) : (
        <RienAMontrer theme={theme} />
      );
    return aLAccueil.bibliotheques.length === 0 ? (
      <PremierLancement
        theme={theme}
        onCreer={() => aller({ ecran: "creer" })}
        onFichiers={deposer}
        onOuvrir={administration !== undefined ? () => void ouvrir() : undefined}
        echec={echecOuverture}
      />
    ) : (
      <Accueil
        donnees={aLAccueil}
        onFichiers={deposer}
        onCreer={() => aller({ ecran: "creer" })}
        onOuvrir={choisirBibliotheque}
      />
    );
  };

  const ecran = ((): JSX.Element | null => {
    // Avant tout le reste : cet écran doit s'afficher **sans session**, donc sans rien attendre
    // du pont ni d'une bibliothèque. Le placer plus bas l'aurait mis derrière des gardes qui
    // supposent une bibliothèque ouverte.
    if (route.ecran === "entrer")
      return (
        <Entrer
          {...(route.invitation === undefined ? {} : { invitation: route.invitation })}
          onEntre={() => aller({ ecran: "catalogue" })}
        />
      );
    if (route.ecran === "reglages") return <Reglages theme={theme} onThemeChange={changerTheme} />;
    if (route.ecran === "maniere")
      return derniere === undefined ? (
        <PremierLancement
          theme={theme}
          onCreer={() => aller({ ecran: "creer" })}
          onFichiers={deposer}
          onOuvrir={administration !== undefined ? () => void ouvrir() : undefined}
          echec={echecOuverture}
        />
      ) : (
        <ManiereDeLire
          description={derniere.description}
          document={maniere.document}
          pages={maniere.pages}
          brouillon={maniere.brouillon}
          onBrouillon={(brouillon) => setManiere((avant) => ({ ...avant, brouillon }))}
          onEssayer={() => void essayer(derniere.racine)}
          onEnregistrer={(brouillon) => void enregistrer(derniere.racine, brouillon)}
          onAutresPages={(depuis) => void montrerLesPages(derniere.racine, maniere.empreinte, maniere.document, depuis)}
          {...(maniere.essai === undefined ? {} : { essai: maniere.essai })}
          {...(maniere.occupe === undefined ? {} : { occupe: maniere.occupe })}
          {...(maniere.echec === undefined ? {} : { echec: maniere.echec })}
        />
      );
    if (route.ecran === "depot")
      return derniere === undefined ? (
        <PremierLancement
          theme={theme}
          onCreer={() => aller({ ecran: "creer" })}
          onFichiers={deposer}
          onOuvrir={administration !== undefined ? () => void ouvrir() : undefined}
          echec={echecOuverture}
        />
      ) : (
        <Depot
          description={derniere.description}
          travaux={file}
          accompagnements={accompagnements}
          refuses={refuses}
          onParcourir={administration !== undefined ? () => void deposerDesFichiers(derniere.racine) : undefined}
          onFichiers={deposer}
          onAction={(id, action) => void agir(derniere.racine, id, action)}
          onVerifier={() => aller({ ecran: "verifier" })}
          {...(administration === undefined ? {} : { onRetirer: () => aller({ ecran: "retirer" }) })}
          {...(administration === undefined ? {} : { onDoublons: () => aller({ ecran: "doublons" }) })}
          onManiere={
            administration !== undefined
              ? (empreinte, nom) => {
                  aller({ ecran: "maniere" });
                  void montrerLesPages(derniere.racine, empreinte, nom, 0);
                }
              : undefined
          }
        />
      );
    if (route.ecran === "organisation")
      return derniere === undefined ? (
        <PremierLancement
          theme={theme}
          onCreer={() => aller({ ecran: "creer" })}
          onFichiers={deposer}
          onOuvrir={administration !== undefined ? () => void ouvrir() : undefined}
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
    if (route.ecran === "retirer")
      return derniere === undefined ? (
        sansRienAMontrer()
      ) : (
        <Retirer
          nom={derniere.description.nom}
          racine={derniere.racine}
          onOublier={() => void retirer(derniere.racine, "oublier")}
          onSupprimer={() => void retirer(derniere.racine, "supprimer")}
          onAnnuler={() => aller({ ecran: "depot" })}
          {...(retrait.echec === undefined ? {} : { echec: retrait.echec })}
          occupe={retrait.occupe}
        />
      );
    if (route.ecran === "doublons")
      return derniere === undefined || administration === undefined ? (
        sansRienAMontrer()
      ) : (
        <Doublons
          nom={derniere.description.nom}
          onChercher={() => void chercherLesDoublons()}
          onRetirer={(empreinte) => void retirerUnDocument(empreinte)}
          onRetour={() => aller({ ecran: "catalogue" })}
          {...(doublons.trouves === undefined ? {} : { trouves: doublons.trouves })}
          {...(doublons.echec === undefined ? {} : { echec: doublons.echec })}
          {...(doublons.retire === undefined ? {} : { retire: doublons.retire })}
          occupe={doublons.occupe}
        />
      );
    if (route.ecran === "creer")
      return (
        <Creer
          modeles={modeles}
          prises={creees.map((creee) => creee.description.id)}
          onCreer={creer}
          onAnnuler={() => aller(ACCUEIL)}
          onChoisirDossier={
            administration !== undefined ? () => administration.choisirDossier("Où vivra cette bibliothèque ?") : undefined
          }
        />
      );
    if (vue === undefined || restants === undefined) return sansRienAMontrer();
    if (route.ecran === "verifier")
      return (
        <Verifier
          vue={restants}
          onDecision={enregistrerDecision}
          onAnnuler={annulerDerniereDecision}
          {...(decisions.length === 0 ? {} : { derniere: decisions[decisions.length - 1]! })}
        />
      );
    // Un document composé en texte n'a aucune image, donc aucune page dans sa vue — mais son
    // texte, lui, a été lu entièrement. Le Lecteur ne saurait qu'en dire « rien à montrer » ;
    // cet écran-ci le montre. Le choix se fait sur ce qu'on a, jamais sur le format : c'est le
    // même fait qui vaut pour un PDF composé en texte et pour un EPUB.
    if (route.ecran === "lecteur" && parOuLire(vue.pages.length, passages.length) === "texte")
      return (
        <LectureDuTexte
          vue={vue}
          passages={passages}
          page={route.page}
          imagesPartielles={quelquesImagesSeulement(vue.pages.length, passages.length)}
          onPage={(page) => aller({ ecran: "lecteur", page })}
        />
      );
    if (route.ecran === "lecteur")
      return (
        <Lecteur
          vue={vue}
          page={route.page}
          element={route.element ?? ""}
          // La vue porte les repères, les passages portent le texte : sans ce témoin, un
          // document sans page renverrait à une recherche qui ne rendrait rien.
          texteLu={passages.length > 0}
          onPage={(page) => aller({ ecran: "lecteur", page })}
          onElement={(element) => aller({ ecran: "lecteur", page: route.page, element })}
        />
      );
    if (route.ecran === "catalogue")
      return (
        <Catalogue
          vue={vue}
          {...(derniere?.description.schema === undefined ? {} : { schema: derniere.description.schema })}
          {...(regarde === undefined ? {} : { empreinte: regarde })}
          {...(regarde === undefined || classements.get(regarde) === undefined
            ? {}
            : { classement: classements.get(regarde) })}
          onClasser={classer}
          documents={documents}
          classements={classements}
          onDocument={setRegarde}
          {...(route.page === undefined ? {} : { page: route.page })}
          onPage={(page) => aller({ ecran: "catalogue", page })}
          onLecteur={(page, element) => aller({ ecran: "lecteur", page, element })}
          {...(administration === undefined ? {} : { onDoublons: () => aller({ ecran: "doublons" }) })}
          onAjouter={() => aller(ACCUEIL)}
        />
      );
    return sansRienAMontrer();
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
        donnees={aLAccueil}
        enTraitement={file.filter((travail) => travail.etat === "en_cours" || travail.etat === "verrouille").length}
      />
      <div className="ln-application__vue">{ecran}</div>
      {cherche && vue !== undefined ? (
        <Recherche
          vue={vue}
          passages={passages}
          actions={
            derniere === undefined
              ? undefined
              : [
                  { cle: "organisation", titre: "Revoir l’organisation", source: derniere.description.nom, aussi: ["axes", "valeurs", "ranger"] },
                  { cle: "depot", titre: "Ajouter des fichiers", source: derniere.description.nom, aussi: ["déposer", "traitement", "file"] },
                  { cle: "verifier", titre: "Vérifier ce qui attend un œil", source: derniere.description.nom, aussi: ["doutes", "cas"] },
                  { cle: "maniere", titre: "Revoir la manière de lire", source: derniere.description.nom, aussi: ["recette", "zones", "lecture"] },
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
            else if (cle === "maniere") aller({ ecran: "maniere" });
          }}
        />
      ) : null}
      {/* Les mesures du lot 0 n'apparaissent **que sur une bibliothèque d'essai**.
          Ce bloc s'affichait dès qu'un hôte répondait, donc sous une vraie bibliothèque de 243
          documents, où il n'a rien à faire : « quatre capacités à éprouver avant de décider du
          socle » s'adresse à nous, pas à qui veut lire ses livres. */}
      {administration !== undefined && courante === undefined ? (
        <div className="ln-layout">
          <Prototype />
        </div>
      ) : null}
    </div>
  );
}
