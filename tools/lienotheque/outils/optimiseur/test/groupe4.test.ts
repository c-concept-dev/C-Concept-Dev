// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Plume, changements, encoderGroupe4, pixel } from "../src/index.js";
import { tiffGroupe4 } from "./tiff.js";

let dossier: string;
beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), "lienotheque-g4-"));
});
afterAll(() => rmSync(dossier, { recursive: true, force: true }));

/** libtiff, par Pillow, est le juge : il décode ce que nous encodons. Absent, les contrôles se
 *  sautent proprement — comme les fixtures sous droits. */
function pillow(): boolean {
  try {
    execFileSync("python3", ["-c", "from PIL import Image, features; assert features.check('libtiff')"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Rend les pixels tels que libtiff les relit, empaquetés comme à l'entrée (bit levé = encre). */
function relire(donnees: Buffer, largeur: number, hauteur: number): Buffer {
  const chemin = join(dossier, `essai-${Math.random().toString(36).slice(2)}.tiff`);
  writeFileSync(chemin, tiffGroupe4(donnees, largeur, hauteur));
  const sortie = execFileSync(
    "python3",
    [
      "-c",
      [
        "import sys, base64",
        "from PIL import Image",
        "im = Image.open(sys.argv[1])",
        "assert im.size == (int(sys.argv[2]), int(sys.argv[3])), im.size",
        // PIL rend « 1 » avec bit levé = blanc ; on retourne pour revenir à notre convention.
        "brut = im.convert('1').tobytes()",
        "sys.stdout.write(base64.b64encode(bytes(255 - o for o in brut)).decode())",
      ].join("\n"),
      chemin,
      String(largeur),
      String(hauteur),
    ],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  return Buffer.from(sortie, "base64");
}

const siPillow = pillow() ? it : it.skip;

/** Compare deux images empaquetées, pixel à pixel : les bits de bourrage en fin de ligne ne
 *  sont pas des pixels, et chaque décodeur les laisse comme il veut. */
function memesPixels(a: Buffer, b: Buffer, largeur: number, hauteur: number): boolean {
  const parLigne = Math.ceil(largeur / 8);
  for (let y = 0; y < hauteur; y += 1) {
    const ligneA = a.subarray(y * parLigne, (y + 1) * parLigne);
    const ligneB = b.subarray(y * parLigne, (y + 1) * parLigne);
    for (let x = 0; x < largeur; x += 1) if (pixel(ligneA, x) !== pixel(ligneB, x)) return false;
  }
  return true;
}

/** Fabrique une image empaquetée à partir d'une fonction de dessin. */
function dessiner(largeur: number, hauteur: number, encre: (x: number, y: number) => boolean): Buffer {
  const parLigne = Math.ceil(largeur / 8);
  const donnees = Buffer.alloc(parLigne * hauteur);
  for (let y = 0; y < hauteur; y += 1)
    for (let x = 0; x < largeur; x += 1)
      if (encre(x, y)) donnees[y * parLigne + (x >> 3)]! |= 1 << (7 - (x & 7));
  return donnees;
}

describe("écriture de bits", () => {
  it("écrit en commençant par le bit de poids fort", () => {
    const plume = new Plume();
    plume.ecrire(0b101, 3);
    plume.ecrire(0b11, 2);
    expect(plume.bits).toBe(5);
    expect([...plume.terminer()]).toEqual([0b10111000]);
  });

  it("écrit un code donné en toutes lettres", () => {
    const plume = new Plume();
    plume.ecrireCode("0000110111");
    expect([...plume.terminer()]).toEqual([0b00001101, 0b11000000]);
  });
});

describe("changements de couleur sur une ligne", () => {
  it("une ligne blanche n'en a aucun", () => {
    expect(changements(dessiner(16, 1, () => false), 16)).toEqual([]);
  });

  it("une ligne noire change une fois, au premier pixel", () => {
    expect(changements(dessiner(16, 1, () => true), 16)).toEqual([0]);
  });

  it("relève chaque passage, dans l'ordre", () => {
    const ligne = dessiner(16, 1, (x) => x >= 3 && x < 7);
    expect(changements(ligne, 16)).toEqual([3, 7]);
    expect(pixel(ligne, 3)).toBe(1);
    expect(pixel(ligne, 7)).toBe(0);
  });
});

describe("encodeur groupe 4 (OPT-01), jugé par libtiff", () => {
  const cas: readonly { nom: string; l: number; h: number; encre: (x: number, y: number) => boolean }[] = [
    { nom: "page entièrement blanche", l: 64, h: 8, encre: () => false },
    { nom: "page entièrement noire", l: 64, h: 8, encre: () => true },
    { nom: "une barre verticale", l: 64, h: 8, encre: (x) => x >= 20 && x < 24 },
    { nom: "une barre qui se décale d'une ligne à l'autre", l: 64, h: 16, encre: (x, y) => x >= 10 + y && x < 14 + y },
    { nom: "damier à un pixel : le pire cas", l: 64, h: 16, encre: (x, y) => (x + y) % 2 === 0 },
    { nom: "largeur qui ne tombe pas sur un octet", l: 37, h: 9, encre: (x, y) => (x * y) % 5 === 0 },
    { nom: "plages plus longues que la plus grande rallonge", l: 3000, h: 4, encre: (x) => x > 2700 },
    { nom: "plages de 2624 pixels, qui enchaînent deux rallonges", l: 2700, h: 3, encre: (x) => x < 2624 },
    { nom: "texte simulé : traits fins et espaces", l: 200, h: 40, encre: (x, y) => y % 7 < 2 && x % 11 < 3 },
    { nom: "une seule ligne", l: 100, h: 1, encre: (x) => x % 3 === 0 },
  ];

  for (const { nom, l, h, encre } of cas) {
    siPillow(`rend les mêmes pixels : ${nom}`, () => {
      const source = dessiner(l, h, encre);
      const encode = encoderGroupe4(source, l, h);
      expect(memesPixels(relire(encode, l, h), source, l, h), nom).toBe(true);
    });
  }

  it("refuse une image plus courte que ses dimensions", () => {
    expect(() => encoderGroupe4(Buffer.alloc(4), 64, 8)).toThrow(/trop courte/);
  });

  siPillow("sait clore le train par un code de fin de bloc", () => {
    const source = dessiner(64, 8, (x) => x < 30);
    const sans = encoderGroupe4(source, 64, 8);
    const avec = encoderGroupe4(source, 64, 8, { finDeBloc: true });
    expect(avec.length).toBeGreaterThan(sans.length);
    expect(memesPixels(relire(avec, 64, 8), source, 64, 8)).toBe(true);
  });
});
