/** Ce qu'on vérifie d'une cérémonie, avant toute base de données (SEC-02).
 *
 *  Tout est pur ici : des octets entrent, un verdict sort. Rien ne lève, rien ne rend un
 *  booléen seul — les refus sont **nommés**, parce que « ça n'a pas marché » ne se répare pas.
 *
 *  ## Le cas qui commande cette étape
 *
 *  `getPublicKey()` rend `null` quand le navigateur ne reconnaît pas l'algorithme de la clé. La
 *  mesure du 18 octobre a montré que la méthode **existe** sur le Safari livré — pas qu'elle
 *  rend une clé, ce qui demanderait un doigt sur le capteur. Le risque est faible : −7 est
 *  l'algorithme le plus répandu qui soit. Mais s'il se produit, l'enrôlement doit échouer **en
 *  le disant**, et jamais se rabattre en silence sur l'objet d'attestation — ce serait ramener
 *  le CBOR par la petite porte, un jour où personne ne regarde.
 *
 *  Et une clé **nulle** n'est pas une clé **illisible** : la première est une réponse du
 *  navigateur, la seconde un défaut. Les deux refusent, et le journal doit pouvoir les séparer. */

/** L'algorithme qu'on demande à la création, et le seul qu'on accepte : ECDSA avec SHA-256.
 *
 *  Un seul, à dessein. Accepter plusieurs algorithmes multiplie les chemins de vérification, et
 *  c'est dans le chemin qu'on ne regarde jamais qu'une erreur s'installe. */
export const ALGORITHME_ATTENDU = -7;

/** Un défi neuf : trente-deux octets de hasard, en base64url.
 *
 *  Pas un identifiant lisible, pas un compteur, pas une date : rien qui se devine ni ne se
 *  rapproche d'un autre. */
export function defiNeuf(): string {
  const octets = crypto.getRandomValues(new Uint8Array(32));
  let texte = "";
  for (const octet of octets) texte += String.fromCharCode(octet);
  return btoa(texte).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** Un verdict nommé : ce qui va, ou ce qui ne va pas et pourquoi. */
export type Examen = { readonly bon: true } | { readonly bon: false; readonly raison: string };

const decoder = (base64url: string): string => {
  const normal = base64url.replaceAll("-", "+").replaceAll("_", "/");
  const brut = atob(normal.padEnd(Math.ceil(normal.length / 4) * 4, "="));
  return new TextDecoder().decode(Uint8Array.from(brut, (caractere) => caractere.charCodeAt(0)));
};

/** Ce que les données du client doivent dire. */
export type Attendu = {
  /** `webauthn.create` pour un enrôlement, `webauthn.get` pour une entrée. */
  readonly type: "webauthn.create" | "webauthn.get";
  readonly defi: string;
  readonly origine: string;
};

/** Les données du client disent ce que le navigateur a fait : quel geste, pour quel défi, depuis
 *  quelle origine. Elles sont signées indirectement — par leur condensat — donc on peut s'y
 *  fier **une fois la signature vérifiée**, et seulement alors.
 *
 *  Les trois comparaisons sont faites séparément pour que le refus dise laquelle a échoué. Une
 *  seule phrase pour les trois obligerait à deviner. */
export function examinerLesDonneesClient(donneesClient: string, attendu: Attendu): Examen {
  let lu: unknown;
  try {
    lu = JSON.parse(decoder(donneesClient));
  } catch {
    return { bon: false, raison: "données du client illisibles" };
  }
  if (lu === null || typeof lu !== "object") return { bon: false, raison: "données du client illisibles" };

  const { type, challenge, origin, crossOrigin } = lu as Record<string, unknown>;
  if (typeof type !== "string") return { bon: false, raison: "données du client sans type" };
  if (typeof challenge !== "string") return { bon: false, raison: "données du client sans défi" };
  if (typeof origin !== "string") return { bon: false, raison: "données du client sans origine" };

  if (type !== attendu.type) return { bon: false, raison: `geste inattendu : ${type} au lieu de ${attendu.type}` };

  // Comparaison exacte, et non par préfixe : un défi suivi de n'importe quoi n'est pas ce défi.
  if (challenge !== attendu.defi) return { bon: false, raison: "le défi rendu n'est pas celui qui a été envoyé" };

  if (origin !== attendu.origine) return { bon: false, raison: `origine refusée : ${origin}` };

  // `crossOrigin` vrai veut dire que la page était dans un cadre tiers. Rien ne justifie de mener
  // une cérémonie depuis un cadre qu'on ne contrôle pas.
  if (crossOrigin === true) return { bon: false, raison: "cérémonie menée depuis un cadre étranger" };

  return { bon: true };
}

/** Ce que la norme impose aux données de l'authentificateur : trente-deux octets d'empreinte du
 *  domaine, un octet de drapeaux, quatre octets de compteur. */
export const TAILLE_DONNEES_AUTH = 37;

/** Les drapeaux qu'on regarde. Les autres existent et ne nous apprennent rien d'utile ici. */
const PRESENCE = 0x01;
const UTILISATEUR_VERIFIE = 0x04;

export type ExamenDesDonneesAuth =
  | { readonly bon: true; readonly compteur: number; readonly utilisateurVerifie: boolean }
  | { readonly bon: false; readonly raison: string };

/** Ce que l'authentificateur dit de lui-même : pour quel domaine, avec quelle attestation de
 *  présence, et à quel rang de son compteur.
 *
 *  **L'empreinte du domaine est la garde contre un site voisin.** L'appareil ne signe que pour le
 *  domaine où la clé a été enrôlée, et il le prouve en incluant son empreinte dans ce qu'il
 *  signe. Une signature prise ailleurs ne vaut donc rien ici — à condition de vérifier, ce que
 *  fait cette fonction.
 *
 *  **La présence doit être attestée.** Sans ce drapeau, personne n'a touché l'appareil, et la
 *  signature pourrait venir d'un logiciel qui garde la clé. La vérification de l'utilisateur —
 *  Touch ID, un code — est exigée par défaut, puisque c'est elle qui fait la différence entre
 *  « cet appareil » et « cette personne ».
 *
 *  Des données **plus longues** sont acceptées : la norme permet des extensions après les
 *  trente-sept octets, et les refuser casserait des appareils corrects. On ne les lit pas. */
export async function examinerLesDonneesAuthentificateur(
  donnees: Uint8Array<ArrayBuffer>,
  attendu: { readonly domaine: string; readonly exigerUtilisateurVerifie?: boolean },
): Promise<ExamenDesDonneesAuth> {
  if (donnees.length < TAILLE_DONNEES_AUTH)
    return {
      bon: false,
      raison: `données de l'authentificateur trop courtes : ${donnees.length} octets au lieu de ${TAILLE_DONNEES_AUTH} au moins`,
    };

  const attendue = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(attendu.domaine)),
  );
  // Comparaison octet par octet, sur toute la longueur : une empreinte à moitié juste est fausse.
  let ecart = 0;
  for (let rang = 0; rang < 32; rang += 1) ecart |= donnees[rang]! ^ attendue[rang]!;
  if (ecart !== 0) return { bon: false, raison: "la signature n'a pas été faite pour ce domaine" };

  const drapeaux = donnees[32]!;
  if ((drapeaux & PRESENCE) === 0) return { bon: false, raison: "présence de l'utilisateur non attestée" };

  const utilisateurVerifie = (drapeaux & UTILISATEUR_VERIFIE) !== 0;
  if (attendu.exigerUtilisateurVerifie !== false && !utilisateurVerifie)
    return { bon: false, raison: "utilisateur non vérifié par l'appareil" };

  const compteur = new DataView(donnees.buffer, donnees.byteOffset).getUint32(33);
  return { bon: true, compteur, utilisateurVerifie };
}

/** Pourquoi une clé publique est refusée. Nommé, parce que ces causes ne se corrigent pas de la
 *  même façon : les deux premières viennent du navigateur, la dernière d'un défaut. */
export type CauseDeRefus = "cle_nulle" | "algorithme_nul" | "algorithme_inattendu" | "cle_illisible";

export type ExamenDeCle =
  | { readonly bon: true; readonly spki: Uint8Array<ArrayBuffer> }
  | { readonly bon: false; readonly cause: CauseDeRefus; readonly raison: string };

/** La clé publique est-elle utilisable, et est-ce bien celle qu'on a demandée ?
 *
 *  L'import est **fait pour de vrai**, et non supposé d'après l'algorithme annoncé : une clé
 *  d'une autre courbe peut annoncer le bon algorithme et ne pas s'importer. Mieux vaut
 *  l'apprendre à l'enrôlement, où l'on peut le dire, qu'à la première entrée, où l'on ne pourra
 *  que refuser. */
export async function examinerUneClePublique(
  clePublique: string | null,
  algorithme: number | null,
): Promise<ExamenDeCle> {
  if (clePublique === null)
    return {
      bon: false,
      cause: "cle_nulle",
      raison: "getPublicKey() n'a pas rendu de clé : ce navigateur ne reconnaît pas l'algorithme",
    };
  if (algorithme === null)
    return {
      bon: false,
      cause: "algorithme_nul",
      raison: "getPublicKeyAlgorithm() n'a rien rendu : la clé ne peut pas être vérifiée plus tard",
    };
  if (algorithme !== ALGORITHME_ATTENDU)
    return {
      bon: false,
      cause: "algorithme_inattendu",
      raison: `algorithme ${algorithme} au lieu de ${ALGORITHME_ATTENDU} : seul celui-là est vérifié`,
    };

  let spki: Uint8Array<ArrayBuffer>;
  try {
    const brut = atob(clePublique);
    spki = Uint8Array.from(brut, (caractere) => caractere.charCodeAt(0));
  } catch {
    return { bon: false, cause: "cle_illisible", raison: "la clé publique n'est pas de la base64" };
  }

  try {
    await crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  } catch (souci) {
    return {
      bon: false,
      cause: "cle_illisible",
      raison: `la clé publique ne s'importe pas : ${souci instanceof Error ? souci.message : String(souci)}`,
    };
  }

  return { bon: true, spki };
}
