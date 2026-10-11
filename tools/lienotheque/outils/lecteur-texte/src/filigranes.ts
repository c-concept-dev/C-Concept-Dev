import type { Passage } from "@lienotheque/contrats";

/** Les adresses qui reviennent sur chaque page : des filigranes, pas du contenu (FMT-04).
 *
 *  Un ouvrage du corpus porte `http://doctidoc2.blogspot.com` sur ses **1 275 pages**, déposé
 *  par le site qui l'a numérisé. Sans contrôle, cette adresse entre dans l'index comme un
 *  passage à part entière, sur chaque page de chaque document venu de la même source — et une
 *  recherche sur son nom rendrait la bibliothèque entière.
 *
 *  **Ce contrôle signale, il ne retire rien.** Retirer du texte, c'est changer l'extrait exact
 *  que RCH-07 promet de rendre, et la décision n'appartient pas au lecteur : un pied de page
 *  portant l'adresse de l'auteur est un tampon qu'on veut peut-être garder.
 */

export type AdresseRecurrente = {
  readonly adresse: string;
  /** Sur combien de pages elle apparaît — des pages, non des occurrences. */
  readonly pages: number;
  /** Part des pages du document. C'est elle qui distingue un tampon d'une citation. */
  readonly part: number;
};

/** Au-delà de quelle part des pages une adresse est un tampon et non du contenu.
 *
 *  Mesuré sur le corpus : **100,0 %** pour le tampon du numériseur, **7,5 %** pour un pied de
 *  diapositive portant l'adresse de l'auteur, **1,1 %** pour une référence citée dans le texte.
 *  La moitié des pages tient loin des trois, et ne rase aucun cas légitime connu.
 *
 *  Un seuil bas signalerait les pieds de page et les références, et le contrôle deviendrait du
 *  bruit qu'on finit par ignorer — ce qui vaut moins qu'aucun contrôle. */
export const PART_FILIGRANE = 0.5;

/** URL ou adresse de courriel. Les deux servent de tampon, et se traitent pareil. */
const ADRESSE = /(?:https?:\/\/|www\.)[^\s]{4,}|[\w.+-]+@[\w-]+\.[\w.]{2,}/gi;

/** Retire la ponctuation de bord : sans cela, « tampon.test. », « (tampon.test) » et
 *  « tampon.test, » se comptent en trois adresses distinctes, chacune sous le seuil. */
const nettoyer = (adresse: string): string => adresse.toLowerCase().replace(/^[([<"']+|[).,;:!?\]>"']+$/g, "");

/** Les adresses qui reviennent sur assez de pages pour être des tampons, les plus fréquentes
 *  d'abord. Vide quand il n'y a rien à signaler, ce qui est le cas ordinaire.
 */
export function adressesRecurrentes(passages: readonly Passage[]): readonly AdresseRecurrente[] {
  if (passages.length === 0) return [];

  // Un ensemble par page : un tampon imprimé deux fois sur la même page reste une page.
  const parAdresse = new Map<string, number>();
  for (const passage of passages) {
    const surCettePage = new Set<string>();
    for (const brute of passage.texte.match(ADRESSE) ?? []) {
      const adresse = nettoyer(brute);
      if (adresse.length >= 6) surCettePage.add(adresse);
    }
    for (const adresse of surCettePage) parAdresse.set(adresse, (parAdresse.get(adresse) ?? 0) + 1);
  }

  return [...parAdresse.entries()]
    .map(([adresse, pages]) => ({ adresse, pages, part: pages / passages.length }))
    .filter((trouvee) => trouvee.part >= PART_FILIGRANE)
    .sort((a, b) => b.pages - a.pages || a.adresse.localeCompare(b.adresse));
}
