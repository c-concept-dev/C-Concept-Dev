import type { Association, Appariement } from "./associateur.js";

/** Mesure indépendante de l'association proposée sur un corpus réel.
 *
 * Le statut produit par le moteur ne suffit pas à prouver qu'un lien est juste. Quand le nom
 * d'origine porte aussi l'élément et la page, ces deux valeurs forment un témoin indépendant :
 * une association automatique qui les contredit est un faux positif mesurable. */
export type BilanAssociationCorpus = {
  readonly automatiques: number;
  readonly aVerifier: number;
  readonly fauxAutomatiques: readonly Appariement[];
  readonly pistesManquantes: number;
  readonly mediasOrphelins: number;
  readonly abstention: boolean;
};

export function bilanAssociationCorpus(association: Association): BilanAssociationCorpus {
  const automatiques = association.appariements.filter((appariement) => appariement.statut === "auto");
  const fauxAutomatiques = automatiques.filter((appariement) => {
    const media = appariement.media;
    if (media === undefined) return true;
    if (media.element !== undefined && media.element !== appariement.ligne.numero) return true;
    if (media.page !== undefined && media.page !== appariement.ligne.pageImprimee) return true;
    return false;
  });

  return {
    automatiques: automatiques.length,
    aVerifier: association.appariements.length - automatiques.length,
    fauxAutomatiques,
    pistesManquantes: association.manquants.length,
    mediasOrphelins: association.orphelins.length,
    abstention: association.abstention !== undefined,
  };
}
