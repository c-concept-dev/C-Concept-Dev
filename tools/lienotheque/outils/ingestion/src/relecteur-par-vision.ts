import { DemandeVision, EntreeCacheVision, reponseRepondA } from "@lienotheque/contrats";
import { agrandir, encoderWebp, recadrer, type ImageGrise } from "@lienotheque/images";
import {
  TARIF_PAR_DEFAUT,
  coutEnEuros,
  coutProjete,
  empreinteDuRecadrage,
  rvbaDepuisGris,
  type CacheVision,
  type Tarif,
  type Transport,
} from "@lienotheque/vision";
import type { DemandeDeRelecture, RelecteurDeZone } from "./relire-les-zones.js";

/** A2 — le regard distant au bout du port de relecture des cases (A2, OUT-05, OUT-08, OUT-10).
 *
 *  ## Ce que ce module est, et ce qu'il n'est pas
 *
 *  C'est le **dernier** étage de la chaîne de relecture : celui qui coûte de l'argent. Il ne part
 *  que sur les cases qu'aucune lecture locale n'a su rendre — c'est `relecteurEnChaine` qui le
 *  garantit, pas ce fichier, et c'est bien ainsi : ordonner les étages n'est pas lire.
 *
 *  Il ne connaît ni clé ni adresse. Le transport est un port : l'application y met un appel au
 *  Worker, les contrôles y mettent une fonction. C'est ce qui permet de l'éprouver sans dépenser
 *  un centime.
 *
 *  ## Une case part seule
 *
 *  Le contrat transporte jusqu'à vingt zones par appel, et ce module n'en met qu'une. Ce n'est pas
 *  un oubli : le port de relecture demande **une** case et attend **une** réponse, et grouper
 *  demanderait un port d'une autre forme — qui accumule, puis rend. Tant que le coût mesuré d'un
 *  appel reste celui d'une petite image, le groupage achèterait de la complexité contre quelques
 *  centimes. Le jour où la mesure dira l'inverse, c'est le port qu'il faudra changer, pas ce
 *  fichier.
 *
 *  ## Ce qui ne se devine pas
 *
 *  Une réponse hors de l'intervalle que le vivier autorise est **refusée**, pas rognée : un
 *  nombre qui ne désigne aucun enregistrement n'a rien à faire dans une table (REC-05). Et
 *  `numero: null` est une réponse pleine et entière — un pavé illisible est illisible. Elle se
 *  **compte**, sous `illisibles`, et jamais parmi les pannes : « j'ai regardé, il n'y a rien »
 *  n'est pas « personne n'a pu regarder ». */

/** Marge claire gardée autour de la case, en parts de sa hauteur.
 *
 *  La même que celle des repères, et pour la même raison mesurée : un chiffre collé au bord de
 *  l'image se lit mal, par un moteur comme par un modèle. Assez pour que le bord de la cellule ne
 *  soit plus le bord de l'image, pas assez pour y faire entrer la case voisine. */
export const MARGE_DE_LA_CASE = 0.4;

/** Agrandissement du recadrage.
 *
 *  Mesuré sur les repères : un pavé de 80 pixels ne fait que deux tuiles sur deux pour un modèle,
 *  et à cette taille il perd des chiffres — 15 justes sur 18 à l'échelle d'origine, 18 sur 18 au
 *  double. Agrandir n'ajoute aucune information : il donne de la surface à qui découpe en tuiles. */
export const AGRANDISSEMENT_DE_LA_CASE = 2;

export type ReleveDeVision = {
  /** Appels réellement partis. Une entrée gardée n'en est pas un. */
  readonly appels: number;
  readonly depuisLeCache: number;
  readonly rendus: number;
  readonly pannes: number;
  /** Les cases **relues** dont rien n'était lisible : `numero: null`, réponse pleine et entière.
   *
   *  Compté à part des pannes, et ce n'est pas une nuance comptable. Une panne dit « personne n'a
   *  pu regarder » ; ceci dit « j'ai regardé, il n'y a rien ». Avant le relâchement du contrat du
   *  12 novembre 2026, le modèle rendait cette réponse avec une confiance, `ZoneLue` la refusait,
   *  et elle arrivait ici en **panne** : 40 fois sur 62 appels d'un document réel. Un relevé qui
   *  les mélange ne peut plus distinguer une route coupée d'un document qu'on a fini de lire. */
  readonly illisibles: number;
  /** Les réponses écartées parce qu'elles débordaient l'intervalle du vivier. */
  readonly refusees: number;
  /** Les cases qui n'ont pas pu être recadrées dans ce que le contrat accepte d'envoyer. */
  readonly horsFormat: number;
  readonly jetons: { readonly entree: number; readonly sortie: number };
  /** Ce qui a été dépensé, d'après les jetons que les réponses ont rapportés — jamais d'après
   *  une projection. La projection décide d'un appel ; la réponse fait foi. */
  readonly cout: number;
  /** Vrai dès qu'un appel a été refusé par le plafond : tout ce qui suit l'est aussi. */
  readonly plafondAtteint: boolean;
};

export type OptionsRelecteurParVision = {
  readonly transport: Transport;
  /** L'image de la page, **dans le repère où les cases sont mesurées**. C'est à l'appelant de
   *  tenir les deux d'accord : lui seul connaît les deux repères. `undefined` quand la page n'est
   *  pas disponible — alors rien ne part. */
  readonly imageDeLaPage: (page: number) => ImageGrise | undefined;
  /** L'intervalle que le vivier autorise : de 1 au nombre d'enregistrements du document (REC-05). */
  readonly attendu?: { readonly min: number; readonly max: number } | undefined;
  readonly cache?: CacheVision | undefined;
  readonly tarif?: Tarif | undefined;
  /** Dépense maximale, en euros. On s'arrête **avant** l'appel qui ferait dépasser : un plafond
   *  qu'on constate après coup n'est pas un plafond. */
  readonly plafondEnEuros?: number | undefined;
  readonly agrandissement?: number | undefined;
  readonly marge?: number | undefined;
};

export function relecteurParVision(options: OptionsRelecteurParVision): {
  readonly relire: RelecteurDeZone;
  readonly releve: () => ReleveDeVision;
} {
  const tarif = options.tarif ?? TARIF_PAR_DEFAUT;
  const agrandissement = options.agrandissement ?? AGRANDISSEMENT_DE_LA_CASE;
  const marge = options.marge ?? MARGE_DE_LA_CASE;
  let appels = 0;
  let depuisLeCache = 0;
  let rendus = 0;
  let pannes = 0;
  let illisibles = 0;
  let refusees = 0;
  let horsFormat = 0;
  let cout = 0;
  const jetons = { entree: 0, sortie: 0 };
  let plafondAtteint = false;

  /** Ce que la réponse autorise à rendre, ou rien. Un seul juge, et c'est l'intervalle du vivier. */
  const retenir = (numero: number | null): string | undefined => {
    if (numero === null) {
      illisibles += 1;
      return undefined;
    }
    if (options.attendu !== undefined && (numero < options.attendu.min || numero > options.attendu.max)) {
      refusees += 1;
      return undefined;
    }
    rendus += 1;
    return String(numero);
  };

  const relire: RelecteurDeZone = async (demande: DemandeDeRelecture) => {
    const image = options.imageDeLaPage(demande.page);
    if (image === undefined) return undefined;

    // La marge est prise sur la hauteur de la case, des quatre côtés : une case large garde ses
    // proportions, et une case étroite ne devient pas un trait.
    const air = Math.round(demande.h * marge);
    const recadre = recadrer(image, {
      x: demande.x - air,
      y: demande.y - air,
      l: demande.l + 2 * air,
      h: demande.h + 2 * air,
    });
    if (recadre.largeur === 0 || recadre.hauteur === 0) {
      horsFormat += 1;
      return undefined;
    }
    const vue = agrandissement === 1 ? recadre : agrandir(recadre, agrandissement);
    // Sans perte : on envoie lire des chiffres de trente pixels de haut, et un codec qui lisse
    // les bords enlève précisément ce qui les distingue.
    const octets = await encoderWebp(rvbaDepuisGris(vue), { lossless: 1 });
    const empreinte = empreinteDuRecadrage(octets);

    const gardee = options.cache?.lire(empreinte, "numero");
    if (gardee !== undefined) {
      depuisLeCache += 1;
      return retenir(gardee.zone.numero);
    }

    // On s'arrête avant l'appel, sur la projection ; la dépense, elle, se compte sur la réponse.
    if (options.plafondEnEuros !== undefined && cout + coutProjete(1, tarif) > options.plafondEnEuros) {
      plafondAtteint = true;
      return undefined;
    }

    const aEnvoyer = DemandeVision.parse({
      alphabet: "chiffres",
      zones: [
        {
          empreinte,
          image: octets.toString("base64"),
          typeMime: "image/webp",
          largeur: vue.largeur,
          hauteur: vue.hauteur,
          cherche: "numero",
          ...(options.attendu === undefined ? {} : { attendu: options.attendu }),
        },
      ],
    });

    let reponse;
    try {
      reponse = await options.transport(aEnvoyer);
    } catch (leve) {
      // La panne se compte ici pour pouvoir être dite seule, et **lève** quand même : c'est la
      // chaîne qui décide ce qu'on fait d'un réseau coupé, et son relevé la compte comme panne
      // et non comme silence. L'avaler rendrait « rien rattrapé », qui ressemble exactement à
      // « rien à rattraper ».
      pannes += 1;
      throw leve;
    }
    appels += 1;
    jetons.entree += reponse.jetons.entree;
    jetons.sortie += reponse.jetons.sortie;
    cout += coutEnEuros(reponse.jetons, tarif);

    // On ne fait pas confiance à ce qui revient d'un réseau, même validé par son contrat : il
    // reste à vérifier que cela répond bien à ce qu'on a demandé.
    const ecarts = reponseRepondA(aEnvoyer, reponse);
    if (ecarts.length > 0) {
      pannes += 1;
      throw new Error(`La relecture ne répond pas à la demande : ${ecarts.join(", ")}`);
    }

    const lue = reponse.zones.find((zone) => zone.empreinte === empreinte);
    if (lue === undefined) return undefined;
    options.cache?.ecrire(empreinte, EntreeCacheVision.parse({ zone: lue, outil: reponse.outil }));
    return retenir(lue.numero);
  };

  return {
    relire,
    releve: () => ({
      appels,
      depuisLeCache,
      rendus,
      pannes,
      illisibles,
      refusees,
      horsFormat,
      jetons: { ...jetons },
      cout: Number(cout.toFixed(6)),
      plafondAtteint,
    }),
  };
}
