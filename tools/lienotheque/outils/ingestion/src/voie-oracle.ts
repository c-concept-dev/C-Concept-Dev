import { createHash } from "node:crypto";
import { createReadStream, mkdtempSync, rmSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AcquisDeLecture,
  type MotLu,
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
  designationsDesNoms,
  allureDeLaSuite,
  borneDeNumerotation,
  partDeNumerotation,
  zonesAExaminer,
  zonesRecurrentes,
  type FormeObservee,
  lireLaTable,
  type TableLue,
  type ZoneRecurrente,
  type ContenuDePage,
} from "@lienotheque/noyau";
import {
  attribuerPistes,
  borneDuVivier,
  corroborationDesLignes,
  lireDansLaFenetre,
  lireLeNombreEcrit,
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
import { couperDoublePage } from "@lienotheque/redresseur";
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
 *  Elle reçoit de la lecture commune les folios établis à l'échelle du document. Faute de ce vote,
 *  les pages restent **déduites** et le garde-fou OUT-15 interdit toute publication : un nombre
 *  aperçu seul dans une marge n'est pas une pagination.
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
export const VERSION_DE_LA_VOIE = 3;
const LA_VOIE = { id: ID_DE_LA_VOIE, version: VERSION_DE_LA_VOIE } as const;

/** La largeur à laquelle les pages sont rendues. La même que la chaîne de texte : deux largeurs
 *  différentes donneraient deux jeux de formes, et deux résultats pour un même document. */
export const LARGEUR_DE_RENDU = 1800;

/** Combien d'apparitions d'un endroit on lit pour juger s'il porte la marque. Assez pour séparer
 *  « toutes se lisent » de « une sur deux », pas assez pour coûter une passe entière. */
export const APPARITIONS_POUR_JUGER = 12;

/** Les façons dont une marque imprimée porte son nombre. On les essaie toutes : rien ici ne sait
 *  d'avance laquelle ce document emploie.
 *
 *  Les deux premières cherchent un pavé sombre et lisent ses chiffres clairs. La troisième ne
 *  cherche aucune forme : elle lit ce qui est **écrit** autour du signe et n'en garde que les
 *  nombres. Mesuré le 2 novembre 2026 sur trois recueils, aucune des trois ne couvre les trois —
 *  et chacune est seule à en couvrir un. */
export const MOTIFS = ["losange_sombre_chiffres_clairs", "bloc_sombre_chiffres_clairs", "nombre_ecrit_autour"] as const;
type Motif = (typeof MOTIFS)[number];

/** Ce que l'exploration des endroits se permet au plus, avant de renoncer et de le dire.
 *
 *  Ce n'est pas la réparation d'une fuite. Mesurée sur vingt documents réels, l'exploration
 *  s'arrête d'elle-même, bornée par le contenu : de 4 à 182 essais « endroit × façon de lire »,
 *  tous menés à leur terme, aucun en cours à la fin. C'est un filet pour ce qui n'a pas été
 *  mesuré — vingt documents ne sont pas deux cent cinquante.
 *
 *  Les deux chiffres sortent des mêmes mesures. Ce qui a été observé est un nombre d'**endroits**
 *  — 91 au plus, et l'endroit retenu s'y trouvait au 123ᵉ essai, ce qui interdit de couper court
 *  en espérant que les premiers suffisent. Le compte d'essais en est le produit par le nombre de
 *  façons de lire, et c'est pourquoi il s'écrit ainsi plutôt qu'en dur : le jour où une façon
 *  s'ajoute, un budget figé rognerait d'autant les endroits couverts, sans que personne l'ait
 *  voulu. 128 endroits valent 1,4 fois le maximum observé.
 *
 *  Les secondes suivent, et il le faut : elles valent ces essais au rythme le plus lent observé
 *  (10,2 s l'essai ; l'ordinaire va de 4,3 à 7,7 s). Les laisser derrière rendrait le compte
 *  d'essais inatteignable sur une machine lente — le filet des secondes se refermerait le
 *  premier, et le budget annoncé serait une promesse qu'on ne tient pas. Une épreuve tient ce
 *  rapport entre les deux. La plus longue exploration réellement observée a pris 947 secondes,
 *  loin de l'un comme de l'autre : ce sont des filets, pas une attente ordinaire.
 *
 *  Quand le filet se referme, la voie ne devine rien. Elle garde l'endroit qui a prouvé sa
 *  numérotation s'il y en a un — ses marques sont toutes relues ensuite, et la publication
 *  demande toujours deux signaux indépendants —, et sinon elle s'abstient en disant combien
 *  d'essais ont été faits, sur combien de possibles, et pourquoi elle s'est arrêtée. */
const ENDROITS_COUVERTS = 128;
const SECONDES_PAR_ESSAI_AU_PLUS_LENT = 10.2;
export const BUDGET_EXPLORATION: BudgetExploration = {
  paires: ENDROITS_COUVERTS * MOTIFS.length,
  secondes: Math.ceil(ENDROITS_COUVERTS * MOTIFS.length * SECONDES_PAR_ESSAI_AU_PLUS_LENT),
};

/** De quoi borner l'exploration autrement : une épreuve qui veut voir le filet se refermer, un
 *  essai qui n'a pas quarante minutes à donner. Les deux bornes se donnent ensemble — une borne
 *  à moitié remplacée serait une limite que personne n'a choisie. */
export type BudgetExploration = { readonly paires: number; readonly secondes: number };

/** En deçà, le coordinateur ne retient pas une lecture. C'est le même seuil que celui sur lequel
 *  un changement de support se fonde : une marque dont la majorité de ses propres lectures ne
 *  s'accordent pas n'est pas une lecture franche. */
export const SEUIL_SANS_MANIERE_DE_LIRE = 0.5;
const ACCORD_RETENU = SEUIL_SANS_MANIERE_DE_LIRE;

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
  /** Une feuille rendue porte-t-elle deux pages logiques, gauche puis droite ? */
  readonly doublePage?: boolean | undefined;
  /** Le vote documentaire a-t-il établi les folios, au-delà d'une lecture locale isolée ? */
  readonly foliosEtablis?: boolean | undefined;
  /** Texte déjà lu par la chaîne, une seule fois pour les passages et la corroboration.
   *
   *  Absent, la voie reste utilisable seule et relit le document. Présent — même vide — il fait
   *  foi pour cette passe : réocériser ici contredirait la lecture que la bibliothèque publie. */
  readonly texteDesPages?: readonly (ContenuDePage & {
    readonly pageImprimee?: number | undefined;
    readonly mots?: readonly MotLu[] | undefined;
  })[] | undefined;
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
/** Combien d'enregistrements le dossier **porte**, interprétés ou non.
 *
 *  `mediasDuDossier` rend ceux dont le nom livre un numéro de piste ; celui-ci compte les
 *  fichiers. Les deux comptes diffèrent dès qu'un nom ne se laisse pas lire, et c'est précisément
 *  ce cas-là qu'il faut pouvoir nommer. L'extension et la règle du point initial sont les mêmes
 *  que là-bas : deux règles qui divergeraient feraient deux vérités. */
async function combienDEnregistrements(dossier: string, extension = ".mp3"): Promise<number> {
  try {
    const entrees = await readdir(dossier, { recursive: true, withFileTypes: true });
    return entrees.filter(
      (entree) => entree.isFile() && entree.name.toLowerCase().endsWith(extension) && !entree.name.startsWith("."),
    ).length;
  } catch {
    // Un dossier qui n'existe pas ne porte rien, et le dire vaut mieux que de refuser le document.
    return 0;
  }
}

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

/** La fenêtre élargie d'une taille de signe dans les quatre directions.
 *
 *  Pour lire ce qui est écrit **près** d'un signe, et non dedans. Rien ne dit de quel côté le
 *  nombre se tient : une fenêtre qui s'ouvre également des quatre côtés ne choisit pas pour
 *  l'auteur du document. Mesuré, l'élargissement s'arrête à une taille — à deux, le contexte
 *  rapporté fait perdre deux lectures justes sur sept.
 *
 *  `fenetre` porte déjà un dixième de marge de chaque côté, soit 1,2 fois le signe : sa taille
 *  divisée par 1,2 redonne celle du signe lui-même. */
export const autourDeLaMarque = (fenetre: Boite): Boite => {
  const horsTout = { l: fenetre.l / 1.2, h: fenetre.h / 1.2 };
  return {
    x: Math.max(0, Math.round(fenetre.x - horsTout.l)),
    y: Math.max(0, Math.round(fenetre.y - horsTout.h)),
    l: Math.round(fenetre.l + horsTout.l * 2),
    h: Math.round(fenetre.h + horsTout.h * 2),
  };
};

/** Lit une marque, de la façon demandée. */
function lireLaMarque(
  marque: Marque,
  motif: Motif,
  options: OptionsVoieOracle,
): { valeur: number; accord: number; presence: number } | undefined {
  const moteurs = {
    ...(options.binaire === undefined ? {} : { binaire: options.binaire }),
    ...(options.tessdata === undefined ? {} : { tessdata: options.tessdata }),
    ...(options.langue === undefined ? {} : { langue: options.langue }),
  };
  const bloc =
    motif === "nombre_ecrit_autour"
      ? lireLeNombreEcrit(marque.image, autourDeLaMarque(marque.fenetre), moteurs)
      : lireDansLaFenetre(marque.image, marque.fenetre, marque.hauteur, motif, false, moteurs);
  const vu = vote(bloc.votes);
  return vu === undefined ? undefined : { valeur: vu.valeur, accord: vu.accord, presence: bloc.presence };
}

export type TableObservee = { readonly page: number; readonly table: TableLue };

export type PreuveParTable = {
  readonly page: number;
  readonly lignes: readonly LigneInterpretee[];
  readonly signaux: readonly string[];
};

const PERMUTATIONS_DE_TROIS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
] as const;

/** Confronte une table globale aux repères déjà lus, sans jamais prendre la table pour une preuve
 *  autonome (OUT-10, REC-02).
 *
 *  Trois nombres ne disent pas par eux-mêmes lequel est l'élément, la piste ou la page. Les six
 *  ordres sont donc éprouvés et seul celui qui recoupe massivement des lignes déjà lues peut
 *  tenir. Le seuil dépend du vivier : au moins la moitié, jamais moins de huit, et tous les
 *  enregistrements quand le vivier en porte moins de huit. Une table courte de sommaire ne peut
 *  ainsi gagner contre une vraie table globale. Une valeur hors des bornes du document ou du
 *  vivier invalide l'interprétation entière ; elle n'est jamais rabattue ni corrigée. */
export function corroborerParTable(
  lignes: readonly LigneInterpretee[],
  tables: readonly TableObservee[],
  nombreDeMedias: number,
): PreuveParTable | undefined {
  if (nombreDeMedias < 4) return undefined;
  const lisibles = lignes.filter(
    (ligne) =>
      ligne.piste !== undefined &&
      (ligne.sourcePiste === "pastille" ||
        ligne.sourcePiste === "vision" ||
        ligne.sourcePiste === "corroboration_media"),
  );
  if (lisibles.length === 0) return undefined;
  const premiersSignaux = [...new Set(lisibles.map((ligne) => ligne.sourcePiste!))];

  const parTriplet = new Map<string, LigneInterpretee | undefined>();
  const parCoupleNomme = new Map<string, LigneInterpretee | undefined>();
  for (const ligne of lisibles) {
    const clef = `${ligne.numero}\u0000${ligne.piste}\u0000${ligne.pageImprimee}`;
    parTriplet.set(clef, parTriplet.has(clef) ? undefined : ligne);
    if (ligne.sourcePiste === "corroboration_media") {
      const couple = `${ligne.numero}\u0000${ligne.piste}`;
      parCoupleNomme.set(couple, parCoupleNomme.has(couple) ? undefined : ligne);
    }
  }
  const numeroMaximal = Math.max(...lisibles.map((ligne) => ligne.numero));
  const pageMaximale = Math.max(...lisibles.map((ligne) => ligne.pageImprimee));
  const minimum = Math.min(nombreDeMedias, Math.max(8, Math.ceil(nombreDeMedias / 2)));
  const candidats: { page: number; lignes: LigneInterpretee[]; clef: string }[] = [];

  for (const observee of tables) {
    const table = observee.table;
    if (!table.estUneTable || table.colonnes.length !== 3 || table.utilisables.length < minimum) continue;
    const rangees = table.utilisables.map((place) => table.rangees[place]!).filter((rangee) => rangee !== undefined);
    if (rangees.length < minimum) continue;

    for (const [colonneNumero, colonnePiste, colonnePage] of PERMUTATIONS_DE_TROIS) {
      const valeurs = rangees.map((rangee) => ({
        numero: rangee.cellules[colonneNumero],
        piste: rangee.cellules[colonnePiste],
        page: rangee.cellules[colonnePage],
      }));
      if (
        valeurs.some(
          ({ numero, piste, page }) =>
            numero === undefined ||
            numero < 1 ||
            numero > numeroMaximal ||
            piste === undefined ||
            piste < 1 ||
            piste > nombreDeMedias ||
            page === undefined ||
            page < 1 ||
            page > pageMaximale,
        )
      )
        continue;

      const correspondances = valeurs.flatMap(({ numero, piste, page }) => {
        if (numero === undefined || piste === undefined || page === undefined) return [];
        // Une marque et une table nomment le même folio : leur triplet doit être identique.
        // Un titre, lui, peut être retrouvé sur une page intérieure de l'élément alors que la
        // table en donne la page de départ. Dans ce cas, les deux lectures indépendantes se
        // confrontent sur ce qu'elles disent toutes deux : identité de l'élément et piste.
        const exacte = parTriplet.get(`${numero}\u0000${piste}\u0000${page}`);
        if (exacte !== undefined) return [exacte];
        const nommee = parCoupleNomme.get(`${numero}\u0000${piste}`);
        // Pour un titre retrouvé à l'intérieur d'un élément, la table fournit sa page de départ.
        // Le chemin appelant exige déjà un vote documentaire de folios ; cette lecture précise
        // les départs que tous les pieds de page n'ont pas nécessairement permis de relire.
        return nommee === undefined ? [] : [{ ...nommee, pageImprimee: page }];
      });
      if (correspondances.length < minimum || correspondances.length / rangees.length < 0.9) continue;
      const uniques = [...new Map(correspondances.map((ligne) => [ligne.numero, ligne])).values()].sort(
        (un, autre) => un.pageImprimee - autre.pageImprimee || un.numero - autre.numero,
      );
      if (uniques.length !== correspondances.length) continue;
      const clef = uniques.map((ligne) => `${ligne.numero}:${ligne.piste}:${ligne.pageImprimee}`).join("|");
      candidats.push({ page: observee.page, lignes: uniques, clef });
    }
  }

  if (candidats.length === 0) return undefined;
  const meilleurNombre = Math.max(...candidats.map((candidat) => candidat.lignes.length));
  const meilleurs = candidats.filter((candidat) => candidat.lignes.length === meilleurNombre);
  const resultatsDistincts = new Map(meilleurs.map((candidat) => [candidat.clef, candidat]));
  if (resultatsDistincts.size !== 1) return undefined;
  const retenu = [...resultatsDistincts.values()][0]!;
  return {
    page: retenu.page,
    lignes: retenu.lignes.map((ligne) => ({ ...ligne, sourcePiste: "corroboration_table" as const })),
    signaux: [...premiersSignaux, "corroboration_table"],
  };
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
  // **Présents** et **interprétés** sont deux comptes, et les confondre égare.
  // `mediasDuDossier` et `mediasDeLInventaire` écartent tout enregistrement dont le nom ne porte
  // pas de numéro : un fichier bien là disparaît alors du compte. Dire « aucun enregistrement »
  // d'un document qui en porte un, mais qu'on ne sait pas lire, est faux — et c'est la confusion
  // que les trois causes d'abstention existent pour défaire.
  const disponibles =
    options.inventaireMedias === undefined
      ? await combienDEnregistrements(dossierMedias)
      : options.inventaireMedias.length;
  dire(
    disponibles === medias.length
      ? `${medias.length} enregistrement(s) dans le vivier de ce document`
      : `${disponibles} enregistrement(s) dans le vivier de ce document, dont ${medias.length} interprété(s)`,
  );

  const empreinte = await empreinteDuFichier(pdf);
  // ── 1. Les formes sombres de chaque page ───────────────────────────────────────────────
  const rendu = await ouvrirRenduPdf(pdf);
  const combienDeFeuilles = Math.min(rendu.nombreDePages, options.pages ?? Number.POSITIVE_INFINITY);
  const combienDePages = combienDeFeuilles * (options.doublePage === true ? 2 : 1);
  const texteAligne =
    options.texteDesPages !== undefined &&
    options.texteDesPages.length === combienDePages &&
    options.texteDesPages.every((page, place) => page.page === place + 1)
      ? options.texteDesPages
      : undefined;
  const foliosEtablis =
    options.foliosEtablis === true &&
    texteAligne !== undefined;
  const folioParRang = new Map<number, number>(
    foliosEtablis
      ? texteAligne!.flatMap((page) =>
          page.pageImprimee === undefined ? [] : [[page.page, page.pageImprimee] as const],
        )
      : [],
  );
  if (options.texteDesPages !== undefined && texteAligne === undefined)
    dire(
      `texte déjà lu écarté : ses ${options.texteDesPages.length} page(s) ne correspondent pas ` +
        `aux ${combienDePages} page(s) logique(s) rendues depuis ${combienDeFeuilles} feuille(s). ` +
        `Aucun second signal n'en sera tiré : ` +
        `les candidats resteront à vérifier.`,
    );
  if (options.foliosEtablis === true && !foliosEtablis)
    dire(
      "folios écartés : la lecture dit les avoir établis, mais le texte ne correspond pas aux pages rendues. " +
        "Les candidats resteront à vérifier.",
    );
  else if (!foliosEtablis)
    dire("aucun folio établi à l'échelle du document : les candidats resteront à vérifier.");
  else if (folioParRang.size < combienDePages)
    dire(
      `folios établis sur ${folioParRang.size} page(s) sur ${combienDePages} ; ` +
        "les pages liminaires sans folio restent déduites et ne pourront porter aucun lien automatique.",
    );
  const acquis = acquisUtilisable(options.acquis, empreinte, combienDePages, dire);

  // Première question, avant toute exploration : y a-t-il quelque chose à relier ?
  //
  // Un repère ne vaut que par l'enregistrement qu'il désigne. Sans un seul enregistrement, aucun
  // lien n'est possible — et aucune lecture, aussi réussie soit-elle, ne changera cela. Le vivier
  // n'était pourtant regardé qu'à la fin, par la corroboration : mesuré le 5 novembre 2026 sur le
  // banc des 115 méthodes, un document sans aucun enregistrement a été exploré dix-neuf minutes —
  // formes, endroits, reconnaissances — pour conclure ce que son vivier disait avant la première
  // page. Le compte des enregistrements est connu ici, dès la deuxième ligne de cette fonction.
  if (medias.length === 0) {
    await rendu.fermer();
    return sansLien(
      medias,
      options,
      journal,
      combienDePages,
      disponibles === 0
        ? "Ce document ne porte aucun enregistrement : il n'y a rien à relier, et rien n'a été exploré."
        : `Aucun des ${disponibles} enregistrement(s) de ce document n'a pu être interprété : ` +
          "aucun lien n'est possible, et rien n'a été exploré.",
      acquis,
      disponibles,
    );
  }


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
    for (let feuille = 1; feuille <= combienDeFeuilles; feuille += 1) {
      const imageDeLaFeuille = enGris(await rendu.page(feuille, LARGEUR_DE_RENDU));
      const pagesLogiques =
        options.doublePage === true
          ? (({ gauche, droite }) => [gauche, droite] as const)(couperDoublePage(imageDeLaFeuille))
          : [imageDeLaFeuille];
      for (const [cote, image] of pagesLogiques.entries()) {
        const rang = options.doublePage === true ? (feuille - 1) * 2 + cote + 1 : feuille;
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
      }
      options.avancement?.(feuille, combienDeFeuilles);
    }
  } finally {
    await rendu.fermer();
  }
  dire(
    `${combienDePages} page(s) regardée(s) depuis ${combienDeFeuilles} feuille(s), ` +
      `${formes.length} forme(s) dans les bornes d'une marque`,
  );

  // ── 2. Les endroits où un même signe revient, et celui qui se lit ──────────────────────
  //
  // Le compte des médias n'abaisse plus ce plancher. Ce desserrement exposait des endroits vus
  // trop peu de fois alors que leur jugement sur petit échantillon n'est pas encore démontré
  // robuste. On garde le plancher établi par les pages jusqu'à disposer de cette preuve.
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
    const accords = accordsNomContenu(designationsDesNoms(medias.map((media) => media.nom)), contenus);
    // Les pistes que la marque a attribuées, page par page : une page peut en porter plusieurs,
    // et un nom retrouvé là ne contredit que ce qu'aucune d'elles ne dit.
    const pistesDeLaPage = new Map<number, Set<number>>();
    coordonne.pages.forEach((_, place) => {
      const piste = pistes[place];
      if (piste === undefined) return;
      const page = marques[place]!.rangDePage;
      pistesDeLaPage.set(page, (pistesDeLaPage.get(page) ?? new Set()).add(piste));
    });
    // Un accord désigne un ensemble d'enregistrements — un seul le plus souvent, deux quand un
    // même morceau a sa démonstration et son accompagnement. La marque confirme dès qu'elle a lu
    // **l'une** des pistes de l'ensemble sur cette page : le nom a mené à la page, et la marque y
    // a lu ce que le nom y annonçait. Elle contredit quand la page porte des pistes et qu'aucune
    // n'y est — c'est ce désaccord-là qui doit faire reculer.
    for (const accord of accords) {
      const attendues = accord.rangs
        .map((rang) => medias[rang]?.piste)
        .filter((piste): piste is number => piste !== undefined);
      if (attendues.length === 0) continue;
      const vues = pistesDeLaPage.get(accord.page);
      if (vues === undefined) continue;
      const accordee = attendues.find((piste) => vues.has(piste));
      if (accordee === undefined) contredites += 1;
      else confirmees.add(clefDeLAccord(accord.page, accordee));
    }
    const seuls = accords.filter((accord) => accord.rangs.length === 1).length;
    dire(
      contenus.every(({ texte: brut }) => brut.trim() === "")
        ? "Les noms du vivier n'ont rien à confronter : aucun texte n'a pu être tiré de ces pages."
        : `${accords.length} page(s) où le nom d'un enregistrement se retrouve imprimé, ` +
            `dont ${seuls} qui n'en désigne(nt) qu'un seul : ` +
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
  const lignesLues: LigneInterpretee[] = coordonne.pages.map((decision, place) => {
    const marque = marques[place]!;
    const piste = pistes[place];
    const confirmee =
      accordTenu && piste !== undefined && confirmees.has(clefDeLAccord(marque.rangDePage, piste));
    return {
      numero: marque.numero,
      // Sans vote documentaire, le rang reste visible mais demeure explicitement « déduit ».
      // Avec lui, la ligne porte le folio réellement lu par le socle commun.
      pageImprimee: folioParRang.get(marque.rangDePage) ?? marque.rangDePage,
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

  // ── 6. La table globale : une seconde lecture, jamais une preuve autonome ──────────────
  //
  // Les mots et leur géométrie ont déjà été lus par la chaîne. On les réemploie : refaire un
  // OCR ici pourrait produire une autre table que celle sur laquelle le texte publié repose.
  // Une table n'est retenue que si elle recoupe massivement les triplets élément/piste/folio
  // déjà lus par les marques. Elle ne comble pas les trous : seules les lignes réellement
  // recoupées deviennent publiables.
  const rangParNumero = new Map(marques.map((marque) => [marque.numero, marque.rangDePage] as const));
  const lignesAvecFolio = lignesLues.filter((ligne) => {
    const rang = rangParNumero.get(ligne.numero);
    return rang !== undefined && folioParRang.has(rang);
  });
  const tables =
    texteAligne?.flatMap((page) =>
      page.mots === undefined
        ? []
        : [{ page: page.page, table: lireLaTable(page.mots, { enregistrements: medias.length }) }],
    ) ?? [];
  const preuveParTable = foliosEtablis ? corroborerParTable(lignesAvecFolio, tables, medias.length) : undefined;
  const lignes: LigneInterpretee[] = [...(preuveParTable?.lignes ?? lignesLues)];
  if (preuveParTable !== undefined)
    dire(
      `table globale page ${preuveParTable.page} : ${preuveParTable.lignes.length} ligne(s) ` +
        `recoupent exactement les repères lus ; les autres restent à vérifier.`,
    );
  else if (tables.length > 0)
    dire(
      `${tables.length} page(s) à géométrie disponible, sans table globale assez plausible ` +
        `et assez corroborée pour publier.`,
    );

  const parRang = new Map<number, LigneInterpretee[]>();
  lignes.forEach((ligne) => {
    const rang = rangParNumero.get(ligne.numero);
    if (rang === undefined) return;
    parRang.set(rang, [...(parRang.get(rang) ?? []), ligne]);
  });
  const pages: PageReperee[] = Array.from({ length: combienDePages }, (_, place) => {
    const rang = place + 1;
    return {
      // La voie oracle rend une entrée par feuille rendue : elle garde sa place à chacune.
      feuille: place,
      rang: place,
      pageImprimee: folioParRang.get(rang) ?? rang,
      // « Lue » seulement si le vote documentaire a établi le folio de cette page. Une lecture
      // locale isolée ne doit jamais suffire à changer ce statut ni à autoriser la publication.
      statut: folioParRang.has(rang) ? ("lue" as const) : ("deduite" as const),
      elements: (parRang.get(rang) ?? []).map((ligne) => ({
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
  const corroborationLue =
    preuveParTable === undefined
      ? corroborationDesLignes(lignes, {})
      : {
          signaux: preuveParTable.signaux,
          preuveHumaine: false,
          suffisante: true,
          pourquoi:
            "Deux façons de lire indépendantes s'accordent : les repères des pages et la table globale du document.",
        };
  const foliosDesLignesEtablis =
    foliosEtablis &&
    lignes.every((ligne) => {
      const rang = rangParNumero.get(ligne.numero);
      return rang !== undefined && folioParRang.has(rang);
    });
  const corroboration = foliosDesLignesEtablis
    ? corroborationLue
    : {
        ...corroborationLue,
        suffisante: false,
        pourquoi:
          "Les lectures peuvent s'accorder sur une piste, mais aucun folio n'est établi à l'échelle du document : " +
          "les pages ne peuvent pas encore porter un lien automatique.",
      };
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
  /** Combien d'enregistrements le document **porte**, interprétés ou non. Par défaut, ceux qu'on
   *  a su lire : un appelant qui ne distingue pas les deux n'a rien à distinguer. */
  disponibles = medias.length,
): RejeuParOracle {
  journal.push(pourquoi);
  options.surPhase?.(pourquoi);
  const texteAligne =
    options.texteDesPages !== undefined &&
    options.texteDesPages.length === combienDePages &&
    options.texteDesPages.every((page, place) => page.page === place + 1)
      ? options.texteDesPages
      : undefined;
  const foliosEtablis =
    options.foliosEtablis === true &&
    texteAligne !== undefined;
  const folioParRang = new Map<number, number>(
    foliosEtablis
      ? texteAligne!.flatMap((page) =>
          page.pageImprimee === undefined ? [] : [[page.page, page.pageImprimee] as const],
        )
      : [],
  );
  const accords =
    texteAligne === undefined
      ? []
      : accordsNomContenu(designationsDesNoms(medias.map((media) => media.nom)), texteAligne);
  // Un accord qui désigne plusieurs enregistrements vaut pour chacun d'eux : ce sont autant de
  // candidats à vérifier, et le filtre qui suit écarte de toute façon tout média retrouvé sur
  // plus d'une page. Rien n'est publié ici — ces lignes restent à vérifier à la main.
  const parMedia = new Map<number, typeof accords>();
  for (const accord of accords)
    for (const rang of accord.rangs) parMedia.set(rang, [...(parMedia.get(rang) ?? []), accord]);
  const candidatesNommees = [...parMedia.entries()]
    .filter(([, trouves]) => trouves.length === 1)
    .map(([rang, trouves]) => {
      const media = medias[rang]!;
      const page = trouves[0]!.page;
      return {
        page,
        jetons: trouves[0]!.jetons,
        ligne: {
          numero: rang + 1,
          pageImprimee: folioParRang.get(page) ?? page,
          piste: media.piste,
          disque: media.disque ?? 1,
          sourcePiste: "corroboration_media" as const,
          confiance: 1,
        } satisfies LigneInterpretee,
      };
    })
    .sort(
      (un, autre) =>
        un.ligne.pageImprimee - autre.ligne.pageImprimee || un.ligne.numero - autre.ligne.numero,
    );
  const tables =
    texteAligne?.flatMap((page) =>
      page.mots === undefined
        ? []
        : [{ page: page.page, table: lireLaTable(page.mots, { enregistrements: medias.length }) }],
    ) ?? [];
  const preuveLue = foliosEtablis
    ? corroborerParTable(
        candidatesNommees.map((candidate) => candidate.ligne),
        tables,
        medias.length,
      )
    : undefined;
  // La table est elle-même la seconde lecture qui établit le folio de départ. Exiger en plus
  // que chaque pied de page ait été relu par l'OCR annulerait précisément son apport. Ses
  // valeurs restent bornées et confrontées massivement aux noms par `corroborerParTable`.
  const preuveParTable = preuveLue;
  const lignesDeLaTable = preuveParTable?.lignes ?? [];
  const parNumero = new Map(candidatesNommees.map((candidate) => [candidate.ligne.numero, candidate]));

  // Un document peut apprendre lui-même un repère numérique que personne n'a nommé dans le
  // code. On ne l'apprend que des lignes déjà prouvées par deux lectures indépendantes (nom et
  // table), et seulement si le même libellé précède la piste attendue au moins huit fois. Une
  // lecture contrariée par vingt lectures concordantes est une faute de déchiffrage, pas un
  // démenti : la tolérance vaut une contradiction par vingt accords exacts, donc aucune en
  // dessous de vingt. Les mots qui appartiennent à la désignation du média sont exclus :
  // répéter son propre nom ne constituerait pas un second signal.
  const normaliser = (texte: string): string =>
    texte
      .normalize("NFD")
      .replaceAll(/[̀-ͯ]/gu, "")
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, " ")
      .trim();
  const couplesNumeriques = (texte: string): readonly { libelle: string; numero: number }[] =>
    [...normaliser(texte).matchAll(/\b([a-z]{3,})\s+0*(\d{1,3})\b/gu)].map((trouve) => ({
      libelle: trouve[1]!,
      numero: Number.parseInt(trouve[2]!, 10),
    }));
  const texteParPage = new Map(texteAligne?.map((page) => [page.page, page.texte] as const) ?? []);
  const decalages = new Set(
    lignesDeLaTable.flatMap((ligne) => {
      const candidate = parNumero.get(ligne.numero);
      return candidate === undefined ? [] : [ligne.pageImprimee - candidate.page];
    }),
  );
  const decalageStable = decalages.size === 1 ? [...decalages][0] : undefined;
  const statistiques = new Map<string, { accords: Set<number>; contradictions: number }>();
  for (const ligne of lignesDeLaTable) {
    const candidate = parNumero.get(ligne.numero);
    if (candidate === undefined || ligne.piste === undefined) continue;
    const motsDuNom = new Set(candidate.jetons.flatMap((jeton) => normaliser(jeton).split(" ")));
    for (const couple of couplesNumeriques(texteParPage.get(candidate.page) ?? "")) {
      if (motsDuNom.has(couple.libelle)) continue;
      const statistique = statistiques.get(couple.libelle) ?? { accords: new Set<number>(), contradictions: 0 };
      if (couple.numero === ligne.piste) statistique.accords.add(ligne.numero);
      else statistique.contradictions += 1;
      statistiques.set(couple.libelle, statistique);
    }
  }
  const libellesEtablis = new Set(
    [...statistiques]
      .filter(
        ([, statistique]) =>
          statistique.accords.size >= 8 &&
          statistique.contradictions <= Math.floor(statistique.accords.size / 20),
      )
      .map(([libelle]) => libelle),
  );
  const numerosDeLaTable = new Set(lignesDeLaTable.map((ligne) => ligne.numero));
  const lignesDeLaRecurrence: LigneInterpretee[] =
    decalageStable === undefined || libellesEtablis.size === 0
      ? []
      : candidatesNommees.flatMap((candidate) => {
          if (numerosDeLaTable.has(candidate.ligne.numero) || candidate.ligne.piste === undefined) return [];
          const confirme = couplesNumeriques(texteParPage.get(candidate.page) ?? "").some(
            (couple) => libellesEtablis.has(couple.libelle) && couple.numero === candidate.ligne.piste,
          );
          if (!confirme) return [];
          const pageImprimee = candidate.page + decalageStable;
          return pageImprimee < 1
            ? []
            : [{
                ...candidate.ligne,
                pageImprimee,
                sourcePiste: "corroboration_recurrente" as const,
              }];
        });
  const lignes: LigneInterpretee[] =
    preuveParTable === undefined
      ? candidatesNommees.map((candidate) => candidate.ligne)
      : [...lignesDeLaTable, ...lignesDeLaRecurrence].sort(
          (une, autre) => une.pageImprimee - autre.pageImprimee || une.numero - autre.numero,
        );
  // Le nom situe l'élément sur une page physique ; la table, elle, corrige son folio. Garder
  // seulement le folio fait perdre le pont entre les deux : l'association existe alors dans le
  // bilan mais aucune page du Lecteur ne peut la porter. C'était exactement le cas des
  // quarante-quatre liens Bass Aerobics (Workout 2 : folio 8, page 10 du PDF).
  const pages = Array.from({ length: combienDePages }, (_, place) => ({
    feuille: place,
    rang: place,
    pageImprimee: folioParRang.get(place + 1) ?? place + 1,
    statut: folioParRang.has(place + 1) ? ("lue" as const) : ("deduite" as const),
    elements: candidatesNommees
      .filter((candidate) => candidate.page === place + 1)
      .map((candidate) => ({
        numero: candidate.ligne.numero,
        y: 0,
        presencePiste: lignes.some((ligne) => ligne.numero === candidate.ligne.numero) ? 1 : 0,
        suite: false,
        accordNumero: 1,
        accordPiste: lignes.some((ligne) => ligne.numero === candidate.ligne.numero) ? 1 : 0,
      })),
  }));
  if (lignes.length > 0) {
    const borne = borneDuVivier(options.provenancesMedias ?? [], options.inventaireMedias ?? medias.map(() => ({})));
    const corroboration =
      preuveParTable === undefined
        ? corroborationDesLignes(lignes, {})
        : {
            signaux: [
              ...preuveParTable.signaux,
              ...(lignesDeLaRecurrence.length === 0 ? [] : ["corroboration_recurrente"]),
            ],
            preuveHumaine: false,
            suffisante: true,
            pourquoi:
              "Deux façons de lire indépendantes s'accordent : les noms imprimés et la table globale du document.",
          };
    const association = qualifierAssociation(
      lignes,
      medias,
      { seuilConfiance: ACCORD_RETENU },
      { borne, corroboration, mediasDisponibles: medias.length },
    );
    const message =
      preuveParTable === undefined
        ? `${lignes.length} proposition(s) tirée(s) des noms restent visibles pour vérification humaine ; ` +
          `ce signal unique ne publie aucun lien.`
        : `table globale page ${preuveParTable.page} : ${lignes.length} proposition(s) nommée(s) ` +
          `recoupée(s) exactement et publiable(s) ; les autres restent à vérifier.`;
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
      // Deux causes bien distinctes, et la même phrase les disait toutes les deux. Mesuré le
      // 5 novembre 2026 : `medias_non_interpretes` était rendue pour un document portant onze
      // enregistrements comme pour un document n'en portant aucun, et l'écran écrivait dans les
      // deux cas « aucun des médias présents n'a pu être interprété ». Dans le premier cas c'est
      // faux — les enregistrements n'y sont pour rien, la lecture n'a trouvé aucun repère ; dans
      // le second il n'y a pas de média du tout. Qui lit ne pouvait pas savoir s'il devait
      // déposer des enregistrements ou changer de manière de lire.
      abstention: {
        raison:
          disponibles === 0
            ? "aucun_media"
            : medias.length === 0
              ? "medias_non_interpretes"
              : "aucun_repere_lu",
        combien: disponibles,
        pourquoi,
      },
    },
    medias,
    journal,
    ...(acquis === undefined ? {} : { acquis }),
  };
}
