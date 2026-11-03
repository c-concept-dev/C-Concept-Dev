import type { LigneInterpretee, Recette } from "@lienotheque/contrats";
import { formeDepuisExemple, rangDuNumero, type FormeDeNumero } from "./numeros.js";

/** Associateur média (OUT-10) : relie les éléments lus aux médias, et dit ce qu'il n'a pas pu
 *  relier.
 *
 *  Deux règles. Le nom d'un fichier ne vaut qu'indice de recoupement (REC-05) : il sert à
 *  retrouver le numéro de piste d'un média, jamais à contredire une pastille lue sur la page.
 *  Et faute de segment vérifié, on ne fabrique pas de position : la paire est « inconnue »
 *  (ANC-03), la lecture commencera au début de la piste. */

export type Media = {
  /** Numéro de piste porté par le média — relevé dans ses métadonnées ou, à défaut, son nom. */
  readonly piste: number;
  /** Support dont il est tiré. Un seul disque par défaut. */
  readonly disque?: number | undefined;
  readonly nom: string;
  readonly empreinte: string;
  /** Indices complémentaires que le motif déjà déclaré par la recette a su lire. Ils ne
   *  décident jamais d'un lien : ils peuvent seulement corroborer, ou contredire, une
   *  attribution faite depuis la page. */
  readonly element?: number;
  readonly page?: number;
  readonly dureeS?: number;
};

export type Appariement = {
  readonly ligne: LigneInterpretee;
  readonly media?: Media;
  /** « connu » quand on sait où l'élément commence dans le média ; « inconnu » sinon (ANC-03). */
  readonly segment: "connu" | "inconnu";
  readonly statut: "auto" | "a_verifier";
};

export type Association = {
  readonly appariements: readonly Appariement[];
  /** Médias qu'aucun élément ne réclame : à signaler, jamais à rattacher au hasard. */
  readonly orphelins: readonly number[];
  /** Pistes réclamées par la page et qu'aucun média ne porte. */
  readonly manquants: readonly number[];
  /** Le lot entier ne permet pas d'appliquer honnêtement cette manière de lire. Les lectures
   *  brutes restent disponibles pour le diagnostic, mais rien n'est présenté comme acquis. */
  readonly abstention?: {
    readonly raison: "medias_non_interpretes" | "vivier_non_borne" | "corroboration_insuffisante";
    readonly combien: number;
    /** De quoi l'écrire en clair à qui lit l'écran, sans que l'écran ait à le deviner. */
    readonly pourquoi?: string;
  };
};

/** Ce qu'un nom de fichier laisse deviner. Rien de plus : c'est un indice de recoupement, jamais
 *  une autorité (REC-05). La page garde toujours raison contre lui. */
export type IndicesDuNom = {
  readonly disque?: number;
  readonly piste?: number;
  readonly element?: number;
  readonly page?: number;
};

const CHAMPS = ["disque", "piste", "element", "page"] as const;

/** Lit un nom de fichier selon le motif que la recette déclare.
 *
 *  Le motif est écrit en clair — « {disque}-{piste} {style} - {element} Pg.{page} » — et c'est
 *  lui qui dit où sont les nombres. Sans motif, on retombe sur le premier nombre du nom : c'est
 *  tout ce qu'on peut supposer sans rien savoir du document. */
export function lireNomMedia(nom: string, motif?: string, exempleElement?: string): IndicesDuNom {
  if (motif === undefined) {
    const trouve = /(\d+)/.exec(nom);
    return trouve === null ? {} : { piste: Number(trouve[1]) };
  }

  const ordre: { champ: string; forme?: FormeDeNumero }[] = [];
  let expression = "";
  let reste = motif;
  while (reste.length > 0) {
    const marque = /\{(\w+)\}/.exec(reste);
    if (marque === null) {
      expression += reste.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      break;
    }
    expression += reste.slice(0, marque.index).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const champ = marque[1]!;
    const forme = champ === "element" && exempleElement !== undefined ? formeDepuisExemple(exempleElement) : undefined;
    ordre.push({ champ, ...(forme === undefined ? {} : { forme }) });
    if (forme !== undefined) {
      const source = forme.motif.source.replace(/^\^/, "").replace(/\$$/, "");
      const separateurs = forme.separateurs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expression += `(${source})(?![\\d${separateurs}])`;
    } else expression += CHAMPS.includes(champ as (typeof CHAMPS)[number]) ? "(\\d+)" : "(.+?)";
    reste = reste.slice(marque.index + marque[0].length);
  }

  const lu = new RegExp(`^${expression}`).exec(nom);
  if (lu === null) return {};

  const indices: Record<string, number> = {};
  ordre.forEach(({ champ, forme }, rang) => {
    if (!CHAMPS.includes(champ as (typeof CHAMPS)[number])) return;
    const brut = lu[rang + 1]!;
    const valeur = forme === undefined ? Number(brut) : rangDuNumero(brut, forme);
    if (valeur !== undefined && Number.isFinite(valeur)) indices[champ] = valeur;
  });
  return indices;
}

/** Numéro de piste tiré d'un nom de fichier, sans motif : le premier nombre qu'il contient. */
export function pisteDuNom(nom: string): number | undefined {
  return lireNomMedia(nom).piste;
}

/** Associe. Un média par numéro de piste ; à doublon, le premier dans l'ordre des noms, pour que
 *  deux exécutions rendent le même résultat (REC-02). */
/** Un média se désigne par son support et son rang : la piste 3 du disque 2 n'est pas celle du
 *  disque 1. */
const clef = (disque: number | undefined, piste: number): string => `${disque ?? 1}/${piste}`;

/** Ce dont l'association a besoin, et rien de plus.
 *
 *  Elle demandait une manière de lire entière alors qu'elle n'en lisait que deux valeurs. Cela
 *  fermait la porte à tout appelant qui n'en a pas — un moteur qui trouve ses repères lui-même,
 *  par exemple. Lui fabriquer une manière de lire de façade serait pire que de changer ceci :
 *  la façade déclarerait un seuil et un motif que rien n'a établi, et le moteur hériterait
 *  d'affirmations qu'il n'a pas constatées. */
export type CeQueLAssociationDemande = {
  /** En deçà, une ligne est douteuse plutôt qu'appariée. */
  readonly seuilConfiance: number;
  /** Le motif que les noms de média suivent, quand une manière de lire en déclare un. Un moteur
   *  qui lit les noms sans motif déclaré n'en a pas, et c'est une absence, pas un défaut. */
  readonly motifNom?: string | undefined;
};

/** Ce que l'association demande, tiré d'une manière de lire. */
export const demandeDeLaRecette = (recette: Recette): CeQueLAssociationDemande => ({
  seuilConfiance: recette.validation.seuil_confiance,
  ...(recette.audio?.motif_nom === undefined ? {} : { motifNom: recette.audio.motif_nom }),
});

export function associer(
  lignes: readonly LigneInterpretee[],
  medias: readonly Media[],
  attendu: CeQueLAssociationDemande,
): Association {
  const parPiste = new Map<string, Media>();
  for (const media of [...medias].sort((a, b) => a.nom.localeCompare(b.nom, "fr")))
    if (!parPiste.has(clef(media.disque, media.piste))) parPiste.set(clef(media.disque, media.piste), media);

  const seuil = attendu.seuilConfiance;
  // Un élément sans piste n'est pas un appariement douteux : il n'y a rien à apparier.
  const avecPiste = lignes.filter((ligne): ligne is LigneInterpretee & { piste: number } => ligne.piste !== undefined);
  const appariements: Appariement[] = avecPiste.map((ligne) => {
    const media = parPiste.get(clef(ligne.disque, ligne.piste));
    return {
      ligne,
      ...(media === undefined ? {} : { media }),
      // Aucun segment n'a été vérifié dans l'audio : on ne prétend pas savoir où ça commence.
      segment: "inconnu" as const,
      statut: media !== undefined && ligne.confiance >= seuil ? ("auto" as const) : ("a_verifier" as const),
    };
  });

  const reclamees = new Set(avecPiste.map((ligne) => clef(ligne.disque, ligne.piste)));
  const orphelins = [...parPiste.values()]
    .filter((media) => !reclamees.has(clef(media.disque, media.piste)))
    .map((media) => media.piste)
    .sort((a, b) => a - b);
  const manquants = [...new Set(avecPiste.filter((ligne) => !parPiste.has(clef(ligne.disque, ligne.piste))).map((ligne) => ligne.piste))].sort(
    (a, b) => a - b,
  );

  return { appariements, orphelins, manquants };
}

/** Ce qui compte comme **lecture**, par opposition à une déduction.
 *
 *  Une lecture est quelque chose qui a été vu quelque part : une pastille sur la page, un
 *  identifiant dans le nom d'un enregistrement, une relecture ciblée d'une image. Une déduction
 *  est une règle qui conclut en l'absence de lecture — la suite croissante, l'héritage de la
 *  piste précédente, l'égalité posée en règle entre la piste et le numéro d'élément.
 *
 *  **La distinction n'est pas une subtilité de vocabulaire.** Un recueil de la bibliothèque
 *  publiait 52 liens de source `numero_element` à confiance pleine : la recette posait en règle que
 *  la piste valait le numéro, et rien, absolument rien, n'avait été lu sur ses pages pour
 *  l'appuyer. Le résultat était net, complet et régulier — et il ne reposait sur aucune
 *  observation. */
export const LECTURES = ["pastille", "corroboration_media", "corroboration_table", "vision"] as const;

/** Ce qui autorise — ou non — à publier les liens de ce document (OUT-10).
 *
 *  Trois voies, et trois seulement :
 *
 *  1. **Deux lectures indépendantes** qui portent le même document. Deux façons différentes de
 *     savoir, qui se trompent rarement de la même manière.
 *  2. **Une lecture et un œil** : une seule lecture disponible, mais quelqu'un a vérifié ce
 *     document-ci et l'a consigné. C'est le cas d'un recueil dont les enregistrements ne portent
 *     qu'un rang dans leur nom — rien à corroborer — et dont les liens ont été écoutés.
 *  3. **Sinon, abstention.** Pas de devinette, pas de score affiché « prêt ».
 *
 *  Pourquoi l'œil ne suffit jamais seul : le marqueur de vérification est posé à la main, et il
 *  survit à ce qu'il décrivait. Dans la vraie bibliothèque, deux documents le portent — l'un dont
 *  les liens ont vraiment été écoutés, l'autre dont le marqueur a été posé à une époque où ses
 *  liens pointaient sur l'audio d'un troisième recueil. Seul le second n'a aucune lecture
 *  derrière lui, et c'est ce qui les départage. Un œil confirme une lecture ; il ne la remplace
 *  pas. */
export type Corroboration = {
  /** Les lectures distinctes qui ont réellement produit une piste sur ce document. */
  readonly signaux: readonly string[];
  readonly preuveHumaine: boolean;
  readonly suffisante: boolean;
  readonly pourquoi: string;
};

export function corroborationDesLignes(
  lignes: readonly LigneInterpretee[],
  options: { readonly preuveHumaine?: boolean } = {},
): Corroboration {
  const lectures = new Set<string>();
  for (const ligne of lignes) {
    if (ligne.piste === undefined || ligne.sourcePiste === undefined) continue;
    if ((LECTURES as readonly string[]).includes(ligne.sourcePiste)) lectures.add(ligne.sourcePiste);
  }
  const signaux = [...lectures].sort();
  const preuveHumaine = options.preuveHumaine === true;
  const suffisante = signaux.length >= 2 || (signaux.length === 1 && preuveHumaine);
  return {
    signaux,
    preuveHumaine,
    suffisante,
    pourquoi:
      signaux.length === 0
        ? "Aucune lecture n’appuie ces liens : la manière de lire les déduit, elle ne les a vus nulle part sur les pages."
        : suffisante
          ? signaux.length >= 2
            ? `Deux façons de lire indépendantes s’accordent : ${signaux.join(" et ")}.`
            : `Une seule façon de lire (${signaux[0]}), confirmée par une vérification de ce document.`
          : `Une seule façon de lire appuie ces liens (${signaux[0]}), et personne n’a encore vérifié ce document.`,
  };
}

/** Ce qui prouve — ou non — que le vivier présenté appartient bien à ce document.
 *
 *  Pourquoi le vérifier au lieu de le croire : un vivier qui déborde le document ne produit pas
 *  des liens douteux, il produit des liens **faux et confiants**. Quand le vivier réunit
 *  plusieurs recueils, c'est celui dont les noms passent en tête qui remporte chaque rang
 *  demandé ; le résultat est net, régulier, complet — et porte sur le mauvais recueil. Aucune
 *  mesure de confiance ne le voit, parce que rien n'est incohérent. Seule l'appartenance l'aurait
 *  vu, et elle ne se mesure pas : elle se prouve.
 *
 *  `bornee` est donc une preuve, jamais une présomption. Ne rien savoir n'est pas une preuve :
 *  un document dont on ignore le groupe de dépôt n'est pas borné, et un média qui ne dit pas d'où
 *  il vient ne peut être rattaché à personne. */
export type BorneDuVivier = {
  /** Combien de médias ont été présentés au calcul. */
  readonly presentes: number;
  /** Combien viennent d'un dépôt qui n'est pas celui du document. */
  readonly horsBornes: number;
  /** Combien ne déclarent aucun groupe de dépôt : ni rattachables, ni écartables. */
  readonly sansGroupe: number;
  /** Vrai seulement quand chaque média présenté porte un groupe du document. */
  readonly bornee: boolean;
  readonly pourquoi: string;
};

/** Confronte le vivier présenté aux groupes de dépôt du document. Ne décide rien d'autre. */
export function borneDuVivier(
  groupesDuDocument: readonly string[],
  medias: readonly { readonly provenances?: readonly string[] | undefined }[],
): BorneDuVivier {
  const presentes = medias.length;
  if (groupesDuDocument.length === 0)
    return {
      presentes,
      horsBornes: presentes,
      sansGroupe: 0,
      bornee: false,
      // Deux phrases distinctes, parce que les deux situations ne demandent pas la même chose :
      // sans aucun média présenté il n'y a rien à trier, seulement un dépôt à refaire.
      pourquoi:
        presentes === 0
          ? "Ce document ne dit pas d'où il vient : on ne peut donc pas savoir quels enregistrements lui appartiennent. Déposez-le avec les siens."
          : `Ce document ne dit pas d'où il vient : rien ne permet d'affirmer que les ${presentes} enregistrements présentés lui appartiennent.`,
    };

  const groupes = new Set(groupesDuDocument);
  let sansGroupe = 0;
  let horsBornes = 0;
  for (const media of medias) {
    const siens = media.provenances ?? [];
    if (siens.length === 0) sansGroupe += 1;
    else if (!siens.some((groupe) => groupes.has(groupe))) horsBornes += 1;
  }

  const bornee = sansGroupe === 0 && horsBornes === 0;
  return {
    presentes,
    horsBornes,
    sansGroupe,
    bornee,
    pourquoi: bornee
      ? `Les ${presentes} enregistrements présentés viennent tous d'un dépôt de ce document.`
      : `Sur ${presentes} enregistrements présentés, ${horsBornes} viennent d'un autre dépôt et ${sansGroupe} ne disent pas d'où ils viennent.`,
  };
}

/** Qualifie ce que l'associateur propose avant que les écrans ou le dépôt ne le prennent pour
 *  un fait. Un indice tiré du nom ne crée jamais un lien (REC-05) ; quand la recette en déclare
 *  explicitement un, il sert uniquement de témoin indépendant pour empêcher une attribution
 *  séquentielle contradictoire de devenir automatique. */
export function qualifierAssociation(
  lignes: readonly LigneInterpretee[],
  medias: readonly Media[],
  attendu: CeQueLAssociationDemande,
  options: { readonly borne: BorneDuVivier; readonly corroboration: Corroboration; readonly mediasDisponibles?: number },
): Association {
  // Avant toute autre question, et avant même de regarder si cette manière de lire s'applique :
  // un score calculé dans un vivier qui déborde le document ne vaut rien, aussi régulier soit-il.
  // C'est pourquoi `borne` n'est pas facultatif — un appelant qui ne sait pas sur quoi son vivier
  // est borné ne peut pas publier, et n'a pas à y penser pour que cela soit vrai.
  if (!options.borne.bornee)
    return {
      appariements: [],
      orphelins: [],
      manquants: [],
      abstention: {
        raison: "vivier_non_borne",
        combien: options.borne.horsBornes + options.borne.sansGroupe,
        pourquoi: options.borne.pourquoi,
      },
    };

  const disponibles = options.mediasDisponibles ?? medias.length;
  if (disponibles > 0 && medias.length === 0 && lignes.length > 0)
    return {
      appariements: [],
      orphelins: [],
      manquants: [],
      abstention: { raison: "medias_non_interpretes", combien: disponibles },
    };

  // Enfin : sur quoi ces liens reposent-ils ? Un vivier borné ne suffit pas si rien n'a été lu —
  // le vivier dit à qui appartiennent les enregistrements, pas lequel va avec quelle page.
  // `corroboration` n'est pas facultatif pour la même raison que `borne` : un appelant qui ne
  // sait pas sur quelles lectures il s'appuie ne peut pas publier.
  if (!options.corroboration.suffisante)
    return {
      appariements: [],
      orphelins: [],
      manquants: [],
      abstention: {
        raison: "corroboration_insuffisante",
        combien: lignes.filter((ligne) => ligne.piste !== undefined).length,
        pourquoi: options.corroboration.pourquoi,
      },
    };


  const association = associer(lignes, medias, attendu);
  const motif = attendu.motifNom;
  if (motif === undefined) return association;

  const attendElement = motif.includes("{element}");
  const attendPage = motif.includes("{page}");
  if (!attendElement && !attendPage) return association;

  return {
    ...association,
    appariements: association.appariements.map((appariement) => {
      if (appariement.statut !== "auto" || appariement.media === undefined) return appariement;
      const elementConcorde = !attendElement || appariement.media.element === appariement.ligne.numero;
      const pageConcorde = !attendPage || appariement.media.page === appariement.ligne.pageImprimee;
      return elementConcorde && pageConcorde ? appariement : { ...appariement, statut: "a_verifier" as const };
    }),
  };
}

/** Durée totale des médias reliés, en secondes. `undefined` dès qu'une durée manque : une somme
 *  incomplète qui se présente comme complète est pire que pas de somme. */
export function dureeReliee(association: Association): number | undefined {
  const vus = new Map<number, number>();
  for (const appariement of association.appariements) {
    if (appariement.media === undefined) continue;
    if (appariement.media.dureeS === undefined) return undefined;
    vus.set(appariement.media.piste, appariement.media.dureeS);
  }
  return [...vus.values()].reduce((somme, duree) => somme + duree, 0);
}
