import { Defi, type PreuveDEnrolement, type UsageDuDefi } from "@lienotheque/contrats";
import { defiNeuf, examinerLesDonneesClient, examinerUneClePublique } from "@lienotheque/noyau";
import type { BaseSql, Resultat } from "./registre.js";
import { enrolerUneCle, laPersonne, type CleEnrolee } from "./qui-entre.js";

/** L'enrôlement d'une clé : un défi, une création, une clé publique rangée (SEC-02).
 *
 *  ## Ce que l'enrôlement vérifie, et dans quel ordre
 *
 *  1. le défi existe, n'a pas servi, n'est pas périmé, et a été émis **pour enrôler** ;
 *  2. les données du client disent bien une création, pour ce défi, depuis notre origine ;
 *  3. la clé publique est présente, de l'algorithme demandé, et **s'importe réellement** ;
 *  4. alors seulement la clé est rangée, et le défi marqué comme ayant servi.
 *
 *  L'ordre n'est pas indifférent. Le défi est consommé **en dernier**, et seulement si tout le
 *  reste a tenu : un refus qui vient de la clé n'est pas la faute du défi, et obliger à en
 *  redemander un pour réessayer depuis un autre appareil serait une rudesse gratuite.
 *
 *  ## Le cas qui commande cette étape
 *
 *  `getPublicKey()` peut rendre `null`. La mesure du 18 octobre a montré que la méthode existe
 *  sur le Safari livré — pas qu'elle rend une clé, ce qui demande un doigt sur le capteur. Si
 *  elle rend `null`, **l'enrôlement échoue en le disant**. Jamais de repli sur l'objet
 *  d'attestation : ce serait ramener le CBOR par la petite porte, un jour où personne ne regarde.
 *
 *  ## Il n'y a pas de route ici, et c'est voulu
 *
 *  Ces fonctions existent et sont éprouvées ; aucune n'est exposée sur le réseau. Une route
 *  d'enrôlement que rien ne garde serait exactement la porte ouverte qu'on vient de fermer à
 *  l'étape 4.0 — quiconque la trouverait s'enrôlerait. Elle viendra quand les droits la
 *  garderont (étape 4.6). */

/** Combien de temps un défi vaut : cinq minutes.
 *
 *  Une cérémonie prend quelques secondes ; cinq minutes laissent le temps de chercher l'appareil
 *  et de poser le doigt. Au-delà, un défi qui traîne est un défi qu'on a oublié. */
export const DUREE_DEFI = 300;

type LigneDefi = {
  valeur: string;
  usage: string;
  personne_id: string | null;
  cree_le: string;
  expire_le: string;
  consomme_le: string | null;
};

const versDefi = (ligne: LigneDefi): Defi =>
  Defi.parse({
    valeur: ligne.valeur,
    usage: ligne.usage,
    ...(ligne.personne_id === null ? {} : { personneId: ligne.personne_id }),
    creeLe: ligne.cree_le,
    expireLe: ligne.expire_le,
    ...(ligne.consomme_le === null ? {} : { consommeLe: ligne.consomme_le }),
  });

const CHAMPS_DEFI = "valeur, usage, personne_id, cree_le, expire_le, consomme_le";

const instant = (horodatage: string): number => {
  const quand = Date.parse(horodatage);
  if (Number.isNaN(quand)) throw new Error(`Horodatage illisible : ${horodatage}`);
  return quand;
};

/** Ouvre un défi : le hasard que le serveur envoie et que l'appareil signera. */
export async function ouvrirUnDefi(
  registre: BaseSql,
  pour: { readonly usage: UsageDuDefi; readonly personneId?: string },
  maintenant: string,
): Promise<Resultat<Defi>> {
  if (pour.personneId !== undefined && (await laPersonne(registre, pour.personneId)) === undefined)
    return { fait: false, raison: "Personne inconnue." };

  const defi = Defi.parse({
    valeur: defiNeuf(),
    usage: pour.usage,
    ...(pour.personneId === undefined ? {} : { personneId: pour.personneId }),
    creeLe: maintenant,
    expireLe: new Date(instant(maintenant) + DUREE_DEFI * 1000).toISOString(),
  });

  await registre
    .prepare("INSERT INTO defi (valeur, usage, personne_id, cree_le, expire_le, consomme_le) VALUES (?, ?, ?, ?, ?, NULL)")
    .bind(defi.valeur, defi.usage, defi.personneId ?? null, defi.creeLe, defi.expireLe)
    .run();
  return { fait: true, valeur: defi };
}

/** Marque un défi comme ayant servi, et rend ce qu'il disait — ou refuse en nommant pourquoi.
 *
 *  La consommation est une **mise à jour sous condition** : on n'écrit que si la ligne est encore
 *  vierge, et le nombre de lignes touchées dit si c'est nous qui l'avons emportée. Lire puis
 *  écrire laisserait deux requêtes simultanées consommer le même défi, chacune ayant lu « pas
 *  encore servi » avant que l'autre n'écrive.
 *
 *  Les quatre refus se distinguent, parce qu'ils ne décrivent pas la même situation : un défi
 *  inconnu peut être une sonde, un défi déjà servi un double clic, un défi périmé une personne
 *  qui a cherché son appareil, un mauvais usage une tentative de détourner la cérémonie. */
export async function consommerLeDefi(
  registre: BaseSql,
  valeur: string,
  usage: UsageDuDefi,
  maintenant: string,
): Promise<Resultat<Defi>> {
  const ligne = await registre
    .prepare(`SELECT ${CHAMPS_DEFI} FROM defi WHERE valeur = ?`)
    .bind(valeur)
    .first<LigneDefi>();
  if (ligne === null) return { fait: false, raison: "Défi inconnu." };

  const defi = versDefi(ligne);
  if (defi.usage !== usage) return { fait: false, raison: `Défi émis pour un autre usage (${defi.usage}).` };
  if (defi.consommeLe !== undefined) return { fait: false, raison: "Ce défi a déjà servi." };
  if (instant(defi.expireLe) <= instant(maintenant)) return { fait: false, raison: "Défi périmé." };

  const ecrit = await registre
    .prepare("UPDATE defi SET consomme_le = ? WHERE valeur = ? AND consomme_le IS NULL")
    .bind(maintenant, valeur)
    .run();
  // Zéro ligne touchée : quelqu'un d'autre l'a consommé entre la lecture et l'écriture.
  if (ecrit.meta.changes === 0) return { fait: false, raison: "Ce défi a déjà servi." };

  return { fait: true, valeur: { ...defi, consommeLe: maintenant } };
}

/** Enrôle une clé au terme d'une cérémonie de création.
 *
 *  Chaque refus porte sa raison. Ces raisons sont faites pour **le journal et pour nous** : ce
 *  qui sort vers un demandeur, le jour où une route existera, dira un seul mot — apprendre que
 *  c'est la clé plutôt que le défi qui a été refusé, c'est apprendre où chercher. */
export async function enroler(
  registre: BaseSql,
  preuve: PreuveDEnrolement,
  cadre: { readonly origine: string; readonly maintenant: string; readonly auteur: string },
): Promise<Resultat<CleEnrolee>> {
  // 1. Le défi, lu sans être consommé : s'il ne vaut rien, rien d'autre n'a de sens.
  const ligne = await registre
    .prepare(`SELECT ${CHAMPS_DEFI} FROM defi WHERE valeur = ?`)
    .bind(lireLeDefi(preuve.donneesClient) ?? "")
    .first<LigneDefi>();
  if (ligne === null) return { fait: false, raison: "Défi inconnu." };

  const defi = versDefi(ligne);
  if (defi.usage !== "enrolement") return { fait: false, raison: `Défi émis pour un autre usage (${defi.usage}).` };
  if (defi.consommeLe !== undefined) return { fait: false, raison: "Ce défi a déjà servi." };
  if (instant(defi.expireLe) <= instant(cadre.maintenant)) return { fait: false, raison: "Défi périmé." };
  if (defi.personneId === undefined)
    return { fait: false, raison: "Ce défi ne désigne aucune personne : on ne sait pas pour qui enrôler." };

  // 2. Ce que le navigateur dit avoir fait : une création, pour ce défi, depuis notre origine.
  const vu = examinerLesDonneesClient(preuve.donneesClient, {
    type: "webauthn.create",
    defi: defi.valeur,
    origine: cadre.origine,
  });
  if (!vu.bon) return { fait: false, raison: `Cérémonie refusée : ${vu.raison}` };

  // 3. La clé publique. C'est ici que « getPublicKey() nul » s'entend.
  const examen = await examinerUneClePublique(preuve.clePublique, preuve.algorithme);
  if (!examen.bon) return { fait: false, raison: `Clé refusée : ${examen.raison}` };

  // 4. Tout a tenu : on range la clé, puis on marque le défi. Dans cet ordre — un défi consommé
  //    sans clé rangée obligerait à en redemander un pour rien.
  const enrolee = await enrolerUneCle(
    registre,
    {
      personneId: defi.personneId,
      identifiant: preuve.identifiant,
      clePublique: preuve.clePublique ?? "",
      compteur: 0,
      ...(preuve.appareil === undefined ? {} : { appareil: preuve.appareil }),
    },
    cadre.maintenant,
    cadre.auteur,
  );
  if (!enrolee.fait) return enrolee;

  const consomme = await consommerLeDefi(registre, defi.valeur, "enrolement", cadre.maintenant);
  if (!consomme.fait) return { fait: false, raison: consomme.raison };

  return enrolee;
}

/** Le défi annoncé dans les données du client, sans rien vérifier d'autre.
 *
 *  Il sert uniquement à **retrouver** la ligne du défi ; tout ce qui en découle est vérifié
 *  ensuite par `examinerLesDonneesClient`, qui compare ce défi à celui de la ligne trouvée. Lire
 *  ici avant de vérifier là n'ouvre rien : une valeur inventée ne désigne aucune ligne. */
function lireLeDefi(donneesClient: string): string | undefined {
  try {
    const normal = donneesClient.replaceAll("-", "+").replaceAll("_", "/");
    const texte = atob(normal.padEnd(Math.ceil(normal.length / 4) * 4, "="));
    const lu: unknown = JSON.parse(texte);
    if (lu === null || typeof lu !== "object") return undefined;
    const { challenge } = lu as Record<string, unknown>;
    return typeof challenge === "string" ? challenge : undefined;
  } catch {
    return undefined;
  }
}
