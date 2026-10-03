// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { objetsPdf, pagesPdf, rasterBilevel, type RasterBilevel } from "@lienotheque/formats";
import { encoderGroupe4 } from "../src/index.js";
import { tiffGroupe4 } from "./tiff.js";

/** Fixture sous droits : présente sur la machine de développement, absente partout ailleurs. */
const F2 = join(import.meta.dirname, "../../../fixtures/fichiers/F2/Realbook Bass F.pdf");

let dossier: string;
beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), "lienotheque-f2-"));
});
afterAll(() => rmSync(dossier, { recursive: true, force: true }));

function pillow(): boolean {
  try {
    execFileSync("python3", ["-c", "from PIL import Image, features; assert features.check('libtiff')"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const siF2 = existsSync(F2) && pillow() ? it : it.skip;

/** Ce que libtiff produit sur les mêmes pixels : notre juge de taille comme de fidélité. */
function libtiff(raster: RasterBilevel): { octets: number; pixelsIdentiques: boolean } {
  const chemin = join(dossier, "source.bin");
  writeFileSync(chemin, raster.donnees);
  const notre = join(dossier, "notre.tiff");
  writeFileSync(notre, tiffGroupe4(encoderGroupe4(raster.donnees, raster.largeur, raster.hauteur), raster.largeur, raster.hauteur));

  const sortie = execFileSync(
    "python3",
    [
      "-c",
      [
        "import io, sys",
        "from PIL import Image",
        "l, h = int(sys.argv[3]), int(sys.argv[4])",
        "brut = open(sys.argv[1], 'rb').read()",
        // Notre convention : bit levé = encre. PIL « 1 » : bit levé = blanc.
        "source = Image.frombytes('1', (l, h), bytes(255 - o for o in brut))",
        "tampon = io.BytesIO(); source.save(tampon, format='TIFF', compression='group4')",
        "relu = Image.open(sys.argv[2]).convert('1')",
        "print(tampon.tell())",
        "print(1 if relu.tobytes() == source.tobytes() else 0)",
      ].join("\n"),
      chemin,
      notre,
      String(raster.largeur),
      String(raster.hauteur),
    ],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  ).split("\n");

  return { octets: Number(sortie[0]), pixelsIdentiques: sortie[1] === "1" };
}

describe("groupe 4 sur les pages réelles de F2 (OPT-01, OPT-04)", () => {
  siF2(
    "rend les mêmes pixels que la source et tient la taille de libtiff",
    async () => {
      const objets = objetsPdf(await readFile(F2));
      const pages = pagesPdf(objets);

      const rasters = pages
        .map((page) => rasterBilevel(objets, page))
        .filter((raster): raster is RasterBilevel => raster !== undefined && raster.bandes >= 4)
        .slice(0, 5);
      expect(rasters.length, "F2 doit fournir des pages bilevel").toBe(5);

      let origine = 0;
      let notre = 0;
      let leur = 0;

      for (const raster of rasters) {
        expect(raster.largeur, "la largeur d'origine est conservée (OPT-04)").toBe(2465);
        expect(raster.donnees.length).toBe(Math.ceil(raster.largeur / 8) * raster.hauteur);

        const encode = encoderGroupe4(raster.donnees, raster.largeur, raster.hauteur);
        const juge = libtiff(raster);

        expect(juge.pixelsIdentiques, "l'aller-retour ne perd pas un pixel").toBe(true);
        origine += raster.octetsOrigine;
        notre += encode.length;
        leur += juge.octets;
      }

      // Notre encodeur n'a pas à égaler libtiff au bit près : il doit être du même ordre.
      console.log(`[F2] origine ${origine} o | notre groupe 4 ${notre} o | libtiff ${leur} o`);
      expect(notre / leur, "à moins de 5 % de libtiff").toBeLessThan(1.05);
      expect(notre, "le groupe 4 allège franchement l'original").toBeLessThan(origine / 2);
    },
    600_000,
  );
});
