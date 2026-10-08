import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DescriptionBibliotheque, Travail } from "@lienotheque/contrats";
import { Depot, ouEnEst } from "../src/pages/Depot.js";

/** Dépôt et traitement (maquette 3, JOB-01 à JOB-09, UX-03, UX-06). */

const DESCRIPTION = DescriptionBibliotheque.parse({
  id: "une-bibliotheque",
  nom: "Une bibliothèque",
  contenus: ["documents", "audio"],
  mots: {
    element: { un: "repère", plusieurs: "repères" },
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

const ID = (n: number): string => `0190f0a0-0000-7000-8000-${String(n).padStart(12, "0")}`;

const travail = (n: number, sur: Record<string, unknown> = {}): Travail =>
  Travail.parse({
    id: ID(n),
    outil: { nom: "traitement-de-lot", version: "1.0.0" },
    versionCible: ID(n + 100),
    etat: "en_cours",
    tentative: 1,
    progression: 0.68,
    sujet: { nom: `document-${n}.pdf`, contenu: "documents", total: 286 },
    pointReprise: { unite: "page", valeur: 194 },
    creeLe: "2026-10-08T09:00:00Z",
    majLe: "2026-10-08T09:05:00Z",
    ...sur,
  });

function poser(sur: Partial<Parameters<typeof Depot>[0]> = {}): {
  readonly onAction: ReturnType<typeof vi.fn>;
  readonly onVerifier: ReturnType<typeof vi.fn>;
} {
  const onAction = vi.fn();
  const onVerifier = vi.fn();
  render(
    <Depot
      description={DESCRIPTION}
      travaux={[travail(1)]}
      onFichiers={vi.fn()}
      onAction={onAction}
      onVerifier={onVerifier}
      {...sur}
    />,
  );
  return { onAction, onVerifier };
}

describe("ce que la file montre (maquette 3)", () => {
  it("nomme chaque fichier, et dit combien il compte avec les mots de la bibliothèque (CLA-01)", () => {
    poser();
    expect(screen.getByText("document-1.pdf")).toBeInTheDocument();
    expect(screen.getByText("286 feuillets")).toBeInTheDocument();
  });

  it("écrit l'avancement en nombres, pas seulement en pourcentage", () => {
    poser();
    // Le pourcentage et le compte voyagent ensemble, dans la légende de la barre.
    expect(screen.getByText("68 % · 194 / 286")).toBeInTheDocument();
  });

  it("n'écrit pas de taille tant qu'elle est inconnue, plutôt que d'en inventer une", () => {
    poser({ travaux: [travail(1, { sujet: { nom: "document-1.pdf", contenu: "documents" }, pointReprise: undefined, progression: 0 })] });
    expect(screen.getByText("Taille encore inconnue")).toBeInTheDocument();
    expect(screen.queryByText(/\/ 286/)).not.toBeInTheDocument();
  });

  it("dit que la fenêtre peut se fermer, et que les originaux ne sont jamais modifiés", () => {
    poser();
    expect(screen.getByText(/Vous pouvez fermer cette fenêtre/)).toBeInTheDocument();
    expect(screen.getByText("Vos originaux ne sont jamais modifiés.")).toBeInTheDocument();
  });

  it("le dit quand il n'y a rien, au lieu de montrer une liste vide", () => {
    poser({ travaux: [] });
    expect(screen.getByText(/Rien en traitement pour l’instant/)).toBeInTheDocument();
  });
});

describe("où en est un travail, sans jargon", () => {
  it("suit l'unité que le moteur compte vraiment", () => {
    expect(ouEnEst(travail(1), DESCRIPTION.mots).phrase).toBe("Lecture des feuillets");
    expect(ouEnEst(travail(1, { pointReprise: { unite: "piste", valeur: 10 } }), DESCRIPTION.mots).phrase).toBe(
      "Lecture des plages",
    );
  });

  it("dit chacun des états en français, et aucun en termes de machine", () => {
    const etats = ["en_file", "en_pause", "termine", "annule"] as const;
    for (const etat of etats) {
      const phrase = ouEnEst(travail(1, { etat, ...(etat === "termine" ? { progression: 1 } : {}) }), DESCRIPTION.mots).phrase;
      expect(phrase, etat).not.toMatch(/_|verrouille|recuperable/);
      expect(phrase, etat).toMatch(/^[A-ZÀ-Ý]/);
    }
  });
});

describe("pause et reprise (JOB-08)", () => {
  it("un travail qui tourne se met en pause", async () => {
    const personne = userEvent.setup();
    const { onAction } = poser();

    await personne.click(screen.getByRole("button", { name: "Mettre en pause document-1.pdf" }));
    expect(onAction).toHaveBeenCalledWith(ID(1), "pause");
  });

  it("un travail en pause se reprend, et n'offre plus de pause", async () => {
    const personne = userEvent.setup();
    const { onAction } = poser({ travaux: [travail(1, { etat: "en_pause" })] });

    expect(screen.queryByRole("button", { name: /Mettre en pause/ })).not.toBeInTheDocument();
    await personne.click(screen.getByRole("button", { name: "Reprendre document-1.pdf" }));
    expect(onAction).toHaveBeenCalledWith(ID(1), "reprendre");
  });

  it("un travail terminé n'offre ni pause ni reprise", () => {
    poser({ travaux: [travail(1, { etat: "termine", progression: 1 })] });
    expect(screen.queryByRole("button", { name: /Mettre en pause/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reprendre/ })).not.toBeInTheDocument();
  });
});

describe("ce qui a mal tourné se dit, et mène quelque part (JOB-05, UX-03)", () => {
  const enPanne = travail(1, {
    etat: "en_echec_recuperable",
    erreur: { cause: "2 feuillets illisibles", elements: [], reprisePossible: true },
  });

  it("montre la cause à la place de la taille", () => {
    poser({ travaux: [enPanne] });
    expect(screen.getByText("2 feuillets illisibles")).toBeInTheDocument();
  });

  it("se compte dans l'en-tête, pour qu'on le voie sans faire défiler", () => {
    poser({ travaux: [enPanne] });
    expect(screen.getByText(/1 à vérifier/)).toBeInTheDocument();
  });

  it("mène à Vérifier", async () => {
    const personne = userEvent.setup();
    const { onVerifier } = poser({ travaux: [enPanne] });

    await personne.click(screen.getByRole("button", { name: "Ouvrir" }));
    expect(onVerifier).toHaveBeenCalledTimes(1);
  });

  it("se reprend, puisque la reprise est possible", () => {
    poser({ travaux: [enPanne] });
    expect(screen.getByRole("button", { name: /Reprendre/ })).toBeInTheDocument();
  });
});

describe("ce qui est déposé mais ne se lit pas seul", () => {
  it("se montre à part, en disant pourquoi", () => {
    poser({ accompagnements: [{ nom: "une-piste.mp3", contenu: "audio" }] });
    const bloc = screen.getByText(/Déposés avec/).parentElement!;
    expect(within(bloc).getByText("une-piste.mp3")).toBeInTheDocument();
    expect(within(bloc).getByText(/mène au bon moment de sa plage/)).toBeInTheDocument();
  });

  it("un fichier refusé dit lequel et pourquoi, sans empêcher les autres", () => {
    poser({ refuses: [{ nom: "archive.zip", raison: "Liénothèque ne sait pas encore lire ce type de fichier." }] });
    const liste = screen.getByRole("list", { name: "Fichiers refusés" });
    expect(within(liste).getByText("archive.zip")).toBeInTheDocument();
    expect(within(liste).getByText(/ne sait pas encore lire/)).toBeInTheDocument();
  });
});
