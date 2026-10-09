import { MIGRATIONS, MIGRATIONS_REGISTRE_EN_LIGNE, type Migration } from "./migrations.js";

/** Les migrations telles que Wrangler les veut : un fichier `.sql` par migration, numéroté.
 *
 *  Le schéma a une seule source de vérité — les tableaux de `migrations.ts` — et D1 en reçoit une
 *  copie engendrée. Sans cela, le schéma local et le schéma en ligne divergent le jour où
 *  quelqu'un corrige un seul des deux, et la divergence ne se voit qu'au moment où elle coûte
 *  cher. Un test compare ce que le générateur rendrait à ce qui est sur le disque (CLA-01 par
 *  analogie : un fait à un seul endroit).
 *
 *  Pourquoi engendrer plutôt que de laisser Wrangler lire nos tableaux : `wrangler d1 migrations
 *  apply` ne sait lire que des fichiers, et il tient lui-même le compte de ce qui est appliqué
 *  dans une table `d1_migrations`. On lui donne ce qu'il attend, on ne l'oblige à rien. */

/** Les bases engendrées, et les migrations de chacune. */
export const BASES_D1 = {
  /** Le registre des bibliothèques publiées : une seule, pour tout le service. */
  registre: MIGRATIONS_REGISTRE_EN_LIGNE,
  /** Le schéma d'**une** bibliothèque. Chaque bibliothèque publiée a sa base, et toutes la même. */
  bibliotheque: MIGRATIONS,
} as const satisfies Record<string, readonly Migration[]>;

export type BaseD1 = keyof typeof BASES_D1;

/** Le nom de fichier d'une migration : `0001_socle.sql`. Wrangler les applique dans l'ordre
 *  lexicographique, d'où les quatre chiffres — au-delà de 9 999 migrations, on aura d'autres
 *  soucis. */
export function nomDeFichier(migration: Migration): string {
  return `${String(migration.version).padStart(4, "0")}_${migration.nom}.sql`;
}

/** Le contenu d'un fichier de migration, en-tête compris.
 *
 *  L'en-tête dit d'où vient le fichier, parce qu'un fichier engendré qu'on prend pour une source
 *  se fait corriger à la main une fois, et une seule — ensuite il est perdu. */
export function contenuDeFichier(migration: Migration, base: BaseD1): string {
  const sql = migration.sql
    .split("\n")
    .map((ligne) => ligne.replace(/^ {6}/, ""))
    .join("\n")
    .trim();
  return [
    `-- Engendré depuis packages/depot-sqlite/src/migrations.ts — NE PAS MODIFIER ICI.`,
    `-- Base : ${base} · migration ${migration.version} « ${migration.nom} »`,
    `-- Pour changer le schéma : ajoutez une migration au tableau, puis « pnpm build ».`,
    ``,
    sql,
    ``,
  ].join("\n");
}

/** Tous les fichiers d'une base, prêts à être écrits ou comparés. */
export function fichiersDe(base: BaseD1): readonly { readonly nom: string; readonly contenu: string }[] {
  return [...BASES_D1[base]]
    .sort((a, b) => a.version - b.version)
    .map((migration) => ({ nom: nomDeFichier(migration), contenu: contenuDeFichier(migration, base) }));
}
