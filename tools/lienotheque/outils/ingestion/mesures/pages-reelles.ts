/** Le compte de pages qui fait foi (lot E2, étape 1, second passage).
 *
 *     pnpm --filter @lienotheque/ingestion exec tsx mesures/pages-reelles.ts <inventaire.json>
 *
 *  L'inventaire compte les pages en cherchant un motif dans le flux : rapide, et juste la
 *  plupart du temps. Il se trompe dans deux cas, découverts en le vérifiant plutôt qu'en le
 *  croyant — et un compte qu'on n'a pas vérifié n'est pas un compte.
 *
 *  **Il surcompte** quand un document traîne des objets de page qu'aucun arbre ne réclame : des
 *  pages retirées dont les octets n'ont jamais été repris. Un document annonçait 477 pages pour
 *  158 réelles.
 *
 *  **Il sous-compte**, comme le lecteur de format lui-même, quand les pages sont rangées dans
 *  des flux d'objets comprimés. Ces documents-là se signalent par un compte nul, et ce n'est pas
 *  une curiosité d'inventaire : **le moteur ne saura pas les lire non plus.**
 *
 *  Ce banc descend l'arbre des pages, document par document, et ne lit qu'un document à la fois.
 */
import { readFile } from "node:fs/promises";
import { objetsPdf, pagesPdf } from "@lienotheque/formats";

const chemin = process.argv[2];
if (chemin === undefined) {
  console.error("Attendu : <inventaire.json>");
  process.exit(2);
}

type Releve = { chemin: string; octets: number; empreinte: string; pages: number };
const inventaire = JSON.parse(await readFile(chemin, "utf8")) as { dossier: string; releves: Releve[] };

// Un document par empreinte : recompter un doublon serait compter deux fois le même travail.
const distincts = [...new Map(inventaire.releves.map((r) => [r.empreinte, r])).values()];
console.error(`${distincts.length} documents distincts à descendre…`);

let totalArbre = 0;
let totalMotif = 0;
const ecarts: { nom: string; arbre: number; motif: number }[] = [];
const muets: string[] = [];

for (const [rang, releve] of distincts.entries()) {
  let arbre = 0;
  try {
    arbre = pagesPdf(objetsPdf(await readFile(releve.chemin))).length;
  } catch (souci) {
    muets.push(`${releve.chemin} (illisible : ${souci instanceof Error ? souci.message : souci})`);
    continue;
  }
  totalArbre += arbre;
  totalMotif += releve.pages;
  const nom = releve.chemin.slice(inventaire.dossier.length + 1);
  if (arbre === 0) muets.push(nom);
  else if (Math.abs(arbre - releve.pages) > Math.max(2, arbre * 0.02)) ecarts.push({ nom, arbre, motif: releve.pages });
  if ((rang + 1) % 25 === 0) console.error(`  ${rang + 1} / ${distincts.length}`);
}

console.log(`\n## Pages réelles — ${new Date().toISOString().slice(0, 10)}\n`);
console.log(`**${totalArbre} pages** descendues de l'arbre, contre ${totalMotif} comptées par motif.`);
console.log(`Écart : ${totalMotif - totalArbre} pages, soit ${(((totalMotif - totalArbre) / Math.max(totalArbre, 1)) * 100).toFixed(0)} %.\n`);

if (ecarts.length > 0) {
  console.log(`### Les documents où les deux comptes divergent\n`);
  console.log("| Document | Arbre | Motif |");
  console.log("|---|---:|---:|");
  for (const e of [...ecarts].sort((a, b) => b.motif - b.arbre - (a.motif - a.arbre)).slice(0, 12))
    console.log(`| ${e.nom.slice(0, 52)} | ${e.arbre} | ${e.motif} |`);
}

if (muets.length > 0) {
  console.log(`\n### ${muets.length} document(s) dont l'arbre ne rend aucune page\n`);
  console.log("Le moteur ne saura pas les lire non plus : à traiter à part, pas à ignorer.\n");
  for (const nom of muets) console.log(`- ${nom}`);
}
