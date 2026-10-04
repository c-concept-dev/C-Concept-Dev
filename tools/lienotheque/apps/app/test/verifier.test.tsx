import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VueBibliotheque, type CasDouteux } from "@lienotheque/contrats";
import { Verifier, type Decision } from "../src/pages/Verifier.js";

const ID = (n: number): string => `6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a${String(n).padStart(2, "0")}`;
const EMPREINTE = "a".repeat(64);

const cas = (n: number, sur: Partial<CasDouteux> = {}): unknown => ({
  id: ID(n),
  nature: "lien",
  etat: "confiance",
  element: {
    ancreId: ID(n + 50),
    numero: String(400 + n),
    page: 127,
    media: { empreinte: EMPREINTE, nom: "Plage 43.mp3", piste: 43, position: { segment: "inconnu" } },
    pourquoi: { preuve: "sequence", confiance: 0.6, phrase: "Déduit de la suite" },
    aVerifier: true,
  },
  proposition: `clause ${400 + n} → plage 43`,
  motif: "repère partiellement lu, déduit de la séquence",
  ...sur,
});

const VUE = VueBibliotheque.parse({
  id: ID(1),
  nom: "Recueil de procédures",
  mots: {
    element: { un: "clause", plusieurs: "clauses" },
    piste: { un: "plage", plusieurs: "plages" },
    page: { un: "feuillet", plusieurs: "feuillets" },
  },
  compteurs: [],
  aVerifier: 4,
  pages: [],
  douteux: [
    cas(5),
    cas(6, { etat: "conflit_appareils" }),
    cas(7, { etat: "a_rattacher" }),
    cas(8, { nature: "information", etat: "segment_inconnu" }),
  ],
});

function poser(derniere?: { cas: CasDouteux; decision: Decision }) {
  const decisions: { cas: CasDouteux; decision: Decision }[] = [];
  const annuler = vi.fn();
  render(
    <Verifier
      vue={VUE}
      onDecision={(c, d) => decisions.push({ cas: c, decision: d })}
      onAnnuler={annuler}
      {...(derniere === undefined ? {} : { derniere })}
    />,
  );
  return { decisions, annuler };
}

describe("Vérifier : la planche (UX-03)", () => {
  it("porte le fil d’Ariane « Accueil › bibliothèque › Vérifier »", () => {
    poser();
    const ariane = screen.getByRole("navigation", { name: /fil d’ariane/i });
    const maillons = within(ariane).getAllByRole("listitem").map((item) => item.textContent);
    expect(maillons).toEqual(["Accueil", "Recueil de procédures", "Vérifier"]);
  });

  it("dit combien de cas restent, et dans quelle bibliothèque", () => {
    poser();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText(/restants dans/i)).toBeInTheDocument();
  });

  it("montre chaque cas avec sa proposition et sa confiance", () => {
    poser();
    expect(screen.getAllByText(/confiance moyenne/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/clause 405 → plage 43/i)).toBeInTheDocument();
  });

  it("distingue le conflit entre appareils et le rattachement après recalcul (SYN-04, SYN-05)", () => {
    poser();
    expect(screen.getByText(/conflit entre deux appareils/i)).toBeInTheDocument();
    expect(screen.getByText(/à rattacher après recalcul/i)).toBeInTheDocument();
    expect(screen.getByText(/segment inconnu/i)).toBeInTheDocument();
  });

  it("filtre par nature", async () => {
    poser();
    expect(screen.getAllByRole("button", { name: /^Clause \d+$/ })).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: "Informations" }));
    expect(screen.getAllByRole("button", { name: /^Clause \d+$/ })).toHaveLength(1);
  });

  it("n’affiche aucun chronomètre ni score de vitesse", () => {
    const { container } = render(<Verifier vue={VUE} onDecision={() => {}} onAnnuler={() => {}} />);
    const texte = container.textContent ?? "";
    for (const interdit of ["chrono", "secondes", "score", "vitesse", "/min", "record"])
      expect(texte.toLowerCase(), interdit).not.toContain(interdit);
  });
});

describe("Vérifier : les trois décisions (UX-03)", () => {
  it("confirme, corrige et ignore, à la souris", async () => {
    const { decisions } = poser();
    await userEvent.click(screen.getByRole("button", { name: /confirmer/i }));
    expect(decisions.at(-1)?.decision).toBe("confirme");
    await userEvent.click(screen.getByRole("button", { name: /corriger/i }));
    expect(decisions.at(-1)?.decision).toBe("corrige");
    await userEvent.click(screen.getByRole("button", { name: /ignorer/i }));
    expect(decisions.at(-1)?.decision).toBe("ignore");
  });

  it("et au clavier : Entrée, C, Échap", async () => {
    const { decisions } = poser();
    await userEvent.keyboard("{Enter}");
    expect(decisions.at(-1)?.decision).toBe("confirme");
    await userEvent.keyboard("c");
    expect(decisions.at(-1)?.decision).toBe("corrige");
    await userEvent.keyboard("{Escape}");
    expect(decisions.at(-1)?.decision).toBe("ignore");
  });

  it("« Ignorer » passe au suivant : une icône de passage, jamais une corbeille", () => {
    const { container } = render(<Verifier vue={VUE} onDecision={() => {}} onAnnuler={() => {}} />);
    const ignorer = screen.getByRole("button", { name: /ignorer/i });
    const trace = ignorer.querySelector("path")?.getAttribute("d") ?? "";
    // Le tracé « passer » : deux chevrons vers l'avant. Rien d'une corbeille.
    expect(trace).toBe("M4 5l8 7-8 7zM13 5l8 7-8 7z");
    expect(container.innerHTML.toLowerCase()).not.toContain("corbeille");
  });

  it("avance au cas suivant après une décision", async () => {
    poser();
    const premier = screen.getAllByRole("button", { name: /^Clause \d+$/ })[0]!;
    expect(premier).toHaveAttribute("aria-current", "true");
    await userEvent.keyboard("{Enter}");
    const apres = screen.getAllByRole("button", { name: /^Clause \d+$/ });
    expect(apres[0]).not.toHaveAttribute("aria-current");
    expect(apres[1]).toHaveAttribute("aria-current", "true");
  });
});

describe("Vérifier : défaire et garantir", () => {
  // Correction 6 : avant la première décision, l'écran dit qu'il n'y a rien à annuler. Un bouton
  // inerte au même rang que « Confirmer » proposait un geste qui n'existait pas encore.
  it("dit qu’il n’y a rien à annuler avant la première décision, sans bouton inerte (correction 6)", () => {
    poser();
    expect(screen.queryByRole("button", { name: /annuler la dernière décision/i })).toBeNull();
    expect(screen.getByText(/aucune décision à annuler/i)).toBeInTheDocument();
  });

  it("annule la dernière décision quand il y en a une", async () => {
    const { annuler } = poser({ cas: VueBibliotheque.parse(VUE).douteux[0]!, decision: "confirme" });
    const bouton = screen.getByRole("button", { name: /annuler la dernière décision/i });
    expect(bouton).toBeEnabled();
    await userEvent.click(bouton);
    expect(annuler).toHaveBeenCalledOnce();
  });

  it("promet que les corrections survivent à un recalcul", () => {
    poser();
    expect(screen.getByText(/conservées même après un nouveau traitement/i)).toBeInTheDocument();
  });

  it("le dit aussi quand il ne reste rien", () => {
    render(<Verifier vue={{ ...VUE, douteux: [] }} onDecision={() => {}} onAnnuler={() => {}} />);
    expect(screen.getByText(/rien à vérifier/i)).toBeInTheDocument();
  });
});

describe("Vérifier : les mots viennent du schéma (CLA-01)", () => {
  it("n’écrit jamais « élément » ni « piste » de son propre chef", () => {
    const { container } = render(<Verifier vue={VUE} onDecision={() => {}} onAnnuler={() => {}} />);
    const texte = (container.textContent ?? "").toLowerCase();
    expect(texte).toContain("clause");
    expect(texte).not.toContain("élément");
    expect(texte).not.toMatch(/\bpiste\b/);
  });
});
