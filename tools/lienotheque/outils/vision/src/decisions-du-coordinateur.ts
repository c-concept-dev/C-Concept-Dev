import type { DecisionDeLecture, Observation } from "@lienotheque/contrats";
import type { DecisionPage, ResultatCoordinateur } from "./coordinateur-lecture-difficile.js";

/** Du coordinateur au moteur oracle (OUT-10).
 *
 *  Le coordinateur rend des décisions riches — la page d'origine, le modèle en vigueur, la
 *  trace du passage par Vision. Le moteur n'a besoin que de trois choses : quel repère, quelle
 *  pièce, et d'où la réponse vient. Cette projection ne perd rien d'utile et évite de faire
 *  voyager un modèle de lecture jusqu'à une pièce qui n'a rien à en faire.
 *
 *  **C'est le câblage qui manquait.** Le coordinateur existait, complet et éprouvé, et personne
 *  ne l'appelait : une seule occurrence dans tout le dépôt, sa propre ligne d'export. Il manquait
 *  le bout de ruban entre ce qu'il rend et ce que le moteur attend. */

/** Ce qu'une valeur retenue par le coordinateur doit porter pour devenir un lien.
 *
 *  Le coordinateur est générique sur sa valeur — il ne sait pas ce qu'il transporte, et c'est sa
 *  force. Ici on dit ce que le moteur oracle, lui, attend d'en trouver. */
export type ValeurReliante = {
  readonly piece: string;
  readonly observations: readonly Observation[];
};

/** Projette les décisions du coordinateur dans la forme que le moteur consomme. */
export function decisionsDeLecture<Page, Modele>(
  resultat: ResultatCoordinateur<Page, ValeurReliante, Modele>,
): readonly DecisionDeLecture[] {
  return resultat.pages.map((decision: DecisionPage<Page, ValeurReliante, Modele>): DecisionDeLecture =>
    decision.etat === "retenue"
      ? {
          etat: "retenue",
          repere: decision.page,
          piece: decision.valeur.piece,
          venue: decision.source,
          confiance: decision.confiance,
          observations: [...decision.valeur.observations].slice(0, 8),
        }
      : {
          etat: "a_verifier",
          repere: decision.page,
          // Le coordinateur peut n'avoir qu'une raison, ou vingt. Le contrat en accepte huit :
          // au-delà, on garde les premières, qui sont les plus proches de la cause.
          raisons: decision.raisons.length === 0 ? ["Aucune raison donnée."] : [...decision.raisons].slice(0, 8),
        },
  );
}
