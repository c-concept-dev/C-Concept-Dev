import { chercher } from "@lienotheque/noyau";
import { ApercuEnLigne, PassagesDuDocument, VueBibliotheque, type Passage } from "@lienotheque/contrats";
import { describe, expect, it } from "vitest";
import { PasEnLigne, pontEnLigne } from "../src/pont/ligne.js";

/** Le pont de la version en ligne (étape 6 d'E5).
 *
 *  Ce qui est éprouvé ici tient en une phrase : **la recherche en ligne fait tourner le même
 *  `chercher` sur la même vue.** Pas une recherche qui ressemble à celle du bureau — la même
 *  fonction, sur les mêmes octets, donc les mêmes résultats par construction.
 *
 *  Le reste éprouve les refus. Les quatre fonctions que le découpage par document n'autorise pas
 *  encore **lèvent une erreur nommée** plutôt que de rendre une liste vide : une liste vide se
 *  confond avec une bibliothèque vide, et un écran qui n'affiche rien sans dire pourquoi coûte
 *  des heures. */

const BASE = "http://essai.invalide";
const EMPREINTE = "a3".repeat(32);
const AUTRE = "b4".repeat(32);
const CHEMIN_VUE = `/vue/document/${EMPREINTE}`;
const CHEMIN_PASSAGES = `/vue/document/${EMPREINTE}/passages`;
const CHEMIN_RECHERCHE = "/recherche-bibliotheque";

const VUE = VueBibliotheque.parse({
  id: "01932f4e-7a1b-7c3d-8e5f-0123456789ab",
  nom: "Essai",
  // Les trois mots que le contrat exige, et qui viennent du schéma de la bibliothèque (CLA-01).
  mots: {
    element: { un: "élément", plusieurs: "éléments" },
    piste: { un: "piste", plusieurs: "pistes" },
    page: { un: "feuillet", plusieurs: "feuillets" },
  },
  compteurs: [{ nombre: 2, mot: "documents" }],
  pages: [
    {
      index: 1,
      numero: 12,
      elements: [{ ancreId: "01932f4e-7a1b-7c3d-8e5f-00000000a001", numero: "1", page: 12 }],
      texte: [],
    },
    { index: 2, elements: [], texte: [] },
  ],
});

const PASSAGES: readonly Passage[] = [
  { rang: 0, page: 12, pageImprimee: 12, texte: "la mesure et la relecture", source: "couche_texte", lisible: true },
  { rang: 1, page: 13, texte: "une relecture ciblée", source: "couche_texte", lisible: true },
];

const APERCU = ApercuEnLigne.parse({
  documents: [
    {
      empreinte: EMPREINTE,
      version: "01932f4e-7a1b-7c3d-8e5f-00000000c001",
      activeeLe: 1_760_000_000,
      nom: "Un document",
    },
    {
      empreinte: AUTRE,
      version: "01932f4e-7a1b-7c3d-8e5f-00000000c002",
      activeeLe: 1_760_000_001,
      nom: "Un autre",
    },
  ],
  classements: [
    {
      empreinte: EMPREINTE,
      schema: "un_schema",
      schemaVersion: 1,
      axes: { axe_un: { type: "reference", valeurs: ["une_valeur"] } },
      origine: "manuel",
    },
  ],
});

/** Un service simulé : il note ce qu'on lui demande, et rend ce qu'on lui a dit de rendre. */
const service = (reponses: Record<string, { statut?: number; corps?: unknown }>) => {
  const appels: { chemin: string; methode: string; temoin: string | undefined }[] = [];
  const appeler = (async (adresse: string | URL, options: RequestInit = {}) => {
    const chemin = String(adresse).slice(BASE.length);
    appels.push({
      chemin,
      methode: options.method ?? "GET",
      temoin: options.credentials === "include" ? "inclus" : undefined,
    });
    const prevue = reponses[chemin];
    if (prevue === undefined) return new Response("", { status: 500 });
    const statut = prevue.statut ?? 200;
    if (statut === 404) return new Response("", { status: 404 });
    return new Response(JSON.stringify(prevue.corps ?? null), {
      status: statut,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { appels, appeler };
};

const pont = (reponses: Record<string, { statut?: number; corps?: unknown }>) => {
  const simule = service(reponses);
  return { pont: pontEnLigne({ base: BASE, appeler: simule.appeler }), appels: simule.appels };
};

describe("la vue et les passages arrivent du service, séparément", () => {
  it("rend la vue telle qu'elle a été rangée, passée par son contrat", async () => {
    const { pont: p, appels } = pont({ [CHEMIN_VUE]: { corps: VUE } });
    const vue = await p.vueDeDocument("peu importe", EMPREINTE);
    expect(vue).toEqual(VUE);
    expect(appels).toEqual([{ chemin: CHEMIN_VUE, methode: "GET", temoin: "inclus" }]);
  });

  it("rend les passages par une seconde route : deux objets, deux routes", async () => {
    // « Recopier les passages dans la vue donnerait deux endroits pour un même fait. » La
    // séparation du contrat vaut aussi sur le réseau.
    const { pont: p, appels } = pont({ [CHEMIN_PASSAGES]: { corps: PASSAGES } });
    // Comparé à ce que le **contrat** fait de ces octets, et non au fixture brut : il applique
    // ses défauts — « lisible » en est un —, et c'est lui qui dit ce qu'un passage est.
    expect(await p.passagesDeDocument("x", EMPREINTE)).toEqual(PassagesDuDocument.parse(PASSAGES));
    expect(appels[0]?.chemin).toBe(CHEMIN_PASSAGES);
  });

  it("lit un 404 comme un dépôt vide, et non comme une panne", async () => {
    const { pont: p } = pont({ [CHEMIN_VUE]: { statut: 404 }, [CHEMIN_PASSAGES]: { statut: 404 } });
    expect(await p.vueDeDocument("x", EMPREINTE)).toBeUndefined();
    expect(await p.passagesDeDocument("x", EMPREINTE)).toEqual([]);
  });

  it("lève sur un service en panne : ce n'est pas une bibliothèque vide", async () => {
    const { pont: p } = pont({ [CHEMIN_VUE]: { statut: 503 } });
    await expect(p.vueDeDocument("x", EMPREINTE)).rejects.toThrow("503");
  });

  it("refuse une vue qui ne tient pas son contrat", async () => {
    const { pont: p } = pont({ [CHEMIN_VUE]: { corps: { id: "pas un identifiant", nom: "" } } });
    await expect(p.vueDeDocument("x", EMPREINTE)).rejects.toThrow();
  });

  it("refuse des passages dont les rangs ne se suivent pas", async () => {
    // Un trou dans les rangs est exactement ce qu'un transport perd — un objet tronqué, une
    // écriture interrompue. Le contrat de liste le voit ; un contrat passage par passage non.
    const troues = [PASSAGES[0]!, { ...PASSAGES[1]!, rang: 7 }];
    const { pont: p } = pont({ [CHEMIN_PASSAGES]: { corps: troues } });
    await expect(p.passagesDeDocument("x", EMPREINTE)).rejects.toThrow();
  });

  it("refuse des passages qui ne sont pas une liste", async () => {
    const { pont: p } = pont({ [CHEMIN_PASSAGES]: { corps: { pas: "une liste" } } });
    await expect(p.passagesDeDocument("x", EMPREINTE)).rejects.toThrow("liste");
  });

  it("envoie le témoin, et aucun jeton (LIV-04)", async () => {
    const { pont: p, appels } = pont({ [CHEMIN_VUE]: { corps: VUE } });
    await p.vueDeDocument("x", EMPREINTE);
    // La session vit dans un témoin HttpOnly qu'aucun script ne lit — pas même celui-ci.
    expect(appels[0]?.temoin).toBe("inclus");
  });
});

describe("la recherche en ligne est la même recherche", () => {
  it("cherche dans toute la bibliothèque par le port commun", async () => {
    const resultat = {
      empreinte: EMPREINTE,
      version: "01932f4e-7a1b-7c3d-8e5f-00000000c001",
      titre: "Un document",
      passage: PASSAGES[0],
    };
    const { pont: p, appels } = pont({ [CHEMIN_RECHERCHE]: { corps: [resultat] } });

    expect(await p.rechercherBibliotheque("x", "mesure", 20)).toEqual([resultat]);
    expect(appels[0]).toEqual({ chemin: CHEMIN_RECHERCHE, methode: "POST", temoin: "inclus" });
  });

  it("rend exactement ce que le bureau rendrait, sur les mêmes octets", async () => {
    // Le cœur de l'étape. Le pont ne cherche pas : il apporte la vue et les passages, et
    // `chercher` fait le reste. Les résultats sont donc identiques par **construction**.
    const { pont: p } = pont({ [CHEMIN_VUE]: { corps: VUE }, [CHEMIN_PASSAGES]: { corps: PASSAGES } });

    const vue = await p.vueDeDocument("x", EMPREINTE);
    const passages = await p.passagesDeDocument("x", EMPREINTE);
    expect(vue).toBeDefined();
    if (vue === undefined) return;

    for (const requete of ["relecture", "la mesure", "relecture ciblée", "introuvable", ""]) {
      const enLigne = chercher(vue, requete, { passages });
      const auBureau = chercher(VUE, requete, { passages: PASSAGES });
      expect(enLigne, `« ${requete} »`).toEqual(auBureau);
    }
  });

  it("trouve la suite entière avant le mot isolé, en ligne comme au bureau", async () => {
    // La correction de classement du 17 octobre vaut aussi en ligne, sans rien de nouveau :
    // c'est la même fonction.
    const { pont: p } = pont({ [CHEMIN_VUE]: { corps: VUE }, [CHEMIN_PASSAGES]: { corps: PASSAGES } });
    const vue = await p.vueDeDocument("x", EMPREINTE);
    const passages = await p.passagesDeDocument("x", EMPREINTE);
    if (vue === undefined) throw new Error("la vue manque");

    const groupes = chercher(vue, "relecture ciblée", { passages });
    expect(groupes).toEqual(chercher(VUE, "relecture ciblée", { passages: PASSAGES }));
  });
});

describe("l'image d'une page passe par un laissez-passer signé", () => {
  it("demande le laissez-passer et compose l'adresse", async () => {
    const { pont: p, appels } = pont({ "/laissez": { corps: { laissez: "charge.signature", secondes: 180 } } });
    const adresse = await p.imageDePage("x", "v3", "pages/page-0001.webp");

    expect(adresse).toBe(`${BASE}/fichier/charge.signature`);
    expect(appels[0]).toEqual({ chemin: "/laissez", methode: "POST", temoin: "inclus" });
  });

  it("ne rend rien si le service ne signe pas", async () => {
    const { pont: p } = pont({ "/laissez": { corps: { secondes: 180 } } });
    expect(await p.imageDePage("x", "v3", "pages/page-0001.webp")).toBeUndefined();
  });

  it("donne une version et un nom, jamais un chemin", async () => {
    // La règle d'objets.ts tenue depuis l'appelant : le pont n'a aucun moyen d'envoyer une clé.
    const { pont: p, appels } = pont({ "/laissez": { corps: { laissez: "a.b" } } });
    await p.imageDePage("x", "v3", "pages/page-0001.webp");
    expect(appels[0]?.chemin).toBe("/laissez");
  });
});

describe("l'aperçu porte la liste, les versions et les classements", () => {
  it("rend la liste des documents", async () => {
    const { pont: p, appels } = pont({ "/vue/apercu": { corps: APERCU } });
    expect((await p.apercuDeBibliotheque("x")).map((un) => un.nom)).toEqual(["Un document", "Un autre"]);
    expect(appels[0]?.chemin).toBe("/vue/apercu");
  });

  it("rend la version active d'un document, sans objet de plus", async () => {
    // ApercuDocument porte déjà sa version : « un aperçu décrit un état, pas un document en
    // général ». C'est ce qui fait que versionActive n'a besoin de rien d'autre.
    const { pont: p, appels } = pont({ "/vue/apercu": { corps: APERCU } });
    expect(await p.versionActive("x", EMPREINTE)).toBe("01932f4e-7a1b-7c3d-8e5f-00000000c001");
    expect(await p.versionActive("x", AUTRE)).toBe("01932f4e-7a1b-7c3d-8e5f-00000000c002");
    expect(appels.every((un) => un.chemin === "/vue/apercu")).toBe(true);
  });

  it("ne rend aucune version pour un document qu'il ne connaît pas", async () => {
    const { pont: p } = pont({ "/vue/apercu": { corps: APERCU } });
    expect(await p.versionActive("x", "c5".repeat(32))).toBeUndefined();
  });

  it("rend les classements en carte par empreinte, comme au bureau", async () => {
    const { pont: p } = pont({ "/vue/apercu": { corps: APERCU } });
    const carte = await p.classementsDeBibliotheque("x");
    expect(carte.size).toBe(1);
    expect(carte.get(EMPREINTE)?.schema).toBe("un_schema");
  });

  it("lit un aperçu absent comme une bibliothèque vide", async () => {
    // Personne n'a encore publié : c'est un état, pas une panne.
    const { pont: p } = pont({ "/vue/apercu": { statut: 404 } });
    expect(await p.apercuDeBibliotheque("x")).toEqual([]);
    expect(await p.classementsDeBibliotheque("x")).toEqual(new Map());
    expect(await p.versionActive("x", EMPREINTE)).toBeUndefined();
  });

  it("refuse un aperçu qui ne tient pas son contrat", async () => {
    const { pont: p } = pont({ "/vue/apercu": { corps: { documents: [{ empreinte: "non" }] } } });
    await expect(p.apercuDeBibliotheque("x")).rejects.toThrow();
  });
});

describe("classer ne se fait pas en ligne, et ce n'est pas un manque", () => {
  it("lève une erreur nommée qui dit pourquoi", () => {
    // Le classement vivrait à deux endroits — l'instantané et la base — d'accord seulement entre
    // deux publications. C'est la double vérité qu'on a éliminée.
    const { pont: p } = pont({});
    expect(() => p.classerDocument("x", {} as never)).toThrow(PasEnLigne);
    expect(() => p.classerDocument("x", {} as never)).toThrow("deux endroits");
  });

  it("nomme le geste, pour qu'un écran puisse le dire", () => {
    const { pont: p } = pont({});
    expect(() => p.classerDocument("x", {} as never)).toThrow("classerDocument");
  });
});
