// @vitest-environment node
import type { PageLue } from "@lienotheque/contrats";
import { describe, expect, it } from "vitest";
import { laLectureRetenue } from "../src/texte.js";

/** D'une page photographiée, c'est la **reconnaissance refaite** qui fait foi (BAS-02).
 *
 *  ## Ce qui a changé le 20 octobre 2026, et sur quelle mesure
 *
 *  La chaîne préférait la couche dès qu'elle « suffisait », et n'essayait l'OCR que si la couche
 *  cédait. Cinquante pages du corpus réel relues à l'œil, en aveugle, ont renversé la règle :
 *  **là où les deux lectures divergent, la couche a tort trois fois sur quatre** — 23 % contre
 *  70 %. Le défaut dominant est nommé : des couches entières ont perdu tous leurs accents,
 *  « mechamment » pour « méchamment », et une recherche en français n'y retrouve plus rien.
 *
 *  L'arbitrage d'avant ne pouvait pas le voir, et c'était structurel : il jugeait sur la part de
 *  mots outils et de mots bien formés. Une couche sans accents garde ses *le*, *la*, *de* et ses
 *  mots bien formés. Elle franchissait les deux seuils, et elle était fausse.
 *
 *  ## Ce que l'inversion ne casse pas, et pourquoi
 *
 *  Elle ne touche **que les pages qui portent une image**. Une page native n'en porte aucune :
 *  il n'y a rien à océriser, rien ne change, et c'est mesuré — l'OCR forcé sur un document natif
 *  rend zéro page lue et cinq sans texte.
 *
 *  Reste le piège trouvé au même moment : des diaporamas et des supports de cours portent une
 *  image par page — un fond, un décor — et leur texte est d'origine. L'OCR y lit le décor et
 *  n'y trouve rien. Préférer aveuglément l'OCR y perdrait tout le texte. D'où la part minimale :
 *  la reconnaissance ne l'emporte que si elle a **vraiment lu**.
 */

const MOTS_FRANÇAIS = "le petit livre de la mémoire que nous avons lu dans la maison et qui raconte une histoire pour les gens de ce temps avec des mots simples".split(" ");
const CHARABIA = "Xï Œè »· é }u} ï · w ë} Â °¤ §µ ‡ï Œ» ·é }u ïw ë Â°¤ §µ ‡ ïŒ »·é }uï wë".split(" ");

/** Une page lue, réduite à ce dont l'arbitrage a besoin : des mots, et d'où ils viennent. */
function page(source: PageLue["source"], mots: readonly string[], combien: number): PageLue {
  return {
    index: 1,
    source,
    unite: "point",
    largeur: 595,
    hauteur: 842,
    mots: Array.from({ length: combien }, (_, rang) => ({
      texte: mots[rang % mots.length]!,
      x: 10,
      y: 10 + rang,
      l: 20,
      h: 10,
    })),
  };
}

const couche = (combien: number, mots = MOTS_FRANÇAIS) => page("couche_texte", mots, combien);
const reconnue = (combien: number, mots = MOTS_FRANÇAIS) => page("ocr", mots, combien);

describe("sur une page photographiée, la reconnaissance refaite l'emporte", () => {
  it("gagne même quand la couche est plus fournie : la quantité n'est plus l'argument", () => {
    // C'est l'inversion elle-même. Avant, soixante mots battaient cinquante-cinq et la couche
    // restait ; l'œil dit que c'est elle qui se trompe trois fois sur quatre.
    const retenue = laLectureRetenue(couche(60), reconnue(55));
    expect(retenue?.source).toBe("ocr");
  });

  it("gagne aussi à égalité de longueur", () => {
    expect(laLectureRetenue(couche(60), reconnue(60))?.source).toBe("ocr");
  });

  it("l'emporte sur une couche illisible, comme elle le faisait déjà", () => {
    // Le cas qui avait motivé l'arbitrage d'origine — un encodage de police faux, abondant.
    // L'inversion ne doit pas le reperdre en chemin.
    expect(laLectureRetenue(couche(300, CHARABIA), reconnue(55))?.source).toBe("ocr");
  });
});

describe("mais jamais contre une image qui ne porte pas le texte", () => {
  it("laisse la couche quand la reconnaissance n'a rien lu", () => {
    // Un diaporama : l'image de la page est un fond, et le texte est d'origine. Mesuré sur le
    // corpus — onze documents rendaient zéro mot océrisé pour des centaines en couche.
    expect(laLectureRetenue(couche(60), reconnue(0))?.source).toBe("couche_texte");
  });

  it("laisse la couche quand la reconnaissance n'a attrapé que des miettes", () => {
    // Le décor porte parfois deux ou trois mots — un logo, une mention. Deux ordres de grandeur
    // séparent ce cas d'une vraie page photographiée, et le seuil tombe entre les deux.
    expect(laLectureRetenue(couche(60), reconnue(3))?.source).toBe("couche_texte");
  });

  it("rend bien le texte de la couche, et pas seulement sa provenance", () => {
    const retenue = laLectureRetenue(couche(60), reconnue(2));
    expect(retenue?.mots).toHaveLength(60);
  });
});

describe("ce qui ne change pas", () => {
  it("sans image à lire, la couche reste : une page native n'a rien à océriser", () => {
    expect(laLectureRetenue(couche(60), undefined)?.source).toBe("couche_texte");
  });

  it("une page courte sans image n'est pas perdue pour autant", () => {
    // Une page de titre, une ouverture de chapitre, un poème : sept mots, et parfaitement
    // lisibles. Le seuil dit s'il faut essayer autre chose, jamais si la couche vaut quelque
    // chose.
    const retenue = laLectureRetenue(couche(7), undefined);
    expect(retenue?.mots).toHaveLength(7);
  });

  it("une couche vide ne bat jamais une reconnaissance fournie", () => {
    expect(laLectureRetenue(couche(0), reconnue(55))?.source).toBe("ocr");
  });

  it("deux lectures vides ne rendent rien plutôt qu'une page inventée", () => {
    expect(laLectureRetenue(couche(0), reconnue(0))?.mots).toHaveLength(0);
  });

  it("rien d'un côté comme de l'autre ne rend rien", () => {
    expect(laLectureRetenue(undefined, undefined)).toBeUndefined();
  });
});
