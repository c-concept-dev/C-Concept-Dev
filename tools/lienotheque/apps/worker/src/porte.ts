import type { SessionEnregistree } from "@lienotheque/contrats";
import {
  aRepousser,
  empreinteDuJeton,
  etatDe,
  permet,
  temoinDe,
  type Niveau,
} from "@lienotheque/noyau";
import { laSessionParEmpreinte, leNiveauDe, repousserLaSession } from "./qui-entre.js";
import type { BaseSql } from "./registre.js";

/** La porte : d'un témoin à une personne autorisée (SEC-02, SEC-03).
 *
 *  Trois questions, dans cet ordre, et chacune peut fermer la porte :
 *
 *  1. **qui** présente ce témoin — une session reconnue par l'empreinte du jeton ;
 *  2. cette session **vaut-elle encore** — ni révoquée, ni périmée ;
 *  3. cette personne a-t-elle le **droit** de ce qu'elle demande, sur cette bibliothèque.
 *
 *  ## Pourquoi la porte est en deux temps
 *
 *  Les deux premières questions ne demandent **aucune configuration** ; la troisième a besoin de
 *  savoir quelle bibliothèque. Or une règle acquise le 10 octobre veut la porte **avant** la
 *  configuration : vérifier la configuration d'abord apprenait à un appelant anonyme si la façade
 *  est configurée, et sur quelle bibliothèque elle bute.
 *
 *  D'où `identifierParSession` puis `autoriser`, qu'une route appelle de part et d'autre de sa
 *  configuration.
 *
 *  **Et aucune fonction ne les compose**, délibérément. Il en existait une, et c'est par elle que
 *  le défaut du 19 octobre est arrivé : la porte d'enrôlement l'appelait après avoir lu la
 *  configuration, si bien qu'un inconnu recevait 503 et apprenait que la cérémonie n'est pas
 *  configurée avant d'avoir rien présenté. Le Worker déployé l'a montré ; les tests ne le
 *  voyaient pas, car ils éprouvaient la porte avec les réglages toujours posés.
 *
 *  Une composition cache l'ordre à qui l'appelle. Deux appels le montrent.
 *
 *  ## Un seul mot, un seul statut
 *
 *  Aucun refus ne dit lequel des trois a échoué, et tous rendent 401. Un 403 là où un 401 aurait
 *  suffi apprendrait qu'on a été reconnu ; un « droits insuffisants » apprendrait que la
 *  bibliothèque existe. C'est la règle déjà écrite dans `droits.ts` — « jamais une phrase qui
 *  apprend ce qui existe » — appliquée aussi au statut, et pas seulement à la phrase.
 *
 *  Le journal, lui, sait : `pourLeJournal` nomme la cause, et ne sort jamais.
 *
 *  ## Rien par défaut
 *
 *  Une personne absente de la table des droits n'a **aucun** droit. Une action absente de la
 *  table des exigences n'est permise à **personne**. Un niveau que le code ne connaît pas ne
 *  vaut **rien** — une base trafiquée doit laisser la porte fermée, pas la faire tomber. */

/** Le nom du témoin de session.
 *
 *  Préfixé, et sans rapport avec un nom courant : un témoin qui s'appellerait « session » se
 *  heurterait au premier outil tiers posé sur le même hôte. */
export const NOM_DU_TEMOIN = "ln_session";

const MOT = "Accès refusé.";

/** Ce qu'un refus de la porte rend. Le mot et le statut vont au demandeur ; `pourLeJournal`
 *  jamais — et son nom est là pour que personne ne s'y trompe. */
export type Fermee = {
  readonly ouverte: false;
  readonly statut: 401;
  readonly mot: string;
  readonly pourLeJournal: string;
};

const fermee = (pourLeJournal: string): Fermee => ({ ouverte: false, statut: 401, mot: MOT, pourLeJournal });

export type Identifiee =
  | { readonly ouverte: true; readonly personneId: string; readonly session: SessionEnregistree }
  | Fermee;

const enSecondes = (horodatage: string): number => Math.floor(Date.parse(horodatage) / 1000);

/** La session telle que la logique pure du noyau la regarde. */
const vueDuNoyau = (session: SessionEnregistree) => ({
  id: session.id,
  utilisateurId: session.personneId,
  empreinte: session.empreinte,
  vueLe: enSecondes(session.vueLe),
  expireLe: enSecondes(session.expireLe),
  ...(session.revoqueeLe === undefined ? {} : { revoqueeLe: enSecondes(session.revoqueeLe) }),
});

/** Premier temps : qui présente ce témoin, et sa session vaut-elle encore ?
 *
 *  La session est relue **à chaque requête**, et c'est voulu : la révocation vit dans le
 *  registre, pas dans le jeton, et un jeton ne peut pas se retirer lui-même. C'est la seule
 *  raison pour laquelle on ne se contente pas de vérifier une signature. */
export async function identifierParSession(
  registre: BaseSql,
  entetes: Headers,
  maintenant: string,
): Promise<Identifiee> {
  const jeton = temoinDe(entetes.get("cookie"), NOM_DU_TEMOIN);
  if (jeton === undefined || jeton.length === 0) return fermee("aucun témoin de session");

  const session = await laSessionParEmpreinte(registre, await empreinteDuJeton(jeton));
  if (session === undefined) return fermee("session inconnue");

  const etat = etatDe(vueDuNoyau(session), enSecondes(maintenant));
  if (!etat.valide) return fermee(`session ${etat.raison}`);

  return { ouverte: true, personneId: session.personneId, session };
}

/** Second temps : cette personne a-t-elle le droit de ce geste, sur cette bibliothèque ? */
export async function autoriser(
  registre: BaseSql,
  personneId: string,
  bibliotheque: string,
  action: string,
): Promise<{ readonly ouverte: true; readonly niveau: Niveau } | Fermee> {
  const niveau = await leNiveauDe(registre, personneId, bibliotheque);
  if (niveau === undefined) return fermee("aucun droit sur cette bibliothèque");
  if (!permet(niveau, action)) return fermee(`niveau ${niveau} insuffisant pour « ${action} »`);
  return { ouverte: true, niveau };
}

/** Repousse l'échéance d'une session qui vient de servir — pas plus d'une fois par jour.
 *
 *  À appeler **après** que la porte a décidé d'ouvrir : repousser une session qu'on refuse serait
 *  lui donner de la vie pour rien. */
export async function repousserSiBesoin(
  registre: BaseSql,
  session: SessionEnregistree,
  maintenant: string,
): Promise<void> {
  if (aRepousser(vueDuNoyau(session), enSecondes(maintenant)))
    await repousserLaSession(registre, session.id, maintenant);
}

/** La session que porte ce témoin, sans regarder ni son état ni aucun droit.
 *
 *  Se déconnecter demande une **identité**, pas une autorisation : quelqu'un qui n'a aucun droit
 *  doit tout de même pouvoir fermer sa session, et révoquer une session déjà périmée ne fait rien
 *  de mal.
 *
 *  Ce que cette fonction garantit, et qui suffit : on ne peut fermer **que** la session dont on
 *  détient le jeton, puisque c'est son empreinte qui la retrouve. */
export async function laSessionDuTemoin(
  registre: BaseSql,
  entetes: Headers,
): Promise<SessionEnregistree | undefined> {
  const jeton = temoinDe(entetes.get("cookie"), NOM_DU_TEMOIN);
  if (jeton === undefined || jeton.length === 0) return undefined;
  return laSessionParEmpreinte(registre, await empreinteDuJeton(jeton));
}
