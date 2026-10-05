// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { LectureRepere, MotLu } from "@lienotheque/contrats";
import type { ImageGrise } from "@lienotheque/images";
import { tesseractDisponible } from "@lienotheque/lecteur-texte";
import {
  PRESENCE_MINIMALE,
  amorceDeSuite,
  lireBlocPiste,
  coinsDePage,
  consolider,
  dansLaZone,
  formesCandidates,
  lireNumeroPage,
  motifLibelle,
  presenceDeForme,
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
    // Sous le numéro, la fenêtre s'aligne sur son bord droit : les numéros sont composés fer à
    // droite dans leur marge, et le repère suit leur alignement.
    expect(zonePastille(boite, "dessous", 6).x).toBe(300 + 40 - 52);
    expect(zonePastille(boite, "dessous", 6).y).toBe(121);
    expect(zonePastille(boite, "dessus", 6).y).toBe(100 - 6 - 33);
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

  it("sur une page coupée, la marge vaut deux fois la part déclarée", () => {
    // La recette décrit le cliché entier ; une page coupée en est la moitié.
    expect(dansLaZone(mot(300), marges, image), "sur une page entière, 300 est hors marge").toBe(false);
    expect(dansLaZone(mot(300), marges, image, "gauche"), "sur une demi-page, il y est").toBe(true);
    expect(dansLaZone(mot(450), marges, image, "gauche"), "mais pas au-delà").toBe(false);
  });

  it("un rectangle relatif se lit en parts de la page", () => {
    const zone = { type: "rectangle_rel", x: 0.1, y: 0.2, l: 0.3, h: 0.3 } as const;
    expect(dansLaZone({ texte: "1", x: 150, y: 450, l: 20, h: 20 }, zone, image)).toBe(true);
    expect(dansLaZone({ texte: "1", x: 150, y: 1500, l: 20, h: 20 }, zone, image)).toBe(false);
  });
});

describe("présence d'un repère (OUT-07)", () => {
  const zone = (encre: (x: number, y: number) => boolean) => ({
    largeur: 60,
    hauteur: 30,
    pixels: Uint8Array.from({ length: 60 * 30 }, (_, rang) => (encre(rang % 60, Math.floor(rang / 60)) ? 20 : 240)),
  });

  it("reconnaît un bloc plein, à la taille du numéro", () => {
    const image = zone((x, y) => x >= 10 && x < 40 && y >= 5 && y < 25);
    expect(presenceDeForme(image, { x: 10, y: 5, l: 30, h: 20 }, 18)).toBeGreaterThan(PRESENCE_MINIMALE);
  });

  it("reconnaît un losange, à demi plein de son cadre", () => {
    const image = zone((x, y) => Math.abs(x - 25) + Math.abs(y - 15) < 10);
    expect(presenceDeForme(image, { x: 15, y: 5, l: 20, h: 20 }, 18)).toBeGreaterThan(PRESENCE_MINIMALE);
  });

  it("ne confond pas des portées avec un repère : leur boîte est large et vide", () => {
    const image = zone((_x, y) => y % 7 === 0);
    expect(presenceDeForme(image, { x: 0, y: 0, l: 60, h: 29 }, 18)).toBeLessThan(PRESENCE_MINIMALE);
  });

  it("écarte une forme démesurée par rapport au numéro", () => {
    const image = zone(() => true);
    expect(presenceDeForme(image, { x: 0, y: 0, l: 60, h: 30 }, 5)).toBe(0);
  });

  it("ne voit rien quand aucune forme n'a été trouvée", () => {
    expect(presenceDeForme(zone(() => false), undefined, 18)).toBe(0);
  });
});

describe("formes candidates d'un repère (OUT-07)", () => {
  const binaire = (encre: (x: number, y: number) => boolean) => ({
    largeur: 60,
    hauteur: 30,
    pixels: Uint8Array.from({ length: 60 * 30 }, (_, rang) => (encre(rang % 60, Math.floor(rang / 60)) ? 0 : 255)),
  });

  it("propose d'abord le pavé plein, même s'il n'est pas le plus grand", () => {
    // Un pavé compact à droite, une longue lettre creuse à gauche : le pavé passe devant.
    const image = binaire((x, y) => (x >= 40 && x < 55 && y >= 8 && y < 22) || (x < 30 && y >= 5 && y < 25 && (x === 0 || x === 29 || y === 5 || y === 24)));
    const candidates = formesCandidates(image, 14);
    expect(candidates[0]).toEqual({ x: 40, y: 8, l: 15, h: 14 });
  });

  it("propose aussi la plus grande forme et la boîte de tout le sombre", () => {
    const image = binaire((x, y) => (x >= 40 && x < 55 && y >= 8 && y < 22) || y === 0);
    const candidates = formesCandidates(image, 14);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.some((c) => c.x === 0 && c.l === 60), "la boîte de tout le sombre est proposée").toBe(true);
  });

  it("ne propose jamais deux fois la même", () => {
    const image = binaire((x, y) => x >= 20 && x < 35 && y >= 8 && y < 22);
    const candidates = formesCandidates(image, 14);
    expect(candidates).toHaveLength(1);
  });

  it("ne propose rien sur une image claire", () => {
    expect(formesCandidates(binaire(() => false), 14)).toEqual([]);
  });
});

describe("vote", () => {
  it("rend la valeur la plus fréquente et son accord", () => {
    expect(vote([5, 5, 7])).toEqual({ valeur: 5, accord: 2 / 3 });
  });

  it("à égalité, la plus longue quand l'autre en est la fin : l'OCR perd le chiffre de tête", () => {
    expect(vote([13, 13, 13, 3, 3, 3])?.valeur).toBe(13);
    expect(vote([3, 13])?.valeur).toBe(13);
  });

  it("à égalité sans rapport entre les valeurs, la plus petite : une règle, pas un hasard", () => {
    expect(vote([8, 3])?.valeur).toBe(3);
    expect(vote([27, 41])?.valeur).toBe(27);
  });

  it("la majorité l'emporte sur la longueur", () => {
    expect(vote([3, 3, 3, 13])?.valeur).toBe(3);
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

describe("fichiers de travail (OUT-07)", () => {
  // Ce contrôle passe par l'OCR : sans Tesseract, il n'y a pas d'image de travail à ne pas
  // laisser derrière soi. L'intégration continue n'installe pas Tesseract (CLAUDE.md), et un
  // contrôle qui ne trouve pas son outil doit se sauter, jamais échouer.
  const siTesseract = tesseractDisponible() ? it : it.skip;

  siTesseract("ne laisse aucune image derrière lui", async () => {
    const { mkdtempSync, readdirSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dossier = mkdtempSync(join(tmpdir(), "lienotheque-essai-"));

    // Une page blanche : l'OCR ne trouvera rien, mais il aura écrit puis effacé ses images.
    const blanche = { largeur: 200, hauteur: 60, pixels: new Uint8Array(200 * 60).fill(255) };
    lireNumeroPage(blanche, "bas", { dossier });

    // Un lot de trois cents pages demande des dizaines de milliers de lectures : en garder les
    // images remplirait le disque.
    expect(readdirSync(dossier), "le dossier de travail est rendu vide").toEqual([]);
    rmSync(dossier, { recursive: true, force: true });
  });
});

describe("le comptage des chiffres ne tourne que si on en a l'usage (OUT-07, OUT-08)", () => {
  const siTesseract = tesseractDisponible() ? it : it.skip;

  /** Une page claire portant un numéro sombre, et sous lui un pavé sombre à deux chiffres clairs.
   *  Ce que l'OCR en lit importe peu ici : on éprouve le comptage, pas la lecture. */
  const page = (): ImageGrise => {
    const largeur = 220;
    const hauteur = 160;
    const pixels = new Uint8Array(largeur * hauteur).fill(245);
    const encre = (x0: number, y0: number, l: number, h: number, ton: number): void => {
      for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + l; x += 1) pixels[y * largeur + x] = ton;
    };
    encre(40, 20, 24, 30, 30); // le numéro de l'élément
    encre(30, 70, 90, 50, 25); // le pavé
    encre(50, 80, 12, 30, 250); // premier chiffre clair
    encre(74, 80, 12, 30, 250); // second chiffre clair
    return { largeur, hauteur, pixels };
  };

  const numero = { x: 40, y: 20, l: 24, h: 30 };

  siTesseract("compte les deux chiffres du pavé quand on le lui demande", async () => {
    const bloc = lireBlocPiste(page(), numero, "dessous", "bloc_sombre_chiffres_clairs", 6, false, {}, true);
    expect(bloc.decoupe?.chiffres).toHaveLength(2);
  });

  siTesseract("ne compte rien quand personne n'en a l'usage : une lecture ordinaire ne le paie pas", async () => {
    const bloc = lireBlocPiste(page(), numero, "dessous", "bloc_sombre_chiffres_clairs", 6, false, {}, false);
    expect(bloc.decoupe).toBeUndefined();
    // Et le reste de la lecture ne change pas pour autant : le repère est toujours vu.
    expect(bloc.presence).toBeGreaterThan(PRESENCE_MINIMALE);
  });
});
