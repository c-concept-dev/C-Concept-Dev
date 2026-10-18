// Étape 4.1 — la voie C se mesure, elle ne se suppose pas.
//
// La question : le navigateur rend-il la clé publique **déjà en SPKI**, de sorte que le Worker
// n'ait rien à analyser de ce que l'authentificateur a emballé ? Et la signature qu'il rend
// ensuite se vérifie-t-elle avec cette clé par le seul WebCrypto, sans CBOR, sans COSE, sans
// dépendance ?
//
// Ce qui est mesuré ici est une cérémonie **réelle** : un authentificateur virtuel du protocole
// CTAP2 répond à navigator.credentials.create(), puis à .get(). Rien n'est simulé côté page.
//
// La page est servie à l'origine « localhost » par interception, sans ouvrir de port : WebAuthn
// exige un contexte sûr, et localhost en est un.
//
// Lancement — voir bancs/README.md. Ce banc **ne tourne pas sous le bac à sable** : tout
// navigateur a besoin des services Mach que celui-ci refuse.

import { createRequire } from "node:module";

const exiger = createRequire(import.meta.url);
const { chromium, webkit, firefox } = exiger(
  exiger.resolve("@playwright/test", {
    paths: [new URL("../../app/", import.meta.url).pathname],
  }),
);

const PAGE = `<!doctype html><meta charset="utf-8"><title>Mesure</title><body>prête</body>`;
const ORIGINE = "http://localhost:8787/mesure";
const DOMAINE = "localhost";

/** Ce que la page exécute : la cérémonie entière, et ce qu'elle en rapporte. */
const CEREMONIE = async (domaine) => {
  const resultat = { api: {}, enrolement: null, authentification: null, erreur: null };

  // 1. L'API existe-t-elle, et sous quelle forme ?
  const laReponse = typeof AuthenticatorAttestationResponse !== "undefined";
  resultat.api = {
    credentials: typeof navigator.credentials?.create === "function",
    attestationResponse: laReponse,
    getPublicKey: laReponse && typeof AuthenticatorAttestationResponse.prototype.getPublicKey === "function",
    getPublicKeyAlgorithm:
      laReponse && typeof AuthenticatorAttestationResponse.prototype.getPublicKeyAlgorithm === "function",
    getAuthenticatorData:
      laReponse && typeof AuthenticatorAttestationResponse.prototype.getAuthenticatorData === "function",
    plateformeDisponible:
      typeof PublicKeyCredential !== "undefined" &&
      typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function"
        ? await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => "erreur")
        : "absente",
  };

  const en64 = (tampon) => btoa(String.fromCharCode(...new Uint8Array(tampon)));

  try {
    // 2. L'enrôlement. Attestation « none » : on ne demande aucune attestation, et c'est tout
    //    l'objet de la voie C.
    const cree = await navigator.credentials.create({
      publicKey: {
        challenge: new Uint8Array(32).fill(7),
        rp: { name: "Mesure", id: domaine },
        user: { id: new Uint8Array([1, 2, 3, 4]), name: "essai", displayName: "Essai" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "required",
        },
        attestation: "none",
        timeout: 20000,
      },
    });

    const clePublique = cree.response.getPublicKey?.();
    resultat.enrolement = {
      identifiant: en64(cree.rawId),
      clePubliqueNulle: clePublique === null || clePublique === undefined,
      clePublique: clePublique ? en64(clePublique) : null,
      longueurClePublique: clePublique ? clePublique.byteLength : 0,
      algorithme: cree.response.getPublicKeyAlgorithm?.() ?? "absent",
      // La taille de l'objet d'attestation dit ce qu'on aurait eu à analyser soi-même.
      tailleAttestation: cree.response.attestationObject.byteLength,
    };

    // 3. L'authentification. C'est elle qui tourne à chaque entrée, et c'est elle qui compte.
    const defiEntree = new Uint8Array(32).fill(9);
    const obtenu = await navigator.credentials.get({
      publicKey: {
        challenge: defiEntree,
        rpId: domaine,
        allowCredentials: [{ type: "public-key", id: cree.rawId }],
        userVerification: "required",
        timeout: 20000,
      },
    });

    resultat.authentification = {
      donneesAuthentificateur: en64(obtenu.response.authenticatorData),
      donneesClient: en64(obtenu.response.clientDataJSON),
      signature: en64(obtenu.response.signature),
      defiAttendu: en64(defiEntree),
    };
  } catch (e) {
    resultat.erreur = `${e.name} : ${e.message}`;
  }

  return resultat;
};

/** Mène la cérémonie dans un navigateur, avec son authentificateur virtuel s'il en a un. */
async function mesurer(nom, lanceur, virtuel) {
  const navigateur = await lanceur.launch();
  const contexte = await navigateur.newContext();
  const page = await contexte.newPage();
  await page.route("**/*", (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: PAGE }),
  );

  if (virtuel) {
    const cdp = await contexte.newCDPSession(page);
    await cdp.send("WebAuthn.enable", { enableUI: false });
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
  }

  await page.goto(ORIGINE);
  const resultat = await page.evaluate(CEREMONIE, DOMAINE);
  resultat.navigateur = `${nom} ${navigateur.version()}`;
  resultat.authentificateurVirtuel = virtuel;
  await navigateur.close();
  return resultat;
}

const b64 = (tampon) => Buffer.from(tampon).toString("base64");
const dub64 = (texte) => new Uint8Array(Buffer.from(texte, "base64"));

/** La signature de WebAuthn est en ASN.1 DER ; WebCrypto veut r‖s brut. Voilà le passage.
 *
 *  C'est l'écart que cette mesure a trouvé, et la seule chose que la voie C demande d'écrire. */
function derVersBrut(der) {
  if (der[0] !== 0x30) throw new Error("ce n'est pas une séquence DER");
  let i = 2;
  if (der[1] & 0x80) i += der[1] & 0x7f; // longueur écrite sur plusieurs octets
  const lire = () => {
    if (der[i] !== 0x02) throw new Error("entier DER attendu");
    const taille = der[i + 1];
    const debut = i + 2;
    i = debut + taille;
    let valeur = der.slice(debut, i);
    while (valeur.length > 32 && valeur[0] === 0x00) valeur = valeur.slice(1); // bourre de signe
    const trenteDeux = new Uint8Array(32);
    trenteDeux.set(valeur, 32 - valeur.length);
    return trenteDeux;
  };
  const r = lire();
  const s = lire();
  const brut = new Uint8Array(64);
  brut.set(r, 0);
  brut.set(s, 32);
  return brut;
}

/** Côté serveur : importer la clé telle que rendue, vérifier la signature telle que rendue.
 *
 *  Ce pied-ci se fait dans Node. Il ne suffit pas : Node et workerd n'ont pas la même mise en
 *  œuvre de WebCrypto, et c'est workerd qui portera le code. Voir bancs/workerd/. */
async function verifier(mesure) {
  if (mesure.enrolement === null || mesure.authentification === null) return { impossible: true };

  const rapport = {};
  let cle = null;
  try {
    cle = await crypto.subtle.importKey(
      "spki",
      dub64(mesure.enrolement.clePublique),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    rapport.importSpki = "réussi";
  } catch (e) {
    rapport.importSpki = `échoué : ${e.message}`;
    return rapport;
  }

  // Le message signé, tel que la norme le définit : les données de l'authentificateur, puis le
  // condensat des données du client.
  const donneesAuth = dub64(mesure.authentification.donneesAuthentificateur);
  const donneesClient = dub64(mesure.authentification.donneesClient);
  const condensat = new Uint8Array(await crypto.subtle.digest("SHA-256", donneesClient));
  const signe = new Uint8Array(donneesAuth.length + 32);
  signe.set(donneesAuth, 0);
  signe.set(condensat, donneesAuth.length);

  const signature = dub64(mesure.authentification.signature);
  const algo = { name: "ECDSA", hash: "SHA-256" };

  // La signature telle quelle — en DER — passe-t-elle ? C'est le point à mesurer.
  rapport.verifieTelleQuelle = await crypto.subtle.verify(algo, cle, signature, signe);
  try {
    rapport.verifieApresConversion = await crypto.subtle.verify(algo, cle, derVersBrut(signature), signe);
  } catch (e) {
    rapport.verifieApresConversion = `échoué : ${e.message}`;
  }

  // Une signature falsifiée doit être refusée — sans quoi la vérification ne prouve rien.
  const altere = new Uint8Array(signe);
  altere[0] ^= 0xff;
  rapport.refuseUnMessageAltere = !(await crypto.subtle.verify(algo, cle, derVersBrut(signature), altere));

  // Le défi rendu est-il bien celui qu'on a envoyé, et l'origine la bonne ?
  const client = JSON.parse(Buffer.from(donneesClient).toString("utf8"));
  const defi = Buffer.from(client.challenge.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  rapport.defiRendu = b64(defi) === mesure.authentification.defiAttendu;
  rapport.origine = client.origin;
  rapport.type = client.type;
  rapport.formatSignature = signature[0] === 0x30 ? "ASN.1 DER" : "brut r‖s";
  rapport.longueurSignature = signature.length;

  // Le compteur anti-rejeu et les drapeaux, lus à la main dans les trente-sept premiers octets.
  const vue = new DataView(donneesAuth.buffer, donneesAuth.byteOffset);
  rapport.drapeaux = donneesAuth[32].toString(2).padStart(8, "0");
  rapport.utilisateurVerifie = (donneesAuth[32] & 0x04) !== 0;
  rapport.compteur = vue.getUint32(33);

  return rapport;
}

const cibles = [
  ["Chromium", chromium, true],
  ["WebKit", webkit, false],
  ["Firefox", firefox, false],
];

const tout = [];
for (const [nom, lanceur, virtuel] of cibles) {
  try {
    const mesure = await mesurer(nom, lanceur, virtuel);
    mesure.serveur = await verifier(mesure);
    tout.push(mesure);
    console.error(`— ${mesure.navigateur} mesuré`);
  } catch (e) {
    tout.push({ navigateur: nom, echecDuBanc: `${e.name} : ${e.message}`.split("\n")[0] });
    console.error(`— ${nom} : le banc a échoué — ${e.message.split("\n")[0]}`);
  }
}

console.log(JSON.stringify(tout, null, 2));
