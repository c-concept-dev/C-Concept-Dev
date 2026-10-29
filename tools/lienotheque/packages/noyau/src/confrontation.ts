import type { Oracle, SourceObservation, Verdict } from "@lienotheque/contrats";

/** Confronter des oracles, et en tirer un verdict (OUT-10).
 *
 *  ## Pourquoi confronter plutôt que fusionner
 *
 *  Fusionner deux hypothèses, c'est fabriquer une troisième que personne n'a éprouvée, et dont
 *  les désaccords ont disparu dans l'opération. Les confronter, c'est garder les deux et regarder
 *  où elles divergent — le désaccord est alors une information, pas une gêne à résorber.
 *
 *  ## Ce que « indépendant » veut dire ici, et pourquoi c'est tout l'enjeu
 *
 *  Deux oracles ne sont indépendants que s'ils ne tiennent pas leur savoir de la même source.
 *  Deux façons de lire un nom de fichier ne font pas deux témoins : elles se tromperont ensemble
 *  le jour où le nom ment. Un nom et une page, si.
 *
 *  Mesuré le 29 octobre 2026 : un recueil de la bibliothèque n'a qu'une source — ses marques
 *  visuelles ; ses fichiers ne portent qu'un rang dans leur nom, rien à recouper. Il publie
 *  quand même, parce que quelqu'un l'a vérifié. Un autre recueil n'a **aucune** source : ses
 *  liens venaient d'une règle, pas d'une lecture. Il porte pourtant le même marqueur « vérifié »,
 *  posé à la main. C'est pourquoi l'œil ne compte qu'à côté d'une source, jamais seul.
 */

/** Les sources dont un oracle tient ce qu'il avance. */
export function sourcesDUnOracle(oracle: Oracle): ReadonlySet<SourceObservation> {
  const sources = new Set<SourceObservation>();
  for (const proposition of oracle.propositions)
    for (const observation of proposition.observations) sources.add(observation.source);
  return sources;
}

/** Un repère sur lequel deux oracles ne disent pas la même chose. */
export type Desaccord = {
  readonly rang: number;
  readonly avis: readonly { readonly oracle: string; readonly piece: string }[];
};

export type Confrontation = {
  readonly conteneur: string;
  readonly oracles: readonly string[];
  readonly sources: readonly SourceObservation[];
  /** Deux sources différentes se sont **recoupées sur un même repère** : la condition de la
   *  première voie de publication. Leur simple présence dans le conteneur ne suffit pas. */
  readonly independants: boolean;
  /** Les repères où au moins deux oracles proposent la même pièce. */
  readonly accords: readonly number[];
  readonly desaccords: readonly Desaccord[];
  /** Les repères qu'un seul oracle couvre. Ce n'est pas un désaccord : c'est un silence. */
  readonly couvertsParUnSeul: readonly number[];
};

/** Met des oracles face à face, sans en préférer aucun.
 *
 *  Les oracles doivent porter le même conteneur : confronter deux hypothèses faites sur deux
 *  documents différents ne veut rien dire, et le laisser passer produirait un accord par
 *  hasard entre deux choses sans rapport. */
export function confronter(oracles: readonly Oracle[]): Confrontation {
  if (oracles.length === 0)
    return { conteneur: "", oracles: [], sources: [], independants: false, accords: [], desaccords: [], couvertsParUnSeul: [] };

  const conteneur = oracles[0]!.conteneur;
  for (const oracle of oracles)
    if (oracle.conteneur !== conteneur)
      throw new Error("Confronter des oracles faits sur deux conteneurs différents n'a pas de sens");

  const sources = new Set<SourceObservation>();
  for (const oracle of oracles) for (const source of sourcesDUnOracle(oracle)) sources.add(source);

  /** Ce que chaque oracle propose, repère par repère, avec les sources dont il le tient. */
  const parSource = new Map(oracles.map((oracle) => [oracle.id, sourcesDUnOracle(oracle)]));
  const parRang = new Map<number, { oracle: string; piece: string }[]>();
  for (const oracle of oracles)
    for (const proposition of oracle.propositions) {
      const avis = parRang.get(proposition.repere.rang) ?? [];
      avis.push({ oracle: oracle.id, piece: proposition.piece });
      parRang.set(proposition.repere.rang, avis);
    }

  const accords: number[] = [];
  const desaccords: Desaccord[] = [];
  const couvertsParUnSeul: number[] = [];
  /** Les sources qui se sont réellement recoupées, sur au moins un repère. */
  const sourcesQuiSeRecoupent = new Set<SourceObservation>();
  for (const [rang, avis] of [...parRang].sort(([un], [autre]) => un - autre)) {
    if (avis.length === 1) {
      couvertsParUnSeul.push(rang);
      continue;
    }
    const pieces = new Set(avis.map((un) => un.piece));
    if (pieces.size !== 1) {
      desaccords.push({ rang, avis });
      continue;
    }
    accords.push(rang);
    // Un accord ne fait un recoupement que si les deux côtés savent par des voies différentes.
    // Deux façons de lire un nom se tromperont ensemble le jour où le nom ment.
    const venues = new Set<SourceObservation>();
    for (const un of avis) for (const source of parSource.get(un.oracle) ?? []) venues.add(source);
    if (venues.size >= 2) for (const source of venues) sourcesQuiSeRecoupent.add(source);
  }

  return {
    conteneur,
    oracles: oracles.map((oracle) => oracle.id),
    sources: [...sources].sort(),
    // **L'accord est la preuve, pas la coexistence.** Deux sources présentes dans un même
    // conteneur ne se corroborent pas : il faut qu'elles aient dit la même chose du même repère.
    // Trouvé en préparant la calibration — un recueil dont la marque de page est le seul témoin
    // du lien, et dont les noms de fichiers identifient seulement les pièces, passait pour
    // corroboré alors qu'aucun recoupement n'avait eu lieu.
    independants: sourcesQuiSeRecoupent.size >= 2,
    accords,
    desaccords,
    couvertsParUnSeul,
  };
}

/** Ce qu'une hypothèse a donné sur des repères qu'elle n'avait pas vus.
 *
 *  `nonJugeables` n'est pas un détail de comptabilité : ce sont les témoins sur lesquels rien
 *  d'indépendant ne permettait de dire si l'oracle avait raison. Les compter comme réussis
 *  ferait passer un silence pour une preuve — c'est exactement la faute qu'un score de 98 sur 98
 *  a coûtée le 29 octobre, où l'oracle de référence ne portait pas la page qu'il prétendait
 *  valider. */
export type EpreuveSurTemoins = {
  readonly tenus: readonly number[];
  readonly manques: readonly number[];
  readonly nonJugeables: readonly number[];
};

/** Une épreuve réussit quand elle n'a rien manqué **et** qu'elle a vraiment jugé quelque chose. */
export const epreuveReussie = (epreuve: EpreuveSurTemoins): boolean =>
  epreuve.manques.length === 0 && epreuve.tenus.length > 0;

export type OptionsVerdict = {
  /** Ce que chaque oracle a donné sur ses témoins, par identifiant d'oracle. */
  readonly epreuves: ReadonlyMap<string, EpreuveSurTemoins>;
  /** Quelqu'un a vérifié **ce conteneur-ci** et l'a consigné. */
  readonly verifieParUnHumain: boolean;
};

/** Du face-à-face au verdict (OUT-10).
 *
 *  ## L'ordre des refus, et pourquoi il est celui-là
 *
 *  Les refus sont rangés du fait le plus dur au manque le plus réparable :
 *
 *  1. **Rien à éprouver** — aucun oracle. Il n'y a pas d'hypothèse.
 *  2. **Un fait contraire** — deux oracles se contredisent. Trancher ici reviendrait à choisir
 *     le plus bavard, pas le plus juste.
 *  3. **Une hypothèse réfutée** — elle a été confrontée à des repères neufs, et elle n'a pas
 *     tenu.
 *  4. **Une hypothèse non éprouvée** — elle n'a jamais été confrontée. Elle n'est pas fausse,
 *     elle n'est pas prouvée. C'est réparable sans personne : il suffit de l'éprouver.
 *  5. **Une seule façon de savoir, et personne n'a regardé** — réparable, mais cela demande un
 *     œil, donc du temps humain. C'est pour cela qu'il vient en dernier : on ne dérange quelqu'un
 *     qu'après avoir épuisé ce que la machine pouvait faire seule.
 */
export function verdictDuMoteur(confrontation: Confrontation, options: OptionsVerdict): Verdict {
  if (confrontation.oracles.length === 0)
    return {
      etat: "abstention",
      motif: "aucun_oracle",
      pourquoi: "Aucune façon de lire n’a rien trouvé à relier dans ce conteneur.",
      pourLever: "Déposer les pièces avec le conteneur, ou vérifier que leurs noms portent un repère.",
    };

  if (confrontation.desaccords.length > 0) {
    const combien = confrontation.desaccords.length;
    return {
      etat: "abstention",
      motif: "oracles_en_desaccord",
      pourquoi: `Deux façons de lire se contredisent sur ${combien} repère${combien > 1 ? "s" : ""}.`,
      pourLever: `Regarder ${combien > 1 ? "ces repères" : "ce repère"} et trancher : ${confrontation.desaccords
        .slice(0, 6)
        .map((desaccord) => desaccord.rang)
        .join(", ")}${combien > 6 ? "…" : ""}.`,
    };
  }

  const echoues = confrontation.oracles.filter((oracle) => {
    const epreuve = options.epreuves.get(oracle);
    return epreuve !== undefined && epreuve.manques.length > 0;
  });
  if (echoues.length > 0)
    return {
      etat: "abstention",
      motif: "temoins_en_echec",
      pourquoi: `Confrontée à des repères qu’elle n’avait pas vus, la lecture « ${echoues[0]} » s’est trompée.`,
      pourLever: "Reprendre l’hypothèse : ce qu’elle a appris ne vaut pas au-delà de ce qu’elle a vu.",
    };

  const nonEprouves = confrontation.oracles.filter((oracle) => {
    const epreuve = options.epreuves.get(oracle);
    return epreuve === undefined || !epreuveReussie(epreuve);
  });
  if (nonEprouves.length > 0)
    return {
      etat: "abstention",
      motif: "temoins_non_eprouves",
      pourquoi: `La lecture « ${nonEprouves[0]} » n’a jamais été confrontée à des repères qu’elle n’avait pas vus.`,
      pourLever: "L’éprouver sur des repères tenus à l’écart : cela ne demande personne.",
    };

  if (!confrontation.independants && !options.verifieParUnHumain)
    return {
      etat: "abstention",
      motif: "oracle_unique_sans_verification",
      pourquoi: `Une seule façon de savoir appuie ces liens (${confrontation.sources.join(", ")}), et personne n’a encore vérifié ce conteneur.`,
      pourLever: "Ouvrir quelques liens et confirmer qu’ils tombent juste, ou trouver une seconde façon de lire.",
    };

  return {
    etat: "publie",
    oracles: [...confrontation.oracles],
    verifieParUnHumain: options.verifieParUnHumain,
    pourquoi: confrontation.independants
      ? `Deux façons de lire indépendantes s’accordent (${confrontation.sources.join(", ")}), sur ${confrontation.accords.length} repère${confrontation.accords.length > 1 ? "s" : ""}.`
      : `Une seule façon de lire (${confrontation.sources.join(", ")}), confirmée par une vérification de ce conteneur.`,
  };
}
