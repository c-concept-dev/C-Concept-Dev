import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DemandeVision,
  EntreeCacheVision,
  ZONES_MAX_PAR_APPEL,
  reponseRepondA,
  type Recette,
  type ReponseVision,
  type ZoneAlire,
  type ZoneLue,
} from "@lienotheque/contrats";
import type { ImageGrise } from "@lienotheque/images";
import type { Candidat } from "./candidats.js";
import { recadrerPour } from "./recadrage.js";

/** La relecture d'un lot : ce qui part, ce qui revient, ce qui est gardé (OUT-08, REC-02, REC-04).
 *
 *  Trois propriétés tiennent ce fichier, et chacune a son test :
 *
 *  1. **Un rejeu ne rappelle personne.** Ce qui a été lu est gardé sous l'empreinte de son image.
 *     Relire le même lot ne fait aucun appel — un test le prouve en passant un transport qui lève
 *     dès qu'on le touche.
 *  2. **Le budget s'arrête net.** Le plafond vient de la recette. Atteint, les pavés restants ne
 *     sont pas lus et ne disparaissent pas : ils remontent, et c'est à Vérifier de les montrer.
 *  3. **Rien n'entre sans contrat.** La demande est validée avant de partir, la réponse après être
 *     revenue, et le recoupement zone par zone est fait ici aussi — l'appelant d'un réseau ne
 *     fait jamais confiance à ce qui en revient. */

/** Le transport. Ce que l'application met derrière est un appel au Worker ; ce que les tests
 *  mettent derrière est ce qu'ils veulent éprouver. Aucune clé ne passe par ici. */
export type Transport = (demande: DemandeVision) => Promise<ReponseVision>;

export type CacheVision = {
  lire(empreinte: string): EntreeCacheVision | undefined;
  ecrire(empreinte: string, entree: EntreeCacheVision): void;
};

/** Un cache qui ne sert jamais une entrée douteuse.
 *
 *  Écriture en deux temps — fichier temporaire puis renommage —, parce qu'un processus interrompu
 *  au milieu d'un write laisse un fichier tronqué, et qu'un JSON tronqué se relit comme un objet
 *  plausible si personne ne le valide. Lecture validée par le contrat, et toute entrée illisible
 *  est effacée : mieux vaut la relire que la servir. La leçon est celle du cache de lecture. */
export function cacheDansDossier(dossier: string): CacheVision {
  mkdirSync(dossier, { recursive: true });
  const fichier = (empreinte: string): string => join(dossier, `${empreinte}.json`);

  return {
    lire(empreinte) {
      const chemin = fichier(empreinte);
      if (!existsSync(chemin)) return undefined;
      try {
        const valide = EntreeCacheVision.safeParse(JSON.parse(readFileSync(chemin, "utf8")));
        if (valide.success && valide.data.zone.empreinte === empreinte) return valide.data;
      } catch {
        // Illisible : on tombe dans l'effacement ci-dessous.
      }
      rmSync(chemin, { force: true });
      return undefined;
    },
    ecrire(empreinte, entree) {
      const chemin = fichier(empreinte);
      const provisoire = `${chemin}.${process.pid}.partiel`;
      writeFileSync(provisoire, JSON.stringify(EntreeCacheVision.parse(entree)));
      renameSync(provisoire, chemin);
    },
  };
}

/** Combien d'entrées un cache garde. Pour dire, dans un rapport, ce qui n'a pas été repayé. */
export const entreesGardees = (dossier: string): number =>
  existsSync(dossier) ? readdirSync(dossier).filter((nom) => nom.endsWith(".json")).length : 0;

export type ZoneRelue = {
  readonly candidat: Candidat;
  readonly zone: ZoneLue;
  readonly outil: { readonly nom: string; readonly version: string };
  /** Vrai quand rien n'a été appelé pour l'obtenir. */
  readonly depuisLeCache: boolean;
};

export type Relecture = {
  readonly relues: readonly ZoneRelue[];
  /** Les pavés que le budget a laissés de côté, ou dont le recadrage n'a pas pu être fait. Ils ne
   *  disparaissent pas : l'appelant les porte à Vérifier. */
  readonly nonRelus: readonly { readonly candidat: Candidat; readonly raison: "budget" | "recadrage" }[];
  readonly jetons: { readonly entree: number; readonly sortie: number };
  readonly appels: number;
  readonly depuisLeCache: number;
};

export type OptionsRelecture = {
  readonly cache?: CacheVision;
  /** Intervalle que la recette autorise : de 1 au nombre de pistes du support (REC-05). */
  readonly attendu?: { readonly min: number; readonly max: number };
};

/** Relit les pavés douteux d'un lot.
 *
 *  Les images sont fournies page par page — en gris, à la résolution d'origine. Ce qui est déjà
 *  dans le cache ne compte pas dans le budget : une entrée gardée ne coûte rien, et la faire
 *  compter rendrait un rejeu plus cher que la première fois. */
export async function relire(
  candidats: readonly Candidat[],
  imageDeLaPage: (candidat: Candidat) => ImageGrise | undefined,
  recette: Recette,
  transport: Transport,
  options: OptionsRelecture = {},
): Promise<Relecture> {
  const plafond = recette.vision?.zones_max_par_lot ?? 0;
  const relues: ZoneRelue[] = [];
  const nonRelus: { candidat: Candidat; raison: "budget" | "recadrage" }[] = [];
  const jetons = { entree: 0, sortie: 0 };
  let appels = 0;
  let depuisLeCache = 0;
  let payees = 0;

  /** Ce qui attend un appel : le pavé recadré, et le candidat qui l'a produit. */
  const enAttente: { candidat: Candidat; zone: ZoneAlire }[] = [];

  const vider = async (): Promise<void> => {
    if (enAttente.length === 0) return;
    const lot = enAttente.splice(0, enAttente.length);
    const demande = DemandeVision.parse({ alphabet: "chiffres", zones: lot.map((entree) => entree.zone) });

    const reponse = await transport(demande);
    appels += 1;
    jetons.entree += reponse.jetons.entree;
    jetons.sortie += reponse.jetons.sortie;

    // On ne fait pas confiance à ce qui revient d'un réseau, même validé par son contrat : il
    // reste à vérifier que cela répond bien à ce qu'on a demandé.
    const ecarts = reponseRepondA(demande, reponse);
    if (ecarts.length > 0) throw new Error(`La relecture ne répond pas à la demande : ${ecarts.join(", ")}`);

    const parEmpreinte = new Map(reponse.zones.map((zone) => [zone.empreinte, zone]));
    for (const { candidat, zone } of lot) {
      const lue = parEmpreinte.get(zone.empreinte);
      if (lue === undefined) continue;
      const entree = EntreeCacheVision.parse({ zone: lue, outil: reponse.outil });
      options.cache?.ecrire(zone.empreinte, entree);
      relues.push({ candidat, zone: lue, outil: entree.outil, depuisLeCache: false });
    }
  };

  for (const candidat of candidats) {
    const image = imageDeLaPage(candidat);
    if (image === undefined) {
      nonRelus.push({ candidat, raison: "recadrage" });
      continue;
    }
    const produit = await recadrerPour(image, candidat, options.attendu);
    if (produit === undefined) {
      nonRelus.push({ candidat, raison: "recadrage" });
      continue;
    }

    const gardee = options.cache?.lire(produit.zone.empreinte);
    if (gardee !== undefined) {
      depuisLeCache += 1;
      relues.push({ candidat, zone: gardee.zone, outil: gardee.outil, depuisLeCache: true });
      continue;
    }

    // Arrêt net : au plafond, on ne lit plus, et on ne perd rien de ce qui restait.
    if (payees >= plafond) {
      nonRelus.push({ candidat, raison: "budget" });
      continue;
    }
    payees += 1;
    enAttente.push({ candidat, zone: produit.zone });
    if (enAttente.length >= ZONES_MAX_PAR_APPEL) await vider();
  }
  await vider();

  return { relues, nonRelus, jetons, appels, depuisLeCache };
}
