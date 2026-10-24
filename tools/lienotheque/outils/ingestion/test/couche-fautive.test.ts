// @vitest-environment node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lireCoucheTexte, tesseractDisponible } from "@lienotheque/lecteur-texte";
import { lireLeTexte } from "../src/index.js";

/** Une image qui dit vrai, une couche qui dit faux, sur la même page (BAS-02).
 *
 *  ## Le trou que ces épreuves ferment
 *
 *  L'inversion de l'arbitrage a été écrite le 20 octobre 2026 sur une mesure : cinquante pages
 *  du corpus relues à l'œil donnent tort à la couche trois fois sur quatre. Elle était éprouvée
 *  par onze tests unitaires — et son **branchement** ne l'était pas, parce qu'aucune fixture du
 *  dépôt ne portait à la fois une couche texte et une image de page. `500-pages.pdf` n'a pas
 *  d'image, `500-pages-scan.pdf` et F3 n'ont pas de couche, F4 n'a pas de couche non plus.
 *
 *  `couche-fautive.pdf` pose enfin le cas : chaque page porte l'image du texte **avec** ses
 *  accents, et par-dessus, invisible, la même phrase **sans** aucun accent — le défaut dominant
 *  mesuré sur le corpus réel.
 *
 *  ## Pourquoi elle discrimine vraiment
 *
 *  Mesuré sur la fixture : la couche rend **63 mots** et la reconnaissance **62**, toutes deux
 *  parfaitement lisibles (45 % de mots outils). L'ancienne règle gardait donc la couche — elle
 *  était la plus fournie, et le départage se faisait à la quantité. La nouvelle prend la
 *  reconnaissance. Un écart d'un seul mot : c'est exactement ce qu'il fallait pour que la
 *  fixture ne prouve rien d'autre que le renversement lui-même.
 */

const RACINE = join(import.meta.dirname, "../../..");
const FAUTIVE = join(RACINE, "fixtures/fichiers/couche-fautive.pdf");
const siFautive = existsSync(FAUTIVE) && tesseractDisponible() ? it : it.skip;

/** Les lettres accentuées d'un texte, dans l'ordre : c'est par elles que la fixture se juge. */
const accents = (texte: string): string => (texte.match(/[éèêàâôûùïî]/g) ?? []).join("");

describe("la fixture pose bien le problème", () => {
  siFautive(
    "sa couche est lisible et pourtant privée de tous ses accents",
    async () => {
      // Sans cette épreuve, une fixture qui aurait cessé de poser le problème — un générateur
      // modifié, un accent qui repasse — laisserait les suivantes vertes sans rien prouver.
      const couche = await lireCoucheTexte(FAUTIVE);
      const texte = (couche.pages[0]?.mots ?? []).map((mot) => mot.texte).join(" ");
      expect(texte, "la couche doit être fournie, sinon rien ne la départage").not.toHaveLength(0);
      expect(accents(texte), "une couche fautive qui garde ses accents ne pose plus le problème").toBe("");
      expect(texte).toContain("present");
      expect(texte).toContain("eprouvee");
    },
    120_000,
  );
});

describe("sur une page photographiée, c'est la reconnaissance qui est retenue", () => {
  siFautive(
    "aucune page n'est servie par la couche, bien qu'elle soit lisible et plus fournie",
    async () => {
      const lu = await lireLeTexte(FAUTIVE, { pages: 3, langue: "fra" });
      expect(lu.parOcr, "l'inversion ne mord pas : la couche sert encore des pages").toBe(3);
      expect(lu.parLaCouche).toBe(0);
      expect(lu.sansTexte).toBe(0);
      expect(lu.pages.every((page) => page.source === "ocr")).toBe(true);
    },
    600_000,
  );

  siFautive(
    "et le texte retenu porte les accents, donc il vient bien de l'image",
    async () => {
      // L'assertion qui compte. Compter les pages dit quelle **étiquette** a gagné ; seuls les
      // accents disent que le **contenu** s'est amélioré. Une inversion qui changerait la
      // provenance sans changer le texte n'aurait servi à rien.
      const lu = await lireLeTexte(FAUTIVE, { pages: 2, langue: "fra" });
      for (const page of lu.pages) {
        expect(accents(page.texte), `page ${page.index} sans un seul accent`).not.toHaveLength(0);
        expect(page.texte).toMatch(/éprouvée|présent|régulièrement/);
      }
    },
    600_000,
  );

  // PAS d'épreuve du numéro imprimé ici, et c'est une mesure, pas un oubli.
  //
  // Le folio de cette fixture n'est **jamais lu** par la reconnaissance : zéro mot purement
  // numérique sur la page, quelle que soit sa distance au bloc de texte — essayé à 244 pixels
  // puis à 70, le résultat ne bouge pas. Tesseract en segmentation « page entière » abandonne
  // un chiffre isolé que rien n'entoure.
  //
  // Le cas n'est pas perdu pour autant : `500-pages-scan.pdf` porte le même folio au bas de
  // pages couvertes de texte, et son épreuve vérifie déjà qu'il se retrouve après l'OCR. Poser
  // ici une seconde épreuve du même chemin, sur une fixture qui ne sait pas le soutenir,
  // n'aurait prouvé qu'une chose : qu'on peut écrire un test rouge.
});
