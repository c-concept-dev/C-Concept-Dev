import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Les réglages actifs sont ceux que le dépôt porte — et « ce que le dépôt porte » est son commit.
 *
 *  ## Pourquoi deux copies existent
 *
 *  Le travail se fait dans une copie liée du dépôt, pour qu'un basculement de branche d'une autre
 *  session ne change pas celle-ci sous les pieds. Mais Claude Code lit ses réglages dans le dossier
 *  de la **session**, qui est une autre copie. Les deux existent par construction, et c'est une
 *  conséquence du choix de la copie liée, pas un oubli.
 *
 *  ## Pourquoi un contrôle, et non un script qu'on lance
 *
 *  Un script qu'on lance quand on y pense dépend de l'attention, et ce n'est plus un garde-fou.
 *  C'est la remarque de Christophe du 7 novembre 2026, et elle a été faite sur ce sujet même : la
 *  vérification existait, en shell, et attendait qu'on s'en souvienne.
 *
 *  **Un réglage divergent ne se signale pas tout seul : il agit, simplement, autrement.**
 *
 *  ## La référence est le COMMIT, et c'est la dette D19 levée
 *
 *  Première version de ce contrôle : la référence était un fichier **sur le disque**, celui de la
 *  copie où le contrôle tournait, et le code l'appelait « la copie versionnée ». Elle ne l'était
 *  pas : aucun fichier de `.claude/` n'était suivi par Git, nulle part. Le contrôle comparait donc
 *  deux copies non suivies, et restait **vert** si l'on remplaçait le crochet dans les deux — le
 *  cas même qu'un garde-fou de réglages doit attraper. Un clone neuf, lui, n'avait pas de crochet
 *  du tout.
 *
 *  La référence est désormais **les octets du commit** (`git show HEAD:…`). Trois conséquences :
 *
 *  1. remplacer un réglage dans toutes les copies du disque ne trompe plus le contrôle ;
 *  2. un réglage surveillé que le commit ne porte **pas** fait rougir, au lieu de passer ;
 *  3. il n'y a plus de cas « on est déjà dans la copie principale, donc rien à comparer » :
 *     se comparer **à son commit** dit quelque chose, toujours.
 *
 *  ## UNE SEULE copie est comparée, et c'est celle qui agit
 *
 *  `git worktree list` donne plusieurs copies de ce dépôt. Les comparer toutes ferait rougir le
 *  contrôle à tort : une copie posée sur une autre branche ou sur un ancien commit (un bissectage,
 *  le travail d'une autre session) porte **légitimement** une autre version du crochet — c'est ce
 *  que son commit contient. Rougir là-dessus, c'est accuser git d'avoir fait son travail, et un
 *  garde-fou qui accuse à tort finit désarmé.
 *
 *  Le contrôle ne compare donc que la copie **où une session lit ses réglages** : la copie
 *  principale, celle que `git rev-parse --git-common-dir` nomme.
 *
 *  ### La maille de ce filet
 *
 *  Une session lancée dans une copie liée lirait ses réglages **là**, et le contrôle ne la
 *  regarderait pas. C'est l'agencement du 29 octobre qui désigne la copie principale, pas une
 *  déduction. Et la référence étant le commit de la copie où le contrôle tourne, une branche qui
 *  ne porte pas encore `.claude/` fait rougir — ce qui est exact, et c'est la dette D17.
 *  Un filet, pas un mur.
 *
 *  ## Les copies sont NOMMÉES, pas devinées
 *
 *  Tout vient de git : la liste des copies, laquelle est la principale, le sous-dossier du projet
 *  et le contenu du commit. Construire un chemin frère en retirant un suffixe aurait marché sur
 *  cette machine et nulle part ailleurs. */

/** Ce qui doit être identique au commit dans la copie qui agit, relatif au dossier du projet. */
export const REGLAGES_SURVEILLES: readonly string[] = [
  ".claude/settings.json",
  ".claude/crochets/refuser-gestes-destructeurs.sh",
  ".claude/crochets/verifier-reglages.sh",
];

/** Une copie de ce dépôt, telle que git la nomme. */
export interface CopieDuDepot {
  /** Le dossier du projet dans cette copie. */
  readonly projet: string;
  /** Le commit sur lequel elle est posée. */
  readonly tete: string;
  /** Sa branche, ou `undefined` si sa tête est détachée. */
  readonly branche?: string;
  /** Vraie pour la copie principale, celle qui porte le dossier git commun. */
  readonly principale: boolean;
}

/** Ce que le commit porte pour un réglage surveillé. */
export type AuCommit = { readonly octets: Buffer } | { readonly absent: true };

const executerGit = (executer: typeof execFileSync, args: readonly string[], cwd: string): string =>
  executer("git", [...args], { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }) as string;

/** Les copies de ce dépôt, avec leur branche, leur tête, et laquelle est la principale. */
export function copiesDuDepot(projet: string, executer = execFileSync): readonly CopieDuDepot[] {
  const sortie = executerGit(executer, ["worktree", "list", "--porcelain"], projet);
  const commun = executerGit(executer, ["rev-parse", "--path-format=absolute", "--git-common-dir"], projet).trim();
  const racinePrincipale = dirname(commun);
  const sousDossier = executerGit(executer, ["rev-parse", "--show-prefix"], projet).trim().replace(/\/$/u, "");

  const copies: CopieDuDepot[] = [];
  let racine: string | undefined;
  let tete = "";
  let branche: string | undefined;
  const clore = (): void => {
    if (racine === undefined) return;
    const dossier = sousDossier === "" ? racine : join(racine, sousDossier);
    if (existsSync(dossier))
      copies.push({ projet: dossier, tete, ...(branche === undefined ? {} : { branche }), principale: racine === racinePrincipale });
    racine = undefined;
    tete = "";
    branche = undefined;
  };
  for (const ligne of sortie.split("\n")) {
    if (ligne.startsWith("worktree ")) {
      clore();
      racine = ligne.slice("worktree ".length);
    } else if (ligne.startsWith("HEAD ")) tete = ligne.slice("HEAD ".length);
    else if (ligne.startsWith("branch ")) branche = ligne.slice("branch ".length);
  }
  clore();
  return copies;
}

/** Ce que le commit de cette copie porte pour chacun des réglages surveillés.
 *
 *  L'appartenance au commit se lit par `ls-tree`, en une fois, et jamais par l'échec de
 *  `git show` : un échec de git doit rester un échec bruyant, pas se lire « absent du commit ». */
export function reglagesDuCommit(
  projet: string,
  surveilles: readonly string[] = REGLAGES_SURVEILLES,
  executer = execFileSync,
): ReadonlyMap<string, AuCommit> {
  // Les chemins donnes a `ls-tree` s'entendent depuis le DOSSIER COURANT, et sa sortie aussi ;
  // `--full-name` ne change que la sortie, pas la lecture des chemins. On lui parle donc en
  // chemins du projet, et on garde le prefixe pour `git show`, qui lui part de la racine.
  const prefixe = executerGit(executer, ["rev-parse", "--show-prefix"], projet).trim();
  const listes = executerGit(executer, ["ls-tree", "-r", "--name-only", "HEAD", "--", ...surveilles], projet);
  const presents = new Set(listes.split("\n").filter((ligne) => ligne !== ""));

  const au = new Map<string, AuCommit>();
  for (const relatif of surveilles) {
    if (!presents.has(relatif)) {
      au.set(relatif, { absent: true });
      continue;
    }
    const octets = executer("git", ["show", `HEAD:${prefixe}${relatif}`], {
      cwd: projet,
      maxBuffer: 8 * 1024 * 1024,
    }) as Buffer;
    au.set(relatif, { octets });
  }
  return au;
}

/** La copie où une session lit ses réglages : la copie principale, qu'on s'y trouve ou non.
 *
 *  La référence étant le commit, et non un fichier frère, s'y trouver ne rend plus la comparaison
 *  vide : on compare alors ce que la copie porte à ce que son commit dit. */
export function copieDesReglagesActifs(copies: readonly CopieDuDepot[]): string | undefined {
  return copies.find((copie) => copie.principale)?.projet;
}

/** Les écarts entre ce que le commit porte et ce que la copie qui agit porte.
 *
 *  Une copie qui ne porte pas le fichier n'obéit à aucun réglage : il n'y a rien à redire. Une
 *  copie qui en porte un autre, en revanche, agit autrement, et c'est précisément ce qu'on cherche. */
export function ecartsDeReglages(
  projet: string,
  options?: {
    readonly copies?: readonly CopieDuDepot[];
    readonly surveilles?: readonly string[];
    readonly auCommit?: ReadonlyMap<string, AuCommit>;
  },
): readonly string[] {
  const surveilles = options?.surveilles ?? REGLAGES_SURVEILLES;
  const copies = options?.copies ?? copiesDuDepot(projet);
  const auCommit = options?.auCommit ?? reglagesDuCommit(projet, surveilles);
  const active = copieDesReglagesActifs(copies);
  const ecarts: string[] = [];
  for (const relatif of surveilles) {
    const porte = auCommit.get(relatif);
    if (porte === undefined || "absent" in porte) {
      ecarts.push(`${relatif} : absent du commit de cette copie, alors qu'il est surveillé`);
      continue;
    }
    if (active === undefined) continue;
    const actif = join(active, relatif);
    if (!existsSync(actif)) continue;
    if (!readFileSync(actif).equals(porte.octets))
      ecarts.push(`${relatif} : ${active} en porte une autre version que le commit`);
  }
  return ecarts;
}
