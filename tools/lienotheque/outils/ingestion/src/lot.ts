import { readFile } from "node:fs/promises";
import { exporterPages } from "./pages-images.js";
import { MotsBibliotheque, SchemaBibliotheque, VueBibliotheque } from "@lienotheque/contrats";
import { chargerRecette, mediasDuDossier, lireLot, interpreter, associer } from "@lienotheque/recettes";
import { construireVue } from "./instantane.js";

/** D'un lot réel à l'instantané que lisent les écrans (correction 8).
 *
 *  La lecture passe par le flux du banc : une page à la fois, et ce qui s'accumule tient en
 *  numéros et en positions. Un livre de cinq cents pages ne demande pas plus de mémoire qu'un de
 *  trente — c'est la condition pour traiter un dépôt réel sur une machine ordinaire.
 *
 *  Rien de ce qui est produit ici n'entre au dépôt : l'instantané va au cache de travail, et le
 *  document comme les médias restent où ils sont. */

/** Ce qu'une bibliothèque déclare d'elle-même. C'est une donnée — les mots du domaine viennent de
 *  là, jamais du code (CLA-01). */
export type DescriptionBibliotheque = {
  readonly id: string;
  readonly nom: string;
  readonly mots: MotsBibliotheque;
  readonly schema: SchemaBibliotheque;
};

export function lireDescription(brut: unknown): DescriptionBibliotheque {
  const objet = brut as Record<string, unknown>;
  return {
    id: String(objet["id"]),
    nom: String(objet["nom"]),
    mots: MotsBibliotheque.parse(objet["mots"]),
    schema: SchemaBibliotheque.parse(objet["schema"]),
  };
}

export type Lot = {
  /** Document numérisé du lot. */
  readonly pdf: string;
  /** Dossier des médias, pris récursivement. */
  readonly medias: string;
  /** Recette qui dit comment lire ce document. */
  readonly recette: string;
  readonly description: string;
  /** Dossier où garder les lectures, pour ne pas repayer l'OCR. */
  readonly cache?: string | undefined;
  /** Dossier où écrire les images de page. Absent, l'instantané n'en porte aucune. */
  readonly images?: string | undefined;
  /** Adresse à laquelle ces images seront servies. */
  readonly adresseImages?: string | undefined;
};

/** Quel numéro imprimé porte chaque rang du document, d'après l'interprète.
 *
 *  On ne refait pas la numérotation ici : l'interprète l'a déjà établie, et il corrige ce qu'une
 *  page seule ne peut pas corriger — un numéro mal lu, un décalage qui change au milieu du livre
 *  parce que le scan saute deux pages. Deux numérotations pour un même document finiraient par
 *  diverger, et c'est l'image d'une autre page qu'on afficherait.
 *
 *  Le lien se fait par les éléments : une page porte des numéros d'élément, et l'interprète dit
 *  sur quelle page imprimée chacun tombe. */
export function numerosImprimes(
  lues: readonly { index: number; elements: readonly { numero: number }[] }[],
  lignes: readonly { numero: number; pageImprimee: number }[],
): Map<number, number> {
  const pageDeLElement = new Map(lignes.map((ligne) => [ligne.numero, ligne.pageImprimee]));
  const parIndex = new Map<number, number>();

  for (const page of lues) {
    const votes = new Map<number, number>();
    for (const element of page.elements) {
      const imprimee = pageDeLElement.get(element.numero);
      if (imprimee !== undefined) votes.set(imprimee, (votes.get(imprimee) ?? 0) + 1);
    }
    let retenue: number | undefined;
    let meilleur = 0;
    for (const [imprimee, nombre] of votes) if (nombre > meilleur) [retenue, meilleur] = [imprimee, nombre];
    if (retenue !== undefined) parIndex.set(page.index, retenue);
  }
  return parIndex;
}

/** Traite un lot et rend l'instantané que les écrans liront. */
export async function instantaneDeLot(lot: Lot): Promise<VueBibliotheque> {
  const description = lireDescription(JSON.parse(await readFile(lot.description, "utf8")));
  const recette = chargerRecette(JSON.parse(await readFile(lot.recette, "utf8")));

  const medias = await mediasDuDossier(lot.medias, recette);
  // Combien de pistes le support compte est un fait sur le média, pas sur son nom (REC-05).
  const lues = await lireLot(lot.pdf, recette, { ...(lot.cache === undefined ? {} : { cache: lot.cache }) });
  const resultat = interpreter(lues, recette, { nombreDePistes: medias.length });
  const association = associer(resultat.lignes, medias, recette);

  // Les images, une par une, écrites au passage. Le numéro imprimé d'une page n'est pas son rang
  // dans le document : c'est le décalage lu qui fait le lien entre les deux.
  const imprimes = numerosImprimes(lues, resultat.lignes);
  const parPageImprimee = new Map<number, { image: string; largeur: number; hauteur: number; vignette?: string }>();
  if (lot.images !== undefined) {
    const adresse = lot.adresseImages ?? "/donnees/pages";
    for (const page of await exporterPages(lot.pdf, lot.images))
      // Une page sans élément reconnu n'a pas de numéro imprimé sûr : mieux vaut pas d'image
      // qu'une image attribuée à la mauvaise page.
      parPageImprimee.set(imprimes.get(page.index) ?? -1, {
        image: `${adresse}/${page.fichier}`,
        largeur: page.largeur,
        hauteur: page.hauteur,
        ...(page.vignette === undefined ? {} : { vignette: `${adresse}/${page.vignette}` }),
      });
  }

  return construireVue({
    id: description.id,
    nom: description.nom,
    schema: description.schema,
    mots: description.mots,
    lignes: resultat.lignes,
    association,
    medias,
    // Le seuil vient de la recette, qui l'a fixé en même temps que ses règles de lecture. Le
    // redéclarer ailleurs, c'est se donner deux seuils et finir par en oublier un.
    seuil: recette.validation.seuil_confiance,
    imageDePage: (page) => parPageImprimee.get(page),
  });
}
