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
  lireCoucheTexte,
  lisible,
  lireParOcr,
  pageDeTexte,
} from "@lienotheque/lecteur-texte";

/** Le texte d'un document, d'où qu'il vienne (RCH-07, OUT-05).
 *
 *  **La reconnaissance quand la page est photographiée, la couche sinon**, et la décision se
 *  prend page par page. Cet ordre est l'inverse de celui des premiers lots, et le renversement
 *  date du 20 octobre 2026 : voir `laLectureRetenue`, qui porte la mesure.
 *
 *  La décision reste **par page** et non par document : mesuré sur seize documents du corpus,
 *  dix sont servis à cent pour cent par leur couche et trois presque pas, et un même ouvrage
 *  rend 3 % sur une page et 38 % sur une autre.
 *
 *  Ce que l'inversion coûte, et qui n'est pas caché : l'OCR se tente désormais sur **toute page
 *  portant une image**, y compris celles des diaporamas dont l'image n'est qu'un décor. Lire la
 *  couche coûte 0,0054 s par page, l'OCR environ deux secondes — mesuré le 20 octobre, contre
 *  « une minute » annoncé jusque-là, faux d'un facteur trente. Une page native, elle, ne porte
 *  aucune image et ne coûte toujours rien de plus.
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

      // L'OCR se tente **dès qu'il y a une image à lire**, et non plus seulement quand la
      // couche cède (BAS-02, 20 octobre 2026). L'inversion vient d'une mesure : cinquante pages
      // du corpus relues à l'œil, en aveugle, donnent tort à la couche trois fois sur quatre là
      // où les deux lectures divergent — 23 % contre 70 %.
      //
      // Une page native ne porte aucune image : `tenterOcr` y rend `undefined`, rien ne se
      // tente, rien ne change. Le surcoût ne touche donc que les pages photographiées — et,
      // c'est le prix assumé, celles des diaporamas dont l'image n'est qu'un décor, qu'on
      // océrise pour découvrir qu'il n'y avait rien à y lire. Les reconnaître d'avance
      // demanderait de les océriser : la circularité n'a pas de sortie bon marché, et
      // `laLectureRetenue` rattrape le cas en rendant la couche.
      const parOcrSiMieux = await tenterOcr();
      const lue = laLectureRetenue(deLaCouche, parOcrSiMieux);
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

/** En deçà de quelle part des mots de la couche une reconnaissance n'a **pas vraiment lu**.
 *
 *  Le garde-fou de l'inversion, et il est nécessaire : des diaporamas, des thèses et des
 *  supports de cours portent une image par page — un fond, un décor — et leur texte est
 *  d'origine. La reconnaissance y lit le décor et n'y trouve rien. Préférer aveuglément l'OCR y
 *  perdrait tout le texte.
 *
 *  Mesuré le 20 octobre 2026 sur trente-neuf documents : là où la comparaison a un sens, les
 *  deux lectures rendent un nombre de mots voisin — 516 contre 517, 744 contre 735 ; là où elle
 *  n'en a pas, la reconnaissance rend zéro ou deux mots contre quelques centaines. **Deux ordres
 *  de grandeur séparent les deux cas**, et le seuil tombe au milieu sans raser ni l'un ni
 *  l'autre. */
export const PART_OCR_MINIMALE = 0.25;

/** De deux lectures de la même page, laquelle fait foi.
 *
 *  ## Ce que l'ancienne règle jugeait, et ce qu'elle ne pouvait pas voir
 *
 *  Elle comparait la **lisibilité** — part de mots outils, part de mots bien formés — puis, à
 *  égalité, la quantité. Cela attrapait le charabia d'un encodage de police faux, qui rendait
 *  2 561 « mots » contre 837 à la reconnaissance sans qu'un seul soit lisible.
 *
 *  Cela ne pouvait **pas** attraper une couche lisible mais inexacte. Une couche qui lit
 *  « mechamment » pour « méchamment » garde ses mots outils — *le*, *la*, *de* sont courts et
 *  passent presque toujours — et ses mots restent bien formés. Elle franchissait les deux
 *  seuils, et elle était fausse.
 *
 *  ## Ce que la mesure a tranché
 *
 *  Cinquante pages du corpus réel, relues à l'œil en aveugle le 20 octobre 2026 : là où les
 *  deux lectures divergent, **la couche a tort trois fois sur quatre** (23 % contre 70 %). Le
 *  défaut dominant est la perte de tous les accents, qu'aucun des deux seuils ne signale.
 *
 *  Là où les deux s'accordent, en revanche, elles ont raison : **aucune page du lot d'accord
 *  n'a vu les deux se tromper ensemble**. C'est ce qui permet de préférer la reconnaissance
 *  sans rien risquer sur les pages faciles — elle y dit la même chose.
 *
 *  ## La règle, dans l'ordre
 *
 *  1. une lecture absente ou vide ne gagne jamais contre une lecture qui a dit quelque chose ;
 *  2. entre deux lectures jugeables, une lisible bat une illisible — le charabia reste exclu ;
 *  3. **la reconnaissance l'emporte dès qu'elle a vraiment lu**, même moins fournie que la
 *     couche. La quantité n'est plus un argument en faveur de la couche : c'est précisément ce
 *     que la mesure a renversé ;
 *  4. sinon la couche, qui est alors le seul texte de la page.
 */
export function laLectureRetenue(couche: PageLue | undefined, ocr: PageLue | undefined): PageLue | undefined {
  if (couche === undefined) return ocr;
  if (ocr === undefined) return couche;

  // Rien ne bat rien. `lisible` répond « oui » pour une page trop courte à juger — c'est ce
  // qu'il faut pour une page de titre, et c'est un piège ici : une couche **vide** passait donc
  // pour lisible et l'emportait sur un OCR de huit cents mots. Une fixture l'a attrapé.
  if (ocr.mots.length === 0) return couche;
  if (couche.mots.length === 0) return ocr;

  // La lisibilité ne tranche qu'entre deux lectures dont on a de quoi juger. En deçà, le
  // critère n'a pas de sens.
  const jugeables = couche.mots.length >= MOTS_MINIMUM && ocr.mots.length >= MOTS_MINIMUM;
  if (jugeables) {
    const coucheLisible = lisible(couche);
    if (coucheLisible !== lisible(ocr)) return coucheLisible ? couche : ocr;
  }

  // Le renversement. La reconnaissance doit avoir **vraiment lu** — assez de mots pour qu'on en
  // juge, et pas deux ordres de grandeur sous la couche, ce qui signerait une image décorative.
  const vraimentLue = ocr.mots.length >= MOTS_MINIMUM && ocr.mots.length >= couche.mots.length * PART_OCR_MINIMALE;
  return vraimentLue ? ocr : couche;
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
