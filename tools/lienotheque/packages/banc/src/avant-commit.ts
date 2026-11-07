import { fichiersRefuses } from "./rien-de-lourd.js";
import { importsFantomes } from "./rien-de-fantome.js";
import { promessesDansUneCondition } from "./promesses-attendues.js";
import { termesTrouves } from "./vocabulaire.js";

/** Ce qu'un commit ne doit pas emporter, décidé avant qu'il parte.
 *
 *  ## Pourquoi une mécanique, et non une relecture
 *
 *  Les garde-fous du banc tiennent déjà ces règles, mais au moment du **contrôle complet**. Deux
 *  erreurs du 7 novembre 2026 ont passé entre deux contrôles :
 *
 *  - un commit d'autorisation qui devait porter une ligne en a emporté quatre-vingt-seize, parce
 *    que `git apply --3way` indexe son résultat ;
 *  - une section de registre effacée par un `cp` depuis une copie antérieure à son écriture.
 *
 *  Les deux avaient leur sortie sous les yeux : `git diff --cached --stat` montrait deux fichiers
 *  au lieu d'un. Elles ont traversé parce qu'elles reposaient sur une lecture attentive — et
 *  **un garde-fou qui demande qu'on lise attentivement n'est pas un garde-fou.**
 *
 *  ## Ce que cette décision juge, et ce qu'elle ne juge pas
 *
 *  Elle juge **l'index**, c'est-à-dire ce que le commit contiendra, jamais le disque : c'est la
 *  règle du 7 novembre, et c'est ce qui la rend utile avant le commit plutôt qu'après.
 *
 *  Elle ne juge que les garde-fous **rapides** — ceux qui lisent des chemins et du texte. Les
 *  tests, le typage et les mesures restent l'affaire du contrôle complet : un crochet qui prendrait
 *  vingt-cinq minutes serait désactivé avant la fin de la journée, et un garde-fou désactivé ne
 *  garde rien.
 *
 *  ## Pourquoi elle nomme toutes les fautes
 *
 *  Un refus qui s'arrête à la première fait recommencer le commit autant de fois qu'il y a de
 *  fautes, et chaque tour coûte à celui qui le subit. On nomme tout, une fois. */

/** La garde du vocabulaire, telle que `fixtures/termes-de-domaine.json` la porte. */
export type GardeDuVocabulaire = {
  readonly zones: readonly { readonly chemin: string; readonly sauf?: readonly string[] }[];
  readonly termes: readonly string[];
  readonly exceptions: readonly { readonly chemin: string; readonly raison?: string }[];
};

export type EntreeDuVerdict = {
  /** Les chemins que l'index porte, tels que `git ls-files` les donne. */
  readonly suivis: readonly string[];
  /** Le contenu **indexé** d'un chemin. Jamais celui du disque. */
  readonly lire: (chemin: string) => string;
  readonly garde: GardeDuVocabulaire;
};

export type Verdict = { readonly refus: readonly string[] };

/** Les fichiers d'une zone inspectée par CLA-01, par leur chemin seul.
 *
 *  Par le chemin et non par le disque : la question est « ce commit emporte-t-il un mot de
 *  domaine ? », et seul l'index y répond. Un joker de dossier (`outils/*​/src`) se déplie ici
 *  comme il se déplie dans le contrôle complet — un nouvel outil entre donc dans la garde sans
 *  qu'on touche à la liste. */
export function fichiersDesZones(suivis: readonly string[], garde: GardeDuVocabulaire): readonly string[] {
  const exceptions = new Set(garde.exceptions.map((exception) => exception.chemin));
  const dansLaZone = (chemin: string, zone: { chemin: string; sauf?: readonly string[] }): boolean => {
    const motif = zone.chemin.replaceAll("*", "[^/]+");
    if (!new RegExp(`^${motif}/`, "u").test(chemin)) return false;
    return !(zone.sauf ?? []).some((exclu) => chemin === exclu || chemin.startsWith(`${exclu}/`));
  };
  return suivis.filter(
    (chemin) =>
      /\.(ts|tsx|rs)$/.test(chemin) &&
      !exceptions.has(chemin) &&
      garde.zones.some((zone) => dansLaZone(chemin, zone)),
  );
}

export function verdictAvantCommit(entree: EntreeDuVerdict): Verdict {
  const refus: string[] = [];

  for (const refuse of fichiersRefuses(entree.suivis))
    refus.push(`fichier refusé — ${refuse.chemin} : ${refuse.pourquoi}`);

  for (const fantome of importsFantomes(entree.suivis, entree.lire))
    refus.push(
      `fichier fantôme — ${fantome.chemin} importe « ${fantome.importe} », que l'index ne porte pas`,
    );

  for (const chemin of fichiersDesZones(entree.suivis, entree.garde)) {
    const trouves = termesTrouves(entree.lire(chemin), entree.garde.termes);
    if (trouves.length > 0)
      refus.push(`vocabulaire de domaine (CLA-01) — ${chemin} emploie ${trouves.map((t) => `« ${t} »`).join(", ")}`);
  }

  const sources = entree.suivis
    .filter((chemin) => /\.(ts|tsx)$/.test(chemin) && !chemin.includes("/dist/"))
    .map((chemin) => ({ chemin, contenu: entree.lire(chemin) }));
  for (const mal of promessesDansUneCondition(sources))
    refus.push(
      `promesse dans une condition — ${mal.chemin}:${mal.ligne} appelle « ${mal.nom} » sans l'attendre`,
    );

  return { refus };
}
