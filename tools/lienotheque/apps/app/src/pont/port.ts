import type {
  ApercuDocument,
  ArriveeDeFichiers,
  ClassementLocal,
  DescriptionBibliotheque,
  Doublons,
  Passage,
  Recette,
  ReglagesHote,
  RetraitDeDocument,
  Travail,
  TraductionDePage,
  VueBibliotheque,
} from "@lienotheque/contrats";

/** Ce que l'application demande à son hôte — en **deux** contrats, et non un (PLT-02, PLT-03).
 *
 *  Le bureau **construit** une bibliothèque ; la version en ligne **consulte** ce qu'il a
 *  produit. Un port unique obligeait la seconde à répondre à des questions qui n'ont pas de sens
 *  chez elle : « quel dossier ouvrir ? » n'existe pas dans un navigateur, et un refus élégant
 *  n'aurait fait qu'habiller le malentendu.
 *
 *  Le partage vient des **gestes qui appellent**, relevés le 18 octobre 2026 : `creer`,
 *  `ouvrir`, `organiser`, `deposerDesFichiers`, `agir`, `essayer`, `enregistrer` et
 *  `montrerLesPages` construisent ; tout le reste lit.
 *
 *  Sept fonctions pour lire, quinze pour construire. Le déséquilibre est le résultat :
 *  **la version en ligne est une petite chose**, à condition de ne pas lui demander d'être le
 *  bureau.
 *
 *  `reglages` n'entre dans aucun des deux : aucun écran ne l'appelle, et l'inscrire obligerait la
 *  version en ligne à implémenter du vide. `oublierBibliotheque` y est entrée le 21 octobre 2026,
 *  avec l'écran qui retire une bibliothèque — une capacité que l'hôte avait depuis longtemps et
 *  que rien ne proposait.
 *  Et `estBureau` non plus : elle **choisit** entre les deux ports, elle n'en est pas membre.
 */

/** Lire ce qui existe, et le ranger. Les deux implémentations le remplissent.
 *
 *  `classerDocument` y figure bien qu'elle écrive : le geste vit dans le Catalogue — décidé
 *  ainsi plutôt que dans Organisation — et c'est le geste d'un lecteur sur ce qu'il lit. Le
 *  second utilisateur a d'ailleurs « lecture et contribution » depuis E1. */
export type PortDeLecture = {
  readonly apercuDeBibliotheque: (racine: string) => Promise<readonly ApercuDocument[]>;
  readonly vueDeDocument: (racine: string, empreinte: string) => Promise<VueBibliotheque | undefined>;
  readonly passagesDeDocument: (racine: string, empreinte: string) => Promise<readonly Passage[]>;
  readonly versionActive: (racine: string, empreinte: string) => Promise<string | undefined>;
  readonly imageDePage: (racine: string, version: string, fichier: string) => Promise<string | undefined>;
  /** Facultative : le bureau reste local et ne sollicite jamais Workers AI. */
  readonly traduirePage?: (racine: string, version: string, page: number) => Promise<TraductionDePage>;
  readonly classementsDeBibliotheque: (racine: string) => Promise<ReadonlyMap<string, ClassementLocal>>;
  readonly classerDocument: (racine: string, classement: ClassementLocal) => Promise<void>;
};

/** Construire et administrer. **Le bureau seul.**
 *
 *  Tout ce qui désigne un emplacement sur la machine, met un travail en file, ou règle la
 *  manière de lire. L'écran Dépôt n'existe pas en ligne, et avec lui disparaissent la file et
 *  ses gestes. */
export type PortAdministration = {
  readonly creerBibliotheque: (racine: string, description: DescriptionBibliotheque) => Promise<string>;
  readonly lireBibliotheque: (racine: string) => Promise<DescriptionBibliotheque | undefined>;
  readonly ecrireBibliotheque: (racine: string, description: DescriptionBibliotheque) => Promise<void>;
  readonly retenirBibliotheque: (racine: string) => Promise<ReglagesHote>;
  /** Retirer de la liste sans toucher au dossier. **Oublier n'est pas supprimer.** */
  readonly oublierBibliotheque: (racine: string) => Promise<ReglagesHote>;
  /** Mettre le dossier à la corbeille, et l'oublier. Rend où il a atterri. */
  readonly supprimerBibliotheque: (racine: string) => Promise<string>;
  readonly bibliothequesRetenues: () => Promise<readonly { racine: string; description: DescriptionBibliotheque }[]>;

  /** Désigner sur la machine : ce que la version en ligne ne peut pas faire, et n'a pas à feindre. */
  readonly choisirDossier: (titre: string) => Promise<string | undefined>;
  readonly choisirFichiers: (titre: string) => Promise<readonly string[]>;

  /** La file : la remplir, la faire tourner, la lire, agir dessus. */
  readonly deposer: (racine: string, chemins: readonly string[]) => Promise<ArriveeDeFichiers>;
  readonly faireTourner: (racine: string) => Promise<boolean>;
  readonly travauxDe: (racine: string) => Promise<readonly Travail[]>;
  readonly agirSurTravail: (
    racine: string,
    id: string,
    action: "pause" | "reprendre" | "annuler",
  ) => Promise<Travail>;

  /** La manière de lire : l'essayer sans rien enregistrer, puis l'enregistrer (REC-07). */
  /** Les pages d'un document déposé, désigné **par son empreinte** : c'est elle qui le range,
   *  et deux documents peuvent porter le même nom sans avoir rien à voir. Le nom suit tout de
   *  même, pour son extension et pour ce qu'on dit à l'écran. */
  readonly apercuDePages: (
    racine: string,
    empreinte: string,
    nom: string,
    depuis: number,
    combien: number,
  ) => Promise<readonly { rang: number; image: string }[]>;
  readonly essayerManiere: (
    racine: string,
    empreinte: string,
    nom: string,
    recette: unknown,
    depuis: number,
    pages: number,
  ) => Promise<VueBibliotheque>;
  readonly enregistrerManiere: (racine: string, recette: unknown) => Promise<string>;
  readonly lireManiere: (racine: string) => Promise<Recette | undefined>;

  /** Relire localement une page reconnue par OCR, sans réécrire la version conservée. Le Lecteur
   *  s'en sert pour ne pas propager à l'écran un ordre de colonnes manifestement abîmé. */
  readonly relireTexteDePage: (racine: string, version: string, fichier: string, langue: string) => Promise<string | undefined>;

  /** Les décisions de Vérifier vivent dans la bibliothèque, pas dans la page (UX-03, SYN-07). */
  readonly lireDecisions: (racine: string, empreinte: string) => Promise<ReadonlyMap<string, DecisionVerification>>;
  readonly enregistrerDecision: (
    racine: string,
    empreinte: string,
    cas: string,
    decision: DecisionVerification,
  ) => Promise<void>;
  readonly annulerDecision: (racine: string, empreinte: string, cas: string) => Promise<void>;

  /** Tenir la bibliothèque : repérer ce qui s'y trouve deux fois, retirer ce dont on ne veut plus.
   *
   *  **Deux fonctions, et non une.** Chercher décrit, retirer agit, et rien ne va de l'une à
   *  l'autre sans qu'on l'ait demandé — aucune mesure de texte ne distingue un vrai doublon d'un
   *  même ouvrage en deux formats (HER-07, HER-08). */
  readonly doublonsDeBibliotheque: (racine: string) => Promise<Doublons>;
  readonly retirerDocument: (racine: string, empreinte: string) => Promise<RetraitDeDocument>;
};

export type DecisionVerification = "confirme" | "corrige" | "ignore" | "vu";

/** Les noms de chaque port, pour que le partage soit vérifiable à l'exécution.
 *
 *  Un type disparaît à la compilation : il ne peut pas empêcher quelqu'un de glisser demain une
 *  écriture dans le port de lecture, ni d'y oublier une fonction. Ces deux listes le peuvent,
 *  et leur test s'en sert. */
export const NOMS_DE_LECTURE = [
  "apercuDeBibliotheque",
  "vueDeDocument",
  "passagesDeDocument",
  "versionActive",
  "imageDePage",
  "classementsDeBibliotheque",
  "classerDocument",
] as const satisfies readonly (keyof PortDeLecture)[];

export const NOMS_D_ADMINISTRATION = [
  "creerBibliotheque",
  "lireBibliotheque",
  "ecrireBibliotheque",
  "retenirBibliotheque",
  "oublierBibliotheque",
  "supprimerBibliotheque",
  "bibliothequesRetenues",
  "choisirDossier",
  "choisirFichiers",
  "deposer",
  "faireTourner",
  "travauxDe",
  "agirSurTravail",
  "apercuDePages",
  "essayerManiere",
  "enregistrerManiere",
  "lireManiere",
  "relireTexteDePage",
  "lireDecisions",
  "enregistrerDecision",
  "annulerDecision",
  "doublonsDeBibliotheque",
  "retirerDocument",
] as const satisfies readonly (keyof PortAdministration)[];
