// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn(async () => Buffer.from("pdf sans pages reconnues")) }));
vi.mock("@lienotheque/formats", () => ({
  causeJpegNonDirect: vi.fn(),
  empreinteDe: vi.fn(async () => "a".repeat(64)),
  objetsPdf: vi.fn(() => []),
  octetsImage: vi.fn(),
  pagesPdf: vi.fn(() => []),
}));

import { exporterPages } from "../src/pages-images.js";

const temporaires: string[] = [];

afterEach(() => {
  for (const dossier of temporaires.splice(0)) rmSync(dossier, { recursive: true, force: true });
});

describe("l'export de pages échoue honnêtement", () => {
  it("OUT-04 — refuse de déclarer un succès quand le lecteur ne produit aucune page", async () => {
    const dossier = mkdtempSync(join(tmpdir(), "lienotheque-pages-vides-"));
    temporaires.push(dossier);

    await expect(exporterPages("document.pdf", dossier, { vignettes: false })).rejects.toThrow(
      /aucune page exploitable/i,
    );
  });
});
