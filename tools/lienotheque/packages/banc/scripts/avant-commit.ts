/** Le juge du crochet de pré-commit : il lit l'index, décide, et explique son refus.
 *
 *  Il ne contient aucune règle : elles sont dans `verdictAvantCommit`, qui est pure et éprouvée.
 *  Ici, seulement les trois gestes qu'une fonction pure ne peut pas faire — lire l'index, lire la
 *  liste des termes, et sortir avec un code.
 *
 *  `--racine <chemin>` sert à l'éprouver sur un dépôt fabriqué pour le contrôle. Sans lui, le
 *  dossier courant.
 *
 *     npx tsx packages/banc/scripts/avant-commit.ts [--racine <chemin>]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { indexDuProjet } from "../src/index-du-projet.js";
import { contenuDeLIndex } from "../src/rien-de-fantome.js";
import { verdictAvantCommit, type GardeDuVocabulaire } from "../src/avant-commit.js";

const arguments_ = process.argv.slice(2);
const place = arguments_.indexOf("--racine");
const racine = place === -1 ? process.cwd() : (arguments_[place + 1] ?? process.cwd());

const { entrees, total, prefixe } = indexDuProjet(racine);
const suivis = entrees.map((entree) => entree.chemin);

/** Un juge qui ne lit RIEN est vert pour rien : ce refus-ci le dit, et une mutation le tue.
 *
 *  Il y en avait un second, « les chemins lus sont ceux du dépôt entier » : aucune mutation ne le
 *  tuait, et en cherchant laquelle l'aurait tué j'ai trouvé qu'il était **faux**. Un dépôt dont
 *  tout le contenu vit sous le préfixe du projet est légitime, et ce refus l'aurait accusé. Ce que
 *  le compte a de bon à dire, il le dit maintenant en clair — « N du projet sur M » — et c'est le
 *  contrôle qui lit ces deux nombres. */
if (suivis.length === 0) {
  console.error(
    "\nCROCHET EN DÉFAUT — l'index du commit ne porte AUCUN chemin du projet." +
      "\nLe juge n'aurait rien lu, et un garde-fou qui ne lit rien est vert pour rien.\n",
  );
  process.exit(2);
}

const garde = JSON.parse(
  readFileSync(join(racine, "fixtures/termes-de-domaine.json"), "utf8"),
) as GardeDuVocabulaire;

const { refus } = verdictAvantCommit({ suivis, lire: contenuDeLIndex(racine), garde });

if (refus.length === 0) {
  console.log(
    `avant-commit : ${suivis.length} chemin(s) du projet sur ${total} dans l'index du commit` +
      `${prefixe === "" ? "" : ` (préfixe « ${prefixe} » retiré)`}, rien à redire.`,
  );
  process.exit(0);
}

console.error(`\nCOMMIT REFUSÉ — ${refus.length} faute(s) dans ce que l'index porte :\n`);
for (const raison of refus) console.error(`  · ${raison}`);
console.error(
  "\nCes règles sont celles du contrôle complet, appliquées plus tôt : une faute trouvée ici coûte" +
    "\nun geste, la même trouvée par l'intégration continue coûte une branche cassée." +
    "\n\n--no-verify est INTERDIT (registre du 7 novembre 2026). Contourner ce crochet est une" +
    "\ndécision de Christophe, pas un raccourci.\n",
);
process.exit(1);
