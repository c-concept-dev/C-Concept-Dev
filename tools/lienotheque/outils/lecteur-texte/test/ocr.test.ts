// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LANGUE_PAR_DEFAUT, analyserTsv, argumentsOcr, langueOcr } from "../src/ocr.js";

/** Ce que la reconnaissance rend, et dans quelle langue elle lit. */

describe("la sortie tabulée de Tesseract se relit sans Tesseract", () => {
  it("demande le TSV par un réglage autonome, sans dépendre du fichier de configuration tsv", () => {
    const arguments_ = argumentsOcr("/tmp/page.pgm", { langue: "fra" });
    expect(arguments_).toContain("tessedit_create_tsv=1");
    expect(arguments_).not.toContain("tsv");
  });

  it("ne garde que les mots qui ont une boîte", () => {
    const tsv =
      "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n" +
      "5\t1\t1\t1\t1\t1\t10\t20\t30\t12\t95\tbonjour\n" +
      "5\t1\t1\t1\t1\t2\t50\t20\t0\t12\t95\tsansLargeur\n";
    const mots = analyserTsv(tsv);
    expect(mots).toHaveLength(1);
    expect(mots[0]?.texte).toBe("bonjour");
  });
});

/** La langue de la reconnaissance vient de la bibliothèque, jamais d'un défaut muet (CLA-01).
 *
 *  ## Le défaut, mesuré le 20 octobre 2026
 *
 *  `lireParOcr` employait `options.langue ?? "eng"`, et **rien dans la chaîne ne passait de
 *  langue** : un corpus français était lu avec le modèle anglais. Mesuré sur six feuilles,
 *  **un accent sur six était perdu** — 284 contre 337 — et rien d'autre ne bougeait. C'est
 *  exactement ce que l'inversion de la couche était censée gagner.
 *
 *  Un défaut à l'anglais dans un outil générique est une **hypothèse de domaine déguisée**, au
 *  même titre que les zones d'élément obligatoires l'étaient le matin même.
 *
 *  ## D'où la langue vient
 *
 *  De la bibliothèque, qui la déclare déjà : `SchemaBibliotheque.langue` est **obligatoire** au
 *  contrat. Aucun contrat n'a donc eu à changer — il n'y avait qu'à la transmettre.
 *
 *  Reste à traduire : une bibliothèque dit « fr », la reconnaissance veut « fra ». La table est
 *  une **donnée**, allongée en ajoutant une ligne et non une branche. */
describe("la langue de la bibliothèque devient celle de la reconnaissance", () => {
  it("traduit les codes à deux lettres que les bibliothèques emploient", () => {
    expect(langueOcr("fr")).toBe("fra");
    expect(langueOcr("en")).toBe("eng");
    expect(langueOcr("es")).toBe("spa");
  });

  it("laisse passer un code déjà à trois lettres", () => {
    expect(langueOcr("fra")).toBe("fra");
    expect(langueOcr("deu")).toBe("deu");
  });

  it("ne se laisse pas arrêter par la casse ni par une variante régionale", () => {
    expect(langueOcr("FR")).toBe("fra");
    expect(langueOcr("fr-CA")).toBe("fra");
    expect(langueOcr("fr_FR")).toBe("fra");
  });

  it("ne devine pas une langue qu'elle ne connaît pas", () => {
    // Rendre « eng » ici serait refaire le défaut : une langue inconnue doit se dire, pour que
    // l'appelant décide et l'annonce, jamais se remplacer en silence.
    expect(langueOcr("xx")).toBeUndefined();
    expect(langueOcr("")).toBeUndefined();
  });

  it("nomme son défaut au lieu de le cacher", () => {
    // La constante existe parce que `tesseract` lui-même part sur l'anglais : la nommer permet
    // d'en parler, et au chemin du texte de ne jamais s'y fier.
    expect(LANGUE_PAR_DEFAUT).toBe("eng");
  });
});
