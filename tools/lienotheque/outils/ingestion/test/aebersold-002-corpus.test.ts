// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { exporterPages } from "../src/pages-images.js";

/** Qualification privée du défaut réel signalé le 28 octobre 2026 (OUT-03).
 *
 * L’œuvre ne vit jamais dans le dépôt. Le test ne tourne que lorsque son chemin est fourni :
 * l'intégration continue l'ignore, la qualification locale l'exécute sur le vrai corpus. */
const corpus = process.env["LIENOTHEQUE_AEBERSOLD_002"];
const sortie = mkdtempSync(join(tmpdir(), "lienotheque-aebersold-002-"));

afterAll(() => rmSync(sortie, { recursive: true, force: true }));

describe.skipIf(corpus === undefined)("Aebersold 002, pages couchées au milieu d'un document", () => {
  it("redresse les seules pages 4 et 6 sans coucher la page 5 (OUT-03)", async () => {
    const exporte = await exporterPages(corpus!, sortie, { depuis: 3, pages: 3, vignettes: false, redresser: true });
    const parIndex = new Map(exporte.pages.map((page) => [page.index, page]));

    expect(parIndex.get(3)?.largeur, "la page 4 reste couchée dans un cadre portrait").toBeGreaterThan(
      parIndex.get(3)?.hauteur ?? Number.POSITIVE_INFINITY,
    );
    expect(parIndex.get(4)?.hauteur, "la page 5 droite a été tournée par erreur").toBeGreaterThan(
      parIndex.get(4)?.largeur ?? Number.POSITIVE_INFINITY,
    );
    expect(parIndex.get(5)?.largeur, "la page 6 reste couchée dans un cadre portrait").toBeGreaterThan(
      parIndex.get(5)?.hauteur ?? Number.POSITIVE_INFINITY,
    );
  }, 120_000);
});
