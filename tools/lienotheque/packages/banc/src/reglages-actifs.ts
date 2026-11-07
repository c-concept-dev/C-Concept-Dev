import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Les réglages actifs sont ceux que le dépôt porte.
 *
 *  ## Pourquoi deux copies existent
 *
 *  Le travail se fait dans une copie liée du dépôt (`…-main-fusion-wt`), pour qu'un basculement de
 *  branche d'une autre session ne change pas celle-ci sous les pieds. Mais Claude Code lit ses
 *  réglages dans le dossier de la **session**, qui est une autre copie. Les deux existent par
 *  construction, et c'est une conséquence du choix de la copie liée, pas un oubli.
 *
 *  ## Pourquoi un contrôle, et non un script qu'on lance
 *
 *  Un script qu'on lance quand on y pense dépend de l'attention, et ce n'est plus un garde-fou.
 *  C'est la remarque de Christophe du 7 novembre 2026, et elle a été faite sur ce fichier même :
 *  la vérification existait, en shell, et attendait qu'on s'en souvienne.
 *
 *  **Un réglage divergent ne se signale pas tout seul : il agit, simplement, autrement.** Une
 *  session peut obéir à un crochet que personne ne relit et que le dépôt ne porte pas — c'est
 *  l'inverse exact de ce qu'un garde-fou versionné doit garantir.
 *
 *  ## UNE SEULE copie est comparée, et c'est celle qui agit
 *
 *  `git worktree list` donne **huit** copies de ce dépôt. Les comparer toutes ferait rougir le
 *  contrôle à tort : une copie posée sur une autre branche ou sur un ancien commit (un bissectage,
 *  le travail d'une autre session) porte **légitimement** une autre version du crochet — c'est ce
 *  que son commit contient. Rougir là-dessus, c'est accuser git d'avoir fait son travail, et un
 *  garde-fou qui accuse à tort finit désarmé.
 *
 *  Le contrôle ne compare donc que la copie **où une session lit ses réglages** : la copie
 *  principale, celle que `git rev-parse --git-common-dir` nomme. Les sept autres n'ont aucun effet
 *  ici, et leur différence a une explication versionnée.
 *
 *  Cette copie-là est comparée **quelle que soit sa branche** : ce qu'elle porte est ce qui agit.
 *  Si elle est en retard, c'est précisément la divergence qu'on cherche — la session obéit à un
 *  crochet plus ancien que celui qu'on relit.
 *
 *  ### La maille de ce filet
 *
 *  Une session lancée dans une copie liée lirait ses réglages **là**, et le contrôle ne la
 *  regarderait pas. C'est l'agencement du 29 octobre qui désigne la copie principale, pas une
 *  déduction : le contrôle surveille la copie que l'agencement dit active. Un filet, pas un mur.
 *
 *  ## Les copies sont NOMMÉES, pas devinées
 *
 *  Tout vient de git : la liste des copies, laquelle est la principale, et le sous-dossier du
 *  projet. Construire un chemin frère en retirant un suffixe aurait marché sur cette machine et
 *  nulle part ailleurs. */

/** Ce qui doit être identique dans la copie qui agit, relatif au dossier du projet. */
export const REGLAGES_SURVEILLES: readonly string[] = [
  ".claude/settings.json",
  ".claude/crochets/refuser-gestes-destructeurs.sh",
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

const executerGit = (executer: typeof execFileSync, args: readonly string[], cwd: string): string =>
  executer("git", [...args], { cwd, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }) as string;

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

/** La copie où une session lit ses réglages, ou `undefined` s'il n'y a rien à comparer.
 *
 *  C'est la copie principale. Si l'on s'y trouve déjà, il n'y a qu'une copie en jeu et aucune
 *  divergence possible : se comparer à soi-même ne dit rien. */
export function copieDesReglagesActifs(
  copies: readonly CopieDuDepot[],
  courante: string,
): string | undefined {
  const principale = copies.find((copie) => copie.principale);
  if (principale === undefined || principale.projet === courante) return undefined;
  return principale.projet;
}

/** Les écarts entre les réglages versionnés et ceux de la copie qui agit.
 *
 *  Une copie qui ne porte pas le fichier n'obéit à aucun réglage : il n'y a rien à redire. Une
 *  copie qui en porte un autre, en revanche, agit autrement, et c'est précisément ce qu'on cherche. */
export function ecartsDeReglages(
  projet: string,
  options?: {
    readonly copies?: readonly CopieDuDepot[];
    readonly surveilles?: readonly string[];
    readonly courante?: string;
  },
): readonly string[] {
  const surveilles = options?.surveilles ?? REGLAGES_SURVEILLES;
  const courante = options?.courante ?? projet;
  const copies = options?.copies ?? copiesDuDepot(projet);
  const active = copieDesReglagesActifs(copies, courante);
  const ecarts: string[] = [];
  for (const relatif of surveilles) {
    const versionne = join(projet, relatif);
    if (!existsSync(versionne)) {
      ecarts.push(`${relatif} : absent de la copie versionnée, alors qu'il est surveillé`);
      continue;
    }
    if (active === undefined) continue;
    const actif = join(active, relatif);
    if (!existsSync(actif)) continue;
    if (!readFileSync(actif).equals(readFileSync(versionne)))
      ecarts.push(`${relatif} : ${active} en porte une autre version que la copie versionnée`);
  }
  return ecarts;
}
