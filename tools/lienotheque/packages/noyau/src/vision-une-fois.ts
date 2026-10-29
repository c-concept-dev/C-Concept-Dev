import type { Observation } from "@lienotheque/contrats";

/** Vision une fois par dépôt, et la garantie que ce soit vrai (OUT-08, OUT-10).
 *
 *  ## Ce que ce module garantit, et ce qu'il ne fait pas
 *
 *  Il ne parle à personne. Le transport existe déjà — le contrat de la demande, la route du
 *  service, le calibrateur qui refuse ce que les pixels ne confirment pas. Ce qui manquait est
 *  la **garantie** : qu'un conteneur déjà observé ne soit jamais réobservé, et que les exceptions
 *  soient comptées plutôt que tolérées.
 *
 *  Sans cette pièce, « une fois par dépôt » est une intention. Avec elle, c'est une règle qui
 *  refuse — et qui dit pourquoi.
 *
 *  ## « Une fois » est une fois par gabarit, pas par conteneur
 *
 *  La précision a été posée dès la conception et elle est tenue ici plutôt que tue. Un recueil
 *  qui change de mise en page au milieu porte deux gabarits : le premier regard ne décrit que le
 *  premier. Le coordinateur sait déjà nommer ce cas — il l'appelle une **rupture** — et une
 *  rupture déclarée rouvre le droit de regarder, **une fois**, et dans un budget compté.
 *
 *  Le reste du temps, la réponse est non, et la mémoire sert.
 *
 *  ## L'oubli volontaire
 *
 *  Ce qui a été observé vaut pour **ce** conteneur et pour **ces** pièces. Le document change,
 *  la mémoire tombe — même règle que pour l'oracle, et pour la même raison : une description
 *  qui survit à ce qu'elle décrivait devient une affirmation sur autre chose. */

/** Ce qu'on garde d'un regard déjà porté.
 *
 *  Le modèle lui-même est opaque ici : ce module décide **si** l'on regarde, pas ce qu'on y
 *  voit. Le garder générique évite de faire dépendre la politique de la forme du modèle, qui
 *  changera. */
export type MemoireDeStructure<Modele> = {
  readonly conteneur: string;
  readonly empreinteDuVivier: string;
  /** Les gabarits connus, dans l'ordre où ils ont été découverts. */
  readonly segments: readonly {
    readonly depuis: number;
    readonly modele: Modele;
    readonly reperesObserves: readonly number[];
    readonly demandeLe: number;
  }[];
  /** Combien de fois ce conteneur a réellement fait appel au service. Compté, pas estimé. */
  readonly regardsDepenses: number;
};

export type MotifDeDemande =
  | { readonly motif: "premiere_decouverte" }
  | { readonly motif: "rupture_declaree"; readonly depuis: number; readonly raison: string };

export type Budget = {
  /** Combien de regards un conteneur a droit, ruptures comprises. Un au minimum. */
  readonly regardsParConteneur: number;
};

export const BUDGET_PAR_DEFAUT: Budget = { regardsParConteneur: 3 };

export type Autorisation =
  | { readonly autorise: true; readonly pourquoi: string }
  | { readonly autorise: false; readonly pourquoi: string; readonly motifDuRefus: MotifDeRefus };

export type MotifDeRefus = "deja_observe" | "budget_epuise" | "rupture_non_declaree";

/** A-t-on le droit de regarder ce conteneur ?
 *
 *  L'ordre des refus suit celui du reste du socle : le fait d'abord, le compte ensuite.
 *
 *  1. **Déjà observé, sans rupture** — il n'y a rien à apprendre de plus, et redemander coûterait
 *     sans rien rendre. C'est le cas qui doit être vrai presque toujours.
 *  2. **Budget épuisé** — les ruptures existent, mais pas sans fin. Un conteneur qui en déclare
 *     dix ne change pas dix fois de gabarit : il résiste à la lecture, et c'est un autre problème.
 *  3. **Rupture non déclarée** — on ne redemande pas « pour voir ». Une seconde observation se
 *     justifie par une rupture nommée, avec le repère où elle commence. */
export function autoriserVision<Modele>(
  memoire: MemoireDeStructure<Modele> | undefined,
  demande: MotifDeDemande,
  maintenant: { readonly conteneur: string; readonly empreinteDuVivier: string },
  budget: Budget = BUDGET_PAR_DEFAUT,
): Autorisation {
  const plafond = Math.max(1, Math.trunc(budget.regardsParConteneur));

  // Rien en mémoire, ou une mémoire qui ne parle plus de ce qu'on a sous les yeux : on regarde.
  if (memoire === undefined)
    return { autorise: true, pourquoi: "Ce conteneur n’a encore jamais été observé." };
  if (memoire.conteneur !== maintenant.conteneur || memoire.empreinteDuVivier !== maintenant.empreinteDuVivier)
    return {
      autorise: true,
      pourquoi: "Ce qui avait été observé ne décrit plus ce conteneur : le document ou ses pièces ont changé.",
    };

  if (demande.motif === "premiere_decouverte")
    return {
      autorise: false,
      motifDuRefus: "deja_observe",
      pourquoi: `Ce conteneur a déjà été observé (${memoire.segments.length} gabarit${memoire.segments.length > 1 ? "s" : ""} connu${memoire.segments.length > 1 ? "s" : ""}) : ce qui a été appris sert, rien de neuf ne serait vu.`,
    };

  if (memoire.regardsDepenses >= plafond)
    return {
      autorise: false,
      motifDuRefus: "budget_epuise",
      pourquoi: `Ce conteneur a déjà demandé ${memoire.regardsDepenses} regard${memoire.regardsDepenses > 1 ? "s" : ""} sur ${plafond} : il ne change pas de mise en page, il résiste à la lecture.`,
    };

  if (memoire.segments.some((segment) => segment.depuis === demande.depuis))
    return {
      autorise: false,
      motifDuRefus: "deja_observe",
      pourquoi: `Un gabarit est déjà connu à partir du repère ${demande.depuis} : la rupture annoncée a déjà été regardée.`,
    };

  return {
    autorise: true,
    pourquoi: `Rupture déclarée au repère ${demande.depuis} : ${demande.raison}`,
  };
}

/** La mémoire après un regard. Le compte monte, même si le modèle rendu ne sert à rien.
 *
 *  Compter le regard et non le résultat : un appel qui n'a rien donné a coûté autant qu'un autre,
 *  et un budget qui ne compterait que les succès laisserait un conteneur difficile appeler sans
 *  fin. */
export function apresVision<Modele>(
  memoire: MemoireDeStructure<Modele> | undefined,
  maintenant: { readonly conteneur: string; readonly empreinteDuVivier: string },
  gabarit: { readonly depuis: number; readonly modele: Modele; readonly reperesObserves: readonly number[]; readonly demandeLe: number },
): MemoireDeStructure<Modele> {
  const fraiche =
    memoire !== undefined &&
    memoire.conteneur === maintenant.conteneur &&
    memoire.empreinteDuVivier === maintenant.empreinteDuVivier;
  const segments = fraiche ? [...memoire.segments, gabarit] : [gabarit];
  return {
    conteneur: maintenant.conteneur,
    empreinteDuVivier: maintenant.empreinteDuVivier,
    segments: [...segments].sort((un, autre) => un.depuis - autre.depuis),
    regardsDepenses: (fraiche ? memoire.regardsDepenses : 0) + 1,
  };
}

/** Le gabarit en vigueur à un repère donné : le dernier déclaré avant lui. */
export function gabaritAuRepere<Modele>(memoire: MemoireDeStructure<Modele>, repere: number): Modele | undefined {
  let retenu: Modele | undefined;
  for (const segment of memoire.segments) if (segment.depuis <= repere) retenu = segment.modele;
  return retenu;
}

/** Ce que la politique a décidé, dit en clair.
 *
 *  Un refus est une information utile — il dit que le dépôt n'a rien coûté de plus — et pas un
 *  incident. Le consigner permet de vérifier, après coup, que « une fois par dépôt » est bien ce
 *  qui s'est passé. */
export function observationDeLaPolitique(autorisation: Autorisation, conteneur: string): Observation {
  return {
    detecteur: "regard-structurel",
    source: "croisement",
    constat: autorisation.autorise
      ? `Un regard structurel est demandé. ${autorisation.pourquoi}`
      : `Aucun regard structurel demandé. ${autorisation.pourquoi}`,
    ou: `conteneur ${conteneur.slice(0, 12)}…`,
    confiance: 1,
  };
}
