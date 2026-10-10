import { BibliothequePubliee, type LigneAudit, type OperationSensible } from "@lienotheque/contrats";
import { apres, empechePublication, liaisonsLibres, prefixeDe, type Geste } from "@lienotheque/noyau";

/** Lire et écrire le registre des bibliothèques publiées (HEB-03).
 *
 *  Tout ce qui sort d'ici est passé par son contrat : une ligne de base n'est pas une donnée de
 *  confiance, même quand c'est nous qui l'avons écrite — une migration mal pensée, un import,
 *  une main sur la console, et la table dit autre chose que ce que le code suppose.
 *
 *  Rien ici ne crée ni ne supprime de base : le Worker n'en a pas le pouvoir, et c'est voulu
 *  (SEC-08). Publier, c'est inscrire une bibliothèque sur une place déjà reliée. */

/** Le peu qu'on demande à une liaison D1. Déclaré ici plutôt qu'importé : le Worker ne dépend
 *  pas des types de l'hébergeur pour être testable. */
export type BaseSql = {
  readonly prepare: (sql: string) => {
    readonly bind: (...valeurs: unknown[]) => {
      readonly all: <T>() => Promise<{ results: T[] }>;
      readonly first: <T>() => Promise<T | null>;
      readonly run: () => Promise<unknown>;
    };
  };
};

type LigneRegistre = {
  cle: string;
  nom: string;
  etat: string;
  liaison: string | null;
  prefixe: string;
  region: string;
  schema_version: number;
  publiee_le: string | null;
  maj_le: string;
};

const versContrat = (ligne: LigneRegistre): BibliothequePubliee =>
  BibliothequePubliee.parse({
    cle: ligne.cle,
    nom: ligne.nom,
    etat: ligne.etat,
    ...(ligne.liaison === null ? {} : { liaison: ligne.liaison }),
    prefixe: ligne.prefixe,
    region: ligne.region,
    schemaVersion: ligne.schema_version,
    ...(ligne.publiee_le === null ? {} : { publieeLe: ligne.publiee_le }),
    majLe: ligne.maj_le,
  });

const CHAMPS = "cle, nom, etat, liaison, prefixe, region, schema_version, publiee_le, maj_le";

export async function toutesLesBibliotheques(registre: BaseSql): Promise<readonly BibliothequePubliee[]> {
  const { results } = await registre.prepare(`SELECT ${CHAMPS} FROM bibliotheque_publiee ORDER BY cle`).bind().all<LigneRegistre>();
  return results.map(versContrat);
}

export async function laBibliotheque(registre: BaseSql, cle: string): Promise<BibliothequePubliee | undefined> {
  const ligne = await registre.prepare(`SELECT ${CHAMPS} FROM bibliotheque_publiee WHERE cle = ?`).bind(cle).first<LigneRegistre>();
  return ligne === null ? undefined : versContrat(ligne);
}

/** Inscrit une opération sensible au journal (SEC-07).
 *
 *  Appelée **dans le même geste** que l'opération, jamais après coup : une trace qu'on ajoute
 *  plus tard est une trace qu'on oublie, et celle qui manque est toujours celle qu'on cherche. */
export async function journaliser(
  registre: BaseSql,
  ligne: Omit<LigneAudit, "id" | "faitLe"> & { readonly id?: string; readonly faitLe?: string },
): Promise<void> {
  const complete: LigneAudit = {
    id: ligne.id ?? crypto.randomUUID(),
    objet: ligne.objet,
    operation: ligne.operation,
    auteur: ligne.auteur,
    ...(ligne.detail === undefined ? {} : { detail: ligne.detail }),
    faitLe: ligne.faitLe ?? new Date().toISOString(),
  };
  await registre
    .prepare("INSERT INTO journal_audit (id, objet, operation, auteur, detail, fait_le) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(complete.id, complete.objet, complete.operation, complete.auteur, complete.detail ?? null, complete.faitLe)
    .run();
}

export type Resultat<T> = { readonly fait: true; readonly valeur: T } | { readonly fait: false; readonly raison: string };

/** Inscrit une bibliothèque locale au registre, sans la publier.
 *
 *  Une bibliothèque entre d'abord comme locale, même quand on compte la publier dans la seconde
 *  qui suit : l'état « publiée » dit que quelque chose est servi, et rien ne l'est encore. */
export async function inscrire(
  registre: BaseSql,
  depot: { readonly cle: string; readonly nom: string; readonly region: string; readonly schemaVersion: number },
  maintenant: string,
): Promise<Resultat<BibliothequePubliee>> {
  if (await laBibliotheque(registre, depot.cle) !== undefined)
    return { fait: false, raison: "Une bibliothèque porte déjà ce nom court." };

  const inscrite = BibliothequePubliee.parse({
    cle: depot.cle,
    nom: depot.nom,
    etat: "locale",
    prefixe: prefixeDe(depot.cle),
    region: depot.region,
    schemaVersion: depot.schemaVersion,
    majLe: maintenant,
  });
  await registre
    .prepare(
      "INSERT INTO bibliotheque_publiee (cle, nom, etat, liaison, prefixe, region, schema_version, publiee_le, maj_le) " +
        "VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, ?)",
    )
    .bind(inscrite.cle, inscrite.nom, inscrite.etat, inscrite.prefixe, inscrite.region, inscrite.schemaVersion, inscrite.majLe)
    .run();
  return { fait: true, valeur: inscrite };
}

/** Publie une bibliothèque sur une place libre de la réserve.
 *
 *  Les places déclarées viennent des liaisons de l'hébergeur, pas d'une liste écrite à côté. */
export async function publier(
  registre: BaseSql,
  cle: string,
  placesDeclarees: readonly string[],
  auteur: string,
  maintenant: string,
): Promise<Resultat<BibliothequePubliee>> {
  const toutes = await toutesLesBibliotheques(registre);
  const bibliotheque = toutes.find((candidate) => candidate.cle === cle);
  if (bibliotheque === undefined) return { fait: false, raison: "Bibliothèque inconnue." };

  const libres = liaisonsLibres(
    placesDeclarees as readonly `BIB_${number}`[],
    toutes.map((autre) => autre.liaison),
  );
  const empeche = empechePublication(
    bibliotheque,
    libres,
    toutes.filter((autre) => autre.cle !== cle && autre.etat !== "locale").map((autre) => autre.prefixe),
  );
  if (empeche !== undefined) return { fait: false, raison: empeche };

  const place = libres[0]!;
  const etat = apres(bibliotheque.etat, "publier");
  if (etat === undefined) return { fait: false, raison: "Cette bibliothèque ne peut pas être publiée depuis cet état." };

  await registre
    .prepare("UPDATE bibliotheque_publiee SET etat = ?, liaison = ?, publiee_le = ?, maj_le = ? WHERE cle = ?")
    .bind(etat, place, maintenant, maintenant, cle)
    .run();
  await journaliser(registre, { objet: cle, operation: "publication", auteur, detail: `place ${place}`, faitLe: maintenant });

  return { fait: true, valeur: { ...bibliotheque, etat, liaison: place, publieeLe: maintenant, majLe: maintenant } };
}

/** Cesse de servir une bibliothèque. **Rien n'est détruit** : la base garde ses lignes, le
 *  compartiment garde ses objets, et la place se libère pour une autre.
 *
 *  C'est ce qui rend le retour arrière sans perte, et c'est pour cela qu'aucune suppression ne
 *  se cache ici. Supprimer est une décision à part, qui ne passe pas par un changement d'état. */
export async function depublier(
  registre: BaseSql,
  cle: string,
  auteur: string,
  maintenant: string,
): Promise<Resultat<BibliothequePubliee>> {
  const bibliotheque = await laBibliotheque(registre, cle);
  if (bibliotheque === undefined) return { fait: false, raison: "Bibliothèque inconnue." };

  const etat = apres(bibliotheque.etat, "depublier" satisfies Geste);
  if (etat === undefined) return { fait: false, raison: "Cette bibliothèque n'est pas servie." };

  await registre
    .prepare("UPDATE bibliotheque_publiee SET etat = ?, liaison = NULL, maj_le = ? WHERE cle = ?")
    .bind(etat, maintenant, cle)
    .run();
  await journaliser(registre, {
    objet: cle,
    operation: "depublication" satisfies OperationSensible,
    auteur,
    detail: `place ${bibliotheque.liaison ?? "—"} libérée, rien n'est supprimé`,
    faitLe: maintenant,
  });

  const { liaison: _place, publieeLe: _date, ...reste } = bibliotheque;
  return { fait: true, valeur: { ...reste, etat, majLe: maintenant } };
}
