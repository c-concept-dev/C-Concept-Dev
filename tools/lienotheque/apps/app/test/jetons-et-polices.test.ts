// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { feuilleCss } from "@lienotheque/jetons";
import { describe, expect, it } from "vitest";
import { ID_JETONS } from "../src/jetons-virtuels.js";
import { THEMES } from "../src/theme/theme.js";

const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), "utf8");
const KIT = (nom: string) => fileURLToPath(new URL(`../../../docs/ui-kit/assets/fonts/${nom}`, import.meta.url));

describe("feuille de jetons (UX-07 : contrôle automatique des jetons)", () => {
  it("est chargée depuis @lienotheque/jetons, jamais recopiée", () => {
    expect(lire("../src/main.tsx")).toContain(`import "${ID_JETONS}"`);
  });

  it("déclare les variables --ln-* des trois variantes", () => {
    const feuille = feuilleCss();
    for (const theme of THEMES) expect(feuille).toContain(`[data-theme="${theme}"]`);
    for (const variable of ["--ln-background", "--ln-text-primary", "--ln-focus", "--ln-progress-outline"]) {
      expect(feuille).toContain(variable);
    }
  });

  it("fournit la grille, le rayon et les deux familles de la charte", () => {
    const feuille = feuilleCss();
    expect(feuille).toContain("--ln-grid: 8px");
    expect(feuille).toContain("--ln-radius: 8px");
    expect(feuille).toContain("--ln-progress-height: 3px");
    expect(feuille).toMatch(/--ln-font-ui: "Inter"/);
    expect(feuille).toMatch(/--ln-font-brand: "Source Serif 4"/);
  });
});

describe("polices locales (aucune ressource distante)", () => {
  const polices = lire("../src/styles/polices.css");

  it("déclare Inter et Source Serif 4 en WOFF2", () => {
    expect(polices).toContain("Inter-latin-ext.woff2");
    expect(polices).toContain("SourceSerif4-latin-ext.woff2");
  });

  it("ne déclare plus de repli TTF (19 octobre 2026)", () => {
    // Ce test exigeait le contraire, et sans dire pourquoi : il figeait l'état du jour plutôt
    // qu'une exigence. L'exigence de ce bloc est « aucune ressource distante », et le WOFF2
    // local la satisfait seul.
    //
    // Les trois moteurs visés acceptent WOFF2 depuis 2016 : le repli n'était jamais téléchargé,
    // mais la construction l'embarquait toujours — deux mégaoctets sur quatre et demi, pour
    // rien. Le jour où un moteur sans WOFF2 compterait, les piles « --ln-font-ui » et
    // « --ln-font-brand » gardent Arial et Georgia derrière.
    //
    // Le kit continue de livrer les TTF ; c'est l'application qui cesse de les citer.
    expect(polices).not.toContain(".ttf");
  });

  it("pointe vers des fichiers qui existent dans le kit", () => {
    for (const nom of ["Inter-latin-ext.woff2", "SourceSerif4-latin-ext.woff2"]) {
      expect(existsSync(KIT(nom)), nom).toBe(true);
    }
  });

  it("ne charge aucune police depuis le réseau", () => {
    expect(polices).not.toMatch(/url\(\s*["']?https?:/i);
  });
});
