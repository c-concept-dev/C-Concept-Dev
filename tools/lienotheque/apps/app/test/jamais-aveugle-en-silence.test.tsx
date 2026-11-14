import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { VueBibliotheque } from "@lienotheque/contrats";
import { Catalogue } from "../src/pages/Catalogue.js";
import { causeDeLEchec } from "../src/donnees/echec-de-lecture.js";

/** Lot 0x, seconde moitié — « elle le dit clairement » (Christophe, 14 novembre 2026).
 *
 *  Le contrat tolère désormais un état qu'il ne connaît pas. Mais le silence, lui, n'était pas
 *  dans le contrat : il était dans l'écran. `App.tsx` attrapait **toute** panne de lecture de la
 *  vue et la traitait comme « ce document n'a rien à montrer » — `setVue(undefined)` —, ce qui
 *  donnait une bibliothèque qui se présentait comme vide sous un en-tête annonçant 51 liens.
 *
 *  Le commentaire de ce `.catch` disait « un document sans version active n'a rien à montrer, et
 *  ce n'est pas une panne ». C'était vrai, et ce cas-là était **déjà** traité quatre lignes plus
 *  haut. Ce que le `.catch` attrapait vraiment, ce sont les vraies pannes.
 *
 *  Donc : un état inconnu ne fait plus perdre la vue, et **toute autre** incompatibilité à venir
 *  — un champ que ce paquet ne connaît pas, par exemple — se **dit** au lieu de se taire. La
 *  garantie doit valoir pour la famille, pas seulement pour le cas mesuré le 14 novembre. */

const ID = "6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a60";

const VUE_VIDE = VueBibliotheque.parse({
  id: ID,
  nom: "Document illisible par ce paquet",
  mots: {
    element: { un: "élément", plusieurs: "éléments" },
    piste: { un: "piste", plusieurs: "pistes" },
    page: { un: "page", plusieurs: "pages" },
  },
  compteurs: [],
  aVerifier: 0,
  filtres: [],
  pages: [],
  douteux: [],
});

describe("une application plus ancienne ne se tait jamais (lot 0x, § 3.5)", () => {
  it("dit la cause à la place du panneau vide, et ne prétend pas que la bibliothèque est vide", () => {
    render(
      <Catalogue
        vue={VUE_VIDE}
        documents={[]}
        classements={new Map()}
        onPage={() => undefined}
        onLecteur={() => undefined}
        echecDeLecture="Cette version a été écrite par un code plus récent que cette application."
      />,
    );

    expect(screen.getByText(/écrite par un code plus récent/u)).toBeTruthy();
    // Le message trompeur du 14 novembre : il parle de la bibliothèque alors qu'il veut dire
    // « aucune page choisie ». Il ne doit pas tenir lieu d'explication à un échec de lecture.
    expect(screen.queryByText("Aucun résultat dans cette bibliothèque.")).toBeNull();
  });

  it("nomme l'écart de version quand c'est lui, sans jargon ni pile d'appels", () => {
    // La forme que prendra la PROCHAINE incompatibilité : un champ que ce paquet ne connaît pas.
    // L'état inconnu, lui, ne lève plus — c'est tout l'objet de la première moitié du lot.
    const refus = VueBibliotheque.safeParse({
      ...VUE_VIDE,
      une_cle_ecrite_par_un_code_plus_recent: true,
    });
    expect(refus.success, "le contrat doit refuser une clé inconnue : .strict() le tient").toBe(false);

    const dit = causeDeLEchec(refus.success ? undefined : refus.error);

    expect(dit).toMatch(/plus récent/u);
    expect(dit, "aucun nom de code dans une phrase lue par quelqu'un").not.toMatch(/Zod|invalid|unrecognized/iu);
  });

  it("dit quelque chose de lisible même pour une panne dont il ignore la nature", () => {
    for (const panne of [new Error("EPERM: operation not permitted"), "quelque chose", undefined]) {
      const dit = causeDeLEchec(panne);
      expect(dit.length, `muet sur ${String(panne)}`).toBeGreaterThan(20);
      expect(dit, "jamais une pile d'appels").not.toMatch(/\bat \w+\./u);
    }
  });
});

/** Et le **chemin** qui mène à ce message, pas seulement le composant qui sait l'afficher.
 *
 *  C'est la leçon que `en-ligne.test.tsx` a déjà écrite dans ce dépôt, mot pour mot : « une
 *  épreuve de composant ne voit pas le chemin qui y mène ». Les trois épreuves ci-dessus posent
 *  `echecDeLecture` à la main ; elles passeraient encore si `App.tsx` ne le calculait jamais —
 *  et c'est très exactement le défaut du 14 novembre, qui vivait dans le `.catch` de `App.tsx`
 *  et non dans le Catalogue.
 *
 *  Celle-ci part donc de `<App />`, avec un service qui répond une vue que le contrat refuse. */
describe("le chemin depuis l'application, et non le composant seul (lot 0x)", () => {
  const EMPREINTE = "a1".repeat(32);

  const service = (vue: unknown) =>
    vi.fn(async (entree: RequestInfo | URL) => {
      const adresse = typeof entree === "string" ? entree : entree instanceof URL ? entree.href : entree.url;
      const corps =
        adresse.includes("/vue/apercu")
          ? {
              documents: [
                {
                  empreinte: EMPREINTE,
                  version: "01932f4e-7a1b-7c3d-8e5f-00000000c001",
                  activeeLe: 1_760_000_000,
                  nom: "Document écrit par un code plus récent",
                },
              ],
              classements: [],
            }
          : adresse.includes("/vue/document/") && !adresse.includes("/passages")
            ? vue
            : [];
      return new Response(JSON.stringify(corps), { status: 200, headers: { "content-type": "application/json" } });
    });

  beforeEach(() => {
    vi.stubEnv("VITE_LIENOTHEQUE_EN_LIGNE", "1");
    globalThis.history.replaceState({}, "", "/#catalogue");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("dit la cause à l'écran quand le service rend une vue que ce paquet ne sait pas lire", async () => {
    vi.stubGlobal("fetch", service({ ...VUE_VIDE, une_cle_ecrite_par_un_code_plus_recent: true }));

    render(<App />);

    expect(await screen.findByText(/écrite par un code plus récent/u)).toBeTruthy();
  });

  it("ne dit rien de tel quand la vue se lit : un message d'échec ne doit pas s'afficher à tort", async () => {
    vi.stubGlobal("fetch", service(VUE_VIDE));

    render(<App />);

    // On attend que l'écran ait fini de charger ce document avant de conclure à l'absence.
    await screen.findByRole("heading", { name: /pages/iu });
    expect(screen.queryByText(/écrite par un code plus récent/u)).toBeNull();
  });
});
