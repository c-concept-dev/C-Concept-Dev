import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALGORITHME_ATTENDU,
  TAILLE_DONNEES_AUTH,
  defiNeuf,
  examinerLesDonneesAuthentificateur,
  examinerLesDonneesClient,
  examinerUneClePublique,
} from "../src/ceremonie.js";

/** Ce qu'on vérifie d'une cérémonie, avant toute base de données (SEC-02).
 *
 *  Tout est pur ici : des octets entrent, un verdict sort. Les refus sont **nommés** un par un,
 *  pour la même raison que dans `signature.ts` — « ça n'a pas marché » ne se répare pas.
 *
 *  Le cas qui commande cette étape : `getPublicKey()` rend `null` quand le navigateur ne
 *  reconnaît pas l'algorithme. La mesure du 18 octobre a montré que la méthode **existe** sur le
 *  Safari livré, pas qu'elle rend une clé. Si elle rend `null` un jour, l'enrôlement doit
 *  échouer **en le disant**, jamais se rabattre en silence sur autre chose. */

const CEREMONIE = JSON.parse(
  readFileSync(new URL("../../../fixtures/ceremonie-webauthn.json", import.meta.url), "utf8"),
) as { spki: string; donneesClient: string; donneesAuthentificateur: string };

/** Le défi et l'origine de la cérémonie mesurée, **lus dans la fixture** et non recopiés.
 *
 *  Ce n'est pas un détail de confort : j'ai d'abord écrit ce défi à la main depuis un journal, en
 *  perdant quatre caractères, et le test a échoué en accusant le code. Une chaîne de quarante-
 *  trois caractères ne se transcrit pas à l'œil. */
const MESURE = JSON.parse(Buffer.from(CEREMONIE.donneesClient, "base64").toString("utf8")) as {
  challenge: string;
  origin: string;
};

const ORIGINE = "https://lienotheque.exemple";
const DEFI = "CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk";

/** Les données du client telles qu'un navigateur les encode : du JSON, en base64url. */
const donneesClient = (dedans: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(dedans), "utf8").toString("base64url");

const CREATION = { type: "webauthn.create", challenge: DEFI, origin: ORIGINE, crossOrigin: false };

describe("un défi neuf ne ressemble à aucun autre", () => {
  it("fait trente-deux octets de hasard, en base64url", () => {
    const un = defiNeuf();
    expect(un).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(un, "base64url")).toHaveLength(32);
  });

  it("ne se répète pas", () => {
    const tires = new Set(Array.from({ length: 500 }, () => defiNeuf()));
    expect(tires.size).toBe(500);
  });
});

describe("les données du client disent ce que le navigateur a fait", () => {
  it("accepte une création qui porte le bon défi et la bonne origine", () => {
    const vu = examinerLesDonneesClient(donneesClient(CREATION), {
      type: "webauthn.create",
      defi: DEFI,
      origine: ORIGINE,
    });
    expect(vu.bon).toBe(true);
  });

  it("refuse une origine qui n'est pas la nôtre, en la nommant", () => {
    const vu = examinerLesDonneesClient(
      donneesClient({ ...CREATION, origin: "https://ailleurs.exemple" }),
      { type: "webauthn.create", defi: DEFI, origine: ORIGINE },
    );
    expect(vu.bon).toBe(false);
    if (!vu.bon) expect(vu.raison).toContain("origine");
  });

  it("refuse une entrée présentée comme une création, et l'inverse", () => {
    // Le défi dit à quoi il sert ; les données du client disent ce qui a été fait. Les deux
    // doivent concorder, sinon une signature d'entrée vaudrait enrôlement.
    const vu = examinerLesDonneesClient(donneesClient({ ...CREATION, type: "webauthn.get" }), {
      type: "webauthn.create",
      defi: DEFI,
      origine: ORIGINE,
    });
    expect(vu.bon).toBe(false);
    if (!vu.bon) expect(vu.raison).toContain("webauthn.get");
  });

  it("refuse un défi qui n'est pas celui qu'on a envoyé", () => {
    const vu = examinerLesDonneesClient(
      donneesClient({ ...CREATION, challenge: defiNeuf() }),
      { type: "webauthn.create", defi: DEFI, origine: ORIGINE },
    );
    expect(vu.bon).toBe(false);
    if (!vu.bon) expect(vu.raison).toContain("défi");
  });

  it("compare le défi caractère par caractère, sans se laisser avoir par un préfixe", () => {
    const vu = examinerLesDonneesClient(
      donneesClient({ ...CREATION, challenge: `${DEFI}enTrop` }),
      { type: "webauthn.create", defi: DEFI, origine: ORIGINE },
    );
    expect(vu.bon).toBe(false);
  });

  it("refuse une cérémonie menée depuis un cadre étranger", () => {
    // `crossOrigin` vrai veut dire que la page était dans un cadre tiers. Rien ne justifie
    // d'enrôler une clé depuis un cadre qu'on ne contrôle pas.
    const vu = examinerLesDonneesClient(donneesClient({ ...CREATION, crossOrigin: true }), {
      type: "webauthn.create",
      defi: DEFI,
      origine: ORIGINE,
    });
    expect(vu.bon).toBe(false);
    if (!vu.bon) expect(vu.raison).toContain("cadre");
  });

  it("refuse ce qui n'est pas du JSON, sans lever", () => {
    for (const bancal of ["", "pas de la base64 !!", Buffer.from("{nawak", "utf8").toString("base64url")]) {
      const vu = examinerLesDonneesClient(bancal, { type: "webauthn.create", defi: DEFI, origine: ORIGINE });
      expect(vu.bon, `« ${bancal.slice(0, 20)} »`).toBe(false);
      if (!vu.bon) expect(vu.raison.length).toBeGreaterThan(0);
    }
  });

  it("refuse du JSON bien formé dont les champs manquent", () => {
    const vu = examinerLesDonneesClient(donneesClient({ type: "webauthn.create" }), {
      type: "webauthn.create",
      defi: DEFI,
      origine: ORIGINE,
    });
    expect(vu.bon).toBe(false);
  });

  it("lit les vraies données mesurées, et voit qu'elles sont d'une entrée", () => {
    // La cérémonie mesurée le 18 octobre était une entrée, à l'origine localhost. Le module doit
    // la lire sans broncher, et refuser de la prendre pour une création.
    const vraies = CEREMONIE.donneesClient;
    const commeEntree = examinerLesDonneesClient(vraies, {
      type: "webauthn.get",
      defi: MESURE.challenge,
      origine: MESURE.origin,
    });
    expect(commeEntree.bon).toBe(true);

    const commeCreation = examinerLesDonneesClient(vraies, {
      type: "webauthn.create",
      defi: MESURE.challenge,
      origine: MESURE.origin,
    });
    expect(commeCreation.bon).toBe(false);

    // Et l'origine mesurée est bien celle du banc, pas une autre : la fixture n'a pas dérivé.
    expect(MESURE.origin).toBe("http://localhost:8787");
  });
});

describe("la clé publique que le navigateur rend, ou ne rend pas", () => {
  it("accepte la clé réellement mesurée", async () => {
    const vu = await examinerUneClePublique(CEREMONIE.spki, ALGORITHME_ATTENDU);
    expect(vu.bon).toBe(true);
  });

  it("refuse une clé nulle **en le disant**, et non en se rabattant", async () => {
    // Le cas que l'étape 4.1 n'a pas pu trancher sur Safari. S'il arrive, il doit s'entendre.
    const vu = await examinerUneClePublique(null, ALGORITHME_ATTENDU);
    expect(vu.bon).toBe(false);
    if (!vu.bon) {
      expect(vu.raison).toContain("getPublicKey");
      // La raison doit être reconnaissable en tant que telle : c'est elle qu'on cherchera.
      expect(vu.cause).toBe("cle_nulle");
    }
  });

  it("refuse un algorithme nul pour la même raison, et le distingue", async () => {
    const vu = await examinerUneClePublique(CEREMONIE.spki, null);
    expect(vu.bon).toBe(false);
    if (!vu.bon) expect(vu.cause).toBe("algorithme_nul");
  });

  it("refuse un algorithme qui n'est pas celui demandé", async () => {
    const vu = await examinerUneClePublique(CEREMONIE.spki, -257); // RSA, qu'on n'a pas demandé
    expect(vu.bon).toBe(false);
    if (!vu.bon) {
      expect(vu.cause).toBe("algorithme_inattendu");
      expect(vu.raison).toContain("-257");
    }
  });

  it("refuse une clé qui ne s'importe pas, et ne confond pas ce cas avec la clé nulle", async () => {
    // Une clé nulle est une réponse du navigateur ; une clé illisible est un défaut. Les deux
    // refusent, et un journal doit pouvoir les séparer.
    const vu = await examinerUneClePublique("bWF1dmFpc2Uga2xl", ALGORITHME_ATTENDU);
    expect(vu.bon).toBe(false);
    if (!vu.bon) expect(vu.cause).toBe("cle_illisible");
  });

  it("refuse une clé qui n'est même pas de la base64", async () => {
    const vu = await examinerUneClePublique("pas une clé !", ALGORITHME_ATTENDU);
    expect(vu.bon).toBe(false);
    if (!vu.bon) expect(vu.cause).toBe("cle_illisible");
  });

  it("refuse une clé d'une autre courbe, même parfaitement formée", async () => {
    // Bien formée, importable en soi, mais pas la courbe qu'on vérifie. L'algorithme annoncé ne
    // suffit pas : c'est l'import qui tranche.
    const paire = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-384" }, true, ["sign", "verify"]);
    const spki = Buffer.from(await crypto.subtle.exportKey("spki", paire.publicKey)).toString("base64");
    const vu = await examinerUneClePublique(spki, ALGORITHME_ATTENDU);
    expect(vu.bon).toBe(false);
    if (!vu.bon) expect(vu.cause).toBe("cle_illisible");
  });

  it("dit que l'algorithme attendu est celui qu'on demande à la création", () => {
    expect(ALGORITHME_ATTENDU).toBe(-7);
  });
});

describe("les données de l'authentificateur disent le domaine, les drapeaux et le compteur", () => {
  const MESUREES = Uint8Array.from(Buffer.from(CEREMONIE.donneesAuthentificateur, "base64"));

  /** Des données d'authentificateur fabriquées : trente-deux octets d'empreinte, un de
   *  drapeaux, quatre de compteur. C'est tout ce que la norme impose, et tout ce qu'on lit. */
  const fabriquer = async (domaine: string, drapeaux: number, compteur: number): Promise<Uint8Array<ArrayBuffer>> => {
    const empreinte = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(domaine)),
    );
    const donnees = new Uint8Array(TAILLE_DONNEES_AUTH);
    donnees.set(empreinte, 0);
    donnees[32] = drapeaux;
    new DataView(donnees.buffer).setUint32(33, compteur);
    return donnees;
  };

  // Présence (0x01) et utilisateur vérifié (0x04) : ce qu'une entrée par Touch ID porte.
  const PRESENT_ET_VERIFIE = 0x05;

  it("lit les données réellement mesurées, et retrouve le domaine du banc", async () => {
    // Le banc tournait sur « localhost ». L'empreinte du domaine est dans les octets mesurés :
    // si la lecture est juste, elle concorde sans qu'on ait rien à transcrire.
    const vu = await examinerLesDonneesAuthentificateur(MESUREES, { domaine: "localhost" });
    expect(vu.bon).toBe(true);
    if (vu.bon) {
      expect(vu.compteur).toBe(2);
      expect(vu.utilisateurVerifie).toBe(true);
    }
  });

  it("refuse les mêmes données sous un autre domaine", async () => {
    // C'est la garde contre un site voisin qui réutiliserait une signature prise ailleurs.
    const vu = await examinerLesDonneesAuthentificateur(MESUREES, { domaine: "lienotheque.exemple" });
    expect(vu.bon).toBe(false);
    if (!vu.bon) expect(vu.raison).toContain("domaine");
  });

  it("lit le compteur, y compris très grand", async () => {
    for (const compteur of [0, 1, 2, 65535, 4294967295]) {
      const vu = await examinerLesDonneesAuthentificateur(
        await fabriquer("lienotheque.exemple", PRESENT_ET_VERIFIE, compteur),
        { domaine: "lienotheque.exemple" },
      );
      expect(vu.bon, `compteur ${compteur}`).toBe(true);
      if (vu.bon) expect(vu.compteur).toBe(compteur);
    }
  });

  it("refuse si la présence de l'utilisateur n'est pas attestée", async () => {
    // Sans ce drapeau, personne n'a touché l'appareil : la signature pourrait venir d'un
    // logiciel qui garde la clé.
    const vu = await examinerLesDonneesAuthentificateur(
      await fabriquer("lienotheque.exemple", 0x04, 1),
      { domaine: "lienotheque.exemple" },
    );
    expect(vu.bon).toBe(false);
    if (!vu.bon) expect(vu.raison).toContain("présence");
  });

  it("refuse si l'utilisateur n'a pas été vérifié, quand on l'exige", async () => {
    const vu = await examinerLesDonneesAuthentificateur(
      await fabriquer("lienotheque.exemple", 0x01, 1),
      { domaine: "lienotheque.exemple" },
    );
    expect(vu.bon).toBe(false);
    if (!vu.bon) expect(vu.raison).toContain("vérifié");
  });

  it("accepte sans vérification de l'utilisateur quand on ne l'exige pas", async () => {
    const vu = await examinerLesDonneesAuthentificateur(
      await fabriquer("lienotheque.exemple", 0x01, 1),
      { domaine: "lienotheque.exemple", exigerUtilisateurVerifie: false },
    );
    expect(vu.bon).toBe(true);
    if (vu.bon) expect(vu.utilisateurVerifie).toBe(false);
  });

  it("refuse des données trop courtes, sans lire au-delà", async () => {
    const entieres = await fabriquer("lienotheque.exemple", PRESENT_ET_VERIFIE, 1);
    for (const taille of [0, 1, 32, 36]) {
      const vu = await examinerLesDonneesAuthentificateur(entieres.slice(0, taille), {
        domaine: "lienotheque.exemple",
      });
      expect(vu.bon, `${taille} octets`).toBe(false);
      if (!vu.bon) expect(vu.raison, `${taille} octets`).toContain("trop courtes");
    }
  });

  it("accepte des données plus longues : un authentificateur peut en ajouter", async () => {
    // La norme permet des extensions après les trente-sept octets. Les refuser casserait des
    // appareils parfaitement corrects ; les lire n'est pas nécessaire.
    const entieres = await fabriquer("lienotheque.exemple", PRESENT_ET_VERIFIE, 7);
    const allongees = new Uint8Array(entieres.length + 12);
    allongees.set(entieres, 0);
    allongees.fill(0xab, entieres.length);

    const vu = await examinerLesDonneesAuthentificateur(allongees, { domaine: "lienotheque.exemple" });
    expect(vu.bon).toBe(true);
    if (vu.bon) expect(vu.compteur).toBe(7);
  });

  it("compare l'empreinte du domaine octet par octet", async () => {
    // Un domaine qui commence pareil ne doit pas passer : l'empreinte n'a pas de préfixe commun,
    // mais le test fige l'exigence.
    const vu = await examinerLesDonneesAuthentificateur(
      await fabriquer("lienotheque.exemple", PRESENT_ET_VERIFIE, 1),
      { domaine: "lienotheque.exemple.attaquant.test" },
    );
    expect(vu.bon).toBe(false);
  });

  it("dit que trente-sept octets est le minimum de la norme", () => {
    expect(TAILLE_DONNEES_AUTH).toBe(37);
  });
});
