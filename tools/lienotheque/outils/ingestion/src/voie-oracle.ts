import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LigneInterpretee, PageReperee, ResultatRecette } from "@lienotheque/contrats";
import { enGris, formesSombres, type Boite, type ImageGrise } from "@lienotheque/images";
import { coucheSuffisante, lireCoucheTexte, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import {
  COTE_MAXIMAL,
  COTE_MINIMAL,
  NUMEROTATION_PROBABLE,
  accordsNomContenu,
  marquesDesNoms,
  allureDeLaSuite,
  partDeNumerotation,
  zonesAExaminer,
  zonesRecurrentes,
  type FormeObservee,
  type ZoneRecurrente,
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

/** La largeur à laquelle les pages sont rendues. La même que la chaîne de texte : deux largeurs
 *  différentes donneraient deux jeux de formes, et deux résultats pour un même document. */
export const LARGEUR_DE_RENDU = 1800;

/** Combien d'apparitions d'un endroit on lit pour juger s'il porte la marque. Assez pour séparer
 *  « toutes se lisent » de « une sur deux », pas assez pour coûter une passe entière. */
export const APPARITIONS_POUR_JUGER = 12;

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
};

export type RejeuParOracle = {
  readonly resultat: ResultatRecette;
  readonly association: Association;
  readonly medias: readonly Media[];
  /** Ce que la voie a vu et décidé, en clair : de quoi expliquer un résultat sans relire le code. */
  readonly journal: readonly string[];
};

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

  // ── 1. Les formes sombres de chaque page ───────────────────────────────────────────────
  const rendu = await ouvrirRenduPdf(pdf);
  const combienDePages = Math.min(rendu.nombreDePages, options.pages ?? Number.POSITIVE_INFINITY);
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
    return sansLien(medias, options, journal, combienDePages, "Aucune forme ne revient régulièrement sur ces pages.");

  let retenu: { zone: ZoneRecurrente; motif: Motif; part: number } | undefined;
  for (const zone of proposees) {
    const echantillon = echantillonner(zone, APPARITIONS_POUR_JUGER);
    for (const motif of MOTIFS) {
      // Les valeurs lues, dans l'ordre des pages, et non leur seul décompte : c'est ce qui est lu
      // qui dit si cet endroit porte une numérotation ou une forme que la reconnaissance habille
      // toujours du même chiffre.
      const suite = echantillon.map((apparition) => {
        const image = images.get(apparition.page);
        if (image === undefined) return undefined;
        const marque: Marque = {
          numero: 0,
          rangDePage: apparition.page,
          y: apparition.y,
          fenetre: boiteDeLApparition(apparition, image),
          image,
          hauteur: apparition.h * image.hauteur,
        };
        return lireLaMarque(marque, motif, options)?.valeur;
      });
      const allure = allureDeLaSuite(suite);
      const part = partDeNumerotation(allure, echantillon.length);
      dire(
        `  signe de ${(zone.taille.l * 100).toFixed(1)} × ${(zone.taille.h * 100).toFixed(1)} % ` +
          `vers ${(zone.x * 100).toFixed(0)} % de la largeur : ${allure.lues}/${echantillon.length} se lisent, ` +
          `${allure.distinctes} valeur(s) distincte(s), avance ${(allure.avance * 100).toFixed(0)} % ` +
          `→ numérotation ${(part * 100).toFixed(0)} %`,
      );
      if (retenu === undefined || part > retenu.part) retenu = { zone, motif, part };
    }
  }
  if (retenu === undefined || retenu.part < NUMEROTATION_PROBABLE)
    return sansLien(
      medias,
      options,
      journal,
      combienDePages,
      // Dire que rien ne numérote, et non que rien ne se lit : la reconnaissance lit des chiffres
      // dans bien des formes, et c'est précisément l'erreur dans laquelle il ne faut pas tomber.
      `Aucun des ${proposees.length} endroits trouvés ne porte une numérotation : ` +
        `le meilleur n'atteint que ${((retenu?.part ?? 0) * 100).toFixed(0)} % là où il en faut ` +
        `${(NUMEROTATION_PROBABLE * 100).toFixed(0)} %.`,
    );
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
    const couche = await lireCoucheTexte(pdf);
    const parRang = new Map(couche.pages.map((page) => [page.index, page]));
    const bac = mkdtempSync(join(tmpdir(), "lienotheque-oracle-"));
    const contenus: { page: number; texte: string }[] = [];
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
    recette: { id: "voie-sans-maniere-de-lire", version: 1 },
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
  // corpus dont les liens sont vérifiés à l'oreille, cette voie a proposé 40 liens, **tous faux**,
  // et les a publiés en héritant de cette vérification. La page porte deux numérotations côte à
  // côte — celle des éléments et la pastille des pistes — et la voie a élu la première.
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

  return { resultat, association, medias, journal };
}

/** Ce qu'on rend quand il n'y a rien à lire : un résultat vide et une raison, jamais un lien. */
function sansLien(
  medias: readonly Media[],
  options: OptionsVoieOracle,
  journal: string[],
  combienDePages: number,
  pourquoi: string,
): RejeuParOracle {
  journal.push(pourquoi);
  options.surPhase?.(pourquoi);
  return {
    resultat: {
      recette: { id: "voie-sans-maniere-de-lire", version: 1 },
      pages: Array.from({ length: combienDePages }, (_, place) => ({
        index: place,
        rang: place,
        pageImprimee: place + 1,
        statut: "deduite" as const,
        elements: [],
      })),
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
  };
}
