import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VueBibliotheque } from "@lienotheque/contrats";
import { Lecteur } from "../src/pages/Lecteur.js";
import { Verifier } from "../src/pages/Verifier.js";

/** Un seul lecteur pour les deux écrans (ANC-03, ANC-05, UX-02).
 *
 *  Vérifier offrait un bouton « Écouter » qui ne faisait rien. Il lit maintenant le segment
 *  proposé avec le lecteur du Lecteur : on décide d'un lien en l'écoutant comme on l'écoutera
 *  ensuite. Un aperçu qui sonnerait autrement ferait trancher sur autre chose. */

const ID = (n: number): string => `6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a${String(n).padStart(2, "0")}`;
const EMPREINTE = "a".repeat(64);
const MOTS = {
  element: { un: "clause", plusieurs: "clauses" },
  piste: { un: "plage", plusieurs: "plages" },
  page: { un: "feuillet", plusieurs: "feuillets" },
};

const media = (sur: Record<string, unknown> = {}): unknown => ({
  empreinte: EMPREINTE,
  nom: "Plage 7.mp3",
  piste: 7,
  position: { segment: "inconnu" },
  source: "/donnees/medias/Plage%207.mp3",
  duree: 180,
  ...sur,
});

const pourquoi = { preuve: "lu" as const, confiance: 1, phrase: "Repère lu" };

/** `new Audio()` ne s'attache pas au document : on garde ce qui est construit pour le relire. */
let construits: HTMLAudioElement[] = [];
const AudioOriginal = globalThis.Audio;
globalThis.Audio = class extends AudioOriginal {
  constructor(source?: string) {
    super(source);
    construits.push(this as unknown as HTMLAudioElement);
  }
} as unknown as typeof Audio;
const dernierAudio = (): HTMLAudioElement => construits[construits.length - 1]!;

const vueLecteur = (sur: Record<string, unknown> = {}): VueBibliotheque =>
  VueBibliotheque.parse({
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
        texte: [],
        traduction: [],
        elements: [{ ancreId: ID(20), numero: "401", page: 126, media: media(sur), pourquoi, aVerifier: false }],
      },
    ],
  });

describe("le Lecteur lit vraiment", () => {
  it("joue la piste depuis son début quand le segment est inconnu (ANC-03)", async () => {
    construits = [];
    render(<Lecteur vue={vueLecteur()} page={126} element={ID(20)} onPage={vi.fn()} onElement={vi.fn()} />);

    const bouton = screen.getByRole("button", { name: /^lire$/i });
    await userEvent.click(bouton);

    expect(dernierAudio().play).toHaveBeenCalled();
    expect(dernierAudio().currentTime, "au début de la piste, pas à une position inventée").toBe(0);
    expect(screen.getByRole("button", { name: /interrompre/i })).toBeInTheDocument();
  });

  it("se place au début du segment quand il est connu", async () => {
    construits = [];
    const vue = vueLecteur({ position: { segment: "connu", debut: 42, fin: 55, confiance: 0.9 } });
    render(<Lecteur vue={vue} page={126} element={ID(20)} onPage={vi.fn()} onElement={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /^lire$/i }));
    expect(dernierAudio().currentTime).toBe(42);
  });

  it("s'arrête à la fin du segment", async () => {
    construits = [];
    const vue = vueLecteur({ position: { segment: "connu", debut: 42, fin: 55, confiance: 0.9 } });
    render(<Lecteur vue={vue} page={126} element={ID(20)} onPage={vi.fn()} onElement={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /^lire$/i }));

    // La piste avance : à la borne, la lecture s'arrête d'elle-même.
    await act(async () => {
      dernierAudio().currentTime = 55;
    });
    expect(dernierAudio().pause).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^lire$/i })).toBeInTheDocument();
  });

  it("dit « média non disponible ici » au lieu d'offrir un bouton inerte (ANC-05)", () => {
    construits = [];
    const { source: _absente, ...sans } = media() as Record<string, unknown>;
    const vue = VueBibliotheque.parse({
      ...vueLecteur(),
      pages: [
        {
          numero: 126,
          texte: [],
          traduction: [],
          valeurs: {},
          elements: [{ ancreId: ID(20), numero: "401", page: 126, media: sans, pourquoi, aVerifier: false }],
        },
      ],
    });
    render(<Lecteur vue={vue} page={126} element={ID(20)} onPage={vi.fn()} onElement={vi.fn()} />);

    expect(screen.getByText(/média non disponible ici/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^lire$/i })).toBeDisabled();
  });
});

const cas = (sur: Record<string, unknown> = {}): unknown => ({
  id: ID(5),
  nature: "lien",
  etat: "confiance",
  element: { ancreId: ID(55), numero: "401", page: 127, media: media(sur), pourquoi, aVerifier: true },
  proposition: "clause 401 → plage 7",
  motif: "repère partiellement lu",
});

const vueVerifier = (sur: Record<string, unknown> = {}): VueBibliotheque =>
  VueBibliotheque.parse({
    id: ID(1),
    nom: "Recueil",
    mots: MOTS,
    compteurs: [],
    aVerifier: 1,
    filtres: [],
    pages: [],
    douteux: [cas(sur)],
  });

describe("Vérifier écoute le segment proposé, avec le même lecteur", () => {
  it("lit au clic, et le bouton dit ce qu'il fera ensuite", async () => {
    construits = [];
    render(<Verifier vue={vueVerifier()} onDecision={vi.fn()} onAnnuler={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /écouter le segment proposé/i }));
    expect(dernierAudio().play).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /interrompre le segment proposé/i })).toBeInTheDocument();
  });

  it("part du début du segment quand il est connu", async () => {
    construits = [];
    render(<Verifier vue={vueVerifier({ position: { segment: "connu", debut: 12, fin: 20, confiance: 0.9 } })} onDecision={vi.fn()} onAnnuler={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /écouter le segment proposé/i }));
    expect(dernierAudio().currentTime).toBe(12);
  });

  it("part du début de la piste quand il ne l'est pas, et le dit (ANC-03)", async () => {
    construits = [];
    render(<Verifier vue={vueVerifier()} onDecision={vi.fn()} onAnnuler={vi.fn()} />);
    expect(screen.getByText(/segment inconnu/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /écouter le segment proposé/i }));
    expect(dernierAudio().currentTime).toBe(0);
  });

  it("s'arrête quand on tranche : le son ne court pas sur le cas suivant", async () => {
    construits = [];
    render(<Verifier vue={vueVerifier()} onDecision={vi.fn()} onAnnuler={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /écouter le segment proposé/i }));
    await userEvent.click(screen.getByRole("button", { name: /^confirmer/i }));
    expect(dernierAudio().pause).toHaveBeenCalled();
  });

  it("ne propose pas d'écouter ce qui n'est pas joignable d'ici", () => {
    construits = [];
    const { source: _absente, ...sans } = media() as Record<string, unknown>;
    const vue = VueBibliotheque.parse({
      ...vueVerifier(),
      douteux: [
        {
          ...(cas() as Record<string, unknown>),
          element: { ancreId: ID(55), numero: "401", page: 127, media: sans, pourquoi, aVerifier: true },
        },
      ],
    });
    render(<Verifier vue={vue} onDecision={vi.fn()} onAnnuler={vi.fn()} />);

    expect(screen.getByText(/média non disponible ici/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /écouter le segment proposé/i })).toBeDisabled();
  });
});
