import {
  VueBibliotheque,
  nommer,
  nommerSuite,
  type CasDouteux,
  type ElementAffiche,
  type LigneInterpretee,
  type MotsBibliotheque,
  type PageAffichee,
  type SchemaBibliotheque,
} from "@lienotheque/contrats";
import type { Association } from "@lienotheque/recettes";
import { identifiantDe, type MediaIngere } from "./index.js";

/** Instantané de bibliothèque pour les écrans (B5).
 *
 *  Rassemble ce qu'un écran demande : des pages, leurs éléments, ce à quoi ils sont reliés, et
 *  les cas qui attendent un œil. Rien n'est inventé ici — tout vient du rejeu et du schéma. */

export type Entree = {
  readonly id: string;
  readonly nom: string;
  readonly schema: SchemaBibliotheque;
  readonly mots: MotsBibliotheque;
  readonly lignes: readonly LigneInterpretee[];
  /** Les numéros de page que la numérotation donne pour sautés, tels que l'interprète les a
   *  relevés. Ils viennent de lui et de personne d'autre : une page sans élément n'est pas une
   *  page absente, et les déduire ici une seconde fois, c'est se donner deux vérités. */
  readonly pagesAbsentes: readonly number[];
  /** Les pages **lues**, dans l'ordre, chacune avec son rang et son numéro imprimé s'il est connu.
   *
   *  Une page existe parce qu'elle a été lue, et non parce qu'on y a reconnu quelque chose. La
   *  vue les déduisait des éléments : un ouvrage ordinaire n'en portant aucun, il n'avait aucune
   *  page — mesuré sur sept documents, 108 à 614 pages lues et zéro affichable, images comprises. */
  /** Les pages à montrer. `index` est le rang de la page **affichée**, à partir de un : c'est la
   *  convention de la vue, celle que l'on cite à une personne (`PREMIER_RANG` dans `lot.ts`). Il
   *  désigne la même feuille que `PageReperee.feuille`, décalée d'un rang — et non un compte des
   *  pages retenues, ce qu'il valait avant le 5 novembre 2026. */
  readonly pages: readonly { readonly index: number; readonly numero?: number; readonly debutElement?: boolean }[];
  readonly association: Association;
  readonly medias: readonly MediaIngere[];
  readonly seuil: number;
  /** Titre de page, quand on en connaît un. */
  readonly titreDePage?: (page: number) => string | undefined;
  /** Où un média est servi, quand il est joignable depuis les écrans (ANC-05). */
  readonly sourceDuMedia?: (media: MediaIngere) => string | undefined;
  /** Image de la page, sa vignette et ses dimensions, quand le lot en a exporté.
   *
   *  Demandée par le **rang**, qu'on connaît toujours — et non par le numéro imprimé, qui
   *  manque sur un ouvrage et rangeait alors toutes les images sous une même clé de repli. */
  readonly imageDePage?: (
    rang: number,
  ) => { readonly image: string; readonly largeur: number; readonly hauteur: number; readonly vignette?: string } | undefined;
};

/** La phrase qui explique un lien, en français, construite une fois pour toutes (ANC-02). */
export function phraseDuLien(ligne: LigneInterpretee, mots: MotsBibliotheque): string {
  // Une relecture qui n'a pas abouti passe avant la provenance : c'est elle qu'il faut dire, et
  // c'est la raison pour laquelle l'élément attend un œil.
  if (ligne.relecture === "sans_majorite")
    return `Repère relu deux fois sur des images différentes, sans que deux lectures s'accordent`;
  if (ligne.relecture === "non_corroboree")
    return `Repère relu sur l'image, mais la suite des repères alentour ne le confirme pas`;

  switch (ligne.sourcePiste) {
    case "pastille":
      return `Repère « ${mots.piste.un} ${ligne.piste} » lu à côté du numéro`;
    case "vision":
      // Sans jargon (règle 8) : on dit ce qui s'est passé, pas comment. Et on dit les deux temps,
      // parce que ANC-02 demande que la corroboration se voie — le numéro ne vient pas d'un seul
      // regard, il vient d'un regard que la suite a confirmé.
      return `Repère relu sur l'image, et confirmé par la suite des repères alentour`;
    case "corroboration_table":
      return `Repère lu sur la page et confirmé par la table du document`;
    case "corroboration_recurrente":
      return `Repère lu sur la page et confirmé par la structure récurrente du document`;
    case "numero_element":
      return `${mots.piste.un[0]!.toUpperCase()}${mots.piste.un.slice(1)} et numéro coïncident dans ce document`;
    case "suite":
      return `Reprend la ${mots.piste.un} du précédent, qui se poursuit`;
    default:
      return "Déduit de la suite des repères alentour";
  }
}

/** Suites de nombres consécutifs dans une liste.
 *
 *  Six médias à la suite que personne ne réclame, c'est un seul fait : les présenter en six fiches
 *  identiques, c'est six fois le même geste pour la même chose. Et sur un livre de cinq cents
 *  pages, un lot de quarante pages sauté ne doit pas remplir la file de quarante cartes. */
export function suites(nombres: readonly number[]): { readonly debut: number; readonly fin: number }[] {
  const tries = [...new Set(nombres)].sort((a, b) => a - b);
  const sortie: { debut: number; fin: number }[] = [];
  for (const nombre of tries) {
    const derniere = sortie[sortie.length - 1];
    if (derniere !== undefined && nombre === derniere.fin + 1) sortie[sortie.length - 1] = { debut: derniere.debut, fin: nombre };
    else sortie.push({ debut: nombre, fin: nombre });
  }
  return sortie;
}

/** Les valeurs qu'une page porte sur les axes du schéma (CLA-10).
 *
 *  L'application ne connaît aucun domaine, et ne remplit donc qu'un axe : celui dont le schéma
 *  dit le rôle — « etat » — et dont les valeurs disent ce qu'elles désignent — « present » ou
 *  « absent ». Elle sait si une page a un lien ; ce que ce lien veut dire dans cette
 *  bibliothèque ne la regarde pas, et le nom de l'axe comme celui des valeurs restent des
 *  données (CLA-01).
 *
 *  Tout autre axe reste vide ici. Il le restera tant que personne ne l'aura rempli — à la main,
 *  ou par la suggestion à l'import (CLA-05) — et son groupe ne s'affichera pas d'ici là. */
export function valeursDePage(
  schema: SchemaBibliotheque,
  elements: readonly ElementAffiche[],
): Record<string, string[]> {
  const valeurs: Record<string, string[]> = {};
  const relie = elements.some((element) => element.media !== undefined);

  for (const axe of schema.axes) {
    if (axe.roleCommun !== "etat") continue;
    const voulu = relie ? "present" : "absent";
    const valeur = axe.valeurs.find((candidate) => !candidate.retiree && candidate.roleValeur === voulu);
    if (valeur !== undefined) valeurs[axe.cle] = [valeur.cle];
  }
  return valeurs;
}

/** Ce qui met un cas en attente, quand il y a lieu.
 *
 *  Une relecture restée sans majorité le dit elle-même, plutôt que de se cacher derrière une
 *  confiance basse : on a regardé la page, puis deux images différentes du même repère, sans que
 *  deux voix concordent. Il n'y a rien à rattraper automatiquement, et l'écran doit pouvoir le
 *  dire autrement qu'« on n'est pas sûr ». */
function doute(ligne: LigneInterpretee, seuil: number, statut?: "auto" | "a_verifier"): CasDouteux["etat"] | undefined {
  if (ligne.piste === undefined) return undefined;
  if (ligne.relecture === "sans_majorite") return "relecture_sans_majorite";
  if (ligne.confiance < seuil || statut === "a_verifier") return "confiance";
  return undefined;
}

const clefLigne = (ligne: LigneInterpretee): string =>
  `${ligne.pageImprimee}/${ligne.numero}/${ligne.disque}/${ligne.piste ?? "sans"}`;

/** Combien de repères il faut pour qu'une portée soit observée, et non supposée.
 *
 *  Deux repères ne donnent qu'un écart. Un écart unique est une mesure, pas une régularité : on
 *  ne fonde pas sur lui la portée de tout un document. En dessous, aucune propagation. */
const REPERES_POUR_UNE_PORTEE = 3;

/** À partir de quel rapport au-dessus de l'écart habituel un document se signale.
 *
 *  Un maximum qui dépasse le double de la médiane ne décrit plus le document : il décrit son cas
 *  le plus étrange. On garde la borne — l'écart a été observé — et on le dit. */
const FILET_DE_LA_PORTEE = 2;

export function construireVue(entree: Entree): VueBibliotheque {
  const parPiste = new Map(entree.medias.map((media) => [`${media.disque ?? 1}/${media.piste}`, media]));
  const parLigne = new Map(entree.association.appariements.map((appariement) => [clefLigne(appariement.ligne), appariement]));
  const parPage = new Map<number, ElementAffiche[]>();
  const douteux: CasDouteux[] = [];

  // Une abstention ordinaire conserve seulement le résultat brut : trois nombres isolés ne
  // deviennent pas trois éléments reconnus. `corroboration_insuffisante` est différente : les
  // lignes portent de vrais candidats, appuyés par une lecture. Ils restent visibles et
  // écoutables pour vérification humaine, mais toujours marqués à vérifier et jamais comptés
  // comme liens publiés.
  const abstentionAAppuiUnique = entree.association.abstention?.raison === "corroboration_insuffisante";
  const lignes = entree.association.abstention === undefined || abstentionAAppuiUnique ? entree.lignes : [];
  for (const ligne of lignes) {
    const appariement = parLigne.get(clefLigne(ligne));
    const media =
      ligne.piste === undefined || (!abstentionAAppuiUnique && appariement?.media === undefined)
        ? undefined
        : parPiste.get(`${ligne.disque}/${ligne.piste}`);
    const source = media === undefined ? undefined : entree.sourceDuMedia?.(media);
    const ancreId = identifiantDe(`${entree.id}/element-${ligne.numero}`);
    const etat = abstentionAAppuiUnique ? "confiance" : doute(ligne, entree.seuil, appariement?.statut);

    const element: ElementAffiche = {
      ancreId,
      // Le numéro tel qu'il est imprimé quand il ne s'écrit pas comme un nombre : « 2.46 » se
      // compare par son rang, mais c'est « 2.46 » qui est écrit sur la page.
      numero: ligne.numeroLu ?? String(ligne.numero),
      page: ligne.pageImprimee,
      // Où l'élément a été lu, quand la lecture l'a su : c'est de là que part le fil.
      ...(ligne.zone === undefined ? {} : { zone: ligne.zone }),
      // Et où son repère a été trouvé : la bande cliquable contient les deux.
      ...(ligne.zoneRepere === undefined ? {} : { zoneRepere: ligne.zoneRepere }),
      ...(media === undefined
        ? {}
        : {
            media: {
              empreinte: media.empreinte,
              nom: media.nom ?? `${entree.mots.piste.un} ${media.piste}`,
              piste: media.piste,
              position: media.decoupe === undefined ? { segment: "inconnu" } : { segment: "inconnu" },
              ...(media.dureeS === undefined ? {} : { duree: media.dureeS }),
              ...(source === undefined ? {} : { source }),
            },
            pourquoi: {
              // La preuve dit « vision » dès qu'une relecture est intervenue, même quand elle n'a
              // rien tranché : c'est ce qui permet à l'écran de montrer d'où vient le doute.
              preuve:
                ligne.relecture !== undefined
                  ? "vision"
                  : ligne.sourcePiste === "pastille"
                    ? "lu"
                    : ligne.sourcePiste === "vision"
                      ? "vision"
                      : "sequence",
              confiance: ligne.confiance,
              phrase: phraseDuLien(ligne, entree.mots),
            },
          }),
      aVerifier: etat !== undefined,
    };

    parPage.set(ligne.pageImprimee, [...(parPage.get(ligne.pageImprimee) ?? []), element]);

    if (etat !== undefined)
      douteux.push({
        id: identifiantDe(`${entree.id}/doute-${ligne.numero}`),
        nature: "lien",
        etat,
        element,
        proposition: `${entree.mots.element.un} ${ligne.numero} → ${entree.mots.piste.un} ${ligne.piste}`,
        motif: phraseDuLien(ligne, entree.mots).toLowerCase(),
        details: [],
      });
  }

  if (entree.association.abstention !== undefined) {
    const combien = entree.association.abstention.combien;
    // Deux causes bien distinctes, et les confondre égare : soit la manière de lire ne sait rien
    // faire des médias présents, soit ces médias n'ont pas été prouvés appartenir au document.
    // Dans le second cas il n'y a pas d'autre manière à choisir — c'est le dépôt qu'il faut refaire.
    const pluriel = combien > 1 ? "s" : "";
    // `corroboration_insuffisante` ne veut **pas** dire que rien n'a été lu : la confrontation
    // l'émet précisément quand *une* façon de savoir appuie ces liens et qu'aucun œil ne les a
    // vérifiés (`confrontation.ts`). Cette branche s'appelait `sansLecture` et écrivait « Rien
    // n'a été lu sur ces pages » juste à côté du motif du moteur, qui disait l'inverse : « Une
    // seule façon de savoir appuie ces liens ». Mesuré le 30 octobre 2026 sur quatre documents
    // réels de la bibliothèque d'essai.
    //
    // Une cause par entrée, et non une cascade de conditions : confondre deux causes égare qui
    // lit, et c'est arrivé deux fois. Une cause de plus s'écrit ici en une ligne, sans toucher
    // au reste.
    const DITES = {
      aucun_media: {
        libelle: "Aucun enregistrement dans ce document",
        proposition: "Déposer ce document avec ses enregistrements",
        motif: "sans enregistrement, aucun lien n’est possible — rien n’a été exploré",
        details: ["aucun enregistrement à relier"],
      },
      aucun_repere_lu: {
        libelle: "Aucun repère lu sur ces pages",
        proposition: "Choisir une autre manière de lire",
        motif: "la lecture n’a trouvé aucun repère sur ces pages",
        details: [`${combien} enregistrement${pluriel} en attente, aucun repère lu`],
      },
      medias_non_interpretes: {
        libelle: "Lecture non applicable",
        proposition: "Choisir une autre manière de lire",
        motif: "aucun des médias présents n’a pu être interprété par cette manière de lire",
        details: [`${combien} média${pluriel} présent${pluriel}, aucun interprété`],
      },
      vivier_non_borne: {
        libelle: "Rien ne prouve à qui appartiennent ces enregistrements",
        proposition: "Déposer ce document avec ses propres enregistrements",
        motif: "l’appartenance de ces enregistrements à ce document n’est pas établie",
        details: [`${combien} enregistrement${pluriel} dont l’appartenance n’est pas établie`],
      },
      corroboration_insuffisante: {
        libelle: "Ces liens n’ont qu’un seul appui",
        proposition: "Vérifier ce document, ou lui apporter un second signal indépendant",
        motif: "une seule façon de savoir appuie ces liens",
        details: [
          `${combien} proposition${pluriel} non vérifiée${pluriel}, ${
            combien > 1 ? "appuyées" : "appuyée"
          } par une seule lecture`,
        ],
      },
    } as const;
    const dite = DITES[entree.association.abstention.raison];
    douteux.push({
      id: identifiantDe(`${entree.id}/maniere-inadaptee`),
      nature: "information",
      etat: "maniere_inadaptee",
      libelle: dite.libelle,
      proposition: dite.proposition,
      // Le moteur dit souvent lui-même ce qu'il a constaté, et le sien est toujours plus précis.
      motif: entree.association.abstention.pourquoi ?? dite.motif,
      details: [...dite.details],
    });
  }

  // Les informations : ce qu'on a constaté et que personne n'a encore regardé (OUT-01, OUT-10).
  //
  // Elles ne demandent pas d'arbitrage — rien à confirmer, rien à corriger — mais elles ne
  // doivent pas disparaître pour autant. Un lot dont tous les liens passent le seuil affichait
  // « Rien à vérifier », alors que deux pages manquaient au document et que six médias n'étaient
  // réclamés par personne. C'est précisément ce qu'on veut savoir après un import.
  for (const trou of suites(entree.pagesAbsentes)) {
    const libelle = nommerSuite(entree.mots.page, trou.debut, trou.fin);
    douteux.push({
      id: identifiantDe(`${entree.id}/page-absente-${trou.debut}-${trou.fin}`),
      nature: "information",
      etat: "page_absente",
      libelle,
      // « manquent au » plutôt que « absentes du » : le schéma donne les mots, jamais leur
      // genre, et « absentes » ne vaut que pour un mot féminin. Un verbe s'accorde en nombre,
      // qu'on connaît, et pas en genre, qu'on ne connaîtra jamais.
      proposition: `${libelle} ${trou.fin > trou.debut ? "manquent" : "manque"} au document`,
      // Le constat, pas une cause : la numérotation saute, et savoir si c'est le scan ou le
      // livre qui saute n'est pas de notre ressort.
      motif: `la numérotation passe de ${trou.debut - 1} à ${trou.fin + 1}`,
      // Un trou se lit d'un coup : il n'y a rien à déplier derrière.
      details: [],
    });
  }

  // Les médias que personne ne réclame, par suites : « Pistes 93 à 98 » plutôt que six fiches.
  // Le détail reste là, à déplier — on regroupe le geste, pas l'information.
  for (const suite of suites(entree.association.orphelins)) {
    const pistes = Array.from({ length: suite.fin - suite.debut + 1 }, (_, pas) => suite.debut + pas);
    const libelle = nommerSuite(entree.mots.piste, suite.debut, suite.fin);
    douteux.push({
      id: identifiantDe(`${entree.id}/media-orphelin-${suite.debut}-${suite.fin}`),
      nature: "information",
      etat: "media_orphelin",
      libelle,
      // Aucune tournure qui demande le genre : « aucun élément relié » devient « aucun clause
      // relié » dès qu'on change de domaine. « Aucun lien » et « n'y renvoie » valent partout.
      proposition: `${libelle} : aucun lien`,
      motif: `aucun repère lu n'y renvoie`,
      details: pistes.map((piste) => {
        const media = entree.medias.find((candidat) => candidat.piste === piste);
        const nom = nommer(entree.mots.piste, piste);
        return media?.nom === undefined ? nom : `${nom} — fichier « ${media.nom} »`;
      }),
    });
  }

  // Un numéro imprimé revendiqué par deux pages (OUT-15).
  //
  // Les éléments se posent par numéro imprimé : c'est le seul lien qu'ils aient avec une page.
  // Quand deux pages déclarent le même, le même élément se pose sur les deux, et l'une des deux
  // images n'a rien à voir avec ce qui a été mesuré. Mesuré le 29 octobre 2026 sur la vraie
  // base : un document sur 250, où la table des matières d'un recueil se déclarait page 66 et
  // montrait, « Confiance haute », le repère de la vraie page 66.
  //
  // On ne choisit pas entre les deux — rien ici ne permet de savoir laquelle a raison — et on
  // n'en cache aucune. On cesse seulement de les présenter comme sûres.
  const combienParNumero = new Map<number, number>();
  for (const page of entree.pages)
    if (page.numero !== undefined) combienParNumero.set(page.numero, (combienParNumero.get(page.numero) ?? 0) + 1);
  const numerosEnDouble = new Map(
    [...combienParNumero].filter(([, combien]) => combien > 1).map(([numero, combien]) => [numero, combien]),
  );

  // Jusqu'où un repère vaut : la portée que le document montre lui-même (OUT-15).
  //
  // « Un repère vaut jusqu'au prochain repère » est juste au milieu d'un document et faux à sa
  // fin : le dernier n'a pas de prochain repère, et hérite donc de tout ce qui reste. Mesuré sur
  // un document réel de 108 pages lues : son dernier élément se proposait sur SEPT pages — tout
  // ce que le document porte après lui, jusqu'à celle qui en donne le prix — là où ses cinquante
  // et un voisins en couvrent deux. Le document et son contenu sont nommés au registre et dans
  // les contrôles, jamais ici (CLA-01).
  //
  // La portée se lit dans le document, jamais ici : c'est l'écart entre deux repères. Deux
  // statistiques, parce qu'il y a deux questions (décision de Christophe du 5 novembre 2026) :
  //
  //   — au MILIEU, le maximum. La borne ne doit jamais couper une portée que le document a
  //     montrée, et toute portée observée lui est inférieure ou égale.
  //   — à la FIN, la médiane. Le dernier élément n'a RIEN montré de sa portée ; lui donner le
  //     maximum serait lui accorder le cas le plus généreux du livre sans qu'aucune mesure ne
  //     l'appuie. La médiane lui donne ce que le document fait habituellement. Mesuré sur F5 :
  //     le maximum lui faisait couvrir la page de discographie, la médiane s'arrête avant.
  //
  // Un écart bordé par un repère dont la PLACE est douteuse — son numéro imprimé est revendiqué
  // par deux pages — ne compte pas : un repère peut-être mal placé ne doit pas décider de la
  // portée des autres. Et écarter l'ÉCART, jamais le repère : retirer un repère de la suite
  // fusionnerait ses deux écarts voisins et fabriquerait une portée plus grande que toutes les
  // autres (mesuré : 3 devenait 4).
  //
  // Sous trois repères, il n'y a pas de portée observée — deux repères ne donnent qu'un écart,
  // et un écart unique est une mesure, pas une régularité. On ne propage alors pas du tout.
  const ouvrantes = [...entree.pages]
    .filter((page) => page.debutElement === true)
    .map((page) => page.index)
    .sort((un, autre) => un - autre);
  const placeDouteuse = new Set(
    [...entree.pages]
      .filter((page) => page.numero !== undefined && numerosEnDouble.has(page.numero) && page.debutElement === true)
      .map((page) => page.index),
  );
  const ecartsSurs = ouvrantes
    .slice(0, -1)
    .map((debut, rang) => ({ debut, fin: ouvrantes[rang + 1]! }))
    .filter(({ debut, fin }) => !placeDouteuse.has(debut) && !placeDouteuse.has(fin))
    .map(({ debut, fin }) => fin - debut);
  const portee = ((): { courante: number; derniere: number } | undefined => {
    if (ouvrantes.length < REPERES_POUR_UNE_PORTEE || ecartsSurs.length === 0) return undefined;
    const tries = [...ecartsSurs].sort((un, autre) => un - autre);
    const milieu = Math.floor(tries.length / 2);
    // Médiane basse sur un compte pair : une portée est un nombre de pages, et une demi-page
    // n'existe pas. Arrondir vers le bas, c'est préférer une page sans lien à un lien de trop.
    const mediane = tries.length % 2 === 1 ? tries[milieu]! : Math.min(tries[milieu - 1]!, tries[milieu]!);
    return { courante: Math.max(...ecartsSurs), derniere: mediane };
  })();
  const dernierRepere = ouvrantes.at(-1);

  // Une page par page lue, dans l'ordre de lecture. Les éléments viennent s'y poser par leur
  // numéro imprimé — c'est le seul lien qu'ils aient avec une page — et une page qui n'en porte
  // aucun reste une page.
  let elementsActifs: ElementAffiche[] = [];
  let departDeLaPortee: number | undefined;
  const pages: PageAffichee[] = [...entree.pages]
    .sort((un, autre) => un.index - autre.index)
    .map((page) => {
      const poses = page.numero === undefined ? [] : (parPage.get(page.numero) ?? []);
      // Sur une page dont le numéro est revendiqué deux fois, rien n'est sûr d'être au bon
      // endroit. Une copie : les deux pages partagent le même tableau, et marquer l'un
      // marquerait l'autre sans qu'on l'ait demandé.
      const elementsDuDepart =
        page.numero !== undefined && numerosEnDouble.has(page.numero)
          ? poses.map((element) => ({ ...element, aVerifier: true }))
          : poses;
      // Un repère de départ vaut jusqu'au prochain repère : tourner la page ne coupe pas le
      // média qui accompagne encore le même élément. Une borne sans lien arrête malgré tout la
      // propagation ; elle dit qu'un autre élément commence, sans prétendre savoir quel média
      // lui appartient. Cette information vient du document traité, jamais d'un vocabulaire ou
      // d'un nombre de pages codé ici.
      if (page.debutElement) {
        // Un repère dont la place est douteuse ne propage pas du tout : il reste sur sa seule
        // page, marqué. On ne sait pas laquelle des deux pages qui revendiquent le même numéro
        // est à la sienne, et c'est une personne qui le tranchera (mode manuel). La doctrine
        // préfère une page sans lien à un faux lien.
        elementsActifs = placeDouteuse.has(page.index) ? [] : elementsDuDepart;
        departDeLaPortee = page.index;
      }
      const limite =
        portee === undefined || departDeLaPortee === undefined
          ? 0
          : departDeLaPortee === dernierRepere
            ? portee.derniere
            : portee.courante;
      const dansLaPortee = departDeLaPortee !== undefined && page.index - departDeLaPortee < limite;
      const elements = elementsDuDepart.length > 0 ? elementsDuDepart : dansLaPortee ? elementsActifs : [];
      const titre = page.numero === undefined ? undefined : entree.titreDePage?.(page.numero);
      const vue = entree.imageDePage?.(page.index);
      return {
        index: page.index,
        ...(page.numero === undefined ? {} : { numero: page.numero }),
        ...(titre === undefined ? {} : { titre }),
        ...(vue === undefined ? {} : vue),
        elements,
        texte: [],
        traduction: [],
        valeurs: valeursDePage(entree.schema, elements),
      };
    });

  // Et on le dit, une fois par numéro, en nommant les pages qui se le disputent.
  for (const [numero, combien] of numerosEnDouble) {
    const concernees = pages.filter((page) => page.numero === numero);
    douteux.push({
      id: identifiantDe(`${entree.id}/page-en-double-${numero}`),
      nature: "information",
      etat: "page_en_double",
      // Aucun accord de genre : les mots de la page viennent du schéma, et « portée » ne vaut
      // que pour un mot féminin. « Le numéro N est porté » marcherait, mais c'est le numéro qui
      // est en double, pas la page — et c'est ainsi qu'il faut le dire.
      libelle: `Numéro ${numero} en double`,
      proposition: `Vérifier quelle ${entree.mots.page.un} porte vraiment le numéro ${numero}`,
      motif: `${combien} ${entree.mots.page.plusieurs} du document déclarent le numéro ${numero}`,
      details: concernees.map(
        (page) =>
          `${entree.mots.page.un} ${page.index} du document` +
          (page.elements.length === 0 ? "" : ` — ${page.elements.length} ${page.elements.length > 1 ? entree.mots.element.plusieurs : entree.mots.element.un}`),
      ),
    });
  }

  // Une portée que le document ne laisse pas résumer (OUT-15).
  //
  // Le maximum est la bonne borne au milieu, et sa faiblesse est connue : un seul écart aberrant
  // l'emporte, et un numéro imprimé mal lu suffit à en fabriquer un. On ne remplace pas la règle
  // — l'écart existe, et couper dedans perdrait un lien vrai — on dit que la mesure est moins
  // solide ici qu'ailleurs, et on laisse un œil regarder. Le filet retenu : un maximum qui
  // dépasse le double de l'écart habituel.
  if (portee !== undefined && portee.courante > FILET_DE_LA_PORTEE * portee.derniere)
    douteux.push({
      id: identifiantDe(`${entree.id}/portee-irreguliere`),
      nature: "information",
      etat: "portee_irreguliere",
      libelle: "Portée irrégulière",
      proposition: `Vérifier les numéros lus sur les ${entree.mots.page.plusieurs} du document`,
      motif:
        `le plus grand écart entre deux repères est de ${portee.courante} ${entree.mots.page.plusieurs},` +
        ` pour ${portee.derniere} habituellement`,
      details: [
        `écarts mesurés, du plus petit au plus grand : ${[...ecartsSurs].sort((un, autre) => un - autre).join(", ")}`,
      ],
    });

  // Un élément dont aucune page lue ne porte le numéro imprimé n'a nulle part où se poser.
  //
  // La question ne se posait pas tant que la page était **créée depuis** l'élément : il y avait
  // toujours une page pour l'accueillir. Maintenant que les pages viennent des pages lues, elle
  // se pose — et la seule réponse acceptable est de le nommer. Un élément qui disparaît en
  // silence passe tous les contrôles et ne se découvre qu'à l'usage (OUT-15).
  const portees = new Set(pages.map((page) => page.numero).filter((numero) => numero !== undefined));
  for (const [numeroImprime, surCettePage] of parPage)
    if (!portees.has(numeroImprime))
      for (const element of surCettePage)
        douteux.push({
          id: identifiantDe(`${entree.id}/a-rattacher-${element.numero}`),
          nature: "lien",
          etat: "a_rattacher",
          element,
          proposition: `Rattacher ${entree.mots.element.un} ${element.numero}`,
          motif: `aucune ${entree.mots.page.un} lue ne porte le numéro ${numeroImprime}`,
          details: [],
        });

  // Les filtres, comptés sur ce que les pages portent vraiment. Un axe que personne ne porte
  // n'est pas filtrable : son groupe reste masqué, et il reparaîtra le jour où l'application
  // saura le remplir.
  const filtres = entree.schema.axes.map((axe) => {
    const valeurs = axe.valeurs
      .filter((valeur) => !valeur.retiree)
      .map((valeur) => ({
        cle: valeur.cle,
        nom: valeur.nom,
        nombre: pages.filter((page) => (page.valeurs[axe.cle] ?? []).includes(valeur.cle)).length,
      }));
    return { cle: axe.cle, nom: axe.nom, valeurs, filtrable: pages.some((page) => (page.valeurs[axe.cle] ?? []).length > 0) };
  });

  // Une abstention peut conserver les appariements techniques pour expliquer ce qui a été lu.
  // Ils ne sont pourtant pas publiés : les compter comme « liens » transforme une hypothèse en
  // résultat acquis. On sépare donc le nombre actif du nombre proposé, jusque dans l'écran.
  //
  // Mais le nombre proposé ne se lit pas toujours au même endroit, et c'est ce qui restait faux.
  // Quand la corroboration manque, la confrontation ne garde **aucun** appariement : mesuré le
  // 30 octobre 2026 sur quatre documents réels, `appariements` était vide et `abstention.combien`
  // valait 40, 15, 14 et 10. Le compteur annonçait donc « aucune proposition » tandis que la
  // ligne de détail en annonçait quarante, au même instant, pour la même chose.
  const propositionsNonVerifiees =
    entree.association.abstention === undefined
      ? 0
      : entree.association.abstention.raison === "corroboration_insuffisante"
        ? entree.association.abstention.combien
        : entree.association.appariements.length;
  const relies =
    entree.association.abstention === undefined
      ? entree.association.appariements.filter((appariement) => appariement.statut === "auto" && appariement.media !== undefined).length
      : 0;

  return VueBibliotheque.parse({
    id: identifiantDe(`bibliotheque/${entree.id}`),
    nom: entree.nom,
    mots: entree.mots,
    compteurs: [
      { nombre: lignes.length, mot: entree.mots.element.plusieurs },
      { nombre: relies, mot: "liens" },
      ...(propositionsNonVerifiees === 0
        ? []
        : [{ nombre: propositionsNonVerifiees, mot: "propositions non vérifiées" }]),
      { nombre: pages.length, mot: entree.mots.page.plusieurs },
    ],
    aVerifier: douteux.length,
    filtres,
    pages,
    douteux,
  });
}
