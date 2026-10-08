import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DemandeVision,
  EntreeCacheVision,
  ZONES_MAX_PAR_APPEL,
  reponseRepondA,
  type Recette,
  type ReponseVision,
  type QuestionVision,
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
 *  2. **Le budget s'arrête net.** Deux plafonds, tous deux venus de la recette : un nombre de
 *     zones, et une dépense. Atteints, les pavés restants ne sont pas lus et ne disparaissent
 *     pas : ils remontent avec leur raison, et c'est à Vérifier de les montrer. La dépense est
 *     comptée sur les jetons que les réponses rapportent, jamais sur une estimation — mais c'est
 *     bien une estimation qui décide d'un appel, puisqu'on arrête **avant** celui qui ferait
 *     dépasser, pas après.
 *  3. **Rien n'entre sans contrat.** La demande est validée avant de partir, la réponse après être
 *     revenue, et le recoupement zone par zone est fait ici aussi — l'appelant d'un réseau ne
 *     fait jamais confiance à ce qui en revient. */

/** Le transport. Ce que l'application met derrière est un appel au Worker ; ce que les tests
 *  mettent derrière est ce qu'ils veulent éprouver. Aucune clé ne passe par ici. */
export type Transport = (demande: DemandeVision) => Promise<ReponseVision>;

/** Ce qu'un million de jetons coûte, en euros.
 *
 *  Ces nombres ne viennent d'aucune mesure : c'est un prix affiché, et il change sans nous. Il est
 *  donc remplaçable par l'appelant, et la valeur par défaut dit de quoi elle est tirée — le tarif
 *  en dollars de Claude Haiku 4.5, converti au taux nommé ci-dessous. Si l'un des trois bouge, il
 *  bouge ici et nulle part ailleurs. */
export type Tarif = { readonly entreeParMillion: number; readonly sortieParMillion: number };
const DOLLARS_PAR_EURO = 1.08;
export const TARIF_PAR_DEFAUT: Tarif = { entreeParMillion: 1 / DOLLARS_PAR_EURO, sortieParMillion: 5 / DOLLARS_PAR_EURO };

/** Ce qu'un appel coûtera, à peu près, avant de le faire.
 *
 *  Mesuré sur de vrais pavés : un appel coûte 1058 jetons d'entrée quelle que soit sa taille — la
 *  consigne et le schéma de l'outil pèsent presque tout — et une trentaine de jetons de plus par
 *  zone. C'est ce qui rend le groupement par vingt plus décisif que la taille des images.
 *
 *  Une estimation, donc, et assumée comme telle : elle sert à décider d'un appel, pas à compter ce
 *  qui a été dépensé. Ce qui est dépensé vient des réponses. */
const JETONS_FIXES_PAR_APPEL = 1058;
/** Par zone, à l'agrandissement retenu — 37 à l'échelle d'origine, 60 au double. On prend le
 *  second : c'est celui qu'on envoie. */
const JETONS_ENTREE_PAR_ZONE = 60;
/** Le formulaire rendu est court — une empreinte, un nombre, une confiance. J'avais écrit 40 en
 *  le disant majoré ; mesuré, il vaut 42,6 à 43,8, donc je majorais à l'envers. Corrigé à 50, et
 *  cette fois la mesure est derrière le chiffre : une projection qui sous-estime laisserait passer
 *  l'appel qu'on voulait refuser, et c'est tout ce qu'on lui demande de ne pas faire. */
const JETONS_SORTIE_PAR_ZONE = 50;

export const coutEnEuros = (jetons: { readonly entree: number; readonly sortie: number }, tarif: Tarif = TARIF_PAR_DEFAUT): number =>
  (jetons.entree / 1e6) * tarif.entreeParMillion + (jetons.sortie / 1e6) * tarif.sortieParMillion;

/** Ce qu'un appel de `zones` zones coûterait, selon la mesure. */
export const coutProjete = (zones: number, tarif: Tarif = TARIF_PAR_DEFAUT): number =>
  coutEnEuros(
    { entree: JETONS_FIXES_PAR_APPEL + zones * JETONS_ENTREE_PAR_ZONE, sortie: zones * JETONS_SORTIE_PAR_ZONE },
    tarif,
  );

export type CacheVision = {
  /** `cherche` dit ce que la demande attend. Une entrée gardée avant qu'on demande le verdict de
   *  présence reste valide en elle-même, mais ne répond plus à la question : elle est alors
   *  refusée, donc redemandée une fois. Sans ce paramètre, le cache servirait le passé — et il
   *  l'a fait, sur 141 pavés d'une première mesure qu'il a fallu refaire. */
  lire(empreinte: string, cherche?: QuestionVision): EntreeCacheVision | undefined;
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
    lire(empreinte, cherche) {
      const chemin = fichier(empreinte);
      if (!existsSync(chemin)) return undefined;
      try {
        const valide = EntreeCacheVision.safeParse(JSON.parse(readFileSync(chemin, "utf8")));
        if (valide.success && valide.data.zone.empreinte === empreinte) {
          // Une entrée sans verdict ne répond pas à une demande qui en attend un. On l'efface
          // plutôt que de la servir : elle sera redemandée une fois, et la suivante répondra.
          if (cherche === "repere" && valide.data.zone.repere === undefined) rmSync(chemin, { force: true });
          else return valide.data;
        }
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
  readonly nonRelus: readonly { readonly candidat: Candidat; readonly raison: "budget" | "cout" | "recadrage" }[];
  readonly jetons: { readonly entree: number; readonly sortie: number };
  /** Ce qui a réellement été dépensé, d'après les jetons que les réponses ont rapportés. */
  readonly cout: number;
  readonly appels: number;
  readonly depuisLeCache: number;
};

export type OptionsRelecture = {
  readonly cache?: CacheVision;
  /** Prix du million de jetons. Par défaut, le tarif affiché converti en euros. */
  readonly tarif?: Tarif;
  /** Intervalle que la recette autorise : de 1 au nombre de pistes du support (REC-05). */
  readonly attendu?: { readonly min: number; readonly max: number };
  /** Agrandissement du recadrage, quand il ne doit pas être celui de la recette. Une seconde
   *  relecture d'une zone contestée se fait sur un **autre** recadrage : redemander la même image
   *  rendrait la même réponse, et la troisième voix n'en serait pas une. */
  readonly agrandissement?: number;
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
  const plafondCout = recette.vision?.cout_max_eur;
  const tarif = options.tarif ?? TARIF_PAR_DEFAUT;
  const relues: ZoneRelue[] = [];
  const nonRelus: { candidat: Candidat; raison: "budget" | "cout" | "recadrage" }[] = [];
  const jetons = { entree: 0, sortie: 0 };
  let appels = 0;
  let depuisLeCache = 0;
  let payees = 0;
  let cout = 0;
  /** Vrai dès qu'un appel a été refusé par le plafond de dépense : tout ce qui suit l'est aussi.
   *  Sans cela on continuerait d'essayer, et un appel plus petit passerait là où un plus grand a
   *  été refusé — l'arrêt serait net pour les uns et poreux pour les autres. */
  let coutEpuise = false;

  /** Ce qui attend un appel : le pavé recadré, et le candidat qui l'a produit. */
  const enAttente: { candidat: Candidat; zone: ZoneAlire }[] = [];
  /** Les réponses obtenues dans ce passage, par empreinte. Deux candidats dont le recadrage donne
   *  les mêmes pixels ont la même empreinte : ils ne se payent qu'une fois, et un contrat qui
   *  refuse deux fois la même zone dans un appel n'est pas une gêne mais un garde-fou. */
  const obtenues = new Map<string, { zone: ZoneLue; outil: { nom: string; version: string } }>();
  /** Et ce qui attend déjà, pour ne pas mettre deux fois la même image dans le même lot. */
  const dejaEnAttente = new Set<string>();

  /** Vide ce qui attend, par question : un appel ne pose qu'une seule question, et son formulaire
   *  en dépend. Deux questions dans un même lot ne coûtent qu'un préfixe de plus. */
  const vider = async (question?: string): Promise<void> => {
    const pretes = question === undefined ? enAttente : enAttente.filter((entree) => entree.zone.cherche === question);
    if (pretes.length === 0) return;
    for (const entree of pretes) enAttente.splice(enAttente.indexOf(entree), 1);
    const lot = pretes;

    // On s'arrête **avant** l'appel qui ferait dépasser, pas après : un plafond qu'on constate
    // après coup n'est pas un plafond. La projection est mesurée, et la dépense comptée sur les
    // réponses — la première décide, la seconde fait foi.
    if (plafondCout !== undefined && cout + coutProjete(lot.length, tarif) > plafondCout) {
      coutEpuise = true;
      for (const { candidat } of lot) nonRelus.push({ candidat, raison: "cout" });
      return;
    }

    const demande = DemandeVision.parse({ alphabet: "chiffres", zones: lot.map((entree) => entree.zone) });
    const reponse = await transport(demande);
    appels += 1;
    jetons.entree += reponse.jetons.entree;
    jetons.sortie += reponse.jetons.sortie;
    cout += coutEnEuros(reponse.jetons, tarif);

    // On ne fait pas confiance à ce qui revient d'un réseau, même validé par son contrat : il
    // reste à vérifier que cela répond bien à ce qu'on a demandé.
    const ecarts = reponseRepondA(demande, reponse);
    if (ecarts.length > 0) throw new Error(`La relecture ne répond pas à la demande : ${ecarts.join(", ")}`);

    const parEmpreinte = new Map(reponse.zones.map((zone) => [zone.empreinte, zone]));
    for (const { candidat, zone } of lot) {
      dejaEnAttente.delete(zone.empreinte);
      const lue = parEmpreinte.get(zone.empreinte);
      if (lue === undefined) continue;
      const entree = EntreeCacheVision.parse({ zone: lue, outil: reponse.outil });
      options.cache?.ecrire(zone.empreinte, entree);
      obtenues.set(zone.empreinte, entree);
      relues.push({ candidat, zone: lue, outil: entree.outil, depuisLeCache: false });
    }
  };

  /** Les candidats qu'une empreinte déjà demandée dans ce passage attend encore. */
  const enSuspens = new Map<string, Candidat[]>();

  for (const candidat of candidats) {
    const image = imageDeLaPage(candidat);
    if (image === undefined) {
      nonRelus.push({ candidat, raison: "recadrage" });
      continue;
    }
    const produit = await recadrerPour(image, candidat, options.attendu, options.agrandissement ?? recette.vision?.agrandissement ?? 1);
    if (produit === undefined) {
      nonRelus.push({ candidat, raison: "recadrage" });
      continue;
    }

    const gardee = options.cache?.lire(produit.zone.empreinte, produit.zone.cherche);
    if (gardee !== undefined) {
      depuisLeCache += 1;
      relues.push({ candidat, zone: gardee.zone, outil: gardee.outil, depuisLeCache: true });
      continue;
    }

    // Déjà obtenue dans ce passage : la même image ne se redemande pas.
    const vue = obtenues.get(produit.zone.empreinte);
    if (vue !== undefined) {
      relues.push({ candidat, zone: vue.zone, outil: vue.outil, depuisLeCache: true });
      continue;
    }
    // Déjà en attente : on la note, et elle sera servie quand la réponse arrivera.
    if (dejaEnAttente.has(produit.zone.empreinte)) {
      enSuspens.set(produit.zone.empreinte, [...(enSuspens.get(produit.zone.empreinte) ?? []), candidat]);
      continue;
    }

    // Arrêt net : au plafond, on ne lit plus, et on ne perd rien de ce qui restait.
    if (coutEpuise) {
      nonRelus.push({ candidat, raison: "cout" });
      continue;
    }
    if (payees >= plafond) {
      nonRelus.push({ candidat, raison: "budget" });
      continue;
    }
    payees += 1;
    dejaEnAttente.add(produit.zone.empreinte);
    enAttente.push({ candidat, zone: produit.zone });
    const question = produit.zone.cherche;
    if (enAttente.filter((entree) => entree.zone.cherche === question).length >= ZONES_MAX_PAR_APPEL) await vider(question);
  }
  // Ce qui reste, question par question.
  for (const question of new Set(enAttente.map((entree) => entree.zone.cherche))) await vider(question);

  // Et les candidats qui attendaient la réponse d'une image déjà demandée.
  for (const [empreinte, candidats] of enSuspens) {
    const vue = obtenues.get(empreinte);
    if (vue === undefined) continue;
    for (const candidat of candidats) relues.push({ candidat, zone: vue.zone, outil: vue.outil, depuisLeCache: true });
  }

  return { relues, nonRelus, jetons, cout, appels, depuisLeCache };
}
