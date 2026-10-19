import { PassagesDuDocument, VueBibliotheque } from "@lienotheque/contrats";
import { describe, expect, it } from "vitest";
import { publierLaVue } from "../src/publier.js";

/** Publier la vue au moment où une version s'active (étape 6 d'E5, le geste qui manquait).
 *
 *  La route existait et personne ne l'appelait — le même écart entre capacité et pratique que
 *  `signer`, qui n'avait aucun appelant avant l'étape 5. Ce module le ferme.
 *
 *  Deux objets, donc **deux écritures, et aucune atomicité possible**. C'est le point délicat de
 *  ce module, et il est éprouvé : quand la seconde échoue, la commande dit exactement quelle
 *  moitié a été posée, plutôt que de laisser croire que rien ou que tout a été fait. */

const SERVICE = "http://essai.invalide";
const JETON = "jeton d'essai";

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

/** Un service simulé : il note les appels et rend ce qu'on lui dit de rendre. */
const service = (statuts: Record<string, number> = {}) => {
  const appels: { chemin: string; methode: string; jeton: string | null; corps: string }[] = [];
  const appeler = (async (adresse: string | URL, options: RequestInit = {}) => {
    const chemin = String(adresse).slice(SERVICE.length);
    const entetes = new Headers(options.headers);
    appels.push({
      chemin,
      methode: options.method ?? "GET",
      jeton: entetes.get("x-api-key"),
      corps: typeof options.body === "string" ? options.body : "",
    });
    return new Response(JSON.stringify({ rangee: true }), { status: statuts[chemin] ?? 200 });
  }) as unknown as typeof fetch;
  return { appels, appeler };
};

describe("la vue se publie en deux écritures, dans un ordre choisi", () => {
  it("pose les passages d'abord, la vue ensuite", async () => {
    // L'ordre n'est pas indifférent. La vue est ce que l'application exige — son absence vaut
    // « dépôt vide ». Des passages en avance ne servent à personne tant que la vue ne les cite
    // pas ; une vue en avance, elle, citerait des passages qui ne sont pas encore là.
    const simule = service();
    const fait = await publierLaVue(SERVICE, JETON, { vue: VUE, passages: PASSAGES }, simule.appeler);

    expect(fait.faite).toBe(true);
    expect(simule.appels.map((un) => un.chemin)).toEqual(["/vue/passages", "/vue"]);
    expect(simule.appels.every((un) => un.methode === "PUT")).toBe(true);
  });

  it("présente le jeton de service, et rien d'autre", async () => {
    // Appel de machine à machine : c'est l'usage du jeton, et il n'y a aucune session ici.
    const simule = service();
    await publierLaVue(SERVICE, JETON, { vue: VUE, passages: PASSAGES }, simule.appeler);
    expect(simule.appels.every((un) => un.jeton === JETON)).toBe(true);
  });

  it("envoie la vue et les passages tels que leurs contrats les rendent", async () => {
    const simule = service();
    await publierLaVue(SERVICE, JETON, { vue: VUE, passages: PASSAGES }, simule.appeler);

    const envoyes = new Map(simule.appels.map((un) => [un.chemin, JSON.parse(un.corps)]));
    expect(envoyes.get("/vue")).toEqual(VUE);
    expect(envoyes.get("/vue/passages")).toEqual(PASSAGES);
  });

  it("compte ce qui a été posé, pour qu'un journal de sortie le dise", async () => {
    const simule = service();
    const fait = await publierLaVue(SERVICE, JETON, { vue: VUE, passages: PASSAGES }, simule.appeler);
    if (!fait.faite) throw new Error(fait.raison);
    expect(fait.pages).toBe(1);
    expect(fait.passages).toBe(1);
  });

  it("supporte une adresse de service terminée par une barre oblique", async () => {
    const simule = service();
    const fait = await publierLaVue(`${SERVICE}/`, JETON, { vue: VUE, passages: PASSAGES }, simule.appeler);
    expect(fait.faite).toBe(true);
    expect(simule.appels[0]?.chemin).toBe("/vue/passages");
  });
});

describe("quand une moitié seulement est posée, la commande le dit", () => {
  it("n'envoie pas la vue si les passages ont été refusés", async () => {
    // Rien de posé : c'est le cas propre, et il faut qu'il reste propre.
    const simule = service({ "/vue/passages": 400 });
    const fait = await publierLaVue(SERVICE, JETON, { vue: VUE, passages: PASSAGES }, simule.appeler);

    expect(fait.faite).toBe(false);
    if (!fait.faite) {
      expect(fait.raison).toContain("passages");
      expect(fait.raison).toContain("400");
      // Et il dit qu'aucune moitié n'a été posée : c'est l'information qui décide de la suite.
      expect(fait.raison).toContain("Rien n'a été posé");
    }
    expect(simule.appels.map((un) => un.chemin)).toEqual(["/vue/passages"]);
  });

  it("dit quelle moitié a été posée quand la vue est refusée après les passages", async () => {
    // Le cas pénible, et le seul qui laisse la bibliothèque en ligne dans un état mêlé. On ne
    // peut pas l'empêcher sans atomicité ; on peut refuser de le taire.
    const simule = service({ "/vue": 503 });
    const fait = await publierLaVue(SERVICE, JETON, { vue: VUE, passages: PASSAGES }, simule.appeler);

    expect(fait.faite).toBe(false);
    if (!fait.faite) {
      expect(fait.raison).toContain("vue");
      expect(fait.raison).toContain("503");
      expect(fait.raison).toContain("passages ont été posés");
      // Et il dit quoi faire : relancer. C'est idempotent, les objets sont remplacés.
      expect(fait.raison).toContain("relancer");
    }
    expect(simule.appels.map((un) => un.chemin)).toEqual(["/vue/passages", "/vue"]);
  });

  it("rend une raison lisible quand le réseau tombe", async () => {
    const appeler = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const fait = await publierLaVue(SERVICE, JETON, { vue: VUE, passages: PASSAGES }, appeler);
    expect(fait.faite).toBe(false);
    if (!fait.faite) expect(fait.raison).toContain("fetch failed");
  });

  it("refuse une adresse qui n'en est pas une, sans rien appeler", async () => {
    const simule = service();
    for (const adresse of ["", "   ", "pas une adresse"]) {
      const fait = await publierLaVue(adresse, JETON, { vue: VUE, passages: PASSAGES }, simule.appeler);
      expect(fait.faite, `« ${adresse} »`).toBe(false);
    }
    expect(simule.appels).toEqual([]);
  });

  it("refuse un jeton vide, sans rien appeler", async () => {
    // Un appel sans jeton serait refusé par le service de toute façon ; le refuser ici évite
    // d'envoyer une vue entière pour s'entendre dire non.
    const simule = service();
    const fait = await publierLaVue(SERVICE, "", { vue: VUE, passages: PASSAGES }, simule.appeler);
    expect(fait.faite).toBe(false);
    if (!fait.faite) expect(fait.raison).toContain("jeton");
    expect(simule.appels).toEqual([]);
  });

  it("ne cite jamais le jeton dans ce qu'il rend", async () => {
    // Une raison d'échec finit dans un journal de sortie, qui finit dans un rapport.
    const simule = service({ "/vue/passages": 401 });
    const fait = await publierLaVue(SERVICE, JETON, { vue: VUE, passages: PASSAGES }, simule.appeler);
    expect(fait.faite).toBe(false);
    if (!fait.faite) expect(fait.raison).not.toContain(JETON);
  });
});
