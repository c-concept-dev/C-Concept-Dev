import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VueBibliotheque } from "@lienotheque/contrats";
import { Recherche } from "../src/pages/Recherche.js";

/** La recherche ⌘K (maquette 5, RCH, UX-02, UX-06).
 *
 *  Les mots de cette bibliothèque-ci sont inventés : l'écran dit « repère », « plage » et
 *  « feuillet » parce qu'elle le dit. */

const ID = (n: number): string => `0190f0a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const EMPREINTE = "a".repeat(64);

const VUE = VueBibliotheque.parse({
  id: ID(1),
  nom: "Une bibliothèque",
  mots: {
    element: { un: "repère", plusieurs: "repères" },
    piste: { un: "plage", plusieurs: "plages" },
    page: { un: "feuillet", plusieurs: "feuillets" },
  },
  compteurs: [],
  pages: [
    {
      numero: 127,
      elements: [
        {
          ancreId: ID(10),
          numero: "400",
          titre: "travail d’articulation",
          page: 127,
          media: { empreinte: EMPREINTE, nom: "Plage 40.mp3", piste: 40, position: { segment: "inconnu" } },
          pourquoi: { preuve: "lu", confiance: 0.98, phrase: "Repère lu sur la page" },
        },
      ],
      texte: ["Travailler l’articulation détachée au métronome."],
    },
    {
      numero: 158,
      titre: "Introduction du quatrième ensemble",
      elements: [{ ancreId: ID(11), numero: "512", page: 158 }],
      texte: ["Avant d’aborder l’articulation détachée, la main reste souple."],
    },
  ],
});

function poser(sur: Partial<Parameters<typeof Recherche>[0]> = {}): {
  readonly onFermer: ReturnType<typeof vi.fn>;
  readonly onOuvrir: ReturnType<typeof vi.fn>;
  readonly onEcouter: ReturnType<typeof vi.fn>;
  readonly onAction: ReturnType<typeof vi.fn>;
} {
  const gestes = { onFermer: vi.fn(), onOuvrir: vi.fn(), onEcouter: vi.fn(), onAction: vi.fn() };
  render(<Recherche vue={VUE} {...gestes} {...sur} />);
  return gestes;
}

describe("ce que la recherche montre avant qu'on tape", () => {
  it("invite à chercher avec les mots de la bibliothèque (CLA-01)", () => {
    poser();
    expect(screen.getByText(/Cherchez un repère, un mot d’une feuillet, une plage/)).toBeInTheDocument();
  });

  it("dit où elle cherche", () => {
    poser();
    expect(screen.getByRole("dialog", { name: "Rechercher" })).toBeInTheDocument();
    expect(screen.getAllByText("Une bibliothèque").length).toBeGreaterThan(0);
  });

  it("montre les raccourcis : une palette qu'on ne peut conduire qu'à la souris n'a pas lieu d'être", () => {
    poser();
    for (const touche of ["parcourir", "ouvrir", "écouter", "changer de groupe", "fermer"])
      expect(screen.getByText(new RegExp(touche))).toBeInTheDocument();
  });
});

describe("chercher", () => {
  it("groupe les résultats avec les mots de la bibliothèque", async () => {
    const personne = userEvent.setup();
    poser();
    await personne.type(screen.getByRole("combobox"), "articulation");

    expect(screen.getByRole("group", { name: "Repères" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Feuillets" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Plages" })).toBeInTheDocument();
  });

  it("surligne ce qui correspond, accents compris", async () => {
    const personne = userEvent.setup();
    poser();
    await personne.type(screen.getByRole("combobox"), "detachee");

    const marques = screen.getAllByText("détachée", { selector: "mark" });
    expect(marques.length).toBeGreaterThan(0);
  });

  it("le dit quand rien ne correspond, au lieu de ne rien montrer", async () => {
    const personne = userEvent.setup();
    poser();
    await personne.type(screen.getByRole("combobox"), "clavecin");
    expect(screen.getByText(/Rien ici ne correspond/)).toBeInTheDocument();
  });
});

describe("tout se fait au clavier (UX-06)", () => {
  it("le premier résultat est choisi d'emblée", async () => {
    const personne = userEvent.setup();
    poser();
    await personne.type(screen.getByRole("combobox"), "articulation");

    const choisis = screen.getAllByRole("option", { selected: true });
    expect(choisis).toHaveLength(1);
    expect(choisis[0]).toHaveTextContent("400");
  });

  it("les flèches descendent et remontent, et font le tour", async () => {
    const personne = userEvent.setup();
    poser();
    await personne.type(screen.getByRole("combobox"), "articulation");
    const premier = screen.getAllByRole("option", { selected: true })[0]!.textContent;

    await personne.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option", { selected: true })[0]!.textContent).not.toBe(premier);
    await personne.keyboard("{ArrowUp}");
    expect(screen.getAllByRole("option", { selected: true })[0]!.textContent).toBe(premier);
  });

  it("la tabulation saute au groupe suivant, pas à la ligne suivante", async () => {
    const personne = userEvent.setup();
    poser();
    await personne.type(screen.getByRole("combobox"), "articulation");

    await personne.keyboard("{Tab}");
    const choisi = screen.getAllByRole("option", { selected: true })[0]!;
    expect(within(screen.getByRole("group", { name: "Feuillets" })).getByRole("option", { selected: true })).toBe(choisi);
  });

  it("entrée ouvre ce qui est choisi", async () => {
    const personne = userEvent.setup();
    const { onOuvrir } = poser();
    await personne.type(screen.getByRole("combobox"), "articulation");

    await personne.keyboard("{Enter}");
    expect(onOuvrir).toHaveBeenCalledTimes(1);
    expect((onOuvrir.mock.calls[0] as [{ page: number }])[0].page).toBe(127);
  });

  it("commande-entrée écoute la piste reliée, quand il y en a une", async () => {
    const personne = userEvent.setup();
    const { onEcouter, onOuvrir } = poser();
    await personne.type(screen.getByRole("combobox"), "articulation");

    await personne.keyboard("{Meta>}{Enter}{/Meta}");
    expect(onEcouter).toHaveBeenCalledTimes(1);
    expect(onOuvrir).not.toHaveBeenCalled();
  });

  it("échap ferme", async () => {
    const personne = userEvent.setup();
    const { onFermer } = poser();
    await personne.keyboard("{Escape}");
    expect(onFermer).toHaveBeenCalledTimes(1);
  });
});

describe("l'aperçu suit ce qui est choisi", () => {
  it("dit ce qu'on regarde, et à quoi c'est relié", async () => {
    const personne = userEvent.setup();
    poser();
    await personne.type(screen.getByRole("combobox"), "articulation");

    const apercu = screen.getByRole("complementary", { name: "Aperçu" });
    expect(within(apercu).getByText(/feuillet 127/)).toBeInTheDocument();
    expect(within(apercu).getByText("Relié à la plage 40.")).toBeInTheDocument();
  });

  it("le dit quand la page n'a pas d'image, au lieu d'un cadre vide", async () => {
    const personne = userEvent.setup();
    poser();
    await personne.type(screen.getByRole("combobox"), "articulation");

    expect(screen.getByText(/n’a pas encore d’image/)).toBeInTheDocument();
  });

  it("n'offre « Écouter » que là où il y a quelque chose à écouter", async () => {
    const personne = userEvent.setup();
    poser();
    await personne.type(screen.getByRole("combobox"), "souple");

    const apercu = screen.getByRole("complementary", { name: "Aperçu" });
    expect(within(apercu).queryByRole("button", { name: /Écouter/ })).not.toBeInTheDocument();
    expect(within(apercu).getByRole("button", { name: /Ouvrir la feuillet/ })).toBeInTheDocument();
  });
});

describe("les actions mènent ailleurs que dans la bibliothèque", () => {
  const actions = [{ cle: "organisation", titre: "Revoir l’organisation", source: "Une bibliothèque", aussi: ["ranger"] }];

  it("se trouvent, et rendent leur clé telle que l'écran l'a donnée", async () => {
    const personne = userEvent.setup();
    const { onAction, onOuvrir } = poser({ actions });
    await personne.type(screen.getByRole("combobox"), "ranger");

    await personne.keyboard("{Enter}");
    expect(onAction).toHaveBeenCalledWith("organisation");
    expect(onOuvrir).not.toHaveBeenCalled();
  });
});
