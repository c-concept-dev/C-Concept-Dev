import { z } from "zod";
import { Confiance, Empreinte } from "./commun.js";
import { SourceLecture } from "./lecture.js";

/** Le passage : un morceau de texte cherchable, sur sa vraie page (RCH-07, RCH-09, ANC-01).
 *
 *  Jusqu'ici la chaîne produisait des **ancres** — des numéros d'éléments repérés à un endroit
 *  fixe de la page, appariés à des pistes. Elle ne produisait aucun texte, et rien ne pouvait
 *  donc être cherché par thème, par idée ni par phrase exacte. Le passage est ce qui manquait.
 *
 *  **Un passage par page.** Ce n'est pas un choix d'ergonomie : la bibliothèque à reprendre
 *  compte 22 022 passages pour 21 515 pages, soit 1,02 par page. C'est la granularité qu'elle a
 *  déjà, et la seule qui rende littéralement vraie la promesse « toujours sur la vraie page ».
 *
 *  Le passage ne recopie pas le numéro imprimé de la page quand la page le porte déjà — sauf
 *  quand il le connaît et que rien d'autre ne le tient, car une citation sans page n'est pas
 *  vérifiable (RCH-09), et c'est la seule chose dont la façade a besoin pour rendre un `content`
 *  avec sa référence.
 */
/** En deçà de quelle confiance déclarée une lecture n'est plus présentable sans réserve.
 *
 *  Le troisième indice de FMT-04, et le seul qui ne juge pas le texte rendu mais **celui qui
 *  l'a lu**. Les deux autres demandent au texte s'il ressemble à du langage ; celui-ci demande
 *  à la reconnaissance si elle y croyait. Tesseract répond mot par mot, la chaîne le lit depuis
 *  toujours, et personne ne s'en servait.
 *
 *  Pourquoi il fallait un troisième. Les deux premiers s'exigent **ensemble**, et c'est
 *  volontaire — une liste de noms propres échoue au premier sans être illisible pour autant.
 *  Mais « bien formé » veut dire *suite de lettres*, rien de plus : `WOROUES`, `MNOFROUR`,
 *  `NVOTROUR` sont bien formés. Sur une liste de pistes réelle, à l'image parfaitement nette,
 *  le premier indice accusait (0,044) et le second acquittait (0,925) : la page est entrée dans
 *  la bibliothèque annoncée lisible, et elle ne l'était pas du tout.
 *
 *  **Soixante pour cent, et c'est mesuré.** Les 116 pages d'un livre numérisé du corpus relues
 *  le 29 octobre 2026 par le binaire embarqué : les pages de prose se tiennent entre 0,93 et
 *  0,96, les deux pages fautives à 0,286 et 0,291. Entre les deux, onze pages sous 0,60 — toutes
 *  relues à l'œil, toutes inutilisables : des portées musicales dont la reconnaissance a fait
 *  des mots. La première page au-dessus du seuil est à 0,624, et sa phrase se lit. Le creux est
 *  là, il a été regardé, il n'est pas supposé.
 *
 *  Il porte sur la **médiane**, non sur la moyenne : quelques mots ratés au milieu d'une page
 *  juste tirent la moyenne vers le bas sans que la page cesse de se lire. La médiane répond à la
 *  seule question qui compte — « la moitié des mots sont au moins aussi sûrs que cela ». Sur les
 *  mêmes pages, elle sépare trois fois plus nettement. */
export const CONFIANCE_MINIMALE = 0.6;

export const Passage = z
  .object({
    /** Ordre de lecture dans le document, à partir de zéro. La table le tient unique par
     *  version : c'est lui qui dit « le passage d'après », et non l'ordre d'insertion. */
    rang: z.number().int().nonnegative(),
    /** Rang de la page dont ce texte est tiré, **à partir de un**.
     *
     *  Et non `PageReperee.feuille`, qui compte à partir de zéro : les deux désignent la même
     *  page physique mais ne la nomment pas pareil. `PageAffichee.index` suit cette
     *  convention-ci, celle qu'on montre. */
    page: z.number().int().min(1),
    /** Le numéro **imprimé** sur la page, quand il est connu. Absent, le passage se cite par son
     *  rang de page, et le Lecteur le dit plutôt que de faire croire à un numéro. */
    pageImprimee: z.number().int().positive().optional(),
    /** Le texte, tel quel. Jamais un résumé ni une reformulation : RCH-07 demande l'extrait
     *  exact, et un extrait exact ne se retrouve que s'il a été gardé exact. */
    texte: z.string().trim().min(1),
    source: SourceLecture,
    /** D'où ce passage vient **dans le document**, quand le format le nomme : un chapitre pour
     *  un EPUB, rien pour une page de PDF.
     *
     *  ## Pourquoi un format sans pages en a besoin
     *
     *  Un EPUB ne porte aucune pagination d'édition imprimée — aucun des quatre sondés le
     *  20 octobre 2026 n'en a. Son rang est un **feuillet**, un découpage régulier qui donne une
     *  granularité comparable d'un livre à l'autre, et « feuillet 162 » ne situe rien pour un
     *  lecteur. Le chapitre, lui, le situe.
     *
     *  ## Ce qu'il n'est pas
     *
     *  **Il ne sert jamais à citer.** Deux livres ne découpent pas leurs chapitres de la même
     *  façon — trois fichiers de contenu pour l'un, soixante-neuf pour l'autre, mesuré — et un
     *  rang tiré de là ne se comparerait pas. Citer reste l'affaire de `page` et, quand le
     *  document le porte, de `pageImprimee`.
     *
     *  **Il reste absent plutôt que de porter du remplissage.** Une page de PDF n'a rien à
     *  déclarer au-delà de son numéro, et un champ qui dirait « je sais » sans rien savoir
     *  vaudrait moins que son absence. */
    emplacement: z.string().trim().min(1).optional(),
    /** À quel point la lecture se croyait sûre, quand elle le sait (FMT-04).
     *
     *  La médiane de la confiance que la reconnaissance déclare pour chaque mot de la page.
     *  **Absente pour une couche texte** : un PDF natif ne doute pas de lui-même, et lui prêter
     *  un chiffre serait affirmer à sa place.
     *
     *  Elle ne sert pas qu'à décider : elle se montre. « La moitié des mots de cette page ont
     *  été reconnus à moins de soixante pour cent de certitude » est une phrase qu'un lecteur
     *  peut peser lui-même, là où un marqueur binaire lui demande de croire sur parole. */
    confiance: Confiance.optional(),
    /** Ce texte se lit-il ? (FMT-04)
     *
     *  Un passage dont ni la couche texte ni la reconnaissance n'ont rien tiré de lisible entre
     *  dans la bibliothèque **marqué**, jamais écarté. L'écarter le ferait disparaître sans
     *  trace : la page existe, elle a du contenu, et personne ne saurait qu'il manque. Marqué,
     *  il se compte, se montre en dernier, et s'envoie à Vérifier.
     *
     *  Vrai par défaut, parce que c'est le cas de l'immense majorité et que le défaut d'un
     *  marqueur de qualité doit être « rien à signaler ». */
    lisible: z.boolean().default(true),
  })
  .strict();
export type Passage = z.infer<typeof Passage>;

/** Un passage retrouvé dans l'ensemble d'une bibliothèque (C10, RCH-07, RCH-09).
 *
 * Le passage seul ne suffit pas : ouvrir le résultat exige de savoir quel document et quelle
 * version active le portent. La version rend aussi un résultat périmé détectable au lieu de le
 * laisser ouvrir silencieusement une autre édition. */
export const CorrespondanceBibliotheque = z.object({
  empreinte: Empreinte,
  version: z.string().min(1),
  titre: z.string().min(1),
  passage: Passage,
}).strict();
export type CorrespondanceBibliotheque = z.infer<typeof CorrespondanceBibliotheque>;

export const CorrespondancesBibliotheque = z.array(CorrespondanceBibliotheque);

/** Les passages d'un document, dans l'ordre, sans trou ni doublon.
 *
 *  La table `passage` tient `UNIQUE (version_id, rang)` : un doublon y échouerait à l'écriture,
 *  une transaction plus loin et pour une raison illisible. Un trou, lui, ne lèverait rien du
 *  tout — il perdrait un passage en silence, et c'est la faute qui se découvre à la recherche,
 *  quand il manque un extrait que personne ne sait manquant.
 */
export const PassagesDuDocument = z.array(Passage).superRefine((passages, ctx) => {
  passages.forEach((passage, rang) => {
    if (passage.rang !== rang)
      ctx.addIssue({
        code: "custom",
        path: [rang, "rang"],
        message: `Le passage au rang ${rang} se déclare au rang ${passage.rang} : les rangs se suivent à partir de zéro, sans trou ni désordre`,
      });
  });
});
export type PassagesDuDocument = z.infer<typeof PassagesDuDocument>;

/** Ce que l'index plein texte reçoit : le texte, tel quel.
 *
 *  Accents et casse compris. C'est l'index qui replie — `unicode61` s'en charge — et le replier
 *  avant lui perdrait l'extrait exact que RCH-07 demande de rendre.
 */
export const texteCherchable = (passage: Passage): string => passage.texte;
