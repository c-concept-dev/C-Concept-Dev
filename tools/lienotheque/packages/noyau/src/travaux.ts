import {
  BATTEMENT_VERROU_S,
  EXPIRATION_VERROU_S,
  ETATS_TERMINAUX,
  type EtatTravail,
  type Identifiant,
  type Travail,
} from "@lienotheque/contrats";

/** File de travaux durable (JOB-01 à JOB-09).
 *
 *  Transitions pures : chaque fonction rend un nouveau travail, le stockage s'occupe de le
 *  persister. Le bail est celui du contrat — 5 secondes de battement, 15 secondes d'expiration —
 *  et ces constantes ne sont écrites qu'à un endroit. */

export { BATTEMENT_VERROU_S, EXPIRATION_VERROU_S };

const secondes = (instant: Date): number => Math.floor(instant.getTime() / 1000);
const horodatage = (instant: Date): string => instant.toISOString();

/** Un travail sans bail, ou dont le bail a expiré, est reprenable (JOB-02). Un travail en pause
 *  attend une reprise explicite ; un travail arrêté ne repart pas. */
export function reprenable(travail: Travail, maintenant: Date): boolean {
  if (ETATS_TERMINAUX.includes(travail.etat) || travail.etat === "en_pause") return false;
  const bail = travail.verrou;
  return bail === undefined || secondes(new Date(bail.expireLe)) <= secondes(maintenant);
}

/** Pas suivant à traiter : juste après le dernier point de reprise (JOB-03). */
export const repriseA = (travail: Travail): number => travail.pointReprise?.valeur ?? 0;

function avecBail(travail: Travail, appareilId: Identifiant, maintenant: Date): Travail {
  const expire = new Date(maintenant.getTime() + EXPIRATION_VERROU_S * 1000);
  return {
    ...travail,
    etat: "en_cours",
    verrou: { appareilId, battuLe: horodatage(maintenant), expireLe: horodatage(expire) },
    majLe: horodatage(maintenant),
  };
}

/** Prend le travail : nouvelle tentative s'il avait déjà commencé (JOB-02). */
export function prendre(travail: Travail, appareilId: Identifiant, maintenant: Date): Travail {
  if (!reprenable(travail, maintenant)) throw new Error(`Travail non reprenable : ${travail.id} (${travail.etat})`);
  const repris = repriseA(travail) > 0 || travail.etat === "en_echec_recuperable";
  return avecBail({ ...travail, tentative: repris ? travail.tentative + 1 : travail.tentative }, appareilId, maintenant);
}

/** Renouvelle le bail seulement si le battement est dû : inutile d'écrire à chaque pas. */
export function battreSiDu(travail: Travail, appareilId: Identifiant, maintenant: Date): Travail | undefined {
  const bail = travail.verrou;
  if (bail !== undefined && secondes(maintenant) - secondes(new Date(bail.battuLe)) < BATTEMENT_VERROU_S) return undefined;
  return avecBail(travail, appareilId, maintenant);
}

/** Enregistre un point de reprise (JOB-03). Au dernier pas, le travail est terminé et libère son bail. */
export function avancer(travail: Travail, valeur: number, unite: "page" | "lot" | "fichier", total: number, maintenant: Date): Travail {
  const fini = total > 0 && valeur >= total;
  const { verrou: _bail, ...sansBail } = travail;
  const avance: Travail = {
    ...(fini ? sansBail : travail),
    pointReprise: { unite, valeur },
    progression: total > 0 ? Math.min(1, valeur / total) : 1,
    majLe: horodatage(maintenant),
  };
  return fini ? { ...avance, etat: "termine", progression: 1 } : avance;
}

/** Une erreur n'est jamais avalée : elle est enregistrée avec sa cause et ce qu'elle a touché (JOB-05). */
export function echouer(
  travail: Travail,
  erreur: { cause: string; elements: readonly string[]; reprisePossible: boolean },
  maintenant: Date,
): Travail {
  const { verrou: _bail, ...sansBail } = travail;
  return {
    ...sansBail,
    etat: erreur.reprisePossible ? "en_echec_recuperable" : "en_echec_definitif",
    erreur: { cause: erreur.cause, elements: [...erreur.elements], reprisePossible: erreur.reprisePossible },
    majLe: horodatage(maintenant),
  };
}

/** Pause et annulation laissent la version active intacte : elles ne touchent que le travail (JOB-08). */
export function mettreEnPause(travail: Travail, maintenant: Date): Travail {
  const { verrou: _bail, ...sansBail } = travail;
  return { ...sansBail, etat: "en_pause", majLe: horodatage(maintenant) };
}

export function reprendre(travail: Travail, maintenant: Date): Travail {
  if (travail.etat !== "en_pause") throw new Error(`Travail non en pause : ${travail.id}`);
  return { ...travail, etat: "en_file", majLe: horodatage(maintenant) };
}

export function annuler(travail: Travail, maintenant: Date): Travail {
  const { verrou: _bail, ...sansBail } = travail;
  return { ...sansBail, etat: "annule", majLe: horodatage(maintenant) };
}

/** Ordre de service : les travaux repris d'abord, puis les plus anciens. */
export function prochain(travaux: readonly Travail[], maintenant: Date): Travail | undefined {
  return [...travaux]
    .filter((t) => reprenable(t, maintenant))
    .sort((a, b) => repriseA(b) - repriseA(a) || a.creeLe.localeCompare(b.creeLe))[0];
}

/** Rejouer la même demande ne crée pas un second travail (JOB-04). */
export function dejaEnFile(travaux: readonly Travail[], empreinteEntree: string): Travail | undefined {
  return travaux.find((t) => t.empreinteEntree === empreinteEntree && !ETATS_TERMINAUX.includes(t.etat as EtatTravail));
}
