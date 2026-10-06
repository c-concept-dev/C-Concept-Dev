import { z } from "zod";
import { Horodatage, Identifiant, RefOutil } from "./commun.js";
import { PointReprise } from "./travail.js";

/** L'échange entre l'hôte et le processus qui exécute un travail (JOB-01 à JOB-09, PLT-02).
 *
 *  L'hôte garde la file, le dépôt, les fichiers et les moteurs ; il lance un processus par
 *  travail, lui envoie une demande, reçoit sa progression puis son résultat, et c'est lui seul
 *  qui écrit. Le processus ne touche jamais le dépôt : il rend ce qu'il a produit, l'hôte le
 *  valide et l'active en une opération (JOB-06).
 *
 *  Deux frontières se croisent ici — un tuyau entre deux processus, et deux langages — et rien
 *  n'y passe sans contrat. Ce fichier décrit l'enveloppe ; la charge d'un travail est validée par
 *  le contrat de l'outil qui l'interprète, là où on sait de quel outil il s'agit. */

/** Version du protocole. Elle monte dès qu'un message change de forme.
 *
 *  Chaque message la porte, et pas seulement la salutation : un désaccord se voit alors au premier
 *  message venu, quel qu'il soit, plutôt qu'à la seule poignée de main. C'est la même raison qui
 *  fait porter sa version à une lecture — un interlocuteur qui a changé sans le dire est le genre
 *  de panne qu'on ne diagnostique pas. */
export const VERSION_PROTOCOLE = 1;

/** Deux travaux lourds au plus à la fois.
 *
 *  Le chiffre ne vient pas d'une mesure de débit mais d'une contrainte de mémoire : chaque
 *  processus porte son propre socle, mesuré à 93 à 106 Mo, et la marque haute du ramasse-miettes
 *  a été relevée à 1,1 Go sur F3. Deux tiennent sur une machine ordinaire, quatre ne tiendraient
 *  pas. */
export const TRAVAUX_LOURDS_SIMULTANES = 2;

/** Plafond de mémoire d'un processus, en mégaoctets.
 *
 *  Ce n'est pas un budget, c'est un garde-fou : le jeu de travail réel de la chaîne est d'une page
 *  vivante — environ 9 Mo, quel que soit le document —, et la marque haute observée est de 1,1 Go.
 *  Le double de cette marque laisse de l'air au ramasse-miettes et arrête net une boucle qui
 *  s'emballerait, au lieu de laisser la machine se figer. */
export const MEMOIRE_MAX_MO = 2048;

/** Délai laissé à un processus pour s'arrêter de lui-même avant qu'on le tue.
 *
 *  Un arrêt propre écrit son dernier point de reprise ; un processus tué ne le fait pas, et le
 *  travail repart du point précédent. Rien n'est perdu dans les deux cas (JOB-03), mais le
 *  premier évite de refaire le travail déjà fait. */
export const DELAI_ARRET_PROPRE_S = 5;

/** Pourquoi l'hôte demande l'arrêt. La raison voyage, parce qu'elle change ce que le processus
 *  fait de son dernier point de reprise — et ce que l'écran en dira. */
export const RaisonArret = z.enum(["fermeture", "pause", "annulation"]);
export type RaisonArret = z.infer<typeof RaisonArret>;

export const NiveauJournal = z.enum(["information", "avertissement", "erreur"]);
export type NiveauJournal = z.infer<typeof NiveauJournal>;

const enveloppe = { protocole: z.number().int().positive(), travailId: Identifiant };

// ---- Ce que l'hôte envoie ----

/** La demande : ce qu'il faut faire, et d'où repartir.
 *
 *  `charge` n'est pas décrit ici. Le dire reviendrait à nommer, dans un contrat générique, ce que
 *  chaque outil attend — et donc à écrire du domaine dans du code qui n'en connaît aucun (CLA-01).
 *  C'est l'outil désigné par `outil` qui la valide, avec son propre contrat. */
export const Demande = z
  .object({ type: z.literal("demande"), ...enveloppe, outil: RefOutil, versionCible: Identifiant, reprendreA: PointReprise.optional(), charge: z.unknown() })
  .strict();
export type Demande = z.infer<typeof Demande>;

export const Arret = z.object({ type: z.literal("arret"), ...enveloppe, raison: RaisonArret }).strict();
export type Arret = z.infer<typeof Arret>;

export const MessageVersProcessus = z.discriminatedUnion("type", [Demande, Arret]);
export type MessageVersProcessus = z.infer<typeof MessageVersProcessus>;

// ---- Ce que le processus renvoie ----

/** La salutation : le processus dit qui il est avant qu'on lui confie quoi que ce soit.
 *
 *  Le moteur est nommé et versionné parce que la décision du lot D2 l'exige — même version en
 *  développement et dans le paquet — et qu'un écart doit se constater, pas se deviner. */
export const Salutation = z
  .object({
    type: z.literal("salutation"),
    protocole: z.number().int().positive(),
    moteur: z.object({ nom: z.string().min(1), version: z.string().min(1) }).strict(),
  })
  .strict();
export type Salutation = z.infer<typeof Salutation>;

export const Progression = z
  .object({ type: z.literal("progression"), ...enveloppe, progression: z.number().min(0).max(1), pointReprise: PointReprise.optional() })
  .strict();
export type Progression = z.infer<typeof Progression>;

/** Une ligne de journal, destinée à être lue par un humain dans l'écran de traitement (JOB-05). */
export const Journal = z
  .object({ type: z.literal("journal"), ...enveloppe, niveau: NiveauJournal, texte: z.string().min(1), le: Horodatage })
  .strict();
export type Journal = z.infer<typeof Journal>;

/** Le résultat. Comme la charge d'une demande, il n'est pas décrit ici : c'est une proposition que
 *  l'hôte validera avec le contrat de l'outil avant de l'écrire, jamais une écriture (JOB-06). */
export const Resultat = z.object({ type: z.literal("resultat"), ...enveloppe, charge: z.unknown() }).strict();
export type Resultat = z.infer<typeof Resultat>;

/** Un échec dit sa cause et s'il est reprenable : aucune erreur n'est avalée (JOB-05). */
export const Echec = z
  .object({
    type: z.literal("echec"),
    ...enveloppe,
    cause: z.string().min(1),
    elements: z.array(z.string()).default([]),
    reprisePossible: z.boolean(),
    pointReprise: PointReprise.optional(),
  })
  .strict();
export type Echec = z.infer<typeof Echec>;

export const MessageVersHote = z.discriminatedUnion("type", [Salutation, Progression, Journal, Resultat, Echec]);
export type MessageVersHote = z.infer<typeof MessageVersHote>;

/** Ce qu'on répond à un interlocuteur dont le protocole n'est pas le nôtre.
 *
 *  Un désaccord de version se refuse, il ne se rattrape pas : accepter « à peu près » un message
 *  d'une autre version, c'est accepter de mal l'interpréter. Le refus nomme les deux versions,
 *  pour qu'on sache lequel des deux côtés n'a pas été remplacé. */
export type DesaccordDeProtocole = {
  readonly attendu: number;
  readonly recu: number;
  readonly message: string;
};

export function desaccordDeProtocole(recu: number, attendu: number = VERSION_PROTOCOLE): DesaccordDeProtocole | undefined {
  if (recu === attendu) return undefined;
  return {
    attendu,
    recu,
    message: `Version d'échange ${recu} reçue, ${attendu} attendue : l'application et son moteur de traitement ne sont pas de la même version.`,
  };
}
