import { describe, expect, it } from "vitest";
import { accordsNomContenu, apresLAdresse, marquesDesNoms } from "../src/index.js";

/** Le second signal : le nom d'un enregistrement retrouvé imprimé sur une page (REC-02, OUT-10).
 *
 *  Les noms sont ceux qu'un vivier présente vraiment : un rang, un intitulé, parfois un nombre
 *  composé. Ce qui est éprouvé ici est ce que le socle doit refuser autant que ce qu'il doit
 *  reconnaître — un rang ne corrobore rien, et une page de sommaire ne désigne personne. */

describe("ce qu'un nom a de distinctif (REC-02)", () => {
  it("garde l'intitulé et écarte ce que les noms ont en commun", () => {
    const marques = marquesDesNoms([
      "01 - Doxy.mp3",
      "02 - Solitude.mp3",
      "03 - Blue Seven.mp3",
      "04 - Blue Monk.mp3",
    ]);
    expect(marques[0]!.jetons).toEqual(["doxy"]);
    expect(marques[1]!.jetons).toEqual(["solitude"]);
    expect(marques[2]!.jetons, "« blue » est dans deux noms : il ne distingue rien").toEqual(["seven"]);
    expect(marques[3]!.jetons).toEqual(["monk"]);
  });

  it("ne garde jamais le rang seul : tout nombre de 1 à N trouve un fichier", () => {
    const marques = marquesDesNoms(["01.mp3", "02.mp3", "03.mp3"]);
    expect(marques.every((marque) => marque.jetons.length === 0)).toBe(true);
  });

  it("garde un nombre composé, qui ne se confond pas avec un rang", () => {
    const marques = marquesDesNoms(["93 - Lick 6.21.mp3", "94 - Lick 6.22.mp3"]);
    expect(marques[0]!.jetons).toContain("6.21");
    expect(marques[0]!.jetons, "« lick » est dans les deux").not.toContain("lick");
  });

  it("ignore l'extension et les accents", () => {
    const marques = marquesDesNoms(["01 - Près de l'eau.mp3", "02 - Autre.mp3"]);
    expect(marques[0]!.jetons).toContain("pres");
  });
});

describe("l'accord entre un nom et le contenu d'une page (REC-02)", () => {
  const marques = marquesDesNoms(["01 - Doxy.mp3", "02 - Solitude.mp3", "03 - Blue Seven.mp3"]);

  it("rend l'accord quand un seul nom se retrouve sur la page", () => {
    const accords = accordsNomContenu(marques, [{ page: 7, texte: "SOLITUDE\nmedium swing" }]);
    expect(accords).toEqual([{ page: 7, rang: 1, jetons: ["solitude"] }]);
  });

  it("ne désigne personne sur une page qui porte tous les noms", () => {
    expect(
      accordsNomContenu(marques, [{ page: 1, texte: "1. Doxy  2. Solitude  3. Blue Seven" }]),
      "un sommaire les porte tous : il n'en désigne aucun",
    ).toEqual([]);
  });

  it("ne désigne personne sur une page qui n'en porte aucun", () => {
    expect(accordsNomContenu(marques, [{ page: 2, texte: "une page ordinaire" }])).toEqual([]);
  });

  it("ne prend pas un jeton pour un morceau d'un mot plus long", () => {
    expect(accordsNomContenu(marques, [{ page: 3, texte: "solitudes partagées" }])).toEqual([]);
  });

  it("retrouve un nombre composé imprimé tel quel", () => {
    const composes = marquesDesNoms(["93 - Lick 6.21.mp3", "94 - Lick 6.22.mp3"]);
    const accords = accordsNomContenu(composes, [{ page: 12, texte: "Lick 6.21 — tempo libre" }]);
    expect(accords).toEqual([{ page: 12, rang: 0, jetons: ["6.21"] }]);
  });
});

describe("l'adresse d'un nom n'est pas son contenu (REC-02)", () => {
  // Les noms sont ceux de deux lots du corpus, relevés le 30 octobre 2026 : c'est sur eux que le
  // nombre composé s'est révélé n'être qu'un rang écrit en deux groupes.
  it("écarte un rang écrit en deux groupes, support et place (REC-02)", () => {
    const noms = [
      "1-01 12_8 Blues And R&B - 123 Pg.67.mp3",
      "1-02 12_8 Blues And R&B - 126 Pg.67.mp3",
      "2-01 Mali - 718 Pg.197.mp3",
    ];
    // « blues » et « mali » reviennent ou non, mais aucun nom ne doit garder sa propre place.
    for (const marque of marquesDesNoms(noms)) expect(marque.jetons).not.toContain("1.01");
    expect(marquesDesNoms(noms).flatMap((marque) => marque.jetons)).not.toContain("2.01");
  });

  it("garde un nombre composé que le nom porte après sa première lettre (REC-02)", () => {
    const noms = ["02-Chapter 5, Groove #5.1.mp3", "03-Chapter 5, Groove #5.2.mp3"];
    expect(marquesDesNoms(noms)[0]!.jetons).toContain("5.1");
    expect(marquesDesNoms(noms)[1]!.jetons).toContain("5.2");
  });

  it("ne rend rien d'un nom qui n'est qu'une adresse (REC-02)", () => {
    expect(apresLAdresse("1-01")).toBe("");
    expect(marquesDesNoms(["1-01.mp3", "1-02.mp3"]).flatMap((marque) => marque.jetons)).toEqual([]);
  });

  it("laisse intact un intitulé qui commence par une lettre (REC-02)", () => {
    expect(apresLAdresse("Doxy")).toBe("Doxy");
    expect(marquesDesNoms(["01 - Doxy.mp3", "02 - St. Thomas.mp3"])[0]!.jetons).toContain("doxy");
  });
});
