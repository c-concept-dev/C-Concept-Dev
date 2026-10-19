import { describe, expect, it, vi } from "vitest";
import { amorcer, enrolerCetAppareil, entrer, sortir } from "../src/ceremonie/navigateur.js";

/** La cérémonie côté navigateur (SEC-02, étape 4 d'E5).
 *
 *  Ce qui est éprouvé ici, avec un authentificateur remplacé — aucun capteur, aucun réseau :
 *
 *  **Les encodages**, qui sont le piège de cette moitié : la clé publique part en base64
 *  ordinaire parce que son contrat l'exige, et tout le reste en base64url. Une erreur là se
 *  traduirait par un refus du service que personne ne saurait expliquer.
 *
 *  **Le défi qui fait l'aller-retour** : le service le donne en base64url, la cérémonie veut des
 *  octets, et le navigateur réécrit ces octets en base64url. La boucle ne se referme que si l'on
 *  décode sans rien ajouter.
 *
 *  **`getPublicKey()` nul**, le cas que la mesure du 18 octobre n'a pas pu trancher sur Safari :
 *  on envoie `null` explicitement, et non un champ absent, pour que le service refuse en le
 *  nommant.
 *
 *  **Le mot du service, tel quel** : à l'entrée il est le même pour tous les refus, à l'enrôlement
 *  il porte son motif. Cette page n'en réécrit aucun. */

const DEFI = "SE6tiuHB8s6QADL_OkXDkVIYHVAhMVtD3OAlcXrFuMg";
const DOMAINE = "essai.invalide";

const octets = (taille: number, valeur = 7): Uint8Array => new Uint8Array(taille).fill(valeur);

/** Un authentificateur remplacé : il note ce qu'on lui demande et rend ce qu'on lui dit. */
const authentificateur = (
  options: { clePubliqueNulle?: boolean; interrompt?: boolean; algorithme?: number | null } = {},
) => {
  const demandes: { geste: "create" | "get"; defi: string; domaine: string | undefined }[] = [];
  const enClair = (tampon: ArrayBuffer): string =>
    Buffer.from(new Uint8Array(tampon)).toString("base64url");

  const credentials = {
    create: async (demande: CredentialCreationOptions) => {
      const pk = demande.publicKey!;
      demandes.push({ geste: "create", defi: enClair(pk.challenge as ArrayBuffer), domaine: pk.rp.id });
      if (options.interrompt === true) return null;
      return {
        rawId: octets(16, 3).buffer,
        response: {
          clientDataJSON: Buffer.from(
            JSON.stringify({ type: "webauthn.create", challenge: enClair(pk.challenge as ArrayBuffer), origin: "x" }),
            "utf8",
          ),
          getPublicKey: () => (options.clePubliqueNulle === true ? null : octets(91, 200).buffer),
          getPublicKeyAlgorithm: () => (options.algorithme === undefined ? -7 : options.algorithme),
        },
      } as unknown as Credential;
    },
    get: async (demande: CredentialRequestOptions) => {
      const pk = demande.publicKey!;
      demandes.push({ geste: "get", defi: enClair(pk.challenge as ArrayBuffer), domaine: pk.rpId });
      if (options.interrompt === true) return null;
      return {
        rawId: octets(16, 3).buffer,
        response: {
          authenticatorData: octets(37, 5).buffer,
          clientDataJSON: Buffer.from(JSON.stringify({ type: "webauthn.get" }), "utf8"),
          signature: octets(70, 9).buffer,
        },
      } as unknown as Credential;
    },
  } as unknown as CredentialsContainer;

  return { demandes, credentials };
};

/** Un service remplacé : il note les appels et rend les statuts qu'on lui dicte. */
const service = (statuts: Record<string, { statut?: number; corps?: unknown }> = {}) => {
  const appels: { chemin: string; methode: string; temoin: boolean; corps: unknown }[] = [];
  const appeler = (async (adresse: string | URL, init: RequestInit = {}) => {
    const chemin = String(adresse);
    appels.push({
      chemin,
      methode: init.method ?? "GET",
      temoin: init.credentials === "include",
      corps: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const prevu = statuts[chemin] ?? {};
    const statut = prevu.statut ?? 200;
    const corps = prevu.corps ?? (chemin.endsWith("/defi") ? { defi: DEFI, domaine: DOMAINE } : { fait: true });
    return new Response(JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { appels, appeler };
};

describe("entrer avec une clé déjà enrôlée", () => {
  it("demande un défi, le fait signer, et présente la preuve", async () => {
    const dehors = service();
    const appareil = authentificateur();
    const verdict = await entrer({ appeler: dehors.appeler, credentials: appareil.credentials });

    expect(verdict.fait, verdict.fait ? "" : verdict.mot).toBe(true);
    expect(dehors.appels.map((un) => un.chemin)).toEqual(["/entree/defi", "/entree"]);
    expect(dehors.appels.every((un) => un.temoin)).toBe(true);
  });

  it("rend le défi tel que le service l'a donné", async () => {
    // Le service le donne en base64url, la cérémonie veut des octets, le navigateur réécrit en
    // base64url. Si l'un des trois ajoute quelque chose, le service ne reconnaît plus son défi.
    const dehors = service();
    const appareil = authentificateur();
    await entrer({ appeler: dehors.appeler, credentials: appareil.credentials });
    expect(appareil.demandes[0]).toEqual({ geste: "get", defi: DEFI, domaine: DOMAINE });
  });

  it("rend le mot du service tel quel, sans l'interpréter", async () => {
    const dehors = service({ "/entree": { statut: 401, corps: { erreur: "Entrée refusée." } } });
    const verdict = await entrer({ appeler: dehors.appeler, credentials: authentificateur().credentials });
    expect(verdict.fait).toBe(false);
    if (!verdict.fait) expect(verdict.mot).toBe("Entrée refusée.");
  });

  it("distingue une cérémonie interrompue d'un refus du service", async () => {
    // Doigt retiré, fenêtre fermée, délai dépassé : ce n'est pas le service qui a dit non, et le
    // dire autrement évite de chercher un refus qui n'existe pas.
    const dehors = service();
    const verdict = await entrer({
      appeler: dehors.appeler,
      credentials: authentificateur({ interrompt: true }).credentials,
    });
    expect(verdict.fait).toBe(false);
    if (!verdict.fait) expect(verdict.mot).toBe("Cérémonie interrompue.");
    // Et rien n'a été présenté au service : on ne lui envoie pas une preuve vide.
    expect(dehors.appels.map((un) => un.chemin)).toEqual(["/entree/defi"]);
  });

  it("refuse sans authentificateur, plutôt que de lever", async () => {
    // « undefined » dit explicitement : cet appareil n'a pas d'authentificateur. Compter sur
    // l'absence du champ ferait dépendre l'épreuve de ce que jsdom définit.
    const verdict = await entrer({ appeler: service().appeler, credentials: undefined });
    expect(verdict.fait).toBe(false);
    if (!verdict.fait) expect(verdict.mot).toContain("ne sait pas mener");
  });
});

describe("enrôler cet appareil", () => {
  it("envoie la clé publique en base64 ordinaire, et le reste en base64url", async () => {
    // Le contrat de la clé publique exige la base64 ordinaire : « [A-Za-z0-9+/]+={0,2} ». Une
    // variante pour adresses serait refusée par le service, sans que la page sache pourquoi.
    const dehors = service();
    const verdict = await enrolerCetAppareil("Portable", {
      appeler: dehors.appeler,
      credentials: authentificateur().credentials,
    });
    expect(verdict.fait, verdict.fait ? "" : verdict.mot).toBe(true);

    const envoye = dehors.appels.find((un) => un.chemin === "/enrolement")!.corps as Record<string, string>;
    expect(envoye["clePublique"]).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(envoye["identifiant"]).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(envoye["donneesClient"]).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(envoye["appareil"]).toBe("Portable");
  });

  it("envoie une clé nulle **explicitement**, et non un champ absent", async () => {
    // Le cas que la mesure du 18 octobre n'a pas pu trancher sur Safari. Un champ absent se
    // confondrait avec un bogue de cette page ; un null nommé laisse le service refuser en le
    // disant.
    const dehors = service();
    await enrolerCetAppareil("Portable", {
      appeler: dehors.appeler,
      credentials: authentificateur({ clePubliqueNulle: true }).credentials,
    });

    const envoye = dehors.appels.find((un) => un.chemin === "/enrolement")!.corps as Record<string, unknown>;
    expect("clePublique" in envoye).toBe(true);
    expect(envoye["clePublique"]).toBeNull();
  });

  it("envoie un algorithme nul de la même façon", async () => {
    const dehors = service();
    await enrolerCetAppareil("Portable", {
      appeler: dehors.appeler,
      credentials: authentificateur({ algorithme: null }).credentials,
    });
    const envoye = dehors.appels.find((un) => un.chemin === "/enrolement")!.corps as Record<string, unknown>;
    expect("algorithme" in envoye).toBe(true);
    expect(envoye["algorithme"]).toBeNull();
  });

  it("montre le motif que le service donne, puisqu'il en donne un", async () => {
    // À la différence de l'entrée : l'appelant est identifié et a le droit de savoir que son
    // navigateur n'a pas rendu de clé.
    const dehors = service({
      "/enrolement": {
        statut: 400,
        corps: { erreur: "Clé refusée : getPublicKey() n'a pas rendu de clé" },
      },
    });
    const verdict = await enrolerCetAppareil("Portable", {
      appeler: dehors.appeler,
      credentials: authentificateur({ clePubliqueNulle: true }).credentials,
    });
    expect(verdict.fait).toBe(false);
    if (!verdict.fait) expect(verdict.mot).toContain("getPublicKey");
  });

  it("s'arrête si le service refuse le défi, sans rien créer", async () => {
    const dehors = service({ "/enrolement/defi": { statut: 401, corps: { erreur: "Accès refusé." } } });
    const appareil = authentificateur();
    const verdict = await enrolerCetAppareil("Portable", {
      appeler: dehors.appeler,
      credentials: appareil.credentials,
    });
    expect(verdict.fait).toBe(false);
    if (!verdict.fait) expect(verdict.mot).toBe("Accès refusé.");
    expect(appareil.demandes).toEqual([]);
  });
});

describe("amorcer sur une invitation", () => {
  it("n'appelle aucun service pour obtenir le défi : il vient de l'adresse", async () => {
    // Le jeton invite, l'invitation entre. Émettre une invitation demande le jeton de service,
    // que cette page n'a pas le droit de porter (règle 6, LIV-04).
    const dehors = service();
    const appareil = authentificateur();
    const verdict = await amorcer("Christophe", DEFI, {
      appeler: dehors.appeler,
      credentials: appareil.credentials,
    });

    expect(verdict.fait, verdict.fait ? "" : verdict.mot).toBe(true);
    expect(dehors.appels.map((un) => un.chemin)).toEqual(["/amorce"]);
    expect(appareil.demandes[0]?.defi).toBe(DEFI);
  });

  it("refuse une adresse sans invitation, sans rien appeler", async () => {
    const dehors = service();
    const verdict = await amorcer("Christophe", "", {
      appeler: dehors.appeler,
      credentials: authentificateur().credentials,
    });
    expect(verdict.fait).toBe(false);
    if (!verdict.fait) expect(verdict.mot).toContain("invitation");
    expect(dehors.appels).toEqual([]);
  });

  it("montre le motif de l'amorçage refusé", async () => {
    const dehors = service({ "/amorce": { statut: 409, corps: { erreur: "L'amorçage est clos." } } });
    const verdict = await amorcer("Christophe", DEFI, {
      appeler: dehors.appeler,
      credentials: authentificateur().credentials,
    });
    expect(verdict.fait).toBe(false);
    if (!verdict.fait) expect(verdict.mot).toBe("L'amorçage est clos.");
  });
});

describe("sortir", () => {
  it("ferme la session et emporte le témoin", async () => {
    const dehors = service();
    const verdict = await sortir({ appeler: dehors.appeler });
    expect(verdict.fait).toBe(true);
    expect(dehors.appels[0]).toMatchObject({ chemin: "/session", methode: "DELETE", temoin: true });
  });

  it("ne lève pas quand le service ne répond pas", async () => {
    const appeler = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const verdict = await sortir({ appeler });
    expect(verdict.fait).toBe(false);
  });
});
