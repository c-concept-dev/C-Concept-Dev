import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VueBibliotheque } from "@lienotheque/contrats";
import { Catalogue } from "../src/pages/Catalogue.js";
import { Lecteur } from "../src/pages/Lecteur.js";

/** Les deux réserves du lot C, côté écrans (B1, CLA-10). */

const ID = (n: number): string => `6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a${String(n).padStart(2, "0")}`;
const EMPREINTE = "a".repeat(64);
const MOTS = {
  element: { un: "clause", plusieurs: "clauses" },
  piste: { un: "plage", plusieurs: "plages" },
  page: { un: "feuillet", plusieurs: "feuillets" },
};

const media = { empreinte: EMPREINTE, nom: "a.mp3", piste: 7, position: { segment: "inconnu" as const } };
const pourquoi = { preuve: "lu" as const, confiance: 1, phrase: "Repère lu" };

const VUE_LECTEUR = VueBibliotheque.parse({
  id: ID(1),
  nom: "Recueil",
  mots: MOTS,
  compteurs: [],
  aVerifier: 0,
  filtres: [],
  douteux: [],
  pages: [
    {
      numero: 126,
      image: "/donnees/pages/page-0000.webp",
      largeur: 1240,
      hauteur: 1754,
      texte: [],
      traduction: [],
      elements: [
        { ancreId: ID(20), numero: "401", page: 126, zone: { x: 0.08, y: 0.2, l: 0.05, h: 0.03 }, media, pourquoi, aVerifier: false },
        { ancreId: ID(21), numero: "402", page: 126, zone: { x: 0.08, y: 0.6, l: 0.05, h: 0.03 }, media, pourquoi, aVerifier: false },
        // Un numéro réparé n'a été lu nulle part : il n'a pas de zone, et n'en invente pas.
        { ancreId: ID(22), numero: "403", page: 126, media, pourquoi, aVerifier: false },
      ],
    },
  ],
});

describe("B1 : le Lecteur cadre les zones lues sur la vraie page", () => {
  it("pose une zone cliquable par élément lu, aux parts de la page", () => {
    render(<Lecteur vue={VUE_LECTEUR} page={126} element={ID(20)} onPage={vi.fn()} onElement={vi.fn()} />);

    const zones = document.querySelectorAll<HTMLElement>(".ln-page__zone");
    expect(zones, "deux éléments lus, deux zones ; le réparé n'en a pas").toHaveLength(2);
    expect(zones[0]?.style.left, "en pourcentage : le zoom ne déplace pas une zone").toBe("8%");
    expect(zones[0]?.style.top).toBe("20%");
    expect(zones[0]?.style.width).toBe("5%");
  });

  it("nomme chaque zone avec les mots de la bibliothèque", () => {
    render(<Lecteur vue={VUE_LECTEUR} page={126} element={ID(20)} onPage={vi.fn()} onElement={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Clause 401" })).toBeInTheDocument();
  });

  it("marque la zone active, et une seule", () => {
    render(<Lecteur vue={VUE_LECTEUR} page={126} element={ID(21)} onPage={vi.fn()} onElement={vi.fn()} />);
    const actives = document.querySelectorAll(".ln-page__zone--actif");
    expect(actives).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Clause 402" })).toHaveAttribute("aria-current", "true");
  });

  it("change d'élément quand on clique une zone", async () => {
    const onElement = vi.fn();
    render(<Lecteur vue={VUE_LECTEUR} page={126} element={ID(20)} onPage={vi.fn()} onElement={onElement} />);
    await userEvent.click(screen.getByRole("button", { name: "Clause 402" }));
    expect(onElement).toHaveBeenCalledWith(ID(21));
  });
});

const page = (numero: number, valeurs: Record<string, string[]>, relie: boolean): unknown => ({
  numero,
  texte: [],
  traduction: [],
  valeurs,
  elements: [
    {
      ancreId: ID(numero),
      numero: String(numero),
      page: numero,
      aVerifier: false,
      ...(relie ? { media, pourquoi } : {}),
    },
  ],
});

const VUE_CATALOGUE = VueBibliotheque.parse({
  id: ID(1),
  nom: "Recueil",
  mots: MOTS,
  compteurs: [],
  aVerifier: 0,
  douteux: [],
  filtres: [
    {
      cle: "ecoute",
      nom: "Avec écoute",
      filtrable: true,
      valeurs: [
        { cle: "oui", nom: "Oui", nombre: 2 },
        { cle: "non", nom: "Non", nombre: 1 },
      ],
    },
  ],
  pages: [page(1, { ecoute: ["oui"] }, true), page(2, { ecoute: ["oui"] }, true), page(3, { ecoute: ["non"] }, false)],
});

describe("CLA-10 : un axe du schéma trie vraiment", () => {
  const poser = (): void => {
    render(<Catalogue vue={VUE_CATALOGUE} onPage={vi.fn()} onLecteur={vi.fn()} onAjouter={vi.fn()} />);
  };

  it("réaffiche le groupe, avec les comptes que l'instantané a calculés", () => {
    poser();
    const axe = screen.getByRole("group", { name: "Avec écoute" });
    expect(within(axe).getByText("2")).toBeInTheDocument();
    expect(within(axe).getByText("1")).toBeInTheDocument();
  });

  it("réduit la liste à ce que la valeur cochée désigne", async () => {
    poser();
    expect(screen.getAllByRole("button", { name: /^Feuillet \d+$/ })).toHaveLength(3);

    await userEvent.click(screen.getByRole("checkbox", { name: /oui/i }));
    const restantes = screen.getAllByRole("button", { name: /^Feuillet \d+$/ }).map((bouton) => bouton.textContent);
    expect(restantes).toHaveLength(2);
    expect(restantes.join(" ")).not.toContain("Feuillet 3");
  });

  it("deux valeurs du même axe valent « l'une ou l'autre »", async () => {
    poser();
    await userEvent.click(screen.getByRole("checkbox", { name: /oui/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /non/i }));
    expect(screen.getAllByRole("button", { name: /^Feuillet \d+$/ })).toHaveLength(3);
  });

  it("croise l'axe du schéma avec celui de l'application", async () => {
    poser();
    // « Validé » : les trois pages le sont. Croisé avec « Non », il ne reste que le feuillet 3.
    // Le nom accessible d'une case porte aussi son compte : « Validé 3 ».
    await userEvent.click(screen.getByRole("checkbox", { name: /validé/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /non/i }));
    const restantes = screen.getAllByRole("button", { name: /^Feuillet \d+$/ }).map((bouton) => bouton.textContent);
    expect(restantes).toHaveLength(1);
    expect(restantes[0]).toContain("Feuillet 3");
  });

  it("tout décocher rend toutes les pages, jamais une liste vide", async () => {
    poser();
    const oui = screen.getByRole("checkbox", { name: /oui/i });
    await userEvent.click(oui);
    await userEvent.click(oui);
    expect(screen.getAllByRole("button", { name: /^Feuillet \d+$/ })).toHaveLength(3);
  });
});
