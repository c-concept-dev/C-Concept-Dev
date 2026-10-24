import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";

/** Ce que l'application fait quand c'est **le service** qui répond (E5, scénario B).
 *
 *  ## Le défaut que ces épreuves figent
 *
 *  Le 20 octobre 2026, la version en ligne était déployée, le pont écrit, la session ouverte —
 *  et ouvrir `#catalogue` montrait « Créer ma première bibliothèque » et « Choisir un dossier ».
 *  Deux gestes de bureau, impossibles dans un navigateur.
 *
 *  La cause n'était ni le pont ni l'adresse : `App.tsx` ne demandait de bibliothèque qu'à
 *  `creees`, la liste de celles que **cette session a créées**. En ligne on n'en crée aucune, la
 *  liste restait vide, et le service n'était donc **jamais appelé**. Tout tombait sur l'écran de
 *  premier lancement, qui était à la fois faux et le seul visible.
 *
 *  Trois épreuves, pour les trois choses qu'on peut être en ligne :
 *
 *  | ce que le service répond | ce que l'écran doit faire |
 *  |---|---|
 *  | un aperçu | l'avoir demandé, et ne plus proposer de créer |
 *  | 401 | conduire à la cérémonie |
 *  | 404 | dire que la bibliothèque est vide |
 */

const apercuVide = { documents: [], classements: [] };
const EMPREINTE = "a1".repeat(32);
const apercuAvecDocument = {
  documents: [
    {
      empreinte: EMPREINTE,
      version: "01932f4e-7a1b-7c3d-8e5f-00000000c001",
      activeeLe: 1_760_000_000,
      nom: "Document réellement publié",
    },
  ],
  classements: [],
};
const vuePubliee = {
  id: "01932f4e-7a1b-7c3d-8e5f-00000000d001",
  nom: "Document réellement publié",
  mots: {
    element: { un: "élément", plusieurs: "éléments" },
    piste: { un: "piste", plusieurs: "pistes" },
    page: { un: "page", plusieurs: "pages" },
  },
  compteurs: [],
  pages: [],
  douteux: [],
};

const serviceAvecUnDocument = () =>
  vi.fn(async (entree: RequestInfo | URL) => {
    const adresse = String(entree);
    if (adresse.endsWith("/vue/apercu")) return Response.json(apercuAvecDocument);
    if (adresse.endsWith(`/vue/document/${EMPREINTE}`)) return Response.json(vuePubliee);
    if (adresse.endsWith(`/vue/document/${EMPREINTE}/passages`)) return Response.json([]);
    return new Response("", { status: 404 });
  });

/** Le service, répondant selon ce qu'on lui demande. Tout ce qui n'est pas la façade — le
 *  chargement de l'instantané de développement, par exemple — répond « rien », ce qui est la
 *  vérité en ligne. */
const serviceQuiRepond = (facade: { statut: number; corps?: unknown }) =>
  vi.fn(async (entree: RequestInfo | URL) => {
    const adresse = typeof entree === "string" ? entree : entree instanceof URL ? entree.href : entree.url;
    if (adresse.includes("/vue/"))
      return new Response(facade.corps === undefined ? "" : JSON.stringify(facade.corps), {
        status: facade.statut,
        headers: { "content-type": "application/json" },
      });
    return new Response("", { status: 404 });
  });

beforeEach(() => {
  // Le drapeau de construction : « cette page parle à un service ». Sans lui, `pontDeLecture`
  // rend `undefined` et l'on éprouverait la version de bureau.
  vi.stubEnv("VITE_LIENOTHEQUE_EN_LIGNE", "1");
  globalThis.history.replaceState({}, "", "/");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("en ligne, c'est le service qui tient la bibliothèque", () => {
  it("n'annonce pas une bibliothèque vide tant que la vérification de session n'a pas répondu", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    render(<App />);

    expect(screen.getByText(/vérification de votre accès/i)).toBeTruthy();
    expect(screen.queryByText(/aucun document n.y a été publié/i)).toBeNull();
  });

  it("demande l'aperçu au service, au lieu d'attendre une bibliothèque créée ici", async () => {
    const service = serviceQuiRepond({ statut: 200, corps: apercuVide });
    vi.stubGlobal("fetch", service);

    render(<App />);

    // Le cœur du défaut : sans bibliothèque servie, cet appel n'avait jamais lieu.
    await waitFor(() =>
      expect(service.mock.calls.some(([entree]) => String(entree).includes("/vue/apercu"))).toBe(true),
    );
  });

  it("montre un document publié sans relancer son chargement à chaque rendu", async () => {
    globalThis.history.replaceState({}, "", "/#catalogue");
    const service = serviceAvecUnDocument();
    vi.stubGlobal("fetch", service);

    render(<App />);

    expect((await screen.findAllByText("Document réellement publié")).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(service.mock.calls.filter(([entree]) => String(entree).endsWith(`/vue/document/${EMPREINTE}`))).toHaveLength(1);
      expect(service.mock.calls.filter(([entree]) => String(entree).endsWith(`/vue/document/${EMPREINTE}/passages`))).toHaveLength(1);
    });
  });

  it("montre la recherche quand le document en ligne est chargé", async () => {
    globalThis.history.replaceState({}, "", "/#catalogue");
    const service = serviceAvecUnDocument();
    vi.stubGlobal("fetch", service);

    render(<App />);

    expect(await screen.findByLabelText("Rechercher dans le document ouvert")).toBeTruthy();
  });

  it("ne signe la grande page qu'au moment où le Lecteur l'ouvre", async () => {
    globalThis.history.replaceState({}, "", "/#catalogue");
    const fichiersDemandes: string[] = [];
    const appeler = vi.fn(async (entree: RequestInfo | URL, options?: RequestInit) => {
      const adresse = String(entree);
      if (adresse.endsWith("/vue/apercu")) return Response.json(apercuAvecDocument);
      if (adresse.endsWith(`/vue/document/${EMPREINTE}/passages`))
        return Response.json([{ rang: 0, page: 1, texte: "Une page lisible.", source: "couche_texte", lisible: true }]);
      if (adresse.endsWith(`/vue/document/${EMPREINTE}`))
        return Response.json({
          ...vuePubliee,
          pages: [{
            index: 1,
            image: "/donnees/pages/page-0001.webp",
            vignette: "/donnees/pages/vignette-0001.webp",
            elements: [],
          }],
        });
      if (adresse.endsWith("/laissez")) {
        const fichier = JSON.parse(String(options?.body))["fichier"] as string;
        fichiersDemandes.push(fichier);
        return Response.json({ laissez: fichier.includes("vignette") ? "vignette.signee" : "page.signee" });
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", appeler);

    render(<App />);

    expect(await screen.findByRole("img", { name: /page 1/i })).toHaveAttribute("src", expect.stringContaining("/fichier/vignette.signee"));
    expect(fichiersDemandes).toEqual(["pages/vignette-0001.webp"]);

    fireEvent.click(screen.getByRole("button", { name: /ouvrir dans le lecteur/i }));

    await waitFor(() =>
      expect(fichiersDemandes).toEqual(["pages/vignette-0001.webp", "pages/page-0001.webp"]),
    );
    expect(screen.getByRole("button", { name: /traduire en français/i })).toBeTruthy();
    expect(
      screen.getAllByRole("img", { name: /page 1/i }).some((image) => image.getAttribute("src")?.includes("/fichier/page.signee")),
    ).toBe(true);
  });

  it("conduit la racine vers le catalogue quand la bibliothèque publiée contient des documents", async () => {
    vi.stubGlobal("fetch", serviceAvecUnDocument());

    render(<App />);

    expect((await screen.findAllByText("Document réellement publié")).length).toBeGreaterThan(0);
    expect(globalThis.location.hash).toBe("#catalogue");
  });

  it("ne propose jamais les deux gestes de bureau, qui n'existent pas ici", async () => {
    vi.stubGlobal("fetch", serviceQuiRepond({ statut: 200, corps: apercuVide }));
    render(<App />);

    // « Créer » lève en ligne — l'hôte seul écrit sur le disque — et « Choisir un dossier » n'a
    // pas de disque à parcourir. Les offrir était la partie visible du défaut.
    await waitFor(() => expect(screen.queryByRole("button", { name: /première bibliothèque/i })).toBeNull());
    expect(screen.queryByRole("button", { name: /choisir un dossier/i })).toBeNull();
  });

  it("conduit à la cérémonie quand le service ne nous connaît pas", async () => {
    // Le témoin de session est `HttpOnly` : la page ne peut pas savoir seule qu'elle n'est pas
    // entrée. Elle l'apprend du refus, et ce refus n'est ni une panne ni une bibliothèque vide.
    vi.stubGlobal("fetch", serviceQuiRepond({ statut: 401, corps: { erreur: "Accès refusé." } }));
    render(<App />);

    expect(await screen.findByRole("button", { name: /^entrer$/i })).toBeTruthy();
  });

  it("dit qu'une bibliothèque reçue mais vide est vide, et ne propose rien d'autre", async () => {
    // Aucune version activée, donc aucun instantané rangé : l'état normal du premier jour.
    vi.stubGlobal("fetch", serviceQuiRepond({ statut: 404 }));
    render(<App />);

    expect(await screen.findByText(/n’a encore rien à montrer/i)).toBeTruthy();
    expect(screen.getByText(/vous êtes bien entré/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /première bibliothèque/i })).toBeNull();
  });
});
