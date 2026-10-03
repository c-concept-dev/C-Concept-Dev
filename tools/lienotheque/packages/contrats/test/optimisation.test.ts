import { describe, expect, it } from "vitest";
import {
  Derive,
  Echantillon,
  EstimationEnvoi,
  FORMATS_ADMIS,
  LARGEURS_DERIVE,
  PLAFONDS_DERIVE,
  PlanOptimisation,
  PlanPage,
  applicable,
  gain,
  octetsEstimes,
  octetsOrigine,
} from "../src/index.js";

const EMPREINTE = "a".repeat(64);

const page = (sur: Partial<Record<string, unknown>> = {}): unknown => ({
  index: 0,
  classe: "noir_et_blanc",
  formatCible: "bilevel_g4",
  largeur: 2465,
  hauteur: 3520,
  largeurCible: 2465,
  hauteurCible: 3520,
  octetsOrigine: 91_842,
  octetsEstimes: 38_163,
  ...sur,
});

const plan = (sur: Partial<Record<string, unknown>> = {}): unknown => ({
  document: EMPREINTE,
  pages: [page()],
  coucheTexte: "aucune",
  echantillon: { pages: [0], etat: "en_attente" },
  ...sur,
});

describe("format par page (OPT-01)", () => {
  it("chaque classe a ses formats, et aucune n'en a zéro", () => {
    for (const [classe, formats] of Object.entries(FORMATS_ADMIS)) expect(formats.length, classe).toBeGreaterThan(0);
  });

  it("accepte le noir et blanc en 1 bit compressé", () => {
    expect(PlanPage.safeParse(page()).success).toBe(true);
  });

  it("refuse une page noir et blanc rangée en AVIF", () => {
    const refus = PlanPage.safeParse(page({ formatCible: "avif" }));
    expect(refus.success).toBe(false);
    expect(refus.error?.issues[0]?.message).toContain("OPT-01");
  });

  it("une page couleur admet AVIF comme WebP, pas le 1 bit", () => {
    expect(PlanPage.safeParse(page({ classe: "couleur", formatCible: "avif" })).success).toBe(true);
    expect(PlanPage.safeParse(page({ classe: "couleur", formatCible: "webp" })).success).toBe(true);
    expect(PlanPage.safeParse(page({ classe: "couleur", formatCible: "bilevel_g4" })).success).toBe(false);
  });

  it("une page native reste dans son PDF", () => {
    expect(PlanPage.safeParse(page({ classe: "native", formatCible: "pdf_origine" })).success).toBe(true);
    expect(PlanPage.safeParse(page({ classe: "native", formatCible: "webp" })).success).toBe(false);
  });
});

describe("résolution d'origine (OPT-04)", () => {
  it("accepte une cible égale à la source", () => {
    expect(PlanPage.safeParse(page()).success).toBe(true);
  });

  it("refuse toute cible plus basse que la source", () => {
    const refus = PlanPage.safeParse(page({ largeurCible: 1200 }));
    expect(refus.success).toBe(false);
    expect(refus.error?.issues[0]?.message).toContain("OPT-04");
    expect(PlanPage.safeParse(page({ hauteurCible: 900 })).success).toBe(false);
  });
});

describe("plan d'optimisation (OPT-01, OPT-03)", () => {
  it("refuse deux plans pour une même page", () => {
    const refus = PlanOptimisation.safeParse(plan({ pages: [page(), page()] }));
    expect(refus.success).toBe(false);
    expect(refus.error?.issues[0]?.message).toContain("même page");
  });

  it("refuse un échantillon qui cite une page absente du plan", () => {
    const refus = PlanOptimisation.safeParse(plan({ echantillon: { pages: [7], etat: "en_attente" } }));
    expect(refus.success).toBe(false);
    expect(refus.error?.issues[0]?.message).toContain("page 7");
  });

  it("n'applique au lot qu'un échantillon validé", () => {
    const attente = PlanOptimisation.parse(plan());
    expect(applicable(attente)).toBe(false);

    const valide = PlanOptimisation.parse(
      plan({ echantillon: { pages: [0], etat: "valide", valideLe: "2026-10-03T12:00:00.000Z" } }),
    );
    expect(applicable(valide)).toBe(true);
  });

  it("un échantillon validé porte sa date, un refus porte son motif", () => {
    expect(Echantillon.safeParse({ pages: [0], etat: "valide" }).success).toBe(false);
    expect(Echantillon.safeParse({ pages: [0], etat: "refuse" }).success).toBe(false);
    expect(Echantillon.safeParse({ pages: [0], etat: "refuse", motif: "traits fins mangés" }).success).toBe(true);
  });
});

describe("gain mesuré (OPT-01)", () => {
  it("compte les octets des deux côtés et rend le rapport", () => {
    const deux = PlanOptimisation.parse(
      plan({ pages: [page(), page({ index: 1, octetsOrigine: 100_000, octetsEstimes: 20_000 })], echantillon: { pages: [0], etat: "en_attente" } }),
    );
    expect(octetsOrigine(deux)).toBe(191_842);
    expect(octetsEstimes(deux)).toBe(58_163);
    expect(gain(deux)).toBeCloseTo(191_842 / 58_163, 6);
  });

  it("ne divise pas par zéro", () => {
    const vide = PlanOptimisation.parse(plan({ pages: [page({ octetsOrigine: 0, octetsEstimes: 0 })] }));
    expect(gain(vide)).toBe(0);
  });
});

describe("dérivés produits à l'ingestion (OPT-05)", () => {
  const derive = (sur: Partial<Record<string, unknown>> = {}): unknown => ({
    espece: "vignette",
    source: EMPREINTE,
    octets: 18_000,
    largeur: 320,
    hauteur: 452,
    typeMime: "image/webp",
    ...sur,
  });

  it("vise 320 px pour la vignette et 1 200 px pour l'aperçu", () => {
    expect(LARGEURS_DERIVE.vignette).toBe(320);
    expect(LARGEURS_DERIVE.apercu).toBe(1200);
  });

  it("refuse une vignette au-delà de 25 Ko", () => {
    expect(PLAFONDS_DERIVE.vignette).toBe(25 * 1024);
    expect(Derive.safeParse(derive()).success).toBe(true);
    const refus = Derive.safeParse(derive({ octets: 26_000 }));
    expect(refus.success).toBe(false);
    expect(refus.error?.issues[0]?.message).toContain("OPT-05");
  });

  it("refuse une forme d'onde au-delà de 10 Ko", () => {
    expect(Derive.safeParse({ espece: "forme_onde", source: EMPREINTE, octets: 9_000, typeMime: "application/octet-stream" }).success).toBe(true);
    expect(Derive.safeParse({ espece: "forme_onde", source: EMPREINTE, octets: 11_000, typeMime: "application/octet-stream" }).success).toBe(false);
  });

  it("l'aperçu n'a pas de plafond d'octets : c'est sa largeur qui le borne", () => {
    expect(PLAFONDS_DERIVE.apercu).toBeUndefined();
    expect(Derive.safeParse(derive({ espece: "apercu", octets: 400_000, largeur: 1200, hauteur: 1694 })).success).toBe(true);
  });

  it("une image dérivée porte ses dimensions", () => {
    const { largeur: _l, hauteur: _h, ...sansDimensions } = derive() as Record<string, unknown>;
    expect(Derive.safeParse(sansDimensions).success).toBe(false);
  });

  it("la loupe n'est pas une espèce de dérivé : elle n'est jamais stockée", () => {
    expect(Derive.safeParse(derive({ espece: "loupe" })).success).toBe(false);
  });
});

describe("estimation avant envoi (OPT-06, OPT-07)", () => {
  it("porte le poids, le coût et le sort des originaux", () => {
    const lu = EstimationEnvoi.parse({ octets: 19_000_000, cout: 0.28, archive: "r2_classe_rare" });
    expect(lu.archive).toBe("r2_classe_rare");
  });

  it("n'admet que les trois sorts prévus pour les originaux", () => {
    expect(EstimationEnvoi.safeParse({ octets: 1, cout: 0, archive: "ailleurs" }).success).toBe(false);
    for (const archive of ["aucune", "disque_local", "r2_classe_rare"])
      expect(EstimationEnvoi.safeParse({ octets: 1, cout: 0, archive }).success, archive).toBe(true);
  });
});
