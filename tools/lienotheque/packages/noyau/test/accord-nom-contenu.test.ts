import { describe, expect, it } from "vitest";
import { accordsNomContenu, apresLAdresse, designationsDesNoms, jetonsDuNom } from "../src/index.js";

/** Le second signal : le nom d'un enregistrement retrouvé imprimé sur une page (REC-02, OUT-10).
 *
 *  Les noms sont ceux qu'un vivier présente vraiment : un rang, un intitulé, parfois un nombre
 *  composé. Ce qui est éprouvé ici est ce que le socle doit refuser autant que ce qu'il doit
 *  reconnaître — un rang ne corrobore rien, et une page de sommaire ne désigne personne. */

const AVEC_DEUX_BLUE = ["01 - Doxy.mp3", "02 - Solitude.mp3", "03 - Blue Seven.mp3", "04 - Blue Monk.mp3"];

describe("ce qu'un jeton désigne (REC-02)", () => {
  it("un mot partagé désigne plusieurs noms, un mot propre n'en désigne qu'un", () => {
    const designations = designationsDesNoms(AVEC_DEUX_BLUE);
    expect(designations.get("blue"), "« blue » est dans deux noms : il désigne les deux").toEqual([2, 3]);
    expect(designations.get("seven")).toEqual([2]);
    expect(designations.get("monk")).toEqual([3]);
    expect(designations.get("blue seven"), "la suite, elle, ne désigne qu'un seul nom").toEqual([2]);
  });

  it("ne garde jamais le rang seul : tout nombre de 1 à N trouve un fichier", () => {
    expect(designationsDesNoms(["01.mp3", "02.mp3", "03.mp3"]).size).toBe(0);
  });

  it("garde un nombre composé, qui ne se confond pas avec un rang", () => {
    const designations = designationsDesNoms(["93 - Lick 6.21.mp3", "94 - Lick 6.22.mp3"]);
    expect(designations.get("6.21")).toEqual([0]);
    expect(designations.has("lick"), "« lick » est dans les deux : il les désigne tous, donc personne").toBe(false);
  });

  it("ignore l'extension et les accents", () => {
    expect(designationsDesNoms(["01 - Près de l'eau.mp3", "02 - Autre.mp3"]).get("pres")).toEqual([0]);
  });

  it("un nom qui n'est qu'une adresse ne dit rien", () => {
    expect(designationsDesNoms(["1-01.mp3", "1-02.mp3"]).size).toBe(0);
  });

  it("une suite de mots est reçue telle quelle, ses mots fussent-ils communs (REC-02)", () => {
    // « Two-Part Invention 4 » ne se distingue par aucun de ses mots, et pourtant la page qui
    // l'imprime ne parle que de lui. C'est la suite entière qui le désigne.
    const jetons = jetonsDuNom("01. Two-part invention 4.mp3");
    expect(jetons, "la suite entière").toContain("two part invention 4");
    expect(jetons, "« invention 4 » n'est pas le nombre quatre").toContain("invention 4");
    expect(jetons, "un mot de trois lettres, seul, tombe par hasard").not.toContain("two");
  });
});

describe("l'accord entre les noms et le contenu d'une page (REC-02)", () => {
  const designations = designationsDesNoms(["01 - Doxy.mp3", "02 - Solitude.mp3", "03 - Blue Seven.mp3"]);

  it("rend l'accord quand un seul nom se retrouve sur la page", () => {
    expect(accordsNomContenu(designations, [{ page: 7, texte: "SOLITUDE\nmedium swing" }])).toEqual([
      { page: 7, rangs: [1], jetons: ["solitude"] },
    ]);
  });

  it("ne désigne personne sur une page qui porte tous les noms", () => {
    expect(
      accordsNomContenu(designations, [{ page: 1, texte: "1. Doxy  2. Solitude  3. Blue Seven" }]),
      "un sommaire porte des ensembles disjoints : il n'en désigne aucun",
    ).toEqual([]);
  });

  it("ne désigne personne sur une page qui n'en porte aucun", () => {
    expect(accordsNomContenu(designations, [{ page: 2, texte: "une page ordinaire" }])).toEqual([]);
  });

  it("ne prend pas un jeton pour un morceau d'un mot plus long", () => {
    expect(accordsNomContenu(designations, [{ page: 3, texte: "solitudes partagées" }])).toEqual([]);
  });

  it("retrouve un nombre composé imprimé tel quel", () => {
    const composes = designationsDesNoms(["93 - Lick 6.21.mp3", "94 - Lick 6.22.mp3"]);
    const accords = accordsNomContenu(composes, [{ page: 12, texte: "Lick 6.21 — tempo libre" }]);
    expect(accords.map((accord) => accord.rangs)).toEqual([[0]]);
    // Trois jetons désignent le même enregistrement sur cette page — le nombre composé, la suite
    // qui le porte, et celle qui le précède. On les garde tous : ce qui se revérifie à l'œil ne
    // se résume pas.
    expect(accords[0]!.jetons).toContain("6.21");
    expect(accords[0]!.jetons).toContain("lick 6 21");
  });

  it("des ensembles emboîtés désignent le plus petit (REC-02)", () => {
    // La page porte « blue », qui désigne deux noms, et « seven », qui n'en désigne qu'un. Le
    // plus petit est inclus dans l'autre : la page parle bien de celui-là.
    const quatre = designationsDesNoms(AVEC_DEUX_BLUE);
    const accords = accordsNomContenu(quatre, [{ page: 5, texte: "Blue Seven — Sonny Rollins" }]);
    expect(accords.map((accord) => accord.rangs)).toEqual([[2]]);
  });

  it("deux fichiers pour un même morceau sont désignés ensemble, et c'est dit (REC-02)", () => {
    // Le cas qui a fait écrire cette règle : une démonstration et un accompagnement portent le
    // même titre. L'ancienne règle les éliminait l'un par l'autre et la page ne servait à rien.
    //
    // Le vivier compte six fichiers pour trois morceaux, comme le recueil d'où vient ce cas :
    // à deux fichiers seulement, un titre partagé désignerait tout le vivier et sortirait — à
    // raison, puisque désigner tout n'est pas désigner.
    const vivier = designationsDesNoms([
      "01) Brick House - Demo.mp3",
      "02) Brick House - Play-Along.mp3",
      "03) Le Freak - Demo.mp3",
      "04) Le Freak - Play-Along.mp3",
      "05) Good Times - Demo.mp3",
      "06) Good Times - Play-Along.mp3",
    ]);
    const accords = accordsNomContenu(vivier, [{ page: 9, texte: "BRICK HOUSE" }]);
    expect(accords.map((accord) => accord.rangs), "la page désigne les deux, sans les départager").toEqual([[0, 1]]);
  });

  it("une désignation large que le document contredit par une plus étroite sort (REC-02)", () => {
    // « play » désigne les deux accompagnements ; « freak » n'en désigne qu'un. La désignation
    // large ne dit rien de plus que l'étroite, et pèserait autant qu'elle.
    const vivier = ["01 - Le Freak Play.mp3", "02 - Good Times Play.mp3"];
    const accords = accordsNomContenu(designationsDesNoms(vivier), [
      { page: 3, texte: "play" },
      { page: 4, texte: "le freak" },
    ]);
    expect(accords.map((accord) => ({ page: accord.page, rangs: accord.rangs }))).toEqual([
      { page: 4, rangs: [0] },
    ]);
  });
});

describe("on ne lit un nom qu'à partir de sa première lettre (REC-02)", () => {
  it("laisse tomber ce qui précède", () => {
    expect(apresLAdresse("1-01 12_8 Shuffle")).toBe("Shuffle");
    expect(apresLAdresse("01 - Doxy")).toBe("Doxy");
    expect(apresLAdresse("1-01")).toBe("");
  });
});
