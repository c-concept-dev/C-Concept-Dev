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

/** Les informations (OUT-01, OUT-10, UX-03).
 *
 *  Un lot dont tous les liens passent le seuil n'a rien à trancher, et pourtant il peut avoir
 *  deux pages sans rien de lu et six médias que personne ne réclame. Ces cas-là n'ont pas
 *  d'élément : rien ne les porte, et c'est justement ce qu'ils disent. */
const information = (
  n: number,
  etat: "page_absente" | "media_orphelin",
  libelle: string,
  details: readonly string[] = [],
): unknown => ({
  id: ID(n),
  nature: "information",
  etat,
  libelle,
  details,
  proposition: etat === "page_absente" ? `${libelle} manquent au document` : `${libelle} : aucun lien`,
  motif: etat === "page_absente" ? "la numérotation passe de 29 à 32" : "aucun repère lu n'y renvoie",
});

const VUE_INFORMATIONS = VueBibliotheque.parse({
  ...VUE,
  aVerifier: 2,
  douteux: [
    information(30, "page_absente", "Feuillets 30 et 31"),
    information(93, "media_orphelin", "Plages 93 à 95", ["Plage 93 — fichier « a.mp3 »", "Plage 94", "Plage 95"]),
  ],
});

describe("Vérifier : les informations, qu'on ne tranche pas mais qu'on lit", () => {
  const poser = (vue = VUE_INFORMATIONS, onDecision = vi.fn()) => {
    render(<Verifier vue={vue} onDecision={onDecision} onAnnuler={vi.fn()} />);
    return onDecision;
  };

  it("ne dit plus « Rien à vérifier » quand des informations attendent", () => {
    poser();
    expect(screen.queryByText(/rien à vérifier/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /feuillets 30 et 31/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /plages 93 à 95/i })).toBeInTheDocument();
  });

  it("constate au lieu de proposer : il n'y a rien à quoi répondre", () => {
    poser();
    expect(screen.getByText(/constat/i)).toBeInTheDocument();
    expect(screen.queryByText(/le système propose/i)).not.toBeInTheDocument();
  });

  it("n'offre qu'un geste : marquer comme vu", () => {
    poser();
    expect(screen.getByRole("button", { name: /marquer comme vu/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^confirmer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /corriger/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ignorer/i })).not.toBeInTheDocument();
  });

  it("rend la décision « vu » au clic comme à la touche Entrée", async () => {
    const onDecision = poser();
    await userEvent.click(screen.getByRole("button", { name: /marquer comme vu/i }));
    expect(onDecision).toHaveBeenCalledTimes(1);
    expect(onDecision.mock.calls[0]?.[1]).toBe("vu");

    await userEvent.keyboard("{Enter}");
    expect(onDecision.mock.calls[1]?.[1] as Decision).toBe("vu");
  });

  it("ne montre ni vue agrandie ni zoom : il n'y a pas d'élément à regarder", () => {
    poser();
    expect(screen.queryByRole("group", { name: "Zoom" })).not.toBeInTheDocument();
    expect(document.querySelector(".ln-cas__image")).toBeNull();
  });

  it("regroupe les médias consécutifs en un seul geste, sans perdre le détail", async () => {
    const onDecision = poser();
    await userEvent.click(screen.getByRole("button", { name: /plages 93 à 95/i }));

    // Une seule fiche, un seul « vu » — et ce qu'elle recouvre reste à portée, au clavier
    // comme à la souris, parce que c'est l'élément « details » du balisage.
    const detail = screen.getByText(/voir le détail/i);
    expect(detail).toBeInTheDocument();
    expect(detail.textContent).toContain("3");
    await userEvent.click(detail);
    expect(screen.getByText(/Plage 93 — fichier/)).toBeVisible();
    expect(screen.getByText("Plage 95")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /marquer comme vu/i }));
    expect(onDecision).toHaveBeenCalledTimes(1);
    expect(onDecision.mock.calls[0]?.[0]?.libelle).toBe("Plages 93 à 95");
  });

  it("ne déplie rien quand il n'y a qu'un fait", async () => {
    poser();
    await userEvent.click(screen.getByRole("button", { name: /feuillets 30 et 31/i }));
    expect(screen.queryByText(/voir le détail/i)).not.toBeInTheDocument();
  });

  it("ne dit plus « rien de lu » : une page peut manquer au scan comme au livre", () => {
    poser();
    expect(screen.queryByText(/rien de lu/i)).not.toBeInTheDocument();
    expect(screen.getByText(/manquent au document/i)).toBeInTheDocument();
  });

  it("garde « Rien à vérifier » pour une file vraiment vide", () => {
    poser(VueBibliotheque.parse({ ...VUE, aVerifier: 0, douteux: [] }));
    expect(screen.getByText(/rien à vérifier/i)).toBeInTheDocument();
  });

  it("dit que le filtre est vide, et non que tout est fini, quand des cas attendent ailleurs", async () => {
    poser();
    await userEvent.click(screen.getByRole("button", { name: "Liens" }));
    expect(screen.queryByText(/rien à vérifier/i)).not.toBeInTheDocument();
    expect(screen.getByText(/rien sous ce filtre/i)).toBeInTheDocument();
    expect(screen.getByText(/2 cas attendent ailleurs/i)).toBeInTheDocument();
  });
});
