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
 *  ## Ce qui est vrai depuis le 20 octobre 2026
 *
 *  Le Worker a **une personne**, et elle est entrée. Les tables `utilisateur`, `cle_acces`,
 *  `session` et `droit` sont lues et écrites par la cérémonie. Le jeton de service n'ouvre plus
 *  la façade ; il invite, et c'est tout.
 *
 *  La note d'E1 disait que l'exigence dure de SEC-02 — session de quatre-vingt-dix jours,
 *  révocable — « est tenue ». Elle décrivait la **conception**. Elle décrit maintenant ce qui
 *  tourne.
 */

/** Les sessions personnelles sont-elles exigées pour entrer par la façade ?
 *
 *  **Oui, depuis le 20 octobre 2026**, et c'est la bascule du §13 du plan d'E5. Elle n'a pas été
 *  posée sur une intention mais sur une mesure : une clé enrôlée à 07:56:35, puis deux sessions
 *  ouvertes à 07:56:43 et 08:13:06 par signature vérifiée en production. Le jeton de service
 *  cesse ici d'ouvrir les routes de la façade.
 *
 *  Tant qu'elle était fausse, elle était la seule chose qui empêchait qu'une vraie bibliothèque
 *  soit servie derrière un jeton partagé. Ce rôle revient désormais à la session elle-même. */
export const SESSIONS_EXIGEES = true;

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
 *  raison — une règle qu'on doit se rappeler finit par être oubliée le jour où elle compte.
 *
 *  La bascule se passe en **paramètre** depuis le 20 octobre, et non plus en lecture directe de
 *  la constante. Sans cela, la garde devenait inéprouvable le jour même où la constante passait
 *  à vrai : son refus serait resté écrit, plus jamais exécuté, et aucun test n'aurait pu dire ce
 *  qu'il ferait si l'on revenait en arrière. C'est la même raison qui a fait de `sessionsExigees`
 *  une option de `creerApp`. */
export function laFacadePeutServir(cle: string, sessionsExigees: boolean = SESSIONS_EXIGEES): boolean {
  return sessionsExigees || estUneBibliothequeDEssai(cle);
}
