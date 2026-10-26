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
  readonly pages: readonly { readonly index: number; readonly numero?: number }[];
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

export function construireVue(entree: Entree): VueBibliotheque {
  const parPiste = new Map(entree.medias.map((media) => [`${media.disque ?? 1}/${media.piste}`, media]));
  const parLigne = new Map(entree.association.appariements.map((appariement) => [clefLigne(appariement.ligne), appariement]));
  const parPage = new Map<number, ElementAffiche[]>();
  const douteux: CasDouteux[] = [];

  // Une abstention globale conserve le résultat brut dans l'instantané technique, mais ne
  // transforme pas trois nombres isolés en trois éléments prétendument reconnus à l'écran.
  const lignes = entree.association.abstention === undefined ? entree.lignes : [];
  for (const ligne of lignes) {
    const appariement = parLigne.get(clefLigne(ligne));
    const media = ligne.piste === undefined || appariement?.media === undefined ? undefined : parPiste.get(`${ligne.disque}/${ligne.piste}`);
    const source = media === undefined ? undefined : entree.sourceDuMedia?.(media);
    const ancreId = identifiantDe(`${entree.id}/element-${ligne.numero}`);
    const etat = doute(ligne, entree.seuil, appariement?.statut);

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
    douteux.push({
      id: identifiantDe(`${entree.id}/maniere-inadaptee`),
      nature: "information",
      etat: "maniere_inadaptee",
      libelle: "Lecture non applicable",
      proposition: "Choisir une autre manière de lire",
      motif: "aucun des médias présents n’a pu être interprété par cette manière de lire",
      details: [`${combien} média${combien > 1 ? "s" : ""} présent${combien > 1 ? "s" : ""}, aucun interprété`],
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

  // Une page par page lue, dans l'ordre de lecture. Les éléments viennent s'y poser par leur
  // numéro imprimé — c'est le seul lien qu'ils aient avec une page — et une page qui n'en porte
  // aucun reste une page.
  const pages: PageAffichee[] = [...entree.pages]
    .sort((un, autre) => un.index - autre.index)
    .map((page) => {
      const elements = page.numero === undefined ? [] : (parPage.get(page.numero) ?? []);
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

  const relies = entree.association.appariements.filter((appariement) => appariement.statut === "auto" && appariement.media !== undefined).length;

  return VueBibliotheque.parse({
    id: identifiantDe(`bibliotheque/${entree.id}`),
    nom: entree.nom,
    mots: entree.mots,
    compteurs: [
      { nombre: lignes.length, mot: entree.mots.element.plusieurs },
      { nombre: relies, mot: "liens" },
      { nombre: pages.length, mot: entree.mots.page.plusieurs },
    ],
    aVerifier: douteux.length,
    filtres,
    pages,
    douteux,
  });
}
