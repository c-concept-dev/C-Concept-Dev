import jetons from "./tokens.json" with { type: "json" };

export type Theme = "light" | "dark";
export type JetonsTheme = (typeof jetons)["themes"]["light"];
export const JETONS = jetons;

/** Luminance relative WCAG 2.2 d'une couleur #RRGGBB. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`Couleur invalide : ${hex}`);
  const n = Number.parseInt(m[1], 16);
  const canaux = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = canaux as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG entre deux couleurs. */
export function contraste(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const enKebab = (s: string) => s.replace(/_/g, "-");
const META_HYBRIDE = new Set(["cards_theme", "shell_theme", "heading_panel_opacity"]);

/** Valeurs complètes d'un thème. L'hybride reprend les jetons clairs (cartes, boutons)
 *  et les surcharge par ses jetons propres (barre et panneaux de titres sombres, voile photo). */
export function valeursTheme(theme: Theme | "hybrid"): Record<string, string | number> {
  const clair = jetons.themes.light as Record<string, string | number>;
  if (theme !== "hybrid") return { ...(jetons.themes[theme] as Record<string, string | number>) };
  const h = Object.entries(jetons.themes.hybrid as Record<string, string | number>).filter(([k]) => !META_HYBRIDE.has(k));
  return { ...clair, ...Object.fromEntries(h) };
}

/** Variables CSS d'un thème : `--ln-text-primary`, etc. Aucune couleur n'est écrite dans un composant. */
export function variablesCss(theme: Theme | "hybrid"): string {
  const collections = Object.entries(jetons.collections).map(([k, v]) => `  --ln-collection-${k}: ${v};`);
  const valeurs = valeursTheme(theme);
  return [
    ...Object.entries(valeurs).map(([k, v]) => `  --ln-${enKebab(k)}: ${v};`),
    // L'encre qui va avec « --ln-surface », gardée à part.
    //
    // En hybride, un panneau de titre redéfinit « --ln-text-primary » pour tout ce qu'il
    // contient : c'est juste pour son texte, posé sur le graphite. Mais un contrôle qui porte
    // son propre fond crème héritait de cette encre claire — crème sur crème, rapport 1,07.
    // Celle-ci ne bouge pas, parce qu'elle est figée ici et non relue chez l'enfant.
    `  --ln-text-on-surface: ${valeurs["text_primary"]};`,
    `  --ln-collection: ${jetons.collections.method};`,
    ...collections,
  ].join("\n");
}

/** Feuille complète, compatible avec components.css du kit UI v1.1 (mêmes noms de variables). */
export function feuilleCss(): string {
  const g = jetons.geometry;
  const impression = [
    "--ln-background:var(--ln-print-background)", "--ln-surface:var(--ln-print-background)",
    "--ln-text-primary:var(--ln-print-text)", "--ln-text-secondary:var(--ln-print-secondary)",
    "--ln-heading-panel:var(--ln-print-background)", "--ln-heading-text:var(--ln-print-text)",
    "--ln-heading-text-secondary:var(--ln-print-secondary)", "--ln-border-decorative:var(--ln-print-border)",
  ].join("; ");
  return [
    `/* Généré depuis tokens.json v${jetons.version} — ne pas modifier à la main. */`,
    `:root {\n  --ln-grid: ${g.grid_px}px;\n  --ln-radius: ${g.radius_px}px;\n  --ln-progress-height: ${g.progress_height_px}px;\n  --ln-resume-border: ${g.resume_border_px}px;\n  --ln-font-ui: "${jetons.typography.ui}", Arial, sans-serif;\n  --ln-font-brand: "${jetons.typography.brand}", Georgia, serif;\n}`,
    `:root, [data-theme="light"] {\n${variablesCss("light")}\n}`,
    `[data-theme="dark"] {\n${variablesCss("dark")}\n}`,
    `[data-theme="hybrid"] {\n${variablesCss("hybrid")}\n}`,
    `@media print { [data-theme] { ${impression}; } }`,
    `@media (prefers-reduced-motion: reduce) { :root { --ln-motion: 0ms; } }`,
  ].join("\n\n");
}
