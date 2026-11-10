/** Le garde-fou des marges de délai (dette D7, lot 16 de la file).
 *
 *  Un contrôle qui passe à cinquante millisecondes de son délai est un rouge de demain : il
 *  tombera sur une machine chargée, et le jour où il tombera, personne ne saura que la veille il
 *  était déjà à la limite. Ce garde-fou publie la marge de chaque contrôle **mécaniquement**, pour
 *  qu'aucune ne soit calculée à la main.
 *
 *  ## Les deux erreurs qu'il existe pour empêcher, toutes deux mesurées
 *
 *  1. **Un délai supposé.** Les marges publiées jusqu'au 10 novembre 2026 divisaient une durée
 *     par un délai *deviné* : 5 000 ms, « puisque le paquet ne surcharge rien ». Deux fois la
 *     supposition était fausse — `outils/optimiseur` et `outils/recettes` portent 3 600 000 dans
 *     leur configuration, et cinq contrôles de `outils/ingestion` écrivent `300_000` sur leur
 *     propre ligne. D'où trois « contrôles au-dessus de leur délai » annoncés au registre, qui
 *     n'existaient pas. Ici le délai est **lu de vitest**, déjà résolu, jamais déduit d'un
 *     fichier.
 *  2. **Une durée qui n'est pas celle que le délai borne.** La durée qu'affiche le rapporteur
 *     compte les crochets `beforeEach` et `afterEach` en plus du corps ; le délai du contrôle, lui,
 *     ne borne que le **corps** (les crochets ont leur propre délai, `hookTimeout`). Mesuré le
 *     10 novembre : un crochet de 2 000 ms suivi d'un corps de 4 000 ms **passe** sous un délai de
 *     5 000, en affichant 6 009 ms. Une marge tirée de la durée affichée aurait crié au feu.
 *     Ici la marge se calcule sur le corps, chronométré là où il tourne.
 *
 *  La logique est pure et séparée de l'instrument : c'est elle qui est éprouvée, et non la façon
 *  de chronométrer. */

/** Le nom du relevé. Voisin de `.rapport-epingles.json`, et ignoré par git comme lui. */
export const RELEVE_DES_MARGES = ".rapport-marges.jsonl";

/** Une ligne du relevé, telle que le script la relit. */
export type LigneDeReleve = {
  readonly fichier: string;
  readonly nom: string;
  readonly delai: number;
  readonly corps: number;
};

/** Ce que le coureur lit d'une tâche. Volontairement étroit : seuls ces champs comptent, et une
 *  forme étroite se donne à éprouver sans fabriquer une tâche vitest entière. */
export type TacheLue = {
  readonly name: string;
  readonly timeout?: number | undefined;
  readonly type?: string | undefined;
  readonly suite?: TacheLue | undefined;
  readonly file?: { readonly name: string } | undefined;
};

/** Le nom complet, suites comprises, dans la forme que le rapport des épingles emploie.
 *
 *  Les deux garde-fous doivent nommer le même contrôle de la même façon, sinon on ne peut pas
 *  rapprocher une marge courte d'un rouge épinglé.
 *
 *  Les niveaux sont joints par une **espace**, jamais par « > » : c'est ce que le `fullName` du
 *  rapporteur donne. La liste des épingles porte la même remarque, et pour cause — pris pour un
 *  « > » le 5 novembre 2026, ce séparateur a fait déclarer régression un échec bel et bien
 *  épinglé. */
export function nomComplet(tache: TacheLue): string {
  const noms: string[] = [tache.name];
  let parent = tache.suite;
  while (parent !== undefined && parent.type === "suite") {
    noms.unshift(parent.name);
    parent = parent.suite;
  }
  return noms.join(" ");
}

/** La ligne à inscrire, ou rien.
 *
 *  Un contrôle dont le délai n'est pas résolu ne se juge pas : on ne lui en suppose **pas** un.
 *  C'est la faute même que ce garde-fou existe pour empêcher. */
export function ligneDe(tache: TacheLue, corps: number): LigneDeReleve | undefined {
  const delai = tache.timeout;
  if (typeof delai !== "number" || delai <= 0) return undefined;
  return {
    fichier: tache.file?.name ?? "(fichier inconnu)",
    nom: nomComplet(tache),
    delai,
    corps: Math.round(corps),
  };
}

/** Ce que l'instrument a relevé autour d'un corps de contrôle. */
export type Mesure = {
  readonly paquet: string;
  /** Chemin du fichier de contrôle, relatif au paquet. */
  readonly fichier: string;
  /** Nom complet du contrôle, suites comprises, tel que le rapport des épingles le nomme. */
  readonly nom: string;
  /** Le délai **effectif** du contrôle en millisecondes, lu de vitest. */
  readonly delai: number;
  /** La durée du **corps** en millisecondes : ce que le délai borne. */
  readonly corps: number;
};

/** La barre, telle que `fixtures/references/marges-de-delai.json` la porte.
 *
 *  `barre` à `null` veut dire « non fixée » : le garde-fou publie alors les marges et ne refuse
 *  rien. C'est l'état voulu jusqu'à ce que Christophe pose le chiffre — un seuil inventé ici
 *  serait exactement la faute que ce lot combat. `proposee` ne sert qu'à montrer ce qui serait
 *  refusé si elle était posée. */
export type Barre = {
  readonly barre: number | null;
  readonly proposee: number;
};

export type MargeMesuree = Mesure & {
  /** `delai / corps`. Une marge de ×2 veut dire « le corps pourrait doubler sans tomber ». */
  readonly marge: number;
};

export type VerdictDesMarges = {
  /** Les marges sous la barre. Chacune refuse le passage — quand la barre est fixée. */
  readonly serrees: readonly MargeMesuree[];
  /** Les marges les plus courtes du passage, dites dans tous les cas. */
  readonly lesPlusCourtes: readonly MargeMesuree[];
  /** La barre employée, et si elle vient de Christophe ou de la proposition. */
  readonly barre: number;
  readonly barreFixee: boolean;
  readonly combienMesures: number;
};

/** La marge d'une mesure. Un corps trop bref pour être chronométré ne borne rien : sa marge est
 *  infinie, et c'est la vérité — pas une division par zéro à cacher. */
export const margeDe = (mesure: Mesure): number =>
  mesure.corps <= 0 ? Number.POSITIVE_INFINITY : mesure.delai / mesure.corps;

/** Juge un passage contre la barre. Ne lance rien, ne lit aucun fichier.
 *
 *  `combien` dit combien de marges les plus courtes sont rapportées dans tous les cas : lire les
 *  plus serrées à chaque passage est ce qui permet de voir une marge se refermer d'une course à
 *  l'autre, avant qu'elle ne passe sous la barre. */
export function jugerLesMarges(
  mesures: readonly Mesure[],
  barre: Barre,
  combien = 10,
): VerdictDesMarges {
  const retenue = barre.barre ?? barre.proposee;
  const classees = mesures
    .map((mesure) => ({ ...mesure, marge: margeDe(mesure) }))
    .sort((a, b) => a.marge - b.marge);
  return {
    serrees: classees.filter((m) => m.marge < retenue),
    lesPlusCourtes: classees.slice(0, combien),
    barre: retenue,
    barreFixee: barre.barre !== null,
    combienMesures: mesures.length,
  };
}

/** Le passage est-il acceptable de ce point de vue ?
 *
 *  Tant que la barre n'est pas fixée, **oui** : le garde-fou signale, et un chiffre que personne
 *  n'a posé ne refuse pas un passage. Il ne rallonge jamais un délai non plus — ni ici, ni
 *  ailleurs : allonger un délai pour faire taire une marge serait cacher la lenteur au lieu de la
 *  nommer. */
export const accepteLesMarges = (verdict: VerdictDesMarges): boolean =>
  !verdict.barreFixee || verdict.serrees.length === 0;

const enMarge = (marge: number): string =>
  marge === Number.POSITIVE_INFINITY ? "×∞" : `×${marge.toFixed(2)}`;

/** Ce qu'on en dit, en français, sans jargon. */
export function raconterLesMarges(verdict: VerdictDesMarges): string[] {
  const dits: string[] = [`${verdict.combienMesures} corps de contrôle chronométrés`];
  if (!verdict.barreFixee)
    dits.push(
      `barre non fixée : aucun refus. À la barre proposée de ×${verdict.barre}, ` +
        `${verdict.serrees.length} contrôle(s) seraient refusés.`,
    );
  for (const m of verdict.lesPlusCourtes)
    dits.push(
      `${enMarge(m.marge).padStart(8)} — ${Math.round(m.corps)} ms de corps pour un délai de ` +
        `${m.delai} · ${m.paquet} · ${m.fichier} · ${m.nom}`,
    );
  if (verdict.barreFixee)
    for (const m of verdict.serrees)
      dits.push(
        `MARGE TROP COURTE — ${enMarge(m.marge)} sous la barre de ×${verdict.barre} : ` +
          `${m.paquet} · ${m.nom}. Rendez le corps plus court ; n'allongez pas le délai.`,
      );
  return dits;
}
