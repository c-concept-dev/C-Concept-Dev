/** Comparer deux bibliothèques sur les mêmes questions (BAS-03, RCH-11).
 *
 *  C'est cette comparaison qui autorisera la bascule, et rien d'autre. Elle doit donc être
 *  écrite **avant** d'en avoir besoin, et ses seuils annoncés avant d'avoir vu les résultats :
 *  un seuil choisi après coup mesure la patience de celui qui l'a choisi.
 *
 *  Une précaution de méthode, inscrite ici parce qu'elle se perd ailleurs : l'ancienne
 *  bibliothèque **n'est pas une vérité**. « Au moins aussi bien » se mesure contre ses réponses
 *  réelles, pas contre un idéal — et là où la nouvelle diverge, c'est un humain qui tranche. */

/** Un résultat, tel que les deux côtés le rendent.
 *
 *  « Rendu » parce que `Resultat` tout court existe déjà pour la recherche locale, et que les
 *  deux ne parlent pas de la même chose. Le typage a signalé quatre collisions de ce genre sur
 *  ce lot : le ré-export à plat du noyau rend visible la paresse de nommage, et c'est utile. */
export type ResultatRendu = {
  readonly book_title?: unknown;
  readonly page_number?: unknown;
  readonly content?: unknown;
};

/** La clé de dédoublonnage de l'application qu'on doit servir, reprise telle quelle.
 *
 *  On la reprend plutôt que d'en inventer une meilleure : comparer deux systèmes demande une
 *  règle que les deux acceptent, et c'est l'ancienne qui fait foi pour cela. */
export function cleDeResultat(resultat: ResultatRendu): string {
  const titre = typeof resultat.book_title === "string" ? resultat.book_title : "";
  const page = resultat.page_number === null || resultat.page_number === undefined ? "" : String(resultat.page_number);
  const texte = typeof resultat.content === "string" ? resultat.content.slice(0, 60) : "";
  return `${titre}|${page}|${texte}`;
}

const ouvrages = (resultats: readonly ResultatRendu[]): Set<string> =>
  new Set(resultats.map((r) => (typeof r.book_title === "string" ? r.book_title : "")).filter((t) => t.length > 0));

/** Les ouvrages que l'ancienne trouvait et que la nouvelle ne trouve plus.
 *
 *  C'est le seul seuil bloquant : perdre un ouvrage, c'est rendre un livre introuvable, et
 *  aucune amélioration ailleurs ne compense cela. */
export function ouvragesPerdus(ancienne: readonly ResultatRendu[], nouvelle: readonly ResultatRendu[]): readonly string[] {
  const apres = ouvrages(nouvelle);
  return [...ouvrages(ancienne)].filter((titre) => !apres.has(titre)).sort();
}

/** Le recouvrement des passages, de 0 à 1.
 *
 *  Rapporté, jamais bloquant : un passage découpé autrement n'est pas une régression, et exiger
 *  le même découpage reviendrait à interdire de mieux découper. Deux ensembles vides se
 *  recouvrent entièrement — il n'y a pas de désaccord entre deux silences. */
export function recouvrement(ancienne: readonly ResultatRendu[], nouvelle: readonly ResultatRendu[]): number {
  const a = new Set(ancienne.map(cleDeResultat));
  const b = new Set(nouvelle.map(cleDeResultat));
  if (a.size === 0 && b.size === 0) return 1;
  const communs = [...a].filter((cle) => b.has(cle)).length;
  return communs / (a.size + b.size - communs);
}

/** Un centile, sur des durées en millisecondes.
 *
 *  Par interpolation : avec trente requêtes, le « p95 » par simple index tombe sur la
 *  vingt-neuvième et vaut le maximum, ce qui ferait croire à une mesure plus sévère qu'elle
 *  n'est. */
export function centile(durees: readonly number[], part: number): number {
  if (durees.length === 0) return 0;
  const triees = [...durees].sort((a, b) => a - b);
  if (triees.length === 1) return triees[0]!;
  const position = part * (triees.length - 1);
  const bas = Math.floor(position);
  const haut = Math.ceil(position);
  return triees[bas]! + (triees[haut]! - triees[bas]!) * (position - bas);
}

/** Les citations qui n'existent pas mot pour mot dans leur source (RCH-09, MCP-04).
 *
 *  Zéro, ou pas de bascule. Une réponse qui cite ce qui n'est pas écrit est pire qu'une réponse
 *  absente : elle se croit vérifiée. */
export function citationsNonVerifiees(
  resultats: readonly ResultatRendu[],
  texteDe: (resultat: ResultatRendu) => string | undefined,
): readonly string[] {
  const fautives: string[] = [];
  for (const resultat of resultats) {
    const cite = typeof resultat.content === "string" ? resultat.content : "";
    const source = texteDe(resultat);
    if (source === undefined || !source.includes(cite)) fautives.push(cleDeResultat(resultat));
  }
  return fautives;
}

/** Les seuils, écrits avant la mesure (BAS-03). */
export const SEUILS = {
  /** Aucun ouvrage perdu. Bloquant. */
  ouvragesPerdus: 0,
  /** La latence au 95ᵉ centile ne dépasse pas une fois et demie celle de l'ancienne. */
  facteurLatence: 1.5,
  /** Aucune citation non vérifiée. Bloquant. */
  citationsNonVerifiees: 0,
} as const;

export type VerdictComparaison = {
  readonly tenu: boolean;
  readonly motifs: readonly string[];
};

/** Le verdict, à partir des mesures. Il ne lit rien et n'appelle rien : il applique les seuils. */
export function verdict(mesures: {
  readonly ouvragesPerdus: readonly string[];
  readonly citationsNonVerifiees: readonly string[];
  readonly p95Ancienne: number;
  readonly p95Nouvelle: number;
}): VerdictComparaison {
  const motifs: string[] = [];
  if (mesures.ouvragesPerdus.length > SEUILS.ouvragesPerdus)
    motifs.push(`${mesures.ouvragesPerdus.length} ouvrage(s) ne se retrouvent plus : ${mesures.ouvragesPerdus.join(", ")}`);
  if (mesures.citationsNonVerifiees.length > SEUILS.citationsNonVerifiees)
    motifs.push(`${mesures.citationsNonVerifiees.length} citation(s) n'existent pas mot pour mot dans leur source`);
  if (mesures.p95Ancienne > 0 && mesures.p95Nouvelle > mesures.p95Ancienne * SEUILS.facteurLatence)
    motifs.push(`la nouvelle répond en ${Math.round(mesures.p95Nouvelle)} ms au 95ᵉ centile contre ${Math.round(mesures.p95Ancienne)} ms`);
  return { tenu: motifs.length === 0, motifs };
}
