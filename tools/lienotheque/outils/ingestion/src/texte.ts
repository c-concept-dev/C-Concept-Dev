import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PageLue } from "@lienotheque/contrats";
import { objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";
import { decoderJpeg, enGris, versPgm } from "@lienotheque/images";
import {
  type PageDeTexte,
  couperEnDeux,
  MOTS_MINIMUM,
  coucheSuffisante,
  lireCoucheTexte,
  lisible,
  lireParOcr,
  pageDeTexte,
} from "@lienotheque/lecteur-texte";

/** Le texte d'un document, d'où qu'il vienne (RCH-07, OUT-05).
 *
 *  La couche texte quand elle tient, l'OCR sinon, et la décision se prend **page par page**.
 *
 *  Mesuré sur seize documents du corpus, quatre par famille : dix sont servis à cent pour cent
 *  par leur couche, treize à quatre-vingt-dix pour cent ou plus, et trois presque pas. Décider
 *  par document océriserait des milliers de pages déjà lisibles, ou en manquerait autant. Lire
 *  la couche coûte 0,0054 s par page ; l'OCR, trois ordres de grandeur de plus. C'est tout
 *  l'écart entre deux minutes et plusieurs heures sur le corpus entier.
 */

export type OptionsTexte = {
  /** N'en lire que les premières pages : pour essayer, ou pour éprouver. */
  readonly pages?: number | undefined;
  /** La feuille porte deux pages : on la coupe, et chaque moitié devient une page. */
  readonly doublePage?: boolean | undefined;
  /** Appelé après chaque page lue, pour dire où en est le traitement (JOB-03). */
  readonly avancement?: ((faits: number, total: number) => void) | undefined;
  /** Ne pas se fier à la couche, même quand elle est là. Sert à mesurer ce que l'OCR vaut
   *  face à elle, sans quoi on ne saurait jamais laquelle des deux a tort. */
  readonly forcerOcr?: boolean | undefined;
  readonly binaire?: string | undefined;
  readonly langue?: string | undefined;
  readonly tessdata?: string | undefined;
};

export type TexteDuDocument = {
  readonly pages: readonly PageDeTexte[];
  /** Combien de pages la couche a servies. */
  readonly parLaCouche: number;
  /** Combien ont demandé l'OCR. */
  readonly parOcr: number;
  /** Combien n'ont rien rendu du tout — ni couche, ni image à océriser, ni texte après OCR.
   *
   *  Compté à part et jamais tu : c'est le nombre qui permet de dire « aucune des 991 pages de
   *  ce document n'a pu être lue » plutôt que d'annoncer un succès sur un résultat vide. */
  readonly sansTexte: number;
};

/** Les images de page d'un PDF, par **rang de page** et non par ordre d'apparition.
 *
 *  Une page sans image n'en a pas, et son rang est simplement absent de la table. Compter les
 *  images au fil de l'eau décalerait tous les rangs dès la première page sans image, et le texte
 *  d'une page se retrouverait attribué à une autre.
 */
function imagesParPage(objets: ReturnType<typeof objetsPdf>): Map<number, number> {
  const parPage = new Map<number, number>();
  pagesPdf(objets).forEach((page, rang) => {
    const premiere = page.images[0];
    if (premiere !== undefined) parPage.set(rang + 1, premiere.numero);
  });
  return parPage;
}

/** Lit le texte du document, page par page, en disant d'où chaque page vient. */
export async function lireLeTexte(pdf: string, options: OptionsTexte = {}): Promise<TexteDuDocument> {
  const donnees = Buffer.from(await readFile(pdf));
  const couche = options.forcerOcr === true ? [] : (await lireCoucheTexte(pdf)).pages;

  // Le document parsé **une fois**, et réutilisé.
  //
  // `objetsPdf` monte une table de tous les objets du PDF, flux d'images compris. L'appeler dans
  // la boucle des pages reparsait le document entier à chaque page à océriser : sur un livre
  // numérisé de vingt-neuf pages et cinq mégaoctets, vingt-neuf parses complets, chacun retenant
  // tous les flux. Le moteur embarqué y mourait d'un signal après trois minutes et demie, et le
  // parcours complet de l'administrateur ne passait plus.
  const objets = objetsPdf(donnees);
  const images = imagesParPage(objets);

  // Combien de pages il y a : la couche les compte toutes, même celles qu'elle ne sert pas. Sans
  // couche lue, c'est l'arbre des pages du document qui les compte.
  const total = Math.min(
    couche.length > 0 ? couche.length : pagesPdf(objets).length,
    options.pages ?? Number.POSITIVE_INFINITY,
  );

  let dossier: string | undefined;
  const pages: PageDeTexte[] = [];
  let parLaCouche = 0;
  let parOcr = 0;
  let sansTexte = 0;

  try {
    for (let rang = 1; rang <= total; rang += 1) {
      const deLaCouche = options.forcerOcr === true ? undefined : couche[rang - 1];

      // L'OCR ne se tente que si la couche ne suffit pas **et** qu'il y a une image à lire.
      //
      // Le seuil ne décide pas si la couche est *valable* — il décide s'il vaut la peine
      // d'essayer autre chose. Une première version le lisait comme un verdict, et envoyait à
      // l'OCR toute page de moins de vingt mots : une page de titre, une ouverture de chapitre,
      // un poème. Sur un document natif, qui ne porte aucune image, l'OCR n'avait alors rien à
      // lire et la page était perdue — sept mots parfaitement lisibles jetés pour n'avoir pas
      // atteint vingt.
      const aEssayer = deLaCouche === undefined || !coucheSuffisante(deLaCouche);
      const parOcrSiMieux = aEssayer ? await tenterOcr() : undefined;

      // Et quand les deux ont parlé, c'est le plus fourni qui gagne. Une comparaison, pas un
      // verdict : la couche peut rendre sept mots là où l'OCR en rend trois cents, et l'inverse
      // arrive aussi — mesuré sur le corpus, un document rendait 487 mots en couche et 2 par OCR.
      const lue = mieuxServi(deLaCouche, parOcrSiMieux);
      if (lue !== undefined && lue.mots.length > 0) {
        if (lue.source === "ocr") parOcr += 1;
        else parLaCouche += 1;
      }

      async function tenterOcr(): Promise<PageLue | undefined> {
        const numero = images.get(rang);
        if (numero === undefined) return undefined;
        const octets = octetsImage(objets, numero);
        if (octets === undefined || octets.extension !== "jpg") return undefined;
        dossier ??= mkdtempSync(join(tmpdir(), "lienotheque-texte-"));
        return ocrDeLaPage(octets.octets, rang, dossier, options);
      }

      // Rien de lu : ni couche exploitable, ni image à océriser, ni mot après l'OCR. On le
      // compte, et la page ne donne aucun passage — on n'en invente pas un vide.
      if (lue === undefined || lue.mots.length === 0) {
        // Une page, pas un passage. `parLaCouche` et `parOcr` comptent des pages ; compter
        // ici les deux moitiés d'une feuille double mêlait les deux unités dans la même
        // phrase du journal, qui annonçait alors plus de pages sans texte que le document
        // n'en porte.
        sansTexte += 1;
        options.avancement?.(rang, total);
        continue;
      }

      // La coupe vient **après** la lecture et avant le découpage : chaque moitié lit alors son
      // propre folio, là où les deux se contredisaient sur la feuille entière.
      const moities = options.doublePage === true ? couperEnDeux(lue) : [lue];
      moities.forEach((moitie, cote) => {
        const index = options.doublePage === true ? (rang - 1) * 2 + cote + 1 : rang;
        pages.push({ ...pageDeTexte(moitie), index });
      });

      options.avancement?.(rang, total);
    }
  } finally {
    if (dossier !== undefined) rmSync(dossier, { recursive: true, force: true });
  }

  return { pages, parLaCouche, parOcr, sansTexte };
}

/** De deux lectures de la même page, la meilleure — et « meilleure » n'est pas « plus longue ».
 *
 *  **Comparer les nombres de mots choisissait le charabia.** Une couche dont l'encodage de
 *  police est faux rend plus de « mots » que l'OCR de la même image : 2 561 contre 837 sur une
 *  page du corpus, et pas un seul lisible. Le critère de quantité la préférait donc, et
 *  d'autant plus volontiers qu'elle était abondante.
 *
 *  On regarde d'abord si c'est du langage. Une lecture lisible bat une illisible, quelle que
 *  soit sa longueur. Entre deux lisibles, la plus fournie gagne — c'est là que la quantité
 *  redevient un bon signe. À égalité, la couche : elle est exacte là où l'OCR approche.
 */
function mieuxServi(couche: PageLue | undefined, ocr: PageLue | undefined): PageLue | undefined {
  if (couche === undefined) return ocr;
  if (ocr === undefined) return couche;

  // Rien ne bat rien. `lisible` répond « oui » pour une page trop courte à juger — c'est ce
  // qu'il faut pour une page de titre, et c'est un piège ici : une couche **vide** passait donc
  // pour lisible et l'emportait sur un OCR de huit cents mots. Une fixture l'a attrapé.
  if (couche.mots.length === 0) return ocr;
  if (ocr.mots.length === 0) return couche;

  // La lisibilité ne tranche qu'entre deux lectures dont on a de quoi juger. En deçà, le
  // critère n'a pas de sens, et c'est la quantité qui parle.
  const jugeables = couche.mots.length >= MOTS_MINIMUM && ocr.mots.length >= MOTS_MINIMUM;
  if (jugeables) {
    const coucheLisible = lisible(couche);
    if (coucheLisible !== lisible(ocr)) return coucheLisible ? couche : ocr;
  }
  return ocr.mots.length > couche.mots.length ? ocr : couche;
}

/** Océrise une page entière, par un fichier temporaire effacé aussitôt.
 *
 *  Tesseract lit un fichier, pas un tampon. Un lot de trois cents pages en laisserait trois
 *  cents sur le disque, et c'est déjà arrivé de le remplir : chaque image part dès qu'elle a
 *  été lue.
 */
async function ocrDeLaPage(jpeg: Buffer, rang: number, dossier: string, options: OptionsTexte): Promise<PageLue> {
  const image = enGris(await decoderJpeg(jpeg));
  const chemin = join(dossier, `page-${rang}.pgm`);
  writeFileSync(chemin, versPgm(image));
  try {
    // Segmentation 3 : la page entière, en blocs. C'est ce qu'on veut ici — du texte courant —
    // là où la lecture d'un repère dans un coin demande une segmentation serrée.
    return lireParOcr(chemin, image.largeur, image.hauteur, rang, {
      segmentation: 3,
      ...(options.binaire === undefined ? {} : { binaire: options.binaire }),
      ...(options.langue === undefined ? {} : { langue: options.langue }),
      ...(options.tessdata === undefined ? {} : { tessdata: options.tessdata }),
    });
  } finally {
    rmSync(chemin, { force: true });
  }
}
