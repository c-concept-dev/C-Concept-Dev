/** Le garde-fou des échecs épinglés (règle du 5 novembre 2026).
 *
 *  `pnpm check` passe **hors** échecs épinglés ; tout autre rouge est une régression et bloque le
 *  commit. Deux refus, et le second compte autant que le premier :
 *
 *  1. un échec qu'aucune épingle ne couvre — c'est une régression ;
 *  2. une épingle dont le contrôle **passe** — l'épingle a survécu à sa cause, et une épingle
 *     qui survit à sa cause éteint la valeur du rouge. C'est la dette exacte du job « Rendu »,
 *     rouge en permanence depuis le 29 octobre : on finit par ne plus lire le rouge.
 *
 *  Un contrôle **sauté** n'est ni l'un ni l'autre : l'intégration continue saute les contrôles qui
 *  demandent des œuvres non versionnées. On le dit, on ne le refuse pas.
 *
 *  La logique est pure et séparée du script : c'est elle qui est éprouvée, et non la façon de
 *  lancer les tests. */

/** Une épingle, telle que `fixtures/references/echecs-connus.json` la porte. Seuls ces champs
 *  sont comparés ; le reste du fichier est pour les humains. */
export type ControleEpingle = {
  /** Nom complet du contrôle, tel que le rapport le donne. Comparé à l'identique. */
  readonly nom: string;
  /** Fragment attendu du message d'échec. Comparé par inclusion : un message porte des chemins
   *  et des couleurs qui ne sont pas à nous. */
  readonly message: string;
};

export type Epingle = {
  readonly id: string;
  readonly paquet: string;
  /** Chemin du fichier de contrôle, relatif au paquet. Comparé en suffixe. */
  readonly fichier: string;
  /** Outils dont l'**absence** est la cause de l'échec épinglé.
   *
   *  Une épingle dont la cause est « tel moteur n'est pas installé » ne vaut **que là où il
   *  manque**. Sur une machine qui l'a, le contrôle passe — et le déclarer « périmé » bloquerait
   *  le contrôle local pour un échec qui n'y existe pas, alors qu'il est bien réel ailleurs.
   *  Mesuré le 5 novembre 2026 : l'épingle Tesseract, rouge en intégration continue, verte sur la
   *  machine de Christophe.
   *
   *  On éprouve la **cause**, pas un nom d'environnement : « CI » ou « local » changeraient le
   *  jour où l'un des deux installe l'outil, et l'épingle mentirait sans qu'on s'en aperçoive. */
  readonly absenceRequise?: readonly string[] | undefined;
  /** Les contrôles que cette épingle couvre. **Une liste, et non un seul** : une même cause fait
   *  souvent tomber plusieurs contrôles du même fichier — l'absence de Tesseract en fait tomber
   *  deux. Un seul nom par épingle aurait laissé le second passer pour une régression, et
   *  l'épingle aurait menti par omission. */
  readonly controles: readonly ControleEpingle[];
};

/** Un contrôle, tel qu'un rapport de passage le rend. */
export type Controle = {
  readonly paquet: string;
  readonly fichier: string;
  readonly nom: string;
  readonly etat: "passe" | "echoue" | "saute";
  readonly message?: string | undefined;
};

export type Verdict = {
  /** Échecs qu'aucune épingle ne couvre. Chacun bloque. */
  readonly regressions: readonly Controle[];
  /** Épingles dont le contrôle passe. Chacune bloque : elle doit être retirée. */
  readonly epinglesPerimees: readonly Epingle[];
  /** Épingles rencontrées et bien rouges. Ce sont les seules tolérées. */
  readonly epinglesTenues: readonly Epingle[];
  /** Épingles dont le contrôle n'a pas tourné, ou a été sauté. Dites, pas refusées. */
  readonly epinglesNonRencontrees: readonly Epingle[];
  /** Épingles qui ne valent pas ici : l'outil dont elles attendent l'absence est présent.
   *  Ni tenues, ni périmées, et surtout pas refusées — simplement hors de leur contexte. */
  readonly epinglesHorsContexte: readonly Epingle[];
  /** Échecs épinglés par leur nom, mais dont le message ne correspond pas.
   *
   *  Ils bloquent, et c'est voulu : une épingle couvre **une** cause, pas un nom de contrôle.
   *  Le même contrôle peut tomber pour une autre raison, et ce serait une régression déguisée. */
  readonly messagesInattendus: readonly { readonly controle: Controle; readonly epingle: Epingle }[];
};

const memeFichier = (controle: Controle, epingle: Epingle): boolean =>
  controle.paquet === epingle.paquet &&
  (controle.fichier === epingle.fichier || controle.fichier.endsWith(`/${epingle.fichier}`));

/** L'entrée de l'épingle qui vise ce contrôle, s'il y en a une. */
const visePar = (controle: Controle, epingle: Epingle): ControleEpingle | undefined =>
  memeFichier(controle, epingle) ? epingle.controles.find((c) => c.nom === controle.nom) : undefined;

const trouverEpingle = (
  controle: Controle,
  epingles: readonly Epingle[],
): { epingle: Epingle; vise: ControleEpingle } | undefined => {
  for (const epingle of epingles) {
    const vise = visePar(controle, epingle);
    if (vise !== undefined) return { epingle, vise };
  }
  return undefined;
};

/** Juge un passage contre les épingles. Ne lance rien, ne lit aucun fichier.
 *
 *  `estPresent` dit si un outil est disponible ici ; le script le branche, pour que cette fonction
 *  reste pure et éprouvable. Sans lui, tout est tenu pour présent. */
export function juger(
  controles: readonly Controle[],
  toutesLesEpingles: readonly Epingle[],
  estPresent: (outil: string) => boolean = () => true,
): Verdict {
  const horsContexte = toutesLesEpingles.filter((e) => (e.absenceRequise ?? []).some(estPresent));
  const horsContexteIds = new Set(horsContexte.map((e) => e.id));
  const epingles = toutesLesEpingles.filter((e) => !horsContexteIds.has(e.id));
  const regressions: Controle[] = [];
  const messagesInattendus: { controle: Controle; epingle: Epingle }[] = [];
  const tenues = new Set<string>();
  const vuesPassantes = new Set<string>();

  for (const controle of controles) {
    const trouve = trouverEpingle(controle, epingles);
    if (controle.etat === "echoue") {
      if (trouve === undefined) regressions.push(controle);
      else if ((controle.message ?? "").includes(trouve.vise.message)) tenues.add(trouve.epingle.id);
      else messagesInattendus.push({ controle, epingle: trouve.epingle });
      continue;
    }
    // Un seul des contrôles d'une épingle qui repasse suffit à la dire périmée : la cause ne
    // couvre plus tout ce qu'elle prétendait couvrir, et il faut la relire.
    if (controle.etat === "passe" && trouve !== undefined) vuesPassantes.add(trouve.epingle.id);
  }

  return {
    regressions,
    epinglesPerimees: epingles.filter((e) => vuesPassantes.has(e.id)),
    epinglesTenues: epingles.filter((e) => tenues.has(e.id)),
    epinglesNonRencontrees: epingles.filter((e) => !tenues.has(e.id) && !vuesPassantes.has(e.id)),
    epinglesHorsContexte: horsContexte,
    messagesInattendus,
  };
}

/** Le passage est-il acceptable ? Une seule question, une seule réponse. */
export const accepte = (verdict: Verdict): boolean =>
  verdict.regressions.length === 0 &&
  verdict.epinglesPerimees.length === 0 &&
  verdict.messagesInattendus.length === 0;

/** Ce qu'on en dit, en français, sans jargon. */
export function raconter(verdict: Verdict): string[] {
  const dits: string[] = [];
  for (const controle of verdict.regressions)
    dits.push(`RÉGRESSION — ${controle.paquet} · ${controle.fichier} · ${controle.nom}\n    ${controle.message ?? "sans message"}`);
  for (const { controle, epingle } of verdict.messagesInattendus) {
    const attendu = epingle.controles.find((c) => c.nom === controle.nom)?.message ?? "(sans message attendu)";
    dits.push(
      `AUTRE CAUSE — ${controle.paquet} · ${controle.nom} est épinglé, mais pour « ${attendu} ».\n` +
        `    Il tombe ici sur : ${controle.message ?? "sans message"}`,
    );
  }
  for (const epingle of verdict.epinglesPerimees)
    dits.push(`ÉPINGLE PÉRIMÉE — « ${epingle.id} » passe maintenant : retirez-la de la liste.`);
  for (const epingle of verdict.epinglesTenues) dits.push(`épinglé, toujours rouge — ${epingle.id}`);
  for (const epingle of verdict.epinglesNonRencontrees)
    dits.push(`épinglé, non rencontré (sauté ou absent de ce passage) — ${epingle.id}`);
  for (const epingle of verdict.epinglesHorsContexte)
    dits.push(
      `épinglé, hors contexte ici — ${epingle.id} : son échec vient de l'absence de ` +
        `${(epingle.absenceRequise ?? []).join(", ")}, présent sur cette machine. ` +
        `Il reste rouge là où l'outil manque.`,
    );
  return dits;
}
