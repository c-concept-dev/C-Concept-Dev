import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, relative, sep } from "node:path";

/** L'index du commit, vu DEPUIS LE PROJET, quoi qu'il y ait dans l'environnement.
 *
 *  ## Le défaut que ce module existe pour fermer
 *
 *  `git ls-files` lancé depuis le dossier du projet rend les chemins **relatifs à ce dossier**, et
 *  seulement ceux du projet — c'est ce qu'on attend. Mais si `GIT_DIR` se trouve dans
 *  l'environnement, git cesse de chercher le dépôt depuis le dossier courant : il considère ce
 *  dossier comme la racine, `rev-parse --show-prefix` répond vide, et la même commande rend **tout
 *  le dépôt**, nommé depuis sa racine.
 *
 *  Mesuré le 7 novembre 2026 sur ce dépôt : **852** chemins du projet sans `GIT_DIR`, **8147**
 *  chemins du dépôt avec. Les zones de `termes-de-domaine.json` (`packages/`, `apps/`…) ne
 *  correspondent alors plus à rien, et le garde-fou du vocabulaire devient **vert sans rien
 *  regarder** — un trou ressemble à un succès.
 *
 *  ## Ce qui déclenche vraiment le défaut, mesuré
 *
 *  Pas un vrai commit : git **n'exporte pas** `GIT_DIR` aux crochets, il n'exporte que
 *  `GIT_INDEX_FILE` — vérifié sur un dépôt fabriqué. J'avais écrit le contraire au registre.
 *  Le défaut se déclenche quand `GIT_DIR` est posé par autre chose : un geste à la main
 *  (`GIT_DIR=… git …`, que j'emploie), une enveloppe, un alias, un autre type de crochet. Un
 *  garde-fou dont la justesse dépend de qui l'appelle n'est pas un garde-fou.
 *
 *  ## La forme retenue
 *
 *  Une seule invocation, dont le résultat **ne dépend pas de l'environnement** :
 *  `git ls-files -s --full-name` depuis la **racine du dépôt**. Avec ou sans `GIT_DIR`, elle rend
 *  les mêmes chemins, nommés depuis la racine. On retient ensuite ceux du projet et on retire le
 *  préfixe — la traduction est explicite, et le compte des deux côtés est rendu pour qu'un appelant
 *  puisse refuser un index qui serait celui du dépôt entier, ou vide.
 *
 *  Et la racine du dépôt est trouvée sur le **disque**, non demandée à git : sous `GIT_DIR`,
 *  `rev-parse --show-toplevel` répond le dossier courant, c'est-à-dire la mauvaise réponse à la
 *  question qu'on pose. */

/** Où le projet se trouve dans le dépôt. */
export interface PlaceDuProjet {
  /** La racine du dépôt, trouvée en remontant jusqu'à une entrée `.git`. */
  readonly depot: string;
  /** Le chemin du projet depuis cette racine, en barres obliques, vide si le projet EST le dépôt. */
  readonly prefixe: string;
}

/** Remonte jusqu'à l'entrée `.git` — un dossier, ou un fichier dans une copie liée. */
export function placeDuProjet(racine: string): PlaceDuProjet {
  let dossier = racine;
  for (;;) {
    if (existsSync(`${dossier}/.git`))
      return { depot: dossier, prefixe: relative(dossier, racine).split(sep).join("/") };
    const parent = dirname(dossier);
    if (parent === dossier) return { depot: racine, prefixe: "" };
    dossier = parent;
  }
}

/** Une entrée de l'index : son chemin, et l'empreinte de son contenu. */
export interface EntreeDIndex {
  readonly empreinte: string;
  readonly chemin: string;
}

/** Les entrées du projet, plus de quoi vérifier qu'on n'a pas lu autre chose. */
export interface IndexDuProjet {
  /** Les entrées du projet, chemins relatifs au projet. */
  readonly entrees: readonly EntreeDIndex[];
  /** Le nombre d'entrées de l'index entier, projet compris. */
  readonly total: number;
  /** Le préfixe retiré, pour que l'appelant puisse dire ce qu'il a traduit. */
  readonly prefixe: string;
}

export function indexDuProjet(racine: string, executer = execFileSync): IndexDuProjet {
  const { depot, prefixe } = placeDuProjet(racine);
  const sortie = executer("git", ["ls-files", "-s", "--full-name"], {
    cwd: depot,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  }) as string;

  const lignes = sortie.split("\n").filter((ligne) => ligne !== "");
  const debut = prefixe === "" ? "" : `${prefixe}/`;
  const entrees: EntreeDIndex[] = [];
  for (const ligne of lignes) {
    // « <mode> <empreinte> <étage>\t<chemin> »
    const [infos, chemin] = ligne.split("\t");
    const empreinte = infos?.split(" ")[1];
    if (empreinte === undefined || chemin === undefined) continue;
    if (!chemin.startsWith(debut)) continue;
    entrees.push({ empreinte, chemin: chemin.slice(debut.length) });
  }
  return { entrees, total: lignes.length, prefixe };
}
