import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** En ligne, la bibliothèque porte **son** nom (UX-07, CLA-01).
 *
 *  ## Le défaut, mesuré le 1er novembre 2026
 *
 *  Trois endroits d'`App.tsx` écrivaient « Base de connaissance » : la carte de l'accueil, le
 *  champ de recherche et le panneau de recherche globale. Toute bibliothèque servie en ligne
 *  s'appelait donc ainsi, quel que soit son nom réel — un mot qui ne vient pas de la bibliothèque,
 *  affiché à sa place, sur tous les écrans.
 *
 *  Le nom n'était pourtant pas introuvable : `lireBibliotheque` est réservé au bureau, mais la
 *  **vue** d'un document porte déjà `id`, `nom` et `mots` de la bibliothèque, construits à
 *  l'ingestion et publiés tels quels. Le service exposait l'identité depuis toujours ; c'est
 *  l'application qui ne la lisait pas.
 */

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
}));

vi.mock("../src/pont/choix.js", () => ({
  pontDeLecture: () => ports.lecture,
  // En ligne, il n'y a pas d'administration : c'est à cela que l'application le reconnaît.
  pontDAdministration: () => undefined,
}));

import { App } from "../src/App.js";

const MOTS = {
  element: { un: "élément", plusieurs: "éléments" },
  piste: { un: "piste", plusieurs: "pistes" },
  page: { un: "page", plusieurs: "pages" },
};

const DOCUMENT = {
  empreinte: "a".repeat(64),
  nom: "Un document.pdf",
  version: "0190f0a0-0000-7000-8000-0000000000a1",
  activeeLe: 1_700_000_000,
  pages: 12,
  compteurs: [{ nombre: 12, mot: "pages" }],
  aVerifier: 0,
};

const VUE = {
  id: "0190f0a0-0000-7000-8000-000000000001",
  nom: "Bibliothèque Musique",
  mots: MOTS,
  compteurs: [{ nombre: 1, mot: "document" }],
  aVerifier: 0,
  filtres: [],
  pages: [],
  douteux: [],
};

describe("en ligne, la bibliothèque porte son nom et non un mot écrit dans le code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    globalThis.history.replaceState({}, "", "/");
    ports.lecture.apercuDeBibliotheque.mockResolvedValue([DOCUMENT]);
    ports.lecture.classementsDeBibliotheque.mockResolvedValue(new Map());
    ports.lecture.vueDeDocument.mockResolvedValue(VUE);
    ports.lecture.passagesDeDocument.mockResolvedValue([]);
  });

  it("nomme la bibliothèque servie, dans le champ de recherche", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("searchbox")).toHaveAccessibleName("Rechercher dans Bibliothèque Musique"),
    );
  });

  it("n'écrit nulle part le nom inventé", async () => {
    render(<App />);
    await waitFor(() => expect(ports.lecture.vueDeDocument).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/Base de connaissance/i)).toBeNull());
  });
});

describe("le catalogue n'affiche pas l'accueil pendant qu'il s'ouvre", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    globalThis.history.replaceState({}, "", "/#catalogue");
    ports.lecture.apercuDeBibliotheque.mockResolvedValue([DOCUMENT]);
    ports.lecture.classementsDeBibliotheque.mockResolvedValue(new Map());
    ports.lecture.passagesDeDocument.mockResolvedValue([]);
  });

  it("dit qu'il ouvre, plutôt que de montrer un autre écran", async () => {
    // La vue n'arrive jamais : c'est l'instant qu'on éprouve, celui où les documents sont connus
    // et la vue pas encore là. L'écran montrait alors l'accueil — juste, mais pas demandé.
    ports.lecture.vueDeDocument.mockReturnValue(new Promise(() => undefined));
    render(<App />);
    await waitFor(() => expect(ports.lecture.vueDeDocument).toHaveBeenCalled());
    expect(await screen.findByText(/Ouverture de la bibliothèque/i)).toBeDefined();
    expect(screen.queryByRole("heading", { name: /Vos bibliothèques/i }), "pas l'accueil").toBeNull();
  });
});
