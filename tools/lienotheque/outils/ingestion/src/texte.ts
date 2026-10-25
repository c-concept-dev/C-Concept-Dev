import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PageLue } from "@lienotheque/contrats";
import {
  causeJpegNonDirect,
  estUnEpub,
  formatParSignature,
  objetsPdf,
  octetsImage,
  pagesPdf,
  TAILLE_ENTETE,
} from "@lienotheque/formats";
import { decalageDominant } from "@lienotheque/recettes";
import { decoderJpeg, enGris, versPgm } from "@lienotheque/images";
import { causeLisible } from "@lienotheque/noyau";
import {
  type PageDeTexte,
  couperEnDeux,
  deuxPagesParFeuille,
  lireEpub,
  numerosEnMarge,
  MOTS_MINIMUM,
  lireCoucheTexte,
  lisible,
  lireParOcr,
  pageDeTexte,
  ouvrirRenduPdf,
  type PageRendue,
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

/** Ce que la chaîne lève quand elle reçoit un format dont elle ne sait rien tirer.
 *
 *  ## Le défaut qu'elle corrige
 *
 *  `lireLeTexte` sur un EPUB rendait `InvalidPDFException: Invalid PDF structure.` — mesuré le
 *  20 octobre 2026. La chaîne traitait **tout** comme un PDF, et le message **accusait la
 *  mauvaise cause** : il parlait d'un PDF abîmé là où le fichier n'en est simplement pas un.
 *  Quelqu'un qui le lit cherche un défaut dans son document plutôt que dans notre outillage.
 *
 *  C'est la même exigence que les autres signaux nommés de ce lot — `PasEnLigne`,
 *  `PasIdentifie`, « illisible » distingué de « refusée » : **une impossibilité porte son nom**,
 *  et ce nom dit ce qui manque.
 *
 *  ## Ce qu'elle dit, et ce qu'elle ne promet pas
 *
 *  Elle nomme le format trouvé, parce que c'est ce qui permet d'agir, et le chemin du document,
 *  parce que dans un lot de deux cent cinquante « un EPUB n'est pas lu » oblige sinon à les
 *  rouvrir un par un.
 *
 *  Elle ne promet pas que le format viendra. L'EPUB est l'étape 7 du chemin du texte, et une
 *  promesse dans un message d'erreur est une dette qu'on n'a pas datée. */
export class FormatNonLu extends Error {
  readonly format: string;

  constructor(chemin: string, format: string) {
    super(`La chaîne ne sait pas encore lire ce format (${format}) : ${chemin}`);
    this.name = "FormatNonLu";
    this.format = format;
  }
}

export type OptionsTexte = {
  /** N'en lire que les premières pages : pour essayer, ou pour éprouver. */
  readonly pages?: number | undefined;
  /** La feuille porte deux pages : on la coupe, et chaque moitié devient une page.
   *
   *  **Absent, le document répond lui-même.** La recette le déclarait seule, d'après un classement
   *  en familles qui se trompe sur 64 % d'une famille entière (20 octobre 2026) : un document mal
   *  rangé mêlait alors les textes de deux pages dans un même passage et perdait les trois quarts
   *  de ses numéros imprimés, sans rien signaler. Donné explicitement, ce réglage l'emporte
   *  toujours — c'est ce qui permet d'éprouver les deux positions, et de forcer la main à la
   *  détection si elle se trompe. */
  readonly doublePage?: boolean | undefined;
  /** Appelé après chaque page lue, pour dire où en est le traitement (JOB-03). */
  readonly avancement?: ((faits: number, total: number) => void) | undefined;
  /** Ne pas se fier à la couche, même quand elle est là. Sert à mesurer ce que l'OCR vaut
   *  face à elle, sans quoi on ne saurait jamais laquelle des deux a tort. */
  readonly forcerOcr?: boolean | undefined;
  readonly binaire?: string | undefined;
  readonly langue?: string | undefined;
  readonly tessdata?: string | undefined;
  /** Une panne locale reste attachée à sa page, même quand le repli permet de continuer. */
  readonly surAvertissement?: ((message: string) => void) | undefined;
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

/** Mots assez substantiels pour dire qu'une couche décrit réellement la page.
 *
 * Les compteurs de dette emploient la même unité : une référence bibliographique de vingt
 * fragments, dont beaucoup ne sont que des initiales et signes, ne doit pas masquer les cent
 * mots lisibles de l'image située dessous. */
export function nombreMotsSignificatifs(texte: string): number {
  return texte.match(/[\p{L}']{4,}/gu)?.length ?? 0;
}

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

  // Le format **avant** la lecture, et par le contenu plutôt que par l'extension (FMT-01).
  // Sans cette garde, un EPUB partait chez pdf.js et en revenait avec « Invalid PDF structure »,
  // qui accuse le document au lieu de dire ce qui se passe.
  const format = formatParSignature(donnees.subarray(0, TAILLE_ENTETE));
  if (format?.typeMime === "application/epub+zip") return lireUnEpub(pdf);
  // L'en-tête n'a vu qu'une archive : on consulte sa table avant de renoncer. Un EPUB qui ne
  // range pas son `mimetype` en premier ne se reconnaît qu'ainsi, et le corpus en porte un.
  if (format?.typeMime === "application/zip" && estUnEpub(donnees)) return lireUnEpub(pdf);
  if (format?.typeMime !== "application/pdf") throw new FormatNonLu(pdf, format?.nom ?? "format inconnu");
  const couche = options.forcerOcr === true ? [] : (await lireCoucheTexte(pdf)).pages;

  /** Deux pages sur une feuille ? **Le document le dit mieux que son classement.**
   *
   *  La couche suffit à le voir — un folio est fait de chiffres —, et elle est déjà lue : la
   *  détection ne coûte donc rien de plus. Quand l'appelant tranche, il l'emporte ; c'est à ce
   *  prix que les deux positions restent éprouvables et qu'une détection fautive se corrige à la
   *  main plutôt que de s'imposer.
   *
   *  Sous `forcerOcr`, la couche n'est pas lue et il n'y a rien à regarder : on s'en remet alors
   *  à l'appelant, faute de mieux, plutôt que de prétendre avoir vu. */
  const doublePage = options.doublePage ?? (couche.length > 0 && deuxPagesParFeuille(couche));

  // Le document parsé **une fois**, et réutilisé.
  //
  // `objetsPdf` monte une table de tous les objets du PDF, flux d'images compris. L'appeler dans
  // la boucle des pages reparsait le document entier à chaque page à océriser : sur un livre
  // numérisé de vingt-neuf pages et cinq mégaoctets, vingt-neuf parses complets, chacun retenant
  // tous les flux. Le moteur embarqué y mourait d'un signal après trois minutes et demie, et le
  // parcours complet de l'administrateur ne passait plus.
  const objets = objetsPdf(donnees);
  const pagesDuPdf = pagesPdf(objets);
  const images = imagesParPage(objets);

  // Combien de pages il y a : la couche les compte toutes, même celles qu'elle ne sert pas. Sans
  // couche lue, c'est l'arbre des pages du document qui les compte.
  const total = Math.min(
    couche.length > 0 ? couche.length : pagesPdf(objets).length,
    options.pages ?? Number.POSITIVE_INFINITY,
  );

  let dossier: string | undefined;
  let renduComplet: Awaited<ReturnType<typeof ouvrirRenduPdf>> | undefined;
  const pages: PageDeTexte[] = [];
  /** Les nombres de la marge de chaque page, dans l'ordre des pages. Une page seule ne sait pas
   *  lequel est son folio ; le document, lui, le sait. */
  const candidats: (readonly number[])[] = [];
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
        const pagePdf = pagesDuPdf[rang - 1];
        const numero = images.get(rang);
        const octets = numero === undefined ? undefined : octetsImage(objets, numero);
        let directe: PageLue | undefined;

        // Un flux isolé n'est la page que lorsqu'il est l'unique image de celle-ci. Sur le corpus
        // réel, prendre la première vignette d'une composition pour la page rendait zéro mot et
        // empêchait précisément le repli complet de se déclencher.
        if (pagePdf?.images.length === 1 && octets?.extension === "jpg") {
          const causePreflight = causeJpegNonDirect(octets.octets);
          if (causePreflight !== undefined)
            options.surAvertissement?.(`Page ${rang} : ${causePreflight} ; rendu complet essayé`);
          else
            try {
              dossier ??= mkdtempSync(join(tmpdir(), "lienotheque-texte-"));
              directe = await ocrDuJpeg(octets.octets, rang, dossier, options);
              // Quand la couche est faible, quelques mots trouvés dans l'image isolée peuvent
              // n'être qu'une figure ou un décor. Le rendu complet est alors la seule lecture de
              // toute la page. Si la couche est déjà jugeable, la comparaison habituelle suffit.
              if (nombreMotsSignificatifs(deLaCouche?.mots.map((mot) => mot.texte).join(" ") ?? "") >= MOTS_MINIMUM)
                return directe;
              options.surAvertissement?.(
                `Page ${rang} : couche insuffisante ; rendu complet essayé après le JPEG isolé (${directe.mots.length} mots)`,
              );
            } catch (cause) {
              // Les flux connus pour terminer le processus sont écartés avant ce point. Une
              // erreur ordinaire reste locale et le rendu complet prend le relais.
              options.surAvertissement?.(
                `Page ${rang} : décodage direct du JPEG refusé (${causeLisible(cause)}) ; rendu complet essayé`,
              );
            }
        }

        // Flate, JPX, plusieurs images : aucun flux isolé n'est la page. Le rendu de la page
        // entière est le seul chemin fidèle. Une page purement native sans image garde sa couche
        // et ne paie pas une reconnaissance inutile.
        const coucheInsuffisante =
          nombreMotsSignificatifs(deLaCouche?.mots.map((mot) => mot.texte).join(" ") ?? "") < MOTS_MINIMUM;
        // « Aucune image détectée » ne signifie pas toujours « page native » : les objets
        // compressés de treize PDF réels échappent au lecteur structurel, alors que pdf.js rend
        // parfaitement leur page. Une couche pauvre déclenche donc le rendu complet. En revanche,
        // `forcerOcr` est un banc explicite : sans image vue, il doit continuer à dire qu'il n'a
        // rien pu océriser, conformément à son contrat de mesure.
        if ((pagePdf?.images.length ?? 0) === 0 && (options.forcerOcr === true || !coucheInsuffisante)) return undefined;
        try {
          dossier ??= mkdtempSync(join(tmpdir(), "lienotheque-texte-"));
          renduComplet ??= await ouvrirRenduPdf(pdf);
          const pixels = await renduComplet.page(rang, 1800);
          return ocrDesPixels(pixels, rang, dossier, options);
        } catch (cause) {
          options.surAvertissement?.(`Page ${rang} : rendu complet impossible (${causeLisible(cause)})`);
          return directe;
        }
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
      const moities = doublePage ? couperEnDeux(lue) : [lue];
      moities.forEach((moitie, cote) => {
        const index = doublePage ? (rang - 1) * 2 + cote + 1 : rang;
        pages.push({ ...pageDeTexte(moitie), index });
        // Les candidats de la marge, gardés dans le même ordre que les pages : c'est tout ce
        // qu'il faut pour trancher ensuite, et cela ne retient aucun pixel.
        candidats.push(numerosEnMarge(moitie));
      });

      options.avancement?.(rang, total);
    }
  } finally {
    await renduComplet?.fermer();
    if (dossier !== undefined) rmSync(dossier, { recursive: true, force: true });
  }

  // Le folio, tranché sur tout le document plutôt que page par page.
  //
  // On ne remplace la lecture locale que si le vote **a dit quelque chose** : sur un document
  // trop court pour voter, ou sans aucun folio, le vote se tait et ce que chaque page a trouvé
  // seule reste la meilleure réponse disponible.
  //
  // Quand il parle, en revanche, il l'emporte **y compris pour effacer** un numéro : une page
  // dont le seul nombre de marge ne tient pas le décalage portait un numéro de partie ou un
  // appel de note, et `numeroImprime` l'avait pris pour un folio. Mieux vaut pas de numéro qu'un
  // faux (RCH-09).
  const folios = foliosDuDocument(candidats);
  const voteAParle = folios.some((folio) => folio !== undefined);
  const numerotees = !voteAParle
    ? pages
    : pages.map((page, rang) => {
        const folio = folios[rang];
        const { pageImprimee: _ignore, ...sansNumero } = page;
        return folio === undefined ? sansNumero : { ...sansNumero, pageImprimee: folio };
      });

  return { pages: numerotees, parLaCouche, parOcr, sansTexte };
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

/** Un EPUB, rendu sous la même forme que le reste de la chaîne attend.
 *
 *  ## Ce qu'un feuillet occupe comme place
 *
 *  Un EPUB n'a pas de pages — aucun du corpus ne porte de pagination d'édition imprimée, mesuré
 *  le 20 octobre 2026. Le **feuillet** tient donc lieu de rang, et `pageImprimee` reste
 *  **absent** : le contrat le prévoit déjà, et `citerPage` dit alors « passage 47 du document »
 *  plutôt qu'un numéro que le livre ne porte pas.
 *
 *  ## La langue du livre, et non celle de la bibliothèque
 *
 *  Elle n'est pas employée ici — un EPUB n'a rien à océriser — mais elle est **rendue**, parce
 *  que c'est le livre qui la sait : l'un des quatre EPUB sondés est en anglais dans une
 *  bibliothèque française. Ce que la bibliothèque déclare vaut pour sa collection, pas pour
 *  chacun de ses livres.
 *
 *  ## Les comptes
 *
 *  Tous les feuillets viennent du texte d'origine : ils comptent donc comme servis par la
 *  couche, et jamais par une reconnaissance qui n'a pas eu lieu. Annoncer autre chose
 *  fausserait la seule mesure qui dit d'où le texte vient. */
async function lireUnEpub(chemin: string): Promise<TexteDuDocument> {
  const livre = await lireEpub(chemin);
  const pages: PageDeTexte[] = livre.feuillets.map((feuillet) => ({
    index: feuillet.rang,
    texte: feuillet.texte,
    source: "couche_texte" as const,
    // Le chapitre suit jusqu'au dépôt : « feuillet 162 » ne situe rien pour un lecteur, et c'est
    // lui qui le situe. Il ne sert jamais à citer — voir `Passage.emplacement`.
    emplacement: feuillet.chapitre,
    mots: [],
  }));
  return { pages, parLaCouche: pages.length, parOcr: 0, sansTexte: 0 };
}

/** Sous combien de pages un décalage ne se vote pas.
 *
 *  Deux ou trois pages ne disent rien : le « plus fréquent » y serait un tirage au sort déguisé,
 *  et il emporterait tout le document. */
const PAGES_POUR_VOTER = 4;

/** Sur quelle part des pages un décalage doit s'appuyer pour l'emporter, et sur combien au moins.
 *
 *  **Un « plus fréquent » tiré d'une seule voix n'est pas une majorité.** Attrapé par une fixture :
 *  une feuille qui ne porte qu'un folio, coupée en deux, donne un folio toutes les deux pages ; le
 *  décalage change alors à chaque fois — 1−1, 2−3, 3−5 — et aucun ne revient. Le vote aurait
 *  retenu le premier venu et effacé les numéros justes que chaque page avait trouvés seule.
 *
 *  Un vrai folio, lui, s'appuie sur la quasi-totalité des pages : sur le livre ordinaire mesuré le
 *  20 octobre, plus de la moitié d'un coup. Un cinquième des pages est donc large, et trois pages
 *  au moins écartent les documents où la proportion seule ne voudrait rien dire. */
const PART_DE_L_APPUI = 0.2;
const APPUI_MINIMUM = 3;

/** Le folio de chaque page, tranché en regardant **tout le document** (RCH-09, BAS-02).
 *
 *  ## Ce qu'une page seule ne peut pas savoir
 *
 *  `numeroImprime` refuse de trancher entre deux nombres de la marge, et c'est juste : une page
 *  n'a aucun moyen de dire lequel est son folio. Mesuré le 20 octobre 2026 sur un livre ordinaire
 *  de 173 pages, cela coûtait **39 % des numéros** — toutes les pages portaient un nombre, 67 en
 *  portaient plusieurs.
 *
 *  ## Ce que le document dit, et qu'aucune page ne dit
 *
 *  **Un folio progresse.** Il avance d'un en un avec le rang de la feuille ; un titre courant
 *  numéroté, un appel de note, une année ne le font pas. On vote donc le **décalage** — la
 *  différence entre le nombre lu et le rang — sur tout le document, et l'on retient page par page
 *  le candidat qui s'y tient.
 *
 *  Le vote n'est pas réécrit : `decalageDominant` existe depuis le 4 octobre pour le chemin des
 *  images, et c'est la même question. Deux votes pour une même question finissent par ne plus
 *  dire la même chose.
 *
 *  ## Ce qu'elle n'invente pas
 *
 *  Une page dont aucun candidat ne tient le décalage reste **sans numéro**. C'est la règle
 *  d'origine et elle ne bouge pas : « ne rien rendre est une réponse, et la bonne » — une citation
 *  renvoyée à la mauvaise page est pire qu'une citation renvoyée à un rang assumé comme tel.
 */
export function foliosDuDocument(parPage: readonly (readonly number[])[]): readonly (number | undefined)[] {
  if (parPage.length < PAGES_POUR_VOTER) return parPage.map(() => undefined);

  // Chaque candidat de chaque page vote pour son décalage. Le folio en apporte un par page, et
  // toujours le même ; ses voisins en apportent d'épars, qui ne se regroupent pas.
  const decalages: number[] = [];
  parPage.forEach((candidats, rang) => {
    for (const candidat of candidats) decalages.push(candidat - (rang + 1));
  });

  const decalage = decalageDominant(decalages);
  if (decalage === undefined) return parPage.map(() => undefined);

  // L'appui : combien de pages portent réellement ce décalage. `decalageDominant` rend toujours
  // une réponse — c'est son contrat, « il faut une réponse » —, et c'est ici qu'on décide si elle
  // vaut d'être suivie.
  const retenus = parPage.map((candidats, rang) => candidats.find((candidat) => candidat - (rang + 1) === decalage));
  const appui = retenus.filter((folio) => folio !== undefined).length;
  if (appui < Math.max(APPUI_MINIMUM, parPage.length * PART_DE_L_APPUI)) return parPage.map(() => undefined);

  return retenus;
}

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
async function ocrDuJpeg(jpeg: Buffer, rang: number, dossier: string, options: OptionsTexte): Promise<PageLue> {
  return ocrDesPixels(await decoderJpeg(jpeg), rang, dossier, options);
}

async function ocrDesPixels(imageRendue: PageRendue, rang: number, dossier: string, options: OptionsTexte): Promise<PageLue> {
  const image = enGris(imageRendue);
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
