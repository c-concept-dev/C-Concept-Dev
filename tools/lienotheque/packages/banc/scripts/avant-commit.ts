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
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { indexDuProjet, placeDuProjet } from "../src/index-du-projet.js";
import { contenuDeLIndex } from "../src/rien-de-fantome.js";
import { verdictAvantCommit, type GardeDuVocabulaire } from "../src/avant-commit.js";
import {
  PRIX_MESURE,
  refusDeLEcartAuDisque,
  refusDesEpreuvesRust,
  rustAEprouver,
  type EpreuveRust,
  type Lancement,
} from "../src/epreuve-rust.js";

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

/** L'épreuve de l'hôte Rust, lancée pour de vrai (lot prioritaire du 16 novembre 2026).
 *
 *  Elle n'est payée que par un commit qui touche `apps/app/src-tauri/` — mesuré **54 s** sur le cas
 *  le plus coûteux. C'est une exception assumée à la règle écrite de ce crochet, « seulement les
 *  garde-fous rapides » : trois erreurs Rust ont été découvertes après la poussée, et une minute
 *  par commit de l'hôte coûte moins qu'une branche cassée. Décision de Christophe.
 *
 *  Elle ne part pas si une faute rapide a déjà refusé le commit : la minute ne servirait à rien,
 *  le commit étant refusé de toute façon. */
function refusDeLHoteRust(): readonly string[] {
  const { depot, prefixe } = placeDuProjet(racine);
  const debut = prefixe === "" ? "" : `${prefixe}/`;
  const duDepot = (commande: readonly string[]): readonly string[] =>
    (execFileSync("git", [...commande], { cwd: depot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }) as string)
      .split("\n")
      .filter((ligne) => ligne.startsWith(debut))
      .map((ligne) => ligne.slice(debut.length));

  // **Ce que le commit CHANGE, et non ce que l'index porte.** Les autres règles lisent l'index
  // entier — « ce commit emporte-t-il un mot de domaine ? » se demande de tout ce qu'il porte.
  // Celle-ci non : l'index porte les 78 fichiers de l'hôte Rust dès qu'ils sont suivis, et la
  // décision partait donc sur **tous** les commits, documents compris. Vu sur le commit de ce lot
  // lui-même — « 78 chemin(s) de l'hôte Rust » alors qu'il n'en touchait aucun.
  const chemins = rustAEprouver(duDepot(["diff", "--cached", "--name-only"]));
  if (chemins.length === 0) return [];
  // Ce que le disque porte et que l'index ne porte pas : cargo compile le disque, ce crochet juge
  // l'index, et un verdict sur un autre arbre ne dirait rien du commit.
  const ecart = refusDeLEcartAuDisque(duDepot(["diff", "--name-only"]));
  if (ecart.length > 0) return ecart;

  const lancer = (epreuve: EpreuveRust): Lancement => {
    try {
      execFileSync(epreuve.programme, [...epreuve.arguments], {
        cwd: racine,
        encoding: "utf8",
        stdio: "pipe",
        maxBuffer: 64 * 1024 * 1024,
      });
      return { code: 0, sortie: "" };
    } catch (souci) {
      const echec = souci as { status?: number; code?: string; stdout?: string; stderr?: string };
      // `cargo` absent : on refuse plutôt que de sauter. Un commit de l'hôte Rust qu'aucune épreuve
      // n'a lu est exactement ce que ce lot existe pour empêcher, et `--no-verify` est interdit.
      if (echec.code === "ENOENT")
        return { code: 127, sortie: `${epreuve.programme} est introuvable — installez Rust (rustup), puis recommencez.` };
      return { code: echec.status ?? -1, sortie: `${echec.stdout ?? ""}${echec.stderr ?? ""}` };
    }
  };

  console.log(
    `avant-commit : ${chemins.length} chemin(s) de l'hôte Rust dans ce commit — épreuve de la suite` +
      ` entière et de tous les exemples (${PRIX_MESURE.secondes} s mesurées le plus souvent)…`,
  );
  return refusDesEpreuvesRust(chemins, lancer);
}

const tous = refus.length > 0 ? refus : [...refus, ...refusDeLHoteRust()];

if (tous.length === 0) {
  console.log(
    `avant-commit : ${suivis.length} chemin(s) du projet sur ${total} dans l'index du commit` +
      `${prefixe === "" ? "" : ` (préfixe « ${prefixe} » retiré)`}, rien à redire.`,
  );
  process.exit(0);
}

console.error(`\nCOMMIT REFUSÉ — ${tous.length} faute(s) dans ce que l'index porte :\n`);
for (const raison of tous) console.error(`  · ${raison}`);
console.error(
  "\nCes règles sont celles du contrôle complet, appliquées plus tôt : une faute trouvée ici coûte" +
    "\nun geste, la même trouvée par l'intégration continue coûte une branche cassée." +
    "\n\n--no-verify est INTERDIT (registre du 7 novembre 2026). Contourner ce crochet est une" +
    "\ndécision de Christophe, pas un raccourci.\n",
);
process.exit(1);
