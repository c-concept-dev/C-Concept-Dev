/** Vérifier une signature d'entrée (SEC-02).
 *
 *  Le navigateur signe un défi avec la clé privée que l'appareil garde ; on vérifie avec la clé
 *  publique enrôlée. **Aucune attestation, aucun CBOR** : une vérification de signature, et le
 *  compteur anti-rejeu — c'est la voie C, mesurée le 18 octobre.
 *
 *  ## Deux choses que la mesure a imposées
 *
 *  **La longueur d'une signature varie.** Elle arrive en ASN.1 DER, que `crypto.subtle.verify`
 *  n'accepte pas : il veut r‖s brut, soixante-quatre octets. Et la même cérémonie rend 70, 71 ou
 *  72 octets de DER selon les valeurs tirées, parce que la longueur d'un entier dépend de son
 *  premier bit. Une découpe à offsets fixes marcherait environ une fois sur quatre et **se
 *  tairait** le reste du temps : `verify` rend faux, il ne lève rien. On lit donc les longueurs
 *  annoncées, jamais des positions supposées.
 *
 *  **Une signature refusée n'est pas une signature illisible.** La première est une tentative
 *  qui a échoué ; la seconde est un défaut — de ce code, d'un appareil, ou d'une sonde qui
 *  cherche une faille. Les confondre dans un booléen muet, c'est faire passer un bogue pour un
 *  mot de passe erroné, et chercher pendant des jours. D'où trois issues, et **aucune fonction
 *  de ce module ne rend un booléen**.
 *
 *  Ce qui sort vers le demandeur, en revanche, ne distingue rien : le même mot pour les trois.
 *  Apprendre qu'une signature est « illisible » plutôt que « refusée », c'est apprendre qu'on a
 *  trouvé un défaut. Le journal sait ; la réponse non. */

/** La lecture d'une signature DER : les octets bruts, ou la raison de ne pas avoir pu. */
export type LectureDer =
  | { readonly lu: true; readonly brut: Uint8Array<ArrayBuffer> }
  | { readonly lu: false; readonly raison: string };

/** Taille d'un entier de la courbe P-256, en octets. */
const TAILLE = 32;

/** Lit un entier DER à la position donnée et le recale sur trente-deux octets.
 *
 *  Volontairement strict. Un lecteur indulgent — qui accepterait un zéro superflu, un entier
 *  négatif lu comme positif, ou des octets en trop à la fin — laisserait **deux écritures
 *  différentes valoir la même signature**. Ce qui ne se conforme pas est refusé en le disant,
 *  plutôt qu'accepté au mieux. */
function lireEntier(der: Uint8Array<ArrayBuffer>, depart: number): { fin: number; valeur: Uint8Array<ArrayBuffer> } | { raison: string } {
  if (depart + 2 > der.length) return { raison: "entier DER attendu, et la place manque" };
  if (der[depart] !== 0x02) return { raison: "entier DER attendu" };

  const taille = der[depart + 1]!;
  if (taille === 0) return { raison: "entier DER vide" };
  if (taille > TAILLE + 1) return { raison: `entier DER trop grand pour la courbe : ${taille} octets` };

  const debut = depart + 2;
  const fin = debut + taille;
  if (fin > der.length) return { raison: "longueur annoncée au-delà des octets reçus" };

  const corps = der.slice(debut, fin);
  // Un seul zéro de tête est permis, et seulement s'il porte le signe du nombre suivant.
  if (corps[0] === 0x00) {
    if (corps.length === 1) return { raison: "entier DER nul là où un nombre est attendu" };
    if ((corps[1]! & 0x80) === 0) return { raison: "zéro de tête superflu : écriture DER non canonique" };
  } else if ((corps[0]! & 0x80) !== 0) {
    return { raison: "entier DER négatif : écriture non canonique" };
  }

  const sansSigne = corps[0] === 0x00 ? corps.slice(1) : corps;
  if (sansSigne.length > TAILLE) return { raison: `entier DER trop grand pour la courbe : ${sansSigne.length} octets` };

  const valeur = new Uint8Array(TAILLE);
  valeur.set(sansSigne, TAILLE - sansSigne.length);
  return { fin, valeur };
}

/** Une signature ASN.1 DER, telle qu'un authentificateur la rend, en r‖s brut.
 *
 *  Ne lève jamais : un défaut de format est une **réponse**, pas une exception, pour que l'appelant
 *  soit obligé de le distinguer d'un refus. */
export function lireSignatureDer(der: Uint8Array<ArrayBuffer>): LectureDer {
  if (der.length < 2 || der[0] !== 0x30) return { lu: false, raison: "séquence DER attendue" };

  // La longueur de la séquence : forme courte, ou forme longue sur un ou deux octets. Au-delà,
  // ce n'est pas une signature de cette courbe.
  let corpsDebut = 2;
  let annoncee = der[1]!;
  if ((annoncee & 0x80) !== 0) {
    const octets = annoncee & 0x7f;
    if (octets === 0 || octets > 2) return { lu: false, raison: "longueur DER indéfinie ou démesurée" };
    if (2 + octets > der.length) return { lu: false, raison: "longueur annoncée au-delà des octets reçus" };
    annoncee = 0;
    for (let i = 0; i < octets; i += 1) annoncee = (annoncee << 8) | der[2 + i]!;
    corpsDebut = 2 + octets;
  }

  // La longueur doit tomber juste. Des octets en trop à la fin seraient une seconde écriture de
  // la même signature ; en manquer, une signature tronquée qu'on prendrait pour fausse.
  if (corpsDebut + annoncee !== der.length)
    return {
      lu: false,
      raison: `longueur annoncée (${annoncee}) et octets reçus (${der.length - corpsDebut}) ne correspondent pas`,
    };

  const r = lireEntier(der, corpsDebut);
  if ("raison" in r) return { lu: false, raison: r.raison };
  const s = lireEntier(der, r.fin);
  if ("raison" in s) return { lu: false, raison: s.raison };
  if (s.fin !== der.length) return { lu: false, raison: "octets en trop après la signature" };

  const brut = new Uint8Array(TAILLE * 2);
  brut.set(r.valeur, 0);
  brut.set(s.valeur, TAILLE);
  return { lu: true, brut };
}

/** Le message que l'authentificateur a signé, tel que la norme le définit : ses propres données,
 *  puis le condensat des données du client.
 *
 *  Le condensat, et non les données elles-mêmes : c'est ce qui lie la signature au défi, à
 *  l'origine et au type de la cérémonie sans les signer directement. */
export async function messageSigne(
  donneesAuthentificateur: Uint8Array<ArrayBuffer>,
  donneesClient: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const condensat = new Uint8Array(await crypto.subtle.digest("SHA-256", donneesClient));
  const message = new Uint8Array(donneesAuthentificateur.length + condensat.length);
  message.set(donneesAuthentificateur, 0);
  message.set(condensat, donneesAuthentificateur.length);
  return message;
}

/** Les trois issues d'une vérification. Jamais un booléen : voir l'en-tête du module. */
export type Issue =
  | { readonly issue: "valide" }
  | { readonly issue: "refusee" }
  | { readonly issue: "illisible"; readonly raison: string };

/** Vérifie une signature d'entrée avec la clé publique enrôlée.
 *
 *  `refusee` veut dire : tout était lisible, et la signature ne correspond pas. C'est le seul
 *  cas qui ressemble à une tentative manquée. Les autres sont des défauts, et le journal doit
 *  pouvoir les nommer. */
export async function verifierUneSignature(
  clePubliqueSpki: Uint8Array<ArrayBuffer>,
  signatureDer: Uint8Array<ArrayBuffer>,
  message: Uint8Array<ArrayBuffer>,
): Promise<Issue> {
  const importee = await importerLaCle(clePubliqueSpki);
  if (!importee.ok) return { issue: "illisible", raison: importee.raison };
  const cle = importee.cle;

  const lu = lireSignatureDer(signatureDer);
  if (!lu.lu) return { issue: "illisible", raison: lu.raison };

  try {
    const bonne = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      cle,
      lu.brut,
      message,
    );
    return bonne ? { issue: "valide" } : { issue: "refusee" };
  } catch (souci) {
    // `verify` ne lève pas pour une signature fausse : s'il lève, quelque chose d'autre cloche.
    return { issue: "illisible", raison: `la vérification a échoué : ${messageDe(souci)}` };
  }
}

const messageDe = (souci: unknown): string => (souci instanceof Error ? souci.message : String(souci));

/** Importe la clé publique enrôlée, ou dit pourquoi elle est illisible.
 *
 *  Le type de la clé n'est pas nommé : ce paquet est de la logique pure et n'emporte pas les
 *  types du navigateur. L'inférence suffit, et c'est elle qui l'a rappelé. */
async function importerLaCle(
  spki: Uint8Array<ArrayBuffer>,
): Promise<{ ok: true; cle: Awaited<ReturnType<typeof crypto.subtle.importKey>> } | { ok: false; raison: string }> {
  try {
    const cle = await crypto.subtle.importKey(
      "spki",
      spki,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    return { ok: true, cle };
  } catch (souci) {
    return { ok: false, raison: `clé publique enrôlée illisible : ${messageDe(souci)}` };
  }
}

/** Le seul mot rendu au demandeur, pour les trois issues.
 *
 *  Il ne dit pas si la clé est inconnue, si la signature est fausse ou si elle est mal formée :
 *  qui apprendrait la différence saurait où chercher. C'est la même règle que le refus de la
 *  façade, et c'est le défaut d'ordre corrigé le 10 octobre. */
export const MOT_DE_REFUS = "Entrée refusée.";

/** Ce que le journal retient d'une issue — et qui ne sort jamais vers le demandeur.
 *
 *  La raison technique est gardée telle quelle : c'est elle qui fait la différence entre une
 *  heure et trois jours le jour où une entrée cesse de marcher. */
export function pourLeJournal(issue: Issue): string {
  if (issue.issue === "valide") return "signature valide";
  if (issue.issue === "refusee") return "signature refusée : bien formée, mais ne correspond pas";
  return `signature illisible — ${issue.raison}`;
}
