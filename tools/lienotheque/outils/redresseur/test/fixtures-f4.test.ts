// @vitest-environment node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ReglagesRedressement } from "@lienotheque/contrats";
import { objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";
import { decoderJpeg, enGris, type ImageGrise } from "@lienotheque/images";
import { redresser } from "../src/index.js";

/** Fixture sous droits : F4 est une méthode photographiée en doubles pages, posée de travers.
 *  Absente ailleurs, ces contrôles se sautent proprement. */
const F4 = join(import.meta.dirname, "../../../fixtures/fichiers/F4/Paul westwood.pdf");
const siF4 = existsSync(F4) ? it : it.skip;

async function cliche(index: number): Promise<ImageGrise> {
  const objets = objetsPdf(await readFile(F4));
  const image = pagesPdf(objets)[index]!.images[0]!;
  return enGris(await decoderJpeg(octetsImage(objets, image.numero)!.octets));
}

const REGLAGES = ReglagesRedressement.parse({
  rotation: "auto",
  doublePage: true,
  pageGauche: "paire",
  effacerVerso: true,
  binarisation: "adaptative",
});

describe("redressement d'une double page réelle (OUT-03)", () => {
  siF4(
    "remet d'aplomb, coupe à la pliure et rend deux pages d'un seul tenant",
    async () => {
      const image = await cliche(40);
      expect(image.hauteur, "le cliché arrive couché").toBeGreaterThan(image.largeur);

      const pages = redresser(image, 40, REGLAGES);
      expect(pages).toHaveLength(2);

      const [gauche, droite] = pages;
      expect(gauche!.descripteur.rotation, "Tesseract reconnaît l'orientation").toBe(270);
      expect(gauche!.descripteur.sourceRotation).toBe("reconnue");

      // Après rotation, le cliché est plus large que haut, et la pliure tombe près du milieu.
      const largeurTournee = image.hauteur;
      expect(gauche!.descripteur.gouttiere).toBeGreaterThan(largeurTournee * 0.4);
      expect(gauche!.descripteur.gouttiere).toBeLessThan(largeurTournee * 0.6);

      // Chaque page garde toute la hauteur et à peu près la moitié de la largeur.
      for (const page of pages) {
        expect(page.image.hauteur).toBe(image.largeur);
        expect(page.image.largeur).toBeGreaterThan(largeurTournee * 0.35);
        expect(page.image.largeur).toBeLessThan(largeurTournee * 0.65);
      }
      expect(droite!.descripteur.cote).toBe("droite");
    },
    600_000,
  );

  siF4(
    "binarise une photo éclairée de biais sans noircir les marges",
    async () => {
      const pages = redresser(await cliche(40), 40, REGLAGES);
      const page = pages[1]!.image;
      expect(new Set(page.pixels)).toEqual(new Set([0, 255]));

      let encre = 0;
      for (const ton of page.pixels) if (ton === 0) encre += 1;
      const part = encre / page.pixels.length;
      // Une page de méthode est surtout du papier : entre 2 et 25 % d'encre, jamais une page noire.
      expect(part, `part d'encre ${(part * 100).toFixed(1)} %`).toBeGreaterThan(0.02);
      expect(part).toBeLessThan(0.25);
    },
    600_000,
  );

  siF4(
    "ne modifie jamais le cliché d'origine (OPT-04)",
    async () => {
      const image = await cliche(40);
      const empreinte = image.pixels.reduce((somme, ton) => (somme * 31 + ton) % 2_147_483_647, 7);
      redresser(image, 40, REGLAGES);
      expect(image.pixels.reduce((somme, ton) => (somme * 31 + ton) % 2_147_483_647, 7)).toBe(empreinte);
    },
    600_000,
  );
});
