import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { VUE_DEMONSTRATION } from "../src/donnees/vue-demonstration.js";
import { Lecteur } from "../src/pages/Lecteur.js";
import { TEMPO_MIN } from "../src/pages/lecteur/raccourcis.js";

/** Lecteur (B1, UX-01) et corrections 2, 4 et 5 du deuxième passage. */

const VUE = VUE_DEMONSTRATION;
const PREMIER = VUE.pages[0]!.elements[0]!;

function poser(options: { page?: number; ancreId?: string } = {}) {
  const pages: number[] = [];
  const elements: string[] = [];
  const rendu = render(
    <Lecteur
      vue={VUE}
      page={options.page ?? VUE.pages[0]!.numero}
      {...(options.ancreId === undefined ? {} : { ancreId: options.ancreId })}
      onPage={(numero) => pages.push(numero)}
      onElement={(ancreId) => elements.push(ancreId)}
    />,
  );
  return { rendu, pages, elements };
}

describe("Lecteur : la page, l'écoute et le fil entre les deux (B1)", () => {
  it("annonce le chemin « Accueil › bibliothèque › Lecteur »", () => {
    poser();
    const fil = screen.getByRole("navigation", { name: /ariane/i });
    expect(within(fil).getByRole("link", { name: "Accueil" })).toBeInTheDocument();
    expect(within(fil).getByRole("link", { name: VUE.nom })).toBeInTheDocument();
    expect(within(fil).getByText("Lecteur")).toHaveAttribute("aria-current", "page");
  });

  it("titre la page avec le mot du schéma en majuscule (correction 4)", () => {
    poser({ page: 12 });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Page 12");
  });

  it("nomme le segment « Piste 13 · Segment proposé » (correction 4)", () => {
    poser();
    expect(screen.getByRole("heading", { level: 2, name: /^Piste 13 · Segment proposé$/ })).toBeInTheDocument();
  });

  it("n'a qu'un seul élément cuivre plein (UX-09)", () => {
    const { rendu } = poser();
    expect(rendu.container.querySelectorAll(".ln-btn--principal")).toHaveLength(1);
  });
});

describe("Lecteur : les zones de la page portent un cadre (correction 5)", () => {
  it("dessine une zone par élément repéré, à sa place en parts de la page", () => {
    const { rendu } = poser();
    const zones = [...rendu.container.querySelectorAll<HTMLElement>(".ln-page__zone")];
    expect(zones).toHaveLength(VUE.pages[0]!.elements.length);
    expect(zones[0]!.style.left).toBe("10%");
    expect(zones[0]!.style.width).toBe("80%");
  });

  it("marque l'active, et elle seule", () => {
    const { rendu } = poser({ ancreId: VUE.pages[0]!.elements[1]!.ancreId });
    const actives = [...rendu.container.querySelectorAll(".ln-page__zone--actif")];
    expect(actives).toHaveLength(1);
    expect(actives[0]).toHaveAttribute("aria-label", expect.stringContaining("Élément 189"));
  });

  it("ouvre l'élément qu'on désigne sur la page", async () => {
    const { elements } = poser();
    await userEvent.click(screen.getByRole("button", { name: /Élément 189/ }));
    expect(elements).toEqual([VUE.pages[0]!.elements[1]!.ancreId]);
  });
});

describe("Lecteur : la forme d'onde situe le segment (correction 5)", () => {
  it("met en cuivre les barres du segment et laisse les autres en gris", () => {
    const { rendu } = poser({ ancreId: VUE.pages[1]!.elements[1]!.ancreId });
    const barres = [...rendu.container.querySelectorAll(".ln-onde__barre")];
    const dedans = barres.filter((barre) => barre.classList.contains("ln-onde__barre--actif"));
    expect(dedans.length).toBeGreaterThan(0);
    expect(dedans.length).toBeLessThan(barres.length);
  });

  it("dessine la même onde deux fois de suite : un son qui n'a pas changé ne change pas de forme", () => {
    const premier = poser();
    const formes = (rendu: { container: HTMLElement }) =>
      [...rendu.container.querySelectorAll(".ln-onde__barre")].map((barre) => barre.getAttribute("height"));
    const avant = formes(premier.rendu);
    premier.rendu.unmount();
    expect(formes(poser().rendu)).toEqual(avant);
  });
});

describe("Lecteur : les commandes montrent ce qu'elles font (correction 2)", () => {
  it("donne un nom et une icône aux boutons de zoom", () => {
    poser();
    for (const nom of ["Réduire", "Agrandir", "Ajuster à la fenêtre"]) {
      const bouton = screen.getByRole("button", { name: nom });
      expect(bouton.querySelector(".ln-icone"), nom).not.toBeNull();
    }
  });

  it("donne un nom et une icône aux boutons d'élément précédent et suivant", () => {
    poser();
    for (const nom of ["Précédent", "Suivant"]) {
      const bouton = screen.getByRole("button", { name: nom });
      expect(bouton.querySelector(".ln-icone"), nom).not.toBeNull();
    }
  });

  it("pose le numéro de vignette sur son propre panneau, pour qu'il ne tombe pas sur la photo", () => {
    const { rendu } = poser();
    const numeros = [...rendu.container.querySelectorAll(".ln-vignette__numero")];
    expect(numeros).toHaveLength(VUE.pages.length);
    for (const numero of numeros) expect(numero.classList.contains("ln-sur-photo")).toBe(true);
  });
});

describe("Lecteur : clavier et déplacement d'élément (UX-01, A3)", () => {
  it("passe à l'élément suivant avec la flèche droite", async () => {
    const { elements } = poser();
    await userEvent.keyboard("{ArrowRight}");
    expect(elements).toEqual([VUE.pages[0]!.elements[1]!.ancreId]);
  });

  it("traverse les pages : le dernier élément d'une page mène au premier de la suivante", async () => {
    const dernier = VUE.pages[0]!.elements.at(-1)!;
    const { elements, pages } = poser({ ancreId: dernier.ancreId });
    await userEvent.keyboard("{ArrowRight}");
    expect(elements).toEqual([VUE.pages[1]!.elements[0]!.ancreId]);
    expect(pages).toEqual([VUE.pages[1]!.numero]);
  });

  it("ne sort pas de la suite : la flèche gauche sur le premier élément ne fait rien", async () => {
    const { elements, pages } = poser({ ancreId: PREMIER.ancreId });
    await userEvent.keyboard("{ArrowLeft}");
    expect(elements).toEqual([]);
    expect(pages).toEqual([]);
  });

  it("change le tempo avec [ et ], sans descendre sous la borne", async () => {
    poser();
    // « [[ » est la façon d'écrire un crochet littéral dans la syntaxe du clavier simulé.
    const valeur = () => within(screen.getByRole("group", { name: "Tempo" })).getByRole("status").textContent;
    await userEvent.keyboard("[[");
    expect(valeur()).toContain("95");
    for (let coup = 0; coup < 20; coup += 1) await userEvent.keyboard("[[");
    expect(valeur()).toContain(String(TEMPO_MIN));
    await userEvent.keyboard("]");
    expect(valeur()).toContain(String(TEMPO_MIN + 5));
  });

  it("lance et arrête l'écoute avec la barre d'espace", async () => {
    poser();
    expect(screen.getByRole("button", { name: "Écouter" })).toBeInTheDocument();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("laisse écrire : une touche frappée dans un champ ne commande pas le lecteur", async () => {
    poser();
    const champ = document.createElement("input");
    document.body.append(champ);
    champ.focus();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("button", { name: "Écouter" })).toBeInTheDocument();
    champ.remove();
  });
});
