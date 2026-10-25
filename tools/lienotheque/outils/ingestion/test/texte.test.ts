// @vitest-environment node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PassagesDuDocument } from "@lienotheque/contrats";
import { enPassages, tesseractDisponible } from "@lienotheque/lecteur-texte";
import { lireLeTexte, nombreMotsSignificatifs } from "../src/index.js";

it("une référence bibliographique ne masque pas une page image encore riche", () => {
  const couche =
    "Jacob, G., & Arntz, A. (2021). La thérapie des schémas. Principes et outils (traduction J.-M. Fichel). Louvain-la-Neuve : De Boeck supérieur. Catégories de modes : aperçu";
  expect(couche.split(/\s+/).length, "le comptage brut franchit l'ancien seuil").toBeGreaterThanOrEqual(20);
  expect(nombreMotsSignificatifs(couche), "seuls les mots substantiels disent si la page est fournie").toBeLessThan(20);
});

/** Le texte d'un document, d'où qu'il vienne (RCH-07, OUT-05, étape 3).
 *
 *  La décision se prend **page par page** : la couche texte quand elle tient, l'OCR sinon.
 *  Mesuré sur seize documents du corpus, dix sont servis à cent pour cent par leur couche et
 *  trois presque pas — décider par document océriserait des milliers de pages déjà lisibles, ou
 *  en manquerait autant.
 */

const RACINE = join(import.meta.dirname, "../../..");
const NATIF = join(RACINE, "fixtures/fichiers/500-pages.pdf");
const SCAN = join(RACINE, "fixtures/fichiers/500-pages-scan.pdf");

const siNatif = existsSync(NATIF) ? it : it.skip;
const siScan = existsSync(SCAN) && tesseractDisponible() ? it : it.skip;

describe("un document natif se lit par sa couche, sans aucun OCR (OUT-05)", () => {
  siNatif(
    "sert toutes ses pages par la couche et n'océrise rien",
    async () => {
      const lu = await lireLeTexte(NATIF, { pages: 20 });
      expect(lu.parLaCouche).toBe(20);
      expect(lu.parOcr, "une page native océrisée est une page payée mille fois son prix").toBe(0);
      expect(lu.sansTexte).toBe(0);
      expect(lu.pages.map((p) => p.pageImprimee)).toEqual(Array.from({ length: 20 }, (_, n) => n + 1));
      expect(lu.pages.every((p) => p.source === "couche_texte")).toBe(true);
    },
    120_000,
  );

  siNatif(
    "garde une page peu fournie plutôt que de la perdre : le seuil dit s'il faut essayer autre chose, pas si la couche vaut quelque chose",
    async () => {
      // La fixture ne porte que sept mots par page — sous le seuil de vingt. Une première
      // version lisait ce seuil comme un verdict et envoyait la page à l'OCR ; un document
      // natif ne portant aucune image, l'OCR n'avait rien à lire et la page était perdue. Une
      // page de titre, une ouverture de chapitre ou un poème tombaient dans le même trou.
      const lu = await lireLeTexte(NATIF, { pages: 3 });
      expect(lu.sansTexte, "trois pages lisibles déclarées sans texte").toBe(0);
      expect(lu.pages).toHaveLength(3);
      expect(lu.pages.every((p) => p.texte.includes("Lienotheque"))).toBe(true);
    },
    120_000,
  );

  siNatif(
    "dit où il en est, et finit sur le nombre de pages qu'il a vraiment lues (JOB-03)",
    async () => {
      const pas: [number, number][] = [];
      await lireLeTexte(NATIF, { pages: 5, avancement: (faits, total) => pas.push([faits, total]) });
      expect(pas.at(-1)).toEqual([5, 5]);
      expect(pas.map(([faits]) => faits)).toEqual([1, 2, 3, 4, 5]);
    },
    120_000,
  );
});

describe("un document numérisé sans couche passe par l'OCR, page par page (étape 3)", () => {
  siScan(
    "océrise ce que la couche ne sert pas, et rend un texte qui porte son numéro de page",
    async () => {
      const lu = await lireLeTexte(SCAN, { pages: 3 });
      expect(lu.parLaCouche, "cette fixture n'a aucune couche texte").toBe(0);
      expect(lu.parOcr).toBe(3);

      // Le numéro imprimé est au bas de chaque page de la fixture : il doit se retrouver après
      // l'OCR, et valoir le rang de la page. C'est la seule preuve que le texte vient de la
      // bonne page et non du compteur de la boucle.
      expect(lu.pages.map((p) => p.pageImprimee)).toEqual([1, 2, 3]);
      expect(lu.pages.every((p) => p.source === "ocr")).toBe(true);
      // Et il y a du texte, pas seulement le folio.
      expect(lu.pages.every((p) => p.texte.split(/\s+/).length > 50)).toBe(true);
    },
    600_000,
  );

  siScan(
    "ses pages deviennent des passages que le contrat accepte",
    async () => {
      const lu = await lireLeTexte(SCAN, { pages: 2 });
      const passages = enPassages(lu.pages);
      expect(() => PassagesDuDocument.parse(passages)).not.toThrow();
      expect(passages.map((p) => p.rang)).toEqual([0, 1]);
      expect(passages.map((p) => p.pageImprimee)).toEqual([1, 2]);
    },
    600_000,
  );
});

describe("de deux lectures, laquelle gagne (étape 3)", () => {
  siScan(
    "une couche vide ne bat jamais un OCR fourni",
    async () => {
      // Le piège exact, attrapé par cette fixture : `lisible` répond « oui » pour une page trop
      // courte à juger — ce qu'il faut pour une page de titre. Une couche **vide** passait donc
      // pour lisible, et l'emportait sur un OCR de huit cents mots. Zéro passage au bout.
      const lu = await lireLeTexte(SCAN, { pages: 2 });
      expect(lu.pages, "une couche vide a gagné contre l'OCR").toHaveLength(2);
      expect(lu.pages.every((p) => p.source === "ocr")).toBe(true);
      expect(lu.pages.every((p) => p.texte.split(/\s+/).length > 50)).toBe(true);
      expect(lu.sansTexte).toBe(0);
    },
    600_000,
  );
});

describe("une feuille qui porte deux pages rend deux pages de texte (OUT-03)", () => {
  siNatif(
    "double le nombre de pages et ramène chaque moitié à son origine",
    async () => {
      const simple = await lireLeTexte(NATIF, { pages: 4 });
      const double = await lireLeTexte(NATIF, { pages: 4, doublePage: true });
      expect(simple.pages).toHaveLength(4);
      expect(double.pages, "quatre feuilles portent huit pages").toHaveLength(8);
      expect(double.pages.map((p) => p.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

      // Le texte de la fixture enjambe le milieu : « Lienotheque — page 1 » tient à gauche,
      // « sur 500 » passe à droite. C'est ce qui prouve que la coupe répartit les mots selon
      // leur position et non selon un compte.
      expect(double.pages[0]?.texte).toContain("Lienotheque");
      expect(double.pages[0]?.texte).not.toContain("500");
      expect(double.pages[1]?.texte).toContain("500");
      expect(double.pages[1]?.texte).not.toContain("Lienotheque");

      // Et le folio, au bas de la moitié gauche, n'est lu que par elle.
      expect(double.pages[0]?.pageImprimee).toBe(1);
      expect(double.pages[1]?.pageImprimee).toBeUndefined();

      const passages = enPassages(double.pages);
      expect(() => PassagesDuDocument.parse(passages)).not.toThrow();
      expect(passages.map((p) => p.rang)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    },
    120_000,
  );
});

describe("ce que la lecture refuse de deviner", () => {
  siNatif(
    "compte à part les pages dont rien n'a été tiré, au lieu de les taire",
    async () => {
      // On océrise de force un document natif : ses pages ne portent aucune image, l'OCR n'a
      // donc rien à lire, et le compte doit le dire plutôt que de rendre huit pages vides.
      const lu = await lireLeTexte(NATIF, { pages: 3, forcerOcr: true });
      expect(lu.parLaCouche).toBe(0);
      expect(lu.parOcr).toBe(0);
      expect(lu.sansTexte).toBe(3);
      expect(lu.pages).toHaveLength(0);
    },
    120_000,
  );
});
