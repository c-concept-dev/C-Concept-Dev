import { creerApp } from "./app.js";

/** Le point d'entrée du Worker, et **rien d'autre**.
 *
 *  Ce module n'exporte que son gestionnaire, délibérément. Il réexportait aussi `creerApp`,
 *  `SERVICE`, `VERSION` et `CAPACITES` — des valeurs commodes à importer depuis un test — et le
 *  jour où le Worker s'est mis à servir la page, le moteur a refusé de démarrer :
 *
 *      Incorrect type for map entry 'SERVICE': the provided value is not of type
 *      'function or ExportedHandler'.
 *
 *  Avec des ressources déclarées, workerd lit les exports nommés du module d'entrée comme autant
 *  de points d'entrée possibles. Une chaîne de caractères n'en est pas un.
 *
 *  Ce qu'un test veut importer, il l'importe donc de `app.js`, où c'est écrit. */
export default { fetch: creerApp().fetch };
