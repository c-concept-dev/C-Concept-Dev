/** Lot 0l — **un contrôle qui lit `.github/` doit se sauter en le disant quand le dossier est
 *  absent**, et ce module fabrique la situation où il l'est.
 *
 *  ## D'où vient ce module
 *
 *  De la même faute, deux fois. Le lot `0u` d'abord, le lot `0u quater` ensuite : un contrôle
 *  neuf lisait un workflow, passait au vert en local, et **rougissait la course** — la dernière
 *  fois le 18 novembre 2026, course `44265849503`, sur un `ENOENT` de
 *  `.github/workflows/lienotheque-tauri.yml`. Les deux courses prennent le dépôt en
 *  `sparse-checkout: tools/lienotheque` : là-bas, `.github/` **n'existe pas**.
 *
 *  Exigence de Christophe du 18 novembre 2026, ses mots : « un garde-fou qui exige que tout test
 *  lisant `.github/` se saute en le disant quand le dossier est absent, avec mutation. C'est la
 *  deuxième fois (lot `0u`, puis `0u quater`) que cette faute n'apparaît qu'après la poussée. »
 *
 *  ## Pourquoi on fabrique une racine, au lieu de lire le code
 *
 *  Un garde-fou **mesure**, il ne reconnaît pas un motif. Chercher dans le texte d'un contrôle
 *  l'idiome du saut dirait seulement que l'idiome **est écrit** — pas qu'il **marche**. On
 *  reproduit donc la situation de la course : une racine de dépôt qui porte `tools/lienotheque`
 *  et **pas** `.github/`, et on y **joue vraiment** les contrôles en cause.
 *
 *  Deux fausses pistes mesurées avant celle-ci, et c'est pourquoi la copie est le seul moyen
 *  propre :
 *
 *  1. **détourner `GIT_DIR` et `GIT_WORK_TREE`** vers un bac vide : la racine demandée à git
 *     bascule bien, mais le détournement est **global au processus**, et les contrôles qui
 *     fabriquent leur propre dépôt jetable tombent alors sur un `fatal: pathspec 'apps' did not
 *     match any files` — un rouge qui ne dit rien de ce qu'on cherche. Mesuré le 18 novembre
 *     2026 : 9 contrôles sur 10 en échec, tous pour la mauvaise raison ;
 *  2. **lier en dur** les fichiers au lieu de les copier : instantané, mais la mutation que ce
 *     garde-fou demande **réécrirait le vrai fichier du dépôt** par le lien. Écarté net.
 *
 *  La copie, elle, coûte **316 ms** pour les 1 004 fichiers suivis (mesuré, et c'est pourquoi le
 *  délai du contrôle est celui d'un voisin et non un chiffre neuf). */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

/** Le dossier que la course ne récupère pas, écrit **avec sa barre** : `raw.githubusercontent.com`
 *  porte les mêmes sept lettres sans être ce dossier, et un script de ce dépôt le cite trois fois.
 *  La barre est donc ce qui distingue le dossier de l'hôte, mesuré sur le dépôt entier. */
export const DOSSIER_GITHUB = ".github/";

/** La racine du dépôt **demandée à git**, jamais comptée en `../`.
 *
 *  L'idiome vient de `une-course-lit-le-programme-de-l-application.test.ts`, et sa raison y est
 *  écrite : un `../` de moins avait fait sauter six contrôles **en silence**. */
export function racineDuDepot(depuis: URL | string): string {
  const ou = typeof depuis === "string" ? depuis : depuis.pathname;
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: ou, encoding: "utf8" }).trim();
}

/** Le chemin, relatif à la racine du dépôt, du dossier de ce projet. */
export function dossierDuProjet(racine: string, projet: URL | string): string {
  const ou = typeof projet === "string" ? projet : projet.pathname;
  return relative(racine, ou).split(sep).join("/").replace(/\/$/u, "");
}

/** Les fichiers suivis par git sous un dossier, chemins relatifs à la racine du dépôt.
 *
 *  Suivis, et non « tous » : c'est exactement ce qu'`actions/checkout` dépose, donc la copie
 *  ressemble à la course sans qu'on ait à tenir une liste d'exclusions à la main. */
export function fichiersSuivis(racine: string, sousDossier: string): readonly string[] {
  return execFileSync("git", ["ls-files", "-z", sousDossier], {
    cwd: racine,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter((un) => un.length > 0);
}

/** Un fichier de contrôle qui lit `.github/`, et de quel paquet il vient. */
export interface ControleQuiLitGithub {
  /** Chemin relatif à la racine du dépôt. */
  readonly chemin: string;
  /** Le paquet où il vit, relatif à la racine du dépôt : là où son coureur est installé. */
  readonly paquet: string;
  /** Son chemin relatif à ce paquet, tel qu'on le passe au coureur. */
  readonly dansLePaquet: string;
}

/** Les contrôles qui lisent `.github/`, relevés sur les fichiers **suivis**.
 *
 *  ## L'angle mort, nommé plutôt que laissé ouvert
 *
 *  Ce relevé lit les fichiers de contrôle. Un module de `src/` qui lirait `.github/` pour le
 *  compte d'un contrôle y échapperait. Le contrôle `aucun module hors des dossiers de contrôle ne
 *  lit .github/` ferme la porte : si cela arrive un jour, une course le dira au lieu de laisser
 *  l'angle mort s'ouvrir sans bruit.
 *
 *  ## `sauf`, et pourquoi il n'est pas une commodité
 *
 *  Le garde-fou qui appelle ce relevé **nomme `.github/` lui-même**, puisqu'il en parle. Sans
 *  s'écarter, il se jouerait dans la racine qu'il vient de fabriquer, laquelle en fabriquerait une
 *  autre, sans fin. `sauf` est donc une **condition d'arrêt**, et le garde-fou éprouve qu'il n'y
 *  met que son propre chemin. Il ne sert pas à excuser un contrôle gênant.
 *
 *  Le relevé lit l'**index** de git, qui est ce qu'un commit emportera : un fichier neuf déjà
 *  ajouté y est, et le crochet de pré-commit juge l'index. Un fichier neuf **non ajouté** n'y est
 *  pas — il ne sera pas commité non plus. */
export function controlesQuiLisentGithub(
  racine: string,
  sousDossier: string,
  sauf: readonly string[] = [],
): readonly ControleQuiLitGithub[] {
  const ecartes = new Set(sauf);
  return fichiersSuivis(racine, sousDossier)
    .filter((chemin) => /\/test\/[^/]+\.test\.ts$/u.test(chemin))
    .filter((chemin) => !ecartes.has(chemin))
    .filter((chemin) => readFileSync(join(racine, chemin), "utf8").includes(DOSSIER_GITHUB))
    .map((chemin) => {
      const paquet = chemin.replace(/\/test\/[^/]+\.test\.ts$/u, "");
      return { chemin, paquet, dansLePaquet: chemin.slice(paquet.length + 1) };
    });
}

/** Les fichiers suivis, hors dossiers de contrôle, qui nomment le dossier `.github/`. */
export function modulesQuiLisentGithub(racine: string, sousDossier: string): readonly string[] {
  return fichiersSuivis(racine, sousDossier)
    .filter((chemin) => /\.(ts|tsx|mts|cts|js|mjs|cjs)$/u.test(chemin))
    .filter((chemin) => !chemin.includes("/test/"))
    .filter((chemin) => readFileSync(join(racine, chemin), "utf8").includes(DOSSIER_GITHUB));
}

/** Ce qu'a coûté la fabrication d'une racine, et ce qu'elle porte. */
export interface RacineFabriquee {
  /** La racine fabriquée : un dépôt git qui porte le projet et **pas** `.github/`. */
  readonly racine: string;
  readonly fichiersCopies: number;
  readonly liensVersLesPaquets: number;
  readonly millisecondes: number;
}

/** Fabrique, dans `bac`, une racine de dépôt qui porte le projet **sans** `.github/`.
 *
 *  C'est la situation des deux courses, reproduite : les fichiers suivis du projet, un dépôt git
 *  à la racine pour que `git rev-parse --show-toplevel` y réponde, et **rien** au-dessus du
 *  projet. Les `node_modules` ne sont pas copiés mais **liés** : ils ne sont pas suivis, ils ne
 *  sont pas lus par les contrôles en cause, et les copier coûterait des minutes pour rien. */
export function fabriquerRacineSansGithub(
  racine: string,
  projet: string,
  bac: string,
): RacineFabriquee {
  const depart = performance.now();
  const suivis = fichiersSuivis(racine, projet);
  const dossiersFaits = new Set<string>();
  for (const rel of suivis) {
    const cible = join(bac, rel);
    const dossier = dirname(cible);
    if (!dossiersFaits.has(dossier)) {
      mkdirSync(dossier, { recursive: true });
      dossiersFaits.add(dossier);
    }
    copyFileSync(join(racine, rel), cible);
  }
  execFileSync("git", ["init"], { cwd: bac, encoding: "utf8" });
  const liens = lierLesPaquets(join(racine, projet), join(bac, projet));
  return {
    racine: bac,
    fichiersCopies: suivis.length,
    liensVersLesPaquets: liens,
    millisecondes: performance.now() - depart,
  };
}

/** Lie les `node_modules` de chaque paquet, du vrai projet vers la copie.
 *
 *  Un lien par paquet, et non un seul à la racine : pnpm installe les dépendances de chaque
 *  paquet **chez lui**, et un coureur lancé dans un paquet lit d'abord son propre dossier. */
function lierLesPaquets(projetReel: string, projetCopie: string): number {
  let poses = 0;
  const parcourir = (relatif: string, profondeur: number): void => {
    if (profondeur > 3) return;
    const ou = join(projetReel, relatif);
    for (const entree of readdirSync(ou, { withFileTypes: true })) {
      if (!entree.isDirectory()) continue;
      const sousRelatif = relatif === "" ? entree.name : `${relatif}/${entree.name}`;
      if (entree.name === "node_modules") {
        const cible = join(projetCopie, sousRelatif);
        if (!existsSync(cible) && existsSync(dirname(cible))) {
          symlinkSync(join(projetReel, sousRelatif), cible, "dir");
          poses += 1;
        }
        continue;
      }
      parcourir(sousRelatif, profondeur + 1);
    }
  };
  parcourir("", 0);
  return poses;
}

/** Ce que le coureur a dit d'un fichier de contrôle. */
export interface CeQueLeCoureurADit {
  readonly accepte: boolean;
  readonly passes: number;
  readonly sautes: number;
  readonly echecs: number;
  /** La sortie du coureur, pour que le message d'un refus porte la cause et non seulement un compte. */
  readonly sortie: string;
}

/** Joue un fichier de contrôle **dans** une racine fabriquée, et rend ce que le coureur a dit.
 *
 *  `--maxWorkers=1` : le plafond de ressources du projet est de deux coureurs, et celui-ci tourne
 *  **dans** un coureur. Un enfant qui ouvrirait ses propres ouvriers dépasserait le plafond. */
export function jouerDansCetteRacine(
  fabriquee: RacineFabriquee,
  controle: ControleQuiLitGithub,
  bacDuRapport: string,
): CeQueLeCoureurADit {
  const paquet = join(fabriquee.racine, controle.paquet);
  const coureur = join(paquet, "node_modules", "vitest", "vitest.mjs");
  const rapport = join(bacDuRapport, `${controle.dansLePaquet.replace(/[^a-z0-9]+/giu, "-")}.json`);
  const environnement = Object.fromEntries(
    Object.entries(process.env).filter(([nom]) => !nom.startsWith("VITEST")),
  );
  let sortie = "";
  let accepte = true;
  try {
    sortie = execFileSync(
      process.execPath,
      [coureur, "run", controle.dansLePaquet, "--reporter=json", `--outputFile=${rapport}`, "--maxWorkers=1"],
      { cwd: paquet, encoding: "utf8", env: environnement, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (panne) {
    accepte = false;
    const avecSortie = panne as { stdout?: string; stderr?: string };
    sortie = `${avecSortie.stdout ?? ""}\n${avecSortie.stderr ?? ""}`;
  }
  if (!existsSync(rapport))
    return { accepte: false, passes: 0, sautes: 0, echecs: 0, sortie: `aucun rapport rendu\n${sortie}` };
  const lu = JSON.parse(readFileSync(rapport, "utf8")) as {
    numPassedTests?: number;
    numPendingTests?: number;
    numFailedTests?: number;
  };
  return {
    accepte,
    passes: lu.numPassedTests ?? 0,
    sautes: lu.numPendingTests ?? 0,
    echecs: lu.numFailedTests ?? 0,
    sortie,
  };
}

/** Efface une racine fabriquée.
 *
 *  **Deux précautions, et elles ne sont pas décoratives** : ce qui est effacé porte des liens vers
 *  les `node_modules` du vrai dépôt, et une erreur ici effacerait les dépendances de tout le
 *  monde.
 *
 *  1. `rmSync` **ne suit pas** un lien : il le retire et laisse intact ce qu'il désigne. Mesuré
 *     plutôt que supposé — un leurre derrière un lien survit à l'effacement —, et le contrôle
 *     `effacer la racine fabriquée ne suit pas les liens` le rejoue à chaque course ;
 *  2. rien n'est effacé **hors du dossier temporaire du système** : un chemin qui n'y mène pas est
 *     refusé, et non effacé « pour voir ». */
export function effacerLaRacine(fabriquee: RacineFabriquee): void {
  const ou = resolve(fabriquee.racine);
  const temporaire = resolve(tmpdir());
  if (!ou.startsWith(`${temporaire}${sep}`))
    throw new Error(`refus d'effacer ${ou} : hors du dossier temporaire ${temporaire}`);
  rmSync(ou, { recursive: true, force: true });
}
