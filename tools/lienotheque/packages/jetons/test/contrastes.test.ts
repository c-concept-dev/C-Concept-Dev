import { describe, expect, it } from "vitest";
import { JETONS, contraste } from "../src/index.js";

const T = 4.5; // texte courant (WCAG 2.2 AA)
const C = 3; // composants et éléments graphiques
const L = JETONS.themes.light;
const D = JETONS.themes.dark;

/** [description, premier plan, fond, seuil] : chaque paire réellement utilisée par l'interface. */
const PAIRES: [string, string, string, number][] = [
  ["clair · texte sur fond", L.text_primary, L.background, T],
  ["clair · texte sur surface", L.text_primary, L.surface, T],
  ["clair · secondaire sur fond", L.text_secondary, L.background, T],
  ["clair · secondaire sur surface", L.text_secondary, L.surface, T],
  ["clair · lien sur surface", L.link, L.surface, T],
  ["clair · bouton", L.action_text, L.action_background, T],
  ["clair · bouton survolé", L.action_text, L.action_hover, T],
  ["clair · texte sélectionné", L.selection_text, L.selection_background, T],
  ["clair · avertissement", L.warning_text, L.warning_background, T],
  ["clair · erreur", L.error_text, L.surface, T],
  ["clair · désactivé (réserve)", L.disabled_text, L.disabled_background, T],
  ["clair · bord de champ", L.control_border, L.surface, C],
  ["clair · focus", L.focus, L.surface, C],
  ["clair · liseré de progression", L.progress_outline, L.progress_track, C],
  ["sombre · texte sur fond", D.text_primary, D.background, T],
  ["sombre · texte sur surface", D.text_primary, D.surface, T],
  ["sombre · secondaire sur surface", D.text_secondary, D.surface, T],
  ["sombre · lien sur surface", D.link, D.surface, T],
  ["sombre · bouton", D.action_text, D.action_background, T],
  ["sombre · bouton survolé", D.action_text, D.action_hover, T],
  ["sombre · texte sélectionné", D.selection_text, D.selection_background, T],
  ["sombre · avertissement", D.warning_text, D.warning_background, T],
  ["sombre · erreur", D.error_text, D.surface, T],
  ["sombre · désactivé", D.disabled_text, D.disabled_background, T],
  ["sombre · bord de champ", D.control_border, D.surface, C],
  ["sombre · focus", D.focus, D.surface, C],
  ["sombre · progression (réserve)", D.progress_fill, D.progress_track, C],
  ["hybride · titre sur panneau", D.text_primary, JETONS.themes.hybrid.heading_panel, T],
  ...Object.entries(JETONS.collections).map(([k, v]): [string, string, string, number] => [`bandeau ${k} · icône ivoire`, L.background, v, C]),
];

describe("contrastes WCAG 2.2 AA des jetons (UX-07)", () => {
  it.each(PAIRES)("%s", (_nom, avant, fond, seuil) => {
    expect(contraste(avant, fond)).toBeGreaterThanOrEqual(seuil);
  });

  it("documente l'exception connue : progression claire sous 3:1, donc liseré et pourcentage obligatoires", () => {
    expect(contraste(L.progress_fill, L.progress_track)).toBeLessThan(C);
    expect(L.progress_outline).toBe("#202327");
  });

  it("n'utilise jamais le cuivre pour un bandeau de collection", () => {
    const cuivres = [L.action_background, L.action_hover, L.thread, D.action_background];
    for (const v of Object.values(JETONS.collections)) expect(cuivres).not.toContain(v);
  });

  it("réserve le serif au logo et à « Bonjour »", () => {
    expect(JETONS.typography.serif_allowed).toEqual(["logo", "Bonjour"]);
    expect(JETONS.typography.counter_font).toBe("Inter");
  });
});

describe("jetons ajoutés par le kit UI v1.1", () => {
  const H = { ...L, ...JETONS.themes.hybrid } as unknown as Record<string, string>;
  const paires: [string, string, string, number][] = [
    ["sombre · texte de barre", D.shell_text, D.shell_surface, T],
    ["sombre · lien de barre", D.shell_link, D.shell_surface, T],
    ["hybride · texte de barre", H.shell_text!, H.shell_surface!, T],
    ["hybride · secondaire sur panneau", H.heading_text_secondary!, H.heading_panel!, T],
    ["hybride · lien sur panneau", H.heading_link!, H.heading_panel!, T],
    ["impression · texte", L.print_text, L.print_background, T],
    ["impression · secondaire", L.print_secondary, L.print_background, T],
  ];
  it.each(paires)("%s", (_n, a, b, s) => expect(contraste(a, b)).toBeGreaterThanOrEqual(s));

  it("bandeaux de collections : icônes seulement (taupe sous 4,5:1, au-dessus de 3:1)", () => {
    for (const v of Object.values(JETONS.collections)) expect(contraste(L.cover_text, v)).toBeGreaterThanOrEqual(C);
    expect(contraste(L.cover_text, JETONS.collections.photos)).toBeLessThan(T);
  });
});
