// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const doubles = vi.hoisted(() => ({ ouvrirRenduPdf: vi.fn(), rotationDePageFiable: vi.fn() }));

vi.mock("@lienotheque/formats", () => ({
  causeJpegNonDirect: vi.fn(),
  empreinteDe: vi.fn(async () => "a".repeat(64)),
  objetsPdf: vi.fn(() => []),
  octetsImage: vi.fn(),
  pagesPdf: vi.fn(() => []),
}));
vi.mock("@lienotheque/lecteur-texte", () => ({ ouvrirRenduPdf: doubles.ouvrirRenduPdf }));
vi.mock("@lienotheque/redresseur", () => ({
  couperDoublePage: vi.fn(),
  rotationDePageFiable: doubles.rotationDePageFiable,
}));

import { exporterPages } from "../src/pages-images.js";

/** Une page redressée doit s'afficher droite, et un mot surligné tomber à sa place (OUT-03).
 *
 *  ## Le défaut que ces contrôles existent pour empêcher
 *
 *  La lecture redresse une page avant de la lire : les positions de ses mots sont donc dans le
 *  repère **tourné**. Si l'image exportée restait dans le repère d'origine, **un mot surligné
 *  tomberait à côté** et une zone tracée désignerait autre chose que ce qu'on voit.
 *
 *  J'avais écrit, le 6 novembre 2026, que ne rien écrire rendait la rotation « réversible par
 *  construction ». C'était présenter un défaut comme une qualité : image et coordonnées se
 *  trouvaient dans deux repères différents.
 *
 *  ## Et pourquoi l'export ne redécide pas
 *
 *  `exporterPages` portait sa **propre** qualification d'orientation, indépendante de celle de la
 *  lecture. Deux décisions prises séparément finissent par diverger, et le défaut ne se verrait
 *  que sur la page où elles se contredisent — c'est-à-dire là où personne ne regarde. */

const temporaires: string[] = [];

/** Une page deux fois plus large que haute, avec une colonne sombre à une abscisse connue :
 *  tournée d'un quart de tour, elle devient plus haute que large. */
const PAGE = { largeur: 12, hauteur: 8, colonneSombre: 6 };

beforeEach(() => {
  doubles.rotationDePageFiable.mockReturnValue(undefined);
  doubles.ouvrirRenduPdf.mockResolvedValue({
    nombreDePages: 2,
    page: vi.fn(async () => {
      const data = new Uint8ClampedArray(PAGE.largeur * PAGE.hauteur * 4).fill(255);
      for (let y = 0; y < PAGE.hauteur; y += 1) {
        const place = (y * PAGE.largeur + PAGE.colonneSombre) * 4;
        data.fill(0, place, place + 3);
      }
      return { data, width: PAGE.largeur, height: PAGE.hauteur, colorSpace: "srgb" };
    }),
    fermer: vi.fn(async () => undefined),
  });
});

afterEach(() => {
  for (const dossier of temporaires.splice(0)) rmSync(dossier, { recursive: true, force: true });
});

const unDocument = (): string => {
  const dossier = mkdtempSync(join(tmpdir(), "lienotheque-affichage-"));
  temporaires.push(dossier);
  const document = join(dossier, "document.pdf");
  writeFileSync(document, "un document dont les pages se rendent");
  return document;
};

describe("l'image affichée suit la rotation décidée par la lecture (OUT-03)", () => {
  it("exporte la page tournée d'un quart de tour quand la lecture l'a redressée", async () => {
    const document = unDocument();
    const exporte = await exporterPages(document, join(document, ".."), {
      vignettes: false,
      rotations: new Map([[1, 90]]),
    });
    const premiere = exporte.pages.find((page) => page.index === 0);
    const seconde = exporte.pages.find((page) => page.index === 1);
    expect(premiere?.hauteur, "la page redressée est devenue plus haute que large").toBeGreaterThan(
      premiere?.largeur ?? 0,
    );
    expect(seconde?.largeur, "et la page qui n'était pas redressée garde son format").toBeGreaterThan(
      seconde?.hauteur ?? 0,
    );
  });

  it("laisse les pages dans leur sens quand la lecture n'a rien redressé", async () => {
    const document = unDocument();
    const exporte = await exporterPages(document, join(document, ".."), {
      vignettes: false,
      rotations: new Map(),
    });
    for (const page of exporte.pages)
      expect(page.largeur, `page ${page.index}`).toBeGreaterThan(page.hauteur);
  });

  it("ne redécide pas l'orientation quand la lecture l'a déjà décidée", async () => {
    // La qualification bornée de l'export existait avant, et elle décidait seule. Si elle
    // tournait encore une page déjà redressée, la page partirait de travers **deux fois**.
    doubles.rotationDePageFiable.mockReturnValue(90);
    const document = unDocument();
    const exporte = await exporterPages(document, join(document, ".."), {
      vignettes: false,
      redresser: true,
      rotations: new Map([[1, 90]]),
    });
    const premiere = exporte.pages.find((page) => page.index === 0);
    expect(premiere?.hauteur).toBeGreaterThan(premiere?.largeur ?? 0);
    expect(
      doubles.rotationDePageFiable,
      "la page dont la lecture a décidé ne repasse pas par la qualification de l'export",
    ).toHaveBeenCalledTimes(1);
  });
});
