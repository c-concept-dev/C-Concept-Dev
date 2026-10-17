import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SchemaBibliotheque } from "@lienotheque/contrats";
import { approchesDeLExport, importerLesClassements, type Appariement } from "./importer-classements.js";

/** Reprend le classement d'une base existante et l'écrit dans une bibliothèque (CLA-01, CLA-03).
 *
 *     node outils/ingestion/src/classer.ts --bibliotheque <racine> \
 *          --correspondance <correspondance.json> --approches <approches.json> \
 *          [--axe-approche approche] [--axe-langue langue] [--ecrire]
 *
 *  **Rien n'est écrit sans `--ecrire`.** Un import qui range deux cent cinquante documents mérite
 *  d'être lu avant d'être fait : par défaut la commande dit ce qu'elle ferait, et s'arrête là.
 *
 *  Les deux tables sont des **données personnelles** : elles vivent hors du dépôt, et leurs
 *  chemins sont donnés à l'appel. Rien de leur contenu n'entre ici.
 *
 *  Ce que la commande ne fait pas : deviner. Un document sans appariement n'est pas classé, un
 *  ouvrage sans approche connue non plus, et chacun ressort nommé avec sa raison — le classement
 *  ne se déduit jamais du contenu (CLA-03). */

const lire = (nom: string): string | undefined => {
  const rang = process.argv.indexOf(`--${nom}`);
  return rang === -1 ? undefined : process.argv[rang + 1];
};

const exige = (nom: string): string => {
  const valeur = lire(nom);
  if (valeur === undefined) {
    console.error(`Argument manquant : --${nom}`);
    process.exit(2);
  }
  return valeur;
};

const racine = resolve(exige("bibliotheque"));
const base = join(racine, "base");
const ecrire = process.argv.includes("--ecrire");
const axes = { approche: lire("axe-approche") ?? "approche", langue: lire("axe-langue") ?? "langue" };

const charger = (chemin: string): unknown => JSON.parse(readFileSync(chemin, "utf8"));

const correspondance = charger(resolve(exige("correspondance"))) as {
  apparies?: readonly Appariement[];
  hors_perimetre?: readonly { book_id: string }[];
};
const apparies = correspondance.apparies ?? [];
if (apparies.length === 0) {
  console.error("Aucun appariement dans la table : il n'y a rien à reprendre.");
  process.exit(2);
}
const approches = approchesDeLExport(charger(resolve(exige("approches"))));
const horsPerimetre = (correspondance.hors_perimetre ?? []).map((un) => un.book_id);

const description = charger(join(base, "bibliotheque.json")) as { schema?: unknown };
const schema = SchemaBibliotheque.parse(description.schema);
for (const cle of [axes.approche, axes.langue])
  if (!schema.axes.some((axe) => axe.cle === cle)) {
    console.error(`Cette bibliothèque n'a pas d'axe « ${cle} ». Ses axes : ${schema.axes.map((a) => a.cle).join(", ")}.`);
    process.exit(2);
  }

// Les documents de la bibliothèque : ceux dont un travail a abouti. Un travail en échec n'a pas
// de version, donc rien à classer.
const documents = readdirSync(join(base, "travaux"))
  .filter((nom) => nom.endsWith(".json"))
  .map((nom) => charger(join(base, "travaux", nom)) as { etat?: string; empreinte?: string; sujet?: { nom?: string } })
  .filter((travail) => travail.etat === "termine" && typeof travail.empreinte === "string")
  .map((travail) => ({ empreinte: travail.empreinte as string, nom: travail.sujet?.nom ?? "" }))
  .sort((un, autre) => un.nom.localeCompare(autre.nom, "fr"));

const fait = importerLesClassements({ schema, axes, documents, apparies, approches, horsPerimetre });

console.log(`bibliothèque   : ${racine}`);
console.log(`appariements   : ${apparies.length} · ouvrages exportés : ${approches.length}`);
console.log(`hors périmètre : ${horsPerimetre.length}`);
console.log(`documents      : ${documents.length} traité(s)\n`);

for (const document of documents) {
  const range = fait.table[document.empreinte];
  const sur = range?.axes[axes.approche];
  const dit =
    range !== undefined
      ? `${sur?.type === "reference" ? sur.valeurs.join(", ") : "?"}`
      : (fait.ecartes.find((un) => un.nom === document.nom)?.raison ?? "non apparié — à classer à la main");
  console.log(`  ${document.nom.slice(0, 48).padEnd(50)} ${dit}`);
}

const ranges = Object.keys(fait.table).length;
console.log(
  `\nrangés : ${ranges} · non appariés : ${fait.sansAppariement.length} · écartés : ${fait.ecartes.length}`,
);

if (!ecrire) {
  console.log("\nRien n'a été écrit. Relancez avec --ecrire pour enregistrer.");
  process.exit(0);
}

const chemin = join(base, "classements.json");
writeFileSync(chemin, `${JSON.stringify(fait.table, null, 2)}\n`);
console.log(`\n${chemin} écrit : ${ranges} document(s) rangé(s).`);
