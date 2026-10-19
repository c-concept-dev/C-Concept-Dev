import { ApercuEnLigne, PassagesDuDocument, VueBibliotheque } from "@lienotheque/contrats";
import { MIGRATIONS_REGISTRE_EN_LIGNE, baseEnMemoire } from "@lienotheque/depot-sqlite";
import { clePassagesDeDocument, cleVue, cleVueDeDocument, jetonNeuf } from "@lienotheque/noyau";
import { beforeEach, describe, expect, it } from "vitest";
import { creerApp } from "../src/index.js";
import { NOM_DU_TEMOIN } from "../src/porte.js";
import { inscrireUnDroit, inscrireUnePersonne, ouvrirUneSession } from "../src/qui-entre.js";

/** Servir et ranger les vues en ligne (étape 6 d'E5, scénario B).
 *
 *  Trois objets : l'aperçu de la bibliothèque — sa liste et ses classements, toujours demandés
 *  ensemble —, puis la vue et les passages **de chaque document**, nommés par son empreinte.
 *
 *  Rien n'est rebâti : `instantane.ts` construit la vue à l'ingestion, et le Worker la sert telle
 *  quelle. La recherche en ligne fait ensuite tourner le **même** `chercher` sur la **même** vue.
 *
 *  Ce qui est éprouvé de plus près ici : **l'empreinte reçue ne devient jamais un chemin.** Elle
 *  est vérifiée par `objets.ts`, qui refuse plutôt que de composer une clé douteuse, et la route
 *  n'a aucun moyen de passer outre. */

const JETON = "jeton d'essai";
const BIBLIOTHEQUE = "essai";
const QUAND = "2026-10-19T09:00:00.000Z";
const EMPREINTE = "a3".repeat(32);

const quand = () => new Date(QUAND);
const avecSessions = creerApp({ maintenant: quand, sessionsExigees: true });
const sansSessions = creerApp({ maintenant: quand, sessionsExigees: false });

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
  { rang: 0, page: 1, pageImprimee: 42, texte: "un passage", source: "couche_texte" },
]);

const APERCU = ApercuEnLigne.parse({
  documents: [
    {
      empreinte: EMPREINTE,
      version: "01932f4e-7a1b-7c3d-8e5f-00000000c001",
      activeeLe: 1_760_000_000,
      nom: "Un document",
      compteurs: [{ nombre: 1, mot: "document" }],
    },
  ],
  classements: [],
});

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
    [cleVue(BIBLIOTHEQUE, "apercu.json")]: JSON.stringify(APERCU),
    [cleVueDeDocument(BIBLIOTHEQUE, EMPREINTE)!]: JSON.stringify(VUE),
    [clePassagesDeDocument(BIBLIOTHEQUE, EMPREINTE)!]: JSON.stringify(PASSAGES),
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

const ranger = (route: string, corps: unknown, entetes: Record<string, string> = { "x-api-key": JETON }) =>
  sansSessions.request(
    route,
    { method: "PUT", headers: { "content-type": "application/json", ...entetes }, body: JSON.stringify(corps) },
    liaisons,
  );

describe("les trois objets se servent tels qu'ils ont été rangés", () => {
  it("rend l'aperçu : la liste et les classements, en un seul objet", async () => {
    // Un seul objet pour les deux, parce que le Catalogue les demande toujours ensemble. Deux
    // objets voudraient dire deux écritures, donc une fenêtre de plus, pour rien.
    const reponse = await lire(sansSessions, "/vue/apercu", { "x-api-key": JETON });
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual(APERCU);
    expect(medias.demandes).toEqual([cleVue(BIBLIOTHEQUE, "apercu.json")]);
  });

  it("rend la vue d'un document, par son empreinte", async () => {
    const reponse = await lire(sansSessions, `/vue/document/${EMPREINTE}`, { "x-api-key": JETON });
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual(VUE);
    expect(medias.demandes).toEqual([cleVueDeDocument(BIBLIOTHEQUE, EMPREINTE)]);
  });

  it("rend ses passages par une seconde route : deux objets, deux routes", async () => {
    const reponse = await lire(sansSessions, `/vue/document/${EMPREINTE}/passages`, { "x-api-key": JETON });
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual(PASSAGES);
    expect(medias.demandes).toEqual([clePassagesDeDocument(BIBLIOTHEQUE, EMPREINTE)]);
  });

  it("rend 404 pour un document qu'on n'a pas rangé — un dépôt vide, pas une panne", async () => {
    const autre = "b4".repeat(32);
    expect((await lire(sansSessions, `/vue/document/${autre}`, { "x-api-key": JETON })).status).toBe(404);
  });
});

describe("l'empreinte reçue ne devient jamais un chemin", () => {
  it("refuse ce qui n'est pas une empreinte, sans toucher au compartiment", async () => {
    for (const faux of ["x", "A3".repeat(32), "a3".repeat(31), `${EMPREINTE}0`]) {
      const reponse = await lire(sansSessions, `/vue/document/${faux}`, { "x-api-key": JETON });
      expect(reponse.status, `« ${faux.slice(0, 16)} »`).toBe(400);
      const passages = await lire(sansSessions, `/vue/document/${faux}/passages`, { "x-api-key": JETON });
      expect(passages.status, `« ${faux.slice(0, 16)} » (passages)`).toBe(400);
    }
    expect(medias.demandes).toEqual([]);
  });

  it("refuse aussi à l'écriture, avant de ranger quoi que ce soit", async () => {
    expect((await ranger("/vue/document/pas-une-empreinte", VUE)).status).toBe(400);
    expect(medias.rangees).toEqual([]);
  });
});

describe("les vues sont derrière la porte de la bascule", () => {
  it("sans sessions exigées : le jeton ouvre, une session non", async () => {
    const cookie = await unTemoin("lecture");
    expect((await lire(sansSessions, "/vue/apercu", { "x-api-key": JETON })).status).toBe(200);
    expect((await lire(sansSessions, "/vue/apercu", { cookie })).status).toBe(401);
  });

  it("avec sessions exigées : la session ouvre, le jeton non", async () => {
    const cookie = await unTemoin("lecture");
    expect((await lire(avecSessions, "/vue/apercu", { cookie })).status).toBe(200);
    expect((await lire(avecSessions, "/vue/apercu", { "x-api-key": JETON })).status).toBe(401);
  });

  it("garde les trois routes de lecture sous la même porte", async () => {
    const cookie = await unTemoin("lecture");
    for (const route of ["/vue/apercu", `/vue/document/${EMPREINTE}`, `/vue/document/${EMPREINTE}/passages`]) {
      expect((await lire(avecSessions, route, { "x-api-key": JETON })).status, route).toBe(401);
      expect((await lire(avecSessions, route, { cookie })).status, route).toBe(200);
    }
  });

  it("refuse une session sans droit de lecture, et ne touche pas au compartiment", async () => {
    const cookie = await unTemoin("aucun");
    expect((await lire(avecSessions, "/vue/apercu", { cookie })).status).toBe(401);
    expect(medias.demandes).toEqual([]);
  });

  it("refuse d'ouvrir sans compartiment configuré", async () => {
    delete liaisons["MEDIAS"];
    expect((await lire(sansSessions, "/vue/apercu", { "x-api-key": JETON })).status).toBe(503);
  });
});

describe("les vues se rangent au moment où une version s'active", () => {
  const vide = () => {
    medias = compartiment({});
    liaisons["MEDIAS"] = medias.liaison;
  };

  it("range les trois objets, et ils se relisent aussitôt", async () => {
    vide();
    expect((await ranger(`/vue/document/${EMPREINTE}/passages`, PASSAGES)).status).toBe(200);
    expect((await ranger(`/vue/document/${EMPREINTE}`, VUE)).status).toBe(200);
    expect((await ranger("/vue/apercu", APERCU)).status).toBe(200);

    expect(medias.rangees.map((une) => une.cle)).toEqual([
      clePassagesDeDocument(BIBLIOTHEQUE, EMPREINTE),
      cleVueDeDocument(BIBLIOTHEQUE, EMPREINTE),
      cleVue(BIBLIOTHEQUE, "apercu.json"),
    ]);
    expect(await (await lire(sansSessions, "/vue/apercu", { "x-api-key": JETON })).json()).toEqual(APERCU);
  });

  it("n'accepte que le jeton de service : c'est un appel de machine à machine", async () => {
    vide();
    const cookie = await unTemoin("lecture");
    expect((await ranger("/vue/apercu", APERCU, { cookie })).status).toBe(401);
    expect((await ranger("/vue/apercu", APERCU, {})).status).toBe(401);
    expect(medias.rangees).toEqual([]);
  });

  it("refuse un aperçu qui ne tient pas son contrat, **avant** de le ranger", async () => {
    // Ranger un objet qu'on ne saurait pas relire reporterait la panne chez le lecteur, le jour
    // où il ouvre la bibliothèque. Mieux vaut refuser maintenant, à qui peut corriger.
    vide();
    const refuse = await ranger("/vue/apercu", { documents: [{ empreinte: "pas une empreinte" }] });
    expect(refuse.status).toBe(400);
    const corps = (await refuse.json()) as { ecarts: string[] };
    expect(corps.ecarts.length).toBeGreaterThan(0);
    expect(medias.rangees).toEqual([]);
  });

  it("refuse une vue et des passages mal formés", async () => {
    vide();
    expect((await ranger(`/vue/document/${EMPREINTE}`, { id: "non", nom: "" })).status).toBe(400);
    expect((await ranger(`/vue/document/${EMPREINTE}/passages`, [{ ...PASSAGES[0], rang: 5 }])).status).toBe(400);
    expect(medias.rangees).toEqual([]);
  });

  it("refuse un corps illisible", async () => {
    vide();
    const reponse = await sansSessions.request(
      "/vue/apercu",
      { method: "PUT", headers: { "content-type": "application/json", "x-api-key": JETON }, body: "{pas du json" },
      liaisons,
    );
    expect(reponse.status).toBe(400);
  });

  it("refuse d'ouvrir si le compartiment ne sait pas écrire", async () => {
    liaisons["MEDIAS"] = { get: medias.liaison.get };
    expect((await ranger("/vue/apercu", APERCU)).status).toBe(503);
  });
});
