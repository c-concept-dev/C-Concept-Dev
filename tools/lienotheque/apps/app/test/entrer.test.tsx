import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Entrer } from "../src/pages/Entrer.js";

/** L'écran d'entrée, et surtout **ce qu'il dit quand ça refuse** (SEC-02, étape 4 d'E5).
 *
 *  Trois refus, trois voix différentes, et l'écran n'en invente aucune :
 *
 *  | ce qui refuse | ce que l'écran montre |
 *  |---|---|
 *  | l'entrée | le même mot pour tout, tel que le service le donne |
 *  | l'enrôlement | son motif, « getPublicKey() » compris |
 *  | la cérémonie | « interrompue » — le seul mot que cette page nomme, le service n'ayant pas été appelé |
 *
 *  Le refus est annoncé au lecteur d'écran : une cérémonie refusée en silence est une cérémonie
 *  qu'on recommence sans comprendre. */

const refuse = (mot: string) => vi.fn(async () => ({ fait: false as const, mot }));
const accepte = () => vi.fn(async () => ({ fait: true as const }));

describe("entrer", () => {
  it("mène la cérémonie et prévient quand elle a réussi", async () => {
    const geste = accepte();
    const onEntre = vi.fn();
    render(<Entrer onEntre={onEntre} gestes={{ entrer: geste }} />);

    await userEvent.click(screen.getByRole("button", { name: /entrer/i }));
    expect(geste).toHaveBeenCalledOnce();
    expect(onEntre).toHaveBeenCalledOnce();
  });

  it("montre le mot du service, sans l'interpréter", async () => {
    render(<Entrer onEntre={vi.fn()} gestes={{ entrer: refuse("Entrée refusée.") }} />);
    await userEvent.click(screen.getByRole("button", { name: /entrer/i }));
    expect(await screen.findByText("Entrée refusée.")).toBeTruthy();
  });

  it("annonce le refus au lecteur d'écran", async () => {
    render(<Entrer onEntre={vi.fn()} gestes={{ entrer: refuse("Entrée refusée.") }} />);
    await userEvent.click(screen.getByRole("button", { name: /entrer/i }));

    const annonce = screen.getByRole("status");
    expect(annonce.textContent).toBe("Entrée refusée.");
    expect(annonce.getAttribute("aria-live")).toBe("polite");
  });

  it("ne prévient pas quand la cérémonie est interrompue", async () => {
    // Doigt retiré, fenêtre fermée : on ne va nulle part, et on le dit autrement qu'un refus.
    const onEntre = vi.fn();
    render(<Entrer onEntre={onEntre} gestes={{ entrer: refuse("Cérémonie interrompue.") }} />);

    await userEvent.click(screen.getByRole("button", { name: /entrer/i }));
    expect(await screen.findByText("Cérémonie interrompue.")).toBeTruthy();
    expect(onEntre).not.toHaveBeenCalled();
  });

  it("n'offre pas d'enrôler quand personne n'est identifié", () => {
    // Un geste qui ne mènerait nulle part n'est pas proposé : enrôler demande une session.
    render(<Entrer onEntre={vi.fn()} gestes={{ entrer: accepte() }} />);
    expect(screen.queryByRole("button", { name: /enrôler/i })).toBeNull();
  });
});

describe("l'amorçage, sur invitation", () => {
  it("propose de faire de cet appareil la clé, et non d'entrer", () => {
    render(<Entrer invitation="un-defi" onEntre={vi.fn()} gestes={{ amorcer: accepte() }} />);
    expect(screen.getByRole("button", { name: /ma clé/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^entrer$/i })).toBeNull();
  });

  it("passe l'invitation et le nom donné à l'appareil", async () => {
    const geste = accepte();
    render(<Entrer invitation="un-defi" onEntre={vi.fn()} gestes={{ amorcer: geste }} />);

    await userEvent.type(screen.getByLabelText(/nom de cet appareil/i), "Portable");
    await userEvent.click(screen.getByRole("button", { name: /ma clé/i }));
    expect(geste).toHaveBeenCalledWith("Portable", "un-defi");
  });

  it("donne un nom de repli quand le champ est vide : un appareil sans nom se révoque mal", async () => {
    const geste = accepte();
    render(<Entrer invitation="un-defi" onEntre={vi.fn()} gestes={{ amorcer: geste }} />);
    await userEvent.click(screen.getByRole("button", { name: /ma clé/i }));
    expect(geste).toHaveBeenCalledWith("Cet appareil", "un-defi");
  });

  it("montre le motif de l'enrôlement, qui en porte un", async () => {
    // À la différence de l'entrée. C'est ici que « getPublicKey() nul » s'entendra, si Safari
    // surprend — le cas que la mesure du 18 octobre n'a pas pu trancher.
    const mot = "Clé refusée : getPublicKey() n'a pas rendu de clé : ce navigateur ne reconnaît pas l'algorithme";
    render(<Entrer invitation="un-defi" onEntre={vi.fn()} gestes={{ amorcer: refuse(mot) }} />);

    await userEvent.click(screen.getByRole("button", { name: /ma clé/i }));
    expect(await screen.findByText(mot)).toBeTruthy();
  });
});

describe("enrôler un appareil de plus", () => {
  it("n'est proposé qu'avec une session, et passe le nom", async () => {
    const geste = accepte();
    render(<Entrer identifie onEntre={vi.fn()} gestes={{ enroler: geste }} />);

    await userEvent.type(screen.getByLabelText(/nom de cet appareil/i), "Bureau");
    await userEvent.click(screen.getByRole("button", { name: /enrôler/i }));
    expect(geste).toHaveBeenCalledWith("Bureau");
  });
});
