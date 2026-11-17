/** Ce que le dépôt portait **avant** le contrôle complet, et ce qu'il porte **après** — pour que le
 *  contrôle sache s'il a jugé un état qui tenait en place.
 *
 *  ## D'où vient ce garde-fou
 *
 *  Du 5 novembre 2026 : un document écrit **pendant** une course a rendu son verdict faux pour ce
 *  document. La parade est restée **manuelle** douze jours — un relevé `sha256` tapé à la main,
 *  hors du dépôt, avant et après chaque course. Une parade qu'il faut penser à poser n'est pas un
 *  garde-fou : le jour où on l'oublie est exactement le jour où elle servait.
 *
 *  Demandé par Christophe le 17 novembre 2026, lot `0c quater` : « tout le dépôt via `git status`,
 *  dans le script du contrôle complet ». Les trois termes comptent — **tout le dépôt**, parce
 *  qu'une liste de fichiers choisis est une liste à tenir à jour ; **`git status`**, parce qu'il
 *  connaît déjà le dépôt mieux qu'aucune énumération ; et **dans le script du contrôle complet**,
 *  parce que là il est inévitable.
 *
 *  ## Pourquoi `git status` NE SUFFIT PAS, et c'est mesuré
 *
 *  `git status --porcelain` rend des **états**, non des contenus. Une copie de travail déjà sale —
 *  l'état ordinaire quand on contrôle avant de commiter — rend exactement la même ligne
 *  « ` M chemin` » après une seconde écriture dans le même fichier. Mesuré le 17 novembre 2026 :
 *  deux écritures successives dans un fichier suivi, deux relevés `git status` **identiques au
 *  caractère**, et le cas est précisément celui du 5 novembre.
 *
 *  Le relevé prend donc, pour chaque chemin que `git status` nomme, la **taille**, la **date de
 *  dernière écriture** et l'**empreinte** du contenu. `git status` reste l'énumérateur — il voit
 *  apparaître, disparaître, indexer, dé-indexer —, et ces trois valeurs voient réécrire. La date
 *  attrape en plus le cas qu'aucune empreinte ne verrait : un fichier modifié puis **rendu
 *  identique** pendant la course.
 *
 *  ## Ce que ce relevé ne voit pas, et il faut le dire
 *
 *  Les fichiers **ignorés** (`target/`, les moteurs, les œuvres) n'entrent dans aucun des deux
 *  relevés : `git status` ne les nomme pas. Une écriture là-dedans reste invisible. C'est voulu —
 *  les contrôles y écrivent en permanence, et un relevé qui les suivrait refuserait toute course.
 *
 *  ## Le prix, mesuré avant d'être imposé
 *
 *  Le 17 novembre 2026, sur ce dépôt — **8 291** chemins suivis, dont 996 du projet :
 *  `git status --porcelain --untracked-files=all` coûte **52 ms**, et le `--porcelain` nu coûte la
 *  même chose. L'option qui nomme chaque fichier non suivi est donc **gratuite** ici, et deux
 *  relevés par course coûtent un dixième de seconde sur neuf minutes. Aucune raison de choisir
 *  l'aveuglement pour épargner un centième.
 */
import { createHash } from "node:crypto";
import { statSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Lance un programme et rend ce qu'il a dit. Donné du dehors : le relevé s'éprouve sans Git. */
export type Lancer = (programme: string, arguments_: readonly string[]) => { readonly code: number; readonly sortie: string };

/** Ce qu'un chemin porte à un instant : assez pour voir une réécriture, et rien de plus. */
export interface EtatDUnChemin {
  /** Les deux caractères d'état que `git status --porcelain` met devant le chemin : `??` pour un
   *  fichier non suivi, ` M` pour un suivi modifié, `A ` pour un ajout indexé, et ainsi de suite.
   *  Ils servent à **dire ce qui est arrivé** : sans eux, un fichier suivi qui devient modifié et
   *  un fichier qui vient de naître se racontent de la même façon, et le relevé du 17 novembre
   *  2026 annonçait « apparu pendant la course » pour un fichier vieux de dix jours. */
  readonly code: string;
  readonly taille: number;
  /** Date de dernière écriture, en millisecondes. Elle attrape la réécriture à l'identique. */
  readonly ecritLe: number;
  readonly empreinte: string;
}

/** Le dépôt entier, vu par `git status`, chaque chemin nommé pesé et empreint. */
export interface ReleveDuDepot {
  /** La sortie brute de `git status --porcelain`, telle quelle : elle porte les états. */
  readonly etats: string;
  readonly chemins: ReadonlyMap<string, EtatDUnChemin | "illisible">;
}

/** Les chemins que `git status --porcelain` nomme, dans l'ordre où il les rend.
 *
 *  Le format est `XY chemin`, et un renommage s'écrit `R  ancien -> nouveau` : les deux côtés
 *  comptent, puisque les deux ont bougé. Les guillemets que Git pose autour d'un chemin à
 *  caractères inhabituels sont retirés — sans quoi on irait lire un fichier dont le nom porte des
 *  guillemets, qui n'existe pas. */
export function cheminsNommes(etats: string): readonly { readonly code: string; readonly chemin: string }[] {
  const nommes: { code: string; chemin: string }[] = [];
  for (const ligne of etats.split("\n")) {
    if (ligne.length < 4) continue;
    const code = ligne.slice(0, 2);
    for (const part of ligne.slice(3).split(" -> ")) {
      const nu = part.startsWith('"') && part.endsWith('"') ? part.slice(1, -1) : part;
      if (nu !== "") nommes.push({ code, chemin: nu });
    }
  }
  return nommes;
}

/** Relève le dépôt entier. `racine` est la racine du dépôt — celle que Git rend, non celle du
 *  projet : les chemins de `git status` se comptent depuis elle. */
export function releverLeDepot(lancer: Lancer, racine: string): ReleveDuDepot {
  // `--untracked-files=all` et non le `--porcelain` nu : **mesuré le 17 novembre 2026**, `git
  // status --porcelain` replie un dossier non suivi en UNE ligne (« `?? ailleurs/` ») et ne nomme
  // aucun des fichiers qu'il contient. Le relevé aurait donc été aveugle à un fichier écrit dans
  // un dossier déjà non suivi — et le dossier `fixtures/` d'une session en porte. Le prix de
  // l'option est mesuré dans le commentaire d'en-tête.
  const vu = lancer("git", ["status", "--porcelain", "--untracked-files=all"]);
  if (vu.code !== 0) throw new Error(`git status a échoué : ${vu.sortie}`);
  const chemins = new Map<string, EtatDUnChemin | "illisible">();
  for (const { code, chemin } of cheminsNommes(vu.sortie)) {
    try {
      const complet = join(racine, chemin);
      const pesee = statSync(complet);
      // Un dossier non suivi est nommé par `git status` avec une barre finale : il n'a ni taille
      // ni contenu qui veuillent dire quelque chose, et on ne lit donc que sa date.
      const empreinte = pesee.isFile()
        ? createHash("sha256").update(readFileSync(complet)).digest("hex")
        : "dossier";
      chemins.set(chemin, { code, taille: pesee.size, ecritLe: pesee.mtimeMs, empreinte });
    } catch {
      // Un chemin que `git status` nomme et que le disque n'a plus — un fichier supprimé, par
      // exemple — est noté illisible plutôt que de faire tomber le relevé. Son passage de
      // lisible à illisible est lui-même un mouvement, et il sera dit.
      chemins.set(chemin, "illisible");
    }
  }
  return { etats: vu.sortie, chemins };
}

/** Ce qui a bougé entre deux relevés, dit en français. Vide quand le dépôt n'a pas bougé. */
export function ceQuiABouge(avant: ReleveDuDepot, apres: ReleveDuDepot): readonly string[] {
  const dits: string[] = [];
  for (const [chemin, etat] of apres.chemins) {
    const vieux = avant.chemins.get(chemin);
    if (vieux === undefined) {
      // Deux histoires différentes, et le code d'état les sépare : un fichier qui vient de naître,
      // ou un fichier suivi qui était **intact** au départ et que la course a modifié. Le second
      // est le cas du 5 novembre 2026, et c'est le plus grave des deux.
      dits.push(
        etat === "illisible"
          ? `${chemin} : nommé par git status pendant la course, et illisible`
          : etat.code === "??"
            ? `${chemin} : arrivé pendant la course (fichier non suivi)`
            : `${chemin} : modifié pendant la course, alors qu'il était intact au départ (git status : « ${etat.code} »)`,
      );
      continue;
    }
    if (vieux === "illisible" || etat === "illisible") {
      if (vieux !== etat) dits.push(`${chemin} : ${vieux === "illisible" ? "reparu" : "disparu"} pendant la course`);
      continue;
    }
    if (etat.empreinte !== vieux.empreinte)
      dits.push(`${chemin} : réécrit pendant la course (${vieux.taille} → ${etat.taille} octets)`);
    else if (etat.ecritLe !== vieux.ecritLe)
      dits.push(`${chemin} : réécrit à l'identique pendant la course (même contenu, autre date)`);
  }
  for (const chemin of avant.chemins.keys())
    if (!apres.chemins.has(chemin))
      dits.push(`${chemin} : rendu à son état du commit pendant la course, ou effacé`);
  return dits;
}
