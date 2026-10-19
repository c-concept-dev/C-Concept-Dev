import { readFileSync } from "node:fs";
import { MIGRATIONS, MIGRATIONS_REGISTRE_EN_LIGNE, baseEnMemoire } from "@lienotheque/depot-sqlite";
import { jetonNeuf } from "@lienotheque/noyau";
import { beforeEach, describe, expect, it } from "vitest";
import { creerApp } from "../src/index.js";
import { NOM_DU_TEMOIN } from "../src/porte.js";
import { inscrire, publier } from "../src/registre.js";
import {
  enrolerUneCle,
  inscrireUnDroit,
  inscrireUnePersonne,
  laSessionParEmpreinte,
  ouvrirUneSession,
} from "../src/qui-entre.js";

/** Les routes, gardées dès leur première ligne (SEC-02, SEC-03, étape 4.6).
 *
 *  Ce qui est éprouvé ici n'est pas que les routes marchent — c'est **quelle porte chacune
 *  ouvre, et qu'elle n'en ouvre qu'une** :
 *
 *  | route | porte |
 *  |---|---|
 *  | `/sante` | aucune |
 *  | les quatre de la façade | jeton de service **ou** session, selon la bascule, jamais les deux |
 *  | `/entree/defi`, `/entree` | aucune — c'est la porte elle-même |
 *  | `/enrolement/defi`, `/enrolement` | session **et** droit d'administration |
 *  | `/amorce/defi`, `/amorce` | jeton de service **et** aucune clé enrôlée |
 *  | `DELETE /session` | le témoin seul |
 */

const CEREMONIE = JSON.parse(
  readFileSync(new URL("../../../fixtures/ceremonie-webauthn.json", import.meta.url), "utf8"),
) as { spki: string; donneesAuthentificateur: string; donneesClient: string; signature: string };

const MESURE = JSON.parse(Buffer.from(CEREMONIE.donneesClient, "base64").toString("utf8")) as {
  challenge: string;
  origin: string;
};

const JETON = "jeton d'essai";
const QUAND = "2026-10-18T09:00:00.000Z";
const BIBLIOTHEQUE = "essai";
const IDENTIFIANT = "zBh4Vnw";

const quand = () => new Date(QUAND);
const avecSessions = creerApp({ maintenant: quand, sessionsExigees: true });
const sansSessions = creerApp({ maintenant: quand, sessionsExigees: false });

let registre: ReturnType<typeof baseEnMemoire>;
let bibliotheque: ReturnType<typeof baseEnMemoire>;
let liaisons: Record<string, unknown>;

beforeEach(async () => {
  registre = baseEnMemoire(MIGRATIONS_REGISTRE_EN_LIGNE);
  bibliotheque = baseEnMemoire(MIGRATIONS);
  await bibliotheque
    .prepare(`INSERT INTO schema_bibliotheque (cle, version, contenu) VALUES ('facade', 1, ?)`)
    .bind(JSON.stringify({ book_title: { colonne: "document.titre" } }))
    .run();
  await inscrire(registre, { cle: BIBLIOTHEQUE, nom: "Essai", region: "weur", schemaVersion: 4 }, QUAND);
  await publier(registre, BIBLIOTHEQUE, ["BIB_1"], "moi", QUAND);

  liaisons = {
    JETON_ACCES: JETON,
    REGISTRE: registre,
    BIBLIOTHEQUE_FACADE: BIBLIOTHEQUE,
    BIB_1: bibliotheque,
    ORIGINE_CEREMONIE: MESURE.origin,
    DOMAINE_CEREMONIE: "localhost",
  };
});

const unePersonne = async (nom = "Christophe") => {
  const fait = await inscrireUnePersonne(registre, nom, QUAND, "moi");
  if (!fait.fait) throw new Error(fait.raison);
  return fait.valeur;
};

/** Une personne, son niveau, et le témoin de sa session — de quoi frapper à une porte. */
const unTemoin = async (niveau: "lecture" | "contribution" | "administration" | "aucun" = "lecture") => {
  const personne = await unePersonne(`Quelqu'un ${Math.random()}`);
  if (niveau !== "aucun")
    await inscrireUnDroit(registre, { personneId: personne.id, bibliotheque: BIBLIOTHEQUE, niveau }, QUAND, "moi");
  const jeton = jetonNeuf();
  const ouverte = await ouvrirUneSession(registre, { personneId: personne.id, jeton }, QUAND);
  if (!ouverte.fait) throw new Error(ouverte.raison);
  return { personne, jeton, cookie: `${NOM_DU_TEMOIN}=${jeton}`, session: ouverte.valeur };
};

const poserLeDefi = async (valeur: string, usage: "entree" | "enrolement", personneId: string | null = null) => {
  await registre
    .prepare("INSERT INTO defi (valeur, usage, personne_id, cree_le, expire_le, consomme_le) VALUES (?, ?, ?, ?, ?, NULL)")
    .bind(valeur, usage, personneId, QUAND, new Date(Date.parse(QUAND) + 300_000).toISOString())
    .run();
};

const preuveDEntree = () => ({
  identifiant: IDENTIFIANT,
  donneesAuthentificateur: CEREMONIE.donneesAuthentificateur,
  donneesClient: CEREMONIE.donneesClient,
  signature: CEREMONIE.signature,
});

const appeler = (
  app: ReturnType<typeof creerApp>,
  route: string,
  corps: unknown,
  entetes: Record<string, string> = {},
  methode = "POST",
) =>
  app.request(
    route,
    {
      method: methode,
      headers: { "content-type": "application/json", ...entetes },
      ...(methode === "POST" ? { body: JSON.stringify(corps) } : {}),
    },
    liaisons,
  );

describe("la santé n'a pas de porte, et n'en aura pas", () => {
  it("répond sans rien présenter", async () => {
    const reponse = await appeler(avecSessions, "/sante", null, {}, "GET");
    expect(reponse.status).toBe(200);
  });
});

describe("la façade : une porte ou l'autre, jamais les deux", () => {
  it("sans sessions exigées, le jeton de service ouvre", async () => {
    const reponse = await appeler(sansSessions, "/search-library", { query: "x" }, { "x-api-key": JETON });
    expect(reponse.status).toBe(200);
  });

  it("sans sessions exigées, une session ne suffit pas — ce n'est pas la porte du jour", async () => {
    const { cookie } = await unTemoin("administration");
    const reponse = await appeler(sansSessions, "/search-library", { query: "x" }, { cookie });
    expect(reponse.status).toBe(401);
  });

  it("avec sessions exigées, le jeton de service **cesse** d'ouvrir", async () => {
    // C'est l'exigence qui a fait naître le drapeau : il ne doit jamais exister de moment où les
    // deux portes ouvrent ensemble sans qu'on l'ait décidé.
    const reponse = await appeler(avecSessions, "/search-library", { query: "x" }, { "x-api-key": JETON });
    expect(reponse.status).toBe(401);
  });

  it("avec sessions exigées, une session et le droit de chercher ouvrent", async () => {
    const { cookie } = await unTemoin("lecture");
    const reponse = await appeler(avecSessions, "/search-library", { query: "x" }, { cookie });
    expect(reponse.status).toBe(200);
  });

  it("avec sessions exigées, une session sans aucun droit n'ouvre pas", async () => {
    const { cookie } = await unTemoin("aucun");
    const reponse = await appeler(avecSessions, "/search-library", { query: "x" }, { cookie });
    expect(reponse.status).toBe(401);
    expect(await reponse.json()).toEqual({ erreur: "Accès refusé." });
  });

  it("garde les quatre routes de la façade sous la même porte", async () => {
    const { cookie } = await unTemoin("lecture");
    for (const route of ["/search-library", "/rag-search", "/d1-query", "/library-facets"]) {
      expect((await appeler(avecSessions, route, { query: "x" }, { "x-api-key": JETON })).status, route).toBe(401);
      expect((await appeler(avecSessions, route, { query: "x" }, { cookie })).status, route).toBe(200);
    }
  });

  it("ne dit pas si la façade est configurée à qui n'a pas de session", async () => {
    // La règle du 10 octobre : la porte avant la configuration. Ici la porte est en deux temps,
    // et le premier ne regarde aucun réglage.
    delete liaisons["BIBLIOTHEQUE_FACADE"];
    const reponse = await appeler(avecSessions, "/search-library", { query: "x" }, {});
    expect(reponse.status).toBe(401);
    expect(await reponse.json()).toEqual({ erreur: "Accès refusé." });
  });
});

describe("l'entrée : la porte qu'on vient ouvrir", () => {
  it("donne un défi sans rien demander", async () => {
    const reponse = await appeler(avecSessions, "/entree/defi", {});
    expect(reponse.status).toBe(200);
    const corps = (await reponse.json()) as { defi: string; domaine: string };
    expect(corps.defi).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(corps.domaine).toBe("localhost");
  });

  it("entre avec la cérémonie mesurée, et pose le témoin", async () => {
    const personne = await unePersonne();
    await enrolerUneCle(
      registre,
      { personneId: personne.id, identifiant: IDENTIFIANT, clePublique: CEREMONIE.spki, compteur: 1 },
      QUAND,
      "moi",
    );
    await poserLeDefi(MESURE.challenge, "entree");

    const reponse = await appeler(avecSessions, "/entree", preuveDEntree());
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({ entre: true });

    const temoin = reponse.headers.get("set-cookie") ?? "";
    expect(temoin).toContain(`${NOM_DU_TEMOIN}=`);
    expect(temoin).toContain("HttpOnly");
    expect(temoin).toContain("Secure");
    expect(temoin).toContain("SameSite=Lax");

    // Le jeton est dans le témoin et nulle part ailleurs — surtout pas dans le corps.
    const jeton = temoin.slice(temoin.indexOf("=") + 1, temoin.indexOf(";"));
    expect(jeton.length).toBeGreaterThan(20);
    expect(JSON.stringify(await (await appeler(avecSessions, "/entree/defi", {})).json())).not.toContain(jeton);

    // Et le témoin obtenu ouvre vraiment la façade.
    const vu = await appeler(avecSessions, "/search-library", { query: "x" }, { cookie: `${NOM_DU_TEMOIN}=${jeton}` });
    // Sans droit inscrit, la session est valide mais la porte reste fermée : c'est bien la
    // seconde question qui a répondu, pas la première.
    expect(vu.status).toBe(401);
    await inscrireUnDroit(registre, { personneId: personne.id, bibliotheque: BIBLIOTHEQUE, niveau: "lecture" }, QUAND, "moi");
    expect((await appeler(avecSessions, "/search-library", { query: "x" }, { cookie: `${NOM_DU_TEMOIN}=${jeton}` })).status).toBe(200);
  });

  it("rend le même mot pour un corps mal formé et pour une signature fausse", async () => {
    const personne = await unePersonne();
    await enrolerUneCle(
      registre,
      { personneId: personne.id, identifiant: IDENTIFIANT, clePublique: CEREMONIE.spki, compteur: 1 },
      QUAND,
      "moi",
    );
    await poserLeDefi(MESURE.challenge, "entree");

    const malForme = await appeler(avecSessions, "/entree", { rien: "du tout" });
    expect(malForme.status).toBe(401);
    expect(await malForme.json()).toEqual({ erreur: "Entrée refusée." });

    const fausse = await appeler(avecSessions, "/entree", {
      ...preuveDEntree(),
      signature: Buffer.from([0x30, 0x02, 0x02, 0x00]).toString("base64"),
    });
    expect(fausse.status).toBe(401);
    expect(await fausse.json()).toEqual({ erreur: "Entrée refusée." });
  });

  it("refuse d'ouvrir si l'origine et le domaine ne sont pas posés", async () => {
    delete liaisons["ORIGINE_CEREMONIE"];
    expect((await appeler(avecSessions, "/entree/defi", {})).status).toBe(503);
    expect((await appeler(avecSessions, "/entree", preuveDEntree())).status).toBe(503);
  });
});

describe("l'enrôlement exige une session et le droit d'administrer", () => {
  it("refuse sans session", async () => {
    expect((await appeler(avecSessions, "/enrolement/defi", {})).status).toBe(401);
    expect((await appeler(avecSessions, "/enrolement", {})).status).toBe(401);
  });

  it("refuse sans session **avant** de regarder la configuration", async () => {
    // La règle du 10 octobre. L'ordre inverse était écrit ici, et c'est le Worker déployé qui
    // l'a montré : un inconnu recevait 503 et apprenait que la cérémonie n'est pas configurée
    // avant d'avoir rien présenté. Les tests ne le voyaient pas — ils éprouvaient la porte avec
    // les réglages toujours posés.
    delete liaisons["ORIGINE_CEREMONIE"];
    delete liaisons["DOMAINE_CEREMONIE"];
    delete liaisons["BIBLIOTHEQUE_FACADE"];

    for (const route of ["/enrolement/defi", "/enrolement"]) {
      const reponse = await appeler(avecSessions, route, {}, {});
      expect(reponse.status, route).toBe(401);
      expect(await reponse.json(), route).toEqual({ erreur: "Accès refusé." });
    }
  });

  it("refuse le jeton de service : ce n'est pas sa porte", async () => {
    expect((await appeler(avecSessions, "/enrolement/defi", {}, { "x-api-key": JETON })).status).toBe(401);
  });

  it("refuse une session qui ne peut que lire", async () => {
    const { cookie } = await unTemoin("lecture");
    const reponse = await appeler(avecSessions, "/enrolement/defi", {}, { cookie });
    expect(reponse.status).toBe(401);
    expect(await reponse.json()).toEqual({ erreur: "Accès refusé." });
  });

  it("donne un défi lié à la personne de la session", async () => {
    const { cookie, personne } = await unTemoin("administration");
    const reponse = await appeler(avecSessions, "/enrolement/defi", {}, { cookie });
    expect(reponse.status).toBe(200);

    const { defi } = (await reponse.json()) as { defi: string };
    const ligne = await registre
      .prepare("SELECT personne_id, usage FROM defi WHERE valeur = ?")
      .bind(defi)
      .first<{ personne_id: string; usage: string }>();
    expect(ligne?.personne_id).toBe(personne.id);
    expect(ligne?.usage).toBe("enrolement");
  });

  it("dit pourquoi il refuse, parce que l'appelant est identifié et a le droit de savoir", async () => {
    // Ici le motif sort, à la différence de l'entrée : une personne qui a le droit d'enrôler doit
    // apprendre que son navigateur n'a pas rendu de clé, plutôt que de réessayer sans fin.
    const { cookie, personne } = await unTemoin("administration");
    await poserLeDefi(MESURE.challenge, "enrolement", personne.id);

    const creation = Buffer.from(
      JSON.stringify({ type: "webauthn.create", challenge: MESURE.challenge, origin: MESURE.origin, crossOrigin: false }),
      "utf8",
    ).toString("base64url");

    const reponse = await appeler(
      avecSessions,
      "/enrolement",
      { identifiant: "neuf", clePublique: null, algorithme: -7, donneesClient: creation },
      { cookie },
    );
    expect(reponse.status).toBe(400);
    expect(JSON.stringify(await reponse.json())).toContain("getPublicKey");
  });

  it("enrôle pour de bon, et la clé ouvre ensuite", async () => {
    const { cookie, personne } = await unTemoin("administration");
    await poserLeDefi(MESURE.challenge, "enrolement", personne.id);

    const creation = Buffer.from(
      JSON.stringify({ type: "webauthn.create", challenge: MESURE.challenge, origin: MESURE.origin, crossOrigin: false }),
      "utf8",
    ).toString("base64url");

    const reponse = await appeler(
      avecSessions,
      "/enrolement",
      { identifiant: IDENTIFIANT, clePublique: CEREMONIE.spki, algorithme: -7, donneesClient: creation, appareil: "Portable" },
      { cookie },
    );
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({ enrolee: true, appareil: "Portable" });
  });
});

describe("l'amorçage : le jeton de service, et une seule fois", () => {
  it("refuse sans le jeton de service", async () => {
    expect((await appeler(avecSessions, "/amorce/defi", { nom: "Christophe" })).status).toBe(401);
  });

  it("crée la première personne, lui donne l'administration, et rend un défi", async () => {
    const reponse = await appeler(avecSessions, "/amorce/defi", { nom: "Christophe" }, { "x-api-key": JETON });
    expect(reponse.status).toBe(200);
    const corps = (await reponse.json()) as { defi: string; personne: string };
    expect(corps.personne).toBe("Christophe");

    const droit = await registre
      .prepare("SELECT niveau FROM droit WHERE bibliotheque = ?")
      .bind(BIBLIOTHEQUE)
      .first<{ niveau: string }>();
    expect(droit?.niveau).toBe("administration");
  });

  it("refuse un amorçage sans nom", async () => {
    expect((await appeler(avecSessions, "/amorce/defi", {}, { "x-api-key": JETON })).status).toBe(400);
  });

  it("se referme dès qu'une clé existe, et pour toujours", async () => {
    const personne = await unePersonne();
    await enrolerUneCle(
      registre,
      { personneId: personne.id, identifiant: "deja", clePublique: CEREMONIE.spki, compteur: 0 },
      QUAND,
      "moi",
    );

    expect((await appeler(avecSessions, "/amorce/defi", { nom: "Autre" }, { "x-api-key": JETON })).status).toBe(409);
    expect((await appeler(avecSessions, "/amorce", preuveDEntree(), { "x-api-key": JETON })).status).toBe(409);
  });

  it("mène l'amorçage de bout en bout, puis se referme", async () => {
    const defi = (await (
      await appeler(avecSessions, "/amorce/defi", { nom: "Christophe" }, { "x-api-key": JETON })
    ).json()) as { defi: string };

    // La cérémonie mesurée porte son propre défi : on pose celui-là, lié à la même personne.
    const personne = (await registre.prepare("SELECT id FROM utilisateur").bind().first<{ id: string }>())!;
    await registre.prepare("DELETE FROM defi").bind().run();
    await poserLeDefi(MESURE.challenge, "enrolement", personne.id);
    expect(defi.defi.length).toBeGreaterThan(0);

    const creation = Buffer.from(
      JSON.stringify({ type: "webauthn.create", challenge: MESURE.challenge, origin: MESURE.origin, crossOrigin: false }),
      "utf8",
    ).toString("base64url");

    const enrole = await appeler(
      avecSessions,
      "/amorce",
      { identifiant: IDENTIFIANT, clePublique: CEREMONIE.spki, algorithme: -7, donneesClient: creation },
      { "x-api-key": JETON },
    );
    expect(enrole.status).toBe(200);

    // Et maintenant la porte d'amorçage est close.
    expect((await appeler(avecSessions, "/amorce/defi", { nom: "Autre" }, { "x-api-key": JETON })).status).toBe(409);
  });
});

describe("se déconnecter ne demande aucune autorisation", () => {
  it("révoque la session, retire le témoin, et ne dit pas si l'on était connecté", async () => {
    const { cookie, session } = await unTemoin("aucun");

    const reponse = await appeler(avecSessions, "/session", null, { cookie }, "DELETE");
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({ ferme: true });
    expect(reponse.headers.get("set-cookie") ?? "").toContain("Max-Age=0");

    const relue = await laSessionParEmpreinte(registre, session.empreinte);
    expect(relue?.revoqueeLe).toBe(QUAND);

    // Sans témoin du tout : la même réponse, mot pour mot.
    const sansRien = await appeler(avecSessions, "/session", null, {}, "DELETE");
    expect(sansRien.status).toBe(200);
    expect(await sansRien.json()).toEqual({ ferme: true });
  });

  it("une session fermée ne rouvre rien", async () => {
    const { cookie } = await unTemoin("lecture");
    expect((await appeler(avecSessions, "/search-library", { query: "x" }, { cookie })).status).toBe(200);

    await appeler(avecSessions, "/session", null, { cookie }, "DELETE");
    expect((await appeler(avecSessions, "/search-library", { query: "x" }, { cookie })).status).toBe(401);
  });
});
