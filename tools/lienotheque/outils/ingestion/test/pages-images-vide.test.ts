// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const doubles = vi.hoisted(() => ({ ouvrirRenduPdf: vi.fn() }));

vi.mock("@lienotheque/formats", () => ({
  causeJpegNonDirect: vi.fn(),
  empreinteDe: vi.fn(async () => "a".repeat(64)),
  objetsPdf: vi.fn(() => []),
  octetsImage: vi.fn(),
  pagesPdf: vi.fn(() => []),
}));
vi.mock("@lienotheque/lecteur-texte", () => ({ ouvrirRenduPdf: doubles.ouvrirRenduPdf }));

import { exporterPages } from "../src/pages-images.js";

const temporaires: string[] = [];

beforeEach(() => {
  doubles.ouvrirRenduPdf.mockResolvedValue({
    nombreDePages: 2,
    page: vi.fn(async () => {
      const data = new Uint8ClampedArray(12 * 8 * 4).fill(255);
      for (let y = 0; y < 8; y += 1) data.fill(0, (y * 12 + 6) * 4, (y * 12 + 6) * 4 + 3);
      return { data, width: 12, height: 8, colorSpace: "srgb" };
    }),
    fermer: vi.fn(async () => undefined),
  });
});

afterEach(() => {
  for (const dossier of temporaires.splice(0)) rmSync(dossier, { recursive: true, force: true });
});

describe("l'export de pages échoue honnêtement", () => {
  it("OUT-04 — rend les pages complètes quand le lecteur structurel n'en trouve aucune", async () => {
    const dossier = mkdtempSync(join(tmpdir(), "lienotheque-pages-vides-"));
    temporaires.push(dossier);
    const document = join(dossier, "document.pdf");
    writeFileSync(document, "pdf sans pages reconnues");

    const exporte = await exporterPages(document, dossier, { vignettes: false });
    expect(exporte.pages.map((page) => page.index)).toEqual([0, 1]);
  });

  it("OUT-03 — rend deux pages logiques distinctes par feuille double", async () => {
    const dossier = mkdtempSync(join(tmpdir(), "lienotheque-pages-doubles-"));
    temporaires.push(dossier);
    const document = join(dossier, "document.pdf");
    writeFileSync(document, "deux feuilles doubles orientées par le PDF");

    const exporte = await exporterPages(document, dossier, { doublePage: true, vignettes: false });

    expect(exporte.pages.map((page) => page.index)).toEqual([0, 1, 2, 3]);
    expect(exporte.pages.every((page) => page.largeur < page.hauteur)).toBe(true);
    expect(doubles.ouvrirRenduPdf.mock.results[0]?.value).toBeDefined();
  });

  it("OUT-04 — refuse toujours un succès si même le rendu complet ne porte aucune page", async () => {
    doubles.ouvrirRenduPdf.mockResolvedValue({ nombreDePages: 0, page: vi.fn(), fermer: vi.fn(async () => undefined) });
    const dossier = mkdtempSync(join(tmpdir(), "lienotheque-pages-vides-"));
    temporaires.push(dossier);
    const document = join(dossier, "document.pdf");
    writeFileSync(document, "pdf sans pages reconnues");

    await expect(exporterPages(document, dossier, { vignettes: false })).rejects.toThrow(/aucune page exploitable/i);
  });
});

/** La tranche demandée est bien celle qui sort (lot 0i).
 *
 *  La moitié basse de la chaîne. Celle du haut — que la charge transmette la borne à l'export —
 *  est éprouvée dans `lot-resilient.test.ts`. Les deux comptent : la borne existait ici depuis
 *  l'origine, et c'est l'appel qui ne la passait pas.
 *
 *  Ces contrôles ne demandent aucune œuvre : le document est fabriqué ici et le rendu est doublé.
 *  Les contrôles qui l'éprouvaient sur le corpus réel sont **sautés** là où les œuvres ne sont
 *  pas — en intégration continue, donc —, et la moitié basse y restait sans preuve. */
describe("l'export ne rend que la tranche demandée (lot 0i)", () => {
  const dixPages = () => {
    doubles.ouvrirRenduPdf.mockResolvedValue({
      nombreDePages: 10,
      page: vi.fn(async () => {
        const data = new Uint8ClampedArray(12 * 8 * 4).fill(255);
        return { data, width: 12, height: 8, colorSpace: "srgb" };
      }),
      fermer: vi.fn(async () => undefined),
    });
    const dossier = mkdtempSync(join(tmpdir(), "lienotheque-tranche-"));
    temporaires.push(dossier);
    const document = join(dossier, "document.pdf");
    writeFileSync(document, "dix pages, rendues par le second lecteur");
    return { dossier, document };
  };

  it("rend trois pages sur dix quand trois sont demandées, et non les dix", async () => {
    const { dossier, document } = dixPages();
    const exporte = await exporterPages(document, dossier, { pages: 3, vignettes: false });
    expect(exporte.pages).toHaveLength(3);
  });

  it("rend la tranche du milieu, numérotée comme dans le document entier", async () => {
    // Le rang porté est celui du document, non celui de la tranche : sans quoi deux tranches se
    // recouvriraient et la page 8 s'écrirait par-dessus la page 1.
    const { dossier, document } = dixPages();
    const exporte = await exporterPages(document, dossier, { depuis: 6, pages: 2, vignettes: false });
    expect(exporte.pages.map((page) => page.index)).toEqual([6, 7]);
  });

  it("rend tout le document quand aucune tranche n'est demandée", async () => {
    const { dossier, document } = dixPages();
    const exporte = await exporterPages(document, dossier, { vignettes: false });
    expect(exporte.pages).toHaveLength(10);
  });
});
