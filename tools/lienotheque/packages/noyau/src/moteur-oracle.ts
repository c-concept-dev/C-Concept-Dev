import type { DecisionDeLecture, Observation, Oracle, SourceObservation } from "@lienotheque/contrats";
import type { EpreuveSurTemoins } from "./confrontation.js";

/** Du coordinateur à l'oracle : choisir où regarder, bâtir l'hypothèse, l'éprouver (OUT-10).
 *
 *  ## Ce que ce module relie
 *
 *  D'un côté, le coordinateur impose l'ordre sûr : lecture locale d'abord, Vision seulement sur
 *  ce qui résiste, corroboration avant de retenir. Il existe depuis longtemps et n'était appelé
 *  nulle part. De l'autre, l'oracle sait se confronter et rendre un verdict. Entre les deux, il
 *  manquait trois gestes : **où regarder**, **comment en faire une hypothèse**, et **comment
 *  l'éprouver sur ce qu'elle n'a pas vu**.
 *
 *  ## Ce qu'il ne fait pas
 *
 *  Il n'appelle ni Vision, ni la reconnaissance, ni rien qui touche un fichier. Le coordinateur
 *  lui passe ses décisions ; il en fait un oracle. C'est ce qui rend éprouvable, sans image et
 *  sans réseau, la partie du moteur où se jouent les choix. */

/** Combien de repères on regarde pour former une hypothèse.
 *
 *  Huit, et ce n'est pas un chiffre rond : c'est le plafond que le contrat du diagnostic
 *  structurel impose déjà à ce qui part en relecture. Former l'hypothèse sur davantage que ce
 *  qu'on saura faire relire donnerait une hypothèse qu'on ne pourrait pas confronter. */
export const REPERES_DE_L_ECHANTILLON = 8;

export type EchantillonEtTemoins = {
  readonly echantillon: readonly number[];
  readonly temoins: readonly number[];
};

/** Où regarder, et où vérifier ensuite — deux ensembles qui ne se touchent jamais.
 *
 *  ## L'échantillon n'est pas un sondage
 *
 *  On prend le début, la fin, et des repères répartis entre les deux : un gabarit change plus
 *  souvent au bord qu'au milieu, et un échantillon tiré d'une seule zone décrit cette zone.
 *
 *  **Les repères désignés passent devant.** Quand une autre source dit déjà quelque chose d'un
 *  repère précis — un nom de fichier qui annonce une adresse, par exemple — c'est là qu'il faut
 *  regarder en premier : on y apprend à la fois le gabarit et si l'autre source dit vrai. Un
 *  échantillon qui ignore ce qu'on sait déjà gaspille les huit regards qu'on s'autorise.
 *
 *  ## Les témoins
 *
 *  Pris hors de l'échantillon, et répartis autrement — pour qu'une hypothèse juste au début et
 *  fausse à la fin ne passe pas l'épreuve. */
export function choisirEchantillonEtTemoins(
  reperes: readonly number[],
  options: { readonly designes?: readonly number[]; readonly combien?: number } = {},
): EchantillonEtTemoins {
  const tous = [...new Set(reperes)].sort((un, autre) => un - autre);
  if (tous.length === 0) return { echantillon: [], temoins: [] };
  const combien = Math.max(2, Math.min(REPERES_DE_L_ECHANTILLON, options.combien ?? REPERES_DE_L_ECHANTILLON));

  const retenus: number[] = [];
  const prendre = (repere: number | undefined): void => {
    if (repere !== undefined && tous.includes(repere) && !retenus.includes(repere) && retenus.length < combien)
      retenus.push(repere);
  };

  for (const designe of options.designes ?? []) prendre(designe);
  prendre(tous[0]);
  prendre(tous[tous.length - 1]);
  // Puis on comble en écartant les repères les uns des autres, plutôt qu'en prenant les suivants.
  for (let pas = 2; retenus.length < combien && pas <= tous.length; pas += 1)
    for (let rang = 0; rang < tous.length && retenus.length < combien; rang += Math.max(1, Math.floor(tous.length / pas)))
      prendre(tous[rang]);

  const echantillon = [...retenus].sort((un, autre) => un - autre);
  const dehors = tous.filter((repere) => !echantillon.includes(repere));
  // Les témoins : autant que l'échantillon au plus, répartis sur ce qui reste.
  const temoins: number[] = [];
  const pas = Math.max(1, Math.floor(dehors.length / Math.max(1, combien)));
  for (let rang = 0; rang < dehors.length && temoins.length < combien; rang += pas) temoins.push(dehors[rang]!);
  return { echantillon, temoins: temoins.sort((un, autre) => un - autre) };
}

/** Ce qu'il faut pour bâtir un oracle à partir de décisions. */
export type DeQuoiBatirUnOracle = {
  readonly id: string;
  readonly conteneur: string;
  readonly detecteurs: readonly string[];
  readonly echantillon: readonly number[];
  readonly temoins: readonly number[];
  readonly decisions: readonly DecisionDeLecture[];
  /** Tous les repères du conteneur, pour savoir ce que l'oracle laisse de côté. */
  readonly tousLesReperes: readonly number[];
  readonly etabliLe: number;
};

/** Des décisions à l'hypothèse.
 *
 *  Chaque décision retenue devient une proposition ; chaque refus devient un repère sans
 *  proposition, **et ses raisons deviennent des désaccords consignés**. C'est le point : un
 *  refus n'est pas un silence. Le perdre ici reviendrait à présenter une hypothèse qui couvre
 *  les trois quarts d'un conteneur comme si elle le couvrait entier. */
export function construireOracle(de: DeQuoiBatirUnOracle): Oracle {
  const retenues = de.decisions.filter(
    (decision): decision is Extract<DecisionDeLecture, { etat: "retenue" }> => decision.etat === "retenue",
  );
  const couverts = new Set(retenues.map((decision) => decision.repere));
  const desaccords: string[] = [];
  for (const decision of de.decisions)
    if (decision.etat === "a_verifier")
      for (const raison of decision.raisons) desaccords.push(`repère ${decision.repere} : ${raison}`);

  return {
    id: de.id,
    conteneur: de.conteneur,
    detecteurs: [...de.detecteurs],
    echantillon: [...de.echantillon],
    temoins: [...de.temoins],
    propositions: retenues
      .map((decision) => ({
        repere: { rang: decision.repere },
        piece: decision.piece,
        observations: [...decision.observations],
      }))
      .sort((un, autre) => un.repere.rang - autre.repere.rang),
    sansProposition: de.tousLesReperes.filter((repere) => !couverts.has(repere)).sort((un, autre) => un - autre),
    desaccords: desaccords.slice(0, 64),
    etabliLe: de.etabliLe,
  };
}

/** Ce qu'une source indépendante dit d'un repère, pour juger l'hypothèse.
 *
 *  Rendre `undefined` est une réponse à part entière : « je ne sais rien de ce repère ». Elle
 *  envoie le témoin dans les non-jugeables, jamais dans les réussites. */
export type AvisIndependant = (repere: number) => string | undefined;

/** Confronter l'hypothèse à des repères qu'elle n'a pas vus.
 *
 *  Un témoin que l'oracle ne couvre pas **n'est pas un échec** : l'hypothèse ne s'est pas
 *  prononcée, il n'y a rien à réfuter. Il n'est pas non plus une réussite. Il est non jugeable,
 *  et c'est ce comptage à part qui empêche un silence de passer pour une preuve. */
export function eprouverSurTemoins(oracle: Oracle, avis: AvisIndependant): EpreuveSurTemoins {
  const parRepere = new Map(oracle.propositions.map((proposition) => [proposition.repere.rang, proposition.piece]));
  const tenus: number[] = [];
  const manques: number[] = [];
  const nonJugeables: number[] = [];
  for (const temoin of oracle.temoins) {
    const attendu = avis(temoin);
    const propose = parRepere.get(temoin);
    if (attendu === undefined || propose === undefined) nonJugeables.push(temoin);
    else if (attendu === propose) tenus.push(temoin);
    else manques.push(temoin);
  }
  return { tenus, manques, nonJugeables };
}

/** Les sources des observations d'une suite de décisions, pour savoir ce qui est indépendant. */
export function sourcesDesDecisions(decisions: readonly DecisionDeLecture[]): ReadonlySet<SourceObservation> {
  const sources = new Set<SourceObservation>();
  for (const decision of decisions)
    if (decision.etat === "retenue") for (const observation of decision.observations) sources.add(observation.source);
  return sources;
}

/** Ce que le passage par le coordinateur a coûté et donné, dit en clair. */
export function observationsDuCoordinateur(decisions: readonly DecisionDeLecture[], ou: string): readonly Observation[] {
  const retenues = decisions.filter((decision) => decision.etat === "retenue");
  const parVision = retenues.filter(
    (decision) => decision.etat === "retenue" && decision.venue === "vision_corroboree",
  ).length;
  return [
    {
      detecteur: "coordinateur",
      source: "croisement",
      constat:
        `${retenues.length} repère(s) retenu(s) sur ${decisions.length}, dont ${parVision} après une relecture corroborée ; ` +
        `${decisions.length - retenues.length} laissé(s) à vérifier.`,
      ou,
      confiance: decisions.length === 0 ? 0 : retenues.length / decisions.length,
    },
  ];
}
