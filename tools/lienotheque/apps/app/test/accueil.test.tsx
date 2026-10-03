import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { BIBLIOTHEQUES, REPRISES } from "../src/donnees/accueil.js";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset["theme"];
});

/** Parcourt la page à la tabulation et rend les éléments atteints, dans l'ordre. */
async function parcourirAuClavier(utilisateur: ReturnType<typeof userEvent.setup>, pasMax = 40): Promise<Element[]> {
  const vus: Element[] = [];
  for (let pas = 0; pas < pasMax; pas += 1) {
    await utilisateur.tab();
    const actif = document.activeElement;
    if (actif === null || actif === document.body || vus.includes(actif)) break;
    vus.push(actif);
  }
  return vus;
}

describe("accueil : composition des maquettes (CDC, écran Accueil)", () => {
  it("met « Bonjour » en titre, puis le résumé et ses deux repères", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Bonjour" })).toBeInTheDocument();
    expect(screen.getByText(/4 bibliothèques/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "9 éléments à vérifier" })).toBeInTheDocument();
  });

  it("présente les trois sections de l'écran : reprise, bibliothèques, attention", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 2, name: "Reprendre" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Vos bibliothèques" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "À vérifier" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Traitement en cours" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Ce qui demande votre attention" })).toBeInTheDocument();
  });

  it("affiche les quatre bibliothèques avec leurs compteurs", () => {
    render(<App />);
    for (const bibliotheque of BIBLIOTHEQUES) {
      const lien = screen.getByRole("link", { name: `Ouvrir la bibliothèque ${bibliotheque.nom}` });
      expect(lien).toHaveAttribute("href", bibliotheque.href);
    }
    expect(screen.getByText("412 éléments")).toBeInTheDocument();
    expect(screen.getByText(/1\s204 images/u)).toBeInTheDocument();
    expect(screen.getByText("9 à vérifier")).toBeInTheDocument();
  });

  it("reprend où l'on en était, aux positions lues dans les ancres (ANC-01, ANC-02)", () => {
    render(<App />);
    const reprises = screen.getAllByRole("article");
    expect(reprises.length).toBeGreaterThanOrEqual(REPRISES.length);

    const methode = reprises[0];
    expect(methode).toBeDefined();
    expect(methode).toHaveTextContent("Page 127");
    expect(methode).toHaveTextContent("piste 41");
    expect(screen.getByText(/Chapitre 4, page 88/)).toBeInTheDocument();
    expect(screen.getByText(/12:40/)).toBeInTheDocument();
    expect(screen.getByText(/diapositive 15/)).toBeInTheDocument();
  });

  it("montre l'avancement du traitement en toutes lettres (JOB-03, UX-07)", () => {
    render(<App />);
    expect(screen.getByRole("progressbar", { name: /transcription/i })).toHaveAttribute("aria-valuenow", "60");
    expect(screen.getByText("60 % · environ 4 min")).toBeInTheDocument();
  });

  it("n'a qu'un seul bouton principal (UX-09)", () => {
    const { container } = render(<App />);
    const principaux = container.querySelectorAll(".ln-btn--principal");
    expect(principaux).toHaveLength(1);
    expect(principaux[0]).toHaveTextContent("Nouvelle bibliothèque");
  });
});

describe("accueil : navigation au clavier complète (UX-06)", () => {
  it("commence par le lien d'évitement", async () => {
    const utilisateur = userEvent.setup();
    render(<App />);
    await utilisateur.tab();
    expect(screen.getByRole("link", { name: "Aller au contenu" })).toHaveFocus();
  });

  it("atteint chaque commande sans souris, y compris le dépôt de fichiers", async () => {
    const utilisateur = userEvent.setup();
    render(<App />);
    const vus = await parcourirAuClavier(utilisateur);

    const attendus = [
      screen.getByRole("searchbox"),
      screen.getByRole("button", { name: "Notifications" }),
      screen.getByLabelText("Thème"),
      screen.getByRole("button", { name: "Nouvelle bibliothèque" }),
      screen.getByRole("link", { name: "Ouvrir la vérification" }),
      screen.getByLabelText("Choisir des fichiers"),
      ...BIBLIOTHEQUES.map((bibliotheque) =>
        screen.getByRole("link", { name: `Ouvrir la bibliothèque ${bibliotheque.nom}` }),
      ),
      ...REPRISES.map((reprise) => screen.getByRole("link", { name: `Reprendre ${reprise.titre}` })),
    ];
    for (const element of attendus) {
      expect(vus, element.getAttribute("aria-label") ?? element.textContent ?? "").toContain(element);
    }
  });

  it("n'impose aucun ordre de tabulation artificiel", () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])')).toHaveLength(0);
  });

  it("le lien d'évitement mène au contenu principal", () => {
    render(<App />);
    const lien = screen.getByRole("link", { name: "Aller au contenu" });
    expect(lien).toHaveAttribute("href", "#contenu");
    expect(within(screen.getByRole("main")).getByRole("heading", { level: 1 })).toHaveTextContent("Bonjour");
    expect(screen.getByRole("main")).toHaveAttribute("id", "contenu");
  });
});
