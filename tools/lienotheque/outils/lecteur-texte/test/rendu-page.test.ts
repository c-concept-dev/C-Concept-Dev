// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { ouvrirRenduPdf, rendrePagePdf, ressourcesPdfJs } from "../src/index.js";

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
  it("donne explicitement à pdf.js ses polices et son décodeur JPX", () => {
    const ressources = ressourcesPdfJs();
    expect(ressources.wasmUrl.endsWith("/wasm/")).toBe(true);
    expect(ressources.standardFontDataUrl.endsWith("/standard_fonts/")).toBe(true);
    expect(ressources.wasmUrl.startsWith("file:")).toBe(false);
    expect(ressources.standardFontDataUrl.startsWith("file:")).toBe(false);
    expect(existsSync(join(ressources.wasmUrl, "openjpeg.wasm"))).toBe(true);
    expect(existsSync(join(ressources.standardFontDataUrl, "LiberationSans-Regular.ttf"))).toBe(true);
  });

  it("prend les ressources embarquées indiquées par l'hôte", () => {
    const embarquees = join(bac, "pdfjs-embarque");
    mkdirSync(join(embarquees, "wasm"), { recursive: true });
    mkdirSync(join(embarquees, "standard_fonts"), { recursive: true });
    process.env["LIENOTHEQUE_PDFJS"] = embarquees;
    try {
      const ressources = ressourcesPdfJs();
      expect(ressources.wasmUrl).toContain("pdfjs-embarque/wasm/");
      expect(ressources.standardFontDataUrl).toContain("pdfjs-embarque/standard_fonts/");
    } finally {
      delete process.env["LIENOTHEQUE_PDFJS"];
    }
  });

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

  it("libère chaque page même quand son rendu échoue", async () => {
    const cleanup = vi.fn();
    const page = {
      getViewport: ({ scale }: { scale: number }) => ({ width: 200 * scale, height: 300 * scale }),
      render: () => ({ promise: Promise.reject(new Error("rendu interrompu")) }),
      cleanup,
    };
    await expect(rendrePagePdf(page, 400)).rejects.toThrow("rendu interrompu");
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
