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
    // L'étape 6 a déplacé la phrase qui porte le mot de la bibliothèque. Un brouillon vide ne
    // nomme plus aucun objet du domaine — « tracez au moins une zone » n'a rien à traduire — et
    // c'est la phrase sur **deux** zones d'éléments qui doit parler sa langue.
    poser({
      brouillon: {
        ...AVEC_ZONE,
        zones: [...AVEC_ZONE.zones, { cle: "z", role: "element", rectangle: { x: 0.5, y: 0.1, l: 0.1, h: 0.5 } }],
      },
    });
    expect(screen.getByText(/Tracez une zone sur la feuillet/)).toBeInTheDocument();
    expect(screen.getByText(/numéros d’exercice/)).toBeInTheDocument();
  });

  it("dit ce qui manque plutôt que d'éteindre un bouton sans raison (UX-09)", () => {
    poser({ brouillon: BROUILLON_NEUF });
    expect(screen.getByText(/au moins une zone/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Essayer sur 10 feuillets/ })).toBeDisabled();
  });

  it("laisse essayer une manière qui ne lit que le numéro de page (étape 6)", () => {
    // Le défaut corrigé, vu de l'écran : un document sans pièces numérotées restait bloqué sur
    // « tracez d'abord la zone des numéros », qu'il n'aura jamais.
    poser({
      brouillon: {
        ...BROUILLON_NEUF,
        zones: [{ cle: "p", role: "page_imprimee", rectangle: { x: 0.8, y: 0.92, l: 0.15, h: 0.05 } }],
      },
    });
    expect(screen.getByRole("button", { name: /Essayer sur 10 feuillets/ })).toBeEnabled();
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

/** La planche quand il n'y a rien à poser dessus (22 octobre 2026).
 *
 *  Ces trois épreuves existent parce qu'il a manqué exactement celles-ci. La prop s'appelle
 *  `document` au contrat et se renomme `nomDuDocument` à la destructuration, **pour ne pas
 *  masquer le `document` du navigateur**. Une correction écrite une heure plus tôt a employé le
 *  nom court : `document === ""` valait alors toujours faux, et `{document}` demandait à React
 *  d'afficher l'objet `Document` — page blanche, dans un paquet signé déjà installé.
 *
 *  Le typage ne l'a pas vu, et le reste du dépôt non plus : aucune épreuve ne rendait cet écran
 *  sans pages. */
describe("la planche sans image (CLA-01)", () => {
  it("dit qu'aucun document n'est ouvert quand on arrive ici sans en choisir un", () => {
    poser({ document: "", pages: [] });
    expect(screen.getByText(/Aucun document n’est ouvert/)).toBeInTheDocument();
    // Et elle dit où aller : un écran qui constate sans orienter laisse sur place.
    expect(screen.getByRole("link", { name: "dépôt" })).toHaveAttribute("href", "#depot");
  });

  it("nomme le document dont les pages manquent, et le nomme vraiment", () => {
    poser({ document: "aebersold-FRENCH.pdf", pages: [] });
    // Le nom du document, pas l'objet `Document` du navigateur.
    expect(screen.getByText(/« aebersold-FRENCH\.pdf »/)).toBeInTheDocument();
    expect(screen.getByText(/feuillets de/)).toBeInTheDocument();
  });

  it("montre la page dès qu'il y en a une, et ne dit plus rien manquer", () => {
    poser({ document: "aebersold-FRENCH.pdf" });
    expect(screen.queryByText(/n’ont pas encore été/)).toBeNull();
    expect(screen.queryByText(/Aucun document n’est ouvert/)).toBeNull();
  });
});
