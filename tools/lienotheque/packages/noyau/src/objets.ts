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

/** Les deux familles d'objets, et il n'y en aura pas d'autres sans raison.
 *
 *  `sources` : le fichier déposé, immuable, adressé par son empreinte.
 *  `derives` : ce qu'une version a produit — les images de page, d'abord. */
export type Famille = "sources" | "derives";

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

/** La bibliothèque à qui appartient une clé, si la clé est bien formée.
 *
 *  Sert à vérifier qu'un objet demandé appartient bien à la bibliothèque du jeton — la seule
 *  question qui compte avant de servir un fichier (SEC-05). */
export function bibliothequeDe(cle: string): string | undefined {
  const trouve = /^([a-z0-9][a-z0-9_-]*)\/(sources|derives)\//.exec(cle);
  return trouve?.[1];
}

/** Vrai si cette clé appartient à cette bibliothèque. Comparaison sur la clé **recomposée**,
 *  jamais sur un `startsWith` : « essai-bis/ » commence par « essai » sans lui appartenir. */
export function appartientA(cle: string, bibliotheque: string): boolean {
  return bibliothequeDe(cle) === bibliotheque;
}
