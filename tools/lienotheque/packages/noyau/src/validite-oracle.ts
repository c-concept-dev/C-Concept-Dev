import type { Oracle, Verdict } from "@lienotheque/contrats";

/** Un oracle enregistré, et ce qui le périme (OUT-10, ID-01).
 *
 *  ## Pourquoi un oracle doit pouvoir mourir
 *
 *  Une hypothèse apprise est plus dangereuse qu'une règle écrite à la main : personne ne l'a
 *  relue. Si elle survit au contenu qui l'a formée, elle devient une affirmation sur un document
 *  qu'elle n'a jamais vu — et elle continuera de produire des liens, nets et réguliers, sur la
 *  mauvaise chose.
 *
 *  Le 29 octobre 2026, la bibliothèque portait deux exemples de ce qu'un reste périmé produit :
 *  115 travaux achevés annonçant encore la raison qui les avait mis en pause des heures plus
 *  tôt, et un marqueur « vérifié » posé à la main du temps où les liens d'un recueil pointaient
 *  sur le son d'un autre. Aucun des deux ne mentait au moment où il a été écrit.
 *
 *  ## Deux empreintes, parce qu'il y a deux façons de changer
 *
 *  Le **conteneur** change : le document n'est plus le même, l'oracle ne parle plus de lui.
 *  Le **vivier** change : les pièces ne sont plus les mêmes, et un lien vers une pièce qui n'est
 *  plus là, ou l'absence d'un lien vers une pièce arrivée depuis, ne se voit pas autrement.
 *
 *  Ce module **compare** des empreintes, il n'en calcule aucune : le hachage vit là où vivent
 *  déjà les outils qui le font vraiment, et une empreinte approximative calculée ici pour
 *  s'épargner une dépendance manquerait justement le changement qu'elle devait voir. */

export type OracleEnregistre = {
  readonly oracle: Oracle;
  readonly verdict: Verdict;
  /** L'empreinte du vivier au moment où l'oracle a été établi : les pièces qu'il a vues. */
  readonly empreinteDuVivier: string;
  readonly ecritLe: number;
};

export type EtatDeLOracle =
  | { readonly valable: true }
  | {
      readonly valable: false;
      readonly raison: "conteneur_change" | "vivier_change";
      readonly pourquoi: string;
    };

/** Cet oracle parle-t-il encore de ce qu'il a sous les yeux ?
 *
 *  Le conteneur d'abord : si le document a changé, la question du vivier ne se pose même pas.
 *  On nomme la cause la plus profonde, pas la première rencontrée. */
export function etatDeLOracle(
  enregistre: OracleEnregistre,
  maintenant: { readonly conteneur: string; readonly empreinteDuVivier: string },
): EtatDeLOracle {
  if (enregistre.oracle.conteneur !== maintenant.conteneur)
    return {
      valable: false,
      raison: "conteneur_change",
      pourquoi: "Ce n’est plus le même document : ce qui avait été appris ne parle pas de celui-ci.",
    };
  if (enregistre.empreinteDuVivier !== maintenant.empreinteDuVivier)
    return {
      valable: false,
      raison: "vivier_change",
      pourquoi: "Les pièces présentes ne sont plus celles sur lesquelles cette lecture a été établie.",
    };
  return { valable: true };
}

/** Ce qu'il reste d'un oracle périmé : ses observations, jamais ses conclusions.
 *
 *  Un oracle qui ne vaut plus ne disparaît pas — ce qu'il a **vu** reste vrai de ce qu'il a vu,
 *  et sert au diagnostic. Ce sont ses **liens** qui tombent. Les effacer ferait perdre la trace
 *  de ce qui avait été observé ; les garder publiés ferait mentir l'écran. */
export function retirerLesLiens(enregistre: OracleEnregistre, pourquoi: string): OracleEnregistre {
  return {
    ...enregistre,
    oracle: {
      ...enregistre.oracle,
      propositions: [],
      sansProposition: [...enregistre.oracle.propositions.map((proposition) => proposition.repere.rang)].sort(
        (un, autre) => un - autre,
      ),
    },
    verdict: {
      etat: "abstention",
      motif: "aucun_oracle",
      pourquoi,
      pourLever: "Relire ce conteneur : son oracle a été établi sur un autre état des fichiers.",
    },
  };
}
