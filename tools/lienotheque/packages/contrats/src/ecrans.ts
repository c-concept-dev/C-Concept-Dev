import { z } from "zod";
import { Confiance, Empreinte, Identifiant, ZoneRelative } from "./commun.js";
import { ClassementLocal } from "./classement.js";
import { Preuve } from "./lien.js";
import { PositionDansPiste } from "./segment.js";

export { ZoneRelative } from "./commun.js";

/** Ce que les écrans lisent (B1 à B5).
 *
 *  Une vue, pas un second modèle : tout vient du dépôt, rassemblé pour un écran. Elle ne porte
 *  aucun mot de métier — « élément », « piste », « page » sont fournis par le schéma de la
 *  bibliothèque, qui voyage avec elle (CLA-01). Un autre domaine remplacera ces mots sans qu'une
 *  ligne de code change. */

/** Les mots d'une bibliothèque, tirés de son schéma. Au singulier et au pluriel : une interface
 *  qui écrit « 1 éléments » n'a pas été écrite pour des gens. */
export const MotsBibliotheque = z
  .object({
    element: z.object({ un: z.string().min(1), plusieurs: z.string().min(1) }).strict(),
    piste: z.object({ un: z.string().min(1), plusieurs: z.string().min(1) }).strict(),
    page: z.object({ un: z.string().min(1), plusieurs: z.string().min(1) }).strict(),
  })
  .strict();
export type MotsBibliotheque = z.infer<typeof MotsBibliotheque>;

/** Pourquoi un élément est relié à ce qu'il est relié (ANC-02). L'interface doit pouvoir le dire
 *  partout, et en français — d'où la phrase, construite une fois, pas dans la vue. */
export const Pourquoi = z
  .object({ preuve: Preuve, confiance: Confiance, phrase: z.string().min(1) })
  .strict();
export type Pourquoi = z.infer<typeof Pourquoi>;

export const ElementAffiche = z
  .object({
    ancreId: Identifiant,
    numero: z.string().min(1),
    titre: z.string().min(1).optional(),
    page: z.number().int().positive(),
    zone: ZoneRelative.optional(),
    /** Où son repère a été trouvé, quand il l'a été. La bande que le Lecteur rend cliquable
     *  contient les deux : un repère coupé en deux par le bord d'une zone se lit mal. */
    zoneRepere: ZoneRelative.optional(),
    /** Le média relié, quand il y en a un. Beaucoup d'éléments n'en ont pas. */
    media: z
      .object({
        empreinte: Empreinte,
        nom: z.string().min(1),
        piste: z.number().int().positive(),
        position: PositionDansPiste,
        /** Durée de la piste, en secondes, quand le dépôt la connaît : sans elle, un segment ne
         *  peut pas se situer sur une forme d'onde. */
        duree: z.number().positive().optional(),
        /** Où le média est servi, quand il est joignable d'ici (ANC-05).
         *
         *  L'emplacement se résout à la lecture, jamais à l'ingestion : la même carte vaut pour
         *  un fichier local et pour le même fichier ailleurs. Absente, c'est l'état « média non
         *  disponible ici » — on le dit, on ne fait pas semblant de pouvoir lire. */
        source: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    pourquoi: Pourquoi.optional(),
    /** Vrai quand l'élément attend un œil : confiance basse, conflit, recalcul (UX-03). */
    aVerifier: z.boolean().default(false),
  })
  .strict()
  .superRefine((element, ctx) => {
    if ((element.media === undefined) !== (element.pourquoi === undefined))
      ctx.addIssue({ code: "custom", path: ["pourquoi"], message: "Un lien dit toujours pourquoi ; sans lien, il n'y a rien à dire" });
  });
export type ElementAffiche = z.infer<typeof ElementAffiche>;

export const PageAffichee = z
  .object({
    /** Le rang de la page dans le document, à partir de un. **Toujours connu.**
     *
     *  C'est la seule identité dont on dispose en toutes circonstances, et c'est par elle qu'une
     *  page se range. Mesuré sur sept ouvrages : aucun ne portait de numéro imprimé dérivable,
     *  et la vue n'en gardait **aucune page** — toutes s'écrasaient sous une clé de repli que ce
     *  contrat rejetait ensuite. */
    index: z.number().int().positive(),
    /** Le numéro **imprimé** sur la page, quand il est connu — celui que le lecteur a sous les
     *  yeux, et par lequel on cite (RCH-09).
     *
     *  Il se dérive des éléments reconnus, qu'un ouvrage ordinaire n'a pas. Absent, la page se
     *  cite par son rang, et on le dit : un numéro imprimé ne s'invente pas. Même partage que
     *  `Passage.page` et `Passage.pageImprimee`. */
    numero: z.number().int().positive().optional(),
    titre: z.string().min(1).optional(),
    /** Image de la page, telle que le dépôt la sert. */
    image: z.string().min(1).optional(),
    largeur: z.number().int().positive().optional(),
    hauteur: z.number().int().positive().optional(),
    /** Vignette de la page, dérivé produit à l'ingestion (OUT-04).
     *
     *  Séparée de l'image : une bande de vingt-huit vignettes qui charge vingt-huit pages à
     *  pleine largeur, c'est trente mégaoctets pour une colonne de cent pixels de large. Elle
     *  manque quand le lot n'a pas produit de dérivés — les écrans retombent alors sur le
     *  numéro seul, qui reste une cible cliquable. */
    vignette: z.string().min(1).optional(),
    elements: z.array(ElementAffiche),
    /** Lignes du texte reconnu, pour le panneau repliable (B1). */
    texte: z.array(z.string()).default([]),
    traduction: z.array(z.string()).default([]),
    /** Ce que la page porte sur chaque axe du schéma : clé d'axe, clés de valeurs (CLA-10).
     *
     *  C'est ce qui manquait pour filtrer. L'écran n'a pas à savoir ce qu'un axe veut dire : il
     *  compare des clés, et le schéma lui donne les noms à afficher. Une page absente d'un axe
     *  n'y porte simplement rien — ce n'est pas une valeur vide, c'est une absence. */
    valeurs: z.record(z.string().min(1), z.array(z.string().min(1))).default({}),
  })
  .strict();
export type PageAffichee = z.infer<typeof PageAffichee>;

/** Ce qu'un cas douteux attend de l'utilisateur (UX-03, SYN-04, SYN-05, SYN-07). */
export const NatureDoute = z.enum(["lien", "page", "information"]);
export type NatureDoute = z.infer<typeof NatureDoute>;

/** Pourquoi un cas est en attente. Un conflit entre deux appareils et un recalcul en cours ne se
 *  traitent pas comme une lecture incertaine.
 *
 *  « relecture_sans_majorite » dit qu'on a regardé deux fois sans trancher : la lecture de la page
 *  et deux relectures d'images différentes n'ont pas donné deux voix concordantes. Il n'y a rien à
 *  rattraper automatiquement — c'est exactement le cas où un œil décide mieux qu'une règle.
 *
 *  Les deux derniers ne sont pas des décisions à prendre mais des faits à connaître : une page que
 *  la numérotation donne pour sautée, un média qu'aucun élément ne réclame. Ils
 *  n'attendent qu'un œil, pas un arbitrage — d'où « information » comme nature. */
export const EtatDoute = z.enum([
  "confiance",
  "relecture_sans_majorite",
  "conflit_appareils",
  "a_rattacher",
  "segment_inconnu",
  "page_absente",
  "media_orphelin",
]);
export type EtatDoute = z.infer<typeof EtatDoute>;

export const CasDouteux = z
  .object({
    id: Identifiant,
    nature: NatureDoute,
    etat: EtatDoute,
    /** L'élément concerné, quand le cas en a un. Une information n'en a pas : une page absente
     *  n'a justement rien porté, et un média orphelin n'est réclamé par personne. */
    element: ElementAffiche.optional(),
    /** De quoi parle le cas, à défaut d'élément. Écrit avec les mots de la bibliothèque, par qui
     *  les connaît — un écran n'a pas à les recomposer. */
    libelle: z.string().min(1).optional(),
    /** Le détail d'un cas qui en regroupe plusieurs : une ligne par membre, à déplier.
     *
     *  Six médias à la suite que personne ne réclame, c'est un seul fait — et six fiches
     *  identiques à marquer vues une à une. Regroupées, elles tiennent en une décision, sans
     *  qu'on perde de vue ce qu'elles recouvrent. */
    details: z.array(z.string().min(1)).default([]),
    /** Ce que le système propose, en toutes lettres. */
    proposition: z.string().min(1),
    motif: z.string().min(1),
  })
  .strict()
  .superRefine((cas, ctx) => {
    if (cas.element === undefined && cas.libelle === undefined)
      ctx.addIssue({ code: "custom", path: ["libelle"], message: "Un cas sans élément doit dire de quoi il parle" });
    if (cas.nature === "lien" && cas.element === undefined)
      ctx.addIssue({ code: "custom", path: ["element"], message: "Un doute sur un lien porte sur un élément" });
  });
export type CasDouteux = z.infer<typeof CasDouteux>;

/** Un axe du schéma, avec ses compteurs (CLA-10).
 *
 *  `filtrable` dit si cet axe peut vraiment servir : les pages portent des valeurs dessus, les
 *  comptes ont été calculés, et l'écran a donc de quoi comparer. Un axe que l'instantané déclare
 *  sans pouvoir le compter se présentait avec des comptes à zéro et des cases qui ne faisaient
 *  rien — l'écran promettait un tri qui n'existait pas. Mieux vaut ne pas montrer le groupe :
 *  une case inerte use la confiance plus qu'une absence. */
export const FiltreAffiche = z
  .object({
    cle: z.string().min(1),
    nom: z.string().min(1),
    valeurs: z.array(z.object({ cle: z.string().min(1), nom: z.string().min(1), nombre: z.number().int().nonnegative() }).strict()),
    filtrable: z.boolean().default(false),
  })
  .strict();
export type FiltreAffiche = z.infer<typeof FiltreAffiche>;

export const VueBibliotheque = z
  .object({
    id: Identifiant,
    nom: z.string().min(1),
    mots: MotsBibliotheque,
    compteurs: z.array(z.object({ nombre: z.number().int().nonnegative(), mot: z.string().min(1) }).strict()),
    aVerifier: z.number().int().nonnegative().default(0),
    filtres: z.array(FiltreAffiche).default([]),
    pages: z.array(PageAffichee),
    douteux: z.array(CasDouteux).default([]),
  })
  .strict();
export type VueBibliotheque = z.infer<typeof VueBibliotheque>;

/** Accord du mot au nombre. « 1 élément », « 2 éléments » : l'interface compte en français. */
export const accorder = (nombre: number, mot: { un: string; plusieurs: string }): string =>
  `${nombre} ${nombre <= 1 ? mot.un : mot.plusieurs}`;

/** Majuscule en tête.
 *
 *  Les mots du schéma arrivent en minuscule — c'est ainsi qu'on les écrit au milieu d'une phrase.
 *  En tête de titre ou de phrase, ils prennent la majuscule comme n'importe quel mot français.
 *  Une seule fonction pour tous les écrans : sans quoi l'un écrit « Page 127 » et l'autre
 *  « page 127 », et c'est le genre d'écart qu'on ne voit qu'une fois livré. */
/** Comment une page se cite, en un seul endroit (RCH-09).
 *
 *  Par son numéro **imprimé** quand on le connaît — c'est celui que le lecteur a sous les yeux.
 *  Par son **rang** sinon, et on le dit : un document dont rien n’est numéroté n’a pas de numéro
 *  imprimé dérivable, et en inventer un citerait des pages sous un numéro qu'elles ne portent
 *  pas. Les mots viennent de la bibliothèque, jamais du code (CLA-01). */
export const citerPage = (
  mots: MotsBibliotheque,
  page: { readonly index: number; readonly numero?: number | undefined },
): string => (page.numero === undefined ? `${mots.page.un} ${page.index} du document` : `${mots.page.un} ${page.numero}`);

export const enTete = (texte: string): string =>
  texte.length === 0 ? texte : texte.charAt(0).toLocaleUpperCase("fr-FR") + texte.slice(1);

/** « Page 127 », « Élément 405 », « Piste 45 » : le mot du schéma et le numéro qu'il désigne.
 *
 *  Un numéro, jamais un compte : c'est `accorder` qui compte. Et aucune tournure qui demande le
 *  genre — le schéma ne le donne pas. */
export const nommer = (mot: { un: string }, numero: string | number): string => `${enTete(mot.un)} ${numero}`;

/** Une suite de numéros consécutifs : « Page 30 », « Pages 30 et 31 », « Pages 30 à 35 ».
 *
 *  Deux se lisent « et », trois et plus « à ». Comme `nommer`, aucune tournure qui demande le
 *  genre : le schéma donne les mots, jamais leur genre. */
export const nommerSuite = (mot: { un: string; plusieurs: string }, debut: number, fin: number): string => {
  if (fin <= debut) return nommer(mot, debut);
  return `${enTete(mot.plusieurs)} ${debut} ${fin === debut + 1 ? "et" : "à"} ${fin}`;
};

/** L'aperçu d'un document dans sa bibliothèque : ce que le Catalogue lit (B5, JOB-06).
 *
 *  Une **projection**, jamais une concaténation des versions. Mesuré : 1,10 Mo par version — à
 *  deux cent cinquante documents, les assembler voudrait dire lire deux cent soixante-quinze
 *  mégaoctets pour afficher une liste de titres.
 *
 *  Le contrat est donc volontairement étroit, et `.strict()` le tient : c'est lui qui empêchera
 *  qu'on y glisse un jour les passages ou les pages « pendant qu'on y est », et que l'aperçu
 *  devienne, de commit en commit, ce qu'il a été écrit pour éviter.
 */
export const ApercuDocument = z
  .object({
    /** Le document, désigné par l'empreinte de sa source (ID-01). */
    empreinte: Empreinte,
    /** Sa version active : un aperçu décrit un état, pas un document en général (ID-04). */
    version: Identifiant,
    activeeLe: z.number().int().nonnegative(),
    nom: z.string().min(1),
    compteurs: z.array(z.object({ nombre: z.number().int().nonnegative(), mot: z.string().min(1) }).strict()).default([]),
    aVerifier: z.number().int().nonnegative().default(0),
  })
  .strict();
export type ApercuDocument = z.infer<typeof ApercuDocument>;

/** Ce que la version en ligne reçoit d'une bibliothèque entière : la liste et les classements.
 *
 *  **Un seul objet pour les deux**, parce que les écrans les demandent toujours ensemble — le
 *  Catalogue affiche la liste et ses filtres d'un même geste. Deux objets voudraient dire deux
 *  écritures, donc une seconde fenêtre où l'un est posé sans l'autre, pour rien.
 *
 *  Les classements portent chacun leur empreinte : la carte que les écrans emploient se
 *  reconstruit à l'arrivée, et on ne transporte pas deux fois la même clé.
 *
 *  Chaque document y annonce sa **version active**, ce qui suffit à résoudre l'image d'une page
 *  sans demander la version séparément. */
export const ApercuEnLigne = z
  .object({
    documents: z.array(ApercuDocument),
    classements: z.array(ClassementLocal).default([]),
  })
  .strict();
export type ApercuEnLigne = z.infer<typeof ApercuEnLigne>;

/** Un document qu'on soupçonne d'en doubler un autre, et ce qui le distingue (HER-08).
 *
 *  Chaque champ est là pour **choisir**, et non pour décrire. Deux numérisations d'un même livre
 *  se distinguent par leur poids ; un même ouvrage en deux formats, par son nom ; un diaporama
 *  composé autrement, par son nombre de pages. Retirer un champ d'ici, c'est retirer à quelqu'un
 *  le moyen de trancher. */
export const DocumentSuspect = z
  .object({
    empreinte: Empreinte,
    nom: z.string().min(1),
    pages: z.number().int().nonnegative(),
    passages: z.number().int().nonnegative(),
    /** Les mots retenus de son texte : ce sur quoi la ressemblance a été calculée. */
    mots: z.number().int().nonnegative(),
    /** Le poids de sa source sur le disque. Zéro si elle a disparu. */
    octets: z.number().int().nonnegative(),
  })
  .strict();
export type DocumentSuspect = z.infer<typeof DocumentSuspect>;

/** Des documents qui disent la même chose, et à quel point.
 *
 *  La ressemblance annoncée est **la plus faible du groupe** : c'est la plus prudente, et un
 *  groupe ne doit pas paraître plus sûr que son membre le moins ressemblant. */
export const GroupeDeDoublons = z
  .object({
    documents: z.array(DocumentSuspect).min(2),
    ressemblance: z.number().min(0).max(1),
  })
  .strict();
export type GroupeDeDoublons = z.infer<typeof GroupeDeDoublons>;

/** Ce qu'une recherche de doublons a trouvé, et ce qu'elle n'a pas pu regarder (HER-08).
 *
 *  Elle **ne supprime rien et n'en a pas le moyen** : aucune mesure de texte ne distingue un vrai
 *  doublon d'un même ouvrage en deux formats, et garder l'un et l'autre est un choix légitime. Ce
 *  contrat porte donc de quoi décider, et aucun ordre.
 *
 *  `tropPeuDeTexte` n'est pas un détail à masquer : un document dont la lecture n'a presque rien
 *  tiré ne peut se comparer à rien — deux textes de cent mots se ressemblent toujours — et c'est
 *  un fait qui mérite d'être su pour lui-même. Les taire les ferait passer pour comparés. */
export const Doublons = z
  .object({
    groupes: z.array(GroupeDeDoublons).default([]),
    tropPeuDeTexte: z.array(DocumentSuspect).default([]),
  })
  .strict();
export type Doublons = z.infer<typeof Doublons>;

/** Ce qu'un retrait de document a emporté (HER-07).
 *
 *  On le dit plutôt que de laisser deviner : « retiré » sans compte rendu laisse croire qu'un
 *  document a disparu alors que sa source est à la corbeille, ou l'inverse. */
export const RetraitDeDocument = z
  .object({
    versions: z.number().int().nonnegative(),
    travaux: z.number().int().nonnegative(),
    /** Où la source a atterri dans la corbeille. Absente si le document n'en avait plus. */
    source: z.string().min(1).optional(),
  })
  .strict();
export type RetraitDeDocument = z.infer<typeof RetraitDeDocument>;
