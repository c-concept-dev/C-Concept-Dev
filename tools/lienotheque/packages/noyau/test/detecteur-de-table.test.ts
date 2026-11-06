import { describe, expect, it } from "vitest";
import type { MotLu } from "@lienotheque/contrats";
import { lireLaTable } from "../src/index.js";

/** Une table d'enregistrements, et une page qui n'en porte pas (OUT-10, REC-02).
 *
 *  ## Le défaut que ces contrôles existent pour empêcher
 *
 *  Le détecteur ne demandait que deux colonnes de nombres et quatre rangées. Mesuré le 6 novembre
 *  2026 sur 250 pages — un livre entier plus seize familles —, **87 pages passaient ce test et
 *  dépensaient 6 578 cases à relire**, dont l'essentiel sur des pages gravées : les chiffres d'une
 *  partition s'alignent en colonnes sans former une seule table.
 *
 *  ## Ce qu'une table d'enregistrements est, dit en forme
 *
 *  Trois propriétés, et aucune constante choisie :
 *
 *  - **une suite de rangées à pas constant** — la tolérance est la hauteur d'une rangée, que la
 *    page imprime elle-même. C'est cette suite qui dit *quelles rangées sont la table*, et c'est
 *    son rôle principal : les deux critères suivants se calculent sur elle, et non sur tout ce
 *    que la page porte par ailleurs ;
 *  - **au moins un enregistrement complet** parmi elles — une rangée qui remplit toutes ses
 *    colonnes. Ce n'est pas un seuil : c'est un « il en existe » ;
 *  - **au moins une colonne dont toutes les valeurs tiennent dans le vivier** — un nombre qui
 *    désigne un enregistrement ne peut pas dépasser leur compte.
 *
 *  Chacune est tuée par sa propre mutation, et la mesure est au registre.
 *
 *  La géométrie employée est celle des autres contrôles de table : intitulé vers x = 253,
 *  colonnes vers 793 et 955, pas vertical de 83, hauteur de mot 34.
 */

const mot = (texte: string, x: number, y: number, h = 34): MotLu => ({
  texte,
  x,
  y,
  l: texte.length * 18,
  h,
});

/** Une table à deux colonnes de nombres, à pas constant, avec un intitulé textuel. */
function table(
  valeurs: readonly (readonly [number | undefined, number | undefined])[],
  pas = 83,
): MotLu[] {
  const mots: MotLu[] = [];
  valeurs.forEach(([gauche, droite], rang) => {
    const y = 568 + rang * pas;
    mots.push(mot(`repère-${rang + 1}`, 253, y));
    if (gauche !== undefined) mots.push(mot(String(gauche), 793, y));
    if (droite !== undefined) mots.push(mot(String(droite), 955, y));
  });
  return mots;
}

/** Dix enregistrements pleins : une piste de 1 à 10, un folio de 6 à 24. */
const dix = Array.from({ length: 10 }, (_, rang) => [rang + 1, 6 + rang * 2] as const);

/** Ce qu'un document de douze enregistrements offre. */
const DOUZE = { enregistrements: 12 };

describe("une table d'enregistrements se reconnaît à sa forme (OUT-10, REC-02)", () => {
  it("retient une table dont les rangées sont à pas constant, pleines et bornées", () => {
    expect(lireLaTable(table(dix), DOUZE).estUneTable).toBe(true);
  });

  /** Une table lue de travers : chaque rangée a perdu une cellule, sauf celle qu'on désigne.
   *
   *  Les deux contrôles qui suivent n'emploient que ce décor, et ne diffèrent que par la seule
   *  rangée complète. C'est la démonstration la plus courte que le critère est « il en existe
   *  un », et non « la moitié ». */
  const malLue = (rangeeComplete: number | undefined): readonly (readonly [number | undefined, number | undefined])[] =>
    dix.map(([piste, folio], rang) =>
      rang === rangeeComplete
        ? ([piste, folio] as const)
        : rang < 5
          ? ([piste, undefined] as const)
          : ([undefined, folio] as const),
    );

  it("retient une table que des trous abîment, tant qu'un enregistrement reste complet", () => {
    // Bach p2, mesuré : deux rangées complètes sur dix-sept, et c'est une vraie liste. Une règle
    // qui exigeait la moitié des rangées pleines la perdait — réfutée le 6 novembre 2026.
    expect(lireLaTable(table(malLue(0)), DOUZE).estUneTable).toBe(true);
  });

  it("écarte une page dont aucune rangée ne porte un enregistrement entier", () => {
    // La signature mesurée des pages gravées : des colonnes, des rangées, et pas une seule
    // rangée qui les remplisse toutes. Douze des pages les plus chères du livre du jalon.
    expect(lireLaTable(table(malLue(undefined)), DOUZE).estUneTable).toBe(false);
  });

  it("écarte une page dont aucune colonne ne tient dans le vivier", () => {
    // Westwood 2 p9, mesuré : des numéros d'exercice en marge, 416 à 427, parfaitement réguliers
    // et parfaitement hors d'un vivier de soixante-treize.
    const horsVivier = Array.from({ length: 10 }, (_, rang) => [416 + rang, 422 + rang] as const);
    expect(lireLaTable(table(horsVivier), DOUZE).estUneTable).toBe(false);
    expect(lireLaTable(table(horsVivier), { enregistrements: 500 }).estUneTable, "et la retient si le vivier les porte").toBe(
      true,
    );
  });

  it("écarte une page dont les rangées ne suivent aucun pas", () => {
    const mots: MotLu[] = [];
    // Des hauteurs qui ne forment aucune suite régulière : 0, 40, 300, 700, 740, 1500.
    [0, 40, 300, 700, 740, 1500].forEach((ecart, rang) => {
      const y = 568 + ecart;
      mots.push(mot(`repère-${rang + 1}`, 253, y));
      mots.push(mot(String(rang + 1), 793, y));
      mots.push(mot(String(6 + rang * 2), 955, y));
    });
    expect(lireLaTable(mots, DOUZE).estUneTable).toBe(false);
  });

  it("ne juge les colonnes que sur les rangées de la suite, et non sur toute la page", () => {
    // Bach p2, mesuré : les colonnes trouvées étaient celles du pied de page — l'adresse de
    // l'éditeur, 7777 et 53213. Jugée sur toute la page, la table perdait son vivier et la vraie
    // liste était écartée. La suite à pas constant existe pour cela.
    const mots = table(dix);
    // Un pied de page : deux nombres énormes, loin sous la table et hors de son pas.
    mots.push(mot("7777", 793, 568 + 10 * 83 + 400));
    mots.push(mot("53213", 955, 568 + 10 * 83 + 400));
    mots.push(mot("Milwaukee", 253, 568 + 10 * 83 + 400));
    expect(lireLaTable(mots, DOUZE).estUneTable).toBe(true);
  });

  it("laisse les cases à relire sur toute la page, et non sur la seule suite", () => {
    // La liste du jalon a 52 enregistrements et sa plus longue suite n'en fait que 13 : les
    // intertitres de chapitre cassent le pas. Restreindre les cases à relire à la suite ferait
    // tomber ses défauts de 22 à 3 — en abandonnant 39 rangées de vraie table. Réfuté le
    // 6 novembre 2026.
    const mots = table(dix.map((valeurs, rang) => (rang === 5 ? ([undefined, valeurs[1]] as const) : valeurs)));
    // Un second bloc, séparé par un intertitre : même pas, mais décalé.
    const apres = 568 + 10 * 83 + 150;
    [0, 1, 2].forEach((rang) => {
      const y = apres + rang * 83;
      mots.push(mot(`repère-${11 + rang}`, 253, y));
      if (rang !== 1) mots.push(mot(String(11 + rang), 793, y));
      mots.push(mot(String(26 + rang * 2), 955, y));
    });
    const lue = lireLaTable(mots, DOUZE);
    expect(lue.estUneTable).toBe(true);
    expect(
      lue.aRelire.map((zone) => zone.rangee),
      "la case du second bloc est à relire comme celle du premier",
    ).toContain(lue.rangees.findIndex((rangee) => rangee.intitule === "repère-12"));
  });
});
