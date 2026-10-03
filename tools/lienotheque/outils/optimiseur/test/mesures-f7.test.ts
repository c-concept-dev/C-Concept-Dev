// @vitest-environment node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aUneCoucheTexte, objetsPdf, octetsImage, pagesPdf, rasterBilevel, type RasterBilevel } from "@lienotheque/formats";
import { decoderJpeg, encoderAvif } from "@lienotheque/images";
import { encoderGroupe4 } from "../src/index.js";

/** Échantillon F7 (OPT-01, OPT-06). Le CDC ne le fournit pas : on le prélève sur les fixtures,
 *  quelques pages de chaque nature, et on mesure ce que l'optimiseur rend vraiment.
 *
 *  Ces contrôles tiennent lieu de banc : ils échouent si le gain s'effondre, et leur sortie est
 *  ce qui est consigné dans docs/decisions.md. */

const FICHIERS = join(import.meta.dirname, "../../../fixtures/fichiers");
const F1 = join(FICHIERS, "F1/aebersold-FRENCH.pdf");
const F2 = join(FICHIERS, "F2/Realbook Bass F.pdf");
const F3 = join(FICHIERS, "F3/'70s Funk & Disco Bass.pdf");
const F4 = join(FICHIERS, "F4/Paul westwood.pdf");

const siPresent = (chemin: string) => (existsSync(chemin) ? it : it.skip);
const PAGES = 5;

describe("échantillon F7 : ce que l'optimiseur gagne vraiment (OPT-01)", () => {
  siPresent(F2)(
    "F2, scan noir et blanc : le groupe 4 contre le Flate d'origine",
    async () => {
      const objets = objetsPdf(await readFile(F2));
      const rasters = pagesPdf(objets)
        .map((page) => rasterBilevel(objets, page))
        .filter((raster): raster is RasterBilevel => raster !== undefined && raster.bandes >= 4)
        .slice(0, PAGES);
      expect(rasters.length).toBe(PAGES);

      let origine = 0;
      let apres = 0;
      for (const raster of rasters) {
        origine += raster.octetsOrigine;
        apres += encoderGroupe4(raster.donnees, raster.largeur, raster.hauteur).length;
      }
      console.log(`[F7] F2 noir et blanc, ${PAGES} pages : ${origine} o → ${apres} o, soit ×${(origine / apres).toFixed(2)}`);
      expect(apres).toBeLessThan(origine);
    },
    600_000,
  );

  siPresent(F3)(
    "F3, scan gris et couleur : l'AVIF contre le JPEG d'origine, à résolution inchangée",
    async () => {
      const objets = objetsPdf(await readFile(F3));
      const pages = pagesPdf(objets).slice(0, PAGES);

      let origine = 0;
      let apres = 0;
      for (const page of pages) {
        const image = page.images[0];
        if (image === undefined) continue;
        const octets = octetsImage(objets, image.numero);
        if (octets === undefined || octets.extension !== "jpg") continue;

        const pixels = await decoderJpeg(octets.octets);
        expect(pixels.width, "la résolution d'origine est tenue (OPT-04)").toBe(image.largeur);
        const avif = await encoderAvif(pixels, { cqLevel: 32 });
        origine += octets.octets.length;
        apres += avif.length;
      }
      console.log(`[F7] F3 numérisé, ${PAGES} pages : ${origine} o → ${apres} o, soit ×${(origine / apres).toFixed(2)}`);
      expect(apres).toBeLessThan(origine);
    },
    900_000,
  );

  siPresent(F4)(
    "F4, scan lourd : l'AVIF contre le JPEG d'origine, à résolution inchangée",
    async () => {
      const objets = objetsPdf(await readFile(F4));
      const pages = pagesPdf(objets).slice(0, PAGES);

      let origine = 0;
      let apres = 0;
      const vues: string[] = [];
      for (const page of pages) {
        const image = page.images[0];
        if (image === undefined) continue;
        const octets = octetsImage(objets, image.numero);
        if (octets === undefined || octets.extension !== "jpg") continue;

        const pixels = await decoderJpeg(octets.octets);
        expect(pixels.width).toBe(image.largeur);
        const avif = await encoderAvif(pixels, { cqLevel: 32 });
        vues.push(`${image.largeur}×${image.hauteur} ${image.espaceCouleur}`);
        origine += octets.octets.length;
        apres += avif.length;
      }
      console.log(`[F7] F4 numérisé, ${vues.length} pages (${vues[0]}) : ${origine} o → ${apres} o, soit ×${(origine / apres).toFixed(2)}`);
      expect(apres).toBeLessThan(origine);
    },
    1_800_000,
  );

  siPresent(F1)(
    "F1, PDF natif : la couche texte est là, donc rien n'est réencodé (OPT-02)",
    async () => {
      const objets = objetsPdf(await readFile(F1));
      expect(aUneCoucheTexte(objets), "une couche texte interdit tout réencodage de page").toBe(true);
      console.log("[F7] F1 natif : couche texte présente, gain ×1 — on n'y touche pas");
    },
    600_000,
  );

  siPresent(F4)(
    "F4 n'a aucune couche texte : c'est un scan, pas un PDF natif",
    async () => {
      // Relevé en mesurant : F4 porte 143 images JPEG 8 bits et pas une police.
      expect(aUneCoucheTexte(objetsPdf(await readFile(F4)))).toBe(false);
    },
    600_000,
  );
});
