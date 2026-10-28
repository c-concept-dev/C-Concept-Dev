// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { coordonnerLectureDifficile, type DecisionPage, type LectureTentative } from "../src/index.js";

type Modele = { readonly version: string };
type Page = { readonly numero: number; readonly texte: string };

const pages: readonly Page[] = [
  { numero: 1, texte: "un" },
  { numero: 2, texte: "deux" },
  { numero: 3, texte: "trois" },
  { numero: 4, texte: "quatre" },
];

const valide = (valeur: string): LectureTentative<string> => ({ etat: "valide", valeur, confiance: 0.96 });
const incertaine = (raison: string, candidat?: string): LectureTentative<string> => ({
  etat: "incertaine",
  raison,
  ...(candidat === undefined ? {} : { candidat }),
});

const aVerifier = <P, V, M>(decision: DecisionPage<P, V, M> | undefined) => {
  expect(decision?.etat).toBe("a_verifier");
  if (decision === undefined || decision.etat !== "a_verifier") throw new Error("Décision à vérifier attendue");
  return decision;
};

describe("coordinateur générique de lecture difficile", () => {
  it("garde une lecture locale sûre sans appeler Vision", async () => {
    const vision = vi.fn();
    const resultat = await coordonnerLectureDifficile(pages.slice(0, 2), { version: "v1" }, {
      lireLocalement: ({ page }) => valide(page.texte),
      relireParVision: vision,
      corroborer: () => false,
    });

    expect(vision).not.toHaveBeenCalled();
    expect(resultat.pages.map((page) => [page.page, page.etat, page.etat === "retenue" ? page.source : undefined])).toEqual([
      [1, "retenue", "locale"],
      [2, "retenue", "locale"],
    ]);
  });

  it("n'envoie à Vision que la page incertaine et ne retient sa réponse qu'après corroboration", async () => {
    const vision = vi.fn(async ({ page }: { page: Page }) => valide(page.texte));
    const resultat = await coordonnerLectureDifficile(pages.slice(0, 3), { version: "v1" }, {
      lireLocalement: ({ page }) => (page.numero === 2 ? incertaine("contraste faible", "deux") : valide(page.texte)),
      relireParVision: vision,
      corroborer: ({ locale, vision: relue }) => locale.etat === "incertaine" && locale.candidat === relue.valeur,
    });

    expect(vision).toHaveBeenCalledTimes(1);
    expect(vision.mock.calls[0]?.[0].page.numero).toBe(2);
    expect(resultat.pages[1]).toMatchObject({ etat: "retenue", source: "vision_corroboree", valeur: "deux" });
  });

  it("s'abstient quand Vision contredit la lecture locale ou reste seule", async () => {
    const resultat = await coordonnerLectureDifficile(pages.slice(0, 2), { version: "v1" }, {
      lireLocalement: ({ page }) => (page.numero === 1 ? incertaine("deux chiffres possibles", "14") : { etat: "echec", raison: "illisible" }),
      relireParVision: async ({ page }) => valide(page.numero === 1 ? "41" : "22"),
      corroborer: ({ locale, vision }) => locale.etat === "incertaine" && locale.candidat === vision.valeur,
    });

    expect(resultat.pages).toHaveLength(2);
    expect(resultat.pages.every((page) => page.etat === "a_verifier")).toBe(true);
    expect(aVerifier(resultat.pages[0]).raisons.join(" ")).toMatch(/contredit|corrobor/i);
    expect(aVerifier(resultat.pages[1]).raisons.join(" ")).toMatch(/corrobor/i);
  });

  it("recalibre sur un échantillon borné à la première rupture et relit avec le modèle validé", async () => {
    const pagesRecalibrees: number[][] = [];
    const recalibrer = vi.fn(async ({ pages: echantillon }: { pages: readonly Page[] }) => {
      pagesRecalibrees.push(echantillon.map((page) => page.numero));
      return { etat: "valide" as const, modele: { version: "v2" } };
    });
    const resultat = await coordonnerLectureDifficile(pages, { version: "v1" }, {
      lireLocalement: ({ page, modele }) =>
        page.numero === 3 && modele.version === "v1"
          ? { etat: "rupture", raison: "gabarit déplacé" }
          : valide(`${modele.version}:${page.texte}`),
      relireParVision: async () => {
        throw new Error("Vision ne doit pas être appelée après un recalibrage concluant");
      },
      corroborer: () => false,
      recalibrer,
      pagesDeCalibrage: 8,
    });

    expect(recalibrer).toHaveBeenCalledTimes(1);
    expect(pagesRecalibrees).toEqual([[3, 4]]);
    expect(resultat.segments).toEqual([
      { depuis: 1, modele: { version: "v1" }, origine: "initiale" },
      { depuis: 3, modele: { version: "v2" }, origine: "recalibrage_valide" },
    ]);
    expect(resultat.pages[2]).toMatchObject({ etat: "retenue", valeur: "v2:trois", modele: { version: "v2" } });
    expect(resultat.pages[3]).toMatchObject({ etat: "retenue", valeur: "v2:quatre", modele: { version: "v2" } });
  });

  it("n'active jamais un recalibrage refusé et rend la page explicitement à vérifier", async () => {
    const resultat = await coordonnerLectureDifficile(pages.slice(0, 3), { version: "v1" }, {
      lireLocalement: ({ page }) => (page.numero === 2 ? { etat: "rupture", raison: "signature absente" } : valide(page.texte)),
      relireParVision: async () => incertaine("le modèle hésite"),
      corroborer: () => false,
      recalibrer: async () => ({ etat: "refuse", raison: "témoins cachés non conformes" }),
    });

    expect(resultat.segments).toHaveLength(1);
    expect(resultat.pages[1]).toMatchObject({ etat: "a_verifier", modele: { version: "v1" } });
    expect(aVerifier(resultat.pages[1]).raisons.join(" ")).toMatch(/témoins cachés non conformes/);
    expect(resultat.pages[2]).toMatchObject({ etat: "retenue", modele: { version: "v1" } });
  });

  it("ne perd aucune page quand la lecture locale ou Vision lève une erreur", async () => {
    const resultat = await coordonnerLectureDifficile(pages, { version: "v1" }, {
      lireLocalement: ({ page }) => {
        if (page.numero === 2) throw new Error("OCR indisponible");
        return page.numero === 3 ? incertaine("faible confiance") : valide(page.texte);
      },
      relireParVision: async ({ page }) => {
        if (page.numero === 2 || page.numero === 3) throw new Error("service Vision indisponible");
        return valide(page.texte);
      },
      corroborer: () => false,
    });

    expect(resultat.pages.map((page) => page.page)).toEqual([1, 2, 3, 4]);
    expect(resultat.pages[1]).toMatchObject({ etat: "a_verifier", visionUtilisee: true });
    expect(resultat.pages[2]).toMatchObject({ etat: "a_verifier", visionUtilisee: true });
    expect(aVerifier(resultat.pages[1]).raisons.join(" ")).toMatch(/OCR indisponible/);
    expect(aVerifier(resultat.pages[1]).raisons.join(" ")).toMatch(/Vision indisponible/);
  });

  it("ne traite jamais une confiance sous le seuil comme une lecture sûre", async () => {
    const vision = vi.fn(async () => ({ etat: "valide" as const, valeur: "un", confiance: 0.93 }));
    const resultat = await coordonnerLectureDifficile(pages.slice(0, 1), { version: "v1" }, {
      lireLocalement: () => ({ etat: "valide", valeur: "un", confiance: 0.62 }),
      relireParVision: vision,
      corroborer: ({ locale, vision }) => locale.etat === "incertaine" && locale.candidat === vision.valeur,
      seuilConfiance: 0.8,
    });

    expect(vision).toHaveBeenCalledTimes(1);
    expect(resultat.pages[0]).toMatchObject({ etat: "retenue", source: "vision_corroboree", valeur: "un" });
  });

  it("peut ouvrir plusieurs segments validés quand le gabarit change plusieurs fois", async () => {
    const resultat = await coordonnerLectureDifficile(pages, { version: "v1" }, {
      lireLocalement: ({ page, modele }) => {
        if (page.numero === 2 && modele.version === "v1") return { etat: "rupture", raison: "première maquette" };
        if (page.numero === 4 && modele.version === "v2") return { etat: "rupture", raison: "seconde maquette" };
        return valide(`${modele.version}:${page.texte}`);
      },
      relireParVision: async () => incertaine("inutile"),
      corroborer: () => false,
      recalibrer: async ({ modele }) => ({
        etat: "valide",
        modele: { version: modele.version === "v1" ? "v2" : "v3" },
      }),
    });

    expect(resultat.segments.map((segment) => [segment.depuis, segment.modele.version])).toEqual([
      [1, "v1"],
      [2, "v2"],
      [4, "v3"],
    ]);
    expect(resultat.pages[3]).toMatchObject({ etat: "retenue", valeur: "v3:quatre" });
  });
});
