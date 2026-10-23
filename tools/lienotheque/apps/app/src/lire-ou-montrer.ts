/** Montrer les pages d'un document, ou lire son texte : lequel des deux écrans sert ce document.
 *
 *  ## Ce que la question recouvre, mesuré le 22 octobre 2026
 *
 *  Un document **numérisé** porte une image par page : ses pages couvrent son texte, à peu de
 *  chose près — le contrat des passages le dit, « un passage par page », mesuré à 1,02. Le
 *  Lecteur est fait pour lui.
 *
 *  Un document **composé en texte** n'a aucune image de page. L'écran de lecture du texte est
 *  fait pour lui, et il s'ouvre déjà quand la vue n'a aucune page.
 *
 *  **Entre les deux, il y a un cas qu'on ne voyait pas**, et il touche 41 documents sur 243 de la
 *  bibliothèque réimportée : un document composé en texte dont **la couverture** est une image.
 *  La chaîne en tire une page — une seule —, la vue en porte une, et le Lecteur montre donc une
 *  couverture, seule, pendant que 231 passages de texte dorment derrière elle.
 *
 *  | document | pages | passages |
 *  |---|---:|---:|
 *  | l'un | **1** | 231 |
 *  | un autre | **3** | 289 |
 *  | un troisième | **1** | 109 |
 *
 *  Les titres ne sont pas écrits ici : ce sont des ouvrages d'un domaine, et aucun mot de
 *  domaine n'entre dans le code générique (CLA-01). Les chiffres suffisent à la démonstration.
 *
 *  ## Le critère, et pourquoi celui-là
 *
 *  Des pages qui ne couvrent pas la moitié du texte ne sont pas le document : ce sont des
 *  illustrations qu'il contient. Le rapport n'a rien d'un réglage fin — un livre numérisé est à
 *  peu près à un, ces documents-ci sont à un sur cent ou à un sur deux cent trente. Aucun cas
 *  réel ne s'est présenté entre les deux.
 *
 *  On ne jette rien : les pages restent dans la vue, et l'écran de texte dit qu'elles existent.
 *  On choisit seulement **par où l'on entre**. */

/** En deçà de cette part, les pages ne couvrent pas le document : elles l'illustrent. */
export const COUVERTURE_MINIMALE = 0.5;

/** Deux nombres suffisent, et c'est délibéré : cette règle ne lit aucune page ni aucun passage,
 *  elle les compte. Lui demander les objets entiers obligerait chaque épreuve à en fabriquer de
 *  complets pour une décision qui n'en regarde pas un seul champ. */
export function parOuLire(pages: number, passages: number): "pages" | "texte" {
  // Sans texte lu, il n'y a rien d'autre à proposer que ce qu'on a — fût-ce une seule image.
  if (passages === 0) return "pages";
  if (pages === 0) return "texte";
  return pages >= passages * COUVERTURE_MINIMALE ? "pages" : "texte";
}

/** Les pages existent-elles sans couvrir le document ? C'est ce que l'écran de texte doit dire :
 *  « ce document n'a qu'une image, sa couverture », et non « il n'a aucune page ». */
export const quelquesImagesSeulement = (pages: number, passages: number): boolean =>
  pages > 0 && parOuLire(pages, passages) === "texte";
