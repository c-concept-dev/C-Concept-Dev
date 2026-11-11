// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  accepteLesMarges,
  dernieresMesures,
  jugerLesMarges,
  ligneDe,
  margeDe,
  nomComplet,
  raconterLesMarges,
  type Mesure,
} from "../src/marges.js";

/** Le garde-fou des marges de délai (dette D7, lot 16 de la file).
 *
 *  Ce qui est éprouvé ici est la logique pure : ce qu'on appelle une marge, laquelle est trop
 *  courte, et ce que le garde-fou refuse. L'instrument qui chronomètre est éprouvé à part, par
 *  l'exécution, dans `mesure-du-corps.test.ts` — c'est la seule façon de l'éprouver. */

const mesure = (nom: string, delai: number, corps: number): Mesure => ({
  paquet: "@lienotheque/epreuve",
  fichier: "test/quelque-chose.test.ts",
  nom,
  delai,
  corps,
});

const SANS_BARRE = { barre: null, proposee: 3 };
const AVEC_BARRE = { barre: 2, proposee: 3 };

describe("ce qu'est une marge", () => {
  it("est le délai divisé par le corps, et non l'inverse", () => {
    // Un corps de 1 000 ms sous un délai de 5 000 peut quintupler sans tomber : ×5.
    expect(margeDe(mesure("un", 5_000, 1_000))).toBe(5);
    // L'inverse donnerait 0,2, et une barre « au-dessus de 2 » laisserait passer tout le dépôt.
    expect(margeDe(mesure("deux", 5_000, 4_900))).toBeCloseTo(1.02, 2);
  });

  it("vaut l'infini pour un corps trop bref pour être chronométré, et non une division par zéro", () => {
    // Des centaines de contrôles de ce dépôt mesurent 0 ms. Rendre NaN ou lever ici ferait taire
    // le garde-fou sur la majorité du passage, ou le ferait tomber à chaque course.
    expect(margeDe(mesure("bref", 5_000, 0))).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(margeDe(mesure("bref", 5_000, 0)))).toBe(false);
  });
});

describe("le jugement d'un passage", () => {
  const passage = [
    mesure("le plus serré", 5_000, 4_800),
    mesure("confortable", 5_000, 100),
    mesure("serré aussi", 180_000, 120_000),
    mesure("instantané", 5_000, 0),
  ];

  it("classe les marges de la plus courte à la plus longue", () => {
    const verdict = jugerLesMarges(passage, SANS_BARRE);
    expect(verdict.lesPlusCourtes.map((m) => m.nom)).toEqual([
      "le plus serré",
      "serré aussi",
      "confortable",
      "instantané",
    ]);
  });

  it("ne retient comme serrées que celles sous la barre, bornes comprises", () => {
    const verdict = jugerLesMarges(passage, AVEC_BARRE);
    // 5 000 / 4 800 = ×1,04 et 180 000 / 120 000 = ×1,5 : tous deux sous ×2.
    expect(verdict.serrees.map((m) => m.nom)).toEqual(["le plus serré", "serré aussi"]);
    // 5 000 / 100 = ×50 : au-dessus, donc hors de la liste.
    expect(verdict.serrees.some((m) => m.nom === "confortable")).toBe(false);
  });

  it("juge contre la barre proposée quand aucune n'est fixée, pour montrer ce qu'elle coûterait", () => {
    const verdict = jugerLesMarges(passage, SANS_BARRE);
    expect(verdict.barre).toBe(3);
    expect(verdict.barreFixee).toBe(false);
    expect(verdict.serrees).toHaveLength(2);
  });

  it("emploie la barre de Christophe dès qu'elle est posée, et non la proposition", () => {
    const verdict = jugerLesMarges(passage, AVEC_BARRE);
    expect(verdict.barre).toBe(2);
    expect(verdict.barreFixee).toBe(true);
  });

  it("ne rapporte que les marges demandées, les plus courtes d'abord", () => {
    const verdict = jugerLesMarges(passage, SANS_BARRE, 2);
    expect(verdict.lesPlusCourtes.map((m) => m.nom)).toEqual(["le plus serré", "serré aussi"]);
  });

  it("compte les corps chronométrés, pour qu'un relevé vide ne passe pas pour un dépôt sain", () => {
    expect(jugerLesMarges(passage, SANS_BARRE).combienMesures).toBe(4);
    expect(jugerLesMarges([], SANS_BARRE).combienMesures).toBe(0);
  });
});

describe("ce que le garde-fou refuse", () => {
  const serre = [mesure("à la limite", 5_000, 4_900)];

  it("refuse un passage dont une marge est sous la barre fixée", () => {
    expect(accepteLesMarges(jugerLesMarges(serre, AVEC_BARRE))).toBe(false);
  });

  it("n'en refuse aucun tant que la barre n'est pas fixée : le chiffre appartient à Christophe", () => {
    // Un seuil inventé ici serait exactement la faute que ce lot combat. Le garde-fou publie, et
    // Christophe décide quand le refus s'allume — une ligne de données, pas une ligne de code.
    expect(accepteLesMarges(jugerLesMarges(serre, SANS_BARRE))).toBe(true);
  });

  it("accepte un passage dont toutes les marges tiennent", () => {
    expect(accepteLesMarges(jugerLesMarges([mesure("au large", 5_000, 100)], AVEC_BARRE))).toBe(true);
  });
});

describe("ce qu'il en dit", () => {
  const serre = [mesure("à la limite", 5_000, 4_900)];

  it("nomme le contrôle, son corps et son délai, pour qu'aucun chiffre ne soit à recalculer", () => {
    const dits = raconterLesMarges(jugerLesMarges(serre, AVEC_BARRE)).join("\n");
    expect(dits).toContain("à la limite");
    expect(dits).toContain("4900 ms de corps");
    expect(dits).toContain("délai de 5000");
  });

  it("dit de raccourcir le corps, et jamais d'allonger le délai", () => {
    const dits = raconterLesMarges(jugerLesMarges(serre, AVEC_BARRE)).join("\n");
    expect(dits).toContain("MARGE TROP COURTE");
    expect(dits).toContain("n'allongez pas le délai");
  });

  it("dit que la barre n'est pas fixée plutôt que de laisser croire à un verdict", () => {
    const dits = raconterLesMarges(jugerLesMarges(serre, SANS_BARRE)).join("\n");
    expect(dits).toContain("barre non fixée");
    expect(dits).toContain("aucun refus");
    // Et aucune ligne de refus : un passage accepté ne doit pas porter le mot d'un refus.
    expect(dits).not.toContain("MARGE TROP COURTE");
  });
});

describe("ce que l'instrument retient d'une tâche", () => {
  const feuille = { name: "le contrôle", timeout: 5_000, file: { name: "test/ici.test.ts" } };

  it("ne retient RIEN d'un contrôle dont le délai n'est pas résolu : on ne lui en suppose pas un", () => {
    // La faute que tout ce lot combat. Un délai supposé a fait publier trois fois des marges
    // fausses, et deux fois annoncer au registre des contrôles « au-dessus de leur délai » qui
    // n'existaient pas. Mieux vaut un contrôle absent du relevé qu'un contrôle mal jugé.
    expect(ligneDe({ ...feuille, timeout: undefined }, 42)).toBeUndefined();
    expect(ligneDe({ ...feuille, timeout: 0 }, 42)).toBeUndefined();
  });

  it("retient le délai tel quel dès qu'il est résolu, et arrondit le corps à la milliseconde", () => {
    expect(ligneDe(feuille, 42.7)).toEqual({
      fichier: "test/ici.test.ts",
      nom: "le contrôle",
      delai: 5_000,
      corps: 43,
    });
  });

  it("nomme le fichier même quand la tâche ne le porte pas, au lieu de rendre une ligne muette", () => {
    expect(ligneDe({ ...feuille, file: undefined }, 1)?.fichier).toBe("(fichier inconnu)");
  });

  it("joint les niveaux de suite par une espace, comme le rapport des épingles", () => {
    const dedans = { name: "le contrôle", type: "test", suite: { name: "dedans", type: "suite" } };
    expect(nomComplet({ ...dedans, suite: { ...dedans.suite, suite: { name: "dehors", type: "suite" } } })).toBe(
      "dehors dedans le contrôle",
    );
  });

  it("s'arrête au fichier, qui n'est pas une suite : son nom est un chemin, pas un titre", () => {
    expect(nomComplet({ name: "seul", type: "test", suite: { name: "test/ici.test.ts", type: "file" } })).toBe("seul");
  });
});

describe("un relevé qui porte deux fois le même contrôle", () => {
  const relevees = [
    mesure("stable", 5_000, 100),
    { ...mesure("corrigé depuis", 5_000, 4_900), fichier: "test/ici.test.ts" },
    { ...mesure("corrigé depuis", 5_000, 200), fichier: "test/ici.test.ts" },
  ];

  it("ne garde que la dernière mesure, et non la plus courte", () => {
    // Mesuré le 10 novembre 2026 : 3 153 corps relevés pour 3 144 contrôles, parce qu'un passage
    // lancé à la main dans un paquet laisse ses lignes derrière lui. La ligne ancienne décrit un
    // code qui n'est plus là ; refuser un passage pour une marge périmée désarmerait le garde-fou.
    expect(dernieresMesures(relevees).map((m) => m.corps)).toEqual([100, 200]);
  });

  it("et le jugement suit : la marge périmée ne refuse rien", () => {
    const verdict = jugerLesMarges(relevees, AVEC_BARRE);
    expect(verdict.serrees).toEqual([]);
    expect(verdict.combienMesures).toBe(3);
  });

  it("distingue deux contrôles de même nom dans deux paquets différents", () => {
    // Le nom seul ne suffit pas : deux paquets peuvent nommer leur contrôle pareil, et n'en
    // garder qu'un ferait disparaître une marge de la table sans rien dire.
    const ailleurs = { ...mesure("même nom", 5_000, 300), paquet: "@lienotheque/ailleurs" };
    expect(dernieresMesures([mesure("même nom", 5_000, 100), ailleurs])).toHaveLength(2);
  });
});

describe("la barre refuse là où la machine est stable, et publie ailleurs (D7)", () => {
  /** Décision de Christophe, 11 novembre 2026.
   *
   *  La barre de ×3 est un garde-fou, pas un tirage au sort. Sur la machine de Christophe elle
   *  juge un code ; sur le coureur GitHub elle jugerait surtout l'humeur du coureur — mesuré le
   *  même jour, le contrôle `voie-oracle · publie l'accord noms-table` y passe de **1 717 à
   *  2 695 ms sur le même code**, un rapport de ×1,6 d'une course à l'autre, et la composition
   *  du bas du tableau change d'une course à l'autre sans qu'une ligne ait bougé.
   *
   *  Là-bas, donc : on publie les marges et on ne refuse rien. Un contrôle qui passe sous ×2 de
   *  façon **répétée** devient un lot pour raccourcir son corps — jamais pour allonger son délai. */
  // Marge de ×1,67 : sous la barre de ×2 de `AVEC_BARRE`, sans ambiguïté.
  const serre = [mesure("un contrôle au corps trop long", 5_000, 3_000)];

  it("refuse une marge trop courte là où la barre refuse", () => {
    const verdict = jugerLesMarges(serre, AVEC_BARRE, 10, true);
    expect(verdict.serrees).toHaveLength(1);
    expect(accepteLesMarges(verdict)).toBe(false);
  });

  it("publie la même marge sans refuser là où la barre ne refuse pas", () => {
    const verdict = jugerLesMarges(serre, AVEC_BARRE, 10, false);
    // La marge est TOUJOURS relevée : ne pas refuser n'est pas ne pas regarder.
    expect(verdict.serrees, "elle reste comptée, et nommable").toHaveLength(1);
    expect(accepteLesMarges(verdict), "mais elle ne refuse pas le passage").toBe(true);
  });

  it("le dit en toutes lettres, pour qu'on ne lise pas un silence comme un succès", () => {
    const dits = raconterLesMarges(jugerLesMarges(serre, AVEC_BARRE, 10, false)).join(" ");
    expect(dits).toMatch(/publi|sans refus/i);
    expect(dits, "et le compte de ce qui serait refusé ailleurs").toMatch(/1 contrôle/);
    expect(dits, "la barre employée est nommée").toMatch(/×2/);
  });

  it("refuse par défaut : une machine qu'on n'a pas nommée est tenue pour stable", () => {
    // Le défaut sûr. Un appelant qui oublie de dire où il tourne obtient le comportement STRICT,
    // jamais le permissif — l'inverse ferait d'un oubli un garde-fou désarmé.
    expect(accepteLesMarges(jugerLesMarges(serre, AVEC_BARRE))).toBe(false);
  });
});

