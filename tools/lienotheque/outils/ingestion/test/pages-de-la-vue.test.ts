// @vitest-environment node
import { describe, expect, it } from "vitest";
import { construireVue } from "../src/index.js";
import { entreeMinimale, ligne } from "./aide-instantane.js";

/** La vue porte les pages **lues**, et non les pages déduites des éléments (OUT-03, B3).
 *
 *  Mesuré sur les sept documents de la mini-bibliothèque : 108, 298, 316, 614 pages lues, et
 *  **zéro page dans la vue**, pour tous. La cause était structurelle : la vue fabriquait ses
 *  pages à partir des éléments reconnus. Un ouvrage ordinaire n'en a aucun — ce ne sont pas des
 *  méthodes à exercices numérotés — donc il n'avait aucune page, et ses images, pourtant écrites
 *  sur le disque, restaient inatteignables.
 *
 *  Une page existe parce qu'elle a été lue, pas parce qu'on y a reconnu quelque chose.
 */

describe("une page lue existe dans la vue, même sans élément reconnu", () => {
  it("rend une page par page lue, dans l'ordre, quand il n'y a aucun élément", () => {
    const vue = construireVue(
      entreeMinimale({
        lignes: [],
        medias: [],
        pages: [{ index: 1 }, { index: 2 }, { index: 3 }],
      }),
    );
    expect(vue.pages).toHaveLength(3);
    expect(vue.pages.map((page) => page.index)).toEqual([1, 2, 3]);
    expect(vue.pages[0]?.numero, "un numéro imprimé inconnu ne s'invente pas").toBeUndefined();
    expect(vue.pages[0]?.elements).toEqual([]);
  });

  it("garde le numéro imprimé quand il est connu, sans le confondre avec le rang", () => {
    const vue = construireVue(
      entreeMinimale({ lignes: [], medias: [], pages: [{ index: 57, numero: 42 }] }),
    );
    expect(vue.pages[0]?.index).toBe(57);
    expect(vue.pages[0]?.numero).toBe(42);
  });

  it("pose chaque élément sur la page dont il porte le numéro imprimé", () => {
    const vue = construireVue(
      entreeMinimale({
        lignes: [ligne(1, { pageImprimee: 101 }), ligne(2, { pageImprimee: 102 })],
        pages: [{ index: 10, numero: 101 }, { index: 11, numero: 102 }, { index: 12 }],
      }),
    );
    expect(vue.pages).toHaveLength(3);
    const porteurs = vue.pages.filter((page) => page.elements.length > 0).map((page) => page.index);
    expect(porteurs, "les éléments vont sur les pages imprimées qui les portent").toEqual([10, 11]);
    expect(vue.pages[2]?.elements, "une page sans élément reste une page").toEqual([]);
  });

  it("attache l'image d'une page à son rang, et non à son numéro imprimé", () => {
    // C'est la confusion qui perdait les images : elles étaient rangées sous le numéro imprimé,
    // inconnu pour un ouvrage, donc toutes sous la même clé de repli.
    const vue = construireVue(
      entreeMinimale({
        lignes: [],
        medias: [],
        pages: [{ index: 4 }, { index: 5 }],
        imageDePage: (rang) =>
          rang === 5 ? { image: `/pages/page-${rang}.webp`, largeur: 800, hauteur: 1200 } : undefined,
      }),
    );
    expect(vue.pages[0]?.image).toBeUndefined();
    expect(vue.pages[1]?.image).toBe("/pages/page-5.webp");
  });
});

describe("un élément ne disparaît pas parce que sa page n'a pas été lue", () => {
  /** Les pages de la vue viennent désormais des pages **lues**. Un élément, lui, ne connaît que
   *  son numéro **imprimé** : si aucune page lue ne porte ce numéro, il n'a nulle part où se
   *  poser.
   *
   *  Avant, la page était créée depuis l'élément : la question ne se posait pas. Elle se pose
   *  maintenant, et la seule réponse acceptable est de le dire — un élément qui s'évapore en
   *  silence est la faute que ce projet poursuit depuis le début (OUT-15). */
  it("le signale à rattacher au lieu de le laisser tomber", () => {
    const vue = construireVue(
      entreeMinimale({
        lignes: [ligne(1, { pageImprimee: 100 }), ligne(2, { pageImprimee: 999 })],
        pages: [{ index: 1, numero: 100 }],
      }),
    );

    expect(vue.pages).toHaveLength(1);
    expect(vue.pages[0]?.elements, "le premier se pose normalement").toHaveLength(1);

    const orphelins = vue.douteux.filter((cas) => cas.etat === "a_rattacher");
    expect(orphelins, "le second doit être nommé, pas perdu").toHaveLength(1);
    expect(orphelins[0]?.element?.numero).toBe("2");
  });

  it("ne signale rien quand toutes les pages portent leurs éléments", () => {
    const vue = construireVue(
      entreeMinimale({
        lignes: [ligne(1, { pageImprimee: 100 })],
        pages: [{ index: 1, numero: 100 }],
      }),
    );
    expect(vue.douteux.filter((cas) => cas.etat === "a_rattacher")).toEqual([]);
  });
});
