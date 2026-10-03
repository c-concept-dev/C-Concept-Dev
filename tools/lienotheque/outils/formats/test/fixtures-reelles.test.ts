// @vitest-environment node
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aUneCoucheTexte, identifier, objetsPdf, pagesPdf } from "../src/index.js";
import { readFile } from "node:fs/promises";

/** Fixtures sous droits : présentes sur la machine de développement, absentes partout ailleurs.
 *  Ces contrôles se sautent proprement plutôt que d'échouer (règle du lot C). */
const FICHIERS = join(import.meta.dirname, "../../../fixtures/fichiers");
const F = (relatif: string): string => join(FICHIERS, relatif);
const siPresent = (chemin: string) => (existsSync(chemin) ? it : it.skip);

const F3_PDF = F("F3/'70s Funk & Disco Bass.pdf");
const F3_MP3 = F("F3/70 Funk & Disco bass MP3");

describe("identification des fixtures réelles (FMT-01)", () => {
  siPresent(F("F1/aebersold-FRENCH.pdf"))("F1 : un PDF reconnu par son contenu", async () => {
    const identification = await identifier(F("F1/aebersold-FRENCH.pdf"));
    expect(identification.typeMime).toBe("application/pdf");
    expect(identification.extensionTrompeuse).toBe(false);
    expect(identification.empreinte).toMatch(/^[0-9a-f]{64}$/);
  });

  siPresent(F3_MP3)("F3 : les 99 pistes sont reconnues comme de l'audio, noms d'origine compris", async () => {
    const pistes = readdirSync(F3_MP3).filter((nom) => !nom.startsWith("."));
    expect(pistes).toHaveLength(99);

    const identifications = await Promise.all(pistes.slice(0, 5).map((nom) => identifier(join(F3_MP3, nom))));
    for (const identification of identifications) {
      expect(identification.typeMime).toBe("audio/mpeg");
      expect(identification.extensionTrompeuse).toBe(false);
    }
  });

  siPresent(F3_PDF)("F3 : 29 pages numérisées, sans couche texte", async () => {
    const objets = objetsPdf(await readFile(F3_PDF));
    expect(pagesPdf(objets)).toHaveLength(29);
    expect(aUneCoucheTexte(objets), "un scan sans OCR n'a pas de police").toBe(false);
  });

  siPresent(F("F1/aebersold-FRENCH.pdf"))("F1 : une couche texte, elle", async () => {
    expect(aUneCoucheTexte(objetsPdf(await readFile(F("F1/aebersold-FRENCH.pdf"))))).toBe(true);
  });

  siPresent(F("F4"))("F4 : les fichiers gardent leurs noms d'origine, espaces et crochets compris", () => {
    const contenu = readdirSync(F("F4")).filter((nom) => !nom.startsWith("."));
    expect(contenu.some((nom) => nom.endsWith(".pdf"))).toBe(true);
    const sousDossier = contenu.find((nom) => !nom.endsWith(".pdf"));
    expect(sousDossier, "les MP3 vivent dans un sous-dossier").toBeDefined();
    expect(readdirSync(F(join("F4", sousDossier!))).filter((n) => n.endsWith(".mp3"))).toHaveLength(92);
  });
});
