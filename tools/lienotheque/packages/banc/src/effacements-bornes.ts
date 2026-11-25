/** Un effacement récursif ne vise qu'un chemin du dossier temporaire (lot `0z bis`).
 *
 *  ## Pourquoi ce garde-fou existe, et pourquoi le crochet ne suffisait pas
 *
 *  Le 18 novembre 2026, une mutation a effacé la copie de travail entière — 8 302 chemins suivis
 *  et tout ce que Git ignore — parce qu'un contrôle qui *éprouvait* un refus d'effacement lui
 *  passait la racine du vrai dépôt. Le crochet `refuser-gestes-destructeurs.sh` n'a rien vu, et il
 *  ne pouvait rien voir : **il ne lit que des commandes** — `rm -rf`, `git reset --hard`, les
 *  poussées forcées. Un `rmSync` dans un contrôle lui est invisible. L'effacement n'est pas passé
 *  *malgré* le garde-fou, il est passé **à côté**.
 *
 *  Ce module lit donc le **code** : les contrôles, les exemples et les scripts, en TypeScript,
 *  JavaScript, Rust et Python.
 *
 *  ## Ce qu'il mesure, et ce qu'il ne devine pas
 *
 *  Pour chaque effacement récursif trouvé, il **remonte la cible à sa liaison dans le même
 *  fichier** — variable, constante, corps de fonction — jusqu'à rencontrer le dossier temporaire
 *  du système (`tmpdir()`, `temp_dir()`, `gettempdir()`, `TMPDIR`). C'est la démarche qui a
 *  recensé les 375 sites du dépôt à la main le 18 novembre, et chacun s'était résolu.
 *
 *  **`mkdtempSync` n'est PAS une marque du bac**, et c'est tout le sujet : `mkdtempSync(join(PAQUET,
 *  …))` fabrique un dossier temporaire **dans la copie de travail**. C'est exactement ce que
 *  faisait le seul effacement de contrôle qui visait l'arbre réel.
 *
 *  Ce qu'il ne devine pas : une cible qui vient d'un paramètre, d'un argument de la ligne de
 *  commande ou d'une variable d'environnement. Là, il n'y a rien à remonter — et c'est précisément
 *  le cas dangereux. Deux réponses, et deux seulement : le fichier **appelle un refus nommé**, ou
 *  il figure dans la **liste des exceptions**, chacune avec sa raison et le chemin exact qu'elle a
 *  le droit d'effacer. Aucune porte générale.
 *
 *  ## SES DEUX LIMITES, et elles sont des décisions, non des oublis
 *
 *  **1. Le produit est hors du périmètre.** Confirmé par Christophe le 20 novembre 2026, ses
 *  mots : « le produit efface ce que l'utilisateur lui demande à l'écran ; ce garde-fou ne le juge
 *  pas » (`docs/decisions/2026-11-20-le-produit-efface-ce-que-l-utilisateur-demande.md`). Une
 *  bibliothèque qui s'efface, une version qu'on retire, un cache qui évince le plus ancien : ce
 *  sont des gestes demandés, et c'est l'écran qui les confirme. **Une exception à cette exclusion,
 *  et elle compte** : les contrôles de Rust vivent DANS les fichiers du produit, en `#[cfg(test)]`.
 *  Ces plages-là sont jugées, pas le code qui les entoure.
 *
 *  **2. Les effacements d'un seul fichier ne sont pas jugés.** `rmSync(join(dossier, "un.json"))`
 *  retire un fichier ; `rmSync(dossier, { recursive: true })` emporte un arbre. Les confondre
 *  ajouterait une centaine de sites dont la quasi-totalité est anodine, et c'est exactement ainsi
 *  qu'un garde-fou se fait désarmer. Ce que cela laisse dehors est nommé plutôt que tu :
 *  `controle-epingles.ts` retire ses deux rapports, `engendrer-migrations-d1.ts` retire une
 *  migration suivie par git — visible au diff avant le commit.
 *
 *  Et une troisième frontière, qui n'est pas une limite mais un partage : **les scripts de coquille
 *  restent au crochet** `refuser-gestes-destructeurs.sh`, qui lit les commandes. Ce module lit le
 *  code ; le crochet lit les commandes. Ensemble, ils couvrent les deux façons d'effacer.
 *
 *  ## Pourquoi il ne s'accuse pas lui-même
 *
 *  Il lit à travers `masqueDeCode` : chaînes et commentaires blanchis. Sans cela il accuserait ses
 *  propres exemples, comme le garde-fou des promesses le 6 novembre et celui des fichiers non
 *  suivis le 7 — deux fois, à un lot d'intervalle, la leçon déjà écrite au registre. */

import { masqueDeCode } from "./lire-du-code.js";

export type Source = { readonly chemin: string; readonly contenu: string };

/** Les langages que ce garde-fou sait lire. Le reste est ignoré **en le disant** : voir
 *  `sourcesIgnorees`. */
export type Langage = "js" | "rust" | "python";

/** Un effacement récursif relevé dans une source. */
export interface Effacement {
  /** Chemin du fichier, relatif à la racine du dépôt. */
  readonly chemin: string;
  /** Ligne, comptée depuis 1. */
  readonly ligne: number;
  /** Le nom appelé, tel qu'il est écrit : `rmSync`, `remove_dir_all`, `shutil.rmtree`… */
  readonly appel: string;
  /** Le texte du premier argument, tel qu'il est écrit. */
  readonly cible: string;
}

/** Un effacement que rien ne borne, et ce que la remontée a traversé avant d'abandonner. */
export interface EffacementHorsDuBac extends Effacement {
  /** Les liaisons traversées, dans l'ordre, pour que le refus se lise sans rouvrir le fichier. */
  readonly trace: readonly string[];
}

/** Une exception nommée : un fichier, le chemin exact qu'il a le droit d'effacer, et pourquoi.
 *
 *  **Pas de joker, pas de dossier, pas de motif** : un fichier à la fois, et la cible écrite telle
 *  qu'elle est dans le code. Une exception dont le code a changé devient **morte**, et le
 *  garde-fou le dit — c'est la leçon de `decideeAilleurs` au lot D3, où une liste d'exemptions
 *  avait survécu à ce qu'elle exemptait. */
export interface ExceptionNommee {
  /** La fonction qui porte l'appel, telle qu'elle s'écrit dans le fichier.
   *
   *  Avec `cible`, c'est ce qui reconnaît une exception **par son contenu** — fonction et appel —
   *  et jamais par un numéro de ligne : règle de Christophe du 21 novembre 2026. Quand elle est
   *  donnée, elle remplace la vérification du dernier segment de `efface` : une cible qui vient
   *  d'un paramètre n'a pas de chemin littéral à chercher dans le fichier, et c'est le nom de la
   *  fonction qui dit alors que l'exception désigne toujours quelque chose. */
  readonly fonction?: string;
  /** Chemin du fichier, relatif à la racine du dépôt. */
  readonly chemin: string;
  /** Le texte du premier argument, tel qu'il doit être écrit à ce site. */
  readonly cible: string;
  /** Le chemin réel que ce site a le droit d'effacer. Il doit **paraître dans le fichier**, sans
   *  quoi la déclaration et le code ne parlent plus du même objet. */
  readonly efface: string;
  /** La raison, en une phrase. */
  readonly pourquoi: string;
}

/** Les modules qui **portent** le refus, et sont donc hors du relevé.
 *
 *  Ce n'est pas une exception de complaisance : chacun implémente la comparaison au dossier
 *  temporaire et **ses propres contrôles la tiennent**, mutation à l'appui. Le garde-fou vérifie
 *  ci-dessous qu'ils portent toujours cette comparaison ; le jour où l'un la perdrait, il
 *  rejoindrait le relevé. */
export const PORTEURS_DU_REFUS: readonly string[] = [
  "apps/app/src-tauri/src/bac_jetable.rs",
  "packages/banc/src/racine-sans-github.ts",
];

/** Le refus nommé, côté hôte Rust. Un exemple qui efface un chemin venu du dehors doit l'appeler ;
 *  retirer cet appel fait rougir le relevé, et c'est le branchement que le lot éprouve. */
export const REFUS_NOMME = "refuser_un_effacement_dangereux";

/** Les exceptions du dépôt, chacune avec sa raison et son chemin exact. */
export const EXCEPTIONS: readonly ExceptionNommee[] = [
  {
    chemin: "apps/app/src-tauri/outils/preparer-moteurs.py",
    cible: "MOTEURS",
    efface: "apps/app/src-tauri/moteurs",
    pourquoi:
      "Il REFAIT ce dossier : l'effacer d'abord est sa première étape, documentée, et l'ordre des " +
      "deux préparations en dépend. Le dossier est ignoré par git et se redéploie depuis l'archive " +
      "publiée.",
  },
  {
    chemin: "apps/app/src-tauri/outils/collecter-licences.py",
    cible: "LICENCES",
    efface: "apps/app/src-tauri/moteurs/licences",
    pourquoi:
      "Seulement en mode --fabriquer, acte volontaire qui produit une nouvelle archive : là, " +
      "reconstruire les licences est le travail même. Le mode par défaut ne l'efface plus depuis " +
      "le lot 0u ter, précisément parce qu'il détruisait ce que l'archive venait de déposer.",
  },
  {
    chemin: "apps/app/src-tauri/outils/preparer-moteur-node.py",
    cible: 'porte / "canvas"',
    efface: "apps/app/src-tauri/moteurs/chaine/node_modules/@napi-rs/canvas",
    pourquoi:
      "Il réduit le rendu embarqué à l'architecture du poste : les variantes des autres " +
      "architectures sont retirées de ce qu'il vient lui-même de déposer.",
  },
  {
    chemin: "apps/app/src-tauri/outils/preparer-moteur-node.py",
    cible: 'porte / f"canvas-{suffixe}"',
    efface: "apps/app/src-tauri/moteurs/chaine/node_modules/@napi-rs/canvas-<architecture>",
    pourquoi: "La même réduction, variante par variante, dans le dossier qu'il a déposé.",
  },
  {
    chemin: "apps/app/src-tauri/outils/preparer-moteur-node.py",
    cible: "cible",
    efface: "apps/app/src-tauri/moteurs/bin/node",
    pourquoi:
      "Il remplace le binaire Node embarqué par celui qu'il vient de réduire. Le défaut de ce site " +
      "est connu et corrigé : il trouvait autrefois sa cible par le PATH, et pouvait viser le Node " +
      "du poste.",
  },
  // ── Les SEPT sites du PRODUIT, SIX entrées : `reconstruction.rs` en porte deux, de même cible.
  // Accordés par Christophe le 21 novembre 2026 sur l'inventaire mesuré, moins un, et plus un.
  // Chacune est reconnue par son contenu — fichier et cible — jamais par un numéro de ligne.
  //
  // Celle de `retirer_document` a été accordée le 24 novembre 2026, au lot `0z septies`, APRÈS
  // son correctif. Celle du vidage du cache a été RETIRÉE le même jour, au lot `0z octies` : sa
  // raison nommait un écran — « c'est l'utilisateur qui vide son cache, à l'écran » — et cet
  // écran n'existait pas ; la fonction n'avait aucun appelant, et elle est supprimée. D'où la
  // règle, décision du 24 novembre 2026 : aucun effacement récursif sans appelant dans le produit
  // ne reçoit d'exception, et une fonction d'effacement arrive avec son appelant, son exception
  // et sa décision.
  {
    chemin: "outils/ingestion/src/texte.ts",
    cible: "dossier",
    fonction: "lireLeTexte",
    efface: "<le dossier de travail du lecteur>",
    pourquoi:
      "Le lecteur retire ce qu'il a lui-même créé pour travailler. Rien de l'utilisateur n'y vit.",
  },
  {
    chemin: "apps/app/src-tauri/src/application_embarquee.rs",
    cible: "&sauvegarde",
    fonction: "installer_application",
    efface: "applications/.precedente-<identifiant>.app",
    pourquoi:
      "Le balayage qui suit une installation réussie : l'application neuve est en place avant ce " +
      "geste, et un échec n'y laisse qu'un résidu, nommé à l'écran, jamais une installation ratée.",
  },
  {
    chemin: "apps/app/src-tauri/src/application_embarquee.rs",
    cible: "&chemin",
    fonction: "nettoyer_ancienne_disposition",
    efface: "applications/macOS, applications/.precedentes",
    pourquoi:
      "Deux dossiers d'une disposition que l'application ne pose plus. Ils sont à elle, et leur " +
      "retrait est la fin d'une migration, pas une perte pour l'utilisateur.",
  },
  {
    chemin: "apps/app/src-tauri/src/reconstruction.rs",
    cible: "&self.photographie",
    fonction: "preparer_destination",
    efface: "<nom>.photographie-source",
    pourquoi:
      "Un retour en arrière sur sa propre création : `fs::create_dir(&self.photographie)` est deux " +
      "lignes plus haut, et ces deux sites la retirent quand la copie échoue ou qu'il manque " +
      "`actives.json`. Rien n'existait avant la fonction.",
  },
  {
    chemin: "apps/app/src-tauri/src/depot.rs",
    cible: "chemin",
    fonction: "retirer_entree",
    efface: "~/.Trash/<nom>",
    pourquoi:
      "Accordée le 21 novembre 2026 après vérification d'une condition posée par Christophe : " +
      "`copier_entree` remonte TOUTES ses erreurs — sept appels faillibles, sept `?`, aucun " +
      "`let _ =` ni `.ok()` — donc l'original n'est retiré qu'après une copie réellement " +
      "complète, et un nœud qu'elle ne sait pas copier donne un `Err(Unsupported)` explicite. Le " +
      "chemin ne vient jamais d'une donnée : c'est une entrée d'un `read_dir` de l'arbre de la " +
      "bibliothèque, ou une destination `~/.Trash/<nom>` construite sur place.",
  },
  {
    chemin: "apps/app/src-tauri/src/depot.rs",
    cible: "self.racine.join(DERIVES).join(version)",
    fonction: "retirer_document",
    efface: "derives/<version>",
    pourquoi:
      "Accordée le 24 novembre 2026, au lot `0z septies`, et la condition est MÉCANIQUE : les " +
      "noms de `versions` sont rassemblés en lecture seule par la première moitié de la " +
      "fonction, chacun passé à `nom_de_version` AVANT la première écriture, et un seul nom " +
      "invalide refuse l'opération entière en nommant le fichier à réparer. C'est ce garde-fou " +
      "qui avait trouvé le défaut (dette D28) ; l'exception vient après le correctif, jamais à " +
      "sa place. Depuis le lot `0z decies`, l'erreur de ce site n'est plus avalée : elle est " +
      "nommée dans le compte rendu du retrait, avec son chemin et sa cause.",
  },
  {
    chemin: "apps/worker/bancs/ceremonie-bout-en-bout.mjs",
    cible: 'new URL("../.wrangler/state/v3/d1", import.meta.url)',
    efface: "apps/worker/.wrangler/state/v3/d1",
    pourquoi:
      "L'état local de wrangler, ignoré par git et refait à chaque passage du banc : le banc doit " +
      "partir d'une base vide, sinon il mesure les écritures de la veille.",
  },
];

/** Les appels toujours récursifs, quels que soient leurs arguments. */
const TOUJOURS_RECURSIF = ["remove_dir_all", "rmtree", "rimraf", "removeSync"] as const;

/** Les appels récursifs **seulement s'ils le disent**. `rmSync(fichier)` retire un fichier ;
 *  `rmSync(dossier, { recursive: true })` emporte un arbre. Confondre les deux ferait du garde-fou
 *  un accusateur de masse, et un garde-fou qui accuse à tort finit désarmé. */
const RECURSIF_SI_DIT = ["rmSync", "rmdirSync", "rm"] as const;

const APPELS = new RegExp(
  `\\b(${[...TOUJOURS_RECURSIF, ...RECURSIF_SI_DIT].sort((a, b) => b.length - a.length).join("|")})\\s*\\(`,
  "gu",
);

/** Le dossier temporaire du système, sous les noms que les quatre langages lui donnent.
 *
 *  `mkdtemp` n'y est pas, et c'est voulu : il fabrique un dossier temporaire **où on lui dit**. */
const MARQUES_DU_BAC = [
  /\btmpdir\s*\(/u,
  /\btemp_dir\s*\(/u,
  /\bgettempdir\s*\(/u,
  /\bTMPDIR\b/u,
  /\btempfile::/u,
] as const;

const DANS_LE_BAC = (texte: string): boolean => MARQUES_DU_BAC.some((marque) => marque.test(texte));

/** Le périmètre : **les contrôles, les exemples et les scripts**, et rien d'autre.
 *
 *  Le **produit** en est dehors, et ce n'est pas une faveur : une bibliothèque qui s'efface, une
 *  version qu'on retire, un cache qui évince le plus ancien — ce sont des gestes que l'utilisateur
 *  demande, et c'est l'écran qui les confirme. Les y soumettre ferait du garde-fou un accusateur de
 *  masse ; or un garde-fou qui accuse à tort finit désarmé, et celui-ci garde quelque chose de trop
 *  précieux pour finir ainsi.
 *
 *  **Une exception à cette exclusion, et elle compte** : les contrôles de Rust vivent DANS les
 *  fichiers du produit, en `#[cfg(test)]`. Ce sont des contrôles, donc ils sont dans le périmètre —
 *  mais seulement eux, pas le code qui les entoure. Sans cette distinction, les 119
 *  `remove_dir_all` de l'hôte seraient tous jugés, ou tous ignorés : deux façons de ne rien
 *  mesurer. */
export function estDansLePerimetre(chemin: string): boolean {
  return (
    /(?:^|\/)(?:test|tests)\//u.test(chemin) ||
    /\.test\.[cm]?[jt]sx?$/u.test(chemin) ||
    /(?:^|\/)examples\//u.test(chemin) ||
    /(?:^|\/)scripts\//u.test(chemin) ||
    /(?:^|\/)bancs\//u.test(chemin) ||
    /(?:^|\/)mesures\//u.test(chemin) ||
    /(?:^|\/)outils\/[^/]+\.py$/u.test(chemin) ||
    /(?:^|\/)src\/[^/]+\.rs$/u.test(chemin)
  );
}

/** Les plages du fichier qui comptent comme contrôle ou script.
 *
 *  Pour un fichier de l'hôte Rust (`src/*.rs`), ce sont **les modules `#[cfg(test)]` seulement** ;
 *  pour tout le reste du périmètre, le fichier entier. */
function plagesJugees(
  masque: string,
  chemin: string,
  zone: Zone,
): readonly (readonly [number, number])[] {
  // SEULES les sources de l'hôte mêlent les deux zones dans un même fichier. Un exemple
  // (`examples/*.rs`) n'a pas de module de contrôles : élargir cette règle à tous les `.rs` lui
  // rendait une liste de plages vide, donc plus aucun jugement — mesuré le 21 novembre 2026, et
  // c'est un contrôle du lot `0z bis` qui l'a attrapé.
  if (!/(?:^|\/)src\/[^/]+\.rs$/u.test(chemin)) return [[0, masque.length]];
  const tests: (readonly [number, number])[] = [];
  for (const trouve of masque.matchAll(/#\[cfg\(test\)\]\s*(?:pub\s+)?mod\s+[\w]+\s*\{/gu)) {
    const accolade = masque.indexOf("{", trouve.index);
    if (accolade === -1) continue;
    tests.push([accolade, finDuGroupe(masque, accolade)]);
  }
  if (zone === "controles") return tests;
  // Le produit, c'est le COMPLÉMENT des modules de contrôles.
  const plages: (readonly [number, number])[] = [];
  let curseur = 0;
  for (const [debut, fin] of tests) {
    if (debut > curseur) plages.push([curseur, debut]);
    curseur = Math.max(curseur, fin);
  }
  if (curseur < masque.length) plages.push([curseur, masque.length]);
  return plages;
}

/** La zone d'un fichier qu'un relevé juge. Pour un fichier de l'hôte Rust, les deux existent
 *  dans le MÊME fichier, et c'est toute la difficulté : `#[cfg(test)] mod tests` y vit à côté du
 *  produit. */
export type Zone = "controles" | "produit";

/** Le périmètre du produit : ses sources, et rien de ce qui l'éprouve.
 *
 *  Sert aux contrôles du lot `0z quinquies` et à l'inventaire qui précède `0z quater`. Le
 *  périmètre LIVRÉ reste `estDansLePerimetre` jusqu'à ce que Christophe ait décidé des exceptions
 *  du produit : un garde-fou qu'on ouvre avant d'avoir ses exemptions accuse à tort, et un
 *  garde-fou qui accuse à tort finit désarmé. */
export function estDansLePerimetreDuProduit(chemin: string): boolean {
  if (/(?:^|\/)(?:test|tests)\//u.test(chemin)) return false;
  if (/\.test\.[cm]?[jt]sx?$/u.test(chemin)) return false;
  if (/(?:^|\/)(?:examples|scripts|bancs|mesures)\//u.test(chemin)) return false;
  if (/\.py$/u.test(chemin)) return false;
  return /(?:^|\/)src\//u.test(chemin);
}

/** Le masque réduit aux plages jugées : tout le reste est blanchi, longueur et lignes gardées.
 *
 *  **C'est le correctif du défaut A (21 novembre 2026).** `liaisons` lisait le fichier ENTIER,
 *  donc les liaisons des modules de contrôles acquittaient le code du produit : `depot.rs:461`
 *  retire une version d'une vraie bibliothèque et passait pour borné, parce que le même fichier
 *  lie ailleurs `racine` à `std::env::temp_dir()` — dans ses tests. Les effacements ET les
 *  liaisons viennent désormais de la même zone. */
function restreindre(masque: string, plages: readonly (readonly [number, number])[]): string {
  const dedans = (i: number): boolean => plages.some(([debut, fin]) => i >= debut && i <= fin);
  let sortie = "";
  for (let i = 0; i < masque.length; i += 1)
    sortie += dedans(i) ? masque[i] : masque[i] === "\n" ? "\n" : " ";
  return sortie;
}

/** Le corps de la fonction nommée, sur le masque : `[ouverture, fermeture]`, ou `undefined`.
 *
 *  On travaille sur le MASQUE, jamais sur le texte : une accolade dans une chaîne y est blanchie,
 *  et une durée de vie de Rust n'y ouvre plus de littéral depuis le lot `0z quinquies`. C'est
 *  exactement là que le défaut du 21 novembre s'était caché, et c'est pourquoi ce découpage est
 *  éprouvé dans les deux langages, méthode d'`impl`, fonction imbriquée et fermeture comprises.
 *
 *  Une méthode d'`impl` se déclare comme une fonction libre en Rust — `fn nom(` —, donc le même
 *  motif les couvre toutes deux. En JavaScript, on accepte aussi la forme `const nom = … =>`. */
function corpsDeLaFonction(
  masque: string,
  nom: string,
  langage: Langage,
): readonly [number, number] | undefined {
  const echappe = nom.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const motifs =
    langage === "rust"
      ? [new RegExp(`\\bfn\\s+${echappe}\\s*(?:<[^>]*>)?\\s*\\(`, "u")]
      : langage === "python"
        ? [new RegExp(`\\bdef\\s+${echappe}\\s*\\(`, "u")]
        : [
            new RegExp(`\\bfunction\\s+${echappe}\\s*(?:<[^>]*>)?\\s*\\(`, "u"),
            new RegExp(`\\b(?:const|let|var)\\s+${echappe}\\s*(?::[^=\\n]+)?=\\s*(?:async\\s*)?\\(`, "u"),
            new RegExp(`(?:^|[;{}\\s])${echappe}\\s*\\(`, "mu"),
          ];
  for (const motif of motifs) {
    const trouve = motif.exec(masque);
    if (trouve === null) continue;
    // La parenthèse des paramètres se referme par appariement : un paramètre qui en porte une
    // n'arrête pas la lecture.
    const ouvranteDesParametres = masque.indexOf("(", trouve.index);
    let profondeur = 0;
    let apres = -1;
    for (let i = ouvranteDesParametres; i < masque.length; i += 1) {
      if (masque[i] === "(") profondeur += 1;
      else if (masque[i] === ")") {
        profondeur -= 1;
        if (profondeur === 0) {
          apres = i + 1;
          break;
        }
      }
    }
    if (apres === -1) continue;
    // Puis la première accolade qui ouvre un CORPS. Une accolade précédée de « : » ouvre un type
    // — `): { page: number } {` en TypeScript — et se saute avec son contenu.
    let curseur = apres;
    while (curseur < masque.length) {
      const accolade = masque.indexOf("{", curseur);
      if (accolade === -1) return undefined;
      const avantElle = masque.slice(curseur, accolade).trimEnd();
      if (avantElle.endsWith(":")) {
        curseur = finDuGroupe(masque, accolade) + 1;
        continue;
      }
      return [accolade, finDuGroupe(masque, accolade)];
    }
    return undefined;
  }
  return undefined;
}

export function langageDe(chemin: string): Langage | undefined {
  if (/\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/u.test(chemin)) return "js";
  if (/\.rs$/u.test(chemin)) return "rust";
  if (/\.py$/u.test(chemin)) return "python";
  return undefined;
}

/** La fin du groupe ouvert à `ouverture`, ou la fin du texte si rien ne le referme. */
function finDuGroupe(masque: string, ouverture: number): number {
  let profondeur = 0;
  for (let place = ouverture; place < masque.length; place += 1) {
    const caractere = masque[place]!;
    if (caractere === "(" || caractere === "[" || caractere === "{") profondeur += 1;
    else if (caractere === ")" || caractere === "]" || caractere === "}") {
      profondeur -= 1;
      if (profondeur === 0) return place;
    }
  }
  return masque.length;
}

/** La fin du premier argument : la virgule de profondeur 1, ou la parenthèse fermante. */
function finDuPremierArgument(masque: string, ouverture: number, fermeture: number): number {
  let profondeur = 0;
  for (let place = ouverture; place < fermeture; place += 1) {
    const caractere = masque[place]!;
    if (caractere === "(" || caractere === "[" || caractere === "{") profondeur += 1;
    else if (caractere === ")" || caractere === "]" || caractere === "}") profondeur -= 1;
    else if (caractere === "," && profondeur === 1) return place;
  }
  return fermeture;
}

/** Les effacements récursifs d'une source, lus sur son masque. */
function effacementsDe(source: Source, masque: string): readonly Effacement[] {
  const releves: Effacement[] = [];
  // Le masque reçu est DÉJÀ réduit à la zone jugée : c'est l'appelant qui choisit la zone, et les
  // liaisons viennent de la même réduction. Juger ici une seconde fois dédoublerait la règle.
  for (const trouve of masque.matchAll(APPELS)) {
    const appel = trouve[1]!;
    const debut = trouve.index + trouve[0].length - 1;
    const fermeture = finDuGroupe(masque, debut);
    const dedans = masque.slice(debut, fermeture);

    const recursif =
      (TOUJOURS_RECURSIF as readonly string[]).includes(appel) || /\brecursive\b/u.test(dedans);
    if (!recursif) continue;

    const finArgument = finDuPremierArgument(masque, debut, fermeture);
    // Le texte RÉEL, et non le masque : la cible se lit dans le rapport, et un littéral blanchi
    // n'y dirait rien.
    const cible = source.contenu.slice(debut + 1, finArgument).trim();
    // Le nom qualifié, s'il en porte un : `shutil.rmtree` se lit mieux que `rmtree`.
    const avant = source.contenu.slice(Math.max(0, trouve.index - 24), trouve.index);
    const qualificateur = /([\w$]+)\.$/u.exec(avant)?.[1];
    releves.push({
      chemin: source.chemin,
      ligne: masque.slice(0, trouve.index).split("\n").length,
      appel: qualificateur === undefined ? appel : `${qualificateur}.${appel}`,
      cible,
    });
  }
  return releves;
}

/** Les liaisons d'un fichier : nom → les textes qui lui donnent sa valeur.
 *
 *  Un nom peut en avoir plusieurs — assigné dans un `beforeEach`, réassigné ailleurs. On les garde
 *  **toutes** : il suffit qu'une seule sorte du bac pour que la cible soit douteuse, mais il
 *  suffit aussi qu'une seule y mène pour que le fichier ait dit où il travaille. Le choix retenu
 *  est le second — borner demande une preuve, et une liaison vers le bac en est une. */
function liaisons(masque: string, langage: Langage): ReadonlyMap<string, readonly string[]> {
  const table = new Map<string, string[]>();
  const poser = (nom: string, valeur: string): void => {
    const deja = table.get(nom);
    if (deja === undefined) table.set(nom, [valeur]);
    else deja.push(valeur);
  };

  const affectations =
    langage === "rust"
      ? [/\blet\s+(?:mut\s+)?([\w]+)\s*(?::[^=;]+)?=\s*([^;]+);/gu]
      : langage === "python"
        ? [/^[ \t]*([\w]+)\s*=\s*(.+)$/gmu]
        : [
            /\b(?:const|let|var)\s+([\w$]+)\s*(?::[^=\n]+)?=\s*([^;\n]+)/gu,
            /^[ \t]*([\w$]+)\s*=\s*([^;\n]+)/gmu,
            // La boucle qui parcourt : le nom vaut ce qu'elle parcourt.
            /\bfor\s*\(\s*(?:const|let|var)\s+([\w$]+)\s+of\s+([^)]+)\)/gu,
            // Ce qu'on EMPILE : l'idiome dominant de ce dépôt est « je garde mes bacs dans une
            // liste, je les efface tous à la fin ». Sans ce pas, les bacs d'une liste seraient
            // tous accusés alors que chacun vient de `mkdtempSync(join(tmpdir(), …))`.
            /\b([\w$]+)\.push\s*\(\s*([^)]+)\)/gu,
          ];
  for (const motif of affectations) {
    for (const trouve of masque.matchAll(motif)) poser(trouve[1]!, trouve[2]!);
  }

  // Les corps de fonction : une cible peut venir d'un assistant du même fichier — `bac("essai")`,
  // `dossierNeuf()`. Sans eux, les 67 effacements de l'hôte Rust seraient tous accusés, alors
  // qu'ils passent tous par un bac de `temp_dir()`.
  const fonctions =
    langage === "rust"
      ? /\bfn\s+([\w]+)\s*\([^)]*\)[^{;]*\{/gu
      : langage === "python"
        ? /^[ \t]*def\s+([\w]+)\s*\(/gmu
        : /\b(?:function\s+([\w$]+)\s*\(|(?:const|let|var)\s+([\w$]+)\s*(?::[^=\n]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>)/gu;
  for (const trouve of masque.matchAll(fonctions)) {
    const nom = trouve[1] ?? trouve[2];
    if (nom === undefined) continue;
    if (langage === "python") {
      // Le corps d'un `def` va jusqu'à la première ligne non vide dont l'indentation retombe.
      const lignes = masque.slice(trouve.index).split("\n");
      const creux = /^[ \t]*/u.exec(lignes[0]!)![0].length;
      const corps: string[] = [];
      for (const ligne of lignes.slice(1)) {
        if (ligne.trim() !== "" && /^[ \t]*/u.exec(ligne)![0].length <= creux) break;
        corps.push(ligne);
      }
      poser(nom, corps.join("\n"));
      continue;
    }
    const accolade = masque.indexOf("{", trouve.index + trouve[0].length - 1);
    if (accolade === -1) {
      poser(nom, masque.slice(trouve.index, trouve.index + 400));
      continue;
    }
    poser(nom, masque.slice(accolade, finDuGroupe(masque, accolade) + 1));
  }
  return table;
}

/** Les noms d'un texte, sans les mots-clés qui n'ont jamais de liaison. */
const MOTS_SANS_LIAISON = new Set([
  "join", "resolve", "new", "URL", "String", "from", "PathBuf", "Path", "format", "self", "this",
  "std", "env", "fs", "os", "path", "shutil", "pathlib", "await", "async", "return", "const", "let",
  "var", "true", "false", "null", "undefined", "str", "to_path_buf", "to_string", "clone", "expect",
  "unwrap", "ok", "parent", "as_ref", "display", "push", "with", "and_then", "map", "filter",
]);

function nomsDe(texte: string): readonly string[] {
  return [...new Set((texte.match(/[A-Za-z_$][\w$]*/gu) ?? []).filter((nom) => !MOTS_SANS_LIAISON.has(nom)))];
}

/** La cible mène-t-elle au dossier temporaire ? Rend la trace suivie, vide si elle y mène. */
function remonter(
  cible: string,
  table: ReadonlyMap<string, readonly string[]>,
): { readonly borne: boolean; readonly trace: readonly string[] } {
  const trace: string[] = [];
  const vus = new Set<string>();
  let aVoir = [cible];
  for (let profondeur = 0; profondeur < 8 && aVoir.length > 0; profondeur += 1) {
    const suivants: string[] = [];
    for (const texte of aVoir) {
      if (DANS_LE_BAC(texte)) return { borne: true, trace };
      for (const nom of nomsDe(texte)) {
        if (vus.has(nom)) continue;
        vus.add(nom);
        for (const valeur of table.get(nom) ?? []) {
          trace.push(`${nom} = ${valeur.trim().replace(/\s+/gu, " ").slice(0, 90)}`);
          suivants.push(valeur);
        }
      }
    }
    aVoir = suivants;
  }
  return { borne: false, trace };
}

export interface CeQueLeReleveSait {
  readonly exceptions?: readonly ExceptionNommee[];
  readonly porteurs?: readonly string[];
  /** Juger **sans** tenir compte du refus nommé. Sert à mesurer le branchement : un fichier qui
   *  n'est borné que par son appel au refus est accusé dès qu'on le retire. */
  readonly ignorerLeRefus?: boolean;
  /** La zone jugée. Par défaut `controles` : c'est le périmètre livré du lot `0z bis`. */
  readonly zone?: Zone;
  /** Le périmètre à employer. Par défaut `estDansLePerimetre`, celui du lot `0z bis`. Ouvert au
   *  produit par les contrôles du lot `0z quinquies` et par l'inventaire qui précède `0z quater`,
   *  pour mesurer sans livrer. */
  readonly perimetre?: (chemin: string) => boolean;
}

/** Tous les effacements récursifs des sources lisibles, exceptions comprises. */
export function effacementsRecursifs(
  sources: readonly Source[],
  sait: CeQueLeReleveSait = {},
): readonly Effacement[] {
  const { zone = "controles", perimetre = estDansLePerimetre } = sait;
  return sources.flatMap((source) => {
    const langage = langageDe(source.chemin);
    if (langage === undefined || !perimetre(source.chemin)) return [];
    const masque = masqueDeCode(source.contenu, {
      diese: langage === "python",
      apostropheDeDureeDeVie: langage === "rust",
    });
    return effacementsDe(source, restreindre(masque, plagesJugees(masque, source.chemin, zone)));
  });
}

/** Les sources qu'aucun langage connu ne couvre : dites, jamais tues. */
export function sourcesIgnorees(sources: readonly Source[]): readonly string[] {
  return sources
    .filter((source) => langageDe(source.chemin) === undefined)
    .map((source) => source.chemin);
}

/** Les effacements récursifs que rien ne borne : ni le dossier temporaire, ni un refus nommé, ni
 *  une exception. */
export function effacementsHorsDuBac(
  sources: readonly Source[],
  sait: CeQueLeReleveSait = {},
): readonly EffacementHorsDuBac[] {
  const {
    exceptions = EXCEPTIONS,
    porteurs = PORTEURS_DU_REFUS,
    ignorerLeRefus = false,
    zone = "controles",
    perimetre = estDansLePerimetre,
  } = sait;
  const accuses: EffacementHorsDuBac[] = [];

  for (const source of sources) {
    const langage = langageDe(source.chemin);
    if (langage === undefined || !perimetre(source.chemin)) continue;
    if (porteurs.includes(source.chemin)) continue;

    const entier = masqueDeCode(source.contenu, {
      diese: langage === "python",
      apostropheDeDureeDeVie: langage === "rust",
    });
    // Le masque de la ZONE jugée : les effacements et les liaisons en viennent tous les deux.
    const masque = restreindre(entier, plagesJugees(entier, source.chemin, zone));
    const porteLeRefus = new RegExp(`\\b${REFUS_NOMME}\\s*\\(`, "u").test(masque);
    if (porteLeRefus && !ignorerLeRefus) continue;

    const table = liaisons(masque, langage);
    for (const efface of effacementsDe(source, masque)) {
      // L'exemption est LOCALE quand l'exception nomme sa fonction : elle ne couvre que les
      // effacements du corps de cette fonction. Sans cela, un second appel de même cible ajouté
      // ailleurs dans le fichier serait exempté sans avoir jamais été nommé — c'est le cas qui
      // ferait passer un effacement en douce, relevé par Christophe le 21 novembre 2026.
      const excepte = exceptions.some((une) => {
        if (une.chemin !== efface.chemin || une.cible !== efface.cible) return false;
        if (une.fonction === undefined) return true;
        const corps = corpsDeLaFonction(masque, une.fonction, langage);
        if (corps === undefined) return false;
        const premiere = masque.slice(0, corps[0]).split("\n").length;
        const derniere = masque.slice(0, corps[1]).split("\n").length;
        return efface.ligne >= premiere && efface.ligne <= derniere;
      });
      if (excepte) continue;
      const { borne, trace } = remonter(efface.cible, table);
      if (borne) continue;
      accuses.push({ ...efface, trace });
    }
  }
  return accuses;
}

/** Une exception morte : son site n'existe plus, ou son chemin déclaré ne paraît plus dans le
 *  fichier. Une liste d'exemptions qui survit à ce qu'elle exemptait est pire que pas de liste. */
export interface ExceptionMorte {
  readonly exception: ExceptionNommee;
  readonly pourquoi:
    | "le fichier n'est pas là"
    | "ce site n'efface plus cette cible"
    | "le chemin déclaré ne paraît pas dans le fichier"
    | "la fonction déclarée ne paraît plus dans le fichier"
    | "cette fonction n'efface plus cette cible";
}

export function exceptionsMortes(
  sources: readonly Source[],
  exceptions: readonly ExceptionNommee[] = EXCEPTIONS,
): readonly ExceptionMorte[] {
  const parChemin = new Map(sources.map((source) => [source.chemin, source] as const));
  const mortes: ExceptionMorte[] = [];
  for (const exception of exceptions) {
    const source = parChemin.get(exception.chemin);
    if (source === undefined) {
      mortes.push({ exception, pourquoi: "le fichier n'est pas là" });
      continue;
    }
    const langage = langageDe(source.chemin);
    const masque = masqueDeCode(source.contenu, {
      diese: langage === "python",
      apostropheDeDureeDeVie: langage === "rust",
    });
    // Quand la fonction est nommée, l'effacement doit être DANS SON CORPS. Vérifier seulement que
    // la fonction existe et qu'un effacement de cette cible traîne quelque part dans le fichier
    // laissait passer le pire des cas : l'appel déplacé hors de la fonction, ou un second appel de
    // même cible ajouté ailleurs, que l'exception aurait exempté sans l'avoir jamais nommé.
    // Faiblesse relevée par Christophe le 21 novembre 2026, avant le commit.
    if (exception.fonction !== undefined) {
      const corps = corpsDeLaFonction(masque, exception.fonction, langage!);
      if (corps === undefined) {
        mortes.push({ exception, pourquoi: "la fonction déclarée ne paraît plus dans le fichier" });
        continue;
      }
      const [ouverture, fermeture] = corps;
      const dedans = effacementsDe(source, restreindre(masque, [[ouverture, fermeture]]));
      if (!dedans.some((un) => un.cible === exception.cible)) {
        mortes.push({ exception, pourquoi: "cette fonction n'efface plus cette cible" });
        continue;
      }
    } else if (!effacementsDe(source, masque).some((un) => un.cible === exception.cible)) {
      mortes.push({ exception, pourquoi: "ce site n'efface plus cette cible" });
      continue;
    }
    // Le dernier segment LITTÉRAL suffit : le fichier dit « moteurs » ou « @napi-rs », pas son
    // chemin depuis la racine. Un segment variable — `canvas-<architecture>` — ne se cherche pas
    // littéralement : on prend le dernier qui n'en soit pas un.
    const dernier = exception.efface
      .split("/")
      .filter((un) => un !== "" && !/[<{]/u.test(un))
      .at(-1);
    // Quand tous les segments sont variables — `<le coin du cache que l'appelant nomme>` —, il n'y
    // a rien à chercher littéralement, et c'est le corps de la fonction qui atteste. On ne se
    // rabat PAS sur la chaîne entière : elle n'est pas un chemin, et l'exiger dans le fichier
    // ferait accuser à tort.
    if (dernier !== undefined && !source.contenu.includes(dernier)) {
      mortes.push({ exception, pourquoi: "le chemin déclaré ne paraît pas dans le fichier" });
    }
  }
  return mortes;
}

/** Un porteur du refus qui ne porte plus de comparaison au dossier temporaire : il rejoindrait le
 *  relevé, et le garde-fou doit le dire avant que ce soit vrai. */
export function porteursSansRefus(
  sources: readonly Source[],
  porteurs: readonly string[] = PORTEURS_DU_REFUS,
): readonly string[] {
  const parChemin = new Map(sources.map((source) => [source.chemin, source] as const));
  return porteurs.filter((chemin) => {
    const source = parChemin.get(chemin);
    if (source === undefined) return true;
    const masque = masqueDeCode(source.contenu, {
      diese: langageDe(chemin) === "python",
      apostropheDeDureeDeVie: langageDe(chemin) === "rust",
    });
    return !DANS_LE_BAC(masque);
  });
}

/** Les fichiers qui ne sont bornés **que** par leur appel au refus nommé.
 *
 *  C'est le branchement, mesuré et non supposé : retirer l'appel dans l'un d'eux le fait entrer au
 *  relevé. Si cette liste devenait vide, l'exigence « retirer l'appel doit faire rougir » ne
 *  garderait plus rien — et le contrôle qui la lit doit alors le dire, au lieu de passer au vert
 *  sur une liste vide. */
export function tiennentParLeRefusNomme(
  sources: readonly Source[],
  sait: CeQueLeReleveSait = {},
): readonly string[] {
  const { exceptions = EXCEPTIONS, porteurs = PORTEURS_DU_REFUS } = sait;
  const tenus: string[] = [];
  for (const source of sources) {
    const langage = langageDe(source.chemin);
    if (langage === undefined || !estDansLePerimetre(source.chemin)) continue;
    if (porteurs.includes(source.chemin)) continue;
    const masque = masqueDeCode(source.contenu, {
      diese: langage === "python",
      apostropheDeDureeDeVie: langage === "rust",
    });
    if (!new RegExp(`\\b${REFUS_NOMME}\\s*\\(`, "u").test(masque)) continue;
    const sansLeRefus = effacementsHorsDuBac([source], { exceptions, porteurs, ignorerLeRefus: true });
    if (sansLeRefus.length > 0) tenus.push(source.chemin);
  }
  return tenus;
}
