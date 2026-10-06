import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Cache de travail sur disque.
 *
 *  Traiter un livre de trois cents pages produit beaucoup de choses qu'on voudrait garder entre
 *  deux exécutions — les lectures d'OCR surtout, qui coûtent un quart d'heure — et beaucoup de
 *  choses qu'il faut jeter tout de suite : les images intermédiaires. Les deux vont ici, et rien
 *  d'ici n'entre dans le dépôt.
 *
 *  Trois règles. Un plafond, parce qu'un cache sans plafond finit par remplir un disque, et c'est
 *  arrivé. Un nettoyage explicite, qui retire le plus ancien jusqu'à repasser sous le plafond.
 *  Et un repli : si le volume prévu n'est pas monté, on se rabat sur un dossier local plus étroit
 *  en le disant, plutôt que d'échouer au milieu d'un traitement. */

/** Dossier choisi par défaut quand rien n'est déclaré. Il contient une espace : tout chemin
 *  qui le traverse se cite entre guillemets dans un terminal. */
export const CACHE_PAR_DEFAUT = "/Volumes/Macbook Pro/lienotheque-cache";
/** Plafond du cache principal. */
export const PLAFOND_PAR_DEFAUT = 50 * 1024 ** 3;
/** Plafond du repli local : il vit sur le disque de la machine, il reste modeste. */
export const PLAFOND_REPLI = 2 * 1024 ** 3;

export type Reglages = {
  /** Où le cache doit vivre. `LIENOTHEQUE_CACHE` sinon, le dossier par défaut à défaut. */
  readonly dossier?: string | undefined;
  /** Où se replier si le premier n'est pas joignable. */
  readonly repli?: string;
  readonly plafond?: number;
  readonly plafondRepli?: number;
  /** Où dire ce qui s'est passé. La console par défaut ; rien du tout en test. */
  readonly avertir?: (message: string) => void;
};

export type Cache = {
  /** Dossier réellement utilisé. */
  readonly dossier: string;
  /** Vrai quand on a dû se replier : l'appelant peut le dire à son tour. */
  readonly replie: boolean;
  readonly plafond: number;
};

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

/** Ouvre le cache, avec repli. N'échoue pas : au pire le repli, au pire du pire une erreur claire
 *  avant que le traitement ne commence, jamais au milieu. */
export function ouvrirCache(reglages: Reglages = {}): Cache {
  const avertir = reglages.avertir ?? ((message: string) => console.warn(message));
  const voulu = reglages.dossier ?? process.env["LIENOTHEQUE_CACHE"] ?? CACHE_PAR_DEFAUT;

  if (joignable(voulu)) return { dossier: voulu, replie: false, plafond: reglages.plafond ?? PLAFOND_PAR_DEFAUT };

  const repli = reglages.repli ?? join(process.cwd(), ".cache");
  avertir(
    `Cache : « ${voulu} » n'est pas joignable — volume démonté ou écriture refusée. ` +
      `Repli sur « ${repli} », plafonné à ${Math.round((reglages.plafondRepli ?? PLAFOND_REPLI) / 1024 ** 3)} Gio.`,
  );
  if (!joignable(repli)) throw new Error(`Aucun cache utilisable : ni « ${voulu} », ni « ${repli} »`);
  return { dossier: repli, replie: true, plafond: reglages.plafondRepli ?? PLAFOND_REPLI };
}

/** Un coin du cache, pour un usage donné. */
/** Un coin du cache, désigné par le chemin de sa racine.
 *
 *  Le même geste que `coin`, pour les appelants qui n'ont qu'un chemin — un processus qui reçoit
 *  sa racine d'un hôte, par exemple, et à qui l'on n'envoie pas un objet de cache par un tuyau. */
export function sousDossier(racine: string, nom: string): string {
  const chemin = join(racine, nom);
  mkdirSync(chemin, { recursive: true });
  return chemin;
}

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
 *  Le plus ancien d'abord : ce qui a servi récemment resservira. */
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

/** Vide un coin du cache de fond en comble. Pour les images intermédiaires, qui ne doivent
 *  survivre à aucune exécution. */
export function vider(chemin: string): void {
  rmSync(chemin, { recursive: true, force: true });
  mkdirSync(chemin, { recursive: true });
}
