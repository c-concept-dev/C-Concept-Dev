/** Qui ouvre quoi — **quatre portes, et aucune route n'en accepte deux** (SEC-02, SEC-03, SEC-05).
 *
 *  | route | porte |
 *  |---|---|
 *  | les quatre de la façade | **session personnelle** |
 *  | `/vision`, `/vision/jetons`, `PUT /vue/…`, `/amorce/defi` | **jeton de service** — machine à machine |
 *  | `/fichier/:laissez` | **laissez-passer signé** |
 *  | `/amorce` | **l'invitation** — le défi lui-même, émis par le jeton |
 *  | `/sante` | aucune : elle ne dit que le nom et la version du service |
 *
 *  La quatrième est née d'un défaut : les deux routes d'amorçage exigeaient le jeton, et aucune
 *  page ne pouvait donc les franchir — un navigateur n'a pas le droit de le porter. Le jeton
 *  invite, l'invitation entre. Une invitation est engendrée par le secret ; elle n'est jamais le
 *  secret. Voir `docs/decisions.md`.
 *
 *  Deux portes pour deux usages est légitime ; **une route qui accepterait l'une ou l'autre ne
 *  l'est pas** — on aurait alors deux serrures et une seule vérifiée.
 *
 *  ## Ce qui est vrai aujourd'hui, et qu'il ne faut pas se raconter autrement
 *
 *  Le Worker n'a **aucune personne**. Les tables `utilisateur`, `cle_acces`, `session` et
 *  `droit` existent depuis la migration 2 du registre et ne sont lues ni écrites par rien ; la
 *  logique des droits (`@lienotheque/noyau`, `droits.ts`) est écrite, testée, et appelée nulle
 *  part. Un jeton de service unique ouvre la façade, pour tout le monde.
 *
 *  La note d'E1 dit que l'exigence dure de SEC-02 — session de quatre-vingt-dix jours,
 *  révocable — « est tenue ». Elle décrit la **conception** : la session est spécifiée, elle
 *  n'est pas vivante.
 */

/** Les sessions personnelles sont-elles exigées pour entrer par la façade ?
 *
 *  **Non, et pas encore.** Cette valeur passera à vrai quand la cérémonie existera (étape 4.4),
 *  et le jeton de service cessera alors d'ouvrir les routes de la façade.
 *
 *  Tant qu'elle est fausse, elle est la seule chose qui empêche qu'une vraie bibliothèque soit
 *  servie derrière un jeton partagé. */
export const SESSIONS_EXIGEES = false;

/** Cette bibliothèque est-elle une bibliothèque d'essai ?
 *
 *  Deux noms désignent la même chose et ne s'écrivent pas pareil : la base D1 s'appelle
 *  `lienotheque-essai`, la clé qu'elle porte au registre s'appelle `essai`. Le Worker ne connaît
 *  que la seconde, le script de préparation ne connaît que la première — d'où les deux formes
 *  acceptées ici, et une seule règle.
 *
 *  Le mot doit **finir** le nom : `essai-reel` n'est pas une bibliothèque d'essai, et une règle
 *  qui se contenterait de le contenir laisserait passer exactement ce qu'elle doit arrêter. */
export function estUneBibliothequeDEssai(cle: string): boolean {
  return cle === "essai" || cle.endsWith("-essai");
}

/** La façade a-t-elle le droit de servir cette bibliothèque, en l'état du système ?
 *
 *  Tant que personne n'est identifié, elle ne sert qu'une bibliothèque d'essai. La règle vit
 *  ici plutôt que dans l'attention de qui pose un réglage : `preparer-essai.ts` fait déjà de
 *  même en refusant toute base dont le nom ne finit pas par « -essai », et pour la même
 *  raison — une règle qu'on doit se rappeler finit par être oubliée le jour où elle compte. */
export function laFacadePeutServir(cle: string): boolean {
  return SESSIONS_EXIGEES || estUneBibliothequeDEssai(cle);
}
