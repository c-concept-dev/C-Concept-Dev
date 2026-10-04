import {
  VueBibliotheque,
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
  /** Image de la page et ses dimensions, quand le lot en a exporté une. */
  readonly imageDePage?: (page: number) => { readonly image: string; readonly largeur: number; readonly hauteur: number } | undefined;
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
    filtres: entree.schema.axes.map((axe) => ({
      cle: axe.cle,
      nom: axe.nom,
      valeurs: axe.valeurs.filter((valeur) => !valeur.retiree).map((valeur) => ({ cle: valeur.cle, nom: valeur.nom, nombre: 0 })),
    })),
    pages,
    douteux,
  });
}
