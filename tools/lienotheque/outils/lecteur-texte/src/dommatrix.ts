import { createRequire } from "node:module";

/** Dépannage de `DOMMatrix` pour le moteur embarqué (PLT-02).
 *
 *  pdfjs évalue `const SCALE_MATRIX = new DOMMatrix();` au chargement de son module de rendu.
 *  C'est une **constante de module** : il suffit qu'elle existe pour que l'import aboutisse, et
 *  l'extraction de texte ne s'en sert jamais. Dans le dépôt, pdfjs la prend de `@napi-rs/canvas`,
 *  présent sous `node_modules`. Le moteur embarqué, lui, est un fichier unique sans
 *  `node_modules` : deux documents sur sept y échouaient sur « DOMMatrix is not defined », dont
 *  un après avoir atteint cent pour cent.
 *
 *  L'autre solution était d'embarquer `@napi-rs/canvas` — vingt-cinq mégaoctets de Skia pour une
 *  matrice jamais utilisée. Mesuré avant de choisir.
 *
 *  **Ce dépannage ne calcule rien, et c'est le point entier.** Une matrice à moitié juste
 *  rendrait des coordonnées fausses sans prévenir, et une ancre fausse est pire qu'une ancre
 *  absente (ANC-01). Toute opération refuse donc de répondre : si le rendu canvas est un jour
 *  exercé dans le moteur, il s'arrête net et dit ce qu'il faut embarquer.
 */

const REFUS = "Le moteur embarqué ne sait pas calculer de transformations : il n’a pas de moteur de rendu. Embarquez « @napi-rs/canvas » si un rendu est nécessaire.";

const refuser = (): never => {
  throw new Error(REFUS);
};

/** Une identité, et rien d'autre. Les noms courts et longs, parce que pdfjs lit les deux. */
export class MatriceIdentite {
  readonly a = 1;
  readonly b = 0;
  readonly c = 0;
  readonly d = 1;
  readonly e = 0;
  readonly f = 0;
  readonly m11 = 1;
  readonly m12 = 0;
  readonly m13 = 0;
  readonly m14 = 0;
  readonly m21 = 0;
  readonly m22 = 1;
  readonly m23 = 0;
  readonly m24 = 0;
  readonly m31 = 0;
  readonly m32 = 0;
  readonly m33 = 1;
  readonly m34 = 0;
  readonly m41 = 0;
  readonly m42 = 0;
  readonly m43 = 0;
  readonly m44 = 1;
  readonly is2D = true;
  readonly isIdentity = true;

  /** Sans argument, c'est l'identité. Avec, on refuse : rendre une identité en faisant croire
   *  qu'on a lu les valeurs perdrait un facteur d'échelle sans que personne le voie. */
  constructor(valeurs?: unknown) {
    if (valeurs !== undefined) refuser();
  }

  translate = refuser;
  scale = refuser;
  scaleNonUniform = refuser;
  scale3d = refuser;
  rotate = refuser;
  rotateFromVector = refuser;
  rotateAxisAngle = refuser;
  skewX = refuser;
  skewY = refuser;
  multiply = refuser;
  multiplySelf = refuser;
  preMultiplySelf = refuser;
  translateSelf = refuser;
  scaleSelf = refuser;
  rotateSelf = refuser;
  invertSelf = refuser;
  inverse = refuser;
  setMatrixValue = refuser;
  transformPoint = refuser;
  toFloat32Array = refuser;
  toFloat64Array = refuser;
  toString = refuser;
}

/** Le paquet de rendu de pdfjs se résout-il d'ici ? */
function paquetDeRenduPresent(): boolean {
  try {
    createRequire(import.meta.url).resolve("@napi-rs/canvas");
    return true;
  } catch {
    return false;
  }
}

/** Pose le dépannage, mais seulement s'il n'y a rien de mieux.
 *
 *  L'ordre importe : pdfjs n'installe la vraie matrice que si `globalThis.DOMMatrix` est vide.
 *  Poser le dépannage d'office priverait le dépôt de la vraie implémentation — et le rendu
 *  marcherait alors dans le paquet et pas en développement, soit exactement à l'envers.
 *
 *  Et il faut le poser **avant** le premier import de pdfjs : un module ESM dont l'évaluation
 *  échoue garde son erreur en cache, et réimporter ne rejoue rien. Réparer après coup est donc
 *  impossible, ce qui écarte la solution tentante du « on essaie, et on repose si ça casse ».
 */
export function poserDOMMatrixSiAbsent(): string {
  const global = globalThis as Record<string, unknown>;
  if (global["DOMMatrix"] !== undefined) return "déjà là";
  if (paquetDeRenduPresent()) return "rien à faire, le paquet de rendu est là";
  global["DOMMatrix"] = MatriceIdentite;
  return "dépannage posé";
}
