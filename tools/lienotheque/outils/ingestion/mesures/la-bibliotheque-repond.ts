/** Une bibliothèque déposée répond-elle ? (RCH-07, RCH-09, BAS-02)
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx \
 *        mesures/la-bibliotheque-repond.ts <racine de la bibliothèque> [combien]
 *
 *  ## Ce qu'il lit, et par où
 *
 *  Ce banc ne traite rien : il lit **une bibliothèque déjà déposée**, exactement par où l'écran la
 *  lit — la table des versions actives, puis l'instantané de chacune, puis `chercher`. C'est le
 *  chemin de `passages_de_document` et de l'écran de recherche, sans l'hôte Rust entre les deux.
 *
 *  ## Ce qu'il vérifie, document par document
 *
 *  | | |
 *  |---|---|
 *  | la version active existe | un document traité qu'aucun pointeur ne désigne est invisible |
 *  | l'instantané porte du texte | une version vide passe les contrôles et ne se voit qu'à la recherche |
 *  | la recherche retrouve une phrase prise dedans | c'est la promesse de RCH-07 |
 *  | la citation tombe sur le passage qui porte le texte | c'est celle de RCH-09 |
 *
 *  La phrase est prise **au milieu** d'un document, contiguë, et jamais soufflée : un banc à qui
 *  l'on dicte sa question ne prouve rien d'un corpus de deux cent cinquante.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Passage, VueBibliotheque } from "@lienotheque/contrats";
import { chercher } from "@lienotheque/noyau";

const [racine, combien = "12"] = process.argv.slice(2);
if (racine === undefined || !existsSync(racine)) {
  console.error("Attendu : <racine de la bibliothèque> [combien]");
  process.exit(2);
}

type Pointeur = { readonly version: string };
const actives = JSON.parse(readFileSync(join(racine, "base/actives.json"), "utf8")) as Record<string, Pointeur>;
const empreintes = Object.keys(actives).sort();
console.log(`  ${empreintes.length} document(s) avec une version active\n`);

const COMBIEN = Math.min(Number.parseInt(combien, 10), empreintes.length);
let repondent = 0;
let justes = 0;
const peines: string[] = [];

for (let rang = 0; rang < COMBIEN; rang += 1) {
  // Répartis dans la table plutôt que pris au début : les premiers documents d'un corpus se
  // ressemblent, et douze voisins ne disent rien des deux cent cinquante.
  const empreinte = empreintes[Math.floor((empreintes.length * rang) / COMBIEN)]!;
  const version = actives[empreinte]!.version;
  const instantane = join(racine, "base/versions", `${version}.json`);
  if (!existsSync(instantane)) {
    peines.push(`${empreinte.slice(0, 10)} — la version active ${version} n'a jamais été écrite`);
    continue;
  }

  const lu = JSON.parse(readFileSync(instantane, "utf8")) as { vue: unknown; passages: unknown[] };
  const vue = VueBibliotheque.parse(lu.vue);
  const passages = (lu.passages ?? []).map((un) => Passage.parse(un));
  if (passages.length === 0) {
    peines.push(`${empreinte.slice(0, 10)} — version active sans aucun texte`);
    continue;
  }

  const auMilieu = passages[Math.floor(passages.length / 2)]!;
  const mots = auMilieu.texte.split(/\s+/).filter((mot) => mot !== "");
  const debut = mots.findIndex((mot, index) => index > mots.length / 3 && /^[\p{L}]{6,}$/u.test(mot));
  const phrase = debut < 0 ? "" : mots.slice(debut, debut + 5).join(" ");
  if (phrase === "") {
    peines.push(`${empreinte.slice(0, 10)} — pas assez de mots pour une recherche`);
    continue;
  }

  const groupes = chercher(vue, phrase, { passages });
  const rendu = groupes.find((groupe) => groupe.genre === "page")?.resultats[0];
  if (rendu === undefined) {
    peines.push(`${empreinte.slice(0, 10)} — « ${phrase} » : la recherche ne rend rien`);
    continue;
  }
  repondent += 1;

  // La citation doit désigner le passage qui porte réellement le texte.
  const porteur = passages.find((un) => un.texte.includes(phrase))!;
  const cite = rendu.page === undefined ? `${vue.mots.page.un} ${porteur.page} du document` : `${vue.mots.page.un} ${rendu.page}`;
  const juste = porteur.pageImprimee === undefined ? rendu.page === undefined : rendu.page === porteur.pageImprimee;
  if (juste) justes += 1;
  else peines.push(`${empreinte.slice(0, 10)} — cite « ${cite} » pour un texte au rang ${porteur.page}`);

  console.log(`  ${juste ? "✓" : "✗"} ${vue.nom.slice(0, 28).padEnd(28)} ${String(passages.length).padStart(4)} passages · ${cite}`);
}

console.log(`\n  répondent à la recherche : ${repondent}/${COMBIEN}`);
console.log(`  citation juste           : ${justes}/${COMBIEN}`);
if (peines.length > 0) {
  console.log("\n  Ce qui a peiné :");
  for (const peine of peines) console.log(`   - ${peine}`);
  process.exitCode = 1;
}
