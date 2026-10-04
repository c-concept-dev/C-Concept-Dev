import { describe, expect, it } from "vitest";
import { JETONS, contraste, feuilleCss, variablesCss } from "../src/index.js";

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
  // Un contrôle posé dans un panneau de titre hybride garde son fond crème : c'est l'encre de
  // cette surface qu'il doit prendre, pas celle du graphite derrière. La paire fautive est
  // gardée juste en dessous, pour que la correction ne se reperde pas.
  ["hybride · contrôle sur sa surface", L.text_primary, L.surface, T],
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

describe("l'encre d'une surface est un jeton à part (UX-07)", () => {
  /** `--ln-text-on-surface` fige l'encre du contenu au moment où le thème est écrit.
   *
   *  En hybride, un panneau de titre redéfinit `--ln-text-primary` pour tout son contenu — il
   *  faut bien que son texte se lise sur le graphite. Un bouton, lui, porte son propre fond
   *  crème : il héritait donc d'une encre claire sur une surface claire, rapport 1,07. Ce jeton
   *  est ce qu'il relit pour retrouver la sienne. */
  const feuille = feuilleCss();

  it("est écrit dans les trois variantes", () => {
    for (const variante of ["light", "dark", "hybrid"] as const)
      expect(variablesCss(variante), variante).toContain("--ln-text-on-surface:");
  });

  it("vaut l'encre de contenu de sa variante, jamais celle d'un panneau de titre", () => {
    expect(variablesCss("light")).toContain(`--ln-text-on-surface: ${L.text_primary}`);
    expect(variablesCss("dark")).toContain(`--ln-text-on-surface: ${D.text_primary}`);
    // L'hybride reprend les jetons clairs pour ses surfaces : son encre de contenu est la claire.
    expect(variablesCss("hybrid")).toContain(`--ln-text-on-surface: ${L.text_primary}`);
    expect(variablesCss("hybrid"), "et surtout pas le crème du panneau de titre").not.toContain(
      `--ln-text-on-surface: ${JETONS.themes.hybrid.heading_text}`,
    );
  });

  it("tient 4,5:1 sur la surface de chaque variante", () => {
    expect(contraste(L.text_primary, L.surface)).toBeGreaterThanOrEqual(T);
    expect(contraste(D.text_primary, D.surface)).toBeGreaterThanOrEqual(T);
    // L'hybride : encre claire sur surface claire héritée.
    expect(contraste(L.text_primary, L.surface)).toBeGreaterThanOrEqual(T);
  });

  it("sort de la feuille complète, pas seulement d'un bloc", () => {
    expect(feuille.match(/--ln-text-on-surface:/g) ?? [], "une fois par variante").toHaveLength(3);
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
