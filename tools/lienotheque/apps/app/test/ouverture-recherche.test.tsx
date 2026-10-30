import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ports = vi.hoisted(() => ({
  lecture: {
    apercuDeBibliotheque: vi.fn(),
    vueDeDocument: vi.fn(),
    passagesDeDocument: vi.fn(),
    rechercherBibliotheque: vi.fn(),
    versionActive: vi.fn(),
    imageDePage: vi.fn(),
    classementsDeBibliotheque: vi.fn(),
    classerDocument: vi.fn(),
  },
  administration: {
    bibliothequesRetenues: vi.fn(),
    choisirDossier: vi.fn(),
    lireBibliotheque: vi.fn(),
    retenirBibliotheque: vi.fn(),
    etatApplicationEmbarquee: vi.fn(),
    faireTourner: vi.fn(),
    travauxDe: vi.fn(),
  },
}));

vi.mock("../src/pont/choix.js", () => ({
  pontDeLecture: () => ports.lecture,
  pontDAdministration: () => ports.administration,
}));

import { App } from "../src/App.js";

const description = (id: string, nom: string) => ({
  id,
  nom,
  contenus: ["documents"],
  mots: {
    element: { un: "élément", plusieurs: "éléments" },
    piste: { un: "piste", plusieurs: "pistes" },
    page: { un: "page", plusieurs: "pages" },
  },
  schema: {
    cle: id,
    nom,
    langue: "fr",
    version: 1,
    axes: [],
  },
});

describe("la recherche suit la bibliothèque réellement ouverte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.history.replaceState({}, "", "/");

    ports.lecture.apercuDeBibliotheque.mockResolvedValue([]);
    ports.lecture.classementsDeBibliotheque.mockResolvedValue(new Map());
    ports.administration.bibliothequesRetenues.mockResolvedValue([
      { racine: "/Volumes/Ancienne", description: description("ancienne", "Bibliothèque musicale") },
    ]);
    ports.administration.choisirDossier.mockResolvedValue("/Volumes/Copie");
    ports.administration.lireBibliotheque.mockResolvedValue(description("copie", "Copie portable"));
    ports.administration.retenirBibliotheque.mockResolvedValue({ appareil: "appareil", bibliotheques: ["/Volumes/Copie"] });
    ports.administration.etatApplicationEmbarquee.mockResolvedValue({
      statut: "absente",
      versionCourante: "0.1.0",
      versionEmbarquee: null,
      message: "absente",
      actionDisponible: false,
    });
    ports.administration.faireTourner.mockResolvedValue(false);
    ports.administration.travauxDe.mockResolvedValue([]);
  });

  it("nomme une bibliothèque vide ouverte depuis le disque, pas la première carte de l'accueil", async () => {
    const utilisateur = userEvent.setup();
    render(<App />);

    await utilisateur.click(await screen.findByRole("button", { name: /ouvrir une bibliothèque du disque/i }));

    await waitFor(() =>
      expect(screen.getByRole("searchbox")).toHaveAccessibleName("Rechercher dans Copie portable"),
    );
  });

  it("une bibliothèque sans version ouvre un vrai catalogue vide, jamais l'accueil", async () => {
    const utilisateur = userEvent.setup();
    render(<App />);

    await utilisateur.click(await screen.findByRole("button", { name: /ouvrir une bibliothèque du disque/i }));
    await utilisateur.click(await screen.findByRole("button", { name: /continuer vers le dépôt/i }));
    await utilisateur.click(await screen.findByRole("button", { name: /^catalogue$/i }));

    expect(globalThis.location.hash).toBe("#catalogue");
    expect(await screen.findByRole("heading", { level: 1, name: "Copie portable" })).toBeInTheDocument();
    expect(screen.getByText("Aucun document dans cette bibliothèque.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Bonjour" })).toBeNull();
  });

});
