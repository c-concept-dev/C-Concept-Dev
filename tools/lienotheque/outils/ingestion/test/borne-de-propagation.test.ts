// @vitest-environment node
import { describe, expect, it } from "vitest";
import { construireVue } from "../src/index.js";
import { entreeMinimale, ligne } from "./aide-instantane.js";

/** OUT-15 — un élément ne s'étend pas au-delà de la portée que le document montre.
 *
 *  **Tests rouges du 5 novembre 2026. Ils échouent aujourd'hui, et c'est ce qu'on leur demande.**
 *
 *  « Un repère vaut jusqu'au prochain repère » (`e7adc9b8`, 3 novembre) est juste au milieu d'un
 *  document et faux à sa fin : le dernier élément n'a pas de prochain repère, et hérite donc de
 *  tout ce qui reste. Mesuré sur la vraie bibliothèque musicale : le Workout 52 de Bass Aerobics
 *  se propose sur **sept** pages — la postface, la biographie, la légende de notation, une page
 *  muette et la quatrième de couverture qui porte le prix du livre — là où ses cinquante et un
 *  voisins en couvrent deux.
 *
 *  La règle retenue (décision de Christophe du 5 novembre, registre) :
 *    1. la portée d'un document se lit sur ses propres écarts entre repères consécutifs **sûrs** ;
 *    2. au **milieu**, c'est le plus grand de ces écarts : la borne ne doit couper aucune portée
 *       que le document a montrée ;
 *    3. à la **fin**, c'est leur médiane : le dernier élément n'a RIEN montré de sa portée, et le
 *       maximum lui accorderait le cas le plus généreux du livre sans qu'aucune mesure ne l'appuie ;
 *    4. au-delà, la page n'a pas de lien — jamais un lien inventé ;
 *    5. moins de trois repères : aucune propagation ;
 *    6. un repère dont la **place** est douteuse — numéro imprimé revendiqué par deux pages — ne
 *       propage pas du tout, et les écarts qu'il borde n'entrent pas dans le calcul de la portée.
 *
 *  Aucun chiffre n'est commun à tous les documents : la borne vient du document lui-même. */

/** Une structure à repères rapprochés, un écart large au milieu, et une queue sans repère.
 *
 *  Nommée d'après sa **forme**, jamais d'après le document qui l'a fait découvrir : la règle ne
 *  vaut pas pour un ouvrage mais pour cette forme-là, et un nom de document dans l'épreuve d'une
 *  règle générique ferait croire le contraire (doctrine du 5 novembre 2026, règles 1 et 2).
 *
 *  Les écarts sûrs sont 2, 2, 5, 2 : maximum 5, médiane 2. Les deux chiffres **diffèrent**, et
 *  c'est tout l'objet du contrôle — une structure régulière ne saurait pas dire laquelle des deux
 *  règles s'applique au dernier élément, et c'est le piège où mon premier jeu de contrôles est
 *  tombé. La queue de feuillets sans repère reproduit ce qu'un ouvrage porte après son dernier
 *  élément : des pages qui ne sont à personne. */
const ecartLargeAuMilieu = () => {
  const reperes = [10, 12, 14, 19, 21];
  return entreeMinimale({
    lignes: reperes.map((_, rang) =>
      ligne(rang + 1, { pageImprimee: 100 + rang, sourcePiste: "corroboration_table" }),
    ),
    pages: [
      ...Array.from({ length: 16 }, (_, decalage) => 10 + decalage).map((index) => {
        const rang = reperes.indexOf(index);
        return rang === -1 ? { index } : { index, numero: 100 + rang, debutElement: true };
      }),
    ],
  });
};

describe("OUT-15 — la portée d'un élément vient du document, et s'arrête", () => {
  it("au milieu, un élément couvre le plus grand écart montré par le document (OUT-15)", () => {
    const vue = construireVue(ecartLargeAuMilieu());
    const porte = (index: number) => vue.pages.find((page) => page.index === index)?.elements.length ?? 0;

    // Le troisième élément, posé sur 14, va jusqu'au repère suivant : 14 à 18.
    for (const index of [14, 15, 16, 17, 18])
      expect(porte(index), `la page ${index} est dans la portée du troisième élément`).toBeGreaterThan(0);
  });

  it("le dernier élément reçoit la portée habituelle, pas la plus large (OUT-15)", () => {
    const vue = construireVue(ecartLargeAuMilieu());
    const porteuses = vue.pages.filter((page) => page.elements.length > 0).map((page) => page.index);

    // 10-11, 12-13, 14-18, 19-20, puis le dernier à la médiane : 21-22, et rien après.
    expect(porteuses, "le dernier élément s'arrête à la médiane des écarts, non au maximum").toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
    ]);
    for (const index of [23, 24, 25])
      expect(
        vue.pages.find((page) => page.index === index)?.elements,
        `la page ${index} est au-delà de la portée habituelle : elle n'a pas de lien`,
      ).toEqual([]);
  });

  it("un document dont l'écart maximal dépasse le double de l'habituel se signale (OUT-15)", () => {
    // Le filet du maximum : un seul écart aberrant suffit à l'emporter, et un numéro imprimé mal
    // lu suffit à fabriquer un tel écart. On garde la borne et on le dit. Ici 5 contre 2.
    const vue = construireVue(ecartLargeAuMilieu());
    const cas = vue.douteux.find((un) => un.etat === "portee_irreguliere");

    expect(cas, "le document se signale").toBeDefined();
    expect(cas?.nature, "c'est un fait à connaître, pas un arbitrage").toBe("information");
    expect(cas?.motif).toContain("5");
    expect(cas?.details.join(" "), "les écarts mesurés sont nommés").toContain("2, 2, 2, 5");
  });

  it("le signalement d'irrégularité ne touche pas à la borne qu'il signale (OUT-15)", () => {
    // Un signalement qui changerait la borne ne serait plus un signalement. Celui-ci porte sur le
    // document entier, non sur un repère : il n'a donc aucun élément, et il ne retire aucun écart
    // du calcul — ses détails nomment TOUS les écarts sûrs, le grand compris. La confusion serait
    // grave : classé comme un doute sur la place d'un repère, il écarterait l'écart même qui l'a
    // déclenché, et déplacerait la borne qu'il est censé seulement montrer.
    const vue = construireVue(ecartLargeAuMilieu());
    const cas = vue.douteux.find((un) => un.etat === "portee_irreguliere");

    expect(cas?.element, "aucun repère n'est mis en cause : le fait porte sur le document").toBeUndefined();
    expect(cas?.details.join(" "), "l'écart qui a déclenché le signalement reste dans le calcul").toContain("5");

    // Et la borne est bien celle qu'on attend d'un document dont les écarts sûrs sont 2, 2, 2, 5 :
    // le troisième élément couvre cinq feuillets, le dernier deux. Les mêmes porteuses qu'au
    // contrôle du dernier élément — le signalement n'a rien déplacé.
    expect(vue.pages.filter((page) => page.elements.length > 0).map((page) => page.index)).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
    ]);
  });

  it("un document régulier ne se signale pas (OUT-15)", () => {
    const reperes = [10, 12, 14, 16];
    const vue = construireVue(
      entreeMinimale({
        lignes: reperes.map((_, rang) =>
          ligne(rang + 1, { pageImprimee: 100 + rang, sourcePiste: "corroboration_table" }),
        ),
        pages: Array.from({ length: 10 }, (_, decalage) => 10 + decalage).map((index) => {
          const rang = reperes.indexOf(index);
          return rang === -1 ? { index } : { index, numero: 100 + rang, debutElement: true };
        }),
      }),
    );
    expect(
      vue.douteux.filter((un) => un.etat === "portee_irreguliere"),
      "des écarts tous égaux ne sont pas irréguliers",
    ).toEqual([]);
  });

  it("un repère dont la place est douteuse ne propage pas du tout (OUT-15)", () => {
    // Deux pages déclarent le numéro imprimé 100 : le sommaire d'un recueil et sa vraie page.
    // On ne sait pas laquelle est à sa place — aucune des deux ne propage, et l'écart qu'elles
    // bordent ne sert pas à mesurer la portée du document.
    const vue = construireVue(
      entreeMinimale({
        lignes: [
          ligne(1, { pageImprimee: 100, sourcePiste: "corroboration_table" }),
          ligne(2, { pageImprimee: 101, sourcePiste: "corroboration_table" }),
          ligne(3, { pageImprimee: 102, sourcePiste: "corroboration_table" }),
        ],
        pages: [
          { index: 2, numero: 100, debutElement: true },   // le sommaire, qui revendique 100
          { index: 3 },
          { index: 10, numero: 101, debutElement: true },
          { index: 11 },
          { index: 12, numero: 102, debutElement: true },
          { index: 13 },
          { index: 20, numero: 100, debutElement: true },  // la vraie page 100
          { index: 21 },
        ],
      }),
    );
    const porte = (index: number) => vue.pages.find((page) => page.index === index)?.elements.length ?? 0;

    expect(porte(2), "le sommaire garde son élément, marqué").toBeGreaterThan(0);
    expect(porte(3), "mais il ne le propage pas : sa place est douteuse").toBe(0);
    expect(porte(20), "la vraie page garde le sien").toBeGreaterThan(0);
    expect(porte(21), "et ne le propage pas non plus, tant qu'une personne n'a pas tranché").toBe(0);
    // Les repères sûrs, eux, propagent sur la portée du document.
    expect(porte(11), "un repère sûr propage").toBeGreaterThan(0);
    expect(porte(13), "un repère sûr propage").toBeGreaterThan(0);
  });

  it("l'écart bordé par un repère douteux ne gonfle pas la portée des autres (OUT-15)", () => {
    // Trois repères sûrs tous les deux feuillets, puis un quatrième très loin dont la place est
    // douteuse. Si son écart comptait, la portée du document passerait de 2 à 16 feuillets, et
    // le troisième élément s'étendrait sur toute la distance — seize faux liens à cause d'un
    // seul numéro mal lu. Écarter l'ÉCART, et non le repère : retirer le repère de la suite
    // fusionnerait ses deux voisins et fabriquerait une portée plus grande encore.
    const vue = construireVue(
      entreeMinimale({
        lignes: [10, 12, 14, 30].map((_, rang) =>
          ligne(rang + 1, { pageImprimee: 100 + rang, sourcePiste: "corroboration_table" }),
        ),
        pages: [
          { index: 10, numero: 100, debutElement: true },
          { index: 11 },
          { index: 12, numero: 101, debutElement: true },
          { index: 13 },
          { index: 14, numero: 102, debutElement: true },
          { index: 15 },
          { index: 16 },
          { index: 17 },
          { index: 30, numero: 103, debutElement: true },  // sa place est douteuse : 35 aussi
          { index: 31 },
          { index: 35, numero: 103 },                      // le sommaire, qui revendique 103
        ],
      }),
    );
    const porte = (index: number) => vue.pages.find((page) => page.index === index)?.elements.length ?? 0;

    expect(porte(15), "le troisième élément couvre la portée mesurée sur les écarts sûrs").toBeGreaterThan(0);
    for (const index of [16, 17])
      expect(porte(index), `la page ${index} resterait sans lien : l'écart douteux ne compte pas`).toBe(0);
  });

  it("sur un nombre pair d'écarts, la portée habituelle est un écart réellement observé (OUT-15)", () => {
    // Quatre écarts — 1, 2, 4, 9 — donc deux valeurs au milieu, 2 et 4. On retient **2**, le plus
    // petit des deux : un écart que le document a vraiment montré. Leur moyenne arrondie, 3, ne
    // correspond à aucune page de ce livre, et accorderait au dernier élément un feuillet qu'aucune
    // mesure n'appuie — ce que la décision du 5 novembre veut précisément éviter.
    const reperes = [10, 11, 13, 17, 26];
    const vue = construireVue(
      entreeMinimale({
        lignes: reperes.map((_, rang) =>
          ligne(rang + 1, { pageImprimee: 100 + rang, sourcePiste: "corroboration_table" }),
        ),
        pages: Array.from({ length: 22 }, (_, decalage) => 10 + decalage).map((index) => {
          const rang = reperes.indexOf(index);
          return rang === -1 ? { index } : { index, numero: 100 + rang, debutElement: true };
        }),
      }),
    );
    const porte = (index: number) => vue.pages.find((page) => page.index === index)?.elements.length ?? 0;

    expect(porte(27), "le dernier élément couvre les 2 feuillets de la portée habituelle").toBeGreaterThan(0);
    expect(porte(28), "et pas un troisième, qui viendrait d'une moyenne et non d'une mesure").toBe(0);
  });

  it("un repère douteux ne tire pas la portée habituelle vers le bas (OUT-15)", () => {
    // La médiane et le maximum doivent se lire sur la MÊME liste d'écarts sûrs, sinon un repère
    // écarté du maximum pèserait encore sur la portée du dernier élément. Ici le repère douteux
    // de la feuille 15 borde deux écarts d'un seul feuillet : comptés, ils feraient tomber la
    // portée habituelle de 4 à 1, et le dernier élément perdrait trois feuilles de liens vrais.
    const reperes = [10, 14, 15, 16, 20];
    const vue = construireVue(
      entreeMinimale({
        lignes: reperes.map((_, rang) =>
          ligne(rang + 1, { pageImprimee: 100 + rang, sourcePiste: "corroboration_table" }),
        ),
        pages: [
          ...Array.from({ length: 15 }, (_, decalage) => 10 + decalage).map((index) => {
            const rang = reperes.indexOf(index);
            return rang === -1 ? { index } : { index, numero: 100 + rang, debutElement: true };
          }),
          { index: 30, numero: 102 },  // une autre feuille revendique le numéro de la feuille 15
        ],
      }),
    );
    const porte = (index: number) => vue.pages.find((page) => page.index === index)?.elements.length ?? 0;

    expect(porte(16), "le repère douteux ne propage pas").toBeGreaterThan(0);
    expect(porte(23), "le dernier élément couvre les 4 feuillets des écarts SÛRS").toBeGreaterThan(0);
    expect(porte(24), "et s'arrête là").toBe(0);
  });

  it("deux repères ne font pas une portée : un seul écart n'est pas une régularité (OUT-15)", () => {
    // Deux repères donnent un écart, et un écart unique est une mesure, pas une régularité. On
    // ne fonde pas sur lui la portée de tout un document : aucune propagation.
    const vue = construireVue(
      entreeMinimale({
        lignes: [
          ligne(1, { pageImprimee: 100, sourcePiste: "corroboration_table" }),
          ligne(2, { pageImprimee: 101, sourcePiste: "corroboration_table" }),
        ],
        pages: [
          { index: 10, numero: 100, debutElement: true },
          { index: 11 },
          { index: 12, numero: 101, debutElement: true },
          { index: 13 },
          { index: 14 },
        ],
      }),
    );
    const porteuses = vue.pages.filter((page) => page.elements.length > 0).map((page) => page.index);
    expect(porteuses, "les deux repères portent leur élément, et rien ne se propage").toEqual([10, 12]);
  });

  it("sans trois repères, aucune propagation : une portée ne s'observe pas sur un seul écart (OUT-15)", () => {
    const vue = construireVue(
      entreeMinimale({
        lignes: [ligne(1, { pageImprimee: 100, sourcePiste: "corroboration_table" })],
        pages: [{ index: 5, numero: 100, debutElement: true }, { index: 6 }, { index: 7 }],
      }),
    );
    expect(vue.pages.find((page) => page.index === 5)?.elements.length).toBeGreaterThan(0);
    expect(vue.pages.find((page) => page.index === 6)?.elements, "rien à propager faute de portée observée").toEqual([]);
  });
});
