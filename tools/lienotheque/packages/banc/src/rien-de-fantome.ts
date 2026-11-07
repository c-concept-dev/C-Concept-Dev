import { execFileSync } from "node:child_process";
import { estDuCode, masqueDeCode } from "./lire-du-code.js";

/** Aucun fichier suivi par Git n'importe un fichier qui ne l'est pas.
 *
 *  ## Le défaut que ce garde-fou existe pour empêcher
 *
 *  Le 7 novembre 2026, la CI est restée rouge **quatre lots durant** : un `index.ts` commité
 *  exportait un module que personne n'avait commité. L'arbre de travail le portait, un clone non.
 *
 *  Le coût n'était pas quatre voyants rouges. Un typage qui s'arrête à un paquet **n'exécute pas
 *  ses tests** : les contrôles du paquet le plus lourd du projet n'ont tourné que sur un seul
 *  disque, pendant quatre lots, sans que personne le sache.
 *
 *  ## Pourquoi un contrôle local, puisque la CI l'a trouvé
 *
 *  Parce qu'elle l'a trouvé **après le push**, et quatre fois de suite. Ici, le rouge tombe sur le
 *  disque, à l'instant où le fichier manque encore à l'index — là où la correction coûte un
 *  `git add` au lieu d'une branche cassée.
 *
 *  C'est le pendant exact de la règle « jamais `git add -A` » : les chemins explicites empêchent
 *  d'emporter ce qui ne doit pas partir, ce garde-fou attrape ce qu'on a oublié d'emporter. Il
 *  manquait la seconde moitié.
 *
 *  ## Ce qu'il ne regarde pas
 *
 *  Les imports de paquets (`zod`, `node:path`, `@lienotheque/noyau`) ne sont pas des chemins : ils
 *  sont résolus par l'installateur, et ce module n'a rien à en dire. Seuls les chemins relatifs
 *  désignent un fichier du dépôt. */

/** Le contenu d'un fichier **tel qu'il sera commité** : celui de l'index, jamais celui du disque.
 *
 *  Correction de Christophe, 7 novembre 2026. La première version lisait le disque, et c'était
 *  faux dans les deux sens. Un lot en cours modifie des fichiers suivis sans les indexer :
 *
 *  - un **faux positif** — un import ajouté sur le disque, qui ne partira pas dans ce commit,
 *    était annoncé comme un fantôme ;
 *  - un **faux négatif** — un module présent sur le disque mais non indexé faisait passer pour
 *    résolu un import qui aurait cassé le clone.
 *
 *  La question n'est pas « qu'y a-t-il sur cette machine ? » mais « que contiendra le prochain
 *  commit ? ». Seul l'index y répond, et `git show :<chemin>` le lit. */
/** Tout l'index, chemin par contenu. Exposé pour qu'un contrôle puisse **compter ce qui a été
 *  lu** et le comparer à ce que `git ls-files` annonce : c'est la seule façon de voir un lecteur
 *  devenu aveugle, qui rendrait des chaînes vides et laisserait le garde-fou vert. */
export function contenusDeLIndex(racine: string, executer = execFileSync): ReadonlyMap<string, Buffer> {
  return charger(racine, executer);
}

/** Les tailles que **Git annonce** pour les objets de l'index, chemin par chemin.
 *
 *  `git cat-file --batch-check` ne lit aucun contenu : il rend l'en-tête de chaque objet. C'est la
 *  seule mesure extérieure au lecteur, donc la seule qui puisse le contredire. */
export function taillesDeLIndex(racine: string, executer = execFileSync): ReadonlyMap<string, number> {
  const entrees = entreesDeLIndex(racine, executer);
  const sortie = executer("git", ["cat-file", "--batch-check"], {
    cwd: racine,
    input: `${entrees.map((entree) => entree.empreinte).join("\n")}\n`,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }) as string;
  const parEmpreinte = new Map<string, number>();
  for (const ligne of sortie.split("\n")) {
    const [empreinte, , taille] = ligne.split(" ");
    if (empreinte !== undefined && taille !== undefined) parEmpreinte.set(empreinte, Number(taille));
  }
  return new Map(
    entrees.flatMap((entree) => {
      const taille = parEmpreinte.get(entree.empreinte);
      return taille === undefined ? [] : [[entree.chemin, taille] as const];
    }),
  );
}

/** Les entrées de l'index : un chemin, une empreinte. Lues une fois, par les deux mesures. */
function entreesDeLIndex(
  racine: string,
  executer: typeof execFileSync,
): readonly { readonly empreinte: string; readonly chemin: string }[] {
  const sortieListe = executer("git", ["ls-files", "-s"], {
    cwd: racine,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }) as string;
  return sortieListe
    .split("\n")
    .filter((ligne) => ligne !== "")
    .flatMap((ligne) => {
      // « <mode> <empreinte> <étage>\t<chemin> »
      const [infos, chemin] = ligne.split("\t");
      const empreinte = infos?.split(" ")[1];
      return empreinte === undefined || chemin === undefined ? [] : [{ empreinte, chemin }];
    });
}

export function contenuDeLIndex(racine: string, executer = execFileSync): (chemin: string) => string {
  let charges: Map<string, Buffer> | undefined;
  return (chemin) => {
    charges ??= charger(racine, executer);
    return charges.get(chemin)?.toString("utf8") ?? "";
  };
}

/** Tout l'index en **deux** appels, pas un par fichier.
   *
   *  La première version lançait un `git show` par source : sur quelques centaines de fichiers,
   *  le contrôle a dépassé son délai de cinq secondes. `git ls-files -s` donne l'empreinte de
   *  chaque entrée, `git cat-file --batch` rend tous les contenus d'un coup. */
function charger(racine: string, executer: typeof execFileSync): Map<string, Buffer> {
  const entrees = entreesDeLIndex(racine, executer);

  const brut = executer("git", ["cat-file", "--batch"], {
    cwd: racine,
    input: `${entrees.map((entree) => entree.empreinte).join("\n")}\n`,
    maxBuffer: 512 * 1024 * 1024,
  }) as unknown as Buffer;

  // Chaque réponse vaut « <empreinte> blob <taille>\n<contenu>\n ». On avance par tailles
  // annoncées plutôt qu'en cherchant des séparateurs : un contenu peut porter n'importe quoi,
  // y compris la forme d'un en-tête.
  //
  // Les contenus restent des **octets**. Décoder en UTF-8 un fichier binaire est irréversible, et
  // sa taille décodée ne vaudrait plus celle que Git annonce : la mesure qui contrôle ce lecteur
  // deviendrait inapplicable sur une image ou une police.
  const parEmpreinte = new Map<string, Buffer>();
  let place = 0;
  while (place < brut.length) {
    const finEntete = brut.indexOf(0x0a, place);
    if (finEntete === -1) break;
    const entete = brut.subarray(place, finEntete).toString("utf8").split(" ");
    const empreinte = entete[0]!;
    const taille = Number(entete[2]);
    const debutContenu = finEntete + 1;
    if (!Number.isFinite(taille)) break;
    parEmpreinte.set(empreinte, brut.subarray(debutContenu, debutContenu + taille));
    place = debutContenu + taille + 1;
  }

  return new Map(
    entrees.map((entree) => [entree.chemin, parEmpreinte.get(entree.empreinte) ?? Buffer.alloc(0)]),
  );
}

/** Une tolérance, et sa raison. Une tolérance sans raison écrite est une porte dérobée. */
export type ToleranceFantome = { readonly motif: string; readonly raison: string };

export const TOLERES_FANTOMES: readonly ToleranceFantome[] = [
  {
    motif: "node_modules/",
    raison:
      "Les dépendances ne sont pas suivies par Git : elles sont installées. Un import qui les désigne par un chemin relatif est inhabituel mais légitime dans un programme de mesure, et ce garde-fou n'a rien à dire de ce que l'installateur fournit.",
  },
];

/** Les extensions qu'un import en `.js` peut réellement désigner dans un projet TypeScript.
 *
 *  Deux candidats, pas quatre. `<chemin>/index.ts` y figurait, et **aucune mutation ne le tuait** :
 *  le dépôt n'en a aucun besoin, parce que ses imports de dossier nomment leur index
 *  explicitement (`./composants/index.js`), comme le mode de résolution l'exige. Une règle
 *  qu'aucune contre-épreuve ne tient est supprimée ; elle reviendra avec son cas, s'il arrive. */
const CANDIDATS = (sansExtension: string): readonly string[] => [
  `${sansExtension}.ts`,
  `${sansExtension}.tsx`,
];

export type ImportFantome = { readonly chemin: string; readonly importe: string };

/** Résout un chemin relatif depuis le fichier qui l'importe, sans toucher au disque.
 *
 *  Sans disque, parce que c'est tout l'objet : la question n'est pas « ce fichier existe-t-il ? »
 *  mais « Git le connaît-il ? ». Un module présent et non suivi est exactement le défaut cherché,
 *  et interroger le disque le rendrait invisible. */
function resoudre(depuis: string, relatif: string): string {
  const parts = depuis.split("/").slice(0, -1).concat(relatif.split("/"));
  const pile: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") pile.pop();
    else pile.push(part);
  }
  return pile.join("/");
}

export function importsFantomes(
  suivis: readonly string[],
  lire: (chemin: string) => string,
): readonly ImportFantome[] {
  const connus = new Set(suivis);
  const sources = suivis.filter((chemin) => /\.(ts|tsx)$/.test(chemin) && !chemin.includes("/dist/"));
  const fantomes: ImportFantome[] = [];
  for (const chemin of sources) {
    const contenu = lire(chemin);
    const masque = masqueDeCode(contenu);
    for (const trouve of contenu.matchAll(/\bfrom\s+"(\.{1,2}\/[^"]+)"|\bimport\s+"(\.{1,2}\/[^"]+)"/gu)) {
      const importe = trouve[1] ?? trouve[2]!;
      // Un fichier qui CITE un import n'en fait pas un. On interroge le masque sur le **mot-clé
      // seul** — `from` ou `import` — et jamais sur le chemin : le chemin EST une chaîne, donc
      // blanchi dans le masque, et le comparer ferait échouer tous les imports véritables. C'est
      // l'erreur suivante, commise juste après celle du remède : interroger le masque sur le motif
      // entier au lieu de son mot-clé.
      const motCle = trouve[0].slice(0, trouve[0].indexOf('"'));
      if (!estDuCode(masque, trouve.index, motCle)) continue;
      if (TOLERES_FANTOMES.some((tolere) => importe.includes(tolere.motif))) continue;
      const cible = resoudre(chemin, importe);
      // Un import en `.js` désigne un source TypeScript ; tout autre suffixe se prend tel quel,
      // parce qu'un `.json` ou un `.css` est la donnée elle-même et non sa transpilation.
      const essais = importe.endsWith(".js") ? CANDIDATS(cible.slice(0, -3)) : [cible, ...CANDIDATS(cible)];
      if (!essais.some((essai) => connus.has(essai))) fantomes.push({ chemin, importe });
    }
  }
  return fantomes;
}
