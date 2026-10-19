import { ApercuEnLigne, PassagesDuDocument, VueBibliotheque, type ApercuDocument } from "@lienotheque/contrats";
import { describe, expect, it } from "vitest";
import { publierUnDocument } from "../src/publier.js";

/** Publier un document au moment où sa version s'active (scénario B).
 *
 *  La route existait et personne ne l'appelait — le même écart entre capacité et pratique que
 *  `signer`, qui n'avait aucun appelant avant l'étape 5. Ce module le ferme.
 *
 *  Trois objets, donc **trois écritures, et aucune atomicité possible**. C'est le point délicat,
 *  et il est éprouvé : chaque échec dit ce qui a été posé avant lui, plutôt que de laisser croire
 *  que rien ou que tout a été fait.
 *
 *  Et une propriété qui compte autant : **republier ne dédouble pas**. L'entrée du document
 *  remplace la précédente, les autres documents restent. C'est ce qui rend la commande rejouable,
 *  et donc ce qui rend « relancer suffit » vrai. */

const SERVICE = "http://essai.invalide";
const JETON = "jeton d'essai";
const EMPREINTE = "a3".repeat(32);
const AUTRE = "b4".repeat(32);

const VUE = VueBibliotheque.parse({
  id: "01932f4e-7a1b-7c3d-8e5f-0123456789ab",
  nom: "Essai",
  mots: {
    element: { un: "élément", plusieurs: "éléments" },
    piste: { un: "piste", plusieurs: "pistes" },
    page: { un: "feuillet", plusieurs: "feuillets" },
  },
  compteurs: [{ nombre: 1, mot: "document" }],
  pages: [{ index: 1, numero: 7, elements: [], texte: [] }],
});

const PASSAGES = PassagesDuDocument.parse([
  { rang: 0, page: 1, pageImprimee: 7, texte: "un passage", source: "couche_texte" },
]);

const ENTREE: ApercuDocument = {
  empreinte: EMPREINTE,
  version: "01932f4e-7a1b-7c3d-8e5f-00000000c001",
  activeeLe: 1_760_000_000,
  nom: "Un document",
  compteurs: [{ nombre: 1, mot: "document" }],
  aVerifier: 0,
};

const DEJA_LA: ApercuDocument = {
  empreinte: AUTRE,
  version: "01932f4e-7a1b-7c3d-8e5f-00000000c002",
  activeeLe: 1_759_000_000,
  nom: "Un autre",
  compteurs: [],
  aVerifier: 0,
};

const CONTENU = { entree: ENTREE, vue: VUE, passages: PASSAGES };
const CHEMIN = `/vue/document/${EMPREINTE}`;

/** Un service simulé : il note les appels, rend les statuts qu'on lui dicte, et sert l'aperçu
 *  qu'on lui donne. */
const service = (options: { statuts?: Record<string, number>; apercu?: unknown } = {}) => {
  const appels: { chemin: string; methode: string; jeton: string | null; corps: string }[] = [];
  const appeler = (async (adresse: string | URL, init: RequestInit = {}) => {
    const chemin = String(adresse).slice(SERVICE.length);
    const methode = init.method ?? "GET";
    const entetes = new Headers(init.headers);
    appels.push({
      chemin,
      methode,
      jeton: entetes.get("x-api-key"),
      corps: typeof init.body === "string" ? init.body : "",
    });

    const statut = options.statuts?.[`${methode} ${chemin}`] ?? options.statuts?.[chemin];
    if (statut !== undefined && statut !== 200) return new Response("", { status: statut });

    if (methode === "GET" && chemin === "/vue/apercu") {
      if (options.apercu === undefined) return new Response("", { status: 404 });
      return new Response(JSON.stringify(options.apercu), { status: 200 });
    }
    return new Response(JSON.stringify({ rangee: true }), { status: 200 });
  }) as unknown as typeof fetch;
  return { appels, appeler };
};

const corpsEnvoye = (appels: { chemin: string; methode: string; corps: string }[], chemin: string): unknown =>
  JSON.parse(appels.find((un) => un.chemin === chemin && un.methode === "PUT")?.corps ?? "null");

describe("un document se publie en trois écritures, dans un ordre choisi", () => {
  it("pose les passages, puis la vue, puis l'aperçu", async () => {
    // L'objet qui référence les autres va en dernier : un document annoncé à l'aperçu mais pas
    // encore rangé donnerait un 404 à qui le choisirait dans le Catalogue.
    const simule = service();
    const fait = await publierUnDocument(SERVICE, JETON, CONTENU, simule.appeler);

    expect(fait.faite, fait.faite ? "" : fait.raison).toBe(true);
    expect(simule.appels.map((un) => `${un.methode} ${un.chemin}`)).toEqual([
      `PUT ${CHEMIN}/passages`,
      `PUT ${CHEMIN}`,
      "GET /vue/apercu",
      "PUT /vue/apercu",
    ]);
  });

  it("présente le jeton de service sur chaque appel, lecture comprise", async () => {
    const simule = service();
    await publierUnDocument(SERVICE, JETON, CONTENU, simule.appeler);
    expect(simule.appels.every((un) => un.jeton === JETON)).toBe(true);
  });

  it("envoie la vue et les passages tels que leurs contrats les rendent", async () => {
    const simule = service();
    await publierUnDocument(SERVICE, JETON, CONTENU, simule.appeler);
    expect(corpsEnvoye(simule.appels, CHEMIN)).toEqual(VUE);
    expect(corpsEnvoye(simule.appels, `${CHEMIN}/passages`)).toEqual(PASSAGES);
  });

  it("crée l'aperçu quand il n'existe pas encore", async () => {
    const simule = service();
    const fait = await publierUnDocument(SERVICE, JETON, CONTENU, simule.appeler);
    if (!fait.faite) throw new Error(fait.raison);

    expect(ApercuEnLigne.parse(corpsEnvoye(simule.appels, "/vue/apercu"))).toEqual({
      documents: [ENTREE],
      classements: [],
    });
    expect(fait.documents).toBe(1);
  });

  it("garde les autres documents de l'aperçu", async () => {
    const simule = service({ apercu: { documents: [DEJA_LA], classements: [] } });
    const fait = await publierUnDocument(SERVICE, JETON, CONTENU, simule.appeler);
    if (!fait.faite) throw new Error(fait.raison);

    const envoye = ApercuEnLigne.parse(corpsEnvoye(simule.appels, "/vue/apercu"));
    expect(envoye.documents.map((un) => un.empreinte)).toEqual([AUTRE, EMPREINTE]);
    expect(fait.documents).toBe(2);
  });

  it("remplace son entrée au lieu de la dédoubler : republier est rejouable", async () => {
    // C'est ce qui rend « relancer suffit » vrai dans tous les messages d'échec.
    const ancienne = { ...ENTREE, nom: "Un nom d'avant", activeeLe: 1_000_000 };
    const simule = service({ apercu: { documents: [DEJA_LA, ancienne], classements: [] } });
    const fait = await publierUnDocument(SERVICE, JETON, CONTENU, simule.appeler);
    if (!fait.faite) throw new Error(fait.raison);

    const envoye = ApercuEnLigne.parse(corpsEnvoye(simule.appels, "/vue/apercu"));
    expect(envoye.documents).toHaveLength(2);
    expect(envoye.documents.find((un) => un.empreinte === EMPREINTE)?.nom).toBe("Un document");
  });

  it("porte le classement quand il y en a un, et le retire quand il n'y en a plus", async () => {
    const classement = {
      empreinte: EMPREINTE,
      schema: "un_schema",
      schemaVersion: 1,
      axes: { axe_un: { type: "reference" as const, valeurs: ["une_valeur"] } },
      origine: "manuel" as const,
    };

    const avec = service();
    await publierUnDocument(SERVICE, JETON, { ...CONTENU, classement }, avec.appeler);
    expect(ApercuEnLigne.parse(corpsEnvoye(avec.appels, "/vue/apercu")).classements).toEqual([classement]);

    // Republié sans classement : l'ancien ne doit pas survivre, sans quoi un document déclassé
    // resterait rangé en ligne.
    const sans = service({ apercu: { documents: [ENTREE], classements: [classement] } });
    await publierUnDocument(SERVICE, JETON, CONTENU, sans.appeler);
    expect(ApercuEnLigne.parse(corpsEnvoye(sans.appels, "/vue/apercu")).classements).toEqual([]);
  });

  it("supporte une adresse de service terminée par une barre oblique", async () => {
    const simule = service();
    const fait = await publierUnDocument(`${SERVICE}/`, JETON, CONTENU, simule.appeler);
    expect(fait.faite).toBe(true);
    expect(simule.appels[0]?.chemin).toBe(`${CHEMIN}/passages`);
  });
});

describe("chaque échec dit ce qui a été posé avant lui", () => {
  it("n'envoie rien d'autre si les passages sont refusés", async () => {
    const simule = service({ statuts: { [`${CHEMIN}/passages`]: 400 } });
    const fait = await publierUnDocument(SERVICE, JETON, CONTENU, simule.appeler);

    expect(fait.faite).toBe(false);
    if (!fait.faite) {
      expect(fait.raison).toContain("passages");
      expect(fait.raison).toContain("Rien n'a été posé");
    }
    expect(simule.appels).toHaveLength(1);
  });

  it("dit que les passages sont là quand la vue est refusée", async () => {
    const simule = service({ statuts: { [`PUT ${CHEMIN}`]: 503 } });
    const fait = await publierUnDocument(SERVICE, JETON, CONTENU, simule.appeler);

    expect(fait.faite).toBe(false);
    if (!fait.faite) {
      expect(fait.raison).toContain("503");
      expect(fait.raison).toContain("à demi publié");
      expect(fait.raison).toContain("Relancer");
    }
    expect(simule.appels).toHaveLength(2);
  });

  it("dit que le document est là mais pas annoncé quand l'aperçu est refusé", async () => {
    const simule = service({ statuts: { "PUT /vue/apercu": 503 } });
    const fait = await publierUnDocument(SERVICE, JETON, CONTENU, simule.appeler);

    expect(fait.faite).toBe(false);
    if (!fait.faite) {
      expect(fait.raison).toContain("Catalogue ne l'annonce pas");
      expect(fait.raison).toContain("Relancer");
    }
  });

  it("n'écrase pas l'aperçu quand il n'a pas pu être lu", async () => {
    // Écrire un aperçu qu'on n'a pas pu lire perdrait tous les autres documents. Mieux vaut
    // s'arrêter et le dire.
    const simule = service({ statuts: { "GET /vue/apercu": 503 } });
    const fait = await publierUnDocument(SERVICE, JETON, CONTENU, simule.appeler);

    expect(fait.faite).toBe(false);
    if (!fait.faite) expect(fait.raison).toContain("n'a pas pu être lu");
    expect(simule.appels.some((un) => un.methode === "PUT" && un.chemin === "/vue/apercu")).toBe(false);
  });

  it("refuse un aperçu servi qui ne tient pas son contrat, sans l'écraser", async () => {
    const simule = service({ apercu: { documents: [{ empreinte: "pas une empreinte" }] } });
    const fait = await publierUnDocument(SERVICE, JETON, CONTENU, simule.appeler);
    expect(fait.faite).toBe(false);
    expect(simule.appels.some((un) => un.methode === "PUT" && un.chemin === "/vue/apercu")).toBe(false);
  });

  it("rend une raison lisible quand le réseau tombe", async () => {
    const appeler = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const fait = await publierUnDocument(SERVICE, JETON, CONTENU, appeler);
    expect(fait.faite).toBe(false);
    if (!fait.faite) expect(fait.raison).toContain("fetch failed");
  });

  it("refuse une adresse ou un jeton inutilisables, sans rien appeler", async () => {
    const simule = service();
    for (const adresse of ["", "   ", "pas une adresse"]) {
      const fait = await publierUnDocument(adresse, JETON, CONTENU, simule.appeler);
      expect(fait.faite, `« ${adresse} »`).toBe(false);
    }
    const sansJeton = await publierUnDocument(SERVICE, "", CONTENU, simule.appeler);
    expect(sansJeton.faite).toBe(false);
    if (!sansJeton.faite) expect(sansJeton.raison).toContain("jeton");
    expect(simule.appels).toEqual([]);
  });

  it("ne cite jamais le jeton dans ce qu'il rend", async () => {
    // Une raison d'échec finit dans un journal de sortie, qui finit dans un rapport.
    const simule = service({ statuts: { [`${CHEMIN}/passages`]: 401 } });
    const fait = await publierUnDocument(SERVICE, JETON, CONTENU, simule.appeler);
    expect(fait.faite).toBe(false);
    if (!fait.faite) expect(fait.raison).not.toContain(JETON);
  });
});
