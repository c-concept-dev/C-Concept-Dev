import { chercher } from "@lienotheque/noyau";
import { PassagesDuDocument, VueBibliotheque, type Passage } from "@lienotheque/contrats";
import { describe, expect, it } from "vitest";
import { PasEncoreEnLigne, pontEnLigne } from "../src/pont/ligne.js";

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
    const { pont: p, appels } = pont({ "/vue": { corps: VUE } });
    const vue = await p.vueDeDocument("peu importe", "peu importe");
    expect(vue).toEqual(VUE);
    expect(appels).toEqual([{ chemin: "/vue", methode: "GET", temoin: "inclus" }]);
  });

  it("rend les passages par une seconde route : deux objets, deux routes", async () => {
    // « Recopier les passages dans la vue donnerait deux endroits pour un même fait. » La
    // séparation du contrat vaut aussi sur le réseau.
    const { pont: p, appels } = pont({ "/vue/passages": { corps: PASSAGES } });
    // Comparé à ce que le **contrat** fait de ces octets, et non au fixture brut : il applique
    // ses défauts — « lisible » en est un —, et c'est lui qui dit ce qu'un passage est.
    expect(await p.passagesDeDocument("x", "y")).toEqual(PassagesDuDocument.parse(PASSAGES));
    expect(appels[0]?.chemin).toBe("/vue/passages");
  });

  it("lit un 404 comme un dépôt vide, et non comme une panne", async () => {
    const { pont: p } = pont({ "/vue": { statut: 404 }, "/vue/passages": { statut: 404 } });
    expect(await p.vueDeDocument("x", "y")).toBeUndefined();
    expect(await p.passagesDeDocument("x", "y")).toEqual([]);
  });

  it("lève sur un service en panne : ce n'est pas une bibliothèque vide", async () => {
    const { pont: p } = pont({ "/vue": { statut: 503 } });
    await expect(p.vueDeDocument("x", "y")).rejects.toThrow("503");
  });

  it("refuse une vue qui ne tient pas son contrat", async () => {
    const { pont: p } = pont({ "/vue": { corps: { id: "pas un identifiant", nom: "" } } });
    await expect(p.vueDeDocument("x", "y")).rejects.toThrow();
  });

  it("refuse des passages dont les rangs ne se suivent pas", async () => {
    // Un trou dans les rangs est exactement ce qu'un transport perd — un objet tronqué, une
    // écriture interrompue. Le contrat de liste le voit ; un contrat passage par passage non.
    const troues = [PASSAGES[0]!, { ...PASSAGES[1]!, rang: 7 }];
    const { pont: p } = pont({ "/vue/passages": { corps: troues } });
    await expect(p.passagesDeDocument("x", "y")).rejects.toThrow();
  });

  it("refuse des passages qui ne sont pas une liste", async () => {
    const { pont: p } = pont({ "/vue/passages": { corps: { pas: "une liste" } } });
    await expect(p.passagesDeDocument("x", "y")).rejects.toThrow("liste");
  });

  it("envoie le témoin, et aucun jeton (LIV-04)", async () => {
    const { pont: p, appels } = pont({ "/vue": { corps: VUE } });
    await p.vueDeDocument("x", "y");
    // La session vit dans un témoin HttpOnly qu'aucun script ne lit — pas même celui-ci.
    expect(appels[0]?.temoin).toBe("inclus");
  });
});

describe("la recherche en ligne est la même recherche", () => {
  it("rend exactement ce que le bureau rendrait, sur les mêmes octets", async () => {
    // Le cœur de l'étape. Le pont ne cherche pas : il apporte la vue et les passages, et
    // `chercher` fait le reste. Les résultats sont donc identiques par **construction**.
    const { pont: p } = pont({ "/vue": { corps: VUE }, "/vue/passages": { corps: PASSAGES } });

    const vue = await p.vueDeDocument("x", "y");
    const passages = await p.passagesDeDocument("x", "y");
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
    const { pont: p } = pont({ "/vue": { corps: VUE }, "/vue/passages": { corps: PASSAGES } });
    const vue = await p.vueDeDocument("x", "y");
    const passages = await p.passagesDeDocument("x", "y");
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

describe("ce qui n'est pas encore servi le dit, au lieu de rendre du vide", () => {
  it("lève une erreur nommée pour les quatre gestes qui attendent le découpage", async () => {
    const { pont: p } = pont({});
    for (const geste of [
      () => p.apercuDeBibliotheque("x"),
      () => p.versionActive("x", "y"),
      () => p.classementsDeBibliotheque("x"),
      () => p.classerDocument("x", {} as never),
    ]) {
      expect(geste).toThrow(PasEncoreEnLigne);
    }
  });

  it("nomme le geste dans son message, pour qu'un écran puisse le dire", () => {
    const { pont: p } = pont({});
    expect(() => p.apercuDeBibliotheque("x")).toThrow("apercuDeBibliotheque");
  });
});
