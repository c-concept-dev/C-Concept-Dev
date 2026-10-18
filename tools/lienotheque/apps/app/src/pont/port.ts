import type {
  ApercuDocument,
  ArriveeDeFichiers,
  ClassementLocal,
  DescriptionBibliotheque,
  Passage,
  Recette,
  ReglagesHote,
  Travail,
  VueBibliotheque,
} from "@lienotheque/contrats";

/** Ce que l'application demande à son hôte, et rien de plus (PLT-02, PLT-03).
 *
 *  **Un port, deux implémentations.** Le bureau parle à l'hôte Tauri ; la version en ligne
 *  parlera à la façade Worker (décision du 18 octobre 2026). L'application, elle, ne doit
 *  connaître ni l'un ni l'autre — elle connaît ce contrat.
 *
 *  Ce type ne change rien au comportement : il **nomme** ce qui existait déjà, pour que la
 *  seconde implémentation ait une forme à remplir plutôt qu'un fichier à imiter.
 *
 *  **Deux fonctions du pont de bureau n'y figurent pas, et c'est délibéré.**
 *
 *  `estBureau()` n'est pas une donnée : c'est ce qui **choisit** entre deux ports. La mettre
 *  dedans reviendrait à demander à chaque implémentation de dire si elle est l'autre.
 *
 *  `oublierBibliotheque()` n'a aucun appelant dans l'application — vérifié le 18 octobre 2026.
 *  L'inscrire au port obligerait la version en ligne à implémenter ce que personne ne demande.
 *  Elle reste disponible côté bureau ; le jour où un écran l'appellera, elle rejoindra le port
 *  avec sa seconde implémentation.
 */
export type PortDeDonnees = {
  /** Bibliothèques : en créer une, la lire, la réécrire. */
  readonly creerBibliotheque: (racine: string, description: DescriptionBibliotheque) => Promise<string>;
  readonly lireBibliotheque: (racine: string) => Promise<DescriptionBibliotheque | undefined>;
  readonly ecrireBibliotheque: (racine: string, description: DescriptionBibliotheque) => Promise<void>;

  /** Choisir sur la machine. En ligne, il n'y a pas de dossier à désigner : ces deux-là devront
   *  rendre autre chose, et c'est précisément ce que le port oblige à regarder en face. */
  readonly choisirDossier: (titre: string) => Promise<string | undefined>;
  readonly choisirFichiers: (titre: string) => Promise<readonly string[]>;

  /** Les réglages de l'hôte, et les bibliothèques qu'il retient. */
  readonly reglages: () => Promise<ReglagesHote>;
  readonly retenirBibliotheque: (racine: string) => Promise<ReglagesHote>;
  readonly bibliothequesRetenues: () => Promise<readonly { racine: string; description: DescriptionBibliotheque }[]>;

  /** Déposer des fichiers, et suivre la file qui les traite (JOB). */
  readonly deposer: (racine: string, chemins: readonly string[]) => Promise<ArriveeDeFichiers>;
  readonly faireTourner: (racine: string) => Promise<boolean>;
  readonly travauxDe: (racine: string) => Promise<readonly Travail[]>;
  readonly agirSurTravail: (
    racine: string,
    id: string,
    action: "pause" | "reprendre" | "annuler",
  ) => Promise<Travail>;

  /** La manière de lire : l'essayer sans rien enregistrer, puis l'enregistrer (REC-07). */
  readonly apercuDePages: (
    racine: string,
    nom: string,
    depuis: number,
    combien: number,
  ) => Promise<readonly { rang: number; image: string }[]>;
  readonly essayerManiere: (
    racine: string,
    nom: string,
    recette: unknown,
    depuis: number,
    pages: number,
  ) => Promise<VueBibliotheque>;
  readonly enregistrerManiere: (racine: string, recette: unknown) => Promise<string>;
  readonly lireManiere: (racine: string) => Promise<Recette | undefined>;

  /** Ce qu'un document porte : sa vue, son texte, son classement (B3, B5, RCH-07, CLA-01).
   *
   *  La vue et les passages restent séparés — la vue porte les repères, les passages portent le
   *  texte — et le classement arrive par une troisième voie. Un fait, un seul endroit. */
  readonly vueDeDocument: (racine: string, empreinte: string) => Promise<VueBibliotheque | undefined>;
  readonly passagesDeDocument: (racine: string, empreinte: string) => Promise<readonly Passage[]>;
  readonly versionActive: (racine: string, empreinte: string) => Promise<string | undefined>;
  readonly imageDePage: (racine: string, version: string, fichier: string) => Promise<string | undefined>;
  readonly apercuDeBibliotheque: (racine: string) => Promise<readonly ApercuDocument[]>;
  readonly classerDocument: (racine: string, classement: ClassementLocal) => Promise<void>;
  readonly classementsDeBibliotheque: (racine: string) => Promise<ReadonlyMap<string, ClassementLocal>>;
};
