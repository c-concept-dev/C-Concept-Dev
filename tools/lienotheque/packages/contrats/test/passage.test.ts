import { describe, expect, it } from "vitest";
import { Passage, PassagesDuDocument, texteCherchable } from "../src/index.js";

/** Le passage : un morceau de texte, sur sa vraie page (RCH-07, RCH-09, ANC-01).
 *
 *  Écrit avant le code qui le produit (CLAUDE.md, règle 2). Ce que le contrat refuse ici est
 *  exactement ce qui, laissé passer, rendrait une citation invérifiable : un passage sans page,
 *  un texte vide qui occupe un rang, ou une provenance taise.
 */

const PASSAGE = { rang: 0, page: 1, texte: "Le texte de la première page.", source: "couche_texte" as const };

describe("un passage dit son texte, sa page et d'où il vient (RCH-07)", () => {
  it("accepte le cas nominal", () => {
    expect(Passage.parse(PASSAGE)).toEqual({
      ...PASSAGE,
      confiance: undefined,
      emplacement: undefined,
      lisible: true,
    });
  });

  it("peut dire d'où il vient dans le document, quand le format le nomme (étape 7)", () => {
    // Un EPUB n'a pas de pages : son rang est un feuillet, et « feuillet 162 » ne situe rien
    // pour un lecteur. Le chapitre, lui, le situe — sans jamais servir à citer, puisque deux
    // livres ne découpent pas leurs chapitres de la même façon.
    const situe = Passage.parse({ ...PASSAGE, emplacement: "Text/ch07.xhtml" });
    expect(situe.emplacement).toBe("Text/ch07.xhtml");
  });

  it("n'a pas à en dire : un format qui ne nomme rien ne doit rien inventer", () => {
    // Une page de PDF n'a pas d'emplacement à déclarer au-delà de son numéro. Le champ reste
    // absent plutôt que de porter une valeur de remplissage.
    expect(Passage.parse(PASSAGE).emplacement).toBeUndefined();
  });

  it("refuse un emplacement vide, qui dirait « je sais » sans rien savoir", () => {
    expect(() => Passage.parse({ ...PASSAGE, emplacement: "" })).toThrow();
    expect(() => Passage.parse({ ...PASSAGE, emplacement: "   " })).toThrow();
  });

  it("refuse un passage sans page : une citation sans page n'est pas vérifiable (RCH-09)", () => {
    const { page: _page, ...sansPage } = PASSAGE;
    expect(() => Passage.parse(sansPage)).toThrow();
  });

  it("refuse un texte vide : un rang occupé par rien déplace tous les suivants", () => {
    expect(() => Passage.parse({ ...PASSAGE, texte: "" })).toThrow();
    expect(() => Passage.parse({ ...PASSAGE, texte: "   " })).toThrow();
  });

  it("refuse une provenance qu'on n'a pas prévue : « d'où vient ce texte » n'admet pas d'à-peu-près", () => {
    expect(() => Passage.parse({ ...PASSAGE, source: "devine" })).toThrow();
    expect(Passage.parse({ ...PASSAGE, source: "ocr" }).source).toBe("ocr");
  });

  it("refuse un champ de plus : un passage qui porte ce que personne ne lit est une donnée orpheline", () => {
    expect(() => Passage.parse({ ...PASSAGE, resume: "un résumé" })).toThrow();
  });

  it("garde le numéro imprimé quand on le connaît, et s'en passe sinon", () => {
    expect(Passage.parse({ ...PASSAGE, pageImprimee: 17 }).pageImprimee).toBe(17);
    expect(Passage.parse(PASSAGE).pageImprimee).toBeUndefined();
  });

  it("se dit lisible par défaut, et retient qu'il ne l'est pas (FMT-04)", () => {
    // Jamais écarté en silence : un passage illisible entre dans la bibliothèque **marqué**.
    // L'exclure le ferait disparaître sans trace, et personne ne saurait qu'il manque.
    expect(Passage.parse(PASSAGE).lisible).toBe(true);
    expect(Passage.parse({ ...PASSAGE, lisible: false }).lisible).toBe(false);
  });

  it("refuse une confiance hors bornes", () => {
    expect(Passage.parse({ ...PASSAGE, confiance: 0.5 }).confiance).toBe(0.5);
    expect(() => Passage.parse({ ...PASSAGE, confiance: 1.5 })).toThrow();
  });
});

describe("les passages d'un document se suivent sans trou (RCH-07)", () => {
  const deux = [PASSAGE, { rang: 1, page: 2, texte: "Celui de la seconde.", source: "ocr" as const }];

  it("accepte une suite de rangs consécutifs partant de zéro", () => {
    expect(PassagesDuDocument.parse(deux)).toHaveLength(2);
  });

  it("accepte l'absence de passage : un document illisible n'en invente pas", () => {
    expect(PassagesDuDocument.parse([])).toEqual([]);
  });

  it("refuse deux passages au même rang : la table les garde uniques par version", () => {
    expect(() => PassagesDuDocument.parse([PASSAGE, { ...PASSAGE, texte: "Un autre texte." }])).toThrow(/rang/i);
  });

  it("refuse un trou dans les rangs : un rang manquant est un passage perdu en silence", () => {
    expect(() => PassagesDuDocument.parse([PASSAGE, { rang: 2, page: 3, texte: "Le troisième.", source: "ocr" }])).toThrow(/rang/i);
  });

  it("refuse des rangs dans le désordre, parce que le rang **est** l'ordre de lecture", () => {
    expect(() =>
      PassagesDuDocument.parse([
        { rang: 1, page: 2, texte: "Le second.", source: "ocr" },
        { rang: 0, page: 1, texte: "Le premier.", source: "ocr" },
      ]),
    ).toThrow(/rang/i);
  });
});

describe("le texte cherchable (RCH-07, RCH-11)", () => {
  it("rend le texte tel quel : un extrait exact ne se retrouve que s'il a été gardé exact", () => {
    expect(texteCherchable(Passage.parse(PASSAGE))).toBe("Le texte de la première page.");
  });

  it("garde les accents et la casse, que l'index se charge de replier", () => {
    const accentue = Passage.parse({ ...PASSAGE, texte: "Épreuve d’Ancrage : où, déjà ?" });
    expect(texteCherchable(accentue)).toBe("Épreuve d’Ancrage : où, déjà ?");
  });
});
