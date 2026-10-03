import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { DEMONSTRATION } from "../src/donnees/demonstration.js";
import { ACCUEIL_VIDE, type DonneesAccueil } from "../src/donnees/modele.js";
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
  render(<Accueil donnees={{ ...ACCUEIL_VIDE, ...donnees }} onFichiers={vi.fn()} />);

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

describe("accueil garni : composition des maquettes", () => {
  const garni = () => render(<Accueil donnees={DEMONSTRATION} onFichiers={vi.fn()} />);

  it("présente les quatre sections et les quatre bibliothèques", () => {
    garni();
    expect(sectionsVisibles()).toEqual(["Reprendre", "Vos bibliothèques", "À vérifier", "Traitement en cours"]);
    for (const bibliotheque of DEMONSTRATION.bibliotheques) {
      expect(screen.getByRole("link", { name: `Ouvrir la bibliothèque ${bibliotheque.nom}` })).toBeInTheDocument();
    }
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
});
