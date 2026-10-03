// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { LectureRepere, MotLu } from "@lienotheque/contrats";
import {
  PRESENCE_MINIMALE,
  amorceDeSuite,
  coinsDePage,
  consolider,
  dansLaZone,
  motifLibelle,
  presenceDeBloc,
  tonClair,
  vote,
  zonePastille,
} from "../src/index.js";

describe("motif tiré du libellé de la recette (OUT-07)", () => {
  it("accepte le libellé tel quel, quelle que soit la casse", () => {
    const motif = motifLibelle("Pattern");
    expect(motif.test("Pattern")).toBe(true);
    expect(motif.test("pattern")).toBe(true);
  });

  it("tolère un doublement mangé par l'OCR, et rien d'autre", () => {
    const motif = motifLibelle("Pattern");
    expect(motif.test("Patern"), "la lettre doublée peut manquer").toBe(true);
    expect(motif.test("Patten"), "mais pas une autre lettre").toBe(false);
    expect(motif.test("Patternes")).toBe(false);
    expect(motif.test("Pattern 3")).toBe(false);
  });

  it("n'invente aucune tolérance sur un libellé sans doublement", () => {
    const motif = motifLibelle("Exemple");
    expect(motif.test("Exemple")).toBe(true);
    expect(motif.test("Exemle")).toBe(false);
  });

  it("échappe ce qui aurait un sens dans une expression régulière", () => {
    expect(motifLibelle("N°.").test("N°.")).toBe(true);
    expect(motifLibelle("N°.").test("N°x")).toBe(false);
  });
});

describe("amorce d'une mention de suite", () => {
  it("garde les lettres de tête : une apostrophe ne survit pas à l'OCR", () => {
    expect(amorceDeSuite("cont'd")).toBe("cont");
    expect(amorceDeSuite("suite")).toBe("suite");
  });
});

describe("où chercher les repères", () => {
  const image = { largeur: 1000, hauteur: 2000, pixels: new Uint8Array(0) };

  it("cherche le numéro de page dans les deux coins du bord indiqué", () => {
    const bas = coinsDePage(image, "bas");
    expect(bas).toHaveLength(2);
    expect(bas[0]).toEqual({ x: 0, y: 1860, l: 300, h: 140 });
    expect(bas[1]?.x).toBe(700);
    expect(coinsDePage(image, "haut")[0]?.y).toBe(0);
  });

  it("place la pastille du côté que dit la recette", () => {
    const boite = { x: 300, y: 100, l: 40, h: 20 };
    expect(zonePastille(boite, "droite", 6).x).toBe(346);
    expect(zonePastille(boite, "gauche", 6).x).toBe(300 - 6 - 100);
    expect(zonePastille(boite, "dessous", 6).y).toBe(126);
    expect(zonePastille(boite, "dessus", 6).y).toBe(100 - 6 - 44);
  });

  it("met la zone à l'échelle du numéro, pas à celle de la page", () => {
    const petite = zonePastille({ x: 0, y: 0, l: 10, h: 10 }, "droite", 0);
    const grande = zonePastille({ x: 0, y: 0, l: 20, h: 20 }, "droite", 0);
    expect(grande.l).toBe(petite.l * 2);
    expect(grande.h).toBe(petite.h * 2);
  });
});

describe("consolidation des lectures (OUT-07)", () => {
  const lecture = (y: number, numero: number, sur: Partial<LectureRepere> = {}): LectureRepere => ({ y, numero, suite: false, presencePiste: 0, ...sur });

  it("regroupe par hauteur et fait voter le numéro", () => {
    const consolides = consolider([lecture(0.1, 7), lecture(0.105, 7), lecture(0.102, 1)]);
    expect(consolides).toHaveLength(1);
    expect(consolides[0]?.numero).toBe(7);
    expect(consolides[0]?.accordNumero).toBeCloseTo(0.67, 2);
  });

  it("sépare ce qui est loin sur la page", () => {
    expect(consolider([lecture(0.1, 1), lecture(0.5, 2)]).map((e) => e.numero)).toEqual([1, 2]);
  });

  it("vote la piste à part du numéro : l'un peut être sûr quand l'autre ne l'est pas", () => {
    const consolides = consolider([
      lecture(0.2, 5, { pisteLue: 5 }),
      lecture(0.2, 5, { pisteLue: 5 }),
      lecture(0.2, 5, { pisteLue: 8 }),
    ]);
    expect(consolides[0]?.accordNumero).toBe(1);
    expect(consolides[0]?.pisteLue).toBe(5);
    expect(consolides[0]?.accordPiste).toBeCloseTo(0.67, 2);
  });

  it("une seule lecture de suite suffit à marquer le groupe", () => {
    expect(consolider([lecture(0.2, 5), lecture(0.2, 5, { suite: true })])[0]?.suite).toBe(true);
  });

  it("ne rend aucune piste quand aucune n'a été lue", () => {
    const consolide = consolider([lecture(0.2, 5)])[0];
    expect(consolide?.pisteLue).toBeUndefined();
    expect(consolide?.accordPiste).toBe(0);
  });

  it("rend le même résultat quel que soit l'ordre d'arrivée des lectures", () => {
    const lectures = [lecture(0.5, 9, { pisteLue: 9 }), lecture(0.1, 3), lecture(0.102, 3), lecture(0.5, 9)];
    const direct = consolider(lectures);
    const inverse = consolider([...lectures].reverse());
    expect(JSON.stringify(inverse)).toBe(JSON.stringify(direct));
  });

  it("à égalité de voix, le plus petit numéro l'emporte : une règle, pas un hasard", () => {
    expect(consolider([lecture(0.2, 8), lecture(0.2, 3)])[0]?.numero).toBe(3);
  });
});

describe("zone des éléments selon la recette (OUT-07)", () => {
  const image = { largeur: 1000, hauteur: 2000, pixels: new Uint8Array(0) };
  const mot = (x: number, l = 40): MotLu => ({ texte: "187", x, y: 500, l, h: 40 });
  const marges = { type: "marges_exterieures", largeur_rel: 0.2 } as const;

  it("sur une page entière, les deux marges comptent", () => {
    expect(dansLaZone(mot(10), marges, image)).toBe(true);
    expect(dansLaZone(mot(950), marges, image)).toBe(true);
    expect(dansLaZone(mot(500), marges, image)).toBe(false);
  });

  it("sur une page coupée, la marge extérieure est du côté opposé à la reliure", () => {
    expect(dansLaZone(mot(10), marges, image, "gauche")).toBe(true);
    expect(dansLaZone(mot(950), marges, image, "gauche"), "à droite, c'est la reliure").toBe(false);
    expect(dansLaZone(mot(950), marges, image, "droite")).toBe(true);
    expect(dansLaZone(mot(10), marges, image, "droite")).toBe(false);
  });

  it("un rectangle relatif se lit en parts de la page", () => {
    const zone = { type: "rectangle_rel", x: 0.1, y: 0.2, l: 0.3, h: 0.3 } as const;
    expect(dansLaZone({ texte: "1", x: 150, y: 450, l: 20, h: 20 }, zone, image)).toBe(true);
    expect(dansLaZone({ texte: "1", x: 150, y: 1500, l: 20, h: 20 }, zone, image)).toBe(false);
  });
});

describe("présence d'un bloc de piste (OUT-07)", () => {
  const zone = (encre: (x: number, y: number) => boolean) => ({
    largeur: 60,
    hauteur: 30,
    pixels: Uint8Array.from({ length: 60 * 30 }, (_, rang) => (encre(rang % 60, Math.floor(rang / 60)) ? 20 : 240)),
  });

  it("reconnaît un bloc sombre large", () => {
    expect(presenceDeBloc(zone((x, y) => x >= 10 && x < 50 && y >= 5 && y < 25))).toBeGreaterThan(0.8);
  });

  it("ne confond pas un trait fin avec un bloc, même s'il traverse toute la zone", () => {
    expect(presenceDeBloc(zone((_x, y) => y === 15))).toBeLessThan(PRESENCE_MINIMALE);
  });

  it("ne confond pas une barre verticale avec un bloc", () => {
    expect(presenceDeBloc(zone((x) => x === 30))).toBeLessThan(PRESENCE_MINIMALE);
  });

  it("ne voit rien sur du papier", () => {
    expect(presenceDeBloc(zone(() => false))).toBe(0);
  });

  it("ne voit rien dans une zone vide", () => {
    expect(presenceDeBloc({ largeur: 0, hauteur: 0, pixels: new Uint8Array(0) })).toBe(0);
  });
});

describe("vote", () => {
  it("rend la valeur la plus fréquente et son accord", () => {
    expect(vote([5, 5, 7])).toEqual({ valeur: 5, accord: 2 / 3 });
  });

  it("à égalité, la plus petite : une règle, pas un hasard", () => {
    expect(vote([8, 3])?.valeur).toBe(3);
  });

  it("ne rend rien sans voix", () => {
    expect(vote([])).toBeUndefined();
  });
});

describe("ton clair d'une zone", () => {
  it("rend un ton représentatif du papier local", () => {
    const image = { largeur: 10, hauteur: 10, pixels: Uint8Array.from({ length: 100 }, (_, rang) => (rang < 10 ? 20 : 230)) };
    expect(tonClair(image)).toBe(230);
  });

  it("rend du blanc sur une image vide", () => {
    expect(tonClair({ largeur: 0, hauteur: 0, pixels: new Uint8Array(0) })).toBe(255);
  });
});
