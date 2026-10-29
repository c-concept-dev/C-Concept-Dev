import type { Observation } from "@lienotheque/contrats";

/** Ce que les noms de fichiers portent, mesuré et non supposé (OUT-10).
 *
 *  ## Pourquoi on n'infère pas un gabarit
 *
 *  La façon naturelle serait de deviner le modèle commun — un préfixe fixe, des champs
 *  variables — puis d'y lire les nombres. Elle échoue sur le premier cas réel venu : deux noms
 *  d'un même lot peuvent porter un intitulé libre qui contient lui-même des chiffres, et leurs
 *  gabarits ne se ressemblent alors plus du tout.
 *
 *      1-01 12_8 Blues And R&B - 123 Pg.67.mp3      six suites de chiffres
 *      2-01 Mali - 718 Pg.197.mp3                   quatre suites de chiffres
 *
 *  ## Ce qu'on fait à la place : ancrer des deux bouts
 *
 *  On relève les suites de chiffres de chaque nom, et on les désigne **par leur rang depuis le
 *  début et par leur rang depuis la fin**. Sur les deux noms ci-dessus, le premier depuis le
 *  début est le support (1, 2), le deuxième depuis le début est l'ordre dans le support (01, 01),
 *  le premier depuis la fin est l'adresse portée par le contenu (67, 197) et le deuxième depuis
 *  la fin l'identifiant (123, 718). Quatre champs stables, sans qu'aucun gabarit n'ait été
 *  deviné, et l'intitulé libre entre les deux ne gêne personne.
 *
 *  ## Ce que ce module ne fait pas
 *
 *  Il ne propose aucun lien. Il décrit des champs et dit ce qu'ils valent : combien de noms les
 *  portent, s'ils sont tous différents, s'ils forment une suite complète, s'ils croissent avec
 *  l'ordre des noms. C'est à partir de ces faits qu'un oracle se construira — ailleurs, et avec
 *  l'autre côté sous les yeux. */

/** D'où un champ est compté. Les deux, parce qu'un intitulé libre au milieu décale l'un sans
 *  toucher l'autre. */
export type Ancrage = "depuis-le-debut" | "depuis-la-fin";

export type ChampDuNom = {
  readonly ancrage: Ancrage;
  /** 1 est le premier. */
  readonly position: number;
  /** Combien de noms portent ce champ. Un champ absent d'un seul nom n'est pas un champ. */
  readonly presentDans: number;
  readonly valeurs: readonly number[];
  readonly distinctes: number;
  readonly minimum: number;
  readonly maximum: number;
  /** Les valeurs couvrent 1..N sans trou ni doublon. Le signe le plus fort qu'un champ est un
   *  ordre et non une donnée quelconque. */
  readonly suiteComplete: boolean;
  /** Les valeurs croissent avec l'ordre alphabétique des noms. Un ordre qui ne croît pas avec
   *  le rangement est un nombre qui se trouve là, pas un rang. */
  readonly croissantAvecLOrdre: boolean;
  /** Le champ garde la même largeur partout (« 01 », « 02 »…). Un remplissage régulier distingue
   *  un rang composé par une machine d'un nombre écrit à la main. */
  readonly largeurConstante: boolean;
};

export type StructureDesNoms = {
  readonly combien: number;
  readonly champs: readonly ChampDuNom[];
  /** Les noms qui ne portent aucun chiffre : ils ne diront jamais rien, et il faut le savoir. */
  readonly sansAucunChiffre: readonly string[];
};

const CHIFFRES = /\d+/g;

/** Les suites de chiffres d'un nom, dans l'ordre, telles qu'elles sont écrites. */
export function suitesDeChiffres(nom: string): readonly string[] {
  return nom.match(CHIFFRES) ?? [];
}

/** Le nom seul, sans son chemin : l'arborescence se lit à part, et mêler les deux ferait d'un
 *  dossier numéroté un champ du nom. */
export const nomSeul = (chemin: string): string => chemin.replaceAll("\\", "/").split("/").pop() ?? chemin;

/** Le nom sans son extension, qui est le seul morceau à lire.
 *
 *  **Une extension porte des chiffres, et ils ne disent rien du contenu.** « .mp3 » en contient
 *  un : sans ce retrait, « le premier nombre depuis la fin » vaut 3 sur tous les noms de la
 *  terre, et le champ qui portait vraiment l'adresse passe en deuxième position sans que rien
 *  ne le signale. Attrapé par les contrôles de ce module, sur le cas même qui l'aurait produit.
 *
 *  On ne retire que la dernière extension, et seulement si elle est courte et sans espace : un
 *  nom comme « Suite 1.2 variations » ne doit pas perdre son « .2 ». */
export const corpsDuNom = (chemin: string): string => {
  const nom = nomSeul(chemin);
  const point = nom.lastIndexOf(".");
  if (point <= 0) return nom;
  const extension = nom.slice(point + 1);
  return /^[A-Za-z][A-Za-z0-9]{0,4}$/.test(extension) ? nom.slice(0, point) : nom;
};

/** Le dossier qui porte un fichier, vide quand il n'y en a pas. */
export const dossierDe = (chemin: string): string => {
  const parties = chemin.replaceAll("\\", "/").split("/");
  parties.pop();
  return parties.join("/");
};

const suiteComplete = (valeurs: readonly number[]): boolean => {
  if (valeurs.length === 0) return false;
  const triees = [...new Set(valeurs)].sort((un, autre) => un - autre);
  if (triees.length !== valeurs.length) return false;
  return triees[0] === 1 && triees[triees.length - 1] === valeurs.length;
};

/** Décrit un champ, ou rend `undefined` quand tous les noms ne le portent pas.
 *
 *  Exiger la présence partout est délibéré : un champ que neuf noms sur dix portent décrira neuf
 *  liens et laissera le dixième à l'abandon, sans que rien ne le signale. Mieux vaut ne pas
 *  retenir le champ et le dire. */
function decrire(
  noms: readonly string[],
  ancrage: Ancrage,
  position: number,
): ChampDuNom | undefined {
  const brutes: string[] = [];
  for (const nom of noms) {
    const suites = suitesDeChiffres(nom);
    const brute = ancrage === "depuis-le-debut" ? suites[position - 1] : suites[suites.length - position];
    if (brute === undefined) return undefined;
    brutes.push(brute);
  }
  const valeurs = brutes.map((brute) => Number.parseInt(brute, 10));
  if (valeurs.some((valeur) => !Number.isFinite(valeur))) return undefined;

  const largeurs = new Set(brutes.map((brute) => brute.length));
  const parOrdre = noms
    .map((nom, rang) => ({ nom, valeur: valeurs[rang]! }))
    .sort((un, autre) => un.nom.localeCompare(autre.nom, "fr"));
  let croissant = true;
  for (let rang = 1; rang < parOrdre.length; rang += 1)
    if (parOrdre[rang]!.valeur < parOrdre[rang - 1]!.valeur) {
      croissant = false;
      break;
    }

  return {
    ancrage,
    position,
    presentDans: noms.length,
    valeurs,
    distinctes: new Set(valeurs).size,
    minimum: Math.min(...valeurs),
    maximum: Math.max(...valeurs),
    suiteComplete: suiteComplete(valeurs),
    croissantAvecLOrdre: croissant,
    largeurConstante: largeurs.size === 1,
  };
}

/** Combien de champs on regarde de chaque côté. Au-delà, on lit l'intérieur d'un intitulé
 *  libre, et ce qu'on y trouve ne veut rien dire. */
const CHAMPS_REGARDES = 4;

/** Ce que les noms d'un lot portent, champ par champ. */
export function structureDesNoms(chemins: readonly string[]): StructureDesNoms {
  const noms = chemins.map(corpsDuNom);
  const sansAucunChiffre = noms.filter((nom) => suitesDeChiffres(nom).length === 0);
  if (noms.length === 0 || sansAucunChiffre.length > 0)
    return { combien: noms.length, champs: [], sansAucunChiffre };

  const champs: ChampDuNom[] = [];
  for (const ancrage of ["depuis-le-debut", "depuis-la-fin"] as const)
    for (let position = 1; position <= CHAMPS_REGARDES; position += 1) {
      const champ = decrire(noms, ancrage, position);
      if (champ !== undefined) champs.push(champ);
    }
  return { combien: noms.length, champs, sansAucunChiffre };
}

/** Le champ qui ressemble le plus à un ordre : une suite complète, de largeur constante.
 *
 *  Rendu seulement quand **un seul** champ y répond. Deux champs également convaincants ne se
 *  départagent pas ici : c'est une ambiguïté réelle, et la trancher au hasard produirait un
 *  oracle net et faux. */
export function champDOrdre(structure: StructureDesNoms): ChampDuNom | undefined {
  const candidats = structure.champs.filter((champ) => champ.suiteComplete && champ.croissantAvecLOrdre);
  if (candidats.length === 0) return undefined;
  const meilleurs = candidats.filter((champ) => champ.largeurConstante);
  const retenus = meilleurs.length > 0 ? meilleurs : candidats;
  // Un champ vu des deux bouts est le même champ : on ne le compte qu'une fois.
  const distincts = retenus.filter(
    (champ, rang) => retenus.findIndex((autre) => JSON.stringify(autre.valeurs) === JSON.stringify(champ.valeurs)) === rang,
  );
  return distincts.length === 1 ? distincts[0] : undefined;
}

/** Ce que l'arborescence porte : des groupes, et parfois un support numéroté.
 *
 *  Le même outil que pour les noms, appliqué aux dossiers. Un dossier `CD1` et un dossier
 *  `[Disc 2]` ne se ressemblent pas, mais tous deux sont « le même libellé avec un nombre qui
 *  change » — et c'est cela qu'on mesure, plutôt qu'une liste de libellés attendus qui laisse
 *  dehors le premier rangement qu'on n'avait pas prévu. */
export type StructureDeLArborescence = {
  readonly dossiers: readonly string[];
  /** Le champ numérique qui distingue les dossiers, quand il y en a exactement un. */
  readonly support?: ChampDuNom | undefined;
  /** Le libellé commun aux dossiers, une fois le nombre retiré. */
  readonly libelleCommun?: string | undefined;
};

export function structureDeLArborescence(chemins: readonly string[]): StructureDeLArborescence {
  const dossiers = [...new Set(chemins.map(dossierDe).filter((dossier) => dossier !== ""))].sort((un, autre) =>
    un.localeCompare(autre, "fr"),
  );
  if (dossiers.length < 2) return { dossiers };

  const squelettes = new Set(dossiers.map((dossier) => dossier.replaceAll(CHIFFRES, "#")));
  if (squelettes.size !== 1) return { dossiers };

  const structure = structureDesNoms(dossiers);
  const support = champDOrdre(structure) ?? structure.champs.find((champ) => champ.distinctes === dossiers.length);
  return {
    dossiers,
    ...(support === undefined ? {} : { support }),
    libelleCommun: [...squelettes][0],
  };
}

/** Ce que le détecteur de noms a vu, dit en clair et avec de quoi le revérifier. */
export function observationsDesNoms(chemins: readonly string[], structure: StructureDesNoms): readonly Observation[] {
  const observations: Observation[] = [];
  if (structure.sansAucunChiffre.length > 0) {
    const combien = structure.sansAucunChiffre.length;
    observations.push({
      detecteur: "noms",
      source: "nom",
      constat: `${combien} nom${combien > 1 ? "s" : ""} ne porte${combien > 1 ? "nt" : ""} aucun chiffre : rien à y lire.`,
      ou: structure.sansAucunChiffre.slice(0, 3).join(", ").slice(0, 200),
      confiance: 1,
    });
    return observations;
  }
  for (const champ of structure.champs) {
    // Le nom complet, extension comprise : c'est lui qu'on ira revoir sur le disque.
    const ou = chemins[0] === undefined ? "—" : nomSeul(chemins[0]);
    observations.push({
      detecteur: "noms",
      source: "nom",
      constat:
        `Le ${champ.position}ᵉ nombre ${champ.ancrage === "depuis-le-debut" ? "depuis le début" : "depuis la fin"} ` +
        `va de ${champ.minimum} à ${champ.maximum}, ${champ.distinctes} valeur${champ.distinctes > 1 ? "s" : ""} distincte${champ.distinctes > 1 ? "s" : ""}` +
        `${champ.suiteComplete ? ", suite complète" : ""}${champ.largeurConstante ? ", largeur constante" : ""}.`,
      ou,
      confiance: champ.suiteComplete ? 1 : 0.5,
    });
  }
  return observations;
}
