// @vitest-environment node
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nouveauMemoDeReconnaissance, ocrEnLot } from "../src/index.js";
import type { ImageGrise } from "@lienotheque/images";

/** Une image identique ne part qu'une fois par lot (lot 14 bis, OUT-05).
 *
 *  ## Pourquoi ce contrôle existe
 *
 *  Le mémo de reconnaissance évite de relire ce qui l'a déjà été — mais il n'est **écrit qu'après
 *  l'appel**. À l'intérieur d'un même lot il ne voit donc rien, et deux seuils voisins qui rendent
 *  exactement les mêmes pixels enverraient deux fois la même image. L'économie du regroupement
 *  serait alors payée deux fois.
 *
 *  Ce qu'on éprouve est le **compte d'images envoyées à l'outil**, pas la reconnaissance : le faux
 *  binaire note la taille de chaque liste qu'il reçoit. */

let bac: string;
let compteur: string;
let journalDesLots: string;

const ENTETE = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";

beforeAll(() => {
  bac = mkdtempSync(join(tmpdir(), "lienotheque-lot-lecteur-"));
  journalDesLots = join(bac, "lots.txt");
  compteur = join(bac, "compteur");
  writeFileSync(
    compteur,
    `#!/bin/sh
case "$1" in
  *.txt) n=$(wc -l < "$1" | tr -d ' ') ;;
  *) n=1 ;;
esac
printf '%s\\n' "$n" >> ${JSON.stringify(journalDesLots)}
printf '%s\\n' "${ENTETE}"
i=1
while [ "$i" -le "$n" ]; do
  printf '1\\t%s\\t0\\t0\\t0\\t0\\t0\\t0\\t40\\t30\\t-1\\t\\n' "$i"
  printf '5\\t%s\\t1\\t1\\t1\\t1\\t2\\t2\\t20\\t20\\t90\\t%s\\n' "$i" "$i"
  i=$((i + 1))
done
`,
  );
  chmodSync(compteur, 0o755);
});
afterAll(() => rmSync(bac, { recursive: true, force: true }));

const imagesEnvoyees = (): number[] =>
  existsSync(journalDesLots)
    ? readFileSync(journalDesLots, "utf8")
        .split("\n")
        .filter((ligne) => ligne.trim() !== "")
        .map(Number)
    : [];

/** Un carré gris uni : deux copies de la même image ont les mêmes pixels, donc la même clé. */
const carre = (ton: number): ImageGrise => ({
  pixels: new Uint8Array(40 * 30).fill(ton),
  largeur: 40,
  hauteur: 30,
});

describe("une image identique ne part qu'une fois par lot (lot 14 bis)", () => {
  it("n'envoie qu'une image quand le lot en porte quatre fois la même", () => {
    rmSync(journalDesLots, { force: true });
    const image = carre(128);
    const lus = ocrEnLot(
      [
        { image, segmentation: 7 },
        { image: carre(128), segmentation: 7 },
        { image: carre(128), segmentation: 7 },
        { image, segmentation: 7 },
      ],
      { binaire: compteur, dossier: bac },
    );
    expect(imagesEnvoyees(), "une seule image envoyée, pour quatre demandes").toEqual([1]);
    // Et les quatre demandes reçoivent la même lecture : un dédoublonnage qui perdrait des
    // résultats serait pire que le doublon qu'il évite.
    expect(lus).toHaveLength(4);
    const textes = lus.map((mots) => mots.map((mot) => mot.texte).join(""));
    expect(textes).toEqual([textes[0], textes[0], textes[0], textes[0]]);
    expect(textes[0], "et ce n'est pas la lecture vide").not.toBe("");
  });

  it("garde deux images distinctes, et deux segmentations de la même, comme deux lectures", () => {
    rmSync(journalDesLots, { force: true });
    const image = carre(90);
    ocrEnLot(
      [
        { image, segmentation: 7 },
        { image, segmentation: 8 },
        { image: carre(200), segmentation: 7 },
      ],
      { binaire: compteur, dossier: bac },
    );
    // Un appel par segmentation : deux images pour la 7, une pour la 8.
    expect(imagesEnvoyees().sort(), "deux lots, et aucune lecture perdue").toEqual([1, 2]);
  });

  it("ne demande rien à l'outil quand le mémo porte déjà tout", () => {
    const memo = nouveauMemoDeReconnaissance();
    const image = carre(70);
    const demandes = [{ image, segmentation: 7 }];
    ocrEnLot(demandes, { binaire: compteur, dossier: bac, memoDeReconnaissance: memo });
    rmSync(journalDesLots, { force: true });
    const encore = ocrEnLot(demandes, { binaire: compteur, dossier: bac, memoDeReconnaissance: memo });
    expect(imagesEnvoyees(), "rien n'est reparti vers l'outil").toEqual([]);
    expect(encore[0]?.length, "et la lecture est bien rendue de mémoire").toBeGreaterThan(0);
    expect(memo.servies).toBe(1);
  });
});
