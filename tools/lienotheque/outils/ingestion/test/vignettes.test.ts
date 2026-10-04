// @vitest-environment node
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PLAFONDS_DERIVE } from "@lienotheque/contrats";
import { construireVue } from "../src/instantane.js";
import { exporterPages } from "../src/pages-images.js";
import { entreeMinimale } from "./aide-instantane.js";

/** Vignettes de page (OUT-04).
 *
 *  Le générateur de dérivés produit la vignette de chaque page pendant que la page est décodée.
 *  Deux choses à garder : qu'elle sorte bien du même passage — sans quoi la mémoire suivrait le
 *  document —, et que son absence ne casse rien, parce qu'un lot sans dérivés doit rester
 *  lisible. */

const RACINE = join(import.meta.dirname, "../../..");
const F3 = join(RACINE, "fixtures/fichiers/F3/'70s Funk & Disco Bass.pdf");
const siF3 = existsSync(F3) ? it : it.skip;

const dossiers: string[] = [];
afterEach(() => {
  for (const dossier of dossiers.splice(0)) rmSync(dossier, { recursive: true, force: true });
});

const dossierNeuf = (): string => {
  const dossier = mkdtempSync(join(tmpdir(), "lienotheque-vignettes-"));
  dossiers.push(dossier);
  return dossier;
};

describe("OUT-04 : chaque page exportée porte sa vignette", () => {
  siF3("écrit une vignette à côté de chaque image de page", async () => {
    const dossier = dossierNeuf();
    const pages = await exporterPages(F3, dossier, { pages: 3 });

    expect(pages.length, "trois pages demandées, trois pages exportées").toBe(3);
    for (const page of pages) {
      expect(page.vignette, `page ${page.index} : vignette produite`).toBeDefined();
      expect(existsSync(join(dossier, page.vignette!)), "le fichier de vignette existe").toBe(true);
    }
  }, 120_000);

  siF3("tient le plafond du dérivé « vignette », et pèse moins que la page", async () => {
    const dossier = dossierNeuf();
    const [page] = await exporterPages(F3, dossier, { pages: 1 });
    expect(page).toBeDefined();

    const vignette = statSync(join(dossier, page!.vignette!)).size;
    const image = statSync(join(dossier, page!.fichier)).size;
    const plafond = PLAFONDS_DERIVE.vignette;

    if (plafond !== undefined) expect(vignette, "sous le plafond du contrat").toBeLessThanOrEqual(plafond);
    expect(vignette, "une vignette pèse moins que la page dont elle vient").toBeLessThan(image);
  }, 120_000);

  siF3("ne produit rien de plus quand on les refuse", async () => {
    const dossier = dossierNeuf();
    const pages = await exporterPages(F3, dossier, { pages: 2, vignettes: false });

    expect(pages.every((page) => page.vignette === undefined), "aucune vignette annoncée").toBe(true);
    expect(
      readdirSync(dossier).filter((nom) => nom.startsWith("vignette-")),
      "aucun fichier de vignette écrit",
    ).toHaveLength(0);
  }, 120_000);
});

describe("OUT-04 : l'instantané porte la vignette jusqu'aux écrans", () => {
  it("recopie l'adresse de la vignette quand le lot en a une", () => {
    const vue = construireVue({
      ...entreeMinimale(),
      imageDePage: () => ({ image: "/donnees/pages/page-0000.webp", largeur: 1240, hauteur: 1754, vignette: "/donnees/pages/vignette-0000.webp" }),
    });
    expect(vue.pages[0]?.vignette).toBe("/donnees/pages/vignette-0000.webp");
  });

  it("laisse la vignette absente quand le lot n'en a pas — un écran doit savoir s'en passer", () => {
    const vue = construireVue({
      ...entreeMinimale(),
      imageDePage: () => ({ image: "/donnees/pages/page-0000.webp", largeur: 1240, hauteur: 1754 }),
    });
    expect(vue.pages[0]?.image, "la page garde son image").toBeDefined();
    expect(vue.pages[0]?.vignette, "et n'invente pas de vignette").toBeUndefined();
  });
});
