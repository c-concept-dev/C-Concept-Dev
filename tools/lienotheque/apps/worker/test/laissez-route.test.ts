import { MIGRATIONS_REGISTRE_EN_LIGNE, baseEnMemoire } from "@lienotheque/depot-sqlite";
import { DUREE_PAR_DEFAUT, cleDerive, jetonNeuf } from "@lienotheque/noyau";
import { beforeEach, describe, expect, it } from "vitest";
import { creerApp } from "../src/app.js";
import { NOM_DU_TEMOIN } from "../src/porte.js";
import { inscrireUnDroit, inscrireUnePersonne, ouvrirUneSession } from "../src/qui-entre.js";

/** Signer un laissez-passer pour une image de page (SEC-05, étape 5 d'E5).
 *
 *  Les laissez-passer existaient depuis E1 — personne ne les signait. Cette route les émet, et
 *  c'est elle qui permet à la version en ligne d'afficher une page.
 *
 *  Trois propriétés commandent ces tests :
 *
 *  **La clé de l'objet est composée ici, jamais reçue.** C'est la règle d'`objets.ts` : « tout ce
 *  qui compose une clé part de la clé de la bibliothèque, jamais d'une valeur reçue dans une
 *  requête ». Un appelant donne une version et un nom de fichier, pas un chemin.
 *
 *  **Le laissez-passer est court.** Trois minutes : assez pour qu'un navigateur charge une image,
 *  trop peu pour qu'une adresse recopiée serve encore demain.
 *
 *  **La porte est celle de la bascule.** La même que la façade, et pas une seconde inventée
 *  pour l'occasion. */

const JETON = "jeton d'essai";
const SECRET = "secret d'essai";
const BIBLIOTHEQUE = "essai";
const QUAND = "2026-10-18T09:00:00.000Z";
const VERSION = "01932f4e-7a1b-7c3d-8e5f-0123456789ab";
const FICHIER = "pages/page-0001.webp";

const quand = () => new Date(QUAND);
const avecSessions = creerApp({ maintenant: quand, sessionsExigees: true });
const sansSessions = creerApp({ maintenant: quand, sessionsExigees: false });

/** Un compartiment qui note ce qu'on lui demande : on doit pouvoir montrer qu'il n'est **jamais**
 *  touché avant qu'un laissez-passer soit vérifié. */
const compartiment = (contenu: Record<string, string>) => {
  const demandes: string[] = [];
  return {
    demandes,
    liaison: {
      get: async (cle: string) => {
        demandes.push(cle);
        const texte = contenu[cle];
        if (texte === undefined) return null;
        return {
          body: new Blob([texte]).stream(),
          size: texte.length,
          httpEtag: '"abc"',
          httpMetadata: { contentType: "image/webp" },
        };
      },
    },
  };
};

let registre: ReturnType<typeof baseEnMemoire>;
let medias: ReturnType<typeof compartiment>;
let liaisons: Record<string, unknown>;

const CLE_ATTENDUE = cleDerive(BIBLIOTHEQUE, VERSION, FICHIER);

beforeEach(() => {
  registre = baseEnMemoire(MIGRATIONS_REGISTRE_EN_LIGNE);
  medias = compartiment({ [CLE_ATTENDUE]: "une image" });
  liaisons = {
    JETON_ACCES: JETON,
    SECRET_LAISSEZ: SECRET,
    REGISTRE: registre,
    BIBLIOTHEQUE_FACADE: BIBLIOTHEQUE,
    MEDIAS: medias.liaison,
  };
});

const unTemoin = async (niveau: "lecture" | "aucun" = "lecture") => {
  const personne = await inscrireUnePersonne(registre, "Christophe", QUAND, "moi");
  if (!personne.fait) throw new Error(personne.raison);
  if (niveau !== "aucun")
    await inscrireUnDroit(registre, { personneId: personne.valeur.id, bibliotheque: BIBLIOTHEQUE, niveau }, QUAND, "moi");
  const jeton = jetonNeuf();
  const ouverte = await ouvrirUneSession(registre, { personneId: personne.valeur.id, jeton }, QUAND);
  if (!ouverte.fait) throw new Error(ouverte.raison);
  return `${NOM_DU_TEMOIN}=${jeton}`;
};

const demander = (
  app: ReturnType<typeof creerApp>,
  corps: unknown,
  entetes: Record<string, string> = {},
) =>
  app.request(
    "/laissez",
    { method: "POST", headers: { "content-type": "application/json", ...entetes }, body: JSON.stringify(corps) },
    liaisons,
  );

const servir = (app: ReturnType<typeof creerApp>, laissez: string) =>
  app.request(`/fichier/${laissez}`, { method: "GET" }, liaisons);

describe("la route signe un laissez-passer pour une page", () => {
  it("le signe, et il ouvre vraiment le fichier", async () => {
    const reponse = await demander(sansSessions, { version: VERSION, fichier: FICHIER }, { "x-api-key": JETON });
    expect(reponse.status).toBe(200);

    const corps = (await reponse.json()) as { laissez: string; secondes: number };
    expect(corps.secondes).toBe(DUREE_PAR_DEFAUT);
    // Rien de la clé de l'objet ne sort dans la réponse : un laissez-passer la porte signée,
    // il n'a pas à l'annoncer en clair à côté.
    expect(JSON.stringify(corps)).not.toContain(BIBLIOTHEQUE);

    const servie = await servir(sansSessions, corps.laissez);
    expect(servie.status).toBe(200);
    expect(await servie.text()).toBe("une image");
    // Et c'est bien la clé composée ici qui a été demandée au compartiment.
    expect(medias.demandes).toEqual([CLE_ATTENDUE]);
  });

  it("compose la clé lui-même : un chemin reçu n'ouvre rien", async () => {
    // La règle d'`objets.ts`. Même en envoyant une clé complète toute faite, l'appelant ne
    // désigne rien : le nom reçu n'est qu'un nom, et il est recomposé sous la bibliothèque.
    const reponse = await demander(
      sansSessions,
      { version: VERSION, fichier: "../../autre/sources/ff/secret" },
      { "x-api-key": JETON },
    );
    expect(reponse.status).toBe(400);
    expect(medias.demandes).toEqual([]);
  });

  it("refuse un nom de fichier qui n'en a pas la forme", async () => {
    for (const fichier of ["", "..", "pages/../x", "PAGES/A.webp", "pages/page 1.webp", "/absolu", "a".repeat(300)]) {
      const reponse = await demander(sansSessions, { version: VERSION, fichier }, { "x-api-key": JETON });
      expect(reponse.status, `« ${fichier.slice(0, 20)} »`).toBe(400);
    }
    expect(medias.demandes).toEqual([]);
  });

  it("refuse une version qui n'en a pas la forme", async () => {
    for (const version of ["", "pas/une/version", "../v1", "v".repeat(200)]) {
      const reponse = await demander(sansSessions, { version, fichier: FICHIER }, { "x-api-key": JETON });
      expect(reponse.status, `« ${version} »`).toBe(400);
    }
  });

  it("refuse un corps qui ne dit rien", async () => {
    expect((await demander(sansSessions, {}, { "x-api-key": JETON })).status).toBe(400);
    expect((await demander(sansSessions, { version: 7, fichier: 9 }, { "x-api-key": JETON })).status).toBe(400);
  });
});

describe("un laissez-passer expiré refuse", () => {
  it("ouvre maintenant, et plus trois minutes plus tard", async () => {
    // La même application, deux instants : c'est le temps qui change, pas le laissez-passer.
    const maintenant = await demander(sansSessions, { version: VERSION, fichier: FICHIER }, { "x-api-key": JETON });
    const { laissez } = (await maintenant.json()) as { laissez: string };

    expect((await servir(sansSessions, laissez)).status).toBe(200);

    const plusTard = creerApp({
      maintenant: () => new Date(Date.parse(QUAND) + (DUREE_PAR_DEFAUT + 1) * 1000),
      sessionsExigees: false,
    });
    const refusee = await plusTard.request(`/fichier/${laissez}`, { method: "GET" }, liaisons);
    expect(refusee.status).toBe(403);
  });

  it("ne touche pas au compartiment quand le laissez-passer est refusé", async () => {
    const refusee = await servir(sansSessions, "nawak.nawak");
    expect(refusee.status).toBe(403);
    expect(medias.demandes).toEqual([]);
  });
});

describe("la porte est celle de la bascule, pas une seconde", () => {
  it("sans sessions exigées : le jeton de service ouvre, une session non", async () => {
    const cookie = await unTemoin("lecture");
    expect((await demander(sansSessions, { version: VERSION, fichier: FICHIER }, { "x-api-key": JETON })).status).toBe(200);
    expect((await demander(sansSessions, { version: VERSION, fichier: FICHIER }, { cookie })).status).toBe(401);
  });

  it("avec sessions exigées : la session ouvre, le jeton de service non", async () => {
    const cookie = await unTemoin("lecture");
    expect((await demander(avecSessions, { version: VERSION, fichier: FICHIER }, { cookie })).status).toBe(200);
    expect((await demander(avecSessions, { version: VERSION, fichier: FICHIER }, { "x-api-key": JETON })).status).toBe(401);
  });

  it("refuse une session sans droit de lecture", async () => {
    const cookie = await unTemoin("aucun");
    const reponse = await demander(avecSessions, { version: VERSION, fichier: FICHIER }, { cookie });
    expect(reponse.status).toBe(401);
    expect(await reponse.json()).toEqual({ erreur: "Accès refusé." });
  });

  it("refuse d'ouvrir sans secret de signature", async () => {
    delete liaisons["SECRET_LAISSEZ"];
    const reponse = await demander(sansSessions, { version: VERSION, fichier: FICHIER }, { "x-api-key": JETON });
    expect(reponse.status).toBe(503);
  });

  it("vérifie la porte avant de regarder le corps", async () => {
    // Un corps absurde présenté sans porte doit rendre un refus de porte, et non une erreur de
    // forme : l'inverse apprendrait à un inconnu ce que la route attend.
    const reponse = await demander(sansSessions, { version: 7 }, {});
    expect(reponse.status).toBe(401);
  });
});
