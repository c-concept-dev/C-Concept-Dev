import { creerApp } from "./app.js";

export { creerApp, CAPACITES, SERVICE, VERSION } from "./app.js";

/** Point d'entrée d'un environnement « fetch » (Workers, Deno, Bun, Node 22+).
 *  Aucun déploiement au lot 0 : ce fichier n'est lancé que par les tests. */
export default { fetch: creerApp().fetch };
