/** La cérémonie, côté navigateur (SEC-02, étape 4 d'E5).
 *
 *  C'est la moitié qui manquait. Sept étapes ont bâti le côté service — défis, enrôlement,
 *  entrée, session, droits, routes — et chacune se concluait « éprouvé, vert ». Personne n'avait
 *  demandé **qui appellerait**. La mesure du 18 octobre l'avait fait dans un banc, avec un
 *  authentificateur virtuel ; un banc n'est pas une page.
 *
 *  ## Rien ici n'est un secret
 *
 *  La partie privée de la clé ne quitte jamais l'appareil : le navigateur la garde, le capteur la
 *  déverrouille, et ce module n'en voit rien (LIV-04). Il ne manipule aucun jeton non plus — la
 *  session vit dans un témoin `HttpOnly` qu'aucun script ne lit, pas même celui-ci.
 *
 *  ## Les encodages, qui sont le piège de cette moitié
 *
 *  | ce qui part | forme |
 *  |---|---|
 *  | `clePublique` | **base64 ordinaire** — le contrat l'exige, pas la variante pour adresses |
 *  | tout le reste | base64url, ce que rend un navigateur sans transformation |
 *
 *  Et le défi : le service le donne en base64url, `create()` et `get()` veulent des octets, et le
 *  navigateur réécrit ensuite ces octets en base64url dans les données du client. La boucle ne se
 *  referme que si l'on décode puis laisse faire — c'est ce que la cérémonie mesurée a montré.
 *
 *  ## Ce qui sort d'ici
 *
 *  Un verdict, jamais une exception. Et le **mot du service**, tel quel : à l'entrée il est le
 *  même pour tous les refus, à l'enrôlement il porte son motif — dont le `getPublicKey()` nul que
 *  la mesure n'a pas pu trancher sur Safari. Ce module ne réécrit ni l'un ni l'autre. */

export type Verdict = { readonly fait: true } | { readonly fait: false; readonly mot: string };

/** Ce dont la cérémonie a besoin du monde extérieur. Remplaçable, pour que les épreuves tournent
 *  sans authentificateur et sans réseau. */
export type Dehors = {
  readonly appeler?: typeof fetch | undefined;
  /** `undefined` **explicitement** permis : c'est ainsi qu'une épreuve dit « cet appareil n'a pas
   *  d'authentificateur », sans dépendre de ce que jsdom définit ou non. */
  readonly credentials?: CredentialsContainer | undefined;
};

const enBase64 = (tampon: ArrayBuffer): string => {
  let texte = "";
  for (const octet of new Uint8Array(tampon)) texte += String.fromCharCode(octet);
  return btoa(texte);
};

const enBase64Url = (tampon: ArrayBuffer): string =>
  enBase64(tampon).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

const depuisBase64Url = (texte: string): Uint8Array<ArrayBuffer> => {
  const normal = texte.replaceAll("-", "+").replaceAll("_", "/");
  const brut = atob(normal.padEnd(Math.ceil(normal.length / 4) * 4, "="));
  return Uint8Array.from(brut, (caractere) => caractere.charCodeAt(0));
};

/** Le mot que le service a rendu, ou un mot de repli quand il n'en donne pas.
 *
 *  Jamais de phrase inventée à partir d'un code : le service choisit ce qu'il dit, et c'est la
 *  seule façon de garder indiscernables les refus qui doivent l'être. */
const motDe = async (reponse: Response, repli: string): Promise<string> => {
  try {
    const corps: unknown = await reponse.json();
    if (corps !== null && typeof corps === "object") {
      const { erreur } = corps as Record<string, unknown>;
      if (typeof erreur === "string" && erreur.length > 0) return erreur;
    }
  } catch {
    // Un corps illisible n'est pas une information : on garde le repli.
  }
  return repli;
};

const SANS_APPAREIL = "Cet appareil ne sait pas mener la cérémonie.";

type Appel = (chemin: string, corps?: unknown) => Promise<Response>;

const appelsVers = (appeler: typeof fetch): Appel => async (chemin, corps) =>
  appeler(chemin, {
    method: "POST",
    credentials: "include",
    ...(corps === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(corps) }),
  });

/** Entrer avec une clé déjà enrôlée.
 *
 *  Le service rend **le même mot** pour tous ses refus — signature fausse, clé inconnue, clé
 *  révoquée, défi périmé. On l'affiche tel quel : apprendre lequel des quatre s'est produit,
 *  c'est apprendre où chercher. */
export async function entrer({ appeler = fetch, credentials = globalThis.navigator?.credentials }: Dehors = {}): Promise<Verdict> {
  if (credentials === undefined) return { fait: false, mot: SANS_APPAREIL };
  const appel = appelsVers(appeler);

  const demande = await appel("/entree/defi", {});
  if (!demande.ok) return { fait: false, mot: await motDe(demande, "Entrée refusée.") };
  const { defi, domaine } = (await demande.json()) as { defi: string; domaine: string };

  let obtenu: Credential | null;
  try {
    obtenu = await credentials.get({
      publicKey: {
        challenge: depuisBase64Url(defi),
        rpId: domaine,
        userVerification: "required",
        timeout: 60_000,
      },
    });
  } catch {
    // Une cérémonie abandonnée — doigt retiré, fenêtre fermée, délai dépassé — n'est pas un
    // refus du service : on le dit autrement, sans rien inventer sur la cause.
    return { fait: false, mot: "Cérémonie interrompue." };
  }
  if (obtenu === null) return { fait: false, mot: "Cérémonie interrompue." };

  const preuve = obtenu as PublicKeyCredential;
  const reponse = preuve.response as AuthenticatorAssertionResponse;
  const entree = await appel("/entree", {
    identifiant: enBase64Url(preuve.rawId),
    donneesAuthentificateur: enBase64Url(reponse.authenticatorData),
    donneesClient: enBase64Url(reponse.clientDataJSON),
    signature: enBase64Url(reponse.signature),
  });
  return entree.ok ? { fait: true } : { fait: false, mot: await motDe(entree, "Entrée refusée.") };
}

/** La création d'une clé, commune à l'enrôlement ordinaire et à l'amorçage.
 *
 *  **`getPublicKey()` peut rendre `null`**, et c'est le cas que la mesure du 18 octobre n'a pas
 *  pu trancher : la méthode existe sur le Safari livré, nul ne sait encore si elle rend une clé.
 *  On envoie alors `null` au service — explicitement, et non en omettant le champ — pour qu'il
 *  refuse en le nommant. Un champ absent se confondrait avec un bogue de cette page. */
async function creerUneCle(
  credentials: CredentialsContainer,
  defi: string,
  domaine: string,
  personne: { readonly id: string; readonly nom: string },
  appareil: string,
): Promise<{ readonly corps: Record<string, unknown> } | { readonly mot: string }> {
  let cree: Credential | null;
  try {
    cree = await credentials.create({
      publicKey: {
        challenge: depuisBase64Url(defi),
        rp: { name: "Liénothèque", id: domaine },
        // **L'identité de la personne, et stable.** Elle était tirée du défi, donc différente à
        // chaque tentative : l'appareil ajoutait une clé au lieu de remplacer la précédente, et
        // une tentative ratée laissait une clé orpheline que le registre ne connaissait pas.
        // Mesuré en production le 19 octobre, deux clés pour une seule enregistrée.
        //
        // Même domaine et même « user.id » : l'appareil **remplace**. C'est le mécanisme de
        // WebAuthn, et c'est lui qui rend l'orpheline impossible.
        //
        // Le nom qui paraît dans la feuille est celui de la **personne** — l'appareil, lui, est
        // nommé dans notre propre champ. J'avais mis l'un à la place de l'autre.
        user: {
          id: new TextEncoder().encode(personne.id),
          name: personne.nom,
          displayName: personne.nom,
        },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "required",
        },
        attestation: "none",
        timeout: 60_000,
      },
    });
  } catch {
    return { mot: "Cérémonie interrompue." };
  }
  if (cree === null) return { mot: "Cérémonie interrompue." };

  const preuve = cree as PublicKeyCredential;
  const reponse = preuve.response as AuthenticatorAttestationResponse;
  const clePublique = reponse.getPublicKey?.() ?? null;

  return {
    corps: {
      identifiant: enBase64Url(preuve.rawId),
      // Base64 **ordinaire** : c'est ce que le contrat de la clé publique exige.
      clePublique: clePublique === null ? null : enBase64(clePublique),
      algorithme: reponse.getPublicKeyAlgorithm?.() ?? null,
      donneesClient: enBase64Url(reponse.clientDataJSON),
      appareil,
    },
  };
}

/** Enrôler cet appareil pour la personne de la session.
 *
 *  Le service **dit pourquoi** il refuse, à la différence de l'entrée : l'appelant est une
 *  personne identifiée qui a le droit d'enrôler, et qui doit apprendre que son navigateur n'a pas
 *  rendu de clé plutôt que de réessayer sans fin. */
export async function enrolerCetAppareil(
  nom: string,
  { appeler = fetch, credentials = globalThis.navigator?.credentials }: Dehors = {},
): Promise<Verdict> {
  if (credentials === undefined) return { fait: false, mot: SANS_APPAREIL };
  const appel = appelsVers(appeler);

  const demande = await appel("/enrolement/defi", {});
  if (!demande.ok) return { fait: false, mot: await motDe(demande, "Accès refusé.") };
  const lu = (await demande.json()) as { defi: string; domaine: string; personneId: string; personne: string };

  const faite = await creerUneCle(credentials, lu.defi, lu.domaine, { id: lu.personneId, nom: lu.personne }, nom);
  if ("mot" in faite) return { fait: false, mot: faite.mot };

  const enrole = await appel("/enrolement", faite.corps);
  return enrole.ok ? { fait: true } : { fait: false, mot: await motDe(enrole, "Accès refusé.") };
}

/** Amorcer le premier accès, sur une invitation.
 *
 *  Le défi vient de l'adresse et non du service : émettre une invitation demande le jeton, que
 *  cette page n'a pas le droit de porter. Le jeton invite, l'invitation entre.
 *
 *  Le domaine vient de l'origine de la page, qui est celle du service — c'est le Worker qui sert
 *  les deux. On ne le demande donc à personne. */
export async function amorcer(
  appareil: string,
  invitation: string,
  { appeler = fetch, credentials = globalThis.navigator?.credentials }: Dehors = {},
): Promise<Verdict> {
  if (credentials === undefined) return { fait: false, mot: SANS_APPAREIL };
  if (invitation.length === 0) return { fait: false, mot: "Aucune invitation dans cette adresse." };

  // L'invitation porte les trois choses d'un seul tenant : le défi, et **qui** est invité. Un
  // seul jeton opaque plutôt que trois valeurs éparses — c'est ce qu'elle est, une chose qu'on
  // remet, et cela évite une adresse dont on pourrait changer une partie sans voir l'autre.
  //
  // Ce que la page en tire sert à nommer la personne auprès de l'appareil, pas à l'autoriser :
  // c'est le défi, et lui seul, que le service vérifie.
  let dedans: { defi: string; personneId: string; personne: string };
  try {
    const texte = new TextDecoder().decode(depuisBase64Url(invitation));
    dedans = JSON.parse(texte) as typeof dedans;
    if (typeof dedans.defi !== "string" || typeof dedans.personneId !== "string")
      return { fait: false, mot: "Cette invitation est illisible." };
  } catch {
    return { fait: false, mot: "Cette invitation est illisible." };
  }

  const domaine = globalThis.location?.hostname ?? "";
  const faite = await creerUneCle(
    credentials,
    dedans.defi,
    domaine,
    { id: dedans.personneId, nom: dedans.personne },
    appareil,
  );
  if ("mot" in faite) return { fait: false, mot: faite.mot };

  const amorce = await appelsVers(appeler)("/amorce", faite.corps);
  return amorce.ok ? { fait: true } : { fait: false, mot: await motDe(amorce, "Amorçage refusé.") };
}

/** Fermer sa session. Le service rend le même mot avec ou sans témoin : se déconnecter ne doit
 *  pas apprendre si l'on était connecté. */
export async function sortir({ appeler = fetch }: Dehors = {}): Promise<Verdict> {
  try {
    await appeler("/session", { method: "DELETE", credentials: "include" });
    return { fait: true };
  } catch {
    return { fait: false, mot: "Le service n'a pas répondu." };
  }
}
