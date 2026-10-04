import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { VUE_DEMONSTRATION } from "../src/donnees/vue-demonstration.js";
import { TOUS_CHEMINS } from "../src/composants/index.js";
import { Verifier } from "../src/pages/Verifier.js";

/** Vérifier (B2, UX-03, SYN-04) et correction 6 du deuxième passage. */

const VUE = VUE_DEMONSTRATION;

function poser(casId?: string) {
  const cas: string[] = [];
  const ouverts: [number, string][] = [];
  const rendu = render(
    <Verifier
      vue={VUE}
      {...(casId === undefined ? {} : { casId })}
      onCas={(id) => cas.push(id)}
      onOuvrir={(page, ancreId) => ouverts.push([page, ancreId])}
    />,
  );
  return { rendu, cas, ouverts };
}

describe("Vérifier : un cas à la fois, dit en toutes lettres (B2)", () => {
  it("annonce le chemin « Accueil › bibliothèque › Vérifier » (correction 5 du premier passage)", () => {
    poser();
    const fil = screen.getByRole("navigation", { name: /ariane/i });
    expect(within(fil).getByRole("link", { name: "Accueil" })).toBeInTheDocument();
    expect(within(fil).getByRole("link", { name: VUE.nom })).toBeInTheDocument();
    expect(within(fil).getByText("Vérifier")).toHaveAttribute("aria-current", "page");
  });

  it("nomme l'élément avec le mot du schéma en majuscule (correction 4)", () => {
    poser();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Élément 189");
  });

  it("dit la proposition et le motif qui l'a produite (ANC-02, UX-03)", () => {
    poser();
    const premier = VUE.douteux[0]!;
    expect(screen.getByText(premier.proposition)).toBeInTheDocument();
    expect(screen.getByText(premier.motif)).toBeInTheDocument();
  });

  it("montre l'avancement de la file", () => {
    poser();
    expect(screen.getByRole("progressbar", { name: /vérification/i })).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText(`${VUE.douteux.length} cas en attente`)).toBeInTheDocument();
  });
});

describe("Vérifier : les trois gestes sur une seule ligne (correction 6)", () => {
  it("n'offre que trois actions, et dans cet ordre", () => {
    const { rendu } = poser();
    const gestes = rendu.container.querySelector(".ln-cas__gestes")!;
    expect([...gestes.querySelectorAll("button")].map((bouton) => bouton.textContent)).toEqual(["Valider", "Corriger", "Ignorer"]);
  });

  it("garde les trois sur une ligne : aucun repli tant qu'il y a la place", () => {
    const { rendu } = poser();
    const gestes = rendu.container.querySelector<HTMLElement>(".ln-cas__gestes")!;
    // jsdom ne calcule pas la mise en page ; c'est la règle qui est gardée, et les mesures en
    // navigateur sont faites par navigateurs/ecrans.spec.ts.
    expect(gestes.className).toContain("ln-cas__gestes");
    expect(rendu.container.querySelectorAll(".ln-cas__gestes")).toHaveLength(1);
  });

  it("n'a qu'un seul cuivre plein : valider (UX-09)", () => {
    const { rendu } = poser();
    const principaux = [...rendu.container.querySelectorAll(".ln-btn--principal")];
    expect(principaux).toHaveLength(1);
    expect(principaux[0]).toHaveTextContent("Valider");
  });

  it("donne à « Ignorer » une icône de saut, jamais une corbeille (SYN-04)", () => {
    poser();
    const trace = screen.getByRole("button", { name: "Ignorer" }).querySelector("path")?.getAttribute("d");
    expect(trace).toBe(TOUS_CHEMINS.passer);
  });

  it("envoie « Corriger » sur l'élément dans le Lecteur, au lieu de décider à la place de l'œil", async () => {
    const { ouverts, cas } = poser();
    await userEvent.click(screen.getByRole("button", { name: "Corriger" }));
    const premier = VUE.douteux[0]!;
    expect(ouverts).toEqual([[premier.element.page, premier.element.ancreId]]);
    expect(cas).toEqual([]);
  });
});

describe("Vérifier : l'annulation est un lien, pas un quatrième bouton (correction 6)", () => {
  it("laisse l'annulation hors de la ligne des gestes", () => {
    const { rendu } = poser();
    const gestes = rendu.container.querySelector(".ln-cas__gestes")!;
    expect(gestes.textContent).not.toContain("Annuler");
    expect(rendu.container.querySelector(".ln-cas__annuler")).not.toBeNull();
  });

  it("dit qu'il n'y a rien à annuler avant la première décision", () => {
    poser();
    expect(screen.getByText("Aucune décision à annuler")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Annuler/ })).toBeNull();
  });

  it("revient sur la dernière décision et remet le cas dans la file", async () => {
    const { rendu, cas } = poser();
    await userEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(cas).toEqual([VUE.douteux[1]!.id]);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Élément 191");

    const annuler = screen.getByRole("button", { name: "Annuler la dernière décision" });
    expect(annuler.className).toContain("ln-lien-action");
    await userEvent.click(annuler);

    expect(cas.at(-1)).toBe(VUE.douteux[0]!.id);
    expect(rendu.container.querySelector(".ln-cas__titre")).toHaveTextContent("Élément 189");
  });

  it("une fois la file vide, elle le dit et l'annulation reste offerte", async () => {
    poser();
    for (const _ of VUE.douteux) await userEvent.click(screen.getByRole("button", { name: "Ignorer" }));
    expect(screen.getByText(/Plus rien à vérifier/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler la dernière décision" })).toBeInTheDocument();
  });
});
