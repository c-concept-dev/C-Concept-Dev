import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Passage, VueBibliotheque } from "@lienotheque/contrats";
import { LectureDuTexte } from "../src/pages/LectureDuTexte.js";

/** Lire un document qui n'a aucune image (RCH-07, RCH-09, CLA-01).
 *
 *  Le chantier ouvert le 21 octobre 2026 : les pages de la vue viennent de la chaîne d'images, et
 *  un document composé en texte n'en porte aucune. Son texte, lui, est lu entièrement — il
 *  manquait seulement un écran pour le montrer. Route A du chantier : le texte, sans image. */

const ID = (n: number): string => `3c9e1f20-7b4d-4a18-9e52-0c6a8d1f4b${String(n).padStart(2, "0")}`;

const vueSansPage = (mots?: { un: string; plusieurs: string }): VueBibliotheque =>
  VueBibliotheque.parse({
    id: ID(1),
    nom: "Fonds d’étude",
    mots: {
      element: { un: "repère", plusieurs: "repères" },
      piste: { un: "plage", plusieurs: "plages" },
      page: mots ?? { un: "page", plusieurs: "pages" },
    },
    compteurs: [],
    aVerifier: 0,
    filtres: [],
    // Le fait qui ouvre tout ce chantier : aucune page affichable.
    pages: [],
    douteux: [],
  });

const passage = (quoi: Partial<Passage> & { rang: number; page: number }): Passage =>
  Passage.parse({ texte: `Texte du rang ${quoi.rang}.`, source: "couche_texte", ...quoi });

const TROIS = [
  passage({ rang: 0, page: 1, pageImprimee: 125, texte: "Première ligne lue.\n\nSeconde ligne lue." }),
  passage({ rang: 1, page: 2, pageImprimee: 126 }),
  passage({ rang: 2, page: 3, pageImprimee: 127 }),
];

describe("un document sans image se lit quand même (RCH-07)", () => {
  it("montre le texte de la page demandée, et non le premier venu", () => {
    render(<LectureDuTexte vue={vueSansPage()} passages={TROIS} page={3} onPage={vi.fn()} />);
    expect(screen.getByText("Texte du rang 2.")).toBeTruthy();
    expect(screen.queryByText("Première ligne lue.")).toBeNull();
  });

  it("rend chaque paragraphe du texte, sans les recoller", () => {
    render(<LectureDuTexte vue={vueSansPage()} passages={TROIS} page={1} onPage={vi.fn()} />);
    expect(screen.getByText("Première ligne lue.")).toBeTruthy();
    expect(screen.getByText("Seconde ligne lue.")).toBeTruthy();
  });

  it("retombe sur le premier passage quand la page demandée n'existe pas", () => {
    render(<LectureDuTexte vue={vueSansPage()} passages={TROIS} page={99} onPage={vi.fn()} />);
    expect(screen.getByText("Première ligne lue.")).toBeTruthy();
  });
});

describe("savoir où l'on est, et pouvoir le citer (RCH-09)", () => {
  it("nomme le document ouvert dans le fil d'Ariane", () => {
    render(
      <LectureDuTexte
        vue={vueSansPage()}
        document="Livre sans images.epub"
        passages={TROIS}
        page={1}
        onPage={vi.fn()}
      />,
    );
    expect(screen.getByRole("navigation", { name: /fil d’ariane/i })).toHaveTextContent("Livre sans images.epub");
  });

  it("cite par le numéro imprimé quand la page le porte", () => {
    render(<LectureDuTexte vue={vueSansPage()} passages={TROIS} page={3} onPage={vi.fn()} />);
    expect(screen.getByText(/page 127/i)).toBeTruthy();
  });

  it("cite par le rang, et le dit, quand aucun numéro n'est imprimé", () => {
    const sansNumero = [passage({ rang: 0, page: 1 }), passage({ rang: 1, page: 2 })];
    render(<LectureDuTexte vue={vueSansPage()} passages={sansNumero} page={2} onPage={vi.fn()} />);
    // « page 2 du document » : jamais un numéro imprimé inventé.
    expect(screen.getByText(/page 2 du document/i)).toBeTruthy();
  });

  it("dit le rang dans le document, pour qu'on sache où l'on en est", () => {
    render(<LectureDuTexte vue={vueSansPage()} passages={TROIS} page={2} onPage={vi.fn()} />);
    expect(screen.getByText(/2\s*\/\s*3/)).toBeTruthy();
  });

  it("emprunte le mot de la bibliothèque, jamais le sien (CLA-01)", () => {
    const vue = vueSansPage({ un: "feuillet", plusieurs: "feuillets" });
    render(<LectureDuTexte vue={vue} passages={TROIS} page={3} onPage={vi.fn()} />);
    expect(screen.getByText(/feuillet 127/i)).toBeTruthy();
  });

  it("montre l'emplacement quand le format le nomme, sans s'en servir pour citer", () => {
    const chapitres = [passage({ rang: 0, page: 1, emplacement: "Chapitre 4 — L’attente" })];
    render(<LectureDuTexte vue={vueSansPage()} passages={chapitres} page={1} onPage={vi.fn()} />);
    expect(screen.getByText("Chapitre 4 — L’attente")).toBeTruthy();
  });
});

describe("avancer et revenir", () => {
  it("appelle la page du passage suivant", async () => {
    const onPage = vi.fn();
    render(<LectureDuTexte vue={vueSansPage()} passages={TROIS} page={2} onPage={onPage} />);
    await userEvent.click(screen.getByRole("button", { name: /suivant/i }));
    expect(onPage).toHaveBeenCalledWith(3);
  });

  it("appelle la page du passage précédent", async () => {
    const onPage = vi.fn();
    render(<LectureDuTexte vue={vueSansPage()} passages={TROIS} page={2} onPage={onPage} />);
    await userEvent.click(screen.getByRole("button", { name: /précédent/i }));
    expect(onPage).toHaveBeenCalledWith(1);
  });

  it("ne propose rien au-delà des bords", () => {
    render(<LectureDuTexte vue={vueSansPage()} passages={TROIS} page={1} onPage={vi.fn()} />);
    expect(screen.getByRole("button", { name: /précédent/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /suivant/i }).hasAttribute("disabled")).toBe(false);
  });

  it("suit les flèches du clavier", async () => {
    const onPage = vi.fn();
    render(<LectureDuTexte vue={vueSansPage()} passages={TROIS} page={2} onPage={onPage} />);
    await userEvent.keyboard("{ArrowRight}");
    expect(onPage).toHaveBeenCalledWith(3);
  });
});

describe("dire d'où vient le texte, plutôt que de le faire passer pour éditorial", () => {
  it("signale un texte venu de la reconnaissance", () => {
    const reconnu = [passage({ rang: 0, page: 1, source: "ocr" })];
    render(<LectureDuTexte vue={vueSansPage()} passages={reconnu} page={1} onPage={vi.fn()} />);
    expect(screen.getByText(/reconnu/i)).toBeTruthy();
  });

  it("ne signale rien quand le texte vient de la couche du document", () => {
    render(<LectureDuTexte vue={vueSansPage()} passages={TROIS} page={1} onPage={vi.fn()} />);
    expect(screen.queryByText(/reconnu/i)).toBeNull();
  });

  it("dit qu'une page n'a rien donné de lisible, plutôt que de montrer du vide (FMT-04)", () => {
    const illisible = [passage({ rang: 0, page: 1, lisible: false, texte: "···" })];
    render(<LectureDuTexte vue={vueSansPage()} passages={illisible} page={1} onPage={vi.fn()} />);
    expect(screen.getByText(/rien.*lisible/i)).toBeTruthy();
  });
});
