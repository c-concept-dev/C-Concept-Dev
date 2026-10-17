/** Qui a le droit de quoi, bibliothèque par bibliothèque (SEC-03, INT-01).
 *
 *  Un jeton vaut pour **une bibliothèque** et **un niveau**, et se révoque seul : révoquer celui
 *  d'une application ne doit atteindre aucun autre accès. C'est l'exigence, et c'est ce que ces
 *  fonctions rendent vérifiable.
 *
 *  Le niveau est une échelle, pas une liste de cases : qui peut administrer peut contribuer, qui
 *  peut contribuer peut lire. Une liste de cases à cocher se désaccorde — on ajoute une action
 *  quelque part et on oublie de la cocher ailleurs. Une échelle n'a rien à accorder. */

/** Les trois niveaux, du moins au plus. L'ordre du tableau **est** l'échelle. */
export const NIVEAUX = ["lecture", "contribution", "administration"] as const;
export type Niveau = (typeof NIVEAUX)[number];

/** Ce qu'on peut vouloir faire, et le niveau qu'il faut pour le faire.
 *
 *  Une seule table, et c'est elle qu'on relit en revue de sécurité. Une action absente d'ici
 *  n'est permise à personne : un geste qu'on a oublié de classer doit être refusé, jamais
 *  autorisé par défaut. */
export const EXIGE: Readonly<Record<string, Niveau>> = {
  lire: "lecture",
  chercher: "lecture",
  ouvrir_fichier: "lecture",
  annoter: "contribution",
  corriger_lien: "contribution",
  deposer: "contribution",
  changer_schema: "administration",
  publier: "administration",
  depublier: "administration",
  reviser_droits: "administration",
  supprimer: "administration",
};
/** Une action qui demande un niveau. « Protégée » parce que `Action` tout court existe
 *  déjà ailleurs et ne parle pas de droits — le typage l'a signalé avant la revue. */
export type ActionProtegee = keyof typeof EXIGE;

const rang = (niveau: Niveau): number => NIVEAUX.indexOf(niveau);

/** Ce niveau permet-il cette action ? */
export function permet(niveau: Niveau, action: string): boolean {
  const exige = EXIGE[action];
  if (exige === undefined) return false;
  return rang(niveau) >= rang(exige);
}

/** Ce qu'un porteur présente : un jeton, ou une session. */
export type Porte = {
  readonly bibliotheque: string;
  readonly niveau: Niveau;
  readonly revoqueLe?: number;
};

/** Ce qui empêche ce porteur de faire cette action sur cette bibliothèque, s'il y a quelque
 *  chose. Une phrase lisible plutôt qu'un code, et jamais une phrase qui apprend ce qui existe. */
export function refus(porte: Porte, bibliotheque: string, action: string, maintenant: number): string | undefined {
  if (porte.revoqueLe !== undefined && porte.revoqueLe <= maintenant) return "Cet accès a été révoqué.";
  // La bibliothèque d'abord : répondre « droits insuffisants » pour une bibliothèque qu'on n'a
  // pas le droit de voir apprendrait qu'elle existe.
  if (porte.bibliotheque !== bibliotheque) return "Accès refusé.";
  if (!permet(porte.niveau, action)) return "Accès refusé.";
  return undefined;
}
