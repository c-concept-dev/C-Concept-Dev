import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { CLE_THEME, LIBELLE_THEME, THEMES, appliquerTheme, themeInitial } from "../src/theme/theme.js";

const racineNeuve = () => document.createElement("html");

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset["theme"];
});

describe("thèmes de la charte v3 (UX-05 : un écran validé par état)", () => {
  it("propose les trois variantes, clair en tête", () => {
    render(<App />);
    const selecteur = screen.getByLabelText("Thème");
    const valeurs = [...selecteur.querySelectorAll("option")].map((o) => o.value);
    expect(valeurs).toEqual([...THEMES]);
    expect(screen.getByRole("option", { name: LIBELLE_THEME.hybrid })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: LIBELLE_THEME.dark })).toBeInTheDocument();
  });

  it("applique le thème choisi sur la racine du document et le mémorise", async () => {
    const utilisateur = userEvent.setup();
    render(<App />);

    await utilisateur.selectOptions(screen.getByLabelText("Thème"), "dark");
    expect(document.documentElement.dataset["theme"]).toBe("dark");
    expect(localStorage.getItem(CLE_THEME)).toBe("dark");

    await utilisateur.selectOptions(screen.getByLabelText("Thème"), "hybrid");
    expect(document.documentElement.dataset["theme"]).toBe("hybrid");
    expect(localStorage.getItem(CLE_THEME)).toBe("hybrid");
  });

  it("se règle au clavier seul, sans souris (UX-06)", async () => {
    const utilisateur = userEvent.setup();
    render(<App />);
    const selecteur = screen.getByLabelText("Thème");

    await utilisateur.tab(); // lien d'évitement
    await utilisateur.tab(); // sélecteur de thème
    expect(selecteur).toHaveFocus();
  });
});

describe("choix du thème au démarrage", () => {
  it("retient d'abord ce que le script d'amorçage a posé", () => {
    const racine = racineNeuve();
    racine.dataset["theme"] = "hybrid";
    localStorage.setItem(CLE_THEME, "dark");
    expect(themeInitial(racine, localStorage, null)).toBe("hybrid");
  });

  it("retombe sur le choix mémorisé, puis sur la préférence du système", () => {
    localStorage.setItem(CLE_THEME, "dark");
    expect(themeInitial(racineNeuve(), localStorage, null)).toBe("dark");

    localStorage.clear();
    const sombre = { matchMedia: () => ({ matches: true }) } as unknown as Window;
    expect(themeInitial(racineNeuve(), localStorage, sombre)).toBe("dark");
  });

  it("ignore une valeur inconnue et reste en clair", () => {
    localStorage.setItem(CLE_THEME, "sepia");
    expect(themeInitial(racineNeuve(), localStorage, null)).toBe("light");
  });

  it("fonctionne sans stockage disponible (navigation privée)", () => {
    const racine = racineNeuve();
    expect(themeInitial(racine, null, null)).toBe("light");
    expect(() => appliquerTheme("dark", racine, null)).not.toThrow();
    expect(racine.dataset["theme"]).toBe("dark");
  });
});
