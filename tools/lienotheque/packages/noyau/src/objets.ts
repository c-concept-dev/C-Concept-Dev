import { prefixeDe } from "./hebergement.js";

/** Où un objet vit dans le compartiment, et **le seul endroit qui le décide**.
 *
 *  Pour une base, l'isolation entre bibliothèques est structurelle : une base chacune, aucune
 *  requête ne peut en atteindre deux. Pour les fichiers, elle ne l'est pas — un seul
 *  compartiment, des préfixes —, parce qu'une liaison R2 se déclare au déploiement et qu'un
 *  compartiment par bibliothèque imposerait un redéploiement à chaque création.
 *
 *  **L'isolation des fichiers est donc tenue par le code, et c'est ici.** Tout ce qui compose une
 *  clé passe par ces fonctions, qui partent de la clé de la bibliothèque — jamais d'une valeur
 *  reçue dans une requête. Un test vérifie qu'aucun autre module ne compose de préfixe. */

/** Les trois familles d'objets, et il n'y en aura pas d'autres sans raison.
 *
 *  `sources` : le fichier déposé, immuable, adressé par son empreinte.
 *  `derives` : ce qu'une version a produit — les images de page, d'abord.
 *  `vues`    : ce que les écrans lisent, et qui n'appartient à aucune version.
 *
 *  **La raison de la troisième**, puisque ce fichier en exige une : une vue de bibliothèque
 *  rassemble ce que **toutes** les versions actives donnent à voir. La ranger sous
 *  `derives/<version>/` obligerait à inventer une version qui n'existe pas, et cette version
 *  inventée serait ensuite lue par du code qui croit aux versions. Une famille de plus coûte une
 *  ligne ici et un motif de plus au garde-fou ; une fausse version coûte un malentendu durable.
 *
 *  La version en ligne lit sa vue ici plutôt que de la rebâtir en SQL : `instantane.ts` la
 *  construit déjà, à l'ingestion, et une seconde mise en œuvre serait une seconde vérité — celle
 *  des deux qui finirait par mentir. */
export type Famille = "sources" | "derives" | "vues";

/** Le chemin d'un fichier d'origine : `<clé>/sources/ab/ab12…`.
 *
 *  Adressé par son empreinte, qui est déjà la clé primaire de la table `fichier`. Deux versions
 *  qui partagent un fichier partagent l'objet ; un fichier renommé ne bouge pas ; un objet n'est
 *  jamais réécrit. Les deux premiers caractères font un palier, pour qu'un listing ne rende pas
 *  des dizaines de milliers d'entrées d'un coup. */
export function cleSource(bibliotheque: string, empreinte: string): string {
  return `${prefixeDe(bibliotheque)}sources/${empreinte.slice(0, 2)}/${empreinte}`;
}

/** Le chemin d'un dérivé : `<clé>/derives/<version>/pages/page-0001.webp`. */
export function cleDerive(bibliotheque: string, version: string, nom: string): string {
  return `${prefixeDe(bibliotheque)}derives/${version}/${nom}`;
}

/** Le chemin d'une vue de bibliothèque : `<clé>/vues/bibliotheque.json`.
 *
 *  Pas de palier et pas de version : il y en a une poignée par bibliothèque, et elles sont
 *  remplacées — jamais accumulées — au moment où une version s'active. La vue en ligne est donc
 *  aussi fraîche que la dernière activation, et jamais plus périmée que ce que le bureau montre
 *  lui-même. */
export function cleVue(bibliotheque: string, nom: string): string {
  return `${prefixeDe(bibliotheque)}vues/${nom}`;
}

/** La bibliothèque à qui appartient une clé, si la clé est bien formée.
 *
 *  Sert à vérifier qu'un objet demandé appartient bien à la bibliothèque du jeton — la seule
 *  question qui compte avant de servir un fichier (SEC-05). */
export function bibliothequeDe(cle: string): string | undefined {
  const trouve = /^([a-z0-9][a-z0-9_-]*)\/(sources|derives|vues)\//.exec(cle);
  return trouve?.[1];
}

/** Vrai si cette clé appartient à cette bibliothèque. Comparaison sur la clé **recomposée**,
 *  jamais sur un `startsWith` : « essai-bis/ » commence par « essai » sans lui appartenir. */
export function appartientA(cle: string, bibliotheque: string): boolean {
  return bibliothequeDe(cle) === bibliotheque;
}
