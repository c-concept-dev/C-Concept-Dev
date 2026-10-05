import type { Recette } from "@lienotheque/contrats";

/** Attribution des pistes (REC-02, A3).
 *
 *  Une pastille lue n'est pas une vérité : un chiffre clair sur fond sombre se lit mal, et deux
 *  éléments voisins peuvent porter la même piste. On ne décide donc pas pastille par pastille,
 *  mais sur toute la suite à la fois : la meilleure attribution est celle qui explique le mieux
 *  l'ensemble des lectures tout en respectant les pas que la recette autorise.
 *
 *  Porté de `docs/prototypes/westwood_apparier.py`, qui reste l'oracle. */

/** Ce dont l'attribution a besoin pour un élément : ce qui a été lu, et à quel point. */
export type LecturePiste = {
  readonly pisteLue?: number | undefined;
  readonly accordPiste: number;
  readonly presencePiste: number;
  /** Combien de formes de la taille d'un chiffre le repère montrait. Plus que la lecture n'en
   *  rend, et c'est qu'un chiffre a été perdu. Seul le changement de support s'en sert, et pour
   *  une raison précise : voir `changementDeSupport`. */
  readonly chiffresComptes?: number | undefined;
  /** Numéro de l'élément. Il ne compte que si la recette déclare que piste et élément coïncident. */
  readonly numero?: number | undefined;
};

/** Poids d'une lecture franche face aux pénalités que la recette exprime.
 *
 *  Les pénalités de la recette — 1,5 pour une piste sautée — sont écrites dans l'échelle du
 *  prototype, où une relecture unanime pèse quatre. Une lecture ici vaut au plus 1 : il faut
 *  donc la ramener à cette échelle, sans quoi aucune pénalité ne serait jamais payable et la
 *  recette ne commanderait rien. */
const POIDS_LECTURE = 4;
/** Poids du numéro d'élément, quand la recette déclare que piste et élément coïncident. Moitié
 *  moins qu'une lecture franche : c'est une indication forte, mais indirecte — elle ne vient pas
 *  du repère lui-même. */
const POIDS_ELEMENT = 2;
/** Répéter la piste précédente coûte un peu : à égalité d'appui, la suite préfère avancer. */
const PENALITE_REPETITION = 0.3;
/** Coût, par piste, d'un départ loin du début. Une méthode commence à la première piste ; partir
 *  plus loin se paie, mais se paie peu — un lot peut ne couvrir qu'une fin de disque. */
const PRIOR_DEPART = 0.1;
/** Au-delà de ce multiple de la valeur maximale d'un début de disque, on tient la numérotation
 *  pour « bien engagée » — c'est ce qui distingue un vrai retour à 1 d'un début de lot. */
const FACTEUR_ENGAGEMENT = 4;
/** En deçà, une lecture ne vaut pas qu'on fonde un changement de disque dessus. */
const ACCORD_SUR = 0.5;
/** Prime donnée à une attribution qui finit sur la dernière piste disponible : un disque se
 *  termine, et une suite qui s'arrête à mi-chemin explique moins bien le lot. */
const PRIME_DERNIERE = 2;

/** Appui d'une lecture pour une piste donnée.
 *
 *  Identiques, l'appui est entier. Sinon, un chiffre a pu être perdu — « 14 » lu « 4 » — ou
 *  ajouté — une bordure lue comme un « 1 ». On accorde alors un appui partiel, plus faible quand
 *  la lecture en dit plus que la piste : inventer un chiffre est plus suspect qu'en manquer un.
 *
 *  Ce 0,45 a été éprouvé et il est un plafond, pas un réglage prudent. Compter les chiffres du
 *  repère permet de savoir qu'une lecture est tronquée — dix fois sur dix sur les clichés de
 *  référence — et on a donc essayé de renverser la préférence dans ce cas : soutenir la piste qui
 *  contient la lecture plutôt que celle qui lui est égale. Balayé sur le lot entier, de 0,45 à 1
 *  pour la contenance et de 0,45 à 1 pour l'égalité, **aucun couple ne fait mieux que 0,45** :
 *  61 premiers éléments sur 92 au témoin, 59 ou 60 partout ailleurs. La suite des pistes faisait
 *  déjà ce travail, et le signal de troncature n'apporte que ses faux positifs. Le détail est
 *  dans `docs/decisions.md`. */
export function appui(lu: number, piste: number): number {
  if (lu === piste) return 1;
  const texteLu = String(lu);
  const textePiste = String(piste);
  if (texteLu.length < textePiste.length && (textePiste.endsWith(texteLu) || textePiste.startsWith(texteLu))) return 0.45;
  if (texteLu.length > textePiste.length && (texteLu.startsWith(textePiste) || texteLu.endsWith(textePiste))) return 0.3;
  return 0;
}

const score = (lecture: LecturePiste, piste: number, egaleNumeroElement: boolean): number => {
  const repere = lecture.pisteLue === undefined ? 0 : lecture.accordPiste * appui(lecture.pisteLue, piste) * POIDS_LECTURE;
  const element = egaleNumeroElement && lecture.numero !== undefined ? appui(lecture.numero, piste) * POIDS_ELEMENT : 0;
  return repere + element;
};

export type ReglesPistes = {
  readonly pasAutorises: readonly number[];
  readonly penalitePas2?: number | undefined;
  readonly changementDisque?: { readonly lecturesSuresConsecutives: number; readonly valeurMax: number } | undefined;
  /** La recette déclare-t-elle que la piste porte le numéro de l'élément ? */
  readonly egaleNumeroElement: boolean;
  /** Combien de pistes le support compte. Un fait sur le média, pas sur son nom (REC-05). */
  readonly nombreDePistes: number;
};

/** Lit les règles de pistes d'une recette, avec les valeurs par défaut du schéma. */
export function reglesDePistes(recette: Recette, nombreDePistes: number): ReglesPistes {
  const pistes = recette.regles.pistes;
  const changement = recette.regles.changement_disque;
  return {
    pasAutorises: pistes?.pas_autorises ?? [0, 1],
    egaleNumeroElement: pistes?.egale_numero_element === true,
    ...(pistes?.penalite_pas_2 === undefined ? {} : { penalitePas2: pistes.penalite_pas_2 }),
    ...(changement === undefined
      ? {}
      : {
          changementDisque: {
            lecturesSuresConsecutives: changement.lectures_sures_consecutives,
            valeurMax: changement.valeur_max,
          },
        }),
    nombreDePistes,
  };
}

/** Une lecture dont on sait qu'il lui manque un chiffre : le repère en montrait plus qu'elle n'en
 *  rend. Elle peut valoir pour l'attribution, qui pèse tout l'ensemble, mais pas pour fonder un
 *  changement de support — c'est la leçon de F4, et elle a coûté vingt et un éléments. */
const tronquee = (lecture: LecturePiste): boolean =>
  lecture.pisteLue !== undefined && (lecture.chiffresComptes ?? 0) > String(lecture.pisteLue).length;

/** Où le support change, s'il change.
 *
 *  Un disque suivant renumérote ses pistes à partir de 1. On cherche donc des lectures sûres et
 *  petites, alors que la numérotation était bien engagée — plusieurs de suite, car une seule
 *  serait un chiffre mal lu. L'indice retourné est celui du premier élément du support suivant.
 *
 *  **Et une lecture tronquée ne compte pas comme petite.** Un « 2 » tiré d'un repère qui porte 82
 *  n'est pas un retour au début, c'est un chiffre perdu, et trois de suite ressemblent exactement
 *  à ce qu'on cherche. Mesuré sur F4 : la relecture ciblée établissait la numérotation à 81-82,
 *  puis trois lectures tronquées déclenchaient un faux changement de disque qui coupait le
 *  premier support en deux et emportait vingt et un éléments. Compter les chiffres du repère dit
 *  précisément ce qu'il faut ici — c'est le seul endroit où ce comptage décide de quelque chose,
 *  et il y décide à bon escient. */
export function changementDeSupport(lectures: readonly LecturePiste[], regles: ReglesPistes): number | undefined {
  const regle = regles.changementDisque;
  if (regle === undefined) return undefined;

  let engagement = 0;
  let consecutives = 0;

  for (const [rang, lecture] of lectures.entries()) {
    const sure = lecture.pisteLue !== undefined && lecture.accordPiste >= ACCORD_SUR && !tronquee(lecture);
    const petite = lecture.pisteLue !== undefined && lecture.pisteLue <= regle.valeurMax;

    if (sure && petite && engagement >= regle.valeurMax * FACTEUR_ENGAGEMENT) {
      consecutives += 1;
      if (consecutives >= regle.lecturesSuresConsecutives) return rang - (regle.lecturesSuresConsecutives - 1);
      continue;
    }
    consecutives = 0;
    if (sure) engagement = Math.max(engagement, lecture.pisteLue!);
  }
  return undefined;
}

const AUCUN = Number.NEGATIVE_INFINITY;

/** La suite de pistes qui explique le mieux les lectures, sous les pas que la recette autorise.
 *
 *  Programmation dynamique : pour chaque élément et chaque piste possible, le meilleur total
 *  atteignable. Un pas de 1 est gratuit, répéter coûte un peu, sauter une piste coûte ce que la
 *  recette dit. Rien n'est décidé avant d'avoir tout vu. */
export function attribuerPistes(lectures: readonly LecturePiste[], regles: ReglesPistes): number[] {
  const m = lectures.length;
  if (m === 0) return [];
  const N = Math.max(1, regles.nombreDePistes);

  const pas = new Map<number, number>();
  for (const valeur of regles.pasAutorises) pas.set(valeur, valeur === 1 ? 0 : PENALITE_REPETITION);
  if (regles.penalitePas2 !== undefined) pas.set(2, regles.penalitePas2);

  const total = Array.from({ length: m }, () => new Float64Array(N + 1).fill(AUCUN));
  const avant = Array.from({ length: m }, () => new Int32Array(N + 1));

  // Toute piste peut ouvrir le lot, mais plus elle est loin du début, plus il faut de lectures
  // pour le justifier.
  for (let piste = 1; piste <= N; piste += 1)
    total[0]![piste] = score(lectures[0]!, piste, regles.egaleNumeroElement) - (piste - 1) * PRIOR_DEPART;

  for (let rang = 1; rang < m; rang += 1) {
    // Quand la recette déclare que la piste porte le numéro de l'élément, l'écart entre deux
    // numéros est un pas légitime, quelle qu'en soit la taille : si six éléments manquent au lot,
    // les six pistes qu'ils ouvraient manquent avec eux, et la suite doit pouvoir les enjamber.
    const sauts = new Map(pas);
    if (regles.egaleNumeroElement) {
      const avantNumero = lectures[rang - 1]!.numero;
      const iciNumero = lectures[rang]!.numero;
      if (avantNumero !== undefined && iciNumero !== undefined && iciNumero > avantNumero)
        sauts.set(iciNumero - avantNumero, 0);
    }

    for (let piste = 1; piste <= N; piste += 1) {
      const ici = score(lectures[rang]!, piste, regles.egaleNumeroElement);
      for (const [saut, penalite] of sauts) {
        const precedente = piste - saut;
        if (precedente < 1 || total[rang - 1]![precedente] === AUCUN) continue;
        const candidat = total[rang - 1]![precedente]! - penalite + ici;
        if (candidat > total[rang]![piste]!) {
          total[rang]![piste] = candidat;
          avant[rang]![piste] = precedente;
        }
      }
    }
  }

  let fin = 1;
  let meilleur = AUCUN;
  for (let piste = 1; piste <= N; piste += 1) {
    const valeur = total[m - 1]![piste]! + (piste === N ? PRIME_DERNIERE : 0);
    if (total[m - 1]![piste] !== AUCUN && valeur > meilleur) {
      meilleur = valeur;
      fin = piste;
    }
  }

  const pistes = new Array<number>(m);
  let piste = fin;
  for (let rang = m - 1; rang >= 0; rang -= 1) {
    pistes[rang] = piste;
    if (rang > 0) piste = avant[rang]![piste]!;
  }
  return pistes;
}
