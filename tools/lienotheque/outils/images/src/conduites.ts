import type { Boite, ImageGrise } from "./pixels.js";

/** Les conduites de points, et pourquoi elles font dérailler une lecture (FMT-04).
 *
 *  Une conduite de points est la file de points qui relie un intitulé à son numéro, dans un
 *  sommaire, une table, un index, un bordereau. C'est un procédé **typographique** : elle ne
 *  porte aucune information, elle guide l'œil d'un bout de la ligne à l'autre.
 *
 *  La reconnaissance, elle, ne sait pas cela. Elle voit une suite de petites taches encrées sur
 *  la même ligne que le mot, les agglomère au mot, et rend un jeton qu'aucun modèle de langue ne
 *  reconnaît. Mesuré le 29 octobre 2026 sur une page parfaitement nette d'un livre du corpus :
 *  « Workout 6 » y ressortait « WIGHKOU OSS aa BP ee, ». Les chiffres, eux, loin des points,
 *  survivaient — ce qui rendait le résultat crédible au premier coup d'œil.
 *
 *  Quatre autres causes ont été éprouvées et écartées sur cette même page, chacune seule, toutes
 *  conditions égales par ailleurs : le modèle de langue, la résolution, la couleur, la
 *  segmentation. Aucune ne changeait quoi que ce soit. La conduite couverte de blanc, la ligne se
 *  lit entière et sans faute.
 *
 *  ## Ce que ce module ne fait pas
 *
 *  Il n'interprète rien et ne nomme aucune sorte de document. Il reconnaît une **forme** — une
 *  file de petites taches **de même taille**, régulièrement espacées, qui **traverse** sa ligne
 *  — et il l'efface.
 *
 *  Les deux derniers mots en gras ont été payés. Une première version ne demandait que « petites
 *  pour leur bande » : sur une page de musique, une bande encrée fait tout un système — 152
 *  pixels —, et une tête de note de 34 pixels y passe pour petite. Le contrôle de non-régression
 *  sur les 116 pages du livre a rendu 4 pages améliorées contre **20 dégradées**. Une mesure de
 *  ce qui séparait les vraies conduites des fausses a donné les deux critères qui manquaient. Un sommaire, un bordereau de livraison et un menu la portent
 *  de la même façon ; aucun des trois n'a besoin d'être reconnu pour que cela marche (CLA-01). */

/** En deçà de combien de points de suite on n'a pas affaire à une conduite.
 *
 *  Six, et la raison est simple : trois points sont des points de suspension, et ils se lisent.
 *  Une conduite en porte des dizaines — vingt à quarante sur la page mesurée. Six laisse une
 *  marge large sans jamais descendre jusqu'à l'ellipse. */
export const POINTS_MINIMUM = 6;

/** Quelle part de la hauteur d'une ligne un point peut occuper, au plus.
 *
 *  Un point d'une fonte ordinaire fait entre un dixième et un cinquième de la hauteur de sa
 *  ligne. Un chiffre, une lettre, une tête de note en occupent la moitié ou plus. Le tiers
 *  sépare les deux familles sans rogner ni l'une ni l'autre — et c'est lui qui empêche d'effacer
 *  un contenu réel en le prenant pour un guide. */
const PART_DU_POINT = 1 / 3;

/** De combien les taches d'une conduite peuvent différer de taille entre elles.
 *
 *  **Une conduite est un seul signe répété.** Ses taches sont donc identiques à la numérisation
 *  près, et c'est ce qui la distingue le plus sûrement d'une suite de petits signes qui se
 *  trouvent voisins. Relevé le 29 octobre 2026 : sur deux vraies conduites, les largeurs vont de
 *  3 à 4 pixels et les hauteurs de 4 à 6 — un rapport de 1,3 et de 1,5. Sur les trois fausses
 *  détections d'une page de musique, les largeurs vont de 10 à 22 et les hauteurs de 4 à 38 —
 *  un rapport de 2,2 et de 9,5. Le double sépare les deux familles sans frôler ni l'une ni
 *  l'autre. */
const RAPPORT_DE_TAILLE = 2;

/** Quelle part de la largeur de la page une conduite doit couvrir au moins.
 *
 *  Le second critère, et le plus robuste des deux : **une conduite traverse sa ligne**, c'est à
 *  cela qu'elle sert. Relevé sur les mêmes pages : les vraies couvrent de 21 % à 74 % de la
 *  largeur — 21 % étant le cas d'un tableau à deux colonnes, où chacune n'en a que la moitié à
 *  traverser. Les fausses couvrent 5,3 %, 6,7 % et 7,0 %. Douze pour cent laisse une marge
 *  confortable des deux côtés.
 *
 *  C'est aussi lui qui rend la minorité de points presque superflue : six points au pas d'une
 *  trentaine de pixels ne couvrent pas douze pour cent d'une page. Les deux se gardent quand
 *  même — l'un dit ce qu'est une file, l'autre ce qu'est une traversée. */
const PART_DE_LA_LARGEUR = 0.12;

/** De combien les espacements d'une conduite peuvent varier et rester une conduite.
 *
 *  Une conduite est **posée au pas régulier** par la composition : c'est sa signature, et c'est
 *  ce qui la distingue d'une suite de petits signes qui se trouvent voisins. La numérisation,
 *  l'inclinaison et le seuillage introduisent du jeu ; un tiers l'absorbe sans accepter
 *  l'irrégulier. */
const ECART_TOLERE = 1 / 3;

/** Sous quel ton un pixel compte comme encré. Le même que partout ailleurs dans ce paquet. */
const SEUIL_ENCRE = 128;

/** Une conduite trouvée : la bande de la ligne, et la portée des points sur cette bande. */
export type ConduiteDePoints = Boite;

/** Les bandes de rangées encrées, qui sont les lignes de texte de la page.
 *
 *  Une rangée entièrement blanche sépare deux lignes. On ne cherche pas mieux : il ne s'agit pas
 *  de segmenter la page pour la lire — la reconnaissance le fera — mais de savoir sur quelle
 *  hauteur juger de la taille d'un point. */
function bandesEncrees(image: ImageGrise, seuil: number): { readonly haut: number; readonly bas: number }[] {
  const bandes: { haut: number; bas: number }[] = [];
  let debut = -1;
  for (let y = 0; y < image.hauteur; y += 1) {
    let encree = false;
    const rangee = y * image.largeur;
    for (let x = 0; x < image.largeur; x += 1)
      if (image.pixels[rangee + x]! < seuil) {
        encree = true;
        break;
      }
    if (encree && debut < 0) debut = y;
    else if (!encree && debut >= 0) {
      bandes.push({ haut: debut, bas: y - 1 });
      debut = -1;
    }
  }
  if (debut >= 0) bandes.push({ haut: debut, bas: image.hauteur - 1 });
  return bandes;
}

/** Les taches d'une bande, de gauche à droite : leur portée horizontale et leur hauteur encrée.
 *
 *  Une tache est une suite de colonnes encrées sans interruption. Deux lettres qui se touchent
 *  n'en font qu'une, et c'est sans importance : on ne cherche que les **petites**, et une tache
 *  qui en agglomère deux n'est plus petite. */
function tachesDeLaBande(
  image: ImageGrise,
  haut: number,
  bas: number,
  seuil: number,
): { gauche: number; droite: number; hauteurEncree: number }[] {
  const taches: { gauche: number; droite: number; hauteurEncree: number }[] = [];
  let gauche = -1;
  let plusHaut = bas;
  let plusBas = haut;
  for (let x = 0; x <= image.largeur; x += 1) {
    let encree = false;
    let colonneHaut = bas;
    let colonneBas = haut;
    if (x < image.largeur)
      for (let y = haut; y <= bas; y += 1)
        if (image.pixels[y * image.largeur + x]! < seuil) {
          encree = true;
          if (y < colonneHaut) colonneHaut = y;
          if (y > colonneBas) colonneBas = y;
        }
    if (encree) {
      if (gauche < 0) {
        gauche = x;
        plusHaut = colonneHaut;
        plusBas = colonneBas;
      } else {
        if (colonneHaut < plusHaut) plusHaut = colonneHaut;
        if (colonneBas > plusBas) plusBas = colonneBas;
      }
    } else if (gauche >= 0) {
      taches.push({ gauche, droite: x - 1, hauteurEncree: plusBas - plusHaut + 1 });
      gauche = -1;
    }
  }
  return taches;
}

/** Les conduites de points d'une page, mesurées sur ses pixels.
 *
 *  Rien n'est déduit : chaque conduite rendue est une suite d'au moins `POINTS_MINIMUM` taches
 *  réellement présentes, toutes assez petites pour la hauteur de leur ligne, et posées au pas
 *  régulier. Une page qui n'en porte pas rend un tableau vide, et le reste de la chaîne ne voit
 *  aucune différence. */
export function conduitesDePoints(image: ImageGrise, seuil = SEUIL_ENCRE): ConduiteDePoints[] {
  const conduites: ConduiteDePoints[] = [];
  for (const bande of bandesEncrees(image, seuil)) {
    const hauteur = bande.bas - bande.haut + 1;
    const plafond = Math.max(2, hauteur * PART_DU_POINT);
    const taches = tachesDeLaBande(image, bande.haut, bande.bas, seuil);

    let suite: typeof taches = [];
    const clore = (): void => {
      if (suite.length < POINTS_MINIMUM) return;
      const premier = suite[0]!;
      const dernier = suite[suite.length - 1]!;
      const portee = dernier.droite - premier.gauche + 1;

      // Une conduite traverse sa ligne. Une poignée de signes voisins ne la traverse pas.
      if (portee < image.largeur * PART_DE_LA_LARGEUR) return;

      // Et elle est faite d'un seul signe répété : ses taches se ressemblent. C'est ce qui la
      // sépare d'une suite de têtes de notes, qui sont petites pour leur portée mais inégales.
      const largeurs = suite.map((tache) => tache.droite - tache.gauche + 1);
      const hauteurs = suite.map((tache) => tache.hauteurEncree);
      const uniforme = (valeurs: readonly number[]): boolean =>
        Math.max(...valeurs) <= Math.min(...valeurs) * RAPPORT_DE_TAILLE;
      if (!uniforme(largeurs) || !uniforme(hauteurs)) return;

      conduites.push({ x: premier.gauche, y: bande.haut, l: portee, h: hauteur });
    };

    for (const tache of taches) {
      const petite = tache.droite - tache.gauche + 1 <= plafond && tache.hauteurEncree <= plafond;
      if (!petite) {
        clore();
        suite = [];
        continue;
      }
      // Le pas se juge sur les deux derniers écarts : une conduite garde le sien d'un bout à
      // l'autre, et le perdre signale qu'on a changé d'objet même si les taches restent petites.
      if (suite.length >= 2) {
        const avant = suite[suite.length - 1]!;
        const encoreAvant = suite[suite.length - 2]!;
        const pas = avant.gauche - encoreAvant.gauche;
        const nouveau = tache.gauche - avant.gauche;
        if (pas <= 0 || Math.abs(nouveau - pas) > pas * ECART_TOLERE) {
          clore();
          suite = [avant, tache];
          continue;
        }
      }
      suite.push(tache);
    }
    clore();
  }
  return conduites;
}

/** La même page, ses conduites de points couvertes de blanc.
 *
 *  **Rien d'autre n'est touché**, et la page est rendue telle quelle quand elle n'en porte
 *  aucune : on ne recopie sept millions de pixels que lorsqu'il y a quelque chose à effacer.
 *
 *  Effacer plutôt que relire en morceaux : une conduite ne porte aucune information, et la
 *  recoller après coup redemanderait de savoir ce qu'est une ligne — ce que ce module se garde
 *  précisément de prétendre savoir. */
export function sansConduitesDePoints(image: ImageGrise, seuil = SEUIL_ENCRE): ImageGrise {
  const conduites = conduitesDePoints(image, seuil);
  if (conduites.length === 0) return image;
  const pixels = Uint8Array.from(image.pixels);
  for (const conduite of conduites)
    for (let y = conduite.y; y < conduite.y + conduite.h; y += 1)
      pixels.fill(255, y * image.largeur + conduite.x, y * image.largeur + conduite.x + conduite.l);
  return { largeur: image.largeur, hauteur: image.hauteur, pixels };
}
