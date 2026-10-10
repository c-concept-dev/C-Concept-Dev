/** La session qui évite de ressaisir quoi que ce soit (SEC-02).
 *
 *  L'exigence se mesure à une chose : « utilisation quotidienne sans ressaisie pendant 90
 *  jours ». Trois propriétés y suffisent, et elles sont ici.
 *
 *  **Quatre-vingt-dix jours, repoussés à chaque usage.** Une session qui expire à date fixe
 *  demande une ressaisie le quatre-vingt-onzième jour, quoi qu'on fasse. Une session glissante
 *  n'expire que si l'on cesse de s'en servir — ce qui est précisément le moment où elle doit
 *  expirer.
 *
 *  **Révocable à distance.** La révocation vit dans le registre, pas dans le jeton : un jeton ne
 *  peut pas se retirer lui-même. C'est la seule raison pour laquelle le registre est consulté à
 *  chaque usage plutôt que de se fier à la signature.
 *
 *  **Une empreinte, jamais le jeton.** Le registre garde de quoi reconnaître une session, pas de
 *  quoi s'en servir : une base lue ne doit pas livrer de quoi se faire passer pour quelqu'un. */

/** Quatre-vingt-dix jours, en secondes. Le plancher de SEC-02, pas un maximum. */
export const DUREE_SESSION = 90 * 24 * 60 * 60;

/** Ce que le registre garde d'une session. */
export type Session = {
  readonly id: string;
  readonly utilisateurId: string;
  /** Empreinte du jeton, jamais le jeton. */
  readonly empreinte: string;
  /** Secondes depuis l'époque. */
  readonly vueLe: number;
  readonly expireLe: number;
  readonly revoqueeLe?: number;
};

export type EtatSession =
  | { readonly valide: true; readonly repousserA: number }
  | { readonly valide: false; readonly raison: "révoquée" | "périmée" };

/** Si cette session ouvre encore, et jusqu'à quand elle devrait aller.
 *
 *  La révocation est regardée **avant** l'expiration : une session révoquée hier et périmée
 *  aujourd'hui a été révoquée, et c'est ce qu'un journal doit pouvoir dire. */
export function etatDe(session: Session, maintenant: number): EtatSession {
  if (session.revoqueeLe !== undefined && session.revoqueeLe <= maintenant) return { valide: false, raison: "révoquée" };
  if (session.expireLe <= maintenant) return { valide: false, raison: "périmée" };
  return { valide: true, repousserA: maintenant + DUREE_SESSION };
}

/** Faut-il réécrire la date d'expiration ?
 *
 *  Pas à chaque requête : une page qui en fait trente écrirait trente fois dans le registre pour
 *  repousser la même échéance de quelques secondes. Une fois par jour suffit à ce qu'une session
 *  d'usage quotidien ne périme jamais, et c'est le seul but.
 *
 *  Le seuil est un quatre-vingt-dixième de la durée, c'est-à-dire un jour : si la durée change,
 *  la cadence d'écriture suit sans qu'on ait à y penser. */
export function aRepousser(session: Session, maintenant: number): boolean {
  return session.expireLe - maintenant < DUREE_SESSION - DUREE_SESSION / 90;
}

/** Les attributs du témoin déposé chez le lecteur.
 *
 *  `HttpOnly` : aucun script n'y touche, donc aucune extension ni aucune injection ne l'emporte.
 *  `Secure` : jamais en clair. `SameSite=Lax` : un site tiers ne déclenche pas d'action en notre
 *  nom, mais revenir par un lien reste possible — `Strict` obligerait à recharger pour être
 *  reconnu, ce qui ressemble à une ressaisie.
 *  `Path=/` : la session vaut pour tout le service, pas pour une branche.
 *
 *  Aucun `Domain` : le témoin reste sur l'hôte exact qui l'a posé, et ne part pas chez un
 *  sous-domaine voisin. */
export function entetTemoin(nom: string, valeur: string, dureeSecondes: number): string {
  const morceaux = [
    `${nom}=${valeur}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(dureeSecondes))}`,
  ];
  return morceaux.join("; ");
}

/** L'en-tête qui retire le témoin. Même attributs, durée nulle : un navigateur n'efface un
 *  témoin que si on le lui redonne avec les mêmes attributs. */
export function entetRetrait(nom: string): string {
  return entetTemoin(nom, "", 0);
}

/** La valeur d'un témoin dans un en-tête `Cookie`, ou rien.
 *
 *  Analyse volontairement stricte : on cherche un nom exact entre des points-virgules, et non une
 *  sous-chaîne — « session » ne doit pas se laisser lire dans « fausse_session ». */
export function temoinDe(entete: string | null | undefined, nom: string): string | undefined {
  if (entete === null || entete === undefined) return undefined;
  for (const morceau of entete.split(";")) {
    const egal = morceau.indexOf("=");
    if (egal < 0) continue;
    if (morceau.slice(0, egal).trim() === nom) return morceau.slice(egal + 1).trim();
  }
  return undefined;
}

/** L'empreinte d'un jeton de session, telle qu'on la range dans le registre. */
export async function empreinteDuJeton(jeton: string): Promise<string> {
  const condense = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jeton));
  return [...new Uint8Array(condense)].map((octet) => octet.toString(16).padStart(2, "0")).join("");
}

/** Un jeton de session neuf : 32 octets de hasard, en base64url.
 *
 *  Pas un identifiant lisible, pas un compteur, pas un UUID : rien qui se devine ni ne se
 *  rapproche d'un autre. */
export function jetonNeuf(): string {
  const octets = crypto.getRandomValues(new Uint8Array(32));
  let texte = "";
  for (const octet of octets) texte += String.fromCharCode(octet);
  return btoa(texte).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
