import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PremierLancement } from "../src/pages/PremierLancement.js";

/** Premier lancement (UX-06, UX-09, PLT-02) : créer, ou ouvrir ce qu'on a déjà. */

describe("quand il n'y a encore rien", () => {
  it("n'offre qu'un seul bouton principal", () => {
    render(<PremierLancement theme="light" onCreer={vi.fn()} onFichiers={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /Créer ma première bibliothèque/ })).toHaveLength(1);
  });

  it("n'offre pas d'ouvrir là où il n'y a pas de disque à parcourir", () => {
    render(<PremierLancement theme="light" onCreer={vi.fn()} onFichiers={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /l’ouvrir/ })).not.toBeInTheDocument();
  });

  it("offre d'ouvrir une bibliothèque qui existe déjà, là où c'est possible", async () => {
    const personne = userEvent.setup();
    const onOuvrir = vi.fn();
    render(<PremierLancement theme="light" onCreer={vi.fn()} onFichiers={vi.fn()} onOuvrir={onOuvrir} />);

    await personne.click(screen.getByRole("button", { name: /l’ouvrir/ }));
    expect(onOuvrir).toHaveBeenCalledTimes(1);
  });

  it("dit pourquoi une ouverture n'a mené à rien, au lieu de ne rien faire", () => {
    render(
      <PremierLancement
        theme="light"
        onCreer={vi.fn()}
        onFichiers={vi.fn()}
        onOuvrir={vi.fn()}
        echec="Ce dossier ne porte pas de bibliothèque."
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Ce dossier ne porte pas de bibliothèque.");
  });
});
