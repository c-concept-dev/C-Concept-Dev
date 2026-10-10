import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Prépare la bibliothèque d'essai pour que la façade ait quelque chose à servir.
 *
 *      pnpm --filter @lienotheque/worker exec tsx scripts/preparer-essai.ts
 *
 *  Trois écritures, toutes dans des bases créées pour le lot E1 : inscrire la bibliothèque au
 *  registre, la publier sur sa place, et déposer la correspondance que la façade lit. Sans la
 *  troisième, les quatre routes répondent « indisponible » — ce qui est le bon comportement,
 *  mais ne prouve rien.
 *
 *  Le script **refuse toute base dont le nom ne finit pas par « -essai »**. Il écrit, donc il
 *  doit dire où il a le droit d'écrire, et la règle vit ici plutôt que dans l'attention de qui
 *  tape la commande.
 *
 *  Les données qu'il pose sont inventées : aucune œuvre, aucun texte réel (règle 5). */

const BIBLIOTHEQUE = process.argv[2] ?? "lienotheque-essai";
const REGISTRE = process.argv[3] ?? "lienotheque-registre";
const CLE = process.argv[4] ?? "essai";

if (!BIBLIOTHEQUE.endsWith("-essai")) {
  console.error(`Refus : « ${BIBLIOTHEQUE} » n'est pas une base d'essai.`);
  process.exit(1);
}

const wrangler = (...arguments_: string[]): string =>
  execFileSync("npx", ["wrangler", ...arguments_], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const executer = (base: string, sql: string): void => {
  const fichier = join(mkdtempSync(join(tmpdir(), "preparer-")), "ordre.sql");
  writeFileSync(fichier, sql);
  wrangler("d1", "execute", base, "--remote", `--file=${fichier}`, "--yes");
};

const maintenant = new Date().toISOString();

/** La correspondance que la façade lit. C'est une **donnée** : les noms de champs de sortie
 *  appartiennent à l'application qu'on doit servir, les axes au classement de la bibliothèque.
 *  Celle-ci est d'essai, et ses axes portent des noms sans domaine. */
const CORRESPONDANCE = {
  book_id: { colonne: "document.id" },
  book_title: { colonne: "document.titre" },
  content: { colonne: "passage.texte" },
  chunk_index: { colonne: "passage.rang" },
  page_number: { colonne: "ancre.page" },
  chapter: null,
  page_end: null,
};

console.log(`Inscription de « ${CLE} » au registre…`);
executer(
  REGISTRE,
  `INSERT OR REPLACE INTO bibliotheque_publiee
     (cle, nom, etat, liaison, prefixe, region, schema_version, publiee_le, maj_le)
   VALUES ('${CLE}', 'Bibliothèque d''essai', 'publiee', 'BIB_1', '${CLE}/', 'weur', 4, '${maintenant}', '${maintenant}');
   INSERT INTO journal_audit (id, objet, operation, auteur, detail, fait_le)
   VALUES ('${crypto.randomUUID()}', '${CLE}', 'publication', 'preparer-essai', 'place BIB_1, bibliothèque d''essai', '${maintenant}');`,
);

console.log("Dépôt de la correspondance de la façade…");
executer(
  BIBLIOTHEQUE,
  `INSERT OR REPLACE INTO schema_bibliotheque (cle, version, contenu)
   VALUES ('facade', 1, '${JSON.stringify(CORRESPONDANCE).replaceAll("'", "''")}');`,
);

console.log("Semis de quelques passages lisibles…");
const document = crypto.randomUUID();
const version = crypto.randomUUID();
const phrases = [
  "Le premier passage parle de mesure et de page imprimée.",
  "Le deuxième passage parle de version active et de repère.",
  "Le troisième passage parle de lien, de preuve et de confiance.",
];
executer(
  BIBLIOTHEQUE,
  [
    `INSERT OR REPLACE INTO document (id, bibliotheque_id, titre, cree_le) VALUES ('${document}', '${CLE}', 'Document d''essai', '${maintenant}');`,
    `INSERT OR REPLACE INTO version (id, document_id, numero, etat, active, recette_id, recette_ver, cree_le) ` +
      `VALUES ('${version}', '${document}', 1, 'active', 1, 'essai', 1, '${maintenant}');`,
    ...phrases.flatMap((phrase, rang) => {
      const ancre = crypto.randomUUID();
      return [
        `INSERT OR REPLACE INTO ancre (id, version_id, fichier, selecteur) VALUES ('${ancre}', '${version}', '${"e".repeat(64)}', '{"type":"page","page":${rang + 1}}');`,
        `INSERT OR REPLACE INTO passage (id, version_id, ancre_id, rang, texte) VALUES ('${crypto.randomUUID()}', '${version}', '${ancre}', ${rang}, '${phrase.replaceAll("'", "''")}');`,
      ];
    }),
  ].join("\n"),
);

console.log("\nFait. La façade a de quoi répondre. Pour l'éprouver par-dessus le réseau :");
console.log(`  curl -s -X POST "<adresse du Worker>/search-library" \\`);
console.log(`    -H 'content-type: application/json' -H "x-api-key: $JETON" \\`);
console.log(`    -d '{"query":"mesure","topK":5}'`);
