import { execFileSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ordreDeRetrait } from "../src/ordre-de-retrait.js";

/** L'épreuve que SEC-10 réclame : une sauvegarde, une **restauration réelle**, chronométrée.
 *
 *      pnpm --filter @lienotheque/worker exec tsx scripts/epreuve-restauration.ts semer <base> [passages]
 *      pnpm --filter @lienotheque/worker exec tsx scripts/epreuve-restauration.ts eprouver <base> <vers> <dossier>
 *
 *  Elle se fait **avant qu'aucune donnée réelle n'existe**, sur une base d'essai nommée comme
 *  telle et semée de texte inventé. Une restauration qu'on éprouve le jour où on en a besoin
 *  n'est pas une sauvegarde, c'est un espoir.
 *
 *  Ce que l'épreuve ne couvre pas, et qu'il faut dire : les objets du compartiment. Ils n'en ont
 *  pas besoin — ils sont adressés par leur empreinte, jamais réécrits, et l'ordinateur en garde
 *  l'original. **R2 est la copie, le Mac est l'original.** La sauvegarde des fichiers, c'est le
 *  dossier de la bibliothèque, qui existe déjà.
 */

const [geste, base, ...reste] = process.argv.slice(2);
const secondes = (depuis: number) => `${((Date.now() - depuis) / 1000).toFixed(1)} s`;
const mo = (octets: number) => `${(octets / 1e6).toFixed(1)} Mo`;

/** Appelle wrangler et rend sa sortie. Jamais de `shell: true` : les arguments passent tels
 *  quels, sans qu'un nom de fichier puisse se faire prendre pour une commande. */
function wrangler(...arguments_: string[]): string {
  return execFileSync("npx", ["wrangler", ...arguments_], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
}

/** Les tables d'une base, avec leur définition, sans celles que l'hébergeur se réserve. */
function tablesDe(base: string): readonly { readonly nom: string; readonly sql: string }[] {
  const brut = wrangler(
    "d1",
    "execute",
    base,
    "--remote",
    "--json",
    "--command",
    "SELECT name, COALESCE(sql, '') AS sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%' ORDER BY name",
  );
  const lignes = JSON.parse(brut.slice(brut.indexOf("[")))[0].results as { name: string; sql: string }[];
  return lignes.map((ligne) => ({ nom: ligne.name, sql: ligne.sql }));
}

/** Du texte qui ressemble à un passage sans en être un : aucune œuvre n'entre ici (règle 5).
 *  La longueur suit ce qu'on a relevé sur la bibliothèque à reprendre — environ 3 400
 *  caractères — parce qu'un chronomètre pris sur des lignes courtes ne dirait rien. */
function passageInvente(rang: number): string {
  const mots = ["mesure", "page", "repère", "version", "lien", "passage", "élément", "document", "ancre", "vue"];
  const parts: string[] = [`Passage inventé numéro ${rang}.`];
  let longueur = parts[0]!.length;
  let graine = rang * 2654435761;
  while (longueur < 3400) {
    graine = (graine * 1103515245 + 12345) % 2147483648;
    const mot = mots[graine % mots.length]!;
    parts.push(mot);
    longueur += mot.length + 1;
  }
  return parts.join(" ");
}

if (geste === "semer") {
  const combien = Number(reste[0] ?? 22022);
  if (base === undefined) throw new Error("Attendu : semer <base> [passages]");

  // Un seul fichier SQL plutôt que des milliers d'appels : ce qu'on chronomètre ensuite est la
  // restauration, pas la patience du réseau.
  const debut = Date.now();
  const lignes: string[] = ["PRAGMA defer_foreign_keys = true;"];
  const documentId = randomUUID();
  const versionId = randomUUID();
  lignes.push(
    `INSERT INTO document (id, bibliotheque_id, titre, cree_le) VALUES ('${documentId}', 'essai', 'Document semé', '${new Date().toISOString()}');`,
    `INSERT INTO version (id, document_id, numero, etat, active, recette_id, recette_ver, cree_le) ` +
      `VALUES ('${versionId}', '${documentId}', 1, 'active', 1, 'semee', 1, '${new Date().toISOString()}');`,
  );
  for (let rang = 0; rang < combien; rang += 1) {
    const texte = passageInvente(rang).replace(/'/g, "''");
    lignes.push(`INSERT INTO passage (id, version_id, rang, texte) VALUES ('${randomUUID()}', '${versionId}', ${rang}, '${texte}');`);
  }
  const fichier = join(process.env["TMPDIR"] ?? "/tmp", `semence-${base}.sql`);
  writeFileSync(fichier, lignes.join("\n"));
  console.log(`Semence écrite : ${combien} passages, ${mo(statSync(fichier).size)}, en ${secondes(debut)}`);

  const envoi = Date.now();
  wrangler("d1", "execute", base, "--remote", `--file=${fichier}`, "--yes");
  console.log(`Semée dans ${base} en ${secondes(envoi)}`);
} else if (geste === "eprouver") {
  const [vers, dossier] = reste;
  if (base === undefined || vers === undefined || dossier === undefined)
    throw new Error("Attendu : eprouver <base> <base de restauration> <dossier de sauvegarde>");

  // Un export porte ses « CREATE TABLE » : la cible doit être vide, sinon l'import bute sur une
  // table existante. On la vide donc — mais **seulement si son nom dit que c'est une base
  // d'essai**. Une épreuve capable d'effacer une vraie base est une épreuve que personne ne
  // devrait lancer, et le garde-fou vit ici plutôt que dans la prudence de qui tape la commande.
  if (!vers.endsWith("-essai")) {
    console.error(`Refus : « ${vers} » n'est pas une base d'essai. La cible d'une restauration doit finir par « -essai ».`);
    process.exit(1);
  }
  // Les suppressions partent en **un seul lot, contraintes différées**. Une à une et dans
  // l'ordre alphabétique, elles se cassent les unes sur les autres : effacer `document` relance
  // une cascade vers `ancre`, que l'ordre alphabétique avait déjà retiré, et SQLite répond
  // « no such table ». L'export lui-même ouvre par le même pragma, pour la même raison.
  const aVider = ordreDeRetrait(tablesDe(vers));
  if (aVider.length > 0) {
    const menage = join(process.env["TMPDIR"] ?? "/tmp", `menage-${vers}.sql`);
    writeFileSync(menage, aVider.map((table) => `DROP TABLE IF EXISTS "${table}";`).join("\n"));
    wrangler("d1", "execute", vers, "--remote", `--file=${menage}`, "--yes");
    console.log(`Cible vidée : ${aVider.length} table(s) retirée(s) de ${vers}`);
  }

  mkdirSync(dossier, { recursive: true });
  const horodatage = new Date().toISOString().replace(/[:.]/g, "-");
  const sauvegarde = join(dossier, `${base}-${horodatage}.sql`);

  const exportation = Date.now();
  wrangler("d1", "export", base, "--remote", `--output=${sauvegarde}`);
  const poids = statSync(sauvegarde).size;
  const tempsExport = secondes(exportation);
  console.log(`Sauvegarde : ${mo(poids)} en ${tempsExport}`);

  const restauration = Date.now();
  wrangler("d1", "execute", vers, "--remote", `--file=${sauvegarde}`, "--yes");
  const tempsRestauration = secondes(restauration);
  console.log(`Restauration dans ${vers} : ${tempsRestauration}`);

  // Une restauration qu'on ne compare pas est une restauration qu'on croit. Table par table.
  // Une requête par table, et non un grand SELECT composé : D1 refuse au-delà d'un certain
  // nombre de termes (« too many terms in compound SELECT »), et une astuce qui économise des
  // allers-retours ne vaut pas une épreuve qui s'arrête à mi-chemin.
  const compter = (laquelle: string): Record<string, number> => {
    const comptes: Record<string, number> = {};
    for (const { nom } of tablesDe(laquelle)) {
      const brut = wrangler("d1", "execute", laquelle, "--remote", "--json", "--command", `SELECT COUNT(*) AS n FROM "${nom}"`);
      comptes[nom] = (JSON.parse(brut.slice(brut.indexOf("[")))[0].results as { n: number }[])[0]?.n ?? 0;
    }
    return comptes;
  };

  const source = compter(base);
  const copie = compter(vers);
  const ecarts = Object.keys(source)
    .filter((table) => table !== "d1_migrations")
    .filter((table) => source[table] !== copie[table]);

  console.log("\n| Table | Source | Restaurée |");
  console.log("|---|---:|---:|");
  for (const table of Object.keys(source).sort()) console.log(`| ${table} | ${source[table] ?? 0} | ${copie[table] ?? 0} |`);

  console.log(`\nSauvegarde ${mo(poids)} en ${tempsExport} · restauration en ${tempsRestauration}`);
  if (ecarts.length > 0) {
    console.error(`\nÉCART sur ${ecarts.join(", ")} — la restauration n'est pas fidèle.`);
    process.exit(1);
  }
  console.log("Restauration fidèle : chaque table a le même compte des deux côtés.");
} else {
  console.error("Geste attendu : « semer » ou « eprouver ».");
  process.exit(2);
}
