import { z } from "zod";
import { Confiance, Empreinte, RefRecette, ZoneRelative } from "./commun.js";

/** Le moteur oracle : relier un conteneur à ses pièces, sans jamais rien supposer.
 *
 *  ## Ce que ce vocabulaire remplace, et pourquoi
 *
 *  Une manière de lire écrite à la main mêle trois choses de natures différentes : **ce qu'on
 *  observe**, **ce qu'on en conclut**, et **ce qui autorise à publier**. C'est ce mélange qui a
 *  permis à un recueil de la bibliothèque de publier 52 liens à pleine confiance parce que sa
 *  manière de lire posait en règle que le rang de la pièce valait le numéro du repère — une
 *  conclusion — sans qu'aucune observation ne l'appuie.
 *
 *  Ces contrats séparent les trois, et c'est tout leur objet :
 *
 *  - un **détecteur** rend des `Observation` : ce qu'il a vu, et où le revoir. Jamais un lien.
 *  - un **oracle** rassemble des `Proposition` et porte avec lui de quoi le réfuter : son
 *    échantillon, ses témoins, ses trous, ses désaccords.
 *  - un **verdict** dit « publié » ou « abstention », et dans le second cas il dit pourquoi.
 *
 *  ## Ce que le vocabulaire ne nomme plus
 *
 *  Ni page, ni piste, ni folio. Un **repère** est une position adressable — une page, un
 *  feuillet, un minutage, un paragraphe ; une **pièce** est un fichier à relier, quel que soit
 *  son genre. Le socle doit servir le jour où un conteneur portera autre chose que du son, et
 *  un vocabulaire qui nomme un genre interdit d'avance cet usage-là.
 */

/** Une position adressable dans un conteneur.
 *
 *  `rang` est toujours connu : c'est l'ordre, et il existe pour tout conteneur. `adresse` est ce
 *  que le contenu **porte lui-même** — un numéro imprimé, un minutage, un numéro de section —
 *  et il est absent quand rien ne le porte.
 *
 *  **Ne jamais remplir `adresse` par calcul.** Une adresse déduite du rang n'est pas une adresse
 *  lue : c'est le rang sous un autre nom, et le confondre a produit 114 pages « numérotées » sur
 *  un document où pas une n'avait été lue. */
export const Repere = z
  .object({
    rang: z.number().int().min(1),
    adresse: z.string().trim().min(1).max(40).optional(),
  })
  .strict();
export type Repere = z.infer<typeof Repere>;

/** Un fichier à relier au conteneur.
 *
 *  `groupe` dit de quel dépôt la pièce vient. Sans lui, rien ne prouve qu'elle appartient à ce
 *  conteneur, et un vivier qui déborde ne produit pas des liens douteux : il produit des liens
 *  faux et réguliers. */
export const Piece = z
  .object({
    empreinte: Empreinte,
    nom: z.string().min(1),
    rang: z.number().int().min(1).optional(),
    groupe: z.string().min(1).optional(),
  })
  .strict();
export type Piece = z.infer<typeof Piece>;

/** D'où un détecteur tient ce qu'il avance.
 *
 *  La distinction porte la règle de corroboration : deux observations de même source ne sont pas
 *  indépendantes. Deux façons de lire un nom de fichier ne font pas deux témoins ; un nom et une
 *  page, si. */
export const SourceObservation = z.enum(["nom", "arborescence", "contenu", "croisement"]);
export type SourceObservation = z.infer<typeof SourceObservation>;

/** Ce qu'un détecteur a vu, avec de quoi aller le revoir.
 *
 *  `ou` n'est pas un confort : c'est ce qui rend l'observation réfutable. Une observation qu'on
 *  ne peut pas aller revérifier est une affirmation, et une affirmation ne se corrobore pas. */
export const Observation = z
  .object({
    detecteur: z.string().regex(/^[a-z0-9-]+$/, "Un détecteur se nomme en minuscules et traits d'union"),
    source: SourceObservation,
    /** Ce qui a été vu, en clair, lisible par qui n'a pas écrit le détecteur. */
    constat: z.string().trim().min(1).max(240),
    /** Où aller le revoir : un rang, une zone, un nom de fichier. */
    ou: z.string().trim().min(1).max(240),
    confiance: Confiance,
  })
  .strict();
export type Observation = z.infer<typeof Observation>;

/** Un lien proposé, et ce qui l'appuie.
 *
 *  Au moins une observation, toujours. Une proposition sans observation est exactement ce que le
 *  moteur oracle existe pour empêcher. */
export const Proposition = z
  .object({
    repere: Repere,
    piece: Empreinte,
    observations: z.array(Observation).min(1).max(8),
  })
  .strict();
export type Proposition = z.infer<typeof Proposition>;

/** Ce qui remplace une manière de lire écrite à la main.
 *
 *  Un oracle n'est pas une règle : c'est une hypothèse **accompagnée de quoi la réfuter**. Il
 *  porte l'échantillon qui l'a formée, les témoins sur lesquels il a été éprouvé, ce qu'il ne
 *  couvre pas, et les désaccords qu'il a rencontrés.
 *
 *  ## Les témoins sont hors de l'échantillon, et le contrat l'exige
 *
 *  Éprouver une hypothèse sur les pages qui l'ont formée ne prouve rien : cela mesure la mémoire,
 *  pas la justesse. La règle existait déjà pour le diagnostic structurel et n'était appliquée
 *  nulle part ; ici elle est dans le contrat, donc un oracle qui s'en affranchit ne se construit
 *  pas.
 *
 *  ## L'empreinte invalide l'oracle
 *
 *  Un oracle vaut pour **un** conteneur, celui dont il porte l'empreinte. Le document change,
 *  l'oracle tombe. C'est ce qui évite qu'une hypothèse apprise un jour serve à un contenu qu'elle
 *  n'a jamais vu. */
export const Oracle = z
  .object({
    /** Comment cet oracle se nomme, pour qu'on puisse dire lequel a dit quoi.
     *
     *  Il en faut un : la confrontation compare des oracles, et un verdict nomme ceux qui
     *  l'autorisent. Les désigner par leur liste de détecteurs marchait tant qu'ils n'en avaient
     *  qu'un, et devenait ambigu dès le second. */
    id: z.string().regex(/^[a-z0-9-]+$/, "Un oracle se nomme en minuscules et traits d'union"),
    conteneur: Empreinte,
    /** Les détecteurs qui l'ont produit. Au moins un, nommés, pour qu'on sache quoi rejouer. */
    detecteurs: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1).max(12),
    /** Les rangs regardés pour former l'hypothèse. */
    echantillon: z.array(z.number().int().min(1)).max(32),
    /** Les rangs sur lesquels elle a été éprouvée, jamais ceux de l'échantillon. */
    temoins: z.array(z.number().int().min(1)).max(32),
    propositions: z.array(Proposition),
    /** Les rangs que l'oracle ne couvre pas. Dits, jamais tus : un trou qu'on ne nomme pas se
     *  découvre à l'usage, quand quelqu'un cherche ce qui manque sans savoir qu'il manque. */
    sansProposition: z.array(z.number().int().min(1)),
    /** Ce que l'oracle a rencontré et n'a pas su trancher, en clair. */
    desaccords: z.array(z.string().trim().min(1).max(240)).max(64),
    etabliLe: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((oracle, contexte) => {
    const vus = new Set(oracle.echantillon);
    for (const [rang, temoin] of oracle.temoins.entries())
      if (vus.has(temoin))
        contexte.addIssue({
          code: "custom",
          path: ["temoins", rang],
          message: "Un témoin doit rester hors de l'échantillon : s'éprouver sur ce qui a formé l'hypothèse ne prouve rien",
        });
    const reperes = new Set<number>();
    for (const [rang, proposition] of oracle.propositions.entries()) {
      if (reperes.has(proposition.repere.rang))
        contexte.addIssue({
          code: "custom",
          path: ["propositions", rang, "repere", "rang"],
          message: "Deux propositions visent le même repère : l'oracle doit trancher ou s'abstenir, pas proposer deux fois",
        });
      reperes.add(proposition.repere.rang);
    }
    for (const [rang, sans] of oracle.sansProposition.entries())
      if (reperes.has(sans))
        contexte.addIssue({
          code: "custom",
          path: ["sansProposition", rang],
          message: "Un rang déclaré sans proposition en porte pourtant une",
        });
  });
export type Oracle = z.infer<typeof Oracle>;

/** Ce qu'une lecture a décidé pour un repère, tel que le coordinateur le rend.
 *
 *  **C'est la soudure entre deux pièces qui ne se connaissaient pas.** Le coordinateur impose
 *  depuis longtemps l'ordre sûr — local d'abord, Vision seulement sur ce qui résiste,
 *  corroboration avant de retenir — et il n'était appelé nulle part. Le moteur oracle a besoin
 *  exactement de cela et de rien de plus : pour chaque repère, une valeur retenue avec sa
 *  provenance, ou un refus avec ses raisons.
 *
 *  La forme vit au contrat plutôt que dans l'une des deux pièces : c'est le seul endroit que les
 *  deux voient déjà, et l'y poser évite de faire dépendre une pièce de logique pure d'une pièce
 *  qui lit des pixels.
 *
 *  `a_verifier` porte ses raisons au pluriel, parce qu'il y en a souvent plusieurs et que les
 *  résumer en une seule ferait perdre celle qui aurait permis d'agir. */
export const DecisionDeLecture = z.discriminatedUnion("etat", [
  z
    .object({
      etat: z.literal("retenue"),
      repere: z.number().int().min(1),
      /** La pièce retenue pour ce repère. */
      piece: Empreinte,
      /** D'où vient la valeur : lue sur place, ou relue puis corroborée. Jamais « Vision seule ». */
      venue: z.enum(["locale", "vision_corroboree"]),
      confiance: Confiance,
      observations: z.array(Observation).min(1).max(8),
    })
    .strict(),
  z
    .object({
      etat: z.literal("a_verifier"),
      repere: z.number().int().min(1),
      raisons: z.array(z.string().trim().min(1).max(240)).min(1).max(8),
    })
    .strict(),
]);
export type DecisionDeLecture = z.infer<typeof DecisionDeLecture>;

/** Pourquoi le moteur n'a rien publié.
 *
 *  Cinq motifs, et ils ne se confondent pas : ce qu'on fait pour y remédier n'est pas le même.
 *
 *  - `aucun_oracle` : aucun détecteur n'a rien vu. Il n'y a pas d'hypothèse à éprouver.
 *  - `oracle_unique_sans_verification` : une seule façon de savoir, et personne n'a vérifié ce
 *    conteneur. C'est la deuxième voie de publication, et elle attend un œil.
 *  - `oracles_en_desaccord` : deux façons de savoir se contredisent. Trancher à l'aveugle ici
 *    serait choisir la plus bavarde, pas la plus juste.
 *  - `temoins_non_eprouves` : l'hypothèse n'a jamais été confrontée à des repères qu'elle n'a pas
 *    vus. Elle n'est pas fausse, elle n'est pas prouvée.
 *  - `temoins_en_echec` : elle l'a été, et elle n'a pas tenu. */
export const MotifAbstention = z.enum([
  "aucun_oracle",
  "oracle_unique_sans_verification",
  "oracles_en_desaccord",
  "temoins_non_eprouves",
  "temoins_en_echec",
]);
export type MotifAbstention = z.infer<typeof MotifAbstention>;

/** Ce que le moteur conclut, et qui engage l'affichage.
 *
 *  Une abstention porte toujours sa cause en clair : c'est ce que quelqu'un lira à l'écran, et
 *  « on n'est pas sûr » n'a jamais aidé personne à décider quoi faire. */
export const Verdict = z.discriminatedUnion("etat", [
  z
    .object({
      etat: z.literal("publie"),
      /** Les oracles concordants qui l'autorisent, ou l'oracle unique et son œil. */
      oracles: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1),
      verifieParUnHumain: z.boolean(),
      pourquoi: z.string().trim().min(1).max(240),
    })
    .strict(),
  z
    .object({
      etat: z.literal("abstention"),
      motif: MotifAbstention,
      pourquoi: z.string().trim().min(1).max(240),
      /** Ce qu'il faudrait pour lever l'abstention, quand on le sait. */
      pourLever: z.string().trim().min(1).max(240).optional(),
    })
    .strict(),
]);
export type Verdict = z.infer<typeof Verdict>;

/** Une apparition regardée, avec ce qu'on y a lu — ou le fait qu'on n'y ait rien lu.
 *
 *  `rang` et `y` ne sont pas du confort : sans eux, l'acquis n'est qu'une affirmation. Avec eux,
 *  n'importe qui peut rouvrir la page, regarder au même endroit, et constater. C'est la même
 *  exigence que `Observation.ou`, sous la forme compacte qu'une suite de douze lectures demande.
 *
 *  `valeur` absente dit « regardé, et rien lu ». C'est un fait, pas une inconnue — et c'est ce
 *  fait-là qui porte la moitié du raisonnement : un endroit troué ne numérote rien. */
export const ApparitionLue = z
  .object({
    rang: z.number().int().min(1),
    y: z.number().min(0).max(1),
    valeur: z.number().int().positive().optional(),
  })
  .strict();
export type ApparitionLue = z.infer<typeof ApparitionLue>;

const acquisCommun = {
  /** Le conteneur dont il s'agit. Il change, l'acquis tombe : c'est la règle de l'oracle, et
   *  c'est la seule empreinte qui figure ici.
   *
   *  **Le vivier n'y est pas, et c'est voulu.** Rien dans un acquis ne dépend des pièces à
   *  relier : l'endroit où regarder, la façon de lire ses chiffres et ce qu'on y a lu ne
   *  concernent que le document. Les liens, eux, dépendent du vivier — mais ils vivent dans la
   *  version, pas ici. Mesuré le 31 octobre 2026 : un document de 182 essais coûte 839 s
   *  d'exploration et quelques secondes d'attribution. Faire tomber l'acquis parce qu'un
   *  enregistrement a été ajouté rachèterait la partie chère pour une raison qui ne la touche
   *  pas. */
  conteneur: Empreinte,
  /** Quelle façon de lire l'a produit, et dans quelle version.
   *
   *  **C'est le garde-fou contre sa propre amélioration.** Sans lui, un acquis écrit aujourd'hui
   *  survivrait à tout progrès de la lecture : on améliorerait l'oracle et les documents déjà vus
   *  garderaient pour toujours les conclusions de l'ancien. La version monte dès que ce qui
   *  propose les endroits, les juge ou les lit change — et tous les acquis antérieurs cessent
   *  alors d'être réutilisés, sans que personne n'ait à les effacer. */
  voie: RefRecette,
  /** Sur combien de pages il a été formé.
   *
   *  Une lecture peut ne regarder que les premières pages — pour essayer, ou pour éprouver. Ce
   *  qu'elle apprend alors ne vaut pas pour le document entier : réutiliser sur 400 pages une
   *  conclusion tirée de 12 serait étendre une mesure à ce qu'elle n'a pas vu. */
  pagesRegardees: z.number().int().min(1),
  etabliLe: z.number().int().nonnegative(),
};

/** Ce que la lecture générique a appris d'un document, pour ne pas l'apprendre deux fois
 *  (OUT-10, REC-02).
 *
 *  ## Pourquoi ce n'est pas un cache
 *
 *  Un cache garde un résultat et le jette quand quelque chose bouge. Celui-ci garde un
 *  **raisonnement** : où regarder, comment y lire, ce qui y a été lu, et ce qui l'a corroboré.
 *  D'où trois différences qui comptent :
 *
 *  - il se vérifie — chaque lecture porte son rang et sa hauteur, donc chacune se rouvre ;
 *  - il ne dépend que du document, jamais du vivier (voir `conteneur`) ;
 *  - il tombe de lui-même quand la façon de lire change (voir `voie`).
 *
 *  ## Les deux états, et pourquoi le second pèse le plus
 *
 *  `endroit_trouve` évite de rechercher un endroit déjà trouvé. `aucun_endroit` évite de
 *  rechercher un endroit dont il est déjà établi qu'il n'y en a pas — et c'est là qu'est
 *  l'essentiel. Mesuré le 31 octobre 2026 sur vingt documents réels : **quatre** ont un endroit,
 *  **seize** n'en ont pas, et ce sont les seize qui coûtent le plus cher — jusqu'à 182 essais et
 *  839 s pour conclure qu'il n'y a rien. Ne se souvenir que des succès reviendrait à ne rien
 *  gagner là où presque tout se dépense.
 *
 *  ## Un acquis ne s'écrit que si l'exploration a conclu
 *
 *  Une exploration arrêtée par son budget n'en produit aucun. Se souvenir de « je n'ai pas fini »
 *  autoriserait plus tard à conclure de ce qu'on n'a pas vu, ce qui est exactement l'inverse de
 *  ce que cette mémoire est pour. Le contrat l'impose : un `aucun_endroit` doit reposer sur au
 *  moins un essai, et un `endroit_trouve` sur au moins une lecture qui a rendu quelque chose. */
export const AcquisDeLecture = z.discriminatedUnion("etat", [
  z
    .object({
      etat: z.literal("endroit_trouve"),
      ...acquisCommun,
      /** Où regarder, en part des dimensions de la page. */
      endroit: ZoneRelative,
      /** Comment y lire les chiffres. Le nom d'une façon de lire, pas une description. */
      motif: z.string().regex(/^[a-z0-9_]+$/, "Une façon de lire se nomme en minuscules et soulignés"),
      /** Ce que cet endroit a obtenu : ni une confiance affichable, ni une promesse — la note
       *  qu'il a réellement atteinte, pour qu'on puisse la retrouver ou la contester. */
      part: z.number().gt(0).max(1),
      /** Les apparitions qui ont formé l'hypothèse, avec ce qu'on y a lu. */
      echantillon: z.array(ApparitionLue).min(1).max(32),
      /** Des apparitions sur lesquelles elle a ensuite été éprouvée, hors de l'échantillon.
       *
       *  La règle vient de `Oracle` et vaut ici pour la même raison : s'éprouver sur ce qui a
       *  formé l'hypothèse mesure la mémoire, pas la justesse. Le contrat la fait respecter.
       *
       *  **Un échantillon réparti, et non tous.** Un recueil de cinq cents pages porte des
       *  milliers d'apparitions ; les recopier toutes gonflerait l'acquis sans rien prouver de
       *  plus, puisque le rôle d'un témoin est de rendre la conclusion vérifiable, pas de la
       *  compter. D'où les deux décomptes qui l'accompagnent : un échantillon sans son total
       *  laisserait croire que tout a été éprouvé. */
      temoins: z.array(ApparitionLue).max(32),
      /** Combien d'apparitions ont été éprouvées en tout, échantillon non compris. */
      temoinsEprouves: z.number().int().nonnegative(),
      /** Combien d'entre elles ont rendu une lecture retenue. */
      temoinsDAccord: z.number().int().nonnegative(),
    })
    .strict()
    .superRefine((acquis, contexte) => {
      if (!acquis.echantillon.some((apparition) => apparition.valeur !== undefined))
        contexte.addIssue({
          code: "custom",
          path: ["echantillon"],
          message: "Un endroit retenu sans une seule lecture n'a rien établi : un acquis ne garde pas cela",
        });
      // Une apparition s'identifie par son rang **et** sa hauteur, jamais par son rang seul : un
      // même repère en porte plusieurs par page — quarante sur douze pages, mesuré sur le témoin
      // vérifié à l'oreille. Comparer les rangs seuls rejetterait des témoins parfaitement
      // légitimes, et ferait croire que la règle est respectée quand elle est seulement stricte.
      if (acquis.temoinsDAccord > acquis.temoinsEprouves)
        contexte.addIssue({
          code: "custom",
          path: ["temoinsDAccord"],
          message: "Plus de témoins d'accord que de témoins éprouvés : un décompte qui ne peut pas être vrai",
        });
      if (acquis.temoins.length > acquis.temoinsEprouves)
        contexte.addIssue({
          code: "custom",
          path: ["temoins"],
          message: "Plus de témoins gardés que de témoins éprouvés : l'échantillon déborderait ce dont il est tiré",
        });
      const formes = new Set(acquis.echantillon.map((apparition) => `${apparition.rang}:${apparition.y}`));
      for (const [place, temoin] of acquis.temoins.entries())
        if (formes.has(`${temoin.rang}:${temoin.y}`))
          contexte.addIssue({
            code: "custom",
            path: ["temoins", place],
            message:
              "Un témoin doit rester hors de l'échantillon : s'éprouver sur ce qui a formé l'hypothèse ne prouve rien",
          });
    }),
  z
    .object({
      etat: z.literal("aucun_endroit"),
      ...acquisCommun,
      /** Combien d'endroits la régularité des formes avait proposés. */
      endroitsProposes: z.number().int().nonnegative(),
      /** Combien d'essais ont été menés — un essai étant un endroit lu d'une façon donnée. */
      essaisEprouves: z.number().int().nonnegative(),
      /** La plus haute note qu'un de ces essais pouvait encore atteindre quand il fut abandonné.
       *
       *  Un plafond démontré, et non une note mesurée : avec l'élagage, aucune note ne va à son
       *  terme. C'est ce chiffre que l'abstention doit citer, parce que c'est celui qui est
       *  prouvé. */
      borneLaPlusHaute: Confiance,
    })
    .strict()
    .superRefine((acquis, contexte) => {
      if (acquis.endroitsProposes > 0 && acquis.essaisEprouves === 0)
        contexte.addIssue({
          code: "custom",
          path: ["essaisEprouves"],
          message:
            "Conclure qu'aucun endroit ne porte de numérotation sans en avoir éprouvé un seul, c'est conclure de ce qu'on n'a pas vu",
        });
    }),
]);
export type AcquisDeLecture = z.infer<typeof AcquisDeLecture>;
