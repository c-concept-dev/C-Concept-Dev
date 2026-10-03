import { describe, expect, it } from "vitest";
import { PageRedressee, ReglagesRedressement, Rotation, numeroAttendu } from "../src/index.js";

const page = {
  source: 40,
  rotation: 270,
  sourceRotation: "reconnue",
  cote: "gauche",
  gouttiere: 1212,
  largeur: 1212,
  hauteur: 1725,
  versoEfface: true,
  binarisee: true,
};

describe("rotation (OUT-03)", () => {
  it("n'admet que les quarts de tour", () => {
    for (const quart of [0, 90, 180, 270]) expect(Rotation.safeParse(quart).success, String(quart)).toBe(true);
    expect(Rotation.safeParse(45).success).toBe(false);
    expect(Rotation.safeParse(360).success).toBe(false);
  });
});

describe("page redressée (OUT-03)", () => {
  it("accepte une page coupée qui dit son côté et sa gouttière", () => {
    expect(PageRedressee.safeParse(page).success).toBe(true);
  });

  it("accepte une page entière, sans côté ni gouttière", () => {
    const { cote: _c, gouttiere: _g, ...entiere } = page;
    expect(PageRedressee.safeParse(entiere).success).toBe(true);
  });

  it("refuse un côté sans gouttière, et l'inverse", () => {
    const { gouttiere: _g, ...sansGouttiere } = page;
    expect(PageRedressee.safeParse(sansGouttiere).success).toBe(false);
    const { cote: _c, ...sansCote } = page;
    expect(PageRedressee.safeParse(sansCote).success).toBe(false);
  });

  it("dit toujours d'où vient la rotation retenue", () => {
    const { sourceRotation: _s, ...sansSource } = page;
    expect(PageRedressee.safeParse(sansSource).success).toBe(false);
    expect(PageRedressee.safeParse({ ...page, sourceRotation: "devinee" }).success).toBe(false);
  });
});

describe("réglages de redressement (OUT-03)", () => {
  it("prend ses valeurs par défaut : on ne touche à rien sans le dire", () => {
    const lus = ReglagesRedressement.parse({ rotation: "auto", doublePage: false });
    expect(lus.effacerVerso).toBe(false);
    expect(lus.binarisation).toBe("aucune");
  });

  it("refuse une page de gauche quand il n'y a pas de double page", () => {
    expect(ReglagesRedressement.safeParse({ rotation: "auto", doublePage: false, pageGauche: "paire" }).success).toBe(false);
    expect(ReglagesRedressement.safeParse({ rotation: "auto", doublePage: true, pageGauche: "paire" }).success).toBe(true);
  });
});

describe("numéro attendu d'une page coupée (OUT-03)", () => {
  it("rend le numéro tel quel quand il n'y a pas eu de coupe", () => {
    expect(numeroAttendu(80, undefined, "paire")).toBe(80);
  });

  it("met le pair à gauche quand la recette le dit", () => {
    expect(numeroAttendu(80, "gauche", "paire")).toBe(80);
    expect(numeroAttendu(80, "droite", "paire")).toBe(81);
  });

  it("redresse une base impaire vers la convention déclarée", () => {
    expect(numeroAttendu(81, "gauche", "paire")).toBe(82);
    expect(numeroAttendu(81, "droite", "paire")).toBe(83);
  });

  it("met l'impair à gauche quand c'est l'autre convention", () => {
    expect(numeroAttendu(81, "gauche", "impaire")).toBe(81);
    expect(numeroAttendu(81, "droite", "impaire")).toBe(82);
    expect(numeroAttendu(80, "gauche", "impaire")).toBe(81);
  });
});
