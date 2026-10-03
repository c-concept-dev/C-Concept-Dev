import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset["theme"];
  globalThis.history.replaceState({}, "", "/");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("le thème se règle dans les réglages, pas dans la barre (UX-09)", () => {
  it("la barre permanente ne le propose pas dans l'application livrée", () => {
    vi.stubEnv("DEV", false);
    const { container } = render(<App />);
    expect(screen.queryByLabelText("Thème")).not.toBeInTheDocument();
    expect(container.querySelector(".ln-shell select")).toBeNull();
  });

  it("la barre le garde en développement, où l'on bascule sans cesse", () => {
    const { container } = render(<App />);
    expect(container.querySelector(".ln-shell")).toContainElement(screen.getByLabelText("Thème"));
  });

  it("les réglages l'accueillent et le choix s'applique tout de suite", async () => {
    vi.stubEnv("DEV", false);
    globalThis.history.replaceState({}, "", "/#reglages");
    const utilisateur = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Réglages" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Apparence" })).toBeInTheDocument();

    await utilisateur.selectOptions(screen.getByLabelText("Thème"), "dark");
    expect(document.documentElement.dataset["theme"]).toBe("dark");
    expect(localStorage.getItem("lienotheque.theme")).toBe("dark");
  });

  it("les réglages remplacent l'accueil, ils ne s'y ajoutent pas", () => {
    globalThis.history.replaceState({}, "", "/#reglages");
    render(<App />);
    expect(screen.queryByText("Vos documents et médias, enfin reliés.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("suit le fragment d'adresse quand il change", async () => {
    render(<App />);
    expect(screen.getByText("Vos documents et médias, enfin reliés.")).toBeInTheDocument();

    globalThis.history.replaceState({}, "", "/#reglages");
    globalThis.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(await screen.findByRole("heading", { level: 1, name: "Réglages" })).toBeInTheDocument();
  });
});
