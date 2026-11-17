/** Un seul dossier temporaire pour toute la course, et le suivant balaie ce que le précédent a
 *  laissé.
 *
 *  ## D'où vient ce garde-fou
 *
 *  Du 17 novembre 2026. Les contrôles fabriquent leurs dossiers d'essai sous le dossier
 *  temporaire du système et les suppriment **à la fin de la suite** : donc jamais quand la suite
 *  est arrêtée. Le disque de la machine s'est rempli ce jour-là, au point qu'aucune commande ne
 *  démarrait plus. Relevé le même jour : **plus de deux cents** dossiers oubliés, et surtout
 *  **5,8 Go** en trois cibles de compilation Rust de 1,9 Go chacune.
 *
 *  ## Pourquoi déplacer le dossier temporaire, et non lister les préfixes
 *
 *  Les contrôles nomment leurs dossiers par ce qu'ils éprouvent : le dépôt en porte **plus de
 *  quatre-vingt-dix préfixes différents**, et tous ne commencent pas par le nom du projet.
 *  Balayer par préfixe demanderait donc une liste de quatre-vingt-dix noms à tenir à jour, c'est-à-dire
 *  exactement ce que ce dépôt refuse d'écrire dans du code.
 *
 *  La course pose donc **son propre dossier temporaire** et le dit à ses enfants par
 *  l'environnement. Tout ce qu'ils fabriquent y tombe, quel que soit leur préfixe, sans qu'aucun
 *  contrôle ait à le savoir : `mkdtemp`, `mktemp` et la bibliothèque standard de Rust lisent tous
 *  cette variable. Un seul dossier à effacer, et aucun nom à maintenir.
 *
 *  ## Pourquoi trois variables et non une
 *
 *  Parce que le projet est multiplateforme par conception. `TMPDIR` est lue par Unix, `TEMP` et
 *  `TMP` par Windows ; les trois sont posées ensemble, en **donnée** et non en branche de code.
 */

/** Le préfixe du dossier d'une course. Il nomme le projet pour qu'un balayage ne touche jamais le
 *  dossier temporaire de quelqu'un d'autre. */
export const PREFIXE_DU_BAC = "lienotheque-controle-";

/** Les restes à balayer, parmi les entrées du dossier temporaire du système.
 *
 *  `sauf` est le bac de la course en train de tourner : on ne balaie pas sous ses propres pieds.
 *  Tout ce qui ne porte pas le préfixe est **laissé en place** — le dossier temporaire du système
 *  appartient à tout le monde, et un garde-fou qui y efface large est un défaut, non une parade. */
export function restesABalayer(entrees: readonly string[], sauf: string): readonly string[] {
  return entrees.filter((nom) => nom.startsWith(PREFIXE_DU_BAC) && nom !== sauf);
}

/** Le nom du bac d'une course. Le numéro du processus suffit à les distinguer, et dit laquelle. */
export const nomDuBac = (processus: number): string => `${PREFIXE_DU_BAC}${processus}`;

/** Ce qu'il faut dire aux enfants pour qu'ils écrivent dans le bac, sur les trois systèmes. */
export function variablesDuBac(chemin: string): Readonly<Record<string, string>> {
  return { TMPDIR: chemin, TEMP: chemin, TMP: chemin };
}
