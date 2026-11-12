import type { RelecteurDeZone } from "./relire-les-zones.js";

/** A2 — enchaîner des relecteurs, du moins cher au plus cher (A2, OUT-05, OUT-10).
 *
 *  La doctrine des trois étages — couche du PDF, puis reconnaissance locale, puis modèle en
 *  ligne — dit que **chaque étage douteux passe la main au suivant, jamais de saut**. Appliquée
 *  à une case de table, elle a une conséquence en euros : l'appel en ligne ne part que pour les
 *  cases restées **sans accord** sur place. Un étage qui part quand le précédent a répondu paie
 *  ce qui était déjà acquis.
 *
 *  Ce module ne connaît ni réseau, ni clé, ni modèle : il ordonne des ports. C'est ce qui permet
 *  de l'éprouver sans dépenser un centime, et c'est à cela qu'il sert.
 *
 *  **Une panne n'est pas une abstention.** Un réseau coupé rendrait « rien rattrapé », ce qui
 *  ressemble exactement à « rien à rattraper ». Les deux se comptent donc séparément : l'étage
 *  qui lève passe la main, mais son relevé le dit. Sans cette distinction, une panne totale
 *  ressemblerait à un succès — la forme de défaillance la plus dangereuse d'un garde-fou. */

/** Un étage de relecture : un nom pour le relevé, et le port qui lit. */
export type EtageDeRelecture = { readonly nom: string; readonly relire: RelecteurDeZone };

/** Ce qu'un étage a coûté : ce qu'on lui a demandé, ce qu'il a rendu, ce qu'il a raté. */
export type ReleveDEtage = {
  readonly nom: string;
  readonly demandes: number;
  readonly rendus: number;
  readonly pannes: number;
};

export function relecteurEnChaine(etages: readonly EtageDeRelecture[]): {
  readonly relire: RelecteurDeZone;
  readonly releve: () => readonly ReleveDEtage[];
} {
  const comptes = etages.map((etage) => ({ nom: etage.nom, demandes: 0, rendus: 0, pannes: 0 }));

  const relire: RelecteurDeZone = async (demande) => {
    for (const [place, etage] of etages.entries()) {
      const compte = comptes[place]!;
      compte.demandes += 1;
      let lu: string | undefined;
      try {
        lu = await etage.relire(demande);
      } catch {
        // La panne se compte et ne se propage pas : un document de cent pages ne doit pas
        // s'arrêter sur une coupure, mais le relevé doit porter la coupure.
        compte.pannes += 1;
        continue;
      }
      if (lu === undefined) continue;
      compte.rendus += 1;
      return lu;
    }
    return undefined;
  };

  return { relire, releve: () => comptes.map((compte) => ({ ...compte })) };
}
