import { createHash } from "node:crypto";
import { createReadStream, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AcquisDeLecture,
  type LigneInterpretee,
  type PageReperee,
  type ResultatRecette,
} from "@lienotheque/contrats";
import { enGris, formesSombres, type Boite, type ImageGrise } from "@lienotheque/images";
import { coucheSuffisante, lireCoucheTexte, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import {
  COTE_MAXIMAL,
  COTE_MINIMAL,
  NUMEROTATION_PROBABLE,
  accordsNomContenu,
  marquesDesNoms,
  allureDeLaSuite,
  borneDeNumerotation,
  partDeNumerotation,
  zonesAExaminer,
  zonesRecurrentes,
  type FormeObservee,
  type ZoneRecurrente,
  type ContenuDePage,
} from "@lienotheque/noyau";
import {
  attribuerPistes,
  borneDuVivier,
  corroborationDesLignes,
  lireDansLaFenetre,
  mediasDuDossier,
  mediasDeLInventaire,
  qualifierAssociation,
  vote,
  type Association,
  type LecturePiste,
  type Media,
  type MediaInventorie,
  type ReglesPistes,
} from "@lienotheque/recettes";
import { coordonnerLectureDifficile, type LectureTentative } from "@lienotheque/vision";
import { ocrDUnePageGrise } from "./texte.js";

/** Lire un document sans manière de lire écrite à la main (OUT-10).
 *
 *  ## Pourquoi une seconde voie, et non une recette de plus
 *
 *  La voie ordinaire part d'une manière de lire : elle sait d'avance où regarder, à quoi
 *  ressemble la marque, et comment les numéros s'enchaînent. Elle est juste quand quelqu'un a
 *  écrit tout cela, et muette sinon — sur la base réelle, 248 documents sur 250 n'ont aucun lien
 *  faute d'une manière de lire les concernant.
 *
 *  Cette voie-ci ne sait rien d'avance. Elle cherche une **régularité** dans les pages, propose
 *  des endroits, essaie d'y lire, et retient celui où la lecture tient. Ce qu'elle ne trouve pas,
 *  elle le dit.
 *
 *  ## L'ordre, et ce qui le garde honnête
 *
 *  1. Les marques récurrentes désignent des endroits — sans rien conclure.
 *  2. On lit un échantillon de chaque endroit : celui dont **toutes** les apparitions se lisent
 *     est celui qui porte la marque. Le nombre de lectures ne prouve rien — mesuré, une
 *     reconnaissance à qui l'on ne montre que des chiffres rend 84 lectures sur des lettres, et
 *     aucune juste.
 *  3. Le coordinateur impose l'ordre sûr sur chaque marque : lecture locale d'abord, seuil
 *     appliqué par lui-même, et ce qui ne tient pas devient « à vérifier » avec sa raison.
 *  4. L'attribution pèse toute la suite à la fois, avec les **seules** règles génériques — et
 *     sans l'égalité posée entre numéro d'élément et piste, qui est la déduction dangereuse.
 *  5. L'association refuse de publier ce que le vivier ou la corroboration ne soutiennent pas.
 *
 *  ## Ce qu'elle ne fait pas, et le dit
 *
 *  Elle ne lit aucun folio imprimé. Les pages sont donc **déduites**, et le garde-fou OUT-15 le
 *  verra : un document dont aucun folio n'a été lu ne prouve rien sur ses pages. C'est voulu — la
 *  lecture de folio viendra, et d'ici là l'abstention est la bonne réponse, pas un échec.
 *
 *  Aucun regard distant n'y est branché. Le port existe dans le coordinateur ; cette voie lui
 *  répond franchement qu'il n'y a personne au bout, plutôt que de feindre une relecture. */

/** Comment cette façon de lire se nomme, et dans quelle version.
 *
 *  La version n'est pas décorative : c'est elle qui périme les acquis. Elle monte dès que change
 *  **ce qui propose les endroits, ce qui les juge, ou ce qui les lit** — sans quoi une amélioration
 *  de la lecture laisserait les documents déjà vus sur les conclusions de l'ancienne. Elle ne
 *  monte pas quand seul le coût change : l'élagage du 31 octobre 2026 rend les mêmes endroits, au
 *  centième, et n'a donc rien périmé. */
export const ID_DE_LA_VOIE = "voie-sans-maniere-de-lire";
export const VERSION_DE_LA_VOIE = 1;
const LA_VOIE = { id: ID_DE_LA_VOIE, version: VERSION_DE_LA_VOIE } as const;

/** La largeur à laquelle les pages sont rendues. La même que la chaîne de texte : deux largeurs
 *  différentes donneraient deux jeux de formes, et deux résultats pour un même document. */
export const LARGEUR_DE_RENDU = 1800;

/** Combien d'apparitions d'un endroit on lit pour juger s'il porte la marque. Assez pour séparer
 *  « toutes se lisent » de « une sur deux », pas assez pour coûter une passe entière. */
export const APPARITIONS_POUR_JUGER = 12;

/** Ce que l'exploration des endroits se permet au plus, avant de renoncer et de le dire.
 *
 *  Ce n'est pas la réparation d'une fuite. Mesurée sur vingt documents réels, l'exploration
 *  s'arrête d'elle-même, bornée par le contenu : de 4 à 182 essais « endroit × façon de lire »,
 *  tous menés à leur terme, aucun en cours à la fin. C'est un filet pour ce qui n'a pas été
 *  mesuré — vingt documents ne sont pas deux cent cinquante.
 *
 *  Les deux chiffres sortent des mêmes mesures. 256 essais valent 1,4 fois le maximum observé
 *  (182, sur 91 endroits — et l'endroit retenu s'y trouvait au 123ᵉ essai, ce qui interdit de
 *  couper court en espérant que les premiers suffisent). 2 700 secondes valent ces 256 essais au
 *  rythme le plus lent observé (10,2 s l'essai ; l'ordinaire va de 4,3 à 7,7 s) : une machine
 *  lente n'y tombe pas sans y avoir vraiment passé quarante-cinq minutes. La plus longue
 *  exploration réellement observée en a pris 947.
 *
 *  Quand le filet se referme, la voie ne devine rien. Elle garde l'endroit qui a prouvé sa
 *  numérotation s'il y en a un — ses marques sont toutes relues ensuite, et la publication
 *  demande toujours deux signaux indépendants —, et sinon elle s'abstient en disant combien
 *  d'essais ont été faits, sur combien de possibles, et pourquoi elle s'est arrêtée. */
export const BUDGET_EXPLORATION: BudgetExploration = { paires: 256, secondes: 2700 };

/** De quoi borner l'exploration autrement : une épreuve qui veut voir le filet se refermer, un
 *  essai qui n'a pas quarante minutes à donner. Les deux bornes se donnent ensemble — une borne
 *  à moitié remplacée serait une limite que personne n'a choisie. */
export type BudgetExploration = { readonly paires: number; readonly secondes: number };

/** En deçà, le coordinateur ne retient pas une lecture. C'est le même seuil que celui sur lequel
 *  un changement de support se fonde : une marque dont la majorité de ses propres lectures ne
 *  s'accordent pas n'est pas une lecture franche. */
export const SEUIL_SANS_MANIERE_DE_LIRE = 0.5;
const ACCORD_RETENU = SEUIL_SANS_MANIERE_DE_LIRE;

/** Les deux façons dont une marque imprimée porte ses chiffres. On essaie les deux : rien ici ne
 *  sait d'avance laquelle ce document emploie. */
const MOTIFS = ["losange_sombre_chiffres_clairs", "bloc_sombre_chiffres_clairs"] as const;
type Motif = (typeof MOTIFS)[number];

/** Une marque à lire : où elle est, et sur quelle image. */
type Marque = {
  readonly numero: number;
  readonly rangDePage: number;
  readonly y: number;
  readonly fenetre: Boite;
  readonly image: ImageGrise;
  readonly hauteur: number;
};

/** Ce que le coordinateur garde entre les marques : la taille du signe et la façon de le lire. */
type Gabarit = { readonly taille: { readonly l: number; readonly h: number }; readonly motif: Motif };

export type OptionsVoieOracle = {
  readonly inventaireMedias?: readonly MediaInventorie[] | undefined;
  readonly provenancesMedias?: readonly string[] | undefined;
  /** **Pas de vérification humaine empruntée ici.** Elle porterait sur une lecture antérieure, et
   *  non sur celle que cette voie vient de produire : voir le verrou au pas 7. Cette voie publie
   *  sur deux lectures indépendantes, ou s'abstient. */
  readonly binaire?: string | undefined;
  readonly tessdata?: string | undefined;
  readonly langue?: string | undefined;
  readonly avancement?: ((faits: number, total: number) => void) | undefined;
  readonly surPhase?: ((message: string) => void) | undefined;
  /** N'en lire que les premières pages : pour essayer, ou pour éprouver. */
  readonly pages?: number | undefined;
  /** Texte déjà lu par la chaîne, une seule fois pour les passages et la corroboration.
   *
   *  Absent, la voie reste utilisable seule et relit le document. Présent — même vide — il fait
   *  foi pour cette passe : réocériser ici contredirait la lecture que la bibliothèque publie. */
  readonly texteDesPages?: readonly ContenuDePage[] | undefined;
  /** Jusqu'où chercher un endroit qui porte la numérotation. Voir `BUDGET_EXPLORATION`. */
  readonly budgetExploration?: BudgetExploration | undefined;
  /** Ce qu'une lecture antérieure de **ce** document a appris, s'il y en a une.
   *
   *  Rien n'est cru sur parole : l'empreinte du document est recalculée ici et comparée à celle
   *  que l'acquis porte, la version de la voie doit être la nôtre, et le nombre de pages
   *  regardées doit être le même. Un acquis qui échoue à l'un de ces trois contrôles est ignoré,
   *  et le journal le dit — plutôt que de laisser une conclusion s'appliquer à ce qu'elle n'a
   *  jamais vu. */
  readonly acquis?: AcquisDeLecture | undefined;
};

export type RejeuParOracle = {
  readonly resultat: ResultatRecette;
  readonly association: Association;
  readonly medias: readonly Media[];
  /** Ce que la voie a vu et décidé, en clair : de quoi expliquer un résultat sans relire le code. */
  readonly journal: readonly string[];
  /** Ce que cette lecture a appris, à garder pour ne pas l'apprendre deux fois.
   *
   *  Absent quand il n'y a rien à retenir : une exploration arrêtée par son budget n'a rien
   *  conclu, et se souvenir de « je n'ai pas fini » autoriserait plus tard à conclure de ce qu'on
   *  n'a pas vu. */
  readonly acquis?: AcquisDeLecture | undefined;
};

/** L'empreinte du document, calculée ici et non reçue.
 *
 *  Le garde-fou le plus important de cette mémoire. Si la vérification était laissée à qui
 *  appelle, une erreur de clé appliquerait l'endroit d'un document à un autre — et produirait des
 *  liens faux et réguliers, exactement ce que tout le reste existe pour empêcher. Lue en flux :
 *  un document de cinq cents pages ne doit pas tenir en mémoire pour être empreint. */
async function empreinteDuFichier(chemin: string): Promise<string> {
  const condensat = createHash("sha256");
  for await (const morceau of createReadStream(chemin)) condensat.update(morceau as Buffer);
  return condensat.digest("hex");
}

/** L'acquis est-il celui de ce document, de cette voie, et de cette étendue de lecture ? */
function acquisUtilisable(
  acquis: AcquisDeLecture | undefined,
  empreinte: string,
  combienDePages: number,
  dire: (message: string) => void,
): AcquisDeLecture | undefined {
  if (acquis === undefined) return undefined;
  const refus =
    acquis.conteneur !== empreinte
      ? "il a été formé sur un autre document"
      : acquis.voie.id !== ID_DE_LA_VOIE || acquis.voie.version !== VERSION_DE_LA_VOIE
        ? `il vient de ${acquis.voie.id} version ${acquis.voie.version}, et la lecture a changé depuis`
        : acquis.pagesRegardees !== combienDePages
          ? `il a été formé sur ${acquis.pagesRegardees} page(s), et l'on en regarde ${combienDePages}`
          : undefined;
  if (refus !== undefined) {
    dire(`acquis écarté : ${refus}. Ce document est relu depuis le début.`);
    return undefined;
  }
  return acquis;
}

const boiteDeLApparition = (apparition: FormeObservee, image: ImageGrise): Boite => {
  const l = apparition.l * image.largeur;
  const h = apparition.h * image.hauteur;
  // Un dixième de marge : la boîte d'une forme sombre s'arrête à son encre, et la reconnaissance
  // travaille mieux avec un peu de papier autour.
  return {
    x: Math.round(apparition.x * image.largeur - l * 0.1),
    y: Math.round(apparition.y * image.hauteur - h * 0.1),
    l: Math.round(l * 1.2),
    h: Math.round(h * 1.2),
  };
};

/** Un échantillon réparti sur les pages, et non les premières apparitions : les premières pages
 *  d'un recueil sont souvent des pages de garde. */
const echantillonner = (zone: ZoneRecurrente, combien: number): readonly FormeObservee[] => {
  const triees = [...zone.apparitions].sort((un, autre) => un.page - autre.page || un.y - autre.y);
  if (triees.length <= combien) return triees;
  const pas = triees.length / combien;
  return Array.from({ length: combien }, (_, place) => triees[Math.floor(place * pas)]!);
};

/** Lit une marque, en essayant les deux façons dont un signe porte ses chiffres. */
function lireLaMarque(
  marque: Marque,
  motif: Motif,
  options: OptionsVoieOracle,
): { valeur: number; accord: number; presence: number } | undefined {
  const bloc = lireDansLaFenetre(marque.image, marque.fenetre, marque.hauteur, motif, false, {
    ...(options.binaire === undefined ? {} : { binaire: options.binaire }),
    ...(options.tessdata === undefined ? {} : { tessdata: options.tessdata }),
    ...(options.langue === undefined ? {} : { langue: options.langue }),
  });
  const vu = vote(bloc.votes);
  return vu === undefined ? undefined : { valeur: vu.valeur, accord: vu.accord, presence: bloc.presence };
}

/** Le document lu sans manière de lire, de ses pixels à son association. */
export async function rejouerParOracle(
  pdf: string,
  dossierMedias: string,
  options: OptionsVoieOracle = {},
): Promise<RejeuParOracle> {
  const journal: string[] = [];
  const dire = (message: string): void => {
    journal.push(message);
    options.surPhase?.(message);
  };

  const medias =
    options.inventaireMedias === undefined
      ? await mediasDuDossier(dossierMedias)
      : mediasDeLInventaire(options.inventaireMedias);
  dire(`${medias.length} enregistrement(s) dans le vivier de ce document`);

  const empreinte = await empreinteDuFichier(pdf);
  // ── 1. Les formes sombres de chaque page ───────────────────────────────────────────────
  const rendu = await ouvrirRenduPdf(pdf);
  const combienDePages = Math.min(rendu.nombreDePages, options.pages ?? Number.POSITIVE_INFINITY);
  const texteAligne =
    options.texteDesPages !== undefined &&
    options.texteDesPages.length === combienDePages &&
    options.texteDesPages.every((page, place) => page.page === place + 1)
      ? options.texteDesPages
      : undefined;
  if (options.texteDesPages !== undefined && texteAligne === undefined)
    dire(
      `texte déjà lu écarté : ses ${options.texteDesPages.length} page(s) ne correspondent pas ` +
        `aux ${combienDePages} feuille(s) rendues. Aucun second signal n'en sera tiré : ` +
        `les candidats resteront à vérifier.`,
    );
  const acquis = acquisUtilisable(options.acquis, empreinte, combienDePages, dire);

  // Un document dont il est **déjà établi** qu'aucun endroit n'y porte de numérotation n'a rien à
  // relire : ni ses pages, ni ses formes, ni une seule reconnaissance. C'est là qu'est l'essentiel
  // du gain — mesuré le 31 octobre 2026, seize documents sur vingt sont dans ce cas, et ce sont
  // eux qui coûtent le plus cher : jusqu'à 182 essais et 839 s pour conclure qu'il n'y a rien.
  if (acquis?.etat === "aucun_endroit") {
    await rendu.fermer();
    return sansLien(
      medias,
      options,
      journal,
      combienDePages,
      `Aucun des ${acquis.endroitsProposes} endroits de ce document ne porte une numérotation : ` +
        `établi par ${acquis.essaisEprouves} essai(s), le plus prometteur ne pouvant pas dépasser ` +
        `${(acquis.borneLaPlusHaute * 100).toFixed(0)} % là où il en faut ` +
        `${(NUMEROTATION_PROBABLE * 100).toFixed(0)} %. Conclusion retrouvée, non refaite.`,
      acquis,
    );
  }

  const images = new Map<number, ImageGrise>();
  const formes: FormeObservee[] = [];
  try {
    for (let rang = 1; rang <= combienDePages; rang += 1) {
      const image = enGris(await rendu.page(rang, LARGEUR_DE_RENDU));
      images.set(rang, image);
      for (const forme of formesSombres(image)) {
        const observee: FormeObservee = {
          page: rang,
          x: forme.boite.x / image.largeur,
          y: forme.boite.y / image.hauteur,
          l: forme.boite.l / image.largeur,
          h: forme.boite.h / image.hauteur,
        };
        if (
          observee.l >= COTE_MINIMAL &&
          observee.h >= COTE_MINIMAL &&
          observee.l <= COTE_MAXIMAL &&
          observee.h <= COTE_MAXIMAL
        )
          formes.push(observee);
      }
      options.avancement?.(rang, combienDePages);
    }
  } finally {
    await rendu.fermer();
  }
  dire(`${combienDePages} page(s) regardée(s), ${formes.length} forme(s) dans les bornes d'une marque`);

  // ── 2. Les endroits où un même signe revient, et celui qui se lit ──────────────────────
  const proposees = zonesAExaminer(zonesRecurrentes(formes, combienDePages));
  dire(`${proposees.length} endroit(s) proposé(s) par la régularité des formes`);
  if (proposees.length === 0)
    return sansLien(
      medias,
      options,
      journal,
      combienDePages,
      "Aucune forme ne revient régulièrement sur ces pages.",
      AcquisDeLecture.parse({
        etat: "aucun_endroit",
        conteneur: empreinte,
        voie: LA_VOIE,
        pagesRegardees: combienDePages,
        etabliLe: Math.floor(Date.now() / 1000),
        endroitsProposes: 0,
        essaisEprouves: 0,
        borneLaPlusHaute: 0,
      }),
    );

  const budget = options.budgetExploration ?? BUDGET_EXPLORATION;
  const departExploration = Date.now();
  const possibles = proposees.length * MOTIFS.length;
  let eprouvees = 0;
  // Ce que l'élagage a réellement coûté, et ce qu'il aurait coûté sans lui : le gain se lit dans
  // le journal du document, et non dans une mesure faite une fois sur une autre machine.
  let reconnaissances = 0;
  const reconnaissancesSansElagage = proposees.reduce(
    (total, zone) => total + Math.min(zone.apparitions.length, APPARITIONS_POUR_JUGER) * MOTIFS.length,
    0,
  );
  // La plus haute borne parmi les endroits abandonnés. Aucune note n'allant à son terme, c'est
  // elle, et non un maximum qui n'existe plus, que l'abstention doit citer.
  let borneLaPlusHaute = 0;
  // Pourquoi l'exploration s'est arrêtée avant d'avoir tout essayé, ou rien si elle est allée au
  // bout. C'est cette phrase, et non le seul décompte, qui rend l'abstention lisible.
  let renoncement: string | undefined;
  let retenu:
    | { zone: ZoneRecurrente; motif: Motif; part: number; echantillon: readonly FormeObservee[]; suite: readonly (number | undefined)[] }
    | undefined;

  // L'endroit déjà connu de ce document. On garde la détection des formes — elle ne coûte aucune
  // reconnaissance et c'est elle qui rend les apparitions à lire — et l'on saute le jugement, qui
  // est la dépense. Si la boîte de l'endroit ne se retrouve pas à l'identique, c'est que ce qui
  // propose les endroits a changé : on explore de nouveau plutôt que de forcer un rapprochement.
  if (acquis?.etat === "endroit_trouve") {
    const memeEndroit = proposees.find(
      (zone) =>
        Math.abs(zone.x - acquis.endroit.x) < 1e-9 &&
        Math.abs(zone.y - acquis.endroit.y) < 1e-9 &&
        Math.abs(zone.l - acquis.endroit.l) < 1e-9 &&
        Math.abs(zone.h - acquis.endroit.h) < 1e-9,
    );
    const facon = MOTIFS.find((connu) => connu === acquis.motif);
    if (memeEndroit === undefined || facon === undefined)
      dire("acquis écarté : son endroit ne se retrouve pas dans ce document. Les endroits sont éprouvés de nouveau.");
    else {
      retenu = {
        zone: memeEndroit,
        motif: facon,
        part: acquis.part,
        echantillon: echantillonner(memeEndroit, APPARITIONS_POUR_JUGER),
        suite: acquis.echantillon.map((apparition) => apparition.valeur),
      };
      dire(
        `endroit déjà connu de ce document : numérotation ${(acquis.part * 100).toFixed(0)} %, ` +
          `${acquis.echantillon.length} lecture(s) et ${acquis.temoins.length} témoin(s) à l'appui. ` +
          "Aucun endroit n'est éprouvé de nouveau.",
      );
    }
  }

  const venuDeLAcquis = retenu !== undefined;
  for (const zone of proposees) {
    if (venuDeLAcquis || renoncement !== undefined) break;
    const echantillon = echantillonner(zone, APPARITIONS_POUR_JUGER);
    for (const motif of MOTIFS) {
      const secondes = (Date.now() - departExploration) / 1000;
      if (eprouvees >= budget.paires) {
        renoncement = `le budget n'en porte pas plus de ${budget.paires}`;
        break;
      }
      if (secondes >= budget.secondes) {
        renoncement = `les ${budget.secondes} s du budget sont écoulées`;
        break;
      }
      eprouvees += 1;
      // Les valeurs lues, dans l'ordre des pages, et non leur seul décompte : c'est ce qui est lu
      // qui dit si cet endroit porte une numérotation ou une forme que la reconnaissance habille
      // toujours du même chiffre.
      //
      // Lues une à une, et non toutes d'un bloc. Après chaque lecture, la borne dit ce que cet
      // endroit peut encore atteindre au mieux, ses apparitions non lues supposées parfaites.
      // Dès qu'elle passe sous ce qu'il faudrait pour qualifier — ou sous le meilleur endroit
      // déjà trouvé —, le lire davantage ne pourrait plus rien changer : on l'abandonne. Mesuré
      // sur 376 essais de cinq documents réels, c'est 43 % des reconnaissances en moins pour les
      // mêmes endroits retenus, au centième près. Rien n'est parié : voir `borneDeNumerotation`.
      const aBattre = Math.max(NUMEROTATION_PROBABLE, retenu?.part ?? 0);
      const suite: (number | undefined)[] = [];
      let borne = 0;
      let abandonne = false;
      for (const apparition of echantillon) {
        const image = images.get(apparition.page);
        if (image === undefined) suite.push(undefined);
        else {
          const marque: Marque = {
            numero: 0,
            rangDePage: apparition.page,
            y: apparition.y,
            fenetre: boiteDeLApparition(apparition, image),
            image,
            hauteur: apparition.h * image.hauteur,
          };
          suite.push(lireLaMarque(marque, motif, options)?.valeur);
        }
        reconnaissances += 1;
        borne = borneDeNumerotation(suite, echantillon.length);
        if (borne < aBattre) {
          abandonne = true;
          break;
        }
      }
      const ou =
        `  signe de ${(zone.taille.l * 100).toFixed(1)} × ${(zone.taille.h * 100).toFixed(1)} % ` +
        `vers ${(zone.x * 100).toFixed(0)} % de la largeur`;
      if (abandonne) {
        if (borne > borneLaPlusHaute) borneLaPlusHaute = borne;
        dire(
          `${ou} : abandonné après ${suite.length} lecture(s) sur ${echantillon.length}, ` +
            `il ne peut plus dépasser ${(borne * 100).toFixed(0)} %`,
        );
        continue;
      }
      const allure = allureDeLaSuite(suite);
      const part = partDeNumerotation(allure, echantillon.length);
      dire(
        `${ou} : ${allure.lues}/${echantillon.length} se lisent, ` +
          `${allure.distinctes} valeur(s) distincte(s), avance ${(allure.avance * 100).toFixed(0)} % ` +
          `→ numérotation ${(part * 100).toFixed(0)} %`,
      );
      if (retenu === undefined || part > retenu.part) retenu = { zone, motif, part, echantillon, suite };
    }
  }
  if (!venuDeLAcquis)
    dire(
      `${eprouvees} essai(s) éprouvé(s), ${reconnaissances} lecture(s) là où les lire tous ` +
        `entièrement en aurait demandé ${reconnaissancesSansElagage}`,
    );
  if (renoncement !== undefined)
    dire(`exploration arrêtée après ${eprouvees} essai(s) sur ${possibles} possibles : ${renoncement}`);
  // Un endroit n'est retenu que s'il a passé le seuil : la borne l'abandonne sinon, à sa dernière
  // lecture au plus tard, où elle vaut exactement sa note. D'où l'unique condition ici.
  if (retenu === undefined) {
    // Dire que rien ne numérote, et non que rien ne se lit : la reconnaissance lit des chiffres
    // dans bien des formes, et c'est précisément l'erreur dans laquelle il ne faut pas tomber.
    //
    // Et dire ce qui est prouvé, non ce qui est mesuré : aucune note n'étant allée à son terme,
    // il n'y a plus de « meilleur ». La plus haute borne, elle, est démontrée — cet endroit-là
    // n'aurait pas dépassé ce chiffre, quoi qu'eussent rendu ses apparitions non lues.
    const insuffisant =
      eprouvees === 0
        ? "aucun essai n'a été fait"
        : `le plus prometteur ne pouvait pas dépasser ${(borneLaPlusHaute * 100).toFixed(0)} % là où il en ` +
          `faut ${(NUMEROTATION_PROBABLE * 100).toFixed(0)} %`;
    // Deux abstentions, et non une : « j'ai tout essayé, rien ne numérote » et « je me suis
    // arrêtée avant d'avoir tout essayé » ne disent pas la même chose à qui lira ce document.
    // Une exploration qui a conclu se retient ; une exploration arrêtée par son budget, jamais.
    // Se souvenir de « je n'ai pas fini » autoriserait plus tard à conclure de ce qu'on n'a pas vu.
    const aRetenir =
      renoncement === undefined
        ? AcquisDeLecture.parse({
            etat: "aucun_endroit",
            conteneur: empreinte,
            voie: LA_VOIE,
            pagesRegardees: combienDePages,
            etabliLe: Math.floor(Date.now() / 1000),
            endroitsProposes: proposees.length,
            essaisEprouves: eprouvees,
            borneLaPlusHaute: borneLaPlusHaute,
          })
        : undefined;
    return sansLien(
      medias,
      options,
      journal,
      combienDePages,
      renoncement === undefined
        ? `Aucun des ${proposees.length} endroits trouvés ne porte une numérotation : ${insuffisant}.`
        : `Aucun endroit fiable trouvé : exploration arrêtée après ${eprouvees} essai(s) sur les ` +
          `${possibles} qu'offrent ${proposees.length} endroit(s), ${renoncement}. ` +
          `${insuffisant[0]!.toUpperCase()}${insuffisant.slice(1)}.`,
      aRetenir,
    );
  }
  dire(
    `endroit retenu : un signe de ${(retenu.zone.taille.l * 100).toFixed(1)} × ` +
      `${(retenu.zone.taille.h * 100).toFixed(1)} % de la page, numérotation ${(retenu.part * 100).toFixed(0)} %, ` +
      `${retenu.zone.apparitions.length} apparition(s) en tout`,
  );

  // ── 3. Le coordinateur, sur chaque marque ──────────────────────────────────────────────
  const marques: Marque[] = [...retenu.zone.apparitions]
    .sort((un, autre) => un.page - autre.page || un.y - autre.y)
    .flatMap((apparition, place) => {
      const image = images.get(apparition.page);
      if (image === undefined) return [];
      return [
        {
          numero: place + 1,
          rangDePage: apparition.page,
          y: apparition.y,
          fenetre: boiteDeLApparition(apparition, image),
          image,
          hauteur: apparition.h * image.hauteur,
        },
      ];
    });

  const gabarit: Gabarit = { taille: retenu.zone.taille, motif: retenu.motif };
  // Lire une marque coûte plusieurs appels de reconnaissance. On garde ce qu'on en a tiré :
  // la présence sert au pesage de la suite, et la relire reviendrait à payer deux fois la
  // lecture de tout le document — mesuré, c'est la moitié du temps de cette voie.
  const presences = new Map<number, number>();
  const coordonne = await coordonnerLectureDifficile<Marque, number, Gabarit>(marques, gabarit, {
    numeroDePage: (marque) => marque.numero,
    seuilConfiance: ACCORD_RETENU,
    lireLocalement: ({ page: marque, modele }): LectureTentative<number> => {
      const lu = lireLaMarque(marque, modele.motif, options);
      if (lu === undefined) return { etat: "echec", raison: "Aucun chiffre n'a été lu dans cette marque." };
      presences.set(marque.numero, lu.presence);
      return { etat: "valide", valeur: lu.valeur, confiance: lu.accord };
    },
    // Le port existe ; il n'y a personne au bout sur cette voie, et c'est dit plutôt que feint.
    relireParVision: (): LectureTentative<number> => ({
      etat: "echec",
      raison: "Aucun regard distant n'est branché sur cette voie.",
    }),
    corroborer: () => false,
  });

  const retenues = coordonne.pages.filter((decision) => decision.etat === "retenue").length;
  dire(`${retenues} marque(s) retenue(s) sur ${marques.length}, ${marques.length - retenues} à vérifier`);

  // ── Ce que cette lecture a appris de ce document ───────────────────────────────────────
  //
  // L'échantillon est celui qui a formé l'hypothèse ; les témoins sont les autres apparitions,
  // relues une à une par le coordinateur — donc éprouvées hors de ce qui a formé l'hypothèse,
  // comme le contrat l'exige. Les témoins gardés sont un échantillon réparti : un recueil de cinq
  // cents pages en porte des milliers, et les recopier tous gonflerait l'acquis sans rien prouver
  // de plus. Leurs décomptes réels voyagent avec, pour qu'il ne se vante pas.
  const formeDeLEchantillon = new Set(retenu.echantillon.map((apparition) => `${apparition.page}:${apparition.y}`));
  const luePourLaMarque = new Map(
    coordonne.pages.map((decision) => [decision.page, decision.etat === "retenue" ? decision.valeur : undefined]),
  );
  const temoinsTous = marques
    .filter((marque) => !formeDeLEchantillon.has(`${marque.rangDePage}:${marque.y}`))
    .map((marque) => {
      const valeur = luePourLaMarque.get(marque.numero);
      return { rang: marque.rangDePage, y: marque.y, ...(valeur === undefined ? {} : { valeur }) };
    });
  const TEMOINS_GARDES = 32;
  const pasDesTemoins = temoinsTous.length / TEMOINS_GARDES;
  const acquisDeCetteLecture = AcquisDeLecture.parse({
    etat: "endroit_trouve",
    conteneur: empreinte,
    voie: LA_VOIE,
    pagesRegardees: combienDePages,
    etabliLe: Math.floor(Date.now() / 1000),
    endroit: { x: retenu.zone.x, y: retenu.zone.y, l: retenu.zone.l, h: retenu.zone.h },
    motif: retenu.motif,
    part: retenu.part,
    echantillon: retenu.echantillon.map((apparition, place) => ({
      rang: apparition.page,
      y: apparition.y,
      ...(retenu.suite[place] === undefined ? {} : { valeur: retenu.suite[place] }),
    })),
    temoins:
      temoinsTous.length <= TEMOINS_GARDES
        ? temoinsTous
        : Array.from({ length: TEMOINS_GARDES }, (_, place) => temoinsTous[Math.floor(place * pasDesTemoins)]!),
    temoinsEprouves: temoinsTous.length,
    temoinsDAccord: temoinsTous.filter((temoin) => temoin.valeur !== undefined).length,
  });

  // ── 4. L'attribution, règles génériques seules ─────────────────────────────────────────
  const lectures: LecturePiste[] = coordonne.pages.map((decision) => ({
    ...(decision.etat === "retenue" ? { pisteLue: decision.valeur } : {}),
    accordPiste: decision.etat === "retenue" ? decision.confiance : 0,
    presencePiste: presences.get(decision.page) ?? 0,
  }));
  const regles: ReglesPistes = {
    pasAutorises: [0, 1],
    // Jamais : poser que la piste vaut le numéro de l'élément publie des liens sans aucune
    // lecture. C'est ainsi que 52 faux liens sont nés sur un document de la vraie base.
    egaleNumeroElement: false,
    nombreDePistes: Math.max(1, medias.length),
  };
  const pistes = attribuerPistes(lectures, regles);

  // ── 5. Le second signal : ce que les noms du vivier disent des pages ───────────────────
  //
  // La marque désigne un enregistrement par son **rang**, lu dans une fenêtre de quelques
  // dizaines de pixels. Le nom le désigne par son **nom**, retrouvé dans le texte courant de la
  // page — sa couche quand elle rend quelque chose de lisible, sa reconnaissance sinon. Les deux
  // lectures restent indépendantes : ni les mêmes pixels, ni la même chose cherchée, ni le même
  // fait extérieur confronté — un rang contre une suite de rangs, un intitulé contre un nom de
  // fichier. C'est pourquoi elles peuvent se contredire — et c'est ce qui donne du prix à leur
  // accord : deux lectures qui ne pourraient pas se démentir ne prouveraient rien ensemble.
  // Quand les deux tombent sur le même enregistrement, elles s'accordent ; quand elles tombent
  // sur deux différents, elles se contredisent, et une contradiction doit faire reculer.
  // La page et la piste ensemble : une clef composée par calcul se confondrait avec une autre
  // sur un document assez fourni, et fabriquerait une confirmation qui n'a jamais eu lieu.
  const clefDeLAccord = (page: number, piste: number): string => `${page}\u0000${piste}`;
  const confirmees = new Set<string>();
  let contredites = 0;
  let ocerisees = 0;
  try {
    // Seules les pages qui portent une marque peuvent recevoir une confirmation : ailleurs, un
    // nom retrouvé ne confirme ni ne contredit rien. On ne lit donc que celles-là — sur un
    // recueil de trois cents pages, c'est la différence entre quelques lectures et toutes.
    const aMarque = [...new Set(marques.map((marque) => marque.rangDePage))].sort((un, autre) => un - autre);
    const contenus: { page: number; texte: string }[] = [];
    if (texteAligne !== undefined) {
      const parRang = new Map(texteAligne.map((page) => [page.page, page.texte]));
      for (const rang of aMarque) {
        const texte = parRang.get(rang);
        if (texte !== undefined) contenus.push({ page: rang, texte });
      }
      dire(`${contenus.length} page(s) à marque confrontée(s) au texte déjà lu par la chaîne.`);
    } else if (options.texteDesPages === undefined) {
      const couche = await lireCoucheTexte(pdf);
      const parRang = new Map(couche.pages.map((page) => [page.index, page]));
      const bac = mkdtempSync(join(tmpdir(), "lienotheque-oracle-"));
      try {
        for (const rang of aMarque) {
          const deLaCouche = parRang.get(rang);
          // Le même juge que le chemin du texte : une couche abondante mais illisible ne vaut pas
          // mieux qu'aucune couche, et c'est elle qu'il faut alors écarter.
          let page = deLaCouche !== undefined && coucheSuffisante(deLaCouche) ? deLaCouche : undefined;
          const image = images.get(rang);
          if (page === undefined && image !== undefined) {
            page = ocrDUnePageGrise(image, rang, bac, {
              ...(options.binaire === undefined ? {} : { binaire: options.binaire }),
              ...(options.tessdata === undefined ? {} : { tessdata: options.tessdata }),
              ...(options.langue === undefined ? {} : { langue: options.langue }),
            });
            ocerisees += 1;
          }
          if (page !== undefined) contenus.push({ page: rang, texte: page.mots.map((mot) => mot.texte).join(" ") });
        }
      } finally {
        rmSync(bac, { recursive: true, force: true });
      }
      if (ocerisees > 0)
        dire(
          `${ocerisees} page(s) sur ${aMarque.length} relues par reconnaissance : leur couche texte ne rend rien.`,
        );
    } else {
      dire("Confrontation par les noms suspendue : les index du texte et du rendu ne s'accordent pas.");
    }
    const accords = accordsNomContenu(
      marquesDesNoms(medias.map((media) => media.nom)),
      contenus,
    );
    // Les pistes que la marque a attribuées, page par page : une page peut en porter plusieurs,
    // et un nom retrouvé là ne contredit que ce qu'aucune d'elles ne dit.
    const pistesDeLaPage = new Map<number, Set<number>>();
    coordonne.pages.forEach((_, place) => {
      const piste = pistes[place];
      if (piste === undefined) return;
      const page = marques[place]!.rangDePage;
      pistesDeLaPage.set(page, (pistesDeLaPage.get(page) ?? new Set()).add(piste));
    });
    for (const accord of accords) {
      const attendue = medias[accord.rang]?.piste;
      if (attendue === undefined) continue;
      if (pistesDeLaPage.get(accord.page)?.has(attendue) === true) confirmees.add(clefDeLAccord(accord.page, attendue));
      else if (pistesDeLaPage.has(accord.page)) contredites += 1;
    }
    dire(
      contenus.every(({ texte: brut }) => brut.trim() === "")
        ? "Les noms du vivier n'ont rien à confronter : aucun texte n'a pu être tiré de ces pages."
        : `${accords.length} page(s) où le nom d'un seul enregistrement se retrouve imprimé : ` +
            `${confirmees.size} confirme(nt) la marque, ${contredites} la contredise(nt).`,
    );
  } catch (echec) {
    dire(`Le texte des pages n'a pas pu être lu : ${echec instanceof Error ? echec.message : String(echec)}`);
  }
  // Un second signal qui se trompe plus souvent qu'il ne confirme n'est pas un second signal :
  // le revendiquer alors serait prendre un désaccord pour une preuve.
  const accordTenu = confirmees.size > contredites;
  if (!accordTenu && confirmees.size > 0)
    dire("Les noms contredisent la marque au moins autant qu'ils la confirment : ce signal n'est pas retenu.");

  // ── 6. Le résultat, dans la forme que les écrans lisent ────────────────────────────────
  const lignes: LigneInterpretee[] = coordonne.pages.map((decision, place) => {
    const marque = marques[place]!;
    const piste = pistes[place];
    const confirmee =
      accordTenu && piste !== undefined && confirmees.has(clefDeLAccord(marque.rangDePage, piste));
    return {
      numero: marque.numero,
      // Aucun folio n'a été lu : la page imprimée vaut le rang, et la page le dira « déduite ».
      pageImprimee: marque.rangDePage,
      ...(piste === undefined ? {} : { piste }),
      disque: 1,
      ...(decision.etat === "retenue"
        ? { sourcePiste: confirmee ? ("corroboration_media" as const) : ("pastille" as const) }
        : {}),
      zoneRepere: {
        x: retenu.zone.x,
        y: marque.y,
        l: retenu.zone.taille.l,
        h: retenu.zone.taille.h,
      },
      confiance: decision.etat === "retenue" ? decision.confiance : 0,
    };
  });

  const parPage = new Map<number, LigneInterpretee[]>();
  for (const ligne of lignes) parPage.set(ligne.pageImprimee, [...(parPage.get(ligne.pageImprimee) ?? []), ligne]);
  const pages: PageReperee[] = Array.from({ length: combienDePages }, (_, place) => {
    const rang = place + 1;
    return {
      index: place,
      rang: place,
      pageImprimee: rang,
      // « Déduite », et non « lue » : rien n'a lu de folio sur cette voie. Le garde-fou OUT-15
      // s'appuie là-dessus pour refuser de tenir la numérotation pour prouvée.
      statut: "deduite" as const,
      elements: (parPage.get(rang) ?? []).map((ligne) => ({
        numero: ligne.numero,
        y: ligne.zoneRepere?.y ?? 0,
        // Aucun numéro d'élément n'est lu sur cette voie : le numéro est le rang de la marque,
        // pas un chiffre imprimé. Son accord est donc nul, et c'est la vérité, pas une prudence.
        accordNumero: 0,
        accordPiste: ligne.confiance,
        presencePiste: presences.get(ligne.numero) ?? 0,
        // La mention de suite (« cont'd ») n'est pas cherchée ici : rien ne la lit encore.
        suite: false,
        confiance: ligne.confiance,
        ...(ligne.zoneRepere === undefined ? {} : { zoneRepere: ligne.zoneRepere }),
      })),
    };
  });

  const resultat: ResultatRecette = {
    recette: LA_VOIE,
    pages,
    lignes,
    pagesAbsentes: [],
    ecartes: [],
  };

  // ── 7. Publier, ou s'abstenir en le disant ─────────────────────────────────────────────
  // Sans inventaire portant des provenances, le vivier ne peut rien prouver : il tombe en
  // abstention plutôt qu'en invention. C'est le garde-fou de publication, et il joue ici comme
  // partout ailleurs — un dossier de fichiers ne dit pas à quel document ils appartiennent.
  const borne = borneDuVivier(options.provenancesMedias ?? [], options.inventaireMedias ?? medias.map(() => ({})));
  // Une vérification humaine porte sur **les liens qu'elle a vus**, jamais sur le document.
  //
  // Cette voie produit une lecture neuve, que personne n'a jamais vue. Lui laisser emprunter la
  // vérification d'une lecture antérieure, c'est blanchir n'importe quelle lecture future du même
  // document par une vérification faite une fois sur une autre.
  //
  // Mesuré le 30 octobre 2026, et c'est pour cela que ce verrou existe : sur le seul document du
  // corpus dont les liens sont vérifiés à l'oreille, cette voie a publié 40 liens en héritant de
  // cette vérification — sans qu'aucune des deux lectures en présence n'ait été revue. Ce que ce
  // verrou refuse n'est pas un taux d'erreur, c'est l'emprunt : **35 de ces 40 liens étaient
  // justes**, et ils auraient été publiés de la même façon s'ils avaient tous été faux.
  //
  // Elle doit donc gagner ses deux signaux elle-même. Un œil humain a sa place ici, mais sur
  // `appariements[].statut`, lien par lien, et non sur le document entier.
  const corroboration = corroborationDesLignes(lignes, {});
  dire(
    `corroboration : ${corroboration.signaux.length} signal/signaux [${corroboration.signaux.join(", ")}]` +
      `${corroboration.preuveHumaine ? ", vérification humaine enregistrée" : ""} — ${corroboration.pourquoi}`,
  );

  const association = qualifierAssociation(
    lignes,
    medias,
    // Aucune manière de lire ne fixe de seuil ici : on prend celui du coordinateur, qui est le
    // seul qu'une lecture ait réellement eu à franchir.
    { seuilConfiance: ACCORD_RETENU },
    { borne, corroboration, mediasDisponibles: medias.length },
  );
  dire(
    association.abstention === undefined
      ? `${association.appariements.length} lien(s) proposé(s)`
      : `abstention : ${association.abstention.raison} — ${association.abstention.pourquoi ?? "sans détail"}`,
  );
  // Le « pourquoi » partagé parle d'une vérification du document, qui vaut pour une manière de
  // lire écrite à la main. Ici elle ne vaut pas, et laisser croire le contraire enverrait
  // quelqu'un vérifier un document pour débloquer une publication qui ne se débloquera pas.
  if (association.abstention?.raison === "corroboration_insuffisante")
    dire(
      "Sur cette voie, vérifier le document ne suffit pas : la vérification porterait sur une " +
        "autre lecture que celle-ci. Il faut un second signal — un nom du vivier retrouvé " +
        "imprimé sur la page — ou la confirmation de ces liens un par un.",
    );

  return { resultat, association, medias, journal, acquis: acquisDeCetteLecture };
}

/** Ce qu'on rend quand il n'y a rien à lire : un résultat vide et une raison, jamais un lien. */
function sansLien(
  medias: readonly Media[],
  options: OptionsVoieOracle,
  journal: string[],
  combienDePages: number,
  pourquoi: string,
  acquis?: AcquisDeLecture,
): RejeuParOracle {
  journal.push(pourquoi);
  options.surPhase?.(pourquoi);
  const texteAligne =
    options.texteDesPages !== undefined &&
    options.texteDesPages.length === combienDePages &&
    options.texteDesPages.every((page, place) => page.page === place + 1)
      ? options.texteDesPages
      : undefined;
  const accords =
    texteAligne === undefined ? [] : accordsNomContenu(marquesDesNoms(medias.map((media) => media.nom)), texteAligne);
  const parMedia = new Map<number, typeof accords>();
  for (const accord of accords) parMedia.set(accord.rang, [...(parMedia.get(accord.rang) ?? []), accord]);
  const lignes: LigneInterpretee[] = [...parMedia.entries()]
    .filter(([, trouves]) => trouves.length === 1)
    .map(([rang, trouves]) => {
      const media = medias[rang]!;
      return {
        numero: rang + 1,
        pageImprimee: trouves[0]!.page,
        piste: media.piste,
        disque: media.disque ?? 1,
        sourcePiste: "corroboration_media" as const,
        confiance: 1,
      };
    })
    .sort((un, autre) => un.pageImprimee - autre.pageImprimee || un.numero - autre.numero);
  const pages = Array.from({ length: combienDePages }, (_, place) => ({
    index: place,
    rang: place,
    pageImprimee: place + 1,
    statut: "deduite" as const,
    elements: [],
  }));
  if (lignes.length > 0) {
    const borne = borneDuVivier(options.provenancesMedias ?? [], options.inventaireMedias ?? medias.map(() => ({})));
    const corroboration = corroborationDesLignes(lignes, {});
    const association = qualifierAssociation(
      lignes,
      medias,
      { seuilConfiance: ACCORD_RETENU },
      { borne, corroboration, mediasDisponibles: medias.length },
    );
    const message =
      `${lignes.length} proposition(s) tirée(s) des noms restent visibles pour vérification humaine ; ` +
      `ce signal unique ne publie aucun lien.`;
    journal.push(message);
    options.surPhase?.(message);
    return {
      resultat: { recette: LA_VOIE, pages, lignes, pagesAbsentes: [], ecartes: [] },
      association,
      medias,
      journal,
      ...(acquis === undefined ? {} : { acquis }),
    };
  }
  return {
    resultat: {
      recette: LA_VOIE,
      pages,
      lignes: [],
      pagesAbsentes: [],
      ecartes: [],
    },
    association: {
      appariements: [],
      orphelins: [],
      manquants: [],
      abstention: { raison: "medias_non_interpretes", combien: medias.length, pourquoi },
    },
    medias,
    journal,
    ...(acquis === undefined ? {} : { acquis }),
  };
}
