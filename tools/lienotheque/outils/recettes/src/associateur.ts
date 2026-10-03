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

/** Numéro de piste tiré d'un nom de fichier : le premier nombre qu'il contient. Indice, rien de
 *  plus — c'est l'appelant qui décide s'il s'en sert (REC-05). */
export function pisteDuNom(nom: string): number | undefined {
  const trouve = /(\d+)/.exec(nom);
  return trouve === null ? undefined : Number(trouve[1]);
}

/** Associe. Un média par numéro de piste ; à doublon, le premier dans l'ordre des noms, pour que
 *  deux exécutions rendent le même résultat (REC-02). */
export function associer(lignes: readonly LigneInterpretee[], medias: readonly Media[], recette: Recette): Association {
  const parPiste = new Map<number, Media>();
  for (const media of [...medias].sort((a, b) => a.nom.localeCompare(b.nom, "fr")))
    if (!parPiste.has(media.piste)) parPiste.set(media.piste, media);

  const seuil = recette.validation.seuil_confiance;
  const appariements: Appariement[] = lignes.map((ligne) => {
    const media = parPiste.get(ligne.piste);
    return {
      ligne,
      ...(media === undefined ? {} : { media }),
      // Aucun segment n'a été vérifié dans l'audio : on ne prétend pas savoir où ça commence.
      segment: "inconnu" as const,
      statut: media !== undefined && ligne.confiance >= seuil ? ("auto" as const) : ("a_verifier" as const),
    };
  });

  const reclamees = new Set(lignes.map((ligne) => ligne.piste));
  const orphelins = [...parPiste.keys()].filter((piste) => !reclamees.has(piste)).sort((a, b) => a - b);
  const manquants = [...reclamees].filter((piste) => !parPiste.has(piste)).sort((a, b) => a - b);

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
