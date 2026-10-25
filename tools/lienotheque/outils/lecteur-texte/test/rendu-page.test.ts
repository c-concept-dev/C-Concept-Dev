// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ouvrirRenduPdf } from "../src/index.js";

/** Repli de rendu complet : une page sans JPEG incorporé doit tout de même devenir des pixels.
 *
 * La fixture dessine un rectangle avec les opérateurs PDF eux-mêmes. Elle ne contient donc
 * volontairement aucun XObject image : l'ancien chemin, limité au premier JPEG, ne peut rien en
 * tirer. Le test tient le besoin sans embarquer un document réel sous droits. */

const bac = mkdtempSync(join(tmpdir(), "lienotheque-rendu-page-"));
afterAll(() => rmSync(bac, { recursive: true, force: true }));

function pdfVectoriel(): string {
  const flux = "0 0 0 rg 20 20 100 100 re f";
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(flux)} >>\nstream\n${flux}\nendstream`,
  ];
  let corps = "%PDF-1.4\n";
  const decalages: number[] = [];
  objets.forEach((objet, rang) => {
    decalages.push(Buffer.byteLength(corps, "latin1"));
    corps += `${rang + 1} 0 obj\n${objet}\nendobj\n`;
  });
  const xref = Buffer.byteLength(corps, "latin1");
  corps += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const d of decalages) corps += `${String(d).padStart(10, "0")} 00000 n \n`;
  corps += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const chemin = join(bac, "vectoriel.pdf");
  writeFileSync(chemin, corps, "latin1");
  return chemin;
}

describe("repli de rendu complet d'une page PDF", () => {
  it("rend les opérateurs graphiques d'une page qui ne contient aucun JPEG", async () => {
    const rendu = await ouvrirRenduPdf(pdfVectoriel());
    try {
      const image = await rendu.page(1, 400);
      expect(image.width).toBe(400);
      expect(image.height).toBe(400);
      expect(image.data.length).toBe(400 * 400 * 4);
      expect(
        image.data.some((canal, index) => index % 4 !== 3 && canal < 32),
        "le rectangle noir de la page doit être présent dans les pixels",
      ).toBe(true);
    } finally {
      await rendu.fermer();
    }
  });
});
