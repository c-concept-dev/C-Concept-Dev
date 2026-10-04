import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { VueBibliotheque } from "@lienotheque/contrats";
import { Lecteur } from "../src/pages/Lecteur.js";
import { LEGENDE, actionDe, tempoSuivant } from "../src/pages/lecteur/raccourcis.js";

const ID = (n: number): string => `6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a${String(n).padStart(2, "0")}`;
const EMPREINTE = "a".repeat(64);

/** Une vue de bibliothèque dont les mots ne sont pas ceux d'une méthode de musique : si l'écran
 *  les affiche, c'est qu'il les prend bien du schéma et non de son code (CLA-01). */
const VUE = VueBibliotheque.parse({
  id: ID(1),
  nom: "Recueil de procédures",
  mots: {
    element: { un: "clause", plusieurs: "clauses" },
    piste: { un: "plage", plusieurs: "plages" },
    page: { un: "feuillet", plusieurs: "feuillets" },
  },
  compteurs: [{ nombre: 3, mot: "clauses" }],
  aVerifier: 1,
  pages: [
    {
      numero: 126,
      elements: [{ ancreId: ID(10), numero: "399", page: 126, aVerifier: false }],
      texte: [],
      traduction: [],
    },
    {
      numero: 127,
      titre: "Lecture et articulation",
      elements: [
        {
          ancreId: ID(11),
          numero: "400",
          page: 127,
          zone: { x: 0.08, y: 0.2, l: 0.84, h: 0.14 },
          media: { empreinte: EMPREINTE, nom: "Plage 40.mp3", piste: 40, position: { segment: "connu", debut: 0, fin: 23, confiance: 0.9 } },
          pourquoi: { preuve: "lu", confiance: 1, phrase: "Repère « Plage 40 » lu à côté du numéro" },
          aVerifier: false,
        },
        {
          ancreId: ID(12),
          numero: "401",
          page: 127,
          zone: { x: 0.08, y: 0.4, l: 0.84, h: 0.14 },
          media: { empreinte: EMPREINTE, nom: "Plage 41.mp3", piste: 41, position: { segment: "inconnu" } },
          pourquoi: { preuve: "sequence", confiance: 0.7, phrase: "Déduit de la suite des plages" },
          aVerifier: false,
        },
      ],
      texte: ["Ces clauses visent à développer une lecture fluide.", "Jouer lentement, en respectant les liaisons."],
      traduction: ["These clauses aim to develop fluent reading."],
    },
  ],
  douteux: [],
});

function poser(element = ID(11)) {
  const pages: number[] = [];
  const elements: string[] = [];
  const rendu = render(
    <Lecteur vue={VUE} page={127} element={element} onPage={(n) => pages.push(n)} onElement={(a) => elements.push(a)} />,
  );
  return { ...rendu, pages, elements };
}

describe("Lecteur : la page et ses éléments (B1, UX-01)", () => {
  it("emploie les mots de la bibliothèque, jamais les siens (CLA-01)", () => {
    poser();
    expect(screen.getAllByText(/feuillet 127/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("navigation", { name: /feuillets du document/i })).toBeInTheDocument();
    expect(screen.queryByText(/\bpage 127\b/i), "le mot « page » ne vient pas du code").not.toBeInTheDocument();
  });

  it("montre le fil d’Ariane « Accueil › bibliothèque › feuillet »", () => {
    poser();
    const ariane = screen.getByRole("navigation", { name: /fil d’ariane/i });
    expect(within(ariane).getByRole("link", { name: "Accueil" })).toBeInTheDocument();
    expect(within(ariane).getByRole("link", { name: "Recueil de procédures" })).toBeInTheDocument();
  });

  it("dit où l’on est dans la page : l’élément tant sur tant", () => {
    poser(ID(12));
    expect(screen.getByText(/sur cette feuillet/i).textContent).toMatch(/Clause\s*2\s*sur\s*2/);
  });

  it("surligne la zone de l’élément actif, et elle seule", () => {
    poser(ID(12));
    const zones = screen.getAllByRole("button", { name: /^Clause \d+/ });
    const actives = zones.filter((zone) => zone.getAttribute("aria-current") === "true");
    expect(actives).toHaveLength(1);
    expect(actives[0]).toHaveAccessibleName(/Clause 401/);
  });

  it("marque les feuillets reliés dans la bande des vignettes", () => {
    poser();
    expect(screen.getByRole("button", { name: /feuillet 127, clauses reliés/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^feuillet 126$/i })).toBeInTheDocument();
  });

  it("navigue d’un élément à l’autre à la souris", async () => {
    const { elements } = poser();
    await userEvent.click(screen.getByRole("button", { name: /^clause suivant$/i }));
    expect(elements).toContain(ID(12));
  });
});

describe("Lecteur : écoute et segment (ANC-03)", () => {
  it("nomme la plage par son numéro, jamais au pluriel", () => {
    poser(ID(11));
    expect(screen.getByText("Plage 40")).toBeInTheDocument();
    expect(screen.queryByText(/plages 40/i)).not.toBeInTheDocument();
  });

  it("annonce un segment inconnu et dit où la lecture commencera", () => {
    poser(ID(12));
    expect(screen.getByText(/segment inconnu/i)).toBeInTheDocument();
    expect(screen.getByText(/commence au début/i)).toBeInTheDocument();
  });

  it("ne l’annonce pas quand le segment est connu", () => {
    poser(ID(11));
    expect(screen.queryByText(/segment inconnu/i)).not.toBeInTheDocument();
  });

  it("montre le tempo, de 50 à 100 %, hauteur conservée", () => {
    poser();
    const tempo = screen.getByRole("slider", { name: /tempo/i });
    expect(tempo).toHaveAttribute("min", "50");
    expect(tempo).toHaveAttribute("max", "100");
    expect(screen.getByText(/hauteur conservée/i)).toBeInTheDocument();
  });
});

describe("Lecteur : pourquoi ce lien (ANC-02)", () => {
  it("dit la confiance et la raison, en toutes lettres", () => {
    poser(ID(11));
    expect(screen.getByRole("heading", { name: /pourquoi ce lien/i })).toBeInTheDocument();
    expect(screen.getByText(/confiance haute/i)).toBeInTheDocument();
    expect(screen.getByText(/repère « plage 40 » lu/i)).toBeInTheDocument();
  });

  it("baisse le ton quand la piste est déduite", () => {
    poser(ID(12));
    expect(screen.getByText(/confiance moyenne/i)).toBeInTheDocument();
    expect(screen.getByText(/déduit de la suite/i)).toBeInTheDocument();
  });
});

describe("Lecteur : texte de la page (B1)", () => {
  it("se replie et se déplie", async () => {
    poser();
    const entete = screen.getByRole("button", { name: /texte de la page/i });
    expect(entete).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(entete);
    expect(entete).toHaveAttribute("aria-expanded", "false");
  });

  it("bascule entre original et traduction, sans cuivre plein", async () => {
    poser();
    const original = screen.getByRole("button", { name: "Original" });
    expect(original).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Traduction" }));
    expect(screen.getByRole("button", { name: "Traduction" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/these clauses aim/i)).toBeInTheDocument();
  });
});

describe("Lecteur : raccourcis (B1)", () => {
  it("la ligne annoncée et les touches écoutées ne divergent pas", () => {
    poser();
    for (const entree of LEGENDE) expect(screen.getByText(entree.touches)).toBeInTheDocument();
  });

  it("← et → changent d’élément", async () => {
    const { elements } = poser();
    await userEvent.keyboard("{ArrowRight}");
    expect(elements).toContain(ID(12));
  });

  it("[ et ] changent le tempo, sans sortir des bornes", async () => {
    poser();
    const tempo = () => (screen.getByRole("slider", { name: /tempo/i }) as HTMLInputElement).value;
    expect(tempo()).toBe("75");
    await userEvent.keyboard("{]}{]}{]}{]}{]}{]}");
    expect(tempo(), "la borne haute tient").toBe("100");
    await userEvent.keyboard("{[}{[}");
    expect(tempo()).toBe("90");
  }, 20_000);

  it("D annonce le mode à distance", async () => {
    poser();
    expect(screen.queryByText(/mode à distance actif/i)).not.toBeInTheDocument();
    await userEvent.keyboard("d");
    expect(screen.getByText(/mode à distance actif/i)).toBeInTheDocument();
  });

  it("ne vole pas les touches de quelqu’un qui écrit une note", async () => {
    poser();
    const note = screen.getByRole("textbox", { name: /note — clause/i });
    await userEvent.click(note);
    await userEvent.type(note, "l");
    expect((note as HTMLTextAreaElement).value).toBe("l");
  });
});

describe("raccourcis : les règles, sans écran", () => {
  it("rend l’action d’une touche connue", () => {
    expect(actionDe(" ", null)).toBe("lecture");
    expect(actionDe("L", null)).toBe("boucle");
    expect(actionDe("x", null)).toBeUndefined();
  });

  it("se tait dans un champ de saisie", () => {
    const champ = document.createElement("textarea");
    expect(actionDe(" ", champ)).toBeUndefined();
  });

  it("le tempo reste entre 50 et 100, par pas de 5", () => {
    expect(tempoSuivant(75, 1)).toBe(80);
    expect(tempoSuivant(100, 1)).toBe(100);
    expect(tempoSuivant(50, -1)).toBe(50);
  });
});
