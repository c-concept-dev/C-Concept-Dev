import { MIGRATIONS_REGISTRE_EN_LIGNE, baseEnMemoire } from "@lienotheque/depot-sqlite";
import { cleVue, jetonNeuf } from "@lienotheque/noyau";
import { PassagesDuDocument, VueBibliotheque } from "@lienotheque/contrats";
import { beforeEach, describe, expect, it } from "vitest";
import { creerApp } from "../src/index.js";
import { NOM_DU_TEMOIN } from "../src/porte.js";
import { inscrireUnDroit, inscrireUnePersonne, ouvrirUneSession } from "../src/qui-entre.js";

/** Servir la vue de bibliothèque en ligne (étape 6 d'E5).
 *
 *  La vue n'est **pas rebâtie ici**. `instantane.ts` la construit déjà, à l'ingestion, et une
 *  seconde mise en œuvre serait une seconde vérité — celle des deux qui finirait par mentir. Le
 *  Worker la sert telle qu'elle a été rangée, et la recherche en ligne fait ensuite tourner le
 *  **même** `chercher` sur la **même** vue.
 *
 *  Deux routes à noms fixes plutôt qu'une route paramétrée : un nom reçu dans une requête
 *  demanderait d'être vérifié avant de composer une clé, et un nom constant n'a rien à vérifier.
 *
 *  L'absence de vue rend **404**, que l'application lit comme un dépôt vide — c'est l'état de
 *  quiconque n'a rien importé, et c'est déjà la convention du greffon de Vite côté bureau. */

const JETON = "jeton d'essai";
const BIBLIOTHEQUE = "essai";
const QUAND = "2026-10-18T09:00:00.000Z";

const quand = () => new Date(QUAND);
const avecSessions = creerApp({ maintenant: quand, sessionsExigees: true });
const sansSessions = creerApp({ maintenant: quand, sessionsExigees: false });

/** Une vue et des passages **conformes à leurs contrats**.
 *
 *  Mes premiers fixtures ne l'étaient pas, et la route d'écriture les a refusés. C'est elle qui
 *  avait raison : la lecture ne fait que transmettre des octets, l'écriture est le seul endroit
 *  qui vérifie — et c'est précisément pour que ce qui est rangé se relise. */
const VUE = VueBibliotheque.parse({
  id: "01932f4e-7a1b-7c3d-8e5f-0123456789ab",
  nom: "Essai",
  mots: {
    element: { un: "élément", plusieurs: "éléments" },
    piste: { un: "piste", plusieurs: "pistes" },
    page: { un: "feuillet", plusieurs: "feuillets" },
  },
  compteurs: [{ nombre: 1, mot: "document" }],
  pages: [{ index: 1, numero: 42, elements: [], texte: [] }],
});

const PASSAGES = PassagesDuDocument.parse([
  { rang: 0, page: 42, pageImprimee: 42, texte: "un passage", source: "couche_texte" },
]);

const compartiment = (contenu: Record<string, string>) => {
  const demandes: string[] = [];
  const rangees: { cle: string; corps: string }[] = [];
  return {
    demandes,
    rangees,
    liaison: {
      put: async (cle: string, corps: string) => {
        rangees.push({ cle, corps });
        contenu[cle] = corps;
      },
      get: async (cle: string) => {
        demandes.push(cle);
        const texte = contenu[cle];
        if (texte === undefined) return null;
        return {
          body: new Blob([texte]).stream(),
          size: texte.length,
          httpEtag: '"abc"',
          httpMetadata: { contentType: "application/json" },
        };
      },
    },
  };
};

let registre: ReturnType<typeof baseEnMemoire>;
let medias: ReturnType<typeof compartiment>;
let liaisons: Record<string, unknown>;

beforeEach(() => {
  registre = baseEnMemoire(MIGRATIONS_REGISTRE_EN_LIGNE);
  medias = compartiment({
    [cleVue(BIBLIOTHEQUE, "bibliotheque.json")]: JSON.stringify(VUE),
    [cleVue(BIBLIOTHEQUE, "passages.json")]: JSON.stringify(PASSAGES),
  });
  liaisons = {
    JETON_ACCES: JETON,
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

const lire = (app: ReturnType<typeof creerApp>, route: string, entetes: Record<string, string> = {}) =>
  app.request(route, { method: "GET", headers: entetes }, liaisons);

describe("la vue se sert telle qu'elle a été rangée", () => {
  it("rend l'instantané, et demande la clé composée par objets.ts", async () => {
    const reponse = await lire(sansSessions, "/vue", { "x-api-key": JETON });
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual(VUE);
    expect(medias.demandes).toEqual([cleVue(BIBLIOTHEQUE, "bibliotheque.json")]);
  });

  it("rend les passages à part, comme le contrat l'exige", async () => {
    // « En entrée à part, et non dans la vue : recopier les passages dedans donnerait deux
    // endroits pour un même fait. » La séparation vaut aussi sur le réseau.
    const reponse = await lire(sansSessions, "/vue/passages", { "x-api-key": JETON });
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual(PASSAGES);
    expect(medias.demandes).toEqual([cleVue(BIBLIOTHEQUE, "passages.json")]);
  });

  it("rend 404 quand rien n'a été rangé — un dépôt vide, pas une panne", async () => {
    medias = compartiment({});
    liaisons["MEDIAS"] = medias.liaison;
    expect((await lire(sansSessions, "/vue", { "x-api-key": JETON })).status).toBe(404);
    expect((await lire(sansSessions, "/vue/passages", { "x-api-key": JETON })).status).toBe(404);
  });
});

describe("la vue est derrière la porte de la bascule", () => {
  it("sans sessions exigées : le jeton ouvre, une session non", async () => {
    const cookie = await unTemoin("lecture");
    expect((await lire(sansSessions, "/vue", { "x-api-key": JETON })).status).toBe(200);
    expect((await lire(sansSessions, "/vue", { cookie })).status).toBe(401);
  });

  it("avec sessions exigées : la session ouvre, le jeton non", async () => {
    const cookie = await unTemoin("lecture");
    expect((await lire(avecSessions, "/vue", { cookie })).status).toBe(200);
    expect((await lire(avecSessions, "/vue", { "x-api-key": JETON })).status).toBe(401);
  });

  it("refuse une session sans droit de lecture, et ne touche pas au compartiment", async () => {
    const cookie = await unTemoin("aucun");
    const reponse = await lire(avecSessions, "/vue", { cookie });
    expect(reponse.status).toBe(401);
    expect(medias.demandes).toEqual([]);
  });

  it("ne touche pas au compartiment sans porte du tout", async () => {
    expect((await lire(avecSessions, "/vue")).status).toBe(401);
    expect((await lire(avecSessions, "/vue/passages")).status).toBe(401);
    expect(medias.demandes).toEqual([]);
  });

  it("refuse d'ouvrir sans compartiment configuré", async () => {
    delete liaisons["MEDIAS"];
    expect((await lire(sansSessions, "/vue", { "x-api-key": JETON })).status).toBe(503);
  });
});

describe("la vue se range au moment où une version s'active", () => {
  const ranger = (corps: unknown, route = "/vue", entetes: Record<string, string> = { "x-api-key": JETON }) =>
    sansSessions.request(
      route,
      { method: "PUT", headers: { "content-type": "application/json", ...entetes }, body: JSON.stringify(corps) },
      liaisons,
    );

  const videPuisRange = () => {
    medias = compartiment({});
    liaisons["MEDIAS"] = medias.liaison;
  };

  it("range la vue, et elle se relit aussitôt", async () => {
    videPuisRange();
    const rangee = await ranger(VUE);
    expect(rangee.status).toBe(200);
    expect(medias.rangees[0]?.cle).toBe(cleVue(BIBLIOTHEQUE, "bibliotheque.json"));

    const relue = await lire(sansSessions, "/vue", { "x-api-key": JETON });
    expect(await relue.json()).toEqual(VUE);
  });

  it("range les passages par la seconde route", async () => {
    videPuisRange();
    expect((await ranger(PASSAGES, "/vue/passages")).status).toBe(200);
    expect(medias.rangees[0]?.cle).toBe(cleVue(BIBLIOTHEQUE, "passages.json"));
  });

  it("n'accepte que le jeton de service : c'est un appel de machine à machine", async () => {
    // La chaîne de traitement tourne sur la machine de l'ingestion, pas dans un navigateur :
    // elle n'a pas de session personnelle à présenter, et c'est l'usage du jeton de service.
    videPuisRange();
    const cookie = await unTemoin("lecture");
    expect((await ranger(VUE, "/vue", { cookie })).status).toBe(401);
    expect((await ranger(VUE, "/vue", {})).status).toBe(401);
    expect(medias.rangees).toEqual([]);
  });

  it("refuse une vue qui ne tient pas son contrat, **avant** de la ranger", async () => {
    // Ranger un objet qu'on ne saurait pas relire reporterait la panne chez le lecteur, le jour
    // où il ouvre la bibliothèque. Mieux vaut refuser maintenant, à qui peut corriger.
    videPuisRange();
    const refusee = await ranger({ id: "pas un identifiant", nom: "" });
    expect(refusee.status).toBe(400);
    const corps = (await refusee.json()) as { ecarts: string[] };
    expect(corps.ecarts.length).toBeGreaterThan(0);
    expect(medias.rangees).toEqual([]);
  });

  it("refuse des passages dont les rangs ne se suivent pas", async () => {
    videPuisRange();
    expect((await ranger([{ ...PASSAGES[0], rang: 3 }], "/vue/passages")).status).toBe(400);
    expect(medias.rangees).toEqual([]);
  });

  it("refuse un corps illisible", async () => {
    videPuisRange();
    const reponse = await sansSessions.request(
      "/vue",
      { method: "PUT", headers: { "content-type": "application/json", "x-api-key": JETON }, body: "{pas du json" },
      liaisons,
    );
    expect(reponse.status).toBe(400);
  });

  it("refuse d'ouvrir si le compartiment ne sait pas écrire", async () => {
    liaisons["MEDIAS"] = { get: medias.liaison.get };
    expect((await ranger(VUE)).status).toBe(503);
  });
});
