import { z } from "zod";
import { Recette } from "@lienotheque/contrats";

/** Chargement d'une recette (REC-01). Le schéma est publié, et tout paramètre inconnu est refusé
 *  — une recette qui contient une clef de trop est une recette qu'on a mal comprise. Reste à le
 *  dire en français : un rapport de validation brut ne se lit pas. */

export class RecetteInvalide extends Error {
  readonly problemes: readonly string[];

  constructor(problemes: readonly string[]) {
    super(`Recette refusée :\n${problemes.map((probleme) => `  — ${probleme}`).join("\n")}`);
    this.name = "RecetteInvalide";
    this.problemes = problemes;
  }
}

const chemin = (parties: readonly PropertyKey[]): string =>
  parties.length === 0 ? "la recette" : `« ${parties.map(String).join(" › ")} »`;

/** Traduit un problème de validation en une phrase qu'on peut lire sans connaître Zod. */
export function enFrancais(probleme: z.core.$ZodIssue): string {
  const ou = chemin(probleme.path);
  switch (probleme.code) {
    case "unrecognized_keys":
      return `${ou} : paramètre inconnu ${probleme.keys.map((clef) => `« ${clef} »`).join(", ")}`;
    case "invalid_type":
      return probleme.input === undefined ? `${ou} : paramètre obligatoire absent` : `${ou} : ${probleme.expected} attendu`;
    case "invalid_value":
      return `${ou} : valeur refusée, attendu ${probleme.values.map((valeur) => `« ${String(valeur)} »`).join(" ou ")}`;
    case "too_small":
      return `${ou} : au moins ${String(probleme.minimum)} attendu`;
    case "too_big":
      return `${ou} : au plus ${String(probleme.maximum)} attendu`;
    default:
      return `${ou} : ${probleme.message}`;
  }
}

export function chargerRecette(valeur: unknown): Recette {
  const lu = Recette.safeParse(valeur);
  if (lu.success) return lu.data;
  throw new RecetteInvalide(lu.error.issues.map(enFrancais));
}

/** Une recette dérivée dit de qui elle tient (REC-03) : le résultat garde cette filiation, et
 *  changer la fille ne réécrit pas ce que la mère a produit. */
export const filiation = (recette: Recette): string =>
  recette.derivee_de === null
    ? `${recette.id} v${recette.version}`
    : `${recette.id} v${recette.version} (dérivée de ${recette.derivee_de.id} v${recette.derivee_de.version})`;
