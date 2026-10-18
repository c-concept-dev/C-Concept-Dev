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

/** Ce qu'un navigateur présente pour entrer, une fois la clé enrôlée.
 *
 *  Tout arrive en base64url, parce que c'est ce que rend une page web sans transformation. Rien
 *  n'est décodé par le contrat : il dit la forme, et le décodage a ses propres refus — une
 *  signature mal formée doit être **distinguée** d'une signature fausse, et ce n'est pas au
 *  contrat de les confondre en rejetant les deux de la même façon. */
export const PreuveDEntree = z
  .object({
    /** L'identifiant de la clé, tel que l'authentificateur le rend. */
    identifiant: z.string().min(1),
    donneesAuthentificateur: z.string().min(1),
    donneesClient: z.string().min(1),
    signature: z.string().min(1),
  })
  .strict();
export type PreuveDEntree = z.infer<typeof PreuveDEntree>;
