import type { LigneInterpretee, Recette } from "@lienotheque/contrats";

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
  readonly disque?: number;
  readonly nom: string;
  readonly empreinte: string;
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
export function lireNomMedia(nom: string, motif?: string): IndicesDuNom {
  if (motif === undefined) {
    const trouve = /(\d+)/.exec(nom);
    return trouve === null ? {} : { piste: Number(trouve[1]) };
  }

  const ordre: string[] = [];
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
    ordre.push(champ);
    expression += CHAMPS.includes(champ as (typeof CHAMPS)[number]) ? "(\\d+)" : "(.+?)";
    reste = reste.slice(marque.index + marque[0].length);
  }

  const lu = new RegExp(`^${expression}`).exec(nom);
  if (lu === null) return {};

  const indices: Record<string, number> = {};
  ordre.forEach((champ, rang) => {
    if (!CHAMPS.includes(champ as (typeof CHAMPS)[number])) return;
    const valeur = Number(lu[rang + 1]);
    if (Number.isFinite(valeur)) indices[champ] = valeur;
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

export function associer(lignes: readonly LigneInterpretee[], medias: readonly Media[], recette: Recette): Association {
  const parPiste = new Map<string, Media>();
  for (const media of [...medias].sort((a, b) => a.nom.localeCompare(b.nom, "fr")))
    if (!parPiste.has(clef(media.disque, media.piste))) parPiste.set(clef(media.disque, media.piste), media);

  const seuil = recette.validation.seuil_confiance;
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
