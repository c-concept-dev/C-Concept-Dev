// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TexteLu, texteDePage } from "@lienotheque/contrats";
import { objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyserTsv, decouperEnMots, lireCoucheTexte, lireParOcr, tesseractDisponible } from "../src/index.js";

const RACINE = join(import.meta.dirname, "../../..");
const F1 = join(RACINE, "fixtures/fichiers/F1/aebersold-FRENCH.pdf");
const F3 = join(RACINE, "fixtures/fichiers/F3/'70s Funk & Disco Bass.pdf");
const siPresent = (...chemins: string[]) => (chemins.every((c) => existsSync(c)) ? it : it.skip);

let dossier = "";
beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), "lienotheque-lecture-"));
});
afterAll(() => rmSync(dossier, { recursive: true, force: true }));

describe("découpe en mots d'une suite de caractères", () => {
  const element = { str: "Deux mots", transform: [12, 0, 0, 12, 100, 700], width: 60, height: 12 };

  it("rend un mot par groupe de caractères, jamais les espaces", () => {
    const mots = decouperEnMots(element, 842);
    expect(mots.map((m) => m.texte)).toEqual(["Deux", "mots"]);
  });

  it("retourne l'origine en haut à gauche, comme le veulent les ancres", () => {
    const [premier] = decouperEnMots(element, 842);
    expect(premier?.y).toBeCloseTo(842 - 700 - 12, 5);
    expect(premier?.x).toBeCloseTo(100, 5);
  });

  it("répartit la largeur au prorata des caractères", () => {
    const [premier, second] = decouperEnMots(element, 842);
    expect(premier!.l).toBeCloseTo((60 / 9) * 4, 5);
    expect(second!.x).toBeGreaterThan(premier!.x + premier!.l - 1);
  });
});

describe("couche texte d'un PDF natif (OUT-05, critère F1)", () => {
  siPresent(F1)(
    "extrait la couche texte en entier, à l'identique de la vérité relevée",
    async () => {
      const reference = JSON.parse(readFileSync(join(RACINE, "fixtures/references/F1-couche-texte.json"), "utf8")) as {
        empreinte: string;
        pages: number;
        caracteres: number;
        pagesAvecTexte: number;
        detail: { index: number; caracteres: number; empreinteTexte: string }[];
      };

      const lu = await lireCoucheTexte(F1);
      expect(TexteLu.safeParse(lu).success).toBe(true);
      expect(lu.empreinte, "le fichier de référence est bien celui-ci").toBe(reference.empreinte);
      expect(lu.pages).toHaveLength(reference.pages);

      const texteDe = (index: number) =>
        texteDePage(lu.pages[index - 1]!)
          .replace(/\s+/g, " ")
          .trim();

      expect(lu.pages.filter((p) => p.mots.length > 0)).toHaveLength(reference.pagesAvecTexte);
      expect(lu.pages.reduce((n, p) => n + texteDe(p.index).length, 0)).toBe(reference.caracteres);

      for (const attendu of reference.detail) {
        const empreinte = createHash("sha256").update(texteDe(attendu.index)).digest("hex").slice(0, 16);
        expect(empreinte, `page ${attendu.index}`).toBe(attendu.empreinteTexte);
      }
    },
    120_000,
  );

  siPresent(F1)("donne à chaque mot une position dans la page", async () => {
    const lu = await lireCoucheTexte(F1);
    const page = lu.pages.find((p) => p.mots.length > 20)!;
    expect(page.unite).toBe("point");
    for (const mot of page.mots.slice(0, 50)) {
      expect(mot.x, mot.texte).toBeLessThanOrEqual(page.largeur);
      expect(mot.y, mot.texte).toBeLessThanOrEqual(page.hauteur);
      expect(mot.l).toBeGreaterThan(0);
    }
  }, 120_000);
});

describe("lecture d'un tableau Tesseract", () => {
  const tsv = [
    "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
    "5\t1\t1\t1\t1\t1\t100\t200\t40\t18\t96.4\tPattern",
    "5\t1\t1\t1\t1\t2\t150\t200\t20\t18\t95.1\t12",
    "5\t1\t1\t1\t1\t3\t0\t0\t0\t0\t-1\t",
  ].join("\n");

  it("rend un mot par ligne, avec sa boîte en pixels", () => {
    const mots = analyserTsv(tsv);
    expect(mots).toHaveLength(2);
    expect(mots[0]).toMatchObject({ texte: "Pattern", x: 100, y: 200, l: 40, h: 18 });
    expect(mots[0]?.confiance).toBeCloseTo(0.964, 3);
  });

  it("ignore les lignes vides et les boîtes nulles", () => {
    expect(analyserTsv(tsv).map((m) => m.texte)).not.toContain("");
    expect(analyserTsv("")).toEqual([]);
    expect(analyserTsv("rien d'utile")).toEqual([]);
  });
});

describe("OCR d'une page numérisée (OUT-05)", () => {
  siPresent(F3)("lit des mots sur une page de F3, positionnés dans l'image d'origine", async () => {
    if (!tesseractDisponible()) return;

    const objets = objetsPdf(await readFile(F3));
    const pages = pagesPdf(objets);
    const image = pages[1]!.images[0]!;
    const octets = octetsImage(objets, image.numero)!;
    const chemin = join(dossier, "page-2.jpg");
    writeFileSync(chemin, octets.octets);

    const lue = lireParOcr(chemin, image.largeur, image.hauteur, 2);
    expect(lue.source).toBe("ocr");
    expect(lue.unite).toBe("pixel");
    expect(lue.mots.length, "une page de méthode porte du texte").toBeGreaterThan(10);
    for (const mot of lue.mots) {
      expect(mot.x + mot.l, mot.texte).toBeLessThanOrEqual(image.largeur + 1);
      expect(mot.y + mot.h, mot.texte).toBeLessThanOrEqual(image.hauteur + 1);
    }
  }, 180_000);
});
