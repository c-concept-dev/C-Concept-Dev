import { describe, expect, it, vi } from "vitest";
import type { MotLu } from "@lienotheque/contrats";
import { lireLaTable } from "@lienotheque/noyau";
import { relireLesZones, zonesEnDefaut, type RelecteurDeZone } from "../src/relire-les-zones.js";

/** Ce qu'un document de douze enregistrements offre : assez pour que la colonne de gauche,
 *  qui va de 1 à 10, puisse en désigner un. */
const DOUZE = { enregistrements: 12 };

/** A2 — relire la zone en défaut, et rien d'autre (A2, OUT-05, OUT-10).
 *
 *  Aucun appel en ligne ici : le relecteur est un port, et les contrôles en passent un faux. Ce
 *  qu'on vérifie est exactement ce que Christophe a demandé le 5 novembre 2026 — la zone et non
 *  la page, l'appel tracé, le coût au rapport, et jamais une valeur lue remplacée.
 *
 *  La géométrie est celle de la table réelle « CD Track Listing » du 1er novembre 2026. */

const mot = (texte: string, x: number, y: number): MotLu => ({ texte, x, y, l: texte.length * 18, h: 34 });

/** Une table à deux colonnes de nombres, l'intitulé en texte. */
function page(
  numero: number,
  valeurs: readonly (readonly [number | undefined, number | undefined])[],
): { page: number; mots: MotLu[] } {
  const mots: MotLu[] = [];
  valeurs.forEach(([gauche, droite], rang) => {
    const y = 568 + rang * 83;
    mots.push(mot(`repère-${rang + 1}`, 253, y));
    if (gauche !== undefined) mots.push(mot(String(gauche), 793, y));
    if (droite !== undefined) mots.push(mot(String(droite), 955, y));
  });
  return { page: numero, mots };
}

const pleine = Array.from({ length: 10 }, (_, rang) => [rang + 1, 6 + rang * 2] as const);
const avecUnTrou = pleine.map((couple, rang) => (rang === 4 ? ([undefined, couple[1]] as const) : couple));

describe("A2 — ce qui est en défaut, avant toute relecture", () => {
  it("ne nomme aucune zone sur une table pleine et nette", () => {
    expect(zonesEnDefaut([page(1, pleine)], DOUZE)).toEqual([]);
  });

  it("nomme la zone et la page dont elle vient", () => {
    const zones = zonesEnDefaut([page(1, pleine), page(2, avecUnTrou)], DOUZE);
    expect(zones).toHaveLength(1);
    expect(zones[0]!.page).toBe(2);
    expect(zones[0]!.rangee).toBe(4);
    expect(zones[0]!.colonne).toBe(0);
  });
});

describe("A2 — sans relecteur, on dit ce qu'on aurait relu et on ne fait rien", () => {
  it("rend les pages inchangées, aucun appel, et le compte des zones en défaut", async () => {
    const pages = [page(1, avecUnTrou)];
    const fait = await relireLesZones(pages, undefined, DOUZE);
    expect(fait.pages).toBe(pages);
    expect(fait.traces).toEqual([]);
    expect(fait.enDefaut, "le coût qu'aurait eu l'étape").toBe(1);
  });
});

describe("A2 — la relecture comble le trou, et la table le voit", () => {
  it("n'appelle le relecteur que sur la zone en défaut, une fois", async () => {
    const relire = vi.fn<RelecteurDeZone>(async () => "5");
    const fait = await relireLesZones([page(1, avecUnTrou)], relire, DOUZE);
    expect(relire).toHaveBeenCalledTimes(1);
    const demande = relire.mock.calls[0]![0];
    // La zone est celle de la case manquante : colonne de gauche, rangée 4 à y = 900.
    expect(demande.page).toBe(1);
    expect(demande.x).toBeGreaterThan(253);
    expect(demande.x + demande.l).toBeLessThan(955);
    expect(demande.y).toBeLessThanOrEqual(900);
    expect(demande.h, "la bande d'une rangée, pas la page").toBeLessThan(83);
    expect(demande.pourquoi).toMatch(/non lue/);
  });

  it("rend la rangée utilisable une fois la valeur relue en place", async () => {
    const avant = lireLaTable(page(1, avecUnTrou).mots, DOUZE);
    expect(avant.incompletes, "la rangée est à trou avant").toEqual([4]);
    expect(avant.utilisables, "et donc hors des utilisables").not.toContain(4);

    const fait = await relireLesZones([page(1, avecUnTrou)], async () => "5", DOUZE);
    const apres = lireLaTable(fait.pages[0]!.mots!, DOUZE);
    expect(apres.incompletes, "plus aucun trou").toEqual([]);
    expect(apres.utilisables, "et la rangée est utilisable").toContain(4);
    expect(apres.rangees[4]!.cellules, "avec la valeur relue dans la bonne colonne").toEqual([5, 14]);
  });

  it("trace l'appel qui n'a rien rendu, sans rien ajouter", async () => {
    const fait = await relireLesZones([page(1, avecUnTrou)], async () => undefined, DOUZE);
    expect(fait.traces, "l'appel compte dans le coût").toHaveLength(1);
    expect(fait.traces[0]!.lu).toBeUndefined();
    expect(fait.traces[0]!.retenu).toBeUndefined();
    expect(lireLaTable(fait.pages[0]!.mots!, DOUZE).incompletes, "le trou est toujours là").toEqual([4]);
  });

  it("écarte ce qui n'est pas un nombre de cellule, et le dit", async () => {
    const fait = await relireLesZones([page(1, avecUnTrou)], async () => "Workout", DOUZE);
    expect(fait.traces[0]!.lu, "ce qui a été lu est consigné").toBe("Workout");
    expect(fait.traces[0]!.retenu, "mais rien n'est retenu").toBeUndefined();
    expect(lireLaTable(fait.pages[0]!.mots!, DOUZE).incompletes).toEqual([4]);
  });

  it("ne remplace jamais une valeur déjà lue : seules les cases en défaut sont visitées", async () => {
    const vues: string[] = [];
    const fait = await relireLesZones([page(1, avecUnTrou)], async (demande) => {
      vues.push(demande.pourquoi);
      return "5";
    }, DOUZE);
    expect(vues, "une seule case, celle du trou").toHaveLength(1);
    const apres = lireLaTable(fait.pages[0]!.mots!, DOUZE);
    // Les neuf autres rangées sont intactes, valeur par valeur.
    for (const rang of [0, 1, 2, 3, 5, 6, 7, 8, 9])
      expect(apres.rangees[rang]!.cellules).toEqual([rang + 1, 6 + rang * 2]);
  });
});

describe("A2 — une cellule suspecte est relue, et la relecture peut la démentir", () => {
  /** L'une des quatre vraies erreurs de la table du 29 octobre 2026 : 382 parmi des valeurs de 6
   *  à 24. La relecture rend 18, qui est la valeur attendue à cette place. */
  const avecUneAberration = pleine.map((couple, rang) => (rang === 6 ? ([couple[0], 382] as const) : couple));

  it("relit la case suspecte, et la valeur juste rejoint la colonne", async () => {
    const avant = lireLaTable(page(1, avecUneAberration).mots, DOUZE);
    expect(avant.suspectes.map((suspecte) => suspecte.rangee)).toContain(6);

    const fait = await relireLesZones([page(1, avecUneAberration)], async () => "18", DOUZE);
    expect(fait.traces[0]!.pourquoi).toMatch(/suspecte/);
    const apres = lireLaTable(fait.pages[0]!.mots!, DOUZE);
    expect(apres.suspectes, "plus rien de suspect").toEqual([]);
    expect(apres.utilisables, "et la rangée redevient utilisable").toContain(6);
  });

  it("consigne la valeur écartée : rien n'est corrigé en silence", async () => {
    const fait = await relireLesZones([page(1, avecUneAberration)], async () => "18", DOUZE);
    expect(fait.traces[0]!.lu).toBe("18");
    expect(fait.traces[0]!.retenu).toBe(18);
    expect(fait.traces[0]!.remplace, "la valeur que la colonne démentait").toBe(382);
  });

  it("ne consigne aucun remplacement quand la relecture comble un simple trou", async () => {
    const fait = await relireLesZones([page(1, avecUnTrou)], async () => "5", DOUZE);
    expect(fait.traces[0]!.retenu).toBe(5);
    expect(fait.traces[0]!.remplace).toBeUndefined();
  });

  it("une relecture qui confirme l'aberration ne la blanchit pas, et ne dit pas l'avoir remplacée", async () => {
    const fait = await relireLesZones([page(1, avecUneAberration)], async () => "382", DOUZE);
    const apres = lireLaTable(fait.pages[0]!.mots!, DOUZE);
    expect(apres.suspectes.map((suspecte) => suspecte.rangee), "toujours suspecte").toContain(6);
    expect(apres.utilisables, "et toujours hors des utilisables").not.toContain(6);
    expect(fait.traces[0]!.retenu, "la relecture a bien rendu quelque chose").toBe(382);
    expect(fait.traces[0]!.remplace, "mais elle n'a rien remplacé").toBeUndefined();
  });
});

describe("A2 — quand le mot d'origine est introuvable, on ne remplace rien", () => {
  /** Une valeur peut appartenir à une colonne **sans appartenir à son groupe**.
   *
   *  `colonnesDeNombres` groupe les abscisses et coupe là où l'écart dépasse une largeur et
   *  demie ; `rangeesDeTable`, lui, range un nombre dans la colonne la plus proche jusqu'à la
   *  moitié de l'écart entre colonnes. Entre les deux il y a de la place : avec des colonnes très
   *  écartées, un nombre égaré forme son propre groupe — trop petit pour être une colonne — et se
   *  retrouve pourtant rangé dans la colonne voisine. L'étendue de cette colonne l'ignore, donc
   *  la zone à relire ne le contient pas.
   *
   *  C'est le seul cas où le mot démenti est introuvable, et il faut alors **ne rien faire** :
   *  mieux vaut une cellule suspecte signalée qu'une valeur posée à côté d'une autre, sans qu'on
   *  sache laquelle la table retiendra. */
  const colonnesEcartees = (): MotLu[] => {
    const mots: MotLu[] = [];
    for (let rang = 0; rang < 10; rang += 1) {
      const y = 568 + rang * 83;
      mots.push(mot(`repère-${rang + 1}`, 100, y), mot(String(rang + 1), 400, y));
      // La rangée 6 porte une valeur aberrante, et égarée de 350 vers la droite.
      if (rang === 6) mots.push(mot("382", 1550, y));
      else mots.push(mot(String(6 + rang * 2), 1200, y));
    }
    return mots;
  };

  it("la cellule est bien suspecte, et sa zone ne contient pas le mot égaré", () => {
    const lue = lireLaTable(colonnesEcartees(), DOUZE);
    expect(lue.suspectes.map((suspecte) => suspecte.rangee), "la valeur aberrante est vue").toContain(6);
    const zone = lue.aRelire.find((candidate) => candidate.rangee === 6)!;
    expect(zone.x + zone.l, "et la zone s'arrête avant le mot égaré").toBeLessThan(1550);
  });

  it("trace l'appel, ne consigne aucun remplacement, et laisse la cellule suspecte", async () => {
    const fait = await relireLesZones([{ page: 1, mots: colonnesEcartees() }], async () => "18", DOUZE);
    expect(fait.traces, "l'appel a bien eu lieu et compte dans le coût").toHaveLength(1);
    expect(fait.traces[0]!.retenu, "la relecture a rendu un nombre").toBe(18);
    expect(fait.traces[0]!.remplace, "mais rien n'a été remplacé").toBeUndefined();
    const apres = lireLaTable(fait.pages[0]!.mots!, DOUZE);
    expect(apres.suspectes.map((suspecte) => suspecte.rangee), "la cellule reste suspecte").toContain(6);
    expect(apres.rangees[6]!.cellules, "et sa valeur n'a pas bougé").toEqual([7, 382]);
  });
});

describe("A2 — le coût de l'étape est le compte des appels, jamais une estimation", () => {
  it("compte un appel par case en défaut, sur plusieurs pages", async () => {
    const deuxTrous = pleine.map((couple, rang) =>
      rang === 2 ? ([undefined, undefined] as const) : rang === 4 ? ([undefined, couple[1]] as const) : couple,
    );
    const relire = vi.fn<RelecteurDeZone>(async () => undefined);
    const fait = await relireLesZones([page(1, avecUnTrou), page(2, deuxTrous), page(3, pleine)], relire, DOUZE);
    // Page 1 : une case. Page 2 : la rangée 2 est entièrement vide — ce n'est pas une rangée —,
    // donc la seule case en défaut est celle de la rangée 4. Page 3 : rien.
    expect(fait.enDefaut).toBe(2);
    expect(fait.traces).toHaveLength(2);
    expect(relire).toHaveBeenCalledTimes(2);
    expect(fait.traces.map((trace) => trace.page)).toEqual([1, 2]);
  });
});
