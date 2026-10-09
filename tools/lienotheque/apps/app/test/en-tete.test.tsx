import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EnTete } from "../src/EnTete.js";
import { ACCUEIL_VIDE, type DonneesAccueil } from "../src/donnees/modele.js";

/** L'en-tête (UX-03) : ce qu'il annonce doit être vrai.
 *
 *  Il disait « 1 traitement en cours » quoi qu'il arrive — un chiffre écrit dans le code, qui
 *  disait toujours la même chose et ne disait donc rien. */

/** Une bibliothèque, juste assez garnie pour que l'en-tête montre ses états. */
const GARNIE: DonneesAccueil = {
  ...ACCUEIL_VIDE,
  bibliotheques: [
    {
      id: "0190f0a0-0000-7000-8000-000000000001",
      nom: "Une bibliothèque",
      href: "#catalogue",
      collection: "method",
      icones: ["livre"],
      compteurs: [],
      hebergement: { libelle: "Sur cet ordinateur", icones: ["ordinateur"] },
      etat: { libelle: "Prêt", icone: "valide" },
      ouverte: "aujourd’hui",
    },
  ],
  compte: { initiales: "CB", nom: "Christophe Bonnet" },
};

describe("le compteur de traitements dit la file, et non un chiffre écrit d'avance", () => {
  it("n'annonce rien quand rien ne tourne", () => {
    render(<EnTete theme="light" onThemeChange={vi.fn()} onRecherche={vi.fn()} donnees={GARNIE} enTraitement={0} />);
    expect(screen.queryByText(/traitement/i)).not.toBeInTheDocument();
  });

  it("n'annonce rien non plus quand personne ne le lui a dit", () => {
    render(<EnTete theme="light" onThemeChange={vi.fn()} onRecherche={vi.fn()} donnees={GARNIE} />);
    expect(screen.queryByText(/traitement/i)).not.toBeInTheDocument();
  });

  it("annonce le nombre réel, au singulier comme au pluriel", () => {
    const { rerender } = render(
      <EnTete theme="light" onThemeChange={vi.fn()} onRecherche={vi.fn()} donnees={GARNIE} enTraitement={1} />,
    );
    expect(screen.getByText("1 traitement en cours")).toBeInTheDocument();

    rerender(<EnTete theme="light" onThemeChange={vi.fn()} onRecherche={vi.fn()} donnees={GARNIE} enTraitement={3} />);
    expect(screen.getByText("3 traitements en cours")).toBeInTheDocument();
  });
});

describe("les boutons carrés de l'en-tête", () => {
  it("montrent les initiales du compte, et portent son nom entier", () => {
    render(<EnTete theme="light" onThemeChange={vi.fn()} onRecherche={vi.fn()} donnees={GARNIE} />);
    const compte = screen.getByRole("button", { name: "Christophe Bonnet" });
    expect(compte).toHaveTextContent("CB");
  });
});
