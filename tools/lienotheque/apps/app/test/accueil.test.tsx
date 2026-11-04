import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { DEMONSTRATION } from "../src/donnees/demonstration.js";
import { ACCUEIL_VIDE, type BibliothequeAffichee, type DonneesAccueil } from "../src/donnees/modele.js";
import { Accueil } from "../src/pages/Accueil.js";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset["theme"];
  globalThis.history.replaceState({}, "", "/");
});

const SECTIONS = ["Reprendre", "Vos bibliothèques", "À vérifier", "Traitement en cours"] as const;

const sectionsVisibles = (): string[] =>
  screen
    .queryAllByRole("heading", { level: 2 })
    .map((titre) => titre.textContent ?? "")
    .filter((texte): texte is (typeof SECTIONS)[number] => (SECTIONS as readonly string[]).includes(texte));

const accueil = (donnees: Partial<DonneesAccueil>) =>
  render(<Accueil donnees={{ ...ACCUEIL_VIDE, ...donnees }} onFichiers={vi.fn()} onCreer={vi.fn()} />);

describe("premier lancement : l'accueil part vide (UX-01, UX-09)", () => {
  it("montre le logo, la signature et une seule chose à faire", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Liénothèque" })).toBeInTheDocument();
    expect(screen.getByText("Vos documents et médias, enfin reliés.")).toBeInTheDocument();

    const principaux = screen.getAllByRole("button").filter((b) => b.classList.contains("ln-btn--principal"));
    expect(principaux).toHaveLength(1);
    expect(principaux[0]).toHaveAccessibleName("Créer ma première bibliothèque");
  });

  it("n'affiche aucune section tant qu'il n'y a rien dedans", () => {
    render(<App />);
    expect(sectionsVisibles()).toEqual([]);
    expect(screen.queryByText("Bonjour")).not.toBeInTheDocument();
  });

  it("propose de déposer un dossier, choisissable au clavier (UX-06)", async () => {
    const utilisateur = userEvent.setup();
    render(<App />);

    expect(screen.getByText("ou déposez directement un dossier")).toBeInTheDocument();
    const champ = screen.getByLabelText("Choisir un dossier");
    expect(champ).toHaveAttribute("webkitdirectory");
    expect(champ).toBeEnabled();

    let pas = 0;
    while (document.activeElement !== champ && pas < 20) {
      await utilisateur.tab();
      pas += 1;
    }
    expect(champ).toHaveFocus();
  });

  it("n'offre ni recherche ni état à surveiller : il n'y a rien à chercher", () => {
    render(<App />);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/traitement en cours/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Synchronisé")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
  });
});

describe("jeu de démonstration, seulement sur demande explicite", () => {
  it("remplit l'accueil quand l'adresse porte ?demonstration", async () => {
    globalThis.history.replaceState({}, "", "/?demonstration");
    render(<App />);

    expect(await screen.findByRole("heading", { level: 2, name: "Vos bibliothèques" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Bonjour" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.queryByText("Vos documents et médias, enfin reliés.")).not.toBeInTheDocument();
  });

  it("ignore un paramètre voisin", () => {
    globalThis.history.replaceState({}, "", "/?demo");
    render(<App />);
    expect(screen.getByText("Vos documents et médias, enfin reliés.")).toBeInTheDocument();
  });
});

describe("chaque section n'apparaît qu'avec son contenu", () => {
  it("avec des bibliothèques seules : rien d'autre", () => {
    accueil({ bibliotheques: DEMONSTRATION.bibliotheques });
    expect(sectionsVisibles()).toEqual(["Vos bibliothèques"]);
    expect(screen.getByText("4 bibliothèques")).toBeInTheDocument();
  });

  it("une reprise en attente fait apparaître « Reprendre »", () => {
    accueil({ bibliotheques: DEMONSTRATION.bibliotheques, reprises: DEMONSTRATION.reprises });
    expect(sectionsVisibles()).toEqual(["Reprendre", "Vos bibliothèques"]);
    expect(screen.getByRole("link", { name: "Reprendre Méthode d'instrument" })).toBeInTheDocument();
  });

  it("des cas douteux font apparaître « À vérifier », et son rappel dans le résumé", () => {
    accueil({ bibliotheques: DEMONSTRATION.bibliotheques, aVerifier: DEMONSTRATION.aVerifier });
    expect(sectionsVisibles()).toEqual(["Vos bibliothèques", "À vérifier"]);
    expect(screen.getByRole("link", { name: "9 éléments à vérifier" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ouvrir la vérification" })).toBeInTheDocument();
  });

  it("un travail en cours fait apparaître « Traitement en cours » et son avancement", () => {
    accueil({ bibliotheques: DEMONSTRATION.bibliotheques, traitement: DEMONSTRATION.traitement });
    expect(sectionsVisibles()).toEqual(["Vos bibliothèques", "Traitement en cours"]);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "60");
    expect(screen.getByText("60 % · environ 4 min")).toBeInTheDocument();
  });

  it("accorde le résumé au singulier quand il n'y a qu'une bibliothèque", () => {
    accueil({ bibliotheques: DEMONSTRATION.bibliotheques.slice(0, 1) });
    expect(screen.getByText("1 bibliothèque")).toBeInTheDocument();
  });
});

/** Un dossier de bibliothèque posé là par une sauvegarde, une copie ou un autre appareil doit
 *  rester atteignable (LIV-07).
 *
 *  Le geste existait, il était écrit, il était éprouvé — et **aucun bouton ne l'appelait** dès
 *  qu'on avait une bibliothèque : l'écran de premier lancement, seul à le porter, disparaissait
 *  alors pour de bon. Une bibliothèque jamais ouverte sur cet ordinateur était donc invisible
 *  pour toujours, quoi qu'il y eût sur le disque. Le filet des portes peintes ne voit pas ce
 *  défaut-là : il juge les boutons présents, pas ceux qui manquent.
 */
describe("ouvrir une bibliothèque qui n'est pas dans la liste (LIV-07)", () => {
  it("l'accueil garni le propose, et appelle son geste", async () => {
    const utilisateur = userEvent.setup();
    const ouvrirUnDossier = vi.fn();
    render(
      <Accueil
        donnees={DEMONSTRATION}
        onFichiers={vi.fn()}
        onCreer={vi.fn()}
        onOuvrirUnDossier={ouvrirUnDossier}
      />,
    );

    await utilisateur.click(screen.getByRole("button", { name: /Ouvrir une bibliothèque du disque/ }));

    expect(ouvrirUnDossier).toHaveBeenCalledTimes(1);
  });

  it("ne peint pas le bouton quand l'hôte n'offre pas de sélecteur de dossier", () => {
    render(<Accueil donnees={DEMONSTRATION} onFichiers={vi.fn()} onCreer={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Ouvrir une bibliothèque du disque/ })).toBeNull();
  });
});

describe("accueil garni : composition des maquettes", () => {
  const garni = () => render(<Accueil donnees={DEMONSTRATION} onFichiers={vi.fn()} onCreer={vi.fn()} />);

  it("présente les quatre sections et les quatre bibliothèques", () => {
    garni();
    expect(sectionsVisibles()).toEqual(["Reprendre", "Vos bibliothèques", "À vérifier", "Traitement en cours"]);
    for (const bibliotheque of DEMONSTRATION.bibliotheques) {
      expect(screen.getByRole("link", { name: `Ouvrir la bibliothèque ${bibliotheque.nom}` })).toBeInTheDocument();
    }
  });

  /** Cette épreuve simulait `globalThis.prompt` : elle tenait donc pour acquis le chemin même
   *  qui ne marche pas dans l'application empaquetée. Réécrite sur le champ posé dans la carte,
   *  elle garde son intention — renommer ne change pas la bibliothèque qu'on ouvre. */
  it("permet de renommer une bibliothèque sans changer celle que l'on ouvre", async () => {
    const utilisateur = userEvent.setup();
    const renommer = vi.fn();
    const ouvrir = vi.fn();
    render(
      <Accueil donnees={DEMONSTRATION} onFichiers={vi.fn()} onCreer={vi.fn()} onRenommer={renommer} onOuvrir={ouvrir} />,
    );

    const premiere = DEMONSTRATION.bibliotheques[0]!;
    await utilisateur.click(screen.getByRole("button", { name: `Renommer ${premiere.nom}` }));
    await utilisateur.clear(screen.getByRole("textbox", { name: "Nouveau nom" }));
    await utilisateur.type(screen.getByRole("textbox", { name: "Nouveau nom" }), "Bibliothèque musicale");
    await utilisateur.click(screen.getByRole("button", { name: "Enregistrer le nom" }));

    expect(renommer).toHaveBeenCalledWith(premiere.id, "Bibliothèque musicale");
    expect(ouvrir).not.toHaveBeenCalled();
  });

  it("rend les positions depuis les sélecteurs d'ancres (ANC-01, ANC-02)", () => {
    garni();
    expect(screen.getByText(/Page 127/)).toBeInTheDocument();
    expect(screen.getByText(/piste 41/)).toBeInTheDocument();
    expect(screen.getByText(/Chapitre 4, page 88/)).toBeInTheDocument();
    expect(screen.getByText(/12:40/)).toBeInTheDocument();
    expect(screen.getByText(/diapositive 15/)).toBeInTheDocument();
  });

  it("n'a qu'un seul bouton principal (UX-09)", () => {
    const { container } = garni();
    const principaux = container.querySelectorAll(".ln-btn--principal");
    expect(principaux).toHaveLength(1);
    expect(principaux[0]).toHaveTextContent("Nouvelle bibliothèque");
  });

  it("atteint chaque commande au clavier, y compris le dépôt (UX-06)", async () => {
    const utilisateur = userEvent.setup();
    garni();

    const vus: Element[] = [];
    for (let pas = 0; pas < 40; pas += 1) {
      await utilisateur.tab();
      const actif = document.activeElement;
      if (actif === null || actif === document.body || vus.includes(actif)) break;
      vus.push(actif);
    }

    for (const element of [
      screen.getByRole("button", { name: "Nouvelle bibliothèque" }),
      screen.getByRole("link", { name: "Ouvrir la vérification" }),
      screen.getByLabelText("Choisir des fichiers"),
      ...DEMONSTRATION.bibliotheques.map((b) =>
        screen.getByRole("link", { name: `Ouvrir la bibliothèque ${b.nom}` }),
      ),
    ]) {
      expect(vus, element.textContent ?? "").toContain(element);
    }
  });

  it("n'impose aucun ordre de tabulation artificiel", () => {
    const { container } = garni();
    expect(container.querySelectorAll('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])')).toHaveLength(0);
  });

  it("propose explicitement une bibliothèque avant d'importer un ZIP retenu", async () => {
    const choisir = vi.fn();
    render(
      <Accueil
        donnees={DEMONSTRATION}
        onFichiers={vi.fn()}
        onCreer={vi.fn()}
        depotEnAttente={["Methode-test.zip"]}
        onChoisirBibliothequePourDepot={choisir}
      />,
    );

    expect(screen.getByRole("heading", { name: "Dans quelle bibliothèque l’ajouter ?" })).toBeInTheDocument();
    expect(screen.getByText("Methode-test.zip")).toBeInTheDocument();

    const cible = DEMONSTRATION.bibliotheques[1]!;
    await userEvent.click(screen.getByRole("button", { name: `Ajouter à ${cible.nom}` }));
    expect(choisir).toHaveBeenCalledWith(cible.id);
  });
});

describe("le premier lancement n'emprunte pas la mise en page de l'accueil garni", () => {
  it("rend une page à une seule colonne, jamais la grille à deux colonnes", () => {
    const { container } = render(<App />);
    const principal = container.querySelector("main");
    expect(principal).toHaveClass("ln-premier");
    expect(principal).not.toHaveClass("ln-accueil");
  });

  it("regroupe le logo, la signature et l'action unique dans un seul panneau", () => {
    const { container } = render(<App />);
    const accroche = container.querySelector(".ln-premier__accroche");
    expect(accroche).toHaveClass("ln-panneau-titre");
    expect(accroche?.querySelector("h1 img")).toHaveAttribute("alt", "Liénothèque");
    expect(accroche).toHaveTextContent("Vos documents et médias, enfin reliés.");
    expect(accroche?.querySelector(".ln-btn--principal")).toHaveTextContent("Créer ma première bibliothèque");
  });
});


/** Le bouton « Nouvelle bibliothèque » mène quelque part (UX-01)
 *
 *  ## Ce qu'il faisait
 *
 *  Rien. Pas de gestionnaire, pas de prop — l'écran n'en acceptait aucune. Il s'affichait, il se
 *  cliquait, et il ne se passait rien.
 *
 *  Le défaut a vécu parce qu'il est **invisible tant qu'on n'a pas de bibliothèque** : sans
 *  bibliothèque, on arrive au premier lancement, dont le bouton est câblé, et c'est cet écran-là
 *  que toutes les épreuves regardaient. Il a fallu une vraie bibliothèque sur une vraie machine
 *  pour tomber dessus — et un traceur dans le paquet pour le voir, puisqu'un clic qui n'aboutit
 *  à rien ne laisse aucune trace.
 *
 *  ## Ce que ces épreuves gardent
 *
 *  Qu'il appelle quelqu'un, et que la carte d'une bibliothèque mène toujours à son dépôt. Deux
 *  chemins pour sortir de l'accueil, et c'étaient les deux seuls.
 */
describe("sortir de l'accueil : les deux chemins (UX-01)", () => {
  const UNE: BibliothequeAffichee = {
    id: "une-bibliotheque",
    nom: "Une bibliothèque",
    href: "#depot",
    collection: "research",
    icones: [],
    compteurs: [],
    hebergement: { libelle: "Sur cet ordinateur", icones: ["ordinateur"] },
    etat: { libelle: "Prêt", icone: "valide" },
    ouverte: "à l’instant",
  };

  it("appelle onCreer quand on demande une nouvelle bibliothèque", async () => {
    const creer = vi.fn();
    render(<Accueil donnees={{ ...ACCUEIL_VIDE, bibliotheques: [UNE] }} onFichiers={vi.fn()} onCreer={creer} />);

    await userEvent.click(screen.getByRole("button", { name: /Nouvelle bibliothèque/ }));
    expect(creer, "le bouton n’appelait personne").toHaveBeenCalledTimes(1);
  });

  it("la carte d’une bibliothèque mène à son dépôt", () => {
    render(<Accueil donnees={{ ...ACCUEIL_VIDE, bibliotheques: [UNE] }} onFichiers={vi.fn()} onCreer={vi.fn()} />);
    expect(screen.getByRole("link", { name: /Une bibliothèque/ })).toHaveAttribute("href", "#depot");
  });
});

describe("tester une copie portable", () => {
  it("offre un geste distinct qui ne se confond pas avec l'ouverture d'une carte", async () => {
    const utilisateur = userEvent.setup();
    const tester = vi.fn();
    render(
      <Accueil
        donnees={DEMONSTRATION}
        onFichiers={vi.fn()}
        onCreer={vi.fn()}
        onOuvrir={vi.fn()}
        onTesterCopie={tester}
      />,
    );

    await utilisateur.click(screen.getByRole("button", { name: /Tester temporairement une copie/ }));
    expect(tester).toHaveBeenCalledTimes(1);
  });

  it("annonce une mise à jour embarquée et ne l'applique qu'après un clic explicite", async () => {
    const utilisateur = userEvent.setup();
    const mettreAJour = vi.fn();
    render(
      <Accueil
        donnees={DEMONSTRATION}
        onFichiers={vi.fn()}
        onCreer={vi.fn()}
        applicationEmbarquee={{
          statut: "mise_a_jour_disponible",
          versionCourante: "0.2.0",
          versionEmbarquee: "0.1.0",
          message: "La version 0.2.0 peut remplacer la version 0.1.0.",
          actionDisponible: true,
        }}
        onMettreAJourApplication={mettreAJour}
      />,
    );

    expect(mettreAJour).not.toHaveBeenCalled();
    expect(screen.getByText(/Données de la bibliothèque inchangées/)).toBeInTheDocument();
    await utilisateur.click(screen.getByRole("button", { name: "Mettre à jour l’application embarquée" }));
    expect(mettreAJour).toHaveBeenCalledTimes(1);
  });
});

/** Renommer sans boîte du navigateur (UX-06, LIV-07).
 *
 *  Le bouton appelait `globalThis.prompt`. La WebView de l'application empaquetée ne l'implémente
 *  pas : elle rend `null` sans rien afficher, le code sortait sur ce `null`, et renommer était
 *  impossible — sans un mot à l'écran. Trouvé le 4 novembre 2026 en voulant s'en servir dans le
 *  paquet installé. Le champ vit donc dans la page, comme tout le reste. */
describe("renommer une bibliothèque depuis sa carte (UX-06, LIV-07)", () => {
  const UNE_CARTE: BibliothequeAffichee = {
    id: "une-bibliotheque",
    nom: "Une bibliothèque",
    href: "#depot",
    collection: "research",
    icones: [],
    compteurs: [],
    hebergement: { libelle: "Sur cet ordinateur", icones: ["ordinateur"] },
    etat: { libelle: "Prêt", icone: "valide" },
    ouverte: "à l’instant",
  };

  const avecCarte = (onRenommer: (id: string, nom: string) => void) =>
    render(
      <Accueil
        donnees={{ ...ACCUEIL_VIDE, bibliotheques: [UNE_CARTE] }}
        onFichiers={vi.fn()}
        onCreer={vi.fn()}
        onRenommer={onRenommer}
      />,
    );

  it("ouvre un champ dans la carte, prérempli du nom actuel", async () => {
    const utilisateur = userEvent.setup();
    avecCarte(vi.fn());

    await utilisateur.click(screen.getByRole("button", { name: "Renommer Une bibliothèque" }));

    expect(screen.getByRole("textbox", { name: "Nouveau nom" })).toHaveValue("Une bibliothèque");
  });

  it("rend l’identifiant et le nouveau nom, jamais le nom d’origine", async () => {
    const utilisateur = userEvent.setup();
    const renommer = vi.fn();
    avecCarte(renommer);

    await utilisateur.click(screen.getByRole("button", { name: "Renommer Une bibliothèque" }));
    await utilisateur.clear(screen.getByRole("textbox", { name: "Nouveau nom" }));
    await utilisateur.type(screen.getByRole("textbox", { name: "Nouveau nom" }), "Autre nom");
    await utilisateur.click(screen.getByRole("button", { name: "Enregistrer le nom" }));

    expect(renommer).toHaveBeenCalledWith("une-bibliotheque", "Autre nom");
  });

  it("n’appelle jamais la boîte du navigateur : elle n’existe pas dans l’application", async () => {
    const utilisateur = userEvent.setup();
    const demande = vi.spyOn(globalThis, "prompt").mockReturnValue(null);
    avecCarte(vi.fn());

    await utilisateur.click(screen.getByRole("button", { name: "Renommer Une bibliothèque" }));

    expect(demande).not.toHaveBeenCalled();
    demande.mockRestore();
  });

  it("renoncer referme le champ sans rien renommer", async () => {
    const utilisateur = userEvent.setup();
    const renommer = vi.fn();
    avecCarte(renommer);

    await utilisateur.click(screen.getByRole("button", { name: "Renommer Une bibliothèque" }));
    await utilisateur.click(screen.getByRole("button", { name: "Renoncer au renommage" }));

    expect(screen.queryByRole("textbox", { name: "Nouveau nom" })).not.toBeInTheDocument();
    expect(renommer).not.toHaveBeenCalled();
  });
});
