import { z } from "zod";
import { Empreinte, Horodatage, Identifiant } from "./commun.js";

/** Qui entre, avec quelle clé, et pour combien de temps (SEC-02, SEC-03).
 *
 *  Ces données vivent dans le registre, une base à part qui ne contient aucun contenu de
 *  bibliothèque. Elles traversent une frontière — le Worker les écrit, les relit, et décide
 *  d'ouvrir ou non sur ce qu'elles disent — donc elles ont un contrat.
 *
 *  Une ligne de base n'est pas une donnée de confiance, même quand c'est nous qui l'avons
 *  écrite. Ici moins qu'ailleurs : une clé publique mal relue, c'est une entrée qui cesse de
 *  marcher ; une date d'expiration mal relue, c'est une session qui ne périme jamais.
 *
 *  **Rien de secret dans ces contrats.** La partie privée de la clé ne quitte pas l'appareil, et
 *  le registre ne garde d'une session qu'une empreinte — de quoi la reconnaître, pas de quoi
 *  s'en servir. */

/** Une personne qui a le droit d'entrer.
 *
 *  Deux, nommées, et pas d'inscription ouverte : une bibliothèque personnelle n'a pas de
 *  visiteurs. Le nom est là pour qu'un journal soit lisible, pas pour être affiché à un tiers. */
export const Personne = z
  .object({
    id: Identifiant,
    nom: z.string().min(1),
    creeLe: Horodatage,
  })
  .strict();
export type Personne = z.infer<typeof Personne>;

/** Une clé d'accès enrôlée : la partie **publique**, et rien d'autre.
 *
 *  `clePublique` est la clé telle que le navigateur l'a rendue — déjà en SPKI —, en base64. On
 *  la range telle quelle plutôt que de la transformer : ce qu'on n'a pas réécrit ne peut pas
 *  être réécrit de travers.
 *
 *  `compteur` est l'anti-rejeu. L'authentificateur l'incrémente à chaque usage ; une signature
 *  qui arrive avec un compteur qui n'a pas avancé est une signature rejouée. Certains
 *  authentificateurs le laissent à zéro et ne comptent pas — le registre le garde quand même,
 *  et c'est l'étape de l'entrée qui décide quoi en faire.
 *
 *  `appareil` est une étiquette que la personne reconnaît, pour pouvoir révoquer la bonne clé. */
export const CleDAcces = z
  .object({
    id: Identifiant,
    personneId: Identifiant,
    /** La clé publique en SPKI, encodée en base64. */
    clePublique: z.string().min(1).regex(/^[A-Za-z0-9+/]+={0,2}$/, "base64 attendue"),
    compteur: z.number().int().min(0),
    appareil: z.string().min(1).optional(),
    enroleeLe: Horodatage,
    revoqueeLe: Horodatage.optional(),
  })
  .strict();
export type CleDAcces = z.infer<typeof CleDAcces>;

/** Une session ouverte sur un appareil de confiance, telle que le registre la garde.
 *
 *  `empreinte` est le condensat du jeton, jamais le jeton : une base lue ne doit pas livrer de
 *  quoi se faire passer pour quelqu'un.
 *
 *  `vueLe` et `expireLe` sont deux dates distinctes et toutes deux nécessaires : l'expiration se
 *  repousse à l'usage, et c'est ce qui fait qu'on ne ressaisit rien pendant quatre-vingt-dix
 *  jours. Le jour où la seconde cesse d'avancer, la première dit depuis quand. */
export const SessionEnregistree = z
  .object({
    id: Identifiant,
    personneId: Identifiant,
    empreinte: Empreinte,
    appareil: z.string().min(1).optional(),
    ouverteLe: Horodatage,
    vueLe: Horodatage,
    expireLe: Horodatage,
    revoqueeLe: Horodatage.optional(),
  })
  .strict();
export type SessionEnregistree = z.infer<typeof SessionEnregistree>;

/** Les seules capacités qu'une application tierce peut recevoir. Elles ne forment pas une
 * échelle : chaque case est accordée explicitement, et une capacité absente ne vaut rien. */
export const ActionApplication = z.enum(["lire", "chercher", "ouvrir_fichier"]);
export type ActionApplication = z.infer<typeof ActionApplication>;

/** L'accès durable d'une application à une seule bibliothèque. Le secret n'appartient pas à ce
 * contrat : il n'existe qu'au moment de l'émission et seule son empreinte est conservée. */
export const JetonApplication = z
  .object({
    id: Identifiant,
    application: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/),
    nom: z.string().trim().min(1).max(120),
    bibliotheque: z.string().min(1),
    actions: z.array(ActionApplication).min(1),
    creePar: z.string().min(1),
    creeLe: Horodatage,
    expireLe: Horodatage,
    revoqueLe: Horodatage.optional(),
  })
  .strict();
export type JetonApplication = z.infer<typeof JetonApplication>;

/** À quoi un défi sert. Un défi émis pour enrôler ne doit pas pouvoir servir à entrer : ce
 *  serait permettre d'ouvrir une porte avec la clé qu'on venait de faire tailler. */
export const UsageDuDefi = z.enum(["enrolement", "entree"]);
export type UsageDuDefi = z.infer<typeof UsageDuDefi>;

/** Le hasard que le serveur envoie et que l'appareil signe.
 *
 *  `consommeLe` est le cœur : un défi ne sert **qu'une fois**. La ligne consommée reste, pour
 *  qu'on puisse répondre « ce défi a déjà servi » plutôt que « ce défi n'existe pas » — deux
 *  phrases qui ne disent pas la même chose à qui lit un journal. */
export const Defi = z
  .object({
    /** Trente-deux octets de hasard, en base64url : quarante-trois caractères. Borné comme le
     *  reste, parce que ce contrat relit aussi les lignes de la base, et qu'une ligne de base
     *  n'est pas une donnée de confiance. */
    valeur: z.string().min(1).max(64),
    usage: UsageDuDefi,
    /** Nul à l'entrée : c'est la clé présentée qui dira qui. */
    personneId: Identifiant.optional(),
    creeLe: Horodatage,
    expireLe: Horodatage,
    consommeLe: Horodatage.optional(),
  })
  .strict();
export type Defi = z.infer<typeof Defi>;

/** Les bornes de longueur des preuves, et pourquoi elles ne sont pas décoratives.
 *
 *  Un champ de preuve sans maximum n'est pas seulement laxiste : il devient une **écriture
 *  d'ampleur choisie par l'appelant**. `entrer` journalise un refus avec `objet:
 *  preuve.identifiant` ; sans borne, une seule entrée refusée écrit dans le journal d'audit une
 *  ligne aussi grosse que la limite de ligne de la base — environ deux mégaoctets, contre deux
 *  cent cinquante octets pour une ligne normale. Mesuré le 29 octobre 2026 : **deux cent
 *  cinquante requêtes suffisaient à remplir une base de cinq cents mégaoctets**, et le journal
 *  est précisément la table dont SEC-07 dit que rien ne l'efface.
 *
 *  La borne agit **avant** tout le reste : un corps trop long échoue au contrat, donc `entrer`
 *  n'est pas appelée, donc rien n'est écrit. C'est la raison de la poser ici et non dans la
 *  route.
 *
 *  ## Les chiffres, et de quel côté on se trompe
 *
 *  On se trompe **large**, délibérément : une borne trop serrée interdirait à un
 *  authentificateur réel d'entrer, ce qui serait un dégât bien pire qu'un journal encombré.
 *
 *  - `IDENTIFIANT_MAX` : la spécification WebAuthn plafonne un identifiant de clé à 1 023
 *    octets, soit 1 364 caractères en base64url. En pratique les authentificateurs intégrés en
 *    rendent de seize à soixante-quatre. On prend le plafond de la spécification, arrondi.
 *  - `CLE_PUBLIQUE_MAX` : une clé P-256 en SPKI fait quatre-vingt-onze octets, cent
 *    vingt-quatre en base64. `pubKeyCredParams` ne demande que l'algorithme −7, donc rien de
 *    plus grand ne peut arriver ; quatre cent quatre-vingt-seize laisse la place à un
 *    algorithme futur sans tout rouvrir.
 *  - `DONNEES_MAX` : les données du client portent un type, le défi, l'origine et deux ou trois
 *    drapeaux — deux cent cinquante octets en usage réel. Celles de l'authentificateur font
 *    trente-sept octets plus ses extensions. Deux kilooctets sont hors d'atteinte des deux.
 *  - `SIGNATURE_MAX` : une signature ECDSA P-256 en DER fait soixante-douze octets au plus.
 *  - `APPAREIL_MAX` : ce champ est le nôtre, pas celui du navigateur ; il porte un nom lisible. */
export const IDENTIFIANT_MAX = 1_400;
export const CLE_PUBLIQUE_MAX = 496;
export const DONNEES_MAX = 2_048;
export const SIGNATURE_MAX = 512;
export const APPAREIL_MAX = 120;

/** Ce qu'un navigateur présente pour **enrôler** une clé.
 *
 *  `clePublique` et `algorithme` sont **explicitement nullables**, et c'est tout l'intérêt :
 *  `getPublicKey()` rend `null` quand le navigateur ne reconnaît pas l'algorithme. La page doit
 *  alors envoyer `null` et non rien — un champ absent se confondrait avec un bogue de la page,
 *  et l'enrôlement échouerait sans qu'on sache lequel des deux s'est produit.
 *
 *  Dit autrement : la nullité est une **réponse** du navigateur, pas une donnée manquante, et le
 *  contrat la laisse passer pour que le refus qui suit puisse la nommer. */
export const PreuveDEnrolement = z
  .object({
    /** L'identifiant que l'authentificateur donne à la clé, en base64url. */
    identifiant: z.string().min(1).max(IDENTIFIANT_MAX),
    /** La clé publique en SPKI et en base64 — ou `null` si le navigateur n'a pas su la rendre. */
    clePublique: z.string().min(1).max(CLE_PUBLIQUE_MAX).nullable(),
    /** L'algorithme annoncé — ou `null`, pour la même raison. −7 est ECDSA avec SHA-256. */
    algorithme: z.number().int().nullable(),
    donneesClient: z.string().min(1).max(DONNEES_MAX),
    appareil: z.string().min(1).max(APPAREIL_MAX).optional(),
  })
  .strict();
export type PreuveDEnrolement = z.infer<typeof PreuveDEnrolement>;

/** Ce qu'un navigateur présente pour entrer, une fois la clé enrôlée.
 *
 *  Tout arrive en base64url, parce que c'est ce que rend une page web sans transformation. Rien
 *  n'est décodé par le contrat : il dit la forme, et le décodage a ses propres refus — une
 *  signature mal formée doit être **distinguée** d'une signature fausse, et ce n'est pas au
 *  contrat de les confondre en rejetant les deux de la même façon. */
export const PreuveDEntree = z
  .object({
    /** L'identifiant de la clé, tel que l'authentificateur le rend. */
    identifiant: z.string().min(1).max(IDENTIFIANT_MAX),
    donneesAuthentificateur: z.string().min(1).max(DONNEES_MAX),
    donneesClient: z.string().min(1).max(DONNEES_MAX),
    signature: z.string().min(1).max(SIGNATURE_MAX),
  })
  .strict();
export type PreuveDEntree = z.infer<typeof PreuveDEntree>;
