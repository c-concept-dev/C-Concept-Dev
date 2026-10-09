import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DescriptionBibliotheque } from "@lienotheque/contrats";
import { BROUILLON_NEUF, type Brouillon } from "@lienotheque/noyau";
import { ManiereDeLire } from "../src/pages/ManiereDeLire.js";

/** Montrer où regarder (maquette 4, REC-01, REC-07, UX-06, UX-09).
 *
 *  Les mots de cette bibliothèque-ci sont inventés : l'écran dit « exercice » et « feuillet »
 *  parce qu'elle le dit. */

const DESCRIPTION = DescriptionBibliotheque.parse({
  id: "une-bibliotheque",
  nom: "Une bibliothèque",
  contenus: ["documents"],
  mots: {
    element: { un: "exercice", plusieurs: "exercices" },
    piste: { un: "plage", plusieurs: "plages" },
    page: { un: "feuillet", plusieurs: "feuillets" },
  },
  schema: {
    cle: "un-schema",
    nom: "Un schéma",
    langue: "fr",
    version: 1,
    axes: [{ cle: "un-axe", nom: "Un axe", nature: "etiquettes", cardinalite: "plusieurs" }],
  },
});

const AVEC_ZONE: Brouillon = {
  ...BROUILLON_NEUF,
  zones: [{ cle: "z1", role: "element", rectangle: { x: 0.05, y: 0.1, l: 0.08, h: 0.8 } }],
};

const PAGES = [
  { rang: 0, image: "data:image/webp;base64,AA" },
  { rang: 1, image: "data:image/webp;base64,BB" },
];

function poser(sur: Partial<Parameters<typeof ManiereDeLire>[0]> = {}): {
  readonly onBrouillon: ReturnType<typeof vi.fn>;
  readonly onEssayer: ReturnType<typeof vi.fn>;
  readonly onEnregistrer: ReturnType<typeof vi.fn>;
  readonly onAutresPages: ReturnType<typeof vi.fn>;
} {
  const gestes = {
    onBrouillon: vi.fn(),
    onEssayer: vi.fn(),
    onEnregistrer: vi.fn(),
    onAutresPages: vi.fn(),
  };
  render(
    <ManiereDeLire
      description={DESCRIPTION}
      document="un-document.pdf"
      pages={PAGES}
      brouillon={AVEC_ZONE}
      {...gestes}
      {...sur}
    />,
  );
  return gestes;
}

describe("ce que l'écran dit avant qu'on trace", () => {
  it("emploie les mots de la bibliothèque, jamais les nôtres (CLA-01)", () => {
    poser({ brouillon: BROUILLON_NEUF });
    expect(screen.getByText(/Tracez une zone sur la feuillet/)).toBeInTheDocument();
    expect(screen.getByText(/numéro d’exercice/)).toBeInTheDocument();
  });

  it("dit ce qui manque plutôt que d'éteindre un bouton sans raison (UX-09)", () => {
    poser({ brouillon: BROUILLON_NEUF });
    expect(screen.getByText(/Tracez d’abord la zone/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Essayer sur 10 feuillets/ })).toBeDisabled();
  });

  it("laisse essayer dès qu'une zone d'éléments est tracée", () => {
    poser();
    expect(screen.getByRole("button", { name: /Essayer sur 10 feuillets/ })).toBeEnabled();
  });

  it("le dit quand les pages n'ont pas encore été préparées, au lieu d'un cadre vide", () => {
    poser({ pages: [] });
    expect(screen.getByText(/n’ont pas encore été\s+préparées/)).toBeInTheDocument();
  });
});

describe("les zones tracées se modifient", () => {
  it("portent le nom de ce qu'elles contiennent, avec les mots de la bibliothèque", () => {
    poser();
    expect(screen.getByRole("button", { name: /Numéro d’exercice, zone tracée/ })).toBeInTheDocument();
  });

  it("changent de type, et les types viennent de ce que la bibliothèque sait relier", async () => {
    const personne = userEvent.setup();
    const { onBrouillon } = poser();

    const choix = screen.getByLabelText("Ce que cette zone contient");
    expect(within(choix).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Numéro de feuillet",
      "Numéro d’exercice",
    ]);

    await personne.selectOptions(choix, "page_imprimee");
    expect((onBrouillon.mock.calls[0] as [Brouillon])[0].zones[0]!.role).toBe("page_imprimee");
  });

  it("se retirent", async () => {
    const personne = userEvent.setup();
    const { onBrouillon } = poser();
    await personne.click(screen.getByRole("button", { name: "Retirer Numéro d’exercice" }));
    expect((onBrouillon.mock.calls[0] as [Brouillon])[0].zones).toEqual([]);
  });
});

describe("tout se fait aussi au clavier (UX-06)", () => {
  it("les flèches déplacent la zone choisie", async () => {
    const personne = userEvent.setup();
    const { onBrouillon } = poser();

    screen.getByRole("button", { name: /zone tracée/ }).focus();
    await personne.keyboard("{ArrowRight}");

    const apres = (onBrouillon.mock.calls[0] as [Brouillon])[0].zones[0]!.rectangle;
    expect(apres.x).toBeGreaterThan(AVEC_ZONE.zones[0]!.rectangle.x);
    expect(apres.l).toBe(AVEC_ZONE.zones[0]!.rectangle.l);
  });

  it("majuscule et flèche agrandissent au lieu de déplacer", async () => {
    const personne = userEvent.setup();
    const { onBrouillon } = poser();

    screen.getByRole("button", { name: /zone tracée/ }).focus();
    await personne.keyboard("{Shift>}{ArrowRight}{/Shift}");

    const apres = (onBrouillon.mock.calls[0] as [Brouillon])[0].zones[0]!.rectangle;
    expect(apres.l).toBeGreaterThan(AVEC_ZONE.zones[0]!.rectangle.l);
    expect(apres.x).toBe(AVEC_ZONE.zones[0]!.rectangle.x);
  });

  it("la touche d'effacement retire la zone", async () => {
    const personne = userEvent.setup();
    const { onBrouillon } = poser();

    screen.getByRole("button", { name: /zone tracée/ }).focus();
    await personne.keyboard("{Backspace}");
    expect((onBrouillon.mock.calls[0] as [Brouillon])[0].zones).toEqual([]);
  });
});

describe("l'essai et l'enregistrement", () => {
  it("l'essai se demande, et l'écran attend sans mentir", async () => {
    const personne = userEvent.setup();
    const { onEssayer } = poser();
    await personne.click(screen.getByRole("button", { name: /Essayer sur 10 feuillets/ }));
    expect(onEssayer).toHaveBeenCalledTimes(1);
  });

  it("enregistrer monte d'une version : un lot déjà traité l'a été avec la précédente (REC-03)", async () => {
    const personne = userEvent.setup();
    const { onEnregistrer } = poser();
    await personne.click(screen.getByRole("button", { name: /Enregistrer la manière de lire/ }));
    const rendu = (onEnregistrer.mock.calls[0] as [Brouillon])[0];
    expect(rendu.version).toBe(AVEC_ZONE.version + 1);
    expect(rendu.derivee).toEqual({ id: AVEC_ZONE.id, version: AVEC_ZONE.version });
  });

  it("montre ce qui a été lu, feuillet par feuillet, et ce qui n'a rien rendu", () => {
    poser({
      essai: {
        pages: [
          { numero: 1, elements: ["2.1", "2.2"], aVerifier: 1 },
          { numero: 2, elements: [], aVerifier: 0 },
        ],
        lus: 2,
        attendus: 2,
      },
    });
    expect(screen.getByText("exercices 2.1, 2.2")).toBeInTheDocument();
    expect(screen.getByText("Aucun exercice lu")).toBeInTheDocument();
    expect(screen.getByText("1 à vérifier")).toBeInTheDocument();
  });

  it("dit l'échec plutôt que de laisser l'écran muet (JOB-05)", () => {
    poser({ echec: "Cette bibliothèque n’a pas de description." });
    expect(screen.getByRole("alert")).toHaveTextContent("n’a pas de description");
  });
});
