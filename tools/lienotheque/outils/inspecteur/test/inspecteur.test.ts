// @vitest-environment node
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RapportInspecteur } from "@lienotheque/contrats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { couleurDe, estimerOptimise, inspecterPdf } from "../src/index.js";

/** Les fichiers sous droits ne quittent jamais cet ordinateur : quand ils sont absents,
 *  en intégration continue par exemple, ces contrôles se sautent proprement. */
const FICHIERS = join(import.meta.dirname, "../../../fixtures/fichiers");
const F = (relatif: string): string => join(FICHIERS, relatif);
const siPresent = (chemin: string) => (existsSync(chemin) ? it : it.skip);

let dossier = "";
beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), "lienotheque-inspecteur-"));
});
afterAll(() => rmSync(dossier, { recursive: true, force: true }));

describe("classement des couleurs (OPT-01)", () => {
  it("lit la couleur dans l'espace déclaré, pas dans les pixels", () => {
    const image = { numero: 1, largeur: 100, hauteur: 100, octets: 0, filtre: "DCTDecode" };
    expect(couleurDe({ ...image, bits: 1, espaceCouleur: "DeviceGray" })).toBe("noir_et_blanc");
    expect(couleurDe({ ...image, bits: 8, espaceCouleur: "DeviceGray" })).toBe("gris");
    expect(couleurDe({ ...image, bits: 8, espaceCouleur: "DeviceRGB" })).toBe("couleur");
  });

  it("estime un poids optimisé par classe de page (OPT-06)", () => {
    const estime = estimerOptimise([
      { index: 1, nature: "numerisee", couleur: "noir_et_blanc", octets: 1_000_000 },
      { index: 2, nature: "numerisee", couleur: "couleur", octets: 1_000_000 },
    ]);
    expect(estime).toBeLessThan(2_000_000);
    expect(estime).toBeGreaterThan(0);
  });
});

describe("Inspecteur sur un PDF fabriqué", () => {
  it("reconnaît un PDF natif sans image", async () => {
    const chemin = join(dossier, "natif.pdf");
    writeFileSync(
      chemin,
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
        "2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n" +
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> >>\nendobj\n" +
        "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
      "latin1",
    );
    const rapport = await inspecterPdf(chemin);
    expect(RapportInspecteur.safeParse(rapport).success).toBe(true);
    expect(rapport.nature).toBe("natif");
    expect(rapport.pages).toHaveLength(1);
    expect(rapport.pages[0]?.nature).toBe("native");
  });

  it("signale les pages imprimées annoncées mais absentes (OUT-01)", async () => {
    const chemin = join(dossier, "natif.pdf");
    const rapport = await inspecterPdf(chemin, { pagesAttendues: ["29", "30", "31"], pagesPresentes: ["29"] });
    expect(rapport.pagesManquantes).toEqual(["30", "31"]);
  });
});

describe("Inspecteur sur les fixtures réelles", () => {
  siPresent(F("F1/aebersold-FRENCH.pdf"))("F1 est un PDF natif de 55 pages", async () => {
    const rapport = await inspecterPdf(F("F1/aebersold-FRENCH.pdf"));
    expect(rapport.pages).toHaveLength(55);
    expect(rapport.nature).not.toBe("numerise");
    expect(rapport.pages.every((p) => p.nature === "native" || p.nature === "mixte")).toBe(true);
  });

  siPresent(F("F3/'70s Funk & Disco Bass.pdf"))("F3 est un scan de 29 pages, couverture couleur et intérieur gris", async () => {
    const rapport = await inspecterPdf(F("F3/'70s Funk & Disco Bass.pdf"));
    expect(rapport.pages).toHaveLength(29);
    expect(rapport.nature).toBe("numerise");

    const couverture = rapport.pages[0];
    expect(couverture?.couleur).toBe("couleur");
    expect([couverture?.largeurPx, couverture?.hauteurPx]).toEqual([2550, 3509]);

    const interieur = rapport.pages.slice(1);
    expect(interieur.every((p) => p.couleur === "gris")).toBe(true);
    expect(interieur.every((p) => p.largeurPx === 1275 && p.hauteurPx === 1754)).toBe(true);

    expect(rapport.octetsOptimisesEstimes).toBeLessThan(rapport.octets);
  });

  siPresent(F("F2/Realbook Bass F.pdf"))("F2 est un scan noir et blanc avec couche texte", async () => {
    const rapport = await inspecterPdf(F("F2/Realbook Bass F.pdf"));
    expect(rapport.pages.length).toBeGreaterThan(400);
    expect(rapport.pages.some((p) => p.couleur === "noir_et_blanc")).toBe(true);
  }, 120_000);
});
