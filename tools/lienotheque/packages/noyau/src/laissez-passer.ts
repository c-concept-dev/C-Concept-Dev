import { appartientA } from "./objets.js";

/** Le laissez-passer qui ouvre un fichier, et rien d'autre (SEC-05).
 *
 *  « Un identifiant difficile à deviner n'est pas une autorisation » : ce n'est pas la clé de
 *  l'objet qui autorise, c'est la signature. Un laissez-passer dit **quel fichier**, **de quelle
 *  bibliothèque**, et **jusqu'à quand** ; il est signé avec un secret que seul l'hébergeur
 *  détient, et il ne vaut que quelques minutes.
 *
 *  Pourquoi le Worker sert le fichier plutôt que de signer une adresse chez l'hébergeur de
 *  fichiers : un secret de moins (SEC-06). La sortie ne coûte rien, et le jour où une mesure
 *  montrera que retransmettre pèse trop, on changera — pas avant. */

/** Ce qu'un laissez-passer autorise. */
export type Laissez = {
  readonly bibliotheque: string;
  /** La clé de l'objet, composée par `objets.ts` et jamais par une requête. */
  readonly cle: string;
  /** Secondes depuis l'époque. Court : un laissez-passer qui dure est une adresse publique. */
  readonly jusqua: number;
};

/** Ce qu'une vérification rend. Jamais une exception : un refus est un cas ordinaire, et le
 *  distinguer d'une panne est tout l'intérêt. */
export type Verdict = { readonly ouvert: true; readonly laissez: Laissez } | { readonly ouvert: false; readonly raison: string };

const encodeur = new TextEncoder();

const enBase64Url = (octets: ArrayBuffer | Uint8Array): string => {
  const vue = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  let texte = "";
  for (const octet of vue) texte += String.fromCharCode(octet);
  return btoa(texte).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const depuisBase64Url = (texte: string): Uint8Array => {
  const normal = texte.replaceAll("-", "+").replaceAll("_", "/");
  const brut = atob(normal.padEnd(Math.ceil(normal.length / 4) * 4, "="));
  return Uint8Array.from(brut, (caractere) => caractere.charCodeAt(0));
};

// Le type de la clé est laissé à l'inférence : le nommer obligerait chaque paquet qui importe
// ce module à déclarer les types du navigateur, et le Worker n'en a pas besoin pour le reste.
const cleDeSignature = (secret: string) =>
  crypto.subtle.importKey("raw", encodeur.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

/** Le corps signé, sous une forme stable : deux laissez-passer identiques se signent pareil.
 *
 *  L'ordre des champs est écrit à la main plutôt que laissé à `JSON.stringify` d'un objet : un
 *  champ ajouté un jour au milieu changerait toutes les signatures, et la panne serait
 *  incompréhensible. */
const corps = (laissez: Laissez): string =>
  JSON.stringify([laissez.bibliotheque, laissez.cle, laissez.jusqua]);

/** Signe un laissez-passer. */
export async function signer(secret: string, laissez: Laissez): Promise<string> {
  const charge = enBase64Url(encodeur.encode(corps(laissez)));
  const signature = await crypto.subtle.sign("HMAC", await cleDeSignature(secret), encodeur.encode(charge));
  return `${charge}.${enBase64Url(signature)}`;
}

/** Vérifie un laissez-passer, et dit pourquoi il refuse.
 *
 *  La comparaison des signatures passe par `crypto.subtle.verify`, qui ne laisse pas le temps de
 *  réponse dire où elles diffèrent. L'ordre compte : on vérifie la signature **avant** de lire ce
 *  qu'elle couvre, sinon on lirait des données que personne n'a signées. */
export async function verifier(secret: string, jeton: string, maintenant: number): Promise<Verdict> {
  const point = jeton.lastIndexOf(".");
  if (point <= 0) return { ouvert: false, raison: "Laissez-passer mal formé" };

  const charge = jeton.slice(0, point);
  let signature: Uint8Array;
  try {
    signature = depuisBase64Url(jeton.slice(point + 1));
  } catch {
    return { ouvert: false, raison: "Signature illisible" };
  }

  const juste = await crypto.subtle.verify(
    "HMAC",
    await cleDeSignature(secret),
    signature as unknown as ArrayBuffer,
    encodeur.encode(charge),
  );
  if (!juste) return { ouvert: false, raison: "Signature refusée" };

  let lu: unknown;
  try {
    lu = JSON.parse(new TextDecoder().decode(depuisBase64Url(charge)));
  } catch {
    return { ouvert: false, raison: "Laissez-passer illisible" };
  }
  if (!Array.isArray(lu) || lu.length !== 3) return { ouvert: false, raison: "Laissez-passer illisible" };

  const [bibliotheque, cle, jusqua] = lu as [unknown, unknown, unknown];
  if (typeof bibliotheque !== "string" || typeof cle !== "string" || typeof jusqua !== "number")
    return { ouvert: false, raison: "Laissez-passer illisible" };

  if (jusqua <= maintenant) return { ouvert: false, raison: "Laissez-passer périmé" };

  // La ceinture et la bretelle : même signée, une clé qui n'appartient pas à la bibliothèque
  // annoncée ne s'ouvre pas. Une signature atteste qu'on a écrit le laissez-passer, pas qu'on
  // avait raison de l'écrire.
  if (!appartientA(cle, bibliotheque)) return { ouvert: false, raison: "Le fichier n'appartient pas à cette bibliothèque" };

  return { ouvert: true, laissez: { bibliotheque, cle, jusqua } };
}

/** Combien de temps un laissez-passer vaut, par défaut : trois minutes.
 *
 *  Assez pour qu'un navigateur suive une redirection et charge une page ; trop court pour qu'une
 *  adresse recopiée dans un message serve encore demain. */
export const DUREE_PAR_DEFAUT = 180;
