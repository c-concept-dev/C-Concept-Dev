import { readFile } from "node:fs/promises";
import { exporterPages } from "./pages-images.js";
import { DescriptionBibliotheque, type ResultatRecette, VueBibliotheque } from "@lienotheque/contrats";
import { chargerRecette, rejouer, type Association, type Media, type Relecture } from "@lienotheque/recettes";
import { construireVue } from "./instantane.js";

/** D'un lot réel à l'instantané que lisent les écrans (correction 8).
 *
 *  La lecture passe par le flux du banc : une page à la fois, et ce qui s'accumule tient en
 *  numéros et en positions. Un livre de cinq cents pages ne demande pas plus de mémoire qu'un de
 *  trente — c'est la condition pour traiter un dépôt réel sur une machine ordinaire.
 *
 *  Rien de ce qui est produit ici n'entre au dépôt : l'instantané va au cache de travail, et le
 *  document comme les médias restent où ils sont. */

/** Lit la description d'une bibliothèque, validée par son contrat.
 *
 *  Elle était lue ici par un analyseur écrit à la main, qui prenait `String(...)` de ce qu'il
 *  trouvait : un identifiant absent devenait « undefined », un nom vide passait. Le contrat
 *  refuse les deux, et au bon endroit — à la lecture, pas trois écrans plus loin. */
export function lireDescription(brut: unknown): DescriptionBibliotheque {
  return DescriptionBibliotheque.parse(brut);
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
  /** Adresse à laquelle les médias seront servis. Absente, l'instantané n'en porte aucune, et
   *  les écrans disent « média non disponible ici » plutôt que de faire semblant (ANC-05). */
  readonly adresseMedias?: string | undefined;
  /** De quoi relire les repères difficiles, quand la recette en déclare une. Passée telle quelle
   *  à la chaîne : l'instantané des écrans vient du même traitement que la mesure. */
  readonly relecture?: Relecture | undefined;
  /** Appelé après chaque cliché lu, pour dire où en est le traitement (JOB-03). */
  readonly avancement?: ((faits: number, total: number) => void) | undefined;
  /** N'en lire que les premières pages. C'est ce que demande l'essai d'une manière de lire :
   *  dix pages suffisent pour voir si elle tient, et trois cents feraient attendre pour rien. */
  readonly pages?: number | undefined;
  /** Rang de la première page lue. Essayer une manière de lire sur dix pages du milieu demande
   *  de dire lesquelles : les dix premières d'un document n'ont souvent rien à lire. */
  readonly depuis?: number | undefined;
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

/** Ce qu'un lot traité a produit : la vue que les écrans liront, et ce dont elle est tirée.
 *
 *  La vue ne suffit pas à tout : elle est faite pour être lue, et le banc note des lignes. Rendre
 *  les deux n'est pas calculer deux fois le même fait — la vue est tirée du résultat, ici et une
 *  seule fois. C'est l'appelant qui choisit ce dont il a besoin. */
export type LotTraite = {
  readonly vue: VueBibliotheque;
  readonly resultat: ResultatRecette;
  readonly association: Association;
  readonly medias: readonly Media[];
};

/** Traite un lot et rend l'instantané que les écrans liront. */
export async function instantaneDeLot(lot: Lot): Promise<LotTraite> {
  const description = lireDescription(JSON.parse(await readFile(lot.description, "utf8")));
  const recette = chargerRecette(JSON.parse(await readFile(lot.recette, "utf8")));

  // La chaîne, et rien d'autre. Elle réimplémentait ici lecture, interprétation et association —
  // un second chemin de code qui avait déjà divergé : l'inventaire des supports présents, ajouté à
  // la chaîne, n'arrivait jamais aux écrans. Un instantané doit venir du même traitement que la
  // mesure, sans quoi ce qu'on mesure n'est pas ce qu'on montre.
  const { resultat, association, medias } = await rejouer(lot.pdf, lot.medias, recette, {
    ...(lot.cache === undefined ? {} : { cache: lot.cache }),
    ...(lot.relecture === undefined ? {} : { relecture: lot.relecture }),
    ...(lot.avancement === undefined ? {} : { avancement: lot.avancement }),
    ...(lot.pages === undefined ? {} : { pages: lot.pages }),
    ...(lot.depuis === undefined ? {} : { depuis: lot.depuis }),
  });

  // Les images, une par une, écrites au passage. Le numéro imprimé d'une page n'est pas son rang
  // dans le document : c'est le décalage lu qui fait le lien entre les deux.
  const imprimes = numerosImprimes(resultat.pages, resultat.lignes);
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

  const vue = construireVue({
    id: description.id,
    nom: description.nom,
    schema: description.schema,
    mots: description.mots,
    lignes: resultat.lignes,
    pagesAbsentes: resultat.pagesAbsentes,
    association,
    medias,
    // Le seuil vient de la recette, qui l'a fixé en même temps que ses règles de lecture. Le
    // redéclarer ailleurs, c'est se donner deux seuils et finir par en oublier un.
    seuil: recette.validation.seuil_confiance,
    imageDePage: (page) => parPageImprimee.get(page),
    // L'emplacement se résout à la lecture, pas à l'ingestion : la carte ne dit pas où le
    // fichier habite, elle dit lequel c'est (ANC-05).
    sourceDuMedia: (media) =>
      lot.adresseMedias === undefined || media.nom === undefined ? undefined : `${lot.adresseMedias}/${encodeURIComponent(media.nom)}`,
  });

  return { vue, resultat, association, medias };
}
