/** Le module de travail de pdfjs n'a pas de déclaration de types, et n'en a pas besoin.
 *
 *  On ne l'importe pas pour s'en servir : son chargement pose `globalThis.pdfjsWorker`, où
 *  pdfjs va le chercher. L'importer explicitement est la seule façon qu'un empaqueteur le
 *  suive — sinon pdfjs le cherche par un chemin calculé à l'exécution, absent d'un paquet
 *  d'un seul fichier.
 */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
