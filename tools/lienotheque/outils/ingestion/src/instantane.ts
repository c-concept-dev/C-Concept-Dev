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
  readonly association: Association;
  readonly medias: readonly MediaIngere[];
  readonly seuil: number;
  /** Titre de page, quand on en connaît un. */
  readonly titreDePage?: (page: number) => string | undefined;
  /** Image de la page, sa vignette et ses dimensions, quand le lot en a exporté. */
  readonly imageDePage?: (
    page: number,
  ) => { readonly image: string; readonly largeur: number; readonly hauteur: number; readonly vignette?: string } | undefined;
};

/** La phrase qui explique un lien, en français, construite une fois pour toutes (ANC-02). */
export function phraseDuLien(ligne: LigneInterpretee, mots: MotsBibliotheque): string {
  switch (ligne.sourcePiste) {
    case "pastille":
      return `Repère « ${mots.piste.un} ${ligne.piste} » lu à côté du numéro`;
    case "numero_element":
      return `${mots.piste.un[0]!.toUpperCase()}${mots.piste.un.slice(1)} et numéro coïncident dans ce document`;
    case "suite":
      return `Reprend la ${mots.piste.un} du précédent, qui se poursuit`;
    default:
      return "Déduit de la suite des repères alentour";
  }
}

/** Suites de nombres consécutifs manquants dans une liste triée.
 *
 *  Un lot sauté se lit mieux d'un bloc : « pages 30 et 31 » plutôt que deux fiches. Et sur un
 *  livre de cinq cents pages, un trou de quarante pages ne doit pas remplir la file de quarante
 *  cartes identiques. */
export function trous(presents: readonly number[]): { readonly debut: number; readonly fin: number }[] {
  const tries = [...new Set(presents)].sort((a, b) => a - b);
  const sortie: { debut: number; fin: number }[] = [];
  for (let rang = 1; rang < tries.length; rang += 1) {
    const avant = tries[rang - 1]!;
    const apres = tries[rang]!;
    if (apres - avant > 1) sortie.push({ debut: avant + 1, fin: apres - 1 });
  }
  return sortie;
}

/** Suites de nombres consécutifs dans une liste.
 *
 *  L'envers de `trous`. Six médias à la suite que personne ne réclame, c'est un seul fait : les
 *  présenter en six fiches identiques, c'est six fois le même geste pour la même chose. */
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

/** Ce qui met un cas en attente, quand il y a lieu. */
function doute(ligne: LigneInterpretee, seuil: number): CasDouteux["etat"] | undefined {
  if (ligne.piste === undefined) return undefined;
  if (ligne.confiance < seuil) return "confiance";
  return undefined;
}

export function construireVue(entree: Entree): VueBibliotheque {
  const parPiste = new Map(entree.medias.map((media) => [`${media.disque ?? 1}/${media.piste}`, media]));
  const parPage = new Map<number, ElementAffiche[]>();
  const douteux: CasDouteux[] = [];

  for (const ligne of entree.lignes) {
    const media = ligne.piste === undefined ? undefined : parPiste.get(`${ligne.disque}/${ligne.piste}`);
    const ancreId = identifiantDe(`${entree.id}/element-${ligne.numero}`);
    const etat = doute(ligne, entree.seuil);

    const element: ElementAffiche = {
      ancreId,
      numero: String(ligne.numero),
      page: ligne.pageImprimee,
      ...(media === undefined
        ? {}
        : {
            media: {
              empreinte: media.empreinte,
              nom: media.nom ?? `${entree.mots.piste.un} ${media.piste}`,
              piste: media.piste,
              position: media.decoupe === undefined ? { segment: "inconnu" } : { segment: "inconnu" },
            },
            pourquoi: { preuve: ligne.sourcePiste === "pastille" ? "lu" : "sequence", confiance: ligne.confiance, phrase: phraseDuLien(ligne, entree.mots) },
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

  // Les informations : ce qu'on a constaté et que personne n'a encore regardé (OUT-01, OUT-10).
  //
  // Elles ne demandent pas d'arbitrage — rien à confirmer, rien à corriger — mais elles ne
  // doivent pas disparaître pour autant. Un lot dont tous les liens passent le seuil affichait
  // « Rien à vérifier », alors que deux pages n'avaient rien donné et que six médias n'étaient
  // réclamés par personne. C'est précisément ce qu'on veut savoir après un import.
  const numerosDePage = [...parPage.keys()];
  for (const trou of trous(numerosDePage)) {
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
      // Aucune cause avancée : une page peut manquer au document comme n'avoir rien donné à
      // lire, et d'ici on ne sait pas laquelle des deux.
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

  const pages: PageAffichee[] = [...parPage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([numero, elements]) => {
      const titre = entree.titreDePage?.(numero);
      const vue = entree.imageDePage?.(numero);
      return {
        numero,
        ...(titre === undefined ? {} : { titre }),
        ...(vue === undefined ? {} : vue),
        elements,
        texte: [],
        traduction: [],
      };
    });

  const relies = entree.lignes.filter((ligne) => ligne.piste !== undefined).length;

  return VueBibliotheque.parse({
    id: identifiantDe(`bibliotheque/${entree.id}`),
    nom: entree.nom,
    mots: entree.mots,
    compteurs: [
      { nombre: entree.lignes.length, mot: entree.mots.element.plusieurs },
      { nombre: relies, mot: "liens" },
      { nombre: pages.length, mot: entree.mots.page.plusieurs },
    ],
    aVerifier: douteux.length,
    // Les axes du schéma, déclarés mais pas encore comptés : rien ici ne sait quelle valeur
    // porte une page. Ils partent donc « filtrable: false », et les écrans n'en montrent pas le
    // groupe. Les annoncer avec des comptes à zéro, c'était promettre un tri inexistant.
    filtres: entree.schema.axes.map((axe) => ({
      cle: axe.cle,
      nom: axe.nom,
      valeurs: axe.valeurs.filter((valeur) => !valeur.retiree).map((valeur) => ({ cle: valeur.cle, nom: valeur.nom, nombre: 0 })),
      filtrable: false,
    })),
    pages,
    douteux,
  });
}
