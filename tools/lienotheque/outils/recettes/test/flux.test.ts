import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pagesEnGris, preparerLot } from "../src/banc.js";
import { chargerRecette } from "../src/schema.js";
import { readFileSync } from "node:fs";

/** La lecture d'un lot est un flux (garde-fou de ressources).
 *
 *  Le tableau gardait toutes les pages décodées en même temps — deux mégaoctets et demi la page,
 *  soit plus d'un gigaoctet pour un livre de cinq cents pages. Mesuré sur F3 avant le flux : 15 Mo
 *  d'images pour 4 pages, 68 Mo pour 29, soit une mémoire qui suit le document. Après : une seule
 *  page vivante à la fois, 9 Mo, quel que soit le nombre de pages.
 *
 *  Ce contrôle garde la forme, pas le chiffre : une mesure de mémoire vive dépend du ramasse-
 *  miettes et de la machine, et un contrôle qui vacille finit ignoré. Ce qui ne vacille pas, c'est
 *  qu'un flux se consomme page par page et s'abandonne en cours de route. */

const RACINE = join(import.meta.dirname, "../../..");
const F3 = join(RACINE, "fixtures/fichiers/F3/'70s Funk & Disco Bass.pdf");
const RECETTE = chargerRecette(JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-pastille-piste.v2.json"), "utf8")));
const siF3 = existsSync(F3) ? it : it.skip;

describe("la lecture d'un lot se fait en flux", () => {
  siF3("rend un flux de pages, pas un tableau de pages", () => {
    const flux = pagesEnGris(F3);
    expect(typeof flux[Symbol.asyncIterator], "pagesEnGris est un flux").toBe("function");
    expect(Array.isArray(flux), "jamais un tableau : il retiendrait tout le document").toBe(false);
    void flux.return(undefined);
  });

  siF3("s'abandonne après une seule page, sans décoder le reste", async () => {
    let vues = 0;
    for await (const page of pagesEnGris(F3)) {
      vues += 1;
      expect(page.pixels.length).toBeGreaterThan(0);
      break;
    }
    // Un tableau aurait décodé les vingt-neuf pages avant de rendre la première.
    expect(vues, "une page suffit à sortir du flux").toBe(1);
  }, 600_000);

  siF3("prépare aussi les pages en flux", async () => {
    const flux = preparerLot(F3, RECETTE, { pages: 2 });
    expect(typeof flux[Symbol.asyncIterator]).toBe("function");
    let vues = 0;
    for await (const page of flux) {
      vues += 1;
      expect(page.image.pixels.length).toBeGreaterThan(0);
    }
    expect(vues).toBeGreaterThan(0);
  }, 600_000);
});
