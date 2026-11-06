/** Relire les cases qu'une table dit en défaut, et rien d'autre (A2, OUT-05, OUT-10).
 *
 *  **Le signal existait déjà et personne ne s'en servait.** `lireLaTable` nomme ses rangées à
 *  trou et ses cellules suspectes, et compare chaque valeur aux autres de sa colonne — les
 *  comparables. Ce module est le pont qui manquait entre ce constat et une seconde lecture.
 *
 *  Trois règles qui tiennent tout :
 *
 *  1. **On ne relit que la zone**, jamais la page. La boîte vient des mots déjà lus, et le prix
 *     d'une case reste celui d'une case.
 *  2. **Tout appel est tracé**, celui qui n'a rien rendu comme celui qui a rendu. Le compte des
 *     appels est le coût de l'étape, et il n'est pas estimé.
 *  3. **Une valeur relue ne remplace que ce que la table a elle-même déclaré suspect.** Elle
 *     comble un trou, ou elle prend la place d'une valeur que la colonne dément — et jamais
 *     celle d'une valeur que la table tient pour bonne. Les deux lectures restent au rapport :
 *     rien n'est corrigé en silence.
 *
 *  La troisième règle a d'abord été écrite « ne remplace jamais une valeur lue », et elle était
 *  fausse : une cellule suspecte est déjà remplie, et ajouter la valeur relue à côté ne faisait
 *  rien du tout — la table garde la première valeur qu'elle range dans une cellule, donc la
 *  mauvaise. Attrapé par le contrôle de la cellule suspecte, qui restait suspecte après sa
 *  relecture.
 *
 *  Le relecteur est un **port** : ce module n'appelle rien par lui-même et ne connaît ni réseau
 *  ni clé. Sans relecteur, il rend les zones qu'il aurait relues et ne fait rien d'autre.
 */
import { lireLaTable, valeurDeCellule, type CeQueLaTablePeutDesigner, type ZoneARelire } from "@lienotheque/noyau";
import type { MotLu } from "@lienotheque/contrats";

/** Ce qu'on demande à relire : une zone d'une page, dans les unités des mots de cette page. */
export type DemandeDeRelecture = {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly l: number;
  readonly h: number;
  /** Pourquoi cette case est en défaut, dans les mots de la table. */
  readonly pourquoi: string;
};

/** Relire une zone et rendre ce qui y est écrit, ou rien. */
export type RelecteurDeZone = (demande: DemandeDeRelecture) => Promise<string | undefined>;

/** Un appel, et ce qu'il a donné. Un par zone, sans exception. */
export type TraceDeRelecture = DemandeDeRelecture & {
  readonly rangee: number;
  readonly colonne: number;
  /** Ce que la relecture a rendu, tel quel. Absent : elle n'a rien rendu. */
  readonly lu?: string | undefined;
  /** La valeur retenue. Absente alors que `lu` est présent : ce n'était pas un nombre de
   *  cellule, et le juge est celui de la table — pas un second, plus indulgent. */
  readonly retenu?: number | undefined;
  /** La valeur que la relecture a écartée, quand elle en a écarté une. Présente seulement pour
   *  une cellule que la table déclarait suspecte : c'est la trace de la seule substitution que
   *  ce module s'autorise. */
  readonly remplace?: number | undefined;
};

/** Une page et ses mots, telle que la chaîne les porte déjà. */
export type PageAMots = { readonly page: number; readonly mots?: readonly MotLu[] | undefined };

export type Relecture<T extends PageAMots> = {
  /** Les pages, avec les valeurs relues ajoutées à leurs mots. */
  readonly pages: readonly T[];
  readonly traces: readonly TraceDeRelecture[];
  /** Combien de zones étaient en défaut, relecteur ou pas. */
  readonly enDefaut: number;
};

/** Les zones en défaut de chaque page, sans rien relire.
 *
 *  Chacune porte la valeur que sa cellule tient aujourd'hui : absente pour un trou, présente
 *  pour une cellule suspecte. C'est elle qui dit si la relecture comble ou remplace. */
export function zonesEnDefaut(
  pages: readonly PageAMots[],
  designables: CeQueLaTablePeutDesigner,
): readonly (ZoneARelire & { page: number; valeurActuelle?: number | undefined })[] {
  return pages.flatMap((page) => {
    if (page.mots === undefined) return [];
    const table = lireLaTable(page.mots, designables);
    return table.aRelire.map((zone) => {
      const actuelle = table.rangees[zone.rangee]?.cellules[zone.colonne];
      return { ...zone, page: page.page, ...(actuelle === undefined ? {} : { valeurActuelle: actuelle }) };
    });
  });
}

/** Relit les cases en défaut et rend les pages enrichies.
 *
 *  La valeur relue est posée **au centre de la colonne visée**, à la hauteur de sa rangée : c'est
 *  ainsi que la seconde lecture de la table la rangera dans la bonne cellule, par le même chemin
 *  que la première. Rien n'est écrit dans la table directement — elle se relit entière, et une
 *  valeur qui jure avec sa colonne sera jugée suspecte comme n'importe quelle autre. */
export async function relireLesZones<T extends PageAMots>(
  pages: readonly T[],
  relire: RelecteurDeZone | undefined,
  designables: CeQueLaTablePeutDesigner,
): Promise<Relecture<T>> {
  const zones = zonesEnDefaut(pages, designables);
  if (relire === undefined) return { pages, traces: [], enDefaut: zones.length };

  const traces: TraceDeRelecture[] = [];
  const ajouts = new Map<number, MotLu[]>();
  /** Les mots que la relecture a démentis : ceux d'une cellule suspecte dont elle a lu autre
   *  chose. Retirés par identité d'objet, jamais par comparaison de valeurs — deux mots peuvent
   *  écrire le même nombre sur la même page. */
  const dementis = new Set<MotLu>();
  const motsParPage = new Map(pages.map((page) => [page.page, page.mots ?? []] as const));
  for (const zone of zones) {
    const demande: DemandeDeRelecture = {
      page: zone.page,
      x: zone.x,
      y: zone.y,
      l: zone.l,
      h: zone.h,
      pourquoi: zone.pourquoi,
    };
    const lu = await relire(demande);
    const retenu = lu === undefined ? undefined : valeurDeCellule(lu.trim());
    traces.push({
      ...demande,
      rangee: zone.rangee,
      colonne: zone.colonne,
      ...(lu === undefined ? {} : { lu }),
      ...(retenu === undefined ? {} : { retenu }),
    });
    if (retenu === undefined) continue;
    // Une cellule suspecte est déjà remplie : la table garde la première valeur qu'elle range
    // dans une cellule, donc ajouter la valeur relue à côté ne changerait rien. Le mot démenti
    // doit partir — et c'est la seule substitution que ce module s'autorise, parce que c'est la
    // table elle-même qui a déclaré cette valeur en défaut.
    if (zone.valeurActuelle !== undefined) {
      if (retenu === zone.valeurActuelle) continue;
      const ancien = (motsParPage.get(zone.page) ?? []).find(
        (mot) =>
          !dementis.has(mot) &&
          valeurDeCellule(mot.texte) === zone.valeurActuelle &&
          mot.y < zone.y + zone.h &&
          mot.y + mot.h > zone.y &&
          mot.x >= zone.x &&
          mot.x <= zone.x + zone.l,
      );
      // Sans le mot d'origine sous la main, on ne remplace rien : mieux vaut une cellule
      // suspecte signalée qu'une valeur posée à côté d'une autre, sans qu'on sache laquelle la
      // table retiendra.
      if (ancien === undefined) continue;
      dementis.add(ancien);
      traces[traces.length - 1] = { ...traces.at(-1)!, remplace: zone.valeurActuelle };
    }
    const ecrit = String(retenu);
    // La boîte du mot ajouté : la largeur de ce qu'il écrit, à l'échelle de la zone, et la
    // hauteur de la rangée. Posé au bord gauche de la zone, qui commence une demi-largeur de
    // nombre avant le centre de la colonne : la table le rangera dans cette colonne-là, sa
    // tolérance étant la moitié de l'écart entre colonnes.
    const parCaractere = ecrit.length === 0 ? zone.l : zone.l / 3;
    ajouts.set(zone.page, [
      ...(ajouts.get(zone.page) ?? []),
      { texte: ecrit, x: zone.x, y: zone.y, l: parCaractere * ecrit.length, h: zone.h },
    ]);
  }

  return {
    pages: pages.map((page) => {
      const siens = ajouts.get(page.page);
      // Un démenti ne survient jamais sans l'ajout qui le remplace, et sur la même page : une
      // page sans ajout est donc une page intacte, et il n'y a rien à reconstruire.
      if (page.mots === undefined || siens === undefined) return page;
      return { ...page, mots: [...page.mots.filter((mot) => !dementis.has(mot)), ...siens] };
    }),
    traces,
    enDefaut: zones.length,
  };
}
