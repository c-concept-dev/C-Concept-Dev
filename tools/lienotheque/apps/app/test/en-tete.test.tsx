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

describe("l'en-tête n'annonce que ce qui existe (22 octobre 2026)", () => {
  /** Cette épreuve attestait l'inverse, et c'est pour cela qu'elle est réécrite.
   *
   *  Elle vérifiait que le bouton du compte montre ses initiales et porte le nom entier. Il le
   *  faisait très bien — et **n'avait aucun gestionnaire de clic**. « Notifications » non plus.
   *  Deux portes peintes, sur tous les écrans d'une bibliothèque garnie, attestées par un test
   *  qui ne regardait que leur apparence.
   *
   *  Ni l'un ni l'autre n'ouvre quoi que ce soit : il n'existe ni écran de notifications ni
   *  écran de compte. Ils sont retirés jusqu'à ce qu'il y ait quelque chose derrière, et le
   *  filet des portes peintes couvre désormais l'en-tête pour qu'ils ne reviennent pas seuls. */
  it("ne porte ni bouton de compte ni bouton de notifications tant que rien ne les ouvre", () => {
    render(<EnTete theme="light" onThemeChange={vi.fn()} onRecherche={vi.fn()} donnees={GARNIE} />);
    expect(screen.queryByRole("button", { name: "Christophe Bonnet" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Notifications" })).toBeNull();
  });

  it("n'annonce plus « Synchronisé » : rien ne synchronise", () => {
    render(<EnTete theme="light" onThemeChange={vi.fn()} onRecherche={vi.fn()} donnees={GARNIE} />);
    expect(screen.queryByText("Synchronisé")).toBeNull();
  });

  it("dit la portée réelle de sa recherche", () => {
    render(<EnTete theme="light" onThemeChange={vi.fn()} onRecherche={vi.fn()} donnees={GARNIE} />);
    expect(screen.getByLabelText("Rechercher dans Une bibliothèque")).toBeInTheDocument();
    expect(screen.queryByText(/document ouvert/i)).toBeNull();
  });
});
