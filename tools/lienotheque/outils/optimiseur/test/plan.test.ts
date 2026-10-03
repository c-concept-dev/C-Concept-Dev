import { describe, expect, it } from "vitest";
import { RapportInspecteur, applicable, gain, type PageInspectee } from "@lienotheque/contrats";
import { classer, echantillonParDefaut, formatPour, planifier } from "../src/plan.js";

const EMPREINTE = "b".repeat(64);

const page = (sur: Partial<PageInspectee> = {}): PageInspectee => ({
  index: 1,
  nature: "numerisee",
  largeurPx: 2465,
  hauteurPx: 3520,
  couleur: "noir_et_blanc",
  octets: 91_842,
  ...sur,
});

const rapport = (pages: readonly PageInspectee[]): RapportInspecteur =>
  RapportInspecteur.parse({ empreinte: EMPREINTE, pages, nature: "numerise", octets: 1_000_000 });

describe("classement d'une page (OPT-01)", () => {
  it("range une page numérisée sur sa couleur", () => {
    expect(classer(page())).toBe("noir_et_blanc");
    expect(classer(page({ couleur: "gris" }))).toBe("gris");
    expect(classer(page({ couleur: "couleur" }))).toBe("couleur");
  });

  it("laisse native toute page qui porte du texte", () => {
    expect(classer(page({ nature: "native", couleur: undefined }))).toBe("native");
    expect(classer(page({ nature: "mixte" }))).toBe("native");
  });

  it("une page vide reste native : il n'y a rien à encoder", () => {
    expect(classer(page({ nature: "vide", couleur: undefined }))).toBe("native");
  });

  it("sans couleur relevée, suppose le cas le plus lourd", () => {
    expect(classer(page({ couleur: undefined }))).toBe("couleur");
  });
});

describe("format retenu par classe (OPT-01)", () => {
  it("noir et blanc en 1 bit compressé, gris en AVIF, native dans son PDF", () => {
    expect(formatPour("noir_et_blanc")).toBe("bilevel_g4");
    expect(formatPour("gris")).toBe("avif");
    expect(formatPour("native")).toBe("pdf_origine");
  });

  it("la couleur va en AVIF, sauf préférence pour WebP", () => {
    expect(formatPour("couleur")).toBe("avif");
    expect(formatPour("couleur", { couleur: "webp" })).toBe("webp");
  });

  it("une préférence ne s'applique pas à une classe qui ne l'admet pas", () => {
    expect(formatPour("noir_et_blanc", { couleur: "webp" })).toBe("bilevel_g4");
  });
});

describe("échantillon par défaut (OPT-03)", () => {
  it("prend le début, le milieu et la fin", () => {
    const pages = Array.from({ length: 9 }, (_, rang) => page({ index: rang + 1 }));
    expect(echantillonParDefaut(pages).pages).toEqual([1, 5, 9]);
  });

  it("ne répète pas une page quand le document est court", () => {
    expect(echantillonParDefaut([page({ index: 1 })]).pages).toEqual([1]);
    expect(echantillonParDefaut([page({ index: 1 }), page({ index: 2 })]).pages).toEqual([1, 2]);
  });

  it("part en attente : rien ne s'applique au lot sans un œil", () => {
    expect(echantillonParDefaut([page()]).etat).toBe("en_attente");
  });
});

describe("plan d'un document (OUT-02, OPT-02, OPT-04)", () => {
  it("rend un plan par page, validé par le contrat", () => {
    const plan = planifier(rapport([page({ index: 1 }), page({ index: 2, couleur: "couleur" })]));
    expect(plan.pages).toHaveLength(2);
    expect(plan.pages[0]?.formatCible).toBe("bilevel_g4");
    expect(plan.pages[1]?.formatCible).toBe("avif");
  });

  it("ne descend jamais la résolution (OPT-04)", () => {
    const plan = planifier(rapport([page()]));
    expect(plan.pages[0]?.largeurCible).toBe(2465);
    expect(plan.pages[0]?.hauteurCible).toBe(3520);
  });

  it("préserve la couche texte dès qu'une page en porte une (OPT-02)", () => {
    expect(planifier(rapport([page({ nature: "native" })])).coucheTexte).toBe("preservee");
    expect(planifier(rapport([page({ nature: "mixte" })])).coucheTexte).toBe("preservee");
    expect(planifier(rapport([page()])).coucheTexte).toBe("aucune");
  });

  it("n'est pas applicable tant que l'échantillon n'est pas validé (OPT-03)", () => {
    expect(applicable(planifier(rapport([page()])))).toBe(false);
    const valide = planifier(rapport([page()]), {
      echantillon: { pages: [1], etat: "valide", valideLe: "2026-10-03T12:00:00.000Z" },
    });
    expect(applicable(valide)).toBe(true);
  });

  it("annonce un gain, qui vaut 1 sur un document entièrement natif", () => {
    expect(gain(planifier(rapport([page({ nature: "native" })])))).toBe(1);
    expect(gain(planifier(rapport([page()])))).toBeGreaterThan(2);
  });
});
