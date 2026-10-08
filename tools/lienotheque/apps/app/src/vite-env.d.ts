/// <reference types="vite/client" />

/** Feuille de jetons générée par @lienotheque/jetons (voir vite.config.ts). */
declare module "virtual:lienotheque-jetons.css";

/** Catalogue des modèles de bibliothèque, lu de `fixtures/modeles` (voir vite.config.ts).
 *  Non typé à dessein : c'est une donnée qui traverse une frontière, donc validée par son
 *  contrat à l'entrée, pas par une promesse du compilateur. */
declare module "virtual:lienotheque-modeles" {
  const catalogue: unknown;
  export default catalogue;
}
