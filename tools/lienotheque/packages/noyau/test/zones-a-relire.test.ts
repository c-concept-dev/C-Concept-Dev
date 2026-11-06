import { describe, expect, it } from "vitest";
import type { MotLu } from "@lienotheque/contrats";
import { lireLaTable } from "../src/index.js";

/** A2 — où relire, quand une rangée ou une cellule demande une seconde lecture (OUT-10, OUT-05).
 *
 *  La table se dit déjà en défaut : elle nomme ses rangées à trou et ses cellules suspectes. Ce
 *  qu'elle ne disait pas, c'est **où** elles sont sur la page — donc rien ne pouvait les relire
 *  sans relire la page entière, ce qui coûte le prix d'une page pour rattraper une case.
 *
 *  La zone sort **des mots déjà lus**, et de rien d'autre : la bande verticale de la rangée vient
 *  des boîtes de ses propres mots, la bande horizontale de la colonne visée. Aucune constante, et
 *  donc rien à calibrer document par document.
 *
 *  La géométrie employée est celle du test de table : intitulé vers x = 253, colonnes vers 793 et
 *  955, pas vertical de 83, hauteur de mot 34. */

const mot = (texte: string, x: number, y: number): MotLu => ({ texte, x, y, l: texte.length * 18, h: 34 });

/** Une table à **deux** colonnes de nombres, et un intitulé qui n'en est pas une.
 *
 *  L'intitulé reste du texte : un rang écrit en chiffres à gauche formerait une troisième
 *  colonne, et une rangée privée de ses deux valeurs resterait « à trou » au lieu d'être vide. */
function table(valeurs: readonly (readonly [number | undefined, number | undefined])[]): MotLu[] {
  const mots: MotLu[] = [];
  valeurs.forEach(([gauche, droite], rang) => {
    const y = 568 + rang * 83;
    mots.push(mot(`repère-${rang + 1}`, 253, y));
    if (gauche !== undefined) mots.push(mot(String(gauche), 793, y));
    if (droite !== undefined) mots.push(mot(String(droite), 955, y));
  });
  return mots;
}

/** Dix rangées pleines : une table dont personne n'a à relire quoi que ce soit. */
const pleine = Array.from({ length: 10 }, (_, rang) => [rang + 1, 6 + rang * 2] as const);

describe("A2 — la zone à relire d'une rangée à trou (OUT-10)", () => {
  it("ne propose rien quand toutes les rangées sont pleines et nettes", () => {
    const lue = lireLaTable(table(pleine));
    expect(lue.incompletes).toEqual([]);
    expect(lue.suspectes).toEqual([]);
    expect(lue.aRelire).toEqual([]);
  });

  it("propose une zone par cellule manquante, et pas une par rangée", () => {
    const valeurs = pleine.map((couple, rang) =>
      rang === 4 ? ([undefined, couple[1]] as const) : couple,
    );
    const lue = lireLaTable(table(valeurs));
    expect(lue.incompletes).toEqual([4]);
    expect(lue.aRelire).toHaveLength(1);
    expect(lue.aRelire[0]!.rangee).toBe(4);
    expect(lue.aRelire[0]!.colonne).toBe(0);
    expect(lue.aRelire[0]!.pourquoi).toMatch(/cellule/i);
  });

  it("place la zone sur la bande verticale des mots de cette rangée, pas sur la page entière", () => {
    const valeurs = pleine.map((couple, rang) =>
      rang === 4 ? ([undefined, couple[1]] as const) : couple,
    );
    const zone = lireLaTable(table(valeurs)).aRelire[0]!;
    // La rangée 4 est à y = 568 + 4 × 83 = 900, mots de hauteur 34.
    expect(zone.y).toBeLessThanOrEqual(900);
    expect(zone.y + zone.h).toBeGreaterThanOrEqual(934);
    // Et elle ne couvre pas la rangée voisine, à 83 de distance.
    expect(zone.h).toBeLessThan(83);
  });

  it("place la zone sur la colonne visée, pas sur toute la largeur", () => {
    const valeurs = pleine.map((couple, rang) =>
      rang === 4 ? ([undefined, couple[1]] as const) : couple,
    );
    const zone = lireLaTable(table(valeurs)).aRelire[0]!;
    // La colonne manquante est celle de x = 793 ; l'autre est à 955.
    expect(zone.x).toBeLessThanOrEqual(793);
    expect(zone.x + zone.l).toBeLessThan(955);
    // Et elle ne commence pas à l'intitulé, à 253.
    expect(zone.x).toBeGreaterThan(253);
  });

  it("couvre une largeur tirée des nombres lus, et non une marge inventée", () => {
    const valeurs = pleine.map((couple, rang) =>
      rang === 4 ? ([undefined, couple[1]] as const) : couple,
    );
    const zone = lireLaTable(table(valeurs)).aRelire[0]!;
    // Les nombres de cette colonne font 18 ou 36 de large : la zone doit en contenir un, sans
    // couvrir l'écart qui la sépare de la colonne voisine (162).
    expect(zone.l).toBeGreaterThanOrEqual(36);
    expect(zone.l).toBeLessThan(162);
  });

  it("ne propose rien pour une rangée entièrement vide : il n'y a pas de rangée là", () => {
    const valeurs = pleine.map((couple, rang) =>
      rang === 4 ? ([undefined, undefined] as const) : couple,
    );
    const lue = lireLaTable(table(valeurs));
    expect(lue.incompletes).toEqual([]);
    expect(lue.aRelire).toEqual([]);
  });

  it("ne propose rien quand ce n'est pas une table, même avec un trou et des cellules suspectes", () => {
    // Cinq rangées à deux colonnes : une à trou, deux pleines mais suspectes (400 et 500 parmi
    // des rangs de 1 à 3). Il ne reste que deux rangées nettes — trop peu pour qu'on tienne cela
    // pour une table. Relire les trois cases en défaut ne rattraperait rien : on ne sait même pas
    // qu'il y avait une table à cet endroit.
    const gauche = [1, 2, 3, 400, 500];
    const droite: readonly (number | undefined)[] = [6, undefined, 10, 12, 14];
    const mots: MotLu[] = [];
    gauche.forEach((valeur, rang) => {
      const y = 568 + rang * 83;
      mots.push(mot(`repère-${rang + 1}`, 253, y), mot(String(valeur), 793, y));
      const autre = droite[rang];
      if (autre !== undefined) mots.push(mot(String(autre), 955, y));
    });
    const lue = lireLaTable(mots);
    expect(lue.colonnes.length, "deux colonnes tout de même").toBe(2);
    expect(lue.estUneTable, "mais deux rangées nettes ne font pas une table").toBe(false);
    expect(lue.incompletes, "la rangée à trou est bien nommée").toEqual([1]);
    expect(lue.suspectes.length, "et deux cellules sont suspectes").toBe(2);
    expect(lue.aRelire, "et pourtant rien à relire").toEqual([]);
  });
});

describe("A2 — la zone à relire d'une cellule suspecte (OUT-10)", () => {
  /** Les quatre vraies erreurs de la table réelle du 29 octobre 2026 : 382 et 248 pour l'écart
   *  aberrant, 20 et 21 pour la montée rompue. Ici l'écart aberrant, qui suffit. */
  const avecUneAberration = pleine.map((couple, rang) =>
    rang === 6 ? ([couple[0], 382] as const) : couple,
  );

  it("propose la zone de la cellule suspecte, désignée par sa colonne", () => {
    const lue = lireLaTable(table(avecUneAberration));
    expect(lue.suspectes.map((suspecte) => suspecte.rangee)).toContain(6);
    const zones = lue.aRelire.filter((zone) => zone.rangee === 6);
    expect(zones).toHaveLength(1);
    expect(zones[0]!.colonne).toBe(1);
    expect(zones[0]!.pourquoi).toMatch(/suspecte|aberrant|creux/i);
  });

  it("place cette zone sur la colonne de droite, là où la valeur a été lue", () => {
    const zone = lireLaTable(table(avecUneAberration)).aRelire.find((candidate) => candidate.rangee === 6)!;
    // La valeur suspecte est à x = 955.
    expect(zone.x).toBeLessThanOrEqual(955);
    expect(zone.x + zone.l).toBeGreaterThanOrEqual(955 + 18);
    expect(zone.x).toBeGreaterThan(793);
  });

  it("relit les deux cases d'une rangée à la fois à trou et suspecte, chacune une fois", () => {
    const valeurs = pleine.map((couple, rang) =>
      rang === 6 ? ([undefined, 382] as const) : couple,
    );
    const lue = lireLaTable(table(valeurs));
    const zones = lue.aRelire.filter((candidate) => candidate.rangee === 6);
    // Une case non lue n'a pas de valeur, donc ne peut pas être suspecte : les deux causes
    // désignent nécessairement deux cases différentes, et aucune n'est nommée deux fois.
    expect(zones.map((candidate) => candidate.colonne)).toEqual([0, 1]);
    expect(zones[0]!.pourquoi).toMatch(/non lue/);
    expect(zones[1]!.pourquoi).toMatch(/suspecte/);
  });
});

describe("A2 — la zone à relire d'une table en panneaux (OUT-10)", () => {
  /** La table réelle « CD Track Listing » du 1er novembre 2026, à qui l'on retire une case du
   *  panneau droit : les rangées des deux panneaux se suivent dans une seule liste, et une zone
   *  doit rester sur le panneau dont elle vient. */
  const enTete = [
    mot("Description", 127, 268),
    mot("Track", 678, 268),
    mot("Page", 790, 268),
    mot("Description", 953, 268),
    mot("Track", 1504, 268),
    mot("Page", 1616, 268),
  ];
  const rangee = (
    y: number,
    gauche: readonly [number, number, number],
    droite: readonly [number, number, number | undefined],
  ): MotLu[] => [
    mot("repère", 170, y),
    mot(String(gauche[0]), 307, y),
    mot(String(gauche[1]), 718, y),
    mot(String(gauche[2]), 835, y),
    mot("repère", 996, y),
    mot(String(droite[0]), 1132, y),
    mot(String(droite[1]), 1525, y),
    ...(droite[2] === undefined ? [] : [mot(String(droite[2]), 1643, y)]),
  ];
  const deuxPanneaux = [
    ...enTete,
    ...Array.from({ length: 10 }, (_, rang) =>
      rangee(
        407 + rang * 61,
        [1 + rang, 1 + rang, 6 + rang * 2] as const,
        [31 + rang, 31 + rang, rang === 3 ? undefined : 66 + rang * 2] as const,
      ),
    ).flat(),
  ];

  it("garde la zone dans le panneau dont la rangée vient", () => {
    const lue = lireLaTable(deuxPanneaux);
    expect(lue.panneaux, "deux panneaux").toBe(2);
    expect(lue.aRelire.length, "au moins la case retirée").toBeGreaterThanOrEqual(1);
    // La case retirée est celle du panneau droit, vers x = 1643 : aucune zone ne doit viser le
    // panneau gauche, dont la dernière colonne est à 835.
    for (const zone of lue.aRelire) expect(zone.x, "la zone reste à droite").toBeGreaterThan(1000);
  });

  it("désigne la rangée par sa place dans la liste commune aux deux panneaux", () => {
    const lue = lireLaTable(deuxPanneaux);
    const zone = lue.aRelire[0]!;
    expect(lue.incompletes, "la rangée à trou est nommée").toContain(zone.rangee);
    expect(lue.rangees[zone.rangee]!.cellules[zone.colonne!], "et sa case est bien vide").toBeUndefined();
  });
});
