import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VueBibliotheque } from "@lienotheque/contrats";
import { Catalogue } from "../src/pages/Catalogue.js";

const ID = (n: number): string => `6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a${String(n).padStart(2, "0")}`;
const EMPREINTE = "a".repeat(64);

const VUE = VueBibliotheque.parse({
  id: ID(1),
  nom: "Recueil de procédures",
  mots: {
    element: { un: "clause", plusieurs: "clauses" },
    piste: { un: "plage", plusieurs: "plages" },
    page: { un: "feuillet", plusieurs: "feuillets" },
  },
  compteurs: [
    { nombre: 412, mot: "clauses" },
    { nombre: 380, mot: "liens" },
  ],
  aVerifier: 9,
  filtres: [
    { cle: "niveau", nom: "Niveau", valeurs: [{ cle: "debutant", nom: "Débutant", nombre: 146 }, { cle: "avance", nom: "Avancé", nombre: 82 }] },
    { cle: "audio", nom: "Avec audio", valeurs: [{ cle: "oui", nom: "Oui", nombre: 380 }] },
  ],
  pages: [
    {
      numero: 126,
      titre: "Gammes",
      elements: [{ ancreId: ID(20), numero: "399", page: 126, aVerifier: false }],
      texte: [],
      traduction: [],
    },
    {
      numero: 127,
      titre: "Lecture et articulation",
      elements: [
        {
          ancreId: ID(21),
          numero: "400",
          page: 127,
          media: { empreinte: EMPREINTE, nom: "a.mp3", piste: 40, position: { segment: "inconnu" } },
          pourquoi: { preuve: "lu", confiance: 1, phrase: "Repère lu" },
          aVerifier: false,
        },
        { ancreId: ID(22), numero: "401", page: 127, aVerifier: true },
      ],
      texte: [],
      traduction: [],
    },
  ],
  douteux: [],
});

function poser() {
  const pages: number[] = [];
  const vers: { page: number; ancre: string }[] = [];
  const ajouter = vi.fn();
  render(<Catalogue vue={VUE} page={127} onPage={(n) => pages.push(n)} onLecteur={(p, a) => vers.push({ page: p, ancre: a })} onAjouter={ajouter} />);
  return { pages, vers, ajouter };
}

describe("Catalogue : en-tête (CLA-10, UX-01)", () => {
  it("porte le nom, les compteurs et le bouton principal", async () => {
    const { ajouter } = poser();
    expect(screen.getByRole("heading", { name: "Recueil de procédures", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/412 clauses/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /ajouter des fichiers/i }));
    expect(ajouter).toHaveBeenCalledOnce();
  });

  it("mène à Vérifier quand il reste des cas", () => {
    poser();
    expect(screen.getByRole("link", { name: /9 à vérifier/i })).toHaveAttribute("href", "#verifier");
  });

  it("le fil d’Ariane s’arrête à la bibliothèque", () => {
    poser();
    const ariane = screen.getByRole("navigation", { name: /fil d’ariane/i });
    expect(within(ariane).getAllByRole("listitem").map((i) => i.textContent)).toEqual(["Accueil", "Recueil de procédures"]);
  });
});

describe("Catalogue : filtres tirés de la nomenclature (CLA-10)", () => {
  it("montre un axe par filtre, avec ses compteurs", () => {
    poser();
    expect(screen.getByRole("heading", { name: "Niveau", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Avec audio", level: 3 })).toBeInTheDocument();
    expect(screen.getByText("146")).toBeInTheDocument();
  });

  it("se cochent et se décochent", async () => {
    poser();
    const debutant = screen.getByRole("checkbox", { name: /débutant/i });
    expect(debutant).not.toBeChecked();
    await userEvent.click(debutant);
    expect(debutant).toBeChecked();
    await userEvent.click(debutant);
    expect(debutant).not.toBeChecked();
  });
});

describe("Catalogue : grille et liste", () => {
  it("bascule d’une vue à l’autre", async () => {
    poser();
    expect(screen.getByRole("button", { name: /grille/i })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /liste/i }));
    expect(screen.getByRole("button", { name: /liste/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /grille/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("montre chaque feuillet avec ce qui y est relié", () => {
    poser();
    expect(screen.getByRole("button", { name: "Feuillet 127" })).toBeInTheDocument();
    expect(screen.getByText(/Clauses : 1/)).toBeInTheDocument();
    expect(screen.getByText(/Clauses : 0/)).toBeInTheDocument();
  });

  it("signale les feuillets qui portent un cas à vérifier", () => {
    poser();
    expect(screen.getAllByText(/1 à vérifier/).length).toBeGreaterThan(0);
  });

  it("choisit un feuillet", async () => {
    const { pages } = poser();
    await userEvent.click(screen.getByRole("button", { name: "Feuillet 126" }));
    expect(pages).toContain(126);
  });
});

describe("Catalogue : panneau de détail (B3)", () => {
  it("liste les clauses de la page, leurs liens et leur état", () => {
    poser();
    const detail = screen.getByRole("complementary", { name: /détail — feuillet 127/i });
    expect(within(detail).getByText("Clause 400")).toBeInTheDocument();
    expect(within(detail).getByText(/→ Plage 40/)).toBeInTheDocument();
    expect(within(detail).getByText(/lien validé/)).toBeInTheDocument();
    expect(within(detail).getByText(/à vérifier/)).toBeInTheDocument();
    expect(within(detail).getByText(/Sans plage/)).toBeInTheDocument();
  });

  it("ouvre dans le Lecteur, sur le bon feuillet", async () => {
    const { vers } = poser();
    await userEvent.click(screen.getByRole("button", { name: /ouvrir dans le lecteur/i }));
    expect(vers).toEqual([{ page: 127, ancre: ID(21) }]);
  });
});

describe("Catalogue : les mots viennent du schéma (CLA-01)", () => {
  it("n’écrit ni « page » ni « élément » de son propre chef", () => {
    const { container } = render(
      <Catalogue vue={VUE} page={127} onPage={() => {}} onLecteur={() => {}} onAjouter={() => {}} />,
    );
    const texte = (container.textContent ?? "").toLowerCase();
    expect(texte).toContain("feuillet");
    expect(texte).not.toMatch(/\bpages?\b/);
    expect(texte).not.toMatch(/\bélements?\b/);
  });
});
