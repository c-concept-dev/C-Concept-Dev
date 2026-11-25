import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Cache de travail sur disque.
 *
 *  Traiter un livre de trois cents pages produit beaucoup de choses qu'on voudrait garder entre
 *  deux exécutions — les lectures d'OCR surtout, qui coûtent une seconde la page — et beaucoup de
 *  choses qu'il faut jeter tout de suite : les images intermédiaires. Les deux vont ici, et rien
 *  d'ici n'entre dans le dépôt.
 *
 *  ## Où il vit, depuis le lot `0z undecies`
 *
 *  Le **dossier de cache du système**, celui que la plateforme prévoit pour cela. Avant, un chemin
 *  en dur vers un volume externe — `/Volumes/…` — et un **repli** dans la copie de travail quand
 *  ce volume n'était pas monté. Les deux ont disparu, pour deux raisons mesurées le 24 novembre
 *  2026 : le volume est débranchable, donc le repli était la règle et non l'exception (877 s
 *  perdues en un seul contrôle) ; et le repli écrivait **dans la copie de travail**, où un cache
 *  n'a rien à faire — sur une machine d'intégration continue, qui n'a aucun `/Volumes`, c'était le
 *  cas de toutes les courses.
 *
 *  `LIENOTHEQUE_CACHE` passe devant. **Déclaré et introuvable, il refuse** : un dossier qu'on a
 *  nommé et qui manque est une erreur de la personne ou un volume démonté, pas une invitation à
 *  choisir à sa place. Le refus arrive **avant** tout traitement, et il nomme le dossier.
 *
 *  ## Ce que ce module ne fait toujours pas
 *
 *  Mesuré le 24 novembre 2026, et **inchangé par ce lot** : `nettoyer` n'a aucun appelant, donc le
 *  plafond n'est appliqué par personne, et `peser` n'est lue que par ses propres contrôles, donc
 *  rien ne dit jamais ce que le cache pèse. Qui applique le plafond et qui jette se décide dans
 *  les rangées qui suivent `0z undecies` — peser et afficher d'abord, retirer ensuite —, et la
 *  **politique du plus ancien d'abord y sera reprise** : les dix plus anciens fichiers du cache
 *  mesurés le 25 novembre sont des captures et des **lectures d'OCR**, c'est-à-dire ce qui coûte
 *  le plus cher à refaire. Dette **D33**. D'ici là, `plafond` est une valeur portée, pas une borne
 *  tenue. */

/** Le nom du dossier, sous le dossier de cache de la plateforme. */
export const NOM_DU_CACHE = "lienotheque";
/** Plafond du cache. Porté, pas encore appliqué : voir l'en-tête et D33. */
export const PLAFOND_PAR_DEFAUT = 50 * 1024 ** 3;

export type Reglages = {
  /** Où le cache doit vivre. `LIENOTHEQUE_CACHE` sinon, le dossier du système à défaut.
   *
   *  Donné ici ou par l'environnement, c'est un dossier **déclaré** : s'il n'est pas joignable,
   *  l'ouverture refuse. */
  readonly dossier?: string | undefined;
  readonly plafond?: number;
  /** La plateforme à considérer. Le vrai `process.platform` par défaut ; les contrôles la posent
   *  pour éprouver les trois systèmes depuis un seul. */
  readonly plateforme?: NodeJS.Platform;
  /** L'environnement à lire. Le vrai `process.env` par défaut, et il se pose pour la même raison.
   *
   *  C'est un **paramètre**, non une variable qu'on écrirait : `process.env` est global au
   *  processus, et deux contrôles en parallèle se le disputeraient. */
  readonly environnement?: NodeJS.ProcessEnv;
};

export type Cache = {
  /** Dossier réellement utilisé. */
  readonly dossier: string;
  readonly plafond: number;
};

/** Le dossier de cache de la plateforme, sans rien créer ni rien lire sur le disque.
 *
 *  Les trois systèmes, parce que le projet est multiplateforme et que l'intégration continue
 *  tourne sur deux d'entre eux. Windows est **suspendu, pas abandonné** (décision du 5 novembre
 *  2026) : son chemin est donc écrit, conservé et éprouvé ici, comme le reste de son code. */
export function cacheParDefaut(
  plateforme: NodeJS.Platform = process.platform,
  environnement: NodeJS.ProcessEnv = process.env,
): string {
  const maison = environnement["HOME"] ?? homedir();
  if (plateforme === "darwin") return join(maison, "Library", "Caches", NOM_DU_CACHE);
  if (plateforme === "win32") {
    const local =
      environnement["LOCALAPPDATA"] ?? join(environnement["USERPROFILE"] ?? homedir(), "AppData", "Local");
    return join(local, NOM_DU_CACHE, "cache");
  }
  // Linux et tout le reste : la convention XDG, qui porte son propre défaut.
  return join(environnement["XDG_CACHE_HOME"] ?? join(maison, ".cache"), NOM_DU_CACHE);
}

const joignable = (dossier: string): boolean => {
  try {
    mkdirSync(dossier, { recursive: true });
    const marque = join(dossier, ".joignable");
    writeFileSync(marque, "");
    rmSync(marque, { force: true });
    return true;
  } catch {
    return false;
  }
};

/** Ouvre le cache. Échoue **avant** que le traitement ne commence, jamais au milieu, et nomme
 *  toujours le dossier qu'elle n'a pas pu ouvrir. */
export function ouvrirCache(reglages: Reglages = {}): Cache {
  const environnement = reglages.environnement ?? process.env;
  const plafond = reglages.plafond ?? PLAFOND_PAR_DEFAUT;
  const declare = reglages.dossier ?? environnement["LIENOTHEQUE_CACHE"];

  if (declare !== undefined) {
    if (!joignable(declare))
      throw new Error(
        `Cache déclaré introuvable : « ${declare} » ne peut pas être ouvert en écriture — ` +
          `volume démonté, chemin faux, ou écriture refusée. Montez le volume, corrigez le chemin, ` +
          `ou retirez la déclaration pour employer le dossier de cache du système.`,
      );
    return { dossier: declare, plafond };
  }

  const defaut = cacheParDefaut(reglages.plateforme, environnement);
  if (!joignable(defaut))
    throw new Error(`Cache du système inutilisable : « ${defaut} » ne peut pas être ouvert en écriture.`);
  return { dossier: defaut, plafond };
}

/** Un coin du cache, désigné par le chemin de sa racine.
 *
 *  Le même geste que `coin`, pour les appelants qui n'ont qu'un chemin — un processus qui reçoit
 *  sa racine d'un hôte, par exemple, et à qui l'on n'envoie pas un objet de cache par un tuyau. */
export function sousDossier(racine: string, nom: string): string {
  const chemin = join(racine, nom);
  mkdirSync(chemin, { recursive: true });
  return chemin;
}

/** Un coin du cache, pour un usage donné. */
export function coin(cache: Cache, nom: string): string {
  return sousDossier(cache.dossier, nom);
}

export type Pesee = { readonly octets: number; readonly fichiers: number };

/** Ce que le cache pèse, récursivement. */
export function peser(dossier: string): Pesee {
  if (!existsSync(dossier)) return { octets: 0, fichiers: 0 };
  let octets = 0;
  let fichiers = 0;
  for (const entree of readdirSync(dossier, { recursive: true, withFileTypes: true })) {
    if (!entree.isFile()) continue;
    try {
      octets += statSync(join(entree.parentPath, entree.name)).size;
      fichiers += 1;
    } catch {
      // Un fichier effacé pendant qu'on comptait : il ne pèse plus rien.
    }
  }
  return { octets, fichiers };
}

/** Retire le plus ancien jusqu'à repasser sous le plafond. Rend ce qui a été libéré.
 *
 *  **Aucun appelant, et c'est voulu pour l'instant** : la politique du plus ancien d'abord est
 *  juste pour un coin jetable et fausse pour un coin coûteux — mesuré le 25 novembre 2026, les
 *  plus anciens fichiers du cache sont des lectures d'OCR. Elle se décide par coin, dans une
 *  rangée qui vient après l'affichage du poids. */
export function nettoyer(cache: Cache, plafond = cache.plafond): Pesee {
  const entrees: { chemin: string; octets: number; vu: number }[] = [];
  if (!existsSync(cache.dossier)) return { octets: 0, fichiers: 0 };

  for (const entree of readdirSync(cache.dossier, { recursive: true, withFileTypes: true })) {
    if (!entree.isFile()) continue;
    const chemin = join(entree.parentPath, entree.name);
    try {
      const etat = statSync(chemin);
      entrees.push({ chemin, octets: etat.size, vu: etat.mtimeMs });
    } catch {
      // Déjà disparu.
    }
  }

  let total = entrees.reduce((somme, entree) => somme + entree.octets, 0);
  let libere = 0;
  let retires = 0;
  for (const entree of entrees.sort((a, b) => a.vu - b.vu)) {
    if (total <= plafond) break;
    try {
      rmSync(entree.chemin, { force: true });
      total -= entree.octets;
      libere += entree.octets;
      retires += 1;
    } catch {
      // Un fichier qu'on ne peut pas retirer n'arrête pas le nettoyage.
    }
  }
  return { octets: libere, fichiers: retires };
}
