// @vitest-environment node
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aUneCoucheTexte, identifier, moteursEmbarques, objetsPdf, pagesPdf, preuveDepuisBase } from "../src/index.js";
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

const MOTEURS = join(import.meta.dirname, "../../../apps/app/src-tauri/moteurs");

describe("Siegfried embarqué fait autorité (FMT-01)", () => {
  const embarques = moteursEmbarques(MOTEURS);
  /** Deux conditions : les moteurs préparés (absents de l'intégration continue, qui ne lance que
   *  `pnpm check`) et les fixtures sous droits. */
  const siEmbarque = (chemin: string) => (embarques.siegfried !== undefined && existsSync(chemin) ? it : it.skip);

  siEmbarque(F("F1/aebersold-FRENCH.pdf"))("porte le registre PRONOM et nomme son outil", async () => {
    const identification = await identifier(F("F1/aebersold-FRENCH.pdf"), embarques);
    expect(identification.outil).toBe("siegfried");
    expect(identification.pronom).toMatch(/^fmt\/\d+$/);
    expect(identification.typeMime).toBe("application/pdf");
  });

  siEmbarque(F3_MP3)("reconnaît un MP3 par son contenu", async () => {
    const pistes = readdirSync(F3_MP3).filter((nom) => nom.endsWith(".mp3"));
    const identification = await identifier(join(F3_MP3, pistes[0]!), embarques);
    expect(identification.pronom).toBe("fmt/134");
    expect(identification.typeMime).toBe("audio/mpeg");
  });

  siEmbarque(F("F1/aebersold-FRENCH.pdf"))("ne se laisse pas prendre par une extension menteuse", async () => {
    const { mkdtempSync, copyFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dossier = mkdtempSync(join(tmpdir(), "lienotheque-sf-"));
    const menteur = join(dossier, "ceci-est-un-texte.txt");
    copyFileSync(F("F1/aebersold-FRENCH.pdf"), menteur);

    const identification = await identifier(menteur, embarques);
    expect(identification.typeMime).toBe("application/pdf");
    expect(identification.preuve, "une correspondance d'octets l'emporte sur le nom").toBe("signature");
    expect(identification.extensionTrompeuse).toBe(true);
    rmSync(dossier, { recursive: true, force: true });
  });
});

describe("lecture de la base d'une identification Siegfried", () => {
  it("une correspondance d'octets l'emporte sur l'extension", () => {
    expect(preuveDepuisBase("extension match pdf; byte match at [[0 8]]")).toBe("signature");
    expect(preuveDepuisBase("extension match mp3")).toBe("extension");
    expect(preuveDepuisBase("container name OEBPS/content.opf")).toBe("conteneur");
    expect(preuveDepuisBase("")).toBe("signature");
  });
});
