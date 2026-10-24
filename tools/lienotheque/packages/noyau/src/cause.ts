/** Ce qu'une panne dit d'elle-même, quelle que soit sa forme (JOB-05).
 *
 *  Un `throw` ne porte pas forcément une `Error` : une bibliothèque tierce lève ce qu'elle veut.
 *  `String(cause)` sur un objet rend « [object Object] » — sa nature, jamais son contenu —, et
 *  c'est ainsi que trois documents du réimport du 21 octobre 2026 ont échoué sans que personne
 *  puisse savoir pourquoi. Le décodeur JPEG levait un objet en refusant un espace de couleur ;
 *  son message existait, et se perdait au premier `String`.
 *
 *  Une erreur avalée est interdite. Parler pour ne rien dire revient au même pour qui lit.
 */

/** Au-delà, ce n'est plus une cause mais un fichier : elle traverse un tuyau entre deux processus
 *  et finit écrite dans un travail. Ce qui ne tient pas en quelques lignes ne s'y lira pas. */
const PLAFOND = 600;

const borner = (texte: string): string => (texte.length <= PLAFOND ? texte : `${texte.slice(0, PLAFOND - 1)}…`);

/** Un message lisible pour tout ce qu'un `throw` peut porter.
 *
 *  Elle ne lève jamais : une fonction qui sert à dire une panne et qui tombe dedans emporte la
 *  seule trace qui restait. */
export function causeLisible(cause: unknown): string {
  if (cause instanceof Error) {
    // Le nom quand le message est vide : il reste la seule indication de ce qui s'est passé.
    return borner(cause.message.trim() === "" ? cause.name : cause.message);
  }
  if (typeof cause === "string") return borner(cause);
  if (cause === undefined || cause === null) return "Panne sans cause : rien n’a été levé qu’on puisse lire.";

  if (typeof cause === "object") {
    // Beaucoup de bibliothèques lèvent un objet qui porte malgré tout un message : c'est lui
    // qu'on veut, avant toute mise en forme.
    const message = (cause as { message?: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") return borner(message);
    try {
      const ecrit = JSON.stringify(cause);
      if (ecrit !== undefined && ecrit !== "{}") return borner(ecrit);
    } catch {
      // Un objet circulaire, ou un `toJSON` qui lève : on continue, on ne renonce pas.
    }
  }

  try {
    const dit = String(cause);
    // « [object Object] » est exactement ce qu'on vient corriger : si c'est tout ce qu'on obtient,
    // on dit au moins de quoi il s'agissait.
    if (dit !== "[object Object]") return borner(dit);
  } catch {
    // Même sa conversion échoue.
  }
  return `Panne d’un type qui ne se laisse pas lire (${typeof cause}).`;
}
